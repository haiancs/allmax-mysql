const express = require("express");
const { checkConnection, sequelize } = require("../db");

const router = express.Router();

router.get("/customs-body-config", async (req, res) => {
  if (!checkConnection()) {
    return res.status(503).send({
      code: -1,
      message: "数据库未连接，请检查配置",
      data: null,
    });
  }

  try {
    const [rows] = await sequelize.query(
      "SELECT `key`, `value` FROM `system_config` WHERE `key` IN ('LLPAY_OID_PARTNER','LLPAY_PLATFORM_CODE','LLPAY_PLATFORM_NAME','LLPAY_NOTIFY_URL','LLPAY_CUSTOM_CODE')"
    );

    const map = new Map();
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const k = r && typeof r.key === "string" ? r.key : "";
        const v = r && typeof r.value === "string" ? r.value : "";
        if (k) {
          map.set(k, v);
        }
      }
    }

    const oidPartner =
      map.get("LLPAY_OID_PARTNER") || "TODO_FILL_LLPAY_OID_PARTNER_FROM_LLPAY";
    const platformCode =
      map.get("LLPAY_PLATFORM_CODE") ||
      "TODO_FILL_LLPAY_PLATFORM_CODE_FROM_LLPAY";
    const platformName =
      map.get("LLPAY_PLATFORM_NAME") ||
      "TODO_FILL_LLPAY_PLATFORM_NAME_FROM_LLPAY";
    const notifyUrl =
      map.get("LLPAY_NOTIFY_URL") || "https://example.com/llpay/customs/notify";
    const customCode =
      map.get("LLPAY_CUSTOM_CODE") || "TODO_FILL_LLPAY_CUSTOM_CODE_FROM_CUSTOMS";

    res.send({
      code: 0,
      data: {
        oid_partner: oidPartner,
        platform_code: platformCode,
        platform_name: platformName,
        notify_url: notifyUrl,
        custom_code: customCode,
      },
    });
  } catch (error) {
    res.status(500).send({
      code: -1,
      message: "查询连连海关推送配置失败",
      data: null,
    });
  }
});

module.exports = router;

