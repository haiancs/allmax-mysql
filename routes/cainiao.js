// 菜鸟物流相关路由（/api/cainiao）
// - GET /status：返回菜鸟配置是否齐全（用于自检）
// - POST /deliveryorder/create：菜鸟发货创建（仅方式B：前端传 orderId，后端查库组装报文）
// - overrides：对组装后的发货报文做最高优先级的字段覆盖（用于补齐/修正个别字段）
const express = require("express");
const { checkConnection, sequelize } = require("../db");
const { requestCainiao } = require("../utils/cainiaoClient");
const { createCainiaoDeliveryOrder } = require("../services/cainiaoDeliveryService");

const router = express.Router();

function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function asTrimmedString(v) {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function getCainiaoCommonOptions(body) {
  const traceId = asTrimmedString(body.traceId) || null;
  const debugRequest = body.debugRequest === true;
  const timeoutMsRaw = body.timeoutMs;
  const timeoutMs = Number.isFinite(Number(timeoutMsRaw)) ? Number(timeoutMsRaw) : undefined;
  return { traceId, debugRequest, timeoutMs };
}

async function callCainiaoGateway({ msgType, logisticsInterface, common }) {
  const result = await requestCainiao(
    {
      msg_type: msgType,
      logistics_interface: logisticsInterface,
      traceId: common.traceId || null,
    },
    {
      timeoutMs: typeof common.timeoutMs === "number" ? common.timeoutMs : undefined,
      logRequest: common.debugRequest === true,
      debug: common.debugRequest === true,
    }
  );

  return result;
}

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
  const debugRequest = body.debugRequest === true;
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
    logRequest: debugRequest,
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

router.post("/crossborder/logistics/detail-query", async (req, res) => {
  const body = asObject(req.body) || {};
  const common = getCainiaoCommonOptions(body);

  const payload = asObject(body.logistics_interface) || asObject(body.logisticsInterface) || {};
  const lgOrderCode = asTrimmedString(payload.lgOrderCode);
  const userId = asTrimmedString(payload.userId);

  if (!lgOrderCode) {
    return res.status(400).send({ code: -1, message: "lgOrderCode 必须存在", data: null });
  }

  if (!userId) {
    return res.status(400).send({ code: -1, message: "userId 必须存在", data: null });
  }

  const result = await callCainiaoGateway({
    msgType: "CROSSBORDER_LOGISTICS_DETAIL_QUERY",
    logisticsInterface: { ...payload, lgOrderCode, userId },
    common,
  });

  if (!result?.success) {
    return res.status(500).send({
      code: -1,
      message: result?.message || "菜鸟请求失败",
      data: result || null,
    });
  }

  return res.send({ code: 0, data: result });
});

router.post("/crossborder/sales/cancel", async (req, res) => {
  const body = asObject(req.body) || {};
  const common = getCainiaoCommonOptions(body);

  const payload = asObject(body.logistics_interface) || asObject(body.logisticsInterface) || {};
  const orderSource = asTrimmedString(payload.orderSource);
  const lgOrderCode = asTrimmedString(payload.lgOrderCode);
  const externalOrderId = asTrimmedString(payload.externalOrderId);
  const userId = asTrimmedString(payload.userId);

  if (!orderSource) {
    return res.status(400).send({ code: -1, message: "orderSource 必须存在", data: null });
  }

  if (!lgOrderCode) {
    return res.status(400).send({ code: -1, message: "lgOrderCode 必须存在", data: null });
  }

  if (!externalOrderId) {
    return res.status(400).send({ code: -1, message: "externalOrderId 必须存在", data: null });
  }

  if (!userId) {
    return res.status(400).send({ code: -1, message: "userId 必须存在", data: null });
  }

  const result = await callCainiaoGateway({
    msgType: "CROSSBORDER_SALES_CANCEL",
    logisticsInterface: { ...payload, orderSource, lgOrderCode, externalOrderId, userId },
    common,
  });

  if (!result?.success) {
    return res.status(500).send({
      code: -1,
      message: result?.message || "菜鸟请求失败",
      data: result || null,
    });
  }

  return res.send({ code: 0, data: result });
});

router.post("/global-sale/order/intercept-notify", async (req, res) => {
  const body = asObject(req.body) || {};
  const common = getCainiaoCommonOptions(body);

  const payload = asObject(body.logistics_interface) || asObject(body.logisticsInterface) || {};
  const mailNo = asTrimmedString(payload.mailNo);
  const externalOrderCode = asTrimmedString(payload.externalOrderCode);
  const lgOrderCode = asTrimmedString(payload.lgOrderCode);
  const userId = asTrimmedString(payload.userId);

  if (!userId) {
    return res.status(400).send({ code: -1, message: "userId 必须存在", data: null });
  }

  if (!externalOrderCode && !lgOrderCode) {
    return res.status(400).send({
      code: -1,
      message: "externalOrderCode 与 lgOrderCode 二选一必填",
      data: null,
    });
  }

  const result = await callCainiaoGateway({
    msgType: "GLOBAL_SALE_ORDER_INTERCEPT_NOTIFY",
    logisticsInterface: {
      ...payload,
      mailNo: mailNo || undefined,
      externalOrderCode: externalOrderCode || undefined,
      lgOrderCode: lgOrderCode || undefined,
      userId,
    },
    common,
  });

  if (!result?.success) {
    return res.status(500).send({
      code: -1,
      message: result?.message || "菜鸟请求失败",
      data: result || null,
    });
  }

  return res.send({ code: 0, data: result });
});

router.post("/global-sale/order/refund-notify", async (req, res) => {
  const body = asObject(req.body) || {};
  const common = getCainiaoCommonOptions(body);

  const payload = asObject(body.logistics_interface) || asObject(body.logisticsInterface) || {};
  const receiver = asObject(payload.receiver);
  const sender = asObject(payload.sender);
  const srcOrderCode = asTrimmedString(payload.srcOrderCode);
  const userId = asTrimmedString(payload.userId);
  const refundOrderId = asTrimmedString(payload.refundOrderId);
  const mailNo = asTrimmedString(payload.mailNo);
  const packageItems = Array.isArray(payload.packageItems) ? payload.packageItems : null;
  const channelCode = asTrimmedString(payload.channelCode);
  const storeCode = asTrimmedString(payload.storeCode);

  if (!receiver) {
    return res.status(400).send({ code: -1, message: "receiver 必须为对象", data: null });
  }

  if (!sender) {
    return res.status(400).send({ code: -1, message: "sender 必须为对象", data: null });
  }

  if (!srcOrderCode) {
    return res.status(400).send({ code: -1, message: "srcOrderCode 必须存在", data: null });
  }

  if (!userId) {
    return res.status(400).send({ code: -1, message: "userId 必须存在", data: null });
  }

  if (!refundOrderId) {
    return res.status(400).send({ code: -1, message: "refundOrderId 必须存在", data: null });
  }

  if (!mailNo) {
    return res.status(400).send({ code: -1, message: "mailNo 必须存在", data: null });
  }

  if (!packageItems || packageItems.length === 0) {
    return res.status(400).send({ code: -1, message: "packageItems 必须为非空数组", data: null });
  }

  if (!channelCode) {
    return res.status(400).send({ code: -1, message: "channelCode 必须存在", data: null });
  }

  if (!storeCode) {
    return res.status(400).send({ code: -1, message: "storeCode 必须存在", data: null });
  }

  const result = await callCainiaoGateway({
    msgType: "GLOBAL_SALE_ORDER_REFUND_NOTIFY",
    logisticsInterface: {
      ...payload,
      receiver,
      sender,
      srcOrderCode,
      userId,
      refundOrderId,
      mailNo,
      packageItems,
      channelCode,
      storeCode,
    },
    common,
  });

  if (!result?.success) {
    return res.status(500).send({
      code: -1,
      message: result?.message || "菜鸟请求失败",
      data: result || null,
    });
  }

  return res.send({ code: 0, data: result });
});

module.exports = router;
