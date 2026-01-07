const crypto = require("crypto");
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../db");

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

function generateStableTxnSeqno(orderId) {
  const raw = String(orderId || "").trim();
  const digest = crypto
    .createHash("sha256")
    .update(`llpay_v2:${raw}`)
    .digest("hex");
  return digest.slice(0, 32);
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isDuplicateKeyError(error) {
  const code = error?.original?.code || error?.parent?.code || error?.code;
  return code === "ER_DUP_ENTRY";
}

// 根据一组 {id, value} 生成两类 SQL 片段：
// 1) CASE 表达式：CASE <idExpr> WHEN :id_0 THEN :val_0 ... ELSE 0 END
// 2) IN 列表：:_id_0, :_id_1, ...
// 同时返回对应的 replacements，用于 sequelize.query 的参数化绑定。
function buildCasePairsById(idExpr, pairs, idKeyPrefix, valueKeyPrefix) {
  const replacements = {};
  const whenParts = [];
  const inParts = [];

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const idKey = `${idKeyPrefix}${i}`;
    const valueKey = `${valueKeyPrefix}${i}`;
    replacements[idKey] = pair.id;
    replacements[valueKey] = pair.value;
    whenParts.push(`WHEN :${idKey} THEN :${valueKey}`);
    inParts.push(`:${idKey}`);
  }

  return {
    replacements,
    caseExpr: `CASE ${idExpr} ${whenParts.join(" ")} ELSE 0 END`,
    inExpr: inParts.join(", "),
  };
}

// 批量扣减 SKU 库存：
// - 用单条 UPDATE + CASE 按 _id 对应不同扣减量，减少多次数据库往返
// - WHERE 中同样用 CASE 做 “逐行 stock >= 扣减量” 的校验，保证原子性
// 返回 MySQL affectedRows（用于判断是否所有 SKU 都扣减成功）
async function bulkDecrementSkuStock(items, transaction) {
  if (!items.length) {
    return 0;
  }

  const pairs = items.map((item) => ({
    id: item.skuId,
    value: item.quantity,
  }));
  const built = buildCasePairsById("`_id`", pairs, "skuId_", "qty_");

  const sql = `UPDATE \`shop_sku\`
    SET \`stock\` = COALESCE(\`stock\`, 0) - (${built.caseExpr})
    WHERE \`_id\` IN (${built.inExpr})
      AND COALESCE(\`stock\`, 0) >= (${built.caseExpr})`;

  const [_, metadata] = await sequelize.query(sql, {
    replacements: built.replacements,
    transaction,
  });

  return metadata && typeof metadata.affectedRows === "number"
    ? metadata.affectedRows
    : 0;
}

async function createShopOrderInTransaction(
  {
    clientOrderNo,
    userId,
    deliveryInfoRaw,
    isDistributor,
    nowMs,
    orderExpireTimeMs,
    resolveItems,
    afterOrderCreated,
  },
  transaction
) {
  async function loadOrderByClientOrderNo() {
    const rows = await sequelize.query(
      "SELECT `_id`, `clientOrderNo`, `status`, `totalPrice`, `user`, `orderExpireTime`, `delivery_info`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `clientOrderNo` = ? LIMIT 1",
      {
        replacements: [clientOrderNo],
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    return rows[0] || null;
  }

  async function loadOrderItemsByOrderId(orderId) {
    return sequelize.query(
      "SELECT `sku`, `count` FROM `shop_order_item` WHERE `order` = ?",
      {
        replacements: [orderId],
        type: QueryTypes.SELECT,
        transaction,
      }
    );
  }

  async function loadOrCreateLlpayByOrderId(orderId, amountFen, llUserId) {
    const rows = await sequelize.query(
      "SELECT `_id`, `orderId`, `txnSeqno`, `status`, `amountFen`, `expireTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `orderId` = ? LIMIT 1",
      {
        replacements: [orderId],
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    const existing = rows[0] || null;
    if (existing) {
      const existingTxnSeqno =
        existing.txnSeqno != null ? String(existing.txnSeqno).trim() : "";
      if (existingTxnSeqno) {
        return existing;
      }

      const txnSeqno = generateStableTxnSeqno(orderId);
      try {
        await sequelize.query(
          "UPDATE `llpay_v2` SET `txnSeqno` = ?, `updatedAt` = ? WHERE `orderId` = ? AND (`txnSeqno` IS NULL OR `txnSeqno` = '')",
          {
            replacements: [txnSeqno, nowMs, orderId],
            transaction,
          }
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }

      const patchedRows = await sequelize.query(
        "SELECT `_id`, `orderId`, `txnSeqno`, `status`, `amountFen`, `expireTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `orderId` = ? LIMIT 1",
        {
          replacements: [orderId],
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      return patchedRows[0] || existing;
    }

    const txnSeqno = generateStableTxnSeqno(orderId);
    try {
      await sequelize.query(
        "INSERT INTO `llpay_v2` (`_id`, `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `createdAt`, `updatedAt`, `expireTime`, `retryCount`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        {
          replacements: [
            generateId(),
            txnSeqno,
            orderId,
            llUserId || null,
            "INIT",
            amountFen,
            nowMs,
            nowMs,
            String(orderExpireTimeMs),
            0
          ],
          transaction,
        }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    const created = await sequelize.query(
      "SELECT `txnSeqno`, `orderId`, `userId`, `status`, `amountFen`, `expireTime`, `createdAt`, `updatedAt` FROM `llpay_v2` WHERE `orderId` = ? LIMIT 1",
      {
        replacements: [orderId],
        type: QueryTypes.SELECT,
        transaction,
      }
    );
    return created[0] || null;
  }

  const normalizedUserId =
    typeof userId === "string" && userId.trim() ? userId.trim() : "";

  const existingOrder = await loadOrderByClientOrderNo();
  if (existingOrder) {
    const amountFen = Math.round(Number(existingOrder.totalPrice || 0) * 100);
    const llUserId =
      (existingOrder.user && String(existingOrder.user).trim()) ||
      normalizedUserId ||
      "";

    const [existingItems, existingLlpay] = await Promise.all([
      loadOrderItemsByOrderId(existingOrder._id),
      loadOrCreateLlpayByOrderId(existingOrder._id, amountFen, llUserId),
    ]);

    return {
      order: existingOrder,
      items: existingItems.map((i) => ({
        skuId: i.sku,
        quantity: Number(i.count || 0),
      })),
      llpay: existingLlpay,
      isIdempotentHit: true,
    };
  }

  const resolved = await resolveItems();
  const itemLinesRaw = Array.isArray(resolved?.itemLines) ? resolved.itemLines : [];
  let mergedQuantityBySkuId =
    resolved && resolved.mergedQuantityBySkuId instanceof Map
      ? resolved.mergedQuantityBySkuId
      : new Map();
  const distributionRecordIdBySkuId =
    resolved && resolved.distributionRecordIdBySkuId instanceof Map
      ? resolved.distributionRecordIdBySkuId
      : new Map();

  if (!mergedQuantityBySkuId.size && itemLinesRaw.length) {
    mergedQuantityBySkuId = new Map();
    for (const rawLine of itemLinesRaw) {
      const line = rawLine && typeof rawLine === "object" ? rawLine : {};
      const skuId = typeof line.skuId === "string" ? line.skuId.trim() : "";
      const qty = Number(line.quantity ?? line.count);
      if (!skuId || !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
        throw createHttpError(400, "items 无效");
      }
      const prev = mergedQuantityBySkuId.get(skuId) || 0;
      mergedQuantityBySkuId.set(skuId, prev + qty);
    }
  }

  if (!mergedQuantityBySkuId.size) {
    throw createHttpError(400, "items 必须是非空数组");
  }

  const sortedSkuIds = Array.from(mergedQuantityBySkuId.keys()).sort((a, b) =>
    String(a).localeCompare(String(b))
  );

  const distributor = isDistributor === true;

  const skuRows = await sequelize.query(
    "SELECT `_id`, `price`, `wholesale_price` AS `wholesalePrice`, COALESCE(`stock`, 0) AS `stock` FROM `shop_sku` WHERE `_id` IN (:skuIds)",
    {
      replacements: { skuIds: sortedSkuIds },
      type: QueryTypes.SELECT,
      transaction,
    }
  );

  const skuById = new Map(skuRows.map((r) => [String(r._id), r]));
  if (skuById.size !== sortedSkuIds.length) {
    const missingSkuIds = sortedSkuIds.filter((id) => !skuById.has(id));
    throw createHttpError(
      400,
      `SKU 不存在: ${missingSkuIds.slice(0, 10).join(", ")}`
    );
  }

  const itemLines = [];
  if (itemLinesRaw.length) {
    for (const rawLine of itemLinesRaw) {
      const line = rawLine && typeof rawLine === "object" ? rawLine : {};
      const skuId = typeof line.skuId === "string" ? line.skuId.trim() : "";
      const quantity = Number(line.quantity ?? line.count);
      const distributionRecordId =
        typeof line.distributionRecordId === "string"
          ? line.distributionRecordId.trim() : null;

      if (
        !skuId ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isInteger(quantity)
      ) {
        throw createHttpError(400, "items 无效");
      }

      if (distributionRecordId && distributionRecordId.length > 64) {
        throw createHttpError(400, "distribution_record_id 长度不能超过 64");
      }

      itemLines.push({
        skuId,
        quantity,
        distributionRecordId: distributionRecordId || null,
      });
    }
  } else {
    for (const skuId of sortedSkuIds) {
      const quantity = mergedQuantityBySkuId.get(skuId) || 0;
      const recordIdRaw = distributionRecordIdBySkuId.get(skuId);
      const recordId =
        typeof recordIdRaw === "string" && recordIdRaw.trim()
          ? recordIdRaw.trim()
          : null;
      itemLines.push({
        skuId,
        quantity,
        distributionRecordId: recordId,
      });
    }
  }

  const distributionRecordIds = Array.from(
    new Set(
      itemLines
        .map((l) => (l.distributionRecordId ? String(l.distributionRecordId) : ""))
        .filter(Boolean)
    )
  );

  const distributionById = new Map();
  if (distributionRecordIds.length) {

    const distributionRows = await sequelize.query(
      "SELECT `_id`, `sku`, `share_price` FROM `shop_distribution_record` WHERE `_id` IN (:ids)",
      {
        replacements: { ids: distributionRecordIds },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    for (const row of distributionRows) {
      distributionById.set(String(row._id), row);
    }

    if (distributionById.size !== distributionRecordIds.length) {
      const missing = distributionRecordIds.filter(
        (id) => !distributionById.has(String(id))
      );
      throw createHttpError(
        400,
        `分销记录不存在: ${missing.slice(0, 10).join(", ")}`
      );
    }
  }

  let totalFen = 0;
  for (const line of itemLines) {
    const skuId = line.skuId;
    const qty = line.quantity;
    const sku = skuById.get(skuId);
    if (!sku) {
      throw createHttpError(400, "SKU 不存在");
    }

    if (line.distributionRecordId) {
      const recordId = String(line.distributionRecordId);
      const record = distributionById.get(recordId);
      const recordSkuId = record ? String(record.sku || "").trim() : "";
      if (!recordSkuId || recordSkuId !== skuId) {
        throw createHttpError(400, "分销记录与 SKU 不匹配");
      }

      const sharePrice = Number(record.share_price);
      if (!Number.isFinite(sharePrice) || sharePrice < 0) {
        throw createHttpError(400, "分销价无效");
      }

      const unitFen = Math.round(sharePrice * 100);
      totalFen += unitFen * qty;
      continue;
    }

    const unitPrice = distributor
      ? Number((sku.wholesalePrice ?? sku.price) || 0)
      : Number(sku.price || 0);
    const unitFen = Math.round(unitPrice * 100);
    totalFen += unitFen * qty;
  }

  const orderItemsToInsert = [];
  for (const skuId of sortedSkuIds) {
    const qty = mergedQuantityBySkuId.get(skuId) || 0;
    orderItemsToInsert.push({ skuId, quantity: qty });
  }

  const totalPrice = totalFen / 100;
  const orderId = generateId();
  const llUserId = normalizedUserId || "";

  try {
    await sequelize.query(
      "INSERT INTO `shop_order` (`_id`, `clientOrderNo`, `status`, `totalPrice`, `user`, `createdAt`, `updatedAt`, `orderExpireTime`, `delivery_info`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      {
        replacements: [
          orderId,
          clientOrderNo,
          "TO_PAY",
          totalPrice,
          normalizedUserId || null,
          nowMs,
          nowMs,
          orderExpireTimeMs,
          deliveryInfoRaw || null,
        ],
        transaction,
      }
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const racedOrder = await loadOrderByClientOrderNo();
    if (!racedOrder) {
      throw error;
    }

    const amountFen = Math.round(Number(racedOrder.totalPrice || 0) * 100);
    const llUserId =
      (racedOrder.user && String(racedOrder.user).trim()) ||
      normalizedUserId ||
      "";

    const [racedItems, racedLlpay] = await Promise.all([
      loadOrderItemsByOrderId(racedOrder._id),
      loadOrCreateLlpayByOrderId(racedOrder._id, amountFen, llUserId),
    ]);

    return {
      order: racedOrder,
      items: racedItems.map((i) => ({
        skuId: i.sku,
        quantity: Number(i.count || 0),
      })),
      llpay: racedLlpay,
      isIdempotentHit: true,
    };
  }

  if (orderItemsToInsert.length) {
    const affectedRows = await bulkDecrementSkuStock(orderItemsToInsert, transaction);
    if (affectedRows !== orderItemsToInsert.length) {
      throw createHttpError(400, "库存不足或 SKU 不存在");
    }
  }

  if (orderItemsToInsert.length) {
    const placeholders = orderItemsToInsert
      .map(() => "(?, ?, ?, ?, ?, ?)")
      .join(", ");
    const replacements = [];
    for (const item of orderItemsToInsert) {
      replacements.push(
        generateId(),
        orderId,
        item.skuId,
        item.quantity,
        nowMs,
        nowMs
      );
    }

    await sequelize.query(
      `INSERT INTO \`shop_order_item\` (\`_id\`, \`order\`, \`sku\`, \`count\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}`,
      {
        replacements,
        transaction,
      }
    );
  }

  const orderRows = await sequelize.query(
    "SELECT `clientOrderNo`, `status`, `totalPrice`, `user`, `orderExpireTime`, `delivery_info`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `_id` = ? LIMIT 1",
    {
      replacements: [orderId],
      type: QueryTypes.SELECT,
      transaction,
    }
  );
  const createdOrder = orderRows[0] || null;
  const [createdItems, createdLlpay] = await Promise.all([
    loadOrderItemsByOrderId(orderId),
    loadOrCreateLlpayByOrderId(orderId, totalFen, llUserId),
  ]);

  if (typeof afterOrderCreated === "function") {
    await afterOrderCreated(
      {
        orderId,
        createdOrder,
        items: orderItemsToInsert,
      },
      transaction
    );
  }

  return {
    order: createdOrder,
    items: createdItems.map((i) => ({
      skuId: i.sku,
      quantity: Number(i.count || 0),
    })),
    llpay: createdLlpay,
    isIdempotentHit: false,
  };
}

module.exports = {
  createShopOrderInTransaction,
  createHttpError,
};
