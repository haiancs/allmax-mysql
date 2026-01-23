function safeTrim(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function getLLPayConfig(overrides = {}) {
  const mchId = safeTrim(overrides.mchId ?? process.env.LLPAY_PARTNER_ID);
  const privateKey = safeTrim(overrides.privateKey ?? process.env.LLPAY_PRIVATE_KEY);
  const baseUrl = safeTrim(
    overrides.baseUrl ??
      process.env.LLPAY_OPENAPI_BASE_URL ??
      "https://openapi.lianlianpay.com/mch"
  );
  return { mchId, privateKey, baseUrl };
}

module.exports = {
  getLLPayConfig,
};

