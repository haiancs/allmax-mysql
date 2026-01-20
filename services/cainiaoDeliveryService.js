// 菜鸟发货（方式B）核心服务
// - buildDeliveryOrderFromDb：基于 orderId 从数据库表组装菜鸟 deliveryOrder 报文，并合并 bonded.requestData 与 overrides
// - validateDeliveryOrder：校验菜鸟必填字段，返回缺失字段列表
// - createCainiaoDeliveryOrder：组装/校验通过后调用 utils/cainiaoClient.js 发送到菜鸟网关
const { QueryTypes } = require("sequelize");
const { requestCainiao } = require("../utils/cainiaoClient");
const { fillBondedTaxAndDeclareInfo } = require("../utils/cainiaoBondedTax");
const { safeTrim, coerceIntOrNull, toFenFromYuanOrFen } = require("../utils/envUtils");

function tryParseJsonObject(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function formatDateTimeCNText(date) {
  const ms = date instanceof Date ? date.getTime() : Date.now();
  const cnMs = ms + 8 * 60 * 60 * 1000;
  const d = new Date(cnMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const second = String(d.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseTimestamp14ToMs(ts14) {
  const s = safeTrim(ts14);
  if (!/^\d{14}$/.test(s)) return null;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  const hour = Number(s.slice(8, 10));
  const minute = Number(s.slice(10, 12));
  const second = Number(s.slice(12, 14));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, second);
  return Number.isNaN(utcMs) ? null : utcMs;
}

function ensureReceiverRequiredText(v, fallback) {
  const s = safeTrim(v);
  return s ? s : fallback;
}

function parseReceiverAddressParts(address) {
  const raw = safeTrim(address);
  if (!raw) return null;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) {
    let rest = parts[0] || "";
    let province = "";
    let city = "";
    let district = "";
    let addressDetail = "";

    const provinceMatch = rest.match(/^(.*?(省|自治区|市))/);
    if (provinceMatch) {
      province = provinceMatch[1] || "";
      rest = rest.slice(province.length);
    }

    const cityMatch = rest.match(/^(.*?(市|州|盟|地区))/);
    if (cityMatch) {
      city = cityMatch[1] || "";
      rest = rest.slice(city.length);
    }

    const districtMatch = rest.match(/^(.*?(区|县|旗|市))/);
    if (districtMatch) {
      district = districtMatch[1] || "";
      rest = rest.slice(district.length);
    }

    addressDetail = rest;

    return {
      province: safeTrim(province),
      city: safeTrim(city),
      district: safeTrim(district),
      addressDetail: safeTrim(addressDetail),
      raw,
    };
  }

  const province = parts[0] || "";
  const city = parts.length >= 2 ? parts[1] : "";
  let district = "";
  let addressDetail = "";
  if (parts.length >= 3) {
    const third = parts[2] || "";
    if (/(区|县|市|旗)$/.test(third)) {
      district = third;
      addressDetail = parts.slice(3).join(" ");
    } else {
      addressDetail = parts.slice(2).join(" ");
    }
  }
  return {
    province: safeTrim(province),
    city: safeTrim(city),
    district: safeTrim(district),
    addressDetail: safeTrim(addressDetail),
    raw,
  };
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out = Object.assign({}, base && typeof base === "object" ? base : {});
  const keys = Object.keys(patch);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = patch[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = mergeDeep(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

let cachedCainiaoEnv = null;
function getCainiaoEnv() {
  if (cachedCainiaoEnv) return cachedCainiaoEnv;
  const missing = [];
  const req = (name) => {
    const v = safeTrim(process.env[name]);
    if (!v) missing.push(name);
    return v;
  };
  const opt = (name) => {
    const v = safeTrim(process.env[name]);
    return v ? v : undefined;
  };

  const cfg = {
    ownerUserId: req("CAINIAO_OWNER_USER_ID"),
    businessUnitId: opt("CAINIAO_BUSINESS_UNIT_ID"),
    storeCode: req("CAINIAO_STORE_CODE"),
    orderType: req("CAINIAO_ORDER_TYPE"),
    defaultInventoryChannel: req("CAINIAO_DEFAULT_INVENTORY_CHANNEL"),

    externalShopId: opt("CAINIAO_EXTERNAL_SHOP_ID"),
    externalShopName: opt("CAINIAO_EXTERNAL_SHOP_NAME"),
    saleMode: opt("CAINIAO_SALE_MODE"),

    receiverCountry: req("CAINIAO_RECEIVER_COUNTRY"),
    currency: req("CAINIAO_CURRENCY"),
    nationality: req("CAINIAO_NATIONALITY"),
    payChannel: req("CAINIAO_PAY_CHANNEL"),
  };

  if (missing.length) {
    throw new Error(`缺少菜鸟环境变量：${missing.join(", ")}`);
  }

  cachedCainiaoEnv = cfg;
  return cfg;
}

function validateDeliveryOrder(order) {
  const missing = [];
  const o = order && typeof order === "object" ? order : {};

  if (!safeTrim(o.ownerUserId)) missing.push("ownerUserId");
  if (!safeTrim(o.orderType)) missing.push("orderType");
  if (!safeTrim(o.storeCode)) missing.push("storeCode");
  if (!safeTrim(o.externalOrderCode)) missing.push("externalOrderCode");

  const receiver = o.receiverInfo && typeof o.receiverInfo === "object" ? o.receiverInfo : null;
  const receiverRequired = ["country", "province", "city", "district", "address", "name", "contactNo"];
  for (const f of receiverRequired) {
    if (!safeTrim(receiver?.[f])) missing.push(`receiverInfo.${f}`);
  }

  const itemList = Array.isArray(o.orderItemList) ? o.orderItemList : [];
  if (!itemList.length) {
    missing.push("orderItemList");
  } else {
    for (let i = 0; i < itemList.length; i++) {
      const it = itemList[i] && typeof itemList[i] === "object" ? itemList[i] : {};
      if (!safeTrim(it.itemId)) missing.push(`orderItemList[${i}].itemId`);
      const qty = coerceIntOrNull(it.itemQuantity);
      if (qty == null || qty <= 0) missing.push(`orderItemList[${i}].itemQuantity`);
      if (!safeTrim(it.inventoryChannel)) missing.push(`orderItemList[${i}].inventoryChannel`);
      const di = it.declareInfo && typeof it.declareInfo === "object" ? it.declareInfo : null;
      const declareRequired = [
        "itemTotalPrice",
        "itemTotalActualPrice",
        "vat",
        "customsTax",
        "consumptionTax",
        "totalTax",
      ];
      for (const f of declareRequired) {
        const n = coerceIntOrNull(di?.[f]);
        if (n == null) missing.push(`orderItemList[${i}].declareInfo.${f}`);
      }
    }
  }

  const amount = o.orderAmountInfo && typeof o.orderAmountInfo === "object" ? o.orderAmountInfo : null;
  const amountRequired = [
    "totalTax",
    "insurance",
    "actualPayment",
    "coupon",
    "vat",
    "postFee",
    "currency",
    "consumptionTax",
    "dutiablePrice",
    "customsTax",
  ];
  for (const f of amountRequired) {
    if (f === "currency") {
      if (!safeTrim(amount?.currency)) missing.push(`orderAmountInfo.${f}`);
      continue;
    }
    const n = coerceIntOrNull(amount?.[f]);
    if (n == null) missing.push(`orderAmountInfo.${f}`);
  }

  const customs = o.customsDeclareInfo && typeof o.customsDeclareInfo === "object" ? o.customsDeclareInfo : null;
  const customsRequired = [
    "buyerIDType",
    "payOrderId",
    "buyerName",
    "buyerPlatformId",
    "nationality",
    "buyerIDNo",
    "contactNo",
    "payChannel",
  ];
  for (const f of customsRequired) {
    if (!safeTrim(customs?.[f])) missing.push(`customsDeclareInfo.${f}`);
  }

  return missing;
}

async function safeQuery(sequelize, sql, { replacements } = {}) {
  try {
    const rows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });
    return { ok: true, rows: rows || [] };
  } catch (error) {
    return { ok: false, error };
  }
}

async function buildDeliveryOrderFromDb({ sequelize, orderId, overrides }) {
  const id = safeTrim(orderId);
  if (!id) {
    return {
      ok: false,
      code: "MISSING_ORDER_ID",
      error: "orderId 必须存在",
      deliveryOrder: null,
    };
  }

  let env;
  try {
    env = getCainiaoEnv();
  } catch (error) {
    return {
      ok: false,
      code: "MISSING_ENV",
      error: error?.message || "缺少菜鸟环境变量",
      deliveryOrder: null,
    };
  }

  const orderRes = await safeQuery(
    sequelize,
    "SELECT `_id`, `status`, `totalPrice`, `user`, `delivery_info`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1",
    { replacements: { orderId: id } }
  );

  if (!orderRes.ok) {
    return {
      ok: false,
      code: "DB_ERROR",
      error: orderRes.error?.message || "查询订单失败",
      deliveryOrder: null,
    };
  }

  const orderRow = orderRes.rows[0] || null;
  if (!orderRow) {
    return {
      ok: false,
      code: "ORDER_NOT_FOUND",
      error: "订单不存在",
      deliveryOrder: null,
    };
  }

  const itemRowsRes = await safeQuery(
    sequelize,
    "SELECT oi.`_id` AS `orderItemId`, oi.`sku` AS `skuId`, oi.`count` AS `count`, s.`price` AS `price`, s.`cargo_id` AS `cargoId`, sp.`name` AS `spuName` FROM `shop_order_item` oi INNER JOIN `shop_sku` s ON s.`_id` = oi.`sku` LEFT JOIN `shop_spu` sp ON sp.`_id` = s.`spu` WHERE oi.`order` = :orderId ORDER BY oi.`_id` ASC",
    { replacements: { orderId: id } }
  );
  if (!itemRowsRes.ok) {
    return {
      ok: false,
      code: "DB_ERROR",
      error: itemRowsRes.error?.message || "查询订单明细失败",
      deliveryOrder: null,
    };
  }

  const llpayRes = await safeQuery(
    sequelize,
    "SELECT `txnSeqno`, `platform_txno` AS `platformTxno`, `txnTime`, `status`, `amountFen` FROM `llpay_v2` WHERE `orderId` = :orderId LIMIT 1",
    { replacements: { orderId: id } }
  );
  const llpay = llpayRes.ok ? llpayRes.rows[0] || null : null;

  const bondedRes = await safeQuery(
    sequelize,
    "SELECT * FROM `bonded_warehouse_orders` WHERE `orderId` = :orderId OR `shopOrderId` = :orderId ORDER BY `createdAt` DESC LIMIT 1",
    { replacements: { orderId: id } }
  );
  const bonded = bondedRes.ok ? bondedRes.rows[0] || null : null;

  const bondedRequestData = bonded ? tryParseJsonObject(bonded.requestData) : null;
  const bondedFromRequest = bondedRequestData && typeof bondedRequestData === "object" ? bondedRequestData : null;

  const deliveryInfoId = safeTrim(orderRow?.delivery_info);
  let deliveryInfo = null;
  if (deliveryInfoId) {
    const diRes = await safeQuery(
      sequelize,
      "SELECT * FROM `shop_delivery_info` WHERE `_id` = :id LIMIT 1",
      { replacements: { id: deliveryInfoId } }
    );
    if (diRes.ok) {
      deliveryInfo = diRes.rows[0] || null;
    }
  }

  const defaultInventoryChannel = env.defaultInventoryChannel;
  const orderType = env.orderType;

  let payTimeText;
  if (llpay?.txnTime) {
    const ts14 = safeTrim(llpay.txnTime);
    const ms = parseTimestamp14ToMs(ts14);
    if (ms != null) {
      payTimeText = formatDateTimeCNText(new Date(ms));
    } else {
      const d = new Date(ts14);
      if (!Number.isNaN(d.getTime())) payTimeText = formatDateTimeCNText(d);
    }
  }

  const rawReceiverAddress = safeTrim(deliveryInfo?.address) || safeTrim(bonded?.receiverAddress) || "";
  const receiverParts = parseReceiverAddressParts(rawReceiverAddress);

  const baseDeliveryOrder = {
    ownerUserId: env.ownerUserId,
    businessUnitId: env.businessUnitId,
    orderType,
    storeCode: env.storeCode,
    externalOrderCode: id,
    externalTradeCode: undefined,
    externalShopId: env.externalShopId,
    externalShopName: env.externalShopName,
    // channel_shop: safeTrim(env.externalShopId) || safeTrim(env.storeCode) || id,
    // channelShop: safeTrim(env.externalShopId) || safeTrim(env.storeCode) || id,
    orderCreateTime: formatDateTimeCNText(orderRow?.createdAt ? new Date(orderRow.createdAt) : new Date()),
    orderPayTime: payTimeText || undefined,
    saleMode: env.saleMode,
    buyerRemark: undefined,
    sellerRemark: undefined,
    receiverInfo: {
      country: env.receiverCountry,
      province: safeTrim(bonded?.receiverProvince) || safeTrim(receiverParts?.province) || "",
      city: safeTrim(bonded?.receiverCity) || safeTrim(receiverParts?.city) || "",
      district: safeTrim(bonded?.receiverDistrict) || safeTrim(receiverParts?.district) || "",
      town: safeTrim(deliveryInfo?.town) || undefined,
      address: rawReceiverAddress,
      name: safeTrim(deliveryInfo?.name) || safeTrim(bonded?.receiverName) || "",
      contactNo: safeTrim(deliveryInfo?.phone) || safeTrim(bonded?.receiverPhone) || "",
    },
    orderItemList: [],
    orderAmountInfo: {
      totalTax: 0,
      insurance: 0,
      actualPayment: undefined,
      coupon: 0,
      vat: 0,
      postFee: 0,
      currency: env.currency,
      consumptionTax: 0,
      dutiablePrice: undefined,
      customsTax: 0,
    },
    customsDeclareInfo: {
      buyerIDType: "1",
      payOrderId: safeTrim(llpay?.platformTxno) || safeTrim(llpay?.txnSeqno) || "",
      gender: undefined,
      buyerName: safeTrim(deliveryInfo?.name) || safeTrim(bonded?.receiverName) || "",
      buyerPlatformId: safeTrim(orderRow?.user) || "",
      nationality: env.nationality,
      payChannel: env.payChannel,
      buyerIDNo: safeTrim(deliveryInfo?.idCard) || safeTrim(bonded?.receiverIdCard) || "",
      contactNo: safeTrim(deliveryInfo?.phone) || safeTrim(bonded?.receiverPhone) || "",
    },
  };

  const normalizedOverrides = overrides && typeof overrides === "object" ? overrides : {};
  const merged = mergeDeep(mergeDeep(baseDeliveryOrder, bondedFromRequest), normalizedOverrides);

  merged.receiverInfo = merged.receiverInfo && typeof merged.receiverInfo === "object" ? merged.receiverInfo : {};
  merged.receiverInfo.province = ensureReceiverRequiredText(merged.receiverInfo.province, "/");
  merged.receiverInfo.city = ensureReceiverRequiredText(merged.receiverInfo.city, "/");
  merged.receiverInfo.district = ensureReceiverRequiredText(merged.receiverInfo.district, "/");

  const totalFen = toFenFromYuanOrFen(orderRow?.totalPrice);
  const actualPayment =
    coerceIntOrNull(merged?.orderAmountInfo?.actualPayment) ??
    (totalFen != null ? totalFen : 0);
  merged.orderAmountInfo.actualPayment = actualPayment;
  if (coerceIntOrNull(merged?.orderAmountInfo?.dutiablePrice) == null) {
    merged.orderAmountInfo.dutiablePrice = actualPayment;
  }

  const itemRows = itemRowsRes.rows || [];
  merged.orderItemList = itemRows.map((row) => {
    const skuId = safeTrim(row?.skuId);
    const inventoryChannel = defaultInventoryChannel;
    const quantity = coerceIntOrNull(row?.count) || 0;
    const unitPriceFen = toFenFromYuanOrFen(row?.price) || 0;
    const lineTotalFen = unitPriceFen * quantity;
    const declareInfo = {
      itemTotalPrice: lineTotalFen,
      vat: 0,
      customsTax: 0,
      totalTax: 0,
      consumptionTax: 0,
      itemTotalActualPrice: lineTotalFen,
    };

    return {
      itemQuantity: quantity,
      declareInfo,
      inventoryChannel,
      extItemId: skuId || undefined,
      itemId: safeTrim(row?.cargoId) || "",
      itemName: safeTrim(row?.spuName) || undefined,
    };
  });

  return { ok: true, code: "OK", error: null, deliveryOrder: merged };
}

async function createCainiaoDeliveryOrder({
  sequelize,
  orderId,
  overrides,
  traceId,
  timeoutMs,
  dryRun,
}) {
  const normalizedMsgType = "GLOBAL_SALE_ORDER_NOTIFY";

  const built = await buildDeliveryOrderFromDb({
    sequelize,
    orderId,
    overrides,
  });
  if (!built.ok) {
    return {
      ok: false,
      code: built.code,
      error: built.error,
      data: null,
      missingFields: [],
    };
  }

  const orderPayload = built.deliveryOrder;

  const missingFields = validateDeliveryOrder(orderPayload);
  if (missingFields.length) {
    return {
      ok: false,
      code: "MISSING_FIELDS",
      error: "菜鸟发货报文缺少必填字段",
      data: null,
      missingFields,
      deliveryOrder: orderPayload,
    };
  }

  if (dryRun === true) {
    return {
      ok: true,
      code: "OK",
      error: null,
      data: null,
      missingFields: [],
      deliveryOrder: orderPayload,
    };
  }

  const logisticsInterfacePayload =
    normalizedMsgType === "GLOBAL_SALE_ORDER_NOTIFY"
      ? { globalSaleOrder: orderPayload }
      : orderPayload;

  const result = await requestCainiao(
    {
      msg_type: normalizedMsgType,
      logistics_interface: logisticsInterfacePayload,
      to_code: normalizedMsgType,
      traceId: safeTrim(traceId) || null,
    },
    {
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
    }
  );

  if (!result?.success) {
    return {
      ok: false,
      code: result?.code || "CAINIAO_ERROR",
      error: result?.message || "菜鸟请求失败",
      data: result || null,
      missingFields: [],
      deliveryOrder: orderPayload,
    };
  }

  return { ok: true, code: "OK", error: null, data: result, missingFields: [], deliveryOrder: orderPayload };
}

module.exports = {
  formatDateTimeCNText,
  validateDeliveryOrder,
  buildDeliveryOrderFromDb,
  createCainiaoDeliveryOrder,
};
