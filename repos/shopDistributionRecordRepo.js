const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopDistributionRecord = sequelize.define(
  "ShopDistributionRecord",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    skuId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "sku",
    },
    distributor: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    targetUser: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "target_user",
    },
    shareType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "share_type",
    },
    sharePrice: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "share_price",
    },
    shareContent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "share_content",
    },
  },
  {
    tableName: "shop_distribution_record",
    timestamps: true,
  }
);

async function createDistributionRecord(data, options = {}) {
  return ShopDistributionRecord.create(data, options);
}

async function updateDistributionRecordById(id, data, options = {}) {
  return ShopDistributionRecord.update(data, { where: { id }, ...options });
}

async function deleteDistributionRecordById(id, options = {}) {
  return ShopDistributionRecord.destroy({ where: { id }, ...options });
}

async function findDistributionRecordById(id, options = {}) {
  return ShopDistributionRecord.findByPk(id, options);
}

async function listDistributionRecords(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.skuId === "string" && filter.skuId.trim()) {
    where.skuId = filter.skuId.trim();
  }
  if (typeof filter.distributor === "string" && filter.distributor.trim()) {
    where.distributor = filter.distributor.trim();
  }
  if (typeof filter.targetUser === "string" && filter.targetUser.trim()) {
    where.targetUser = filter.targetUser.trim();
  }
  return ShopDistributionRecord.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopDistributionRecord,
  createDistributionRecord,
  updateDistributionRecordById,
  deleteDistributionRecordById,
  findDistributionRecordById,
  listDistributionRecords,
};
