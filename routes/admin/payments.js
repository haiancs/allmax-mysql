const express = require("express");
const llpayRepo = require("../../integrations/llpay/repos/llpayRepo");
const { sequelize } = require("../../db");
const { QueryTypes } = require("sequelize");

const router = express.Router();

router.get("/", async (req, res) => {
  const id = typeof req.query._id === "string" ? req.query._id.trim() : "";
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId.trim() : "";
  const txnSeqno = typeof req.query.txnSeqno === "string" ? req.query.txnSeqno.trim() : "";
  const platformTxno =
    typeof req.query.platformTxno === "string" ? req.query.platformTxno.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const where = [];
  const replacements = {};

  if (id) {
    where.push("`_id` = :id");
    replacements.id = id;
  }
  if (orderId) {
    where.push("`orderId` = :orderId");
    replacements.orderId = orderId;
  }
  if (txnSeqno) {
    where.push("`txnSeqno` = :txnSeqno");
    replacements.txnSeqno = txnSeqno;
  }
  if (platformTxno) {
    where.push("`platform_txno` = :platformTxno");
    replacements.platformTxno = platformTxno;
  }
  if (status) {
    where.push("`status` = :status");
    replacements.status = status;
  }

  const pageSizeRaw = req.query.pageSize;
  const pageRaw = req.query.page;
  const pageSizeNum = Number(pageSizeRaw);
  const pageNum = Number(pageRaw);
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const offset = (page - 1) * pageSize;

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const rows = await sequelize.query(
    `SELECT \`_id\` AS \`id\`, \`txnSeqno\`, \`orderId\`, \`userId\`, \`status\`, \`amountFen\`, \`platform_txno\` AS \`platformTxno\`, \`txnTime\`, \`createdAt\`, \`updatedAt\` FROM \`llpay_v2\` ${whereSql} ORDER BY \`createdAt\` DESC LIMIT :limit OFFSET :offset`,
    {
      replacements: { ...replacements, limit: pageSize, offset },
      type: QueryTypes.SELECT,
    }
  );

  const countRows = await sequelize.query(
    `SELECT COUNT(1) AS \`count\` FROM \`llpay_v2\` ${whereSql}`,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );
  const total = Number(countRows[0] && countRows[0].count) || 0;

  return res.send({
    code: 0,
    data: {
      items: rows,
      pagination: {
        page,
        pageSize,
        total,
      },
    },
  });
});

router.get("/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    return res.status(400).send({
      code: -1,
      message: "id 必须存在",
      data: null,
    });
  }

  const row = await llpayRepo.findById(id);
  if (!row) {
    return res.status(404).send({
      code: -1,
      message: "支付单不存在",
      data: null,
    });
  }

  return res.send({
    code: 0,
    data: row,
  });
});

module.exports = router;
