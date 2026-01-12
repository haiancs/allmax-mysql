const crypto = require("crypto");
const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");

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

    if (existingRows.length) {
      const row = existingRows[0];
      itemId = String(row._id);
      const prevCount = Number(row.count || 0);
      newCount = prevCount + addCount;

      await sequelize.query(
        "UPDATE `shop_cart_item` SET `count` = ?, `updatedAt` = ? WHERE `_id` = ?",
        {
          replacements: [newCount, nowMs, itemId],
        }
      );
    } else {
      itemId = generateId();
      newCount = addCount;
      created = true;

      await sequelize.query(
        "INSERT INTO `shop_cart_item` (`_id`, `user`, `sku`, `count`, `distribution_record`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?)",
        {
          replacements: [
            itemId,
            userId,
            skuId,
            newCount,
            distributionRecordId,
            nowMs,
            nowMs,
          ],
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

module.exports = router;

