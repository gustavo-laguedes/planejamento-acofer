CREATE TABLE IF NOT EXISTS stock_location_adjustments (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  adjustment_qty NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_location_adjustments_unique UNIQUE (material_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_location_adjustments_material_id
  ON stock_location_adjustments (material_id);

CREATE INDEX IF NOT EXISTS idx_stock_location_adjustments_location_id
  ON stock_location_adjustments (location_id);
