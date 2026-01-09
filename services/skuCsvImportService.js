const fs = require("fs");
const readline = require("readline");
const crypto = require("crypto");
const { QueryTypes } = require("sequelize");
const {
  upsertSpuCateLinks,
  upsertSkuAttrValueLinks,
} = require("./shopRelationService");

function md5Hex(input) {
  return crypto.createHash("md5").update(String(input)).digest("hex");
}

function parseCsvLine(line) {
  const text = String(line || "").replace(/\r$/, "");
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === ",") {
      result.push(current);
      current = "";
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    current += ch;
  }

  result.push(current);
  return result;
}

function splitIntoChunks(items, chunkSize) {
  const size = Number(chunkSize);
  const effectiveSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 1;
  const chunks = [];
  for (let i = 0; i < items.length; i += effectiveSize) {
    chunks.push(items.slice(i, i + effectiveSize));
  }
  return chunks;
}

function safeParseBarcodes(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return "";
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v || "").trim()).filter(Boolean).join(",");
      }
    } catch (_) {}
  }
  return text;
}

function normalizeSpuStatus(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return null;
  }
  if (value === "TO_ENABLE" || value === "待上架" || value === "未上架" || value === "已备案") {
    return "TO_ENABLE";
  }
  if (value === "ENABLED" || value === "销售中" || value === "已上架") {
    return "ENABLED";
  }
  if (value === "DISABLED" || value === "已下架" || value === "下架") {
    return "DISABLED";
  }
  return "TO_ENABLE";
}

function toCloudFileId(path) {
  const raw = String(path || "").trim();
  if (!raw) {
    return null;
  }
  if (raw.startsWith("cloud://")) {
    return raw;
  }
  const normalizedPath = raw.replace(/^\/+/, "");
  const prefix =
    process.env.CLOUD_FILEID_PREFIX ||
    process.env.CLOUDBASE_FILEID_PREFIX ||
    "cloud1-9gaf7sks5b9ec073.636c-cloud1-9gaf7sks5b9ec073-1368367431";
  return `cloud://${prefix}/${normalizedPath}`;
}

async function readCsvRows({ filePath, csvText, limit }) {
  const maxRows = Number(limit);
  const hasLimit = Number.isFinite(maxRows) && maxRows > 0;

  let headers = null;
  const rows = [];

  function handleLine(rawLine) {
    const line = typeof rawLine === "string" ? rawLine.trimEnd() : "";
    if (!line.trim()) {
      return;
    }
    if (!headers) {
      const headerLine = line.replace(/^\uFEFF/, "");
      headers = parseCsvLine(headerLine).map((h) => String(h || "").trim());
      return;
    }

    if (hasLimit && rows.length >= maxRows) {
      return;
    }

    const fields = parseCsvLine(line);
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i] || `col_${i}`;
      obj[key] = fields[i] === undefined ? "" : String(fields[i]);
    }
    rows.push(obj);
  }

  if (typeof csvText === "string" && csvText.trim()) {
    const lines = csvText.split(/\r?\n/);
    for (const line of lines) {
      handleLine(line);
    }
    return { headers: headers || [], rows };
  }

  const effectivePath =
    typeof filePath === "string" && filePath.trim()
      ? filePath.trim()
      : "/Users/chenshuang/pp/allmax-backend/sheet.csv";

  const stream = fs.createReadStream(effectivePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    handleLine(line);
    if (hasLimit && rows.length >= maxRows) {
      rl.close();
      break;
    }
  }

  return { headers: headers || [], rows };
}

async function importSkuCsv({ sequelize, filePath, csvText, limit, dryRun }) {
  const { rows } = await readCsvRows({ filePath, csvText, limit });
  const nowMs = Date.now();
  let attrValueUpserted = 0;

  const csvToAttrName = new Map([
    ["规格型号", "规格型号"],
    ["口味", "口味"],
  ]);

  const spuById = new Map();
  const skuDraftByCargoId = new Map();
  const cateById = new Map();
  const spuCatePairKeys = new Set();
  const cateNameCountsBySpuId = new Map();
  const attrDisplayNameSet = new Set();
  const attrValueStaging = [];
  const imagesBySpuId = new Map();

  for (const row of rows) {
    const cargoId = row["货品ID"] != null ? String(row["货品ID"]).trim() : "";
    if (!cargoId) {
      continue;
    }

    const spuName = row["SPU"] != null ? String(row["SPU"]).trim() : "";
    const recordSpuName =
      row["备案货品名称"] != null ? String(row["备案货品名称"]).trim() : "";
    const brand = row["品牌"] != null ? String(row["品牌"]).trim() : "";
    const spuKey = spuName || recordSpuName || brand || cargoId;
    const spuId = md5Hex(`${spuKey}|${brand}`);

    const statusRaw =
      row["备案状态"] != null ? String(row["备案状态"]).trim() : "";

    const detailParts = [];
    const produceCountry =
      row["原产国/地区"] != null ? String(row["原产国/地区"]).trim() : "";
    const tradeCountry =
      row["贸易国/地区"] != null ? String(row["贸易国/地区"]).trim() : "";
    const producer =
      row["境外生产企业名称"] != null
        ? String(row["境外生产企业名称"]).trim()
        : "";
    const producerReg =
      row["境外生产企业在华注册号"] != null
        ? String(row["境外生产企业在华注册号"]).trim()
        : "";
    const ingredients =
      row["主要成分"] != null ? String(row["主要成分"]).trim() : "";
    const mainUse =
      row["主要用途"] != null ? String(row["主要用途"]).trim() : "";
    const otherUse =
      row["其他用途"] != null ? String(row["其他用途"]).trim() : "";
    const remarks = row["备注"] != null ? String(row["备注"]).trim() : "";

    if (brand) detailParts.push(`品牌: ${brand}`);
    if (produceCountry) detailParts.push(`原产国/地区: ${produceCountry}`);
    if (tradeCountry) detailParts.push(`贸易国/地区: ${tradeCountry}`);
    if (producer) detailParts.push(`境外生产企业名称: ${producer}`);
    if (producerReg) detailParts.push(`境外生产企业在华注册号: ${producerReg}`);
    if (mainUse) detailParts.push(`主要用途: ${mainUse}`);
    if (otherUse) detailParts.push(`其他用途: ${otherUse}`);
    if (ingredients) detailParts.push(`主要成分: ${ingredients}`);
    if (remarks) detailParts.push(`备注: ${remarks}`);

    if (!spuById.has(spuId)) {
      spuById.set(spuId, {
        id: spuId,
        name: spuName || recordSpuName || brand || cargoId,
        detail: detailParts.join("\n"),
        status: "ENABLED",
      });
    }

    const spec = row["规格型号"] != null ? String(row["规格型号"]).trim() : "";
    const flavor = row["口味"] != null ? String(row["口味"]).trim() : "";
    const unit = row["销售单位"] != null ? String(row["销售单位"]).trim() : "";
    const skuDescParts = [];
    if (spuName) skuDescParts.push(spuName);
    if (!spuName && recordSpuName) skuDescParts.push(recordSpuName);
    if (spec) skuDescParts.push(spec);
    if (flavor) skuDescParts.push(flavor);
    if (unit) skuDescParts.push(unit);
    if (brand) skuDescParts.push(brand);
    if (produceCountry) skuDescParts.push(produceCountry);

    const price = 2;
    const wholesalePrice = 0.1;

    const skuImage = toCloudFileId(`spu_pic/sku-temp-images/${cargoId}.webp`);
    skuDraftByCargoId.set(cargoId, {
      cargoId,
      spu: spuId,
      price,
      wholesalePrice,
      description: skuDescParts.join(" | "),
      image: skuImage,
    });

    const images = imagesBySpuId.get(spuId) || new Set();
    images.add(skuImage);
    imagesBySpuId.set(spuId, images);

    const cateName =
      row["商品类目"] != null ? String(row["商品类目"]).trim() : "";
    if (cateName) {
      const byName = cateNameCountsBySpuId.get(spuId) || new Map();
      byName.set(cateName, (byName.get(cateName) || 0) + 1);
      cateNameCountsBySpuId.set(spuId, byName);
    }

    for (const [csvKey, attrDisplayName] of csvToAttrName.entries()) {
      if (!attrDisplayName) continue;
      let value = row[csvKey] != null ? String(row[csvKey]).trim() : "";
      if (!value) continue;
      if (csvKey === "条形码") {
        value = safeParseBarcodes(value);
        if (!value) continue;
      }

      attrDisplayNameSet.add(attrDisplayName);
      attrValueStaging.push({
        cargoId,
        attrDisplayName,
        value,
      });
    }
  }

  for (const spuId of spuById.keys()) {
    const byName = cateNameCountsBySpuId.get(spuId) || null;
    let chosenCateName = "未分类";
    if (byName && byName.size) {
      let maxCount = -1;
      for (const [name, count] of byName.entries()) {
        if (count > maxCount) {
          maxCount = count;
          chosenCateName = name;
        }
      }
    }
    const cateId = md5Hex(`cate:${chosenCateName}`);
    cateById.set(cateId, { id: cateId, name: chosenCateName });
    spuCatePairKeys.add(`${spuId}|${cateId}`);
  }

  const spus = Array.from(spuById.values()).map((spu) => {
    const images = imagesBySpuId.get(spu.id);
    const imageList = images ? Array.from(images) : [];
    return {
      ...spu,
      coverImage: imageList.length ? imageList[0] : null,
      swiperImages: imageList.length ? JSON.stringify(imageList) : null,
    };
  });
  const skuDrafts = Array.from(skuDraftByCargoId.values());
  const cates = Array.from(cateById.values());
  const spuCatePairs = Array.from(spuCatePairKeys).map((key) => {
    const [spuId, cateId] = String(key).split("|");
    return { spuId, cateId };
  });

  if (dryRun) {
    return {
      dryRun: true,
      parsedRows: rows.length,
      spuCount: spuById.size,
      skuCount: skuDraftByCargoId.size,
      cateCount: cateById.size,
      spuCateLinkCount: spuCatePairs.length,
      attrNameCount: attrDisplayNameSet.size,
      attrValueCount: attrValueStaging.length,
      sample: {
        spus: spus.slice(0, 3),
        skus: skuDrafts.slice(0, 3),
        spuCateLinks: spuCatePairs.slice(0, 5),
        attrValues: attrValueStaging.slice(0, 5),
      },
    };
  }

  await sequelize.transaction(async (transaction) => {
    const attrNameIdByName = new Map();
    const attrNames = [];
    const attrDisplayNames = Array.from(attrDisplayNameSet);
    for (const chunk of splitIntoChunks(attrDisplayNames, 400)) {
      if (!chunk.length) continue;
      const existingRows = await sequelize.query(
        "SELECT `_id`, `name` FROM `shop_attr_name` WHERE `name` IN (:names)",
        {
          replacements: { names: chunk },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      for (const row of existingRows) {
        const name = row?.name != null ? String(row.name) : "";
        const id = row?._id != null ? String(row._id) : "";
        if (name && id) {
          attrNameIdByName.set(name, id);
        }
      }
    }

    const namesToInsert = attrDisplayNames.filter(
      (name) => !attrNameIdByName.has(name)
    );
    for (const chunk of splitIntoChunks(namesToInsert, 200)) {
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(", ");
      const replacements = [];
      for (const name of chunk) {
        const id = md5Hex(`attr:${name}`);
        replacements.push(id, name, nowMs, nowMs);
      }
      await sequelize.query(
        `INSERT INTO \`shop_attr_name\` (\`_id\`, \`name\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE \`updatedAt\` = VALUES(\`updatedAt\`)`,
        { replacements, transaction }
      );
    }

    if (attrDisplayNames.length) {
      attrNameIdByName.clear();
      for (const chunk of splitIntoChunks(attrDisplayNames, 400)) {
        if (!chunk.length) continue;
        const rows = await sequelize.query(
          "SELECT `_id`, `name` FROM `shop_attr_name` WHERE `name` IN (:names)",
          {
            replacements: { names: chunk },
            type: QueryTypes.SELECT,
            transaction,
          }
        );
        for (const row of rows) {
          const name = row?.name != null ? String(row.name) : "";
          const id = row?._id != null ? String(row._id) : "";
          if (name && id) {
            attrNameIdByName.set(name, id);
          }
        }
      }
    }

    for (const [name, id] of attrNameIdByName.entries()) {
      attrNames.push({ id, name });
    }

    const desiredSkuIdByCargoId = new Map();
    const cargoIds = skuDrafts.map((s) => s.cargoId).filter(Boolean);
    for (const chunk of splitIntoChunks(cargoIds, 400)) {
      if (!chunk.length) continue;
      const existingRows = await sequelize.query(
        "SELECT `_id`, `cargo_id` AS `cargoId` FROM `shop_sku` WHERE `cargo_id` IN (:cargoIds)",
        {
          replacements: { cargoIds: chunk },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      for (const row of existingRows) {
        const cargoId = row?.cargoId != null ? String(row.cargoId) : "";
        const id = row?._id != null ? String(row._id) : "";
        if (cargoId && id) {
          desiredSkuIdByCargoId.set(cargoId, id);
        }
      }
    }

    const skus = skuDrafts.map((draft) => {
      const cargoId = draft.cargoId;
      const desiredId = desiredSkuIdByCargoId.get(cargoId) || md5Hex(`sku:${cargoId}`);
      return {
        id: desiredId,
        spu: draft.spu,
        cargoId: draft.cargoId,
        price: draft.price,
        wholesalePrice: draft.wholesalePrice,
        description: draft.description,
        image: draft.image,
      };
    });

    for (const chunk of splitIntoChunks(attrNames, 200)) {
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(", ");
      const replacements = [];
      for (const item of chunk) {
        replacements.push(item.id, item.name, nowMs, nowMs);
      }
      await sequelize.query(
        `INSERT INTO \`shop_attr_name\` (\`_id\`, \`name\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        { replacements, transaction }
      );
    }

    for (const chunk of splitIntoChunks(cates, 200)) {
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(", ");
      const replacements = [];
      for (const item of chunk) {
        replacements.push(item.id, item.name, nowMs, nowMs);
      }
      await sequelize.query(
        `INSERT INTO \`shop_spu_cate\` (\`_id\`, \`name\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        { replacements, transaction }
      );
    }

    for (const chunk of splitIntoChunks(spus, 200)) {
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const replacements = [];
      for (const item of chunk) {
        replacements.push(
          item.id,
          item.name,
          item.detail,
          item.coverImage,
          item.swiperImages,
          item.status,
          nowMs,
          nowMs
        );
      }
      await sequelize.query(
        `INSERT INTO \`shop_spu\` (\`_id\`, \`name\`, \`detail\`, \`cover_image\`, \`swiper_images\`, \`status\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`detail\` = VALUES(\`detail\`), \`cover_image\` = VALUES(\`cover_image\`), \`swiper_images\` = VALUES(\`swiper_images\`), \`status\` = VALUES(\`status\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        { replacements, transaction }
      );
    }

    for (const chunk of splitIntoChunks(skus, 200)) {
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const replacements = [];
      for (const item of chunk) {
        replacements.push(
          item.id,
          item.spu,
          item.cargoId,
          item.price,
          item.wholesalePrice,
          item.description,
          item.image,
          0,
          nowMs,
          nowMs
        );
      }
      await sequelize.query(
        `INSERT INTO \`shop_sku\` (\`_id\`, \`spu\`, \`cargo_id\`, \`price\`, \`wholesale_price\`, \`description\`, \`image\`, \`stock\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE \`spu\` = VALUES(\`spu\`), \`cargo_id\` = VALUES(\`cargo_id\`), \`price\` = VALUES(\`price\`), \`wholesale_price\` = VALUES(\`wholesale_price\`), \`description\` = VALUES(\`description\`), \`image\` = VALUES(\`image\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        { replacements, transaction }
      );
    }

    await sequelize.query(
      "UPDATE `shop_sku` SET `price` = 2, `wholesale_price` = 0.1, `updatedAt` = :nowMs",
      { replacements: { nowMs }, transaction }
    );

    await upsertSpuCateLinks({
      sequelize,
      transaction,
      pairs: spuCatePairs,
      nowMs,
    });

    const skuIdByCargoId = new Map();
    for (const chunk of splitIntoChunks(cargoIds, 400)) {
      if (!chunk.length) continue;
      const skuRows = await sequelize.query(
        "SELECT `_id`, `cargo_id` AS `cargoId` FROM `shop_sku` WHERE `cargo_id` IN (:cargoIds)",
        {
          replacements: { cargoIds: chunk },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      for (const row of skuRows) {
        const cargoId = row?.cargoId != null ? String(row.cargoId) : "";
        const id = row?._id != null ? String(row._id) : "";
        if (cargoId && id) {
          skuIdByCargoId.set(cargoId, id);
        }
      }
    }

    const attrValues = [];
    for (const staged of attrValueStaging) {
      const skuId = skuIdByCargoId.get(staged.cargoId);
      if (!skuId) continue;
      const attrNameId = attrNameIdByName.get(staged.attrDisplayName);
      if (!attrNameId) continue;
      const id = md5Hex(`attrv:${skuId}|${attrNameId}`);
      attrValues.push({
        id,
        attrNameId,
        skuId,
        value: staged.value,
      });
    }
    attrValueUpserted = attrValues.length;

    for (const chunk of splitIntoChunks(attrValues, 400)) {
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const replacements = [];
      for (const item of chunk) {
        replacements.push(
          item.id,
          item.attrNameId,
          item.skuId,
          item.value,
          nowMs,
          nowMs
        );
      }
      await sequelize.query(
        `INSERT INTO \`shop_attr_value\` (\`_id\`, \`attr_name\`, \`shop_sku\`, \`value\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        { replacements, transaction }
      );
    }

    await upsertSkuAttrValueLinks({
      sequelize,
      transaction,
      pairs: attrValues.map((v) => ({
        skuId: v.skuId,
        attrValueId: v.id,
      })),
      nowMs,
    });
  });

  return {
    dryRun: false,
    parsedRows: rows.length,
    spuUpserted: spus.length,
    skuUpserted: skuDrafts.length,
    cateUpserted: cates.length,
    spuCateLinkUpserted: spuCatePairs.length,
    attrNameUpserted: attrDisplayNameSet.size,
    attrValueUpserted,
  };
}

module.exports = {
  importSkuCsv,
};
