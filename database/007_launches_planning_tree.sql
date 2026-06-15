ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS is_initial_raw_material BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE material_inputs
  ADD COLUMN IF NOT EXISTS qty_per_output NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE import_history
  ADD COLUMN IF NOT EXISTS user_id BIGINT;

CREATE TABLE IF NOT EXISTS inventory_counts (
  id BIGSERIAL PRIMARY KEY,
  notes TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id BIGSERIAL PRIMARY KEY,
  inventory_count_id BIGINT NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  previous_qty NUMERIC NOT NULL DEFAULT 0,
  counted_qty NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_launches (
  id BIGSERIAL PRIMARY KEY,
  production_date DATE NOT NULL,
  material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  material_code TEXT,
  quantity NUMERIC NOT NULL,
  primary_unit TEXT NOT NULL DEFAULT 'un',
  secondary_qty NUMERIC NOT NULL DEFAULT 0,
  secondary_unit TEXT NOT NULL DEFAULT 'kg',
  machine_name TEXT,
  people_count INTEGER,
  planning_code TEXT,
  notes TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE production_launches
  ADD COLUMN IF NOT EXISTS input_material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_material_name TEXT,
  ADD COLUMN IF NOT EXISTS input_material_code TEXT,
  ADD COLUMN IF NOT EXISTS consumed_lot TEXT,
  ADD COLUMN IF NOT EXISTS produced_lots JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS benefit_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'launched',
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE production_plans
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC NOT NULL DEFAULT 8 CHECK (hours_per_day > 0),
  ADD COLUMN IF NOT EXISTS date_mode TEXT NOT NULL DEFAULT 'start',
  ADD COLUMN IF NOT EXISTS schedule_tree JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS user_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_plans_code_unique
  ON production_plans (code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_count_items_material_location
  ON inventory_count_items (material_id, location_id);

CREATE INDEX IF NOT EXISTS idx_production_launches_material_date
  ON production_launches (material_id, production_date);
