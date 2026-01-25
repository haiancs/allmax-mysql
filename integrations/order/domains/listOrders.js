const { safeTrim, buildError } = require("../utils/orderValidation");
const { listOrders, countOrders } = require("../repos/shopOrderRepo");
const { listOrderItemsWithSkuSpuByOrderIds } = require("../repos/shopOrderItemRepo");

async function listOrderPage(body) {
  const reqBody = body && typeof body === "object" ? body : {};

  const pageNumberRaw =
    typeof reqBody.pageNumber === "string"
      ? reqBody.pageNumber
      : typeof reqBody.pageNumber === "number"
        ? String(reqBody.pageNumber)
        : "";
  const pageSizeRaw =
    typeof reqBody.pageSize === "string"
      ? reqBody.pageSize
      : typeof reqBody.pageSize === "number"
        ? String(reqBody.pageSize)
        : "";
  const userIdRaw = typeof reqBody.userId === "string" ? reqBody.userId : "";
  const statusParam = reqBody.status;

  const userId = safeTrim(userIdRaw);
  const pageNumber = Number(pageNumberRaw || "1");
  const pageSize = Number(pageSizeRaw || "10");

  const statusText =
    Array.isArray(statusParam)
      ? statusParam.map((s) => String(s)).join(",").trim()
      : typeof statusParam === "string"
        ? statusParam.trim()
        : "";

  if (!userId) {
    return buildError(400, "userId 必须存在");
  }

  if (userId.length > 64) {
    return buildError(400, "userId 长度不能超过 64");
  }

  if (statusText && statusText.length > 64) {
    return buildError(400, "status 长度不能超过 64");
  }

  if (!Number.isFinite(pageNumber) || pageNumber <= 0 || !Number.isInteger(pageNumber)) {
    return buildError(400, "pageNumber 必须为正整数");
  }

  if (!Number.isFinite(pageSize) || pageSize <= 0 || !Number.isInteger(pageSize)) {
    return buildError(400, "pageSize 必须为正整数");
  }

  if (pageSize > 100) {
    return buildError(400, "pageSize 不能超过 100");
  }

  try {
    let uniqStatuses = [];

    if (statusText) {
      const statuses = statusText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length) {
        if (statuses.length > 20) {
          return buildError(400, "status 数量不能超过 20");
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

        uniqStatuses = Array.from(new Set(statuses));
        const invalid = uniqStatuses.filter((s) => !allowedStatuses.has(s));
        if (invalid.length) {
          return buildError(400, `status 无效: ${invalid.slice(0, 10).join(", ")}`);
        }
      }
    }

    const offset = (pageNumber - 1) * pageSize;
    const countFilter = uniqStatuses.length
      ? { userId, statuses: uniqStatuses }
      : { userId };
    const total = Number((await countOrders(countFilter)) || 0);

    const listFilter = {
      userId,
      offset,
      limit: pageSize,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
    };
    if (uniqStatuses.length) {
      listFilter.statuses = uniqStatuses;
    }

    const orderRows = await listOrders(listFilter, {
      attributes: [
        "id",
        "clientOrderNo",
        "status",
        "totalPrice",
        "userId",
        "orderExpireTime",
        "deliveryInfoId",
        "createdAt",
        "updatedAt",
      ],
    });

    const records = (orderRows || []).map((row) => {
      const data = row?.get ? row.get({ plain: true }) : row;
      return {
        _id: data?.id != null ? String(data.id) : "",
        clientOrderNo: data?.clientOrderNo != null ? String(data.clientOrderNo) : null,
        status: data?.status != null ? String(data.status) : null,
        totalPrice: data?.totalPrice != null ? Number(data.totalPrice) : null,
        user: data?.userId != null ? String(data.userId) : null,
        orderExpireTime:
          data?.orderExpireTime != null ? String(data.orderExpireTime) : null,
        delivery_info:
          data?.deliveryInfoId != null ? String(data.deliveryInfoId) : null,
        createdAt: data?.createdAt != null ? data.createdAt : null,
        updatedAt: data?.updatedAt != null ? data.updatedAt : null,
        orderItems: [],
      };
    });

    const orderIds = records.map((r) => r._id).filter(Boolean);
    if (!orderIds.length) {
      return {
        ok: true,
        httpStatus: 200,
        body: { code: 0, data: { records: [], total } },
      };
    }

    const orderById = new Map(records.map((r) => [r._id, r]));
    const itemRows = await listOrderItemsWithSkuSpuByOrderIds(orderIds);

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

    return {
      ok: true,
      httpStatus: 200,
      body: { code: 0, data: { records, total } },
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
  listOrderPage,
};
