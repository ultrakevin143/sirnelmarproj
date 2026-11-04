-- Warm-up vs working sets. Existing rows default to working (primary for volume/PRs).
ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS set_type TEXT NOT NULL DEFAULT 'working'
  CHECK (set_type IN ('warmup', 'working'));

CREATE INDEX IF NOT EXISTS workout_sets_type_idx
  ON workout_sets (set_type)
  WHERE is_completed = 1;
