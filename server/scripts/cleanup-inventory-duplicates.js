import 'dotenv/config';
import postgres from 'postgres';

const KEEP_ID = Number(process.argv.find(arg => arg.startsWith('--keep='))?.split('=')[1] || 0);
const APPLY = process.argv.includes('--apply');
const START = process.argv.find(arg => arg.startsWith('--start='))?.split('=')[1] || '2026-06-16T00:00:00-03:00';
const END = process.argv.find(arg => arg.startsWith('--end='))?.split('=')[1] || '2026-06-17T00:00:00-03:00';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL nao configurada.');
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10
});

async function snapshot(tx = sql) {
  const [totals] = await tx`
    SELECT
      (SELECT COUNT(*)::int FROM inventory_counts) AS inventory_counts,
      (SELECT COUNT(*)::int FROM inventory_count_items) AS inventory_count_items
  `;
  return totals;
}

async function candidates() {
  return sql`
    SELECT
      c.id,
      c.created_at,
      c.user_id,
      c.notes,
      COUNT(i.id)::int AS item_count
    FROM inventory_counts c
    LEFT JOIN inventory_count_items i ON i.inventory_count_id = c.id
    WHERE c.created_at >= ${START}::timestamptz
      AND c.created_at < ${END}::timestamptz
    GROUP BY c.id
    ORDER BY item_count DESC, c.created_at DESC, c.id DESC
  `;
}

try {
  const before = await snapshot();
  const rows = await candidates();
  const keepId = KEEP_ID || Number(rows[0]?.id || 0);
  const deleteIds = rows.filter(row => Number(row.id) !== keepId).map(row => Number(row.id));

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    window: { start: START, end: END },
    before,
    candidates: rows,
    keepId,
    deleteIds
  }, null, 2));

  if (APPLY) {
    if (!keepId) throw new Error('Nenhuma contagem encontrada para manter.');
    if (!deleteIds.length) {
      console.log(JSON.stringify({ after: before, deleted: [] }, null, 2));
    } else {
      const result = await sql.begin(async tx => {
        await tx`DELETE FROM inventory_count_items WHERE inventory_count_id = ANY(${deleteIds})`;
        const deleted = await tx`DELETE FROM inventory_counts WHERE id = ANY(${deleteIds}) RETURNING id`;
        return {
          deleted: deleted.map(row => Number(row.id)),
          after: await snapshot(tx)
        };
      });
      console.log(JSON.stringify(result, null, 2));
    }
  }
} finally {
  await sql.end();
}
