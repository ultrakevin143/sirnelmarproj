const { openDatabase } = require("../src/database");
const { seedPhFoods } = require("../src/nutrition-seed");
(async () => {
  const database = await openDatabase();
  try {
    console.log(JSON.stringify(await seedPhFoods(database, process.argv[2])));
  } finally {
    await database.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
