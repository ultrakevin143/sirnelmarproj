const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openDatabase, newTestSchema } = require("../src/database");
const {
  loadMenuManifest,
  menuIdentity,
  validateManifest,
  seedRestaurantMenus,
} = require("../src/nutrition-menu-catalog");

test("menu identities normalize spelling while preserving markets, portions and combinations", () => {
  assert.notEqual(
    menuIdentity("mcdo", "PH", "McCrispy Chicken Sandwich"),
    menuIdentity("mcdo", "PH", "Crispy Chicken Sandwich"),
  );
  assert.equal(
    menuIdentity("mcdo", "PH", "McChicken"),
    menuIdentity("mcdo", "PH", "McChicken Sandwich"),
  );
  assert.equal(
    menuIdentity("mcdo", "PH", "2-pc. Chicken McDo with Rice"),
    menuIdentity("mcdo", "PH", "2 pcs Chicken McDo (with Rice)"),
  );
  assert.equal(
    menuIdentity("jollibee", "US", "Yum w/ Cheese"),
    menuIdentity("jollibee", "US", "Cheesy Yumburger"),
  );
  assert.notEqual(
    menuIdentity("jollibee", "US", "Yumburger"),
    menuIdentity("jollibee", "PH", "Yumburger"),
  );
  assert.notEqual(
    menuIdentity("mcdo", "PH", "Regular Fries"),
    menuIdentity("mcdo", "PH", "Large Fries"),
  );
  assert.notEqual(
    menuIdentity("mcdo", "PH", "6pc McNuggets"),
    menuIdentity("mcdo", "PH", "6pc Chicken McNuggets with Fries"),
  );
});

test("menu manifest preserves every PDF row, partial guides, nutrient bounds and individual image references", () => {
  const manifest = loadMenuManifest();
  const us = manifest.observations.filter((row) => row.market === "US");
  const ph = manifest.observations.filter((row) => row.market === "PH");
  assert.equal(us.length, 112);
  assert.equal(ph.length, 40);
  for (const source of manifest.sources.filter((source) => source.assetUrl)) {
    const data = fs.readFileSync(
      path.join(__dirname, "../../frontend/public", source.assetUrl),
    );
    assert.equal(source.width, data.readUInt32BE(16));
    assert.equal(source.height, data.readUInt32BE(20));
  }
  assert.equal(
    new Set(us.map((row) => menuIdentity(row.brand, row.market, row.name)))
      .size,
    112,
  );
  assert.deepEqual(
    [...new Set(us.map((row) => row.sourcePage))],
    [1, 2, 3, 4, 5],
  );
  assert.equal(
    us.find((row) => row.name === "Spaghetti Party Pack (Serves 8-10)")
      .nutrients.caloriesKcal,
    4890,
  );
  assert.equal(
    us.find((row) => row.name === "Spaghetti Party Pack (Serves 8-10)").serving
      .grams,
    3289,
  );
  const fries = us.find((row) => row.name === "Jolly Crispy Fries, Regular");
  assert.equal(fries.nutrients.sugarG, null);
  assert.deepEqual(fries.nutrientBounds.sugarG, {
    operator: "<",
    value: 1,
    label: "<1",
  });
  assert.ok(
    ph.every(
      (row) =>
        row.nutrients.carbohydrateG === null &&
        row.nutrients.fatG === null &&
        row.confidence === "estimate",
    ),
  );
  for (const row of manifest.observations) {
    assert.ok(row.image.url);
    if (row.image.url.startsWith("/images/"))
      assert.ok(
        fs.existsSync(
          path.join(__dirname, "../../frontend/public", row.image.url),
        ),
      );
    if (row.image.kind === "user_guide_photo_region")
      assert.ok(row.image.region.width < row.image.sourceWidth);
  }
  const duplicate = structuredClone(manifest);
  duplicate.observations.push(duplicate.observations[0]);
  assert.throws(() => validateManifest(duplicate), /Duplicate/);
  const invalid = structuredClone(manifest);
  invalid.observations[0].nutrients.proteinG = -1;
  assert.throws(() => validateManifest(invalid), /Invalid menu nutrient/);
  const wrongMarket = structuredClone(manifest);
  wrongMarket.observations[0].market = "PH";
  assert.throws(() => validateManifest(wrongMarket), /Invalid menu identity/);
});

test("repeated menu imports keep IDs, observations, existing food data and markets distinct", async (t) => {
  const database = await openDatabase(
    process.env.LIFTUP_TEST_DATABASE === "postgres"
      ? { testSchema: true, schema: newTestSchema() }
      : { memory: true },
  );
  t.after(() =>
    database.close({
      dropSchema:
        database.testSchema && !database.memory ? database.schema : undefined,
    }),
  );
  const insert = async (
    name,
    canonical,
    source,
    calories,
    protein,
    carbs,
    fat,
  ) =>
    database
      .prepare(
        `INSERT INTO nutrition_foods (name,canonical_key,source,source_id,source_release,category,calories_kcal,protein_g,carbohydrate_g,fat_g,metadata_json,created_at) VALUES (?,?,?,?,?,'Restaurant',?,?,?,?,?,?) RETURNING id`,
      )
      .run(
        name,
        canonical,
        source,
        canonical,
        "Existing test food",
        calories,
        protein,
        carbs,
        fat,
        JSON.stringify({ basis: "per_serving", confidence: "official" }),
        "2026-11-13",
      );
  const burger = await insert(
    "McDonald's Philippines · Burger McDo",
    "mcdo:burger mcdo",
    "mcdo_ph_site",
    354,
    13,
    43,
    14,
  );
  await insert(
    "Jollibee Philippines · Yumburger",
    "jollibee:yumburger",
    "jollibee_estimate",
    280,
    null,
    null,
    null,
  );
  const beforeFood = await database
    .prepare("SELECT * FROM nutrition_foods ORDER BY id")
    .all();
  const manifest = loadMenuManifest();
  const dry = await seedRestaurantMenus(database, { manifest, dryRun: true });
  assert.equal(dry.items, 153);
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM nutrition_menu_items")
        .get()
    ).count,
    0,
  );
  const first = await seedRestaurantMenus(database, { manifest });
  assert.equal(first.items, 153);
  assert.equal(first.withImages, 153);
  const before = await database
    .prepare(
      "SELECT id,canonical_key,created_at FROM nutrition_menu_items ORDER BY id",
    )
    .all();
  const count = (
    await database
      .prepare("SELECT COUNT(*) AS count FROM nutrition_menu_observations")
      .get()
  ).count;
  const repeat = await seedRestaurantMenus(database, { manifest });
  assert.equal(repeat.inserted, 0);
  assert.equal(repeat.updated, 153);
  assert.deepEqual(
    await database
      .prepare(
        "SELECT id,canonical_key,created_at FROM nutrition_menu_items ORDER BY id",
      )
      .all(),
    before,
  );
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM nutrition_menu_observations")
        .get()
    ).count,
    count,
  );
  assert.deepEqual(
    await database.prepare("SELECT * FROM nutrition_foods ORDER BY id").all(),
    beforeFood,
  );
  const savedBurger = await database
    .prepare("SELECT * FROM nutrition_menu_items WHERE canonical_key = ?")
    .get(menuIdentity("mcdo", "PH", "Burger McDo"));
  assert.equal(savedBurger.food_id, burger.lastInsertRowid);
  assert.equal(savedBurger.calories_kcal, 354); // The unofficial guide says 250; it does not replace verified data.
  const alternatives = await database
    .prepare(
      "SELECT nutrients_json FROM nutrition_menu_observations WHERE item_id = ?",
    )
    .all(savedBurger.id);
  assert.deepEqual(
    alternatives
      .map((row) => JSON.parse(row.nutrients_json).caloriesKcal)
      .sort((a, b) => a - b),
    [250, 354],
  );
  const yumUS = await database
    .prepare("SELECT * FROM nutrition_menu_items WHERE canonical_key = ?")
    .get(menuIdentity("jollibee", "US", "Yumburger"));
  const yumPH = await database
    .prepare("SELECT * FROM nutrition_menu_items WHERE canonical_key = ?")
    .get(menuIdentity("jollibee", "PH", "Yumburger"));
  assert.notEqual(yumUS.id, yumPH.id);
  assert.equal(yumUS.calories_kcal, 360);
  assert.equal(yumPH.calories_kcal, 280);
  const drink = await database
    .prepare("SELECT * FROM nutrition_menu_items WHERE canonical_key = ?")
    .get(menuIdentity("jollibee", "US", "Pineapple Quencher"));
  assert.equal(drink.serving_ml, 473);
  assert.equal(drink.serving_grams, null);
  const partial = await database
    .prepare("SELECT * FROM nutrition_menu_items WHERE canonical_key = ?")
    .get(menuIdentity("mcdo", "PH", "Filet-O-Fish"));
  assert.equal(partial.calories_kcal, 340);
  assert.equal(partial.carbohydrate_g, null);
  assert.equal(partial.needs_review, true);
  const bounded = await database
    .prepare("SELECT * FROM nutrition_menu_items WHERE canonical_key = ?")
    .get(menuIdentity("jollibee", "US", "Jolly Crispy Fries, Regular"));
  assert.equal(bounded.sugar_g, null);
  assert.equal(JSON.parse(bounded.nutrient_bounds_json).sugarG.label, "<1");
  assert.equal(
    (
      await database
        .prepare(
          "SELECT canonical_key, COUNT(*) AS count FROM nutrition_menu_items GROUP BY canonical_key",
        )
        .all()
    ).filter((row) => row.count > 1).length,
    0,
  );
});
