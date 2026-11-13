const {
  normalizeBarcode,
  atwaterCheck,
  canonicalFoodName,
} = require("./nutrition-quality");
const OFF = "Open Food Facts";
const number = (value) =>
  value == null || value === "" ? null : Number(value);
const valid = (value, maximum) =>
  value == null ||
  (typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum);
const parseDetails = (food) => {
  try {
    return JSON.parse(food.metadata_json || "{}");
  } catch {
    return {};
  }
};

function mountNutritionProducts(
  app,
  database,
  {
    userId,
    ensureCatalog,
    foodJson,
    fetchImpl = globalThis.fetch,
    sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  },
) {
  const pending = new Map();
  let nextLookupAt = 0;
  const selectFood = (id) =>
    database.prepare("SELECT * FROM nutrition_foods WHERE id = ?").get(id);

  app.post("/api/v1/nutrition/foods", async (req, res) => {
    await ensureCatalog();
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const basis = body.basis || "per_100g";
    const barcode = body.barcode
      ? normalizeBarcode(body.barcode, body.barcodeFormat)
      : null;
    const label = body.source === "label_scan" || Boolean(body.barcode);
    const nutrients = {
      caloriesKcal: body.caloriesKcal,
      proteinG: body.proteinG ?? null,
      carbohydrateG: body.carbohydrateG ?? null,
      fatG: body.fatG ?? null,
      fiberG: body.fiberG ?? null,
    };
    const max = basis === "per_100g" ? 100 : 1500;
    const servingGrams = body.defaultServingGrams ?? null;
    if (
      !name ||
      name.length > 120 ||
      !["per_100g", "per_serving"].includes(basis) ||
      (body.barcode && !barcode) ||
      typeof nutrients.caloriesKcal !== "number" ||
      !valid(nutrients.caloriesKcal, basis === "per_serving" ? 5000 : 900) ||
      ![
        nutrients.proteinG,
        nutrients.carbohydrateG,
        nutrients.fatG,
        nutrients.fiberG,
        body.sugarG ?? null,
      ].every((value) => valid(value, max)) ||
      !valid(body.sodiumMg ?? null, 100000) ||
      (servingGrams != null &&
        (!Number.isFinite(servingGrams) ||
          servingGrams < 1 ||
          servingGrams > 5000)) ||
      (label && body.labelConfirmed !== true)
    ) {
      return res.status(422).json({
        error:
          "Check the barcode, serving basis, and label values. Confirm every field before saving a label scan.",
      });
    }
    const brand =
      typeof body.brand === "string" ? body.brand.trim().slice(0, 100) : "";
    const key = barcode
      ? "barcode:" + barcode
      : "personal:" + canonicalFoodName(brand + " " + name) + ":" + basis;
    const source = label ? "label_scan" : "User-entered";
    const metadata = {
      basis,
      brand,
      servingGrams,
      servingSizeText:
        typeof body.servingSizeText === "string"
          ? body.servingSizeText.trim().slice(0, 100)
          : "1 serving",
      confidence: "user",
      sourceCode: label ? "label_scan" : "user",
      sourceUrl: null,
      retrievedAt: new Date(now()).toISOString(),
      sugarG: body.sugarG ?? null,
      sodiumMg: body.sodiumMg ?? null,
      notes:
        "Entered and confirmed by this account. Missing values are unknown.",
      ...atwaterCheck(nutrients),
    };
    const existing = await database
      .prepare(
        "SELECT id FROM nutrition_foods WHERE owner_user_id = ? AND (canonical_key = ? OR (barcode = ? AND barcode IS NOT NULL)) ORDER BY id",
      )
      .all(userId(), key, barcode);
    const portions = servingGrams
      ? [{ name: metadata.servingSizeText || "1 serving", grams: servingGrams }]
      : [];
    const values = [
      name,
      source,
      nutrients.caloriesKcal,
      nutrients.proteinG,
      nutrients.carbohydrateG,
      nutrients.fatG,
      nutrients.fiberG,
      JSON.stringify(portions),
      JSON.stringify(metadata),
      barcode,
      key,
    ];
    let id;
    if (existing.length) {
      id = existing[0].id;
      await database
        .prepare(
          `UPDATE nutrition_foods SET name = ?, source = ?, calories_kcal = ?, protein_g = ?, carbohydrate_g = ?, fat_g = ?, fiber_g = ?, portions_json = ?, metadata_json = ?, barcode = ?, canonical_key = ?, archived_at = NULL WHERE id = ? AND owner_user_id = ?`,
        )
        .run(...values, id, userId());
    } else {
      // The unique indexes make a retried or simultaneous save converge on one food.
      const result = await database
        .prepare(
          `INSERT INTO nutrition_foods (name, source, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, portions_json, metadata_json, barcode, canonical_key, owner_user_id, identity_scope, source_release, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Personal entry', 'Custom', ?) ON CONFLICT DO NOTHING RETURNING id`,
        )
        .run(...values, userId(), userId(), new Date(now()).toISOString());
      id =
        result.lastInsertRowid ||
        (
          await database
            .prepare(
              "SELECT id FROM nutrition_foods WHERE owner_user_id = ? AND canonical_key = ?",
            )
            .get(userId(), key)
        )?.id;
    }
    const saved = id && (await selectFood(id));
    if (!saved)
      return res.status(409).json({
        error:
          "A product with this identity already exists. Reload your foods and try again.",
      });
    res
      .status(existing.length ? 200 : 201)
      .json({ food: foodJson(saved), updated: Boolean(existing.length) });
  });

  async function remoteLookup(barcode) {
    const url = new URL(
      `https://world.openfoodfacts.org/api/v3/product/${barcode}`,
    );
    url.searchParams.set(
      "fields",
      "code,product_name,product_name_en,brands,quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments,image_front_url",
    );
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = Math.max(0, nextLookupAt - now());
      if (delay > 30000)
        return {
          status: 429,
          error: "Barcode lookup is busy. Try again shortly.",
        };
      nextLookupAt = Math.max(now(), nextLookupAt) + 4200;
      if (delay) await sleepImpl(delay);
      try {
        response = await fetchImpl(url, {
          headers: {
            Accept: "application/json",
            "User-Agent":
              process.env.OPEN_FOOD_FACTS_USER_AGENT ||
              "LiftUp/1.0.5 (https://liftup-ldlv.onrender.com)",
          },
          redirect: "error",
          signal: AbortSignal.timeout(7000),
        });
      } catch {
        return {
          status: 503,
          error:
            "The product catalogue is unavailable. Check your connection and try again.",
        };
      }
      if (response.status !== 503 || attempt === 2) break;
      await response.arrayBuffer?.().catch(() => {});
      await sleepImpl(1000 * 2 ** attempt);
    }
    if (response.status === 404)
      return {
        status: 404,
        error: "Product not found. Add its nutrition label.",
        notFound: true,
      };
    if (response.status === 429)
      return {
        status: 429,
        error: "The product catalogue is busy. Wait a moment and retry.",
      };
    if (!response.ok)
      return {
        status: 503,
        error: "The product catalogue is temporarily unavailable.",
      };
    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        status: 503,
        error: "The product catalogue returned an unreadable response.",
      };
    }
    const product = payload?.product;
    if (
      !product ||
      !(payload.status === 1 || String(payload.status).startsWith("success"))
    )
      return {
        status: 404,
        error: "Product not found. Add its nutrition label.",
        notFound: true,
      };
    const label = product.nutriments || {};
    const n = {
      caloriesKcal:
        number(label["energy-kcal_100g"]) ??
        (number(label.energy_100g) == null
          ? null
          : number(label.energy_100g) / 4.184),
      proteinG: number(label.proteins_100g),
      carbohydrateG: number(label.carbohydrates_100g),
      fatG: number(label.fat_100g),
      fiberG: number(label.fiber_100g),
    };
    const name = [product.product_name, product.product_name_en, product.brands]
      .find((value) => typeof value === "string" && value.trim())
      ?.trim()
      .slice(0, 120);
    if (
      !name ||
      n.caloriesKcal == null ||
      !valid(n.caloriesKcal, 900) ||
      [n.proteinG, n.carbohydrateG, n.fatG].some((value) => value == null) ||
      ![n.proteinG, n.carbohydrateG, n.fatG, n.fiberG].every((value) =>
        valid(value, 100),
      )
    )
      return {
        status: 422,
        error:
          "The product label is incomplete or invalid. Photograph its label and confirm the values.",
        needsLabel: true,
        productName: name || "",
      };
    const grams =
      product.serving_quantity_unit === "ml"
        ? null
        : number(product.serving_quantity);
    const servingGrams =
      grams != null && grams >= 1 && grams <= 5000 ? grams : null;
    const metadata = {
      basis: "per_100g",
      sourceCode: "openfoodfacts",
      confidence: "community",
      brand:
        typeof product.brands === "string" ? product.brands.slice(0, 100) : "",
      sourceUrl: `https://world.openfoodfacts.org/product/${barcode}`,
      retrievedAt: new Date(now()).toISOString(),
      servingSizeText:
        typeof product.serving_size === "string"
          ? product.serving_size.slice(0, 100)
          : "1 serving",
      servingGrams,
      sugarG: valid(number(label.sugars_100g), 100)
        ? number(label.sugars_100g)
        : null,
      sodiumMg:
        valid(number(label.sodium_100g), 100) &&
        number(label.sodium_100g) != null
          ? number(label.sodium_100g) * 1000
          : null,
      imageUrl:
        typeof product.image_front_url === "string" &&
        /^https:\/\/images\.openfoodfacts\.org\//.test(product.image_front_url)
          ? product.image_front_url
          : null,
      attribution: "Data from Open Food Facts (ODbL)",
      ...atwaterCheck(n),
    };
    const portions = servingGrams
      ? [{ name: metadata.servingSizeText, grams: servingGrams }]
      : [];
    const cached = await database
      .prepare(
        "SELECT id FROM nutrition_foods WHERE owner_user_id IS NULL AND source = ? AND (barcode = ? OR source_id = ?) ORDER BY id",
      )
      .get(OFF, barcode, barcode);
    if (cached) {
      await database
        .prepare(
          `UPDATE nutrition_foods SET name = ?, calories_kcal = ?, protein_g = ?, carbohydrate_g = ?, fat_g = ?, fiber_g = ?, portions_json = ?, metadata_json = ?, barcode = ? WHERE id = ?`,
        )
        .run(
          name,
          n.caloriesKcal,
          n.proteinG,
          n.carbohydrateG,
          n.fatG,
          n.fiberG,
          JSON.stringify(portions),
          JSON.stringify(metadata),
          barcode,
          cached.id,
        );
      return { status: 200, food: await selectFood(cached.id) };
    }
    await database
      .prepare(
        `INSERT INTO nutrition_foods (source, source_id, source_release, name, category, calories_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, portions_json, metadata_json, barcode, created_at) VALUES (?, ?, 'Open Food Facts API v3', ?, 'Packaged food', ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id`,
      )
      .run(
        OFF,
        barcode,
        name,
        n.caloriesKcal,
        n.proteinG,
        n.carbohydrateG,
        n.fatG,
        n.fiberG,
        JSON.stringify(portions),
        JSON.stringify(metadata),
        barcode,
        new Date(now()).toISOString(),
      );
    return {
      status: 201,
      food: await database
        .prepare(
          "SELECT * FROM nutrition_foods WHERE owner_user_id IS NULL AND barcode = ?",
        )
        .get(barcode),
    };
  }

  app.post("/api/v1/nutrition/barcode", async (req, res) => {
    const barcode = normalizeBarcode(req.body?.barcode, req.body?.format);
    if (!barcode)
      return res.status(422).json({
        error: "Enter a valid EAN or UPC barcode, including its check digit.",
      });
    await ensureCatalog();
    // Personal confirmed labels take priority and remain private to this account.
    const own = await database
      .prepare(
        "SELECT * FROM nutrition_foods WHERE owner_user_id = ? AND barcode = ? AND archived_at IS NULL",
      )
      .get(userId(), barcode);
    if (own) return res.json({ food: foodJson(own), cached: true, barcode });
    const global = await database
      .prepare(
        "SELECT * FROM nutrition_foods WHERE owner_user_id IS NULL AND (barcode = ? OR (source = ? AND source_id = ?)) AND archived_at IS NULL ORDER BY id",
      )
      .get(barcode, OFF, barcode);
    const details = global && parseDetails(global);
    if (
      global &&
      (global.source !== OFF ||
        now() - Date.parse(details.retrievedAt || global.created_at) < 86400000)
    )
      return res.json({ food: foodJson(global), cached: true, barcode });
    if (!pending.has(barcode))
      pending.set(
        barcode,
        remoteLookup(barcode).finally(() => pending.delete(barcode)),
      );
    const result = await pending.get(barcode);
    if (!result.food)
      return res.status(result.status).json({ ...result, barcode });
    res
      .status(result.status)
      .json({ food: foodJson(result.food), cached: false, barcode });
  });
}

async function normalizeStoredBarcodes(database) {
  const rows = await database
    .prepare(
      "SELECT * FROM nutrition_foods WHERE source = 'Open Food Facts' AND owner_user_id IS NULL AND archived_at IS NULL ORDER BY id",
    )
    .all();
  for (const row of rows) {
    const barcode = normalizeBarcode(row.barcode || row.source_id);
    if (!barcode) continue;
    const duplicate = await database
      .prepare(
        "SELECT id FROM nutrition_foods WHERE owner_user_id IS NULL AND barcode = ? AND id <> ? AND archived_at IS NULL",
      )
      .get(barcode, row.id);
    if (duplicate) {
      await database
        .prepare(
          "UPDATE nutrition_foods SET archived_at = ?, barcode = NULL, source_id = NULL WHERE id = ?",
        )
        .run(new Date().toISOString(), row.id);
    } else {
      await database
        .prepare("UPDATE nutrition_foods SET barcode = ? WHERE id = ?")
        .run(barcode, row.id);
    }
  }
  const personal = await database
    .prepare(
      "SELECT * FROM nutrition_foods WHERE owner_user_id IS NOT NULL AND canonical_key IS NULL AND archived_at IS NULL ORDER BY id",
    )
    .all();
  for (const row of personal) {
    const details = parseDetails(row);
    const barcode = normalizeBarcode(row.barcode || "");
    const key = barcode
      ? "barcode:" + barcode
      : "personal:" +
        canonicalFoodName((details.brand || "") + " " + row.name) +
        ":" +
        (details.basis || "per_100g");
    const duplicate = await database
      .prepare(
        "SELECT id FROM nutrition_foods WHERE owner_user_id = ? AND canonical_key = ? AND archived_at IS NULL",
      )
      .get(row.owner_user_id, key);
    if (duplicate)
      await database
        .prepare("UPDATE nutrition_foods SET archived_at = ? WHERE id = ?")
        .run(new Date().toISOString(), row.id);
    else
      await database
        .prepare(
          "UPDATE nutrition_foods SET canonical_key = ?, barcode = ? WHERE id = ?",
        )
        .run(key, barcode, row.id);
  }
}

module.exports = { mountNutritionProducts, normalizeStoredBarcodes };
