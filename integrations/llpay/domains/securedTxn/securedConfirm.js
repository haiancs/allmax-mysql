const crypto = require("crypto");
const { requestLLPayOpenapi } = require("../../client/openapiClient");
const llpayRepo = require("../../repos/llpayRepo");
const {
  safeTrim,
  buildTxnSeqnoFromOrderId,
  safeNumber,
  formatDateTimeCN,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");

function generateTxnSeqno(prefix, input) {
  const now = Date.now();
  const digest = crypto
    .createHash("sha256")
    .update(`${prefix}:${safeTrim(input)}:${now}:${crypto.randomBytes(8).toString("hex")}`)
    .digest("hex");
  return digest.slice(0, 32);
}

async function securedConfirm(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const orderId = safeTrim(reqBody?.orderId || reqBody?.order_id || reqBody?.id);
  const txnSeqnoRaw =
    safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno) || (orderId ? buildTxnSeqnoFromOrderId(orderId) : "");
  const txnSeqno = safeTrim(txnSeqnoRaw);

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

  let llpay;
  try {
    llpay = await llpayRepo.findByTxnSeqno(txnSeqno);
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "查询支付单失败", data: null },
    };
  }

  if (!llpay) {
    return {
      ok: false,
      httpStatus: 404,
      body: { code: -1, message: "支付单不存在", data: null },
    };
  }

  const originalAmountFen = safeNumber(llpay?.amountFen, 0);
  if (!(originalAmountFen > 0)) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "支付单金额无效", data: null },
    };
  }

  const confirmMode = "ALL";

  const confirmAmountRaw = reqBody?.confirmAmount ?? reqBody?.confirm_amount ?? reqBody?.order_amount;
  const confirmAmount =
    confirmAmountRaw == null
      ? Number((originalAmountFen / 100).toFixed(2))
      : Number(safeNumber(confirmAmountRaw, NaN).toFixed(2));

  if (!Number.isFinite(confirmAmount) || confirmAmount <= 0) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "confirmAmount 无效", data: null },
    };
  }

  const originalAmount = Number((originalAmountFen / 100).toFixed(2));
  if (confirmAmount > originalAmount) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "confirmAmount 不能大于原订单金额", data: null },
    };
  }

  const originalOrderId = safeTrim(llpay?.txnSeqno);
  if (!originalOrderId) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "orderId 必须存在", data: null },
    };
  }

  const confirmTxnSeqno = generateTxnSeqno("llpay_secured_confirm", txnSeqno);
  const confirmTxnTime = safeTrim(llpay?.txnTime) || formatDateTimeCN(new Date());

  const payload = {
    original_orderInfo: { txn_seqno: originalOrderId, order_amount: originalAmount },
    confirm_orderInfo: {
      txn_seqno: confirmTxnSeqno,
      txn_time: confirmTxnTime,
      order_amount: confirmAmount,
      confirm_mode: confirmMode,
    },
  };

  let forwardRes;
  try {
    forwardRes = await requestLLPayOpenapi({
      path: "/v1/accp/txn/secured-confirm",
      method: "POST",
      body: payload,
    });
  } catch (error) {
    forwardRes = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!forwardRes.ok) {
    const errCode = forwardRes.code || null;
    const statusCode = typeof forwardRes.statusCode === "number" ? forwardRes.statusCode : 0;
    const httpStatus = getLLPayHttpStatus(forwardRes);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: forwardRes.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: forwardRes.data || null,
        request: forwardRes.request,
      },
    };
  }

  const apiData =
    typeof forwardRes.data === "string"
      ? tryParseJsonObject(forwardRes.data) || forwardRes.data
      : forwardRes.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  if (retCode && retCode !== "0000") {
    return {
      ok: false,
      httpStatus: 502,
      body: {
        code: -1,
        message: `担保确认失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: forwardRes.request,
      },
    };
  }

  try {
    await llpayRepo.recordSecuredConfirm(txnSeqno, confirmTxnSeqno, confirmTxnTime);
  } catch (_) {}

  return {
    ok: true,
    httpStatus: 200,
    body: {
      code: 0,
      data: apiObj || apiData,
      confirm: {
        originalTxnSeqno: txnSeqno,
        confirmTxnSeqno,
        confirmTxnTime,
        originalAmount,
        confirmAmount,
        confirmMode,
      },
      request: forwardRes.request,
    },
  };
}

module.exports = {
  securedConfirm,
};
