const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../db");

async function findBondedOrderByOrderId(orderId) {
  if (!orderId) return null;
  try {
    const rows = await sequelize.query(
      "SELECT * FROM `bonded_warehouse_orders` WHERE `orderId` = :orderId OR `shopOrderId` = :orderId LIMIT 1",
      { replacements: { orderId }, type: QueryTypes.SELECT }
    );
    return rows[0] || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  findBondedOrderByOrderId,
};
