const express = require("express");
const {
  listRefundApplies,
  getRefundApply,
  updateRefundApply,
} = require("../../integrations/order/repos/refundApplyRepo");
const {
  updateOrderItemStatusByIds,
  updateOrderItemStatusByOrderId,
  updateOrderItemStatusByOrderIdAndSkuIds,
} = require("../../integrations/order/repos/shopOrderItemRepo");
const { refundApply } = require("../../integrations/llpay/domains/refund/refund");
const { checkConnection } = require("../../db");

// Reusing enums from existing business logic
const RefundStatus = {
  TO_AUDIT: 10,
  THE_APPROVED: 20,
  HAVE_THE_GOODS: 30, 
  ABNORMAL_RECEIVING: 40,
  COMPLETE: 50,
  CLOSED: 60,
};

// Helper to normalize items
const normalizeRefundItems = (items) => {
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items || "[]");
  } catch (e) {
    return [];
  }
};

function collectRefundItemTargets(items) {
  const orderItemIds = new Set();
  const skuIds = new Set();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const orderItemId =
      item.orderItemId ||
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

/**
 * GET /api/admin/refunds
 * List refunds with pagination and filters
 */
router.get("/", async (req, res) => {
  const statusRaw = req.query.status;
  const status = statusRaw ? Number(statusRaw) : undefined;
  const orderId = req.query.orderId || null;
  const refundNo = req.query.refundNo || null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const result = await listRefundApplies({
    status,
    orderId,
    refundNo,
    limit: pageSize,
    offset,
  });

  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }

  return res.send({
    code: 0,
    data: {
      items: result.rows,
      pagination: {
        page,
        pageSize,
        total: result.total,
      },
    },
  });
});

/**
 * GET /api/admin/refunds/:refundNo
 * Get refund detail
 */
router.get("/:refundNo", async (req, res) => {
  const { refundNo } = req.params;
  
  const result = await getRefundApply({ refundNo });
  
  if (!result.ok) {
    return res.status(result.httpStatus).send(result.body);
  }
  
  if (!result.row) {
    return res.status(404).send({ code: -1, message: "退款单不存在", data: null });
  }

  return res.send({ code: 0, data: result.row });
});

/**
 * POST /api/admin/refunds/:refundNo/approve
 * Approve refund
 */
router.post("/:refundNo/approve", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({ code: -1, message: "数据库未连接", data: null });
  }

  const { refundNo } = req.params;
  const body = req.body || {};
  
  // 1. Get current status
  const detailRes = await getRefundApply({ refundNo });
  if (!detailRes.ok) return res.status(detailRes.httpStatus).send(detailRes.body);
  const row = detailRes.row;
  if (!row) return res.status(404).send({ code: -1, message: "退款单不存在", data: null });

  const statusNum = Number(row.status);
  if (Number.isFinite(statusNum) && statusNum !== RefundStatus.TO_AUDIT) {
    return res.status(400).send({ code: -1, message: "当前状态不允许审批", data: null });
  }

  const orderId = String(row.order_id || row.orderId);
  const refundReason = body.refundReason || row.refund_reason || row.refundReason || "Admin Approved";

  // 2. Call Payment Gateway
  const applyRes = await refundApply({
    order_id: orderId,
    refund_reason: refundReason,
    refund_seqno: refundNo,
  });

  // 3. Handle Failure
  if (!applyRes.ok) {
    // Optionally close it or keep it pending? 
    // Existing logic in refundRoutes.js closes it on failure.
    await updateRefundApply(
      { refundNo, orderId },
      {
        status: RefundStatus.CLOSED,
        auditResult: applyRes.body,
        updatedAt: new Date(),
      }
    );
    return res.status(applyRes.httpStatus).send(applyRes.body);
  }

  // 4. Handle Success
  // Status becomes THE_APPROVED (20) - waiting for callback, OR COMPLETE (50) if synchronous?
  // refundRoutes sets it to THE_APPROVED (20).
  const updateRes = await updateRefundApply(
    { refundNo, orderId },
    {
      status: RefundStatus.THE_APPROVED,
      llpayResponse: applyRes.body,
      updatedAt: new Date(),
    }
  );

  if (!updateRes.ok) return res.status(updateRes.httpStatus).send(updateRes.body);

  const rowItems = normalizeRefundItems(
    row?.items || row?.item_list || row?.refund_items
  );
  await updateOrderItemsStatus({
    orderId,
    items: rowItems.length ? rowItems : body.items,
    status: RefundStatus.THE_APPROVED,
  });

  // Return success
  return res.send({ code: 0, data: applyRes.body });
});

/**
 * POST /api/admin/refunds/:refundNo/reject
 * Reject refund
 */
router.post("/:refundNo/reject", async (req, res) => {
  const { refundNo } = req.params;
  const { rejectReason } = req.body;

  if (!rejectReason) {
    return res.status(400).send({ code: -1, message: "拒绝原因必填", data: null });
  }

  const detailRes = await getRefundApply({ refundNo });
  if (!detailRes.ok) return res.status(detailRes.httpStatus).send(detailRes.body);
  const row = detailRes.row;
  if (!row) return res.status(404).send({ code: -1, message: "退款单不存在", data: null });
  
  const orderId = String(row.order_id || row.orderId);

  const updateRes = await updateRefundApply(
    { refundNo, orderId },
    {
      status: RefundStatus.CLOSED,
      rejectReason,
      updatedAt: new Date(),
    }
  );

  if (!updateRes.ok) return res.status(updateRes.httpStatus).send(updateRes.body);

  const rowItems = normalizeRefundItems(
    row?.items || row?.item_list || row?.refund_items
  );
  await updateOrderItemsStatus({
    orderId,
    items: rowItems.length ? rowItems : req.body.items, // Handle items if provided in reject body, though unlikely
    status: RefundStatus.CLOSED,
  });

  return res.send({ code: 0, data: { refundNo, status: RefundStatus.CLOSED } });
});

module.exports = router;
