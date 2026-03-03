const express = require("express");
const { checkConnection, sequelize } = require("../db");
const { importSkuCsv } = require("../services/skuCsvImportService");
const {
  repairShopRelations,
  linkSkuAttrValuesFromCsv,
} = require("../services/shopRelationService");

const router = express.Router();

/**
 * @swagger
 * /shop/import/sku-csv:
 *   post:
 *     summary: Import SKU CSV data
 *     tags: [Shop]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filePath:
 *                 type: string
 *                 description: Path to the CSV file
 *               csvText:
 *                 type: string
 *                 description: CSV content as text
 *               limit:
 *                 type: integer
 *                 description: Limit the number of records to process
 *               dryRun:
 *                 type: boolean
 *                 description: If true, only validate without applying changes
 *     responses:
 *       200:
 *         description: Import successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /shop/repair/relations:
 *   post:
 *     summary: Repair shop relations
 *     tags: [Shop]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 description: If true, only validate without applying changes
 *     responses:
 *       200:
 *         description: Repair successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /shop/repair/sku-attr-from-csv:
 *   post:
 *     summary: Link SKU attribute values from CSV
 *     tags: [Shop]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filePath:
 *                 type: string
 *                 description: Path to the CSV file
 *               csvText:
 *                 type: string
 *                 description: CSV content as text
 *               limit:
 *                 type: integer
 *                 description: Limit the number of records to process
 *               dryRun:
 *                 type: boolean
 *                 description: If true, only validate without applying changes
 *     responses:
 *       200:
 *         description: Linking successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: object
 *       500:
 *         description: Server error
 */
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
