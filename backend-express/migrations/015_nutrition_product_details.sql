ALTER TABLE nutrition_foods ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE nutrition_foods ADD COLUMN barcode TEXT;
ALTER TABLE nutrition_foods ADD COLUMN canonical_key TEXT;
ALTER TABLE nutrition_foods ADD COLUMN archived_at TEXT;
ALTER TABLE nutrition_foods ADD COLUMN identity_scope INTEGER NOT NULL DEFAULT 0;
UPDATE nutrition_foods SET identity_scope = owner_user_id WHERE owner_user_id IS NOT NULL;
ALTER TABLE nutrition_foods ADD CONSTRAINT nutrition_foods_scope_matches_owner CHECK ((owner_user_id IS NULL AND identity_scope = 0) OR (owner_user_id IS NOT NULL AND identity_scope = owner_user_id));
CREATE UNIQUE INDEX nutrition_foods_scope_barcode ON nutrition_foods(identity_scope, barcode);
CREATE UNIQUE INDEX nutrition_foods_scope_canonical ON nutrition_foods(identity_scope, canonical_key);
ALTER TABLE nutrition_entries ALTER COLUMN protein_g DROP NOT NULL;
ALTER TABLE nutrition_entries ALTER COLUMN carbohydrate_g DROP NOT NULL;
ALTER TABLE nutrition_entries ALTER COLUMN fat_g DROP NOT NULL;
ALTER TABLE nutrition_entries ADD COLUMN amount_servings DOUBLE PRECISION;
ALTER TABLE nutrition_entries ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE nutrition_seed_releases (
  seed_hash TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
