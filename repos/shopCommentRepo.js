const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopComment = sequelize.define(
  "ShopComment",
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
    spuId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "spu",
    },
    orderItemId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "order_item",
    },
    rating: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reply: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "shop_comment",
    timestamps: true,
  }
);

async function createComment(data, options = {}) {
  return ShopComment.create(data, options);
}

async function updateCommentById(id, data, options = {}) {
  return ShopComment.update(data, { where: { id }, ...options });
}

async function deleteCommentById(id, options = {}) {
  return ShopComment.destroy({ where: { id }, ...options });
}

async function findCommentById(id, options = {}) {
  return ShopComment.findByPk(id, options);
}

async function listComments(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }
  if (typeof filter.spuId === "string" && filter.spuId.trim()) {
    where.spuId = filter.spuId.trim();
  }
  if (typeof filter.orderItemId === "string" && filter.orderItemId.trim()) {
    where.orderItemId = filter.orderItemId.trim();
  }
  return ShopComment.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["updatedAt", "DESC"]],
    ...options,
  });
}

module.exports = {
  ShopComment,
  createComment,
  updateCommentById,
  deleteCommentById,
  findCommentById,
  listComments,
};
