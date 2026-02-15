const express = require('express');
const { Op } = require('sequelize');
const { ShopSpu } = require('../repos/shopSpuRepo');
const { ShopSku } = require('../repos/shopSkuRepo');
const { checkConnection } = require('../db');

const router = express.Router();

// 常量定义，假设 SPU_SELLING_STATUS 为 'ENABLED'
const SPU_SELLING_STATUS = 'ENABLED';

router.post('/goods/list', async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: '数据库未连接，请检查配置',
      data: null,
    });
  }

  try {
    const { pageSize: pageSizeRaw, pageNumber: pageNumberRaw, search } = req.body;

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

    // 查询 SPU 列表
    const { rows: spuList, count: total } = await ShopSpu.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['priority', 'DESC']],
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
    // 我们需要获取每个 SPU 的 SKU，这里为了简化，我们查询所有相关的 SKU
    // 注意：如果每个 SPU 有很多 SKU，这里的数据量可能会比较大，但考虑到分页每页只有 20 个 SPU，应该还好。
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
    console.error('Error in /goods/list:', error);
    res.status(500).send({
      code: -1,
      message: '服务器内部错误',
      data: null,
    });
  }
});

module.exports = router;
