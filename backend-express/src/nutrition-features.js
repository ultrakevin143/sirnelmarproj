const foodCatalog = require("./data/usda-fndds-2021-2023.json");

const SOURCE = foodCatalog.source;
const RELEASE = `${foodCatalog.dataset} (${foodCatalog.publicationDate})`;
const mealTypes = new Set(["Breakfast", "Lunch", "Dinner", "Snack"]);
const round1 = (number) => Math.round(number * 10) / 10;

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
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category || null,
    source: row.source,
    sourceRelease: row.source_release,
    sourceId: row.source_id || null,
    nutrientsPer100g: cleanNutrients(row),
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

function configureNutritionFeatures(app, database, { userId }) {
  let catalogSeedPromise = null;
  async function ensureCatalog() {
    if (!catalogSeedPromise) {
      catalogSeedPromise = seedNutritionCatalog(database).catch((error) => {
        catalogSeedPromise = null;
        throw error;
      });
    }
    await catalogSeedPromise;
  }

  app.get("/api/v1/nutrition/foods", async (req, res) => {
    await ensureCatalog();
    const query =
      typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    const filters = tokens.map(() => "LOWER(name) LIKE ?").join(" AND ");
    const params = [userId()];
    for (const token of tokens)
      params.push(`%${token.replace(/[%_\\]/g, "\\$&")}%`);
    params.push(userId());
    const rows = await database
      .prepare(
        `
      SELECT id, owner_user_id, source, source_id, source_release, name, category,
        calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, portions_json
      FROM nutrition_foods
      WHERE (owner_user_id IS NULL OR owner_user_id = ?)
        ${filters ? `AND ${filters}` : ""}
      ORDER BY CASE WHEN owner_user_id = ? THEN 0 ELSE 1 END, name
      LIMIT 60
    `,
      )
      .all(...params);
    res.json({ foods: rows.map(foodJson) });
  });

  app.post("/api/v1/nutrition/foods", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const {
      caloriesKcal,
      proteinG,
      carbohydrateG,
      fatG,
      fiberG = null,
      defaultServingGrams = null,
    } = req.body ?? {};
    if (
      !name ||
      name.length > 120 ||
      !validGoalValue(caloriesKcal, 900) ||
      !validGoalValue(proteinG, 100) ||
      !validGoalValue(carbohydrateG, 100) ||
      !validGoalValue(fatG, 100) ||
      !validGoalValue(fiberG, 100) ||
      ![caloriesKcal, proteinG, carbohydrateG, fatG].every(
        (value) => typeof value === "number",
      ) ||
      (defaultServingGrams != null &&
        (!Number.isFinite(defaultServingGrams) ||
          defaultServingGrams < 1 ||
          defaultServingGrams > 3000))
    ) {
      return res
        .status(422)
        .json({ error: "Enter a name and valid nutrition values per 100 g." });
    }
    const portions =
      defaultServingGrams == null
        ? []
        : [{ name: "1 serving", grams: defaultServingGrams }];
    const inserted = await database
      .prepare(
        `
      INSERT INTO nutrition_foods (
        owner_user_id, source, source_id, source_release, name, category,
        calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g,
        portions_json, components_json, created_at
      ) VALUES (?, 'User-entered', NULL, 'Personal entry', ?, 'Custom', ?, ?, ?, ?, ?, ?, '[]', ?)
      RETURNING id
    `,
      )
      .run(
        userId(),
        name,
        caloriesKcal,
        proteinG,
        carbohydrateG,
        fatG,
        fiberG,
        JSON.stringify(portions),
        new Date().toISOString(),
      );
    const row = await database
      .prepare(
        `
      SELECT id, owner_user_id, source, source_id, source_release, name, category,
        calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, portions_json
      FROM nutrition_foods WHERE id = ? AND owner_user_id = ?
    `,
      )
      .get(inserted.lastInsertRowid, userId());
    res.status(201).json({ food: foodJson(row) });
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
        carbohydrate_g AS carbohydrateG, fat_g AS fatG, fiber_g AS fiberG
      FROM nutrition_entries WHERE user_id = ? AND local_date = ?
      ORDER BY logged_at, id
    `,
      )
      .all(userId(), localDate);
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
    let fiberKnown = true;
    for (const entry of entries) {
      for (const key of Object.keys(totals)) {
        if (key === "fiberG" && entry[key] == null) {
          fiberKnown = false;
        } else {
          totals[key] += Number(entry[key] ?? 0);
        }
      }
    }
    for (const key of Object.keys(totals)) totals[key] = round1(totals[key]);
    if (!fiberKnown) totals.fiberG = null;
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
    const grams = body.amountGrams;
    const localDate = body.localDate;
    const mealType = body.mealType;
    if (
      !Number.isInteger(foodId) ||
      foodId < 1 ||
      typeof grams !== "number" ||
      !Number.isFinite(grams) ||
      grams < 1 ||
      grams > 5000 ||
      !validLocalDate(localDate) ||
      !mealTypes.has(mealType) ||
      !validRequestKey(body.requestKey)
    ) {
      return res.status(422).json({
        error: "Choose a food, portion, meal, date, and unique save key.",
      });
    }
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
        carbohydrate_g, fat_g, fiber_g
      FROM nutrition_foods WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)
    `,
      )
      .get(foodId, userId());
    if (!food)
      return res.status(404).json({ error: "Food not found in your library." });
    const scale = grams / 100;
    const nutrient = (key) =>
      food[key] == null ? null : round1(Number(food[key]) * scale);
    const now = new Date().toISOString();
    try {
      const inserted = await database
        .prepare(
          `
        INSERT INTO nutrition_entries (
          user_id, food_id, food_name, source, source_id, source_release,
          local_date, logged_at, meal_type, amount_grams,
          calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, request_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        );
      const entry = await database
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
        .get(inserted.lastInsertRowid, userId());
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
