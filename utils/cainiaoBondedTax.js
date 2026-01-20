/*
  菜鸟跨境保税（BONDED_WHS）税费与申报金额回填工具

  目的：
  - 前端不传 itemMappings 时，后端根据环境变量与订单明细自动计算并回填：
    - deliveryOrder.orderAmountInfo.*（完税价、三税、综合税、运费、保险、优惠）
    - deliveryOrder.orderItemList[].declareInfo.*（按货值占比拆分的三税/综合税）

  启用条件（满足其一）：
  - CAINIAO_ENABLE_TAX_CALC=true
  - 或配置了任一：CAINIAO_CUSTOMS_TAX_RATE / CAINIAO_CONSUMPTION_TAX_RATE / CAINIAO_VAT_RATE / CAINIAO_TAX_DISCOUNT

  环境变量（核心）：
  - CAINIAO_TAX_DISCOUNT：税费折扣系数（0~1，如 0.7；不打折填 1）
  - CAINIAO_CUSTOMS_TAX_RATE：关税税率（0~1）
  - CAINIAO_CONSUMPTION_TAX_RATE：消费税税率（0~1）
  - CAINIAO_VAT_RATE：增值税税率（0~1）

  环境变量（可选）：
  - CAINIAO_DEFAULT_INSURANCE：默认保险费（支持“元”或“分”；2.00 表示 2 元，200 表示 200 分）
  - CAINIAO_DEFAULT_POST_FEE：默认运费 postFee（同上）
  - CAINIAO_TAX_CALC_FORCE：当报文已有非 0 税额时是否仍强制覆盖（true/false）
  - CAINIAO_TAX_CALC_ALL_TYPES：非 BONDED_WHS 订单是否也计算（true/false）
*/

const { safeTrim, coerceIntOrNull, envTruthy, envRate01, envFen } = require("./envUtils");

function sumInt(list) {
  let s = 0;
  for (const x of list) s += coerceIntOrNull(x) || 0;
  return s;
}

function allocateByWeight(total, weights) {
  const t = coerceIntOrNull(total) || 0;
  const w = Array.isArray(weights) ? weights.map((x) => Math.max(0, coerceIntOrNull(x) || 0)) : [];
  const n = w.length;
  if (!n) return [];
  const sumW = sumInt(w);
  if (sumW <= 0) {
    const out = new Array(n).fill(0);
    out[n - 1] = t;
    return out;
  }
  const out = new Array(n).fill(0);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out[i] = t - acc;
      break;
    }
    const v = Math.round((t * w[i]) / sumW);
    out[i] = v;
    acc += v;
  }
  return out;
}

/*
  回填逻辑（对齐海关/菜鸟金额校验口径）
  - goodsTotalPrice = Σ itemTotalActualPrice
  - dutiablePrice = insurance + postFee + goodsTotalPrice
  - customsTax = dutiablePrice * customsRate * discount
  - consumptionTax = ((dutiablePrice + customsTax) * consumptionRate / (1 - consumptionRate)) * discount
  - vat = (dutiablePrice + customsTax + consumptionTax) * vatRate * discount
  - totalTax = customsTax + consumptionTax + vat
  - actualPayment = dutiablePrice + totalTax - coupon（coupon 若缺失则按反推补齐）
*/
function fillBondedTaxAndDeclareInfo(order) {
  const o = order && typeof order === "object" ? order : {};
  const amount = o.orderAmountInfo && typeof o.orderAmountInfo === "object" ? o.orderAmountInfo : {};
  const items = Array.isArray(o.orderItemList) ? o.orderItemList : [];

  const hasAnyTaxValue =
    (coerceIntOrNull(amount.customsTax) || 0) !== 0 ||
    (coerceIntOrNull(amount.consumptionTax) || 0) !== 0 ||
    (coerceIntOrNull(amount.vat) || 0) !== 0 ||
    (coerceIntOrNull(amount.totalTax) || 0) !== 0 ||
    items.some((it) => {
      const di = it?.declareInfo && typeof it.declareInfo === "object" ? it.declareInfo : {};
      return (
        (coerceIntOrNull(di.customsTax) || 0) !== 0 ||
        (coerceIntOrNull(di.consumptionTax) || 0) !== 0 ||
        (coerceIntOrNull(di.vat) || 0) !== 0 ||
        (coerceIntOrNull(di.totalTax) || 0) !== 0
      );
    });

  const force = envTruthy("CAINIAO_TAX_CALC_FORCE");
  if (hasAnyTaxValue && !force) return order;

  const hasRateEnv =
    !!safeTrim(process.env.CAINIAO_CUSTOMS_TAX_RATE) ||
    !!safeTrim(process.env.CAINIAO_CONSUMPTION_TAX_RATE) ||
    !!safeTrim(process.env.CAINIAO_VAT_RATE) ||
    !!safeTrim(process.env.CAINIAO_TAX_DISCOUNT);
  const enabled = envTruthy("CAINIAO_ENABLE_TAX_CALC") || hasRateEnv;
  if (!enabled) return order;

  const allowAllTypes = envTruthy("CAINIAO_TAX_CALC_ALL_TYPES");
  if (safeTrim(o.orderType) !== "BONDED_WHS" && !allowAllTypes) return order;

  const discount = envRate01("CAINIAO_TAX_DISCOUNT", 1);
  const customsRate = envRate01("CAINIAO_CUSTOMS_TAX_RATE", 0);
  const consumptionRate = envRate01("CAINIAO_CONSUMPTION_TAX_RATE", 0);
  const vatRate = envRate01("CAINIAO_VAT_RATE", 0);

  const insuranceFen = coerceIntOrNull(amount.insurance) ?? envFen("CAINIAO_DEFAULT_INSURANCE", 0);
  const postFeeFen = coerceIntOrNull(amount.postFee) ?? envFen("CAINIAO_DEFAULT_POST_FEE", 0);

  const normalizedItems = items.map((it) => {
    const out = it && typeof it === "object" ? it : {};
    out.declareInfo = out.declareInfo && typeof out.declareInfo === "object" ? out.declareInfo : {};
    const qty = Math.max(0, coerceIntOrNull(out.itemQuantity) || 0);
    const itemTotalPrice = coerceIntOrNull(out.declareInfo.itemTotalPrice);
    const itemTotalActualPrice = coerceIntOrNull(out.declareInfo.itemTotalActualPrice);
    const effectiveTotal = itemTotalActualPrice ?? itemTotalPrice ?? 0;
    if (itemTotalPrice == null) out.declareInfo.itemTotalPrice = effectiveTotal;
    if (itemTotalActualPrice == null) out.declareInfo.itemTotalActualPrice = effectiveTotal;
    if (qty > 0 && effectiveTotal === 0) {
      out.declareInfo.itemTotalPrice = 0;
      out.declareInfo.itemTotalActualPrice = 0;
    }
    return out;
  });

  const goodsTotalPriceFen = sumInt(normalizedItems.map((it) => it?.declareInfo?.itemTotalActualPrice));
  const dutiablePriceFen = insuranceFen + postFeeFen + goodsTotalPriceFen;

  const customsTaxFen = Math.round(dutiablePriceFen * customsRate * discount);
  const safeDenominator = 1 - consumptionRate;
  const consumptionBase =
    safeDenominator > 0 ? ((dutiablePriceFen + customsTaxFen) * consumptionRate) / safeDenominator : 0;
  const consumptionTaxFen = Math.round(consumptionBase * discount);
  const vatTaxFen = Math.round((dutiablePriceFen + customsTaxFen + consumptionTaxFen) * vatRate * discount);
  const totalTaxFen = customsTaxFen + consumptionTaxFen + vatTaxFen;

  amount.insurance = insuranceFen;
  amount.postFee = postFeeFen;
  amount.dutiablePrice = dutiablePriceFen;
  amount.customsTax = customsTaxFen;
  amount.consumptionTax = consumptionTaxFen;
  amount.vat = vatTaxFen;
  amount.totalTax = totalTaxFen;
  amount.currency = safeTrim(amount.currency) || "CNY";

  const actualPaymentFen = coerceIntOrNull(amount.actualPayment) || 0;
  const existingCouponFen = coerceIntOrNull(amount.coupon);
  const couponFenRaw = existingCouponFen != null ? existingCouponFen : dutiablePriceFen + totalTaxFen - actualPaymentFen;
  amount.coupon = Math.max(0, Math.trunc(couponFenRaw));

  const weights = normalizedItems.map((it) => coerceIntOrNull(it?.declareInfo?.itemTotalActualPrice) || 0);
  const customsAllocated = allocateByWeight(customsTaxFen, weights);
  const consumptionAllocated = allocateByWeight(consumptionTaxFen, weights);
  const vatAllocated = allocateByWeight(vatTaxFen, weights);

  for (let i = 0; i < normalizedItems.length; i++) {
    const di = normalizedItems[i].declareInfo;
    di.customsTax = customsAllocated[i] || 0;
    di.consumptionTax = consumptionAllocated[i] || 0;
    di.vat = vatAllocated[i] || 0;
    di.totalTax = (di.customsTax || 0) + (di.consumptionTax || 0) + (di.vat || 0);
  }

  o.orderItemList = normalizedItems;
  o.orderAmountInfo = amount;
  return o;
}

module.exports = {
  fillBondedTaxAndDeclareInfo,
};
