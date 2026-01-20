// 菜鸟物流相关路由（/api/cainiao）
// - GET /status：返回菜鸟配置是否齐全（用于自检）
// - POST /deliveryorder/create：菜鸟发货创建（仅方式B：前端传 orderId，后端查库组装报文）
// - overrides：对组装后的发货报文做最高优先级的字段覆盖（用于补齐/修正个别字段）
const express = require("express");
const { checkConnection, sequelize } = require("../db");
const { createCainiaoDeliveryOrder } = require("../services/cainiaoDeliveryService");

const router = express.Router();

router.get("/status", async (req, res) => {
  res.send({
    code: 0,
    data: {
      configured: {
        logisticProviderId: !!process.env.CAINIAO_LOGISTIC_PROVIDER_ID,
        secretKey: !!process.env.CAINIAO_SECRET_KEY,
        baseUrl: process.env.CAINIAO_BASE_URL || "https://prelink.cainiao.com/gateway/link.do",
      },
    },
  });
});

router.post("/deliveryorder/create", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : null;

  const traceId = typeof body.traceId === "string" ? body.traceId.trim() : "";
  const dryRun = body.dryRun === true;
  const timeoutMsRaw = body.timeoutMs;
  const timeoutMs = Number.isFinite(Number(timeoutMsRaw)) ? Number(timeoutMsRaw) : undefined;

  if (body.deliveryOrder != null || body.logistics_interface != null) {
    return res.status(400).send({
      code: -1,
      message: "该接口仅支持方式B：请传 orderId，不支持 deliveryOrder/logistics_interface",
      data: null,
    });
  }

  if (!orderId) {
    return res.status(400).send({
      code: -1,
      message: "orderId 必须存在",
      data: null,
    });
  }

  const result = await createCainiaoDeliveryOrder({
    sequelize,
    orderId,
    overrides,
    traceId: traceId || null,
    timeoutMs,
    dryRun,
  });

  if (!result.ok) {
    const status =
      result.code === "MISSING_FIELDS" || result.code === "MISSING_ORDER_ID" || result.code === "ORDER_NOT_FOUND"
        ? 400
        : 500;
    return res.status(status).send({
      code: -1,
      message: result.error || "菜鸟发货失败",
      data: {
        code: result.code,
        missingFields: result.missingFields || [],
        detail: result.data || null,
        deliveryOrder: result.deliveryOrder || null,
      },
    });
  }

  return res.send({
    code: 0,
    data: dryRun ? { deliveryOrder: result.deliveryOrder, missingFields: [] } : result.data,
  });
});

module.exports = router;
