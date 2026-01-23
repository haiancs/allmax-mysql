const express = require("express");
const { checkConnection } = require("../../db");
const { securedConfirm } = require("../../integrations/llpay/domains/securedTxn/securedConfirm");
const {
  cancelSecuredPayment,
} = require("../../integrations/llpay/domains/securedTxn/cancelSecuredPayment");

const router = express.Router();

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

router.post("/cancel-secured-payment", async (req, res) => {
  const result = await cancelSecuredPayment(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

module.exports = router;

