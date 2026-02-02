const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../db");

async function findByTxnSeqno(txnSeqno) {
  const rows = await sequelize.query(
    "SELECT `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `platform_txno` AS `platformTxno`, `txnTime`, `secured_confirm_txn_seqno` AS `securedConfirmTxnSeqno`, `secured_confirm_txn_time` AS `securedConfirmTxnTime` FROM `llpay_v2` WHERE `txnSeqno` = :txnSeqno LIMIT 1",
    { replacements: { txnSeqno }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function findByOrderId(orderId) {
  const rows = await sequelize.query(
    "SELECT `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `platform_txno` AS `platformTxno`, `txnTime`, `secured_confirm_txn_seqno` AS `securedConfirmTxnSeqno`, `secured_confirm_txn_time` AS `securedConfirmTxnTime` FROM `llpay_v2` WHERE `orderId` = :orderId LIMIT 1",
    { replacements: { orderId }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function updateStatus(txnSeqno, status, extraFields = {}) {
  try {
    const fields = Object.assign({}, extraFields || {}, { status });
    if (!Object.prototype.hasOwnProperty.call(fields, "updatedAt")) {
      fields.updatedAt = Date.now();
    }
    const keys = Object.keys(fields);
    if (!keys.length) return 0;

    const setClause = keys.map((k) => `\`${k}\` = :${k}`).join(", ");
    const sql = `UPDATE \`llpay_v2\` SET ${setClause} WHERE \`txnSeqno\` = :txnSeqno LIMIT 1`;
    const replacements = Object.assign({ txnSeqno }, fields);
    const [, metadata] = await sequelize.query(sql, { replacements });
    const affectedRows = metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows : 0;
    return affectedRows;
  } catch (_) {
    return 0;
  }
}

async function recordSecuredConfirm(txnSeqno, confirmTxnSeqno, confirmTxnTime) {
  const [, metadata] = await sequelize.query(
    "UPDATE `llpay_v2` SET `secured_confirm_txn_seqno` = :confirmTxnSeqno, `secured_confirm_txn_time` = :confirmTxnTime WHERE `txnSeqno` = :txnSeqno LIMIT 1",
    { replacements: { confirmTxnSeqno, confirmTxnTime, txnSeqno } }
  );
  const affectedRows = metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows : 0;
  return affectedRows;
}

module.exports = {
  findByTxnSeqno,
  findByOrderId,
  updateStatus,
  recordSecuredConfirm,
};
