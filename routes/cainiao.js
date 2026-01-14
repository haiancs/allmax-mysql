const express = require("express");
const { QueryTypes } = require("sequelize");
const { checkConnection, sequelize } = require("../db");

const router = express.Router();

function safeTrim(value) {
  return value != null ? String(value).trim() : "";
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toFenFromYuanMaybe(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const fen = Math.round(n * 100);
  if (!Number.isFinite(fen) || fen < 0) return null;
  return fen;
}

function tryParseJsonObject(text) {
  const raw = safeTrim(text);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function formatDateTimeShanghai(input) {
  const raw = input != null ? String(input).trim() : "";
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{14}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(
      8,
      10
    )}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function genderToText(raw) {
  const n = Number(raw);
  if (n === 1) return "male";
  if (n === 2) return "female";
  const t = safeTrim(raw).toLowerCase();
  if (t === "male" || t === "female") return t;
  return "";
}

function buildEmptyTemplate() {
  return {
    ownerUserId: "TODO_FILL_CAINIAO_OWNER_USER_ID",
    businessUnitId: "TODO_FILL_CAINIAO_BUSINESS_UNIT_ID",
    orderType: "BONDED_WHS",
    orderItemList: [
      {
        itemQuantity: "1",
        declareInfo: {
          itemTotalPrice: "TODO_FILL_DECLARE_ITEM_TOTAL_PRICE_FEN",
          vat: "TODO_FILL_DECLARE_VAT_FEN",
          customsTax: "TODO_FILL_DECLARE_CUSTOMS_TAX_FEN",
          totalTax: "TODO_FILL_DECLARE_TOTAL_TAX_FEN",
          consumptionTax: "TODO_FILL_DECLARE_CONSUMPTION_TAX_FEN",
          itemTotalActualPrice: "TODO_FILL_DECLARE_ITEM_TOTAL_ACTUAL_PRICE_FEN",
        },
        inventoryChannel: "非淘ToC",
        extItemId: "TODO_FILL_EXT_ITEM_ID",
        itemId: "TODO_FILL_CAINIAO_ITEM_ID",
        isGift: "0",
        traceableCodeSet: [],
      },
    ],
    receiverInfo: {
      country: "中国",
      address: "TODO_FILL_RECEIVER_ADDRESS",
      province: "TODO_FILL_RECEIVER_PROVINCE",
      town: "TODO_FILL_RECEIVER_TOWN",
      city: "TODO_FILL_RECEIVER_CITY",
      district: "TODO_FILL_RECEIVER_DISTRICT",
      name: "TODO_FILL_RECEIVER_NAME",
      contactNo: "TODO_FILL_RECEIVER_CONTACT_NO",
    },
    externalTradeCode: "TODO_FILL_EXTERNAL_TRADE_CODE",
    customsDeclareInfo: {
      buyerIDType: "1",
      payOrderId: "TODO_FILL_PAY_ORDER_ID",
      gender: "TODO_FILL_GENDER",
      buyerName: "TODO_FILL_BUYER_NAME",
      buyerPlatformId: "TODO_FILL_BUYER_PLATFORM_ID",
      nationality: "CN",
      payChannel: "LLZF",
      buyerIDNo: "TODO_FILL_BUYER_ID_NO",
      contactNo: "TODO_FILL_CONTACT_NO",
    },
    buyerRemark: "",
    refunderInfo: {
      country: "中国",
      address: "TODO_FILL_REFUNDER_ADDRESS",
      province: "TODO_FILL_REFUNDER_PROVINCE",
      town: "TODO_FILL_REFUNDER_TOWN",
      city: "TODO_FILL_REFUNDER_CITY",
      district: "TODO_FILL_REFUNDER_DISTRICT",
      name: "TODO_FILL_REFUNDER_NAME",
      contactNo: "TODO_FILL_REFUNDER_CONTACT_NO",
    },
    externalShopName: "ALLMAX原装进口",
    externalOrderCode: "TODO_FILL_EXTERNAL_ORDER_CODE",
    orderCreateTime: "TODO_FILL_ORDER_CREATE_TIME",
    saleMode: "1",
    sellerRemark: "",
    senderInfo: {
      country: "中国",
      address: "TODO_FILL_SENDER_ADDRESS",
      province: "TODO_FILL_SENDER_PROVINCE",
      town: "TODO_FILL_SENDER_TOWN",
      city: "TODO_FILL_SENDER_CITY",
      district: "TODO_FILL_SENDER_DISTRICT",
      name: "TODO_FILL_SENDER_NAME",
      contactNo: "TODO_FILL_SENDER_CONTACT_NO",
      senderPoi: "TODO_FILL_SENDER_POI",
    },
    orderAmountInfo: {
      totalTax: "TODO_FILL_ORDER_TOTAL_TAX_FEN",
      insurance: "TODO_FILL_ORDER_INSURANCE_FEN",
      actualPayment: "TODO_FILL_ORDER_ACTUAL_PAYMENT_FEN",
      coupon: "TODO_FILL_ORDER_COUPON_FEN",
      vat: "TODO_FILL_ORDER_VAT_FEN",
      postFee: "TODO_FILL_ORDER_POST_FEE_FEN",
      currency: "CNY",
      consumptionTax: "TODO_FILL_ORDER_CONSUMPTION_TAX_FEN",
      dutiablePrice: "TODO_FILL_ORDER_DUTIABLE_PRICE_FEN",
      customsTax: "TODO_FILL_ORDER_CUSTOMS_TAX_FEN",
    },
    orderPayTime: "TODO_FILL_ORDER_PAY_TIME",
    storeCode: "TODO_FILL_CAINIAO_STORE_CODE",
  };
}

router.get("/bonded-deliveryorder-body", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const orderIdRaw = typeof req?.query?.orderId === "string" ? req.query.orderId : "";
  const clientOrderNoRaw =
    typeof req?.query?.clientOrderNo === "string" ? req.query.clientOrderNo : "";

  const orderId = orderIdRaw.trim();
  const clientOrderNo = clientOrderNoRaw.trim();

  if (!orderId && !clientOrderNo) {
    return res.send({ code: 0, data: buildEmptyTemplate() });
  }

  if (orderId && orderId.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "orderId 长度不能超过 64",
      data: null,
    });
  }
  if (clientOrderNo && clientOrderNo.length > 64) {
    return res.status(400).send({
      code: -1,
      message: "clientOrderNo 长度不能超过 64",
      data: null,
    });
  }

  try {
    const orderRows = await sequelize.query(
      orderId
        ? "SELECT `_id`, `clientOrderNo`, `status`, `totalPrice`, `user`, `delivery_info`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1"
        : "SELECT `_id`, `clientOrderNo`, `status`, `totalPrice`, `user`, `delivery_info`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `clientOrderNo` = :clientOrderNo LIMIT 1",
      {
        replacements: orderId ? { orderId } : { clientOrderNo },
        type: QueryTypes.SELECT,
      }
    );

    const order = orderRows[0] || null;
    if (!order) {
      return res.status(404).send({
        code: -1,
        message: "订单不存在",
        data: null,
      });
    }

    const realOrderId = safeTrim(order._id);
    const deliveryInfoId = safeTrim(order.delivery_info);
    const userId = safeTrim(order.user);

    const [items, deliveryRows, userRows, llpayRows, bondedRows] =
      await Promise.all([
        sequelize.query(
          "SELECT `_id`, `sku`, `count` FROM `shop_order_item` WHERE `order` = :orderId ORDER BY `_id` ASC",
          { replacements: { orderId: realOrderId }, type: QueryTypes.SELECT }
        ),
        deliveryInfoId
          ? sequelize.query(
              "SELECT `_id`, `name`, `phone`, `address`, `idCard`, `user` FROM `shop_delivery_info` WHERE `_id` = :id LIMIT 1",
              { replacements: { id: deliveryInfoId }, type: QueryTypes.SELECT }
            )
          : Promise.resolve([]),
        userId
          ? sequelize.query(
              "SELECT `_id`, `openid`, `phone`, `gender` FROM `users` WHERE `_id` = :id LIMIT 1",
              { replacements: { id: userId }, type: QueryTypes.SELECT }
            )
          : Promise.resolve([]),
        sequelize.query(
          "SELECT `orderId`, `txnSeqno`, `platform_txno`, `txnTime`, `status`, `amountFen` FROM `llpay_v2` WHERE `orderId` = :orderId LIMIT 1",
          { replacements: { orderId: realOrderId }, type: QueryTypes.SELECT }
        ),
        sequelize.query(
          "SELECT `receiverProvince`, `receiverCity`, `receiverDistrict`, `receiverAddress`, `receiverName`, `receiverPhone`, `receiverIdCard`, `buyerRemark`, `sellerRemark`, `requestData` FROM `bonded_warehouse_orders` WHERE `orderId` = :orderId ORDER BY `createdAt` DESC LIMIT 1",
          { replacements: { orderId: realOrderId }, type: QueryTypes.SELECT }
        ),
      ]);

    const delivery = deliveryRows[0] || null;
    const user = userRows[0] || null;
    const llpay = llpayRows[0] || null;
    const bonded = bondedRows[0] || null;

    const requestDataObj = bonded ? tryParseJsonObject(bonded.requestData) : null;
    const requestData = requestDataObj ? safeObject(requestDataObj) : {};

    const receiverFromReq = safeObject(requestData.receiverInfo);
    const senderFromReq = safeObject(requestData.senderInfo);
    const refunderFromReq = safeObject(requestData.refunderInfo);

    const receiverName =
      safeTrim(bonded?.receiverName) || safeTrim(receiverFromReq.name) || safeTrim(delivery?.name) || "TODO_FILL_RECEIVER_NAME";
    const receiverPhone =
      safeTrim(bonded?.receiverPhone) || safeTrim(receiverFromReq.contactNo) || safeTrim(delivery?.phone) || "TODO_FILL_RECEIVER_CONTACT_NO";
    const receiverIdCard =
      safeTrim(bonded?.receiverIdCard) || safeTrim(delivery?.idCard) || "TODO_FILL_BUYER_ID_NO";

    const receiverAddress =
      safeTrim(bonded?.receiverAddress) || safeTrim(receiverFromReq.address) || safeTrim(delivery?.address) || "TODO_FILL_RECEIVER_ADDRESS";

    const receiverProvince =
      safeTrim(bonded?.receiverProvince) || safeTrim(receiverFromReq.province) || "TODO_FILL_RECEIVER_PROVINCE";
    const receiverCity =
      safeTrim(bonded?.receiverCity) || safeTrim(receiverFromReq.city) || "TODO_FILL_RECEIVER_CITY";
    const receiverDistrict =
      safeTrim(bonded?.receiverDistrict) || safeTrim(receiverFromReq.district) || "TODO_FILL_RECEIVER_DISTRICT";
    const receiverTown =
      safeTrim(receiverFromReq.town) || "TODO_FILL_RECEIVER_TOWN";

    const payOrderId =
      safeTrim(llpay?.platform_txno) ||
      safeTrim(llpay?.txnSeqno) ||
      safeTrim(requestData?.customsDeclareInfo?.payOrderId) ||
      "TODO_FILL_PAY_ORDER_ID";

    const buyerPlatformId =
      safeTrim(requestData?.customsDeclareInfo?.buyerPlatformId) ||
      safeTrim(user?.openid) ||
      userId ||
      "TODO_FILL_BUYER_PLATFORM_ID";

    const gender =
      safeTrim(requestData?.customsDeclareInfo?.gender) ||
      genderToText(user?.gender) ||
      "TODO_FILL_GENDER";

    const contactNo =
      safeTrim(requestData?.customsDeclareInfo?.contactNo) ||
      receiverPhone ||
      safeTrim(user?.phone) ||
      "TODO_FILL_CONTACT_NO";

    const orderCreateTime =
      safeTrim(requestData?.orderCreateTime) ||
      formatDateTimeShanghai(order?.createdAt) ||
      "TODO_FILL_ORDER_CREATE_TIME";

    const orderPayTime =
      safeTrim(requestData?.orderPayTime) ||
      formatDateTimeShanghai(llpay?.txnTime) ||
      "TODO_FILL_ORDER_PAY_TIME";

    const orderTotalPriceFen =
      toFenFromYuanMaybe(order?.totalPrice) != null
        ? String(toFenFromYuanMaybe(order?.totalPrice))
        : "TODO_FILL_ORDER_ACTUAL_PAYMENT_FEN";

    const skuIds = Array.isArray(items)
      ? items.map((i) => safeTrim(i.sku)).filter(Boolean)
      : [];

    const skuPriceById = new Map();
    if (skuIds.length) {
      const skuRows = await sequelize.query(
        "SELECT `_id`, `price` FROM `shop_sku` WHERE `_id` IN (:ids)",
        {
          replacements: { ids: skuIds },
          type: QueryTypes.SELECT,
        }
      );
      for (const row of skuRows) {
        const id = safeTrim(row?._id);
        const fen = toFenFromYuanMaybe(row?.price);
        if (id && fen != null) {
          skuPriceById.set(id, fen);
        }
      }
    }

    const builtOrderItemList = (Array.isArray(items) ? items : []).map((it) => {
      const skuId = safeTrim(it.sku);
      const qty = toInt(it.count, 0);
      const unitFen = skuPriceById.get(skuId);
      const totalActualFen =
        unitFen != null && qty > 0 ? String(unitFen * qty) : "TODO_FILL_DECLARE_ITEM_TOTAL_ACTUAL_PRICE_FEN";

      const requestItemList = Array.isArray(requestData?.orderItemList)
        ? requestData.orderItemList
        : [];
      const matchedReqItem =
        requestItemList.find((r) => safeTrim(r?.extItemId) === skuId) || null;

      const inventoryChannel =
        safeTrim(matchedReqItem?.inventoryChannel) ||
        safeTrim(requestData?.inventoryChannel) ||
        "非淘ToC";

      const itemId =
        safeTrim(matchedReqItem?.itemId) ||
        (skuId ? `TODO_FILL_CAINIAO_ITEM_ID_FOR_SKU_${skuId}` : "TODO_FILL_CAINIAO_ITEM_ID");

      const extItemId =
        safeTrim(matchedReqItem?.extItemId) || skuId || "TODO_FILL_EXT_ITEM_ID";

      const traceableCodeSet = Array.isArray(matchedReqItem?.traceableCodeSet)
        ? matchedReqItem.traceableCodeSet
        : [];

      const isGift = safeTrim(matchedReqItem?.isGift) || "0";

      const declareInfo = safeObject(matchedReqItem?.declareInfo);

      return {
        itemQuantity: String(qty > 0 ? qty : 1),
        declareInfo: {
          itemTotalPrice:
            safeTrim(declareInfo.itemTotalPrice) ||
            "TODO_FILL_DECLARE_ITEM_TOTAL_PRICE_FEN",
          vat: safeTrim(declareInfo.vat) || "TODO_FILL_DECLARE_VAT_FEN",
          customsTax:
            safeTrim(declareInfo.customsTax) ||
            "TODO_FILL_DECLARE_CUSTOMS_TAX_FEN",
          totalTax:
            safeTrim(declareInfo.totalTax) || "TODO_FILL_DECLARE_TOTAL_TAX_FEN",
          consumptionTax:
            safeTrim(declareInfo.consumptionTax) ||
            "TODO_FILL_DECLARE_CONSUMPTION_TAX_FEN",
          itemTotalActualPrice:
            safeTrim(declareInfo.itemTotalActualPrice) || totalActualFen,
        },
        inventoryChannel,
        extItemId,
        itemId,
        isGift,
        traceableCodeSet,
      };
    });

    const result = buildEmptyTemplate();

    result.ownerUserId =
      safeTrim(requestData.ownerUserId) || result.ownerUserId;
    result.businessUnitId =
      safeTrim(requestData.businessUnitId) || result.businessUnitId;
    result.storeCode = safeTrim(requestData.storeCode) || result.storeCode;

    result.externalOrderCode =
      safeTrim(requestData.externalOrderCode) || realOrderId || result.externalOrderCode;

    result.externalTradeCode =
      safeTrim(requestData.externalTradeCode) || payOrderId || result.externalTradeCode;

    result.externalShopName =
      safeTrim(requestData.externalShopName) || result.externalShopName;

    result.orderCreateTime = orderCreateTime || result.orderCreateTime;
    result.orderPayTime = orderPayTime || result.orderPayTime;

    result.buyerRemark =
      safeTrim(bonded?.buyerRemark) || safeTrim(requestData.buyerRemark) || "";
    result.sellerRemark =
      safeTrim(bonded?.sellerRemark) || safeTrim(requestData.sellerRemark) || "";

    result.receiverInfo = {
      country: safeTrim(receiverFromReq.country) || "中国",
      address: receiverAddress,
      province: receiverProvince,
      town: receiverTown,
      city: receiverCity,
      district: receiverDistrict,
      name: receiverName,
      contactNo: receiverPhone,
    };

    result.customsDeclareInfo = {
      buyerIDType: "1",
      payOrderId,
      gender,
      buyerName: receiverName || "TODO_FILL_BUYER_NAME",
      buyerPlatformId,
      nationality: "CN",
      payChannel: "LLZF",
      buyerIDNo: receiverIdCard,
      contactNo,
    };

    result.senderInfo = {
      country: safeTrim(senderFromReq.country) || "中国",
      address: safeTrim(senderFromReq.address) || result.senderInfo.address,
      province: safeTrim(senderFromReq.province) || result.senderInfo.province,
      town: safeTrim(senderFromReq.town) || result.senderInfo.town,
      city: safeTrim(senderFromReq.city) || result.senderInfo.city,
      district: safeTrim(senderFromReq.district) || result.senderInfo.district,
      name: safeTrim(senderFromReq.name) || result.senderInfo.name,
      contactNo: safeTrim(senderFromReq.contactNo) || result.senderInfo.contactNo,
      senderPoi: safeTrim(senderFromReq.senderPoi) || result.senderInfo.senderPoi,
    };

    result.refunderInfo = {
      country: safeTrim(refunderFromReq.country) || "中国",
      address: safeTrim(refunderFromReq.address) || result.refunderInfo.address,
      province:
        safeTrim(refunderFromReq.province) || result.refunderInfo.province,
      town: safeTrim(refunderFromReq.town) || result.refunderInfo.town,
      city: safeTrim(refunderFromReq.city) || result.refunderInfo.city,
      district:
        safeTrim(refunderFromReq.district) || result.refunderInfo.district,
      name: safeTrim(refunderFromReq.name) || result.refunderInfo.name,
      contactNo:
        safeTrim(refunderFromReq.contactNo) || result.refunderInfo.contactNo,
    };

    result.orderItemList = builtOrderItemList.length
      ? builtOrderItemList
      : result.orderItemList;

    result.orderAmountInfo.actualPayment = orderTotalPriceFen;

    return res.send({ code: 0, data: result });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: "生成菜鸟保税仓发货参数失败",
      data: null,
    });
  }
});

module.exports = router;

