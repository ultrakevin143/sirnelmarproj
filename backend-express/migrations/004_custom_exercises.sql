CREATE TABLE custom_exercises (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  primary_muscle TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT 'Other',
  exercise_type TEXT NOT NULL DEFAULT 'weight_reps',
  secondary_muscles TEXT NOT NULL DEFAULT '[]',
  cues TEXT NOT NULL DEFAULT '',
  image_data BYTEA,
  image_mime TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX custom_exercises_active_name
  ON custom_exercises (LOWER(name)) WHERE archived_at IS NULL;

ALTER TABLE planned_exercises ADD COLUMN custom_exercise_id INTEGER REFERENCES custom_exercises(id) ON DELETE SET NULL;
ALTER TABLE workout_exercises ADD COLUMN custom_exercise_id INTEGER REFERENCES custom_exercises(id) ON DELETE SET NULL;
