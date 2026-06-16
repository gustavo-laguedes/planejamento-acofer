import 'dotenv/config';
import postgres from 'postgres';

const CLEAN_TABLES = [
  'production_plan_days',
  'production_plans',
  'production_actuals',
  'production_launches',
  'inventory_count_items',
  'inventory_counts',
  'stock_import_material_balances',
  'stock_snapshot',
  'stock_adjustments',
  'stock_location_adjustments',
  'stock_material_corrections',
  'import_history'
];

const PRESERVED_TABLES = [
  'app_users',
  'users',
  'materials',
  'material_inputs',
  'machines',
  'locations',
  'productivity_matrix',
  'audit_logs'
];

const CRITICAL_TABLES = new Set([
  'app_users',
  'users',
  'materials',
  'material_inputs',
  'machines',
  'locations',
  'productivity_matrix'
]);

const shouldExecute = process.argv.includes('--confirm');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL nao configurada. Preencha .env ou defina a variavel no ambiente.');
  process.exit(1);
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableListSql(tables) {
  return tables.map(quoteIdentifier).join(', ');
}

async function tableExists(sql, tableName) {
  const [row] = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return Boolean(row);
}

async function countRows(sql, tables) {
  const counts = {};
  for (const table of tables) {
    const [row] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`);
    counts[table] = row.count;
  }
  return counts;
}

function printCounts(title, counts) {
  console.log(`\n${title}`);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`- ${table}: ${count}`);
  }
}

function assertSafe(cleanTables) {
  const accidentalCritical = cleanTables.filter(table => CRITICAL_TABLES.has(table));
  if (accidentalCritical.length) {
    throw new Error(`Tabela critica na lista de limpeza: ${accidentalCritical.join(', ')}`);
  }
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10
});

try {
  assertSafe(CLEAN_TABLES);

  const existingCleanTables = [];
  const missingCleanTables = [];
  for (const table of CLEAN_TABLES) {
    if (await tableExists(sql, table)) existingCleanTables.push(table);
    else missingCleanTables.push(table);
  }

  const existingPreservedTables = [];
  const missingPreservedTables = [];
  for (const table of PRESERVED_TABLES) {
    if (await tableExists(sql, table)) existingPreservedTables.push(table);
    else missingPreservedTables.push(table);
  }

  assertSafe(existingCleanTables);

  console.log('Limpeza operacional do Planejamento Aco-Fer');
  console.log(`Modo: ${shouldExecute ? 'EXECUCAO CONFIRMADA' : 'PREVIA (dry-run)'}`);

  console.log('\nTabelas que serao limpas:');
  for (const table of existingCleanTables) console.log(`- ${table}`);

  if (missingCleanTables.length) {
    console.log('\nTabelas operacionais nao encontradas e ignoradas:');
    for (const table of missingCleanTables) console.log(`- ${table}`);
  }

  console.log('\nTabelas preservadas explicitamente:');
  for (const table of existingPreservedTables) console.log(`- ${table}`);

  if (missingPreservedTables.length) {
    console.log('\nTabelas preservadas nao encontradas neste banco:');
    for (const table of missingPreservedTables) console.log(`- ${table}`);
  }

  console.log('\nObservacao: audit_logs foi preservada nesta limpeza principal.');

  const beforeClean = await countRows(sql, existingCleanTables);
  const beforePreserved = await countRows(sql, existingPreservedTables);
  printCounts('Contagens antes - tabelas limpas', beforeClean);
  printCounts('Contagens antes - tabelas preservadas', beforePreserved);

  if (!shouldExecute) {
    console.log('\nNenhuma alteracao executada. Rode novamente com --confirm para limpar.');
    process.exit(0);
  }

  if (!existingCleanTables.length) {
    console.log('\nNenhuma tabela operacional existente para limpar.');
    process.exit(0);
  }

  await sql.begin(async tx => {
    await tx.unsafe(`TRUNCATE TABLE ${tableListSql(existingCleanTables)} RESTART IDENTITY`);
  });

  const afterClean = await countRows(sql, existingCleanTables);
  const afterPreserved = await countRows(sql, existingPreservedTables);
  printCounts('Contagens depois - tabelas limpas', afterClean);
  printCounts('Contagens depois - tabelas preservadas', afterPreserved);

  const notEmpty = Object.entries(afterClean).filter(([, count]) => count !== 0);
  if (notEmpty.length) {
    throw new Error(`Limpeza incompleta: ${notEmpty.map(([table, count]) => `${table}=${count}`).join(', ')}`);
  }

  const changedPreserved = Object.entries(beforePreserved)
    .filter(([table, count]) => afterPreserved[table] !== count)
    .map(([table, count]) => `${table}: antes=${count}, depois=${afterPreserved[table]}`);
  if (changedPreserved.length) {
    throw new Error(`Tabela preservada teve contagem alterada: ${changedPreserved.join('; ')}`);
  }

  console.log('\nLimpeza operacional concluida com seguranca.');
} catch (error) {
  console.error(`\nFalha na limpeza operacional: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
