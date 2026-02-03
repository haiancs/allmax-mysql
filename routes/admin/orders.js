const express = require("express");
const {
  listOrders,
  countOrders,
  findOrderById,
} = require("../../repos/shopOrderRepo");
const { sequelize } = require("../../db");
const { QueryTypes } = require("sequelize");

const router = express.Router();

router.get("/", async (req, res) => {
  const id = typeof req.query._id === "string" ? req.query._id.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";

  const pageSizeRaw = req.query.pageSize;
  const pageRaw = req.query.page;
  const pageSizeNum = Number(pageSizeRaw);
  const pageNum = Number(pageRaw);
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const offset = (page - 1) * pageSize;

  const filter = {
    ids: id ? [id] : undefined,
    status,
    userId,
    offset,
    limit: pageSize,
  };

  const [items, total] = await Promise.all([
    listOrders(filter),
    countOrders(filter),
  ]);
  console.log(items);
  return res.send({
    code: 0,
    data: {
      items,
      pagination: {
        page,
        pageSize,
        total,
      },
    },
  });
});

router.get("/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    return res.status(400).send({
      code: -1,
      message: "id 必须存在",
      data: null,
    });
  }

  const order = await findOrderById(id);
  if (!order) {
    return res.status(404).send({
      code: -1,
      message: "订单不存在",
      data: null,
    });
  }

  const [items, deliveryInfoRows, paymentRows] = await Promise.all([
    sequelize.query(
      "SELECT `_id` AS `id`, `sku`, `count`, `distribution_record` AS `distributionRecordId`, `createdAt`, `updatedAt` FROM `shop_order_item` WHERE `order` = :orderId ORDER BY `createdAt` ASC",
      {
        replacements: { orderId: id },
        type: QueryTypes.SELECT,
      }
    ),
    order.deliveryInfoId
      ? sequelize.query(
          "SELECT `_id` AS `id`, `user` AS `userId`, `name`, `phone`, `address`, `idCard`, `createdAt`, `updatedAt` FROM `shop_delivery_info` WHERE `_id` = :id LIMIT 1",
          {
            replacements: { id: order.deliveryInfoId },
            type: QueryTypes.SELECT,
          }
        )
      : Promise.resolve([]),
    sequelize.query(
      "SELECT `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `platform_txno` AS `platformTxno`, `txnTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `orderId` = :orderId LIMIT 1",
      {
        replacements: { orderId: id },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  const deliveryInfo = deliveryInfoRows[0] || null;
  const payment = paymentRows[0] || null;

  return res.send({
    code: 0,
    data: {
      order,
      items,
      deliveryInfo,
      payment,
    },
  });
});

module.exports = router;
