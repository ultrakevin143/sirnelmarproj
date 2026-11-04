-- Additive account preferences; existing plans and training records are preserved.
ALTER TABLE app_users ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE exercise_favorites (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  exercise_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, exercise_key)
);
