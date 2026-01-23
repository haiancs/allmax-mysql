const { requestLLPayOpenapi } = require("../../client/openapiClient");
const {
  safeTrim,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");

async function divideBillQuery(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const divideSeqno = safeTrim(reqBody?.divideSeqno || reqBody?.divide_seqno);

  if (!divideSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "divideSeqno 必须存在",
        data: null,
      },
    };
  }

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/v1/ipay/divideBillQuery",
      method: "POST",
      body: { divide_seqno: divideSeqno },
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
        message: `分账单查询失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
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
  divideBillQuery,
};

