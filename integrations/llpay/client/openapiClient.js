const { llpayOpenapiRequest } = require("../../../services/llpayOpenapiService");

async function requestLLPayOpenapi({ path, method, body, baseUrl } = {}) {
  try {
    const result = await llpayOpenapiRequest({ path, method, body, baseUrl });
    return {
      ok: !!result?.ok,
      statusCode: typeof result?.statusCode === "number" ? result.statusCode : 0,
      code: result?.code || null,
      error: result?.error || null,
      data: Object.prototype.hasOwnProperty.call(result || {}, "data") ? result.data : null,
      request: result?.request || null,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      code: "NETWORK_ERROR",
      error: error?.message || "NETWORK_ERROR",
      data: null,
      request: null,
    };
  }
}

module.exports = {
  requestLLPayOpenapi,
};

