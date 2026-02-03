const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
      field: "_id",
    },
    openid: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "openid",
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "phone",
    },
    gender: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: "gender",
    },
    nickname: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "nickname",
    },
    accpId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "accpId",
    },
  },
  {
    tableName: "users",
    timestamps: true,
  }
);

module.exports = {
  User,
};

