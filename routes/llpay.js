const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");
const { requestLLPayOpenapi } = require("../integrations/llpay/client/openapiClient");
const { getLLPayHttpStatus, safeTrim } = require("../utils/llpayRouteUtils");
const { createPay } = require("../integrations/llpay/domains/payment/createPay");
const {
  orderQuery,
  securedQuery,
} = require("../integrations/llpay/domains/query/llpayQuery");

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

const router = express.Router();

router.post("/pay", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const result = await createPay({ body: req.body, req });
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/refund-notify", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const refundNo =
    safeTrim(body.refund_seqno) ||
    safeTrim(body.refundSeqno) ||
    safeTrim(body.refund_no) ||
    safeTrim(body.refundNo);
  if (!refundNo) {
    return res.status(400).send({ code: -1, message: "refund_seqno 必须存在", data: null });
  }
  const retCode = safeTrim(body.ret_code || body.retCode);
  const status = retCode === "0000" ? 50 : 60;
  const columns = await getTableColumns("refund_apply");
  if (!columns) {
    return res.status(500).send({ code: -1, message: "refund_apply 表不存在", data: null });
  }
  const statusKey = pickFirstColumn(columns, ["status"]);
  const refundNoKey = pickFirstColumn(columns, ["refund_no", "refundNo", "refund_seqno", "refundSeqno"]);
  if (!statusKey || !refundNoKey) {
    return res.status(500).send({ code: -1, message: "refund_apply 字段不完整", data: null });
  }
  const notifyKey = pickFirstColumn(columns, ["notify_raw", "refund_response", "llpay_response"]);
  const updatedAtKey = pickFirstColumn(columns, ["updated_at", "updatedAt"]);
  const replacements = {
    status,
    refund_no: refundNo,
  };
  if (notifyKey) {
    replacements.notify_raw = normalizeJsonValue(body);
  }
  if (updatedAtKey) {
    replacements.updated_at = new Date();
  }
  const setParts = [`\`${statusKey}\` = :status`];
  if (notifyKey) setParts.push(`\`${notifyKey}\` = :notify_raw`);
  if (updatedAtKey) setParts.push(`\`${updatedAtKey}\` = :updated_at`);
  const sql = `UPDATE \`refund_apply\` SET ${setParts.join(
    ", "
  )} WHERE \`${refundNoKey}\` = :refund_no LIMIT 1`;
  const [, metadata] = await sequelize.query(sql, { replacements });
  const affectedRows =
    metadata && typeof metadata.affectedRows === "number" ? metadata.affectedRows : 0;
  return res.send({ code: 0, data: { refundNo, status, updated: affectedRows } });
});

router.post("/order-query", async (req, res) => {
  const result = await orderQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/secured-query", async (req, res) => {
  console.log("[LLPAY][route] /api/llpay/secured-query incoming", {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    body: req.body,
  });
  try {
    const result = await securedQuery(req.body);
    if (!result.ok) return res.status(result.httpStatus).send(result.body);
    return res.send(result.body);
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "担保交易查询异常",
      data: null,
    });
  }
});

router.post("/openapi", async (req, res) => {
  const path = req.body && typeof req.body.path === "string" ? req.body.path : "";
  const method =
    req.body && typeof req.body.method === "string" ? req.body.method : "POST";
  const body = req.body && typeof req.body.body === "object" ? req.body.body : {};

  try {
    const result = await requestLLPayOpenapi({ path, method, body });
    if (!result.ok) {
      const errCode = result.code || null;
      const statusCode =
        typeof result.statusCode === "number" ? result.statusCode : 0;
      const httpStatus = getLLPayHttpStatus(result);

      return res.status(httpStatus).send({
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      });
    }

    return res.send({
      code: 0,
      data: result.data,
      request: result.request,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: "连连请求异常",
      data: null,
    });
  }
});

module.exports = router;
