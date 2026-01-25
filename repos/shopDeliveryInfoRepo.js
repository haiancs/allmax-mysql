const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopDeliveryInfo = sequelize.define(
  "ShopDeliveryInfo",
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
    name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    idCard: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "idCard",
    },
  },
  {
    tableName: "shop_delivery_info",
    timestamps: true,
  }
);

async function createDeliveryInfo(data, options = {}) {
  return ShopDeliveryInfo.create(data, options);
}

async function updateDeliveryInfoById(id, data, options = {}) {
  return ShopDeliveryInfo.update(data, { where: { id }, ...options });
}

async function deleteDeliveryInfoById(id, options = {}) {
  return ShopDeliveryInfo.destroy({ where: { id }, ...options });
}

async function findDeliveryInfoById(id, options = {}) {
  return ShopDeliveryInfo.findByPk(id, options);
}

async function listDeliveryInfo(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }
  return ShopDeliveryInfo.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopDeliveryInfo,
  createDeliveryInfo,
  updateDeliveryInfoById,
  deleteDeliveryInfoById,
  findDeliveryInfoById,
  listDeliveryInfo,
};
