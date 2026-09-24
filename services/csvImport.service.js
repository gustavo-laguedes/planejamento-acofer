import { parse } from 'csv-parse/sync';
import { requireDb } from '../server/db.js';
import { aggregateImportedSales } from './stockBalance.service.js';
import { businessDaysInclusive } from './workingDays.service.js';

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
    [['estabelecimento'], NASAJON_COLUMNS.establishment],
    [['produto - codigo', 'codigo do produto', 'codigo produto'], NASAJON_COLUMNS.product_code],
    [['vendas (unidade padrao)'], NASAJON_COLUMNS.sales_unit]
  ];

  for (const [accepted, index] of required) {
    if (!headers[index]) throw new Error(`CSV Nasajon sem a coluna obrigatoria na posicao ${index + 1}.`);
    if (!accepted.includes(normalizeHeaderKey(headers[index]))) {
      throw new Error(`Layout CSV Nasajon invalido na coluna ${index + 1}: esperado "${accepted[0]}", recebido "${headers[index]}".`);
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

function detectCsvDelimiter(buffer) {
  const firstLine = String(buffer || '').split(/\r?\n/, 1)[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

export function parseNasajonCsv(buffer) {
  const rows = parse(buffer, {
    bom: true,
    delimiter: detectCsvDelimiter(buffer),
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

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function formatPeriodDate(value) {
  const date = normalizeDate(value);

  if (!date) return '-';

  const [year, month, day] = date.split('-');

  return `${day}/${month}/${year}`;
}

async function findOverlappingImport(
  db,
  periodStart,
  periodEnd
) {
  const [existing] = await db`
    SELECT
      id,
      filename,
      status,
      period_start,
      period_end
    FROM import_history
    WHERE period_start IS NOT NULL
      AND period_end IS NOT NULL
      AND status IN ('processing', 'success')
      AND period_start <= CAST(${periodEnd} AS date)
      AND period_end >= CAST(${periodStart} AS date)
    ORDER BY period_start ASC, created_at ASC
    LIMIT 1
  `;

  return existing || null;
}

export async function importStockCsv({ buffer, filename, user, periodStart, periodEnd }) {
  const db = requireDb();
  const normalizedPeriodStart = normalizeDate(periodStart);
  const normalizedPeriodEnd = normalizeDate(periodEnd);
  if (!normalizedPeriodStart || !normalizedPeriodEnd) {
    const error = new Error('Informe o periodo inicial e final da importacao.');
    error.status = 400;
    throw error;
  }
  if (normalizedPeriodStart > normalizedPeriodEnd) {
    const error = new Error('O periodo inicial nao pode ser posterior ao periodo final.');
    error.status = 400;
    throw error;
  }

  const overlappingImport =
  await findOverlappingImport(
    db,
    normalizedPeriodStart,
    normalizedPeriodEnd
  );

if (overlappingImport) {
  const existingStart =
    formatPeriodDate(
      overlappingImport.period_start
    );

  const existingEnd =
    formatPeriodDate(
      overlappingImport.period_end
    );

  const error = new Error(
    `Este periodo conflita com uma importacao ja existente: ` +
    `${existingStart} ate ${existingEnd}. ` +
    `Arquivo: ${overlappingImport.filename}. ` +
    `A importacao foi cancelada para evitar duplicidade de vendas.`
  );

  error.status = 409;
  throw error;
}

  const businessDays = businessDaysInclusive(
  normalizedPeriodStart,
  normalizedPeriodEnd
);

  const records = parseNasajonCsv(buffer);

  const [history] = await db`
    INSERT INTO import_history (
  filename,
  status,
  started_at,
  user_id,
  user_name,
  period_start,
  period_end,
  business_days
)
VALUES (
  ${filename},
  'processing',
  now(),
  ${userId(user)},
  ${userName(user)},
  ${normalizedPeriodStart},
  ${normalizedPeriodEnd},
  ${businessDays}
)
    RETURNING id
  `;

  try {
    await db.begin(async tx => {
      const materials = await tx`SELECT id, name, codes FROM materials WHERE active = true`;
      const locations = await tx`SELECT id, code, name FROM locations WHERE active = true`;
      const sales = aggregateImportedSales({
        records: records.map(row => normalizeRow(row, history.id)),
        materials,
        locations
      });
      for (const row of sales.rows) {
        await tx`
          INSERT INTO stock_import_sales_history (
            import_id, material_id, location_id, period_start, period_end, sales_qty, product_codes
          )
          VALUES (
            ${history.id}, ${row.materialId}, ${row.locationId}, ${normalizedPeriodStart}, ${normalizedPeriodEnd},
            ${row.salesQty}, ${row.productCodes}
          )
          ON CONFLICT (import_id, material_id, location_id)
          DO UPDATE SET sales_qty = EXCLUDED.sales_qty,
                        product_codes = EXCLUDED.product_codes
        `;
      }

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
