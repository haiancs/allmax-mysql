const express = require('express');
const { Op } = require('sequelize');
const { ShopSpu } = require('../repos/shopSpuRepo');
const { ShopSku } = require('../repos/shopSkuRepo');
const { SpuCateLink } = require('../repos/shopSpuCateLinkRepo');
const { checkConnection, sequelize } = require('../db');

const router = express.Router();

const SPU_SELLING_STATUS = 'active';

// 中间件：检查数据库连接
const checkDbConnection = (req, res, next) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: '数据库未连接，请检查配置',
      data: null,
    });
  }
  next();
};

/**
 * @swagger
 * /shop/goods/list-with-price:
 *   post:
 *     summary: Get goods list with price
 *     tags: [Shop]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pageSize:
 *                 type: integer
 *                 default: 20
 *               pageNumber:
 *                 type: integer
 *                 default: 1
 *               search:
 *                 type: string
 *                 description: Search keyword for product name
 *               cateId:
 *                 type: string
 *                 description: Category ID to filter by
 *     responses:
 *       200:
 *         description: List retrieved successfully
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
 *                   properties:
 *                     records:
 *                       type: array
 *                       items:
 *                         type: object
 *                     total:
 *                       type: integer
 *       503:
 *         description: Database not connected
 *       500:
 *         description: Server error
 */
router.post('/goods/list-with-price', checkDbConnection, async (req, res) => {
  try {
    const { pageSize: pageSizeRaw, pageNumber: pageNumberRaw, search, cateId, sort, sortType } = req.body;

    const pageSize = Number(pageSizeRaw) || 20;
    const pageNumber = Number(pageNumberRaw) || 1;
    const offset = (pageNumber - 1) * pageSize;

    // 构建查询条件
    const where = {
      status: SPU_SELLING_STATUS,
    };

    if (search && typeof search === 'string' && search.trim()) {
      where.name = {
        [Op.like]: `%${search.trim()}%`,
      };
    }

    // 如果传入了 cateId，先查询关联表获取 spuId 列表
    if (cateId && typeof cateId === 'string' && cateId.trim()) {
      const links = await SpuCateLink.findAll({
        where: {
          categoryId: cateId.trim(),
        },
        attributes: ['spuId'],
      });

      const spuIds = links.map((link) => link.spuId);

      // 如果分类下没有商品，直接返回空
      if (!spuIds.length) {
        return res.send({
          code: 0,
          data: {
            records: [],
            total: 0,
          },
        });
      }

      // 添加 spuId 过滤条件
      where.id = {
        [Op.in]: spuIds,
      };
    }

    let order = [['priority', 'DESC']];
    if (sort === 'price') {
      const direction = sortType === 'desc' ? 'DESC' : 'ASC';
      order = [[sequelize.literal('(SELECT MIN(price) FROM shop_sku WHERE shop_sku.spu = ShopSpu._id)'), direction]];
    } else if (sort === 'date') {
        order = [['updatedAt', sortType === 'desc' ? 'DESC' : 'ASC']];
    }

    // 查询 SPU 列表
    const { rows: spuList, count: total } = await ShopSpu.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order,
      attributes: ['id', 'name', 'coverImage', 'priority'], // 选择需要的字段
    });

    // 如果没有 SPU，直接返回
    if (!spuList.length) {
      return res.send({
        code: 0,
        data: {
          records: [],
          total: 0,
        },
      });
    }

    // 获取 SPU IDs
    const spuIds = spuList.map((spu) => spu.id);

    // 查询关联的 SKU
    const skuList = await ShopSku.findAll({
      where: {
        spuId: {
          [Op.in]: spuIds,
        },
      },
      attributes: ['id', 'spuId', 'price', 'wholesalePrice'],
      order: [['createdAt', 'ASC']],
    });

    // 将 SKU 按 SPU ID 分组
    const skuMap = {};
    skuList.forEach((sku) => {
      if (!skuMap[sku.spuId]) {
        skuMap[sku.spuId] = [];
      }
      skuMap[sku.spuId].push(sku);
    });

    // 组装数据
    const records = spuList.map((spu) => {
      const spuData = spu.toJSON();
      // 获取该 SPU 的 SKU 列表
      const relatedSkus = skuMap[spu.id] || [];
      const firstSku = relatedSkus.length ? relatedSkus[0] : null;

      const basePrice = firstSku && typeof firstSku.price === 'number' ? firstSku.price : null;
      const rawWholesalePrice = firstSku && firstSku.wholesalePrice;
      const wholesalePrice =
        typeof rawWholesalePrice === 'number' && rawWholesalePrice > 0 ? rawWholesalePrice : basePrice;

      return {
        _id: spuData.id,
        name: spuData.name,
        cover_image: spuData.coverImage,
        priority: spuData.priority,
        price: basePrice,
        wholesale_price: wholesalePrice,
      };
    });

    res.send({
      code: 0,
      data: {
        records,
        total,
      },
    });
  } catch (error) {
    console.error('Error in /goods/list-with-price:', error);
    res.status(500).send({
      code: -1,
      message: '服务器内部错误',
      data: null,
    });
  }
});

/**
 * 获取商品列表（纯 SPU 信息）
 * 新接口：/goods/list
 */
router.post('/goods/list', checkDbConnection, async (req, res) => {
  try {
    const { pageSize: pageSizeRaw, pageNumber: pageNumberRaw, search, cateId } = req.body;

    const pageSize = Number(pageSizeRaw) || 20;
    const pageNumber = Number(pageNumberRaw) || 1;
    const offset = (pageNumber - 1) * pageSize;

    // 构建查询条件
    const where = {
      status: SPU_SELLING_STATUS,
    };

    if (search && typeof search === 'string' && search.trim()) {
      where.name = {
        [Op.like]: `%${search.trim()}%`,
      };
    }

    // 如果传入了 cateId，先查询关联表获取 spuId 列表
    if (cateId && typeof cateId === 'string' && cateId.trim()) {
      const links = await SpuCateLink.findAll({
        where: {
          categoryId: cateId.trim(),
        },
        attributes: ['spuId'],
      });

      const spuIds = links.map((link) => link.spuId);

      // 如果分类下没有商品，直接返回空
      if (!spuIds.length) {
        return res.send({
          code: 0,
          data: {
            records: [],
            total: 0,
          },
        });
      }

      // 添加 spuId 过滤条件
      where.id = {
        [Op.in]: spuIds,
      };
    }

    // 查询 SPU 列表
    const { rows: spuList, count: total } = await ShopSpu.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['priority', 'DESC']],
      // 返回所有基础字段，或者根据需求筛选
      // 这里为了通用性，返回常用字段
      attributes: ['id', 'name', 'coverImage', 'priority', 'status', 'createdAt', 'updatedAt'], 
    });

    const records = spuList.map(spu => {
      const spuData = spu.toJSON();
      return {
        _id: spuData.id,
        ...spuData,
        // 移除 sequelize 的 id 字段，因为前端可能用 _id
        id: undefined, 
      };
    });

    res.send({
      code: 0,
      data: {
        records,
        total,
      },
    });
  } catch (error) {
    console.error('Error in /goods/list:', error);
    res.status(500).send({
      code: -1,
      message: '服务器内部错误',
      data: null,
    });
  }
});

/**
 * 获取特定商品详情
 * 新接口：/goods/:id
 */
router.get('/goods/:id', checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).send({
        code: -1,
        message: '缺少商品ID',
        data: null,
      });
    }

    const spu = await ShopSpu.findOne({
      where: {
        id,
        status: SPU_SELLING_STATUS, // 确保只能查到上架的商品，或者根据需求去掉这个限制
      },
    });

    if (!spu) {
      return res.status(404).send({
        code: -1,
        message: '商品不存在或已下架',
        data: null,
      });
    }

    const spuData = spu.toJSON();

    // 可以在这里查询关联的 SKU，如果详情页需要展示规格
    const skus = await ShopSku.findAll({
      where: { spuId: id },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'spuId', 'price', 'wholesalePrice', 'stock', 'image', 'description'],
    });

    res.send({
      code: 0,
      data: {
        _id: spuData.id,
        ...spuData,
        id: undefined,
        skus: skus.map(sku => sku.toJSON()),
      },
    });
  } catch (error) {
    console.error('Error in /goods/:id:', error);
    res.status(500).send({
      code: -1,
      message: '服务器内部错误',
      data: null,
    });
  }
});

module.exports = router;
