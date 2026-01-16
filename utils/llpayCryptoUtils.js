const crypto = require("crypto");

function normalizePemKey(raw) {
  if (!raw || typeof raw !== "string") return raw;

  let s = raw.trim();
  s = s.replace(/\\n/g, "\n");
  s = s.replace(/^"([\s\S]*)"$/m, "$1").replace(/^\'([\s\S]*)\'$/m, "$1");

  const pemMatch = s.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/);
  if (pemMatch) {
    const label = String(pemMatch[1] || "").trim();
    const body = String(pemMatch[2] || "").replace(/[^A-Za-z0-9+/=]/g, "");
    const chunked = (body.match(/.{1,64}/g) || [body]).join("\n");
    return `-----BEGIN ${label}-----\n${chunked}\n-----END ${label}-----`;
  }

  const base64Only = /^[A-Za-z0-9+/=\s]+$/.test(s);
  if (base64Only) {
    const body = s.replace(/[^A-Za-z0-9+/=]/g, "");
    const chunked = (body.match(/.{1,64}/g) || [body]).join("\n");
    return `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----`;
  }

  return s;
}

function normalizePemPublicKey(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();
  s = s.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = s.match(
    /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/
  );
  let body;
  if (match) {
    body = match[0]
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/[^A-Za-z0-9+/=]/g, "");
  } else {
    body = s.replace(/[^A-Za-z0-9+/=]/g, "");
  }
  const chunked = (body.match(/.{1,64}/g) || [body]).join("\n");
  return (
    "-----BEGIN PUBLIC KEY-----\n" +
    chunked +
    "\n-----END PUBLIC KEY-----\n"
  );
}

function buildJsonString(params) {
  if (typeof params === "string") return params;
  return JSON.stringify(params);
}

function rsaSignMd5HexMessageFromData(data, privateKey) {
  const md5HexLower = crypto
    .createHash("md5")
    .update(data, "utf8")
    .digest("hex")
    .toLowerCase();
  const sign = crypto.createSign("RSA-MD5");
  sign.update(md5HexLower, "utf8");
  const normalizedKey = normalizePemKey(privateKey);
  const rawSig = sign.sign(normalizedKey);
  return rawSig.toString("base64");
}

function rsaVerify(data, signature, publicKey) {
  try {
    const isHex32 = typeof data === "string" && /^[a-f0-9]{32}$/i.test(data);
    const msg = isHex32
      ? data.toLowerCase()
      : crypto
          .createHash("md5")
          .update(String(data), "utf8")
          .digest("hex")
          .toLowerCase();
    const verify = crypto.createVerify("RSA-MD5");
    verify.update(msg, "utf8");
    const normalizedKey = normalizePemPublicKey(publicKey);
    const sanitizedSig =
      typeof signature === "string"
        ? signature.replace(/\s+/g, "")
        : String(signature || "");
    return verify.verify(normalizedKey, sanitizedSig, "base64");
  } catch {
    return false;
  }
}

function rsaEncryptWithPublicKey(plaintext, publicKey) {
  const keyStr = normalizePemPublicKey(publicKey);
  const keyObj = crypto.createPublicKey(keyStr);
  const buf = Buffer.from(String(plaintext), "utf8");
  const chunkSize = 100;
  const parts = [];
  for (let i = 0; i < buf.length; i += chunkSize) {
    const chunk = buf.slice(i, i + chunkSize);
    const encChunk = crypto.publicEncrypt(
      { key: keyObj, padding: crypto.constants.RSA_PKCS1_PADDING },
      chunk
    );
    parts.push(encChunk);
  }
  const enc = Buffer.concat(parts);
  return enc.toString("base64");
}

function encryptFields(fields, publicKey) {
  const result = {};
  if (!fields || typeof fields !== "object") return result;
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = fields[k];
    if (typeof v === "string" && v.length > 0) {
      result[k] = rsaEncryptWithPublicKey(v, publicKey);
    }
  }
  return result;
}

module.exports = {
  normalizePemKey,
  normalizePemPublicKey,
  buildJsonString,
  rsaSignMd5HexMessageFromData,
  rsaVerify,
  rsaEncryptWithPublicKey,
  encryptFields,
};
