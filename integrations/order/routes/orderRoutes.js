const express = require("express");
const { checkConnection } = require("../../../db");
const { createOrder } = require("../domains/createOrder");
const { cancelOrder } = require("../domains/cancelOrder");
const { confirmReceived } = require("../domains/confirmReceived");
const { markPaidOrToSend } = require("../domains/markPaidOrToSend");
const { updateOrderStatus } = require("../domains/updateOrderStatus");
const { cartSubmit } = require("../domains/cartSubmit");

const router = express.Router();

/**
 * @swagger
 * /shop/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The user ID
 *               clientOrderNo:
 *                 type: string
 *                 description: Unique client order number
 *               addressId:
 *                 type: string
 *                 description: Address ID or raw address string
 *               isDistributor:
 *                 type: boolean
 *                 description: Whether the user is a distributor
 *               orderItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     skuId:
 *                       type: string
 *                     count:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Order created successfully
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
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post("/orders", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await createOrder(req.body);
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

// 取消订单
router.post("/orders/:orderId/cancel", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await cancelOrder({ orderId: req.params.orderId, body: req.body });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

// 确认订单已收到
router.post("/orders/:orderId/confirm-received", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await confirmReceived({ orderId: req.params.orderId, body: req.body });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

// 标记订单为已支付或待发货
router.post("/orders/:orderId/mark-paid-or-to-send", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await markPaidOrToSend({ orderId: req.params.orderId, body: req.body });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

router.post("/orders/:orderId/status", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await updateOrderStatus({
    orderId: req.params.orderId,
    body: req.body,
  });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

// 提交购物车订单
router.post("/cart/submit", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await cartSubmit(req.body);
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

module.exports = router;
