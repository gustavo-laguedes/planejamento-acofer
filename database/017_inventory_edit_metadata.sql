ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS edited_by_user_name TEXT;
