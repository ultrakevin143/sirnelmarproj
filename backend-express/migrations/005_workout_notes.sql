ALTER TABLE workout_sessions ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS workout_sets_completed_lookup
  ON workout_sets (is_completed, logged_at, workout_exercise_id);
