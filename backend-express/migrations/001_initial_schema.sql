CREATE TABLE IF NOT EXISTS workout_sessions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_workout
  ON workout_sessions ((completed_at IS NULL)) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS workout_exercises (
  id SERIAL PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  exercise_slug TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id SERIAL PRIMARY KEY,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  weight_kg DOUBLE PRECISION,
  reps INTEGER,
  duration_seconds INTEGER,
  distance_meters DOUBLE PRECISION,
  logged_at TEXT NOT NULL
);
