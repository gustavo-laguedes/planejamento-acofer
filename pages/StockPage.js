import { api } from '../shared/api.js';
import { nextSortDirection, sortTableRows } from '../shared/DataTable.js';

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 3
  }).format(Number(value || 0));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function renderCodes(codes) {
  if (!codes?.length) return '<span class="muted-text">Sem códigos</span>';
  return codes.map(code => `<span class="code-pill">${code}</span>`).join('');
}

function locationCell(row, location, field) {
  return row.stockByLocation?.[String(location.id)]?.[field] ?? 0;
}

function tableMinWidth(locations) {
  const materialWidth = 335;
  const nasajonWidth = locations.length ? locations.length * 210 : 150;
  const inventoryWidth = locations.length ? locations.length * 108 : 150;
  const totalsWidth = 536;
  return materialWidth + nasajonWidth + inventoryWidth + totalsWidth;
}

export function StockPage() {
  const page = document.createElement('section');
  page.className = 'stack stock-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Estoque</h1>
        <p>Saldo por material cadastrado, cruzando códigos atrelados com o último CSV importado.</p>
      </div>
    </div>
    <div class="summary-grid stock-summary"></div>
    <div class="panel stock-panel">
      <form class="filters stock-filters">
        <input name="search" type="search" placeholder="Buscar material ou código" />
        <button class="secondary-button" type="submit">Filtrar</button>
      </form>
      <div class="stock-table-target"></div>
    </div>
  `;

  const summaryGrid = page.querySelector('.stock-summary');
  const tableTarget = page.querySelector('.stock-table-target');
  const filters = page.querySelector('.stock-filters');
  let overview = { locations: [], rows: [], lastImport: null };
  let sortState = { index: null, direction: null };

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
      : 'Sem importação';
    summaryGrid.innerHTML = `
      <article class="metric-card"><span>Última importação</span><strong>${last}</strong><small>${formatDate(overview.lastImport?.finished_at || overview.lastImport?.created_at)}</small></article>
    `;
  }

  function renderTable() {
    const locations = overview.locations || [];
    const stockColumns = buildStockColumns(locations);
    const rows = sortTableRows(filteredRows(), stockColumns, sortState);
    if (!rows.length) {
      tableTarget.innerHTML = '<div class="empty-state">Nenhum material cadastrado encontrado.</div>';
      return;
    }

    const nasajonHeaders = locations.map(location => `
      ${sortableStockHeader(`Nasajon ${location.name}`, stockColumns, 'group-nasajon', sortState)}
      ${sortableStockHeader(`Erro ${location.name}`, stockColumns, 'group-nasajon', sortState)}
    `).join('');
    const inventoryHeaders = locations.map(location => sortableStockHeader(`Inventário ${location.name}`, stockColumns, 'group-inventory', sortState)).join('');
    const nasajonCols = locations.length
      ? locations.map(() => '<col class="col-nasajon" /><col class="col-adjustment" />').join('')
      : '<col class="col-empty" />';
    const inventoryCols = locations.length
      ? locations.map(() => '<col class="col-inventory" />').join('')
      : '<col class="col-empty" />';

    tableTarget.innerHTML = `
      <div class="table-wrap stock-table-wrap">
        <table class="stock-overview-table" style="min-width: ${tableMinWidth(locations)}px">
          <colgroup>
            <col class="col-codes" />
            <col class="col-material" />
            ${nasajonCols}
            ${inventoryCols}
            <col class="col-total" />
            <col class="col-total" />
            <col class="col-total" />
            <col class="col-total" />
            <col class="col-total-estimated" />
          </colgroup>
          <thead>
            <tr>
              <th class="group-material" colspan="2">Material</th>
              <th class="group-nasajon" colspan="${Math.max(locations.length * 2, 1)}">Estoque Nasajon por local</th>
              <th class="group-inventory" colspan="${Math.max(locations.length, 1)}">Inventário físico</th>
              <th class="group-totals" colspan="5">Totais e movimentação</th>
            </tr>
            <tr>
              ${sortableStockHeader('Códigos atrelados', stockColumns, 'group-material', sortState)}
              ${sortableStockHeader('Nome do material', stockColumns, 'group-material', sortState)}
              ${locations.length ? nasajonHeaders : '<th class="group-nasajon">Sem locais cadastrados</th>'}
              ${locations.length ? inventoryHeaders : '<th class="group-inventory">Sem locais cadastrados</th>'}
              ${sortableStockHeader('Qtd. total locais', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Pedidos', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Vendas', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Vendas/dia', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Total estimado', stockColumns, 'group-totals', sortState)}
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
                      aria-label="Erro de inventário ${row.material.name} em ${location.name}"
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

  tableTarget.addEventListener('click', event => {
    const button = event.target.closest('.sortable-header');
    if (!button) return;
    const index = Number(button.dataset.sortIndex);
    const currentDirection = sortState.index === index ? sortState.direction : null;
    sortState = { index, direction: nextSortDirection(currentDirection) };
    if (!sortState.direction) sortState.index = null;
    renderTable();
  });

  load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}

function buildStockColumns(locations) {
  return [
    { label: 'Códigos atrelados', sortValue: row => (row.codes || []).join(', ') },
    { label: 'Nome do material', sortValue: row => row.material?.name || '' },
    ...locations.flatMap(location => [
      { label: `Nasajon ${location.name}`, sortValue: row => locationCell(row, location, 'nasajonQty') },
      { label: `Erro ${location.name}`, sortValue: row => locationCell(row, location, 'errorQty') }
    ]),
    ...locations.map(location => ({ label: `Inventário ${location.name}`, sortValue: row => row.inventoryByLocation?.[String(location.id)] ?? '' })),
    { label: 'Qtd. total locais', sortValue: row => row.totalLocationsQty },
    { label: 'Pedidos', sortValue: row => row.ordersQty },
    { label: 'Vendas', sortValue: row => row.salesQty },
    { label: 'Vendas/dia', sortValue: row => row.salesPerDayQty },
    { label: 'Total estimado', sortValue: row => row.totalEstimatedQty }
  ];
}

function sortableStockHeader(label, columns, className, sortState) {
  const index = columns.findIndex(column => column.label === label);
  const active = sortState.index === index && sortState.direction;
  const indicator = active ? sortState.direction === 'asc' ? '↑' : '↓' : '↕';
  return `
    <th class="${className}">
      <button class="sortable-header ${active ? 'active' : ''}" type="button" data-sort-index="${index}" aria-label="Ordenar por ${label}">
        <span>${label}</span>
        <span class="sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}
