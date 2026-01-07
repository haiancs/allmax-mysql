require("dotenv").config();

const { Sequelize } = require("sequelize");

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
  } catch (error) {
    isConnected = false;
    console.error("数据库连接失败:", error.message);
    console.log("请检查 .env 文件中的数据库配置");
    return;
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
