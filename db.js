require("dotenv").config();

const { Sequelize, QueryTypes } = require("sequelize");

const {
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  MYSQL_ADDRESS = "",
  MYSQL_DATABASE = "",
} = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize(MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgresql' | 'mssql' */,
});

let isConnected = false;

async function init() {
  try {
    await sequelize.authenticate();
    isConnected = true;
    console.log("数据库连接成功");
    await ensureRefundColumns();
  } catch (error) {
    isConnected = false;
    console.error("数据库连接失败:", error.message);
    console.log("请检查 .env 文件中的数据库配置");
    return;
  }
}

async function ensureRefundColumns() {
  const targets = [
    { table: "refund_apply", columns: ["refund_method_infos", "payee_refund_infos"] },
    { table: "llpay_refund", columns: ["refund_method_infos", "payee_refund_infos"] },
  ];
  for (const target of targets) {
    let tableRows = [];
    try {
      tableRows = await sequelize.query("SHOW TABLES LIKE :table", {
        replacements: { table: target.table },
        type: QueryTypes.SELECT,
      });
    } catch (_) {
      continue;
    }
    if (!Array.isArray(tableRows) || tableRows.length === 0) {
      continue;
    }
    for (const column of target.columns) {
      let colRows = [];
      try {
        colRows = await sequelize.query(
          `SHOW COLUMNS FROM \`${target.table}\` LIKE :column`,
          { replacements: { column }, type: QueryTypes.SELECT }
        );
      } catch (_) {
        continue;
      }
      if (Array.isArray(colRows) && colRows.length > 0) {
        continue;
      }
      try {
        await sequelize.query(
          `ALTER TABLE \`${target.table}\` ADD COLUMN \`${column}\` JSON NULL`
        );
      } catch (_) {}
    }
  }
}

function checkConnection() {
  return isConnected;
}

module.exports = {
  init,
  checkConnection,
  sequelize,
};
