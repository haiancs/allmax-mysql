const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");

const router = express.Router();

router.get("/orders", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const pageNumberRaw =
    typeof req?.query?.pageNumber === "string" ? req.query.pageNumber : "";
  const pageSizeRaw =
    typeof req?.query?.pageSize === "string" ? req.query.pageSize : "";
  const userIdRaw = typeof req?.query?.userId === "string" ? req.query.userId : "";
  const statusParam = req?.query?.status;

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

module.exports = router;
