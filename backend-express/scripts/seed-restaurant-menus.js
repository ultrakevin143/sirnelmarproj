const { openDatabase, PostgresDatabase } = require("../src/database");
const { Pool } = require("pg");
const { seedRestaurantMenus } = require("../src/nutrition-menu-catalog");

(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const database = dryRun
    ? new PostgresDatabase(
        new Pool({
          connectionString: process.env.DATABASE_URL,
          options: "-c default_transaction_read_only=on",
        }),
        { schema: process.env.DATABASE_SCHEMA || "public" },
      )
    : await openDatabase();
  try {
    const report = await seedRestaurantMenus(database, { dryRun });
    const duplicates = dryRun
      ? []
      : await database
          .prepare(
            "SELECT canonical_key, COUNT(*) AS count FROM nutrition_menu_items GROUP BY canonical_key HAVING COUNT(*) > 1",
          )
          .all();
    if (duplicates.length)
      throw new Error("Duplicate restaurant menu identities found.");
    console.log(
      JSON.stringify({
        dryRun,
        ...report,
        duplicateIdentities: dryRun ? undefined : duplicates.length,
      }),
    );
  } finally {
    await database.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
