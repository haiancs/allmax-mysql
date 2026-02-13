function safeTrim(v) {
  return v != null ? String(v).trim() : "";
}
// 尝试将字符串转换为整数，失败返回 null
function coerceIntOrNull(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function toFenFromYuanOrFen(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n)) return n;
  return Math.round(n * 100);
}

const VAT_INCLUSIVE_FACTOR_NUM = 1091;
const VAT_INCLUSIVE_FACTOR_DEN = 1000;

function splitVatInclusiveFen(grossFen) {
  const gross = Math.max(0, coerceIntOrNull(grossFen) || 0);
  let net = Math.round((gross * VAT_INCLUSIVE_FACTOR_DEN) / VAT_INCLUSIVE_FACTOR_NUM);
  if (net < 0) net = 0;
  if (net > gross) net = gross;
  const vat = gross - net;
  return { netFen: net, vatFen: vat };
}

function splitVatInclusiveYuan(grossAmount) {
  const gross = Number(grossAmount);
  if (!Number.isFinite(gross) || gross < 0) {
    return { net: null, vat: null };
  }
  const grossFen = Math.max(0, Math.round(gross * 100));
  let netFen = Math.round((grossFen * VAT_INCLUSIVE_FACTOR_DEN) / VAT_INCLUSIVE_FACTOR_NUM);
  if (netFen < 0) netFen = 0;
  if (netFen > grossFen) netFen = grossFen;
  const vatFen = grossFen - netFen;
  return { net: netFen / 100, vat: vatFen / 100 };
}

function parseRate01(v, fallback) {
  const s = safeTrim(v);
  if (!s) return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return 1;
  if (n < 0) return 0;
  return n;
}

function envRate01(name, fallback) {
  return parseRate01(process.env[name], fallback);
}

function envFen(name, fallbackFen) {
  const raw = process.env[name];
  const fen = toFenFromYuanOrFen(raw);
  return fen != null ? fen : fallbackFen;
}

function envTruthy(name) {
  const s = safeTrim(process.env[name]).toLowerCase();
  return s === "1" || s === "true";
}

module.exports = {
  safeTrim,
  coerceIntOrNull,
  toFenFromYuanOrFen,
  splitVatInclusiveFen,
  splitVatInclusiveYuan,
  parseRate01,
  envRate01,
  envFen,
  envTruthy,
};
