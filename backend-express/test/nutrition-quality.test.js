const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBarcode,
  atwaterCheck,
  parseCsv,
} = require("../src/nutrition-quality");
const { readSeed } = require("../src/nutrition-seed");

test("EAN/UPC check digits and canonical barcode aliases", () => {
  assert.equal(normalizeBarcode("4807770273698"), "4807770273698");
  assert.equal(normalizeBarcode("4807770273699"), null);
  assert.equal(normalizeBarcode("036000291452"), "0036000291452");
  assert.equal(normalizeBarcode("0036000291452"), "0036000291452");
  assert.equal(normalizeBarcode("04252614", "UPC_E"), "0042100005264");
  assert.equal(normalizeBarcode("96385074"), "96385074");
  assert.equal(normalizeBarcode("abc"), null);
});

test("calorie sanity checks preserve unknowns and flag inconsistent macros", () => {
  assert.equal(
    atwaterCheck({
      caloriesKcal: 354,
      proteinG: 13,
      carbohydrateG: 43,
      fatG: 14,
    }).needsReview,
    false,
  );
  assert.equal(
    atwaterCheck({ caloriesKcal: 135, proteinG: 1, carbohydrateG: 10, fatG: 8 })
      .needsReview,
    true,
  );
  assert.equal(
    atwaterCheck({
      caloriesKcal: 280,
      proteinG: null,
      carbohydrateG: null,
      fatG: null,
    }).needsReview,
    true,
  );
  assert.equal(
    atwaterCheck({ caloriesKcal: -1, proteinG: 0, carbohydrateG: 0, fatG: 0 })
      .needsReview,
    true,
  );
  assert.equal(
    atwaterCheck({ caloriesKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 })
      .needsReview,
    false,
  );
});

test("PH CSV import has unique item identities and keeps missing macros unknown", () => {
  const rows = readSeed();
  assert.equal(rows.length, 34);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
  assert.equal(
    rows.find((row) => row.row.name === "Yumburger").nutrients.proteinG,
    null,
  );
  assert.equal(
    rows.find((row) => row.row.name === "Burger McDo").metadata.confidence,
    "official",
  );
  assert.equal(
    rows.find((row) => row.row.name === "Hash Browns").metadata.confidence,
    "estimate",
  );
  assert.deepEqual(parseCsv('a,b\n"Rice, raw",\n'), [
    { a: "Rice, raw", b: "" },
  ]);
});
