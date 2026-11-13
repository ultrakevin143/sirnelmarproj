const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  parseCsv,
  canonicalFoodName,
  atwaterCheck,
} = require("./nutrition-quality");
const numeric = (value) =>
  value === "" || value == null ? null : Number(value);
const legacy = {
  "mcdo:burger mcdo": "mcdo-burger-mcdo-v1",
  "mcdo:1 pc chicken mcdo with rice": "mcdo-chicken-mcdo-rice-v1",
  "mcdo:fries": "mcdo-medium-fries-v1",
  "jollibee:yumburger": "jollibee-yumburger-v1",
  "jollibee:jolly spaghetti": "jollibee-jolly-spaghetti-v1",
};

function readSeed(filename = path.join(__dirname, "data/ph_foods_seed.csv")) {
  const rows = parseCsv(fs.readFileSync(filename, "utf8"));
  const seen = new Set();
  return rows.map((row) => {
    const brand =
      row.source === "mcdo_ph_site"
        ? "mcdo"
        : row.category === "Jollibee"
          ? "jollibee"
          : "philfct";
    const key = brand + ":" + canonicalFoodName(row.name);
    if (seen.has(key)) throw new Error(`Duplicate food in seed: ${row.name}`);
    seen.add(key);
    const nutrients = {
      caloriesKcal: numeric(row.kcal),
      proteinG: numeric(row.protein_g),
      carbohydrateG: numeric(row.carbs_g),
      fatG: numeric(row.fat_g),
      fiberG: numeric(row.fiber_g),
    };
    if (
      nutrients.caloriesKcal == null ||
      nutrients.caloriesKcal < 0 ||
      nutrients.caloriesKcal > 5000 ||
      Object.values(nutrients).some(
        (value) => value != null && (!Number.isFinite(value) || value < 0),
      )
    )
      throw new Error(`Invalid nutrition in seed: ${row.name}`);
    const quality = atwaterCheck(nutrients);
    const confidence =
      row.confidence === "official" &&
      row.verified_match === "true" &&
      !quality.needsReview
        ? "official"
        : "estimate";
    return {
      key,
      row,
      nutrients,
      metadata: {
        basis: row.basis,
        brand:
          brand === "mcdo"
            ? "McDonald's Philippines"
            : brand === "jollibee"
              ? "Jollibee Philippines"
              : null,
        servingSizeText:
          row.basis === "per_serving"
            ? "1 published serving"
            : "100 g edible portion",
        servingGrams: numeric(row.serving_g),
        sourceCode: row.source,
        confidence,
        sourceUrl: row.source_url,
        retrievedAt: row.retrieved_at,
        sugarG: numeric(row.sugar_g),
        sodiumMg: numeric(row.sodium_mg),
        needsReview: quality.needsReview || row.verified_match !== "true",
        reviewReason: quality.reason,
        notes: row.notes,
        canonicalKey: key,
      },
    };
  });
}

async function seedPhFoods(database, filename) {
  const records = readSeed(filename);
  const hash = createHash("sha256")
    .update(JSON.stringify({ version: 2, records }))
    .digest("hex");
  if (
    await database
      .prepare(
        "SELECT seed_hash FROM nutrition_seed_releases WHERE seed_hash = ?",
      )
      .get(hash)
  )
    return { imported: 0, uniqueItems: records.length, unchanged: true };
  await database.transaction(async () => {
    // Prefer the PH menu over equivalent older US catalogue entries, without deleting history.
    const localMcdoNames = new Set(
      records
        .filter((record) => record.key.startsWith("mcdo:"))
        .map((record) =>
          canonicalFoodName(record.row.name)
            .replace(/\bmcdo\b/g, "")
            .trim(),
        ),
    );
    const importedMcdo = await database
      .prepare(
        "SELECT id, name FROM nutrition_foods WHERE owner_user_id IS NULL AND source = 'USDA FoodData Central' AND archived_at IS NULL AND LOWER(name) LIKE '%mcdonald%'",
      )
      .all();
    for (const food of importedMcdo) {
      const itemName = canonicalFoodName(food.name)
        .replace(/\bmcdo\b/g, "")
        .trim();
      if (localMcdoNames.has(itemName))
        await database
          .prepare("UPDATE nutrition_foods SET archived_at = ? WHERE id = ?")
          .run(new Date().toISOString(), food.id);
    }
    for (const { key, row, nutrients: n, metadata } of records) {
      const alias = legacy[key];
      const existing = await database
        .prepare(
          `SELECT id FROM nutrition_foods WHERE owner_user_id IS NULL AND (canonical_key = ? OR (source = 'LiftUp PH Menu Estimates' AND source_id = ?)) ORDER BY id`,
        )
        .all(key, alias || "");
      const category = metadata.brand || "PhilFCT generic foods";
      const name = (metadata.brand ? metadata.brand + " · " : "") + row.name;
      const params = [
        row.source,
        key,
        "PH food seed · " + row.retrieved_at,
        name,
        category,
        n.caloriesKcal,
        n.proteinG,
        n.carbohydrateG,
        n.fatG,
        n.fiberG,
        "[]",
        JSON.stringify(metadata),
        key,
      ];
      if (existing.length) {
        // Preserve the original food id and all historical meal snapshots.
        for (const extra of existing.slice(1))
          await database
            .prepare(
              "UPDATE nutrition_foods SET archived_at = ?, canonical_key = NULL WHERE id = ?",
            )
            .run(new Date().toISOString(), extra.id);
        await database
          .prepare(
            `UPDATE nutrition_foods SET source = ?, source_id = ?, source_release = ?, name = ?, category = ?, calories_kcal = ?, protein_g = ?, carbohydrate_g = ?, fat_g = ?, fiber_g = ?, portions_json = ?, metadata_json = ?, canonical_key = ?, archived_at = NULL WHERE id = ?`,
          )
          .run(...params, existing[0].id);
      } else {
        await database
          .prepare(
            `INSERT INTO nutrition_foods (source, source_id, source_release, name, category, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, portions_json, metadata_json, canonical_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id`,
          )
          .run(...params, new Date().toISOString());
      }
    }
    await database
      .prepare(
        "INSERT INTO nutrition_seed_releases (seed_hash, applied_at) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING seed_hash",
      )
      .run(hash, new Date().toISOString());
  });
  return {
    imported: records.length,
    uniqueItems: new Set(records.map((record) => record.key)).size,
  };
}

module.exports = { readSeed, seedPhFoods };
