CREATE TABLE IF NOT EXISTS import_history (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT,
  total_rows INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processing', 'success', 'error')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_snapshot (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT REFERENCES import_history(id) ON DELETE SET NULL,
  establishment TEXT,
  product_code TEXT,
  old_product_code TEXT,
  specification TEXT,
  unit TEXT,
  category TEXT,
  inventory_group TEXT,
  controls_weight BOOLEAN DEFAULT false,
  theoretical_weight NUMERIC,
  fiscal_balance_unit NUMERIC,
  fiscal_balance_kg_float NUMERIC,
  fiscal_balance_kg_theoretical NUMERIC,
  error_balance_unit NUMERIC,
  error_balance_kg_float NUMERIC,
  error_balance_kg_theoretical NUMERIC,
  orders_unit NUMERIC,
  orders_kg_theoretical NUMERIC,
  sales_unit NUMERIC,
  sales_kg_theoretical NUMERIC,
  purchase_orders_unit NUMERIC,
  purchase_orders_kg_theoretical NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id BIGSERIAL PRIMARY KEY,
  product_code TEXT NOT NULL,
  establishment TEXT NOT NULL,
  adjustment_unit_qty NUMERIC DEFAULT 0,
  adjustment_kg_qty NUMERIC DEFAULT 0,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machines (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location_id BIGINT NOT NULL REFERENCES locations(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS materials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  primary_unit TEXT NOT NULL CHECK (primary_unit IN ('un', 'kg')),
  secondary_unit TEXT NOT NULL CHECK (secondary_unit IN ('un', 'kg')),
  primary_to_secondary_factor NUMERIC NOT NULL CHECK (primary_to_secondary_factor > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_inputs (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  input_material_id BIGINT NOT NULL REFERENCES materials(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT material_inputs_not_self CHECK (material_id <> input_material_id),
  CONSTRAINT material_inputs_unique UNIQUE (material_id, input_material_id)
);

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

CREATE TABLE IF NOT EXISTS productivity_matrix (
  id BIGSERIAL PRIMARY KEY,
  material_name TEXT NOT NULL,
  material_code TEXT,
  material_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  machine_name TEXT NOT NULL,
  people_count INTEGER NOT NULL CHECK (people_count > 0),
  output_qty NUMERIC NOT NULL CHECK (output_qty > 0),
  output_unit TEXT NOT NULL DEFAULT 'un',
  time_minutes NUMERIC NOT NULL CHECK (time_minutes > 0),
  time_seconds NUMERIC CHECK (time_seconds > 0),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_plans (
  id BIGSERIAL PRIMARY KEY,
  material_name TEXT NOT NULL,
  material_code TEXT,
  machine_name TEXT NOT NULL,
  people_count INTEGER NOT NULL,
  planned_qty NUMERIC NOT NULL,
  planned_unit TEXT NOT NULL DEFAULT 'un',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_plan_days (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT REFERENCES production_plans(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  material_name TEXT NOT NULL,
  material_code TEXT,
  machine_name TEXT NOT NULL,
  people_count INTEGER NOT NULL,
  planned_qty NUMERIC NOT NULL,
  planned_unit TEXT NOT NULL DEFAULT 'un'
);

CREATE TABLE IF NOT EXISTS production_actuals (
  id BIGSERIAL PRIMARY KEY,
  production_date DATE NOT NULL,
  material_name TEXT NOT NULL,
  material_code TEXT,
  machine_name TEXT,
  actual_qty NUMERIC NOT NULL,
  actual_unit TEXT NOT NULL DEFAULT 'un',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
