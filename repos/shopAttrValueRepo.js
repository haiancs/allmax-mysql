const { DataTypes, QueryTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopAttrValue = sequelize.define(
  "ShopAttrValue",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attrNameId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "attr_name",
    },
    skuId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "shop_sku",
    },
  },
  {
    tableName: "shop_attr_value",
    timestamps: true,
  }
);

async function createAttrValue(data, options = {}) {
  return ShopAttrValue.create(data, options);
}

async function updateAttrValueById(id, data, options = {}) {
  return ShopAttrValue.update(data, { where: { id }, ...options });
}

async function deleteAttrValueById(id, options = {}) {
  return ShopAttrValue.destroy({ where: { id }, ...options });
}

async function findAttrValueById(id, options = {}) {
  return ShopAttrValue.findByPk(id, options);
}

async function listAttrValues(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.attrNameId === "string" && filter.attrNameId.trim()) {
    where.attrNameId = filter.attrNameId.trim();
  }
  if (typeof filter.skuId === "string" && filter.skuId.trim()) {
    where.skuId = filter.skuId.trim();
  }
  return ShopAttrValue.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

async function listAttrValuesBySkuIds(skuIds, options = {}) {
  if (!Array.isArray(skuIds) || !skuIds.length) {
    return [];
  }
  const ids = skuIds.map((id) => String(id).trim()).filter(Boolean);
  if (!ids.length) {
    return [];
  }
  const rows = await sequelize.query(
    `SELECT
        m.\`leftRecordId\` AS \`skuId\`,
        av.\`_id\` AS \`attrValueId\`,
        av.\`value\` AS \`value\`
      FROM \`mid_4RKieAhGh\` m
      INNER JOIN \`shop_attr_value\` av ON av.\`_id\` = m.\`rightRecordId\`
      WHERE m.\`leftRecordId\` IN (:skuIds)
      ORDER BY m.\`leftRecordId\` ASC, av.\`_id\` ASC`,
    {
      replacements: { skuIds: ids },
      type: QueryTypes.SELECT,
      ...options,
    }
  );
  return rows || [];
}

module.exports = {
  ShopAttrValue,
  createAttrValue,
  updateAttrValueById,
  deleteAttrValueById,
  findAttrValueById,
  listAttrValues,
  listAttrValuesBySkuIds,
};
