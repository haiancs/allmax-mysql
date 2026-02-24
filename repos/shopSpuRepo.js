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
    tableName: "shop_spu",
    timestamps: false,
  }
);

async function createSpu(data, options = {}) {
  const now = Date.now();
  const dataToCreate = {
    ...data,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  };
  return ShopSpu.create(dataToCreate, options);
}

async function updateSpuById(id, data, options = {}) {
  const dataToUpdate = { ...data, updatedAt: Date.now() };
  return ShopSpu.update(dataToUpdate, { where: { id }, ...options });
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
