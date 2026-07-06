import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const databaseDir = path.resolve(__dirname, '../../database');
const files = [
  '001_schema.sql',
  '004_productivity_codes_seconds.sql',
  '005_registrations.sql',
  '006_stock_location_adjustments.sql',
  '007_launches_planning_tree.sql',
  '008_production_models.sql',
  '009_stock_sales_structure.sql',
  '010_import_history_user_name.sql',
  '011_app_users.sql',
  '012_audit_logs.sql',
  '013_stock_period_and_active_sessions.sql',
  '014_app_users_comercial_role.sql',
  '015_app_users_role_check_final.sql',
  '016_manual_stock_records.sql',
  '017_inventory_edit_metadata.sql',
  '002_indexes.sql',
  '003_seed_optional.sql'
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
  for (const file of files) {
    const fullPath = path.join(databaseDir, file);
    const contents = await fs.readFile(fullPath, 'utf8');
    console.log(`Aplicando ${file}...`);
    await sql.unsafe(contents);
  }
  console.log('Schema aplicado com sucesso.');
} catch (error) {
  console.error(`Falha ao aplicar schema: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
