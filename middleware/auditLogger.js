const logger = require("../utils/logger");

// 敏感字段脱敏
const SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cardno",
  "cvv",
  "creditcard",
  "id_no",
  "idno",
  "bank_acct_no",
];

function sanitize(obj) {
  if (!obj) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item));

  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const lowerKey = key.toLowerCase();
      // 如果 key 包含敏感词，则脱敏
      if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
        newObj[key] = "***";
      } else if (typeof obj[key] === "object") {
        newObj[key] = sanitize(obj[key]);
      } else {
        newObj[key] = obj[key];
      }
    }
  }
  return newObj;
}

/**
 * 审计日志中间件
 * 记录请求的详细信息，包括用户ID、IP、UserAgent、请求参数、响应状态等
 */
const auditLogger = (req, res, next) => {
  // 忽略健康检查等无关紧要的请求
  if (
    req.path === "/api/status" ||
    req.path === "/favicon.ico" ||
    req.path.startsWith("/static/")
  ) {
    return next();
  }

  const startTime = Date.now();

  // 监听响应结束事件
  // 使用 res.on('finish') 确保在响应发送完成后记录
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    // 尝试提取用户标识
    // 1. 优先检查 req.user (如果使用了认证中间件)
    // 2. 检查 headers 中的 x-user-id 或 x-wx-openid
    // 3. 检查 query 或 body 中的 userId/openid (仅供参考，作为备选)
    let userId = req.user?.id || req.user?.userId;
    let userRole = "unknown";

    if (!userId) {
      if (req.headers["x-user-id"]) {
        userId = req.headers["x-user-id"];
        userRole = "header-user";
      } else if (req.headers["x-wx-openid"]) {
        userId = req.headers["x-wx-openid"];
        userRole = "wx-user";
      } else {
        // 尝试从参数中获取，标记为 "potential"
        // 注意：这可能不安全，但在没有统一 Auth 中间件的情况下，这是目前唯一的方法
        userId =
          req.query.userId ||
          req.query.openid ||
          req.body?.userId ||
          req.body?.user_id ||
          req.body?.openid;
        
        if (userId) userRole = "param-user";
      }
    } else {
      userRole = "auth-user";
    }

    // 如果 userId 还是空的，尝试从 req.admin 中获取（如果有 Admin 中间件）
    if (!userId && req.admin) {
      userId = req.admin.id || req.admin.username;
      userRole = "admin";
    }

    // 构建审计日志对象
    const auditData = {
      type: "audit",
      method: req.method,
      url: req.originalUrl || req.url,
      status: statusCode,
      duration,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
      userId: userId || "anonymous",
      userRole,
      // 记录请求参数
      query:
        req.query && Object.keys(req.query).length > 0 ? req.query : undefined,
      params:
        req.params && Object.keys(req.params).length > 0
          ? req.params
          : undefined,
      // 记录 Body (脱敏)
      body:
        req.method !== "GET" && req.body && Object.keys(req.body).length > 0
          ? sanitize(req.body)
          : undefined,
    };

    // 决定日志级别
    let level = "info";
    if (statusCode >= 500) level = "error";
    else if (statusCode >= 400) level = "warn";

    // 构造日志消息
    const message = `[${req.method}] ${req.originalUrl} ${statusCode} ${duration}ms - User: ${
      userId || "anonymous"
    }`;

    // 写入日志
    // logger.info(message, meta) -> meta 会被存储在数据库的 meta 字段中
    logger.log({
      level,
      message,
      ...auditData,
    });
  });

  next();
};

module.exports = auditLogger;