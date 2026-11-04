-- Named weekly plan templates (JSON snapshot of export format version 1 plan payload).
CREATE TABLE IF NOT EXISTS plan_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_templates_name_unique
  ON plan_templates (LOWER(name));
