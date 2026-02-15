const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const SpuCateLink = sequelize.define(
  "SpuCateLink",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    leftRecordId: {
      type: DataTypes.STRING(34),
      allowNull: false,
      field: "leftRecordId",
    },
    rightRecordId: {
      type: DataTypes.STRING(34),
      allowNull: false,
      field: "rightRecordId",
    },
  },
  {
    tableName: "mid_shop_spu_shop_spu_c_5oe72yVQ5",
    timestamps: true,
  }
);

async function createSpuCateLink(data, options = {}) {
  return SpuCateLink.create(data, options);
}

async function createSpuCateLinks(records, options = {}) {
  if (!records || !records.length) {
    return [];
  }
  return SpuCateLink.bulkCreate(records, options);
}

async function deleteSpuCateLinkById(id, options = {}) {
  return SpuCateLink.destroy({ where: { id }, ...options });
}

async function deleteSpuCateLinksByPair(leftRecordId, rightRecordId, options = {}) {
  return SpuCateLink.destroy({
    where: { leftRecordId, rightRecordId },
    ...options,
  });
}

async function listSpuCateLinks(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.leftRecordIds) && filter.leftRecordIds.length) {
    where.leftRecordId = filter.leftRecordIds;
  }
  if (Array.isArray(filter.rightRecordIds) && filter.rightRecordIds.length) {
    where.rightRecordId = filter.rightRecordIds;
  }
  return SpuCateLink.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  SpuCateLink,
  createSpuCateLink,
  createSpuCateLinks,
  deleteSpuCateLinkById,
  deleteSpuCateLinksByPair,
  listSpuCateLinks,
};
