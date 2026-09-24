import { api, getCurrentUser } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { ROLES, canAccess, normalizeRole } from '../shared/rbac.js';
import { openProductionExcelModal } from '../shared/ProductionExcelModal.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function displayMachineName(value) {
  return String(value ?? '')
    .replaceAll('A?o', 'A\u00e7o')
    .replaceAll('A\u00c3\u00a7o', 'A\u00e7o');
}

function formatDateOnly(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
}

function todayBrazil() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatQuantityUnit(quantity, unit) {
  return `${formatNumber(quantity)} ${unit || ''}`.trim();
}

function isCanceledProduction(row) {
  return ['canceled', 'cancelled', 'cancelado', 'cancelada'].includes(String(row?.status || '').trim().toLowerCase());
}

function valueByAliases(source, aliases) {
  for (const alias of aliases) {
    if (source?.[alias] !== null && source?.[alias] !== undefined && source?.[alias] !== '') return source[alias];
  }
  return null;
}

function unitTotals(rows, quantityKey, unitKey) {
  const quantityAliases = quantityKey === 'secondaryQty'
    ? ['secondaryQty', 'secondary_qty']
    : [quantityKey];
  const unitAliases = unitKey === 'secondaryUnit'
    ? ['secondaryUnit', 'secondary_unit']
    : unitKey === 'primaryUnit'
      ? ['primaryUnit', 'primary_unit']
      : [unitKey];
  const totals = rows.reduce((acc, row) => {
    const lots = producedLots(row);
    lots.forEach(lot => {
      const unit = String(valueByAliases(lot, unitAliases) || valueByAliases(row, unitAliases) || '').trim();
      const quantity = Number(valueByAliases(lot, quantityAliases) ?? valueByAliases(row, quantityAliases) ?? 0);
      if (!unit) return;
      acc.set(unit, (acc.get(unit) || 0) + quantity);
    });
    return acc;
  }, new Map());
  const formatted = [...totals.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => formatQuantityUnit(quantity, unit));
  return formatted.length ? formatted.join(' / ') : formatQuantityUnit(0, '');
}

function realWeightTotals(rows) {
  const totals = rows.reduce((acc, row) => {
    producedLots(row).forEach(lot => {
      const quantity = lotRealWeight(lot);
      const unit = lotRealWeightUnit(lot, row.secondary_unit);
      if (!(quantity > 0) || !unit) return;
      acc.set(unit, (acc.get(unit) || 0) + quantity);
    });
    return acc;
  }, new Map());
  const formatted = [...totals.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => formatQuantityUnit(quantity, unit));
  return formatted.length ? formatted.join(' / ') : formatQuantityUnit(0, '');
}

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(value => value !== null && value !== undefined && String(value) !== '');
  return items.length
    ? `<div class="readonly-chip-list compact-chip-list">${items.map(value => `<span class="code-pill">${escapeHtml(value)}</span>`).join('')}</div>`
    : `<span class="muted-text">${escapeHtml(emptyText)}</span>`;
}

function materialCodes(material) {
  return Array.isArray(material?.codes) ? material.codes : [];
}

function firstCode(material) {
  return materialCodes(material)[0] || '';
}

function producedLots(row) {
  if (Array.isArray(row?.produced_lots) && row.produced_lots.length) return row.produced_lots;
  return [{
    quantity: Number(row?.quantity || 0),
    secondaryQty: Number(row?.secondary_qty || 0),
    primaryUnit: row?.primary_unit,
    secondaryUnit: row?.secondary_unit,
    realWeight: Number(row?.real_weight || 0),
    realWeightUnit: row?.secondary_unit,
    lot: '',
    benefitNumber: row?.benefit_number || ''
  }];
}

function lotRealWeight(lot = {}) {
  return Number(lot.realWeight ?? lot.real_weight ?? 0);
}

function lotRealWeightUnit(lot = {}, fallback = '') {
  return String(lot.realWeightUnit || lot.real_weight_unit || lot.secondaryUnit || lot.secondary_unit || fallback || '').trim();
}

function realWeightSummary(row) {
  const lots = producedLots(row);
  const total = lots.reduce((sum, lot) => sum + lotRealWeight(lot), 0);
  if (!(total > 0)) return '-';
  const unit = lotRealWeightUnit(lots.find(lot => lotRealWeight(lot) > 0), row.secondary_unit);
  return formatQuantityUnit(total, unit);
}

function lotBenefitNumber(lot = {}) {
  return String(lot.benefitNumber || lot.benefit_number || '').trim();
}

function productionNeedsBenefit(row) {
  return producedLots(row).some(lot => !lotBenefitNumber(lot));
}

function cancellationRequest(row) {
  if (!row || String(row.status || '').toLowerCase() !== 'cancel_requested') return null;
  const raw = String(row.cancel_reason || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { reason: raw };
  }
}

function cancellationRequestDetails(row) {
  const request = cancellationRequest(row);
  if (!request) return '';
  return `
    <section class="production-cancellation-panel">
      <div class="section-heading compact-heading">
        <h3>Cancelamento solicitado</h3>
        <span class="production-status-pill cancel-requested">${escapeHtml(request.status || 'Cancelamento solicitado')}</span>
      </div>
      <div class="production-cancellation-grid">
        <article><span>Motivo</span><strong>${escapeHtml(request.reason || '-')}</strong></article>
        <article><span>Solicitante</span><strong>${escapeHtml(request.requestedBy || request.userName || '-')}</strong></article>
        <article><span>Solicitado em</span><strong>${escapeHtml(formatDateTime(request.requestedAt || row.canceled_at))}</strong></article>
      </div>
    </section>
  `;
}

export function ProductionPage(options = {}) {
  const user = getCurrentUser();
  const canWriteProduction = canAccess(user, 'launches:write');
  const isOperator = normalizeRole(user?.role) === ROLES.OPERADOR;
  const isSuperAdmin = normalizeRole(user?.role) === ROLES.SUPER_ADMIN;
  const page = document.createElement('section');
  page.className = 'stack launches-page production-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Produ&ccedil;&atilde;o</h1>
        <p>Lance, acompanhe e consulte os apontamentos de produ&ccedil;&atilde;o realizados.</p>
      </div>
    </div>
    <div class="production-page-target"></div>
  `;

  const target = page.querySelector('.production-page-target');
  let materials = [];
  let machines = [];
  let matrix = [];
  let productionFilters = {
  materialIds: [],
  machineName: '',
  startDate: '',
  endDate: ''
};

const PRODUCTION_PAGE_SIZE = 100;

let productionPage = 1;

let productionPagination = {
  page: 1,
  pageSize: PRODUCTION_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  from: 0,
  to: 0
};

let materialFilterDismissController = null;

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  async function loadLookups() {
    const lookups = await api('/actuals/lookups');
    materials = lookups.materials || [];
    machines = lookups.machines || [];
    matrix = lookups.matrix || [];
  }

  function materialSearchLabel(material) {
    if (!material) return '';
    const code = firstCode(material);
    return code ? `${material.name} - ${code}` : material.name;
  }

  function materialMatchesSearch(material, searchValue) {
    const normalized = String(searchValue || '').trim().toLowerCase();
    if (!normalized) return true;
    return [material.name, ...(material.codes || [])]
      .some(value => String(value || '').toLowerCase().includes(normalized));
  }

  function normalizeConsumedMaterialKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function consumedInputMatchesMaterial(input, material) {
    if (!input || !material) return false;
    if (input.materialId && String(input.materialId) === String(material.id)) return true;
    if (input.inputMaterialId && String(input.inputMaterialId) === String(material.id)) return true;
    const materialName = normalizeConsumedMaterialKey(material.name);
    const inputNames = [input.materialName, input.material_name, input.name].map(normalizeConsumedMaterialKey);
    if (materialName && inputNames.includes(materialName)) return true;
    const lookupCodes = materialCodes(material).map(normalizeConsumedMaterialKey);
    const inputCodes = [input.materialCode, input.material_code, input.code].map(normalizeConsumedMaterialKey);
    return inputCodes.some(code => code && lookupCodes.includes(code));
  }

  function matrixRowsForMaterial(material) {
    const codes = new Set((material?.codes || []).map(code => String(code).toLowerCase()));
    return matrix.filter(row =>
      row.active !== false
      && (row.material_name === material?.name || (row.material_codes || []).some(code => codes.has(String(code).toLowerCase())))
    );
  }

  function machineNamesForMaterial(material) {
    return [...new Set(matrixRowsForMaterial(material).map(row => row.machine_name).filter(Boolean))];
  }

  function productionModelsFor(materialId) {
    const produced = materials.find(material => String(material.id) === String(materialId));
    return Array.isArray(produced?.production_models)
      ? produced.production_models.filter(model => (model.inputMaterials || []).length)
      : [];
  }

  function productionModelByName(materialId, modelName) {
    return productionModelsFor(materialId).find(model => String(model.name) === String(modelName)) || null;
  }

  function modelInputsFor(
  materialId,
  modelName
) {
  const model =
    productionModelByName(
      materialId,
      modelName
    );

  return (
    model?.inputMaterials || []
  )
    .map(input => {
      const material =
        materials.find(
          item =>
            String(item.id) ===
            String(
              input.inputMaterialId ||
              input.id
            )
        );

      return material
        ? {
            material,

            lot:
              input.lot || '',

            qtyPerOutput:
              Number(
                input.qtyPerOutput ||
                input.qty_per_output ||
                1
              )
          }
        : null;
    })
    .filter(Boolean);
}

function machineForName(
  machineName
) {
  const normalized =
    String(machineName || '')
      .trim()
      .toLowerCase();

  if (!normalized) {
    return null;
  }

  return machines.find(
    machine =>
      String(machine.name || '')
        .trim()
        .toLowerCase() === normalized
  ) || null;
}

  function consumedInputSummary(row) {
    const inputs = Array.isArray(row.consumed_inputs) && row.consumed_inputs.length
      ? row.consumed_inputs
      : row.input_material_name ? [{ materialName: row.input_material_name, lot: row.consumed_lot }] : [];
    return inputs.length
      ? inputs.map(input => `${input.materialName || '-'}${input.lot ? ` (${input.lot})` : ''}`).join(', ')
      : '-';
  }

  function secondaryQtyFor(material, quantity) {
    return Number((Number(quantity || 0) * Number(material?.primary_to_secondary_factor || 1)).toFixed(3));
  }

  async function renderProductionLaunch() {
    await loadLookups();
    target.innerHTML = `
      <div class="launches-wide-panel production-launch-panel production-launch-layout">
        <div class="panel production-consult-card">
          <div class="production-filters-target"></div>
          <div class="production-indicators-target"></div>
        </div>
        <div class="panel production-table-card">
          <div class="section-heading">

  <h2>
    Produ&ccedil;&otilde;es lan&ccedil;adas
  </h2>

  ${
    canWriteProduction
      ? `
        <div class="production-heading-actions">

          <button
            class="
              secondary-button
              production-excel-trigger
            "
            type="button"
            title="Importar por Excel"
            aria-label="Importar por Excel"
          >

            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M6 2h9l5 5v15H6z"/>
              <path d="M14 2v6h6"/>
              <path d="M12 11v7"/>
              <path d="m9 15 3 3 3-3"/>
            </svg>

          </button>


          <button
            class="
              primary-button
              realize-production
            "
            type="button"
          >
            Realizar produ&ccedil;&atilde;o
          </button>

        </div>
      `
      : ''
  }

</div>
          <div class="table-target"></div>
<div class="production-pagination-target"></div>
        </div>
      </div>
    `;
    target.querySelector('.realize-production')?.addEventListener('click', () => openProductionModal().catch(toast));
    target
  .querySelector(
    '.production-excel-trigger'
  )
  ?.addEventListener(
    'click',
    () => {

      openProductionExcelModal({
  onApplied:
    async () => {
      productionPage = 1;
      await loadProductionTable();
    }
})
        .catch(toast);

    }
  );
    await loadProductionTable();
    if (options.openLaunchId) await openProductionById(options.openLaunchId);
  }

  async function openProductionById(id) {
    if (!id) return;
    const row = await api(`/actuals/launches/${id}`);
    await openProductionModal(row);
  }

 
  function productionLaunchesPath() {
  const params =
    new URLSearchParams();

  params.set(
    'includeMeta',
    '1'
  );

  params.set(
    'page',
    String(productionPage)
  );

  params.set(
    'pageSize',
    String(
      PRODUCTION_PAGE_SIZE
    )
  );

  if (productionFilters.startDate) {
    params.set(
      'startDate',
      productionFilters.startDate
    );
  }

  if (productionFilters.endDate) {
    params.set(
      'endDate',
      productionFilters.endDate
    );
  }

  if (productionFilters.machineName) {
    params.set(
      'machineName',
      productionFilters.machineName
    );
  }

  if (
    productionFilters
      .materialIds
      ?.length
  ) {
    params.set(
      'materialIds',
      productionFilters
        .materialIds
        .join(',')
    );
  }

  return (
    `/actuals/launches?` +
    params.toString()
  );
}

  async function loadProductionTable() {
  let result =
    await api(
      productionLaunchesPath()
    );

  let rows =
    result.rows || [];

  let summary =
    result.summary || {};

  productionPagination =
    result.pagination ||
    productionPagination;
    const tableTarget = target.querySelector('.table-target');
    const filtersTarget = target.querySelector('.production-filters-target');
    const indicatorsTarget = target.querySelector('.production-indicators-target');
    const paginationTarget =
  target.querySelector(
    '.production-pagination-target'
  );
    tableTarget.innerHTML = '';
    const productionStatus = row => {
      if (isCanceledProduction(row)) return '<span class="production-status-pill canceled">Cancelada</span>';
      if (row.status === 'cancel_requested') return '<span class="production-status-pill cancel-requested">Cancelamento solicitado</span>';
      if (productionNeedsBenefit(row)) return '<span class="production-status-pill needs-benefit">N&atilde;o beneficiado</span>';
      return '<span class="production-status-pill launched">Lan&ccedil;ada</span>';
    };
    const renderProductionTable = () => {
      tableTarget.innerHTML = '';
      const productionTable = DataTable({
        columns: [
          {
  label: 'Data',
  render: row =>
    formatDateOnly(
      row.production_date
    ),
  sortValue: row =>
    row.production_date
},

{
  label: 'Local',
  render: row =>
    escapeHtml(
      row.location_name || '-'
    )
},

{
  label: 'Material produzido',
  key: 'material_name'
},
          { label: 'Modelo de produção', render: row => row.production_model_name || '-' },
          { label: 'Materiais consumidos', render: consumedInputSummary },
          { label: 'Máquina', render: row => escapeHtml(displayMachineName(row.machine_name)) || '-' },
          { label: 'Pessoas', render: row => row.people_count || '-' },
          { label: 'Quantidade', render: row => formatQuantityUnit(row.quantity, row.primary_unit) },
          { label: 'Unidade secundária', render: row => formatQuantityUnit(row.secondary_qty, row.secondary_unit) },
          { label: 'Peso real', render: realWeightSummary },
          { label: 'Lotes gerados', render: row => {
            const lots = producedLots(row).map(lot => lot.lot).filter(Boolean);
            return lots.length
              ? `<div class="production-lot-list">${lots.map(lot => `<span>${escapeHtml(lot)}</span>`).join('')}</div>`
              : '-';
          } },
          { label: 'Beneficiamento', render: row => producedLots(row).map(lot => lot.benefitNumber || lot.benefit_number).filter(Boolean).join(', ') || row.benefit_number || '-' },
          { label: 'Observação', render: row => row.notes || '-' },
{ label: 'Status', render: productionStatus }
        ],
        rows: filteredProductionRows(rows),
        rowClass: row => [
  'production-clickable-row',
  `production-id-${row.id}`,
  isCanceledProduction(row) ? 'production-canceled-row' : '',
  !isCanceledProduction(row) &&
    row.status !== 'cancel_requested' &&
    productionNeedsBenefit(row)
      ? 'production-needs-benefit-row'
      : ''
].filter(Boolean).join(' ')
      });
      productionTable.classList.add('production-launch-table-wrap');
      tableTarget.appendChild(productionTable);
    };
    const refreshProductionRows =
  async (options = {}) => {

    const response =
      await api(
        productionLaunchesPath()
      );

    rows =
      response.rows || [];

    summary =
      response.summary || {};

    productionPagination =
      response.pagination ||
      productionPagination;

    productionPage =
      Number(
        productionPagination.page || 1
      );

    renderProductionTable();

    renderProductionFilters(
      filtersTarget,
      options
    );

    renderProductionIndicators(
      indicatorsTarget,
      summary
    );

    renderProductionPagination(
      paginationTarget,
      productionPagination
    );
  };
    productionPage =
  Number(
    productionPagination.page || 1
  );

renderProductionTable();

renderProductionFilters(
  filtersTarget
);

renderProductionIndicators(
  indicatorsTarget,
  summary
);

renderProductionPagination(
  paginationTarget,
  productionPagination
);
    tableTarget.onclick = event => {
  /*
   * Ignora controles interativos caso futuramente
   * algum botão/input seja colocado dentro da tabela.
   */
  if (
    event.target.closest(
      'button, a, input, select, textarea'
    )
  ) {
    return;
  }

  const tableRow =
    event.target.closest(
      'tbody tr.production-clickable-row'
    );

  if (!tableRow) {
    return;
  }

  const idClass =
    [...tableRow.classList]
      .find(
        className =>
          className.startsWith(
            'production-id-'
          )
      );

  const productionId =
    idClass
      ? idClass.slice(
          'production-id-'.length
        )
      : '';

  const production =
    rows.find(
      item =>
        String(item.id) ===
        String(productionId)
    );

  if (production) {
    openProductionModal(
      production
    ).catch(toast);
  }
};
    filtersTarget.onsubmit = async event => {
      event.preventDefault();
      const form = event.target;
      productionFilters = {
        ...productionFilters,
        machineName: form.elements.filterMachineName.value,
        startDate: form.elements.filterStartDate.value,
        endDate: form.elements.filterEndDate.value
      };
      productionPage = 1;
      await refreshProductionRows();
    };
    filtersTarget.onclick = async event => {
  if (
    !event.target.closest(
      '.clear-production-filters'
    )
  ) {
    return;
  }

  productionFilters = {
    materialIds: [],
    machineName: '',
    startDate: '',
    endDate: ''
  };

  /*
   * Sempre volta para a página 1
   * quando os filtros mudam.
   */
  productionPage = 1;

  const form =
    filtersTarget.querySelector(
      '.production-filters'
    );

  if (form) {
    form.elements
      .filterMachineName
      .value = '';

    form.elements
      .filterStartDate
      .value = '';

    form.elements
      .filterEndDate
      .value = '';
  }

  await refreshProductionRows();
};
    filtersTarget.addEventListener(
  'change',
  async event => {

    if (
      !event.target.matches(
        '[name="filterMaterialId"]'
      )
    ) {
      return;
    }

    const searchValue =
      filtersTarget.querySelector(
        '[name="filterMaterialSearch"]'
      )?.value || '';

    const value =
      String(
        event.target.value
      );

    productionFilters.materialIds =
      event.target.checked
        ? [
            ...new Set([
              ...productionFilters.materialIds,
              value
            ])
          ]
        : productionFilters
            .materialIds
            .filter(
              id =>
                id !== value
            );

    /*
     * Mudou material:
     * volta para página 1.
     */
    productionPage = 1;

    await refreshProductionRows({
      keepOpen: true,
      searchValue
    });
  }
);
    filtersTarget.addEventListener('input', event => {
      if (!event.target.matches('[name="filterMaterialSearch"]')) return;
      const wrapper = event.target.closest('.production-material-filter');
      wrapper?.classList.add('open');
      event.target.setAttribute('aria-expanded', 'true');
      filterMaterialOptions(wrapper, event.target.value);
    });
    filtersTarget.addEventListener('focusin', event => {
      if (!event.target.matches('[name="filterMaterialSearch"]')) return;
      const wrapper = event.target.closest('.production-material-filter');
      wrapper?.classList.add('open');
      event.target.setAttribute('aria-expanded', 'true');
      filterMaterialOptions(wrapper, event.target.value);
    });
    bindMaterialFilterDismissal(filtersTarget);
    filtersTarget.addEventListener('click', async event => {
      const allButton = event.target.closest('[data-material-filter-all]');
      const clearButton = event.target.closest('[data-material-filter-clear]');
      const removeButton = event.target.closest('[data-remove-material-filter]');
      if (!allButton && !clearButton && !removeButton) return;
      const searchValue = filtersTarget.querySelector('[name="filterMaterialSearch"]')?.value || '';
      const availableIds =
  materials
    .filter(
      material =>
        material.active !== false
    )
    .map(
      material =>
        String(material.id)
    );
      if (allButton) productionFilters.materialIds = availableIds;
      if (clearButton) productionFilters.materialIds = [];
      if (removeButton) {
        productionFilters.materialIds = productionFilters.materialIds.filter(id => id !== String(removeButton.dataset.removeMaterialFilter));
      }
      productionPage = 1;
      await refreshProductionRows({ keepOpen: Boolean(allButton || clearButton), searchValue: allButton || clearButton ? searchValue : '' });
    });

    paginationTarget.onclick =
  async event => {

    const button =
      event.target.closest(
        '[data-production-page]'
      );

    /*
     * Clicou em qualquer lugar que
     * não seja botão da paginação.
     */
    if (!button) {
      return;
    }

    const action =
      button.dataset
        .productionPage;

    const currentPage =
      Number(
        productionPagination.page ||
        1
      );

    const totalPages =
      Math.max(
        Number(
          productionPagination
            .totalPages ||
          1
        ),
        1
      );

    /*
     * Começa assumindo que
     * continuaremos na página atual.
     */
    let nextPage =
      currentPage;


    /*
     * PRIMEIRA
     */
    if (
      action === 'first'
    ) {
      nextPage = 1;
    }


    /*
     * ANTERIOR
     */
    if (
      action === 'previous'
    ) {
      nextPage =
        Math.max(
          1,
          currentPage - 1
        );
    }


    /*
     * PRÓXIMA
     */
    if (
      action === 'next'
    ) {
      nextPage =
        Math.min(
          totalPages,
          currentPage + 1
        );
    }


    /*
     * ÚLTIMA
     */
    if (
      action === 'last'
    ) {
      nextPage =
        totalPages;
    }


    /*
     * Se por algum motivo tentou
     * ir para a mesma página,
     * não faz nova consulta.
     */
    if (
      nextPage === currentPage
    ) {
      return;
    }


    /*
     * Atualiza a página que deverá
     * ser solicitada ao backend.
     */
    productionPage =
      nextPage;


    /*
     * Busca somente os 100 registros
     * daquela página.
     */
    await refreshProductionRows();


    /*
     * Depois de trocar de página,
     * volta visualmente para o começo
     * da tabela.
     */
    tableTarget.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };
    
  }

  function closeMaterialFilter(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove('open');
    wrapper.querySelector('[name="filterMaterialSearch"]')?.setAttribute('aria-expanded', 'false');
  }

  function bindMaterialFilterDismissal(filtersTarget) {
    materialFilterDismissController?.abort();
    materialFilterDismissController = new AbortController();
    const { signal } = materialFilterDismissController;

    document.addEventListener('pointerdown', event => {
      const wrapper = filtersTarget.querySelector('.production-material-filter.open');
      if (!wrapper || wrapper.contains(event.target)) return;
      closeMaterialFilter(wrapper);
    }, { signal });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const wrapper = filtersTarget.querySelector('.production-material-filter.open');
      if (!wrapper) return;
      closeMaterialFilter(wrapper);
      wrapper.querySelector('[name="filterMaterialSearch"]')?.blur();
    }, { signal });
  }

  function normalizeMaterialFilterSearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function filterMaterialOptions(wrapper, searchValue) {
    if (!wrapper) return;
    const search = normalizeMaterialFilterSearch(searchValue);
    const options = [...wrapper.querySelectorAll('.production-material-option')];
    let visibleCount = 0;
    options.forEach(option => {
      const visible = !search || String(option.dataset.materialSearch || '').includes(search);
      option.classList.toggle('is-filtered-out', !visible);
      if (visible) visibleCount += 1;
    });
    const emptyState = wrapper.querySelector('.production-material-filter-empty');
    if (emptyState) emptyState.hidden = visibleCount > 0;
  }


  function renderProductionFilters(
  filtersTarget,
  options = {}
) {
    const rowMachines =
  [
    ...new Set(
      machines
        .filter(
          machine =>
            machine.active !== false
        )
        .map(
          machine =>
            machine.name
        )
        .filter(Boolean)
    )
  ]
    .sort(
      (a, b) =>
        a.localeCompare(
          b,
          'pt-BR'
        )
    );
    const selectedIds = new Set((productionFilters.materialIds || []).map(String));
    const materialFilterItems = materials
  .filter(
    material =>
      material.active !== false
  )
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
      .map(material => `
        <label class="production-material-option" data-material-search="${escapeHtml(normalizeMaterialFilterSearch([material.name, ...(material.codes || [])].join(' ')))}">
          <input name="filterMaterialId" type="checkbox" value="${escapeHtml(material.id)}" ${selectedIds.has(String(material.id)) ? 'checked' : ''} />
          <span>${escapeHtml(material.name)}</span>
        </label>
      `)
      .join('');
    const selectedMaterials = materials
      .filter(material => selectedIds.has(String(material.id)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    filtersTarget.innerHTML = `
      <form class="filters production-filters">
        <div class="production-material-filter">
          <span class="production-material-filter-label">Material produzido</span>
          <input class="production-material-filter-search" name="filterMaterialSearch" type="search" autocomplete="off" placeholder="Digite para buscar material produzido" value="${escapeHtml(options.searchValue || '')}" aria-expanded="${options.keepOpen ? 'true' : 'false'}" />
          <div class="production-material-filter-menu">
            <div class="production-material-filter-actions">
              <button class="link-button" data-material-filter-all type="button">Todos</button>
              <button class="link-button" data-material-filter-clear type="button">Limpar</button>
              <span>${selectedMaterials.length ? `${selectedMaterials.length} selecionado(s)` : 'Todos'}</span>
            </div>
            <div class="production-material-filter-list">
              ${materialFilterItems || '<span class="muted-text">Nenhum material encontrado.</span>'}
              <span class="muted-text production-material-filter-empty" hidden>Nenhum material encontrado.</span>
            </div>
          </div>
        </div>
        <label>M&aacute;quina
          <select name="filterMachineName">
            <option value="">Todas</option>
            ${rowMachines.map(machine => `<option value="${escapeHtml(machine)}" ${productionFilters.machineName === machine ? 'selected' : ''}>${escapeHtml(displayMachineName(machine))}</option>`).join('')}
          </select>
        </label>
        <label>Data inicial<input name="filterStartDate" type="date" value="${escapeHtml(productionFilters.startDate)}" /></label>
        <label>Data final<input name="filterEndDate" type="date" value="${escapeHtml(productionFilters.endDate)}" /></label>
        <button class="primary-button" type="submit">Filtrar</button>
        <button class="secondary-button clear-production-filters" type="button">Limpar filtros</button>
      </form>
      <div class="production-selected-materials">
        ${selectedMaterials.map(material => `
          <span class="production-filter-pill">
            ${escapeHtml(material.name)}
            <button type="button" aria-label="Remover ${escapeHtml(material.name)}" data-remove-material-filter="${escapeHtml(material.id)}">x</button>
          </span>
        `).join('')}
      </div>
    `;
    const wrapper = filtersTarget.querySelector('.production-material-filter');
    const searchInput = filtersTarget.querySelector('[name="filterMaterialSearch"]');
    if (options.keepOpen) {
      wrapper?.classList.add('open');
      searchInput?.focus();
      searchInput?.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
    filterMaterialOptions(wrapper, options.searchValue || '');
  }

  function filteredProductionRows(rows) {
    return rows.filter(row => {
      const productionDate = String(row.production_date || '').slice(0, 10);
      if (productionFilters.materialIds?.length && !productionFilters.materialIds.map(String).includes(String(row.material_id))) return false;
      if (productionFilters.machineName && String(row.machine_name || '') !== productionFilters.machineName) return false;
      if (productionFilters.startDate && productionDate < productionFilters.startDate) return false;
      if (productionFilters.endDate && productionDate > productionFilters.endDate) return false;
      return true;
    });
  }

  function formatProductionSummaryTotals(
  totals = []
) {
  const formatted =
    totals
      .filter(
        item =>
          Number(
            item.quantity || 0
          ) > 0
      )
      .map(
        item =>
          formatQuantityUnit(
            item.quantity,
            item.unit
          )
      );

  return formatted.length
    ? formatted.join(' / ')
    : formatQuantityUnit(
        0,
        ''
      );
}


function renderProductionIndicators(
  indicatorsTarget,
  summary = {}
) {
  indicatorsTarget.innerHTML = `
    <div class="summary-grid production-summary-grid">

      <article class="metric-card compact">
        <span>Total de produ&ccedil;&otilde;es</span>
        <strong>
          ${formatNumber(
            summary.totalProductions
          )}
        </strong>
      </article>

      <article class="metric-card compact">
        <span>Total produzido unidade principal</span>
        <strong>
          ${formatProductionSummaryTotals(
            summary.totalPrimary
          )}
        </strong>
      </article>

      <article class="metric-card compact">
        <span>Total produzido unidade secund&aacute;ria (fator)</span>
        <strong>
          ${formatProductionSummaryTotals(
            summary.totalSecondary
          )}
        </strong>
      </article>

      <article class="metric-card compact">
        <span>Peso real produzido unidade secund&aacute;ria</span>
        <strong>
          ${formatProductionSummaryTotals(
            summary.realWeight
          )}
        </strong>
      </article>

      <article class="metric-card compact">
        <span>Quantidade de lotes gerados</span>
        <strong>
          ${formatNumber(
            summary.lots
          )}
        </strong>
      </article>

      <article class="metric-card compact">
        <span>Produ&ccedil;&otilde;es pendentes de beneficiamento</span>
        <strong>
          ${formatNumber(
            summary.pendingBenefit
          )}
        </strong>
      </article>

      <article class="metric-card compact">
        <span>Produ&ccedil;&otilde;es canceladas</span>
        <strong>
          ${formatNumber(
            summary.canceled
          )}
        </strong>
      </article>

    </div>
  `;
}


function renderProductionPagination(
  paginationTarget,
  pagination = {}
) {
  if (!paginationTarget) {
    return;
  }

  const total =
    Number(
      pagination.total || 0
    );

  const pageNumber =
    Math.max(
      Number(
        pagination.page || 1
      ),
      1
    );

  const totalPages =
    Math.max(
      Number(
        pagination.totalPages || 1
      ),
      1
    );

  const from =
    Number(
      pagination.from || 0
    );

  const to =
    Number(
      pagination.to || 0
    );

  if (!total) {
    paginationTarget.innerHTML = '';
    return;
  }

  paginationTarget.innerHTML = `
    <div class="production-pagination">

      <span class="production-pagination-info">
        Exibindo
        <strong>${formatNumber(from)}</strong>
        –
        <strong>${formatNumber(to)}</strong>
        de
        <strong>${formatNumber(total)}</strong>
        registros
      </span>

      <div class="production-pagination-actions">

        <button
          class="secondary-button"
          type="button"
          data-production-page="first"
          ${pageNumber <= 1 ? 'disabled' : ''}
        >
          Primeira
        </button>

        <button
          class="secondary-button"
          type="button"
          data-production-page="previous"
          ${pageNumber <= 1 ? 'disabled' : ''}
        >
          Anterior
        </button>

        <span class="production-pagination-page">
          P&aacute;gina
          <strong>${formatNumber(pageNumber)}</strong>
          de
          <strong>${formatNumber(totalPages)}</strong>
        </span>

        <button
          class="secondary-button"
          type="button"
          data-production-page="next"
          ${pageNumber >= totalPages ? 'disabled' : ''}
        >
          Pr&oacute;xima
        </button>

        <button
          class="secondary-button"
          type="button"
          data-production-page="last"
          ${pageNumber >= totalPages ? 'disabled' : ''}
        >
          &Uacute;ltima
        </button>

      </div>

    </div>
  `;
}

  async function openProductionModal(row = null) {
    await loadLookups();
    const isCancelRequested = String(row?.status || '').toLowerCase() === 'cancel_requested';
    const canDecideCancellation = Boolean(row && isCancelRequested && canWriteProduction && !isOperator);
    const readOnlyMode = Boolean(
  row &&
  (
    !canWriteProduction ||
    isOperator ||
    isCancelRequested
  )
);
    const backdrop = document.createElement('div');
    const modalStatusClass = isCanceledProduction(row)
      ? ' production-canceled-modal'
      : isCancelRequested ? ' production-cancel-requested-modal'
      : row && productionNeedsBenefit(row) ? ' production-needs-benefit-modal' : '';
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal production-modal${modalStatusClass}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>${row ? isCancelRequested ? 'Produ&ccedil;&atilde;o com cancelamento solicitado' : readOnlyMode ? 'Visualizar produ&ccedil;&atilde;o' : 'Editar produ&ccedil;&atilde;o' : 'Realizar produ&ccedil;&atilde;o'}</h2>
          <div class="modal-header-actions">
            ${readOnlyMode ? '' : '<button class="secondary-button clear-production" type="button">Limpar produ&ccedil;&atilde;o</button>'}
          </div>
        </div>
        <form class="production-realization-form">
          ${cancellationRequestDetails(row)}
          <div class="grid-form">
            <label>Data<input name="productionDate" type="date" required /></label>
            <label>Material produzido
              <div class="material-autocomplete production-material-autocomplete">
                <input name="materialSearch" type="search" autocomplete="off" placeholder="Digite nome ou código" required />
                <div class="material-suggestions" hidden></div>
              </div>
              <input name="materialId" type="hidden" />
            </label>
            <label>
  Modelo de produ&ccedil;&atilde;o
  <select
    name="productionModelName"
    required
  ></select>
</label>

<label>
  M&aacute;quina
  <select
    name="machineName"
    required
  >
    <option value="">
      Selecione um material
    </option>
  </select>
</label>

<div class="readonly-field production-location-field">
  <span>Local</span>
  <strong class="production-location-value">
    -
  </strong>
</div>

<label>
  Quantidade de pessoas
  <input
    name="peopleCount"
    type="number"
    min="1"
    required
  />
</label>
            <label class="wide-field">Observa&ccedil;&atilde;o<input name="notes" /></label>
          </div>
          <section class="consumed-inputs-section">
            <div class="section-heading compact-heading"><h3>Insumos consumidos</h3></div>
            <div class="consumed-inputs-target"></div>
          </section>
          <section class="production-lines-section">
            <div class="section-heading compact-heading">
              <h3>Lotes produzidos</h3>
              <button class="secondary-button add-produced-line" type="button">Adicionar produ&ccedil;&atilde;o</button>
            </div>
            <div class="produced-lines-target"></div>
          </section>
          <div class="form-actions production-modal-actions">
            ${readOnlyMode && !isCanceledProduction(row) && row.status !== 'cancel_requested' ? '<button class="secondary-button request-production-cancel" type="button">Solicitar cancelamento</button>' : ''}
            ${canDecideCancellation ? '<button class="danger-button confirm-cancel-request" type="button">Confirmar cancelamento</button>' : ''}
            ${canDecideCancellation ? '<button class="primary-button approve-production-request" type="button">Aprovar produ&ccedil;&atilde;o</button>' : ''}
            ${!readOnlyMode && row && !isCanceledProduction(row) ? '<button class="danger-button cancel-production" type="button">Cancelar produ&ccedil;&atilde;o</button>' : ''}
            ${isSuperAdmin && row ? '<button class="danger-button icon-danger-button delete-production" type="button" title="Excluir produ&ccedil;&atilde;o" aria-label="Excluir produ&ccedil;&atilde;o"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button>' : ''}
            <button class="secondary-button close-modal" type="button">Cancelar</button>
            ${readOnlyMode ? '' : '<button class="primary-button" type="submit">Salvar produ&ccedil;&atilde;o</button>'}
          </div>
        </form>
      </div>
    `;
    const form = backdrop.querySelector('form');
    const linesTarget = backdrop.querySelector('.produced-lines-target');
    const inputsTarget = backdrop.querySelector('.consumed-inputs-target');
    const materialSuggestions = backdrop.querySelector('.production-material-autocomplete .material-suggestions');
    let lines = row ? producedLots(row) : [{ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', realWeight: '', realWeightUnit: '', lot: '', benefitNumber: '' }];
    let consumedInputs = Array.isArray(row?.consumed_inputs) ? row.consumed_inputs.map(input => ({ ...input })) : [];

    function selectedProducedMaterial() {
      return materials.find(material => String(material.id) === String(form.elements.materialId.value));
    }

    function renderMaterialSuggestions() {
      if (readOnlyMode) return;
      const searchValue = form.elements.materialSearch.value;
      const matches = materials
        .filter(material => material.active !== false && materialMatchesSearch(material, searchValue))
        .slice(0, 12);
      materialSuggestions.innerHTML = matches.length
        ? matches.map(material => `
          <button type="button" data-produced-material-id="${material.id}">
            <strong>${escapeHtml(material.name)}</strong>
            <span>${escapeHtml((material.codes || []).join(' | ') || 'Sem código')}</span>
          </button>
        `).join('')
        : '<div class="material-suggestion-empty">Nenhum material encontrado.</div>';
      materialSuggestions.hidden = false;
    }

    function refreshProducedMaterialDependencies() {
      lines = collectLines();
      consumedInputs = [];
      updateModelOptions();
      updateMachineLock();
      renderLines();
    }

    function selectProducedMaterial(material) {
      const previousId = form.elements.materialId.value;
      form.elements.materialId.value = material?.id || '';
      form.elements.materialSearch.value = materialSearchLabel(material);
      materialSuggestions.hidden = true;
      if (String(previousId || '') !== String(material?.id || '')) refreshProducedMaterialDependencies();
    }

    function collectConsumedInputs() {
  consumedInputs = [
    ...inputsTarget.querySelectorAll(
      '[data-consumed-material-id]'
    )
  ].map(input => ({
    materialId:
      Number(
        input.dataset.consumedMaterialId
      ),

    lot:
      input.value.trim(),

    qtyPerOutput:
      Number(
        input.dataset.qtyPerOutput ||
        0
      ),

    consumedQty:
      Number(
        input.dataset.consumedQty ||
        0
      )
  }));

  return consumedInputs;
}

    function updateModelOptions() {
      const models = productionModelsFor(form.elements.materialId.value);
      if (!row || !form.elements.productionModelName.value || !models.some(model => String(model.name) === String(form.elements.productionModelName.value))) {
        form.elements.productionModelName.value = '';
      }
      form.elements.productionModelName.innerHTML = models.length
        ? `${models.length > 1 ? '<option value="">Selecione</option>' : ''}${models.map(model => `<option value="${escapeHtml(model.name)}">${escapeHtml(model.name)}</option>`).join('')}`
        : '<option value="">Sem modelo cadastrado</option>';
      if (row?.production_model_name && models.some(model => String(model.name) === String(row.production_model_name))) {
        form.elements.productionModelName.value = row.production_model_name;
      } else if (models.length === 1) {
        form.elements.productionModelName.value = models[0].name;
      }
      form.elements.productionModelName.disabled = readOnlyMode || models.length <= 1;
      form.elements.productionModelName.toggleAttribute('data-locked', models.length <= 1);
      renderConsumedInputs();
    }

    function renderConsumedInputs() {
  const storedInputs =
    consumedInputs.map(
      input => ({ ...input })
    );

  const visibleInputs = [
    ...inputsTarget.querySelectorAll(
      '[data-consumed-material-id]'
    )
  ].map(input => ({
    materialId:
      Number(
        input.dataset.consumedMaterialId
      ),

    lot:
      input.value.trim(),

    qtyPerOutput:
      Number(
        input.dataset.qtyPerOutput ||
        0
      ),

    consumedQty:
      Number(
        input.dataset.consumedQty ||
        0
      )
  }));

  const previous =
    new Map(
      visibleInputs.map(
        input => [
          String(input.materialId),
          input
        ]
      )
    );

  const modelInputs =
    modelInputsFor(
      form.elements.materialId.value,
      form.elements.productionModelName.value
    );

  const producedQuantity =
    Number(
      lines
        .reduce(
          (sum, line) =>
            sum +
            Number(
              line.quantity || 0
            ),
          0
        )
        .toFixed(6)
    );

  consumedInputs =
    modelInputs.map(input => {
      const previousInput =
        previous.get(
          String(input.material.id)
        );

      const storedInput =
        storedInputs.find(
          current =>
            consumedInputMatchesMaterial(
              current,
              input.material
            )
        );

      const qtyPerOutput =
        Number(
          previousInput?.qtyPerOutput ||
          storedInput?.qtyPerOutput ||
          storedInput?.qty_per_output ||
          input.qtyPerOutput ||
          1
        );

      const consumedQty =
        Number(
          (
            producedQuantity *
            qtyPerOutput
          ).toFixed(6)
        );

      return {
        materialId:
          Number(input.material.id),

        materialName:
          input.material.name,

        materialCode:
          firstCode(input.material),

        lot:
          previousInput?.lot ??
          storedInput?.lot ??
          '',

        qtyPerOutput,

        consumedQty
      };
    });

  inputsTarget.innerHTML =
    consumedInputs.length
      ? consumedInputs
          .map(
            input => `
              <div class="consumed-input-row">

                <div class="readonly-field">
                  <span>
                    Material consumido
                  </span>

                  ${chips([
                    input.materialName
                  ])}
                </div>

                <div class="readonly-field">
                  <span>
                    Qtd. por unidade
                  </span>

                  ${chips([
                    formatNumber(
                      input.qtyPerOutput
                    )
                  ])}
                </div>

                <div class="readonly-field">
                  <span>
                    Qtd. consumida
                  </span>

                  ${chips([
                    formatNumber(
                      input.consumedQty
                    )
                  ])}
                </div>

                <label>
                  Lote consumido

                  <input
                    data-consumed-material-id="${input.materialId}"
                    data-qty-per-output="${input.qtyPerOutput}"
                    data-consumed-qty="${input.consumedQty}"
                    value="${escapeHtml(input.lot)}"
                    required
                    ${
                      readOnlyMode
                        ? 'readonly'
                        : ''
                    }
                  />
                </label>

              </div>
            `
          )
          .join('')
      : `
        <div class="empty-state compact">
          Selecione material produzido e modelo de produção.
        </div>
      `;
}

    function updateProductionLocation() {
  const machine =
    machineForName(
      form.elements.machineName.value ||
      row?.machine_name ||
      ''
    );

  const locationValue =
    backdrop.querySelector(
      '.production-location-value'
    );

  if (locationValue) {
    locationValue.textContent =
      machine?.location_name ||
      row?.location_name ||
      '-';
  }
}

function updateMachineLock() {
  const currentValue =
    form.elements.machineName.value ||
    row?.machine_name ||
    '';

  const validMachines =
    machineNamesForMaterial(
      selectedProducedMaterial()
    );

  form.elements.machineName.innerHTML =
    validMachines.length
      ? `${
          validMachines.length > 1
            ? '<option value="">Selecione</option>'
            : ''
        }${
          validMachines
            .map(
              machine => `
                <option
                  value="${escapeHtml(machine)}"
                >
                  ${escapeHtml(
                    displayMachineName(machine)
                  )}
                </option>
              `
            )
            .join('')
        }`
      : `
        <option value="">
          Sem produtividade cadastrada
        </option>
      `;

  if (
    validMachines.includes(
      currentValue
    )
  ) {
    form.elements.machineName.value =
      currentValue;
  } else if (
    validMachines.length === 1
  ) {
    form.elements.machineName.value =
      validMachines[0];
  }

  form.elements.machineName.disabled =
    readOnlyMode ||
    validMachines.length <= 1;

  form.elements.machineName.toggleAttribute(
    'data-locked',
    validMachines.length <= 1
  );

  updateProductionLocation();
}

    function collectLines() {
      const material = selectedProducedMaterial();
      return [...linesTarget.querySelectorAll('.produced-line')].map(line => {
        const quantity = Number(line.querySelector('[name="lineQuantity"]').value || 0);
        const realWeight = Number(line.querySelector('[name="lineRealWeight"]').value || 0);
        return {
          quantity,
          secondaryQty: secondaryQtyFor(material, quantity),
          primaryUnit: material?.primary_unit || '',
          secondaryUnit: material?.secondary_unit || '',
          realWeight,
          realWeightUnit: material?.secondary_unit || '',
          lot: line.querySelector('[name="lineLot"]').value.trim(),
          benefitNumber: line.querySelector('[name="lineBenefitNumber"]')?.value || ''
        };
      });
    }

    function renderLines() {
      const material = selectedProducedMaterial();
      linesTarget.innerHTML = lines.map((line, index) => {
        const secondaryQty = secondaryQtyFor(material, line.quantity);
        return `
          <div class="produced-line" data-line-index="${index}">
            <label>Quantidade<input name="lineQuantity" type="number" step="0.001" min="0.001" required value="${escapeHtml(line.quantity)}" ${readOnlyMode ? 'readonly' : ''} /></label>
            <div class="readonly-field"><span>Unidade principal</span>${chips([line.primaryUnit || material?.primary_unit])}</div>
            <div class="readonly-field"><span>Unidade secundária</span>${chips([formatQuantityUnit(secondaryQty, line.secondaryUnit || material?.secondary_unit)])}</div>
            <label>Peso real<input name="lineRealWeight" type="number" step="0.001" min="0.001" required value="${escapeHtml(lotRealWeight(line) || '')}" ${readOnlyMode ? 'readonly' : ''} /></label>
            <label>Lote gerado<input name="lineLot" required value="${escapeHtml(line.lot)}" ${readOnlyMode ? 'readonly' : ''} /></label>
            ${row ? `<label>Número de beneficiamento<input name="lineBenefitNumber" value="${escapeHtml(line.benefitNumber || line.benefit_number || '')}" ${readOnlyMode ? 'readonly' : ''} /></label>` : ''}
            ${readOnlyMode ? '' : `<button class="small-action-button danger remove-produced-line" type="button" ${lines.length === 1 ? 'disabled' : ''}>-</button>`}
          </div>
        `;
      }).join('');
    }

    function updateLineUnits() {
      const material = selectedProducedMaterial();
      linesTarget.querySelectorAll('.produced-line').forEach(line => {
        const quantity = Number(line.querySelector('[name="lineQuantity"]')?.value || 0);
        const secondaryQty = secondaryQtyFor(material, quantity);
        const fields = line.querySelectorAll('.readonly-field');
        if (fields[0]) fields[0].innerHTML = `<span>Unidade principal</span>${chips([material?.primary_unit])}`;
        if (fields[1]) fields[1].innerHTML = `<span>Unidade secundária</span>${chips([formatQuantityUnit(secondaryQty, material?.secondary_unit)])}`;
      });
    }

    function resetProduction() {
      form.reset();
      form.elements.productionDate.value = todayBrazil();
      form.elements.materialId.value = '';
      form.elements.materialSearch.value = '';
      lines = [{ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', realWeight: '', realWeightUnit: '', lot: '', benefitNumber: '' }];
      consumedInputs = [];
      updateModelOptions();
      updateMachineLock();
      renderLines();
    }

    form.elements.productionDate.value = row?.production_date ? String(row.production_date).slice(0, 10) : todayBrazil();
    form.elements.materialId.value = row?.material_id || '';
    form.elements.materialSearch.value = materialSearchLabel(
      materials.find(material => String(material.id) === String(row?.material_id || ''))
    );
    form.elements.peopleCount.value = row?.people_count || '';
    form.elements.notes.value = row?.notes || '';
    updateModelOptions();
    updateMachineLock();
    if (
  row?.machine_name &&
  !form.elements.machineName.disabled
) {
  form.elements.machineName.value =
    row.machine_name;
}

updateProductionLocation();

renderLines();

renderConsumedInputs();
    if (readOnlyMode) {
      [...form.elements].forEach(element => {
        if (element.matches('button')) return;
        element.toggleAttribute(element.tagName === 'SELECT' ? 'disabled' : 'readonly', true);
      });
      backdrop.querySelector('.add-produced-line')?.remove();
      inputsTarget.querySelectorAll('input').forEach(input => { input.readOnly = true; });
    }

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    form.elements.materialSearch.addEventListener('input', () => {
      const exactValue = form.elements.materialSearch.value.trim().toLowerCase();
      const exactMaterial = materials.find(material =>
        material.active !== false
        && (materialSearchLabel(material).toLowerCase() === exactValue
          || material.name.toLowerCase() === exactValue
          || (material.codes || []).some(code => String(code).toLowerCase() === exactValue))
      );
      if (exactMaterial) {
        selectProducedMaterial(exactMaterial);
        return;
      }
      form.elements.materialId.value = '';
      renderMaterialSuggestions();
    });
    form.elements.materialSearch.addEventListener('focus', renderMaterialSuggestions);
    form.elements.materialSearch.addEventListener('blur', () => {
      setTimeout(() => {
        materialSuggestions.hidden = true;
        const selected = selectedProducedMaterial();
        if (selected) form.elements.materialSearch.value = materialSearchLabel(selected);
      }, 120);
    });
    materialSuggestions.addEventListener('mousedown', event => {
      const button = event.target.closest('[data-produced-material-id]');
      if (!button) return;
      event.preventDefault();
      const material = materials.find(item => String(item.id) === String(button.dataset.producedMaterialId));
      selectProducedMaterial(material);
    });
    form.elements.productionModelName.addEventListener(
  'change',
  renderConsumedInputs
);

form.elements.machineName.addEventListener(
  'change',
  updateProductionLocation
);

inputsTarget.addEventListener(
  'input',
  collectConsumedInputs
);

linesTarget.addEventListener(
  'input',
  () => {
    lines = collectLines();

    updateLineUnits();

    renderConsumedInputs();
  }
);
    backdrop.querySelector('.add-produced-line')?.addEventListener('click', () => {
      lines = collectLines();
      lines.push({
  quantity: '',
  secondaryQty: 0,
  primaryUnit: '',
  secondaryUnit: '',
  realWeight: '',
  realWeightUnit: '',
  lot: '',
  benefitNumber: ''
});

renderLines();

renderConsumedInputs();
    });
    linesTarget.addEventListener('click', event => {
      if (!event.target.classList.contains('remove-produced-line')) return;
      const index = Number(event.target.closest('[data-line-index]').dataset.lineIndex);
      lines =
  collectLines().filter(
    (_, lineIndex) =>
      lineIndex !== index
  );

renderLines();

renderConsumedInputs();
    });
    backdrop.querySelector('.clear-production')?.addEventListener('click', resetProduction);
    backdrop.querySelector('.cancel-production')?.addEventListener('click', async () => {
      if (!confirm('Confirma o cancelamento desta produção?')) return;
      await api(`/actuals/launches/${row.id}/cancel`, { method: 'POST', body: { reason: 'Cancelado pelo usuário' } });
      backdrop.remove();
      await loadProductionTable();
    });
    backdrop.querySelector('.delete-production')?.addEventListener('click', async () => {
      const label = [row.material_name, formatDateOnly(row.production_date)].filter(Boolean).join(' em ');
      if (!confirm(`Excluir definitivamente esta produção${label ? ` (${label})` : ''}?`)) return;
      try {
        await api(`/actuals/launches/${row.id}`, { method: 'DELETE' });
        backdrop.remove();
        await loadProductionTable();
      } catch (error) {
        if (error.status === 404) {
          backdrop.remove();
          await loadProductionTable();
          return;
        }
        toast(error);
      }
    });
    backdrop.querySelector('.confirm-cancel-request')?.addEventListener('click', async () => {
      if (!confirm('Confirma o cancelamento desta produção?')) return;
      await api(`/actuals/launches/${row.id}/cancel-request/confirm`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('planejamento:refresh-notifications'));
      backdrop.remove();
      await loadProductionTable();
    });
    backdrop.querySelector('.approve-production-request')?.addEventListener('click', async () => {
      if (!confirm('Aprovar esta produção e negar o cancelamento solicitado?')) return;
      await api(`/actuals/launches/${row.id}/cancel-request/approve-production`, { method: 'POST' });
      window.dispatchEvent(new CustomEvent('planejamento:refresh-notifications'));
      backdrop.remove();
      await loadProductionTable();
    });
    backdrop.querySelector('.request-production-cancel')?.addEventListener('click', () => {
      openCancellationRequestModal(row, backdrop).catch(toast);
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (readOnlyMode) return;
      const producedLines = collectLines();
      const inputRows = collectConsumedInputs();
      const hasInvalidRealWeight = producedLines.some(line => !Number.isFinite(line.realWeight) || line.realWeight <= 0);
      if (hasInvalidRealWeight) {
        toast('Informe o peso real.');
        return;
      }
      const peopleCount = Number(form.elements.peopleCount.value || 0);
      const hasMissingRequired = !form.elements.productionDate.value
        || !form.elements.materialId.value
        || !form.elements.productionModelName.value
        || !form.elements.machineName.value
        || !Number.isFinite(peopleCount)
        || peopleCount <= 0
        || inputRows.some(input => !String(input.lot || '').trim())
        || !producedLines.length
        || producedLines.some(line =>
          !Number.isFinite(line.quantity)
          || line.quantity <= 0
          || !line.primaryUnit
          || !Number.isFinite(line.secondaryQty)
          || line.secondaryQty <= 0
          || !line.secondaryUnit
          || !String(line.lot || '').trim()
        );
      if (hasMissingRequired) {
        toast('Preencha todos os campos obrigatórios.');
        return;
      }
      const body = {
        productionDate: form.elements.productionDate.value,
        materialId: Number(form.elements.materialId.value),
        productionModelName: form.elements.productionModelName.value,
        consumedInputs: inputRows,
        machineName: form.elements.machineName.value,
        peopleCount,
        benefitNumber: row?.benefit_number || null,
        notes: form.elements.notes.value,
        producedLots: producedLines
      };
      await api(row ? `/actuals/launches/${row.id}` : '/actuals/launches', { method: row ? 'PUT' : 'POST', body });
      backdrop.remove();
      await loadProductionTable();
    });
    page.appendChild(backdrop);
  }

  async function openCancellationRequestModal(row, parentBackdrop) {
    const requestBackdrop = document.createElement('div');
    requestBackdrop.className = 'modal-backdrop production-cancel-request-backdrop';
    requestBackdrop.innerHTML = `
      <div class="modal production-cancel-request-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Solicitar cancelamento</h2>
        </div>
        <form class="production-cancel-request-form">
          <label class="wide-field">Motivo do cancelamento
            <textarea name="reason" rows="5" required></textarea>
          </label>
          <p class="production-speech-message" role="status"></p>
          <div class="form-actions">
            <button class="secondary-button record-cancel-reason" type="button">🎙 Gravar motivo</button>
            <button class="secondary-button close-cancel-request" type="button">Cancelar</button>
            <button class="primary-button" type="submit">Confirmar solicitação</button>
          </div>
        </form>
      </div>
    `;
    const form = requestBackdrop.querySelector('form');
    const reasonInput = form.elements.reason;
    const message = requestBackdrop.querySelector('.production-speech-message');
    const close = () => requestBackdrop.remove();

    requestBackdrop.addEventListener('click', event => {
      if (event.target === requestBackdrop || event.target.classList.contains('close-cancel-request')) close();
    });
    requestBackdrop.querySelector('.record-cancel-reason').addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        message.textContent = 'Reconhecimento de voz não disponível neste navegador.';
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      message.textContent = 'Gravando motivo...';
      recognition.onresult = event => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        reasonInput.value = [reasonInput.value, transcript].filter(Boolean).join(' ').trim();
        message.textContent = '';
      };
      recognition.onerror = () => {
        message.textContent = 'Não foi possível transcrever o motivo.';
      };
      recognition.onend = () => {
        if (message.textContent === 'Gravando motivo...') message.textContent = '';
      };
      try {
        recognition.start();
      } catch {
        message.textContent = 'Não foi possível iniciar a gravação do motivo.';
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const reason = reasonInput.value.trim();
      if (!reason) {
        message.textContent = 'Informe o motivo do cancelamento.';
        reasonInput.focus();
        return;
      }
      await api(`/actuals/launches/${row.id}/cancel-request`, { method: 'POST', body: { reason } });
      window.dispatchEvent(new CustomEvent('planejamento:refresh-notifications'));
      close();
      parentBackdrop.remove();
      await loadProductionTable();
    });
    page.appendChild(requestBackdrop);
    reasonInput.focus();
  }

  async function render() {
    setInternalLoading(target, 'Carregando produção...');
    try {
      await renderProductionLaunch();
    } catch (error) {
      setInternalError(target, error.message || 'Não foi possível carregar a produção.');
      throw error;
    }
  }

  render().catch(toast);
  return page;
}
