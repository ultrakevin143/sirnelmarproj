const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/server");

async function fixture(t, appOptions = {}) {
  const service = await createApp({ memory: true, ...appOptions });
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
        food.source === "LiftUp PH Menu Estimates" &&
        food.name.includes("Chicken McDo, 1 pc with rice"),
    ),
  );
  const jollibee = await alice.request("/api/v1/nutrition/foods?q=Jollibee");
  assert.ok(jollibee.data.foods.some((food) => food.name.includes("Chickenjoy")));
  const mangInasal = await alice.request("/api/v1/nutrition/foods?q=Mang%20Inasal");
  assert.ok(mangInasal.data.foods.some((food) => food.name.includes("Chicken Inasal Paa")));
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
    assert.match(new URL(url).pathname, /\/api\/v3\/product\/1234567890123$/);
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
    barcode: "1234567890123",
  });
  assert.equal(scanned.status, 201);
  assert.equal(scanned.data.food.source, "Open Food Facts");
  assert.equal(scanned.data.food.name, "Test oat bar");
  assert.equal(scanned.data.food.portions[0].grams, 35);
  const cached = await alice.request("/api/v1/nutrition/barcode", "POST", {
    barcode: "1234567890123",
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
