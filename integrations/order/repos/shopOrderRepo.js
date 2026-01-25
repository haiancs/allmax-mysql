const shopOrderRepo = require("../../../repos/shopOrderRepo");

module.exports = {
  createOrder: shopOrderRepo.createOrder,
  updateOrderById: shopOrderRepo.updateOrderById,
  deleteOrderById: shopOrderRepo.deleteOrderById,
  findOrderById: shopOrderRepo.findOrderById,
  findOrderByClientOrderNo: shopOrderRepo.findOrderByClientOrderNo,
  listOrders: shopOrderRepo.listOrders,
  countOrders: shopOrderRepo.countOrders,
};
