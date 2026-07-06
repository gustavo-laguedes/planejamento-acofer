import 'dotenv/config';
import postgres from 'postgres';

const expectedTables = [
  'app_users',
  'audit_logs',
  'import_history',
  'locations',
  'inventory_count_items',
  'inventory_counts',
  'machines',
  'material_inputs',
  'materials',
  'production_actuals',
  'production_launches',
  'production_plan_days',
  'production_plans',
  'productivity_matrix',
  'stock_adjustments',
  'stock_location_adjustments',
  'stock_snapshot'
];

const expectedColumns = {
  app_users: ['active_browser_session_id', 'active_session_started_at', 'active_session_last_seen_at'],
  import_history: ['period_start', 'period_end', 'business_days'],
  inventory_counts: ['edited_at', 'edited_by_user_id', 'edited_by_user_name']
};

const expectedAppUserRoles = [
  'Super Admin',
  'Diretor',
  'Gerente',
  'PCP',
  'Operador',
  'Comercial',
  'Visualizador'
];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL nao configurada. Preencha .env ou defina a variavel no ambiente.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10
});

try {
  const rows = await sql.unsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const found = rows.map(row => row.table_name);
  const missing = expectedTables.filter(table => !found.includes(table));
  const columnRows = await sql.unsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('app_users', 'import_history', 'inventory_counts')
  `);
  const columnsByTable = new Map();
  for (const row of columnRows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
    columnsByTable.get(row.table_name).add(row.column_name);
  }
  const missingColumns = Object.entries(expectedColumns).flatMap(([table, columns]) =>
    columns
      .filter(column => !columnsByTable.get(table)?.has(column))
      .map(column => `${table}.${column}`)
  );
  const constraintRows = await sql.unsafe(`
    SELECT pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'app_users'
      AND c.conname = 'app_users_role_check'
  `);
  const constraintDefinition = constraintRows[0]?.definition || '';
  const missingRoles = expectedAppUserRoles.filter(role => !constraintDefinition.includes(`'${role}'`));

  console.log(found.join('\n'));
  console.log(`app_users_role_check: ${constraintDefinition || 'ausente'}`);

  if (missing.length) {
    console.error(`Tabelas ausentes: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
  if (missingColumns.length) {
    console.error(`Colunas ausentes: ${missingColumns.join(', ')}`);
    process.exitCode = 1;
  }
  if (!constraintDefinition) {
    console.error('Constraint ausente: app_users_role_check');
    process.exitCode = 1;
  } else if (missingRoles.length) {
    console.error(`Roles ausentes na constraint app_users_role_check: ${missingRoles.join(', ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Falha ao validar schema: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
