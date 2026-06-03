CREATE INDEX IF NOT EXISTS idx_stock_snapshot_product_code ON stock_snapshot (product_code);
CREATE INDEX IF NOT EXISTS idx_stock_snapshot_establishment ON stock_snapshot (establishment);
CREATE INDEX IF NOT EXISTS idx_stock_snapshot_import_id ON stock_snapshot (import_id);
CREATE INDEX IF NOT EXISTS idx_stock_snapshot_specification ON stock_snapshot USING gin (to_tsvector('portuguese', COALESCE(specification, '')));
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_establishment ON stock_adjustments (product_code, establishment);

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_code_unique ON locations (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_code ON locations (code);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations (name);
CREATE INDEX IF NOT EXISTS idx_machines_name ON machines (name);
CREATE INDEX IF NOT EXISTS idx_machines_location_id ON machines (location_id);
CREATE INDEX IF NOT EXISTS idx_materials_name ON materials (name);
CREATE INDEX IF NOT EXISTS idx_materials_codes ON materials USING gin (codes);
CREATE INDEX IF NOT EXISTS idx_material_inputs_material_id ON material_inputs (material_id);
CREATE INDEX IF NOT EXISTS idx_material_inputs_input_material_id ON material_inputs (input_material_id);

CREATE INDEX IF NOT EXISTS idx_productivity_matrix_material_name ON productivity_matrix (material_name);
CREATE INDEX IF NOT EXISTS idx_productivity_matrix_material_code ON productivity_matrix (material_code);
CREATE INDEX IF NOT EXISTS idx_productivity_matrix_material_codes ON productivity_matrix USING gin (material_codes);
CREATE INDEX IF NOT EXISTS idx_productivity_matrix_machine_people ON productivity_matrix (machine_name, people_count);

CREATE INDEX IF NOT EXISTS idx_production_plans_material_name ON production_plans (material_name);
CREATE INDEX IF NOT EXISTS idx_production_plan_days_planned_date ON production_plan_days (planned_date);
CREATE INDEX IF NOT EXISTS idx_production_plan_days_plan_id ON production_plan_days (plan_id);
CREATE INDEX IF NOT EXISTS idx_production_actuals_production_date ON production_actuals (production_date);
CREATE INDEX IF NOT EXISTS idx_production_actuals_material_name ON production_actuals (material_name);
