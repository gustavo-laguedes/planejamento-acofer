CREATE TABLE IF NOT EXISTS stock_transport_records (
  id BIGSERIAL PRIMARY KEY,
  transport_date DATE NOT NULL,
  material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  origin_location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  destination_location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  invoice_number TEXT,
  notes TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_purchase_records (
  id BIGSERIAL PRIMARY KEY,
  purchase_date DATE NOT NULL,
  material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  invoice_number TEXT,
  notes TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transport_records_date
  ON stock_transport_records (transport_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transport_records_material
  ON stock_transport_records (material_id);

CREATE INDEX IF NOT EXISTS idx_material_purchase_records_date
  ON material_purchase_records (purchase_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_purchase_records_material
  ON material_purchase_records (material_id);
