CREATE TABLE nutrition_menu_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  market TEXT NOT NULL,
  source_url TEXT,
  content_sha256 TEXT,
  published_on TEXT,
  retrieved_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE nutrition_menu_items (
  id SERIAL PRIMARY KEY,
  canonical_key TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('PH', 'US')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  food_id INTEGER REFERENCES nutrition_foods(id) ON DELETE SET NULL,
  primary_source_id TEXT NOT NULL REFERENCES nutrition_menu_sources(id),
  basis TEXT NOT NULL CHECK (basis IN ('per_serving', 'per_100g')),
  serving_label TEXT NOT NULL,
  serving_grams DOUBLE PRECISION CHECK (serving_grams > 0),
  serving_ml DOUBLE PRECISION CHECK (serving_ml > 0),
  calories_kcal DOUBLE PRECISION NOT NULL CHECK (calories_kcal >= 0),
  protein_g DOUBLE PRECISION CHECK (protein_g >= 0),
  carbohydrate_g DOUBLE PRECISION CHECK (carbohydrate_g >= 0),
  fat_g DOUBLE PRECISION CHECK (fat_g >= 0),
  fiber_g DOUBLE PRECISION CHECK (fiber_g >= 0),
  sugar_g DOUBLE PRECISION CHECK (sugar_g >= 0),
  sodium_mg DOUBLE PRECISION CHECK (sodium_mg >= 0),
  saturated_fat_g DOUBLE PRECISION CHECK (saturated_fat_g >= 0),
  trans_fat_g DOUBLE PRECISION CHECK (trans_fat_g >= 0),
  cholesterol_mg DOUBLE PRECISION CHECK (cholesterol_mg >= 0),
  nutrient_bounds_json TEXT NOT NULL DEFAULT '{}',
  image_json TEXT NOT NULL,
  confidence TEXT NOT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  quality_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX nutrition_menu_items_market_brand ON nutrition_menu_items(market, brand, category, id);
CREATE INDEX nutrition_menu_items_name ON nutrition_menu_items(LOWER(name));

CREATE TABLE nutrition_menu_observations (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES nutrition_menu_items(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES nutrition_menu_sources(id),
  source_item_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_page INTEGER,
  nutrients_json TEXT NOT NULL,
  serving_json TEXT NOT NULL,
  image_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (source_id, source_item_key)
);
