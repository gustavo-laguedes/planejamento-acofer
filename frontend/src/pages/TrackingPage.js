import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';

export function TrackingPage() {
  const page = document.createElement('section');
  page.className = 'stack';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Produtividade / Acompanhamento</h1>
        <p>Lance a producao realizada e compare com o planejamento salvo.</p>
      </div>
    </div>
    <div class="panel">
      <form class="grid-form actual-form">
        <label>Data<input name="productionDate" type="date" required /></label>
        <label>Material<input name="materialName" required /></label>
        <label>Codigo<input name="materialCode" /></label>
        <label>Maquina<input name="machineName" /></label>
        <label>Quantidade produzida<input name="actualQty" type="number" step="0.001" required /></label>
        <label>Unidade<input name="actualUnit" value="un" /></label>
        <label>Observacao<input name="notes" /></label>
        <div class="form-actions"><button class="primary-button" type="submit">Salvar lancamento</button></div>
      </form>
    </div>
    <div class="summary-grid"></div>
    <div class="panel table-target"></div>
  `;

  const form = page.querySelector('form');
  const summaryGrid = page.querySelector('.summary-grid');
  const tableTarget = page.querySelector('.table-target');
  const columns = [
    { label: 'Data', key: 'planned_date' },
    { label: 'Material', key: 'material_name' },
    { label: 'Programado', key: 'planned_qty' },
    { label: 'Realizado', key: 'actual_qty' },
    { label: 'Diferenca', key: 'difference' },
    { label: 'Status', key: 'status' }
  ];

  async function load() {
    const tracking = await api('/actuals/tracking');
    summaryGrid.innerHTML = `
      <article class="metric-card"><span>Planejada total</span><strong>${tracking.summary.planned_total || 0}</strong></article>
      <article class="metric-card"><span>Realizada total</span><strong>${tracking.summary.actual_total || 0}</strong></article>
      <article class="metric-card"><span>Aderencia</span><strong>${tracking.summary.adherence_percent || 0}%</strong></article>
      <article class="metric-card"><span>Materiais atrasados</span><strong>${tracking.summary.late_materials || 0}</strong></article>
    `;
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({ columns, rows: tracking.rows }));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.actualQty = Number(data.actualQty);
    await api('/actuals', { method: 'POST', body: data });
    form.reset();
    await load();
  });

  load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
