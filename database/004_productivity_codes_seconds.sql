ALTER TABLE productivity_matrix
  ADD COLUMN IF NOT EXISTS material_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE productivity_matrix
  ADD COLUMN IF NOT EXISTS time_seconds NUMERIC CHECK (time_seconds > 0);

UPDATE productivity_matrix
SET material_codes = ARRAY[material_code]
WHERE material_code IS NOT NULL
  AND material_code <> ''
  AND cardinality(material_codes) = 0;

UPDATE productivity_matrix
SET time_seconds = time_minutes * 60
WHERE time_seconds IS NULL
  AND time_minutes IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_productivity_matrix_material_codes ON productivity_matrix USING gin (material_codes);
