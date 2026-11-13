CREATE TABLE nutrition_foods (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id TEXT,
  source_release TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  calories_kcal DOUBLE PRECISION,
  protein_g DOUBLE PRECISION,
  carbohydrate_g DOUBLE PRECISION,
  fat_g DOUBLE PRECISION,
  fiber_g DOUBLE PRECISION,
  portions_json TEXT NOT NULL DEFAULT '[]',
  components_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX nutrition_foods_catalog_source_id
  ON nutrition_foods(source, source_id)
  WHERE owner_user_id IS NULL AND source_id IS NOT NULL;
CREATE INDEX nutrition_foods_catalog_name ON nutrition_foods(LOWER(name));
CREATE INDEX nutrition_foods_owner_name ON nutrition_foods(owner_user_id, LOWER(name));

CREATE TABLE nutrition_goals (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  calories_kcal DOUBLE PRECISION,
  protein_g DOUBLE PRECISION,
  carbohydrate_g DOUBLE PRECISION,
  fat_g DOUBLE PRECISION,
  fiber_g DOUBLE PRECISION,
  water_ml DOUBLE PRECISION,
  updated_at TEXT NOT NULL
);

CREATE TABLE nutrition_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  food_id INTEGER REFERENCES nutrition_foods(id) ON DELETE SET NULL,
  food_name TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  source_release TEXT NOT NULL,
  local_date TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  amount_grams DOUBLE PRECISION NOT NULL,
  calories_kcal DOUBLE PRECISION NOT NULL,
  protein_g DOUBLE PRECISION NOT NULL,
  carbohydrate_g DOUBLE PRECISION NOT NULL,
  fat_g DOUBLE PRECISION NOT NULL,
  fiber_g DOUBLE PRECISION,
  request_key TEXT NOT NULL,
  UNIQUE (user_id, request_key)
);
CREATE INDEX nutrition_entries_owner_date
  ON nutrition_entries(user_id, local_date, logged_at);

CREATE TABLE nutrition_water_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  amount_ml DOUBLE PRECISION NOT NULL,
  logged_at TEXT NOT NULL,
  request_key TEXT NOT NULL,
  UNIQUE (user_id, request_key)
);
CREATE INDEX nutrition_water_owner_date
  ON nutrition_water_entries(user_id, local_date, logged_at);
