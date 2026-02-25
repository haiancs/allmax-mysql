const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopSku = sequelize.define(
  "ShopSku",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    spuId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "spu",
    },
    price: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    wholesalePrice: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "wholesale_price",
    },
    stock: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cargoId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "cargo_id",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: () => Date.now(),
    },
    updatedAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: () => Date.now(),
    },
  },
  {
    tableName: "shop_sku",
    timestamps: false,
    hooks: {
      beforeCreate: (record) => {
        const now = Date.now();
        if (!record.createdAt) {
          record.createdAt = now;
        }
        if (!record.updatedAt) {
          record.updatedAt = now;
        }
      },
      beforeUpdate: (record) => {
        record.updatedAt = Date.now();
      },
    },
  }
);

async function createSku(data, options = {}) {
  return ShopSku.create(data, options);
}

async function updateSkuById(id, data, options = {}) {
  const updateData = { ...data, updatedAt: Date.now() };
  return ShopSku.update(updateData, { where: { id }, ...options });
}

async function deleteSkuById(id, options = {}) {
  return ShopSku.destroy({ where: { id }, ...options });
}

async function findSkuById(id, options = {}) {
  return ShopSku.findByPk(id, options);
}

async function listSku(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.spuId === "string" && filter.spuId.trim()) {
    where.spuId = filter.spuId.trim();
  }
  if (typeof filter.cargoId === "string" && filter.cargoId.trim()) {
    where.cargoId = filter.cargoId.trim();
  }
  return ShopSku.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopSku,
  createSku,
  updateSkuById,
  deleteSkuById,
  findSkuById,
  listSku,
};
