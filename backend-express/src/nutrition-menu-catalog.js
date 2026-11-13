const fs = require("node:fs");
const path = require("node:path");
const { atwaterCheck, canonicalFoodName } = require("./nutrition-quality");

// Explicit spelling aliases describe the same product, rather than merging similar meals.
const mcdoAliases = {
  mcchicken: "mcchicken sandwich",
  "medium fries": "fries",
  "fries medium": "fries",
  "fries regular": "regular fries",
  "fries large": "large fries",
  "fries bff": "bff fries",
  "mcflurry oreo": "mcflurry with oreo cookies",
  "sundae cone": "vanilla sundae cone",
  "spicy chicken mcdo with rice": "1 pc spicy chicken mcdo with rice",
};

function menuIdentity(brand, market, name) {
  const normalized = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\s*\(Serves\s+[\d -]+\)/gi, "")
    .replace(/\b(\d+)[ -]?(?:pcs?|pieces?)\b/gi, "$1 pc")
    .replace(/\bw\/\s*/gi, "with ")
    .replace(/&/g, "and");
  let item = canonicalFoodName(normalized)
    .replace(/^mcdo (?:philippines|ph) /, "")
    .replace(/^jollibee (?:philippines|ph|usa|us) /, "")
    .replace(/^mang inasal (?:philippines|ph) /, "");
  if (brand === "mcdo")
    item = (mcdoAliases[item] || item).replace(
      /\bchicken mcnuggets\b/g,
      "mcnuggets",
    );
  if (brand === "jollibee")
    item =
      {
        yum: "yumburger",
        "yum with cheese": "cheesy yumburger",
        "jollibee spaghetti": "jolly spaghetti",
      }[item] || item;
  return `${brand}:${market.toLowerCase()}:${item}`;
}

const nutrientKeys = [
  "caloriesKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
  "saturatedFatG",
  "transFatG",
  "cholesterolMg",
];

function validateManifest(manifest) {
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.sources) ||
    !Array.isArray(manifest.observations)
  )
    throw new Error("Unsupported restaurant menu manifest.");
  const sources = new Map(
    manifest.sources.map((source) => [source.id, source]),
  );
  if (sources.size !== manifest.sources.length)
    throw new Error("Duplicate menu source.");
  const seen = new Set();
  for (const record of manifest.observations) {
    if (
      !sources.has(record.sourceId) ||
      !["PH", "US"].includes(record.market) ||
      sources.get(record.sourceId)?.market !== record.market ||
      !record.name ||
      !record.category ||
      !record.brand ||
      !record.sourceItemKey ||
      !Number.isInteger(record.priority)
    )
      throw new Error("Invalid menu identity/source.");
    if (
      !record.serving ||
      !["per_serving", "per_100g"].includes(record.serving.basis) ||
      !record.serving.label ||
      [record.serving.grams, record.serving.ml].some(
        (value) => value != null && (!Number.isFinite(value) || value <= 0),
      ) ||
      (record.serving.grams != null && record.serving.ml != null)
    )
      throw new Error("Invalid menu serving: " + record.name);
    const observationKey = `${record.sourceId}|${record.sourceItemKey}`;
    if (seen.has(observationKey))
      throw new Error("Duplicate menu source observation: " + observationKey);
    seen.add(observationKey);
    if (
      record.nutrients?.caloriesKcal == null ||
      record.nutrients.caloriesKcal > 5000
    )
      throw new Error("Invalid menu calories: " + record.name);
    for (const key of nutrientKeys) {
      const value = record.nutrients[key];
      if (
        value != null &&
        (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      )
        throw new Error("Invalid menu nutrient: " + record.name + " / " + key);
    }
    if (
      !record.image?.url ||
      !/^(?:https:\/\/|\/images\/)/.test(record.image.url)
    )
      throw new Error("Missing or unsafe image reference: " + record.name);
    const crop = record.image.region;
    if (
      crop &&
      (![
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        record.image.sourceWidth,
        record.image.sourceHeight,
      ].every(Number.isFinite) ||
        crop.x < 0 ||
        crop.y < 0 ||
        crop.width <= 0 ||
        crop.height <= 0 ||
        crop.x + crop.width > record.image.sourceWidth ||
        crop.y + crop.height > record.image.sourceHeight)
    )
      throw new Error("Invalid source-image region: " + record.name);
  }
  return manifest;
}

function loadMenuManifest(
  filename = path.join(__dirname, "data/restaurant-menu-catalog.json"),
) {
  return validateManifest(JSON.parse(fs.readFileSync(filename, "utf8")));
}

function legacyObservation(food, manifest) {
  const details = JSON.parse(food.metadata_json || "{}");
  const brand = /mcdonald|mcdo/i.test(food.name)
    ? "mcdo"
    : /jollibee/i.test(food.name)
      ? "jollibee"
      : "mang-inasal";
  const name = food.name
    .replace(/^[^·]+·\s*/, "")
    .replace(/\s*\(estimate\)\s*$/i, "");
  const key = menuIdentity(brand, "PH", name);
  const linked = manifest.observations.find(
    (row) => menuIdentity(row.brand, row.market, row.name) === key,
  );
  const photo =
    manifest.existingImages?.[food.canonical_key || food.source_id] ||
    linked?.image;
  if (!photo)
    throw new Error("Missing image for existing restaurant record: " + name);
  const foodColumns = [
    "calories_kcal",
    "protein_g",
    "carbohydrate_g",
    "fat_g",
    "fiber_g",
  ];
  const nutrients = Object.fromEntries(
    nutrientKeys.map((key, i) => {
      const value =
        i < foodColumns.length ? food[foodColumns[i]] : details[key];
      return [key, value == null ? null : Number(value)];
    }),
  );
  return {
    brand,
    market: "PH",
    name,
    category:
      linked?.category ||
      manifest.categories?.[food.canonical_key || food.source_id] ||
      "Meals",
    sourceId: `existing:${food.source}`,
    sourceItemKey: food.source_id || String(food.id),
    sourcePage: null,
    nutrients,
    nutrientBounds: {},
    serving: {
      basis: details.basis || "per_100g",
      label:
        details.servingSizeText ||
        (details.basis === "per_serving" ? "1 published serving" : "100 g"),
      grams:
        details.basis === "per_serving" ? (details.servingGrams ?? null) : 100,
      ml: null,
    },
    image: photo,
    confidence: details.confidence || "estimate",
    priority: details.confidence === "official" ? 400 : 200,
    foodId: Number(food.id),
    notes:
      details.notes ||
      "Existing LiftUp restaurant nutrition record. Historical meal logs are unchanged.",
  };
}

async function seedRestaurantMenus(
  database,
  { manifest = loadMenuManifest(), dryRun = false } = {},
) {
  validateManifest(manifest);
  const existingFoods = await database
    .prepare(
      `SELECT * FROM nutrition_foods WHERE owner_user_id IS NULL AND archived_at IS NULL AND (canonical_key LIKE 'mcdo:%' OR canonical_key LIKE 'jollibee:%' OR source = 'LiftUp PH Menu Estimates') ORDER BY id`,
    )
    .all();
  const observations = [
    ...manifest.observations,
    ...existingFoods.map((food) => legacyObservation(food, manifest)),
  ];
  const sources = new Map(
    manifest.sources.map((source) => [source.id, source]),
  );
  for (const food of existingFoods) {
    const details = JSON.parse(food.metadata_json || "{}");
    const id = `existing:${food.source}`;
    if (!sources.has(id))
      sources.set(id, {
        id,
        title: food.source,
        type: "existing_catalog",
        market: "PH",
        url: details.sourceUrl || null,
        retrievedAt: details.retrievedAt || "2026-11-13",
        notes:
          "Existing catalogue, linked by food ID. Original nutrient values and historical meal snapshots remain unchanged.",
      });
  }
  const groups = new Map();
  for (const observation of observations) {
    const key = menuIdentity(
      observation.brand,
      observation.market,
      observation.name,
    );
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }
  const report = {
    items: groups.size,
    observations: observations.length,
    byMarket: {},
    withImages: 0,
    linkedExistingFoods: existingFoods.length,
    inserted: 0,
    updated: 0,
    sourceConflicts: 0,
  };
  for (const [key, records] of groups) {
    const markets = records[0].market;
    report.byMarket[markets] = (report.byMarket[markets] || 0) + 1;
    if (records.some((record) => record.image)) report.withImages++;
    if (
      new Set(
        records.map((record) =>
          JSON.stringify([
            record.nutrients.caloriesKcal,
            record.nutrients.proteinG,
          ]),
        ),
      ).size > 1
    )
      report.sourceConflicts++;
  }
  if (dryRun) return report;
  const existingItemKeys = new Set(
    (
      await database
        .prepare("SELECT canonical_key FROM nutrition_menu_items")
        .all()
    ).map((row) => row.canonical_key),
  );
  const timestamp = new Date().toISOString();
  await database.transaction(async () => {
    for (const source of sources.values()) {
      await database
        .prepare(
          `INSERT INTO nutrition_menu_sources (id,title,source_type,market,source_url,content_sha256,published_on,retrieved_at,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, source_url=EXCLUDED.source_url, content_sha256=EXCLUDED.content_sha256, published_on=EXCLUDED.published_on, retrieved_at=EXCLUDED.retrieved_at, notes=EXCLUDED.notes`,
        )
        .run(
          source.id,
          source.title,
          source.type,
          source.market,
          source.url || null,
          source.sha256 || null,
          source.publishedOn || null,
          source.retrievedAt,
          source.notes || "",
        );
    }
    for (const [key, records] of groups) {
      records.sort(
        (a, b) =>
          b.priority - a.priority || a.sourceId.localeCompare(b.sourceId),
      );
      const primary = records[0];
      const foodId = records.find((record) => record.foodId)?.foodId ?? null;
      const quality = atwaterCheck(primary.nutrients);
      const params = [
        key,
        primary.brand,
        primary.market,
        primary.name,
        primary.category,
        foodId,
        primary.sourceId,
        primary.serving.basis,
        primary.serving.label,
        primary.serving.grams ?? null,
        primary.serving.ml ?? null,
        ...nutrientKeys.map((n) => primary.nutrients[n] ?? null),
        JSON.stringify(primary.nutrientBounds || {}),
        JSON.stringify(primary.image),
        primary.confidence,
        quality.needsReview ||
          primary.confidence === "estimate" ||
          Boolean(primary.servingUnitMismatch),
        JSON.stringify({
          ...quality,
          servingUnitMismatch: Boolean(primary.servingUnitMismatch),
        }),
        primary.notes || "",
        timestamp,
        timestamp,
      ];
      const saved = await database
        .prepare(
          `INSERT INTO nutrition_menu_items (canonical_key,brand,market,name,category,food_id,primary_source_id,basis,serving_label,serving_grams,serving_ml,calories_kcal,protein_g,carbohydrate_g,fat_g,fiber_g,sugar_g,sodium_mg,saturated_fat_g,trans_fat_g,cholesterol_mg,nutrient_bounds_json,image_json,confidence,needs_review,quality_json,notes,created_at,updated_at) VALUES (${params.map(() => "?").join(",")}) ON CONFLICT (canonical_key) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,food_id=COALESCE(EXCLUDED.food_id,nutrition_menu_items.food_id),primary_source_id=EXCLUDED.primary_source_id,basis=EXCLUDED.basis,serving_label=EXCLUDED.serving_label,serving_grams=EXCLUDED.serving_grams,serving_ml=EXCLUDED.serving_ml,calories_kcal=EXCLUDED.calories_kcal,protein_g=EXCLUDED.protein_g,carbohydrate_g=EXCLUDED.carbohydrate_g,fat_g=EXCLUDED.fat_g,fiber_g=EXCLUDED.fiber_g,sugar_g=EXCLUDED.sugar_g,sodium_mg=EXCLUDED.sodium_mg,saturated_fat_g=EXCLUDED.saturated_fat_g,trans_fat_g=EXCLUDED.trans_fat_g,cholesterol_mg=EXCLUDED.cholesterol_mg,nutrient_bounds_json=EXCLUDED.nutrient_bounds_json,image_json=EXCLUDED.image_json,confidence=EXCLUDED.confidence,needs_review=EXCLUDED.needs_review,quality_json=EXCLUDED.quality_json,notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at RETURNING id`,
        )
        .run(...params);
      const id = saved.lastInsertRowid;
      report[existingItemKeys.has(key) ? "updated" : "inserted"]++;
      for (const record of records)
        await database
          .prepare(
            `INSERT INTO nutrition_menu_observations (item_id,source_id,source_item_key,source_name,source_page,nutrients_json,serving_json,image_json,notes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (source_id,source_item_key) DO UPDATE SET item_id=EXCLUDED.item_id,source_name=EXCLUDED.source_name,source_page=EXCLUDED.source_page,nutrients_json=EXCLUDED.nutrients_json,serving_json=EXCLUDED.serving_json,image_json=EXCLUDED.image_json,notes=EXCLUDED.notes RETURNING id`,
          )
          .run(
            id,
            record.sourceId,
            record.sourceItemKey,
            record.name,
            record.sourcePage || null,
            JSON.stringify({
              ...record.nutrients,
              bounds: record.nutrientBounds || {},
            }),
            JSON.stringify(record.serving),
            JSON.stringify(record.image),
            record.notes || "",
          );
    }
  });
  return report;
}

module.exports = {
  menuIdentity,
  loadMenuManifest,
  validateManifest,
  seedRestaurantMenus,
};
