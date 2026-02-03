const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopOrder = sequelize.define(
  "ShopOrder",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totalPrice: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "totalPrice",
    },
    userId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "user",
    },
    deliveryInfoId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "delivery_info",
    },
    orderExpireTime: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "orderExpireTime",
    },
    clientOrderNo: {
      type: DataTypes.STRING(256),
      allowNull: true,
      field: "clientOrderNo",
    },
  },
  {
    tableName: "shop_order",
    timestamps: true,
  }
);

const LlpayV2 = sequelize.define(
  "LlpayV2",
  {
    id: {
      type: DataTypes.STRING(34),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    orderId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "orderId",
    },
    txnSeqno: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "txnSeqno",
    },
  },
  {
    tableName: "llpay_v2",
    timestamps: true,
  }
);

if (!ShopOrder.associations.llpayV2) {
  ShopOrder.hasOne(LlpayV2, {
    as: "llpayV2",
    foreignKey: "orderId",
    sourceKey: "id",
    constraints: false,
  });
}

async function createOrder(data, options = {}) {
  return ShopOrder.create(data, options);
}

async function updateOrderById(id, data, options = {}) {
  return ShopOrder.update(data, { where: { id }, ...options });
}

async function deleteOrderById(id, options = {}) {
  return ShopOrder.destroy({ where: { id }, ...options });
}

async function findOrderById(id, options = {}) {
  return ShopOrder.findByPk(id, options);
}

async function findOrderByClientOrderNo(clientOrderNo, options = {}) {
  return ShopOrder.findOne({ where: { clientOrderNo }, ...options });
}

async function listOrders(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }
  if (Array.isArray(filter.statuses) && filter.statuses.length) {
    where.status = filter.statuses;
  } else if (typeof filter.status === "string" && filter.status.trim()) {
    where.status = filter.status.trim();
  }
  return ShopOrder.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: filter.order || [["createdAt", "DESC"]],
    ...options,
  });
}

async function listOrderWithTxnSeqno(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }
  if (Array.isArray(filter.statuses) && filter.statuses.length) {
    where.status = filter.statuses;
  } else if (typeof filter.status === "string" && filter.status.trim()) {
    where.status = filter.status.trim();
  }

  const optInclude = options && Object.prototype.hasOwnProperty.call(options, "include")
    ? options.include
    : undefined;
  const optAttributes = options && Object.prototype.hasOwnProperty.call(options, "attributes")
    ? options.attributes
    : undefined;
  const { include: _ignoredInclude, attributes: _ignoredAttributes, ...restOptions } =
    options || {};

  const normalizedOptInclude = Array.isArray(optInclude)
    ? optInclude
    : optInclude
      ? [optInclude]
      : [];

  const include = [
    { model: LlpayV2, as: "llpayV2", required: false, attributes: [] },
    ...normalizedOptInclude,
  ];

  const txnSeqnoAttr = [sequelize.col("llpayV2.txnSeqno"), "txnSeqno"];
  let attributes;
  if (Array.isArray(optAttributes)) {
    attributes = [...optAttributes, txnSeqnoAttr];
  } else if (optAttributes && typeof optAttributes === "object") {
    const existingInclude = Array.isArray(optAttributes.include) ? optAttributes.include : [];
    attributes = { ...optAttributes, include: [...existingInclude, txnSeqnoAttr] };
  } else {
    attributes = { include: [txnSeqnoAttr] };
  }

  return ShopOrder.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: filter.order || [["createdAt", "DESC"]],
    include,
    attributes,
    ...restOptions,
  });
}

async function countOrders(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.userId === "string" && filter.userId.trim()) {
    where.userId = filter.userId.trim();
  }
  if (Array.isArray(filter.statuses) && filter.statuses.length) {
    where.status = filter.statuses;
  } else if (typeof filter.status === "string" && filter.status.trim()) {
    where.status = filter.status.trim();
  }
  return ShopOrder.count({ where, ...options });
}

module.exports = {
  ShopOrder,
  createOrder,
  updateOrderById,
  deleteOrderById,
  findOrderById,
  findOrderByClientOrderNo,
  listOrders,
  listOrderWithTxnSeqno,
  countOrders,
};
