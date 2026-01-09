const crypto = require("crypto");
const { QueryTypes } = require("sequelize");

function md5Hex(input) {
  return crypto.createHash("md5").update(String(input)).digest("hex");
}

function splitIntoChunks(items, chunkSize) {
  const size = Number(chunkSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("chunkSize 无效");
  }
  const list = Array.isArray(items) ? items : [];
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

async function upsertMidLinks({
  sequelize,
  transaction,
  tableName,
  links,
  nowMs,
}) {
  if (!links.length) {
    return 0;
  }

  let affected = 0;
  for (const chunk of splitIntoChunks(links, 400)) {
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const replacements = [];
    for (const link of chunk) {
      replacements.push(link.id, link.leftId, link.rightId, nowMs, nowMs);
    }
    const [_, metadata] = await sequelize.query(
      `INSERT INTO \`${tableName}\` (\`_id\`, \`leftRecordId\`, \`rightRecordId\`, \`createdAt\`, \`updatedAt\`) VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE \`updatedAt\` = VALUES(\`updatedAt\`)`,
      { replacements, transaction }
    );
    if (metadata && typeof metadata.affectedRows === "number") {
      affected += metadata.affectedRows;
    }
  }

  return affected;
}

async function deleteMidOrphans({
  sequelize,
  transaction,
  tableName,
  leftTableName,
  rightTableName,
}) {
  const [_, metadata] = await sequelize.query(
    `DELETE m FROM \`${tableName}\` m
      LEFT JOIN \`${leftTableName}\` l ON l.\`_id\` = m.\`leftRecordId\`
      LEFT JOIN \`${rightTableName}\` r ON r.\`_id\` = m.\`rightRecordId\`
      WHERE l.\`_id\` IS NULL OR r.\`_id\` IS NULL`,
    { transaction }
  );
  return metadata && typeof metadata.affectedRows === "number"
    ? metadata.affectedRows
    : 0;
}

async function repairSwappedMidLinks({
  sequelize,
  transaction,
  tableName,
  leftTableName,
  rightTableName,
  buildCanonicalId,
  nowMs,
}) {
  const swappedRows = await sequelize.query(
    `SELECT m.\`_id\` AS \`id\`, m.\`leftRecordId\` AS \`leftId\`, m.\`rightRecordId\` AS \`rightId\`
      FROM \`${tableName}\` m
      INNER JOIN \`${rightTableName}\` r ON r.\`_id\` = m.\`leftRecordId\`
      INNER JOIN \`${leftTableName}\` l ON l.\`_id\` = m.\`rightRecordId\``,
    { type: QueryTypes.SELECT, transaction }
  );

  const linksToUpsert = [];
  const swappedIdsToDelete = [];
  for (const row of swappedRows) {
    const id = row?.id != null ? String(row.id) : "";
    const leftId = row?.leftId != null ? String(row.leftId) : "";
    const rightId = row?.rightId != null ? String(row.rightId) : "";
    if (!id || !leftId || !rightId) continue;
    linksToUpsert.push({
      id: buildCanonicalId({ leftId: rightId, rightId: leftId }),
      leftId: rightId,
      rightId: leftId,
    });
    swappedIdsToDelete.push(id);
  }

  const upserted = await upsertMidLinks({
    sequelize,
    transaction,
    tableName,
    links: linksToUpsert,
    nowMs,
  });

  let deleted = 0;
  for (const chunk of splitIntoChunks(swappedIdsToDelete, 400)) {
    const [_, metadata] = await sequelize.query(
      `DELETE FROM \`${tableName}\` WHERE \`_id\` IN (:ids)`,
      { replacements: { ids: chunk }, transaction }
    );
    if (metadata && typeof metadata.affectedRows === "number") {
      deleted += metadata.affectedRows;
    }
  }

  return {
    swappedFound: swappedIdsToDelete.length,
    swappedDeleted: deleted,
    canonicalUpserted: upserted,
  };
}

async function upsertSpuCateLinks({
  sequelize,
  transaction,
  pairs,
  nowMs,
}) {
  const links = [];
  for (const pair of pairs) {
    const spuId = pair?.spuId != null ? String(pair.spuId) : "";
    const cateId = pair?.cateId != null ? String(pair.cateId) : "";
    if (!spuId || !cateId) continue;
    links.push({
      id: md5Hex(`spuCate:${spuId}|${cateId}`),
      leftId: cateId,
      rightId: spuId,
    });
  }

  await deleteMidOrphans({
    sequelize,
    transaction,
    tableName: "mid_4RKifhrar",
    leftTableName: "shop_spu_cate",
    rightTableName: "shop_spu",
  });

  return upsertMidLinks({
    sequelize,
    transaction,
    tableName: "mid_4RKifhrar",
    links,
    nowMs,
  });
}

async function upsertSkuAttrValueLinks({
  sequelize,
  transaction,
  pairs,
  nowMs,
}) {
  const links = [];
  for (const pair of pairs) {
    const skuId = pair?.skuId != null ? String(pair.skuId) : "";
    const attrValueId = pair?.attrValueId != null ? String(pair.attrValueId) : "";
    if (!skuId || !attrValueId) continue;
    links.push({
      id: md5Hex(`skuAttr:${skuId}|${attrValueId}`),
      leftId: skuId,
      rightId: attrValueId,
    });
  }

  await deleteMidOrphans({
    sequelize,
    transaction,
    tableName: "mid_4RKieAhGh",
    leftTableName: "shop_sku",
    rightTableName: "shop_attr_value",
  });

  return upsertMidLinks({
    sequelize,
    transaction,
    tableName: "mid_4RKieAhGh",
    links,
    nowMs,
  });
}

async function repairShopRelations({ sequelize, dryRun }) {
  const nowMs = Date.now();

  return sequelize.transaction(async (transaction) => {
    const spuCateBefore = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM `mid_4RKifhrar`",
      { type: QueryTypes.SELECT, transaction }
    );
    const skuAttrBefore = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM `mid_4RKieAhGh`",
      { type: QueryTypes.SELECT, transaction }
    );

    const attrValueBackfillRows = await sequelize.query(
      `SELECT av.\`_id\` AS \`attrValueId\`, av.\`shop_sku\` AS \`skuId\`
        FROM \`shop_attr_value\` av
        INNER JOIN \`shop_sku\` s ON s.\`_id\` = av.\`shop_sku\`
        WHERE av.\`shop_sku\` IS NOT NULL AND av.\`shop_sku\` != ''`,
      { type: QueryTypes.SELECT, transaction }
    );

    const backfillPairs = attrValueBackfillRows.map((r) => ({
      skuId: r?.skuId != null ? String(r.skuId) : "",
      attrValueId: r?.attrValueId != null ? String(r.attrValueId) : "",
    }));

    const dryRunData = {
      dryRun: true,
      nowMs,
      before: {
        mid_4RKifhrar: Number(spuCateBefore?.[0]?.cnt || 0),
        mid_4RKieAhGh: Number(skuAttrBefore?.[0]?.cnt || 0),
      },
      attrValueBackfillPairs: backfillPairs.length,
    };

    if (dryRun) {
      return dryRunData;
    }

    const spuCateRepair = await repairSwappedMidLinks({
      sequelize,
      transaction,
      tableName: "mid_4RKifhrar",
      leftTableName: "shop_spu_cate",
      rightTableName: "shop_spu",
      nowMs,
      buildCanonicalId: ({ leftId, rightId }) => {
        const cateId = String(leftId);
        const spuId = String(rightId);
        return md5Hex(`spuCate:${spuId}|${cateId}`);
      },
    });

    const skuAttrRepair = await repairSwappedMidLinks({
      sequelize,
      transaction,
      tableName: "mid_4RKieAhGh",
      leftTableName: "shop_sku",
      rightTableName: "shop_attr_value",
      nowMs,
      buildCanonicalId: ({ leftId, rightId }) => {
        const skuId = String(leftId);
        const attrValueId = String(rightId);
        return md5Hex(`skuAttr:${skuId}|${attrValueId}`);
      },
    });

    const backfilled = await upsertSkuAttrValueLinks({
      sequelize,
      transaction,
      pairs: backfillPairs,
      nowMs,
    });

    const spuCateOrphansDeleted = await deleteMidOrphans({
      sequelize,
      transaction,
      tableName: "mid_4RKifhrar",
      leftTableName: "shop_spu_cate",
      rightTableName: "shop_spu",
    });
    const skuAttrOrphansDeleted = await deleteMidOrphans({
      sequelize,
      transaction,
      tableName: "mid_4RKieAhGh",
      leftTableName: "shop_sku",
      rightTableName: "shop_attr_value",
    });

    const spuCateAfter = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM `mid_4RKifhrar`",
      { type: QueryTypes.SELECT, transaction }
    );
    const skuAttrAfter = await sequelize.query(
      "SELECT COUNT(*) AS cnt FROM `mid_4RKieAhGh`",
      { type: QueryTypes.SELECT, transaction }
    );

    return {
      dryRun: false,
      nowMs,
      before: {
        mid_4RKifhrar: Number(spuCateBefore?.[0]?.cnt || 0),
        mid_4RKieAhGh: Number(skuAttrBefore?.[0]?.cnt || 0),
      },
      after: {
        mid_4RKifhrar: Number(spuCateAfter?.[0]?.cnt || 0),
        mid_4RKieAhGh: Number(skuAttrAfter?.[0]?.cnt || 0),
      },
      spuCateRepair,
      skuAttrRepair,
      skuAttrBackfillUpserted: backfilled,
      orphansDeleted: {
        mid_4RKifhrar: spuCateOrphansDeleted,
        mid_4RKieAhGh: skuAttrOrphansDeleted,
      },
    };
  });
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

async function readCsvRows({ filePath, csvText, limit }) {
  const fs = require("fs");
  const readline = require("readline");

  const out = [];
  const maxRows =
    limit == null
      ? Infinity
      : Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Math.floor(Number(limit))
        : Infinity;

  const stream =
    typeof csvText === "string" && csvText.trim()
      ? null
      : typeof filePath === "string" && filePath
        ? fs.createReadStream(filePath)
        : null;

  const input =
    typeof csvText === "string" && csvText.trim()
      ? csvText
      : stream;

  if (!input) {
    throw new Error("filePath 或 csvText 必须提供其一");
  }

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  let headers = null;
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line).map((h) => String(h || "").trim());
      continue;
    }
    if (!line) continue;
    const cols = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i];
      row[key] = cols[i] != null ? String(cols[i]) : "";
    }
    out.push(row);
    if (out.length >= maxRows) break;
  }

  return { rows: out };
}

function normalizeText(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/，/g, ",");
}

function normalizeFlavor(raw) {
  const base = normalizeText(raw);
  if (!base) return "";
  return base.endsWith("味") ? base.slice(0, -1) : base;
}

function normalizeSpec(raw) {
  let base = normalizeText(raw);
  if (!base) return "";
  base = base
    .replace(/公斤/g, "kg")
    .replace(/千克/g, "kg")
    .replace(/克/g, "g")
    .replace(/磅/g, "lb")
    .replace(/盎司/g, "oz");
  return base;
}

function normalizeSpecLoose(raw) {
  const full = normalizeSpec(raw);
  if (!full) return "";
  const idx = full.indexOf("/");
  return idx >= 0 ? full.slice(0, idx) : full;
}

function specCandidates(raw) {
  const normalized = normalizeSpec(raw);
  if (!normalized) return [];
  const set = new Set([normalized]);

  const kgMatch = normalized.match(/^(\d+(?:\.\d+)?)kg(.*)$/);
  if (kgMatch) {
    const num = Number(kgMatch[1]);
    if (Number.isFinite(num)) {
      const grams = Math.round(num * 1000);
      set.add(`${grams}g${kgMatch[2]}`);
    }
  }

  if (normalized.includes("g")) {
    set.add(normalized.replace(/g/g, "克"));
  }
  if (normalized.includes("克")) {
    set.add(normalized.replace(/克/g, "g"));
  }
  if (normalized.includes("lb")) {
    set.add(normalized.replace(/lb/g, "磅"));
  }
  if (normalized.includes("磅")) {
    set.add(normalized.replace(/磅/g, "lb"));
  }

  const idx = normalized.indexOf("/");
  if (idx >= 0) {
    set.add(normalized.slice(0, idx));
  }

  return Array.from(set);
}

function flavorCandidates(raw) {
  const normalized = normalizeFlavor(raw);
  if (!normalized) return [];
  const set = new Set([normalized]);
  set.add(`${normalized}味`);
  return Array.from(set);
}

async function linkSkuAttrValuesFromCsv({
  sequelize,
  filePath,
  csvText,
  limit,
  dryRun,
}) {
  const { rows } = await readCsvRows({ filePath, csvText, limit });

  const cargoToSpec = new Map();
  const cargoToFlavor = new Map();
  for (const row of rows) {
    const cargoId = row["货品ID"] != null ? String(row["货品ID"]).trim() : "";
    if (!cargoId) continue;
    const spec = row["规格型号"] != null ? String(row["规格型号"]).trim() : "";
    const flavor = row["口味"] != null ? String(row["口味"]).trim() : "";
    if (spec) {
      const prev = cargoToSpec.get(cargoId);
      if (!prev) cargoToSpec.set(cargoId, new Set());
      cargoToSpec.get(cargoId).add(spec);
    }
    if (flavor) {
      const prev = cargoToFlavor.get(cargoId);
      if (!prev) cargoToFlavor.set(cargoId, new Set());
      cargoToFlavor.get(cargoId).add(flavor);
    }
  }

  const cargoIds = Array.from(
    new Set([...cargoToSpec.keys(), ...cargoToFlavor.keys()])
  );
  if (!cargoIds.length) {
    return {
      dryRun: true,
      parsedRows: rows.length,
      cargoIdCount: 0,
      skuMatched: 0,
      linkPairs: 0,
      missing: [],
    };
  }

  const nowMs = Date.now();

  return sequelize.transaction(async (transaction) => {
    const skuRows = [];
    for (const chunk of splitIntoChunks(cargoIds, 400)) {
      const found = await sequelize.query(
        "SELECT `_id` AS `skuId`, `cargo_id` AS `cargoId` FROM `shop_sku` WHERE `cargo_id` IN (:cargoIds)",
        {
          replacements: { cargoIds: chunk },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      skuRows.push(...found);
    }

    const skuIdByCargoId = new Map();
    for (const r of skuRows) {
      const cargoId = r?.cargoId != null ? String(r.cargoId) : "";
      const skuId = r?.skuId != null ? String(r.skuId) : "";
      if (cargoId && skuId) skuIdByCargoId.set(cargoId, skuId);
    }

    const attrNameRows = await sequelize.query(
      "SELECT `_id` AS `id`, `name` FROM `shop_attr_name` WHERE `name` IN (:names)",
      {
        replacements: { names: ["规格型号", "口味"] },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    const attrNameIdByName = new Map();
    for (const r of attrNameRows) {
      const name = r?.name != null ? String(r.name) : "";
      const id = r?.id != null ? String(r.id) : "";
      if (name && id) attrNameIdByName.set(name, id);
    }

    const specAttrNameId = attrNameIdByName.get("规格型号") || "";
    const flavorAttrNameId = attrNameIdByName.get("口味") || "";
    if (!specAttrNameId || !flavorAttrNameId) {
      throw new Error("shop_attr_name 缺少 规格型号/口味");
    }

    const attrValueRows = await sequelize.query(
      "SELECT `_id` AS `id`, `attr_name` AS `attrNameId`, `value` FROM `shop_attr_value` WHERE `attr_name` IN (:ids)",
      {
        replacements: { ids: [specAttrNameId, flavorAttrNameId] },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    const attrValueIdsByAttrNameIdAndNormalizedValue = new Map();
    function putAttrValue(attrNameId, normalizedValue, attrValueId) {
      const key = `${attrNameId}|${normalizedValue}`;
      const prev = attrValueIdsByAttrNameIdAndNormalizedValue.get(key);
      if (!prev) attrValueIdsByAttrNameIdAndNormalizedValue.set(key, [attrValueId]);
      else prev.push(attrValueId);
    }

    for (const r of attrValueRows) {
      const id = r?.id != null ? String(r.id) : "";
      const attrNameId = r?.attrNameId != null ? String(r.attrNameId) : "";
      const value = r?.value != null ? String(r.value) : "";
      if (!id || !attrNameId) continue;
      if (attrNameId === specAttrNameId) {
        putAttrValue(attrNameId, normalizeSpec(value), id);
        const loose = normalizeSpecLoose(value);
        if (loose) {
          putAttrValue(attrNameId, loose, id);
        }
      } else if (attrNameId === flavorAttrNameId) {
        putAttrValue(attrNameId, normalizeFlavor(value), id);
      }
    }

    const pairs = [];
    const missing = [];

    for (const cargoId of cargoIds) {
      const skuId = skuIdByCargoId.get(cargoId) || "";
      if (!skuId) {
        missing.push({ cargoId, reason: "SKU_NOT_FOUND" });
        continue;
      }

      const usedAttrValueIds = new Set();

      const specs = cargoToSpec.get(cargoId) ? Array.from(cargoToSpec.get(cargoId)) : [];
      for (const specRaw of specs) {
        const candidates = specCandidates(specRaw);
        let matched = false;
        for (const c of candidates) {
          const key = `${specAttrNameId}|${c}`;
          const found = attrValueIdsByAttrNameIdAndNormalizedValue.get(key);
          if (found && found.length) {
            usedAttrValueIds.add(found[0]);
            matched = true;
            break;
          }
        }
        if (!matched && specRaw) {
          missing.push({ cargoId, reason: "SPEC_NOT_FOUND", value: specRaw });
        }
      }

      const flavors = cargoToFlavor.get(cargoId)
        ? Array.from(cargoToFlavor.get(cargoId))
        : [];
      for (const flavorRaw of flavors) {
        const candidates = flavorCandidates(flavorRaw);
        let matched = false;
        for (const c of candidates) {
          const key = `${flavorAttrNameId}|${c}`;
          const found = attrValueIdsByAttrNameIdAndNormalizedValue.get(key);
          if (found && found.length) {
            usedAttrValueIds.add(found[0]);
            matched = true;
            break;
          }
        }
        if (!matched && flavorRaw) {
          missing.push({ cargoId, reason: "FLAVOR_NOT_FOUND", value: flavorRaw });
        }
      }

      for (const attrValueId of usedAttrValueIds) {
        pairs.push({ skuId, attrValueId });
      }
    }

    const dryRunData = {
      dryRun: true,
      parsedRows: rows.length,
      cargoIdCount: cargoIds.length,
      skuMatched: skuIdByCargoId.size,
      linkPairs: pairs.length,
      missing: missing.slice(0, 50),
    };

    if (dryRun) {
      return dryRunData;
    }

    const swapped = await repairSwappedMidLinks({
      sequelize,
      transaction,
      tableName: "mid_4RKieAhGh",
      leftTableName: "shop_sku",
      rightTableName: "shop_attr_value",
      nowMs,
      buildCanonicalId: ({ leftId, rightId }) => {
        const skuId = String(leftId);
        const attrValueId = String(rightId);
        return md5Hex(`skuAttr:${skuId}|${attrValueId}`);
      },
    });

    const upserted = await upsertSkuAttrValueLinks({
      sequelize,
      transaction,
      pairs,
      nowMs,
    });

    return {
      dryRun: false,
      parsedRows: rows.length,
      cargoIdCount: cargoIds.length,
      skuMatched: skuIdByCargoId.size,
      linkPairs: pairs.length,
      swapped,
      upserted,
      missing: missing.slice(0, 50),
    };
  });
}

module.exports = {
  upsertSpuCateLinks,
  upsertSkuAttrValueLinks,
  repairShopRelations,
  linkSkuAttrValuesFromCsv,
};
