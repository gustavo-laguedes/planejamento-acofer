ALTER TABLE productivity_matrix
  ADD COLUMN IF NOT EXISTS material_id BIGINT REFERENCES materials(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN IF NOT EXISTS revision_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_created_by TEXT;

UPDATE productivity_matrix pm
SET material_id = (
  SELECT m.id
  FROM materials m
  WHERE m.active = true
    AND (
      LOWER(TRIM(m.name)) = LOWER(TRIM(pm.material_name))
      OR (
        pm.material_code IS NOT NULL
        AND pm.material_code = ANY(COALESCE(m.codes, ARRAY[]::text[]))
      )
      OR COALESCE(pm.material_codes, ARRAY[]::text[])
         && COALESCE(m.codes, ARRAY[]::text[])
    )
  ORDER BY
    CASE
      WHEN LOWER(TRIM(m.name)) = LOWER(TRIM(pm.material_name))
      THEN 0
      ELSE 1
    END,
    m.id
  LIMIT 1
)
WHERE pm.material_id IS NULL;

UPDATE productivity_matrix
SET revision_created_at =
  COALESCE(
    revision_created_at,
    created_at,
    updated_at,
    now()
  )
WHERE revision_created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_productivity_matrix_material_revision
  ON productivity_matrix (
    material_id,
    revision,
    machine_priority,
    machine_name
  );

DROP VIEW IF EXISTS productivity_matrix_current;

CREATE VIEW productivity_matrix_current AS
SELECT pm.*
FROM productivity_matrix pm
WHERE pm.active = true
  AND (
    pm.material_id IS NULL
    OR pm.revision = (
      SELECT MAX(current_pm.revision)
      FROM productivity_matrix current_pm
      WHERE current_pm.material_id = pm.material_id
        AND current_pm.active = true
    )
  );

ALTER TABLE production_plans
  ADD COLUMN IF NOT EXISTS productivity_matrix_snapshot
  JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE production_plans
SET productivity_matrix_snapshot =
  COALESCE(
    (
      SELECT jsonb_agg(
        to_jsonb(pm)
        ORDER BY
          pm.material_name,
          pm.machine_priority,
          pm.machine_name,
          pm.people_count
      )
      FROM productivity_matrix_current pm
    ),
    '[]'::jsonb
  )
WHERE productivity_matrix_snapshot IS NULL
   OR productivity_matrix_snapshot = '[]'::jsonb;
