const express = require("express");
const { checkConnection } = require("../../db");
const { securedConfirm } = require("../../integrations/llpay/domains/securedTxn/securedConfirm");
const {
  cancelSecuredPayment,
} = require("../../integrations/llpay/domains/securedTxn/cancelSecuredPayment");

const router = express.Router();

/**
 * @swagger
 * /llpay/accp/txn/secured-confirm:
 *   post:
 *     summary: Confirm secured transaction
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *               confirmAmount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Transaction confirmed
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
router.post("/secured-confirm", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await securedConfirm(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

/**
 * @swagger
 * /llpay/accp/txn/cancel-secured-payment:
 *   post:
 *     summary: Cancel secured payment
 *     tags: [LLPay]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment canceled
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
router.post("/cancel-secured-payment", async (req, res) => {
  const result = await cancelSecuredPayment(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

module.exports = router;

