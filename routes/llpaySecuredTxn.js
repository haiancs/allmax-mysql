const express = require("express");
const crypto = require("crypto");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");
const { llpayOpenapiRequest } = require("../services/llpayOpenapiService");
const {
  safeTrim,
  buildTxnSeqnoFromOrderId,
  safeNumber,
  formatDateTimeCN,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../utils/llpayRouteUtils");

const router = express.Router();

function generateTxnSeqno(prefix, input) {
  const now = Date.now();
  const digest = crypto
    .createHash("sha256")
    .update(`${prefix}:${safeTrim(input)}:${now}:${crypto.randomBytes(8).toString("hex")}`)
    .digest("hex");
  return digest.slice(0, 32);
}

async function loadLLPayByTxnSeqno(txnSeqno) {
  const rows = await sequelize.query(
    "SELECT `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `platform_txno` AS `platformTxno`, `txnTime` FROM `llpay_v2` WHERE `txnSeqno` = :txnSeqno LIMIT 1",
    { replacements: { txnSeqno }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

async function forwardToLLPay(req, res, { path, actionName, body }) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  try {
    const result = await llpayOpenapiRequest({ path, method: "POST", body: reqBody });
    if (!result.ok) {
      const errCode = result.code || null;
      const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
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

    const apiData =
      typeof result.data === "string"
        ? tryParseJsonObject(result.data) || result.data
        : result.data;
    const apiObj = apiData && typeof apiData === "object" ? apiData : null;
    const retCode = safeTrim(apiObj?.ret_code);
    if (retCode && retCode !== "0000") {
      return res.status(502).send({
        code: -1,
        message: `${actionName}失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: result.request,
      });
    }

    return res.send({ code: 0, data: apiObj || apiData, request: result.request });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "连连请求异常",
      data: null,
    });
  }
}

router.post("/secured-confirm", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const orderId = safeTrim(body?.orderId || body?.order_id || body?.id);
  const txnSeqnoRaw = safeTrim(body?.txnSeqno || body?.txn_seqno) || (orderId ? buildTxnSeqnoFromOrderId(orderId) : "");
  const txnSeqno = safeTrim(txnSeqnoRaw);

  if (!txnSeqno) {
    return res.status(400).send({
      code: -1,
      message: "txnSeqno 或 orderId 必须存在",
      data: null,
    });
  }

  let llpay;
  try {
    llpay = await loadLLPayByTxnSeqno(txnSeqno);
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "查询支付单失败",
      data: null,
    });
  }

  if (!llpay) {
    return res.status(404).send({
      code: -1,
      message: "支付单不存在",
      data: null,
    });
  }

  const originalAmountFen = safeNumber(llpay?.amountFen, 0);
  if (!(originalAmountFen > 0)) {
    return res.status(400).send({
      code: -1,
      message: "支付单金额无效",
      data: null,
    });
  }

  const confirmMode = "ALL";

  const confirmAmountRaw = body?.confirmAmount ?? body?.confirm_amount ?? body?.order_amount;
  const confirmAmount =
    confirmAmountRaw == null
      ? Number((originalAmountFen / 100).toFixed(2))
      : Number(safeNumber(confirmAmountRaw, NaN).toFixed(2));

  if (!Number.isFinite(confirmAmount) || confirmAmount <= 0) {
    return res.status(400).send({
      code: -1,
      message: "confirmAmount 无效",
      data: null,
    });
  }

  const originalAmount = Number((originalAmountFen / 100).toFixed(2));
  if (confirmAmount > originalAmount) {
    return res.status(400).send({
      code: -1,
      message: "confirmAmount 不能大于原订单金额",
      data: null,
    });
  }

  const couponAmountRaw = body?.couponAmount ?? body?.coupon_amount;
  const couponAmount =
    couponAmountRaw == null ? null : Number(safeNumber(couponAmountRaw, NaN).toFixed(2));
  if (couponAmount != null && (!Number.isFinite(couponAmount) || couponAmount < 0)) {
    return res.status(400).send({
      code: -1,
      message: "couponAmount 无效",
      data: null,
    });
  }

  const confirmTxnSeqno = generateTxnSeqno("llpay_secured_confirm", txnSeqno);
  const confirmTxnTime = formatDateTimeCN(new Date());

  const payload = {
    original_orderInfo: { txn_seqno: txnSeqno, order_amount: originalAmount },
    confirm_orderInfo: {
      txn_seqno: confirmTxnSeqno,
      txn_time: confirmTxnTime,
      order_amount: confirmAmount,
      confirm_mode: confirmMode,
    },
  };
  if (couponAmount != null) payload.confirm_orderInfo.coupon_amount = couponAmount;

  let forwardRes;
  try {
    forwardRes = await llpayOpenapiRequest({
      path: "/v1/accp/txn/secured-confirm",
      method: "POST",
      body: payload,
    });
  } catch (error) {
    forwardRes = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!forwardRes.ok) {
    const errCode = forwardRes.code || null;
    const statusCode = typeof forwardRes.statusCode === "number" ? forwardRes.statusCode : 0;
    const httpStatus = getLLPayHttpStatus(forwardRes);

    return res.status(httpStatus).send({
      code: -1,
      message: forwardRes.error || "连连请求失败",
      statusCode,
      errorCode: errCode,
      data: forwardRes.data || null,
      request: forwardRes.request,
    });
  }

  const apiData =
    typeof forwardRes.data === "string"
      ? tryParseJsonObject(forwardRes.data) || forwardRes.data
      : forwardRes.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  if (retCode && retCode !== "0000") {
    return res.status(502).send({
      code: -1,
      message: `担保确认失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
      data: apiObj || apiData,
      request: forwardRes.request,
    });
  }

  try {
    await sequelize.query(
      "UPDATE `llpay_v2` SET `secured_confirm_txn_seqno` = :confirmTxnSeqno, `secured_confirm_txn_time` = :confirmTxnTime WHERE `txnSeqno` = :txnSeqno LIMIT 1",
      { replacements: { confirmTxnSeqno, confirmTxnTime, txnSeqno } }
    );
  } catch (_) {}

  return res.send({
    code: 0,
    data: apiObj || apiData,
    confirm: {
      originalTxnSeqno: txnSeqno,
      confirmTxnSeqno,
      confirmTxnTime,
      originalAmount,
      confirmAmount,
      confirmMode,
    },
    request: forwardRes.request,
  });
});

router.post("/cancel-secured-payment", async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const txnSeqnoFromBody = safeTrim(body?.txnSeqno || body?.txn_seqno);
  const confirmTxnSeqno = safeTrim(body?.confirmTxnSeqno || body?.confirm_txn_seqno) || txnSeqnoFromBody;

  if (!confirmTxnSeqno) {
    return res.status(400).send({
      code: -1,
      message: "confirmTxnSeqno 或 txnSeqno 必须存在（撤销的是担保确认单号）",
      data: null,
    });
  }

  return forwardToLLPay(req, res, {
    path: "/v1/accp/txn/cancel-secured-payment",
    actionName: "担保确认撤销",
    body: { txn_seqno: confirmTxnSeqno },
  });
});

module.exports = router;
