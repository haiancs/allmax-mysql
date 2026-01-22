// 菜鸟发货（方式B）核心服务
// - buildDeliveryOrderFromDb：基于 orderId 从数据库表组装菜鸟 deliveryOrder 报文，并合并 bonded.requestData 与 overrides
// - validateDeliveryOrder：校验菜鸟必填字段，返回缺失字段列表
// - createCainiaoDeliveryOrder：组装/校验通过后调用 utils/cainiaoClient.js 发送到菜鸟网关
const { QueryTypes } = require("sequelize");
const { requestCainiao } = require("../utils/cainiaoClient");
const { safeTrim, coerceIntOrNull, toFenFromYuanOrFen } = require("../utils/envUtils");

// 格式化日期时间为中国时间（东八区）的文本表示
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

// 解析 14 位时间戳字符串为毫秒级时间戳（东八区）
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

// 确保接收人必填字段非空，否则使用默认值
function ensureReceiverRequiredText(v, fallback) {
  const s = safeTrim(v);
  return s ? s : fallback;
}

// 解析接收人地址字符串为省份、城市、区县、详细地址
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

// 深度合并对象（不修改原对象）
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

const VAT_INCLUSIVE_FACTOR_NUM = 1091;
const VAT_INCLUSIVE_FACTOR_DEN = 1000;
function splitVatInclusiveFen(grossFen) {
  const gross = Math.max(0, coerceIntOrNull(grossFen) || 0);
  let net = Math.round((gross * VAT_INCLUSIVE_FACTOR_DEN) / VAT_INCLUSIVE_FACTOR_NUM);
  if (net < 0) net = 0;
  if (net > gross) net = gross;
  const vat = gross - net;
  return { netFen: net, vatFen: vat };
}
// 校验菜鸟订单 已测试
function validateDeliveryOrder(order) {
  const missing = [];
  const o = order && typeof order === "object" ? order : {};

  if (!safeTrim(o.ownerUserId)) missing.push("ownerUserId");
  if (!safeTrim(o.orderType)) missing.push("orderType");
  if (!safeTrim(o.storeCode)) missing.push("storeCode");
  if (!safeTrim(o.externalOrderCode)) missing.push("externalOrderCode");
  if (!safeTrim(o.externalShopName)) missing.push("externalShopName");
  if (!safeTrim(o.saleMode)) missing.push("saleMode");
  if (!safeTrim(o.orderSource)) missing.push("orderSource");
  if (!safeTrim(o.orderCreateTime)) missing.push("orderCreateTime");
  if (!safeTrim(o.orderPayTime)) missing.push("orderPayTime");

  const receiver = o.receiverInfo && typeof o.receiverInfo === "object" ? o.receiverInfo : null;
  const receiverRequired = ["country", "province", "city", "district", "address", "name", "contactNo"];
  for (const f of receiverRequired) {
    if (!safeTrim(receiver?.[f])) missing.push(`receiverInfo.${f}`);
  }

  const sender = o.senderInfo && typeof o.senderInfo === "object" ? o.senderInfo : null;
  const senderRequired = ["country", "province", "district", "address", "name", "contactNo"];
  for (const f of senderRequired) {
    if (!safeTrim(sender?.[f])) missing.push(`senderInfo.${f}`);
  }

  const refunderInfo = o.refunderInfo && typeof o.refunderInfo === "object" ? o.refunderInfo : null;
  const refundRequired = ["country", "province", "district", "address", "name", "contactNo"];
  for (const f of refundRequired) {
    if (!safeTrim(refunderInfo?.[f])) missing.push(`refunderInfo.${f}`);
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
    "payOrderId",
    "buyerName",
    "buyerPlatformId",
    "buyerIDNo",
    "contactNo",
    "payChannel",
  ];
  for (const f of customsRequired) {
    if (!safeTrim(customs?.[f])) missing.push(`customsDeclareInfo.${f}`);
  }

  return missing;
}

// 安全查询数据库
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

  const orderUserId = safeTrim(orderRow?.user);
  let isDistributorUser = false;
  if (orderUserId) {
    const userRes = await safeQuery(
      sequelize,
      "SELECT `distributorStatus` FROM `users` WHERE `_id` = :id LIMIT 1",
      { replacements: { id: orderUserId } }
    );
    if (userRes.ok) {
      isDistributorUser =
        safeTrim(userRes.rows[0]?.distributorStatus).toLowerCase() === "approved";
    }
  }

  const itemRowsRes = await safeQuery(
    sequelize,
    "SELECT oi.`_id` AS `orderItemId`, oi.`sku` AS `skuId`, oi.`count` AS `count`, oi.`distribution_record` AS `distributionRecordId`, s.`price` AS `price`, s.`wholesale_price` AS `wholesalePrice`, s.`cargo_id` AS `cargoId`, sp.`name` AS `spuName`, dr.`share_price` AS `sharePrice` FROM `shop_order_item` oi INNER JOIN `shop_sku` s ON s.`_id` = oi.`sku` LEFT JOIN `shop_spu` sp ON sp.`_id` = s.`spu` LEFT JOIN `shop_distribution_record` dr ON dr.`_id` = oi.`distribution_record` WHERE oi.`order` = :orderId ORDER BY oi.`_id` ASC",
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
    "SELECT `txnSeqno`, `platform_txno` AS `platformTxno`, `txnTime`, `status`, `amountFen`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `orderId` = :orderId LIMIT 1",
    { replacements: { orderId: id } }
  );
  const llpay = llpayRes.ok ? llpayRes.rows[0] || null : null;
  const payTimeMs = llpay?.txnTime ? parseTimestamp14ToMs(llpay.txnTime) : null;
  const payTimeText = payTimeMs != null ? formatDateTimeCNText(new Date(payTimeMs)) : "";

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

  const orderType = env.orderType;

  const rawReceiverAddress = safeTrim(deliveryInfo?.address) || "";
  const receiverParts = parseReceiverAddressParts(rawReceiverAddress);

  const itemRows = itemRowsRes.rows || [];
  const totalQty = itemRows.reduce(
    (sum, it) => sum + (coerceIntOrNull(it?.count) || 0),
    0
  );
  const totalPriceFen = toFenFromYuanOrFen(orderRow?.totalPrice) || 0;
  const avgUnitPriceFen =
    totalQty > 0 ? Math.round(totalPriceFen / totalQty) : totalPriceFen;

  const baseDeliveryOrder = {
    ownerUserId: env.ownerUserId,
    businessUnitId: env.businessUnitId,
    orderType,
    storeCode: env.storeCode,
    externalOrderCode: id,
    externalShopName: env.externalShopName,
    orderCreateTime: formatDateTimeCNText(orderRow?.createdAt ? new Date(orderRow.createdAt) : new Date()),
    orderPayTime:
      payTimeText ||
      formatDateTimeCNText(
        llpay?.updatedAt ? new Date(llpay.updatedAt) : new Date()
      ),
    saleMode: env.saleMode,
    receiverInfo: {
      country: env.receiverCountry,
      province: safeTrim(receiverParts?.province) || "",
      city: safeTrim(receiverParts?.city) || "/",
      district: safeTrim(receiverParts?.district) || "/",
      town: safeTrim(deliveryInfo?.town) || undefined,
      address: rawReceiverAddress,
      name: safeTrim(deliveryInfo?.name) || "",
      contactNo: safeTrim(deliveryInfo?.phone) || "",
    },
    senderInfo: {
        "country": "CN",
        "province": "浙江省",
        "city": "宁波市",
        "district": "北仑区",
        "address": "大碶街道保税南区东环路16号考拉园区",
        "name": "菜鸟宁波北仑专用保税中心仓A1691",
        "contactNo": "11111111111"
    },
    refunderInfo: {
        "country": "CN",
        "province": "江苏",
        "city": "海安市",
        "district": "/",
        "town": "城东镇",
        "address": "西场街道人民路嘉德超市对面移动营业厅代收",
        "name": "奥迈格司",
        "contactNo": "15250665899"
    },
    orderItemList: [],
    orderSource: "1724",
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
      payOrderId: safeTrim(llpay?.platformTxno) || safeTrim(llpay?.txnSeqno) || "",
      buyerName: safeTrim(deliveryInfo?.name) || "",
      buyerPlatformId: safeTrim(orderRow?.user) || "",
      payChannel: env.payChannel,
      buyerIDNo: safeTrim(deliveryInfo?.idCard) || "",
      contactNo: safeTrim(deliveryInfo?.phone) || "",
    },
  };

  baseDeliveryOrder.orderItemList = itemRows.map((row) => {
    const skuId = safeTrim(row?.skuId);
    const quantity = coerceIntOrNull(row?.count) || 0;
    const sharePriceFen = toFenFromYuanOrFen(row?.sharePrice);
    const wholesalePriceFen = toFenFromYuanOrFen(row?.wholesalePrice);
    const rawPriceFen = toFenFromYuanOrFen(row?.price);
    const unitPriceFen =
      sharePriceFen != null && sharePriceFen > 0
        ? sharePriceFen
        : isDistributorUser && wholesalePriceFen != null && wholesalePriceFen > 0
          ? wholesalePriceFen
          : rawPriceFen != null && rawPriceFen > 0
            ? rawPriceFen
            : avgUnitPriceFen > 0
              ? avgUnitPriceFen
              : 0;
    const lineTotalFen = unitPriceFen * quantity;
    const { netFen: itemTotalPrice, vatFen: vat } = splitVatInclusiveFen(lineTotalFen);
    const declareInfo = {
      itemTotalPrice,
      vat,
      customsTax: 0,
      totalTax: vat,
      consumptionTax: 0,
      itemTotalActualPrice: itemTotalPrice,
    };

    return {
      itemQuantity: quantity,
      declareInfo,
      extItemId: skuId || undefined,
      // itemId: safeTrim(row?.cargoId) || "",
      itemId: "610240611644",
      itemName: safeTrim(row?.spuName) || undefined,
    };
  });

  const normalizedOverrides = overrides && typeof overrides === "object" ? overrides : {};
  const merged = mergeDeep(baseDeliveryOrder, normalizedOverrides);

  merged.receiverInfo = merged.receiverInfo && typeof merged.receiverInfo === "object" ? merged.receiverInfo : {};
  merged.receiverInfo.province = ensureReceiverRequiredText(merged.receiverInfo.province, "/");
  merged.receiverInfo.city = ensureReceiverRequiredText(merged.receiverInfo.city, "/");
  merged.receiverInfo.district = ensureReceiverRequiredText(merged.receiverInfo.district, "/");

  merged.orderAmountInfo =
    merged.orderAmountInfo && typeof merged.orderAmountInfo === "object" ? merged.orderAmountInfo : {};
  const mergedItems = Array.isArray(merged.orderItemList) ? merged.orderItemList : [];
  let goodsTotalPriceFen = 0;
  let vatFen = 0;
  for (let i = 0; i < mergedItems.length; i++) {
    const it = mergedItems[i] && typeof mergedItems[i] === "object" ? mergedItems[i] : {};
    const di = it.declareInfo && typeof it.declareInfo === "object" ? it.declareInfo : {};
    goodsTotalPriceFen += coerceIntOrNull(di.itemTotalPrice) || 0;
    vatFen += coerceIntOrNull(di.vat) || 0;
  }
  const dutiablePriceFen = goodsTotalPriceFen;
  const customsTaxFen = 0;
  const consumptionTaxFen = 0;
  const totalTaxFen = customsTaxFen + consumptionTaxFen + vatFen;

  const totalFenFromOrder = toFenFromYuanOrFen(orderRow?.totalPrice);
  const actualPaymentFen = totalFenFromOrder != null ? totalFenFromOrder : 0;

  merged.orderAmountInfo.dutiablePrice = dutiablePriceFen;
  merged.orderAmountInfo.customsTax = customsTaxFen;
  merged.orderAmountInfo.consumptionTax = consumptionTaxFen;
  merged.orderAmountInfo.vat = vatFen;
  merged.orderAmountInfo.totalTax = totalTaxFen;
  merged.orderAmountInfo.insurance = 0;
  merged.orderAmountInfo.coupon = 0;
  merged.orderAmountInfo.postFee = 0;
  merged.orderAmountInfo.actualPayment = actualPaymentFen;
  merged.orderAmountInfo.currency = "CNY";

  return { ok: true, code: "OK", error: null, deliveryOrder: merged };
}

async function createCainiaoDeliveryOrder({
  sequelize,
  orderId,
  overrides,
  traceId,
  timeoutMs,
  dryRun,
  logRequest,
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

  const logisticsInterfacePayload = orderPayload;

  const result = await requestCainiao(
    {
      msg_type: normalizedMsgType,
      logistics_interface: logisticsInterfacePayload,
      traceId: safeTrim(traceId) || null,
    },
    {
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
      logRequest: logRequest === true,
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
