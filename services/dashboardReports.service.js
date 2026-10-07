import {
  buildExecutiveDashboard,
  normalizeDashboardPeriod
} from './dashboardExecutive.service.js';

const DEFINITIONS = {
  'executive-summary': ['Resumo executivo', 'Indicadores e visão consolidada do período.', 'resumo-executivo'],
  production: ['Produção', 'Produções, máquinas, pessoas, quantidade e peso.', 'producao'],
  'quality-nbr': ['Aderência à NBR', 'Conformidade, desvios e materiais avaliados.', 'aderencia-nbr'],
  'planned-vs-actual': ['Planejado x Realizado', 'Aderência dos planos e diferenças do período.', 'planejado-x-realizado'],
  unplanned: ['Não planejadas', 'Produções realizadas fora do planejamento.', 'nao-planejadas'],
  'production-calendar': ['Calendário de produções', 'Agenda consolidada das produções do período.', 'calendario-producoes'],
  'purchases-certificates': ['Compras e certificados', 'Compras, fornecedores, lotes e certificados.', 'compras-certificados'],
  transports: ['Transportes', 'Movimentações entre unidades e volumes transportados.', 'transportes'],
  'stock-inventories': ['Estoque e inventários', 'Saldos importados, inventários físicos e diferenças encontradas.', 'estoque-inventarios'],
  traceability: ['Rastreabilidade', 'Origem de matéria-prima, lotes consumidos e lotes produzidos.', 'rastreabilidade'],
  cancellations: ['Cancelamentos', 'Planejamentos, produções e transportes cancelados.', 'cancelamentos'],
  meshes: ['Malhas', 'Peso real comparado ao peso teórico cadastrado.', 'malhas']
};

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const column = (key, label, format = 'text') => ({ key, label, format });
const qualityLabel = value => ({ compliant: 'Dentro da norma', below_minimum: 'Abaixo do mínimo', above_maximum: 'Acima do máximo', mixed: 'Resultado misto' })[value] || value || '-';

export function normalizeDashboardReportRequest({ reportId, startDate, endDate, format } = {}) {
  const id = String(reportId || '').trim();
  const definition = DEFINITIONS[id];
  if (!definition) {
    const error = new Error('Relatório não suportado nesta etapa.');
    error.status = 404;
    throw error;
  }
  const selectedFormat = String(format || 'xlsx').trim().toLowerCase();
  if (!['xlsx', 'pdf'].includes(selectedFormat)) {
    const error = new Error('Formato inválido. Use xlsx ou pdf.');
    error.status = 400;
    throw error;
  }
  return { reportId: id, format: selectedFormat, period: normalizeDashboardPeriod(startDate, endDate), definition: { title: definition[0], description: definition[1], filenameBase: definition[2] } };
}

function executiveSummary(executive) {
  const production = executive.production || {};
  const quality = executive.quality || {};
  const mesh = executive.mesh || {};
  const purchases = executive.purchases || {};
  const transports = executive.transports || {};
  return {
    summary: [
      ['Produções realizadas', production.summary?.productionCount, 'integer'], ['Peso real produzido', production.summary?.realWeightKg, 'kg'], ['Conformidade NBR', quality.summary?.compliancePercent, 'percent'], ['Produções avaliadas NBR', quality.summary?.evaluatedProductions, 'integer'], ['Malhas avaliadas', mesh.summary?.evaluatedProductions, 'integer'], ['Diferença malhas', mesh.summary?.differencePercent, 'percent'], ['Compras recebidas', purchases.summary?.purchaseCount, 'integer'], ['Peso comprado', purchases.summary?.totalWeightKg, 'kg'], ['Transportes', transports.summary?.transportCount, 'integer'], ['Peso transportado', transports.summary?.equivalentKg, 'kg']
    ],
    sections: [{ title: 'Produção por máquina', columns: [column('machineName', 'Máquina'), column('productionCount', 'Produções', 'integer'), column('realWeightKg', 'Peso real (kg)', 'number3'), column('equivalentKg', 'Peso equivalente (kg)', 'number3'), column('averagePeople', 'Média pessoas', 'number2')], rows: production.byMachine || [] }, { title: 'Qualidade por material', columns: [column('materialName', 'Material'), column('evaluatedProductions', 'Avaliações', 'integer'), column('compliancePercent', 'Conformidade (%)', 'number2'), column('actualKgM', 'Real (kg/m)', 'number6'), column('nominalKgM', 'Nominal (kg/m)', 'number6'), column('deviationPercent', 'Desvio (%)', 'number3'), column('statusLabel', 'Status')], rows: (quality.byMaterial || []).map(row => ({ ...row, statusLabel: qualityLabel(row.status) })) }]
  };
}

function productionReport(executive) {
  const production = executive.production || {};
  return { summary: [['Produções realizadas', production.summary?.productionCount, 'integer'], ['Peso real produzido', production.summary?.realWeightKg, 'kg'], ['Peso equivalente', production.summary?.equivalentKg, 'kg']], sections: [{ title: 'Produções realizadas', columns: [column('date', 'Data', 'date'), column('materialName', 'Material'), column('materialCode', 'Código'), column('materialType', 'Tipo'), column('machineName', 'Máquina'), column('locationName', 'Local'), column('quantity', 'Quantidade', 'number3'), column('unit', 'Unidade'), column('people', 'Pessoas', 'integer'), column('realWeightKg', 'Peso real (kg)', 'number3'), column('equivalentKg', 'Peso equivalente (kg)', 'number3')], rows: production.details || [] }] };
}

function qualityReport(executive) {
  const quality = executive.quality || {};
  return { summary: [['Produções avaliadas', quality.summary?.evaluatedProductions, 'integer'], ['Dentro da norma', quality.summary?.compliantProductions, 'integer'], ['Fora da norma', quality.summary?.nonCompliantProductions, 'integer'], ['Conformidade', quality.summary?.compliancePercent, 'percent']], sections: [{ title: 'Aderência por produção', columns: [column('date', 'Data', 'date'), column('materialName', 'Material'), column('materialCode', 'Código'), column('machineName', 'Máquina'), column('normName', 'Norma'), column('lengthM', 'Comprimento (m)', 'number3'), column('realWeightKg', 'Peso real (kg)', 'number3'), column('minimumKgM', 'Mínimo (kg/m)', 'number6'), column('nominalKgM', 'Nominal (kg/m)', 'number6'), column('maximumKgM', 'Máximo (kg/m)', 'number6'), column('actualKgM', 'Real (kg/m)', 'number6'), column('deviationKgM', 'Desvio (kg/m)', 'number6'), column('deviationPercent', 'Desvio (%)', 'number3'), column('statusLabel', 'Status'), column('sourceLabel', 'Origem parâmetro')], rows: (quality.details || []).map(row => ({ ...row, statusLabel: qualityLabel(row.status), sourceLabel: row.source === 'snapshot' ? 'Snapshot histórico' : 'Cadastro atual' })) }] };
}

function meshReport(executive) {
  const mesh = executive.mesh || {};
  return { summary: [['Produções avaliadas', mesh.summary?.evaluatedProductions, 'integer'], ['Peso real', mesh.summary?.realWeightKg, 'kg'], ['Peso teórico', mesh.summary?.theoreticalWeightKg, 'kg'], ['Diferença', mesh.summary?.differenceKg, 'kg'], ['Diferença percentual', mesh.summary?.differencePercent, 'percent']], sections: [{ title: 'Peso real x teórico por material', columns: [column('materialName', 'Material'), column('productionCount', 'Produções', 'integer'), column('theoreticalWeightKg', 'Peso teórico (kg)', 'number3'), column('realWeightKg', 'Peso real (kg)', 'number3'), column('differenceKg', 'Diferença (kg)', 'number3'), column('differencePercent', 'Diferença (%)', 'number2')], rows: mesh.byMaterial || [] }] };
}

async function plannedVsActualReport(db, period) {
  const rows = await db`
    WITH plan_rows AS (
      SELECT d.planned_date::date AS date, d.material_name, d.material_code,
        STRING_AGG(DISTINCT NULLIF(TRIM(d.machine_name), ''), ', ') AS machine_name,
        STRING_AGG(DISTINCT COALESCE(NULLIF(TRIM(p.code), ''), p.id::text), ', ') AS planning_codes,
        SUM(d.planned_qty) AS planned_qty
      FROM production_plan_days d
      JOIN production_plans p ON p.id = d.plan_id
      WHERE d.planned_qty > 0 AND NULLIF(TRIM(d.machine_name), '') IS NOT NULL
        AND LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
        AND d.planned_date::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
      GROUP BY d.planned_date::date, d.material_name, d.material_code
      UNION ALL
      SELECT p.start_date::date, p.material_name, p.material_code, p.machine_name,
        COALESCE(NULLIF(TRIM(p.code), ''), p.id::text), p.planned_qty
      FROM production_plans p
      WHERE NOT EXISTS (SELECT 1 FROM production_plan_days d WHERE d.plan_id = p.id AND d.planned_qty > 0 AND NULLIF(TRIM(d.machine_name), '') IS NOT NULL)
        AND LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
        AND p.start_date::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
    ), actual_rows AS (
      SELECT production_date::date AS date, material_name, material_code, SUM(quantity) AS actual_qty
      FROM production_launches
      WHERE LOWER(TRIM(COALESCE(status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada') AND quantity > 0
      GROUP BY production_date::date, material_name, material_code
      UNION ALL
      SELECT a.production_date::date, a.material_name, a.material_code, SUM(a.actual_qty)
      FROM production_actuals a
      WHERE a.actual_qty > 0 AND NOT EXISTS (
        SELECT 1 FROM production_launches l WHERE l.production_date = a.production_date
          AND COALESCE(NULLIF(TRIM(l.material_code), ''), LOWER(TRIM(l.material_name))) = COALESCE(NULLIF(TRIM(a.material_code), ''), LOWER(TRIM(a.material_name)))
          AND l.quantity = a.actual_qty
      ) GROUP BY a.production_date::date, a.material_name, a.material_code
    ), actuals AS (
      SELECT date, material_name, material_code, SUM(actual_qty) AS actual_qty FROM actual_rows
      GROUP BY date, material_name, material_code
    )
    SELECT p.*, COALESCE(a.actual_qty, 0) AS actual_qty,
      COALESCE(a.actual_qty, 0) - p.planned_qty AS difference,
      CASE WHEN p.planned_qty = 0 THEN 0 ELSE COALESCE(a.actual_qty, 0) / p.planned_qty * 100 END AS percent_done,
      CASE WHEN COALESCE(a.actual_qty, 0) > p.planned_qty THEN 'Excedido' WHEN COALESCE(a.actual_qty, 0) >= p.planned_qty AND p.planned_qty > 0 THEN 'Cumprido' WHEN COALESCE(a.actual_qty, 0) > 0 THEN 'Em andamento' WHEN p.date < CURRENT_DATE THEN 'Meta não atingida' ELSE 'Programado' END AS status
    FROM plan_rows p LEFT JOIN actuals a ON a.date = p.date
      AND COALESCE(NULLIF(TRIM(a.material_code), ''), LOWER(TRIM(a.material_name))) = COALESCE(NULLIF(TRIM(p.material_code), ''), LOWER(TRIM(p.material_name)))
    ORDER BY p.date, p.planning_codes, p.material_name
  `;
  const normalized = rows.map(row => ({ ...row, planned_qty: num(row.planned_qty), actual_qty: num(row.actual_qty), difference: num(row.difference), percent_done: num(row.percent_done) }));
  const totals = normalized.reduce((acc, row) => ({ planned: acc.planned + row.planned_qty, actual: acc.actual + row.actual_qty }), { planned: 0, actual: 0 });
  const adherence = totals.planned > 0 ? totals.actual / totals.planned * 100 : 0;
  return { summary: [['Quantidade planejada', totals.planned, 'number3'], ['Quantidade realizada', totals.actual, 'number3'], ['Diferença', totals.actual - totals.planned, 'number3'], ['Aderência', adherence, 'percent'], ['Itens planejados', normalized.length, 'integer']], sections: [{ title: 'Planejado x realizado', columns: [column('date', 'Data', 'date'), column('planning_codes', 'Plano'), column('material_name', 'Material'), column('material_code', 'Código'), column('machine_name', 'Máquina'), column('planned_qty', 'Planejado', 'number3'), column('actual_qty', 'Realizado', 'number3'), column('difference', 'Diferença', 'number3'), column('percent_done', 'Aderência', 'percent'), column('status', 'Status')], rows: normalized }] };
}

async function unplannedReport(db, period) {
  const rows = await db`
    WITH plan_materials AS (
      SELECT DISTINCT p.start_date::date AS start_date, p.end_date::date AS end_date, d.material_name, d.material_code
      FROM production_plans p JOIN production_plan_days d ON d.plan_id = p.id
      WHERE LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
      UNION
      SELECT DISTINCT p.start_date::date, p.end_date::date, p.material_name, p.material_code
      FROM production_plans p WHERE NOT EXISTS (SELECT 1 FROM production_plan_days d WHERE d.plan_id = p.id)
        AND LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
    ), canceled_days AS (
      SELECT DISTINCT d.planned_date::date AS date, d.material_name, d.material_code FROM production_plan_days d JOIN production_plans p ON p.id = d.plan_id
      WHERE LOWER(TRIM(COALESCE(p.status, ''))) IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
    ), actuals AS (
      SELECT production_date::date AS date, material_name, material_code, primary_unit AS actual_unit, SUM(quantity) AS actual_qty
      FROM production_launches WHERE LOWER(TRIM(COALESCE(status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada') AND quantity > 0
      GROUP BY production_date::date, material_name, material_code, primary_unit
    )
    SELECT a.*, CASE WHEN EXISTS (SELECT 1 FROM canceled_days c WHERE c.date = a.date AND COALESCE(NULLIF(TRIM(c.material_code), ''), LOWER(TRIM(c.material_name))) = COALESCE(NULLIF(TRIM(a.material_code), ''), LOWER(TRIM(a.material_name)))) THEN 'Planejamento cancelado' ELSE 'Item não planejado' END AS status
    FROM actuals a WHERE a.date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
      AND NOT EXISTS (SELECT 1 FROM plan_materials p WHERE a.date BETWEEN p.start_date AND p.end_date AND COALESCE(NULLIF(TRIM(p.material_code), ''), LOWER(TRIM(p.material_name))) = COALESCE(NULLIF(TRIM(a.material_code), ''), LOWER(TRIM(a.material_name))))
    ORDER BY a.date, a.material_name
  `;
  const normalized = rows.map(row => ({ ...row, actual_qty: num(row.actual_qty) }));
  const materials = new Set(normalized.map(row => row.material_code || row.material_name));
  return { summary: [['Registros não planejados', normalized.length, 'integer'], ['Materiais diferentes', materials.size, 'integer']], sections: [{ title: 'Produções não planejadas', columns: [column('date', 'Data', 'date'), column('material_name', 'Material'), column('material_code', 'Código'), column('actual_qty', 'Quantidade', 'number3'), column('actual_unit', 'Unidade'), column('status', 'Status')], rows: normalized }] };
}

async function productionCalendarReport(db, period) {
  const rows = await db`
    WITH daily_events AS (
      SELECT d.id AS day_id, p.id AS plan_id, p.code AS planning_code, p.status, p.canceled_at,
        d.planned_date, d.material_name, d.material_code, d.machine_name, d.people_count, d.planned_qty, d.planned_unit
      FROM production_plan_days d JOIN production_plans p ON p.id = d.plan_id WHERE d.planned_qty > 0
    ), legacy_fallback AS (
      SELECT NULL::bigint AS day_id, p.id AS plan_id, p.code AS planning_code, p.status, p.canceled_at,
        p.start_date AS planned_date, p.material_name, p.material_code, p.machine_name, p.people_count, p.planned_qty, p.planned_unit
      FROM production_plans p WHERE NOT EXISTS (SELECT 1 FROM production_plan_days d WHERE d.plan_id = p.id AND d.planned_qty > 0)
    ), calendar_events AS (SELECT * FROM daily_events UNION ALL SELECT * FROM legacy_fallback)
    SELECT planned_date AS date, plan_id, planning_code, material_name, material_code, machine_name, people_count, planned_qty, planned_unit,
      CASE WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('canceled', 'cancelled', 'cancelado', 'cancelada') THEN 'Cancelado' ELSE COALESCE(NULLIF(TRIM(status), ''), 'Ativo') END AS status
    FROM calendar_events WHERE planned_date::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
      AND (COALESCE(status, '') <> 'canceled' OR (canceled_at IS NOT NULL AND planned_date::date < canceled_at::date))
    ORDER BY planned_date, planning_code, material_name, machine_name
  `;
  const normalized = rows.map(row => ({ ...row, people_count: num(row.people_count), planned_qty: num(row.planned_qty) }));
  const plans = new Set(normalized.map(row => row.planning_code || row.plan_id));
  const machines = new Set(normalized.map(row => row.machine_name).filter(Boolean));
  const totalPlanned = normalized.reduce((sum, row) => sum + row.planned_qty, 0);
  return { summary: [['Eventos planejados', normalized.length, 'integer'], ['Planos diferentes', plans.size, 'integer'], ['Máquinas envolvidas', machines.size, 'integer'], ['Quantidade planejada', totalPlanned, 'number3']], sections: [{ title: 'Calendário de produções', columns: [column('date', 'Data', 'date'), column('planning_code', 'Plano'), column('material_name', 'Material'), column('material_code', 'Código'), column('machine_name', 'Máquina'), column('people_count', 'Pessoas', 'integer'), column('planned_qty', 'Quantidade planejada', 'number3'), column('planned_unit', 'Unidade'), column('status', 'Status')], rows: normalized }] };
}

async function purchasesCertificatesReport(db, period) {
  const purchases = await db`
    SELECT p.id, p.purchase_date AS date, p.supplier, p.invoice_number, p.certificate_number, p.invoice_total_weight_kg, p.notes, p.created_at, p.updated_at
    FROM purchase_records p WHERE p.purchase_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY p.purchase_date, p.id
  `;
  const items = await db`
    SELECT p.purchase_date AS date, p.id AS purchase_id, p.supplier, p.invoice_number, p.certificate_number, i.id AS purchase_item_id, i.material_id,
      m.name AS material_name, array_to_string(m.codes, ', ') AS material_codes, loc.name AS location_name, i.stock_quantity, i.primary_unit, i.total_weight_kg
    FROM purchase_records p JOIN purchase_items i ON i.purchase_id = p.id LEFT JOIN materials m ON m.id = i.material_id LEFT JOIN locations loc ON loc.id = i.location_id
    WHERE p.purchase_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY p.purchase_date, p.id, i.sort_order, i.id
  `;
  const lots = await db`
    SELECT p.purchase_date AS date, p.supplier, p.invoice_number, p.certificate_number, m.name AS material_name, array_to_string(m.codes, ', ') AS material_codes,
      lot.lot_number, lot.weight_kg, lot.heat_number, lot.tensile_strength_mpa, lot.steel_grade
    FROM purchase_records p JOIN purchase_items i ON i.purchase_id = p.id JOIN purchase_lots lot ON lot.purchase_item_id = i.id LEFT JOIN materials m ON m.id = i.material_id
    WHERE p.purchase_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY p.purchase_date, p.id, i.sort_order, i.id, lot.sort_order, lot.id
  `;
  const suppliers = new Set(purchases.map(row => row.supplier).filter(Boolean));
  const invoiceWeight = purchases.reduce((sum, row) => sum + num(row.invoice_total_weight_kg), 0);
  const itemWeight = items.reduce((sum, row) => sum + num(row.total_weight_kg), 0);
  return { summary: [['Compras', purchases.length, 'integer'], ['Fornecedores', suppliers.size, 'integer'], ['Itens comprados', items.length, 'integer'], ['Lotes registrados', lots.length, 'integer'], ['Peso total das notas', invoiceWeight, 'kg'], ['Peso total dos itens', itemWeight, 'kg']], sections: [{ title: 'Compras', columns: [column('date', 'Data', 'date'), column('supplier', 'Fornecedor'), column('invoice_number', 'Nota fiscal'), column('certificate_number', 'Certificado'), column('invoice_total_weight_kg', 'Peso da nota (kg)', 'number3'), column('notes', 'Observações')], rows: purchases }, { title: 'Itens comprados', columns: [column('date', 'Data', 'date'), column('supplier', 'Fornecedor'), column('invoice_number', 'Nota fiscal'), column('certificate_number', 'Certificado'), column('material_name', 'Material'), column('material_codes', 'Códigos'), column('location_name', 'Local'), column('stock_quantity', 'Quantidade estoque', 'number3'), column('primary_unit', 'Unidade'), column('total_weight_kg', 'Peso total (kg)', 'number3')], rows: items }, { title: 'Lotes e certificados', columns: [column('date', 'Data', 'date'), column('supplier', 'Fornecedor'), column('invoice_number', 'Nota fiscal'), column('certificate_number', 'Certificado'), column('material_name', 'Material'), column('material_codes', 'Códigos'), column('lot_number', 'Lote'), column('heat_number', 'Corrida'), column('steel_grade', 'Classe do aço'), column('tensile_strength_mpa', 'Resistência (MPa)', 'number3'), column('weight_kg', 'Peso do lote (kg)', 'number3')], rows: lots }] };
}

async function transportsReport(db, period) {
  const rows = await db`
    SELECT r.id, r.transport_date AS date, m.name AS material_name, array_to_string(m.codes, ', ') AS material_codes,
      origin.name AS origin_location_name, destination.name AS destination_location_name, r.quantity, m.primary_unit,
      CASE WHEN LOWER(TRIM(COALESCE(m.primary_unit, ''))) = 'kg' THEN r.quantity WHEN LOWER(TRIM(COALESCE(m.secondary_unit, ''))) = 'kg' THEN r.quantity * COALESCE(m.primary_to_secondary_factor, 0) ELSE NULL END AS equivalent_weight_kg,
      r.invoice_number, r.notes, r.status, r.canceled_at, r.cancel_reason, r.created_at
    FROM stock_transport_records r LEFT JOIN materials m ON m.id = r.material_id LEFT JOIN locations origin ON origin.id = r.origin_location_id LEFT JOIN locations destination ON destination.id = r.destination_location_id
    WHERE r.transport_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY r.transport_date, r.created_at, r.id
  `;
  const normalized = rows.map(row => ({ ...row, quantity: num(row.quantity), equivalent_weight_kg: row.equivalent_weight_kg === null ? null : num(row.equivalent_weight_kg), status_label: String(row.status || '').toLowerCase() === 'canceled' ? 'Cancelado' : 'Ativo' }));
  const active = normalized.filter(row => row.status_label === 'Ativo');
  const totalWeight = active.reduce((sum, row) => sum + num(row.equivalent_weight_kg), 0);
  const routes = new Set(active.map(row => `${row.origin_location_name || '-'} → ${row.destination_location_name || '-'}`));
  return { summary: [['Transportes', normalized.length, 'integer'], ['Transportes ativos', active.length, 'integer'], ['Transportes cancelados', normalized.length - active.length, 'integer'], ['Rotas utilizadas', routes.size, 'integer'], ['Peso equivalente ativo', totalWeight, 'kg']], sections: [{ title: 'Transportes', columns: [column('date', 'Data', 'date'), column('origin_location_name', 'Origem'), column('destination_location_name', 'Destino'), column('material_name', 'Material'), column('material_codes', 'Códigos'), column('quantity', 'Quantidade', 'number3'), column('primary_unit', 'Unidade'), column('equivalent_weight_kg', 'Peso equivalente (kg)', 'number3'), column('invoice_number', 'Nota fiscal'), column('status_label', 'Status'), column('cancel_reason', 'Motivo cancelamento'), column('notes', 'Observações')], rows: normalized }] };
}

function reportCancellationReason(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.startsWith('{')) {
    try { const parsed = JSON.parse(raw); return parsed.reason || parsed.message || raw; } catch { return raw; }
  }
  return raw;
}

async function stockInventoriesReport(db, period) {
  const inventories = await db`
    SELECT c.id AS inventory_id, c.created_at::date AS date,
      COALESCE(NULLIF(TRIM(u.name), ''), CASE WHEN c.user_id IS NULL THEN '-' ELSE 'Usuário ' || c.user_id::text END) AS user_name,
      c.notes, c.edited_at::date AS edited_date, c.edited_by_user_name, COUNT(i.id)::int AS item_count,
      COALESCE(SUM(ABS(i.counted_qty - i.previous_qty)), 0) AS absolute_difference
    FROM inventory_counts c LEFT JOIN inventory_count_items i ON i.inventory_count_id = c.id LEFT JOIN app_users u ON u.id = c.user_id
    WHERE c.created_at::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date GROUP BY c.id, u.name ORDER BY c.created_at, c.id
  `;
  const inventoryItems = await db`
    SELECT c.created_at::date AS date, c.id AS inventory_id, m.name AS material_name, array_to_string(m.codes, ', ') AS material_codes,
      l.name AS location_name, l.code AS location_code, m.primary_unit, i.previous_qty, i.counted_qty, i.counted_qty - i.previous_qty AS difference,
      c.notes, c.edited_at::date AS edited_date, c.edited_by_user_name
    FROM inventory_count_items i JOIN inventory_counts c ON c.id = i.inventory_count_id JOIN materials m ON m.id = i.material_id JOIN locations l ON l.id = i.location_id
    WHERE c.created_at::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY c.created_at, c.id, m.name, l.name
  `;
  const imports = await db`
    SELECT h.id AS import_id, COALESCE(h.finished_at, h.created_at)::date AS date, h.filename, h.total_rows, h.status, h.error_message,
      COALESCE(NULLIF(TRIM(h.user_name), ''), '-') AS user_name
    FROM import_history h WHERE COALESCE(h.finished_at, h.created_at)::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
    ORDER BY COALESCE(h.finished_at, h.created_at), h.id
  `;
  const importedBalances = await db`
    SELECT COALESCE(h.finished_at, h.created_at)::date AS date, h.id AS import_id, h.filename, m.name AS material_name,
      array_to_string(m.codes, ', ') AS material_codes, m.primary_unit, b.total_locations_qty
    FROM stock_import_material_balances b JOIN import_history h ON h.id = b.import_id JOIN materials m ON m.id = b.material_id
    WHERE h.status = 'success' AND COALESCE(h.finished_at, h.created_at)::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
    ORDER BY COALESCE(h.finished_at, h.created_at), h.id, m.name
  `;
  const totalDifference = inventoryItems.reduce((sum, row) => sum + Math.abs(num(row.difference)), 0);
  const successfulImports = imports.filter(row => String(row.status || '').toLowerCase() === 'success');
  return { summary: [['Inventários realizados', inventories.length, 'integer'], ['Itens inventariados', inventoryItems.length, 'integer'], ['Diferença absoluta inventariada', totalDifference, 'number3'], ['Importações no período', imports.length, 'integer'], ['Importações concluídas', successfulImports.length, 'integer'], ['Saldos importados', importedBalances.length, 'integer']], sections: [
    { title: 'Inventários realizados', columns: [column('date', 'Data', 'date'), column('inventory_id', 'Inventário'), column('user_name', 'Usuário'), column('item_count', 'Itens', 'integer'), column('absolute_difference', 'Diferença absoluta', 'number3'), column('edited_date', 'Data da edição', 'date'), column('edited_by_user_name', 'Editado por'), column('notes', 'Observações')], rows: inventories },
    { title: 'Itens dos inventários', columns: [column('date', 'Data', 'date'), column('inventory_id', 'Inventário'), column('material_name', 'Material'), column('material_codes', 'Códigos'), column('location_name', 'Local'), column('previous_qty', 'Saldo anterior', 'number3'), column('counted_qty', 'Saldo contado', 'number3'), column('difference', 'Diferença', 'number3'), column('primary_unit', 'Unidade')], rows: inventoryItems },
    { title: 'Importações de estoque', columns: [column('date', 'Data', 'date'), column('import_id', 'Importação'), column('filename', 'Arquivo'), column('user_name', 'Usuário'), column('total_rows', 'Registros', 'integer'), column('status', 'Status'), column('error_message', 'Erro')], rows: imports },
    { title: 'Saldos importados', columns: [column('date', 'Data', 'date'), column('import_id', 'Importação'), column('material_name', 'Material'), column('material_codes', 'Códigos'), column('total_locations_qty', 'Saldo total', 'number3'), column('primary_unit', 'Unidade')], rows: importedBalances }
  ] };
}

async function traceabilityReport(db, period) {
  const productions = await db`
    SELECT p.id AS production_id, p.production_date AS date, p.planning_code, p.material_name, p.material_code, p.quantity, p.primary_unit,
      p.secondary_qty, p.secondary_unit, p.machine_name, p.location_name, p.people_count, p.production_model_name, p.benefit_number, p.notes
    FROM production_launches p WHERE p.production_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date
      AND LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada') ORDER BY p.production_date, p.id
  `;
  const consumedInputs = await db`
    SELECT p.id AS production_id, p.production_date AS date, p.planning_code, p.material_name AS produced_material_name, p.material_code AS produced_material_code, p.machine_name,
      COALESCE(input->>'materialName', p.input_material_name) AS input_material_name, COALESCE(input->>'materialCode', p.input_material_code) AS input_material_code,
      COALESCE(input->>'lot', p.consumed_lot) AS consumed_lot,
      NULLIF(COALESCE(input->>'qtyPerOutput', input->>'qty_per_output'), '')::numeric AS qty_per_output,
      COALESCE(NULLIF(COALESCE(input->>'consumedQty', input->>'consumed_qty'), '')::numeric, p.quantity * COALESCE(NULLIF(COALESCE(input->>'qtyPerOutput', input->>'qty_per_output'), '')::numeric, 0)) AS consumed_qty
    FROM production_launches p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.consumed_inputs) = 'array' THEN p.consumed_inputs ELSE '[]'::jsonb END) input
    WHERE p.production_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date AND LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada')
    ORDER BY p.production_date, p.id, COALESCE(input->>'materialName', p.input_material_name)
  `;
  const producedLots = await db`
    SELECT p.id AS production_id, p.production_date AS date, p.planning_code, p.material_name, p.material_code, p.machine_name, lot->>'lot' AS produced_lot,
      COALESCE(lot->>'benefitNumber', lot->>'benefit_number', p.benefit_number) AS benefit_number, NULLIF(lot->>'quantity', '')::numeric AS quantity,
      COALESCE(lot->>'primaryUnit', lot->>'primary_unit', p.primary_unit) AS primary_unit, NULLIF(COALESCE(lot->>'secondaryQty', lot->>'secondary_qty'), '')::numeric AS secondary_qty,
      COALESCE(lot->>'secondaryUnit', lot->>'secondary_unit', p.secondary_unit) AS secondary_unit, NULLIF(COALESCE(lot->>'realWeight', lot->>'real_weight'), '')::numeric AS real_weight,
      COALESCE(lot->>'realWeightUnit', lot->>'real_weight_unit', p.secondary_unit) AS real_weight_unit
    FROM production_launches p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.produced_lots) = 'array' THEN p.produced_lots ELSE '[]'::jsonb END) lot
    WHERE p.production_date BETWEEN ${period.startDate}::date AND ${period.endDate}::date AND LOWER(TRIM(COALESCE(p.status, ''))) NOT IN ('canceled', 'cancelled', 'cancelado', 'cancelada') ORDER BY p.production_date, p.id, lot->>'lot'
  `;
  const materials = new Set(productions.map(row => row.material_code || row.material_name));
  const consumedLots = new Set(consumedInputs.map(row => row.consumed_lot).filter(Boolean));
  const outputLots = new Set(producedLots.map(row => row.produced_lot).filter(Boolean));
  return { summary: [['Produções rastreadas', productions.length, 'integer'], ['Materiais produzidos', materials.size, 'integer'], ['Consumos rastreados', consumedInputs.length, 'integer'], ['Lotes consumidos', consumedLots.size, 'integer'], ['Lotes produzidos', outputLots.size, 'integer']], sections: [
    { title: 'Produções rastreadas', columns: [column('date', 'Data', 'date'), column('production_id', 'Produção'), column('planning_code', 'Plano'), column('material_name', 'Material produzido'), column('material_code', 'Código'), column('quantity', 'Quantidade', 'number3'), column('primary_unit', 'Unidade'), column('machine_name', 'Máquina'), column('location_name', 'Local'), column('people_count', 'Pessoas', 'integer'), column('production_model_name', 'Modelo de produção'), column('benefit_number', 'Beneficiamento')], rows: productions },
    { title: 'Matérias-primas consumidas', columns: [column('date', 'Data', 'date'), column('production_id', 'Produção'), column('planning_code', 'Plano'), column('produced_material_name', 'Material produzido'), column('machine_name', 'Máquina'), column('input_material_name', 'Matéria-prima'), column('input_material_code', 'Código matéria-prima'), column('consumed_lot', 'Lote consumido'), column('qty_per_output', 'Consumo por unidade', 'number6'), column('consumed_qty', 'Quantidade consumida', 'number3')], rows: consumedInputs },
    { title: 'Lotes produzidos', columns: [column('date', 'Data', 'date'), column('production_id', 'Produção'), column('planning_code', 'Plano'), column('material_name', 'Material'), column('machine_name', 'Máquina'), column('produced_lot', 'Lote produzido'), column('benefit_number', 'Beneficiamento'), column('quantity', 'Quantidade', 'number3'), column('primary_unit', 'Unidade'), column('real_weight', 'Peso real', 'number3'), column('real_weight_unit', 'Unidade peso')], rows: producedLots }
  ] };
}

async function cancellationsReport(db, period) {
  const plans = await db`
    SELECT p.id AS plan_id, p.code AS planning_code, p.canceled_at::date AS canceled_date, p.start_date, p.end_date, p.material_name, p.material_code, p.machine_name, p.planned_qty, p.planned_unit, p.cancel_reason
    FROM production_plans p WHERE LOWER(TRIM(COALESCE(p.status, ''))) IN ('canceled', 'cancelled', 'cancelado', 'cancelada') AND p.canceled_at::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY p.canceled_at, p.id
  `;
  const productions = await db`
    SELECT p.id AS production_id, p.production_date, p.canceled_at::date AS canceled_date, p.material_name, p.material_code, p.machine_name, p.location_name, p.quantity, p.primary_unit, p.planning_code, p.cancel_reason
    FROM production_launches p WHERE LOWER(TRIM(COALESCE(p.status, ''))) IN ('canceled', 'cancelled', 'cancelado', 'cancelada') AND p.canceled_at::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY p.canceled_at, p.id
  `;
  const transports = await db`
    SELECT r.id AS transport_id, r.transport_date, r.canceled_at::date AS canceled_date, m.name AS material_name, array_to_string(m.codes, ', ') AS material_codes,
      origin.name AS origin_location_name, destination.name AS destination_location_name, r.quantity, m.primary_unit, r.invoice_number, r.cancel_reason
    FROM stock_transport_records r LEFT JOIN materials m ON m.id = r.material_id LEFT JOIN locations origin ON origin.id = r.origin_location_id LEFT JOIN locations destination ON destination.id = r.destination_location_id
    WHERE LOWER(TRIM(COALESCE(r.status, ''))) IN ('canceled', 'cancelled', 'cancelado', 'cancelada') AND r.canceled_at::date BETWEEN ${period.startDate}::date AND ${period.endDate}::date ORDER BY r.canceled_at, r.id
  `;
  const withReason = rows => rows.map(row => ({ ...row, cancel_reason: reportCancellationReason(row.cancel_reason) }));
  const normalizedPlans = withReason(plans); const normalizedProductions = withReason(productions); const normalizedTransports = withReason(transports);
  return { summary: [['Planejamentos cancelados', normalizedPlans.length, 'integer'], ['Produções canceladas', normalizedProductions.length, 'integer'], ['Transportes cancelados', normalizedTransports.length, 'integer'], ['Total de cancelamentos', normalizedPlans.length + normalizedProductions.length + normalizedTransports.length, 'integer']], sections: [
    { title: 'Planejamentos cancelados', columns: [column('canceled_date', 'Data cancelamento', 'date'), column('planning_code', 'Plano'), column('start_date', 'Início', 'date'), column('end_date', 'Fim', 'date'), column('material_name', 'Material'), column('material_code', 'Código'), column('machine_name', 'Máquina'), column('planned_qty', 'Quantidade', 'number3'), column('planned_unit', 'Unidade'), column('cancel_reason', 'Motivo')], rows: normalizedPlans },
    { title: 'Produções canceladas', columns: [column('canceled_date', 'Data cancelamento', 'date'), column('production_date', 'Data produção', 'date'), column('production_id', 'Produção'), column('planning_code', 'Plano'), column('material_name', 'Material'), column('material_code', 'Código'), column('machine_name', 'Máquina'), column('location_name', 'Local'), column('quantity', 'Quantidade', 'number3'), column('primary_unit', 'Unidade'), column('cancel_reason', 'Motivo')], rows: normalizedProductions },
    { title: 'Transportes cancelados', columns: [column('canceled_date', 'Data cancelamento', 'date'), column('transport_date', 'Data transporte', 'date'), column('transport_id', 'Transporte'), column('origin_location_name', 'Origem'), column('destination_location_name', 'Destino'), column('material_name', 'Material'), column('material_codes', 'Códigos'), column('quantity', 'Quantidade', 'number3'), column('primary_unit', 'Unidade'), column('invoice_number', 'Nota fiscal'), column('cancel_reason', 'Motivo')], rows: normalizedTransports }
  ] };
}

export async function buildDashboardReport(db, request) {
  let content;
  if (request.reportId === 'stock-inventories') content = await stockInventoriesReport(db, request.period);
  else if (request.reportId === 'traceability') content = await traceabilityReport(db, request.period);
  else if (request.reportId === 'cancellations') content = await cancellationsReport(db, request.period);
  else if (request.reportId === 'production-calendar') content = await productionCalendarReport(db, request.period);
  else if (request.reportId === 'purchases-certificates') content = await purchasesCertificatesReport(db, request.period);
  else if (request.reportId === 'transports') content = await transportsReport(db, request.period);
  else if (request.reportId === 'planned-vs-actual') content = await plannedVsActualReport(db, request.period);
  else if (request.reportId === 'unplanned') content = await unplannedReport(db, request.period);
  else {
    const executive = await buildExecutiveDashboard(db, request.period);
    content = request.reportId === 'executive-summary' ? executiveSummary(executive) : request.reportId === 'production' ? productionReport(executive) : request.reportId === 'quality-nbr' ? qualityReport(executive) : meshReport(executive);
  }
  return { id: request.reportId, ...request.definition, period: request.period, generatedAt: new Date().toISOString(), summary: content.summary.map(([label, value, format]) => ({ label, value: num(value), format })), sections: content.sections };
}

export function dashboardReportFilename(report, format) {
  return `${report.filenameBase}-${report.period.startDate}-a-${report.period.endDate}.${format}`;
}
