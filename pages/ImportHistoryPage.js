import { api, getCurrentUser } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';
import { UploadCsvButton } from '../shared/UploadCsvButton.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';

const tabs = [
  { id: 'nasajon', label: 'Importação Nasajon' },
  { id: 'inventory', label: 'Contagem de Inventário' },
  { id: 'production', label: 'Lançamento de Produção' }
];

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

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
}

function formatDateOnly(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
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

function importUser(row) {
  return row.user_name || row.user_id || '-';
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
    lot: '',
    benefitNumber: row?.benefit_number || ''
  }];
}

function lotBenefitNumber(lot = {}) {
  return String(lot.benefitNumber || lot.benefit_number || '').trim();
}

function productionNeedsBenefit(row) {
  return producedLots(row).some(lot => !lotBenefitNumber(lot));
}

export function ImportHistoryPage() {
  const user = getCurrentUser();
  const canReadLog = canAccess(user, 'log:read');
  const canImportCsv = canAccess(user, 'imports:write');
  const canReadInventory = canAccess(user, 'inventory:read');
  const canWriteInventory = canAccess(user, 'inventory:write');
  const canWriteProduction = canAccess(user, 'launches:write');
  const visibleLaunchTabs = tabs.filter(tab => (
    (tab.id === 'nasajon' && (canReadLog || canImportCsv))
    || (tab.id === 'inventory' && canReadInventory)
    || tab.id === 'production'
  ));
  const page = document.createElement('section');
  page.className = 'stack launches-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Lançamentos</h1>
        <p>Importe saldos Nasajon, registre inventário físico e lance produção realizada.</p>
      </div>
    </div>
    <div class="internal-tabs-target"></div>
    <div class="launches-target"></div>
  `;

  const tabsTarget = page.querySelector('.internal-tabs-target');
  const target = page.querySelector('.launches-target');
  let activeTab = sessionStorage.getItem('planejamento_launch_tab') || visibleLaunchTabs[0]?.id || 'production';
  if (!visibleLaunchTabs.some(tab => tab.id === activeTab)) activeTab = visibleLaunchTabs[0]?.id || 'production';
  let materials = [];
  let machines = [];
  let matrix = [];
  let productionFilters = {
    materialId: '',
    machineName: '',
    startDate: '',
    endDate: ''
  };

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function renderTabs() {
    tabsTarget.innerHTML = '';
    tabsTarget.appendChild(InternalTabs(visibleLaunchTabs, activeTab, tab => {
      activeTab = tab;
      sessionStorage.setItem('planejamento_launch_tab', activeTab);
      render().catch(toast);
    }));
  }

  async function loadLookups() {
    const lookups = await api('/actuals/lookups');
    materials = lookups.materials || [];
    machines = lookups.machines || [];
    matrix = lookups.matrix || [];
  }

  async function renderNasajon() {
    target.innerHTML = `
      <div class="panel launches-wide-panel">
        <div class="section-heading">
          <h2>Importação Nasajon</h2>
          <div class="csv-target"></div>
        </div>
        <div class="table-target"></div>
      </div>
    `;
    if (canImportCsv) {
      target.querySelector('.csv-target').appendChild(UploadCsvButton({ onImported: () => renderNasajon().catch(toast) }));
    }
    if (!canReadLog) {
      target.querySelector('.table-target').innerHTML = '<div class="empty-state">Log de importacoes restrito ao Diretor e Super Admin.</div>';
      return;
    }
    const rows = await api('/imports');
    target.querySelector('.table-target').appendChild(DataTable({
      columns: [
        { label: 'Data', render: row => row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '', sortValue: row => row.created_at },
        { label: 'Hora', render: row => row.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '', sortValue: row => row.created_at },
        { label: 'Usuário', render: importUser },
        { label: 'Arquivo', key: 'filename' },
        { label: 'Registros', render: row => `${formatNumber(row.total_rows)} registros`, sortValue: row => Number(row.total_rows || 0) },
        { label: 'Status', key: 'status' }
      ],
      rows
    }));
  }

  async function renderInventory() {
    target.innerHTML = `
      <div class="panel launches-wide-panel">
        <div class="section-heading">
          <h2>Contagem de Inventário</h2>
          ${canWriteInventory ? '<button class="primary-button start-inventory" type="button">Realizar inventário</button>' : ''}
        </div>
        <div class="table-target"></div>
      </div>
    `;
    target.querySelector('.start-inventory')?.addEventListener('click', () => openInventoryModal().catch(toast));
    const rows = await api('/stock/inventory/counts');
    const tableTarget = target.querySelector('.table-target');
    tableTarget.appendChild(DataTable({
      columns: [
        { label: 'Data/Hora', render: row => formatDate(row.created_at), sortValue: row => row.created_at },
        { label: 'Quantidade de itens', key: 'item_count' },
        { label: 'Usuário', render: row => row.user_id || '-' },
        { label: 'Observação', render: row => row.notes || '-' },
        { label: 'Visualizar', render: row => `<button class="link-button" data-view-inventory="${row.id}">Visualizar</button>` }
      ],
      rows
    }));
    tableTarget.addEventListener('click', event => {
      const button = event.target.closest('[data-view-inventory]');
      if (button) openInventoryViewModal(button.dataset.viewInventory).catch(toast);
    });
  }

  async function openInventoryViewModal(id) {
    const count = await api(`/stock/inventory/counts/${id}`);
    const createdAt = count.created_at ? new Date(count.created_at) : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal inventory-view-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Visualizar inventário</h2>
          <button class="link-button close-modal" type="button">Fechar</button>
        </div>
        <div class="detail-summary-strip">
          <article><span>Data</span><strong>${createdAt ? createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</strong></article>
          <article><span>Hora</span><strong>${createdAt ? createdAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</strong></article>
          <article><span>Usuário</span><strong>${escapeHtml(count.user_id || '-')}</strong></article>
          <article><span>Observação</span><strong>${escapeHtml(count.notes || '-')}</strong></article>
        </div>
        <div class="inventory-view-list">
          ${(count.materials || []).map(material => `
            <article class="inventory-card inventory-view-card">
              <div class="inventory-card-main">
                <h3>${escapeHtml(material.materialName)}</h3>
                <p>${escapeHtml((material.codes || []).join(', ') || 'Sem códigos')}</p>
              </div>
              <div class="inventory-location-list">
                ${(material.locations || []).map(location => `
                  <div class="readonly-field">
                    <span>${escapeHtml(location.locationName)}</span>
                    ${chips([formatNumber(location.countedQty)])}
                  </div>
                `).join('')}
              </div>
            </article>
          `).join('') || '<div class="empty-state">Nenhum material encontrado neste inventário.</div>'}
        </div>
        <div class="form-actions inventory-modal-actions">
          <span></span>
          <button class="secondary-button close-modal" type="button">Fechar</button>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    page.appendChild(backdrop);
  }

  async function openInventoryModal() {
    const template = await api('/stock/inventory/template');
    const hasInventoryBase = template?.rows?.length && template?.locations?.length;
    const selected = new Map();
    let inventoryCandidateId = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal inventory-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Realizar inventário</h2>
          <button class="link-button close-modal" type="button">Fechar</button>
        </div>
        ${hasInventoryBase ? `
          <div class="inventory-picker">
            <label>Buscar material<input name="inventorySearch" type="search" placeholder="Digite nome ou código" autocomplete="off" /></label>
            <button class="primary-button add-inventory-material" type="button">Adicionar material</button>
          </div>
          <div class="inventory-search-results"></div>
          <div class="inventory-card-list"></div>
          <label class="wide-field">Observação<input name="notes" /></label>
          <div class="form-actions inventory-modal-actions">
            <button class="secondary-button close-modal" type="button">Cancelar</button>
            <button class="primary-button save-inventory" type="button">Salvar inventário</button>
          </div>
        ` : `
          <div class="empty-state">Cadastre materiais e locais antes de realizar o inventário.</div>
          <div class="form-actions"><button class="secondary-button close-modal" type="button">Fechar</button></div>
        `}
      </div>
    `;

    function matches(row, query) {
      const text = `${row.material.name} ${(row.codes || []).join(' ')}`.toLowerCase();
      return text.includes(query);
    }

    function currentQty(row, location) {
      return row.inventoryByLocation?.[String(location.id)] ?? row.stockByLocation?.[String(location.id)]?.nasajonQty ?? 0;
    }

    function captureInventoryValues() {
      backdrop.querySelectorAll('.inventory-card-list input[data-material-id]').forEach(input => {
        const row = selected.get(String(input.dataset.materialId));
        if (!row) return;
        row.counts = row.counts || {};
        row.counts[String(input.dataset.locationId)] = input.value;
      });
    }

    function renderSearchResults() {
      const resultsTarget = backdrop.querySelector('.inventory-search-results');
      const query = String(backdrop.querySelector('[name="inventorySearch"]')?.value || '').trim().toLowerCase();
      if (!resultsTarget) return;
      const rows = query ? template.rows.filter(row => matches(row, query)).slice(0, 8) : [];
      resultsTarget.innerHTML = rows.length
        ? rows.map(row => `
            <button class="${String(row.material.id) === String(inventoryCandidateId) ? 'is-selected' : ''}" type="button" data-inventory-pick="${row.material.id}">
              <strong>${escapeHtml(row.material.name)}</strong>
              <span>${escapeHtml((row.codes || []).join(' | ') || 'Sem códigos')}</span>
            </button>
          `).join('')
        : query ? '<p class="muted-text">Nenhum material encontrado.</p>' : '';
    }

    function renderInventoryCards() {
      captureInventoryValues();
      const list = backdrop.querySelector('.inventory-card-list');
      if (!list) return;
      const rows = [...selected.values()];
      list.innerHTML = rows.length ? rows.map(row => `
        <article class="inventory-card" data-material-id="${row.material.id}">
          <button class="small-action-button danger remove-inventory-material" type="button" aria-label="Remover material">-</button>
          <div class="inventory-card-main">
            <h3>${escapeHtml(row.material.name)}</h3>
            <p>${escapeHtml((row.codes || []).join(', ') || 'Sem códigos')}</p>
          </div>
          <div class="inventory-location-list">
            ${template.locations.map(location => {
              const current = currentQty(row, location);
              const value = row.counts?.[String(location.id)] ?? '';
              return `
                <label>
                  <span>${escapeHtml(location.name)}</span>
                  <small>Saldo atual: ${formatNumber(current)}</small>
                  <input type="number" step="0.001" placeholder="Saldo atualizado" value="${escapeHtml(value)}" data-material-id="${row.material.id}" data-location-id="${location.id}" data-current="${current}" />
                </label>
              `;
            }).join('')}
          </div>
        </article>
      `).join('') : '<div class="empty-state">Busque e adicione materiais para este inventário.</div>';
    }

    function addSelectedMaterial() {
      captureInventoryValues();
      const query = String(backdrop.querySelector('[name="inventorySearch"]').value || '').trim().toLowerCase();
      const row = template.rows.find(item => String(item.material.id) === String(inventoryCandidateId))
        || template.rows.find(item => matches(item, query) && !selected.has(String(item.material.id)));
      if (!row) return;
      const key = String(row.material.id);
      if (!selected.has(key)) selected.set(key, { ...row, counts: {} });
      inventoryCandidateId = '';
      backdrop.querySelector('[name="inventorySearch"]').value = '';
      renderSearchResults();
      renderInventoryCards();
    }

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
      const pick = event.target.closest('[data-inventory-pick]');
      if (pick) {
        inventoryCandidateId = pick.dataset.inventoryPick;
        renderSearchResults();
      }
      const remove = event.target.closest('.remove-inventory-material');
      if (remove) {
        selected.delete(String(remove.closest('[data-material-id]')?.dataset.materialId));
        renderInventoryCards();
      }
    });
    backdrop.querySelector('.inventory-card-list')?.addEventListener('input', captureInventoryValues);
    backdrop.querySelector('[name="inventorySearch"]')?.addEventListener('input', renderSearchResults);
    backdrop.querySelector('.add-inventory-material')?.addEventListener('click', addSelectedMaterial);
    backdrop.querySelector('.save-inventory')?.addEventListener('click', async () => {
      captureInventoryValues();
      const items = [...selected.values()].flatMap(row => template.locations.map(location => ({
        materialId: Number(row.material.id),
        locationId: Number(location.id),
        previousQty: Number(currentQty(row, location) || 0),
        countedQty: row.counts?.[String(location.id)] ?? ''
      })));
      if (!items.some(item => item.countedQty !== '')) {
        toast('Preencha ao menos um saldo atualizado.');
        return;
      }
      await api('/stock/inventory/counts', {
        method: 'POST',
        body: { notes: backdrop.querySelector('[name="notes"]').value, items }
      });
      backdrop.remove();
      await renderInventory();
    });
    page.appendChild(backdrop);
    renderInventoryCards();
  }

  function materialOptions(selectedId = '', includeBlank = false) {
    const options = materials
      .filter(material => material.active !== false)
      .map(material => `<option value="${material.id}" ${String(material.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(material.name)}</option>`)
      .join('');
    return `${includeBlank ? '<option value="">Selecione</option>' : ''}${options}`;
  }

  function machineOptions(selectedName = '') {
    return machines
      .filter(machine => machine.active !== false)
      .map(machine => `<option value="${escapeHtml(machine.name)}" ${String(machine.name) === String(selectedName) ? 'selected' : ''}>${escapeHtml(machine.name)}</option>`)
      .join('');
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

  function modelInputsFor(materialId, modelName) {
    const model = productionModelByName(materialId, modelName);
    return (model?.inputMaterials || []).map(input => {
      const material = materials.find(item => String(item.id) === String(input.inputMaterialId || input.id));
      return material ? { material, lot: input.lot || '' } : null;
    }).filter(Boolean);
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
            <h2>Produções lançadas</h2>
            ${canWriteProduction ? '<button class="primary-button realize-production" type="button">Realizar produção</button>' : ''}
          </div>
          <div class="table-target"></div>
        </div>
      </div>
    `;
    target.querySelector('.realize-production')?.addEventListener('click', () => openProductionModal().catch(toast));
    await loadProductionTable();
  }

  async function loadProductionTable() {
    const rows = await api('/actuals/launches');
    const tableTarget = target.querySelector('.table-target');
    const filtersTarget = target.querySelector('.production-filters-target');
    const indicatorsTarget = target.querySelector('.production-indicators-target');
    tableTarget.innerHTML = '';
    const productionStatus = row => {
      if (row.status === 'canceled') return '<span class="production-status-pill canceled">Cancelada</span>';
      if (productionNeedsBenefit(row)) return '<span class="production-status-pill needs-benefit">N\u00e3o beneficiado</span>';
      return '<span class="production-status-pill launched">Lançada</span>';
    };
    const renderProductionTable = () => {
      tableTarget.innerHTML = '';
      const productionTable = DataTable({
        columns: [
          { label: 'Data', render: row => formatDateOnly(row.production_date), sortValue: row => row.production_date },
          { label: 'Material produzido', key: 'material_name' },
          { label: 'Modelo de produção', render: row => row.production_model_name || '-' },
          { label: 'Materiais consumidos', render: consumedInputSummary },
          { label: 'Máquina', render: row => escapeHtml(displayMachineName(row.machine_name)) || '-' },
          { label: 'Pessoas', render: row => row.people_count || '-' },
          { label: 'Quantidade', render: row => formatNumber(row.quantity) },
          { label: 'Unidade principal', key: 'primary_unit' },
          { label: 'Unidade secundária', render: row => `${formatNumber(row.secondary_qty)} ${row.secondary_unit || ''}`.trim() },
          { label: 'Lotes gerados', render: row => {
            const lots = producedLots(row).map(lot => lot.lot).filter(Boolean);
            return lots.length
              ? `<div class="production-lot-list">${lots.map(lot => `<span>${escapeHtml(lot)}</span>`).join('')}</div>`
              : '-';
          } },
          { label: 'Beneficiamento', render: row => producedLots(row).map(lot => lot.benefitNumber || lot.benefit_number).filter(Boolean).join(', ') || row.benefit_number || '-' },
          { label: 'Observação', render: row => row.notes || '-' },
          { label: 'Status', render: productionStatus },
          { label: 'Editar', render: row => canWriteProduction ? `<button class="link-button" data-edit-production="${row.id}">Editar</button>` : '' }
        ],
        rows: filteredProductionRows(rows),
        rowClass: row => [
          row.status === 'canceled' ? 'production-canceled-row' : '',
          row.status !== 'canceled' && productionNeedsBenefit(row) ? 'production-needs-benefit-row' : ''
        ].filter(Boolean).join(' ')
      });
      productionTable.classList.add('production-launch-table-wrap');
      tableTarget.appendChild(productionTable);
    };
    renderProductionTable();
    renderProductionFilters(filtersTarget, rows);
    renderProductionIndicators(indicatorsTarget, filteredProductionRows(rows));
    tableTarget.onclick = event => {
      if (!canWriteProduction) return;
      const button = event.target.closest('[data-edit-production]');
      if (!button) return;
      const row = rows.find(item => String(item.id) === String(button.dataset.editProduction));
      if (row) openProductionModal(row).catch(toast);
    };
    filtersTarget.onsubmit = event => {
      event.preventDefault();
      const form = event.target;
      productionFilters = {
        materialId: form.elements.filterMaterialId.value,
        machineName: form.elements.filterMachineName.value,
        startDate: form.elements.filterStartDate.value,
        endDate: form.elements.filterEndDate.value
      };
      renderProductionTable();
      renderProductionIndicators(indicatorsTarget, filteredProductionRows(rows));
    };
    filtersTarget.onclick = event => {
      if (!event.target.closest('.clear-production-filters')) return;
      productionFilters = {
        materialId: '',
        machineName: '',
        startDate: '',
        endDate: ''
      };
      const form = filtersTarget.querySelector('.production-filters');
      if (form) {
        form.elements.filterMaterialId.value = '';
        form.elements.filterMachineName.value = '';
        form.elements.filterStartDate.value = '';
        form.elements.filterEndDate.value = '';
      }
      renderProductionTable();
      renderProductionIndicators(indicatorsTarget, filteredProductionRows(rows));
    };
  }

  function renderProductionFilters(filtersTarget, rows) {
    const rowMachines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const materialIdsInRows = new Set(rows.map(row => String(row.material_id)));
    const materialFilterOptions = materials
      .filter(material => materialIdsInRows.has(String(material.id)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
      .map(material => `<option value="${escapeHtml(material.id)}" ${String(productionFilters.materialId) === String(material.id) ? 'selected' : ''}>${escapeHtml(material.name)}</option>`)
      .join('');
    filtersTarget.innerHTML = `
      <form class="filters production-filters">
        <label>Material produzido
          <select name="filterMaterialId">
            <option value="">Todos</option>
            ${materialFilterOptions}
          </select>
        </label>
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
    `;
  }

  function filteredProductionRows(rows) {
    return rows.filter(row => {
      const productionDate = String(row.production_date || '').slice(0, 10);
      if (productionFilters.materialId && String(row.material_id) !== String(productionFilters.materialId)) return false;
      if (productionFilters.machineName && String(row.machine_name || '') !== productionFilters.machineName) return false;
      if (productionFilters.startDate && productionDate < productionFilters.startDate) return false;
      if (productionFilters.endDate && productionDate > productionFilters.endDate) return false;
      return true;
    });
  }

  function renderProductionIndicators(indicatorsTarget, rows) {
    const totals = rows.reduce((acc, row) => {
      const lots = producedLots(row);
      acc.primary += lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      acc.secondary += lots.reduce((sum, lot) => sum + Number(lot.secondaryQty || lot.secondary_qty || 0), 0);
      acc.lots += lots.length;
      if (productionNeedsBenefit(row)) acc.pendingBenefit += 1;
      if (row.status === 'canceled') acc.canceled += 1;
      return acc;
    }, { primary: 0, secondary: 0, lots: 0, pendingBenefit: 0, canceled: 0 });
    indicatorsTarget.innerHTML = `
      <div class="summary-grid production-summary-grid">
        <article class="metric-card compact"><span>Total de produ&ccedil;&otilde;es</span><strong>${formatNumber(rows.length)}</strong></article>
        <article class="metric-card compact"><span>Total produzido unidade principal</span><strong>${formatNumber(totals.primary)}</strong></article>
        <article class="metric-card compact"><span>Total produzido unidade secund&aacute;ria</span><strong>${formatNumber(totals.secondary)}</strong></article>
        <article class="metric-card compact"><span>Quantidade de lotes gerados</span><strong>${formatNumber(totals.lots)}</strong></article>
        <article class="metric-card compact"><span>Produ&ccedil;&otilde;es pendentes de beneficiamento</span><strong>${formatNumber(totals.pendingBenefit)}</strong></article>
        <article class="metric-card compact"><span>Produ&ccedil;&otilde;es canceladas</span><strong>${formatNumber(totals.canceled)}</strong></article>
      </div>
    `;
  }

  async function openProductionModal(row = null) {
    await loadLookups();
    const backdrop = document.createElement('div');
    const modalStatusClass = row?.status === 'canceled'
      ? ' production-canceled-modal'
      : row && productionNeedsBenefit(row) ? ' production-needs-benefit-modal' : '';
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal production-modal${modalStatusClass}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>${row ? 'Editar produção' : 'Realizar produção'}</h2>
          <div class="modal-header-actions">
            <button class="secondary-button clear-production" type="button">Limpar produção</button>
          </div>
        </div>
        <form class="production-realization-form">
          <div class="grid-form">
            <label>Data<input name="productionDate" type="date" required /></label>
            <label>Material produzido<select name="materialId" required>${materialOptions(row?.material_id, !row)}</select></label>
            <label>Modelo de produção<select name="productionModelName" required></select></label>
            <label>Máquina<select name="machineName" required><option value="">Selecione um material</option></select></label>
            <label>Quantidade de pessoas<input name="peopleCount" type="number" min="1" /></label>
            <label class="wide-field">Observação<input name="notes" /></label>
          </div>
          <section class="consumed-inputs-section">
            <div class="section-heading compact-heading"><h3>Insumos consumidos</h3></div>
            <div class="consumed-inputs-target"></div>
          </section>
          <section class="production-lines-section">
            <div class="section-heading compact-heading">
              <h3>Lotes produzidos</h3>
              <button class="secondary-button add-produced-line" type="button">Adicionar produção</button>
            </div>
            <div class="produced-lines-target"></div>
          </section>
          <div class="form-actions production-modal-actions">
            ${row && row.status !== 'canceled' ? '<button class="danger-button cancel-production" type="button">Cancelar produção</button>' : ''}
            <button class="secondary-button close-modal" type="button">Cancelar</button>
            <button class="primary-button" type="submit">Salvar produção</button>
          </div>
        </form>
      </div>
    `;
    const form = backdrop.querySelector('form');
    const linesTarget = backdrop.querySelector('.produced-lines-target');
    const inputsTarget = backdrop.querySelector('.consumed-inputs-target');
    let lines = row ? producedLots(row) : [{ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', lot: '', benefitNumber: '' }];
    let consumedInputs = Array.isArray(row?.consumed_inputs) ? row.consumed_inputs.map(input => ({ ...input })) : [];

    function selectedProducedMaterial() {
      return materials.find(material => String(material.id) === String(form.elements.materialId.value));
    }

    function collectConsumedInputs() {
      consumedInputs = [...inputsTarget.querySelectorAll('[data-consumed-material-id]')].map(input => ({
        materialId: Number(input.dataset.consumedMaterialId),
        lot: input.value
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
      form.elements.productionModelName.disabled = models.length <= 1;
      form.elements.productionModelName.toggleAttribute('data-locked', models.length <= 1);
      renderConsumedInputs();
    }

    function renderConsumedInputs() {
      const previous = new Map(collectConsumedInputs().map(input => [String(input.materialId), input.lot]));
      const modelInputs = modelInputsFor(form.elements.materialId.value, form.elements.productionModelName.value);
      consumedInputs = modelInputs.map(input => ({
        materialId: Number(input.material.id),
        materialName: input.material.name,
        materialCode: firstCode(input.material),
        lot: previous.get(String(input.material.id)) ?? consumedInputs.find(current => String(current.materialId) === String(input.material.id))?.lot ?? ''
      }));
      inputsTarget.innerHTML = consumedInputs.length
        ? consumedInputs.map(input => `
          <div class="consumed-input-row">
            <div class="readonly-field"><span>Material consumido</span>${chips([input.materialName])}</div>
            <label>Lote consumido<input data-consumed-material-id="${input.materialId}" value="${escapeHtml(input.lot)}" /></label>
          </div>
        `).join('')
        : '<div class="empty-state compact">Selecione material produzido e modelo de produção.</div>';
    }

    function updateMachineLock() {
      const currentValue = form.elements.machineName.value || row?.machine_name || '';
      const validMachines = machineNamesForMaterial(selectedProducedMaterial());
      form.elements.machineName.innerHTML = validMachines.length
        ? `${validMachines.length > 1 ? '<option value="">Selecione</option>' : ''}${validMachines.map(machine => `<option value="${escapeHtml(machine)}">${escapeHtml(machine)}</option>`).join('')}`
        : '<option value="">Sem produtividade cadastrada</option>';
      if (validMachines.includes(currentValue)) {
        form.elements.machineName.value = currentValue;
      } else if (validMachines.length === 1) {
        form.elements.machineName.value = validMachines[0];
      }
      form.elements.machineName.disabled = validMachines.length <= 1;
      form.elements.machineName.toggleAttribute('data-locked', validMachines.length <= 1);
    }

    function collectLines() {
      const material = selectedProducedMaterial();
      return [...linesTarget.querySelectorAll('.produced-line')].map(line => {
        const quantity = Number(line.querySelector('[name="lineQuantity"]').value || 0);
        return {
          quantity,
          secondaryQty: secondaryQtyFor(material, quantity),
          primaryUnit: material?.primary_unit || '',
          secondaryUnit: material?.secondary_unit || '',
          lot: line.querySelector('[name="lineLot"]').value,
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
            <label>Quantidade<input name="lineQuantity" type="number" step="0.001" min="0.001" required value="${escapeHtml(line.quantity)}" /></label>
            <div class="readonly-field"><span>Unidade principal</span>${chips([line.primaryUnit || material?.primary_unit])}</div>
            <div class="readonly-field"><span>Unidade secundária</span>${chips([`${formatNumber(secondaryQty)} ${line.secondaryUnit || material?.secondary_unit || ''}`.trim()])}</div>
            <label>Lote gerado<input name="lineLot" value="${escapeHtml(line.lot)}" /></label>
            ${row ? `<label>Número de beneficiamento<input name="lineBenefitNumber" value="${escapeHtml(line.benefitNumber || line.benefit_number || '')}" /></label>` : ''}
            <button class="small-action-button danger remove-produced-line" type="button" ${lines.length === 1 ? 'disabled' : ''}>-</button>
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
        if (fields[1]) fields[1].innerHTML = `<span>Unidade secundÃ¡ria</span>${chips([`${formatNumber(secondaryQty)} ${material?.secondary_unit || ''}`.trim()])}`;
      });
    }

    function resetProduction() {
      form.reset();
      form.elements.productionDate.value = todayBrazil();
      form.elements.materialId.value = '';
      lines = [{ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', lot: '', benefitNumber: '' }];
      consumedInputs = [];
      updateModelOptions();
      updateMachineLock();
      renderLines();
    }

    form.elements.productionDate.value = row?.production_date ? String(row.production_date).slice(0, 10) : todayBrazil();
    form.elements.materialId.value = row?.material_id || '';
    form.elements.peopleCount.value = row?.people_count || '';
    form.elements.notes.value = row?.notes || '';
    updateModelOptions();
    updateMachineLock();
    if (row?.machine_name && !form.elements.machineName.disabled) form.elements.machineName.value = row.machine_name;
    renderLines();

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    form.elements.materialId.addEventListener('change', () => {
      lines = collectLines();
      consumedInputs = [];
      updateModelOptions();
      updateMachineLock();
      renderLines();
    });
    form.elements.productionModelName.addEventListener('change', renderConsumedInputs);
    inputsTarget.addEventListener('input', collectConsumedInputs);
    linesTarget.addEventListener('input', () => {
      lines = collectLines();
      updateLineUnits();
    });
    backdrop.querySelector('.add-produced-line').addEventListener('click', () => {
      lines = collectLines();
      lines.push({ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', lot: '', benefitNumber: '' });
      renderLines();
    });
    linesTarget.addEventListener('click', event => {
      if (!event.target.classList.contains('remove-produced-line')) return;
      const index = Number(event.target.closest('[data-line-index]').dataset.lineIndex);
      lines = collectLines().filter((_, lineIndex) => lineIndex !== index);
      renderLines();
    });
    backdrop.querySelector('.clear-production').addEventListener('click', resetProduction);
    backdrop.querySelector('.cancel-production')?.addEventListener('click', async () => {
      if (!confirm('Confirma o cancelamento desta produção?')) return;
      await api(`/actuals/launches/${row.id}/cancel`, { method: 'POST', body: { reason: 'Cancelado pelo usuário' } });
      backdrop.remove();
      await loadProductionTable();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const producedLines = collectLines();
      const inputRows = collectConsumedInputs();
      if (!form.elements.materialId.value || !form.elements.productionModelName.value) {
        toast('Selecione material produzido e modelo de produção.');
        return;
      }
      if (!producedLines.some(line => line.quantity > 0)) {
        toast('Informe pelo menos uma quantidade produzida.');
        return;
      }
      const body = {
        productionDate: form.elements.productionDate.value,
        materialId: Number(form.elements.materialId.value),
        productionModelName: form.elements.productionModelName.value,
        consumedInputs: inputRows,
        machineName: form.elements.machineName.value,
        peopleCount: Number(form.elements.peopleCount.value || 0) || null,
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

  async function render() {
    renderTabs();
    setInternalLoading(target, 'Carregando lancamentos...');
    try {
      if (activeTab === 'nasajon') return await renderNasajon();
      if (activeTab === 'inventory') return await renderInventory();
      return await renderProductionLaunch();
    } catch (error) {
      setInternalError(target, error.message || 'Nao foi possivel carregar os lancamentos.');
      throw error;
    }
  }

  render().catch(toast);
  return page;
}

