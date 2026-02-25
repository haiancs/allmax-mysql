const express = require("express");
const SysLog = require("../../repos/sysLogRepo");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const pageRaw = req.query.page;
    const pageSizeRaw = req.query.pageSize;

    const pageNum = Number(pageRaw);
    const pageSizeNum = Number(pageSizeRaw);

    const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
    const pageSize =
      Number.isFinite(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100
        ? pageSizeNum
        : 10;
    
    const offset = (page - 1) * pageSize;

    const { count, rows } = await SysLog.findAndCountAll({
      offset,
      limit: pageSize,
      order: [["createdAt", "DESC"]],
    });

    return res.send({
      code: 0,
      data: {
        items: rows,
        pagination: {
          page,
          pageSize,
          total: count,
        },
      },
    });
  } catch (error) {
    console.error("获取系统日志失败:", error);
    return res.status(500).send({
      code: -1,
      message: "获取系统日志失败",
      data: null,
    });
  }
});

module.exports = router;
