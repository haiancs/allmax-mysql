const shopDeliveryInfoRepo = require("../../../repos/shopDeliveryInfoRepo");

module.exports = {
  ShopDeliveryInfo: shopDeliveryInfoRepo.ShopDeliveryInfo,
  createDeliveryInfo: shopDeliveryInfoRepo.createDeliveryInfo,
  updateDeliveryInfoById: shopDeliveryInfoRepo.updateDeliveryInfoById,
  deleteDeliveryInfoById: shopDeliveryInfoRepo.deleteDeliveryInfoById,
  findDeliveryInfoById: shopDeliveryInfoRepo.findDeliveryInfoById,
  listDeliveryInfo: shopDeliveryInfoRepo.listDeliveryInfo,
};
