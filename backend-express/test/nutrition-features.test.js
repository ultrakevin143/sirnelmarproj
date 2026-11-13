const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/server");
const { newTestSchema } = require("../src/database");

async function fixture(t, appOptions = {}) {
  const storage =
    process.env.LIFTUP_TEST_DATABASE === "postgres"
      ? { testSchema: true, schema: newTestSchema() }
      : { memory: true };
  const service = await createApp({ ...storage, ...appOptions });
  const server = service.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => ({
    cookie: "",
    async request(path, method = "GET", body) {
      const response = await fetch(base + path, {
        method,
        headers: {
          cookie: this.cookie,
          "content-type": "application/json",
          "x-liftup-request": "1",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookie = response.headers.get("set-cookie");
      if (cookie) this.cookie = cookie.split(";")[0];
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
      };
    },
  });
  const register = async (email) => {
    const account = client();
    const result = await account.request("/api/auth/register", "POST", {
      name: "Nutrition Tester",
      email,
      password: "nutrition-test-password-123",
    });
    assert.equal(result.status, 201);
    return account;
  };
  return { ...service, client, register };
}

test("nutrition catalogue, targets, food and water logs stay account-scoped and safely retryable", async (t) => {
  const { database, register } = await fixture(t);
  const alice = await register("nutrition-alice@example.test");
  const bob = await register("nutrition-bob@example.test");

  const adobo = await alice.request("/api/v1/nutrition/foods?q=adobo");
  assert.equal(adobo.status, 200);
  assert.ok(adobo.data.foods.some((food) => food.name === "Adobo, with rice"));
  assert.ok(
    adobo.data.foods.every((food) => food.source === "USDA FoodData Central"),
  );
  const mcdo = await alice.request("/api/v1/nutrition/foods?q=McDo");
  assert.ok(
    mcdo.data.foods.some(
      (food) =>
        food.source === "mcdo_ph_site" &&
        food.name.includes("1pc Chicken McDo with Rice"),
    ),
  );
  const jollibee = await alice.request("/api/v1/nutrition/foods?q=Jollibee");
  assert.ok(
    jollibee.data.foods.some((food) => food.name.includes("Chickenjoy")),
  );
  const mangInasal = await alice.request(
    "/api/v1/nutrition/foods?q=Mang%20Inasal",
  );
  assert.ok(
    mangInasal.data.foods.some((food) =>
      food.name.includes("Chicken Inasal Paa"),
    ),
  );
  const riceAdobo = adobo.data.foods.find(
    (food) => food.name === "Adobo, with rice",
  );
  assert.equal(riceAdobo.sourceId, "2708958");
  const catalogCount = await database
    .prepare(
      `
    SELECT COUNT(*) AS count FROM nutrition_foods
    WHERE owner_user_id IS NULL AND source = 'USDA FoodData Central'
  `,
    )
    .get();
  assert.equal(Number(catalogCount.count), 5431);

  const goals = {
    caloriesKcal: 2200,
    proteinG: 140,
    carbohydrateG: 240,
    fatG: 70,
    fiberG: 30,
    waterMl: 2500,
  };
  assert.equal(
    (await alice.request("/api/v1/nutrition/goals", "PUT", goals)).status,
    200,
  );
  assert.equal(
    (await alice.request("/api/v1/nutrition/goals")).data.goals.proteinG,
    140,
  );
  assert.equal((await bob.request("/api/v1/nutrition/goals")).data.goals, null);

  const custom = await alice.request("/api/v1/nutrition/foods", "POST", {
    name: "LiftUp test rice bowl",
    caloriesKcal: 200,
    proteinG: 10,
    carbohydrateG: 20,
    fatG: 5,
    fiberG: 2,
    defaultServingGrams: 150,
  });
  assert.equal(custom.status, 201);
  assert.equal(custom.data.food.isCustom, true);
  const customId = custom.data.food.id;
  assert.equal(
    (
      await bob.request("/api/v1/nutrition/foods?q=LiftUp%20test%20rice%20bowl")
    ).data.foods.some((food) => food.id === customId),
    false,
  );

  const date = "2026-11-13";
  const sourceEntry = await alice.request("/api/v1/nutrition/entries", "POST", {
    foodId: riceAdobo.id,
    amountGrams: 100,
    localDate: date,
    mealType: "Breakfast",
    requestKey: "alice-usda-log-0001",
  });
  assert.equal(sourceEntry.status, 201);
  assert.equal(sourceEntry.data.entry.sourceId, "2708958");
  assert.match(sourceEntry.data.entry.sourceRelease, /FNDDS\) 2021/);
  assert.equal(
    (
      await alice.request(
        `/api/v1/nutrition/entries/${sourceEntry.data.entry.id}`,
        "DELETE",
      )
    ).status,
    204,
  );
  const saved = await alice.request("/api/v1/nutrition/entries", "POST", {
    foodId: customId,
    amountGrams: 150,
    localDate: date,
    mealType: "Lunch",
    requestKey: "alice-food-save-0001",
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.entry.caloriesKcal, 300);
  assert.equal(saved.data.entry.proteinG, 15);
  assert.equal(saved.data.entry.carbohydrateG, 30);
  assert.equal(saved.data.entry.fatG, 7.5);
  assert.equal(saved.data.entry.sourceId, null);
  assert.equal(saved.data.entry.sourceRelease, "Personal entry");
  const retry = await alice.request("/api/v1/nutrition/entries", "POST", {
    foodId: customId,
    amountGrams: 150,
    localDate: date,
    mealType: "Lunch",
    requestKey: "alice-food-save-0001",
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.duplicate, true);
  assert.equal(
    (await bob.request(`/api/v1/nutrition/entries?date=${date}`)).data.entries
      .length,
    0,
  );
  assert.equal(
    (
      await bob.request("/api/v1/nutrition/entries", "POST", {
        foodId: customId,
        amountGrams: 150,
        localDate: date,
        mealType: "Lunch",
        requestKey: "bob-cannot-use-0001",
      })
    ).status,
    404,
  );

  const water = await alice.request("/api/v1/nutrition/water", "POST", {
    amountMl: 500,
    localDate: date,
    requestKey: "alice-water-log-0001",
  });
  assert.equal(water.status, 201);
  const waterRetry = await alice.request("/api/v1/nutrition/water", "POST", {
    amountMl: 500,
    localDate: date,
    requestKey: "alice-water-log-0001",
  });
  assert.equal(waterRetry.data.duplicate, true);
  const day = await alice.request(`/api/v1/nutrition/entries?date=${date}`);
  assert.equal(day.data.entries.length, 1);
  assert.deepEqual(day.data.totals, {
    caloriesKcal: 300,
    proteinG: 15,
    carbohydrateG: 30,
    fatG: 7.5,
    fiberG: 3,
  });
  assert.equal(day.data.waterTotalMl, 500);

  const incompleteFiber = await alice.request(
    "/api/v1/nutrition/foods",
    "POST",
    {
      name: "LiftUp test food without fiber data",
      caloriesKcal: 100,
      proteinG: 5,
      carbohydrateG: 10,
      fatG: 2,
      fiberG: null,
    },
  );
  assert.equal(incompleteFiber.status, 201);
  const incompleteFiberEntry = await alice.request(
    "/api/v1/nutrition/entries",
    "POST",
    {
      foodId: incompleteFiber.data.food.id,
      amountGrams: 100,
      localDate: "2026-11-14",
      mealType: "Snack",
      requestKey: "alice-incomplete-fiber-0001",
    },
  );
  assert.equal(incompleteFiberEntry.status, 201);
  const incompleteFiberDay = await alice.request(
    "/api/v1/nutrition/entries?date=2026-11-14",
  );
  assert.equal(incompleteFiberDay.data.totals.fiberG, null);

  assert.equal(
    (
      await bob.request(
        `/api/v1/nutrition/entries/${saved.data.entry.id}`,
        "DELETE",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await alice.request(
        `/api/v1/nutrition/entries/${saved.data.entry.id}`,
        "DELETE",
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await alice.request(
        `/api/v1/nutrition/water/${water.data.entry.id}`,
        "DELETE",
      )
    ).status,
    204,
  );

  const aliceProfile = (await alice.request("/api/auth/me")).data.user;
  assert.equal(
    (
      await alice.request("/api/auth/account", "DELETE", {
        password: "nutrition-test-password-123",
        confirm: "DELETE",
      })
    ).status,
    204,
  );
  const remainingFoods = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM nutrition_foods WHERE owner_user_id = ?",
    )
    .get(aliceProfile.id);
  const remainingGoals = await database
    .prepare("SELECT COUNT(*) AS count FROM nutrition_goals WHERE user_id = ?")
    .get(aliceProfile.id);
  assert.equal(Number(remainingFoods.count), 0);
  assert.equal(Number(remainingGoals.count), 0);
});

test("barcode nutrition labels and private meal photos are saved with owner-scoped food logs", async (t) => {
  let lookups = 0;
  const fetchImpl = async (url, options) => {
    lookups += 1;
    assert.match(new URL(url).pathname, /\/api\/v3\/product\/4807770273698$/);
    assert.match(options.headers["User-Agent"], /^LiftUp\//);
    return {
      status: 200,
      ok: true,
      async json() {
        return {
          status: "success_with_warnings",
          product: {
            product_name: "Test oat bar",
            serving_size: "1 bar",
            serving_quantity: 35,
            nutriments: {
              "energy-kcal_100g": 400,
              proteins_100g: 10,
              carbohydrates_100g: 60,
              fat_100g: 12,
              fiber_100g: 7,
            },
          },
        };
      },
    };
  };
  const { register } = await fixture(t, { fetchImpl });
  const alice = await register("nutrition-barcode-alice@example.test");
  const bob = await register("nutrition-barcode-bob@example.test");

  const scanned = await alice.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "4807770273698",
  });
  assert.equal(scanned.status, 201);
  assert.equal(scanned.data.food.source, "Open Food Facts");
  assert.equal(scanned.data.food.name, "Test oat bar");
  assert.equal(scanned.data.food.portions[0].grams, 35);
  const cached = await alice.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "4807770273698",
  });
  assert.equal(cached.status, 200);
  assert.equal(cached.data.cached, true);
  assert.equal(lookups, 1);

  const photoData = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 217]).toString("base64")}`;
  const saved = await alice.request("/api/v1/nutrition/entries", "POST", {
    foodId: scanned.data.food.id,
    amountGrams: 35,
    localDate: "2026-11-13",
    mealType: "Lunch",
    requestKey: "alice-photo-save-0001",
    photoData,
  });
  assert.equal(saved.status, 201);
  const day = await alice.request("/api/v1/nutrition/entries?date=2026-11-13");
  assert.equal(day.data.entries[0].hasPhoto, true);
  const photo = await alice.request(
    `/api/v1/nutrition/entries/${saved.data.entry.id}/photo`,
  );
  assert.equal(photo.status, 200);
  assert.equal(photo.data.photoData, photoData);
  assert.equal(
    (
      await bob.request(
        `/api/v1/nutrition/entries/${saved.data.entry.id}/photo`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await alice.request("/api/v1/nutrition/entries", "POST", {
        foodId: scanned.data.food.id,
        amountGrams: 35,
        localDate: "2026-11-13",
        mealType: "Lunch",
        requestKey: "alice-photo-invalid-001",
        photoData: "data:image/png;base64,AAAA",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await alice.request(
        `/api/v1/nutrition/entries/${saved.data.entry.id}`,
        "DELETE",
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await alice.request(
        `/api/v1/nutrition/entries/${saved.data.entry.id}/photo`,
      )
    ).status,
    404,
  );
});

test("barcode retries, scoped label priority, serving basis, and idempotent PH imports", async (t) => {
  const { seedPhFoods } = require("../src/nutrition-seed");
  let calls = 0;
  let clock = Date.parse("2026-11-13T08:00:00Z");
  const waits = [];
  const { database, register } = await fixture(t, {
    now: () => clock,
    sleepImpl: async (ms) => {
      waits.push(ms);
    },
    fetchImpl: async (url) => {
      calls++;
      if (calls === 1) return { status: 503, ok: false };
      if (new URL(url).pathname.endsWith("/0036000291452"))
        return { status: 404, ok: false };
      return {
        status: 200,
        ok: true,
        json: async () => ({
          status: "success",
          product: {
            product_name: "Pancit Canton Chilimansi",
            brands: "Monde Nissin",
            nutriments: {
              "energy-kcal_100g": 450,
              proteins_100g: 10,
              carbohydrates_100g: 60,
              fat_100g: 20,
            },
          },
        }),
      };
    },
  });
  const alice = await register("nutrition-dedup-alice@example.test");
  const bob = await register("nutrition-dedup-bob@example.test");
  const legacy = await database
    .prepare(
      `INSERT INTO nutrition_foods (source,source_id,source_release,name,category,calories_kcal,protein_g,carbohydrate_g,fat_g,fiber_g,portions_json,components_json,created_at) VALUES ('LiftUp PH Menu Estimates','mcdo-burger-mcdo-v1','Old estimate','McDonald''s PH · Burger McDo (estimate)','McDonald''s Philippines',257,13.9,25.5,10.5,NULL,'[]','[]',?) RETURNING id`,
    )
    .run(new Date().toISOString());
  await database
    .prepare(
      `INSERT INTO nutrition_entries (user_id,food_id,food_name,source,source_release,local_date,logged_at,meal_type,amount_grams,calories_kcal,protein_g,carbohydrate_g,fat_g,request_key) VALUES (?,?,'Old Burger McDo','LiftUp PH Menu Estimates','Old estimate','2026-11-12',?,'Lunch',100,257,13.9,25.5,10.5,'legacy-snapshot-001') RETURNING id`,
    )
    .run(
      (await alice.request("/api/auth/me")).data.user.id,
      legacy.lastInsertRowid,
      new Date().toISOString(),
    );
  assert.equal(
    (
      await alice.request("/api/v1/nutrition/barcode", "POST", {
        barcode: "4807770273699",
      })
    ).status,
    422,
  );
  assert.equal(calls, 0);
  const first = await alice.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "4807770273698",
  });
  assert.equal(first.status, 201);
  assert.equal(calls, 2);
  assert.ok(waits.includes(1000));
  const cached = await bob.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "4807770273698",
  });
  assert.equal(cached.data.food.id, first.data.food.id);
  assert.equal(calls, 2);
  clock += 86400001;
  const refreshed = await alice.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "4807770273698",
  });
  assert.equal(refreshed.data.food.id, first.data.food.id);
  assert.equal(calls, 3);
  const label = {
    name: "Pancit Canton confirmed label",
    barcode: "4807770273698",
    basis: "per_serving",
    source: "label_scan",
    labelConfirmed: true,
    caloriesKcal: 320,
    proteinG: 8,
    carbohydrateG: 40,
    fatG: 14,
  };
  assert.equal(
    (
      await alice.request("/api/v1/nutrition/foods", "POST", {
        ...label,
        labelConfirmed: false,
      })
    ).status,
    422,
  );
  const own = await alice.request("/api/v1/nutrition/foods", "POST", label);
  assert.equal(
    own.status,
    201,
    JSON.stringify({
      response: own.data,
      rows: await database
        .prepare(
          "SELECT id, owner_user_id, canonical_key, barcode FROM nutrition_foods WHERE barcode = ?",
        )
        .all(label.barcode),
    }),
  );
  const again = await alice.request("/api/v1/nutrition/foods", "POST", label);
  assert.equal(again.data.food.id, own.data.food.id);
  assert.equal(again.status, 200);
  const ownLookup = await alice.request("/api/v1/nutrition/barcode", "POST", {
    barcode: label.barcode,
  });
  assert.equal(ownLookup.data.food.id, own.data.food.id);
  assert.equal(calls, 3);
  const otherLookup = await bob.request("/api/v1/nutrition/barcode", "POST", {
    barcode: label.barcode,
  });
  assert.equal(otherLookup.data.food.id, first.data.food.id);
  const visible = (
    await alice.request("/api/v1/nutrition/foods?q=Pancit")
  ).data.foods.filter((food) => food.barcode === label.barcode);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, own.data.food.id);
  const menu = await alice.request("/api/v1/nutrition/foods?q=McDonalds");
  assert.equal(menu.data.foods.length, 26);
  assert.ok(
    menu.data.foods.every((food) => food.source !== "USDA FoodData Central"),
  );
  const bigMac = (await alice.request("/api/v1/nutrition/foods?q=Big%20Mac"))
    .data.foods;
  assert.equal(bigMac.filter((food) => /mcdo/i.test(food.name)).length, 1);
  const missing = await bob.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "036000291452",
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.data.barcode, "0036000291452");
  assert.equal(missing.data.notFound, true);
  const upcLabel = {
    ...label,
    name: "Canonical UPC label",
    barcode: "036000291452",
  };
  const upc = await alice.request("/api/v1/nutrition/foods", "POST", upcLabel);
  const ean = await alice.request("/api/v1/nutrition/foods", "POST", {
    ...upcLabel,
    barcode: "0036000291452",
  });
  assert.equal(upc.status, 201);
  assert.equal(ean.status, 200);
  assert.equal(ean.data.food.id, upc.data.food.id);
  assert.equal(ean.data.food.barcode, "0036000291452");
  assert.equal(
    (
      await alice.request("/api/v1/nutrition/foods", "POST", {
        ...label,
        fatG: -1,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await alice.request("/api/v1/nutrition/foods", "POST", {
        ...label,
        caloriesKcal: 5001,
      })
    ).status,
    422,
  );
  const serving = await alice.request("/api/v1/nutrition/entries", "POST", {
    foodId: own.data.food.id,
    amountServings: 0.5,
    localDate: "2026-11-13",
    mealType: "Snack",
    requestKey: "label-half-serving-001",
  });
  assert.equal(serving.status, 201);
  assert.equal(serving.data.entry.caloriesKcal, 160);
  const before = (
    await database
      .prepare(
        "SELECT COUNT(*) AS count FROM nutrition_foods WHERE owner_user_id IS NULL AND archived_at IS NULL",
      )
      .get()
  ).count;
  await seedPhFoods(database);
  await seedPhFoods(database);
  const after = (
    await database
      .prepare(
        "SELECT COUNT(*) AS count FROM nutrition_foods WHERE owner_user_id IS NULL AND archived_at IS NULL",
      )
      .get()
  ).count;
  assert.equal(after, before);
  const burgers = await alice.request(
    "/api/v1/nutrition/foods?q=Burger%20McDo",
  );
  assert.equal(
    burgers.data.foods.filter((f) => f.name.endsWith("Burger McDo")).length,
    1,
  );
  assert.equal(
    burgers.data.foods.find((f) => f.name.endsWith("Burger McDo")).id,
    legacy.lastInsertRowid,
  );
  const history = await alice.request(
    "/api/v1/nutrition/entries?date=2026-11-12",
  );
  assert.equal(history.data.entries[0].caloriesKcal, 257);
  assert.equal(history.data.entries[0].foodName, "Old Burger McDo");
  const yum = (await alice.request("/api/v1/nutrition/foods?q=Yumburger")).data
    .foods[0];
  assert.equal(yum.basis, "per_serving");
  assert.equal(yum.nutrients.proteinG, null);
  const logged = await alice.request("/api/v1/nutrition/entries", "POST", {
    foodId: yum.id,
    amountServings: 1,
    localDate: "2026-11-14",
    mealType: "Lunch",
    requestKey: "unknown-yum-macros-001",
  });
  assert.equal(logged.status, 201);
  const day = await alice.request("/api/v1/nutrition/entries?date=2026-11-14");
  assert.equal(day.data.totals.proteinG, null);
  assert.equal(day.data.totals.caloriesKcal, 280);
});
