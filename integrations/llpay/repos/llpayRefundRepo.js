const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../db");

/**
 * 创建连连退款记录
 * @param {Object} data
 * @param {string} data.refund_no - 售后单号
 * @param {string} data.refund_seqno - 连连退款流水号
 * @param {string} data.txn_seqno - 原始交易流水号
 * @param {number|string} data.refund_amount - 退款金额
 * @param {string} data.refund_time - 退款时间(14位)
 * @param {string} data.status - 状态
 * @param {string} data._openid - 用户openid(可选)
 * @param {Array|Object} data.refund_method_infos - 退款方式信息
 * @param {Array|Object} data.payee_refund_infos - 收款方信息
 * @returns {Promise<Object>}
 */
async function createLLPayRefund(data) {
  const sql = `
    INSERT INTO \`llpay_refund\` (
      \`refund_no\`, \`refund_seqno\`, \`txn_seqno\`, \`refund_amount\`, \`refund_time\`,
      \`status\`, \`_openid\`, \`refund_method_infos\`, \`payee_refund_infos\`,
      \`created_at\`, \`updated_at\`
    ) VALUES (
      :refund_no, :refund_seqno, :txn_seqno, :refund_amount, :refund_time,
      :status, :_openid, :refund_method_infos, :payee_refund_infos,
      NOW(), NOW()
    )
  `;

  const replacements = {
    refund_no: data.refund_no || "",
    refund_seqno: data.refund_seqno || "",
    txn_seqno: data.txn_seqno || "",
    refund_amount: data.refund_amount || 0,
    refund_time: data.refund_time || "",
    status: data.status || "PENDING",
    _openid: data._openid || "",
    refund_method_infos: data.refund_method_infos ? JSON.stringify(data.refund_method_infos) : null,
    payee_refund_infos: data.payee_refund_infos ? JSON.stringify(data.payee_refund_infos) : null,
  };

  try {
    const [id] = await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
    return { ok: true, id };
  } catch (error) {
    console.error("[LLPayRefund] create error:", error);
    return { ok: false, error };
  }
}

/**
 * 更新连连退款记录状态和结果
 * @param {string} refundSeqno - 退款流水号
 * @param {Object} data
 * @param {string} data.status - 状态
 * @param {string} [data.ret_code] - 返回码
 * @param {string} [data.ret_msg] - 返回消息
 * @param {string} [data.platform_refundno] - 平台退款单号
 * @returns {Promise<Object>}
 */
async function updateLLPayRefundStatus(refundSeqno, data) {
  const updates = [];
  const replacements = { refundSeqno };

  if (data.status) {
    updates.push("`status` = :status");
    replacements.status = data.status;
  }
  if (data.ret_code !== undefined) {
    updates.push("`ret_code` = :ret_code");
    replacements.ret_code = data.ret_code;
  }
  if (data.ret_msg !== undefined) {
    updates.push("`ret_msg` = :ret_msg");
    replacements.ret_msg = data.ret_msg;
  }
  if (data.platform_refundno !== undefined) {
    updates.push("`platform_refundno` = :platform_refundno");
    replacements.platform_refundno = data.platform_refundno;
  }

  if (updates.length === 0) return { ok: true, affected: 0 };

  updates.push("`updated_at` = NOW()");
  const sql = `UPDATE \`llpay_refund\` SET ${updates.join(", ")} WHERE \`refund_seqno\` = :refundSeqno`;

  try {
    const [, meta] = await sequelize.query(sql, { replacements, type: QueryTypes.UPDATE });
    return { ok: true, affected: meta?.affectedRows || 0 };
  } catch (error) {
    console.error("[LLPayRefund] update error:", error);
    return { ok: false, error };
  }
}

/**
 * 根据 refundSeqno 查询退款记录
 * @param {string} refundSeqno
 * @returns {Promise<Object|null>}
 */
async function findLLPayRefundBySeqno(refundSeqno) {
  const sql = "SELECT * FROM `llpay_refund` WHERE `refund_seqno` = :refundSeqno LIMIT 1";
  try {
    const rows = await sequelize.query(sql, {
      replacements: { refundSeqno },
      type: QueryTypes.SELECT,
    });
    return rows[0] || null;
  } catch (error) {
    console.error("[LLPayRefund] find error:", error);
    return null;
  }
}

module.exports = {
  createLLPayRefund,
  updateLLPayRefundStatus,
  findLLPayRefundBySeqno,
};
