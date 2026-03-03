// 云函数入口文件
const cloud = require("wx-server-sdk");
const tcb = require("@cloudbase/node-sdk");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

// 初始化 CloudBase Node SDK
const app = tcb.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

// 配置项
const CAINIAO_SECRET_KEY = process.env.CAINIAO_SECRET_KEY; // 必须在云函数环境变量中配置
const CONTAINER_SERVICE_NAME = process.env.CONTAINER_SERVICE_NAME || "allmax-backend"; // 云托管服务名称
const CONTAINER_PATH = process.env.CONTAINER_PATH || "/api/cainiao/callback"; // 云托管回调路径

// 签名校验函数
function verifySignature(content, sign, key) {
  if (!key) return false;
  const msg = String(content || "") + String(key || "");
  const md5 = crypto.createHash("md5");
  md5.update(msg, "utf8");
  const digest = md5.digest("base64");
  return digest === sign;
}

exports.main = async (event, context) => {
  console.log("Received event:", event);

  // 1. 获取请求参数
  // 菜鸟通常以 x-www-form-urlencoded 发送 POST 请求
  // event.body 可能是 JSON 对象或查询字符串，取决于云开发网关配置
  const body = event.body || {};
  const { logistic_provider_id, data_digest, msg_type, logistics_interface } = body;

  if (!msg_type || !logistics_interface || !data_digest) {
    return {
      errorCode: "INVALID_PARAM",
      errorMsg: "Missing required parameters",
      success: false,
    };
  }

  // 2. 签名校验
  if (CAINIAO_SECRET_KEY) {
    // logistics_interface 在传输中可能是 JSON 字符串，需要保持原样进行验签
    const isValid = verifySignature(logistics_interface, data_digest, CAINIAO_SECRET_KEY);
    if (!isValid) {
      console.error("Signature verification failed");
      return {
        errorCode: "SIGN_ERROR",
        errorMsg: "Invalid signature",
        success: false,
      };
    }
  } else {
    console.warn("CAINIAO_SECRET_KEY not configured, skipping signature verification");
  }

  // 3. 转发到后端服务 (使用 callContainer)
  try {
    console.log(`Forwarding ${msg_type} to container service: ${CONTAINER_SERVICE_NAME}${CONTAINER_PATH}`);
    
    // 解析 logistics_interface 为对象（如果它还是字符串）
    let payload = logistics_interface;
    try {
      if (typeof payload === "string") {
        payload = JSON.parse(payload);
      }
    } catch (e) {
      // ignore
    }

    const result = await app.callContainer({
      name: CONTAINER_SERVICE_NAME,
      method: "POST",
      path: CONTAINER_PATH,
      header: {
        "Content-Type": "application/json; charset=utf-8",
      },
      data: {
        msg_type,
        logistics_interface: payload,
        original_data_digest: data_digest, // 透传原始签名供后端备查
      },
    });

    console.log("Call container result:", result);

    if (result.code) {
      throw new Error(`Call container failed: ${result.message} (${result.code})`);
    }

    // 4. 返回成功响应给菜鸟
    // 菜鸟期望的成功响应格式
    return {
      success: "true",
      errorCode: "0",
      errorMsg: "",
    };
  } catch (error) {
    console.error("Forwarding failed:", error.message);
    // 即使转发失败，也可以考虑是否返回重试信号，这里暂时返回业务失败
    return {
      errorCode: "INTERNAL_ERROR",
      errorMsg: error.message || "Internal server error",
      success: false,
    };
  }
};
