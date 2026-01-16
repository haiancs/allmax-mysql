const { QueryTypes } = require("sequelize");
const { sequelize } = require("../db");
const { safeTrim } = require("../utils/llpayRouteUtils");

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

async function updateLLPayStatus(txnSeqno, status, extraReplacements = {}) {
  try {
    const replacements = {
      status,
      updatedAt: Date.now(),
      txnSeqno,
      ...extraReplacements
    };
    
    // Dynamically build SET clause based on extraReplacements
    const extraSets = Object.keys(extraReplacements)
        .map(key => `\`${key}\` = :${key}`)
        .join(", ");
    
    const setClause = `\`status\` = :status, \`updatedAt\` = :updatedAt` + (extraSets ? `, ${extraSets}` : "");

    await sequelize.query(
      `UPDATE \`llpay_v2\` SET ${setClause} WHERE \`txnSeqno\` = :txnSeqno`,
      { replacements }
    );
  } catch (_) {
    // Ignore errors during status update
  }
}

module.exports = {
  resolvePayeeUidByDistributionRecordIds,
  updateLLPayStatus,
};
