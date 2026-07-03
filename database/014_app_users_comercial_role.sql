ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('Super Admin', 'PCP', 'Gerente', 'Diretor', 'Operador', 'Comercial', 'Visualizador'));
