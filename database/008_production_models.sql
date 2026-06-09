ALTER TABLE material_inputs
  ADD COLUMN IF NOT EXISTS production_model_name TEXT NOT NULL DEFAULT 'Modelo padrão';

ALTER TABLE material_inputs
  DROP CONSTRAINT IF EXISTS material_inputs_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_inputs_model_unique
  ON material_inputs (material_id, production_model_name, input_material_id);
