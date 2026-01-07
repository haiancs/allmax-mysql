const { sequelize } = require("../db");
const {
  findUserById,
  findUserByOpenId,
  listUserOrders,
  createOrderWithItems,
  createCommissionRecords,
  getCommissionSummaryByUser,
  DistributorUser,
  Product,
} = require("../daos/distributionDao");

async function ensureUserByOpenId(openId, nickname, transaction) {
  let user = await findUserByOpenId(openId, { transaction });
  if (!user) {
    user = await DistributorUser.create(
      {
        openId,
        nickname,
      },
      { transaction }
    );
  }
  return user;
}

async function createOrderWithCommission(payload) {
  const { openId, nickname, items } = payload;
  if (!openId || !items || !items.length) {
    throw new Error("openId and items are required");
  }

  return sequelize.transaction(async (transaction) => {
    const user = await ensureUserByOpenId(openId, nickname || "", transaction);

    const productIds = items.map((i) => i.productId);
    const products = await Product.findAll({
      where: { id: productIds },
      transaction,
    });
    if (products.length !== productIds.length) {
      throw new Error("some products not found");
    }

    const itemsWithPrice = items.map((item) => {
      const product = products.find((p) => String(p.id) === String(item.productId));
      if (!product) {
        throw new Error(`product ${item.productId} not found`);
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        commissionRate: product.commissionRate || 0,
      };
    });

    const totalAmount = itemsWithPrice.reduce((sum, item) => {
      return sum + Number(item.unitPrice) * Number(item.quantity);
    }, 0);

    const orderData = {
      userId: user.id,
      totalAmount,
      status: "pending",
    };

    const { order, orderItems } = await createOrderWithItems(
      orderData,
      itemsWithPrice.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      { transaction }
    );

    const commissionRecordsPayload = itemsWithPrice.map((item) => {
      const amount =
        Number(item.unitPrice) * Number(item.quantity) * Number(item.commissionRate);
      return {
        orderId: order.id,
        userId: user.id,
        amount,
        level: 1,
        status: "pending",
      };
    });

    const commissionRecords = await createCommissionRecords(
      commissionRecordsPayload,
      { transaction }
    );

    return {
      order,
      orderItems,
      commissionRecords,
    };
  });
}

async function getUserDashboard(userId) {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("user not found");
  }
  const orders = await listUserOrders(userId);
  const commissionSummary = await getCommissionSummaryByUser(userId);

  return {
    user,
    orders,
    commissionSummary,
  };
}

module.exports = {
  createOrderWithCommission,
  getUserDashboard,
};
