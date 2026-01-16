function safeTrim(v) {
  return v != null ? String(v).trim() : "";
}

function safeNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatDateTimeCN(date) {
  const ms = date instanceof Date ? date.getTime() : Date.now();
  const cnMs = ms + 8 * 60 * 60 * 1000;
  const d = new Date(cnMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const seconds = String(d.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function ensureTimestamp14(v) {
  if (typeof v === "string") {
    const sv = v.trim();
    if (/^\d{14}$/.test(sv)) return sv;
    const d = new Date(sv);
    if (!Number.isNaN(d.getTime())) return formatDateTimeCN(d);
  } else if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return formatDateTimeCN(d);
  } else if (v instanceof Date) {
    if (!Number.isNaN(v.getTime())) return formatDateTimeCN(v);
  }
  return formatDateTimeCN(new Date());
}

function pickClientIp(req) {
  const xff = safeTrim(req?.headers?.["x-forwarded-for"]);
  if (xff) return xff.split(",")[0].trim();
  return safeTrim(req?.ip);
}

function tryParseJsonObject(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildRiskItemJson({
  userId,
  userPhone,
  userRegisterTime14,
  goodsName,
  clientIp,
}) {
  const frmsWareCategory = safeTrim(process.env.LLPAY_FRMS_WARE_CATEGORY) || "4005";
  const frmsClientChnl = safeTrim(process.env.LLPAY_FRMS_CLIENT_CHNL) || "16";
  const riskItem = {
    frms_ware_category: frmsWareCategory,
    user_info_mercht_userno: safeTrim(userId),
    user_info_dt_register: ensureTimestamp14(userRegisterTime14),
    user_info_bind_phone: safeTrim(userPhone),
    goods_name: safeTrim(goodsName),
    frms_client_chnl: frmsClientChnl,
  };
  const ip = safeTrim(clientIp);
  if (ip) riskItem.frms_ip_addr = ip;
  riskItem.user_auth_flag = "1";
  return JSON.stringify(riskItem);
}

function parseMsValue(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > 1e12 ? v : v * 1000;
  }
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? n : n * 1000;
  }
  const d = new Date(s);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function parseTimestamp14ToMs(ts14) {
  const s = safeTrim(ts14);
  if (!/^\d{14}$/.test(s)) return null;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6));
  const day = Number(s.slice(6, 8));
  const hour = Number(s.slice(8, 10));
  const minute = Number(s.slice(10, 12));
  const second = Number(s.slice(12, 14));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, second);
  return Number.isNaN(utcMs) ? null : utcMs;
}

// 计算支付参数的过期时间（毫秒）
// 优先级：expireTime > txnTime > updatedAt/createdAt
function resolvePayParamsExpireTimeMs({ expireTime, txnTime, updatedAt, createdAt, payExpireMin }) {
  // 1. 如果直接传了 expireTime，直接解析并返回
  const expireMs = parseMsValue(expireTime);
  if (expireMs != null) return expireMs;

  // 2. 如果传了交易时间 txnTime（14位字符串），则在其基础上加 payExpireMin 分钟
  const txnMs = parseTimestamp14ToMs(txnTime);
  if (txnMs != null) {
    const min = typeof payExpireMin === "number" && Number.isFinite(payExpireMin) ? payExpireMin : null;
    if (min != null && min > 0) return txnMs + min * 60 * 1000;
    return null;
  }

  // 3. 否则用 updatedAt 或 createdAt 作为基准时间，加 payExpireMin 分钟
  const baseMs = parseMsValue(updatedAt) ?? parseMsValue(createdAt);
  if (baseMs == null) return null;
  const min = typeof payExpireMin === "number" && Number.isFinite(payExpireMin) ? payExpireMin : null;
  if (min == null || !(min > 0)) return null;
  return baseMs + min * 60 * 1000;
}

// 根据连连支付返回结果，映射为 HTTP 状态码
function getLLPayHttpStatus(result) {
  const errCode = result.code || null;
  const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
  if (errCode === "INVALID_PATH") {
    return 400; // 错误路径，客户端错误
  } else if (errCode === "MISSING_MCH_ID" || errCode === "MISSING_PRIVATE_KEY") {
    return 500; // 商户号或私钥缺失，服务端错误
  } else if (statusCode >= 400 && statusCode <= 599) {
    return statusCode; // 保留原始 4xx/5xx
  }
  return 502; // 默认网关错误
}

function resolvePayParamsExpireTimeMs({ expireTime, txnTime, updatedAt, createdAt, payExpireMin }) {
  const expireMs = parseMsValue(expireTime);
  if (expireMs != null) return expireMs;

  const txnMs = parseTimestamp14ToMs(txnTime);
  if (txnMs != null) {
    const min = typeof payExpireMin === "number" && Number.isFinite(payExpireMin) ? payExpireMin : null;
    if (min != null && min > 0) return txnMs + min * 60 * 1000;
    return null;
  }

  const baseMs = parseMsValue(updatedAt) ?? parseMsValue(createdAt);
  if (baseMs == null) return null;
  const min = typeof payExpireMin === "number" && Number.isFinite(payExpireMin) ? payExpireMin : null;
  if (min == null || !(min > 0)) return null;
  return baseMs + min * 60 * 1000;
}

function getLLPayHttpStatus(result) {
  const errCode = result.code || null;
  const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
  if (errCode === "INVALID_PATH") {
    return 400;
  } else if (errCode === "MISSING_MCH_ID" || errCode === "MISSING_PRIVATE_KEY") {
    return 500;
  } else if (statusCode >= 400 && statusCode <= 599) {
    return statusCode;
  }
  return 502;
}

module.exports = {
  safeTrim,
  safeNumber,
  formatDateTimeCN,
  ensureTimestamp14,
  pickClientIp,
  tryParseJsonObject,
  buildRiskItemJson,
  parseMsValue,
  parseTimestamp14ToMs,
  resolvePayParamsExpireTimeMs,
  getLLPayHttpStatus,
};
