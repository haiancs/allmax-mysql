const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../../db");
const { requestLLPayOpenapi } = require("../../client/openapiClient");
const llpayRepo = require("../../repos/llpayRepo");
const {
  listOrderItemsWithSkuSpuDistributionByOrderId,
} = require("../../../../repos/shopOrderItemRepo");
const {
  resolvePayeeUidByDistributionRecordIds,
} = require("../../../../repos/distributionRepo");
const {
  safeTrim,
  tryParseJsonObject,
  getLLPayHttpStatus,
  buildRefundSeqnoFromOrderId,
  safeNumber,
  ensureTimestamp14,
} = require("../../../../utils/llpayRouteUtils");
const { createLLPayRefund, updateLLPayRefundStatus, findLLPayRefundBySeqno } = require("../../repos/llpayRefundRepo");

const AfterServiceStatus = {
  TO_AUDIT: 10,
  THE_APPROVED: 20,
  HAVE_THE_GOODS: 30,
  ABNORMAL_RECEIVING: 40,
  COMPLETE: 50,
  CLOSED: 60,
};

async function refundApply(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const orderId = safeTrim(reqBody?.orderId || reqBody?.order_id || reqBody?.id);
  const refundReason = safeTrim(reqBody?.refund_reason || reqBody?.refundReason);
  let refundSeqno = safeTrim(reqBody?.refundSeqno || reqBody?.refund_seqno);
  let txnSeqno = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);
  let refundAmount = safeTrim(reqBody?.refundAmount || reqBody?.refund_amount);
  let notifyUrl = safeTrim(reqBody?.notifyUrl || reqBody?.notify_url);
  let refundTime = safeTrim(reqBody?.refundTime || reqBody?.refund_time);
  let refundMethodInfos = reqBody?.refund_method_infos;
  let payeeRefundInfos = reqBody?.payee_refund_infos;
  let txnDate = safeTrim(reqBody?.txn_date || reqBody?.txnDate);



  if (orderId) {
    const [llpay, orderRows] = await Promise.all([
      llpayRepo.findByOrderId(orderId),
      sequelize.query(
        "SELECT `_id`, `totalPrice`, `status`, `user`, `createdAt`, `updatedAt` FROM `shop_order` WHERE `_id` = :orderId LIMIT 1",
        { replacements: { orderId }, type: QueryTypes.SELECT }
      ),
    ]);
    if (!llpay) {
      return {
        ok: false,
        httpStatus: 404,
        body: { code: -1, message: "支付单不存在", data: null },
      };
    }
    const order = orderRows[0] || null;
    if (!order) {
      return {
        ok: false,
        httpStatus: 404,
        body: { code: -1, message: "订单不存在", data: null },
      };
    }

    const amountFen = safeNumber(llpay?.amountFen, NaN);
    const totalPriceNum = safeNumber(order?.totalPrice, NaN);
    if (Number.isFinite(amountFen) && amountFen > 0) {
      refundAmount = (amountFen / 100).toFixed(2);
    } else if (Number.isFinite(totalPriceNum) && totalPriceNum > 0) {
      refundAmount = totalPriceNum.toFixed(2);
    }
    const refundAmountNum = safeNumber(refundAmount, 0);
    if (!(refundAmountNum > 0)) {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: "退款金额无效", data: null },
      };
    }

    txnSeqno = safeTrim(llpay?.txnSeqno) || txnSeqno;
    if (!txnSeqno) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "支付单缺少 txnSeqno", data: null },
      };
    }

    refundSeqno = refundSeqno || buildRefundSeqnoFromOrderId(orderId);
    if (!refundSeqno) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "退款单号生成失败", data: null },
      };
    }
    if (refundSeqno.length > 64) {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: "refundSeqno 长度不能超过 64", data: null },
      };
    }

    notifyUrl =
      notifyUrl ||
      safeTrim(process.env.LLPAY_REFUND_NOTIFY_URL) ||
      safeTrim(process.env.LLPAY_NOTIFY_URL);
    if (!notifyUrl) {
      return {
        ok: false,
        httpStatus: 500,
        body: { code: -1, message: "缺少 LLPAY_REFUND_NOTIFY_URL 配置", data: null },
      };
    }

    refundTime = ensureTimestamp14(refundTime);
    const llTxnTime = safeTrim(llpay?.txnTime);
    if (!txnDate && llTxnTime && llTxnTime.length >= 8) {
      txnDate = llTxnTime.slice(0, 8);
    }

    const items = await listOrderItemsWithSkuSpuDistributionByOrderId(orderId);
    const recordIds = items.map((it) => safeTrim(it?.distributionRecordId)).filter(Boolean);
    const recordPayeeUidById = await resolvePayeeUidByDistributionRecordIds(recordIds);
    const partnerId = safeTrim(process.env.LLPAY_PARTNER_ID);
    const downstreamFenByPayeeUid = new Map();
    for (const it of items) {
      const qty = Math.max(0, Math.floor(Number(it?.count || 0)));
      if (!(qty > 0)) continue;
      const sharePrice = safeNumber(it?.sharePrice, NaN);
      const wholesalePrice = safeNumber(it?.wholesalePrice, NaN);
      if (!Number.isFinite(sharePrice) || !Number.isFinite(wholesalePrice)) continue;
      if (!(sharePrice >= wholesalePrice)) continue;
      const diffFen = Math.round((sharePrice - wholesalePrice) * 100);
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
    const orderAmountFenInt = Math.round(refundAmountNum * 100);
    if (partnerId) {
      payeeRefundInfos =
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
                payee_accttype: "MCHASSURE",
                payee_type: "MCH",
                payee_amount: refundAmount,
              },
            ];
    }

    const payType = safeTrim(process.env.LLPAY_PAY_TYPE) || "WECHAT_APPLET";
    refundMethodInfos = [{ pay_type: payType, amount: refundAmount }];
  } else {
    if (!refundSeqno || !txnSeqno || !refundAmount || !notifyUrl || !refundTime) {
      return {
        ok: false,
        httpStatus: 400,
        body: {
          code: -1,
          message: "refundSeqno、txnSeqno、refundAmount、notifyUrl、refundTime 必须存在",
          data: null,
        },
      };
    }
  }

  const payload = {
    refund_seqno: refundSeqno,
    txn_seqno: txnSeqno,
    refund_amount: refundAmount,
    notify_url: notifyUrl,
    refund_time: refundTime,
  };

  if (reqBody?.sub_mch_id || reqBody?.subMchId) payload.sub_mch_id = safeTrim(reqBody.sub_mch_id || reqBody.subMchId);
  if (reqBody?.txn_date || reqBody?.txnDate) payload.txn_date = safeTrim(reqBody.txn_date || reqBody.txnDate);
  if (refundReason) payload.refund_reason = refundReason;
  if (txnDate) payload.txn_date = txnDate;
  if (refundMethodInfos) payload.refund_method_infos = refundMethodInfos;
  if (payeeRefundInfos) payload.payee_refund_infos = payeeRefundInfos;
  if (reqBody?.quota_account_infos) payload.quota_account_infos = reqBody.quota_account_infos;
  if (reqBody?.divide_refund_infos) payload.divide_refund_infos = reqBody.divide_refund_infos;

  try {
    console.log("[LLPAY][refundApply] request payload:", payload);
    // 检查是否已存在，如果不存在则创建PENDING记录
    const existing = await findLLPayRefundBySeqno(refundSeqno);
    if (!existing) {
      await createLLPayRefund({
        refund_no: refundSeqno, // 通常售后单号和流水号一致
        refund_seqno: refundSeqno,
        txn_seqno: txnSeqno,
        refund_amount: refundAmount,
        refund_time: refundTime,
        status: "PENDING",
        _openid: "", // 暂无 openid 信息
        refund_method_infos: refundMethodInfos || null,
        payee_refund_infos: payeeRefundInfos || null,
      });
    }
  } catch (_) {}

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/v1/ipay/refund",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com/mch",
      body: payload,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const errCode = result.code || null;
    const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
    const httpStatus = getLLPayHttpStatus(result);
    // 更新为失败状态
    try {
      await updateLLPayRefundStatus(refundSeqno, {
        status: "FAIL",
        ret_code: errCode || "NETWORK_ERROR",
        ret_msg: result.error || "请求失败",
      });
    } catch (_) {}

    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      },
    };
  }

  const apiData = typeof result.data === "string" ? tryParseJsonObject(result.data) || result.data : result.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  
  if (retCode && retCode !== "0000") {
    // 业务层面的失败
    try {
      await updateLLPayRefundStatus(refundSeqno, {
        status: "FAIL",
        ret_code: retCode,
        ret_msg: safeTrim(apiObj?.ret_msg),
      });
    } catch (_) {}

    return {
      ok: false,
      httpStatus: 502,
      body: {
        code: -1,
        message: `退款申请失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: result.request,
      },
    };
  }

  // 成功
  try {
    // 状态映射：根据连连文档，0000 表示受理成功，具体状态看 refund_status
    // 但 ipay/refund 接口通常同步返回结果，ret_code=0000 即表示申请成功
    await updateLLPayRefundStatus(refundSeqno, {
      status: "SUCCESS", // 或 processing，视具体业务定义，这里简化为 SUCCESS 表示受理成功
      ret_code: "0000",
      ret_msg: safeTrim(apiObj?.ret_msg) || "Success",
      platform_refundno: safeTrim(apiObj?.platform_refundno),
    });
  } catch (_) {}

  return {
    ok: true,
    httpStatus: 200,
    body: {
      code: 0,
      data: apiObj || apiData,
      request: result.request,
      local: {
        order_id: orderId || null,
        refund_no: refundSeqno || null,
        refund_reason: refundReason || null,
        status: AfterServiceStatus.TO_AUDIT,
      },
    },
  };
}

async function refundQuery(body) {
  const reqBody = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const refundSeqno = safeTrim(reqBody?.refundSeqno || reqBody?.refund_seqno);
  const platformRefundno = safeTrim(reqBody?.platformRefundno || reqBody?.platform_refundno);
  const txnSeqno = safeTrim(reqBody?.txnSeqno || reqBody?.txn_seqno);

  if (!refundSeqno && !platformRefundno && !txnSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: {
        code: -1,
        message: "refundSeqno、platformRefundno 或 txnSeqno 至少提供一个",
        data: null,
      },
    };
  }

  const payload = {};
  if (refundSeqno) payload.refund_seqno = refundSeqno;
  if (platformRefundno) payload.platform_refundno = platformRefundno;
  if (txnSeqno) payload.txn_seqno = txnSeqno;

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/query/v1/ipay/refundquery",
      method: "POST",
      baseUrl: "https://openapi.lianlianpay.com",
      body: payload,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const errCode = result.code || null;
    const statusCode = typeof result.statusCode === "number" ? result.statusCode : 0;
    const httpStatus = getLLPayHttpStatus(result);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
        statusCode,
        errorCode: errCode,
        data: result.data || null,
        request: result.request,
      },
    };
  }

  const apiData = typeof result.data === "string" ? tryParseJsonObject(result.data) || result.data : result.data;
  const apiObj = apiData && typeof apiData === "object" ? apiData : null;
  const retCode = safeTrim(apiObj?.ret_code);
  if (retCode && retCode !== "0000") {
    return {
      ok: false,
      httpStatus: 502,
      body: {
        code: -1,
        message: `退款查询失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: result.request,
      },
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: { code: 0, data: apiObj || apiData, request: result.request },
  };
}

module.exports = {
  refundApply,
  refundQuery,
};
