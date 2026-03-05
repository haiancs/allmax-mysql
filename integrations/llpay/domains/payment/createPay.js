const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../../db");
const { requestLLPayOpenapi } = require("../../client/openapiClient");
const { resolvePayeeUidByDistributionRecordIds } = require("../../../../repos/distributionRepo");
const {
  resolveOrderItemDistributionPriceColumn,
} = require("../../../../repos/shopOrderItemRepo");
const { findDeliveryInfoById } = require("../../../../repos/shopDeliveryInfoRepo");
const llpayRepo = require("../../repos/llpayRepo");
const {
  safeTrim,
  buildTxnSeqnoFromOrderId,
  safeNumber,
  formatDateTimeCN,
  tryParseJsonObject,
  resolvePayParamsExpireTimeMs,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");
const { buildPayPayload } = require("./buildPayPayload");
const accpCityData = require("../../config/accpCityData");

async function createPay({ body, req } = {}) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const txnSeqnoRaw = reqBody?.txnSeqno || reqBody?.txn_seqno;
  let txnSeqno = typeof txnSeqnoRaw === "string" ? txnSeqnoRaw.trim() : "";

  if (!txnSeqno) {
    const orderIdRaw = reqBody?.orderId || reqBody?.order_id || reqBody?.id;
    const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : "";
    txnSeqno = buildTxnSeqnoFromOrderId(orderId);
  }

  if (!txnSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "txnSeqno 或 orderId 必须存在", data: null },
    };
  }
  if (txnSeqno.length > 64) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "txnSeqno 长度不能超过 64", data: null },
    };
  }

  try {
    const llpayRows = await sequelize.query(
      "SELECT `_id`, `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `platform_txno`, `payParams`, `txnTime`, `expireTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `txnSeqno` = :txnSeqno LIMIT 1",
      { replacements: { txnSeqno }, type: QueryTypes.SELECT }
    );
    const llpay = llpayRows[0] || null;
    if (!llpay) {
      return {
        ok: false,
        httpStatus: 404,
        body: { code: -1, message: "支付单不存在", data: null },
      };
    }

    const {
      orderId,
      userId,
      amountFen,
      expireTime,
      txnTime: dbTxnTime,
      createdAt,
      updatedAt,
      payParams,
    } = llpay;

    if (!orderId) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "支付单缺少 orderId", data: null },
      };
    }
    if (!(safeNumber(amountFen, 0) > 0)) {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: "支付金额无效", data: null },
      };
    }

    const llpayStatus = safeTrim(llpay.status).toUpperCase();
    if (llpayStatus === "PAID") {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: "该支付单已支付", data: null },
      };
    }

    const payExpire = safeTrim(process.env.LLPAY_PAY_EXPIRE_MIN) || "30";
    const payExpireMin = safeNumber(payExpire, 30);
    const payParamsExisting = tryParseJsonObject(payParams);
    const nowMsBeforeRequest = Date.now();
    const expireTimeMs = resolvePayParamsExpireTimeMs({
      expireTime,
      txnTime: dbTxnTime,
      updatedAt,
      createdAt,
      payExpireMin,
    });

    if (payParamsExisting) {
      if (
        (llpayStatus === "" || llpayStatus === "INIT" || llpayStatus === "CREATED") &&
        expireTimeMs != null &&
        nowMsBeforeRequest < expireTimeMs
      ) {
        return { ok: true, httpStatus: 200, body: { code: 0, data: payParamsExisting } };
      }
    }

    let lockAcquired = true;
    try {
      const [_, metadata] = await sequelize.query(
        "UPDATE `llpay_v2` SET `updatedAt` = :updatedAt WHERE `txnSeqno` = :txnSeqno AND (`payParams` IS NULL OR `payParams` = '' OR `expireTime` IS NULL OR `expireTime` = '' OR CAST(`expireTime` AS UNSIGNED) <= :nowMs)",
        {
          replacements: {
            updatedAt: nowMsBeforeRequest,
            txnSeqno,
            nowMs: nowMsBeforeRequest,
          },
        }
      );
      lockAcquired =
        metadata && typeof metadata.affectedRows === "number"
          ? metadata.affectedRows > 0
          : true;
    } catch (_) {
      lockAcquired = true;
    }

    if (!lockAcquired) {
      try {
        const latestRows = await sequelize.query(
          "SELECT `payParams`, `expireTime`, `txnTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `txnSeqno` = :txnSeqno LIMIT 1",
          { replacements: { txnSeqno }, type: QueryTypes.SELECT }
        );
        const latest = latestRows[0] || null;
        const latestPayParams = tryParseJsonObject(latest?.payParams);
        if (latestPayParams) {
          return { ok: true, httpStatus: 200, body: { code: 0, data: latestPayParams } };
        }
      } catch (_) {}

      return {
        ok: true,
        httpStatus: 200,
        body: {
          code: 0,
          data: payParamsExisting || { processing: true, txn_seqno: txnSeqno },
          message: "支付处理中，请稍后重试",
        },
      };
    }

    const distributionPriceColumn = await resolveOrderItemDistributionPriceColumn();
    const sharePriceSelect = distributionPriceColumn
      ? `COALESCE(oi.\`${distributionPriceColumn}\`, dr.\`share_price\`) AS \`sharePrice\``
      : "dr.`share_price` AS `sharePrice`";
    const itemQuerySql = `SELECT
          oi.\`_id\` AS \`orderItemId\`,
          oi.\`sku\` AS \`skuId\`,
          oi.\`count\` AS \`count\`,
          oi.\`distribution_record\` AS \`distributionRecordId\`,
          s.\`price\` AS \`price\`,
          s.\`wholesale_price\` AS \`wholesalePrice\`,
          s.\`image\` AS \`image\`,
          sp.\`name\` AS \`spuName\`,
          ${sharePriceSelect}
        FROM \`shop_order_item\` oi
        INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
        LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
        LEFT JOIN \`shop_distribution_record\` dr ON dr.\`_id\` = oi.\`distribution_record\`
        WHERE oi.\`order\` = :orderId
        ORDER BY oi.\`_id\` ASC`;

    const [orderRows, itemRows, userRows] = await Promise.all([
      sequelize.query(
        "SELECT `_id`, `status`, `totalPrice`, `user`, `createdAt`, `updatedAt`, `delivery_info` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1",
        { replacements: { orderId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(itemQuerySql, { replacements: { orderId }, type: QueryTypes.SELECT }),
      userId
        ? sequelize.query(
            "SELECT `_id`, `openid`, `phone`, `gender`, `createTime` AS `createdAt`, `updateTime` AS `updatedAt`, `distributorStatus` FROM `users` WHERE `_id` = :id LIMIT 1",
            { replacements: { id: userId }, type: QueryTypes.SELECT }
          )
        : Promise.resolve([]),
    ]);

    const order = orderRows[0] || null;
    if (!order) {
      return {
        ok: false,
        httpStatus: 404,
        body: { code: -1, message: "订单不存在", data: null },
      };
    }

    const orderStatus = safeTrim(order.status);
    if (orderStatus && orderStatus !== "TO_PAY") {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: `订单状态不允许发起支付: ${orderStatus}`, data: null },
      };
    }

    const user = userRows[0] || null;
    const openid = safeTrim(user?.openid);
    if (!openid) {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: "用户缺少 openid，无法发起小程序支付", data: null },
      };
    }

    const isDistributorUser = safeTrim(user?.distributorStatus).toLowerCase() === "approved";
    const appid = safeTrim(process.env.LLPAY_WX_APPID);
    if (!appid) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "缺少 LLPAY_WX_APPID 配置", data: null },
      };
    }

    const orderAmountStr = (amountFen / 100).toFixed(2);
    const notifyUrl = safeTrim(process.env.LLPAY_NOTIFY_URL);
    if (!notifyUrl) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "缺少 LLPAY_NOTIFY_URL 配置", data: null },
      };
    }

    const goods = Array.isArray(itemRows) ? itemRows : [];
    const payType = safeTrim(process.env.LLPAY_PAY_TYPE) || "WECHAT_APPLET";
    const securedFlagRaw = safeTrim(process.env.LLPAY_SECURED_FLAG);
    const securedFlag =
      securedFlagRaw === ""
        ? true
        : ["1", "true", "yes", "on"].includes(securedFlagRaw.toLowerCase());

    const orderAmountNum = safeNumber(orderAmountStr, 0);
    const orderAmountFenInt = Math.round(orderAmountNum * 100);
    const partnerId = safeTrim(process.env.LLPAY_PARTNER_ID);
    if (!partnerId) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "缺少 LLPAY_PARTNER_ID 配置", data: null },
      };
    }

    const distributionRecordIds = goods
      .map((it) => safeTrim(it?.distributionRecordId))
      .filter(Boolean);
    const recordPayeeUidById = distributionRecordIds.length
      ? await resolvePayeeUidByDistributionRecordIds(distributionRecordIds)
      : new Map();

    const txnTime = formatDateTimeCN(new Date());
    const busiType = safeTrim(process.env.LLPAY_BUSI_TYPE) || "100002";

    // --- 新增：处理实物风控参数 ---
    let deliveryFullName = "";
    let deliveryPhone = "";
    let deliveryAddrProvince = "";
    let deliveryAddrCity = "";

    try {
      const deliveryInfoId = safeTrim(order.delivery_info);
      if (deliveryInfoId) {
        const info = await findDeliveryInfoById(deliveryInfoId);
        if (info) {
          const deliveryInfo = info.toJSON ? info.toJSON() : info;
          deliveryFullName = safeTrim(deliveryInfo.name);
          deliveryPhone = safeTrim(deliveryInfo.phone);
          const addr = safeTrim(deliveryInfo.address);
          if (addr) {
            const parts = parseAddressParts(addr);
            deliveryAddrProvince = getProvinceCode(parts.province);
            deliveryAddrCity = getCityCode(parts.city);
            
            // Add logging for verification
            console.log("[LLPAY][createPay] Delivery Info Check:", {
              deliveryInfoId,
              name: deliveryFullName,
              phone: deliveryPhone,
              rawAddress: addr,
              parsedParts: parts,
              mappedCodes: {
                province: deliveryAddrProvince,
                city: deliveryAddrCity
              }
            });
          }
        } else {
          console.log("[LLPAY][createPay] Delivery info not found for id:", deliveryInfoId);
        }
      } else {
        console.log("[LLPAY][createPay] Order has no delivery_info_id");
      }
    } catch (e) {
      console.error("[LLPAY][createPay] Fetch delivery info failed:", e);
    }
    // --- 结束 ---

    const payloadResult = buildPayPayload({
      req,
      goods,
      isDistributorUser,
      appid,
      openid,
      notifyUrl,
      orderAmountStr,
      payExpire,
      payType,
      securedFlag,
      txnSeqno,
      txnTime,
      userId,
      user,
      partnerId,
      recordPayeeUidById,
      orderAmountFenInt,
      busiType,
      // 新增参数
      deliveryFullName,
      deliveryPhone,
      deliveryAddrProvince,
      deliveryAddrCity,
      frmsWareCategory: "4016", // 默认传4016
    });

    if (!payloadResult.ok) {
      return payloadResult;
    }

    const path = safeTrim(process.env.LLPAY_CREATEPAY_PATH) || "/v1/ipay/createpay";
    let result;
    try {
      result = await requestLLPayOpenapi({ path, method: "POST", body: payloadResult.payload });
    } catch (error) {
      result = {
        ok: false,
        statusCode: 0,
        code: "NETWORK_ERROR",
        error: error?.message || "NETWORK_ERROR",
      };
    }

    if (!result.ok) {
      const errCode = result.code || null;
      const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
      const httpStatus = getLLPayHttpStatus(result);
      await llpayRepo.updateStatus(txnSeqno, "FAILED");

      return {
        ok: false,
        httpStatus,
        body: {
          code: -1,
          message: result.error || "连连请求失败",
          statusCode,
          errorCode: errCode,
          data: result.data || null,
        },
      };
    }

    const apiData =
      typeof result.data === "string" ? tryParseJsonObject(result.data) || result.data : result.data;
    const apiObj = apiData && typeof apiData === "object" ? apiData : null;
    const retCode = safeTrim(apiObj?.ret_code);
    if (retCode && retCode !== "0000") {
      await llpayRepo.updateStatus(txnSeqno, "FAILED");

      return {
        ok: false,
        httpStatus: 502,
        body: {
          code: -1,
          message: `连连支付创单失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
          data: apiObj,
        },
      };
    }

    const platformTxno = safeTrim(apiObj?.platform_txno);
    const nowMs = Date.now();
    const payParamsToStore = apiObj ? JSON.stringify(apiObj) : JSON.stringify({ raw: result.data });
    const expireTimeToStore =
      typeof payExpireMin === "number" && Number.isFinite(payExpireMin) && payExpireMin > 0
        ? String(nowMs + payExpireMin * 60 * 1000)
        : null;

    await llpayRepo.updateStatus(txnSeqno, "CREATED", {
      platform_txno: platformTxno || null,
      txnTime,
      expireTime: expireTimeToStore,
      payParams: payParamsToStore,
    });

    return {
      ok: true,
      httpStatus: 200,
      body: { code: 0, data: apiObj || apiData },
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "创建支付失败", data: null },
    };
  }
}

// --- 辅助函数：地址解析与映射 ---

function parseAddressParts(address) {
  const raw = safeTrim(address);
  if (!raw) return { province: "", city: "" };
  // 简单按空格拆分：省 市 ...
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { province: parts[0], city: parts[1] };
  }
  // 如果没有空格，尝试正则提取（简易版）
  let province = "";
  let city = "";
  const provinceMatch = raw.match(/^(.*?(省|自治区|市))/);
  if (provinceMatch) {
    province = provinceMatch[1];
    const rest = raw.slice(province.length);
    const cityMatch = rest.match(/^(.*?(市|州|盟|地区))/);
    if (cityMatch) {
      city = cityMatch[1];
    }
  }
  return { province, city };
}


function getProvinceCode(provinceName) {
  if (!provinceName) return "";
  const name = String(provinceName).trim();
  // 精确匹配或前缀匹配（如“浙江”匹配“浙江省”）
  const p = accpCityData.find((item) => item.region === name || item.region.startsWith(name) || name.startsWith(item.region));
  return p ? p.code : "";
}

function getCityCode(cityName) {
  if (!cityName) return "";
  const name = String(cityName).trim();
  for (const province of accpCityData) {
    if (province.regionEntitys && Array.isArray(province.regionEntitys)) {
      // 精确匹配或前缀匹配（如“杭州”匹配“杭州市”）
      const c = province.regionEntitys.find((item) => item.region === name || item.region.startsWith(name) || name.startsWith(item.region));
      if (c) return c.code;
    }
  }
  return "";
}

module.exports = {
  createPay,
};
