const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopSpuCate = sequelize.define(
  "ShopSpuCate",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "shop_spu_cate",
    timestamps: true,
  }
);

async function createSpuCate(data, options = {}) {
  return ShopSpuCate.create(data, options);
}

async function updateSpuCateById(id, data, options = {}) {
  return ShopSpuCate.update(data, { where: { id }, ...options });
}

async function deleteSpuCateById(id, options = {}) {
  return ShopSpuCate.destroy({ where: { id }, ...options });
}

async function findSpuCateById(id, options = {}) {
  return ShopSpuCate.findByPk(id, options);
}

async function listSpuCate(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  return ShopSpuCate.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopSpuCate,
  createSpuCate,
  updateSpuCateById,
  deleteSpuCateById,
  findSpuCateById,
  listSpuCate,
};
