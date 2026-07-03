ALTER TABLE import_history
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS business_days INTEGER;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS active_browser_session_id TEXT,
  ADD COLUMN IF NOT EXISTS active_session_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_session_last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_app_users_active_browser_session
  ON app_users (active_browser_session_id)
  WHERE active_browser_session_id IS NOT NULL;
