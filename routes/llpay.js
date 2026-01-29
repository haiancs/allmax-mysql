const express = require("express");
const { checkConnection } = require("../db");
const { requestLLPayOpenapi } = require("../integrations/llpay/client/openapiClient");
const { getLLPayHttpStatus } = require("../utils/llpayRouteUtils");
const { createPay } = require("../integrations/llpay/domains/payment/createPay");
const {
  refundApply,
  refundQuery,
} = require("../integrations/llpay/domains/refund/refund");
const {
  orderQuery,
  securedQuery,
} = require("../integrations/llpay/domains/query/llpayQuery");

const router = express.Router();

router.post("/pay", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const result = await createPay({ body: req.body, req });
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/refund", async (req, res) => {
  const result = await refundApply(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/refund-query", async (req, res) => {
  const result = await refundQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/order-query", async (req, res) => {
  const result = await orderQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/secured-query", async (req, res) => {
  console.log("[LLPAY][route] /api/llpay/secured-query incoming", {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    body: req.body,
  });
  const result = await securedQuery(req.body);
  if (!result.ok) return res.status(result.httpStatus).send(result.body);
  return res.send(result.body);
});

router.post("/openapi", async (req, res) => {
  const path = req.body && typeof req.body.path === "string" ? req.body.path : "";
  const method =
    req.body && typeof req.body.method === "string" ? req.body.method : "POST";
  const body = req.body && typeof req.body.body === "object" ? req.body.body : {};

  try {
    const result = await requestLLPayOpenapi({ path, method, body });
    if (!result.ok) {
      const errCode = result.code || null;
      const statusCode =
        typeof result.statusCode === "number" ? result.statusCode : 0;
      const httpStatus = getLLPayHttpStatus(result);

      return res.status(httpStatus).send({
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      });
    }

    return res.send({
      code: 0,
      data: result.data,
      request: result.request,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: "连连请求异常",
      data: null,
    });
  }
});

module.exports = router;
