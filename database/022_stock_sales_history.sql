CREATE TABLE IF NOT EXISTS stock_import_sales_history (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES import_history(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  sales_qty NUMERIC NOT NULL DEFAULT 0,
  product_codes TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_import_sales_history_unique UNIQUE (import_id, material_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_import_sales_history_import_id
  ON stock_import_sales_history (import_id);

CREATE INDEX IF NOT EXISTS idx_stock_import_sales_history_material_location
  ON stock_import_sales_history (material_id, location_id);

CREATE INDEX IF NOT EXISTS idx_stock_import_sales_history_period
  ON stock_import_sales_history (period_start, period_end);
