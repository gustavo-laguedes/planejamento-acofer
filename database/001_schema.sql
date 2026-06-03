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

CREATE TABLE IF NOT EXISTS productivity_matrix (
  id BIGSERIAL PRIMARY KEY,
  material_name TEXT NOT NULL,
  material_code TEXT,
  machine_name TEXT NOT NULL,
  people_count INTEGER NOT NULL CHECK (people_count > 0),
  output_qty NUMERIC NOT NULL CHECK (output_qty > 0),
  output_unit TEXT NOT NULL DEFAULT 'un',
  time_minutes NUMERIC NOT NULL CHECK (time_minutes > 0),
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
