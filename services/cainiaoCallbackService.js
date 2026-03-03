const { QueryTypes } = require("sequelize");
const { safeTrim } = require("../utils/envUtils");
const logger = require("../utils/logger");

/**
 * 处理菜鸟出库通知 (CONSIGN_ORDER_NOTIFY)
 * 业务逻辑：
 * 1. 查找对应的 bonded_warehouse_orders 记录
 * 2. 更新 bonded_warehouse_orders 状态为 SHIPPED
 * 3. 回填物流单号 (logisticsNumber) 和发货时间 (shippedAt)
 * 4. 更新 shop_order 状态为 SHIPPED
 *
 * @param {Object} payload 菜鸟报文体
 * @param {Object} transaction Sequelize 事务对象
 */
async function handleConsignNotify(sequelize, payload, transaction) {
  // 1. 解析关键字段
  const externalOrderCode = safeTrim(payload.orderCode); // 对应我们的 orderId
  const mailNo = safeTrim(payload.mailNo); // 运单号
  const logisticsCode = safeTrim(payload.logisticsCode); // 物流公司代码
  
  if (!externalOrderCode) {
    throw new Error("Missing orderCode in payload");
  }

  console.log(`[Cainiao Callback] Handling Consign Notify for Order: ${externalOrderCode}, MailNo: ${mailNo}`);

  // 2. 查找并锁定保税订单记录
  const [bondedOrder] = await sequelize.query(
    "SELECT `_id`, `orderId` FROM `bonded_warehouse_orders` WHERE `orderId` = :orderId FOR UPDATE",
    {
      replacements: { orderId: externalOrderCode },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  if (!bondedOrder) {
    console.warn(`[Cainiao Callback] Bonded order not found for ${externalOrderCode}`);
    // 即使找不到也视为成功，避免死循环重试（可能是手动删除了）
    return;
  }

  // 3. 更新保税订单表
  await sequelize.query(
    `UPDATE \`bonded_warehouse_orders\` 
     SET \`status\` = 'SHIPPED', 
         \`logisticsNumber\` = :mailNo, 
         \`logistics_no\` = :mailNo,
         \`logisticsCode\` = :logisticsCode,
         \`shippedAt\` = :now,
         \`shipped_at\` = :now,
         \`updatedAt\` = :now
     WHERE \`_id\` = :id`,
    {
      replacements: {
        mailNo,
        logisticsCode: logisticsCode || "CAINIAO",
        now: Date.now(),
        id: bondedOrder._id,
      },
      transaction,
    }
  );

  // 4. 更新主订单状态为已发货 (SHIPPED)
  // 仅当订单当前状态不是已完成或已取消时更新
  await sequelize.query(
    `UPDATE \`shop_order\` 
     SET \`status\` = 'SHIPPED', 
         \`updatedAt\` = :now 
     WHERE \`_id\` = :orderId AND \`status\` NOT IN ('COMPLETED', 'CANCELLED', 'SHIPPED')`,
    {
      replacements: {
        orderId: externalOrderCode,
        now: Date.now(),
      },
      transaction,
    }
  );
  
  console.log(`[Cainiao Callback] Order ${externalOrderCode} marked as SHIPPED`);
}

/**
 * 处理菜鸟销退入库确认 (GLOBAL_SALE_ORDER_REFUND_CONFIRM)
 * 业务逻辑：
 * 1. 查找对应的售后单 (refundOrderId 通常对应 shop_refund_apply 的 id)
 * 2. 更新售后单状态为 "已入库/待退款"
 * 3. (可选) 如果是良品入库，可能需要增加库存（视业务规则而定，目前暂仅更新状态）
 */
async function handleRefundConfirm(sequelize, payload, transaction) {
  const refundOrderId = safeTrim(payload.refundOrderId); // 售后单号
  const confirmTime = safeTrim(payload.gmtOperateTime);
  
  if (!refundOrderId) {
    throw new Error("Missing refundOrderId in payload");
  }

  console.log(`[Cainiao Callback] Handling Refund Confirm for: ${refundOrderId}`);

  // 1. 更新 shop_refund_apply 表
  // 假设我们有一个状态叫 'WAREHOUSE_RECEIVED' 或 'APPROVED' (待退款)
  // 这里将其更新为 'WAREHOUSE_RECEIVED'，并在备注中记录
  await sequelize.query(
    `UPDATE \`shop_refund_apply\` 
     SET \`status\` = 'WAREHOUSE_RECEIVED', 
         \`updatedAt\` = :now
     WHERE \`_id\` = :refundId`,
    {
      replacements: {
        refundId: refundOrderId,
        now: Date.now(),
      },
      transaction,
    }
  );

  console.log(`[Cainiao Callback] Refund ${refundOrderId} marked as WAREHOUSE_RECEIVED`);
}

module.exports = {
  handleConsignNotify,
  handleRefundConfirm,
};
