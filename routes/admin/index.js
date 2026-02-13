const express = require("express");
const { checkConnection } = require("../../db");
const paymentsRouter = require("./payments");
const ordersRouter = require("./orders");
const usersRouter = require("./users");
const productsRouter = require("./products");
const refundsRouter = require("./refunds");

const router = express.Router();

router.use((req, res, next) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  return next();
});

router.use("/payments", paymentsRouter);
router.use("/orders", ordersRouter);
router.use("/users", usersRouter);
router.use("/products", productsRouter);
router.use("/refunds", refundsRouter);

module.exports = router;

