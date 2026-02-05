const { requestLLPayOpenapi } = require("../../client/openapiClient");
const { encryptFields } = require("../../../../utils/llpayCryptoUtils");
const {
  safeTrim,
  ensureTimestamp14,
  tryParseJsonObject,
  getLLPayHttpStatus,
} = require("../../../../utils/llpayRouteUtils");

/**
 * 个人用户待激活开户
 * @param {Object} body 请求体
 * @returns {Promise<Object>}
 */
async function individualOpenAcctApply(body) {
  const reqBody = body && typeof body === "object" ? { ...body } : {};
  const publicKey = process.env.LLPAY_PUBLIC_KEY;

  const userId = safeTrim(reqBody.user_id || reqBody.userId);
  if (!userId) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "userId 必须存在", data: null },
    };
  }

  const txnSeqno = safeTrim(reqBody.txn_seqno || reqBody.txnSeqno);
  if (!txnSeqno) {
    return {
      ok: false,
      httpStatus: 400,
      body: { code: -1, message: "txnSeqno 必须存在", data: null },
    };
  }

  const notifyUrlRaw =
    safeTrim(reqBody.notify_url || reqBody.notifyUrl) ||
    safeTrim(process.env.LLPAY_OPENACCT_NOTIFY_URL) ||
    safeTrim(process.env.LLPAY_NOTIFY_URL);
  if (!notifyUrlRaw) {
    return {
      ok: false,
      httpStatus: 500,
      body: { code: -1, message: "缺少 notifyUrl 配置", data: null },
    };
  }

  const basicInfoRaw = reqBody.basic_info || reqBody.basicInfo;
  const basicInfo =
    basicInfoRaw && typeof basicInfoRaw === "object" && !Array.isArray(basicInfoRaw)
      ? { ...basicInfoRaw }
      : {
          reg_phone: reqBody.reg_phone || reqBody.regPhone,
          user_name: reqBody.user_name || reqBody.userName,
          id_type: reqBody.id_type || reqBody.idType,
          id_no: reqBody.id_no || reqBody.idNo,
          id_exp: reqBody.id_exp || reqBody.idExp,
          id_std: reqBody.id_std || reqBody.idStd,
          address: reqBody.address,
          occupation: reqBody.occupation,
          id_emblem: reqBody.id_emblem || reqBody.idEmblem,
          id_portrait: reqBody.id_portrait || reqBody.idPortrait,
          id_authority: reqBody.id_authority || reqBody.idAuthority,
        };

  const linkedAcctInfoRaw = reqBody.linked_acct_info || reqBody.linkedAcctInfo;
  const linkedAcctInfo =
    linkedAcctInfoRaw && typeof linkedAcctInfoRaw === "object" && !Array.isArray(linkedAcctInfoRaw)
      ? { ...linkedAcctInfoRaw }
      : {
          linked_acct_no: reqBody.linked_acct_no || reqBody.linkedAcctNo,
          linked_phone: reqBody.linked_phone || reqBody.linkedPhone,
        };

  const required = [
    ["basic_info.reg_phone", safeTrim(basicInfo.reg_phone)],
    ["basic_info.user_name", safeTrim(basicInfo.user_name)],
    ["basic_info.id_type", safeTrim(basicInfo.id_type)],
    ["basic_info.id_no", safeTrim(basicInfo.id_no)],
    ["basic_info.id_exp", safeTrim(basicInfo.id_exp)],
    ["basic_info.id_std", safeTrim(basicInfo.id_std)],
    ["basic_info.address", safeTrim(basicInfo.address)],
    ["basic_info.occupation", safeTrim(basicInfo.occupation)],
    ["basic_info.id_emblem", safeTrim(basicInfo.id_emblem)],
    ["basic_info.id_portrait", safeTrim(basicInfo.id_portrait)],
    ["linked_acct_info.linked_acct_no", safeTrim(linkedAcctInfo.linked_acct_no)],
    ["linked_acct_info.linked_phone", safeTrim(linkedAcctInfo.linked_phone)],
  ];
  for (const [k, v] of required) {
    if (!v) {
      return {
        ok: false,
        httpStatus: 400,
        body: { code: -1, message: `${k} 必须存在`, data: null },
      };
    }
  }

  const txnTime = ensureTimestamp14(reqBody.txn_time || reqBody.txnTime);
  const riskItemRaw = reqBody.risk_item ?? reqBody.riskItem;
  const riskItemObj = typeof riskItemRaw === "string" ? tryParseJsonObject(riskItemRaw) : riskItemRaw;
  const riskItem =
    riskItemRaw == null
      ? undefined
      : typeof riskItemObj === "object" && riskItemObj
        ? JSON.stringify(riskItemObj)
        : safeTrim(riskItemRaw);

  const agreeOpenAgreement = safeTrim(reqBody.agree_open_agreement || reqBody.agreeOpenAgreement) || "Y";

  const payload = {
    sub_mchid: safeTrim(reqBody.sub_mchid || reqBody.subMchid) || undefined,
    user_id: userId,
    txn_seqno: txnSeqno,
    txn_time: txnTime,
    notify_url: notifyUrlRaw,
    risk_item: riskItem || undefined,
    agree_open_agreement: agreeOpenAgreement,
    basic_info: basicInfo,
    linked_acct_info: linkedAcctInfo,
  };

  // 加密敏感字段
  if (payload.basic_info && publicKey) {
    const sensitiveFields = ["reg_phone", "user_name", "id_no"];
    const toEncrypt = {};
    sensitiveFields.forEach((f) => {
      if (payload.basic_info[f]) toEncrypt[f] = payload.basic_info[f];
    });
    const encrypted = encryptFields(toEncrypt, publicKey);
    Object.assign(payload.basic_info, encrypted);
  }

  if (payload.linked_acct_info && publicKey) {
    const sensitiveFields = ["linked_acct_no", "linked_phone"];
    const toEncrypt = {};
    sensitiveFields.forEach((f) => {
      if (payload.linked_acct_info[f]) toEncrypt[f] = payload.linked_acct_info[f];
    });
    const encrypted = encryptFields(toEncrypt, publicKey);
    Object.assign(payload.linked_acct_info, encrypted);
  }

  let result;
  try {
    result = await requestLLPayOpenapi({
      path: "/v1/accp/customer/openacct-snapply-individual",
      method: "POST",
      body: payload,
    });
  } catch (error) {
    result = { ok: false, statusCode: 0, code: "NETWORK_ERROR", error: error?.message || "NETWORK_ERROR" };
  }

  if (!result.ok) {
    const httpStatus = getLLPayHttpStatus(result);
    return {
      ok: false,
      httpStatus,
      body: {
        code: -1,
        message: result.error || "连连请求失败",
        statusCode: typeof result.statusCode === "number" ? result.statusCode : 0,
        errorCode: result.code || null,
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
        message: `开户申请失败: ${safeTrim(apiObj?.ret_msg) || retCode}`,
        data: apiObj || apiData,
        request: result.request,
      },
    };
  }

  return {
    ok: true,
    httpStatus: 200,
    body: {
      code: 0,
      data: apiObj || apiData,
      request: result.request,
    },
  };
}

/**
 * 开户激活申请
 * @param {Object} body 请求体
 * @returns {Promise<Object>}
 */
async function activateApply(body) {
  const reqBody = body && typeof body === "object" ? { ...body } : {};
  const publicKey = process.env.LLPAY_PUBLIC_KEY;

  // 加密敏感字段
  if (reqBody.linked_acct_info && publicKey) {
    const sensitiveFields = ["linked_acct_no", "linked_phone"];
    const toEncrypt = {};
    sensitiveFields.forEach((f) => {
      if (reqBody.linked_acct_info[f]) toEncrypt[f] = reqBody.linked_acct_info[f];
    });
    const encrypted = encryptFields(toEncrypt, publicKey);
    Object.assign(reqBody.linked_acct_info, encrypted);
  }

  const result = await requestLLPayOpenapi({
    path: "/v1/accp/customer/openacct-activate-apply",
    method: "POST",
    body: reqBody,
  });

  return {
    ok: result.ok,
    httpStatus: result.statusCode || (result.ok ? 200 : 502),
    body: {
      code: result.ok ? 0 : -1,
      message: result.ok ? "success" : (result.error || "请求失败"),
      data: result.data,
    },
  };
}

/**
 * 开户激活验证
 * @param {Object} body 请求体
 * @returns {Promise<Object>}
 */
async function activateVerify(body) {
  const result = await requestLLPayOpenapi({
    path: "/v1/accp/customer/openacct-activate-verify",
    method: "POST",
    body: body,
  });

  return {
    ok: result.ok,
    httpStatus: result.statusCode || (result.ok ? 200 : 502),
    body: {
      code: result.ok ? 0 : -1,
      message: result.ok ? "success" : (result.error || "请求失败"),
      data: result.data,
    },
  };
}

module.exports = {
  individualOpenAcctApply,
  activateApply,
  activateVerify,
};
