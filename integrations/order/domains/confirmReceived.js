const { sequelize } = require("../../../db");
const { confirmOrderReceivedInTransaction } = require("../../../services/shopOrderService");
const { safeTrim, buildError } = require("../utils/orderValidation");
const { securedConfirm } = require("../../llpay/domains/securedTxn/securedConfirm");

async function confirmReceived(input) {
  const orderId = safeTrim(input?.orderId || input?.body?.orderId);

  if (!orderId) {
    return buildError(400, "orderId 必须存在");
  }

  if (orderId.length > 64) {
    return buildError(400, "orderId 长度不能超过 64");
  }

  const nowMs = Date.now();

  try {
    const result = await sequelize.transaction((transaction) =>
      confirmOrderReceivedInTransaction(
        {
          orderId,
          nowMs,
        },
        transaction
      )
    );

    // 尝试发起担保确认（如果本地状态更新成功，或即使幂等命中也尝试确保支付确认）
    // 注意：这里失败不回滚本地状态，因为货物确实已收到
    try {
      const securedRes = await securedConfirm({ orderId });
      if (!securedRes.ok) {
        console.error(`[confirmReceived] Secured confirm failed for order ${orderId}:`, securedRes);
      } else {
        console.log(`[confirmReceived] Secured confirm success for order ${orderId}`);
      }
    } catch (err) {
      console.error(`[confirmReceived] Secured confirm error for order ${orderId}:`, err);
    }

    return {
      ok: true,
      httpStatus: 200,
      body: {
        code: 0,
        data: result.order,
      },
    };
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : 500;
    return {
      ok: false,
      httpStatus: statusCode,
      body: {
        code: -1,
        message: error?.message || "确认收货失败",
        data: null,
      },
    };
  }
}

module.exports = {
  confirmReceived,
};
