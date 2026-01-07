const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");
const {
  createShopOrderInTransaction,
  createHttpError,
} = require("../services/shopOrderService");

const router = express.Router();

function normalizeSkuItems(rawItems, fail, messages = {}) {
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
    const skuId =
      typeof item.skuId === "string"
        ? item.skuId.trim()
          : "";
    const quantity = Number(item.count);
    const recordId =
      typeof item.distributionRecordId === "string"
        ? item.distributionRecordId.trim()
          : "";

    if (!skuId) {
      fail(400, invalidSkuMessage || "items[].skuId 必须存在");
      return null;
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isInteger(quantity)
    ) {
      fail(400, invalidQuantityMessage || "items[].count 必须为正整数");
      return null;
    }

    const prevQty = mergedQuantityBySkuId.get(skuId) || 0;
    mergedQuantityBySkuId.set(skuId, prevQty + quantity);

    if (recordId) {
      if (recordId.length > 64) {
        fail(400, recordTooLongMessage || "distribution_record_id 长度不能超过 64");
        return null;
      }
    }

    itemLines.push({
      skuId,
      quantity,
      distributionRecordId: recordId || null,
    });
  }

  return {
    mergedQuantityBySkuId,
    itemLines
  };
}

router.post("/orders", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const userId =
    typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : "";
  const clientOrderNo =
      typeof body.clientOrderNo === "string"
        ? body.clientOrderNo.trim()
          : "";

  const items = body.items || [];

  const deliveryInfoRaw =
    typeof body.addressId === "string"
      ? body.addressId.trim()
        : "";

  if (!clientOrderNo) {
    return res.status(400).send({
      code: -1,
      message: "clientOrderNo 必须存在",
      data: null,
    });
  }

  if (clientOrderNo.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "clientOrderNo 长度不能超过 64",
      data: null,
    });
  }

  if (!items.length) {
    return res.status(400).send({
      code: -1,
      message: "items 必须是非空数组",
      data: null,
    });
  }

  if (deliveryInfoRaw && deliveryInfoRaw.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "deliveryInfo 长度不能超过 64",
      data: null,
    });
  }

  const normalized = normalizeSkuItems(
    items,
    (statusCode, message) =>
      res.status(statusCode).send({
        code: -1,
        message,
        data: null,
      }),
    {
      invalidSku: "items[].skuId 必须存在",
      invalidQuantity: "items[].count 必须为正整数",
      recordTooLong: "distribution_record_id 长度不能超过 64",
    }
  );
  if (!normalized) {
    return;
  }

  const { mergedQuantityBySkuId, itemLines } =
    normalized;

  const nowMs = Date.now();
  const orderExpireTimeMs = nowMs + 30 * 60 * 1000;

  try {
    const result = await sequelize.transaction((transaction) =>
      createShopOrderInTransaction(
        {
          clientOrderNo,
          userId,
          deliveryInfoRaw,
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

    res.send({
      code: 0,
      data: result,
    });
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : 500;
    res.status(statusCode).send({
      code: -1,
      message: error?.message || "下单失败",
      data: null,
    });
  }
});

router.post("/cart/submit", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const clientOrderNo =
    typeof body.client_order_no === "string"
      ? body.client_order_no.trim()
      : typeof body.clientOrderNo === "string"
        ? body.clientOrderNo.trim()
        : "";

  const userId =
    typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
        : "";

  const paymentTypeRaw =
    typeof body.paymentType === "string"
      ? body.paymentType.trim()
      : typeof body.payment_type === "string"
        ? body.payment_type.trim()
        : "";

  const deliveryInfoRaw =
    typeof body.addressId === "string"
      ? body.addressId.trim()
        : "";

  const cartItemIdsRaw = Array.isArray(body.cart_item_ids)
    ? body.cart_item_ids
    : Array.isArray(body.cartItemIds)
      ? body.cartItemIds
      : [];

  const cartItemIds = [];
  for (const rawId of cartItemIdsRaw) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (id) {
      cartItemIds.push(id);
    }
  }

  if (!clientOrderNo) {
    return res.status(400).send({
      code: -1,
      message: "clientOrderNo 必须存在",
      data: null,
    });
  }

  if (clientOrderNo.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "clientOrderNo 长度不能超过 64",
      data: null,
    });
  }

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "userId 必须存在",
      data: null,
    });
  }

  if (paymentTypeRaw && paymentTypeRaw.length > 256) {
    return res.status(400).send({
      code: -1,
      message: "paymentType 长度不能超过 256",
      data: null,
    });
  }

  if (deliveryInfoRaw && deliveryInfoRaw.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "delivery_info 长度不能超过 64",
      data: null,
    });
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
          paymentTypeRaw,
          deliveryInfoRaw,
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
              (statusCode, message) => {
                throw createHttpError(statusCode, message);
              },
              {
                invalidSku: "购物车存在无效的 sku",
                invalidQuantity: "购物车商品数量必须为正整数",
                recordTooLong: "购物车分销记录长度不能超过 64",
              }
            );
            if (!normalized) {
              throw createHttpError(500, "购物车商品归一化失败");
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

    res.send({
      code: 0,
      data: {
        ...result,
        cart: {
          deletedItemIds: result.isIdempotentHit ? [] : deletedCartItemIds,
        },
      },
    });
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : 500;
    res.status(statusCode).send({
      code: -1,
      message: error?.message || "提交购物车订单失败",
      data: null,
    });
  }
});

module.exports = router;
