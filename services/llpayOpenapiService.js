require("dotenv").config();

const axios = require("axios");
const http = require("http");
const https = require("https");
const {
  buildJsonString,
  rsaSignMd5HexMessageFromData,
  rsaVerify,
  rsaEncryptWithPublicKey,
  encryptFields,
} = require("../utils/llpayCryptoUtils");

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

async function llpayOpenapiRequest({ path, body, method, baseUrl }) {
  const mchId = process.env.LLPAY_PARTNER_ID;
  const privateKey = process.env.LLPAY_PRIVATE_KEY;
  if (!mchId) {
    return { ok: false, error: "MISSING_MCH_ID", code: "MISSING_MCH_ID" };
  }
  if (!privateKey) {
    return { ok: false, error: "MISSING_PRIVATE_KEY", code: "MISSING_PRIVATE_KEY" };
  }

  const rawPath = String(path || "").trim();
  if (!rawPath || /^https?:\/\//i.test(rawPath)) {
    return { ok: false, error: "INVALID_PATH", code: "INVALID_PATH" };
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
  const ts = String(Date.now());

  const headers = {
    "Signature-Data": signature,
    "Signature-Type": "RSA",
    mch_id: mchId,
    timestamp: ts,
    "Content-Type": "application/json;charset=utf-8",
  };

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
  return {
    ok,
    statusCode,
    data: res.data || null,
    request: { url, headers, body: reqBody },
  };
}

module.exports = {
  buildJsonString,
  rsaSignMd5HexMessageFromData,
  rsaVerify,
  rsaEncryptWithPublicKey,
  encryptFields,
  llpayOpenapiRequest,
};
