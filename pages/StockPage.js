import { api } from '../shared/api.js';
import { getCurrentUser } from '../shared/api.js';
import { nextSortDirection, sortTableRows } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';
import { SummaryCard } from '../shared/SummaryCard.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';

function formatNumber(value, maximumFractionDigits = 3, minimumFractionDigits = 0) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits,
    minimumFractionDigits
  }).format(Number(value || 0));
}

function formatBrowserToday() {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());
}

function formatImportDateTime(value) {
  if (!value) return 'Sem importação';
  const date = new Date(value);
  const day = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const time = date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${day} às ${time}`;
}

function formatSales(row) {
  if (row.salesBlocked) return '*';
  if (row.salesNotEstimated || row.salesPerDayQty === null || row.salesPerDayQty === undefined) return 'Não estimado';
  return formatNumber(row.salesPerDayQty);
}

function formatSalesPeriod(row) {
  if (row.salesBlocked) return '*';
  return formatNumber(row.salesPeriodQty || 0);
}

function currentStockDurationDays(row) {
  const baseBalance = Number(row.totalLocationsQty);
  const salesPerDay = Number(row.salesPerDayQty);
  if (!Number.isFinite(baseBalance)) return null;
  if (!Number.isFinite(salesPerDay) || salesPerDay <= 0) return null;
  return Math.max(baseBalance, 0) / salesPerDay;
}

function formatDuration(row) {
  if (row.salesBlocked) return '*';
  const durationDays = currentStockDurationDays(row);
  if (durationDays === null) return '*';
  return `${formatNumber(durationDays, 1, 1)} dias`;
}

function readStockMinimumDays() {
  const value = String(localStorage.getItem(STOCK_MINIMUM_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : null;
}

function saveStockMinimumDays(value) {
  const days = String(value || '').trim();
  if (!days) {
    localStorage.removeItem(STOCK_MINIMUM_DAYS_KEY);
    return null;
  }
  if (!/^\d+$/.test(days)) return readStockMinimumDays();
  const number = Number(days);
  if (!Number.isInteger(number) || number <= 0) {
    localStorage.removeItem(STOCK_MINIMUM_DAYS_KEY);
    return null;
  }
  localStorage.setItem(STOCK_MINIMUM_DAYS_KEY, String(number));
  return number;
}

function isStockDurationBelowMinimum(row, stockMinimumDays) {
  if (!stockMinimumDays) return false;
  const durationDays = currentStockDurationDays(row);
  return durationDays !== null && durationDays <= stockMinimumDays;
}

function codeRows(row) {
  return row.codeBreakdown?.length ? row.codeBreakdown : [{ code: '', stockByLocation: row.stockByLocation || {} }];
}

function renderCodes(row) {
  const codes = row.codes || [];
  if (!codes.length) return '<span class="muted-text">Sem códigos</span>';
  if (codes.length === 1) return `<span class="code-pill">${escapeHtml(codes[0])}</span>`;
  return `
    <div class="stock-code-pill-stack">
      ${codes.map(code => `<div class="stock-code-pill-row"><span class="code-pill">${escapeHtml(code)}</span></div>`).join('')}
    </div>
  `;
}

function renderCodeLocationRows(row, location, field) {
  const rows = codeRows(row);
  if (rows.length === 1) {
    return formatNumber(rows[0].stockByLocation?.[String(location.id)]?.[field] ?? 0);
  }
  return `<div class="stock-code-stack numeric-stack">${rows.map(codeRow => (
    `<span>${formatNumber(codeRow.stockByLocation?.[String(location.id)]?.[field] ?? 0)}</span>`
  )).join('')}</div>`;
}

function locationCell(row, location, field) {
  return row.stockByLocation?.[String(location.id)]?.[field] ?? 0;
}

function correctionCell(row, canWrite) {
  if (!canWrite) return formatNumber(row.correctionQty || 0);
  return `
    <div class="correction-cell" data-material-id="${row.material.id}">
      <input class="correction-input" type="number" step="0.001" value="${row.correctionQty || 0}" disabled />
      <button class="icon-edit-button edit-correction" type="button" title="Editar correção" aria-label="Editar correção">✎</button>
      <button class="icon-edit-button save-correction" type="button" title="Salvar correção" aria-label="Salvar correção" hidden>✓</button>
    </div>
  `;
}

export function StockPage() {
  const canWriteStock = canAccess(getCurrentUser(), 'stock:write');
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
  let stockMinimumDays = readStockMinimumDays();

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
    const last = formatImportDateTime(overview.lastImport?.finished_at || overview.lastImport?.created_at);
    const periodStart = String(overview.lastImport?.period_start || '').slice(0, 10);
    const periodEnd = String(overview.lastImport?.period_end || '').slice(0, 10);
    summaryGrid.innerHTML = `
      ${SummaryCard({ label: 'Última importação', value: last, detail: overview.lastImport?.filename || '' })}
      <article class="metric-card stock-period-card">
        <span>Período das vendas - ${escapeHtml(formatBrowserToday())}</span>
        <form class="stock-period-form">
          <label>Período inicial<input name="periodStart" type="date" value="${escapeHtml(periodStart)}" ${canWriteStock ? '' : 'disabled'} /></label>
          <label>Período final<input name="periodEnd" type="date" value="${escapeHtml(periodEnd)}" ${canWriteStock ? '' : 'disabled'} /></label>
          <span class="stock-period-business-days">Dias úteis contabilizados<strong>${Number(overview.lastImport?.business_days || 0)}</strong></span>
          ${canWriteStock ? '<button class="secondary-button" type="submit">Aplicar período</button>' : ''}
        </form>
      </article>
      <article class="metric-card stock-minimum-card">
        <span>ESTOQUE MÍNIMO</span>
        <label>Dias mínimos<input name="stockMinimumDays" type="number" inputmode="numeric" min="1" step="1" placeholder="30" value="${stockMinimumDays || ''}" /></label>
      </article>
    `;
    summaryGrid.querySelector('.stock-period-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await api('/stock/import-period', {
          method: 'PUT',
          body: {
            periodStart: event.currentTarget.elements.periodStart.value,
            periodEnd: event.currentTarget.elements.periodEnd.value
          }
        });
        await load();
      } catch (error) {
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
        submit.disabled = false;
      }
    });
    const minimumInput = summaryGrid.querySelector('[name="stockMinimumDays"]');
    minimumInput?.addEventListener('input', event => {
      const input = event.currentTarget;
      if (input.value && !/^\d+$/.test(input.value)) {
        input.value = String(stockMinimumDays || '');
        return;
      }
      stockMinimumDays = saveStockMinimumDays(input.value);
      if (input.value === '0') input.value = '';
      renderTable();
    });
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
    const nasajonCols = locations.length
      ? locations.map(() => '<col class="col-nasajon" /><col class="col-adjustment" />').join('')
      : '<col class="col-empty" />';

    tableTarget.innerHTML = `
      <div class="table-wrap stock-table-wrap">
        <table class="stock-overview-table">
          <colgroup>
            <col class="col-codes" />
            <col class="col-material" />
            ${nasajonCols}
            <col class="col-correction" />
            <col class="col-total" />
            <col class="col-total" />
            <col class="col-total" />
            <col class="col-total-estimated" />
          </colgroup>
          <thead>
            <tr>
              <th class="group-material" colspan="2">Material</th>
              <th class="group-nasajon" colspan="${Math.max(locations.length * 2, 1)}">Estoque Nasajon por local</th>
              <th class="group-totals" colspan="5">Totais e movimentação</th>
            </tr>
            <tr>
              ${sortableStockHeader('Código', stockColumns, 'group-material', sortState)}
              ${sortableStockHeader('Nome do material', stockColumns, 'group-material', sortState)}
              ${locations.length ? nasajonHeaders : '<th class="group-nasajon">Sem locais cadastrados</th>'}
              ${sortableStockHeader('Correção estoque', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Qtd. total locais', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Vendas Período', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Vendas/dia', stockColumns, 'group-totals', sortState)}
              ${sortableStockHeader('Duração de estoque', stockColumns, 'group-totals', sortState)}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="group-material code-cell">${renderCodes(row)}</td>
                <td class="group-material material-name">${escapeHtml(row.material.name)}</td>
                ${locations.length ? locations.map(location => `
                  <td class="group-nasajon numeric-cell">${renderCodeLocationRows(row, location, 'nasajonQty')}</td>
                  <td class="group-nasajon numeric-cell">${renderCodeLocationRows(row, location, 'errorQty')}</td>
                `).join('') : '<td class="group-nasajon muted-text">0</td>'}
                <td class="group-totals">${correctionCell(row, canWriteStock)}</td>
                <td class="group-totals numeric-cell">${formatNumber(row.totalLocationsQty)}</td>
                <td class="group-totals numeric-cell">${formatSalesPeriod(row)}</td>
                <td class="group-totals numeric-cell">${formatSales(row)}</td>
                <td class="group-totals numeric-cell total-estimated ${isStockDurationBelowMinimum(row, stockMinimumDays) ? 'stock-duration-warning' : ''}">${formatDuration(row)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function load() {
    setInternalLoading(tableTarget, 'Carregando estoque...');
    try {
      overview = await api('/stock/materials-overview');
      renderSummary();
      renderTable();
    } catch (error) {
      setInternalError(tableTarget, error.message || 'Nao foi possivel carregar o estoque.');
      throw error;
    }
  }

  filters.addEventListener('submit', event => {
    event.preventDefault();
    renderTable();
  });
  filters.elements.search.addEventListener('input', renderTable);

  tableTarget.addEventListener('click', async event => {
    if (!canWriteStock) return;
    const editButton = event.target.closest('.edit-correction');
    if (editButton) {
      const cell = editButton.closest('.correction-cell');
      cell.querySelector('.correction-input').disabled = false;
      cell.querySelector('.correction-input').focus();
      editButton.hidden = true;
      cell.querySelector('.save-correction').hidden = false;
      return;
    }

    const saveButton = event.target.closest('.save-correction');
    if (saveButton) {
      const cell = saveButton.closest('.correction-cell');
      const input = cell.querySelector('.correction-input');
      saveButton.disabled = true;
      try {
        await api('/stock/materials-overview/corrections', {
          method: 'PUT',
          body: {
            materialId: Number(cell.dataset.materialId),
            correctionQty: Number(input.value || 0)
          }
        });
        await load();
      } catch (error) {
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
        saveButton.disabled = false;
      }
      return;
    }

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
    { label: 'Código', sortValue: row => (row.codes || []).join(', ') },
    { label: 'Nome do material', sortValue: row => row.material?.name || '' },
    ...locations.flatMap(location => [
      { label: `Nasajon ${location.name}`, sortValue: row => locationCell(row, location, 'nasajonQty') },
      { label: `Erro ${location.name}`, sortValue: row => locationCell(row, location, 'errorQty') }
    ]),
    { label: 'Correção estoque', sortValue: row => row.correctionQty },
    { label: 'Qtd. total locais', sortValue: row => row.totalLocationsQty },
    { label: 'Vendas Período', sortValue: row => row.salesPeriodQty ?? '' },
    { label: 'Vendas/dia', sortValue: row => row.salesPerDayQty ?? '' },
    { label: 'Duração de estoque', sortValue: row => currentStockDurationDays(row) ?? '' }
  ];
}

function sortableStockHeader(label, columns, className, sortState) {
  const index = columns.findIndex(column => column.label === label);
  const active = sortState.index === index && sortState.direction;
  const indicator = active ? sortState.direction === 'asc' ? '↑' : '↓' : '↕';
  return `
    <th class="${className}">
      <button class="sortable-header ${active ? 'active' : ''}" type="button" data-sort-index="${index}" aria-label="Ordenar por ${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
        <span class="sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}
