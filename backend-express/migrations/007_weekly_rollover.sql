ALTER TABLE workout_sessions ADD COLUMN abandoned_at TEXT;

DROP INDEX IF EXISTS one_active_workout;
CREATE UNIQUE INDEX one_active_workout
  ON workout_sessions ((completed_at IS NULL))
  WHERE completed_at IS NULL AND abandoned_at IS NULL;
