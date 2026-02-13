const { requestLLPayOpenapi } = require("../../client/openapiClient");
const llpayRepo = require("../../repos/llpayRepo");
const { findBondedOrderByOrderId } = require("../../repos/customsRepo");
const { findOrderById } = require("../../../../repos/shopOrderRepo");
const { findDeliveryInfoById } = require("../../../../repos/shopDeliveryInfoRepo");
const { findUserById } = require("../../../../repos/userRepo");
const {
  ensureTimestamp14,
  safeTrim,
  safeNumber,
  buildTxnSeqnoFromOrderId,
  tryParseJsonObject,
  buildCustomsSeqnoFromOrderId,
} = require("../../../../utils/llpayRouteUtils");
const { splitVatInclusiveYuan } = require("../../../../utils/envUtils");

const CUSTOMS_PLATFORM_CODE = "3206965AEH";
const CUSTOMS_PLATFORM_NAME = "健能（海安）营养科技有限公司";
const CUSTOMS_CODE = "300114";
const CUSTOMS_PAY_FEE_AMOUNT = 0;

function resolveAmount(...candidates) {
  for (const v of candidates) {
    const n = safeNumber(v, null);
    if (n != null) return n;
  }
  return null;
}

/**
 * 海关推单
 * @param {Object} body 请求体
 * @returns {Promise<Object>}
 */
async function applyPushPay(body) {
  const reqBody = body && typeof body === "object" ? { ...body } : {};
  const txnSeqnoRaw = safeTrim(reqBody.txnSeqno || reqBody.txn_seqno);
  let txnSeqno = txnSeqnoRaw;

  if (!txnSeqno) {
    const orderIdRaw = reqBody.orderId || reqBody.order_id || reqBody.id;
    const orderId = safeTrim(orderIdRaw);
    txnSeqno = buildTxnSeqnoFromOrderId(orderId);
  }

  if (!txnSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "txnSeqno 必须存在", data: null },
    };
  }

  if (txnSeqno.length > 64) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "txnSeqno 长度不能超过 64", data: null },
    };
  }

  const llpay = await llpayRepo.findByTxnSeqno(txnSeqno);
  if (!llpay) {
    return {
      ok: false,
      httpStatus: 404,
      body: { code: -1, message: "支付单不存在", data: null },
    };
  }

  const orderId =
    safeTrim(llpay?.orderId);

  if (!orderId) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: "支付单缺少 orderId", data: null },
    };
  }

  const [orderRow, bonded] = await Promise.all([
    findOrderById(orderId, {
      attributes: ["id", "totalPrice", "deliveryInfoId", "userId"],
    }),
    findBondedOrderByOrderId(orderId),
  ]);
  const order = orderRow?.get ? orderRow.get({ plain: true }) : orderRow;

  if (!order) {
    return {
      ok: false,
      httpStatus: 404,
      body: { code: -1, message: "订单不存在", data: null },
    };
  }

  const [deliveryInfoRow, userRow] = await Promise.all([
    order?.deliveryInfoId
      ? findDeliveryInfoById(order.deliveryInfoId, {
          attributes: ["id", "name", "phone", "address", "idCard"],
        })
      : Promise.resolve(null),
    order?.userId
      ? findUserById(order.userId, { attributes: ["id", "nickname"] })
      : Promise.resolve(null),
  ]);
  const deliveryInfo =
    deliveryInfoRow?.get ? deliveryInfoRow.get({ plain: true }) : deliveryInfoRow;
  const user = userRow?.get ? userRow.get({ plain: true }) : userRow;
  const bondedRequestData =
    bonded?.requestData && typeof bonded.requestData === "string"
      ? tryParseJsonObject(bonded.requestData)
      : bonded?.requestData || null;

  const userName =
    safeTrim(reqBody.user_name || reqBody.userName) ||
    safeTrim(user?.nickname) ||
    safeTrim(bonded?.receiverName) ||
    safeTrim(deliveryInfo?.name);
  const idNo =
    safeTrim(reqBody.id_no || reqBody.idNo) ||
    safeTrim(bonded?.receiverIdCard) ||
    safeTrim(deliveryInfo?.idCard);
  const idType =
    safeTrim(reqBody.id_type || reqBody.idType) ||
    (idNo ? "01" : "");
  const phone =
    safeTrim(reqBody.phone) ||
    safeTrim(bonded?.receiverPhone) ||
    safeTrim(deliveryInfo?.phone);

  const totalAmount = resolveAmount(
    llpay?.amountFen != null ? Number(llpay.amountFen) / 100 : null,
    order?.totalPrice
  );
  const splitFromTotal = totalAmount != null ? splitVatInclusiveYuan(totalAmount) : null;

  const taxAmount = resolveAmount(
    splitFromTotal?.vat,
    0
  );

  const goodsAmount = resolveAmount(
    splitFromTotal?.net,
    totalAmount != null && taxAmount != null ? totalAmount - taxAmount : null
  );

  const notifyUrlRaw =
    safeTrim(reqBody.notify_url || reqBody.notifyUrl) ||
    safeTrim(process.env.LLPAY_NOTIFY_URL);
  if (!notifyUrlRaw) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: "缺少 notifyUrl 配置", data: null },
    };
  }

  const missing = [];
  if (!userName) missing.push("user_name");
  if (!idType) missing.push("id_type");
  if (!idNo) missing.push("id_no");
  if (!phone) missing.push("phone");
  if (!(totalAmount > 0)) missing.push("total_amount");
  if (!(goodsAmount > 0)) missing.push("pay_gds_amt");
  if (taxAmount == null || taxAmount < 0) missing.push("pay_tax_amt");
  if (missing.length) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: `${missing.join(", ")} 必须存在`, data: null },
    };
  }

  const nowTs = ensureTimestamp14(new Date());
  const txnTime = ensureTimestamp14(reqBody.txn_time || reqBody.txnTime || llpay?.txnTime);
  const customsTxnSeqno =
    buildCustomsSeqnoFromOrderId(orderId);
  const orgTxnSeqno =
    safeTrim(reqBody.org_txn_seqno || reqBody.orgTxnSeqno || reqBody.txnSeqno || reqBody.txn_seqno) ||
    txnSeqno;

  const payload = {
    "timestamp": nowTs, //yyyyMMddHHmmss 发送该请求时的时间，有效期30分钟
    "user_name": userName,
    "id_type": idType,
    "id_no": idNo,
    "phone": phone,
    "txn_seqno": customsTxnSeqno, //这个是海关推单的ID，发送的时候构造
    "org_txn_seqno": orgTxnSeqno,
    "txn_time": txnTime, // 商户系统支付交易时间
    // "operate_type": "string",
    "total_amount": totalAmount,
    "platform_code": CUSTOMS_PLATFORM_CODE,
    "platform_name": CUSTOMS_PLATFORM_NAME,
    "custom_code": CUSTOMS_CODE, // 海关编码
    "notify_url": notifyUrlRaw,
    // "sub_order_flag": "string", // 拆单标识
    "pay_fee_amount": CUSTOMS_PAY_FEE_AMOUNT,
    "pay_gds_amt": goodsAmount, //商品价格
    "pay_tax_amt": taxAmount,
    // "extend_info": "string",
    // "auth_check_strategy": "string"
  };

  const result = await requestLLPayOpenapi({
    path: "/v1/cbpayment/apply-pushpay",
    method: "POST",
    body: payload,
  });

  return {
    ok: result.ok,
    httpStatus: result.statusCode || (result.ok ? 200 : 502),
    body: {
      code: result.ok ? 0 : -1,
      message: result.ok ? "success" : (result.error || "请求失败"),
      data: result.data,
    },
  };
}

/**
 * 海关推单查询
 * @param {Object} body 请求体
 * @returns {Promise<Object>}
 */
async function queryPushPayInfo(reqBody) {
  const nowTs = ensureTimestamp14(new Date());
  const txnSeqnoRaw = safeTrim(reqBody.txnSeqno || reqBody.txn_seqno);

  const payload = {
    "timestamp": nowTs, //yyyyMMddHHmmss 发送该请求时的时间
    "txn_seqno": txnSeqnoRaw,
  };
  const result = await requestLLPayOpenapi({
    path: "/v1/cbpayment/query-pushpayinfo",
    method: "POST",
    body: payload,
  });

  return {
    ok: result.ok,
    httpStatus: result.statusCode || (result.ok ? 200 : 502),
    body: {
      code: result.ok ? 0 : -1,
      message: result.ok ? "success" : (result.error || "请求失败"),
      data: result.data,
    },
  };
}

module.exports = {
  applyPushPay,
  queryPushPayInfo,
};
