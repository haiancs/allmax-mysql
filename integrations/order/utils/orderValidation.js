function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildError(httpStatus, message) {
  return {
    ok: false,
    httpStatus,
    body: { code: -1, message, data: null },
  };
}

function normalizeSkuItems(rawItems, messages = {}) {
  const invalidSkuMessage =
    typeof messages.invalidSku === "string" ? messages.invalidSku : "";
  const invalidQuantityMessage =
    typeof messages.invalidQuantity === "string" ? messages.invalidQuantity : "";
  const recordTooLongMessage =
    typeof messages.recordTooLong === "string" ? messages.recordTooLong : "";

  const mergedQuantityBySkuId = new Map();
  const itemLines = [];

  for (const rawItem of rawItems) {
    const item = rawItem && typeof rawItem === "object" ? rawItem : {};
    const skuId = safeTrim(item.skuId);
    const quantity = Number(item.count);
    const recordId = safeTrim(item.distributionRecordId);

    if (!skuId) {
      return buildError(400, invalidSkuMessage || "items[].skuId 必须存在");
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      return buildError(
        400,
        invalidQuantityMessage || "items[].count 必须为正整数"
      );
    }

    const prevQty = mergedQuantityBySkuId.get(skuId) || 0;
    mergedQuantityBySkuId.set(skuId, prevQty + quantity);

    if (recordId && recordId.length > 64) {
      return buildError(
        400,
        recordTooLongMessage || "distribution_record_id 长度不能超过 64"
      );
    }

    itemLines.push({
      skuId,
      quantity,
      distributionRecordId: recordId || null,
    });
  }

  return { ok: true, mergedQuantityBySkuId, itemLines };
}

module.exports = {
  safeTrim,
  buildError,
  normalizeSkuItems,
};
