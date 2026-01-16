const express = require("express");
const { requestCainiao } = require("../utils/cainiaoClient");

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

router.post("/request", async (req, res) => {
  const msg_type = typeof req?.body?.msg_type === "string" ? req.body.msg_type.trim() : "";
  const logistics_interface = req?.body?.logistics_interface;
  const to_code = typeof req?.body?.to_code === "string" ? req.body.to_code.trim() : "";
  const traceId = typeof req?.body?.traceId === "string" ? req.body.traceId.trim() : "";
  const debug = !!req?.body?.debug;
  const timeoutMsRaw = req?.body?.timeoutMs;
  const timeoutMs = Number.isFinite(Number(timeoutMsRaw)) ? Number(timeoutMsRaw) : undefined;

  if (!msg_type) {
    return res.status(400).send({
      code: -1,
      message: "msg_type 必须存在",
      data: null,
    });
  }

  if (!logistics_interface) {
    return res.status(400).send({
      code: -1,
      message: "logistics_interface 必须存在",
      data: null,
    });
  }

  const result = await requestCainiao(
    {
      msg_type,
      logistics_interface,
      to_code: to_code || null,
      traceId: traceId || null,
    },
    {
      debug,
      timeoutMs,
    }
  );

  if (!result?.success) {
    const isConfigError =
      result?.code === "MISSING_LOGISTIC_PROVIDER_ID" || result?.code === "MISSING_SECRET_KEY";
    const status = isConfigError ? 500 : 400;
    return res.status(status).send({
      code: -1,
      message: result?.message || "菜鸟请求失败",
      data: result || null,
    });
  }

  res.send({
    code: 0,
    data: result,
  });
});

module.exports = router;

