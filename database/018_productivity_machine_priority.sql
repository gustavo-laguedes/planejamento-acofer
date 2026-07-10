ALTER TABLE productivity_matrix
  ADD COLUMN IF NOT EXISTS machine_priority INTEGER NOT NULL DEFAULT 1 CHECK (machine_priority > 0);

CREATE INDEX IF NOT EXISTS idx_productivity_matrix_priority
  ON productivity_matrix (material_name, machine_priority, machine_name);
