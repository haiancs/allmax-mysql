const { requestLLPayOpenapi } = require("../../client/openapiClient");
const {
  safeTrim,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");

async function cancelSecuredPayment(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const txnSeqnoFromBody = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);
  const confirmTxnSeqno = safeTrim(reqBody?.confirmTxnSeqno || reqBody?.confirm_txn_seqno) || txnSeqnoFromBody;

  if (!confirmTxnSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "confirmTxnSeqno 或 txnSeqno 必须存在（撤销的是担保确认单号）",
        data: null,
      },
    };
  }
  if (confirmTxnSeqno.length > 64) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "confirmTxnSeqno 长度不能超过 64",
        data: null,
      },
    };
  }

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/v1/accp/txn/cancel-secured-payment",
      method: "POST",
      body: { txn_seqno: confirmTxnSeqno },
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

  const apiData =
    typeof result.data === "string" ? tryParseJsonObject(result.data) || result.data : result.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  if (retCode && retCode !== "0000") {
    return {
      ok: false,
      httpStatus: 502,
      body: {
        code: -1,
        message: `担保确认撤销失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
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
  cancelSecuredPayment,
};
