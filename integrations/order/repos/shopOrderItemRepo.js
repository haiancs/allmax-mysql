const shopOrderItemRepo = require("../../../repos/shopOrderItemRepo");

module.exports = {
  ShopOrderItem: shopOrderItemRepo.ShopOrderItem,
  createOrderItem: shopOrderItemRepo.createOrderItem,
  createOrderItems: shopOrderItemRepo.createOrderItems,
  updateOrderItemById: shopOrderItemRepo.updateOrderItemById,
  deleteOrderItemById: shopOrderItemRepo.deleteOrderItemById,
  deleteOrderItemsByOrderId: shopOrderItemRepo.deleteOrderItemsByOrderId,
  findOrderItemById: shopOrderItemRepo.findOrderItemById,
  listOrderItems: shopOrderItemRepo.listOrderItems,
  listOrderItemsWithSkuSpuDistributionByOrderId:
    shopOrderItemRepo.listOrderItemsWithSkuSpuDistributionByOrderId,
  listOrderItemsWithSkuSpuDistributionByOrderIds:
    shopOrderItemRepo.listOrderItemsWithSkuSpuDistributionByOrderIds,
  listOrderItemsWithSkuSpuByOrderIds:
    shopOrderItemRepo.listOrderItemsWithSkuSpuByOrderIds,
  updateOrderItemStatusByIds: shopOrderItemRepo.updateOrderItemStatusByIds,
  updateOrderItemStatusByOrderId: shopOrderItemRepo.updateOrderItemStatusByOrderId,
  updateOrderItemStatusByOrderIdAndSkuIds:
    shopOrderItemRepo.updateOrderItemStatusByOrderIdAndSkuIds,
};
