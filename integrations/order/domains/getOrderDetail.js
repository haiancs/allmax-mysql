const { safeTrim, buildError } = require("../utils/orderValidation");
const { findOrderById } = require("../repos/shopOrderRepo");
const {
  listOrderItemsWithSkuSpuDistributionByOrderId,
} = require("../repos/shopOrderItemRepo");
const { findDeliveryInfoById } = require("../repos/shopDeliveryInfoRepo");
const { listAttrValuesBySkuIds } = require("../repos/shopAttrValueRepo");

async function getOrderDetail(input) {
  const orderIdRaw =
    typeof input?.query?.orderId === "string"
      ? input.query.orderId
      : typeof input?.body?.orderId === "string"
        ? input.body.orderId
        : "";
  const orderId = safeTrim(orderIdRaw);

  if (!orderId) {
    return buildError(400, "orderId 必须存在");
  }

  if (orderId.length > 64) {
    return buildError(400, "orderId 长度不能超过 64");
  }

  try {
    const [orderRow, itemRows] = await Promise.all([
      findOrderById(orderId, {
        attributes: ["id", "status", "totalPrice", "deliveryInfoId", "createdAt"],
      }),
      listOrderItemsWithSkuSpuDistributionByOrderId(orderId),
    ]);

    const orderData = orderRow?.get ? orderRow.get({ plain: true }) : orderRow;
    if (!orderData) {
      return buildError(404, "订单不存在");
    }

    const deliveryInfoId = safeTrim(orderData?.deliveryInfoId);
    const deliveryInfoRow = deliveryInfoId
      ? await findDeliveryInfoById(deliveryInfoId, {
          attributes: ["id", "name", "phone", "address"],
        })
      : null;
    const deliveryInfoData =
      deliveryInfoRow?.get ? deliveryInfoRow.get({ plain: true }) : deliveryInfoRow;

    const orderItemsRaw = itemRows || [];
    const skuIds = Array.from(
      new Set(
        orderItemsRaw
          .map((r) => (r?.skuId != null ? String(r.skuId).trim() : ""))
          .filter(Boolean)
      )
    );

    const attrValuesBySkuId = new Map();
    if (skuIds.length) {
      const attrRows = await listAttrValuesBySkuIds(skuIds);
      for (const row of attrRows || []) {
        const skuId = safeTrim(row?.skuId);
        const attrValueId = safeTrim(row?.attrValueId);
        if (!skuId || !attrValueId) continue;

        const list = attrValuesBySkuId.get(skuId) || [];
        list.push({
          _id: attrValueId,
          value: row?.value != null ? row.value : null,
        });
        attrValuesBySkuId.set(skuId, list);
      }
    }

    const orderItems = orderItemsRaw.map((row) => {
      const skuId = safeTrim(row?.skuId);
      const distributionRecordId = safeTrim(row?.distributionRecordId);
      const sharePrice =
        row?.sharePrice != null && row.sharePrice !== ""
          ? Number(row.sharePrice)
          : null;

      const spuId = safeTrim(row?.spuId);
      const spuName = row?.spuName != null ? String(row.spuName) : null;

      return {
        _id: row?.orderItemId != null ? String(row.orderItemId) : "",
        skuId,
        count: Number(row?.count || 0),
        sku: skuId
          ? {
              _id: skuId,
              image: row?.image != null ? String(row.image) : null,
              price: row?.price != null ? Number(row.price) : null,
              wholesale_price:
                row?.wholesalePrice != null ? Number(row.wholesalePrice) : null,
              attr_value: attrValuesBySkuId.get(skuId) || [],
              spu: spuId
                ? {
                    _id: spuId,
                    name: spuName,
                  }
                : null,
            }
          : null,
        distribution_record: distributionRecordId
          ? {
              _id: distributionRecordId,
              share_price: sharePrice,
            }
          : null,
      };
    });

    const orderItemVOs = orderItemsRaw.map((row) => ({
      spuId: safeTrim(row?.spuId),
    }));

    const order = {
      _id: orderData?.id != null ? String(orderData.id) : "",
      orderNo: orderData?.id != null ? String(orderData.id) : "",
      status: orderData?.status != null ? String(orderData.status) : null,
      totalPrice: orderData?.totalPrice != null ? Number(orderData.totalPrice) : null,
      createdAt: orderData?.createdAt != null ? orderData.createdAt : null,
      delivery_info: deliveryInfoData
        ? {
            _id: deliveryInfoData?.id != null ? String(deliveryInfoData.id) : "",
            name: deliveryInfoData?.name != null ? String(deliveryInfoData.name) : null,
            phone: deliveryInfoData?.phone != null ? String(deliveryInfoData.phone) : null,
            address:
              deliveryInfoData?.address != null
                ? String(deliveryInfoData.address)
                : null,
          }
        : null,
      orderItems,
      orderItemVOs,
    };

    return {
      ok: true,
      httpStatus: 200,
      body: { code: 0, data: { order } },
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: error?.message || "查询失败", data: null },
    };
  }
}

module.exports = {
  getOrderDetail,
};
