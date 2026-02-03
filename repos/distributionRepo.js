const { DataTypes, QueryTypes } = require("sequelize");
const { sequelize } = require("../db");
const { safeTrim } = require("../utils/llpayRouteUtils");

const DistributorUser = sequelize.define(
  "DistributorUser",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    openId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    nickname: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    parentId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      field: "parent_id",
    },
    level: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: "DistributorUser",
    timestamps: true,
  }
);

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    commissionRate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      field: "commission_rate",
    },
  },
  {
    tableName: "Product",
    timestamps: true,
  }
);

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: "user_id",
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: "total_amount",
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    tableName: "Order",
    timestamps: true,
  }
);

const OrderItem = sequelize.define(
  "OrderItem",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    orderId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: "order_id",
    },
    productId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: "product_id",
    },
    quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: "unit_price",
    },
  },
  {
    tableName: "OrderItem",
    timestamps: true,
  }
);

const CommissionRecord = sequelize.define(
  "CommissionRecord",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    orderId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: "order_id",
    },
    userId: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      field: "user_id",
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    level: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    tableName: "CommissionRecord",
    timestamps: true,
  }
);

DistributorUser.hasMany(Order, { foreignKey: "userId", sourceKey: "id" });
Order.belongsTo(DistributorUser, { foreignKey: "userId", targetKey: "id" });

Order.hasMany(OrderItem, { foreignKey: "orderId", sourceKey: "id" });
OrderItem.belongsTo(Order, { foreignKey: "orderId", targetKey: "id" });

Product.hasMany(OrderItem, { foreignKey: "productId", sourceKey: "id" });
OrderItem.belongsTo(Product, { foreignKey: "productId", targetKey: "id" });

Order.hasMany(CommissionRecord, { foreignKey: "orderId", sourceKey: "id" });
CommissionRecord.belongsTo(Order, {
  foreignKey: "orderId",
  targetKey: "id",
});

DistributorUser.hasMany(CommissionRecord, {
  foreignKey: "userId",
  sourceKey: "id",
});
CommissionRecord.belongsTo(DistributorUser, {
  foreignKey: "userId",
  targetKey: "id",
});

async function findUserById(id, options = {}) {
  return DistributorUser.findByPk(id, options);
}

async function findUserByOpenId(openId, options = {}) {
  return DistributorUser.findOne({ where: { openId }, ...options });
}

async function listUserOrders(userId, options = {}) {
  return Order.findAll({
    where: { userId },
    include: [
      {
        model: OrderItem,
        include: [Product],
      },
      {
        model: CommissionRecord,
      },
    ],
    order: [["createdTime", "DESC"]],
    ...options,
  });
}

async function createOrderWithItems(orderData, items, options = {}) {
  const order = await Order.create(orderData, options);
  const orderItemsData = items.map((item) => ({
    orderId: order.id,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
  const orderItems = await OrderItem.bulkCreate(orderItemsData, options);
  return { order, orderItems };
}

async function createCommissionRecords(records, options = {}) {
  if (!records || !records.length) {
    return [];
  }
  return CommissionRecord.bulkCreate(records, options);
}

async function getCommissionSummaryByUser(userId, options = {}) {
  const settled = await CommissionRecord.sum("amount", {
    where: { userId, status: "settled" },
    ...options,
  });
  const pending = await CommissionRecord.sum("amount", {
    where: { userId, status: "pending" },
    ...options,
  });
  return {
    settled: settled || 0,
    pending: pending || 0,
  };
}

async function resolvePayeeUidByDistributionRecordIds(recordIds) {
  const ids = Array.from(new Set(recordIds.map((v) => safeTrim(v)).filter(Boolean)));
  if (!ids.length) return new Map();

  try {
    const colRows = await sequelize.query(
      "SHOW COLUMNS FROM `shop_distribution_record` LIKE 'distributor'",
      { type: QueryTypes.SELECT }
    );
    if (!Array.isArray(colRows) || colRows.length === 0) return new Map();
  } catch (_) {
    return new Map();
  }

  let accpIdColumn = "";
  try {
    const accpIdRows = await sequelize.query(
      "SHOW COLUMNS FROM `users` LIKE 'accpId'",
      { type: QueryTypes.SELECT }
    );
    if (Array.isArray(accpIdRows) && accpIdRows.length > 0) {
      accpIdColumn = "accpId";
    } else {
      const accpIdSnakeRows = await sequelize.query(
        "SHOW COLUMNS FROM `users` LIKE 'accp_id'",
        { type: QueryTypes.SELECT }
      );
      if (Array.isArray(accpIdSnakeRows) && accpIdSnakeRows.length > 0) {
        accpIdColumn = "accp_id";
      }
    }
  } catch (_) {}

  const mapping = new Map();
  try {
    const rows = await sequelize.query(
      "SELECT `_id` AS `recordId`, `distributor` AS `payeeUid` FROM `shop_distribution_record` WHERE `_id` IN (:ids)",
      { replacements: { ids }, type: QueryTypes.SELECT }
    );
    for (const row of rows || []) {
      const recordId = safeTrim(row?.recordId);
      const payeeUid = safeTrim(row?.payeeUid);
      if (recordId && payeeUid) mapping.set(recordId, payeeUid);
    }
  } catch (_) {}

  return mapping;
}

module.exports = {
  DistributorUser,
  Product,
  Order,
  OrderItem,
  CommissionRecord,
  findUserById,
  findUserByOpenId,
  listUserOrders,
  createOrderWithItems,
  createCommissionRecords,
  getCommissionSummaryByUser,
  resolvePayeeUidByDistributionRecordIds,
};
