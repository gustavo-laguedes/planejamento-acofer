import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';

export function StockPage() {
  const page = document.createElement('section');
  page.className = 'stack';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Estoque</h1>
        <p>Consulte o saldo importado e aplique correcoes manuais internas.</p>
      </div>
    </div>
    <div class="summary-grid"></div>
    <div class="panel">
      <form class="filters">
        <input name="search" placeholder="Material / descricao" />
        <input name="productCode" placeholder="Codigo do produto" />
        <input name="establishment" placeholder="Estabelecimento" />
        <input name="category" placeholder="Categoria" />
        <input name="group" placeholder="Grupo" />
        <label class="checkbox-line"><input name="controlledOnly" type="checkbox" /> Apenas controlados</label>
        <button class="secondary-button" type="submit">Filtrar</button>
      </form>
      <div class="table-target"></div>
    </div>
  `;

  const summaryGrid = page.querySelector('.summary-grid');
  const tableTarget = page.querySelector('.table-target');
  const filters = page.querySelector('.filters');

  const columns = [
    { label: 'Estab.', key: 'establishment' },
    { label: 'Codigo', key: 'product_code' },
    { label: 'Cod. antigo', key: 'old_product_code' },
    { label: 'Especificacao', key: 'specification' },
    { label: 'Un.', key: 'unit' },
    { label: 'Categoria', key: 'category' },
    { label: 'Grupo', key: 'inventory_group' },
    { label: 'Saldo un.', key: 'fiscal_balance_unit' },
    { label: 'Saldo kg flut.', key: 'fiscal_balance_kg_float' },
    { label: 'Saldo kg teor.', key: 'fiscal_balance_kg_theoretical' },
    { label: 'Vendas un.', key: 'sales_unit' },
    { label: 'Vendas kg', key: 'sales_kg_theoretical' },
    { label: 'Pedidos', key: 'orders_unit' },
    { label: 'Correcao', render: row => `${row.adjustment_unit_qty || 0} un / ${row.adjustment_kg_qty || 0} kg` },
    { label: 'Saldo ajustado', render: row => `${row.adjusted_unit_qty || 0} un / ${row.adjusted_kg_qty || 0} kg` },
    { label: 'Acoes', render: row => `<button class="link-button" data-adjust="${row.product_code}" data-establishment="${row.establishment}">Corrigir estoque</button>` }
  ];

  function qs() {
    const data = Object.fromEntries(new FormData(filters));
    data.controlledOnly = filters.elements.controlledOnly.checked;
    return new URLSearchParams(data).toString();
  }

  async function loadSummary() {
    const summary = await api('/stock/summary');
    const last = summary.lastImport ? `${summary.lastImport.status} - ${summary.lastImport.filename || ''}` : 'Sem importacao';
    summaryGrid.innerHTML = `
      <article class="metric-card"><span>Total de itens</span><strong>${summary.totals.total_items || 0}</strong></article>
      <article class="metric-card"><span>Ultima importacao</span><strong>${last}</strong></article>
      <article class="metric-card"><span>Total de vendas</span><strong>${summary.totals.total_sales_unit || 0}</strong></article>
      <article class="metric-card"><span>Total de pedidos</span><strong>${summary.totals.total_orders_unit || 0}</strong></article>
    `;
  }

  async function loadTable() {
    const rows = await api(`/stock?${qs()}`);
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({ columns, rows }));
  }

  filters.addEventListener('submit', event => {
    event.preventDefault();
    loadTable().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  tableTarget.addEventListener('click', async event => {
    const productCode = event.target.dataset.adjust;
    if (!productCode) return;
    const establishment = event.target.dataset.establishment;
    const adjustmentUnitQty = prompt('Diferenca em unidade:', '0');
    if (adjustmentUnitQty === null) return;
    const adjustmentKgQty = prompt('Diferenca em kg:', '0');
    if (adjustmentKgQty === null) return;
    const reason = prompt('Motivo da correcao:');
    if (!reason) return;
    await api('/stock/adjustments', {
      method: 'POST',
      body: { productCode, establishment, adjustmentUnitQty, adjustmentKgQty, reason }
    });
    await loadTable();
  });

  Promise.all([loadSummary(), loadTable()]).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
