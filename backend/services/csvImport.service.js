import { parse } from 'csv-parse/sync';
import { requireDb } from '../db.js';

const COLUMN_MAP = {
  'Estabelecimento': 'establishment',
  'Produto - Codigo': 'product_code',
  'Produto - Código': 'product_code',
  'Produto - Codigo Antigo': 'old_product_code',
  'Produto - Código Antigo': 'old_product_code',
  'Produto - Especificacao': 'specification',
  'Produto - Especificação': 'specification',
  'Produto - Unidade': 'unit',
  'Produto - Categoria': 'category',
  'Grupo de Inventario': 'inventory_group',
  'Grupo de Inventário': 'inventory_group',
  'Produto - Controla Peso': 'controls_weight',
  'Produto - Peso Teorico': 'theoretical_weight',
  'Produto - Peso Teórico': 'theoretical_weight',
  'Saldo Fiscal (Unidade Padrao)': 'fiscal_balance_unit',
  'Saldo Fiscal (Unidade Padrão)': 'fiscal_balance_unit',
  'Saldo Fiscal (KG - Flutuante)': 'fiscal_balance_kg_float',
  'Saldo Fiscal (KG - Teorico)': 'fiscal_balance_kg_theoretical',
  'Saldo Fiscal (KG - Teórico)': 'fiscal_balance_kg_theoretical',
  'Saldo Erros (Unidade Padrao)': 'error_balance_unit',
  'Saldo Erros (Unidade Padrão)': 'error_balance_unit',
  'Saldo Erros (KG - Flutuante)': 'error_balance_kg_float',
  'Saldo Erros (KG - Teorico)': 'error_balance_kg_theoretical',
  'Saldo Erros (KG - Teórico)': 'error_balance_kg_theoretical',
  'Pedidos (Unidade Padrao)': 'orders_unit',
  'Pedidos (Unidade Padrão)': 'orders_unit',
  'Pedidos (KG - Teorico)': 'orders_kg_theoretical',
  'Pedidos (KG - Teórico)': 'orders_kg_theoretical',
  'Vendas (Unidade Padrao)': 'sales_unit',
  'Vendas (Unidade Padrão)': 'sales_unit',
  'Vendas (KG - Teorico)': 'sales_kg_theoretical',
  'Vendas (KG - Teórico)': 'sales_kg_theoretical',
  'Pedidos Compra (Unidade Padrao)': 'purchase_orders_unit',
  'Pedidos Compra (Unidade Padrão)': 'purchase_orders_unit',
  'Pedidos Compra (KG - Teorico)': 'purchase_orders_kg_theoretical',
  'Pedidos Compra (KG - Teórico)': 'purchase_orders_kg_theoretical'
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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['sim', 's', 'true', '1', 'yes'].includes(normalized);
}

function normalizeRow(row, importId) {
  const normalized = { import_id: importId };

  for (const [source, target] of Object.entries(COLUMN_MAP)) {
    if (Object.prototype.hasOwnProperty.call(row, source)) {
      normalized[target] = row[source];
    }
  }

  normalized.controls_weight = toBool(normalized.controls_weight);

  for (const key of [
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
  ]) {
    normalized[key] = toNumber(normalized[key]);
  }

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

export async function importStockCsv({ buffer, filename }) {
  const db = requireDb();
  const records = parse(buffer, {
    columns: headers => headers.map(normalizeHeader),
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  const [history] = await db`
    INSERT INTO import_history (filename, status, started_at)
    VALUES (${filename}, 'processing', now())
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
