const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");

const router = express.Router();

async function handleGetAllSkuWithAttrValues(req, res) {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const spuIdRaw =
    typeof req?.body?.spuId === "string"
      ? req.body.spuId
      : typeof req?.query?.spuId === "string"
        ? req.query.spuId
        : "";
  const spuId = spuIdRaw.trim();

  if (!spuId) {
    return res.status(400).send({
      code: -1,
      message: "spuId 必须存在",
      data: null,
    });
  }

  if (spuId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "spuId 长度不能超过 64",
      data: null,
    });
  }

  try {
    const skuRows = await sequelize.query(
      "SELECT `_id`, COALESCE(`stock`, 0) AS `stock`, `price`, `wholesale_price` AS `wholesale_price`, `image` FROM `shop_sku` WHERE `spu` = :spuId ORDER BY `_id` ASC",
      {
        replacements: { spuId },
        type: QueryTypes.SELECT,
      }
    );

    const skuIds = skuRows.map((r) => String(r._id)).filter(Boolean);
    if (!skuIds.length) {
      return res.send({ code: 0, data: [] });
    }

    const attrRows = await sequelize.query(
      `SELECT
        m.\`leftRecordId\` AS \`skuId\`,
        av.\`_id\` AS \`attrValueId\`,
        av.\`value\` AS \`value\`,
        an.\`_id\` AS \`attrNameId\`,
        an.\`name\` AS \`attrName\`
      FROM \`mid_4RKieAhGh\` m
      INNER JOIN \`shop_attr_value\` av ON av.\`_id\` = m.\`rightRecordId\`
      LEFT JOIN \`shop_attr_name\` an ON an.\`_id\` = av.\`attr_name\`
      WHERE m.\`leftRecordId\` IN (:skuIds)
      ORDER BY m.\`leftRecordId\` ASC, an.\`name\` ASC, av.\`_id\` ASC`,
      {
        replacements: { skuIds },
        type: QueryTypes.SELECT,
      }
    );

    const attrValuesBySkuId = new Map();
    for (const row of attrRows) {
      const skuId = row?.skuId != null ? String(row.skuId) : "";
      const attrValueId = row?.attrValueId != null ? String(row.attrValueId) : "";
      if (!skuId || !attrValueId) continue;

      const value = row?.value != null ? row.value : null;
      const attrNameId = row?.attrNameId != null ? String(row.attrNameId) : "";
      const attrName = row?.attrName != null ? String(row.attrName) : "";

      const list = attrValuesBySkuId.get(skuId) || [];
      list.push({
        _id: attrValueId,
        value,
        attr_name: attrNameId
          ? {
              _id: attrNameId,
              name: attrName,
            }
          : null,
      });
      attrValuesBySkuId.set(skuId, list);
    }

    const data = skuRows.map((sku) => {
      const skuId = String(sku._id);
      return {
        _id: skuId,
        stock: Number(sku.stock || 0),
        price: sku.price != null ? Number(sku.price) : null,
        wholesale_price:
          sku.wholesale_price != null ? Number(sku.wholesale_price) : null,
        image: sku.image != null ? String(sku.image) : null,
        attr_value: attrValuesBySkuId.get(skuId) || [],
      };
    });

    res.send({ code: 0, data });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: error?.message || "查询失败",
      data: null,
    });
  }
}

router.post("/getAllSkuWithAttrValues", handleGetAllSkuWithAttrValues);
router.get("/getAllSkuWithAttrValues", handleGetAllSkuWithAttrValues);

module.exports = router;

