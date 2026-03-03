const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");
const { requestLLPayOpenapi } = require("../integrations/llpay/client/openapiClient");
const { getLLPayHttpStatus, safeTrim } = require("../utils/llpayRouteUtils");
const { createPay } = require("../integrations/llpay/domains/payment/createPay");
const {
  orderQuery,
  securedQuery,
  refundQuery,
  accpOrderQuery,
} = require("../integrations/llpay/domains/query/llpayQuery");
const {
  applyPushPay,
  queryPushPayInfo,
} = require("../integrations/llpay/domains/customs/customsPush");
const {
  individualOpenAcctApply,
} = require("../integrations/llpay/domains/customer/accpCustomer");

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

/**
 * @swagger
 * /llpay/pay:
 *   post:
 *     summary: Create payment
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Payment parameters depending on payment type
 *     responses:
 *       200:
 *         description: Payment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       503:
 *         description: Database not connected
 */
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

/**
 * @swagger
 * /llpay/refund-notify:
 *   post:
 *     summary: Refund notification callback
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refund_seqno
 *             properties:
 *               refund_seqno:
 *                 type: string
 *               ret_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /llpay/order-query:
 *   post:
 *     summary: Query order status
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Order status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 */
router.post("/order-query", async (req, res) => {
  const result = await orderQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/accp/order-query:
 *   post:
 *     summary: Query ACCP order status
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Order status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 */
router.post("/accp/order-query", async (req, res) => {
  const result = await accpOrderQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/openacct/individual-apply:
 *   post:
 *     summary: Apply for individual open account
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Application submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       503:
 *         description: Database not connected
 */
router.post("/openacct/individual-apply", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const result = await individualOpenAcctApply(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/customs/apply-pushpay:
 *   post:
 *     summary: Apply for customs push payment
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Application submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       503:
 *         description: Database not connected
 */
router.post("/customs/apply-pushpay", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const result = await applyPushPay(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/customs/query-pushpay:
 *   post:
 *     summary: Query customs push payment info
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Info retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 */
router.post("/customs/query-pushpay", async (req, res) => {
  const result = await queryPushPayInfo(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/secured-query:
 *   post:
 *     summary: Query secured transaction status
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       500:
 *         description: Server error
 */
router.post("/secured-query", async (req, res) => {
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

/**
 * @swagger
 * /llpay/refund-query:
 *   post:
 *     summary: Query refund status
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 */
router.post("/refund-query", async (req, res) => {
  const result = await refundQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/openapi:
 *   post:
 *     summary: Proxy request to LLPay OpenAPI
 *     tags: [LLPay]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               path:
 *                 type: string
 *               method:
 *                 type: string
 *                 default: POST
 *               body:
 *                 type: object
 *     responses:
 *       200:
 *         description: Request successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       500:
 *         description: Server error
 */
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
