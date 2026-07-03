import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { SummaryCards } from '../shared/SummaryCard.js';
import { TrackingStatusPill, PcpStatusPill, statusPillClass } from '../shared/StatusPill.js';

const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';
const STATUS_OPTIONS = ['Programado', 'Em andamento', 'Cumprido', 'Excedido', 'Cancelado'];
const STATUS_ORDER = ['Programado', 'Em andamento', 'Cumprido', 'Excedido', 'Cancelado'];
const CHART_COLORS = {
  planned: '#2F80ED',
  actual: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  muted: '#94A3B8'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value, maximumFractionDigits = 1) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits
  });
}

function formatPercent(value) {
  return `${formatNumber(value, 1)}%`;
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function formatDate(value) {
  const key = dateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '-';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function formatForTooltip(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatPeriod(startDate, endDate) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  if (start !== '-' && end !== '-' && start !== end) return `${start} até ${end}`;
  return start !== '-' ? start : end;
}

function adherence(planned, actual) {
  return planned > 0 ? Number(((actual / planned) * 100).toFixed(1)) : 0;
}

function readStockMinimumDays() {
  const value = String(localStorage.getItem(STOCK_MINIMUM_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return 30;
  return Math.max(Number(value), 1);
}

function stockDurationDays(row) {
  const salesPerDay = toNumber(row.salesPerDayQty);
  const balance = toNumber(row.totalLocationsQty);
  if (salesPerDay <= 0) return null;
  return Math.max(balance, 0) / salesPerDay;
}

function criticalStockRows(stockRows = [], materialFilter = '') {
  const minimumDays = readStockMinimumDays();
  const material = normalizeText(materialFilter);
  return stockRows
    .filter(row => !material || normalizeText(row.material?.name).includes(material))
    .map(row => ({ ...row, durationDays: stockDurationDays(row) }))
    .filter(row => row.durationDays !== null && row.durationDays <= minimumDays)
    .sort((left, right) => left.durationDays - right.durationDays);
}

function matchesStatus(row, status) {
  if (!status) return true;
  return normalizeText(row.status) === normalizeText(status);
}

function matchesStatusClass(row, status) {
  if (!status) return true;
  return statusPillClass(row.status) === statusPillClass(status);
}

function isCanceledStatus(value) {
  return ['canceled', 'cancelled', 'cancelado', 'cancelada'].includes(normalizeText(value));
}

function aggregateBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) || 'Sem informação';
    if (!map.has(key)) map.set(key, { key, planned: 0, actual: 0, count: 0 });
    const item = map.get(key);
    item.planned += toNumber(row.planned_qty);
    item.actual += toNumber(row.actual_qty);
    item.count += 1;
  }
  return [...map.values()].map(item => ({
    ...item,
    planned: Number(item.planned.toFixed(3)),
    actual: Number(item.actual.toFixed(3)),
    percent: adherence(item.planned, item.actual)
  }));
}

function planRowsForTables(plans = [], filters = {}) {
  const material = normalizeText(filters.material);
  return plans
    .filter(plan => matchesStatus(plan, filters.status))
    .filter(plan => !material || (plan.materials || []).some(item => normalizeText(item.material_name).includes(material)))
    .map(plan => ({
      ...plan,
      planned: toNumber(plan.planned_qty),
      actual: toNumber(plan.actual_qty),
      percent: toNumber(plan.percent_done)
    }));
}

function statusFromPercent(percent) {
  if (percent > 100) return 'Excedido';
  if (percent >= 100) return 'Cumprido';
  if (percent > 0) return 'Em andamento';
  return 'Programado';
}

function statusPill(value) {
  return TrackingStatusPill(value);
}

function pcpPill(label, className) {
  return PcpStatusPill({ label, className });
}

function maxValue(values) {
  return Math.max(...values.map(value => toNumber(value)), 1);
}

function emptyChart(text) {
  return `<div class="dashboard-empty-chart">${escapeHtml(text)}</div>`;
}

function plannedActualChart(rows) {
  const daily = aggregateBy(rows, row => dateKey(row.planned_date))
    .filter(item => item.key && item.key !== 'Sem informação')
    .sort((left, right) => left.key.localeCompare(right.key))
    .slice(-14);
  if (!daily.length) return emptyChart('Sem dados no período.');
  const max = maxValue(daily.flatMap(item => [item.planned, item.actual]));
  const width = Math.max(760, daily.length * 66);
  const height = 310;
  const bottom = 48;
  const top = 24;
  const plotHeight = height - bottom - top;
  const groupWidth = width / daily.length;
  const barWidth = Math.min(28, Math.max(14, groupWidth / 3));
  const points = daily.map((item, index) => {
    const x = index * groupWidth + groupWidth / 2;
    const y = height - bottom - ((item.actual / max) * plotHeight);
    return `${x},${y}`;
  }).join(' ');
  return `
    <svg class="dashboard-svg-chart planned-actual-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Planejado x Realizado por dia">
      <line x1="0" y1="${height - bottom}" x2="${width}" y2="${height - bottom}" class="chart-axis" />
      ${daily.map((item, index) => {
        const x = index * groupWidth + groupWidth / 2;
        const plannedHeight = (item.planned / max) * plotHeight;
        const difference = item.actual - item.planned;
        const status = statusFromPercent(item.percent);
        const materialCount = item.count;
        const tooltip = [
          `Data: ${formatDate(item.key)}`,
          `Planejado: ${formatNumber(item.planned)}`,
          `Realizado: ${formatNumber(item.actual)}`,
          `Aderência: ${formatPercent(item.percent)}`,
          `Status: ${status}`,
          `Materiais produzidos: ${materialCount}`,
          `Quantidade: ${formatNumber(item.actual)}`,
          `Diferença: ${formatNumber(difference)}`
        ].join('\n');
        return `
          <rect class="chart-grow-bar" x="${x - (barWidth / 2)}" y="${height - bottom - plannedHeight}" width="${barWidth}" height="${plannedHeight}" rx="4" fill="${CHART_COLORS.planned}">
            <title>${escapeHtml(tooltip)}</title>
          </rect>
          <text x="${x}" y="${height - 18}" text-anchor="middle">${escapeHtml(formatDate(item.key).slice(0, 5))}</text>
        `;
      }).join('')}
      <polyline class="chart-actual-line" points="${points}" fill="none" stroke="${CHART_COLORS.actual}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${daily.map((item, index) => {
        const x = index * groupWidth + groupWidth / 2;
        const y = height - bottom - ((item.actual / max) * plotHeight);
        const difference = item.actual - item.planned;
        const tooltip = [
          `Data: ${formatDate(item.key)}`,
          `Planejado: ${formatNumber(item.planned)}`,
          `Realizado: ${formatNumber(item.actual)}`,
          `Aderência: ${formatPercent(item.percent)}`,
          `Status: ${statusFromPercent(item.percent)}`,
          `Materiais produzidos: ${item.count}`,
          `Quantidade: ${formatNumber(item.actual)}`,
          `Diferença: ${formatNumber(difference)}`
        ].join('\n');
        return `<circle class="chart-line-point" cx="${x}" cy="${y}" r="5" fill="${CHART_COLORS.actual}"><title>${escapeHtml(tooltip)}</title></circle>`;
      }).join('')}
    </svg>
    <div class="chart-legend"><span><i style="background:${CHART_COLORS.planned}"></i>Planejado</span><span><i style="background:${CHART_COLORS.actual}"></i>Realizado</span></div>
  `;
}

function horizontalBars(rows, labelKey = 'key', valueKey = 'percent', options = {}) {
  const items = rows.slice(0, 8);
  if (!items.length) return emptyChart('Sem dados para exibir.');
  const max = maxValue(items.map(item => item[valueKey]));
  return `
    <div class="horizontal-bars">
      ${items.map(item => {
        const value = toNumber(item[valueKey]);
        const tooltip = typeof options.tooltip === 'function' ? options.tooltip(item) : '';
        const meta = typeof options.meta === 'function' ? options.meta(item) : `${formatNumber(item.planned)} planejado | ${formatNumber(item.actual)} realizado`;
        return `
          <div class="horizontal-bar-row" title="${escapeHtml(formatForTooltip(tooltip || meta))}">
            <span><strong>${escapeHtml(item[labelKey])}</strong><small>${escapeHtml(meta)}</small></span>
            <div class="horizontal-bar-track"><i style="width:${Math.min((value / max) * 100, 100)}%"></i></div>
            <em>${valueKey === 'percent' ? formatPercent(value) : formatNumber(value)}</em>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function machineChart(rows) {
  const machines = aggregateBy(rows, row => row.machine_name)
    .sort((left, right) => right.actual - left.actual || right.planned - left.planned)
    .slice(0, 10);
  if (!machines.length) return emptyChart('Sem produção por máquina.');
  return horizontalBars(machines, 'key', 'percent', {
    meta: item => `${formatNumber(item.planned)} planejado | ${formatNumber(item.actual)} realizado`,
    tooltip: item => [
      `Máquina: ${item.key}`,
      `Planejado: ${formatNumber(item.planned)}`,
      `Realizado: ${formatNumber(item.actual)}`,
      `Utilização: ${formatPercent(item.percent)}`
    ].join('\n')
  });
}

function donutChart(plans) {
  const counts = STATUS_ORDER.map(status => ({
    status,
    count: plans.filter(plan => normalizeText(plan.status) === normalizeText(status)).length
  }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  if (!total) return emptyChart('Sem planos no filtro.');
  let offset = 25;
  const colors = ['#2F80ED', '#D97706', '#16A34A', '#7C3AED', '#DC2626'];
  const segments = counts.map((item, index) => {
    const value = (item.count / total) * 100;
    const segment = `<circle r="38" cx="50" cy="50" fill="transparent" stroke="${colors[index]}" stroke-width="16" stroke-dasharray="${value} ${100 - value}" stroke-dashoffset="${offset}" />`;
    offset -= value;
    return segment;
  }).join('');
  return `
    <div class="dashboard-donut-wrap">
      <svg class="dashboard-donut" viewBox="0 0 100 100" role="img" aria-label="Status dos planejamentos">
        <circle r="38" cx="50" cy="50" fill="transparent" stroke="#E5E7EB" stroke-width="16" />
        ${segments}
        <text x="50" y="47" text-anchor="middle">${total}</text>
        <text x="50" y="60" text-anchor="middle">planos</text>
      </svg>
      <div class="dashboard-status-list">
        ${counts.map((item, index) => `<span><i style="background:${colors[index]}"></i>${escapeHtml(item.status)} <strong>${item.count}</strong></span>`).join('')}
      </div>
    </div>
  `;
}

function criticalStockChart(rows) {
  if (!rows.length) return emptyChart('Nenhum item crítico pelo mínimo atual.');
  return `
    <div class="critical-stock-list">
      ${rows.slice(0, 8).map(row => `
        <article>
          <strong>${escapeHtml(row.material?.name || 'Material')}</strong>
          <span>${formatNumber(row.totalLocationsQty, 2)} em estoque</span>
          ${pcpPill(`${formatNumber(row.durationDays, 1)} dias`, row.durationDays <= readStockMinimumDays() * 0.5 ? 'critical' : 'attention')}
        </article>
      `).join('')}
    </div>
  `;
}

function unplannedChart(rows) {
  if (!rows.length) return emptyChart('Sem produções não planejadas.');
  const grouped = aggregateBy(rows.map(row => ({
    material_name: row.material_name,
    planned_qty: 0,
    actual_qty: row.actual_qty
  })), row => row.material_name).sort((left, right) => right.actual - left.actual);
  return horizontalBars(grouped, 'key', 'actual', {
    meta: item => `${formatNumber(item.actual)} produzido fora do plano`,
    tooltip: item => [
      `Material: ${item.key}`,
      `Quantidade: ${formatNumber(item.actual)}`,
      `Status: Produção não planejada`
    ].join('\n')
  });
}

function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function tableSheet(title, columns, rows) {
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead><tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
}

function exportExcel(data) {
  if (!data) return;
  const indicators = [
    ['Produção planejada', formatNumber(data.plannedTotal)],
    ['Produção realizada', formatNumber(data.actualTotal)],
    ['Aderência geral', formatPercent(adherence(data.plannedTotal, data.actualTotal))],
    ['Em aberto', formatNumber(Math.max(data.plannedTotal - data.actualTotal, 0))],
    ['Itens críticos de estoque', formatNumber(data.criticalRows.length, 0)],
    ['Produções não planejadas', formatNumber(data.unplanned.length, 0)]
  ];
  const html = `
    <html><head><meta charset="UTF-8"></head><body>
      <h1>Dashboard Executivo Aço-Fer</h1>
      <h2>Indicadores</h2>
      <table>${indicators.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
      ${tableSheet('Resumo por material', [
        { label: 'Material', value: row => row.key },
        { label: 'Planejado', value: row => formatNumber(row.planned) },
        { label: 'Realizado', value: row => formatNumber(row.actual) },
        { label: 'Aderência', value: row => formatPercent(row.percent) }
      ], data.materialSummary)}
      ${tableSheet('Resumo por máquina', [
        { label: 'Máquina', value: row => row.key },
        { label: 'Planejado', value: row => formatNumber(row.planned) },
        { label: 'Realizado', value: row => formatNumber(row.actual) },
        { label: 'Utilização', value: row => formatPercent(row.percent) }
      ], data.machineSummary)}
      ${tableSheet('Resumo por plano', [
        { label: 'Código', value: row => row.planning_code || row.plan_id || '-' },
        { label: 'Período', value: row => formatPeriod(row.period_start_date, row.period_end_date) },
        { label: 'Status', value: row => row.status || '-' },
        { label: 'Planejado', value: row => formatNumber(row.planned) },
        { label: 'Realizado', value: row => formatNumber(row.actual) },
        { label: 'Percentual', value: row => formatPercent(row.percent) }
      ], data.plans)}
      ${tableSheet('Produções não planejadas', [
        { label: 'Material', value: row => row.material_name || '-' },
        { label: 'Data', value: row => formatDate(row.production_date) },
        { label: 'Quantidade', value: row => formatNumber(row.actual_qty) },
        { label: 'Status', value: row => row.status || '-' }
      ], data.unplanned)}
    </body></html>
  `;
  downloadFile(`dashboard-executivo-acofer-${dateKey(new Date())}.xls`, 'application/vnd.ms-excel;charset=utf-8', html);
}

function exportPdf(page, data) {
  if (!data) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Permita pop-ups para exportar o PDF.' }));
    return;
  }
  const dashboardHtml = page.querySelector('.dashboard-target')?.innerHTML || '';
  const summaryHtml = page.querySelector('.dashboard-summary')?.innerHTML || '';
  const baseHref = new URL('./', window.location.href).href;
  printWindow.document.write(`
    <html>
      <head>
        <meta charset="UTF-8" />
        <base href="${escapeHtml(baseHref)}" />
        <title>Dashboard Executivo Aço-Fer</title>
        <link rel="stylesheet" href="./style.css" />
        <style>
          body { background:#fff; padding:24px; }
          .pdf-header { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #d8dee6; padding-bottom:16px; margin-bottom:18px; }
          .pdf-header img { height:54px; }
          .pdf-header h1 { margin:0; font-size:24px; }
          .dashboard-charts-grid, .dashboard-tables-grid { break-inside: avoid; }
          .reports-panel, .dashboard-filter-panel { display:none; }
          @media print { body { padding:0; } .panel, .metric-card { box-shadow:none; } }
        </style>
      </head>
      <body>
        <header class="pdf-header">
          <div><h1>Dashboard Executivo</h1><p>Aço-Fer | ${formatDate(dateKey(new Date()))}</p></div>
          <img src="./assets/logo-acofer.png" alt="Aço-Fer" />
        </header>
        <section class="summary-grid dashboard-summary">${summaryHtml}</section>
        <main class="dashboard-target">${dashboardHtml}</main>
        <section class="panel"><h2>Resumo final</h2><p>Planejado: ${formatNumber(data.plannedTotal)} | Realizado: ${formatNumber(data.actualTotal)} | Aderência: ${formatPercent(adherence(data.plannedTotal, data.actualTotal))}</p></section>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 350);
}

function animateDashboard(page) {
  page.querySelectorAll('.metric-card strong').forEach(element => {
    const original = element.textContent;
    const match = String(original).match(/^-?[\d.]+(?:,\d+)?/);
    if (!match) return;
    const numeric = Number(match[0].replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(numeric)) return;
    const suffix = String(original).slice(match[0].length);
    const duration = 650;
    const start = performance.now();
    const decimals = match[0].includes(',') ? 1 : 0;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${formatNumber(numeric * eased, decimals)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
      else element.textContent = original;
    }
    requestAnimationFrame(tick);
  });
}

function renderReportActions() {
  return `
    <section class="panel reports-panel">
      <div class="section-heading">
        <div>
          <h2>Relatórios</h2>
          <p class="muted-text">Exportações executivas com indicadores, gráficos e tabelas do filtro atual.</p>
        </div>
      </div>
      <div class="reports-actions">
        <button class="secondary-button" type="button" data-export-excel>Exportar Excel</button>
        <button class="secondary-button" type="button" data-export-pdf>Exportar PDF</button>
      </div>
    </section>
  `;
}

export function DashboardReportsPage() {
  const page = document.createElement('section');
  page.className = 'stack dashboard-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard / Relatórios</h1>
        <p>Indicadores, gráficos e análises de produção.</p>
      </div>
    </div>
    <section class="panel dashboard-filter-panel">
      <form class="filters dashboard-filters">
        <label>Data inicial<input name="startDate" type="date" /></label>
        <label>Data final<input name="endDate" type="date" /></label>
        <label>Material<select name="material"><option value="">Todos</option></select></label>
        <label>Máquina<select name="machine"><option value="">Todas</option></select></label>
        <label>Código do planejamento<select name="planningCode"><option value="">Todos</option></select></label>
        <label>Status<select name="status"><option value="">Todos</option></select></label>
        <button class="secondary-button" type="submit">Filtrar</button>
        <button class="secondary-button" type="button" data-action="clear-filters">Limpar</button>
      </form>
    </section>
    <div class="summary-grid dashboard-summary"></div>
    <div class="dashboard-target"></div>
    ${renderReportActions()}
  `;

  const form = page.querySelector('form');
  const summaryGrid = page.querySelector('.dashboard-summary');
  const target = page.querySelector('.dashboard-target');
  let stockRows = [];
  let latestDashboardData = null;

  function queryString() {
    const params = new URLSearchParams();
    ['startDate', 'endDate', 'material', 'machine', 'planningCode'].forEach(key => {
      const value = form.elements[key].value;
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  async function loadLookups() {
    const [plans, materials, machines] = await Promise.all([
      api('/planning/plans'),
      api('/materials'),
      api('/machines')
    ]);
    form.elements.planningCode.innerHTML = '<option value="">Todos</option>' + plans
      .filter(plan => plan.code)
      .map(plan => `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.code)} - ${escapeHtml(plan.material_name || '')}</option>`)
      .join('');
    form.elements.material.innerHTML = '<option value="">Todos</option>' + materials
      .map(material => `<option value="${escapeHtml(material.name)}">${escapeHtml(material.name)}</option>`)
      .join('');
    form.elements.machine.innerHTML = '<option value="">Todas</option>' + machines
      .map(machine => `<option value="${escapeHtml(machine.name)}">${escapeHtml(machine.name)}</option>`)
      .join('');
    form.elements.status.innerHTML = '<option value="">Todos</option>' + STATUS_OPTIONS
      .map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`)
      .join('');
  }

  function renderTables(materialSummary, machineSummary, plans) {
    const materialRows = materialSummary
      .sort((left, right) => right.planned - left.planned || right.actual - left.actual)
      .slice(0, 50);
    const machineRows = machineSummary
      .sort((left, right) => right.actual - left.actual || right.planned - left.planned)
      .slice(0, 50);
    const planRows = plans
      .sort((left, right) => String(right.period_start_date || '').localeCompare(String(left.period_start_date || '')))
      .slice(0, 50);

    const tables = document.createElement('div');
    tables.className = 'dashboard-tables-grid';
    tables.innerHTML = `
      <section class="panel dashboard-table-panel"><div class="section-heading"><h2>Resumo por material</h2></div><div class="dashboard-material-table"></div></section>
      <section class="panel dashboard-table-panel"><div class="section-heading"><h2>Resumo por máquina</h2></div><div class="dashboard-machine-table"></div></section>
      <section class="panel dashboard-table-panel dashboard-table-wide"><div class="section-heading"><h2>Resumo por plano</h2></div><div class="dashboard-plan-table"></div></section>
    `;
    tables.querySelector('.dashboard-material-table').appendChild(DataTable({
      columns: [
        { label: 'Material', render: row => escapeHtml(row.key), sortValue: row => row.key },
        { label: 'Planejado', render: row => formatNumber(row.planned), sortValue: row => row.planned },
        { label: 'Realizado', render: row => formatNumber(row.actual), sortValue: row => row.actual },
        { label: 'Aderência', render: row => formatPercent(row.percent), sortValue: row => row.percent },
        { label: 'Status', render: row => statusPill(statusFromPercent(row.percent)), sortValue: row => statusFromPercent(row.percent) }
      ],
      rows: materialRows
    }));
    tables.querySelector('.dashboard-machine-table').appendChild(DataTable({
      columns: [
        { label: 'Máquina', render: row => escapeHtml(row.key), sortValue: row => row.key },
        { label: 'Planejado', render: row => formatNumber(row.planned), sortValue: row => row.planned },
        { label: 'Realizado', render: row => formatNumber(row.actual), sortValue: row => row.actual },
        { label: 'Aderência/Utilização', render: row => formatPercent(row.percent), sortValue: row => row.percent }
      ],
      rows: machineRows
    }));
    tables.querySelector('.dashboard-plan-table').appendChild(DataTable({
      columns: [
        { label: 'Código', render: row => escapeHtml(row.planning_code || row.plan_id || '-'), sortValue: row => row.planning_code || '' },
        { label: 'Período', render: row => formatPeriod(row.period_start_date, row.period_end_date), sortValue: row => row.period_start_date || '' },
        { label: 'Status', render: row => statusPill(row.status), sortValue: row => row.status },
        { label: 'Planejado', render: row => formatNumber(row.planned), sortValue: row => row.planned },
        { label: 'Realizado', render: row => formatNumber(row.actual), sortValue: row => row.actual },
        { label: 'Percentual', render: row => formatPercent(row.percent), sortValue: row => row.percent }
      ],
      rows: planRows,
      rowClass: row => statusPillClass(row.status) === 'canceled' ? 'tracking-canceled-row' : ''
    }));
    target.appendChild(tables);
  }

  function renderDashboard(tracking) {
    const status = form.elements.status.value;
    const rows = (tracking.rows || []).filter(row => matchesStatus(row, status));
    const plans = planRowsForTables(tracking.plans || [], {
      material: form.elements.material.value,
      status
    });
    const unplanned = (tracking.unplanned || []).filter(row => matchesStatusClass(row, status));
    const activeRows = rows.filter(row => !isCanceledStatus(row.status));
    const activePlans = plans.filter(plan => !isCanceledStatus(plan.status));
    const activeUnplanned = unplanned.filter(row => !isCanceledStatus(row.status));
    const criticalRows = criticalStockRows(stockRows, form.elements.material.value);
    const plannedTotal = activeRows.reduce((sum, row) => sum + toNumber(row.planned_qty), 0);
    const actualTotal = activeRows.reduce((sum, row) => sum + toNumber(row.actual_qty), 0);
    const materialSummary = aggregateBy(activeRows, row => row.material_name);
    const machineSummary = aggregateBy(activeRows, row => row.machine_name);
    const canceledPlans = plans.filter(plan => isCanceledStatus(plan.status)).length;
    const inProgressPlans = activePlans.filter(plan => normalizeText(plan.status) === normalizeText('Em andamento')).length;
    latestDashboardData = {
      rows: activeRows,
      plans: activePlans,
      unplanned: activeUnplanned,
      criticalRows,
      materialSummary,
      machineSummary,
      plannedTotal,
      actualTotal
    };

    summaryGrid.innerHTML = SummaryCards([
      { label: 'Produção planejada', value: formatNumber(plannedTotal) },
      { label: 'Produção realizada', value: formatNumber(actualTotal) },
      { label: 'Aderência geral', value: formatPercent(adherence(plannedTotal, actualTotal)) },
      { label: 'Em aberto', value: formatNumber(Math.max(plannedTotal - actualTotal, 0)) },
      { label: 'Itens críticos de estoque', value: formatNumber(criticalRows.length, 0), detail: `${readStockMinimumDays()} dias mínimos` },
      { label: 'Planejamentos cancelados', value: formatNumber(canceledPlans, 0) },
      { label: 'Produções não planejadas', value: formatNumber(activeUnplanned.length, 0) },
      { label: 'Planos em andamento', value: formatNumber(inProgressPlans, 0) }
    ]);

    target.innerHTML = `
      <div class="dashboard-charts-grid">
        <section class="panel dashboard-chart-card dashboard-chart-wide"><div class="section-heading"><h2>Planejado x Realizado por dia</h2></div>${plannedActualChart(activeRows)}</section>
        <section class="panel dashboard-chart-card dashboard-status-feature"><div class="section-heading"><h2>Status dos planejamentos</h2></div>${donutChart(activePlans)}</section>
        <section class="panel dashboard-chart-card dashboard-material-feature"><div class="section-heading"><h2>Aderência por material</h2></div>${horizontalBars(materialSummary.sort((left, right) => right.planned - left.planned), 'key', 'percent', {
          meta: item => `${formatNumber(item.planned)} planejado | ${formatNumber(item.actual)} realizado`,
          tooltip: item => [
            `Material: ${item.key}`,
            `Percentual: ${formatPercent(item.percent)}`,
            `Quantidade planejada: ${formatNumber(item.planned)}`,
            `Quantidade realizada: ${formatNumber(item.actual)}`
          ].join('\n')
        })}</section>
        <section class="panel dashboard-chart-card dashboard-machine-feature"><div class="section-heading"><h2>Produção por máquina</h2></div>${machineChart(activeRows)}</section>
        <section class="panel dashboard-chart-card dashboard-critical-feature"><div class="section-heading"><h2>Top materiais críticos</h2></div>${criticalStockChart(criticalRows)}</section>
        <section class="panel dashboard-chart-card dashboard-unplanned-feature"><div class="section-heading"><h2>Produções não planejadas</h2></div>${unplannedChart(activeUnplanned)}</section>
      </div>
    `;
    renderTables(materialSummary, machineSummary, activePlans);
    animateDashboard(page);
  }

  async function load() {
    setInternalLoading(target, 'Carregando dashboard...');
    try {
      const [tracking, stock] = await Promise.all([
        api(`/actuals/tracking?${queryString()}`),
        api('/stock/materials-overview')
      ]);
      stockRows = stock.rows || [];
      renderDashboard(tracking);
    } catch (error) {
      setInternalError(target, error.message || 'Nao foi possivel carregar o dashboard.');
      throw error;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  form.querySelector('[data-action="clear-filters"]').addEventListener('click', () => {
    form.reset();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  page.querySelector('[data-export-excel]')?.addEventListener('click', () => exportExcel(latestDashboardData));
  page.querySelector('[data-export-pdf]')?.addEventListener('click', () => exportPdf(page, latestDashboardData));

  Promise.all([loadLookups(), load()]).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
