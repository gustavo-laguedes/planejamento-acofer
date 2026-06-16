import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  return `${formatNumber(value)}%`;
}

function formatDateOnly(value) {
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return '';
  const [year, month, day] = dateValue.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return '';
  const text = String(value);
  if (!text.includes('T') || /T00:00:00(?:\.000)?Z?$/.test(text)) return formatDateOnly(text);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? formatDateOnly(text) : DATE_TIME_FORMAT.format(date).replace(',', '');
}

function formatPeriod(row) {
  const start = formatDateTime(row.start_date);
  const end = formatDateTime(row.end_date);
  return start && end ? `${start} até ${end}` : '-';
}

function statusClass(value) {
  const normalized = String(value || '').toLocaleLowerCase('pt-BR');
  if (normalized === 'pendente') return 'pending';
  if (normalized === 'em andamento') return 'in-progress';
  if (normalized === 'concluído' || normalized === 'concluido') return 'done';
  if (normalized === 'cancelado') return 'canceled';
  return 'neutral';
}

function statusPill(value) {
  const label = value || 'Sem status';
  return `<span class="tracking-status-pill ${statusClass(label)}">${escapeHtml(label)}</span>`;
}

export function TrackingPage() {
  const page = document.createElement('section');
  page.className = 'stack tracking-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Produtividade / Acompanhamento</h1>
        <p>Acompanhe o realizado contra planejamentos salvos.</p>
      </div>
    </div>
    <div class="panel">
      <form class="filters tracking-filters">
        <label>Período inicial<input name="startDate" type="date" /></label>
        <label>Período final<input name="endDate" type="date" /></label>
        <label>Código do planejamento<select name="planningCode"><option value="">Todos</option></select></label>
        <label>Material<select name="material"><option value="">Todos</option></select></label>
        <label>Máquina<select name="machine"><option value="">Todas</option></select></label>
        <button class="secondary-button" type="submit">Filtrar</button>
        <button class="secondary-button" type="button" data-action="clear-filters">Limpar Filtros</button>
      </form>
      <div class="summary-grid tracking-summary"></div>
      <div class="table-target"></div>
    </div>
  `;

  const form = page.querySelector('form');
  const summaryGrid = page.querySelector('.summary-grid');
  const tableTarget = page.querySelector('.table-target');
  const columns = [
    { label: 'Código do planejamento', key: 'planning_code' },
    { label: 'Material', key: 'material_name' },
    { label: 'Quantidade planejada', render: row => formatNumber(row.planned_qty), sortValue: row => Number(row.planned_qty || 0) },
    { label: 'Período planejado', render: formatPeriod, sortValue: row => row.start_date },
    { label: 'Quantidade produzida', render: row => formatNumber(row.actual_qty), sortValue: row => Number(row.actual_qty || 0) },
    { label: 'Percentual', render: row => formatPercent(row.percent_done), sortValue: row => Number(row.percent_done || 0) },
    { label: 'Status', render: row => statusPill(row.status), sortValue: row => row.status }
  ];

  function queryString() {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (value) params.set(key, value);
    }
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
      .map(plan => `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.code)} - ${escapeHtml(plan.material_name)}</option>`)
      .join('');
    form.elements.material.innerHTML = '<option value="">Todos</option>' + materials
      .map(material => `<option value="${escapeHtml(material.name)}">${escapeHtml(material.name)}</option>`)
      .join('');
    form.elements.machine.innerHTML = '<option value="">Todas</option>' + machines
      .map(machine => `<option value="${escapeHtml(machine.name)}">${escapeHtml(machine.name)}</option>`)
      .join('');
  }

  async function load() {
    const tracking = await api(`/actuals/tracking?${queryString()}`);
    summaryGrid.innerHTML = `
      <article class="metric-card"><span>Planejada total</span><strong>${formatNumber(tracking.summary.planned_total)}</strong></article>
      <article class="metric-card"><span>Realizada total</span><strong>${formatNumber(tracking.summary.actual_total)}</strong></article>
      <article class="metric-card"><span>Aderência</span><strong>${formatPercent(tracking.summary.adherence_percent)}</strong></article>
      <article class="metric-card"><span>Em aberto</span><strong>${formatNumber(tracking.summary.open_items)}</strong></article>
    `;
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({ columns, rows: tracking.rows }));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  form.querySelector('[data-action="clear-filters"]').addEventListener('click', () => {
    form.reset();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  Promise.all([loadLookups(), load()]).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
