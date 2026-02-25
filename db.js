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
    await ensureLLPayV2Columns();
    await ensureShopSkuColumns();
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

async function ensureLLPayV2Columns() {
  const table = "llpay_v2";
  const columns = [
    { name: "secured_confirm_txn_seqno", ddl: "VARCHAR(64) NULL" },
    { name: "secured_confirm_txn_time", ddl: "VARCHAR(32) NULL" },
  ];

  let tableRows = [];
  try {
    tableRows = await sequelize.query("SHOW TABLES LIKE :table", {
      replacements: { table },
      type: QueryTypes.SELECT,
    });
  } catch (_) {
    return;
  }
  if (!Array.isArray(tableRows) || tableRows.length === 0) {
    return;
  }

  for (const column of columns) {
    let colRows = [];
    try {
      colRows = await sequelize.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE :column`,
        { replacements: { column: column.name }, type: QueryTypes.SELECT }
      );
    } catch (_) {
      continue;
    }
    if (Array.isArray(colRows) && colRows.length > 0) {
      continue;
    }
    try {
      await sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column.name}\` ${column.ddl}`
      );
    } catch (_) {}
  }
}

async function ensureShopSkuColumns() {
  const table = "shop_sku";
  const columns = [
    { name: "cargo_id", ddl: "VARCHAR(64) NULL" },
    { name: "description", ddl: "TEXT NULL" },
  ];

  let tableRows = [];
  try {
    tableRows = await sequelize.query("SHOW TABLES LIKE :table", {
      replacements: { table },
      type: QueryTypes.SELECT,
    });
  } catch (_) {
    return;
  }
  if (!Array.isArray(tableRows) || tableRows.length === 0) {
    return;
  }

  for (const column of columns) {
    let colRows = [];
    try {
      colRows = await sequelize.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE :column`,
        { replacements: { column: column.name }, type: QueryTypes.SELECT }
      );
    } catch (_) {
      continue;
    }
    if (Array.isArray(colRows) && colRows.length > 0) {
      continue;
    }
    try {
      await sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column.name}\` ${column.ddl}`
      );
    } catch (_) {}
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
