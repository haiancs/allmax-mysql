const express = require("express");
const { checkConnection } = require("../../../db");
const { createOrder } = require("../domains/createOrder");
const { cancelOrder } = require("../domains/cancelOrder");
const { confirmReceived } = require("../domains/confirmReceived");
const { markPaidOrToSend } = require("../domains/markPaidOrToSend");
const { cartSubmit } = require("../domains/cartSubmit");

const router = express.Router();

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
