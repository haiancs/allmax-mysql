const express = require("express");
const { checkConnection, sequelize } = require("../db");
const { importSkuCsv } = require("../services/skuCsvImportService");
const {
  repairShopRelations,
  linkSkuAttrValuesFromCsv,
} = require("../services/shopRelationService");

const router = express.Router();

router.post("/import/sku-csv", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const filePath = typeof body.filePath === "string" ? body.filePath : "";
  const csvText = typeof body.csvText === "string" ? body.csvText : "";
  const dryRun = body.dryRun === true;
  const limit = body.limit;

  try {
    const data = await importSkuCsv({
      sequelize,
      filePath,
      csvText,
      limit,
      dryRun,
    });
    res.send({ code: 0, data });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: error?.message || "导入失败",
      data: null,
    });
  }
});

router.post("/repair/relations", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const dryRun = body.dryRun === true;

  try {
    const data = await repairShopRelations({ sequelize, dryRun });
    res.send({ code: 0, data });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: error?.message || "修复失败",
      data: null,
    });
  }
});

router.post("/repair/sku-attr-from-csv", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const filePath = typeof body.filePath === "string" ? body.filePath : "";
  const csvText = typeof body.csvText === "string" ? body.csvText : "";
  const dryRun = body.dryRun === true;
  const limit = body.limit;

  try {
    const data = await linkSkuAttrValuesFromCsv({
      sequelize,
      filePath,
      csvText,
      limit,
      dryRun,
    });
    res.send({ code: 0, data });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: error?.message || "修复失败",
      data: null,
    });
  }
});

module.exports = router;
