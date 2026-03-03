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
    categoryId: {
      type: DataTypes.STRING(34),
      allowNull: false,
      field: "category_id",
    },
    spuId: {
      type: DataTypes.STRING(34),
      allowNull: false,
      field: "spu_id",
    },
    createdAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "createdAt",
    },
    updatedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "updatedAt",
    },
  },
  {
    tableName: "shop_spu_category_links",
    timestamps: false,
  }
);

async function createSpuCateLink(data, options = {}) {
  const now = Date.now();
  const dataToCreate = {
    ...data,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  };
  return SpuCateLink.create(dataToCreate, options);
}

async function createSpuCateLinks(records, options = {}) {
  if (!records || !records.length) {
    return [];
  }
  const now = Date.now();
  const recordsToCreate = records.map(record => ({
    ...record,
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || now,
  }));
  return SpuCateLink.bulkCreate(recordsToCreate, options);
}

async function deleteSpuCateLinkById(id, options = {}) {
  return SpuCateLink.destroy({ where: { id }, ...options });
}

async function deleteSpuCateLinksByPair(categoryId, spuId, options = {}) {
  return SpuCateLink.destroy({
    where: { categoryId, spuId },
    ...options,
  });
}

async function listSpuCateLinks(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.categoryIds) && filter.categoryIds.length) {
    where.categoryId = filter.categoryIds;
  }
  if (Array.isArray(filter.spuIds) && filter.spuIds.length) {
    where.spuId = filter.spuIds;
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
