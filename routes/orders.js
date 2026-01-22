const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");

const router = express.Router();

async function handleGetOrderDetail(req, res) {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const orderIdRaw =
    typeof req?.query?.orderId === "string"
      ? req.query.orderId
      : typeof req?.body?.orderId === "string"
        ? req.body.orderId
        : "";
  const orderId = orderIdRaw.trim();

  if (!orderId) {
    return res.status(400).send({
      code: -1,
      message: "orderId 必须存在",
      data: null,
    });
  }

  if (orderId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "orderId 长度不能超过 64",
      data: null,
    });
  }

  try {
    const itemQuerySql = `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        oi.\`distribution_record\` AS \`distributionRecordId\`,
        s.\`price\` AS \`price\`,
        s.\`wholesale_price\` AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        sp.\`name\` AS \`spuName\`,
        dr.\`share_price\` AS \`sharePrice\`
      FROM \`shop_order_item\` oi
      INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
      LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
      LEFT JOIN \`shop_distribution_record\` dr ON dr.\`_id\` = oi.\`distribution_record\`
      WHERE oi.\`order\` = :orderId
      ORDER BY oi.\`_id\` ASC`;

    const [orderRows, itemRows] = await Promise.all([
      sequelize.query(
        "SELECT `_id`, `status`, `totalPrice`, `delivery_info`, `createdAt` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1",
        { replacements: { orderId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(itemQuerySql, {
        replacements: { orderId },
        type: QueryTypes.SELECT,
      }),
    ]);

    const orderRow = orderRows[0] || null;
    if (!orderRow) {
      return res.status(404).send({
        code: -1,
        message: "订单不存在",
        data: null,
      });
    }

    const deliveryInfoId =
      orderRow?.delivery_info != null ? String(orderRow.delivery_info).trim() : "";
    const deliveryInfoRows = deliveryInfoId
      ? await sequelize.query(
          "SELECT `_id`, `name`, `phone`, `address` FROM `shop_delivery_info` WHERE `_id` = :id LIMIT 1",
          { replacements: { id: deliveryInfoId }, type: QueryTypes.SELECT }
        )
      : [];
    const deliveryInfoRow = deliveryInfoRows[0] || null;

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
      const attrRows = await sequelize.query(
        `SELECT
          m.\`leftRecordId\` AS \`skuId\`,
          av.\`_id\` AS \`attrValueId\`,
          av.\`value\` AS \`value\`
        FROM \`mid_4RKieAhGh\` m
        INNER JOIN \`shop_attr_value\` av ON av.\`_id\` = m.\`rightRecordId\`
        WHERE m.\`leftRecordId\` IN (:skuIds)
        ORDER BY m.\`leftRecordId\` ASC, av.\`_id\` ASC`,
        { replacements: { skuIds }, type: QueryTypes.SELECT }
      );

      for (const row of attrRows || []) {
        const skuId = row?.skuId != null ? String(row.skuId).trim() : "";
        const attrValueId =
          row?.attrValueId != null ? String(row.attrValueId).trim() : "";
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
      const skuId = row?.skuId != null ? String(row.skuId).trim() : "";
      const distributionRecordId =
        row?.distributionRecordId != null
          ? String(row.distributionRecordId).trim()
          : "";
      const sharePrice =
        row?.sharePrice != null && row.sharePrice !== ""
          ? Number(row.sharePrice)
          : null;

      const spuId = row?.spuId != null ? String(row.spuId).trim() : "";
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
      spuId: row?.spuId != null ? String(row.spuId).trim() : "",
    }));

    const order = {
      _id: orderRow?._id != null ? String(orderRow._id) : "",
      orderNo: orderRow?._id != null ? String(orderRow._id) : "",
      status: orderRow?.status != null ? String(orderRow.status) : null,
      totalPrice: orderRow?.totalPrice != null ? Number(orderRow.totalPrice) : null,
      createdAt: orderRow?.createdAt != null ? orderRow.createdAt : null,
      delivery_info: deliveryInfoRow
        ? {
            _id: deliveryInfoRow?._id != null ? String(deliveryInfoRow._id) : "",
            name: deliveryInfoRow?.name != null ? String(deliveryInfoRow.name) : null,
            phone: deliveryInfoRow?.phone != null ? String(deliveryInfoRow.phone) : null,
            address:
              deliveryInfoRow?.address != null ? String(deliveryInfoRow.address) : null,
          }
        : null,
      orderItems,
      orderItemVOs,
    };

    return res.send({ code: 0, data: { order } });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error?.message || "查询失败",
      data: null,
    });
  }
}

// 获取订单列表
router.post("/orders", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body || {};

  const pageNumberRaw =
    typeof body.pageNumber === "string"
      ? body.pageNumber
      : typeof body.pageNumber === "number"
        ? String(body.pageNumber)
        : "";
  const pageSizeRaw =
    typeof body.pageSize === "string"
      ? body.pageSize
      : typeof body.pageSize === "number"
        ? String(body.pageSize)
        : "";
  const userIdRaw = typeof body.userId === "string" ? body.userId : "";
  const statusParam = body.status;

  const userId = userIdRaw.trim();
  const pageNumber = Number(pageNumberRaw || "1");
  const pageSize = Number(pageSizeRaw || "10");

  const statusText =
    Array.isArray(statusParam)
      ? statusParam.map((s) => String(s)).join(",").trim()
      : typeof statusParam === "string"
        ? statusParam.trim()
        : "";

  if (!userId) {
    return res.status(400).send({
      code: -1,
      message: "userId 必须存在",
      data: null,
    });
  }

  if (userId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "userId 长度不能超过 64",
      data: null,
    });
  }

  if (statusText && statusText.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "status 长度不能超过 64",
      data: null,
    });
  }

  if (!Number.isFinite(pageNumber) || pageNumber <= 0 || !Number.isInteger(pageNumber)) {
    return res.status(400).send({
      code: -1,
      message: "pageNumber 必须为正整数",
      data: null,
    });
  }

  if (!Number.isFinite(pageSize) || pageSize <= 0 || !Number.isInteger(pageSize)) {
    return res.status(400).send({
      code: -1,
      message: "pageSize 必须为正整数",
      data: null,
    });
  }

  if (pageSize > 100) {
    return res.status(400).send({
      code: -1,
      message: "pageSize 不能超过 100",
      data: null,
    });
  }

  try {
    const whereParts = ["`user` = :userId"];
    const replacements = { userId };

    if (statusText) {
      const statuses = statusText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length) {
        if (statuses.length > 20) {
          return res.status(400).send({
            code: -1,
            message: "status 数量不能超过 20",
            data: null,
          });
        }

        const allowedStatuses = new Set([
          "TO_PAY",
          "TO_SEND",
          "TO_RECEIVE",
          "FINISHED",
          "CANCELED",
          "RETURN_APPLIED",
          "RETURN_REFUSED",
          "RETURN_FINISH",
          "RETURN_MONEY_REFUSED",
        ]);

        const uniqStatuses = Array.from(new Set(statuses));
        const invalid = uniqStatuses.filter((s) => !allowedStatuses.has(s));
        if (invalid.length) {
          return res.status(400).send({
            code: -1,
            message: `status 无效: ${invalid.slice(0, 10).join(", ")}`,
            data: null,
          });
        }

        whereParts.push("`status` IN (:statuses)");
        replacements.statuses = uniqStatuses;
      }
    }

    const totalRows = await sequelize.query(
      `SELECT COUNT(*) AS \`total\` FROM \`shop_order\` WHERE ${whereParts.join(" AND ")}`,
      { replacements, type: QueryTypes.SELECT }
    );
    const total = Number(totalRows?.[0]?.total || 0);

    const offset = (pageNumber - 1) * pageSize;
    const orderRows = await sequelize.query(
      `SELECT \`_id\`, \`clientOrderNo\`, \`status\`, \`totalPrice\`, \`user\`, \`orderExpireTime\`, \`delivery_info\`, \`createdAt\`, \`updatedAt\`
       FROM \`shop_order\`
       WHERE ${whereParts.join(" AND ")}
       ORDER BY \`createdAt\` DESC, \`_id\` DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: { ...replacements, limit: pageSize, offset },
        type: QueryTypes.SELECT,
      }
    );

    const records = (orderRows || []).map((row) => ({
      _id: row?._id != null ? String(row._id) : "",
      clientOrderNo: row?.clientOrderNo != null ? String(row.clientOrderNo) : null,
      status: row?.status != null ? String(row.status) : null,
      totalPrice: row?.totalPrice != null ? Number(row.totalPrice) : null,
      user: row?.user != null ? String(row.user) : null,
      orderExpireTime: row?.orderExpireTime != null ? String(row.orderExpireTime) : null,
      delivery_info: row?.delivery_info != null ? String(row.delivery_info) : null,
      createdAt: row?.createdAt != null ? row.createdAt : null,
      updatedAt: row?.updatedAt != null ? row.updatedAt : null,
      orderItems: [],
    }));

    const orderIds = records.map((r) => r._id).filter(Boolean);
    if (!orderIds.length) {
      return res.send({
        code: 0,
        data: { records: [], total },
      });
    }

    const orderById = new Map(records.map((r) => [r._id, r]));
    const itemRows = await sequelize.query(
      `SELECT
        oi.\`_id\` AS \`orderItemId\`,
        oi.\`order\` AS \`orderId\`,
        oi.\`sku\` AS \`skuId\`,
        oi.\`count\` AS \`count\`,
        s.\`price\` AS \`price\`,
        s.\`wholesale_price\` AS \`wholesalePrice\`,
        s.\`image\` AS \`image\`,
        s.\`spu\` AS \`spuId\`,
        sp.\`name\` AS \`spuName\`
      FROM \`shop_order_item\` oi
      INNER JOIN \`shop_sku\` s ON s.\`_id\` = oi.\`sku\`
      LEFT JOIN \`shop_spu\` sp ON sp.\`_id\` = s.\`spu\`
      WHERE oi.\`order\` IN (:orderIds)
      ORDER BY oi.\`order\` ASC, oi.\`_id\` ASC`,
      {
        replacements: { orderIds },
        type: QueryTypes.SELECT,
      }
    );

    for (const row of itemRows || []) {
      const orderId = row?.orderId != null ? String(row.orderId) : "";
      const order = orderById.get(orderId);
      if (!order) continue;

      const skuId = row?.skuId != null ? String(row.skuId) : "";
      order.orderItems.push({
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
              spu:
                row?.spuId != null
                  ? {
                      _id: String(row.spuId),
                      name: row?.spuName != null ? String(row.spuName) : null,
                    }
                  : null,
            }
          : null,
      });
    }

    res.send({
      code: 0,
      data: { records, total },
    });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: error?.message || "查询失败",
      data: null,
    });
  }
});

router.get("/order/detail", handleGetOrderDetail);
router.post("/order/detail", handleGetOrderDetail);

module.exports = router;
