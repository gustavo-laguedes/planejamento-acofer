CREATE TABLE IF NOT EXISTS quality_norms (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_norms_name_unique
  ON quality_norms (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_quality_norms_active_name
  ON quality_norms (active, name);

CREATE TABLE IF NOT EXISTS quality_norm_materials (
  id BIGSERIAL PRIMARY KEY,
  norm_id BIGINT NOT NULL REFERENCES quality_norms(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  nominal_weight_per_meter NUMERIC(18,6) NOT NULL CHECK (nominal_weight_per_meter > 0),
  minimum_weight_per_meter NUMERIC(18,6) NOT NULL CHECK (minimum_weight_per_meter > 0),
  maximum_weight_per_meter NUMERIC(18,6) NOT NULL CHECK (maximum_weight_per_meter > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quality_norm_materials_unique UNIQUE (norm_id, material_id),
  CONSTRAINT quality_norm_materials_weight_range CHECK (
    minimum_weight_per_meter <= nominal_weight_per_meter
    AND nominal_weight_per_meter <= maximum_weight_per_meter
  )
);

CREATE INDEX IF NOT EXISTS idx_quality_norm_materials_norm
  ON quality_norm_materials (norm_id);

CREATE INDEX IF NOT EXISTS idx_quality_norm_materials_material
  ON quality_norm_materials (material_id);
