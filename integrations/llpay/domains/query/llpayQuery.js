const { requestLLPayOpenapi } = require("../../client/openapiClient");
const {
  safeTrim,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");

async function orderQuery(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const txnSeqno = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);
  const platformTxno = safeTrim(reqBody?.platformTxno || reqBody?.platform_txno);

  if (!txnSeqno && !platformTxno) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "txnSeqno 或 platformTxno 必须存在",
        data: null,
      },
    };
  }

  const payload = {};
  if (txnSeqno) payload.txn_seqno = txnSeqno;
  if (platformTxno) payload.platform_txno = platformTxno;
  if (reqBody?.txn_time || reqBody?.txnTime) payload.txn_time = safeTrim(reqBody.txn_time || reqBody.txnTime);
  if (reqBody?.accp_txnno || reqBody?.accpTxnno) payload.accp_txnno = safeTrim(reqBody.accp_txnno || reqBody.accpTxnno);

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/v1/ipay/orderquery",
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
        message: `收款查询失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
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

async function securedQuery(body) {
  try {
    result = await requestLLPayOpenapi({
      path: "/mch/v1/accp/txn/secured-query",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com/query",
      body,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  console.log("[LLPAY][secured-query] LLPay raw result", {
    ok: result && result.ok,
    statusCode: result && result.statusCode,
    code: result && result.code,
    error: result && result.error,
    dataType: result && typeof result.data,
  });
  console.log("[LLPAY][secured-query] LLPay raw result", result);

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
        message: `担保交易信息查询失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
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
  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/query/v1/ipay/refundquery",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com",
      body,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const httpStatus = getLLPayHttpStatus(result);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
        data: result.data || null,
      },
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: { code: 0, data: result.data },
  };
}

async function accpOrderQuery(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const txnSeqno = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);
  const platformTxno = safeTrim(reqBody?.platformTxno || reqBody?.platform_txno);

  if (!txnSeqno && !platformTxno) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "txnSeqno 或 platformTxno 必须存在",
        data: null,
      },
    };
  }

  const payload = {};
  if (txnSeqno) payload.txn_seqno = txnSeqno;
  if (platformTxno) payload.platform_txno = platformTxno;

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/mch/v1/accp/txn/order-query",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com/query",
      body: payload,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const httpStatus = getLLPayHttpStatus(result);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
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
        message: `支付结果查询失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
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
  orderQuery,
  securedQuery,
  refundQuery,
  accpOrderQuery,
};
