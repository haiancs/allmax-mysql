const { DataTypes, QueryTypes } = require("sequelize");
const { sequelize } = require("../db");

const ShopOrderItem = sequelize.define(
  "ShopOrderItem",
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
      field: "order",
    },
    skuId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "sku",
    },
    count: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    distributionRecordId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "distribution_record",
    },
  },
  {
    tableName: "shop_order_item",
    timestamps: true,
  }
);

async function createOrderItem(data, options = {}) {
  return ShopOrderItem.create(data, options);
}

async function createOrderItems(records, options = {}) {
  if (!records || !records.length) {
    return [];
  }
  return ShopOrderItem.bulkCreate(records, options);
}

async function updateOrderItemById(id, data, options = {}) {
  return ShopOrderItem.update(data, { where: { id }, ...options });
}

async function deleteOrderItemById(id, options = {}) {
  return ShopOrderItem.destroy({ where: { id }, ...options });
}

async function deleteOrderItemsByOrderId(orderId, options = {}) {
  return ShopOrderItem.destroy({ where: { orderId }, ...options });
}

async function findOrderItemById(id, options = {}) {
  return ShopOrderItem.findByPk(id, options);
}

async function listOrderItems(filter = {}, options = {}) {
  const where = {};
  if (Array.isArray(filter.ids) && filter.ids.length) {
    where.id = filter.ids;
  }
  if (typeof filter.orderId === "string" && filter.orderId.trim()) {
    where.orderId = filter.orderId.trim();
  }
  if (typeof filter.skuId === "string" && filter.skuId.trim()) {
    where.skuId = filter.skuId.trim();
  }
  return ShopOrderItem.findAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [["createdAt", "ASC"]],
    ...options,
  });
}

async function listOrderItemsWithSkuSpuDistributionByOrderId(orderId, options = {}) {
  if (!orderId || !String(orderId).trim()) {
    return [];
  }
  const rows = await sequelize.query(
    `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        oi.\`distribution_record\` AS \`distributionRecordId\`,
        s.\`price\` AS \`price\`,
        s.\`wholesale_price\` AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        sp.\`name\` AS \`spuName\`,
        dr.\`share_price\` AS \`sharePrice\`
      FROM \`shop_order_item\` oi
      INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
      LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
      LEFT JOIN \`shop_distribution_record\` dr ON dr.\`_id\` = oi.\`distribution_record\`
      WHERE oi.\`order\` = :orderId
      ORDER BY oi.\`_id\` ASC`,
    {
      replacements: { orderId: String(orderId).trim() },
      type: QueryTypes.SELECT,
      ...options,
    }
  );
  return rows || [];
}

async function listOrderItemsWithSkuSpuByOrderIds(orderIds, options = {}) {
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return [];
  }
  const ids = orderIds.map((id) => String(id).trim()).filter(Boolean);
  if (!ids.length) {
    return [];
  }
  const rows = await sequelize.query(
    `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`order\` AS \`orderId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        s.\`price\` AS \`price\`,
        s.\`wholesale_price\` AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        sp.\`name\` AS \`spuName\`
      FROM \`shop_order_item\` oi
      INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
      LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
      WHERE oi.\`order\` IN (:orderIds)
      ORDER BY oi.\`order\` ASC, oi.\`_id\` ASC`,
    {
      replacements: { orderIds: ids },
      type: QueryTypes.SELECT,
      ...options,
    }
  );
  return rows || [];
}

module.exports = {
  ShopOrderItem,
  createOrderItem,
  createOrderItems,
  updateOrderItemById,
  deleteOrderItemById,
  deleteOrderItemsByOrderId,
  findOrderItemById,
  listOrderItems,
  listOrderItemsWithSkuSpuDistributionByOrderId,
  listOrderItemsWithSkuSpuByOrderIds,
};
