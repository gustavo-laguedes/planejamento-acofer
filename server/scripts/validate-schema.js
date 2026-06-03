import 'dotenv/config';
import postgres from 'postgres';

const expectedTables = [
  'import_history',
  'locations',
  'machines',
  'material_inputs',
  'materials',
  'production_actuals',
  'production_plan_days',
  'production_plans',
  'productivity_matrix',
  'stock_adjustments',
  'stock_location_adjustments',
  'stock_snapshot'
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

  console.log(found.join('\n'));

  if (missing.length) {
    console.error(`Tabelas ausentes: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Falha ao validar schema: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
