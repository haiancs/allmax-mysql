const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopSpu = sequelize.define(
  "ShopSpu",
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
    detail: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    coverImage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "cover_image",
    },
    status: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    priority: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    swiperImages: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "swiper_images",
    },
  },
  {
    tableName: "shop_spu",
    timestamps: true,
  }
);

async function createSpu(data, options = {}) {
  return ShopSpu.create(data, options);
}

async function updateSpuById(id, data, options = {}) {
  return ShopSpu.update(data, { where: { id }, ...options });
}

async function deleteSpuById(id, options = {}) {
  return ShopSpu.destroy({ where: { id }, ...options });
}

async function findSpuById(id, options = {}) {
  return ShopSpu.findByPk(id, options);
}

async function listSpu(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.status === "string" && filter.status.trim()) {
    where.status = filter.status.trim();
  }
  return ShopSpu.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopSpu,
  createSpu,
  updateSpuById,
  deleteSpuById,
  findSpuById,
  listSpu,
};
