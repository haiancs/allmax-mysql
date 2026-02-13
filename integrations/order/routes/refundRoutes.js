const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../../../db");
const { safeTrim, buildError } = require("../utils/orderValidation");
const llpayRepo = require("../../llpay/repos/llpayRepo");
const { refundApply } = require("../../llpay/domains/refund/refund");
const {
  buildRefundSeqnoFromOrderId,
  safeNumber,
} = require("../../../utils/llpayRouteUtils");
const {
  insertRefundApply,
  updateRefundApply,
  getRefundApply,
  listRefundApplies,
} = require("../repos/refundApplyRepo");
const {
  updateOrderItemStatusByIds,
  updateOrderItemStatusByOrderId,
  updateOrderItemStatusByOrderIdAndSkuIds,
} = require("../repos/shopOrderItemRepo");

const AfterServiceStatus = {
  TO_AUDIT: 10,
  THE_APPROVED: 20,
  HAVE_THE_GOODS: 30,
  ABNORMAL_RECEIVING: 40,
  COMPLETE: 50,
  CLOSED: 60,
};
const OrderItemAfterServiceStatus = {
  TO_AUDIT: 10,
  THE_APPROVED: 20,
  CLOSED: 60,
};

const router = express.Router();

function normalizeRefundItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return [];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function collectRefundItemTargets(items) {
  const orderItemIds = new Set();
  const skuIds = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const orderItemId =
      item.orderItemId ||
      item.order_item_id ||
      item.orderItemID ||
      item.orderItemid ||
      item.order_item ||
      item.orderItem ||
      item.id ||
      item._id;
    const skuId = item.skuId || item.sku_id || item.sku;
    if (orderItemId != null && String(orderItemId).trim()) {
      orderItemIds.add(String(orderItemId).trim());
    }
    if (skuId != null && String(skuId).trim()) {
      skuIds.add(String(skuId).trim());
    }
  }
  return {
    orderItemIds: Array.from(orderItemIds),
    skuIds: Array.from(skuIds),
  };
}

async function updateOrderItemsStatus({ orderId, items, status }) {
  const targets = collectRefundItemTargets(items);
  if (targets.orderItemIds.length) {
    return updateOrderItemStatusByIds({ orderItemIds: targets.orderItemIds, status });
  }
  if (targets.skuIds.length) {
    return updateOrderItemStatusByOrderIdAndSkuIds({
      orderId,
      skuIds: targets.skuIds,
      status,
    });
  }
  return updateOrderItemStatusByOrderId({ orderId, status });
}

router.post("/apply", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orderId = safeTrim(body.orderId || body.order_id || body.id);
  const refundReason = safeTrim(body.refundReason || body.refund_reason);
  const items = Array.isArray(body.items) ? body.items : [];
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  const refundMemo = safeTrim(body.refundMemo || body.refund_memo);

  if (!orderId) {
    const err = buildError(400, "orderId 必须存在");
    return res.status(err.httpStatus).send(err.body);
  }
  if (!refundReason) {
    const err = buildError(400, "refundReason 必须存在");
    return res.status(err.httpStatus).send(err.body);
  }

  const [llpay, orderRows] = await Promise.all([
    llpayRepo.findByOrderId(orderId),
    sequelize.query(
      "SELECT `_id`, `totalPrice`, `status`, `user`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1",
      { replacements: { orderId }, type: QueryTypes.SELECT }
    ),
  ]);

  if (!llpay) {
    const err = buildError(404, "支付单不存在");
    return res.status(err.httpStatus).send(err.body);
  }

  const order = orderRows?.[0] || null;
  if (!order) {
    const err = buildError(404, "订单不存在");
    return res.status(err.httpStatus).send(err.body);
  }

  const amountFen = safeNumber(llpay?.amountFen, NaN);
  const totalPriceNum = safeNumber(order?.totalPrice, NaN);
  let refundAmount = "";
  if (Number.isFinite(amountFen) && amountFen > 0) {
    refundAmount = (amountFen / 100).toFixed(2);
  } else if (Number.isFinite(totalPriceNum) && totalPriceNum > 0) {
    refundAmount = totalPriceNum.toFixed(2);
  }
  const refundAmountNum = safeNumber(refundAmount, 0);
  if (!(refundAmountNum > 0)) {
    const err = buildError(400, "退款金额无效");
    return res.status(err.httpStatus).send(err.body);
  }

  const refundNo = buildRefundSeqnoFromOrderId(orderId);
  if (!refundNo) {
    const err = buildError(500, "退款单号生成失败");
    return res.status(err.httpStatus).send(err.body);
  }

  const existing = await getRefundApply({ refundNo, orderId });
  if (existing.ok && existing.row) {
    return res.send({ code: 0, data: existing.row });
  }

  const insertRes = await insertRefundApply({
    orderId,
    refundNo,
    refundReason,
    refundAmount,
    status: AfterServiceStatus.TO_AUDIT,
    userId: safeTrim(order?.user),
    items,
    imageUrls,
    refundMemo,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (!insertRes.ok) {
    return res.status(insertRes.httpStatus).send(insertRes.body);
  }

  await updateOrderItemsStatus({
    orderId,
    items,
    status: OrderItemAfterServiceStatus.TO_AUDIT,
  });

  const detailRes = await getRefundApply({ refundNo, orderId });
  if (!detailRes.ok) {
    return res.status(detailRes.httpStatus).send(detailRes.body);
  }
  return res.send({ code: 0, data: detailRes.row || insertRes.record });
});

router.post("/refund/list", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const pageNumber = Number(body.pageNumber || 1);
  const pageSize = Number(body.pageSize || 10);
  if (!Number.isFinite(pageNumber) || pageNumber <= 0 || !Number.isInteger(pageNumber)) {
    const err = buildError(400, "pageNumber 必须为正整数");
    return res.status(err.httpStatus).send(err.body);
  }
  if (!Number.isFinite(pageSize) || pageSize <= 0 || !Number.isInteger(pageSize)) {
    const err = buildError(400, "pageSize 必须为正整数");
    return res.status(err.httpStatus).send(err.body);
  }
  if (pageSize > 100) {
    const err = buildError(400, "pageSize 不能超过 100");
    return res.status(err.httpStatus).send(err.body);
  }
  const status = body.status != null && body.status !== "" ? Number(body.status) : null;
  if (status != null && !Number.isFinite(status)) {
    const err = buildError(400, "status 必须为数字");
    return res.status(err.httpStatus).send(err.body);
  }
  const orderId = safeTrim(body.orderId || body.order_id);
  const refundNo = safeTrim(
    body.refundNo || body.refund_no || body.refundSeqno || body.refund_seqno
  );
  const userId = safeTrim(body.userId || body.user_id || body.user);
  const offset = (pageNumber - 1) * pageSize;
  const listRes = await listRefundApplies({
    status,
    orderId: orderId || null,
    refundNo: refundNo || null,
    userId: userId || null,
    limit: pageSize,
    offset,
  });
  if (!listRes.ok) {
    return res.status(listRes.httpStatus).send(listRes.body);
  }
  return res.send({ code: 0, data: { records: listRes.rows, total: listRes.total } });
});

router.post("/refund/cancel", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const refundNo = safeTrim(
    body.refundNo || body.refund_no || body.refundSeqno || body.refund_seqno
  );
  const orderId = safeTrim(body.orderId || body.order_id);
  const detailRes = await getRefundApply({ refundNo, orderId });
  if (!detailRes.ok) {
    return res.status(detailRes.httpStatus).send(detailRes.body);
  }
  const row = detailRes.row;
  if (!row) {
    return res.status(404).send({ code: -1, message: "退款单不存在", data: null });
  }

  const statusRaw = row?.status;
  const statusNum = Number(statusRaw);
  if (Number.isFinite(statusNum) && statusNum !== AfterServiceStatus.TO_AUDIT) {
    return res.status(400).send({
      code: -1,
      message: "退款单状态不允许取消",
      data: null,
    });
  }

  const updateRes = await updateRefundApply(
    { refundNo, orderId },
    {
      status: AfterServiceStatus.CLOSED,
      updatedAt: new Date(),
    }
  );

  if (!updateRes.ok) {
    return res.status(updateRes.httpStatus).send(updateRes.body);
  }

  const rowItems = normalizeRefundItems(
    row?.items || row?.item_list || row?.refund_items
  );
  await updateOrderItemsStatus({
    orderId: row?.order_id || row?.orderId || orderId,
    items: rowItems.length ? rowItems : body.items,
    status: OrderItemAfterServiceStatus.CLOSED,
  });

  return res.send({ code: 0, data: { refundNo, status: AfterServiceStatus.CLOSED } });
});

router.post("/detail", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const refundNo = safeTrim(
    body.refundNo || body.refund_no || body.refundSeqno || body.refund_seqno
  );
  const orderId = safeTrim(body.orderId || body.order_id);
  const detailRes = await getRefundApply({ refundNo, orderId });
  if (!detailRes.ok) {
    return res.status(detailRes.httpStatus).send(detailRes.body);
  }
  if (!detailRes.row) {
    return res.status(404).send({ code: -1, message: "退款单不存在", data: null });
  }
  return res.send({ code: 0, data: detailRes.row });
});

router.post("/refund/approve", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const refundNo = safeTrim(
    body.refundNo || body.refund_no || body.refundSeqno || body.refund_seqno
  );
  const orderId = safeTrim(body.orderId || body.order_id);
  const detailRes = await getRefundApply({ refundNo, orderId });
  if (!detailRes.ok) {
    return res.status(detailRes.httpStatus).send(detailRes.body);
  }
  const row = detailRes.row;
  if (!row) {
    return res.status(404).send({ code: -1, message: "退款单不存在", data: null });
  }

  const statusRaw = row?.status;
  const statusNum = Number(statusRaw);
  if (Number.isFinite(statusNum) && statusNum !== AfterServiceStatus.TO_AUDIT) {
    return res.status(400).send({
      code: -1,
      message: "退款单状态不允许审批",
      data: null,
    });
  }

  const orderIdFromRow =
    row?.order_id != null
      ? String(row.order_id)
      : row?.orderId != null
        ? String(row.orderId)
        : orderId;
  const refundReason =
    row?.refund_reason != null
      ? String(row.refund_reason)
      : row?.refundReason != null
        ? String(row.refundReason)
        : safeTrim(body.refundReason || body.refund_reason);

  const applyRes = await refundApply({
    order_id: orderIdFromRow,
    refund_reason: refundReason,
    refund_seqno: refundNo || row?.refund_no || row?.refundNo || row?.refund_seqno || row?.refundSeqno,
  });

  if (!applyRes.ok) {
    const updateRes = await updateRefundApply(
      { refundNo, orderId: orderIdFromRow },
      {
        status: AfterServiceStatus.CLOSED,
        auditResult: applyRes.body,
        updatedAt: new Date(),
      }
    );
    if (!updateRes.ok) {
      return res.status(updateRes.httpStatus).send(updateRes.body);
    }
    return res.status(applyRes.httpStatus).send(applyRes.body);
  }

  const updateRes = await updateRefundApply(
    { refundNo, orderId: orderIdFromRow },
    {
      status: AfterServiceStatus.THE_APPROVED,
      llpayResponse: applyRes.body,
      updatedAt: new Date(),
    }
  );
  if (!updateRes.ok) {
    return res.status(updateRes.httpStatus).send(updateRes.body);
  }
  const rowItems = normalizeRefundItems(
    row?.items || row?.item_list || row?.refund_items
  );
  await updateOrderItemsStatus({
    orderId: orderIdFromRow,
    items: rowItems.length ? rowItems : body.items,
    status: OrderItemAfterServiceStatus.THE_APPROVED,
  });
  return res.send({ code: 0, data: applyRes.body });
});

router.post("/refund/reject", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const refundNo = safeTrim(
    body.refundNo || body.refund_no || body.refundSeqno || body.refund_seqno
  );
  const orderId = safeTrim(body.orderId || body.order_id);
  const rejectReason = safeTrim(body.rejectReason || body.reject_reason);
  const updateRes = await updateRefundApply(
    { refundNo, orderId },
    {
      status: AfterServiceStatus.CLOSED,
      rejectReason,
      updatedAt: new Date(),
    }
  );
  if (!updateRes.ok) {
    return res.status(updateRes.httpStatus).send(updateRes.body);
  }
  if (updateRes.affectedRows) {
    const detailRes = await getRefundApply({ refundNo, orderId });
    const rowItems = detailRes.ok
      ? normalizeRefundItems(
          detailRes.row?.items || detailRes.row?.item_list || detailRes.row?.refund_items
        )
      : [];
    await updateOrderItemsStatus({
      orderId,
      items: rowItems.length ? rowItems : body.items,
      status: OrderItemAfterServiceStatus.CLOSED,
    });
  }
  if (!updateRes.affectedRows) {
    return res.status(404).send({ code: -1, message: "退款单不存在", data: null });
  }
  return res.send({ code: 0, data: { refundNo, orderId, status: AfterServiceStatus.CLOSED } });
});

module.exports = router;
