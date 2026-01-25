const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const SkuAttrLink = sequelize.define(
  "SkuAttrLink",
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
    tableName: "mid_4RKieAhGh",
    timestamps: true,
  }
);

async function createSkuAttrLink(data, options = {}) {
  return SkuAttrLink.create(data, options);
}

async function createSkuAttrLinks(records, options = {}) {
  if (!records || !records.length) {
    return [];
  }
  return SkuAttrLink.bulkCreate(records, options);
}

async function deleteSkuAttrLinkById(id, options = {}) {
  return SkuAttrLink.destroy({ where: { id }, ...options });
}

async function deleteSkuAttrLinksByPair(leftRecordId, rightRecordId, options = {}) {
  return SkuAttrLink.destroy({
    where: { leftRecordId, rightRecordId },
    ...options,
  });
}

async function listSkuAttrLinks(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.leftRecordIds) && filter.leftRecordIds.length) {
    where.leftRecordId = filter.leftRecordIds;
  }
  if (Array.isArray(filter.rightRecordIds) && filter.rightRecordIds.length) {
    where.rightRecordId = filter.rightRecordIds;
  }
  return SkuAttrLink.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  SkuAttrLink,
  createSkuAttrLink,
  createSkuAttrLinks,
  deleteSkuAttrLinkById,
  deleteSkuAttrLinksByPair,
  listSkuAttrLinks,
};
