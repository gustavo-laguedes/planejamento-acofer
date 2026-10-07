ALTER TABLE stock_snapshot
  ADD COLUMN IF NOT EXISTS future_sales_pending_unit NUMERIC;


CREATE TABLE IF NOT EXISTS stock_location_corrections (
  id BIGSERIAL PRIMARY KEY,

  material_id BIGINT NOT NULL
    REFERENCES materials(id)
    ON DELETE CASCADE,

  location_id BIGINT NOT NULL
    REFERENCES locations(id)
    ON DELETE CASCADE,

  correction_qty NUMERIC NOT NULL DEFAULT 0,

  notes TEXT,

  updated_by_user_id BIGINT,

  updated_by_user_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT stock_location_corrections_unique
    UNIQUE (material_id, location_id)
);


CREATE INDEX IF NOT EXISTS idx_stock_location_corrections_material_id
  ON stock_location_corrections (material_id);


CREATE INDEX IF NOT EXISTS idx_stock_location_corrections_location_id
  ON stock_location_corrections (location_id);