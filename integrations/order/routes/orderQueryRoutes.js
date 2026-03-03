const express = require("express");
const { checkConnection } = require("../../../db");
const { getOrderDetail } = require("../domains/getOrderDetail");
const { listOrderPage } = require("../domains/listOrders");

const router = express.Router();

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Query order list
 *     tags: [Orders]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pageNumber:
 *                 type: integer
 *               pageSize:
 *                 type: integer
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: List retrieved
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
router.post("/orders", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const result = await listOrderPage(req.body);
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

/**
 * @swagger
 * /order/detail:
 *   get:
 *     summary: Get order detail (GET)
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detail retrieved
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
router.get("/order/detail", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await getOrderDetail({ query: req.query });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

/**
 * @swagger
 * /order/detail:
 *   post:
 *     summary: Get order detail (POST)
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Detail retrieved
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
router.post("/order/detail", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await getOrderDetail({ body: req.body });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

module.exports = router;
