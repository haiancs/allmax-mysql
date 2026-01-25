const { sequelize } = require("../../../db");
const { createShopOrderInTransaction } = require("../../../services/shopOrderService");
const { safeTrim, buildError, normalizeSkuItems } = require("../utils/orderValidation");

async function createOrder(body) {
  const reqBody = body && typeof body === "object" ? body : {};

  const userId = safeTrim(reqBody.userId);
  const clientOrderNo = safeTrim(reqBody.clientOrderNo);
  const items = Array.isArray(reqBody.orderItems) ? reqBody.orderItems : [];
  const isDistributor = reqBody.isDistributor === true;
  const deliveryInfoRaw = safeTrim(reqBody.addressId);

  if (!clientOrderNo) {
    return buildError(400, "clientOrderNo 必须存在");
  }

  if (clientOrderNo.length > 64) {
    return buildError(400, "clientOrderNo 长度不能超过 64");
  }

  if (!items.length) {
    return buildError(400, "items 必须是非空数组");
  }

  if (deliveryInfoRaw && deliveryInfoRaw.length > 64) {
    return buildError(400, "deliveryInfo 长度不能超过 64");
  }

  const normalized = normalizeSkuItems(items, {
    invalidSku: "items[].skuId 必须存在",
    invalidQuantity: "items[].count 必须为正整数",
    recordTooLong: "distribution_record_id 长度不能超过 64",
  });

  if (!normalized.ok) {
    return normalized;
  }

  const { mergedQuantityBySkuId, itemLines } = normalized;
  const nowMs = Date.now();
  const orderExpireTimeMs = nowMs + 30 * 60 * 1000;

  try {
    const result = await sequelize.transaction((transaction) =>
      createShopOrderInTransaction(
        {
          clientOrderNo,
          userId,
          deliveryInfoRaw,
          isDistributor,
          nowMs,
          orderExpireTimeMs,
          resolveItems: async () => ({
            mergedQuantityBySkuId,
            itemLines,
          }),
        },
        transaction
      )
    );

    return {
      ok: true,
      httpStatus: 200,
      body: {
        code: 0,
        data: result,
      },
    };
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : 500;
    return {
      ok: false,
      httpStatus: statusCode,
      body: {
        code: -1,
        message: error?.message || "下单失败",
        data: null,
      },
    };
  }
}

module.exports = {
  createOrder,
};
