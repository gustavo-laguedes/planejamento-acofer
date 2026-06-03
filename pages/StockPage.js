import { api } from '../shared/api.js';

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 3
  }).format(Number(value || 0));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function renderCodes(codes) {
  if (!codes?.length) return '<span class="muted-text">Sem codigos</span>';
  return codes.map(code => `<span class="code-pill">${code}</span>`).join('');
}

function locationCell(row, location, field) {
  return row.stockByLocation?.[String(location.id)]?.[field] ?? 0;
}

export function StockPage() {
  const page = document.createElement('section');
  page.className = 'stack stock-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Estoque</h1>
        <p>Saldo por material cadastrado, cruzando codigos atrelados com o ultimo CSV importado.</p>
      </div>
    </div>
    <div class="summary-grid stock-summary"></div>
    <div class="panel stock-panel">
      <form class="filters stock-filters">
        <input name="search" type="search" placeholder="Buscar material ou codigo" />
        <button class="secondary-button" type="submit">Filtrar</button>
      </form>
      <div class="stock-table-target"></div>
    </div>
  `;

  const summaryGrid = page.querySelector('.stock-summary');
  const tableTarget = page.querySelector('.stock-table-target');
  const filters = page.querySelector('.stock-filters');
  let overview = { locations: [], rows: [], lastImport: null };

  function filteredRows() {
    const search = String(filters.elements.search.value || '').trim().toLowerCase();
    if (!search) return overview.rows;
    return overview.rows.filter(row => {
      const materialName = String(row.material?.name || '').toLowerCase();
      const codes = (row.codes || []).join(' ').toLowerCase();
      return materialName.includes(search) || codes.includes(search);
    });
  }

  function renderSummary() {
    const last = overview.lastImport
      ? `${overview.lastImport.status} - ${overview.lastImport.filename || ''}`
      : 'Sem importacao';
    summaryGrid.innerHTML = `
      <article class="metric-card"><span>Ultima importacao</span><strong>${last}</strong><small>${formatDate(overview.lastImport?.finished_at || overview.lastImport?.created_at)}</small></article>
    `;
  }

  function renderTable() {
    const locations = overview.locations || [];
    const rows = filteredRows();
    if (!rows.length) {
      tableTarget.innerHTML = '<div class="empty-state">Nenhum material cadastrado encontrado.</div>';
      return;
    }

    const nasajonHeaders = locations.map(location => `
      <th class="group-nasajon">Nasajon ${location.name}</th>
      <th class="group-nasajon">Erro ${location.name}</th>
    `).join('');
    const inventoryHeaders = locations.map(location => `<th class="group-inventory">Inventario ${location.name}</th>`).join('');

    tableTarget.innerHTML = `
      <div class="table-wrap stock-table-wrap">
        <table class="stock-overview-table">
          <thead>
            <tr>
              <th class="group-material" colspan="2">Material</th>
              <th class="group-nasajon" colspan="${Math.max(locations.length * 2, 1)}">Estoque Nasajon por local</th>
              <th class="group-inventory" colspan="${Math.max(locations.length, 1)}">Inventario fisico</th>
              <th class="group-totals" colspan="5">Totais e movimentacao</th>
            </tr>
            <tr>
              <th class="group-material">Codigos atrelados</th>
              <th class="group-material">Nome do material</th>
              ${locations.length ? nasajonHeaders : '<th class="group-nasajon">Sem locais cadastrados</th>'}
              ${locations.length ? inventoryHeaders : '<th class="group-inventory">Sem locais cadastrados</th>'}
              <th class="group-totals">Qtd. total locais</th>
              <th class="group-totals">Pedidos</th>
              <th class="group-totals">Vendas</th>
              <th class="group-totals">Vendas/dia</th>
              <th class="group-totals">Total estimado</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="group-material code-cell">${renderCodes(row.codes)}</td>
                <td class="group-material material-name">${row.material.name}</td>
                ${locations.length ? locations.map(location => `
                  <td class="group-nasajon numeric-cell">${formatNumber(locationCell(row, location, 'nasajonQty'))}</td>
                  <td class="group-nasajon adjustment-cell">
                    <input
                      class="inline-number-input"
                      type="number"
                      step="0.001"
                      value="${locationCell(row, location, 'errorQty')}"
                      data-material-id="${row.material.id}"
                      data-location-id="${location.id}"
                      aria-label="Erro de inventario ${row.material.name} em ${location.name}"
                    />
                  </td>
                `).join('') : '<td class="group-nasajon muted-text">0</td>'}
                ${locations.length ? locations.map(location => `
                  <td class="group-inventory muted-text">${row.inventoryByLocation?.[String(location.id)] ?? '-'}</td>
                `).join('') : '<td class="group-inventory muted-text">-</td>'}
                <td class="group-totals numeric-cell">${formatNumber(row.totalLocationsQty)}</td>
                <td class="group-totals numeric-cell">${formatNumber(row.ordersQty)}</td>
                <td class="group-totals numeric-cell">${formatNumber(row.salesQty)}</td>
                <td class="group-totals numeric-cell">${formatNumber(row.salesPerDayQty)}</td>
                <td class="group-totals numeric-cell total-estimated">${formatNumber(row.totalEstimatedQty)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function load() {
    overview = await api('/stock/materials-overview');
    renderSummary();
    renderTable();
  }

  filters.addEventListener('submit', event => {
    event.preventDefault();
    renderTable();
  });
  filters.elements.search.addEventListener('input', renderTable);

  tableTarget.addEventListener('change', async event => {
    if (!event.target.classList.contains('inline-number-input')) return;
    const input = event.target;
    input.disabled = true;
    try {
      await api('/stock/materials-overview/adjustments', {
        method: 'PUT',
        body: {
          materialId: Number(input.dataset.materialId),
          locationId: Number(input.dataset.locationId),
          adjustmentQty: Number(input.value || 0)
        }
      });
      await load();
    } catch (error) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
      input.disabled = false;
    }
  });

  load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
