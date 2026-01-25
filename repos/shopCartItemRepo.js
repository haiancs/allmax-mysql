const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopCartItem = sequelize.define(
  "ShopCartItem",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    userId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "user",
    },
    skuId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "sku",
    },
    count: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    distributionRecordId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "distribution_record",
    },
    distributionPrice: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "distributionPrice",
    },
  },
  {
    tableName: "shop_cart_item",
    timestamps: true,
  }
);

async function createCartItem(data, options = {}) {
  return ShopCartItem.create(data, options);
}

async function updateCartItemById(id, data, options = {}) {
  return ShopCartItem.update(data, { where: { id }, ...options });
}

async function deleteCartItemById(id, options = {}) {
  return ShopCartItem.destroy({ where: { id }, ...options });
}

async function deleteCartItemsByUserId(userId, options = {}) {
  return ShopCartItem.destroy({ where: { userId }, ...options });
}

async function findCartItemById(id, options = {}) {
  return ShopCartItem.findByPk(id, options);
}

async function listCartItems(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }
  if (typeof filter.skuId === "string" && filter.skuId.trim()) {
    where.skuId = filter.skuId.trim();
  }
  return ShopCartItem.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["createdAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopCartItem,
  createCartItem,
  updateCartItemById,
  deleteCartItemById,
  deleteCartItemsByUserId,
  findCartItemById,
  listCartItems,
};
