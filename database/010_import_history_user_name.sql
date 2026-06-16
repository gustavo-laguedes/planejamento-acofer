ALTER TABLE import_history
  ADD COLUMN IF NOT EXISTS user_name TEXT;
