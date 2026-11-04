CREATE TABLE app_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  experience_level TEXT NOT NULL DEFAULT 'beginner',
  created_at TEXT NOT NULL
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);

-- NULL ownership preserves pre-account data without assigning it to a stranger.
ALTER TABLE workout_plans ADD COLUMN user_id INTEGER REFERENCES app_users(id);
ALTER TABLE workout_sessions ADD COLUMN user_id INTEGER REFERENCES app_users(id);
ALTER TABLE custom_exercises ADD COLUMN user_id INTEGER REFERENCES app_users(id);
ALTER TABLE plan_templates ADD COLUMN user_id INTEGER REFERENCES app_users(id);

DROP INDEX IF EXISTS one_active_workout;
CREATE UNIQUE INDEX one_active_workout_per_user ON workout_sessions(user_id)
  WHERE completed_at IS NULL AND abandoned_at IS NULL;
DROP INDEX IF EXISTS custom_exercises_active_name;
CREATE UNIQUE INDEX custom_exercises_active_name ON custom_exercises(user_id, LOWER(name))
  WHERE archived_at IS NULL;
DROP INDEX IF EXISTS plan_templates_name_unique;
CREATE UNIQUE INDEX plan_templates_name_unique ON plan_templates(user_id, LOWER(name));
CREATE INDEX workout_sessions_owner ON workout_sessions(user_id, started_at);
CREATE INDEX workout_plans_owner ON workout_plans(user_id);
