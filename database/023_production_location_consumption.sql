ALTER TABLE production_launches
  ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name TEXT;


UPDATE production_launches p
SET location_id = (
  SELECT m.location_id
  FROM machines m
  WHERE LOWER(TRIM(m.name)) = LOWER(TRIM(p.machine_name))
  ORDER BY m.active DESC, m.id
  LIMIT 1
)
WHERE p.location_id IS NULL
  AND NULLIF(TRIM(p.machine_name), '') IS NOT NULL;


UPDATE production_launches p
SET location_name = l.name
FROM locations l
WHERE p.location_id = l.id
  AND NULLIF(TRIM(p.location_name), '') IS NULL;


CREATE INDEX IF NOT EXISTS idx_production_launches_location_date
  ON production_launches (location_id, production_date);