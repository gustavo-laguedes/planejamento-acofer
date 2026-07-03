import { parse } from 'csv-parse/sync';
import { requireDb } from '../server/db.js';

const NASAJON_COLUMNS = {
  establishment: 0,
  product_code: 1,
  fiscal_balance_unit: 9,
  error_balance_unit: 12,
  sales_unit: 17
};

const INSERT_COLUMNS = [
  'import_id',
  'establishment',
  'product_code',
  'old_product_code',
  'specification',
  'unit',
  'category',
  'inventory_group',
  'controls_weight',
  'theoretical_weight',
  'fiscal_balance_unit',
  'fiscal_balance_kg_float',
  'fiscal_balance_kg_theoretical',
  'error_balance_unit',
  'error_balance_kg_float',
  'error_balance_kg_theoretical',
  'orders_unit',
  'orders_kg_theoretical',
  'sales_unit',
  'sales_kg_theoretical',
  'purchase_orders_unit',
  'purchase_orders_kg_theoretical'
];

function normalizeHeader(header) {
  return String(header || '').trim();
}

function normalizeHeaderKey(value) {
  return normalizeHeader(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function parseNasajonNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().replace(/\s/g, '');
  const hasComma = raw.includes(',');
  let normalized = raw;

  if (hasComma) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value) {
  return parseNasajonNumber(value);
}

function validateNasajonHeader(headers) {
  const required = [
    ['estabelecimento', NASAJON_COLUMNS.establishment],
    ['produto - codigo', NASAJON_COLUMNS.product_code],
    ['saldo fiscal (unidade padrao)', NASAJON_COLUMNS.fiscal_balance_unit],
    ['saldo erros (unidade padrao)', NASAJON_COLUMNS.error_balance_unit],
    ['vendas (unidade padrao)', NASAJON_COLUMNS.sales_unit]
  ];

  for (const [expected, index] of required) {
    if (!headers[index]) throw new Error(`CSV Nasajon sem a coluna obrigatoria na posicao ${index + 1}.`);
    if (normalizeHeaderKey(headers[index]) !== expected) {
      throw new Error(`Layout CSV Nasajon invalido na coluna ${index + 1}: esperado "${expected}", recebido "${headers[index]}".`);
    }
  }
}

function normalizeRow(row, importId) {
  const normalized = {
    import_id: importId,
    establishment: normalizeHeader(row[NASAJON_COLUMNS.establishment]),
    product_code: normalizeHeader(row[NASAJON_COLUMNS.product_code]),
    fiscal_balance_unit: toNumber(row[NASAJON_COLUMNS.fiscal_balance_unit]),
    error_balance_unit: toNumber(row[NASAJON_COLUMNS.error_balance_unit]),
    sales_unit: toNumber(row[NASAJON_COLUMNS.sales_unit])
  };

  for (const column of INSERT_COLUMNS) {
    if (normalized[column] === undefined) normalized[column] = null;
  }

  return normalized;
}

function buildInsert(rows) {
  const placeholders = [];
  const values = [];
  rows.forEach((row, rowIndex) => {
    const rowPlaceholders = INSERT_COLUMNS.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * INSERT_COLUMNS.length + columnIndex + 1}`;
    });
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  });

  return {
    sql: `INSERT INTO stock_snapshot (${INSERT_COLUMNS.join(', ')}) VALUES ${placeholders.join(', ')}`,
    values
  };
}

async function recordMaterialBalances(tx, importId) {
  await tx`
    INSERT INTO stock_import_material_balances (import_id, material_id, total_locations_qty)
    SELECT ${importId}, m.id,
           COALESCE(SUM(COALESCE(s.fiscal_balance_unit, 0) + COALESCE(s.error_balance_unit, 0)), 0)
           + COALESCE(c.correction_qty, 0) AS total_locations_qty
    FROM materials m
    LEFT JOIN LATERAL unnest(COALESCE(m.codes, ARRAY[]::text[])) material_code(code) ON true
    LEFT JOIN stock_snapshot s
      ON lower(trim(s.product_code)) = lower(trim(material_code.code))
    LEFT JOIN stock_material_corrections c ON c.material_id = m.id
    WHERE m.active = true
    GROUP BY m.id, c.correction_qty
    ON CONFLICT (import_id, material_id)
    DO UPDATE SET total_locations_qty = EXCLUDED.total_locations_qty
  `;
}

export function parseNasajonCsv(buffer) {
  const rows = parse(buffer, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });
  if (!rows.length) throw new Error('CSV Nasajon vazio.');
  const headers = rows[0].map(normalizeHeader);
  validateNasajonHeader(headers);
  return rows.slice(1).filter(row => row.some(value => String(value || '').trim() !== ''));
}

function userName(user) {
  return String(user?.name || user?.email || user?.role || '').trim() || null;
}

function userId(user) {
  const id = Number(user?.id || user?.sub || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function importStockCsv({ buffer, filename, user }) {
  const db = requireDb();
  const records = parseNasajonCsv(buffer);

  const [history] = await db`
    INSERT INTO import_history (filename, status, started_at, user_id, user_name)
    VALUES (${filename}, 'processing', now(), ${userId(user)}, ${userName(user)})
    RETURNING id
  `;

  try {
    await db.begin(async tx => {
      await tx`TRUNCATE TABLE stock_snapshot RESTART IDENTITY`;

      const batchSize = 500;
      for (let index = 0; index < records.length; index += batchSize) {
        const batch = records.slice(index, index + batchSize).map(row => normalizeRow(row, history.id));
        if (!batch.length) continue;
        const insert = buildInsert(batch);
        await tx.unsafe(insert.sql, insert.values);
      }

      await recordMaterialBalances(tx, history.id);

      await tx`
        UPDATE import_history
        SET status = 'success', total_rows = ${records.length}, finished_at = now(), error_message = null
        WHERE id = ${history.id}
      `;
    });
    return { id: history.id, status: 'success', totalRows: records.length };
  } catch (error) {
    await db`
      UPDATE import_history
      SET status = 'error', finished_at = now(), error_message = ${error.message}
      WHERE id = ${history.id}
    `;
    throw error;
  }
}
