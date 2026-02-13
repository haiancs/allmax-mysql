const { requestLLPayOpenapi } = require("../../client/openapiClient");
const { encryptFields } = require("../../../utils/llpayCryptoUtils");
const {
  safeTrim,
  buildUserSeqnoFromUserId,
} = require("../../../utils/llpayRouteUtils");
const llpayRepo = require("../../repos/llpayRepo");
const { findOrderById } = require("../../../repos/shopOrderRepo");
const { findDeliveryInfoById } = require("../../../repos/shopDeliveryInfoRepo");
const { findUserById } = require("../../../repos/userRepo");

/**
 * 通用连连请求封装，处理加密逻辑
 * @param {string} path 接口路径
 * @param {Object} body 请求体
 * @param {string[]} sensitiveFields 需要加密的字段列表
 * @returns {Promise<Object>}
 */
async function llpayRequest(path, body, sensitiveFields = []) {
  const reqBody = body && typeof body === "object" ? { ...body } : {};
  const publicKey = process.env.LLPAY_PUBLIC_KEY;

  if (publicKey && sensitiveFields.length > 0) {
    const toEncrypt = {};
    sensitiveFields.forEach((f) => {
      if (reqBody[f]) toEncrypt[f] = reqBody[f];
    });
    if (Object.keys(toEncrypt).length > 0) {
      const encrypted = encryptFields(toEncrypt, publicKey);
      Object.assign(reqBody, encrypted);
    }
  }

  const result = await requestLLPayOpenapi({
    path,
    method: "POST",
    body: reqBody,
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
 * 付款人认证申请
 */
async function payerApply(body) {
  const reqBody = body && typeof body === "object" ? { ...body } : {};
  const txnSeqno = safeTrim(reqBody.txnSeqno || reqBody.txn_seqno);
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

  const orderId = safeTrim(llpay?.orderId);
  const orderRow = orderId
    ? await findOrderById(orderId, { attributes: ["id", "userId", "deliveryInfoId"] })
    : null;
  const order = orderRow?.get ? orderRow.get({ plain: true }) : orderRow;
  const deliveryInfoRow =
    order?.deliveryInfoId
      ? await findDeliveryInfoById(order.deliveryInfoId, {
          attributes: ["id", "userId", "name", "phone", "idCard"],
        })
      : null;
  const deliveryInfo =
    deliveryInfoRow?.get ? deliveryInfoRow.get({ plain: true }) : deliveryInfoRow;

  const userId =
    safeTrim(reqBody.userId || reqBody.user_id) ||
    safeTrim(order?.userId) ||
    safeTrim(llpay?.userId) ||
    safeTrim(deliveryInfo?.userId);
  if (!userId) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: "支付单缺少 userId", data: null },
    };
  }
  const userRow = await findUserById(userId, { attributes: ["id", "nickname", "phone"] });
  const user = userRow?.get ? userRow.get({ plain: true }) : userRow;

  const userName =
    safeTrim(reqBody.user_name || reqBody.userName) ||
    safeTrim(reqBody.payer_name || reqBody.payerName) ||
    safeTrim(deliveryInfo?.name) ||
    safeTrim(user?.nickname);
  const idNo =
    safeTrim(reqBody.id_no || reqBody.idNo) ||
    safeTrim(deliveryInfo?.idCard);
  const phone =
    safeTrim(reqBody.payer_phone || reqBody.payerPhone || reqBody.phone) ||
    safeTrim(deliveryInfo?.phone) ||
    safeTrim(user?.phone);
  const idType =
    safeTrim(reqBody.id_type || reqBody.idType) ||
    (idNo ? "ID_CARD" : "");

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

  const payerId = safeTrim(reqBody.payer_id || reqBody.payerId) || userId;
  const payerName =
    safeTrim(reqBody.payer_name || reqBody.payerName) ||
    userName;
  const payerType = safeTrim(reqBody.payer_type || reqBody.payerType) || "PERSON";
  const userCountryCode =
    safeTrim(reqBody.user_country_code || reqBody.userCountryCode) || "CN";

  const required = [
    ["user_name", userName],
    ["id_type", idType],
    ["id_no", idNo],
    ["payer_phone", phone],
    ["payer_id", payerId],
    ["payer_name", payerName],
  ];
  for (const [k, v] of required) {
    if (!v) {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: `${k} 必须存在`, data: null },
      };
    }
  }

  const payerTxnSeqno = buildUserSeqnoFromUserId(userId);
  if (!payerTxnSeqno) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: "payer txnSeqno 生成失败", data: null },
    };
  }

  const sensitiveFields = [
    "payer_id_no",
    "payer_phone",
  ];
  const payload = {
    "txn_seqno": payerTxnSeqno,
    "notify_url": notifyUrlRaw,
    "payer_id": payerId,
    "payer_name": payerName,
    "payer_type": payerType,
    "user_name": userName,
    "id_type": idType,
    "id_no": idNo,
    "payer_id_no": idNo,
    "payer_phone": phone,
    "user_country_code": userCountryCode,
  };
  return llpayRequest("/v1/global-payout/payer/apply", payload, sensitiveFields);
}

/**
 * 付款人认证申请结果查询
 */
async function payerApplyResultQuery(body) {
  return llpayRequest("/v1/global-payout/payer/apply-result-query", body);
}

/**
 * 收款人认证申请
 */
async function beneficiaryApply(body) {
  const sensitiveFields = [
    "beneficiary_id_no",
    "beneficiary_bank_acct_no",
    "beneficiary_phone",
    "beneficiary_email",
    "legal_person_id_no",
    "legal_person_phone",
  ];
  return llpayRequest("/v1/global-payout/beneficiary/apply", body, sensitiveFields);
}

/**
 * 收款人认证申请结果查询
 */
async function beneficiaryApplyResultQuery(body) {
  return llpayRequest("/v1/global-payout/beneficiary/apply-result-query", body);
}

/**
 * 删除收款人
 */
async function beneficiaryCancel(body) {
  return llpayRequest("/v1/global-payout/beneficiary/cancel", body);
}

/**
 * 收款人详情
 */
async function beneficiaryDetail(body) {
  return llpayRequest("/v1/global-payout/beneficiary/detail", body);
}

/**
 * 贸易材料申请
 */
async function transactionDocumentApply(body) {
  return llpayRequest("/v1/global-payout/transaction-document/apply", body);
}

/**
 * 贸易材料申请结果查询
 */
async function transactionDocumentApplyResultQuery(body) {
  return llpayRequest("/v1/global-payout/transaction-document/apply-result-query", body);
}

/**
 * 贸易材料可用额度查询
 */
async function transactionDocumentGetQuota(body) {
  return llpayRequest("/v1/global-payout/transaction-document/get-quota", body);
}

/**
 * 付汇申请
 */
async function payoutApply(body) {
  return llpayRequest("/v1/global-payout/payout-apply", body);
}

/**
 * 付汇结果查询
 */
async function payoutApplyResultQuery(body) {
  return llpayRequest("/v1/global-payout/payout-apply-result-query", body);
}

module.exports = {
  payerApply,
  payerApplyResultQuery,
  beneficiaryApply,
  beneficiaryApplyResultQuery,
  beneficiaryCancel,
  beneficiaryDetail,
  transactionDocumentApply,
  transactionDocumentApplyResultQuery,
  transactionDocumentGetQuota,
  payoutApply,
  payoutApplyResultQuery,
};
