const { requestLLPayOpenapi } = require("../../client/openapiClient");
const {
  safeTrim,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");

async function refundApply(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const refundSeqno = safeTrim(reqBody?.refundSeqno || reqBody?.refund_seqno);
  const txnSeqno = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);
  const refundAmount = safeTrim(reqBody?.refundAmount || reqBody?.refund_amount);
  const notifyUrl = safeTrim(reqBody?.notifyUrl || reqBody?.notify_url);
  const refundTime = safeTrim(reqBody?.refundTime || reqBody?.refund_time);

  if (!refundSeqno || !txnSeqno || !refundAmount || !notifyUrl || !refundTime) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "refundSeqno、txnSeqno、refundAmount、notifyUrl、refundTime 必须存在",
        data: null,
      },
    };
  }

  const payload = {
    refund_seqno: refundSeqno,
    txn_seqno: txnSeqno,
    refund_amount: refundAmount,
    notify_url: notifyUrl,
    refund_time: refundTime,
  };

  if (reqBody?.sub_mch_id || reqBody?.subMchId) payload.sub_mch_id = safeTrim(reqBody.sub_mch_id || reqBody.subMchId);
  if (reqBody?.txn_date || reqBody?.txnDate) payload.txn_date = safeTrim(reqBody.txn_date || reqBody.txnDate);
  if (reqBody?.refund_reason || reqBody?.refundReason) payload.refund_reason = safeTrim(reqBody.refund_reason || reqBody.refundReason);
  if (reqBody?.refund_method_infos) payload.refund_method_infos = reqBody.refund_method_infos;
  if (reqBody?.payee_refund_infos) payload.payee_refund_infos = reqBody.payee_refund_infos;
  if (reqBody?.quota_account_infos) payload.quota_account_infos = reqBody.quota_account_infos;
  if (reqBody?.divide_refund_infos) payload.divide_refund_infos = reqBody.divide_refund_infos;

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/v1/ipay/refund",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com",
      body: payload,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const errCode = result.code || null;
    const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
    const httpStatus = getLLPayHttpStatus(result);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      },
    };
  }

  const apiData = typeof result.data === "string" ? tryParseJsonObject(result.data) || result.data : result.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  if (retCode && retCode !== "0000") {
    return {
      ok: false,
      httpStatus: 502,
      body: {
        code: -1,
        message: `退款申请失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: result.request,
      },
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: { code: 0, data: apiObj || apiData, request: result.request },
  };
}

async function refundQuery(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const refundSeqno = safeTrim(reqBody?.refundSeqno || reqBody?.refund_seqno);
  const platformRefundno = safeTrim(reqBody?.platformRefundno || reqBody?.platform_refundno);
  const txnSeqno = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);

  if (!refundSeqno && !platformRefundno && !txnSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "refundSeqno、platformRefundno 或 txnSeqno 至少提供一个",
        data: null,
      },
    };
  }

  const payload = {};
  if (refundSeqno) payload.refund_seqno = refundSeqno;
  if (platformRefundno) payload.platform_refundno = platformRefundno;
  if (txnSeqno) payload.txn_seqno = txnSeqno;

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/query/v1/ipay/refundquery",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com",
      body: payload,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const errCode = result.code || null;
    const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
    const httpStatus = getLLPayHttpStatus(result);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      },
    };
  }

  const apiData = typeof result.data === "string" ? tryParseJsonObject(result.data) || result.data : result.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  if (retCode && retCode !== "0000") {
    return {
      ok: false,
      httpStatus: 502,
      body: {
        code: -1,
        message: `退款查询失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: result.request,
      },
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: { code: 0, data: apiObj || apiData, request: result.request },
  };
}

module.exports = {
  refundApply,
  refundQuery,
};
