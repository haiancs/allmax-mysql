const express = require("express");
const crypto = require("crypto");
const { sequelize } = require("../../db");
const { QueryTypes, Op } = require("sequelize");
const {
  createSpu,
  updateSpuById,
  deleteSpuById,
  findSpuById,
  listSpu,
  ShopSpu,
} = require("../../repos/shopSpuRepo");
const {
  createSku,
  updateSkuById,
  deleteSkuById,
  findSkuById,
  listSku,
  ShopSku,
} = require("../../repos/shopSkuRepo");
const {
  createAttrName,
  updateAttrNameById,
  deleteAttrNameById,
  findAttrNameById,
  listAttrNames,
  ShopAttrName,
} = require("../../repos/shopAttrNameRepo");
const {
  createAttrValue,
  updateAttrValueById,
  deleteAttrValueById,
  findAttrValueById,
  listAttrValues,
  listAttrValuesBySkuIds,
  ShopAttrValue,
} = require("../../repos/shopAttrValueRepo");
const {
  createSkuAttrLinks,
} = require("../../repos/shopSkuAttrLinkRepo");
const {
  createSpuCate,
  updateSpuCateById,
  deleteSpuCateById,
  findSpuCateById,
  listSpuCate,
  ShopSpuCate,
} = require("../../repos/shopSpuCateRepo");
const {
  createSpuCateLinks,
} = require("../../repos/shopSpuCateLinkRepo");

const router = express.Router();

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

// --- SPU 接口 ---

router.get("/spu", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";

    const pageSizeRaw = req.query.pageSize;
    const pageRaw = req.query.page;
    const pageSizeNum = Number(pageSizeRaw);
    const pageNum = Number(pageRaw);
    const pageSize =
      Number.isFinite(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100
        ? pageSizeNum
        : 20;
    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (status) where.status = status;
    if (name) {
      where.name = { [Op.like]: `%${name}%` };
    }

    const { rows, count } = await ShopSpu.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [["updatedAt", "DESC"]],
    });

    // 获取 SPU 关联的分类
    const spuIds = rows.map(r => r.id);
    let categoryLinks = [];
    if (spuIds.length) {
      categoryLinks = await sequelize.query(
        `SELECT m.leftRecordId as spuId, c._id as cateId, c.name as cateName 
         FROM mid_4RKifhrar m 
         JOIN shop_spu_cate c ON m.rightRecordId = c._id 
         WHERE m.leftRecordId IN (:spuIds)`,
        {
          replacements: { spuIds },
          type: QueryTypes.SELECT
        }
      );
    }

    const items = rows.map(row => {
      const spu = row.toJSON();
      spu.categories = categoryLinks
        .filter(link => link.spuId === spu.id)
        .map(link => ({ id: link.cateId, name: link.cateName }));
      return spu;
    });

    return res.send({
      code: 0,
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total: count,
        },
      },
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error.message || "获取 SPU 列表失败",
      data: null,
    });
  }
});

router.get("/spu/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const spuRow = await findSpuById(id);
    if (!spuRow) {
      return res.status(404).send({
        code: -1,
        message: "SPU 不存在",
        data: null,
      });
    }

    const spu = spuRow.toJSON();
    const categoryLinks = await sequelize.query(
      `SELECT c._id as id, c.name 
       FROM mid_4RKifhrar m 
       JOIN shop_spu_cate c ON m.rightRecordId = c._id 
       WHERE m.leftRecordId = :spuId`,
      {
        replacements: { spuId: id },
        type: QueryTypes.SELECT
      }
    );
    spu.categories = categoryLinks;

    return res.send({
      code: 0,
      data: spu,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error.message || "获取 SPU 详情失败",
      data: null,
    });
  }
});

router.post("/spu", async (req, res) => {
  const { name, detail, coverImage, status, priority, swiperImages, categoryIds } = req.body;
  const transaction = await sequelize.transaction();
  try {
    const id = generateId();
    const spu = await createSpu({
      id,
      name,
      detail,
      coverImage,
      status: status || "active",
      priority: priority || 0,
      swiperImages,
    }, { transaction });

    if (Array.isArray(categoryIds) && categoryIds.length) {
      const links = categoryIds.map(cateId => ({
        id: generateId(),
        leftRecordId: id,
        rightRecordId: cateId,
      }));
      await createSpuCateLinks(links, { transaction });
    }

    await transaction.commit();
    const result = await findSpuById(id);
    return res.send({
      code: 0,
      data: result,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).send({
      code: -1,
      message: error.message || "创建 SPU 失败",
      data: null,
    });
  }
});

router.put("/spu/:id", async (req, res) => {
  const { id } = req.params;
  const { name, detail, coverImage, status, priority, swiperImages, categoryIds } = req.body;
  const transaction = await sequelize.transaction();
  try {
    await updateSpuById(id, {
      name,
      detail,
      coverImage,
      status,
      priority,
      swiperImages,
    }, { transaction });

    if (Array.isArray(categoryIds)) {
      await sequelize.query(
        "DELETE FROM `mid_4RKifhrar` WHERE `leftRecordId` = :spuId",
        {
          replacements: { spuId: id },
          type: QueryTypes.DELETE,
          transaction,
        }
      );
      if (categoryIds.length) {
        const links = categoryIds.map(cateId => ({
          id: generateId(),
          leftRecordId: id,
          rightRecordId: cateId,
        }));
        await createSpuCateLinks(links, { transaction });
      }
    }

    await transaction.commit();
    const spu = await findSpuById(id);
    return res.send({
      code: 0,
      data: spu,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).send({
      code: -1,
      message: error.message || "更新 SPU 失败",
      data: null,
    });
  }
});

router.delete("/spu/:id", async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      "DELETE FROM `mid_4RKifhrar` WHERE `leftRecordId` = :spuId",
      {
        replacements: { spuId: id },
        type: QueryTypes.DELETE,
        transaction,
      }
    );
    await deleteSpuById(id, { transaction });
    await transaction.commit();
    return res.send({
      code: 0,
      message: "删除成功",
      data: null,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).send({
      code: -1,
      message: error.message || "删除 SPU 失败",
      data: null,
    });
  }
});

// --- SKU 接口 ---

router.get("/sku", async (req, res) => {
  try {
    const spuId = typeof req.query.spuId === "string" ? req.query.spuId.trim() : "";
    const cargoId = typeof req.query.cargoId === "string" ? req.query.cargoId.trim() : "";

    const pageSizeRaw = req.query.pageSize;
    const pageRaw = req.query.page;
    const pageSizeNum = Number(pageSizeRaw);
    const pageNum = Number(pageRaw);
    const pageSize =
      Number.isFinite(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100
        ? pageSizeNum
        : 20;
    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (spuId) where.spuId = spuId;
    if (cargoId) where.cargoId = cargoId;

    const { rows, count } = await ShopSku.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [["updatedAt", "DESC"]],
    });

    const skuIds = rows.map(r => r.id);
    const attrValues = await listAttrValuesBySkuIds(skuIds);
    
    const items = rows.map(row => {
      const sku = row.toJSON();
      sku.attributes = attrValues
        .filter(av => av.skuId === sku.id)
        .map(av => ({
          id: av.attrValueId,
          value: av.value,
        }));
      return sku;
    });

    return res.send({
      code: 0,
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total: count,
        },
      },
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error.message || "获取 SKU 列表失败",
      data: null,
    });
  }
});

router.get("/sku/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const skuRow = await findSkuById(id);
    if (!skuRow) {
      return res.status(404).send({
        code: -1,
        message: "SKU 不存在",
        data: null,
      });
    }

    const sku = skuRow.toJSON();
    const attrValues = await listAttrValuesBySkuIds([id]);
    sku.attributes = attrValues.map(av => ({
      id: av.attrValueId,
      value: av.value,
    }));

    return res.send({
      code: 0,
      data: sku,
    });
  } catch (error) {
    return res.status(500).send({
      code: -1,
      message: error.message || "获取 SKU 详情失败",
      data: null,
    });
  }
});

router.post("/sku", async (req, res) => {
  const { spuId, price, wholesalePrice, stock, image, cargoId, description, attrValueIds } = req.body;
  if (!spuId) {
    return res.status(400).send({
      code: -1,
      message: "spuId 必填",
      data: null,
    });
  }
  
  const transaction = await sequelize.transaction();
  try {
    const id = generateId();
    const sku = await createSku({
      id,
      spuId,
      price,
      wholesalePrice,
      stock: stock || 0,
      image,
      cargoId,
      description,
    }, { transaction });

    if (Array.isArray(attrValueIds) && attrValueIds.length) {
      const links = attrValueIds.map(avId => ({
        id: generateId(),
        leftRecordId: id,
        rightRecordId: avId,
      }));
      await createSkuAttrLinks(links, { transaction });
    }

    await transaction.commit();
    const result = await findSkuById(id);
    return res.send({
      code: 0,
      data: result,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).send({
      code: -1,
      message: error.message || "创建 SKU 失败",
      data: null,
    });
  }
});

router.put("/sku/:id", async (req, res) => {
  const { id } = req.params;
  const { spuId, price, wholesalePrice, stock, image, cargoId, description, attrValueIds } = req.body;
  const transaction = await sequelize.transaction();
  try {
    await updateSkuById(id, {
      spuId,
      price,
      wholesalePrice,
      stock,
      image,
      cargoId,
      description,
    }, { transaction });

    if (Array.isArray(attrValueIds)) {
      await sequelize.query(
        "DELETE FROM `mid_4RKieAhGh` WHERE `leftRecordId` = :skuId",
        {
          replacements: { skuId: id },
          type: QueryTypes.DELETE,
          transaction,
        }
      );
      if (attrValueIds.length) {
        const links = attrValueIds.map(avId => ({
          id: generateId(),
          leftRecordId: id,
          rightRecordId: avId,
        }));
        await createSkuAttrLinks(links, { transaction });
      }
    }

    await transaction.commit();
    const sku = await findSkuById(id);
    return res.send({
      code: 0,
      data: sku,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).send({
      code: -1,
      message: error.message || "更新 SKU 失败",
      data: null,
    });
  }
});

router.delete("/sku/:id", async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      "DELETE FROM `mid_4RKieAhGh` WHERE `leftRecordId` = :skuId",
      {
        replacements: { skuId: id },
        type: QueryTypes.DELETE,
        transaction,
      }
    );
    await deleteSkuById(id, { transaction });
    await transaction.commit();
    return res.send({
      code: 0,
      message: "删除成功",
      data: null,
    });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).send({
      code: -1,
      message: error.message || "删除 SKU 失败",
      data: null,
    });
  }
});

// --- 分类管理接口 ---

router.get("/categories", async (req, res) => {
  try {
    const items = await listSpuCate();
    return res.send({ code: 0, data: items });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

router.post("/categories", async (req, res) => {
  const { name, image } = req.body;
  try {
    const item = await createSpuCate({ id: generateId(), name, image });
    return res.send({ code: 0, data: item });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

router.put("/categories/:id", async (req, res) => {
  const { id } = req.params;
  const { name, image } = req.body;
  try {
    await updateSpuCateById(id, { name, image });
    const item = await findSpuCateById(id);
    return res.send({ code: 0, data: item });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

router.delete("/categories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await deleteSpuCateById(id);
    return res.send({ code: 0, message: "删除成功" });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

// --- 属性管理接口 ---

router.get("/attribute-names", async (req, res) => {
  try {
    const items = await listAttrNames();
    return res.send({ code: 0, data: items });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

router.get("/attribute-values", async (req, res) => {
  const { attrNameId } = req.query;
  try {
    const items = await listAttrValues({ attrNameId });
    return res.send({ code: 0, data: items });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

router.post("/attribute-names", async (req, res) => {
  const { name } = req.body;
  try {
    const item = await createAttrName({ id: generateId(), name });
    return res.send({ code: 0, data: item });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

router.post("/attribute-values", async (req, res) => {
  const { value, attrNameId } = req.body;
  try {
    const item = await createAttrValue({ id: generateId(), value, attrNameId });
    return res.send({ code: 0, data: item });
  } catch (error) {
    return res.status(500).send({ code: -1, message: error.message });
  }
});

module.exports = router;
