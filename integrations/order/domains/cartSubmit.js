const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../db");
const {
  createShopOrderInTransaction,
  createHttpError,
} = require("../../../services/shopOrderService");
const { safeTrim, buildError, normalizeSkuItems } = require("../utils/orderValidation");

async function cartSubmit(body) {
  const reqBody = body && typeof body === "object" ? body : {};
  const clientOrderNo = safeTrim(reqBody.clientOrderNo);
  const userId = safeTrim(reqBody.userId);
  const deliveryInfoRaw = safeTrim(reqBody.addressId);
  const isDistributor = reqBody.isDistributor === true;

  const cartItemIdsRaw = Array.isArray(reqBody.cart_item_ids)
    ? reqBody.cart_item_ids
    : Array.isArray(reqBody.cartItemIds)
      ? reqBody.cartItemIds
      : [];

  const cartItemIds = [];
  for (const rawId of cartItemIdsRaw) {
    const id = safeTrim(rawId);
    if (id) {
      cartItemIds.push(id);
    }
  }

  if (!clientOrderNo) {
    return buildError(400, "clientOrderNo 必须存在");
  }

  if (clientOrderNo.length > 64) {
    return buildError(400, "clientOrderNo 长度不能超过 64");
  }

  if (!userId) {
    return buildError(400, "userId 必须存在");
  }

  if (deliveryInfoRaw && deliveryInfoRaw.length > 64) {
    return buildError(400, "delivery_info 长度不能超过 64");
  }

  const nowMs = Date.now();
  const orderExpireTimeMs = nowMs + 30 * 60 * 1000;

  try {
    let deletedCartItemIds = [];

    const result = await sequelize.transaction((transaction) =>
      createShopOrderInTransaction(
        {
          clientOrderNo,
          userId,
          deliveryInfoRaw,
          isDistributor,
          nowMs,
          orderExpireTimeMs,
          resolveItems: async () => {
            const whereParts = ["`user` = :userId"];
            const replacements = { userId };
            if (cartItemIds.length) {
              whereParts.push("`_id` IN (:cartItemIds)");
              replacements.cartItemIds = cartItemIds;
            }

            const rows = await sequelize.query(
              `SELECT \`_id\`, \`sku\`, \`count\`, \`distribution_record\` FROM \`shop_cart_item\` WHERE ${whereParts.join(
                " AND "
              )} FOR UPDATE`,
              {
                replacements,
                type: QueryTypes.SELECT,
                transaction,
              }
            );

            if (!rows.length) {
              throw createHttpError(400, "购物车为空或选中的购物车项不存在");
            }

            deletedCartItemIds = rows.map((r) => String(r._id));

            const normalized = normalizeSkuItems(
              rows.map((r) => ({
                skuId: r.sku,
                count: r.count,
                distributionRecordId: r.distribution_record,
              })),
              {
                invalidSku: "购物车存在无效的 sku",
                invalidQuantity: "购物车商品数量必须为正整数",
                recordTooLong: "购物车分销记录长度不能超过 64",
              }
            );

            if (!normalized.ok) {
              throw createHttpError(
                normalized.httpStatus || 400,
                normalized.body?.message || "购物车商品归一化失败"
              );
            }

            return {
              mergedQuantityBySkuId: normalized.mergedQuantityBySkuId,
              itemLines: normalized.itemLines,
            };
          },
          afterOrderCreated: async (_, transaction) => {
            if (!deletedCartItemIds.length) {
              return;
            }

            await sequelize.query(
              "DELETE FROM `shop_cart_item` WHERE `_id` IN (:ids) AND `user` = :userId",
              {
                replacements: {
                  ids: deletedCartItemIds,
                  userId,
                },
                transaction,
              }
            );
          },
        },
        transaction
      )
    );

    return {
      ok: true,
      httpStatus: 200,
      body: {
        code: 0,
        data: {
          ...result,
          cart: {
            deletedItemIds: result.isIdempotentHit ? [] : deletedCartItemIds,
          },
        },
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
        message: error?.message || "提交购物车订单失败",
        data: null,
      },
    };
  }
}

module.exports = {
  cartSubmit,
};
