const express = require("express");
const crypto = require("crypto");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");
const { llpayOpenapiRequest } = require("../services/llpayOpenapiService");
const {
  resolvePayeeUidByDistributionRecordIds,
  updateLLPayStatus
} = require("../services/llpayService");
const {
  safeTrim,
  safeNumber,
  formatDateTimeCN,
  pickClientIp,
  tryParseJsonObject,
  buildRiskItemJson,
  resolvePayParamsExpireTimeMs,
  getLLPayHttpStatus,
} = require("../utils/llpayRouteUtils");

const router = express.Router();

router.post("/pay", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const txnSeqnoRaw = req?.body?.txnSeqno || req?.body?.txn_seqno;
  let txnSeqno = typeof txnSeqnoRaw === "string" ? txnSeqnoRaw.trim() : "";

  if (!txnSeqno) {
    const orderIdRaw = req?.body?.orderId || req?.body?.order_id || req?.body?.id;
    const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : "";
    if (orderId) {
      const digest = crypto
        .createHash("sha256")
        .update(`llpay_v2:${orderId}`)
        .digest("hex");
      txnSeqno = digest.slice(0, 32);
    }
  }
  
  if (!txnSeqno) {
    return res.status(400).send({
      code: -1,
      message: "txnSeqno 或 orderId 必须存在",
      data: null,
    });
  }
  if (txnSeqno.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "txnSeqno 长度不能超过 64",
      data: null,
    });
  }

  try {
    const llpayRows = await sequelize.query(
      "SELECT `_id`, `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `platform_txno`, `payParams`, `txnTime`, `expireTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `txnSeqno` = :txnSeqno LIMIT 1",
      { replacements: { txnSeqno }, type: QueryTypes.SELECT }
    );
    const llpay = llpayRows[0] || null;
    if (!llpay) {
      return res.status(404).send({
        code: -1,
        message: "支付单不存在",
        data: null,
      });
    }
    const { orderId, userId, amountFen, expireTime, txnTime: dbTxnTime, createdAt, updatedAt, payParams } = llpay;

    if (!orderId) {
      return res.status(500).send({
        code: -1,
        message: "支付单缺少 orderId",
        data: null,
      });
    }
    if (!(safeNumber(amountFen, 0) > 0)) {
      return res.status(400).send({
        code: -1,
        message: "支付金额无效",
        data: null,
      });
    }

    const llpayStatus = safeTrim(llpay.status).toUpperCase();
    if (llpayStatus === "PAID") {
      return res.status(400).send({
        code: -1,
        message: "该支付单已支付",
        data: null,
      });
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
      if ((llpayStatus === "" || llpayStatus === "INIT" || llpayStatus === "CREATED") && expireTimeMs != null && nowMsBeforeRequest < expireTimeMs) {
        return res.send({
          code: 0,
          data: payParamsExisting,
        });
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
      lockAcquired = metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows > 0 : true;
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
          return res.send({ code: 0, data: latestPayParams });
        }
      } catch (_) {}

      return res.send({
        code: 0,
        data: payParamsExisting || { processing: true, txn_seqno: txnSeqno },
        message: "支付处理中，请稍后重试",
      });
    }

    const itemQuerySql = `SELECT
          oi.\`_id\` AS \`orderItemId\`,
          oi.\`sku\` AS \`skuId\`,
          oi.\`count\` AS \`count\`,
          oi.\`distribution_record\` AS \`distributionRecordId\`,
          s.\`price\` AS \`price\`,
          s.\`wholesale_price\` AS \`wholesalePrice\`,
          s.\`image\` AS \`image\`,
          sp.\`name\` AS \`spuName\`,
          dr.\`share_price\` AS \`sharePrice\`
        FROM \`shop_order_item\` oi
        INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
        LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
        LEFT JOIN \`shop_distribution_record\` dr ON dr.\`_id\` = oi.\`distribution_record\`
        WHERE oi.\`order\` = :orderId
        ORDER BY oi.\`_id\` ASC`

    const [orderRows, itemRows, userRows] = await Promise.all([
      sequelize.query(
        "SELECT `_id`, `status`, `totalPrice`, `user`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1",
        { replacements: { orderId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        itemQuerySql,
        { replacements: { orderId }, type: QueryTypes.SELECT }
      ),
      userId
        ? sequelize.query(
            "SELECT `_id`, `openid`, `phone`, `gender`, `createdAt`, `distributorStatus` FROM `users` WHERE `_id` = :id LIMIT 1",
            { replacements: { id: userId }, type: QueryTypes.SELECT }
          )
        : Promise.resolve([]),
    ]);

    const order = orderRows[0] || null;
    if (!order) {
      return res.status(404).send({
        code: -1,
        message: "订单不存在",
        data: null,
      });
    }

    const orderStatus = safeTrim(order.status);
    if (orderStatus && orderStatus !== "TO_PAY") {
      return res.status(400).send({
        code: -1,
        message: `订单状态不允许发起支付: ${orderStatus}`,
        data: null,
      });
    }

    const user = userRows[0] || null;
    const openid = safeTrim(user?.openid);
    if (!openid) {
      return res.status(400).send({
        code: -1,
        message: "用户缺少 openid，无法发起小程序支付",
        data: null,
      });
    }

    const isDistributorUser = safeTrim(user?.distributorStatus).toLowerCase() === "approved";

    const appid = safeTrim(process.env.LLPAY_WX_APPID);
    if (!appid) {
      return res.status(500).send({
        code: -1,
        message: "缺少 LLPAY_WX_APPID 配置",
        data: null,
      });
    }

    const orderAmountStr = (amountFen / 100).toFixed(2);
    const notifyUrl = safeTrim(process.env.LLPAY_NOTIFY_URL);
    if (!notifyUrl) {
      return res.status(500).send({
        code: -1,
        message: "缺少 LLPAY_NOTIFY_URL 配置",
        data: null,
      });
    }

    const goods = Array.isArray(itemRows) ? itemRows : [];
    const totalQty = goods.reduce((sum, it) => sum + (Number(it?.count || 0) || 0), 0);
    const avgUnitPrice = totalQty > 0 ? safeNumber(orderAmountStr, 0) / totalQty : safeNumber(orderAmountStr, 0);

    const goodsInfo = goods
      .map((it) => {
        const skuId = safeTrim(it?.skuId);
        const qty = Math.max(0, Math.floor(Number(it?.count || 0)));
        const name = safeTrim(it?.spuName) || skuId || "商品";
        const sharePrice = safeNumber(it?.sharePrice, NaN);
        const wholesalePrice = safeNumber(it?.wholesalePrice, NaN);
        const rawPrice = safeNumber(it?.price, avgUnitPrice);
        const price =
          Number.isFinite(sharePrice) && sharePrice > 0
            ? sharePrice
            : isDistributorUser && Number.isFinite(wholesalePrice) && wholesalePrice > 0
              ? wholesalePrice
              : rawPrice;
        if (!skuId || qty <= 0) return null;
        return {
          goods_id: skuId,
          goods_name: name,
          goods_price: price > 0 ? price : avgUnitPrice,
          goods_quantity: qty,
        };
      })
      .filter(Boolean);

    if (!goodsInfo.length) {
      return res.status(400).send({
        code: -1,
        message: "订单缺少商品明细，无法发起支付",
        data: null,
      });
    }

    const goodsName = safeTrim(goodsInfo[0]?.goods_name) || "订单支付";
    const clientIp = pickClientIp(req);
    const userRegisterTime14 = user?.createdAt != null ? user.createdAt : null;
    const riskItemStr = buildRiskItemJson({
      userId,
      userPhone: safeTrim(user?.phone),
      userRegisterTime14,
      goodsName,
      clientIp,
    });

    const extendInfoStr = JSON.stringify({
      wx_data: {
        appid,
        openid,
      },
    });

    const txnTime = formatDateTimeCN(new Date());
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
      return res.status(500).send({
        code: -1,
        message: "缺少 LLPAY_PARTNER_ID 配置",
        data: null,
      });
    }
    const distributionRecordIds = goods
      .map((it) => safeTrim(it?.distributionRecordId))
      .filter(Boolean);
      
    // Use the extracted service function
    const recordPayeeUidById = distributionRecordIds.length
      ? await resolvePayeeUidByDistributionRecordIds(distributionRecordIds)
      : new Map();

    const downstreamFenByPayeeUid = new Map();
    for (const it of goods) {
      const qty = Math.max(0, Math.floor(Number(it?.count || 0)));
      if (!(qty > 0)) continue;
      const sharePrice = safeNumber(it?.sharePrice, NaN);
      const wholesalePrice = safeNumber(it?.wholesalePrice, NaN);
      if (!Number.isFinite(sharePrice) || !Number.isFinite(wholesalePrice)) continue;
      if (!(sharePrice >= wholesalePrice)) continue;
      const shareFen = Math.round(sharePrice * 100);
      const wholesaleFen = Math.round(wholesalePrice * 100);
      const diffFen = shareFen - wholesaleFen;
      if (!(diffFen > 0)) continue;
      const recordId = safeTrim(it?.distributionRecordId);
      const payeeUidRaw = recordId ? recordPayeeUidById.get(recordId) || "" : "";
      const payeeUid = safeTrim(payeeUidRaw);
      if (!payeeUid || (partnerId && payeeUid === partnerId)) continue;
      const prev = downstreamFenByPayeeUid.get(payeeUid) || 0;
      downstreamFenByPayeeUid.set(payeeUid, prev + diffFen * qty);
    }

    const downstreamEntries = Array.from(downstreamFenByPayeeUid.entries()).filter(
      ([, fen]) => Number.isInteger(fen) && fen > 0
    );
    const totalDownstreamFen = downstreamEntries.reduce((sum, [, fen]) => sum + fen, 0);

    const payeeInfos =
      totalDownstreamFen > 0 && orderAmountFenInt > totalDownstreamFen
        ? [
            {
              payee_uid: partnerId,
              payee_accttype: "MCHASSURE",
              payee_type: "MCH",
              payee_amount: ((orderAmountFenInt - totalDownstreamFen) / 100).toFixed(2),
            },
            ...downstreamEntries.map(([payeeUid, fen]) => ({
              payee_uid: payeeUid,
              payee_accttype: "USEROWN",
              payee_type: "USER",
              payee_amount: (fen / 100).toFixed(2),
            })),
          ]
        : [
            {
              payee_uid: partnerId,
              payee_accttype: "MCHASSURE",
              payee_type: "MCH",
              payee_amount: orderAmountStr,
            },
          ];

    const payload = {
      busi_type: safeTrim(process.env.LLPAY_BUSI_TYPE) || "100002",
      goods_info: goodsInfo,
      notify_url: notifyUrl,
      order_amount: orderAmountStr,
      order_info: goodsName,
      pay_expire: payExpire,
      pay_method_infos: [{ amount: orderAmountStr, pay_type: payType }],
      payee_infos: payeeInfos,
      secured_flag: securedFlag,
      risk_item: riskItemStr,
      txn_seqno: txnSeqno,
      txn_time: txnTime,
      user_id: userId,
      extend_info: extendInfoStr,
    };

    const path = safeTrim(process.env.LLPAY_CREATEPAY_PATH) || "/v1/ipay/createpay";

    const result = await llpayOpenapiRequest({ path, method: "POST", body: payload });
    if (!result.ok) {
      const errCode = result.code || null;
      const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
      const httpStatus = getLLPayHttpStatus(result);
      
      // Use helper
      await updateLLPayStatus(txnSeqno, "FAILED");

      return res.status(httpStatus).send({
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
      });
    }

    const apiData =
      typeof result.data === "string" ? (tryParseJsonObject(result.data) || result.data) : result.data;
    const apiObj = apiData && typeof apiData === "object" ? apiData : null;
    const retCode = safeTrim(apiObj?.ret_code);
    if (retCode && retCode !== "0000") {
      // Use helper
      await updateLLPayStatus(txnSeqno, "FAILED");

      return res.status(502).send({
        code: -1,
        message: `连连支付创单失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj,
      });
    }

    const platformTxno = safeTrim(apiObj?.platform_txno);
    const nowMs = Date.now();
    const payParamsToStore = apiObj ? JSON.stringify(apiObj) : JSON.stringify({ raw: result.data });
    const expireTimeToStore =
      typeof payExpireMin === "number" && Number.isFinite(payExpireMin) && payExpireMin > 0
        ? String(nowMs + payExpireMin * 60 * 1000)
        : null;

    // Use helper with extra fields
    await updateLLPayStatus(txnSeqno, "CREATED", {
        platformTxno: platformTxno || null,
        txnTime,
        expireTime: expireTimeToStore,
        payParams: payParamsToStore,
    });

    return res.send({
      code: 0,
      data: apiObj || apiData,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "创建支付失败",
      data: null,
    });
  }
});

router.post("/openapi", async (req, res) => {
  const path = req.body && typeof req.body.path === "string" ? req.body.path : "";
  const method =
    req.body && typeof req.body.method === "string" ? req.body.method : "POST";
  const body = req.body && typeof req.body.body === "object" ? req.body.body : {};

  try {
    const result = await llpayOpenapiRequest({ path, method, body });
    if (!result.ok) {
      const errCode = result.code || null;
      const statusCode =
        typeof result.statusCode === "number" ? result.statusCode : 0;
      const httpStatus = getLLPayHttpStatus(result);

      return res.status(httpStatus).send({
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      });
    }

    return res.send({
      code: 0,
      data: result.data,
      request: result.request,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: "连连请求异常",
      data: null,
    });
  }
});

module.exports = router;
