CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations (name);
CREATE INDEX IF NOT EXISTS idx_machines_name ON machines (name);
CREATE INDEX IF NOT EXISTS idx_machines_location_id ON machines (location_id);
CREATE INDEX IF NOT EXISTS idx_materials_name ON materials (name);
CREATE INDEX IF NOT EXISTS idx_materials_codes ON materials USING gin (codes);
CREATE INDEX IF NOT EXISTS idx_material_inputs_material_id ON material_inputs (material_id);
CREATE INDEX IF NOT EXISTS idx_material_inputs_input_material_id ON material_inputs (input_material_id);
