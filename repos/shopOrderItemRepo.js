const { DataTypes, QueryTypes } = require("sequelize");
const { sequelize } = require("../db");

let orderItemDistributionPriceColumn = null;
let orderItemColumnsCache = null;

// Clear cache to ensure the new object-based format is used
orderItemColumnsCache = null;

async function resolveOrderItemDistributionPriceColumn(options = {}) {
  const transaction = options?.transaction;
  if (orderItemDistributionPriceColumn !== null) {
    return orderItemDistributionPriceColumn;
  }
  try {
    const rows = await sequelize.query(
      "SHOW COLUMNS FROM `shop_order_item` LIKE 'distributionPrice'",
      { type: QueryTypes.SELECT, transaction }
    );
    if (Array.isArray(rows) && rows.length) {
      orderItemDistributionPriceColumn = "distributionPrice";
      return orderItemDistributionPriceColumn;
    }
  } catch (_) {}
  try {
    const rows = await sequelize.query(
      "SHOW COLUMNS FROM `shop_order_item` LIKE 'distribution_price'",
      { type: QueryTypes.SELECT, transaction }
    );
    if (Array.isArray(rows) && rows.length) {
      orderItemDistributionPriceColumn = "distribution_price";
      return orderItemDistributionPriceColumn;
    }
  } catch (_) {}
  orderItemDistributionPriceColumn = "";
  return orderItemDistributionPriceColumn;
}

async function getOrderItemColumns(options = {}) {
  const transaction = options?.transaction;
  if (orderItemColumnsCache) {
    return orderItemColumnsCache;
  }
  try {
    const rows = await sequelize.query("SHOW COLUMNS FROM `shop_order_item`", {
      type: QueryTypes.SELECT,
      transaction,
    });
    const columns = (rows || []).filter(
      (row) => typeof row?.Field === "string" && row.Field.length > 0
    );
    orderItemColumnsCache = columns;
    return columns;
  } catch (_) {
    orderItemColumnsCache = null;
    return null;
  }
}

function pickFirstColumn(columns, candidates) {
  const colMap = new Map((columns || []).map((c) => [c.Field, c.Type]));
  for (const key of candidates) {
    if (colMap.has(key)) return { name: key, type: colMap.get(key) };
  }
  return null;
}

async function resolveOrderItemUpdatedAtColumn(options = {}) {
  const columns = await getOrderItemColumns(options);
  if (!columns) return null;
  return pickFirstColumn(columns, ["updated_at", "updatedAt"]);
}

function getUpdatedAtValue(updatedAtInfo) {
  if (!updatedAtInfo) return null;
  const isBigInt =
    updatedAtInfo.type && updatedAtInfo.type.toLowerCase().includes("bigint");
  return isBigInt ? Date.now() : new Date();
}

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
    afterServiceStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: "after_service_status",
    },
    afterServiceId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: "",
      field: "after_service_id",
    },
    distributionPrice: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "distribution_price",
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
  const distributionPriceColumn = await resolveOrderItemDistributionPriceColumn();
  const sharePriceSelect = distributionPriceColumn
    ? `COALESCE(oi.\`${distributionPriceColumn}\`, dr.\`share_price\`) AS \`sharePrice\`, oi.\`${distributionPriceColumn}\` AS \`distributionPrice\``
    : "dr.`share_price` AS `sharePrice`, NULL AS `distributionPrice`";
  const statusKey = "after_service_status";
  const statusSelect = statusKey
    ? `oi.\`${statusKey}\` AS \`afterServiceStatus\`, oi.\`after_service_id\` AS \`afterServiceId\``
    : "0 AS `afterServiceStatus`, '' AS `afterServiceId`";
  const rows = await sequelize.query(
    `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        oi.\`distribution_record\` AS \`distributionRecordId\`,
        s.\`price\` AS \`currentRetailPrice\`,
        COALESCE(oi.\`price\`, s.\`price\`) AS \`price\`,
        s.\`wholesale_price\` AS \`currentWholesalePrice\`,
        COALESCE(oi.\`wholesale_price\`, s.\`wholesale_price\`) AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        s.\`description\` AS \`skuDescription\`,
        sp.\`name\` AS \`spuName\`,
        ${sharePriceSelect},
        ${statusSelect}
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

async function listOrderItemsWithSkuSpuDistributionByOrderIds(orderIds, options = {}) {
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return [];
  }
  const ids = orderIds.map((id) => String(id).trim()).filter(Boolean);
  if (!ids.length) {
    return [];
  }
  const distributionPriceColumn = await resolveOrderItemDistributionPriceColumn();
  const sharePriceSelect = distributionPriceColumn
    ? `COALESCE(oi.\`${distributionPriceColumn}\`, dr.\`share_price\`) AS \`sharePrice\`, oi.\`${distributionPriceColumn}\` AS \`distributionPrice\``
    : "dr.`share_price` AS `sharePrice`, NULL AS `distributionPrice`";
  const statusKey = "after_service_status";
  const statusSelect = statusKey
    ? `oi.\`${statusKey}\` AS \`afterServiceStatus\`, oi.\`after_service_id\` AS \`afterServiceId\``
    : "0 AS `afterServiceStatus`, '' AS `afterServiceId`";
  const rows = await sequelize.query(
    `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`order\` AS \`orderId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        oi.\`distribution_record\` AS \`distributionRecordId\`,
        s.\`price\` AS \`currentRetailPrice\`,
        COALESCE(oi.\`price\`, s.\`price\`) AS \`price\`,
        s.\`wholesale_price\` AS \`currentWholesalePrice\`,
        COALESCE(oi.\`wholesale_price\`, s.\`wholesale_price\`) AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        s.\`description\` AS \`skuDescription\`,
        sp.\`name\` AS \`spuName\`,
        ${sharePriceSelect},
        ${statusSelect}
      FROM \`shop_order_item\` oi
      INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
      LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
      LEFT JOIN \`shop_distribution_record\` dr ON dr.\`_id\` = oi.\`distribution_record\`
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

async function listOrderItemsWithSkuSpuByOrderIds(orderIds, options = {}) {
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return [];
  }
  const ids = orderIds.map((id) => String(id).trim()).filter(Boolean);
  if (!ids.length) {
    return [];
  }
  const statusKey = "after_service_status";
  const statusSelect = statusKey
    ? `oi.\`${statusKey}\` AS \`afterServiceStatus\`, oi.\`after_service_id\` AS \`afterServiceId\``
    : "0 AS `afterServiceStatus`, '' AS `afterServiceId`";
  const rows = await sequelize.query(
    `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`order\` AS \`orderId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        s.\`price\` AS \`currentRetailPrice\`,
        COALESCE(oi.\`price\`, s.\`price\`) AS \`price\`,
        s.\`wholesale_price\` AS \`currentWholesalePrice\`,
        COALESCE(oi.\`wholesale_price\`, s.\`wholesale_price\`) AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        s.\`description\` AS \`skuDescription\`,
        sp.\`name\` AS \`spuName\`,
        ${statusSelect}
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

async function updateOrderItemStatusByIds(
  { orderItemIds, status, afterServiceId },
  options = {}
) {
  const ids = Array.isArray(orderItemIds)
    ? orderItemIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) {
    return { ok: true, affectedRows: 0, skipped: true };
  }
  const statusKey = "after_service_status";
  if (!statusKey) {
    return { ok: true, affectedRows: 0, skipped: true };
  }
  const updatedAtInfo = await resolveOrderItemUpdatedAtColumn(options);
  const replacements = { status, ids };
  if (typeof afterServiceId === "string") {
    replacements.afterServiceId = afterServiceId;
  }
  if (updatedAtInfo) {
    replacements.updated_at = getUpdatedAtValue(updatedAtInfo);
  }
  const setParts = [`\`${statusKey}\` = :status`];
  if (typeof afterServiceId === "string") {
    setParts.push(`\`after_service_id\` = :afterServiceId`);
  }
  if (updatedAtInfo) setParts.push(`\`${updatedAtInfo.name}\` = :updated_at`);
  const sql = `UPDATE \`shop_order_item\` SET ${setParts.join(
    ", "
  )} WHERE \`_id\` IN (:ids)`;
  try {
    const [, metadata] = await sequelize.query(sql, {
      replacements,
      transaction: options.transaction,
    });
    const affectedRows =
      metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows : 0;
    return { ok: true, affectedRows, skipped: false };
  } catch (error) {
    console.error("updateOrderItemStatusByIds error:", error);
    return { ok: false, affectedRows: 0, skipped: false, error };
  }
}

async function updateOrderItemStatusByOrderId(
  { orderId, status, afterServiceId },
  options = {}
) {
  const normalizedOrderId = typeof orderId === "string" ? orderId.trim() : "";
  if (!normalizedOrderId) {
    return { ok: true, affectedRows: 0, skipped: true };
  }
  const statusKey = "after_service_status";
  if (!statusKey) {
    return { ok: true, affectedRows: 0, skipped: true };
  }
  const updatedAtInfo = await resolveOrderItemUpdatedAtColumn(options);
  const replacements = { status, orderId: normalizedOrderId };
  if (typeof afterServiceId === "string") {
    replacements.afterServiceId = afterServiceId;
  }
  if (updatedAtInfo) {
    replacements.updated_at = getUpdatedAtValue(updatedAtInfo);
  }
  const setParts = [`\`${statusKey}\` = :status`];
  if (typeof afterServiceId === "string") {
    setParts.push(`\`after_service_id\` = :afterServiceId`);
  }
  if (updatedAtInfo) setParts.push(`\`${updatedAtInfo.name}\` = :updated_at`);
  const sql = `UPDATE \`shop_order_item\` SET ${setParts.join(
    ", "
  )} WHERE \`order\` = :orderId`;
  try {
    const [, metadata] = await sequelize.query(sql, {
      replacements,
      transaction: options.transaction,
    });
    const affectedRows =
      metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows : 0;
    return { ok: true, affectedRows, skipped: false };
  } catch (error) {
    console.error("updateOrderItemStatusByOrderId error:", error);
    return { ok: false, affectedRows: 0, skipped: false, error };
  }
}

async function updateOrderItemStatusByOrderIdAndSkuIds(
  { orderId, skuIds, status, afterServiceId },
  options = {}
) {
  const normalizedOrderId = typeof orderId === "string" ? orderId.trim() : "";
  const ids = Array.isArray(skuIds)
    ? skuIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!normalizedOrderId || !ids.length) {
    return { ok: true, affectedRows: 0, skipped: true };
  }
  const statusKey = "after_service_status";
  if (!statusKey) {
    return { ok: true, affectedRows: 0, skipped: true };
  }
  const updatedAtInfo = await resolveOrderItemUpdatedAtColumn(options);
  const replacements = { status, orderId: normalizedOrderId, skuIds: ids };
  if (typeof afterServiceId === "string") {
    replacements.afterServiceId = afterServiceId;
  }
  if (updatedAtInfo) {
    replacements.updated_at = getUpdatedAtValue(updatedAtInfo);
  }
  const setParts = [`\`${statusKey}\` = :status`];
  if (typeof afterServiceId === "string") {
    setParts.push(`\`after_service_id\` = :afterServiceId`);
  }
  if (updatedAtInfo) setParts.push(`\`${updatedAtInfo.name}\` = :updated_at`);
  const sql = `UPDATE \`shop_order_item\` SET ${setParts.join(
    ", "
  )} WHERE \`order\` = :orderId AND \`sku\` IN (:skuIds)`;
  try {
    const [, metadata] = await sequelize.query(sql, {
      replacements,
      transaction: options.transaction,
    });
    const affectedRows =
      metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows : 0;
    return { ok: true, affectedRows, skipped: false };
  } catch (error) {
    console.error("updateOrderItemStatusByOrderIdAndSkuIds error:", error);
    return { ok: false, affectedRows: 0, skipped: false, error };
  }
}

module.exports = {
  ShopOrderItem,
  resolveOrderItemDistributionPriceColumn,
  createOrderItem,
  createOrderItems,
  updateOrderItemById,
  deleteOrderItemById,
  deleteOrderItemsByOrderId,
  findOrderItemById,
  listOrderItems,
  listOrderItemsWithSkuSpuDistributionByOrderId,
  listOrderItemsWithSkuSpuDistributionByOrderIds,
  listOrderItemsWithSkuSpuByOrderIds,
  updateOrderItemStatusByIds,
  updateOrderItemStatusByOrderId,
  updateOrderItemStatusByOrderIdAndSkuIds,
};
