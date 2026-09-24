CREATE TABLE IF NOT EXISTS purchase_records (
  id BIGSERIAL PRIMARY KEY,
  purchase_date DATE NOT NULL,
  supplier TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  certificate_number TEXT NOT NULL,
  invoice_total_weight_kg NUMERIC NOT NULL CHECK (invoice_total_weight_kg > 0),
  notes TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES purchase_records(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  stock_quantity NUMERIC NOT NULL CHECK (stock_quantity > 0),
  primary_unit TEXT NOT NULL,
  total_weight_kg NUMERIC NOT NULL CHECK (total_weight_kg > 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_lots (
  id BIGSERIAL PRIMARY KEY,
  purchase_item_id BIGINT NOT NULL REFERENCES purchase_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  weight_kg NUMERIC NOT NULL CHECK (weight_kg > 0),
  heat_number TEXT NOT NULL,
  tensile_strength_mpa NUMERIC NOT NULL CHECK (tensile_strength_mpa > 0),
  steel_grade TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_records_date
  ON purchase_records (purchase_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_records_supplier
  ON purchase_records (supplier);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
  ON purchase_items (purchase_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_material_location
  ON purchase_items (material_id, location_id);

CREATE INDEX IF NOT EXISTS idx_purchase_lots_item
  ON purchase_lots (purchase_item_id, sort_order, id);