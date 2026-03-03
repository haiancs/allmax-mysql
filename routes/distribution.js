const express = require("express");
const { createOrderWithCommission, getUserDashboard } = require("../services/distributionService");

const router = express.Router();

/**
 * @swagger
 * /distribution/orders:
 *   post:
 *     summary: Create a distribution order
 *     tags: [Distribution]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - openId
 *               - items
 *             properties:
 *               openId:
 *                 type: string
 *                 description: User openId
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
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
 *         description: Bad request (missing fields or product not found)
 *       500:
 *         description: Server error
 */
router.post("/orders", async (req, res) => {
  try {
    const result = await createOrderWithCommission(req.body);
    res.send({
      code: 0,
      data: result,
    });
  } catch (error) {
    const status =
      error.message === "openId and items are required" ||
      error.message === "some products not found" ||
      error.message.includes("product") ||
      error.message.includes("not found")
        ? 400
        : 500;
    res.status(status).send({
      code: -1,
      message: error.message || "下单失败",
      data: null,
    });
  }
});

/**
 * @swagger
 * /distribution/users/{id}/dashboard:
 *   get:
 *     summary: Get user distribution dashboard
 *     tags: [Distribution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
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
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get("/users/:id/dashboard", async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await getUserDashboard(userId);
    res.send({
      code: 0,
      data: result,
    });
  } catch (error) {
    const status = error.message === "user not found" ? 404 : 500;
    res.status(status).send({
      code: -1,
      message: error.message || "获取用户数据失败",
      data: null,
    });
  }
});

module.exports = router;

