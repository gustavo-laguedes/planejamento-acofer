CREATE TABLE IF NOT EXISTS material_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  requires_length BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO material_types (
  name,
  requires_length,
  active
)
VALUES
  ('Fio Máquina', false, true),
  ('Bobina', false, true),
  ('Vareta', true, true),
  ('Barra', true, true),
  ('Malha', false, true)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS material_type_id
    BIGINT REFERENCES material_types(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS length_m
    NUMERIC(12,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'materials_length_m_positive'
      AND conrelid = 'materials'::regclass
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT materials_length_m_positive
      CHECK (
        length_m IS NULL
        OR length_m > 0
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_materials_material_type_id
  ON materials (material_type_id);

CREATE INDEX IF NOT EXISTS idx_material_types_active_name
  ON material_types (active, name);
