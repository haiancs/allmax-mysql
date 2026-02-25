/**
 * 菜鸟（Cainiao）调用入口与路由挂载点
 *
 * 统一入口是本文件创建的 Express 应用，并在这里把菜鸟相关路由挂载到：
 * - /api/cainiao  -> routes/cainiao.js
 *
 * 菜鸟发货主链路（方式B默认）：
 * - 前端/调用方  -> POST /api/cainiao/deliveryorder/create
 * - routes/cainiao.js 调用 services/cainiaoDeliveryService.js 组装/校验报文并发起请求
 * - utils/cainiaoClient.js 负责按菜鸟 LINK 网关协议签名并请求 https://(pre)link.cainiao.com/gateway/link.do
 *
 * 依赖：
 * - db.js 提供 sequelize 与 checkConnection，用于数据库读订单/地址/支付等信息
 */
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, checkConnection, sequelize } = require("./db");
const distributionRouter = require("./routes/distribution");
const orderRoutes = require("./integrations/order/routes/orderRoutes");
const orderQueryRoutes = require("./integrations/order/routes/orderQueryRoutes");
const refundRoutes = require("./integrations/order/routes/refundRoutes");
const shopRouter = require("./routes/shop");
const shopSkuAttrRouter = require("./routes/shopSkuAttr");
const shopCartRouter = require("./routes/shopCart");
const shopGoodsRouter = require("./routes/shopGoods");
const llpayRouter = require("./routes/llpay");
const llpaySecuredTxnRouter = require("./routes/llpay/securedTxnRoutes");
const cainiaoRouter = require("./routes/cainiao");
const adminRouter = require("./routes/admin");
const appLogger = require("./utils/logger");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: process.env.API_BODY_LIMIT || "256kb" }));
const corsOptions = {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));
app.use(morgan("tiny", { stream: appLogger.stream }));
app.use("/api", orderQueryRoutes);
app.use("/api/distribution", distributionRouter);
app.use("/api/shop", shopRouter);
app.use("/api/shop", shopSkuAttrRouter);
app.use("/api/shop", shopCartRouter);
app.use("/api/shop", shopGoodsRouter);
app.use("/api/shop", orderRoutes);
app.use("/api/shop/refund", refundRoutes);
app.use("/api/llpay", llpayRouter);
app.use("/api/llpay/accp/txn", llpaySecuredTxnRouter);
app.use("/api/cainiao", cainiaoRouter);
app.use("/api/admin", adminRouter);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/status", async (req, res) => {
  res.send({
    code: 0,
    data: {
      connected: checkConnection(),
    },
  });
});

app.get("/api/test-log", (req, res) => {
  appLogger.info("测试日志写入 - 手动触发", { 
    source: "manual_test", 
    ip: req.ip,
    query: req.query 
  });
  res.send({ code: 0, message: "日志已记录，请检查 sys_logs 表" });
});

app.post("/api/shop_sku/update-count", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const { skuId, delta } = req.body;
  const change = Number(delta);

  if (!skuId || !Number.isFinite(change)) {
    return res.status(400).send({
      code: -1,
      message: "skuId 必须存在且 delta 必须为数字",
      data: null,
    });
  }

  try {
    const [result, metadata] = await sequelize.query(
      "UPDATE shop_sku SET `stock` = COALESCE(`stock`, 0) + ? WHERE `_id` = ? AND COALESCE(`stock`, 0) + ? >= 0",
      {
        replacements: [change, skuId, change],
      }
    );

    const affectedRows =
      metadata && typeof metadata.affectedRows === "number"
        ? metadata.affectedRows
        : 0;

    if (!affectedRows) {
      return res.status(400).send({
        code: -1,
        message: "库存不足或 SKU 不存在",
        data: null,
      });
    }

    res.send({
      code: 0,
      data: {
        skuId,
        delta: change,
      },
    });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: "更新库存失败",
      data: null,
    });
  }
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

const portFromEnv = process.env.PORT;
const defaultPort =
  typeof process.getuid === "function" && process.getuid() === 0 ? 80 : 8080;
const parsedPort = portFromEnv === undefined ? defaultPort : Number(portFromEnv);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort;

async function bootstrap() {
  const server = app.listen(port, "0.0.0.0", () => {
    console.log("启动成功", port);
  });

  server.on("error", (error) => {
    console.error("启动失败:", error);
    process.exit(1);
  });

  try {
    await initDB();
    if (!checkConnection()) {
      console.log("⚠️  警告: 数据库连接失败，应用将以有限功能模式运行");
      console.log("请检查 .env 文件中的数据库配置");
    }
  } catch (error) {
    console.error("数据库初始化失败:", error);
  }
}

bootstrap();
