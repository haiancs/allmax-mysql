const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../db");
const { buildError } = require("../utils/orderValidation");

const refundTableColumnsCache = new Map();

async function getTableColumns(table) {
  if (refundTableColumnsCache.has(table)) {
    return refundTableColumnsCache.get(table);
  }
  try {
    const tableRows = await sequelize.query("SHOW TABLES LIKE :table", {
      replacements: { table },
      type: QueryTypes.SELECT,
    });
    if (!Array.isArray(tableRows) || tableRows.length === 0) {
      refundTableColumnsCache.set(table, null);
      return null;
    }
    const colRows = await sequelize.query(`SHOW COLUMNS FROM \`${table}\``, {
      type: QueryTypes.SELECT,
    });
    const columns = (colRows || [])
      .map((row) => row?.Field)
      .filter((field) => typeof field === "string" && field.length > 0);
    refundTableColumnsCache.set(table, columns);
    return columns;
  } catch {
    refundTableColumnsCache.set(table, null);
    return null;
  }
}

function pickFirstColumn(columns, candidates) {
  const colSet = new Set(columns || []);
  for (const key of candidates) {
    if (colSet.has(key)) return key;
  }
  return "";
}

function normalizeJsonValue(value) {
  if (value == null) return value;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function insertRefundApply(data) {
  const columns = await getTableColumns("refund_apply");
  if (!columns) {
    return buildError(500, "refund_apply 表不存在");
  }
  const orderIdKey = pickFirstColumn(columns, ["order_id", "orderId"]);
  const refundNoKey = pickFirstColumn(columns, [
    "refund_no",
    "refundNo",
    "refund_seqno",
    "refundSeqno",
  ]);
  if (!orderIdKey || !refundNoKey) {
    return buildError(500, "refund_apply 字段不完整");
  }
  const replacements = {};
  const keys = [];
  const pushValue = (key, value) => {
    if (!key) return;
    keys.push(key);
    replacements[key] = value;
  };
  pushValue(orderIdKey, data.orderId);
  pushValue(refundNoKey, data.refundNo);
  pushValue(
    pickFirstColumn(columns, ["refund_reason", "refundReason"]),
    data.refundReason
  );
  pushValue(
    pickFirstColumn(columns, ["refund_amount", "refundAmount"]),
    data.refundAmount
  );
  pushValue(pickFirstColumn(columns, ["status"]), data.status);
  pushValue(
    pickFirstColumn(columns, ["user_id", "userId", "user"]),
    data.userId
  );
  const itemsKey = pickFirstColumn(columns, ["items", "item_list", "refund_items"]);
  if (itemsKey) {
    pushValue(itemsKey, normalizeJsonValue(data.items));
  }
  const imageUrlsKey = pickFirstColumn(columns, ["image_urls", "imageUrls"]);
  if (imageUrlsKey) {
    pushValue(imageUrlsKey, normalizeJsonValue(data.imageUrls));
  }
  const refundMemoKey = pickFirstColumn(columns, ["refund_memo", "refundMemo"]);
  if (refundMemoKey) {
    pushValue(refundMemoKey, data.refundMemo);
  }
  const createdAtKey = pickFirstColumn(columns, ["created_at", "createdAt"]);
  const updatedAtKey = pickFirstColumn(columns, ["updated_at", "updatedAt"]);
  if (createdAtKey) pushValue(createdAtKey, data.createdAt || new Date());
  if (updatedAtKey) pushValue(updatedAtKey, data.updatedAt || new Date());
  if (!keys.length) {
    return buildError(400, "没有可写入的字段");
  }
  const sql = `INSERT INTO \`refund_apply\` (${keys
    .map((k) => `\`${k}\``)
    .join(", ")}) VALUES (${keys.map((k) => `:${k}`).join(", ")})`;
  try {
    await sequelize.query(sql, { replacements, type: QueryTypes.INSERT });
    return { ok: true, httpStatus: 200, record: replacements };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "写入退款单失败", data: null },
    };
  }
}

async function updateRefundApply(where, updates) {
  const columns = await getTableColumns("refund_apply");
  if (!columns) {
    return buildError(500, "refund_apply 表不存在");
  }
  const orderIdKey = pickFirstColumn(columns, ["order_id", "orderId"]);
  const refundNoKey = pickFirstColumn(columns, [
    "refund_no",
    "refundNo",
    "refund_seqno",
    "refundSeqno",
  ]);
  const statusKey = pickFirstColumn(columns, ["status"]);
  const auditKey = pickFirstColumn(columns, ["audit_result", "auditResult"]);
  const rejectKey = pickFirstColumn(columns, ["reject_reason", "rejectReason"]);
  const llpayKey = pickFirstColumn(columns, ["llpay_response", "refund_response"]);
  const updatedAtKey = pickFirstColumn(columns, ["updated_at", "updatedAt"]);

  const setParts = [];
  const replacements = {};
  if (statusKey && updates.status != null) {
    setParts.push(`\`${statusKey}\` = :status`);
    replacements.status = updates.status;
  }
  if (auditKey && updates.auditResult != null) {
    setParts.push(`\`${auditKey}\` = :audit_result`);
    replacements.audit_result = normalizeJsonValue(updates.auditResult);
  }
  if (rejectKey && updates.rejectReason != null) {
    setParts.push(`\`${rejectKey}\` = :reject_reason`);
    replacements.reject_reason = normalizeJsonValue(updates.rejectReason);
  }
  if (llpayKey && updates.llpayResponse != null) {
    setParts.push(`\`${llpayKey}\` = :llpay_response`);
    replacements.llpay_response = normalizeJsonValue(updates.llpayResponse);
  }
  if (updatedAtKey && updates.updatedAt != null) {
    setParts.push(`\`${updatedAtKey}\` = :updated_at`);
    replacements.updated_at = updates.updatedAt;
  }
  if (!setParts.length) {
    return buildError(400, "没有可更新的字段");
  }
  const whereParts = [];
  if (refundNoKey && where.refundNo) {
    whereParts.push(`\`${refundNoKey}\` = :refund_no`);
    replacements.refund_no = where.refundNo;
  }
  if (orderIdKey && where.orderId) {
    whereParts.push(`\`${orderIdKey}\` = :order_id`);
    replacements.order_id = where.orderId;
  }
  if (!whereParts.length) {
    return buildError(400, "缺少退款单条件");
  }
  const sql = `UPDATE \`refund_apply\` SET ${setParts.join(
    ", "
  )} WHERE ${whereParts.join(" AND ")} LIMIT 1`;
  try {
    const [, metadata] = await sequelize.query(sql, { replacements });
    const affectedRows =
      metadata && typeof metadata.affectedRows === "number"
        ? metadata.affectedRows
        : 0;
    return { ok: true, httpStatus: 200, affectedRows };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "更新退款单失败", data: null },
    };
  }
}

async function getRefundApply({ refundNo, orderId }) {
  const columns = await getTableColumns("refund_apply");
  if (!columns) {
    return buildError(500, "refund_apply 表不存在");
  }
  const refundNoKey = pickFirstColumn(columns, [
    "refund_no",
    "refundNo",
    "refund_seqno",
    "refundSeqno",
  ]);
  const orderIdKey = pickFirstColumn(columns, ["order_id", "orderId"]);
  const whereParts = [];
  const replacements = {};
  if (refundNoKey && refundNo) {
    whereParts.push(`\`${refundNoKey}\` = :refund_no`);
    replacements.refund_no = refundNo;
  }
  if (orderIdKey && orderId) {
    whereParts.push(`\`${orderIdKey}\` = :order_id`);
    replacements.order_id = orderId;
  }
  if (!whereParts.length) {
    return buildError(400, "refundNo 或 orderId 必须存在");
  }
  const sql = `SELECT * FROM \`refund_apply\` WHERE ${whereParts.join(
    " AND "
  )} LIMIT 1`;
  try {
    const rows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });
    return { ok: true, httpStatus: 200, row: rows?.[0] || null };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "查询退款单失败", data: null },
    };
  }
}

async function listRefundApplies({ status, orderId, refundNo, userId, limit, offset }) {
  const columns = await getTableColumns("refund_apply");
  if (!columns) {
    return buildError(500, "refund_apply 表不存在");
  }
  const refundNoKey = pickFirstColumn(columns, [
    "refund_no",
    "refundNo",
    "refund_seqno",
    "refundSeqno",
  ]);
  const orderIdKey = pickFirstColumn(columns, ["order_id", "orderId"]);
  const statusKey = pickFirstColumn(columns, ["status"]);
  const userIdKey = pickFirstColumn(columns, ["user_id", "userId", "user"]);

  const whereParts = [];
  const replacements = {};
  if (status != null) {
    if (!statusKey) {
      return buildError(500, "refund_apply 缺少 status 字段");
    }
    whereParts.push(`\`${statusKey}\` = :status`);
    replacements.status = status;
  }
  if (refundNo) {
    if (!refundNoKey) {
      return buildError(500, "refund_apply 缺少 refund_no 字段");
    }
    whereParts.push(`\`${refundNoKey}\` = :refund_no`);
    replacements.refund_no = refundNo;
  }
  if (orderId) {
    if (!orderIdKey) {
      return buildError(500, "refund_apply 缺少 order_id 字段");
    }
    whereParts.push(`\`${orderIdKey}\` = :order_id`);
    replacements.order_id = orderId;
  }
  if (userId) {
    if (!userIdKey) {
      return buildError(500, "refund_apply 缺少 user_id 字段");
    }
    whereParts.push(`\`${userIdKey}\` = :user_id`);
    replacements.user_id = userId;
  }
  const whereSql = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";
  const orderKey = pickFirstColumn(columns, [
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
    "refund_no",
    "refundNo",
    "refund_seqno",
    "refundSeqno",
    "order_id",
    "orderId",
  ]);
  const orderSql = orderKey ? ` ORDER BY \`${orderKey}\` DESC` : "";
  const sql = `SELECT * FROM \`refund_apply\`${whereSql}${orderSql} LIMIT :limit OFFSET :offset`;
  const countSql = `SELECT COUNT(1) as total FROM \`refund_apply\`${whereSql}`;
  replacements.limit = limit;
  replacements.offset = offset;
  try {
    const [rows, countRows] = await Promise.all([
      sequelize.query(sql, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(countSql, { replacements, type: QueryTypes.SELECT }),
    ]);
    const total = Number(countRows?.[0]?.total || 0);
    return { ok: true, httpStatus: 200, rows: rows || [], total };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "查询退款单列表失败", data: null },
    };
  }
}

module.exports = {
  insertRefundApply,
  updateRefundApply,
  getRefundApply,
  listRefundApplies,
};
