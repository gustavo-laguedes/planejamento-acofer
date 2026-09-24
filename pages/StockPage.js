import { api } from '../shared/api.js';
import { nextSortDirection, sortTableRows } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { businessDaysInclusive } from '../services/workingDays.service.js';

const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';
const LOCATION_KEYS = ['matriz', 'feital', 'centro'];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function roundQty(value) {
  return Number(toNumber(value).toFixed(6));
}

function formatQty(value) {
  return toNumber(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatDays(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeLocationKey(value) {
  const text = normalizeText(value).replace(/\s+/g, '');
  if (text === 'filialfeital') return 'feital';
  if (text === 'filialcentro') return 'centro';
  return text;
}

function locationKey(row = {}) {
  const keys = [row.locationCode, row.locationName].map(normalizeLocationKey);
  return LOCATION_KEYS.find(key => keys.includes(key)) || keys.find(Boolean) || String(row.locationId || '');
}

function dateKey(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return true;
  return startA <= endB && endA >= startB;
}

function movementInPeriod(detail = {}, period) {
  if (!period?.start || !period?.end) return true;
  if (detail.type === 'pending_production' || detail.type === 'production_reserve') return true;
  if (detail.type === 'sales') {
    return rangesOverlap(dateKey(detail.periodStart), dateKey(detail.periodEnd), period.start, period.end);
  }
  const date = dateKey(detail.date);
  return !date || (date >= period.start && date <= period.end);
}

function movementQty(row, type, period) {
  return roundQty((row.details || [])
    .filter(detail => detail.type === type && movementInPeriod(detail, period))
    .reduce((sum, detail) => sum + toNumber(detail.quantity), 0));
}

function transportQty(row, period) {
  const incoming = movementQty(row, 'transport_in', period);
  const outgoing = movementQty(row, 'transport_out', period);
  return roundQty(incoming - outgoing);
}

function stockBalanceAtPeriodEnd(location = {}, periodEnd = '') {
  if (!periodEnd) {
    return roundQty(location.currentQty);
  }

  const inventory = location.latestInventory || null;
  const inventoryDate = dateKey(inventory?.countedAt);

  if (inventoryDate && periodEnd < inventoryDate) {
    return roundQty(inventory?.quantity);
  }

  let balance = inventory
    ? toNumber(inventory.quantity)
    : 0;

  for (const detail of location.details || []) {
    if (
      detail.type === 'pending_production'
      || detail.type === 'production_reserve'
    ) {
      continue;
    }

    if (detail.type === 'sales') {
      if (detail.affectsCurrentStock === false) {
        continue;
      }

      const saleEnd =
        dateKey(detail.periodEnd)
        || dateKey(detail.periodStart);

      if (saleEnd && saleEnd <= periodEnd) {
        balance -= toNumber(detail.quantity);
      }

      continue;
    }

    const movementDate = dateKey(detail.date);

    if (movementDate && movementDate > periodEnd) {
      continue;
    }

    if (detail.type === 'production_in') {
      balance += toNumber(detail.quantity);
    } else if (detail.type === 'consumption_out') {
      balance -= toNumber(detail.quantity);
    } else if (detail.type === 'transport_in') {
      balance += toNumber(detail.quantity);
        } else if (detail.type === 'transport_out') {
      balance -= toNumber(detail.quantity);
    } else if (detail.type === 'purchase_in') {
      balance += toNumber(detail.quantity);
    }
  }

  return roundQty(balance);
}

function rowsWithHistoricalBalances(rows = [], period = null) {
  if (!period?.end) {
    return rows;
  }

  return rows.map(row => ({
    ...row,

    locations: Object.fromEntries(
      LOCATION_KEYS.map(key => {
        const location = row.locations[key] || {};

        return [
          key,
          {
            ...location,

            currentQty: stockBalanceAtPeriodEnd(
              location,
              period.end
            )
          }
        ];
      })
    )
  }));
}
function readStockMinimumDays() {
  const value = String(localStorage.getItem(STOCK_MINIMUM_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : null;
}

function saveStockMinimumDays(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    localStorage.removeItem(STOCK_MINIMUM_DAYS_KEY);
    return null;
  }

  if (!/^\d+$/.test(text)) {
    return readStockMinimumDays();
  }

  const days = Number(text);

  if (!Number.isInteger(days) || days <= 0) {
    return readStockMinimumDays();
  }

  localStorage.setItem(STOCK_MINIMUM_DAYS_KEY, String(days));

  return days;
}

function allImportPeriods(rows = [], lastImport = null) {
  const periods = [];
  for (const row of rows) {
    for (const detail of row.details || []) {
      if (detail.type !== 'sales') continue;
      const start = dateKey(detail.periodStart);
      const end = dateKey(detail.periodEnd);
      if (start && end) periods.push({ start, end });
    }
  }
  const lastStart = dateKey(lastImport?.period_start || lastImport?.periodStart);
  const lastEnd = dateKey(lastImport?.period_end || lastImport?.periodEnd);
  if (lastStart && lastEnd) periods.push({ start: lastStart, end: lastEnd });
  if (!periods.length) return null;
  return {
    start: periods.reduce((min, item) => item.start < min ? item.start : min, periods[0].start),
    end: periods.reduce((max, item) => item.end > max ? item.end : max, periods[0].end)
  };
}

function latestInventoryAt(rows = []) {
  return rows.reduce((latest, row) => {
    const countedAt = row.latestInventory?.countedAt;
    if (!countedAt) return latest;
    if (!latest || new Date(countedAt).getTime() > new Date(latest).getTime()) return countedAt;
    return latest;
  }, null);
}

function locationTemplate(location = {}) {
  return {
    locationId: location.id,
    locationCode: location.code,
    locationName: location.name,
    currentQty: 0,
    latestInventory: null,
    details: []
  };
}

function groupRows(rows = [], locations = []) {
  const orderedLocations = LOCATION_KEYS.map(key => {
    const location = locations.find(item => [item.code, item.name].map(normalizeLocationKey).includes(key));
    return { key, label: location?.name || key[0].toUpperCase() + key.slice(1), source: location || null };
  });
  const groups = new Map();

  for (const row of rows) {
    const materialId = String(row.materialId);
    if (!groups.has(materialId)) {
            groups.set(materialId, {
        materialId: row.materialId,
        materialName: row.materialName || '-',
        materialCodes: row.materialCodes || [],
        unit: row.unit || '',
        permitsSales: row.permitsSales !== false,
        locations: Object.fromEntries(orderedLocations.map(item => [item.key, locationTemplate(item.source)]))
      });
    }
    const key = locationKey(row);
    if (!groups.get(materialId).locations[key]) continue;
    groups.get(materialId).locations[key] = {
      locationId: row.locationId,
      locationCode: row.locationCode,
      locationName: row.locationName,
      currentQty: roundQty(row.currentQty),
      latestInventory: row.latestInventory || null,
      details: row.details || []
    };
  }

  return { locations: orderedLocations, materials: [...groups.values()] };
}

function materialMatches(row, query) {
  if (!query) return true;
  return normalizeText([row.materialName, ...(row.materialCodes || [])].join(' ')).includes(query);
}

function locationSales(row, locationKeyName, period) {
  return movementQty(row.locations[locationKeyName] || {}, 'sales', period);
}

function decorateMaterialRows(rows = [], period, businessDays, minimumDays) {
  return rows.map(row => {
    const totalLocationsQty = roundQty(
      LOCATION_KEYS.reduce(
        (sum, key) => sum + toNumber(row.locations[key]?.currentQty),
        0
      )
    );

    if (row.permitsSales === false) {
      return {
        ...row,
        totalLocationsQty,
        salesPeriodQty: null,
        salesPerDayQty: null,
        stockDurationDays: null,
        belowMinimum: false
      };
    }

    const salesPeriodQty = roundQty(
      LOCATION_KEYS.reduce(
        (sum, key) => sum + locationSales(row, key, period),
        0
      )
    );

    const salesPerDayQty = businessDays > 0
      ? roundQty(salesPeriodQty / businessDays)
      : 0;

    const stockDurationDays = salesPerDayQty > 0
      ? totalLocationsQty / salesPerDayQty
      : null;

    return {
      ...row,
      totalLocationsQty,
      salesPeriodQty,
      salesPerDayQty,
      stockDurationDays,
      belowMinimum: Boolean(
        minimumDays
        && stockDurationDays !== null
        && stockDurationDays <= minimumDays
      )
    };
  });
}

function renderTopCards({
  lastImport,
  lastInventory,
  minimumDays,
  period,
  businessDays
}) {
  const importDate = lastImport
    ? formatDateTime(
        lastImport.finished_at ||
        lastImport.finishedAt ||
        lastImport.created_at ||
        lastImport.createdAt
      )
    : '-';

  const importFile = lastImport?.filename || '-';

  const referenceEnd = lastImport
    ? formatDate(
        lastImport.period_end ||
        lastImport.periodEnd
      )
    : '-';

  const analyzedPeriod = period
    ? `${formatDate(period.start)} até ${formatDate(period.end)}`
    : '-';

  return `
    <div class="summary-grid stock-current-cards">

      <article class="metric-card compact stock-card-import">
        <span>Última importação CSV</span>
        <strong>${escapeHtml(importDate)}</strong>
        <small>
          ${escapeHtml(importFile)}
          |
          Ref. final: ${escapeHtml(referenceEnd)}
        </small>
      </article>

      <article class="metric-card compact stock-card-inventory">
        <span>Último inventário</span>

        <strong>
          ${escapeHtml(
            lastInventory
              ? formatDateTime(lastInventory)
              : '-'
          )}
        </strong>
      </article>

      <article class="metric-card compact stock-card-minimum">
        <span>Estoque mínimo</span>

        <div class="stock-minimum-edit">
          <input
            class="stock-minimum-input"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            value="${minimumDays || ''}"
            placeholder="15"
            aria-label="Estoque mínimo em dias"
          />

          <small>dias</small>
        </div>
      </article>

      <article class="metric-card compact stock-card-period">
        <span>Período analisado</span>
        <strong>${escapeHtml(analyzedPeriod)}</strong>
      </article>

      <article class="metric-card compact stock-card-days">
        <span>Dias úteis contabilizados</span>
        <strong>${formatQty(businessDays)}</strong>
      </article>

    </div>
  `;
}

function codesCell(row) {
  const codes = row.materialCodes || [];

  if (!codes.length) {
    return '-';
  }

  return `
    <div class="stock-code-list">
      ${codes
        .map(
          code => `
            <span class="code-pill">
              ${escapeHtml(code)}
            </span>
          `
        )
        .join('')}
    </div>
  `;
}

function materialCell(row) {
  return `
    <div class="stock-material-cell">

      <strong>
        ${escapeHtml(row.materialName)}
      </strong>

      <button
        class="stock-inventory-info"
        data-inventory-material="${escapeHtml(row.materialId)}"
        type="button"
        title="Último inventário físico"
        aria-label="Último inventário físico de ${escapeHtml(row.materialName)}"
      >
        i
      </button>

    </div>
  `;
}

function projectedBalanceQty(
  row,
  key,
  period
) {
  const location =
    row.locations[key] || {};

  const currentQty =
    toNumber(
      location.currentQty
    );

  const pendingProductionQty =
    locationDetailValue(
      row,
      key,
      'pendingProductionQty',
      period
    );

  const productionReserveQty =
    locationDetailValue(
      row,
      key,
      'productionReserveQty',
      period
    );

  return roundQty(
    currentQty
    +
    pendingProductionQty
    -
    productionReserveQty
  );
}


function locationBalanceCell(
  row,
  key,
  period
) {
  const location =
    row.locations[key] || {};

  const currentQty =
    roundQty(
      location.currentQty
    );

  const projectedQty =
    projectedBalanceQty(
      row,
      key,
      period
    );

  return `
    <div
      class="stock-balance-split"
      title="Saldo atual | Saldo considerando pendente de produção e reserva de produção"
    >
      <strong
        class="stock-balance-value stock-balance-current"
      >
        ${formatQty(currentQty)}
      </strong>

      <span
        class="stock-balance-divider"
        aria-hidden="true"
      ></span>

      <span
        class="stock-balance-projected"
      >
        ${formatQty(projectedQty)}
      </span>
    </div>
  `;
}

function locationDetailValue(row, key, field, period) {
  const location = row.locations[key] || {};

  const values = {
    productionInQty:
      movementQty(location, 'production_in', period),

    pendingProductionQty:
      movementQty(location, 'pending_production', period),

    consumptionOutQty:
      movementQty(location, 'consumption_out', period),

    productionReserveQty:
      movementQty(location, 'production_reserve', period),

    transportInQty:
      movementQty(location, 'transport_in', period),

    transportOutQty:
      movementQty(location, 'transport_out', period),

    purchaseQty:
      movementQty(location, 'purchase_in', period),

    salesQty:
      movementQty(location, 'sales', period)
  };

  return values[field] ?? 0;
}

function buildColumns(expandedLocations, period) {
  const columns = [
    {
      label: 'Código',
      className: 'stock-col-material stock-col-code',
      render: codesCell,
      sortValue: row =>
        (row.materialCodes || [])[0] || ''
    },

    {
      label: 'Nome do material',
      className: 'stock-col-material stock-col-name',
      render: materialCell,
      sortValue: row => row.materialName
    }
  ];

  for (const key of LOCATION_KEYS) {
    columns.push({
      label: 'Saldo atual',

      className:
        `stock-col-location stock-col-${key} stock-col-balance`,

      render: row =>
  locationBalanceCell(
    row,
    key,
    period
  ),

      sortValue: row =>
        Number(row.locations[key]?.currentQty || 0)
    });


    if (expandedLocations.has(key)) {
      columns.push(
        {
          label: 'Entrada',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'productionInQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'productionInQty',
              period
            )
        },

        {
          label: 'Pendente produção',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'pendingProductionQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'pendingProductionQty',
              period
            )
        },

        {
          label: 'Saída',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'consumptionOutQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'consumptionOutQty',
              period
            )
        },

        {
          label: 'Reserva produção',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'productionReserveQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'productionReserveQty',
              period
            )
        },

        {
          label: 'Entrada trans',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'transportInQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'transportInQty',
              period
            )
        },

        {
          label: 'Saída trans',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'transportOutQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'transportOutQty',
              period
            )
        },

        {
          label: 'Compras',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'purchaseQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'purchaseQty',
              period
            )
        },

        {
          label: 'Vendas',
          className:
            `stock-col-location stock-col-${key}`,

          render: row =>
            formatQty(
              locationDetailValue(
                row,
                key,
                'salesQty',
                period
              )
            ),

          sortValue: row =>
            locationDetailValue(
              row,
              key,
              'salesQty',
              period
            )
        }
      );
    }
  }

  columns.push(
    {
      label: 'Qtd. total locais',
      className: 'stock-col-totals',

      render: row =>
        `<strong>${formatQty(row.totalLocationsQty)}</strong>`,

      sortValue: row =>
        row.totalLocationsQty
    },

    {
      label: 'Vendas período',
      className: 'stock-col-totals',

            render: row =>
        row.permitsSales === false
          ? '-'
          : formatQty(row.salesPeriodQty),

      sortValue: row =>
        row.permitsSales === false
          ? Number.POSITIVE_INFINITY
          : row.salesPeriodQty
    },

    {
      label: 'Vendas/dia',
      className: 'stock-col-totals',

      render: row =>
        row.salesPerDayQty > 0
          ? formatQty(row.salesPerDayQty)
          : '-',

      sortValue: row =>
        row.salesPerDayQty
    },

    {
      label: 'Duração estoque',

      className:
        'stock-col-totals stock-col-duration',

      render: row =>
        row.stockDurationDays === null
          ? '-'
          : `${formatDays(row.stockDurationDays)} dias`,

      sortValue: row =>
        row.stockDurationDays ??
        Number.POSITIVE_INFINITY
    }
  );

  return columns;
}


function locationGroupColspan(
  expandedLocations,
  key
) {
  return expandedLocations.has(key)
    ? 9
    : 1;
}

function renderLocationGroupHeader(
  key,
  label,
  expandedLocations
) {
  const expanded =
    expandedLocations.has(key);

  return `
    <th
      class="stock-group-header stock-group-${key}"
      colspan="${locationGroupColspan(
        expandedLocations,
        key
      )}"
    >

      <div class="stock-location-header">

        <span>
          ${escapeHtml(label)}
        </span>

        <button
          class="stock-location-toggle"
          data-location-toggle="${key}"
          type="button"
          aria-expanded="${expanded}"
          title="${expanded ? 'Recolher' : 'Detalhar'} ${escapeHtml(label)}"
        >
          ${expanded ? '−' : '+'}
        </button>

      </div>

    </th>
  `;
}

function renderLocationSectorHeaders(
  key,
  expandedLocations
) {
  if (!expandedLocations.has(key)) {
    return `
      <th
        class="stock-sector-header stock-sector-single stock-col-location stock-col-${key}"
        colspan="1"
      >
        Saldo atual
      </th>
    `;
  }

  return `
    <th
      class="stock-sector-header stock-sector-balance stock-col-location stock-col-${key}"
      colspan="1"
    >
      Saldo atual
    </th>

    <th
      class="stock-sector-header stock-sector-production stock-col-location stock-col-${key}"
      colspan="4"
    >
      Produção
    </th>

    <th
      class="stock-sector-header stock-sector-transport stock-col-location stock-col-${key}"
      colspan="2"
    >
      Transporte
    </th>

    <th
      class="stock-sector-header stock-sector-commercial stock-col-location stock-col-${key}"
      colspan="2"
    >
      Compra e venda
    </th>
  `;
}

function renderStockTable({
  rows,
  columns,
  locationLabels,
  expandedLocations,
  sortState
}) {
  const wrapper =
    document.createElement('div');

  wrapper.className =
    'stock-current-table-wrap';

  if (!rows.length) {
    wrapper.innerHTML = `
      <div class="empty-state">
        Nenhum material encontrado.
      </div>
    `;

    return wrapper;
  }

  const sortedRows =
    sortTableRows(
      rows,
      columns,
      sortState
    );

  const table =
    document.createElement('table');

  table.className =
    'stock-current-overview-table';

  function indicatorFor(index) {
    if (
      sortState.index !== index ||
      !sortState.direction
    ) {
      return '↕';
    }

    return sortState.direction === 'asc'
      ? '↑'
      : '↓';
  }

  const hasExpandedLocations =
    LOCATION_KEYS.some(
      key => expandedLocations.has(key)
    );

  table.innerHTML = `
    <colgroup>
      ${columns
        .map(
          column => `
            <col class="${column.className || ''}">
          `
        )
        .join('')}
    </colgroup>

    <thead>

      <tr class="stock-group-row">

        <th
          class="stock-group-header stock-group-material"
          colspan="2"
        >
          MATERIAL
        </th>

        ${LOCATION_KEYS
          .map(
            key =>
              renderLocationGroupHeader(
                key,
                locationLabels.get(key) ||
                  key.toUpperCase(),
                expandedLocations
              )
          )
          .join('')}

        <th
          class="stock-group-header stock-group-totals"
          colspan="4"
        >
          TOTAIS E MOVIMENTAÇÃO
        </th>

      </tr>

      ${hasExpandedLocations ? `
        <tr class="stock-sector-row">

          <th
            class="stock-sector-spacer stock-sector-material-spacer"
            colspan="2"
          ></th>

          ${LOCATION_KEYS
            .map(
              key =>
                renderLocationSectorHeaders(
                  key,
                  expandedLocations
                )
            )
            .join('')}

          <th
            class="stock-sector-spacer stock-sector-totals-spacer"
            colspan="4"
          ></th>

        </tr>
      ` : ''}

      <tr class="stock-column-row">

        ${columns
          .map(
            (column, index) => `
              <th class="${column.className || ''}">

                <button
                  class="stock-sort-button ${
                    sortState.index === index &&
                    sortState.direction
                      ? 'active'
                      : ''
                  }"
                  type="button"
                  data-stock-sort-index="${index}"
                >

                  <span>
                    ${escapeHtml(column.label)}
                  </span>

                  <span
                    class="sort-indicator"
                    aria-hidden="true"
                  >
                    ${indicatorFor(index)}
                  </span>

                </button>

              </th>
            `
          )
          .join('')}

      </tr>

    </thead>

    <tbody>

      ${sortedRows
        .map(
          row => `
            <tr class="${
              row.belowMinimum
                ? 'stock-duration-warning-row'
                : ''
            }">

              ${columns
                .map(
                  column => `
                    <td class="${column.className || ''}">
                      ${
                        column.render
                          ? column.render(row)
                          : ''
                      }
                    </td>
                  `
                )
                .join('')}

            </tr>
          `
        )
        .join('')}

    </tbody>
  `;

  wrapper.appendChild(table);

  return wrapper;
}

function latestMaterialInventory(row) {
  const inventories = LOCATION_KEYS
    .map(key => ({ key, inventory: row.locations[key]?.latestInventory || null }))
    .filter(item => item.inventory?.countedAt);
  if (!inventories.length) return null;
  const latest = inventories.reduce((current, item) => {
    const currentAt = new Date(current.inventory.countedAt).getTime();
    const itemAt = new Date(item.inventory.countedAt).getTime();
    return itemAt > currentAt ? item : current;
  }, inventories[0]);
  const inventoryId = latest.inventory.inventoryCountId;
  return {
    countedAt: latest.inventory.countedAt,
    inventoryCountId: inventoryId,
    quantities: Object.fromEntries(LOCATION_KEYS.map(key => {
      const inventory = row.locations[key]?.latestInventory;
      const sameInventory = inventory && String(inventory.inventoryCountId || '') === String(inventoryId || '');
      return [key, sameInventory ? inventory.quantity : null];
    }))
  };
}

function openInventoryModal(row, locationLabels) {
  const inventory = latestMaterialInventory(row);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal stock-inventory-photo-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${escapeHtml(row.materialName)}</h2>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      ${inventory ? `
        <div class="stock-inventory-photo">
          ${LOCATION_KEYS.map(key => `
            <article>
              <span>${escapeHtml(locationLabels.get(key) || key)}</span>
              <strong>${inventory.quantities[key] === null ? '-' : formatQty(inventory.quantities[key])}</strong>
            </article>
          `).join('')}
          <article class="wide">
            <span>Data/hora do inventario</span>
            <strong>${escapeHtml(formatDateTime(inventory.countedAt))}</strong>
          </article>
        </div>
      ` : '<div class="empty-state">Nenhum inventario realizado</div>'}
      <div class="form-actions"><button class="secondary-button close-modal" type="button">Fechar</button></div>
    </div>
  `;
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

export function StockPage() {
  const container = document.createElement('section');
  container.className = 'page-section stack stock-current-page';
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Estoque</h1>
        <p>Saldo atual por material e local.</p>
      </div>
    </div>
    <div class="stock-current-summary-target"></div>
    <div class="panel stock-current-panel">
      <div class="stock-current-filters">
        <label>Buscar material ou codigo<input class="stock-search" type="search" autocomplete="off" /></label>
        <label>Data inicial<input class="stock-period-start" type="date" /></label>
        <label>Data final<input class="stock-period-end" type="date" /></label>
        <button class="secondary-button stock-apply-period" type="button">Aplicar periodo</button>
        <button class="secondary-button stock-clear-period" type="button">Limpar periodo</button>
      </div>
      <div class="stock-table-target stock-current-table-target"></div>
    </div>
  `;

  const summaryTarget = container.querySelector('.stock-current-summary-target');
  const tableTarget = container.querySelector('.stock-table-target');
  const searchInput = container.querySelector('.stock-search');
  const periodStartInput = container.querySelector('.stock-period-start');
  const periodEndInput = container.querySelector('.stock-period-end');
  const applyPeriodButton = container.querySelector('.stock-apply-period');
  const clearPeriodButton = container.querySelector('.stock-clear-period');
  const expandedLocations = new Set();
  let stockRows = [];
  let locations = [];
  let lastImport = null;
  let manualPeriod = null;

  let sortState = {
  index: null,
  direction: null
};

  function currentPeriod() {
    return manualPeriod || allImportPeriods(stockRows, lastImport);
  }

  function render() {
    const minimumDays = readStockMinimumDays();
    const period = currentPeriod();
const movementPeriod = manualPeriod;

const businessDays = period
  ? businessDaysInclusive(
      period.start,
      period.end
    )
  : 0;
        const grouped = groupRows(stockRows, locations);

    const locationLabels = new Map(
      grouped.locations.map(
        item => [item.key, item.label]
      )
    );

    const query =
      normalizeText(
        searchInput.value
      );

    const balanceRows =
      manualPeriod
        ? rowsWithHistoricalBalances(
            grouped.materials,
            manualPeriod
          )
        : grouped.materials;

    const rows =
      decorateMaterialRows(
        balanceRows.filter(
          row =>
            materialMatches(
              row,
              query
            )
        ),
        period,
        businessDays,
        minimumDays
      );

    summaryTarget.innerHTML = renderTopCards({
      lastImport,
      lastInventory: latestInventoryAt(stockRows),
      minimumDays,
      period,
      businessDays
    });

    const columns =
  buildColumns(
    expandedLocations,
    movementPeriod
  );

if (
  sortState.index !== null &&
  sortState.index >= columns.length
) {
  sortState = {
    index: null,
    direction: null
  };
}

tableTarget.innerHTML = '';

tableTarget.appendChild(
  renderStockTable({
    rows,
    columns,
    locationLabels,
    expandedLocations,
    sortState
  })
);

}

  summaryTarget.addEventListener(
  'change',
  event => {
    const input =
      event.target.closest(
        '.stock-minimum-input'
      );

    if (!input) {
      return;
    }

    const saved =
      saveStockMinimumDays(
        input.value
      );

    input.value =
      saved || '';

    render();
  }
);


  tableTarget.addEventListener('click', event => {
    const sortButton =
  event.target.closest(
    '[data-stock-sort-index]'
  );

if (sortButton) {
  const index =
    Number(
      sortButton.dataset.stockSortIndex
    );

  const currentDirection =
    sortState.index === index
      ? sortState.direction
      : null;

  const direction =
    nextSortDirection(
      currentDirection
    );

  sortState = direction
    ? {
        index,
        direction
      }
    : {
        index: null,
        direction: null
      };

  render();

  return;
}
    const toggle =
  event.target.closest(
    '[data-location-toggle]'
  );

if (toggle) {
  const key =
    toggle.dataset.locationToggle;

  if (
    expandedLocations.has(key)
  ) {
    expandedLocations.delete(key);
  } else {
    expandedLocations.add(key);
  }

  sortState = {
    index: null,
    direction: null
  };

  render();

  return;
}

    const info = event.target.closest('[data-inventory-material]');
    if (info) {
      const grouped = groupRows(stockRows, locations);
      const row = grouped.materials.find(item => String(item.materialId) === String(info.dataset.inventoryMaterial));
      if (!row) return;
      const locationLabels = new Map(grouped.locations.map(item => [item.key, item.label]));
      openInventoryModal(row, locationLabels);
    }
  });

  searchInput.addEventListener('input', render);

  applyPeriodButton.addEventListener('click', () => {
    const start = dateKey(periodStartInput.value);
    const end = dateKey(periodEndInput.value);
    if (!start || !end || start > end) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Informe um periodo valido.' }));
      return;
    }
    manualPeriod = { start, end };
    render();
  });

  clearPeriodButton.addEventListener('click', () => {
    manualPeriod = null;
    periodStartInput.value = '';
    periodEndInput.value = '';
    render();
  });

  async function load() {
    setInternalLoading(tableTarget, 'Carregando estoque...');
    try {
      const result = await api('/stock/current');
      stockRows = result.rows || [];
      locations = result.locations || [];
      lastImport = result.lastImport || null;
      periodStartInput.value = '';
periodEndInput.value = '';

render();
    } catch (error) {
      setInternalError(tableTarget, error.message || 'Nao foi possivel carregar estoque.');
    }
  }

  load();
  return container;
}
