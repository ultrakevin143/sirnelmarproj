-- Stores only reviewed rep counts and retry keys, never images or pose/video data.
CREATE TABLE camera_set_imports (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  workout_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  set_id INTEGER REFERENCES workout_sets(id) ON DELETE SET NULL,
  reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, request_key)
);
