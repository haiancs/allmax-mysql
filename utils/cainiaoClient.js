// 菜鸟网关客户端封装
// - requestCainiao：按菜鸟接口要求做签名（MD5+Base64 的 data_digest）并以 x-www-form-urlencoded 方式请求网关
// - debug：仅返回脱敏后的请求信息（data_digest 会被 masked）
const crypto = require("crypto");
const axios = require("axios");
const querystring = require("querystring");

function buildJsonString(params) {
  if (typeof params === "string") return params;
  if (!params) return "";
  return JSON.stringify(params);
}

function signCainiao(content, key) {
  if (!key) {
    throw new Error("secret key is required");
  }
  const msg = String(content || "") + String(key || "");
  const md5 = crypto.createHash("md5");
  md5.update(msg, "utf8");
  const digest = md5.digest();
  return digest.toString("base64");
}

function filterDebugHeaders(headers) {
  const result = {};
  const keys = Object.keys(headers || {});
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === "data_digest") {
      result[k] = "[masked]";
    } else {
      result[k] = headers[k];
    }
  }
  return result;
}

async function requestCainiao(params = {}, options = {}) {
  const msg_type = params && params.msg_type;
  const logisticsInterfaceParam = params && params.logistics_interface;
  const to_code = params && params.to_code ? params.to_code : null;
  const traceId = params && params.traceId ? params.traceId : null;

  const logisticProviderIdRaw =
    options.logisticProviderId || process.env.CAINIAO_LOGISTIC_PROVIDER_ID || null;
  const secretKeyRaw = options.secretKey || process.env.CAINIAO_SECRET_KEY || null;
  const envBaseUrl =
    process.env.CAINIAO_BASE_URL || "https://prelink.cainiao.com/gateway/link.do";

  const logisticProviderId = logisticProviderIdRaw ? String(logisticProviderIdRaw) : null;
  const secretKey = secretKeyRaw ? String(secretKeyRaw) : null;

  const baseUrlRaw =
    options.baseUrl || envBaseUrl || "https://link.cainiao.com/gateway/link.do";
  const baseUrl = String(baseUrlRaw).replace(/\/+$/, "");
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 15000;
  const debug = !!options.debug;

  if (!logisticProviderId) {
    return {
      success: false,
      code: "MISSING_LOGISTIC_PROVIDER_ID",
      message: "logistic_provider_id is required",
      traceId,
    };
  }

  if (!secretKey) {
    return {
      success: false,
      code: "MISSING_SECRET_KEY",
      message: "secret key is required",
      traceId,
    };
  }

  if (!msg_type) {
    return {
      success: false,
      code: "MISSING_MSG_TYPE",
      message: "msg_type is required",
      traceId,
    };
  }

  if (!logisticsInterfaceParam) {
    return {
      success: false,
      code: "MISSING_LOGISTICS_INTERFACE",
      message: "logistics_interface is required",
      traceId,
    };
  }

  const logisticsInterface = buildJsonString(logisticsInterfaceParam);

  let dataDigest;
  try {
    dataDigest = signCainiao(logisticsInterface, secretKey);
  } catch (err) {
    return {
      success: false,
      code: "SIGN_ERROR",
      message: err && err.message ? err.message : "sign failed",
      traceId,
    };
  }

  const formBody = {
    logistic_provider_id: logisticProviderId,
    data_digest: dataDigest,
    msg_type,
    logistics_interface: logisticsInterface,
  };

  if (to_code) {
    formBody.to_code = to_code;
  }

  const url = baseUrl;
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const bodyString = querystring.stringify(formBody);

  const axiosConfig = {
    method: "post",
    url,
    headers,
    timeout: timeoutMs,
    data: bodyString,
  };

  try {
    const res = await axios(axiosConfig);
    let respData = res && res.data !== undefined ? res.data : null;
    if (typeof respData === "string") {
      try {
        respData = JSON.parse(respData);
      } catch (e) {}
    }

    let bizSuccess = true;
    let bizCode = "OK";
    let bizMessage = "";

    if (
      respData &&
      typeof respData === "object" &&
      Object.prototype.hasOwnProperty.call(respData, "errorCode")
    ) {
      const successFlag = respData.success;
      const errorCode = respData.errorCode;
      const errorMsg = respData.errorMsg || respData.errorMessage || "";
      const isSuccessFlagTrue = successFlag === true || successFlag === "true";
      const isErrorCodeOk =
        errorCode === "0" ||
        errorCode === 0 ||
        errorCode === "false" ||
        errorCode === false ||
        errorCode === "" ||
        errorCode === null ||
        typeof errorCode === "undefined";
      if (!(isSuccessFlagTrue && isErrorCodeOk)) {
        bizSuccess = false;
        bizCode = typeof errorCode === "string" && errorCode ? errorCode : "CAINIAO_BUSINESS_ERROR";
        bizMessage = errorMsg || "cainiao business error";
      }
    }

    const debugInfo = debug
      ? {
          url,
          headers: filterDebugHeaders(headers),
          request: {
            msg_type,
            to_code,
            logistics_interface_length: logisticsInterface.length,
          },
        }
      : undefined;

    if (!bizSuccess) {
      return {
        success: false,
        code: bizCode,
        message: bizMessage,
        cainiaoResp: respData,
        traceId,
        debugInfo,
      };
    }

    return {
      success: true,
      code: bizCode,
      message: bizMessage,
      cainiaoResp: respData,
      traceId,
      debugInfo,
    };
  } catch (error) {
    const status = error && error.response && error.response.status;
    const respData = error && error.response && error.response.data;
    const code = status ? "HTTP_" + String(status) : "NETWORK_ERROR";
    const message = error && error.message ? error.message : "request failed";
    const debugInfo = debug ? { url, headers: filterDebugHeaders(headers) } : undefined;
    return {
      success: false,
      code,
      message,
      cainiaoResp: respData || null,
      traceId,
      debugInfo,
    };
  }
}

module.exports = {
  requestCainiao,
};
