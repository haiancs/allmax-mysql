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
  parseRate01,
  envRate01,
  envFen,
  envTruthy,
};

