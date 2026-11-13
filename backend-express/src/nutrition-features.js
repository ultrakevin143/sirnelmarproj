const foodCatalog = require("./data/usda-fndds-2021-2023.json");
const restaurantEstimates = require("./data/ph-fast-food-estimates.json");
const { seedPhFoods } = require("./nutrition-seed");
const { atwaterCheck } = require("./nutrition-quality");
const {
  mountNutritionProducts,
  normalizeStoredBarcodes,
} = require("./nutrition-products");

const SOURCE = foodCatalog.source;
const RELEASE = `${foodCatalog.dataset} (${foodCatalog.publicationDate})`;
const MENU_ESTIMATE_SOURCE = "LiftUp PH Menu Estimates";
const OPEN_FOOD_FACTS_SOURCE = "Open Food Facts";
const mealTypes = new Set(["Breakfast", "Lunch", "Dinner", "Snack"]);
const round1 = (number) => Math.round(number * 10) / 10;

function photoFromDataUrl(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return false;
  const match = value.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const data = Buffer.from(match[1], "base64");
  const valid =
    data.length >= 4 &&
    data.length <= 1024 * 1024 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data.at(-2) === 255 &&
    data.at(-1) === 217;
  return valid ? { data: match[1], mimeType: "image/jpeg" } : false;
}

function nutritionNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function openFoodFactsNutrients(product) {
  const label = product?.nutriments ?? {};
  let caloriesKcal = nutritionNumber(label["energy-kcal_100g"]);
  if (caloriesKcal == null) {
    const energyKj = nutritionNumber(label["energy_100g"]);
    if (energyKj != null) caloriesKcal = energyKj / 4.184;
  }
  return {
    caloriesKcal,
    proteinG: nutritionNumber(label.proteins_100g),
    carbohydrateG: nutritionNumber(label.carbohydrates_100g),
    fatG: nutritionNumber(label.fat_100g),
    fiberG: nutritionNumber(label.fiber_100g),
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validLocalDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

function cleanNutrients(food) {
  return {
    caloriesKcal:
      food.calories_kcal == null ? null : Number(food.calories_kcal),
    proteinG: food.protein_g == null ? null : Number(food.protein_g),
    carbohydrateG:
      food.carbohydrate_g == null ? null : Number(food.carbohydrate_g),
    fatG: food.fat_g == null ? null : Number(food.fat_g),
    fiberG: food.fiber_g == null ? null : Number(food.fiber_g),
  };
}

function foodJson(row) {
  let details = {};
  try {
    details = JSON.parse(row.metadata_json || "{}");
  } catch {}
  const nutrients = cleanNutrients(row);
  const basis = details.basis || "per_100g";
  const quality = atwaterCheck(nutrients);
  const confidence =
    details.confidence ||
    (row.owner_user_id != null
      ? "user"
      : row.source === OPEN_FOOD_FACTS_SOURCE
        ? "community"
        : "estimate");
  const per100g =
    basis === "per_100g"
      ? nutrients
      : Object.fromEntries(
          Object.entries(nutrients).map(([key, value]) => [
            key,
            value == null || !details.servingGrams
              ? null
              : round1((value * 100) / details.servingGrams),
          ]),
        );
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category || null,
    source: row.source,
    sourceRelease: row.source_release,
    sourceId: row.source_id || null,
    nutrientsPer100g: per100g,
    nutrients,
    basis,
    barcode: row.barcode || null,
    details: {
      ...details,
      confidence:
        quality.needsReview && confidence === "official"
          ? "estimate"
          : confidence,
      needsReview: details.needsReview || quality.needsReview,
      reviewReason: details.reviewReason || quality.reason,
    },
    portions: parseJsonArray(row.portions_json),
    isCustom: row.owner_user_id != null,
  };
}

async function seedNutritionCatalog(database) {
  const existing = await database
    .prepare(
      `
    SELECT COUNT(*) AS count FROM nutrition_foods
    WHERE owner_user_id IS NULL AND source = ?
  `,
    )
    .get(SOURCE);
  if (Number(existing?.count ?? 0) >= foodCatalog.foodCount) return;

  const fieldsPerFood = 13;
  const batchSize = 200;
  await database.transaction(async () => {
    const createdAt = new Date().toISOString();
    for (let start = 0; start < foodCatalog.foods.length; start += batchSize) {
      const batch = foodCatalog.foods.slice(start, start + batchSize);
      const params = [];
      const values = batch
        .map((food) => {
          const n = food.nutrientsPer100g;
          params.push(
            SOURCE,
            food.sourceId,
            RELEASE,
            food.name,
            food.category,
            n.caloriesKcal,
            n.proteinG,
            n.carbohydrateG,
            n.fatG,
            n.fiberG,
            JSON.stringify(food.portions),
            JSON.stringify(food.components),
            createdAt,
          );
          return `(${Array(fieldsPerFood).fill("?").join(", ")})`;
        })
        .join(", ");
      await database
        .prepare(
          `
        INSERT INTO nutrition_foods (
          source, source_id, source_release, name, category,
          calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g,
          portions_json, components_json, created_at
        ) VALUES ${values}
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
        )
        .run(...params);
    }
  });
}

async function seedRestaurantEstimates(database) {
  const replaced = new Set([
    "mcdo-burger-mcdo-v1",
    "mcdo-chicken-mcdo-rice-v1",
    "mcdo-medium-fries-v1",
    "jollibee-jolly-spaghetti-v1",
    "jollibee-yumburger-v1",
  ]);
  const recipes = restaurantEstimates.foods.filter(
    (food) => !replaced.has(food.sourceId),
  );
  const existing = await database
    .prepare(
      `
    SELECT COUNT(*) AS count FROM nutrition_foods
    WHERE owner_user_id IS NULL AND source = ?
  `,
    )
    .get(MENU_ESTIMATE_SOURCE);
  if (Number(existing?.count ?? 0) >= recipes.length) return;

  const foodsById = new Map(
    foodCatalog.foods.map((food) => [food.sourceId, food]),
  );
  await database.transaction(async () => {
    const createdAt = new Date().toISOString();
    for (const recipe of recipes) {
      const parts = recipe.components.map((component) => {
        const food = foodsById.get(component.sourceId);
        if (!food)
          throw new Error(
            `Fast-food estimate ingredient ${component.sourceId} is missing.`,
          );
        return {
          sourceId: food.sourceId,
          name: food.name,
          grams: component.grams,
          nutrients: food.nutrientsPer100g,
        };
      });
      const servingGrams = parts.reduce((total, part) => total + part.grams, 0);
      const nutrients = Object.fromEntries(
        ["caloriesKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"].map(
          (key) => {
            if (parts.some((part) => part.nutrients[key] == null))
              return [key, null];
            const total = parts.reduce(
              (sum, part) => sum + (part.nutrients[key] * part.grams) / 100,
              0,
            );
            return [key, round1((total / servingGrams) * 100)];
          },
        ),
      );
      await database
        .prepare(
          `
        INSERT INTO nutrition_foods (
          owner_user_id, source, source_id, source_release, name, category,
          calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g,
          portions_json, components_json, created_at
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `,
        )
        .run(
          MENU_ESTIMATE_SOURCE,
          recipe.sourceId,
          restaurantEstimates.dataset,
          recipe.name,
          recipe.category,
          nutrients.caloriesKcal,
          nutrients.proteinG,
          nutrients.carbohydrateG,
          nutrients.fatG,
          nutrients.fiberG,
          JSON.stringify([{ name: recipe.serving, grams: servingGrams }]),
          JSON.stringify(
            parts.map(({ sourceId, name, grams }) => ({
              sourceId,
              name,
              grams,
            })),
          ),
          createdAt,
        );
    }
  });
}

function validGoalValue(value, max) {
  return (
    value == null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= max)
  );
}

function validRequestKey(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 100;
}

function configureNutritionFeatures(
  app,
  database,
  { userId, fetchImpl = globalThis.fetch, sleepImpl, now },
) {
  let catalogSeedPromise = null;
  async function ensureCatalog() {
    if (!catalogSeedPromise) {
      catalogSeedPromise = seedNutritionCatalog(database)
        .then(() => seedRestaurantEstimates(database))
        .then(() => seedPhFoods(database))
        .then(() => normalizeStoredBarcodes(database))
        .catch((error) => {
          catalogSeedPromise = null;
          throw error;
        });
    }
    await catalogSeedPromise;
  }

  app.get("/api/v1/nutrition/capabilities", (_req, res) => {
    res.json({
      mealPhotos: true,
      barcodeLookup: true,
      productDetails: true,
      nutritionVersion: 2,
    });
  });

  app.get("/api/v1/nutrition/foods", async (req, res) => {
    await ensureCatalog();
    const query =
      typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const normalizedQuery = query
      .toLowerCase()
      .replace(/mcdonald[’']?s?/g, "mcdo");
    const phRestaurant = /\b(mcdo|jollibee|mang inasal)\b/.test(
      normalizedQuery,
    );
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean).slice(0, 5);
    const filters = tokens.map(() => "LOWER(f.name) LIKE ?").join(" AND ");
    const params = [userId(), userId()];
    for (const token of tokens)
      params.push(`%${token.replace(/[%_\\]/g, "\\$&")}%`);
    params.push(userId());
    const rows = await database
      .prepare(
        `
      SELECT f.* FROM nutrition_foods f
      WHERE f.archived_at IS NULL AND (f.owner_user_id IS NULL OR f.owner_user_id = ?)
        ${phRestaurant ? "AND f.source <> 'USDA FoodData Central'" : ""}
        AND (f.owner_user_id IS NOT NULL OR f.barcode IS NULL OR f.barcode NOT IN (
          SELECT barcode FROM nutrition_foods WHERE owner_user_id = ? AND archived_at IS NULL AND barcode IS NOT NULL
        ))
        ${filters ? `AND ${filters}` : ""}
      ORDER BY CASE WHEN f.owner_user_id = ? THEN 0 ELSE 1 END, f.name
      LIMIT 60
    `,
      )
      .all(...params);
    res.json({ foods: rows.map(foodJson) });
  });

  mountNutritionProducts(app, database, {
    userId,
    ensureCatalog,
    foodJson,
    fetchImpl,
    sleepImpl,
    now,
  });

  app.get("/api/v1/nutrition/goals", async (_req, res) => {
    const goals = await database
      .prepare(
        `
      SELECT calories_kcal AS caloriesKcal, protein_g AS proteinG,
        carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG,
        water_ml AS waterMl, updated_at AS updatedAt
      FROM nutrition_goals WHERE user_id = ?
    `,
      )
      .get(userId());
    res.json({ goals: goals ?? null });
  });

  app.put("/api/v1/nutrition/goals", async (req, res) => {
    const goals = req.body ?? {};
    if (
      !validGoalValue(goals.caloriesKcal, 10000) ||
      !validGoalValue(goals.proteinG, 1000) ||
      !validGoalValue(goals.carbohydrateG, 2000) ||
      !validGoalValue(goals.fatG, 1000) ||
      !validGoalValue(goals.fiberG, 500) ||
      !validGoalValue(goals.waterMl, 20000)
    ) {
      return res
        .status(422)
        .json({ error: "Targets must be non-negative numbers or blank." });
    }
    const existing = await database
      .prepare("SELECT user_id FROM nutrition_goals WHERE user_id = ?")
      .get(userId());
    const now = new Date().toISOString();
    if (existing) {
      await database
        .prepare(
          `
        UPDATE nutrition_goals SET calories_kcal = ?, protein_g = ?, carbohydrate_g = ?,
          fat_g = ?, fiber_g = ?, water_ml = ?, updated_at = ? WHERE user_id = ?
      `,
        )
        .run(
          goals.caloriesKcal ?? null,
          goals.proteinG ?? null,
          goals.carbohydrateG ?? null,
          goals.fatG ?? null,
          goals.fiberG ?? null,
          goals.waterMl ?? null,
          now,
          userId(),
        );
    } else {
      await database
        .prepare(
          `
        INSERT INTO nutrition_goals (
          user_id, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, water_ml, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING user_id
      `,
        )
        .run(
          userId(),
          goals.caloriesKcal ?? null,
          goals.proteinG ?? null,
          goals.carbohydrateG ?? null,
          goals.fatG ?? null,
          goals.fiberG ?? null,
          goals.waterMl ?? null,
          now,
        );
    }
    const saved = await database
      .prepare(
        `
      SELECT calories_kcal AS caloriesKcal, protein_g AS proteinG,
        carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG,
        water_ml AS waterMl, updated_at AS updatedAt
      FROM nutrition_goals WHERE user_id = ?
    `,
      )
      .get(userId());
    res.json({ goals: saved });
  });

  app.get("/api/v1/nutrition/entries", async (req, res) => {
    const localDate =
      typeof req.query.date === "string"
        ? req.query.date
        : new Date().toISOString().slice(0, 10);
    if (!validLocalDate(localDate))
      return res.status(422).json({ error: "Choose a valid calendar date." });
    const entries = await database
      .prepare(
        `
      SELECT id, food_id AS foodId, food_name AS foodName, source,
        source_id AS sourceId, source_release AS sourceRelease, local_date AS localDate,
        logged_at AS loggedAt, meal_type AS mealType, amount_grams AS amountGrams,
        calories_kcal AS caloriesKcal, protein_g AS proteinG,
        carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG,
        CASE WHEN entry_photo.entry_id IS NULL THEN FALSE ELSE TRUE END AS hasPhoto
        , amount_servings AS amountServings, nutrition_entries.metadata_json AS metadataJson
      FROM nutrition_entries
      LEFT JOIN nutrition_entry_photos AS entry_photo
        ON entry_photo.entry_id = nutrition_entries.id
        AND entry_photo.user_id = nutrition_entries.user_id
      WHERE nutrition_entries.user_id = ? AND local_date = ?
      ORDER BY logged_at, id
    `,
      )
      .all(userId(), localDate);
    for (const entry of entries) {
      try {
        entry.details = JSON.parse(entry.metadataJson || "{}");
      } catch {
        entry.details = {};
      }
      delete entry.metadataJson;
    }
    const waterEntries = await database
      .prepare(
        `
      SELECT id, local_date AS localDate, amount_ml AS amountMl, logged_at AS loggedAt
      FROM nutrition_water_entries WHERE user_id = ? AND local_date = ?
      ORDER BY logged_at, id
    `,
      )
      .all(userId(), localDate);
    const goals = await database
      .prepare(
        `
      SELECT calories_kcal AS caloriesKcal, protein_g AS proteinG,
        carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG, water_ml AS waterMl
      FROM nutrition_goals WHERE user_id = ?
    `,
      )
      .get(userId());
    const totals = {
      caloriesKcal: 0,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 0,
      fiberG: 0,
    };
    const unknownTotals = new Set();
    for (const entry of entries) {
      for (const key of Object.keys(totals)) {
        if (entry[key] == null) {
          unknownTotals.add(key);
        } else {
          totals[key] += Number(entry[key] ?? 0);
        }
      }
    }
    for (const key of Object.keys(totals)) totals[key] = round1(totals[key]);
    for (const key of unknownTotals) totals[key] = null;
    res.json({
      date: localDate,
      entries,
      totals,
      goals: goals ?? null,
      waterEntries,
      waterTotalMl: round1(
        waterEntries.reduce(
          (total, entry) => total + Number(entry.amountMl),
          0,
        ),
      ),
    });
  });

  app.post("/api/v1/nutrition/entries", async (req, res) => {
    await ensureCatalog();
    const body = req.body ?? {};
    const foodId = Number(body.foodId);
    let grams = body.amountGrams;
    const servings = body.amountServings;
    const validGrams =
      typeof grams === "number" &&
      Number.isFinite(grams) &&
      grams >= 1 &&
      grams <= 5000;
    const validServings =
      typeof servings === "number" &&
      Number.isFinite(servings) &&
      servings >= 0.1 &&
      servings <= 20;
    const localDate = body.localDate;
    const mealType = body.mealType;
    if (
      !Number.isInteger(foodId) ||
      foodId < 1 ||
      (!validGrams && !validServings) ||
      !validLocalDate(localDate) ||
      !mealTypes.has(mealType) ||
      !validRequestKey(body.requestKey)
    ) {
      return res.status(422).json({
        error: "Choose a food, portion, meal, date, and unique save key.",
      });
    }
    const photo = photoFromDataUrl(body.photoData);
    if (photo === false)
      return res
        .status(422)
        .json({ error: "Choose a valid JPEG image no larger than 1 MB." });
    const prior = await database
      .prepare(
        `
      SELECT id, food_name AS foodName, source_id AS sourceId, source_release AS sourceRelease,
        meal_type AS mealType, local_date AS localDate,
        amount_grams AS amountGrams, calories_kcal AS caloriesKcal, protein_g AS proteinG,
        carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG
      FROM nutrition_entries WHERE user_id = ? AND request_key = ?
    `,
      )
      .get(userId(), body.requestKey);
    if (prior) return res.json({ entry: prior, duplicate: true });
    const food = await database
      .prepare(
        `
      SELECT id, owner_user_id, source, source_id, source_release, name, calories_kcal, protein_g,
        carbohydrate_g, fat_g, fiber_g, metadata_json
      FROM nutrition_foods WHERE id = ? AND archived_at IS NULL AND (owner_user_id IS NULL OR owner_user_id = ?)
    `,
      )
      .get(foodId, userId());
    if (!food)
      return res.status(404).json({ error: "Food not found in your library." });
    const details = foodJson(food).details;
    const servingBased = details.basis === "per_serving";
    if ((servingBased && !validServings) || (!servingBased && !validGrams))
      return res.status(422).json({
        error:
          "Choose the correct serving unit. Update the Android app if serving counts are unavailable.",
      });
    const scale = servingBased ? servings : grams / 100;
    if (servingBased)
      grams = details.servingGrams
        ? round1(details.servingGrams * servings)
        : 0;
    const nutrient = (key) =>
      food[key] == null ? null : round1(Number(food[key]) * scale);
    const now = new Date().toISOString();
    try {
      const entry = await database.transaction(async () => {
        const inserted = await database
          .prepare(
            `
        INSERT INTO nutrition_entries (
          user_id, food_id, food_name, source, source_id, source_release,
          local_date, logged_at, meal_type, amount_grams,
          calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, request_key,
          amount_servings, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `,
          )
          .run(
            userId(),
            food.id,
            food.name,
            food.source,
            food.source_id,
            food.source_release,
            localDate,
            now,
            mealType,
            grams,
            nutrient("calories_kcal"),
            nutrient("protein_g"),
            nutrient("carbohydrate_g"),
            nutrient("fat_g"),
            nutrient("fiber_g"),
            body.requestKey,
            servingBased ? servings : null,
            JSON.stringify(details),
          );
        const entryId = inserted.lastInsertRowid;
        if (photo) {
          await database
            .prepare(
              `
          INSERT INTO nutrition_entry_photos (entry_id, user_id, mime_type, image_base64, created_at)
          VALUES (?, ?, ?, ?, ?)
          RETURNING entry_id
        `,
            )
            .run(entryId, userId(), photo.mimeType, photo.data, now);
        }
        return database
          .prepare(
            `
        SELECT id, food_id AS foodId, food_name AS foodName, source,
          source_id AS sourceId, source_release AS sourceRelease, local_date AS localDate,
          logged_at AS loggedAt, meal_type AS mealType, amount_grams AS amountGrams,
          calories_kcal AS caloriesKcal, protein_g AS proteinG,
          carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG
        FROM nutrition_entries WHERE id = ? AND user_id = ?
      `,
          )
          .get(entryId, userId());
      });
      res.status(201).json({ entry });
    } catch (error) {
      if (error.code === "23505") {
        const duplicate = await database
          .prepare(
            `
          SELECT id, food_name AS foodName, source_id AS sourceId, source_release AS sourceRelease,
            meal_type AS mealType, local_date AS localDate,
            amount_grams AS amountGrams, calories_kcal AS caloriesKcal, protein_g AS proteinG,
            carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG
          FROM nutrition_entries WHERE user_id = ? AND request_key = ?
        `,
          )
          .get(userId(), body.requestKey);
        return res.json({ entry: duplicate, duplicate: true });
      }
      throw error;
    }
  });

  app.get("/api/v1/nutrition/entries/:entryId/photo", async (req, res) => {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId) || entryId < 1)
      return res.status(404).json({ error: "Meal photo not found." });
    const photo = await database
      .prepare(
        `
      SELECT mime_type AS mimeType, image_base64 AS imageBase64
      FROM nutrition_entry_photos WHERE entry_id = ? AND user_id = ?
    `,
      )
      .get(entryId, userId());
    if (!photo) return res.status(404).json({ error: "Meal photo not found." });
    res.json({
      photoData: `data:${photo.mimeType};base64,${photo.imageBase64}`,
    });
  });

  app.delete("/api/v1/nutrition/entries/:entryId", async (req, res) => {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId) || entryId < 1)
      return res.status(404).json({ error: "Food log entry not found." });
    const result = await database
      .prepare("DELETE FROM nutrition_entries WHERE id = ? AND user_id = ?")
      .run(entryId, userId());
    if (!result.changes)
      return res.status(404).json({ error: "Food log entry not found." });
    res.status(204).end();
  });

  app.post("/api/v1/nutrition/water", async (req, res) => {
    const { amountMl, localDate, requestKey } = req.body ?? {};
    if (
      typeof amountMl !== "number" ||
      !Number.isFinite(amountMl) ||
      amountMl < 1 ||
      amountMl > 3000 ||
      !validLocalDate(localDate) ||
      !validRequestKey(requestKey)
    ) {
      return res.status(422).json({
        error: "Enter a water amount from 1 to 3000 ml and a valid date.",
      });
    }
    const prior = await database
      .prepare(
        `
      SELECT id, amount_ml AS amountMl, local_date AS localDate, logged_at AS loggedAt
      FROM nutrition_water_entries WHERE user_id = ? AND request_key = ?
    `,
      )
      .get(userId(), requestKey);
    if (prior) return res.json({ entry: prior, duplicate: true });
    let inserted;
    try {
      inserted = await database
        .prepare(
          `
        INSERT INTO nutrition_water_entries (user_id, local_date, amount_ml, logged_at, request_key)
        VALUES (?, ?, ?, ?, ?) RETURNING id
      `,
        )
        .run(
          userId(),
          localDate,
          amountMl,
          new Date().toISOString(),
          requestKey,
        );
    } catch (error) {
      if (error.code === "23505") {
        const duplicate = await database
          .prepare(
            `
          SELECT id, amount_ml AS amountMl, local_date AS localDate, logged_at AS loggedAt
          FROM nutrition_water_entries WHERE user_id = ? AND request_key = ?
        `,
          )
          .get(userId(), requestKey);
        return res.json({ entry: duplicate, duplicate: true });
      }
      throw error;
    }
    const entry = await database
      .prepare(
        `
      SELECT id, amount_ml AS amountMl, local_date AS localDate, logged_at AS loggedAt
      FROM nutrition_water_entries WHERE id = ? AND user_id = ?
    `,
      )
      .get(inserted.lastInsertRowid, userId());
    res.status(201).json({ entry });
  });

  app.delete("/api/v1/nutrition/water/:entryId", async (req, res) => {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId) || entryId < 1)
      return res.status(404).json({ error: "Water entry not found." });
    const result = await database
      .prepare(
        "DELETE FROM nutrition_water_entries WHERE id = ? AND user_id = ?",
      )
      .run(entryId, userId());
    if (!result.changes)
      return res.status(404).json({ error: "Water entry not found." });
    res.status(204).end();
  });
}

module.exports = {
  configureNutritionFeatures,
  seedNutritionCatalog,
  validLocalDate,
};
