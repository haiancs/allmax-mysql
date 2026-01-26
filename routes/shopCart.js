const crypto = require("crypto");
const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");
const {
  resolveCartItemDistributionPriceColumn,
} = require("../repos/shopCartItemRepo");

const router = express.Router();

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

router.post("/cart/add", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const userId =
    typeof body.user === "string" && body.user.trim() ? body.user.trim() : "";
  const skuId =
    typeof body.skuId === "string" && body.skuId.trim()
      ? body.skuId.trim()
      : "";
  const addCountRaw = body.addCount;
  const distributionRecordIdRaw =
    typeof body.distributionRecordId === "string"
      ? body.distributionRecordId.trim()
      : "";

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "user 必须存在",
      data: null,
    });
  }

  if (userId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "user 长度不能超过 64",
      data: null,
    });
  }

  if (!skuId) {
    return res.status(400).send({
      code: -1,
      message: "skuId 必须存在",
      data: null,
    });
  }

  if (skuId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "skuId 长度不能超过 64",
      data: null,
    });
  }

  const addCount = Number(addCountRaw);
  if (
    !Number.isFinite(addCount) ||
    addCount <= 0 ||
    !Number.isInteger(addCount)
  ) {
    return res.status(400).send({
      code: -1,
      message: "addCount 必须为正整数",
      data: null,
    });
  }

  const distributionRecordId = distributionRecordIdRaw || null;

  if (distributionRecordId && distributionRecordId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "distributionRecordId 长度不能超过 64",
      data: null,
    });
  }

  const nowMs = Date.now();

  try {
    const skuRows = await sequelize.query(
      "SELECT `_id`, COALESCE(`stock`, 0) AS `stock` FROM `shop_sku` WHERE `_id` = ? LIMIT 1",
      {
        replacements: [skuId],
        type: QueryTypes.SELECT,
      }
    );

    const sku = skuRows[0] || null;
    if (!sku) {
      return res.status(400).send({
        code: -1,
        message: "SKU 不存在",
        data: null,
      });
    }

    const stock = Number(sku.stock || 0);
    if (!Number.isFinite(stock) || stock <= 0) {
      return res.status(400).send({
        code: -1,
        message: "库存不足或已售罄",
        data: null,
      });
    }

    let distributionPrice = null;
    if (distributionRecordId) {
      const distributionRows = await sequelize.query(
        "SELECT `_id`, `sku`, `share_price` FROM `shop_distribution_record` WHERE `_id` = ? LIMIT 1",
        {
          replacements: [distributionRecordId],
          type: QueryTypes.SELECT,
        }
      );

      const record = distributionRows[0] || null;
      const recordSkuId =
        record && record.sku != null ? String(record.sku).trim() : "";

      if (!record || !recordSkuId || recordSkuId !== skuId) {
        return res.status(400).send({
          code: -1,
          message: "分销记录不存在或与 SKU 不匹配",
          data: null,
        });
      }

      const sharePrice = Number(record.share_price);
      if (!Number.isFinite(sharePrice) || sharePrice < 0) {
        return res.status(400).send({
          code: -1,
          message: "分销价无效",
          data: null,
        });
      }
      distributionPrice = sharePrice;
    }

    const whereParts = ["`user` = :userId", "`sku` = :skuId"];
    const replacements = { userId, skuId };

    if (distributionRecordId) {
      whereParts.push("`distribution_record` = :distributionRecordId");
      replacements.distributionRecordId = distributionRecordId;
    } else {
      whereParts.push("`distribution_record` IS NULL");
    }

    const existingRows = await sequelize.query(
      `SELECT \`_id\`, \`count\` FROM \`shop_cart_item\` WHERE ${whereParts.join(
        " AND "
      )} LIMIT 1`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );

    let itemId;
    let newCount;
    let created = false;

    const cartDistributionPriceColumn = await resolveCartItemDistributionPriceColumn();
    if (existingRows.length) {
      const row = existingRows[0];
      itemId = String(row._id);
      const prevCount = Number(row.count || 0);
      newCount = prevCount + addCount;

      const updateColumns = ["`count` = ?", "`updatedAt` = ?"];
      const updateReplacements = [newCount, nowMs];
      if (cartDistributionPriceColumn) {
        updateColumns.push(`\`${cartDistributionPriceColumn}\` = ?`);
        updateReplacements.push(distributionPrice);
      }
      updateReplacements.push(itemId);

      await sequelize.query(
        `UPDATE \`shop_cart_item\` SET ${updateColumns.join(", ")} WHERE \`_id\` = ?`,
        {
          replacements: updateReplacements,
        }
      );
    } else {
      itemId = generateId();
      newCount = addCount;
      created = true;

      const cartItemColumns = [
        "`_id`",
        "`user`",
        "`sku`",
        "`count`",
        "`distribution_record`",
      ];
      if (cartDistributionPriceColumn) {
        cartItemColumns.push(`\`${cartDistributionPriceColumn}\``);
      }
      cartItemColumns.push("`createdAt`", "`updatedAt`");
      const placeholders = cartItemColumns.map(() => "?").join(", ");
      const insertReplacements = [
        itemId,
        userId,
        skuId,
        newCount,
        distributionRecordId,
        ...(cartDistributionPriceColumn ? [distributionPrice] : []),
        nowMs,
        nowMs,
      ];

      await sequelize.query(
        `INSERT INTO \`shop_cart_item\` (${cartItemColumns.join(
          ", "
        )}) VALUES (${placeholders})`,
        {
          replacements: insertReplacements,
        }
      );
    }

    return res.send({
      code: 0,
      data: {
        item: {
          id: itemId,
          user: userId,
          skuId,
          count: newCount,
          distributionRecordId,
          distributionPrice,
        },
        op: created ? "created" : "updated",
      },
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "加入购物车失败",
      data: null,
    });
  }
});

router.get("/cart", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const userRaw =
    typeof req?.query?.user === "string"
      ? req.query.user
      : typeof req?.query?.userId === "string"
        ? req.query.userId
        : "";
  const userId = userRaw.trim();

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "user 必须存在",
      data: null,
    });
  }

  if (userId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "user 长度不能超过 64",
      data: null,
    });
  }

  try {
    const cartDistributionPriceColumn = await resolveCartItemDistributionPriceColumn();
    const sharePriceSelect = cartDistributionPriceColumn
      ? `COALESCE(c.\`${cartDistributionPriceColumn}\`, dr.\`share_price\`) AS \`sharePrice\`,
        c.\`${cartDistributionPriceColumn}\` AS \`distributionPrice\``
      : "dr.`share_price` AS `sharePrice`";
    const rows = await sequelize.query(
      `SELECT
        c.\`_id\` AS \`cartItemId\`,
        c.\`user\` AS \`user\`,
        c.\`sku\` AS \`skuId\`,
        c.\`count\` AS \`count\`,
        c.\`distribution_record\` AS \`distributionRecordId\`,
        c.\`createdAt\` AS \`createdAt\`,
        c.\`updatedAt\` AS \`updatedAt\`,
        s.\`price\` AS \`price\`,
        s.\`wholesale_price\` AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        sp.\`name\` AS \`spuName\`,
        ${sharePriceSelect}
      FROM \`shop_cart_item\` c
      INNER JOIN \`shop_sku\` s ON s.\`_id\` = c.\`sku\`
      LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
      LEFT JOIN \`shop_distribution_record\` dr ON dr.\`_id\` = c.\`distribution_record\`
      WHERE c.\`user\` = :userId
      ORDER BY c.\`createdAt\` DESC, c.\`_id\` DESC`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      }
    );

    const items = (rows || []).map((row) => {
      const skuId =
        row?.skuId != null && String(row.skuId).trim()
          ? String(row.skuId).trim()
          : "";
      const rawPrice =
        row?.price != null && row.price !== "" ? Number(row.price) : null;
      const sharePrice =
        row?.sharePrice != null && row.sharePrice !== ""
          ? Number(row.sharePrice)
          : null;
      const distributionPrice =
        row?.distributionPrice != null && row.distributionPrice !== ""
          ? Number(row.distributionPrice)
          : null;
      return {
        _id: row?.cartItemId != null ? String(row.cartItemId) : "",
        user: row?.user != null ? String(row.user) : null,
        skuId,
        count: Number(row?.count || 0),
        distributionRecordId:
          row?.distributionRecordId != null
            ? String(row.distributionRecordId).trim() || null
            : null,
        createdAt: row?.createdAt != null ? row.createdAt : null,
        updatedAt: row?.updatedAt != null ? row.updatedAt : null,
        distributionPrice,
        sku: skuId
          ? {
              _id: skuId,
              image: row?.image != null ? String(row.image) : null,
              price: rawPrice,
              wholesale_price:
                row?.wholesalePrice != null ? Number(row.wholesalePrice) : null,
              share_price: sharePrice,
              spu:
                row?.spuId != null
                  ? {
                      _id: String(row.spuId),
                      name: row?.spuName != null ? String(row.spuName) : null,
                    }
                  : null,
            }
          : null,
      };
    });

    return res.send({
      code: 0,
      data: items,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "查询购物车失败",
      data: null,
    });
  }
});

router.post("/cart/update-count", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const idRaw =
    typeof body.id === "string"
      ? body.id
      : typeof body.cartItemId === "string"
        ? body.cartItemId
        : "";
  const id = idRaw.trim();

  const userRaw =
    typeof body.user === "string"
      ? body.user
      : typeof body.userId === "string"
        ? body.userId
        : "";
  const userId = userRaw.trim();

  const countRaw = body.count;

  if (!id) {
    return res.status(400).send({
      code: -1,
      message: "id 必须存在",
      data: null,
    });
  }

  if (id.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "id 长度不能超过 64",
      data: null,
    });
  }

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "user 必须存在",
      data: null,
    });
  }

  if (userId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "user 长度不能超过 64",
      data: null,
    });
  }

  const count = Number(countRaw);
  if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) {
    return res.status(400).send({
      code: -1,
      message: "count 必须为正整数",
      data: null,
    });
  }

  const nowMs = Date.now();

  try {
    const [_, metadata] = await sequelize.query(
      "UPDATE `shop_cart_item` SET `count` = ?, `updatedAt` = ? WHERE `_id` = ? AND `user` = ?",
      {
        replacements: [count, nowMs, id, userId],
      }
    );

    const affectedRows =
      metadata && typeof metadata.affectedRows === "number"
        ? metadata.affectedRows
        : 0;

    if (!affectedRows) {
      return res.status(400).send({
        code: -1,
        message: "购物车项不存在",
        data: null,
      });
    }

    const rows = await sequelize.query(
      "SELECT `_id`, `user`, `sku`, `count`, `distribution_record` FROM `shop_cart_item` WHERE `_id` = ? AND `user` = ? LIMIT 1",
      {
        replacements: [id, userId],
        type: QueryTypes.SELECT,
      }
    );

    const row = rows[0] || null;
    if (!row) {
      return res.status(400).send({
        code: -1,
        message: "购物车项不存在",
        data: null,
      });
    }

    return res.send({
      code: 0,
      data: {
        item: {
          id: String(row._id),
          user: row.user != null ? String(row.user) : null,
          skuId: row.sku != null ? String(row.sku) : null,
          count: Number(row.count || 0),
          distributionRecordId:
            row.distribution_record != null
              ? String(row.distribution_record).trim() || null
              : null,
        },
        op: "updated",
      },
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "更新购物车失败",
      data: null,
    });
  }
});

router.post("/cart/delete", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const idRaw =
    typeof body.id === "string"
      ? body.id
      : typeof body.cartItemId === "string"
        ? body.cartItemId
        : "";
  const id = idRaw.trim();

  const userRaw =
    typeof body.user === "string"
      ? body.user
      : typeof body.userId === "string"
        ? body.userId
        : "";
  const userId = userRaw.trim();

  if (!id) {
    return res.status(400).send({
      code: -1,
      message: "id 必须存在",
      data: null,
    });
  }

  if (id.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "id 长度不能超过 64",
      data: null,
    });
  }

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "user 必须存在",
      data: null,
    });
  }

  if (userId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "user 长度不能超过 64",
      data: null,
    });
  }

  try {
    const [_, metadata] = await sequelize.query(
      "DELETE FROM `shop_cart_item` WHERE `_id` = ? AND `user` = ?",
      {
        replacements: [id, userId],
      }
    );

    const affectedRows =
      metadata && typeof metadata.affectedRows === "number"
        ? metadata.affectedRows
        : 0;

    if (!affectedRows) {
      return res.status(400).send({
        code: -1,
        message: "购物车项不存在",
        data: null,
      });
    }

    return res.send({
      code: 0,
      data: {
        id,
        user: userId,
        deleted: true,
      },
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "删除购物车失败",
      data: null,
    });
  }
});

router.post("/cart/clear", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};

  const userRaw =
    typeof body.user === "string"
      ? body.user
      : typeof body.userId === "string"
        ? body.userId
        : "";
  const userId = userRaw.trim();

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "user 必须存在",
      data: null,
    });
  }

  if (userId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "user 长度不能超过 64",
      data: null,
    });
  }

  try {
    const [_, metadata] = await sequelize.query(
      "DELETE FROM `shop_cart_item` WHERE `user` = ?",
      {
        replacements: [userId],
      }
    );

    const affectedRows =
      metadata && typeof metadata.affectedRows === "number"
        ? metadata.affectedRows
        : 0;

    return res.send({
      code: 0,
      data: {
        user: userId,
        deletedCount: affectedRows,
      },
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "清空购物车失败",
      data: null,
    });
  }
});

module.exports = router;
