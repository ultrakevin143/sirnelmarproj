ALTER TABLE workout_sessions ADD COLUMN plan_day_index INTEGER;

ALTER TABLE workout_exercises ADD COLUMN planned_exercise_id INTEGER;
ALTER TABLE workout_exercises ADD COLUMN target_muscle TEXT;
ALTER TABLE workout_exercises ADD COLUMN planned_sets INTEGER;
ALTER TABLE workout_exercises ADD COLUMN prescribed_reps INTEGER;
ALTER TABLE workout_exercises ADD COLUMN suggested_weight_kg DOUBLE PRECISION;

ALTER TABLE workout_sets ADD COLUMN is_completed SMALLINT NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1));

-- Existing set rows were all explicit user logs, so preserve their prior meaning.
UPDATE workout_sets SET is_completed = 1;

CREATE INDEX IF NOT EXISTS workout_exercises_workout_order
  ON workout_exercises (workout_id, sort_order, id);
