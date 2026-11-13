CREATE TABLE nutrition_entry_photos (
  entry_id INTEGER PRIMARY KEY REFERENCES nutrition_entries(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
  image_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX nutrition_entry_photos_owner ON nutrition_entry_photos(user_id, entry_id);
