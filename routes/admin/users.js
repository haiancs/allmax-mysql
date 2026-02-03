const express = require("express");
const { User } = require("../../repos/userRepo");

const router = express.Router();

router.post("/", async (req, res) => {
  const id = typeof req.body._id === "string" ? req.body._id.trim() : "";
  const openid = typeof req.body.openid === "string" ? req.body.openid.trim() : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
  const accpId = typeof req.body.accpId === "string" ? req.body.accpId.trim() : "";

  const where = {};
  if (id) {
    where.id = id;
  }
  if (openid) {
    where.openid = openid;
  }
  if (phone) {
    where.phone = phone;
  }
  if (accpId) {
    where.accpId = accpId;
  }

  const pageSizeRaw = req.body.pageSize;
  const pageRaw = req.body.page;
  const pageSizeNum = Number(pageSizeRaw);
  const pageNum = Number(pageRaw);
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum > 0 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const offset = (page - 1) * pageSize;

  const { rows, count } = await User.findAndCountAll({
    where,
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
});

router.post("/:id", async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    return res.status(400).send({
      code: -1,
      message: "id 必须存在",
      data: null,
    });
  }

  const user = await User.findByPk(id);
  if (!user) {
    return res.status(404).send({
      code: -1,
      message: "用户不存在",
      data: null,
    });
  }

  return res.send({
    code: 0,
    data: user,
  });
});

module.exports = router;
