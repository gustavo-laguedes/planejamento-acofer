import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { SummaryCards } from '../shared/SummaryCard.js';
import { TrackingStatusPill, statusPillClass } from '../shared/StatusPill.js';

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

function formatPeriod(startDate, endDate) {
  const start = formatDateOnly(startDate);
  const end = formatDateOnly(endDate);
  if (start && end && start !== end) return `${start} até ${end}`;
  return start || end || '-';
}

function statusClass(value) {
  return statusPillClass(value);
}

function statusPill(value) {
  return TrackingStatusPill(value);
}

function planLinks(plans = []) {
  const validPlans = plans.filter(plan => plan?.id);
  if (!validPlans.length) return '-';
  return validPlans.map(plan => `
    <button class="inline-plan-link" type="button" data-plan-id="${escapeHtml(plan.id)}">
      ${escapeHtml(plan.code || plan.id)}
    </button>
  `).join('<span class="code-separator">, </span>');
}

function renderDetailTable(columns, rows, emptyText = 'Nenhum registro encontrado.') {
  if (!rows?.length) return `<div class="empty-state compact">${emptyText}</div>`;
  return `
    <div class="table-wrap compact-table">
      <table>
        <thead><tr>${columns.map(column => `<th>${column.label}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${columns.map(column => `<td>${column.render ? column.render(row) : escapeHtml(row[column.key] ?? '-')}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function normalizeJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  const parsed = normalizeJsonObject(value);
  return Array.isArray(parsed) ? parsed : [];
}

function openPlanDetailModal(page, detail) {
  page.querySelector('.planning-detail-modal')?.remove();
  const plan = detail.plan || {};
  const operations = normalizeJsonArray(detail.operations || plan.operations);
  const tree = normalizeJsonObject(detail.tree || plan.schedule_tree);
  const productions = Array.isArray(tree.children) ? tree.children : [];
  const period = formatPeriod(plan.period_start_date || plan.start_date, plan.period_end_date || plan.end_date);
  const canceled = statusClass(plan.status) === 'canceled' || String(plan.status || '').toLowerCase() === 'canceled';
  const backdrop = document.createElement('div');
  backdrop.className = `modal-backdrop planning-detail-modal${canceled ? ' is-canceled-planning' : ''}`;
  backdrop.innerHTML = `
    <div class="modal wide-modal planning-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-plan-detail-title">
      ${canceled ? '<div class="planning-canceled-watermark" aria-hidden="true">CANCELADO</div>' : ''}
      <div class="modal-header">
        <div>
          <h2 id="tracking-plan-detail-title">Planejamento ${escapeHtml(plan.code || plan.id)}</h2>
          <p class="modal-subtitle">${escapeHtml(period)} | ${escapeHtml(canceled ? 'Cancelado' : plan.status || 'Sem status')}</p>
        </div>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      <section class="planning-detail-section detail-summary-strip">
        <article><span>Código</span><strong>${escapeHtml(plan.code || plan.id)}</strong></article>
        <article><span>Período planejado</span><strong>${escapeHtml(period)}</strong></article>
        <article><span>Status</span><strong>${statusPill(canceled ? 'Cancelado' : plan.status)}</strong></article>
        <article><span>Operações</span><strong>${operations.length}</strong></article>
      </section>
      <section class="planning-detail-section">
        <h3>Produções incluídas</h3>
        ${renderDetailTable([
          { label: 'Material', render: row => escapeHtml(row.materialName || row.material_name || row.material || '-') },
          { label: 'Quantidade', render: row => escapeHtml(`${formatNumber(row.plannedQty || row.planned_qty || row.quantity)} ${row.unit || row.planned_unit || ''}`.trim()) },
          { label: 'Máquina', render: row => escapeHtml(row.machineName || row.machine_name || '-') },
          { label: 'Pessoas', render: row => escapeHtml(row.peopleCount || row.people_count || '-') }
        ], productions, 'Fluxo produtivo não registrado.')}
      </section>
      <section class="planning-detail-section">
        <h3>Cronograma operacional</h3>
        ${renderDetailTable([
          { label: '#', render: row => escapeHtml(row.sequence || '-') },
          { label: 'Material', render: row => escapeHtml(row.materialName || row.material_name || '-') },
          { label: 'Tipo', render: row => row.operationType === 'transport' ? 'Transporte' : 'Produção' },
          { label: 'Quantidade', render: row => escapeHtml(`${formatNumber(row.produceQty || row.planned_qty || row.quantity)} ${row.unit || ''}`.trim()) },
          { label: 'Máquina', render: row => escapeHtml(row.machineName || row.machine_name || '-') },
          { label: 'Início', render: row => escapeHtml(`${formatDateOnly(row.startDate || row.start_date)} ${row.startTime || ''}`.trim()) },
          { label: 'Fim', render: row => escapeHtml(`${formatDateOnly(row.endDate || row.end_date)} ${row.endTime || ''}`.trim()) }
        ], operations, 'Cronograma operacional não registrado.')}
      </section>
    </div>
  `;
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
  });
  page.appendChild(backdrop);
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
    <div class="panel tracking-filter-panel">
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
    </div>
    <div class="panel tracking-table-card tracking-item-card">
      <div class="section-heading tracking-section-heading"><h2>Acompanhamento por Item/Data</h2></div>
      <div class="table-target"></div>
    </div>
    <div class="panel tracking-table-card tracking-plan-card">
      <div class="section-heading tracking-section-heading"><h2>Acompanhamento por Plano</h2></div>
      <div class="plan-target"></div>
    </div>
    <div class="panel tracking-table-card tracking-unplanned-card">
      <div class="section-heading tracking-section-heading"><h2>Produções não planejadas</h2></div>
      <div class="unplanned-target"></div>
    </div>
  `;

  const form = page.querySelector('form');
  const summaryGrid = page.querySelector('.summary-grid');
  const tableTarget = page.querySelector('.table-target');
  const planTarget = page.querySelector('.plan-target');
  const unplannedTarget = page.querySelector('.unplanned-target');
  let latestTracking = null;

  const columns = [
    { label: 'Código do planejamento', render: row => planLinks(row.plans), sortValue: row => row.planning_codes || row.planning_code || '' },
    { label: 'Material', key: 'material_name' },
    { label: 'Data planejada', render: row => formatDateOnly(row.planned_date) || '-', sortValue: row => row.planned_date },
    { label: 'Quantidade planejada', render: row => formatNumber(row.planned_qty), sortValue: row => Number(row.planned_qty || 0) },
    { label: 'Quantidade produzida', render: row => formatNumber(row.actual_qty), sortValue: row => Number(row.actual_qty || 0) },
    { label: 'Percentual', render: row => formatPercent(row.percent_done), sortValue: row => Number(row.percent_done || 0) },
    { label: 'Status', render: row => statusPill(row.status), sortValue: row => row.status }
  ];

  const planColumns = [
    { label: 'Código do plano', render: row => planLinks([{ id: row.plan_id, code: row.planning_code }]), sortValue: row => row.planning_code },
    { label: 'Período', render: row => formatPeriod(row.period_start_date, row.period_end_date), sortValue: row => row.period_start_date || '' },
    { label: 'Percentual total', render: row => formatPercent(row.percent_done), sortValue: row => Number(row.percent_done || 0) },
    { label: 'Status', render: row => statusPill(row.status), sortValue: row => row.status },
    { label: 'Ação', render: row => `<button class="small-action-button" type="button" data-expand-plan="${escapeHtml(row.plan_id)}">Expandir</button>` }
  ];

  const unplannedColumns = [
    { label: 'Material', key: 'material_name' },
    { label: 'Data produzida', render: row => formatDateOnly(row.production_date) || '-', sortValue: row => row.production_date },
    { label: 'Quantidade produzida', render: row => formatNumber(row.actual_qty), sortValue: row => Number(row.actual_qty || 0) },
    { label: 'Observação/Status', render: row => statusPill(row.status), sortValue: row => row.status }
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
    setInternalLoading(tableTarget, 'Carregando acompanhamento...');
    planTarget.innerHTML = '';
    unplannedTarget.innerHTML = '';
    try {
      const tracking = await api(`/actuals/tracking?${queryString()}`);
      latestTracking = tracking;
      summaryGrid.innerHTML = SummaryCards([
        { label: 'Planejada total', value: formatNumber(tracking.summary.planned_total) },
        { label: 'Realizada total', value: formatNumber(tracking.summary.actual_total) },
        { label: 'Aderência', value: formatPercent(tracking.summary.adherence_percent) },
        { label: 'Em aberto', value: formatNumber(tracking.summary.open_items) }
      ]);
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns,
        rows: tracking.rows,
        rowClass: row => statusClass(row.status) === 'canceled' ? 'tracking-canceled-row' : ''
      }));
      planTarget.innerHTML = '';
      planTarget.appendChild(DataTable({
        columns: planColumns,
        rows: tracking.plans || [],
        rowClass: row => statusClass(row.status) === 'canceled' ? 'tracking-canceled-row' : ''
      }));
      unplannedTarget.innerHTML = '';
      unplannedTarget.appendChild(DataTable({
        columns: unplannedColumns,
        rows: tracking.unplanned || [],
        rowClass: row => statusClass(row.status) === 'canceled' ? 'tracking-canceled-row' : ''
      }));
    } catch (error) {
      setInternalError(tableTarget, error.message || 'Nao foi possivel carregar o acompanhamento.');
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

  page.addEventListener('click', async event => {
    const planButton = event.target.closest('[data-plan-id]');
    if (planButton) {
      try {
        const detail = await api(`/planning/plans/${planButton.dataset.planId}`);
        openPlanDetailModal(page, detail);
      } catch (error) {
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
      }
      return;
    }

    const expandButton = event.target.closest('[data-expand-plan]');
    if (!expandButton || !latestTracking) return;
    const plan = (latestTracking.plans || []).find(row => String(row.plan_id) === String(expandButton.dataset.expandPlan));
    const existing = expandButton.closest('tr')?.nextElementSibling;
    if (existing?.classList.contains('tracking-plan-detail-row')) {
      existing.remove();
      expandButton.textContent = 'Expandir';
      return;
    }
    page.querySelectorAll('.tracking-plan-detail-row').forEach(row => row.remove());
    page.querySelectorAll('[data-expand-plan]').forEach(button => { button.textContent = 'Expandir'; });
    const detailRow = document.createElement('tr');
    detailRow.className = 'tracking-plan-detail-row';
    detailRow.innerHTML = `
      <td colspan="${planColumns.length}">
        ${renderDetailTable([
          { label: 'Material', render: row => escapeHtml(row.material_name || '-') },
          { label: 'Período programado do material', render: row => formatPeriod(row.period_start_date, row.period_end_date) },
          { label: 'Quantidade planejada total', render: row => formatNumber(row.planned_qty) },
          { label: 'Quantidade produzida', render: row => formatNumber(row.actual_qty) },
          { label: 'Percentual', render: row => formatPercent(row.percent_done) },
          { label: 'Status', render: row => `${statusPill(row.status)}${row.anticipated ? ` ${TrackingStatusPill('Antecipado')}` : ''}` }
        ], plan?.materials || [])}
      </td>
    `;
    expandButton.closest('tr')?.after(detailRow);
    expandButton.textContent = 'Recolher';
  });

  Promise.all([loadLookups(), load()]).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
