import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';

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
    { label: 'Quantidade planejada', key: 'planned_qty' },
    { label: 'Período planejado', render: row => `${row.start_date} até ${row.end_date}` },
    { label: 'Quantidade produzida', key: 'actual_qty' },
    { label: 'Percentual', render: row => `${row.percent_done || 0}%` },
    { label: 'Status', key: 'status' }
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
      .map(plan => `<option value="${plan.code}">${plan.code} - ${plan.material_name}</option>`)
      .join('');
    form.elements.material.innerHTML = '<option value="">Todos</option>' + materials
      .map(material => `<option value="${material.name}">${material.name}</option>`)
      .join('');
    form.elements.machine.innerHTML = '<option value="">Todas</option>' + machines
      .map(machine => `<option value="${machine.name}">${machine.name}</option>`)
      .join('');
  }

  async function load() {
    const tracking = await api(`/actuals/tracking?${queryString()}`);
    summaryGrid.innerHTML = `
      <article class="metric-card"><span>Planejada total</span><strong>${tracking.summary.planned_total || 0}</strong></article>
      <article class="metric-card"><span>Realizada total</span><strong>${tracking.summary.actual_total || 0}</strong></article>
      <article class="metric-card"><span>Aderência</span><strong>${tracking.summary.adherence_percent || 0}%</strong></article>
      <article class="metric-card"><span>Em aberto</span><strong>${tracking.summary.late_materials || 0}</strong></article>
    `;
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({ columns, rows: tracking.rows }));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  Promise.all([loadLookups(), load()]).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
