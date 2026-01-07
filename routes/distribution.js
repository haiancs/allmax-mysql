const express = require("express");
const { createOrderWithCommission, getUserDashboard } = require("../services/distributionService");

const router = express.Router();

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

