ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS permits_sales BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS stock_material_corrections (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  correction_qty NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_material_corrections_unique UNIQUE (material_id)
);

CREATE TABLE IF NOT EXISTS stock_import_material_balances (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES import_history(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  total_locations_qty NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_import_material_balances_unique UNIQUE (import_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_import_material_balances_import_id
  ON stock_import_material_balances (import_id);

CREATE INDEX IF NOT EXISTS idx_stock_import_material_balances_material_id
  ON stock_import_material_balances (material_id);
