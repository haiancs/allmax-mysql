const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const SysLog = sequelize.define(
  "SysLog",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      field: "_id",
    },
    level: {
      type: DataTypes.STRING(16),
      allowNull: false,
      comment: "日志级别: info, error, warn, debug",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "日志内容",
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "元数据，存储对象详情、报错堆栈等",
    },
    service: {
      type: DataTypes.STRING(64),
      defaultValue: "backend-api",
      comment: "服务名称",
    },
    createdAt: {
      type: DataTypes.DATE,
      field: "createTime",
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: "updateTime",
    },
  },
  {
    tableName: "sys_logs",
    timestamps: true,
    indexes: [
      {
        fields: ["level"],
      },
      {
        fields: ["createTime"],
      },
    ],
  }
);

// 确保在应用启动时同步表结构
// 注意：在生产环境中通常使用 migration，但对于简单项目，sync() 是可接受的
SysLog.sync().catch(err => {
  console.error("无法创建日志表:", err);
});

module.exports = SysLog;
