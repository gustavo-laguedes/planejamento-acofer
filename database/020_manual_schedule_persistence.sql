ALTER TABLE production_plans
  ADD COLUMN IF NOT EXISTS manual_schedule_draft JSONB,
  ADD COLUMN IF NOT EXISTS manual_schedule_version INTEGER,
  ADD COLUMN IF NOT EXISTS manual_schedule_base_hash TEXT,
  ADD COLUMN IF NOT EXISTS manual_schedule_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_schedule_validation_version TEXT,
  ADD COLUMN IF NOT EXISTS manual_schedule_validation_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS manual_schedule_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_schedule_is_dirty BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_schedule_revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE production_plan_days
  ADD COLUMN IF NOT EXISTS allocation_id TEXT,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_plan_days_plan_allocation_unique
  ON production_plan_days (plan_id, allocation_id)
  WHERE allocation_id IS NOT NULL;

