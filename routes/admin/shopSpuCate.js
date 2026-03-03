const express = require("express");
const { listSpuCate } = require("../../repos/shopSpuCateRepo");

const router = express.Router();

/**
 * @swagger
 * /admin/shop_spu_cate:
 *   get:
 *     summary: List product categories (Admin)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Server error
 */
router.get("/", async (req, res) => {
  try {
    // 调用 repo 获取所有分类
    // listSpuCate 内部使用 findAll，如果没传 limit/offset 则返回所有
    const categories = await listSpuCate();

    // 格式化数据，移除 sequelize 实例包装
    const data = categories.map((c) => (c.toJSON ? c.toJSON() : c));

    res.send({
      code: 0,
      data,
    });
  } catch (error) {
    console.error("Error in /admin/shop_spu_cate:", error);
    res.status(500).send({
      code: -1,
      message: error.message || "获取分类列表失败",
      data: null,
    });
  }
});

module.exports = router;
