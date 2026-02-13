const { sequelize } = require("../../../db");
const { updateOrderStatusInTransaction } = require("../../../services/shopOrderService");
const { safeTrim, buildError } = require("../utils/orderValidation");

async function updateOrderStatus(input) {
  const orderId = safeTrim(input?.orderId || input?.body?.orderId);
  const status = safeTrim(input?.body?.status);

  if (!orderId) {
    return buildError(400, "orderId 必须存在");
  }

  if (orderId.length > 64) {
    return buildError(400, "orderId 长度不能超过 64");
  }

  if (!status) {
    return buildError(400, "status 必须存在");
  }

  if (status.length > 64) {
    return buildError(400, "status 长度不能超过 64");
  }

  const nowMs = Date.now();

  try {
    const result = await sequelize.transaction((transaction) =>
      updateOrderStatusInTransaction(
        {
          orderId,
          status,
          nowMs,
        },
        transaction
      )
    );

    return {
      ok: true,
      httpStatus: 200,
      body: {
        code: 0,
        data: result,
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
        message: error?.message || "更新订单状态失败",
        data: null,
      },
    };
  }
}

module.exports = {
  updateOrderStatus,
};
