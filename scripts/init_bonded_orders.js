const { Sequelize, QueryTypes } = require("sequelize");
require("dotenv").config();

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
  dialect: "mysql",
  logging: console.log,
});

async function main() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    // Check if table exists
    const [results] = await sequelize.query("SHOW TABLES LIKE 'bonded_warehouse_orders'");
    
    if (results.length === 0) {
      console.log("Creating bonded_warehouse_orders table...");
      await sequelize.query(`
        CREATE TABLE \`bonded_warehouse_orders\` (
          \`_id\` VARCHAR(36) NOT NULL,
          \`orderId\` VARCHAR(64) NOT NULL COMMENT '关联 shop_order._id',
          \`cainiao_order_code\` VARCHAR(64) DEFAULT NULL COMMENT '菜鸟物流订单号 lgOrderCode',
          \`status\` VARCHAR(32) DEFAULT 'PENDING' COMMENT '状态: PUSHED, SHIPPED, FAILED',
          \`logistics_no\` VARCHAR(64) DEFAULT NULL COMMENT '运单号',
          \`request_payload\` JSON DEFAULT NULL COMMENT '请求报文快照',
          \`response_payload\` JSON DEFAULT NULL COMMENT '响应报文快照',
          \`pushed_at\` BIGINT DEFAULT NULL COMMENT '推单时间',
          \`shipped_at\` BIGINT DEFAULT NULL COMMENT '发货时间',
          \`created_at\` BIGINT DEFAULT NULL,
          \`updated_at\` BIGINT DEFAULT NULL,
          PRIMARY KEY (\`_id\`),
          KEY \`idx_order_id\` (\`orderId\`),
          KEY \`idx_cainiao_code\` (\`cainiao_order_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("Table created.");
    } else {
      console.log("Table exists. checking columns...");
      const [columns] = await sequelize.query("SHOW COLUMNS FROM `bonded_warehouse_orders`");
      const colNames = columns.map(c => c.Field);
      
      const newCols = [
        { name: "cainiao_order_code", def: "VARCHAR(64) DEFAULT NULL" },
        { name: "logistics_no", def: "VARCHAR(64) DEFAULT NULL" },
        { name: "request_payload", def: "JSON DEFAULT NULL" },
        { name: "response_payload", def: "JSON DEFAULT NULL" },
        { name: "pushed_at", def: "BIGINT DEFAULT NULL" },
        { name: "shipped_at", def: "BIGINT DEFAULT NULL" },
        { name: "status", def: "VARCHAR(32) DEFAULT 'PENDING'" },
      ];

      for (const col of newCols) {
        if (!colNames.includes(col.name)) {
          console.log(`Adding column ${col.name}...`);
          await sequelize.query(`ALTER TABLE \`bonded_warehouse_orders\` ADD COLUMN \`${col.name}\` ${col.def}`);
        }
      }
    }

    console.log("Done.");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sequelize.close();
  }
}

main();
