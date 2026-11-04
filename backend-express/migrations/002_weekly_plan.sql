CREATE TABLE IF NOT EXISTS workout_plans (
  id SERIAL PRIMARY KEY,
  plan_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_days (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  day_name TEXT NOT NULL,
  short_day TEXT NOT NULL,
  title TEXT NOT NULL,
  focus TEXT NOT NULL,
  is_rest_day SMALLINT NOT NULL DEFAULT 0 CHECK (is_rest_day IN (0, 1)),
  UNIQUE (plan_id, day_index)
);

CREATE TABLE IF NOT EXISTS planned_exercises (
  id SERIAL PRIMARY KEY,
  plan_day_id INTEGER NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
  catalog_exercise_id TEXT,
  exercise_slug TEXT,
  exercise_name TEXT NOT NULL,
  target_muscle TEXT NOT NULL,
  prescribed_sets INTEGER NOT NULL CHECK (prescribed_sets BETWEEN 1 AND 20),
  prescribed_reps INTEGER NOT NULL CHECK (prescribed_reps BETWEEN 1 AND 1000),
  suggested_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (suggested_weight_kg BETWEEN 0 AND 1000),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS planned_exercises_day_order
  ON planned_exercises (plan_day_id, sort_order, id);
