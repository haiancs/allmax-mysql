const shopAttrValueRepo = require("../../../repos/shopAttrValueRepo");

module.exports = {
  ShopAttrValue: shopAttrValueRepo.ShopAttrValue,
  createAttrValue: shopAttrValueRepo.createAttrValue,
  updateAttrValueById: shopAttrValueRepo.updateAttrValueById,
  deleteAttrValueById: shopAttrValueRepo.deleteAttrValueById,
  findAttrValueById: shopAttrValueRepo.findAttrValueById,
  listAttrValues: shopAttrValueRepo.listAttrValues,
  listAttrValuesBySkuIds: shopAttrValueRepo.listAttrValuesBySkuIds,
};
