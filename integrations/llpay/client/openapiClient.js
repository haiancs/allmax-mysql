require("dotenv").config();

const axios = require("axios");
const http = require("http");
const https = require("https");
const {
  buildJsonString,
  rsaSignMd5HexMessageFromData,
} = require("../../../utils/llpayCryptoUtils");

const {
  formatDateTimeCN,
} = require("../../../utils/llpayRouteUtils");
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

function shouldLogLLPayOpenapi() {
  const v = process.env.LLPAY_OPENAPI_LOG;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function redactSensitive(value, depth = 0) {
  if (depth > 6) return "[Truncated]";
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = String(k);
    const lower = key.toLowerCase();
    const isSecretKey =
      lower.includes("signature") ||
      lower.includes("private") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower === "pwd" ||
      lower.includes("token") ||
      lower.includes("key");
    const isPiiKey =
      lower.includes("card") ||
      lower.includes("bank") ||
      lower.includes("id_no") ||
      lower.includes("idno") ||
      lower.includes("phone") ||
      lower.includes("mobile") ||
      lower.includes("cvv");
    if (isSecretKey || isPiiKey) {
      out[key] = "***";
      continue;
    }
    out[key] = redactSensitive(v, depth + 1);
  }
  return out;
}

function sanitizeRequestForLog({ url, headers, body }) {
  const h = headers && typeof headers === "object" ? Object.assign({}, headers) : {};
  if (h["Signature-Data"]) h["Signature-Data"] = "***";
  return {
    url,
    headers: h,
    body: redactSensitive(body),
  };
}

async function requestLLPayOpenapi({ path, method, body, baseUrl } = {}) {
  try {
    const mchId = process.env.LLPAY_PARTNER_ID;
    const privateKey = process.env.LLPAY_PRIVATE_KEY;
    if (!mchId) {
      return { ok: false, statusCode: 0, error: "MISSING_MCH_ID", code: "MISSING_MCH_ID" };
    }
    if (!privateKey) {
      return { ok: false, statusCode: 0, error: "MISSING_PRIVATE_KEY", code: "MISSING_PRIVATE_KEY" };
    }

    const rawPath = String(path || "").trim();
    if (!rawPath || /^https?:\/\//i.test(rawPath)) {
      return { ok: false, statusCode: 0, error: "INVALID_PATH", code: "INVALID_PATH" };
    }
    const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

    const urlBase = (baseUrl || "https://openapi.lianlianpay.com/mch").replace(
      /\/+$/,
      ""
    );
    const url = urlBase + normalizedPath;

    const reqBody = Object.assign({}, body && typeof body === "object" ? body : {});
    if (!reqBody.mch_id) reqBody.mch_id = mchId;

    const message = buildJsonString(reqBody);
    const signature = rsaSignMd5HexMessageFromData(message, privateKey);
    const ts = formatDateTimeCN(new Date());

    const headers = {
      "Signature-Data": signature,
      "Signature-Type": "RSA",
      mch_id: mchId,
      timestamp: ts,
      "Content-Type": "application/json;charset=utf-8",
    };
    const requestForLog = sanitizeRequestForLog({ url, headers, body: reqBody });
    if (shouldLogLLPayOpenapi()) {
      try {
        console.log("[LLPAY][openapi] request:", JSON.stringify(requestForLog));
      } catch (_) {}
    }

    let res;
    try {
      res = await axios({
        method: String(method || "POST").toUpperCase(),
        url,
        headers: headers,
        timeout: 15000,
        validateStatus: () => true,
        httpAgent,
        httpsAgent,
        data: reqBody,
      });
    } catch (error) {
      const code =
        (error && typeof error.code === "string" && error.code) || "NETWORK_ERROR";
      const message =
        (error && typeof error.message === "string" && error.message) ||
        "NETWORK_ERROR";
      if (shouldLogLLPayOpenapi()) {
        try {
          console.log(
            "[LLPAY][openapi] network_error:",
            JSON.stringify({ code, message, request: requestForLog })
          );
        } catch (_) {}
      }
      return {
        ok: false,
        statusCode: 0,
        code,
        error: message,
        data: null,
        request: { url, headers, body: reqBody },
      };
    }

    const statusCode = res.status || 0;
    const ok = statusCode >= 200 && statusCode < 300;
    if (shouldLogLLPayOpenapi()) {
      try {
        console.log(
          "[LLPAY][openapi] response:",
          JSON.stringify({ url, statusCode, ok, data: redactSensitive(res.data) })
        );
      } catch (_) {}
    }
    return {
      ok,
      statusCode,
      data: res.data || null,
      request: { url, headers, body: reqBody },
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
