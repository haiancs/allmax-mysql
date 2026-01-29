const {
  safeTrim,
  safeNumber,
  pickClientIp,
  buildRiskItemJson,
} = require("../../../../utils/llpayRouteUtils");

function buildPayPayload(options = {}) {
  const goods = Array.isArray(options.goods) ? options.goods : [];
  const orderAmountStr = options.orderAmountStr;
  const totalQty = goods.reduce((sum, it) => sum + (Number(it?.count || 0) || 0), 0);
  const avgUnitPrice =
    totalQty > 0 ? safeNumber(orderAmountStr, 0) / totalQty : safeNumber(orderAmountStr, 0);

  const goodsInfo = goods
    .map((it) => {
      const skuId = safeTrim(it?.skuId);
      const qty = Math.max(0, Math.floor(Number(it?.count || 0)));
      const name = safeTrim(it?.spuName) || skuId || "商品";
      const sharePrice = safeNumber(it?.sharePrice, NaN);
      const wholesalePrice = safeNumber(it?.wholesalePrice, NaN);
      const rawPrice = safeNumber(it?.price, avgUnitPrice);
      const price =
        Number.isFinite(sharePrice) && sharePrice > 0
          ? sharePrice
          : options.isDistributorUser && Number.isFinite(wholesalePrice) && wholesalePrice > 0
            ? wholesalePrice
            : rawPrice;
      if (!skuId || qty <= 0) return null;
      return {
        goods_id: skuId,
        goods_name: name,
        goods_price: price > 0 ? price : avgUnitPrice,
        goods_quantity: qty,
      };
    })
    .filter(Boolean);

  if (!goodsInfo.length) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "订单缺少商品明细，无法发起支付", data: null },
    };
  }

  const goodsName = safeTrim(goodsInfo[0]?.goods_name) || "订单支付";
  const clientIp = pickClientIp(options.req);
  const user = options.user || null;
  const userRegisterTime14 = user?.createdAt != null ? user.createdAt : null;
  const riskItemStr = buildRiskItemJson({
    userId: options.userId,
    userPhone: safeTrim(user?.phone),
    userRegisterTime14,
    goodsName,
    clientIp,
  });

  const extendInfoStr = JSON.stringify({
    wx_data: {
      appid: options.appid,
      openid: options.openid,
    },
  });

  const recordPayeeUidById =
    options.recordPayeeUidById instanceof Map ? options.recordPayeeUidById : new Map();
  const partnerId = safeTrim(options.partnerId);
  const downstreamFenByPayeeUid = new Map();
  for (const it of goods) {
    const qty = Math.max(0, Math.floor(Number(it?.count || 0)));
    if (!(qty > 0)) continue;
    const sharePrice = safeNumber(it?.sharePrice, NaN);
    const wholesalePrice = safeNumber(it?.wholesalePrice, NaN);
    if (!Number.isFinite(sharePrice) || !Number.isFinite(wholesalePrice)) continue;
    if (!(sharePrice >= wholesalePrice)) continue;
    const shareFen = Math.round(sharePrice * 100);
    const wholesaleFen = Math.round(wholesalePrice * 100);
    const diffFen = shareFen - wholesaleFen;
    if (!(diffFen > 0)) continue;
    const recordId = safeTrim(it?.distributionRecordId);
    const payeeUidRaw = recordId ? recordPayeeUidById.get(recordId) || "" : "";
    const payeeUid = safeTrim(payeeUidRaw);
    if (!payeeUid || (partnerId && payeeUid === partnerId)) continue;
    const prev = downstreamFenByPayeeUid.get(payeeUid) || 0;
    downstreamFenByPayeeUid.set(payeeUid, prev + diffFen * qty);
  }

  const downstreamEntries = Array.from(downstreamFenByPayeeUid.entries()).filter(
    ([, fen]) => Number.isInteger(fen) && fen > 0
  );
  const totalDownstreamFen = downstreamEntries.reduce((sum, [, fen]) => sum + fen, 0);
  const orderAmountFenInt = options.orderAmountFenInt;

  const payeeInfos =
    totalDownstreamFen > 0 && orderAmountFenInt > totalDownstreamFen
      ? [
          {
            payee_uid: partnerId,
            payee_accttype: "MCHOWN",
            payee_type: "MCH",
            payee_amount: ((orderAmountFenInt - totalDownstreamFen) / 100).toFixed(2),
          },
          ...downstreamEntries.map(([payeeUid, fen]) => ({
            payee_uid: payeeUid,
            payee_accttype: "USEROWN",
            payee_type: "USER",
            payee_amount: (fen / 100).toFixed(2),
          })),
        ]
      : [
          {
            payee_uid: partnerId,
            payee_accttype: "MCHOWN",
            payee_type: "MCH",
            payee_amount: orderAmountStr,
          },
        ];

  try {
    console.log("[LLPAY][buildPayPayload] payee_infos0:", payeeInfos);
    const debugPayeeInfos = Array.isArray(payeeInfos)
      ? payeeInfos.map((p) => ({
          payee_uid: p.payee_uid,
          payee_type: p.payee_type,
          payee_accttype: p.payee_accttype,
          payee_amount: p.payee_amount,
        }))
      : [];
    // eslint-disable-next-line no-console
    console.log("[LLPAY][buildPayPayload] payee_infos:", debugPayeeInfos);
  } catch (_) {}

  const payload = {
    busi_type: options.busiType,
    goods_info: goodsInfo,
    notify_url: options.notifyUrl,
    order_amount: orderAmountStr,
    order_info: goodsName,
    pay_expire: options.payExpire,
    pay_method_infos: [{ amount: orderAmountStr, pay_type: options.payType }],
    payee_infos: payeeInfos,
    secured_flag: options.securedFlag,
    risk_item: riskItemStr,
    txn_seqno: options.txnSeqno,
    txn_time: options.txnTime,
    user_id: options.userId,
    extend_info: extendInfoStr,
  };

  return { ok: true, payload };
}

module.exports = {
  buildPayPayload,
};
