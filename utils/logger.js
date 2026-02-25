const winston = require("winston");
const Transport = require("winston-transport");
const SysLog = require("../repos/sysLogRepo");

class SequelizeTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  log(info, callback) {
    setImmediate(() => {
      const { level, message, timestamp, ...meta } = info;
      
      // 移除 winston 内部属性
      const { service, ...restMeta } = meta;

      SysLog.create({
        level,
        message,
        meta: Object.keys(restMeta).length > 0 ? restMeta : null,
        service: service || "backend-api",
      }).catch((err) => {
        // 防止日志写入失败导致应用崩溃，这里只能输出到控制台
        console.error("Failed to save log to database:", err);
      });
    });

    callback();
  }
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "allmax-backend" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new SequelizeTransport(),
  ],
});

// 添加 stream 属性，以便与 morgan 集成
logger.stream = {
  write: (message) => {
    logger.info(message.trim(), { type: "http_access" });
  },
};

module.exports = logger;
