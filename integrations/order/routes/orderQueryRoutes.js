const express = require("express");
const { checkConnection } = require("../../../db");
const { getOrderDetail } = require("../domains/getOrderDetail");
const { listOrderPage } = require("../domains/listOrders");

const router = express.Router();

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

router.get("/order/detail", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await getOrderDetail({ query: req.query, body: req.body });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

router.post("/order/detail", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const result = await getOrderDetail({ query: req.query, body: req.body });
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  return res.send(result.body);
});

module.exports = router;
