CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE,
  clerk_invitation_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Super Admin', 'PCP', 'Gerente', 'Diretor', 'Operador', 'Visualizador')),
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  is_initial_super_admin BOOLEAN NOT NULL DEFAULT false,
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_initial_super_admin_unique
  ON app_users (is_initial_super_admin)
  WHERE is_initial_super_admin = true;

CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users (role);
CREATE INDEX IF NOT EXISTS app_users_status_idx ON app_users (status);
