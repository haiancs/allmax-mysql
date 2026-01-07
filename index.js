const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, checkConnection, sequelize } = require("./db");
const distributionRouter = require("./routes/distribution");
const shopRouter = require("./routes/shop");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);
app.use("/api/distribution", distributionRouter);
app.use("/api/shop", shopRouter);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 获取数据库状态
app.get("/api/status", async (req, res) => {
  res.send({
    code: 0,
    data: {
      connected: checkConnection(),
    },
  });
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
