const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopAttrName = sequelize.define(
  "ShopAttrName",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    name: {
      type: DataTypes.STRING(256),
      allowNull: true,
    },
  },
  {
    tableName: "shop_attr_name",
    timestamps: true,
  }
);

async function createAttrName(data, options = {}) {
  return ShopAttrName.create(data, options);
}

async function updateAttrNameById(id, data, options = {}) {
  return ShopAttrName.update(data, { where: { id }, ...options });
}

async function deleteAttrNameById(id, options = {}) {
  return ShopAttrName.destroy({ where: { id }, ...options });
}

async function findAttrNameById(id, options = {}) {
  return ShopAttrName.findByPk(id, options);
}

async function listAttrNames(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.name === "string" && filter.name.trim()) {
    where.name = filter.name.trim();
  }
  return ShopAttrName.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopAttrName,
  createAttrName,
  updateAttrNameById,
  deleteAttrNameById,
  findAttrNameById,
  listAttrNames,
};
