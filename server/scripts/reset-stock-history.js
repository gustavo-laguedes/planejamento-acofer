import 'dotenv/config';
import { sql } from '../db.js';

const APPLY = process.argv.includes('--confirm');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL nao configurada.');
}

async function counts(db = sql) {
  const [row] = await db`
    SELECT
      (SELECT COUNT(*)::int FROM import_history)
        AS import_history,

      (SELECT COUNT(*)::int FROM stock_import_sales_history)
        AS stock_import_sales_history,

      (SELECT COUNT(*)::int FROM stock_import_material_balances)
        AS stock_import_material_balances,

      (SELECT COUNT(*)::int FROM stock_snapshot)
        AS stock_snapshot,

      (SELECT COUNT(*)::int FROM inventory_counts)
        AS inventory_counts,

      (SELECT COUNT(*)::int FROM inventory_count_items)
        AS inventory_count_items
  `;

  return row;
}

try {
  const before = await counts();

  console.log('ANTES DA LIMPEZA:');
  console.table(before);

  if (!APPLY) {
    console.log('');
    console.log('PREVIA APENAS.');
    console.log('Nenhum dado foi apagado.');
    console.log('');
    console.log(
      'Para executar de verdade, use: npm run stock:reset-history -- --confirm'
    );
  } else {
    await sql.begin(async tx => {
  // Limpa todos os dados antigos de importação/estoque.
  await tx`
    DELETE FROM stock_import_sales_history
  `;

  await tx`
    DELETE FROM stock_import_material_balances
  `;

  await tx`
    DELETE FROM stock_snapshot
  `;

  await tx`
    DELETE FROM import_history
  `;

});
    const after = await counts();

    console.log('');
    console.log('DEPOIS DA LIMPEZA:');
    console.table(after);

    console.log('');
    console.log(
  'Historicos antigos de CSV e estoque importado limpos com sucesso.'
);
console.log(
  'Inventarios e demais dados operacionais foram preservados.'
);
  }
} finally {
  await sql.end();
}