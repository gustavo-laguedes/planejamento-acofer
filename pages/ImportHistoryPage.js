import { api, getCurrentUser } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { UploadCsvButton } from '../shared/UploadCsvButton.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { ROLES, canAccess, normalizeRole } from '../shared/rbac.js';

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

const LOCATION_ORDER = ['matriz', 'feital', 'centro'];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function locationOrderValue(location) {
  const values = [location?.code, location?.name].map(normalizeText);
  const index = LOCATION_ORDER.findIndex(expected => values.includes(expected));
  return index === -1 ? LOCATION_ORDER.length : index;
}

function sortLocations(locations = []) {
  return [...locations].sort((left, right) => {
    const orderDiff = locationOrderValue(left) - locationOrderValue(right);
    if (orderDiff) return orderDiff;
    return String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
  });
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
  const isSuperAdmin = normalizeRole(user?.role) === ROLES.SUPER_ADMIN;
  const page = document.createElement('section');
  page.className = 'stack launches-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Lan&ccedil;amentos / Importa&ccedil;&atilde;o CSV</h1>
      </div>
    </div>
    <div class="launches-target"></div>
  `;

  const pageTitle = page.querySelector('.page-header h1');
  const target = page.querySelector('.launches-target');
  let materials = [];
  let machines = [];
  let matrix = [];
  let locations = [];
  let activeLaunchTab = sessionStorage.getItem('planejamento_launches_tab') || 'csv';
  let productionFilters = {
    materialId: '',
    machineName: '',
    startDate: '',
    endDate: ''
  };
  let transportFilters = {
    materialId: '',
    materialSearch: '',
    invoiceNumber: '',
    invoiceSearch: '',
    routeKey: '',
    routeSearch: '',
    startDate: '',
    endDate: ''
  };

     let purchaseFilters = {
    materialIds: [],
    suppliers: [],
    invoiceNumbers: [],
    certificateNumbers: [],
    locationId: '',
    startDate: '',
    endDate: ''
  };
  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  async function loadLookups() {
    const lookups = await api('/actuals/lookups');
    materials = lookups.materials || [];
    machines = lookups.machines || [];
    matrix = lookups.matrix || [];
    locations = sortLocations(lookups.locations || []);
  }

  async function renderImportHistory(container) {
    container.innerHTML = `
      <div class="section-heading">
        <h2>IMPORTAÇÕES</h2>
        ${canImportCsv ? '<div class="csv-target"></div>' : ''}
      </div>
      <div class="table-target"></div>
    `;
    container.querySelector('.csv-target')?.appendChild(UploadCsvButton({ onImported: () => render().catch(toast) }));
    if (!canReadLog) {
      container.querySelector('.table-target').innerHTML = '<div class="empty-state">Log de importacoes restrito ao Diretor e Super Admin.</div>';
      return;
    }
    const rows = await api('/imports');
    container.querySelector('.table-target').appendChild(DataTable({
      columns: [
        { label: 'Data', render: row => row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '', sortValue: row => row.created_at },
        { label: 'Hora', render: row => row.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '', sortValue: row => row.created_at },
        { label: 'Usuário', render: importUser },
        { label: 'Arquivo', key: 'filename' },
        { label: 'Periodo inicial', render: row => formatDateOnly(row.period_start), sortValue: row => row.period_start },
        { label: 'Periodo final', render: row => formatDateOnly(row.period_end), sortValue: row => row.period_end },
        { label: 'Registros', render: row => `${formatNumber(row.total_rows)} registros`, sortValue: row => Number(row.total_rows || 0) },
        { label: 'Status', key: 'status' }
      ],
      rows
    }));
  }

  async function renderInventory(container) {
    container.innerHTML = `
      <div class="section-heading">
        <h2>Inventário</h2>
        ${canWriteInventory ? '<button class="primary-button start-inventory" type="button">Realizar inventário</button>' : ''}
      </div>
      <div class="table-target"></div>
    `;
    container.querySelector('.start-inventory')?.addEventListener('click', () => openInventoryModal().catch(toast));
    const rows = await api('/stock/inventory/counts');
    const tableTarget = container.querySelector('.table-target');
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
    let count = await api(`/stock/inventory/counts/${id}`);
    let editing = false;
    let saving = false;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    function orderedInventoryLocations(material) {
      return sortLocations((material.locations || []).map(location => ({
        ...location,
        code: location.locationCode,
        name: location.locationName
      })));
    }

    function inventoryViewTotal(material) {
      return orderedInventoryLocations(material).reduce((sum, location) => {
        const input = backdrop.querySelector(`[data-view-material-id="${material.materialId}"][data-view-location-id="${location.locationId}"]`);
        const value = input ? input.value : location.countedQty;
        return sum + Number(value || 0);
      }, 0);
    }

    function editedInfo() {
      if (!count.edited_at) return '';
      const editedAt = new Date(count.edited_at);
      const day = editedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const time = editedAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      return `<div class="inventory-edit-info">Editado por: ${escapeHtml(count.edited_by_user_name || count.edited_by_user_id || '-')} em ${day} &agrave;s ${time}</div>`;
    }

    function renderModal() {
      const createdAt = count.created_at ? new Date(count.created_at) : null;
      backdrop.innerHTML = `
        <div class="modal wide-modal inventory-view-modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h2>Visualizar invent&aacute;rio</h2>
            <button class="link-button close-modal" type="button">Fechar</button>
          </div>
          <div class="detail-summary-strip">
            <article><span>Data</span><strong>${createdAt ? createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</strong></article>
            <article><span>Hora</span><strong>${createdAt ? createdAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'}</strong></article>
            <article><span>Usu&aacute;rio</span><strong>${escapeHtml(count.user_id || '-')}</strong></article>
            <article><span>Observa&ccedil;&atilde;o</span><strong>${escapeHtml(count.notes || '-')}</strong></article>
          </div>
          ${editedInfo()}
          <div class="inventory-view-list">
            ${(count.materials || []).map(material => `
              <article class="inventory-card inventory-view-card" data-view-card-material-id="${material.materialId}">
                <div class="inventory-card-main">
                  <h3>${escapeHtml(material.materialName)}</h3>
                  <p>${escapeHtml((material.codes || []).join(', ') || 'Sem c&oacute;digos')}</p>
                </div>
                <div class="inventory-location-list">
                  ${orderedInventoryLocations(material).map(location => editing ? `
                    <label>
                      <span>${escapeHtml(location.locationName)}</span>
                      <input type="number" step="0.001" value="${escapeHtml(location.countedQty)}" data-view-material-id="${material.materialId}" data-view-location-id="${location.locationId}" />
                    </label>
                  ` : `
                    <div class="readonly-field">
                      <span>${escapeHtml(location.locationName)}</span>
                      ${chips([formatNumber(location.countedQty)])}
                    </div>
                  `).join('')}
                  <div class="readonly-field inventory-total-field">
                    <span>Total</span>
                    ${chips([formatNumber(inventoryViewTotal(material))])}
                  </div>
                </div>
              </article>
            `).join('') || '<div class="empty-state">Nenhum material encontrado neste invent&aacute;rio.</div>'}
          </div>
          <div class="form-actions inventory-modal-actions">
            <span></span>
            <div class="modal-header-actions">
              ${canWriteInventory && !editing ? '<button class="secondary-button edit-inventory-view" type="button">Editar</button>' : ''}
              ${canWriteInventory && editing ? '<button class="primary-button save-inventory-view" type="button">Salvar altera&ccedil;&otilde;es</button>' : ''}
              <button class="secondary-button close-modal" type="button">Fechar</button>
            </div>
          </div>
        </div>
      `;
    }

    function updateViewTotals() {
      (count.materials || []).forEach(material => {
        const totalTarget = backdrop.querySelector(`[data-view-card-material-id="${material.materialId}"] .inventory-total-field`);
        if (totalTarget) totalTarget.innerHTML = `<span>Total</span>${chips([formatNumber(inventoryViewTotal(material))])}`;
      });
    }

    function collectViewItems() {
      return [...backdrop.querySelectorAll('[data-view-material-id][data-view-location-id]')].map(input => ({
        materialId: Number(input.dataset.viewMaterialId),
        locationId: Number(input.dataset.viewLocationId),
        countedQty: input.value
      }));
    }

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
      if (event.target.closest('.edit-inventory-view')) {
        editing = true;
        renderModal();
      }
      const saveButton = event.target.closest('.save-inventory-view');
      if (saveButton) {
        if (saving) return;
        saving = true;
        saveButton.disabled = true;
        saveButton.textContent = 'Salvando...';
        api(`/stock/inventory/counts/${id}`, {
          method: 'PUT',
          body: { items: collectViewItems() }
        }).then(async () => {
          count = await api(`/stock/inventory/counts/${id}`);
          editing = false;
          window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Inventário atualizado.' }));
          renderModal();
        }).catch(error => {
          toast(error);
          saveButton.disabled = false;
          saveButton.textContent = 'Salvar alterações';
        }).finally(() => {
          saving = false;
        });
      }
    });
    backdrop.addEventListener('input', event => {
      if (event.target.matches('[data-view-material-id][data-view-location-id]')) updateViewTotals();
    });
    page.appendChild(backdrop);
    renderModal();
  }

  async function openInventoryViewModalLegacy(id) {
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
    template.locations = sortLocations(template.locations || []);
    const hasInventoryBase = template?.rows?.length && template?.locations?.length;
    const selected = new Map();
    let inventoryCandidateId = '';
    let savingInventory = false;
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

    function inventoryRowTotal(row) {
      return template.locations.reduce((sum, location) => {
        const value = row.counts?.[String(location.id)];
        return sum + (value === '' || value === null || value === undefined ? 0 : Number(value || 0));
      }, 0);
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
            <div class="readonly-field inventory-total-field">
              <span>Total</span>
              ${chips([formatNumber(inventoryRowTotal(row))])}
            </div>
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

    function updateInventoryTotals() {
      captureInventoryValues();
      backdrop.querySelectorAll('.inventory-card[data-material-id]').forEach(card => {
        const row = selected.get(String(card.dataset.materialId));
        const totalTarget = card.querySelector('.inventory-total-field');
        if (row && totalTarget) {
          totalTarget.innerHTML = `<span>Total</span>${chips([formatNumber(inventoryRowTotal(row))])}`;
        }
      });
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
    backdrop.querySelector('.inventory-card-list')?.addEventListener('input', updateInventoryTotals);
    backdrop.querySelector('[name="inventorySearch"]')?.addEventListener('input', renderSearchResults);
    backdrop.querySelector('.add-inventory-material')?.addEventListener('click', addSelectedMaterial);
    backdrop.querySelector('.save-inventory')?.addEventListener('click', async event => {
      if (savingInventory) return;
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
      const button = event.currentTarget;
      savingInventory = true;
      button.disabled = true;
      button.textContent = 'Salvando inventário...';
      try {
        const result = await api('/stock/inventory/counts', {
          method: 'POST',
          body: { notes: backdrop.querySelector('[name="notes"]').value, items }
        });
        const message = result?.duplicate
          ? 'Inventário já salvo recentemente. Nenhuma duplicidade foi criada.'
          : 'Inventário salvo com sucesso.';
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: message }));
        backdrop.remove();
        await render();
      } catch (error) {
        savingInventory = false;
        button.disabled = false;
        button.textContent = 'Salvar inventário';
        toast(error);
      }
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

  function locationOptions(selectedId = '', includeBlank = false) {
    const options = locations
      .filter(location => location.active !== false)
      .map(location => `<option value="${location.id}" ${String(location.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(location.name)}</option>`)
      .join('');
    return `${includeBlank ? '<option value="">Selecione</option>' : ''}${options}`;
  }

  function firstCodeFromCodes(codes = []) {
    return Array.isArray(codes) && codes.length ? codes[0] : '';
  }

  function isCanceledTransport(row) {
    return ['canceled', 'cancelled', 'cancelado', 'cancelada'].includes(String(row?.status || '').trim().toLowerCase());
  }

  function materialById(id) {
    return materials.find(material => String(material.id) === String(id)) || null;
  }

  function transportRouteLabel(row) {
    return `${row.origin_location_name || '-'} / ${row.destination_location_name || '-'}`;
  }

  function transportRouteKey(row) {
    return `${row.origin_location_id || ''}->${row.destination_location_id || ''}`;
  }

  function transportGroupKey(row) {
    return [
      String(row.transport_date || '').slice(0, 10),
      String(row.invoice_number || ''),
      String(row.origin_location_id || ''),
      String(row.destination_location_id || ''),
      String(row.notes || ''),
      isCanceledTransport(row) ? 'canceled' : 'active'
    ].join('|');
  }

  function groupTransportRows(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const key = transportGroupKey(row);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          transport_date: row.transport_date,
          invoice_number: row.invoice_number,
          origin_location_id: row.origin_location_id,
          destination_location_id: row.destination_location_id,
          origin_location_name: row.origin_location_name,
          destination_location_name: row.destination_location_name,
          notes: row.notes,
          status: row.status,
          created_at: row.created_at,
          rows: []
        });
      }
      groups.get(key).rows.push(row);
    });
    return [...groups.values()];
  }

  function transportMaterialSummary(group) {
    return group.rows.map(row => {
      const code = firstCodeFromCodes(row.material_codes);
      const label = [row.material_name || '-', code].filter(Boolean).join(' - ');
      return `${label}: ${formatNumber(row.quantity)} ${row.primary_unit || ''}`.trim();
    }).join('<br>');
  }

  function transportQuantitySummary(group) {
    const totals = group.rows.reduce((acc, row) => {
      const unit = String(row.primary_unit || '').trim();
      acc.set(unit, (acc.get(unit) || 0) + Number(row.quantity || 0));
      return acc;
    }, new Map());
    return [...totals.entries()].map(([unit, quantity]) => `${formatNumber(quantity)} ${unit}`.trim()).join(' / ') || '0';
  }

  function transportFactorQuantity(material, quantity) {
    return Number((Number(quantity || 0) * Number(material?.primary_to_secondary_factor || 1)).toFixed(3));
  }

  function transportFactorMaterial(row) {
    return materialById(row?.material_id || row?.materialId) || {
      primary_to_secondary_factor: row?.primary_to_secondary_factor,
      secondary_unit: row?.secondary_unit
    };
  }

  function transportFactorSummary(rows) {
    const totals = rows.reduce((acc, row) => {
      const material = transportFactorMaterial(row);
      const unit = String(material?.secondary_unit || '').trim();
      const quantity = transportFactorQuantity(material, row.quantity);
      if (!unit || !(quantity > 0)) return acc;
      acc.set(unit, (acc.get(unit) || 0) + quantity);
      return acc;
    }, new Map());
    return [...totals.entries()].map(([unit, quantity]) => `${formatNumber(quantity)} ${unit}`.trim()).join(' / ') || '0';
  }

  function filteredTransportRows(rows) {
    return rows.filter(row => {
      const transportDate = String(row.transport_date || '').slice(0, 10);
      const materialSearch = normalizeMaterialSearch(transportFilters.materialSearch);
      const invoiceSearch = normalizeMaterialSearch(transportFilters.invoiceSearch);
      const routeSearch = normalizeMaterialSearch(transportFilters.routeSearch);
      if (transportFilters.materialId && String(row.material_id) !== String(transportFilters.materialId)) return false;
      if (!transportFilters.materialId && materialSearch) {
        const materialText = normalizeMaterialSearch([row.material_name, ...(row.material_codes || [])].join(' '));
        if (!materialText.includes(materialSearch)) return false;
      }
      if (transportFilters.invoiceNumber && String(row.invoice_number || '') !== String(transportFilters.invoiceNumber)) return false;
      if (!transportFilters.invoiceNumber && invoiceSearch && !normalizeMaterialSearch(row.invoice_number).includes(invoiceSearch)) return false;
      if (transportFilters.routeKey && transportRouteKey(row) !== transportFilters.routeKey) return false;
      if (!transportFilters.routeKey && routeSearch && !normalizeMaterialSearch(transportRouteLabel(row)).includes(routeSearch)) return false;
      if (transportFilters.startDate && transportDate < transportFilters.startDate) return false;
      if (transportFilters.endDate && transportDate > transportFilters.endDate) return false;
      return true;
    });
  }

  function renderTransportIndicators(indicatorsTarget, rows) {
    const groups = groupTransportRows(rows);
    const activeRows = rows.filter(row => !isCanceledTransport(row));
    const totalsByUnit = activeRows.reduce((acc, row) => {
      const unit = String(row.primary_unit || '').trim();
      acc.set(unit, (acc.get(unit) || 0) + Number(row.quantity || 0));
      return acc;
    }, new Map());
    const quantityText = [...totalsByUnit.entries()].map(([unit, quantity]) => `${formatNumber(quantity)} ${unit}`.trim()).join(' / ') || '0';
    const factorText = transportFactorSummary(activeRows);
    indicatorsTarget.innerHTML = `
      <div class="summary-grid transport-summary-grid">
        <article class="metric-card compact"><span>Total de transportes</span><strong>${formatNumber(groups.filter(group => !isCanceledTransport(group)).length)}</strong></article>
        <article class="metric-card compact"><span>Materiais transportados</span><strong>${formatNumber(new Set(activeRows.map(row => String(row.material_id))).size)}</strong></article>
        <article class="metric-card compact"><span>Quantidade transportada</span><strong>${escapeHtml(quantityText)}</strong></article>
        <article class="metric-card compact"><span>Peso fator transportado</span><strong>${escapeHtml(factorText)}</strong></article>
        <article class="metric-card compact"><span>Notas fiscais</span><strong>${formatNumber(new Set(activeRows.map(row => String(row.invoice_number || '')).filter(Boolean)).size)}</strong></article>
        <article class="metric-card compact"><span>Rotas utilizadas</span><strong>${formatNumber(new Set(activeRows.map(transportRouteKey)).size)}</strong></article>
        <article class="metric-card compact"><span>Transportes cancelados</span><strong>${formatNumber(groups.filter(isCanceledTransport).length)}</strong></article>
      </div>
    `;
  }

  function renderTransportCombo({ name, label, placeholder, selectedValue, searchValue = '', items, valueKey = 'value', labelKey = 'label' }) {
    const selected = items.find(item => String(item[valueKey]) === String(selectedValue));
    return `
      <div class="transport-combo" data-combo-name="${escapeHtml(name)}">
        <span class="transport-combo-label">${escapeHtml(label)}</span>
        <input class="transport-combo-search" name="${escapeHtml(name)}Search" type="search" autocomplete="off" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(selected ? selected[labelKey] : searchValue)}" />
        <input name="${escapeHtml(name)}" type="hidden" value="${escapeHtml(selectedValue || '')}" />
        <div class="transport-combo-menu" hidden>
          ${items.map(item => `
            <button type="button" data-combo-value="${escapeHtml(item[valueKey])}" data-combo-label="${escapeHtml(item[labelKey])}" data-combo-search="${escapeHtml(normalizeMaterialSearch(item.search || item[labelKey]))}">
              ${escapeHtml(item[labelKey])}
            </button>
          `).join('')}
          <div class="material-suggestion-empty" hidden>Nenhum item encontrado.</div>
        </div>
      </div>
    `;
  }

  function bindTransportCombos(root, onSelect = () => {}) {
    root._transportComboSelect = onSelect;
    if (root.dataset.transportCombosBound === 'true') return;
    root.dataset.transportCombosBound = 'true';
    const closeCombos = except => {
      root.querySelectorAll('.transport-combo-menu').forEach(menu => {
        if (except && menu === except) return;
        menu.hidden = true;
      });
    };
    root.addEventListener('focusin', event => {
      const input = event.target.closest('.transport-combo-search');
      if (!input) return;
      const combo = input.closest('.transport-combo');
      const menu = combo.querySelector('.transport-combo-menu');
      closeCombos(menu);
      menu.hidden = false;
      filterTransportCombo(combo, input.value);
    });
    root.addEventListener('input', event => {
      const input = event.target.closest('.transport-combo-search');
      if (!input) return;
      const combo = input.closest('.transport-combo');
      const menu = combo.querySelector('.transport-combo-menu');
      combo.querySelector('input[type="hidden"]').value = '';
      closeCombos(menu);
      menu.hidden = false;
      filterTransportCombo(combo, input.value);
    });
    root.addEventListener('click', event => {
      const option = event.target.closest('[data-combo-value]');
      if (!option) {
        if (!event.target.closest('.transport-combo')) closeCombos();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const combo = option.closest('.transport-combo');
      combo.querySelector('.transport-combo-search').value = option.dataset.comboLabel || '';
      combo.querySelector('input[type="hidden"]').value = option.dataset.comboValue || '';
      combo.querySelector('.transport-combo-menu').hidden = true;
      root._transportComboSelect?.(combo.dataset.comboName, option.dataset.comboValue || '', combo);
    });
    document.addEventListener('pointerdown', event => {
      if (root.contains(event.target)) return;
      closeCombos();
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      closeCombos();
      root.querySelector('.transport-combo-search:focus')?.blur();
    });
  }

  function filterTransportCombo(combo, value) {
    const search = normalizeMaterialSearch(value);
    let visible = 0;
    combo.querySelectorAll('[data-combo-value]').forEach(button => {
      const matches = !search || String(button.dataset.comboSearch || '').includes(search);
      button.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = combo.querySelector('.material-suggestion-empty');
    if (empty) empty.hidden = visible > 0;
  }

  async function renderTransportRecords(container) {
    await loadLookups();
    container.innerHTML = `
      <div class="launches-wide-panel production-launch-panel production-launch-layout transport-launch-layout">
        <div class="panel production-consult-card transport-consult-card">
          <div class="transport-filters-target"></div>
          <div class="transport-indicators-target"></div>
        </div>
        <div class="panel production-table-card transport-table-card">
          <div class="section-heading">
            <h2>Transportes lan&ccedil;ados</h2>
            ${canWriteProduction ? '<button class="primary-button realize-transport" type="button">Realizar transporte</button>' : ''}
          </div>
          <div class="table-target"></div>
        </div>
      </div>
    `;
    container.querySelector('.realize-transport')?.addEventListener('click', () => openTransportModal(null, loadTable).catch(toast));
    const loadTable = async () => {
      const rows = await api('/stock/manual-transports');
      const tableTarget = container.querySelector('.table-target');
      const filtersTarget = container.querySelector('.transport-filters-target');
      const indicatorsTarget = container.querySelector('.transport-indicators-target');
      const filteredRows = filteredTransportRows(rows);
      const groups = groupTransportRows(filteredRows);
      tableTarget.innerHTML = '';
      const table = DataTable({
        columns: [
          { label: 'Data', render: group => formatDateOnly(group.transport_date), sortValue: group => group.transport_date },
          { label: 'Materiais transportados', render: transportMaterialSummary },
          { label: 'Origem / destino', render: group => escapeHtml(transportRouteLabel(group)) },
          { label: 'Quantidade', render: transportQuantitySummary, sortValue: group => group.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0) },
          { label: 'Peso fator', render: group => transportFactorSummary(group.rows), sortValue: group => group.rows.reduce((sum, row) => sum + Number(transportFactorQuantity(transportFactorMaterial(row), row.quantity) || 0), 0) },
          { label: 'Nota fiscal', render: group => group.invoice_number || '-' },
          { label: 'Observa&ccedil;&atilde;o', render: group => group.notes || '-' },
          { label: 'Status', render: group => isCanceledTransport(group) ? '<span class="production-status-pill canceled">Cancelado</span>' : '<span class="production-status-pill launched">Lan&ccedil;ado</span>' },
          { label: 'Editar', render: group => canWriteProduction ? `<button class="link-button" data-edit-transport="${escapeHtml(group.key)}">${isCanceledTransport(group) ? 'Visualizar' : 'Editar'}</button>` : '' }
        ],
        rows: groups,
        rowClass: group => isCanceledTransport(group) ? 'production-canceled-row' : ''
      });
      table.classList.add('transport-launch-table-wrap');
      tableTarget.appendChild(table);
      renderTransportFilters(filtersTarget, rows);
      renderTransportIndicators(indicatorsTarget, filteredRows);
      tableTarget.onclick = event => {
        if (!canWriteProduction) return;
        const button = event.target.closest('[data-edit-transport]');
        if (!button) return;
        const group = groups.find(item => item.key === button.dataset.editTransport);
        if (group) openTransportModal(group, loadTable).catch(toast);
      };
    };

    function renderTransportFilters(filtersTarget, rows) {
      const materialIdsInRows = new Set(rows.map(row => String(row.material_id)));
      const materialItems = materials
        .filter(material => materialIdsInRows.has(String(material.id)))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
        .map(material => ({ value: String(material.id), label: material.name, search: [material.name, ...(material.codes || [])].join(' ') }));
      const invoiceItems = [...new Set(rows.map(row => String(row.invoice_number || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
        .map(invoice => ({ value: invoice, label: invoice }));
      const routeItems = [...new Map(rows.map(row => [transportRouteKey(row), { value: transportRouteKey(row), label: transportRouteLabel(row) }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
      filtersTarget.innerHTML = `
        <form class="filters transport-filters">
          ${renderTransportCombo({ name: 'filterMaterialId', label: 'Material transportado', placeholder: 'Digite para buscar material transportado', selectedValue: transportFilters.materialId, searchValue: transportFilters.materialSearch, items: materialItems })}
          ${renderTransportCombo({ name: 'filterInvoiceNumber', label: 'Nota fiscal', placeholder: 'Digite para buscar nota fiscal', selectedValue: transportFilters.invoiceNumber, searchValue: transportFilters.invoiceSearch, items: invoiceItems })}
          ${renderTransportCombo({ name: 'filterRouteKey', label: 'Origem / destino', placeholder: 'Selecione origem / destino', selectedValue: transportFilters.routeKey, searchValue: transportFilters.routeSearch, items: routeItems })}
          <label>Data inicial<input name="filterStartDate" type="date" value="${escapeHtml(transportFilters.startDate)}" /></label>
          <label>Data final<input name="filterEndDate" type="date" value="${escapeHtml(transportFilters.endDate)}" /></label>
          <button class="primary-button" type="submit">Filtrar</button>
          <button class="secondary-button clear-transport-filters" type="button">Limpar filtros</button>
        </form>
      `;
      bindTransportCombos(filtersTarget);
      filtersTarget.onsubmit = event => {
        event.preventDefault();
        const form = event.target.closest('form');
        if (!form) return;
        transportFilters = {
          materialId: form.elements.filterMaterialId.value,
          materialSearch: form.elements.filterMaterialIdSearch.value,
          invoiceNumber: form.elements.filterInvoiceNumber.value,
          invoiceSearch: form.elements.filterInvoiceNumberSearch.value,
          routeKey: form.elements.filterRouteKey.value,
          routeSearch: form.elements.filterRouteKeySearch.value,
          startDate: form.elements.filterStartDate.value,
          endDate: form.elements.filterEndDate.value
        };
        loadTable().catch(toast);
      };
      filtersTarget.querySelector('.clear-transport-filters')?.addEventListener('click', () => {
        transportFilters = {
          materialId: '',
          materialSearch: '',
          invoiceNumber: '',
          invoiceSearch: '',
          routeKey: '',
          routeSearch: '',
          startDate: '',
          endDate: ''
        };
        loadTable().catch(toast);
      });
    }

    await loadTable();
  }

    async function openTransportModal(group = null, onSaved = async () => {}) {
    await loadLookups();

    let transportStockRows = [];
    let transportStockLoadFailed = false;

    try {
      const stockContext = await api('/stock/current');
      transportStockRows = stockContext.rows || [];
    } catch (error) {
      transportStockLoadFailed = true;
    }

    const readOnlyMode = Boolean(group && isCanceledTransport(group));
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const initialLines = group?.rows?.length
      ? group.rows.map(row => ({
        id: row.id,
        materialId: row.material_id,
        materialSearch: materialSearchLabel(materialById(row.material_id)) || row.material_name || '',
        quantity: row.quantity,
        unit: row.primary_unit || materialById(row.material_id)?.primary_unit || '',
        factorUnit: row.secondary_unit || materialById(row.material_id)?.secondary_unit || ''
      }))
      : [{ materialId: '', materialSearch: '', quantity: '', unit: '', factorUnit: '' }];
    let lines = initialLines;
    backdrop.innerHTML = `
      <div class="modal wide-modal production-modal transport-modal${readOnlyMode ? ' production-canceled-modal' : ''}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>${group ? readOnlyMode ? 'Visualizar transporte' : 'Editar transporte' : 'Realizar transporte'}</h2>
          <div class="modal-header-actions">
            ${readOnlyMode ? '' : '<button class="secondary-button clear-transport" type="button">Limpar transporte</button>'}
          </div>
        </div>
        <form class="transport-realization-form">
          <div class="grid-form">
            <label>Data<input name="transportDate" type="date" required value="${escapeHtml(String(group?.transport_date || todayBrazil()).slice(0, 10))}" ${readOnlyMode ? 'readonly' : ''} /></label>
            <label>N&uacute;mero da nota fiscal<input name="invoiceNumber" value="${escapeHtml(group?.invoice_number || '')}" ${readOnlyMode ? 'readonly' : ''} /></label>
            <label>Origem<select name="originLocationId" required ${readOnlyMode ? 'disabled' : ''}>${locationOptions(group?.origin_location_id || '', true)}</select></label>
            <label>Destino<select name="destinationLocationId" required ${readOnlyMode ? 'disabled' : ''}>${locationOptions(group?.destination_location_id || '', true)}</select></label>
          </div>
          <section class="transport-lines-section">
            <div class="section-heading compact-heading">
              <h3>Materiais transportados</h3>
              ${readOnlyMode ? '' : '<button class="secondary-button add-transport-line" type="button">+ Adicionar material</button>'}
            </div>
            <div class="transport-lines-target"></div>
          </section>
          <label class="wide-field">Observa&ccedil;&atilde;o<input name="notes" value="${escapeHtml(group?.notes || '')}" ${readOnlyMode ? 'readonly' : ''} /></label>
          <div class="form-actions production-modal-actions">
            ${group && !readOnlyMode ? '<button class="danger-button cancel-transport" type="button">Cancelar transporte</button>' : ''}
            ${isSuperAdmin && group ? '<button class="danger-button icon-danger-button delete-transport" type="button" title="Excluir transporte" aria-label="Excluir transporte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg></button>' : ''}
            <button class="secondary-button close-modal" type="button">Cancelar</button>
            ${readOnlyMode ? '' : '<button class="primary-button" type="submit">Salvar transporte</button>'}
          </div>
        </form>
      </div>
    `;
        const form = backdrop.querySelector('form');
    const linesTarget = backdrop.querySelector('.transport-lines-target');

    function transportStockRow(materialId, originLocationId) {
      if (!materialId || !originLocationId) return null;

      return transportStockRows.find(row => (
        String(row.materialId) === String(materialId)
        && String(row.locationId) === String(originLocationId)
      )) || null;
    }

        function transportOriginStockQty(materialId, originLocationId) {
      if (!materialId || !originLocationId || transportStockLoadFailed) {
        return null;
      }

      const stockRow = transportStockRow(materialId, originLocationId);

      return Number(stockRow?.currentQty || 0);
    }

    function transportOriginStockHtml(
      material,
      originLocationId
    ) {
      if (!originLocationId) {
        return '<span>Selecione a origem para consultar o estoque.</span>';
      }

      if (!material) {
        return '<span>Selecione o material para consultar o estoque da origem.</span>';
      }

      if (transportStockLoadFailed) {
        return '<span>Estoque da origem indisponível para consulta.</span>';
      }

      const primaryQty =
        transportOriginStockQty(
          material.id,
          originLocationId
        ) ?? 0;

      const primaryUnit =
        String(
          material.primary_unit || ''
        ).trim();

      const secondaryUnit =
        String(
          material.secondary_unit || ''
        ).trim();

      const factor =
        Number(
          material.primary_to_secondary_factor || 0
        );

      const primaryText =
        `${formatNumber(primaryQty)} ${primaryUnit}`.trim();

      let quantityText =
        primaryText;

      if (
        secondaryUnit
        &&
        factor > 0
        && (
          secondaryUnit !== primaryUnit
          ||
          Math.abs(
            factor - 1
          ) > 0.000001
        )
      ) {
        const secondaryQty =
          transportFactorQuantity(
            material,
            primaryQty
          );

        quantityText +=
          ` / ${formatNumber(secondaryQty)} ${secondaryUnit}`;
      }

      return `
        <span>Em estoque na origem:</span>
        <strong>${escapeHtml(quantityText)}</strong>
      `;
    }

    function updateAllTransportLineStocks() {
      const originLocationId =
        form.elements.originLocationId.value;

      const lineRows =
        [
          ...linesTarget.querySelectorAll(
            '.transport-line'
          )
        ];

      lineRows.forEach(
        lineRow => {
        const stockTarget =
          lineRow.querySelector(
            '[data-transport-origin-stock]'
          );

        const materialId =
          lineRow.querySelector(
            '[name="lineMaterialId"]'
          )?.value;

        const material =
          materialById(
            materialId
          );

        /*
         * O saldo da origem é apenas
         * informativo.
         *
         * Não existe mais comparação
         * entre quantidade transportada
         * e estoque disponível.
         */

        if (stockTarget) {
          stockTarget.classList.remove(
            'is-exceeded'
          );

          stockTarget.innerHTML =
            transportOriginStockHtml(
              material,
              originLocationId
            );
        }

        const quantityInput =
          lineRow.querySelector(
            '[name="lineQuantity"]'
          );

        quantityInput?.classList.remove(
          'transport-stock-exceeded-input'
        );
      }
    );

      /*
       * Mantemos retorno false somente
       * por compatibilidade com chamadas
       * existentes.
       *
       * O estoque nunca mais bloqueia
       * o transporte.
       */
      return false;
    }

    function collectLines() {
      return [...linesTarget.querySelectorAll('.transport-line')].map(row => {
        const materialId = row.querySelector('[name="lineMaterialId"]').value;
        const material = materialById(materialId);
        return {
          id: row.dataset.recordId || '',
          materialId,
          materialSearch: row.querySelector('[name="lineMaterialIdSearch"]').value,
          quantity: Number(row.querySelector('[name="lineQuantity"]').value || 0),
          unit: material?.primary_unit || row.querySelector('[name="lineUnit"]').value || '',
          factorUnit: material?.secondary_unit || ''
        };
      });
    }

    function updateTransportLineDerived(lineRow) {
      const materialId = lineRow?.querySelector('[name="lineMaterialId"]')?.value;
      const material = materialById(materialId);
      const quantity = Number(lineRow?.querySelector('[name="lineQuantity"]')?.value || 0);
      const unitInput = lineRow?.querySelector('[name="lineUnit"]');
      const factorInput = lineRow?.querySelector('[name="lineFactorQty"]');
      if (unitInput) unitInput.value = material?.primary_unit || '';
      if (factorInput) {
        const factorQty = transportFactorQuantity(material, quantity);
        const factorUnit = material?.secondary_unit || '';
        factorInput.value = factorQty > 0 && factorUnit ? `${formatNumber(factorQty)} ${factorUnit}` : '';
      }
    }

    function renderLines() {
      linesTarget.innerHTML = lines.map((line, index) => {
        const selectedMaterial = materialById(line.materialId);
        const factorQty = transportFactorQuantity(selectedMaterial, line.quantity);
        const factorUnit = selectedMaterial?.secondary_unit || line.factorUnit || '';
        const materialItems = materials
          .filter(material => material.active !== false)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
          .map(material => ({ value: String(material.id), label: materialSearchLabel(material), search: [material.name, ...(material.codes || [])].join(' ') }));
        return `
                    <div class="transport-line" data-line-index="${index}" data-record-id="${escapeHtml(line.id || '')}">
            <div class="transport-material-stock-field">
              ${renderTransportCombo({ name: 'lineMaterialId', label: 'Material', placeholder: 'Digite para buscar material cadastrado', selectedValue: line.materialId || '', items: materialItems })}
              <div class="transport-origin-stock" data-transport-origin-stock>
                ${transportOriginStockHtml(selectedMaterial, form.elements.originLocationId.value)}
              </div>
            </div>
            <label>Quantidade<input name="lineQuantity" type="number" step="0.001" min="0.001" required value="${escapeHtml(line.quantity || '')}" ${readOnlyMode ? 'readonly' : ''} /></label>
            <label>Unidade<input name="lineUnit" value="${escapeHtml(selectedMaterial?.primary_unit || line.unit || '')}" readonly /></label>
            <label>Peso fator<input name="lineFactorQty" value="${escapeHtml(factorQty > 0 && factorUnit ? `${formatNumber(factorQty)} ${factorUnit}` : '')}" readonly /></label>
            ${readOnlyMode || lines.length <= 1 || (line.id && !isSuperAdmin) ? '' : '<button class="small-action-button danger remove-transport-line" type="button" aria-label="Remover material">-</button>'}
          </div>
        `;
      }).join('');
                  bindTransportCombos(linesTarget, (name, value, combo) => {
        if (name !== 'lineMaterialId') return;

        const lineRow =
          combo?.closest('.transport-line');

        updateTransportLineDerived(lineRow);
        updateAllTransportLineStocks();
      });

      updateAllTransportLineStocks();
    }

    renderLines();
    form.elements.originLocationId.addEventListener('change', updateAllTransportLineStocks);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    backdrop.querySelector('.add-transport-line')?.addEventListener('click', event => {
      event.preventDefault();
      lines = collectLines();
      lines.push({ materialId: '', materialSearch: '', quantity: '', unit: '', factorUnit: '' });
      renderLines();
    });
    linesTarget.addEventListener('click', event => {
      if (!event.target.classList.contains('remove-transport-line')) return;
      const index = Number(event.target.closest('.transport-line')?.dataset.lineIndex || 0);
      lines = collectLines().filter((_, lineIndex) => lineIndex !== index);
      renderLines();
    });
        linesTarget.addEventListener('input', event => {
      if (
        !event.target.matches(
          '[name="lineQuantity"]'
        )
      ) {
        return;
      }

      updateTransportLineDerived(
        event.target.closest(
          '.transport-line'
        )
      );

      lines = collectLines();

      updateAllTransportLineStocks();
    });
    backdrop.querySelector('.clear-transport')?.addEventListener('click', () => {
      form.reset();
      form.elements.transportDate.value = todayBrazil();
      lines = [{ materialId: '', materialSearch: '', quantity: '', unit: '', factorUnit: '' }];
      renderLines();
    });
    backdrop.querySelector('.cancel-transport')?.addEventListener('click', async () => {
      if (!confirm('Confirma o cancelamento deste transporte?')) return;
      await Promise.all((group.rows || []).map(row => api(`/stock/manual-transports/${row.id}/cancel`, { method: 'POST', body: { reason: 'Cancelado pelo usuario' } })));
      backdrop.remove();
      await onSaved();
    });
    backdrop.querySelector('.delete-transport')?.addEventListener('click', async () => {
      if (!confirm('Excluir definitivamente este transporte?')) return;
      await Promise.all((group.rows || []).map(row => api(`/stock/manual-transports/${row.id}`, { method: 'DELETE' })));
      backdrop.remove();
      await onSaved();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const payloadLines = collectLines();
      const hasMissingRequired = !form.elements.transportDate.value
        || !form.elements.originLocationId.value
        || !form.elements.destinationLocationId.value
        || payloadLines.some(line => !line.materialId || !Number.isFinite(line.quantity) || line.quantity <= 0);
      if (hasMissingRequired) {
        toast('Preencha data, origem, destino, material e quantidade.');
        return;
      }
            if (
        String(
          form.elements.originLocationId.value
        ) ===
        String(
          form.elements.destinationLocationId.value
        )
      ) {
        toast(
          'Origem e destino devem ser diferentes.'
        );

        return;
      }

      const common = {
        transportDate: form.elements.transportDate.value,
        originLocationId: Number(form.elements.originLocationId.value),
        destinationLocationId: Number(form.elements.destinationLocationId.value),
        invoiceNumber: form.elements.invoiceNumber.value,
        notes: form.elements.notes.value
      };
      const existing = payloadLines.filter(line => line.id);
      const created = payloadLines.filter(line => !line.id);
      const remainingIds = new Set(existing.map(line => String(line.id)));
      const removedIds = (group?.rows || [])
        .map(row => String(row.id))
        .filter(id => !remainingIds.has(id));
      await Promise.all(existing.map(line => api(`/stock/manual-transports/${line.id}`, {
        method: 'PUT',
        body: {
          ...common,
          materialId: Number(line.materialId),
          quantity: line.quantity
        }
      })));
      if (created.length) {
        await api('/stock/manual-transports', {
          method: 'POST',
          body: {
            ...common,
          items: created.map(line => ({ materialId: Number(line.materialId), quantity: line.quantity }))
          }
        });
      }
      if (removedIds.length) {
        await Promise.all(removedIds.map(id => api(`/stock/manual-transports/${id}`, { method: 'DELETE' })));
      }
      backdrop.remove();
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Transporte salvo.' }));
      await onSaved();
    });
    page.appendChild(backdrop);
  }

   function purchaseStockQuantityFromWeight(
    material,
    totalWeightKg
  ) {
    const weight =
      Number(
        totalWeightKg || 0
      );

    if (
      !(weight > 0)
      || !material
    ) {
      return null;
    }

    const primaryUnit =
      normalizeText(
        material.primary_unit
      );

    const secondaryUnit =
      normalizeText(
        material.secondary_unit
      );

    const factor =
      Number(
        material
          .primary_to_secondary_factor ||
        0
      );

    if (
      primaryUnit === 'kg'
    ) {
      return Number(
        weight.toFixed(6)
      );
    }

    if (
      primaryUnit === 'un'
      && secondaryUnit === 'kg'
      && factor > 0
    ) {
      return Number(
        (
          weight /
          factor
        ).toFixed(6)
      );
    }

    return null;
  }

  function purchaseQuantitySummary(
    purchase
  ) {
    const totals =
      (
        purchase.items ||
        []
      ).reduce(
        (
          acc,
          item
        ) => {
          const unit =
            String(
              item.primary_unit ||
              ''
            ).trim();

          acc.set(
            unit,

            (
              acc.get(unit) ||
              0
            ) +
            Number(
              item.stock_quantity ||
              0
            )
          );

          return acc;
        },
        new Map()
      );

    return [
      ...totals.entries()
    ]
      .map(
        (
          [
            unit,
            quantity
          ]
        ) =>
          `${formatNumber(quantity)} ${unit}`.trim()
      )
      .join(' / ')
      || '0';
  }

  function purchaseMaterialSummary(
    purchase
  ) {
    return (
      purchase.items ||
      []
    )
      .map(item => {
        const code =
          firstCodeFromCodes(
            item.material_codes
          );

        const label =
          [
            item.material_name ||
              '-',
            code
          ]
            .filter(Boolean)
            .join(' - ');

        return `${escapeHtml(label)}: ${formatNumber(item.stock_quantity)} ${escapeHtml(item.primary_unit || '')}`.trim();
      })
      .join('<br>')
      || '-';
  }

  function purchaseLocationSummary(
    purchase
  ) {
    return [
      ...new Set(
        (
          purchase.items ||
          []
        )
          .map(
            item =>
              item.location_name
          )
          .filter(Boolean)
      )
    ]
      .map(
        escapeHtml
      )
      .join(' / ')
      || '-';
  }

  function purchaseLotsSummary(
  purchase
) {
  const lots =
    (
      purchase.items ||
      []
    ).flatMap(
      item =>
        item.lots ||
        []
    );

  if (!lots.length) {
    return '-';
  }

  const previewLots =
    lots.slice(
      0,
      2
    );

  const remaining =
    Math.max(
      lots.length - previewLots.length,
      0
    );

  return `
    <div
      class="purchase-lots-cell"
    >
      <div
        class="purchase-lots-cell-head"
      >
        <strong>
          ${formatNumber(
            lots.length
          )}
          ${
            lots.length === 1
              ? 'lote'
              : 'lotes'
          }
        </strong>

        <button
          type="button"
          class="purchase-lots-view-button"
          data-view-purchase-lots="${escapeHtml(
            purchase.id
          )}"
        >
          Ver lotes
        </button>
      </div>

      <div
        class="purchase-lots-preview"
      >
        ${
          previewLots
            .map(
              lot => `
                <span>
                  ${escapeHtml(
                    lot.lot_number ||
                    '-'
                  )}
                </span>
              `
            )
            .join('')
        }

        ${
          remaining > 0
            ? `
              <span
                class="purchase-lots-more"
              >
                +${formatNumber(
                  remaining
                )}
              </span>
            `
            : ''
        }
      </div>
    </div>
  `;
}

function openPurchaseLotsModal(
  purchase
) {
  const items =
    purchase.items ||
    [];

  const allLots =
    items.flatMap(
      item =>
        item.lots ||
        []
    );

  const backdrop =
    document.createElement(
      'div'
    );

  backdrop.className =
    'modal-backdrop';


  backdrop.innerHTML = `
    <div
      class="modal purchase-lots-view-modal"
      role="dialog"
      aria-modal="true"
    >

      <div
        class="modal-header purchase-lots-view-header"
      >
        <div>
          <h2>
            Lotes da compra
          </h2>

          <p>
            Nota fiscal
            <strong>
              ${escapeHtml(
                purchase.invoice_number ||
                '-'
              )}
            </strong>
            ·
            ${escapeHtml(
              purchase.supplier ||
              '-'
            )}
          </p>
        </div>

        <button
          type="button"
          class="link-button close-purchase-lots"
        >
          Fechar
        </button>
      </div>


      <div
        class="purchase-lots-view-summary"
      >

        <article>
          <span>
            Lotes / UDs
          </span>

          <strong>
            ${formatNumber(
              allLots.length
            )}
          </strong>
        </article>


        <article>
          <span>
            Materiais
          </span>

          <strong>
            ${formatNumber(
              items.length
            )}
          </strong>
        </article>


        <article>
          <span>
            Peso total
          </span>

          <strong>
            ${formatNumber(
              purchase
                .invoice_total_weight_kg
              ||
              0
            )}
            kg
          </strong>
        </article>


        <article>
          <span>
            Certificado
          </span>

          <strong>
            ${escapeHtml(
              purchase
                .certificate_number
              ||
              '-'
            )}
          </strong>
        </article>

      </div>


      <div
        class="purchase-lots-view-list"
      >

        ${
          items
            .map(
              item => {
                const codes =
                  item.material_codes ||
                  [];

                const lots =
                  item.lots ||
                  [];

                return `
                  <section
                    class="purchase-lots-view-material"
                  >

                    <div
                      class="purchase-lots-view-material-head"
                    >
                      <div>
                        <strong>
                          ${escapeHtml(
                            item.material_name ||
                            'Material'
                          )}
                        </strong>

                        ${
                          codes.length
                            ? `
                              <small>
                                ${escapeHtml(
                                  codes.join(', ')
                                )}
                              </small>
                            `
                            : ''
                        }
                      </div>

                      <span>
                        ${formatNumber(
                          lots.length
                        )}
                        ${
                          lots.length === 1
                            ? 'lote'
                            : 'lotes'
                        }
                      </span>
                    </div>


                    ${
                      lots.length
                        ? `
                          <div
                            class="purchase-lots-view-table-wrap"
                          >
                            <table
                              class="purchase-lots-view-table"
                            >
                              <thead>
                                <tr>
                                  <th>
                                    Lote / UD
                                  </th>

                                  <th>
                                    Peso
                                  </th>

                                  <th>
                                    Corrida
                                  </th>

                                  <th>
                                    Lim. resistência
                                  </th>

                                  <th>
                                    Grau / Qualidade
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                ${
                                  lots
                                    .map(
                                      lot => `
                                        <tr>
                                          <td>
                                            <strong>
                                              ${escapeHtml(
                                                lot.lot_number ||
                                                '-'
                                              )}
                                            </strong>
                                          </td>

                                          <td>
                                            ${formatNumber(
                                              lot.weight_kg
                                              ||
                                              0
                                            )}
                                            kg
                                          </td>

                                          <td>
                                            ${escapeHtml(
                                              lot.heat_number ||
                                              '-'
                                            )}
                                          </td>

                                          <td>
                                            ${
                                              lot
                                                .tensile_strength_mpa
                                                ? `${
                                                    formatNumber(
                                                      lot
                                                        .tensile_strength_mpa
                                                    )
                                                  } MPa`
                                                : '-'
                                            }
                                          </td>

                                          <td>
                                            ${escapeHtml(
                                              lot.steel_grade ||
                                              '-'
                                            )}
                                          </td>
                                        </tr>
                                      `
                                    )
                                    .join('')
                                }
                              </tbody>
                            </table>
                          </div>
                        `
                        : `
                          <div
                            class="empty-state compact"
                          >
                            Nenhum lote informado.
                          </div>
                        `
                    }

                  </section>
                `;
              }
            )
            .join('')
        }

      </div>

    </div>
  `;


  const close =
    () => {
      backdrop.remove();
    };


  backdrop
    .querySelector(
      '.close-purchase-lots'
    )
    ?.addEventListener(
      'click',
      close
    );


  backdrop.addEventListener(
    'mousedown',
    event => {
      if (
        event.target === backdrop
      ) {
        close();
      }
    }
  );


  const onKeyDown =
    event => {
      if (
        event.key === 'Escape'
      ) {
        document.removeEventListener(
          'keydown',
          onKeyDown
        );

        close();
      }
    };


  document.addEventListener(
    'keydown',
    onKeyDown
  );


  document.body.appendChild(
    backdrop
  );
}

    function purchaseFilterValues(value) {
    return Array.isArray(value)
      ? value
          .map(item => String(item || '').trim())
          .filter(Boolean)
      : String(value || '').trim()
        ? [String(value).trim()]
        : [];
  }

  function purchaseRowMatchesFilters(
    row,
    ignoredFilter = ''
  ) {
    const purchaseDate =
      String(
        row.purchase_date || ''
      ).slice(0, 10);

    const materialIds =
      purchaseFilterValues(
        purchaseFilters.materialIds
      );

    const suppliers =
      purchaseFilterValues(
        purchaseFilters.suppliers
      );

    const invoiceNumbers =
      purchaseFilterValues(
        purchaseFilters.invoiceNumbers
      );

    const certificateNumbers =
      purchaseFilterValues(
        purchaseFilters.certificateNumbers
      );

    if (
      ignoredFilter !== 'material'
      && materialIds.length
      && !(
        row.items || []
      ).some(
        item =>
          materialIds.includes(
            String(item.material_id)
          )
      )
    ) {
      return false;
    }

    if (
      ignoredFilter !== 'supplier'
      && suppliers.length
      && !suppliers.includes(
        String(
          row.supplier || ''
        ).trim()
      )
    ) {
      return false;
    }

    if (
      ignoredFilter !== 'invoice'
      && invoiceNumbers.length
      && !invoiceNumbers.includes(
        String(
          row.invoice_number || ''
        ).trim()
      )
    ) {
      return false;
    }

    if (
      ignoredFilter !== 'certificate'
      && certificateNumbers.length
      && !certificateNumbers.includes(
        String(
          row.certificate_number || ''
        ).trim()
      )
    ) {
      return false;
    }

    if (
      purchaseFilters.locationId
      && !(
        row.items || []
      ).some(
        item =>
          String(item.location_id) ===
          String(
            purchaseFilters.locationId
          )
      )
    ) {
      return false;
    }

    if (
      purchaseFilters.startDate
      && purchaseDate <
        purchaseFilters.startDate
    ) {
      return false;
    }

    if (
      purchaseFilters.endDate
      && purchaseDate >
        purchaseFilters.endDate
    ) {
      return false;
    }

    return true;
  }

  function filteredPurchaseRecords(rows) {
    return rows.filter(
      row =>
        purchaseRowMatchesFilters(row)
    );
  }

  function purchaseFilterOptions(
    candidateRows,
    allRows,
    selectedValues,
    extractor
  ) {
    const selected =
      new Set(
        purchaseFilterValues(
          selectedValues
        )
      );

    const available =
      new Map();

    const all =
      new Map();

    const addRows = (
      target,
      sourceRows
    ) => {
      sourceRows.forEach(row => {
        const extracted =
          extractor(row);

        const items =
          Array.isArray(extracted)
            ? extracted
            : [extracted];

        items.forEach(item => {
          if (
            !item
            || !String(
              item.value || ''
            ).trim()
          ) {
            return;
          }

          target.set(
            String(item.value),
            {
              value:
                String(item.value),

              label:
                String(
                  item.label ??
                  item.value
                ),

              search:
                String(
                  item.search ??
                  item.label ??
                  item.value
                )
            }
          );
        });
      });
    };

    addRows(
      available,
      candidateRows
    );

    addRows(
      all,
      allRows
    );

    selected.forEach(value => {
      if (
        !available.has(value)
        && all.has(value)
      ) {
        available.set(
          value,
          all.get(value)
        );
      }
    });

    return [
      ...available.values()
    ].sort(
      (left, right) =>
        left.label.localeCompare(
          right.label,
          'pt-BR',
          {
            numeric: true
          }
        )
    );
  }

  function renderPurchaseMultiFilter({
    name,
    label,
    placeholder,
    selectedValues,
    items
  }) {
    const selected =
      purchaseFilterValues(
        selectedValues
      );

    const selectedSet =
      new Set(selected);

    const selectedItems =
      selected
        .map(value =>
          items.find(
            item =>
              String(item.value) ===
              String(value)
          )
        )
        .filter(Boolean);

    const summary =
      !selectedItems.length
        ? placeholder
        : selectedItems.length === 1
          ? selectedItems[0].label
          : `${selectedItems[0].label} +${selectedItems.length - 1}`;

    return `
      <div
        class="purchase-multi-filter"
        data-purchase-filter-name="${escapeHtml(name)}"
      >
        <span class="purchase-multi-filter-label">
          ${escapeHtml(label)}
        </span>

        <button
          class="purchase-multi-filter-trigger ${
            selected.length
              ? 'has-selection'
              : ''
          }"
          type="button"
          data-purchase-filter-toggle
          aria-expanded="false"
        >
          <span>
            ${escapeHtml(summary)}
          </span>

          <span
            class="purchase-multi-filter-chevron"
            aria-hidden="true"
          >
            ▾
          </span>
        </button>

        <div
          class="purchase-multi-filter-menu"
          hidden
        >
          <input
            class="purchase-multi-filter-search"
            type="search"
            autocomplete="off"
            placeholder="Pesquisar ${escapeHtml(
              label.toLowerCase()
            )}"
          />

          <div class="purchase-multi-filter-actions">

            <span>
              ${
                selected.length
                  ? `${selected.length} selecionado(s)`
                  : 'Nenhum selecionado'
              }
            </span>

            <button
              class="link-button"
              type="button"
              data-purchase-filter-clear
              ${
                selected.length
                  ? ''
                  : 'disabled'
              }
            >
              Limpar seleção
            </button>

          </div>

          <div class="purchase-multi-filter-options">

            ${
              items.map(
                item => `
                  <label
                    class="purchase-multi-filter-option"
                    data-purchase-filter-search="${escapeHtml(
                      normalizeMaterialSearch(
                        item.search ||
                        item.label
                      )
                    )}"
                  >
                    <input
                      type="checkbox"
                      value="${escapeHtml(item.value)}"
                      data-purchase-filter-option
                      ${
                        selectedSet.has(
                          String(item.value)
                        )
                          ? 'checked'
                          : ''
                      }
                    />

                    <span>
                      ${escapeHtml(item.label)}
                    </span>
                  </label>
                `
              ).join('')
            }

            <div
              class="purchase-multi-filter-empty"
              ${
                items.length
                  ? 'hidden'
                  : ''
              }
            >
              Nenhum registro lançado para este filtro.
            </div>

          </div>

        </div>

      </div>
    `;
  }

  function bindPurchaseMultiFilters(
    root,
    onChange = () => {}
  ) {
    root._purchaseMultiFilterChange =
      onChange;

    if (
      root.dataset.purchaseMultiFiltersBound ===
      'true'
    ) {
      return;
    }

    root.dataset.purchaseMultiFiltersBound =
      'true';

    const closeMenus =
      except => {
        root.querySelectorAll(
          '.purchase-multi-filter-menu'
        ).forEach(menu => {
          if (
            except
            && menu === except
          ) {
            return;
          }

          menu.hidden =
            true;

          menu
            .closest(
              '.purchase-multi-filter'
            )
            ?.querySelector(
              '[data-purchase-filter-toggle]'
            )
            ?.setAttribute(
              'aria-expanded',
              'false'
            );
        });
      };

    root.addEventListener(
      'click',
      event => {
        const toggle =
          event.target.closest(
            '[data-purchase-filter-toggle]'
          );

        if (toggle) {
          event.preventDefault();

          const filter =
            toggle.closest(
              '.purchase-multi-filter'
            );

          const menu =
            filter?.querySelector(
              '.purchase-multi-filter-menu'
            );

          if (!menu) {
            return;
          }

          const willOpen =
            menu.hidden;

          closeMenus(
            willOpen
              ? menu
              : null
          );

          menu.hidden =
            !willOpen;

          toggle.setAttribute(
            'aria-expanded',
            willOpen
              ? 'true'
              : 'false'
          );

          if (willOpen) {
            filter
              .querySelector(
                '.purchase-multi-filter-search'
              )
              ?.focus();
          }

          return;
        }

        const clear =
          event.target.closest(
            '[data-purchase-filter-clear]'
          );

        if (!clear) {
          return;
        }

        event.preventDefault();

        const filter =
          clear.closest(
            '.purchase-multi-filter'
          );

        const name =
          filter?.dataset
            .purchaseFilterName;

        filter
          ?.querySelectorAll(
            '[data-purchase-filter-option]'
          )
          .forEach(input => {
            input.checked =
              false;
          });

        root
          ._purchaseMultiFilterChange?.(
            name,
            []
          );
      }
    );

    root.addEventListener(
      'input',
      event => {
        const search =
          event.target.closest(
            '.purchase-multi-filter-search'
          );

        if (!search) {
          return;
        }

        const filter =
          search.closest(
            '.purchase-multi-filter'
          );

        const normalized =
          normalizeMaterialSearch(
            search.value
          );

        let visible = 0;

        filter
          ?.querySelectorAll(
            '.purchase-multi-filter-option'
          )
          .forEach(option => {
            const matches =
              !normalized
              || String(
                option.dataset
                  .purchaseFilterSearch ||
                ''
              ).includes(normalized);

            option.hidden =
              !matches;

            if (matches) {
              visible += 1;
            }
          });

        const empty =
          filter?.querySelector(
            '.purchase-multi-filter-empty'
          );

        if (empty) {
          empty.hidden =
            visible > 0;
        }
      }
    );

    root.addEventListener(
      'change',
      event => {
        const option =
          event.target.closest(
            '[data-purchase-filter-option]'
          );

        if (!option) {
          return;
        }

        const filter =
          option.closest(
            '.purchase-multi-filter'
          );

        const name =
          filter?.dataset
            .purchaseFilterName;

        const values =
          [
            ...filter.querySelectorAll(
              '[data-purchase-filter-option]:checked'
            )
          ].map(
            input =>
              input.value
          );

        root
          ._purchaseMultiFilterChange?.(
            name,
            values
          );
      }
    );

    document.addEventListener(
      'pointerdown',
      event => {
        if (
          !root.contains(
            event.target
          )
        ) {
          closeMenus();
        }
      }
    );

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Escape'
        ) {
          closeMenus();
        }
      }
    );
  }
  function renderPurchaseIndicators(
    target,
    rows
  ) {
    const items =
      rows.flatMap(
        row =>
          row.items ||
          []
      );

    const lots =
      items.flatMap(
        item =>
          item.lots ||
          []
      );

    const totalWeight =
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row
              .invoice_total_weight_kg ||
            0
          ),
        0
      );

    target.innerHTML = `
      <div class="summary-grid transport-summary-grid">

        <article class="metric-card compact">
          <span>Total de compras</span>
          <strong>
            ${formatNumber(rows.length)}
          </strong>
        </article>

        <article class="metric-card compact">
          <span>Materiais comprados</span>
          <strong>
            ${formatNumber(
              new Set(
                items.map(
                  item =>
                    String(
                      item.material_id
                    )
                )
              ).size
            )}
          </strong>
        </article>

        <article class="metric-card compact">
          <span>Peso comprado</span>
          <strong>
            ${formatNumber(totalWeight)} kg
          </strong>
        </article>

        <article class="metric-card compact">
          <span>Fornecedores</span>
          <strong>
            ${formatNumber(
              new Set(
                rows
                  .map(
                    row =>
                      String(
                        row.supplier ||
                        ''
                      )
                  )
                  .filter(Boolean)
              ).size
            )}
          </strong>
        </article>

        <article class="metric-card compact">
          <span>Notas fiscais</span>
          <strong>
            ${formatNumber(
              new Set(
                rows
                  .map(
                    row =>
                      String(
                        row.invoice_number ||
                        ''
                      )
                  )
                  .filter(Boolean)
              ).size
            )}
          </strong>
        </article>

        <article class="metric-card compact">
          <span>Certificados</span>
          <strong>
            ${formatNumber(
              new Set(
                rows
                  .map(
                    row =>
                      String(
                        row.certificate_number ||
                        ''
                      )
                  )
                  .filter(Boolean)
              ).size
            )}
          </strong>
        </article>

        <article class="metric-card compact">
          <span>Lotes / UDs</span>
          <strong>
            ${formatNumber(lots.length)}
          </strong>
        </article>

      </div>
    `;
  }

  async function openPurchaseModal(
    purchase = null,
    onSaved = async () => {}
  ) {
    await loadLookups();

    const backdrop =
      document.createElement(
        'div'
      );

    backdrop.className =
      'modal-backdrop';

    const blankLot =
      () => ({
        lotNumber: '',
        weightKg: '',
        heatNumber: '',
        tensileStrengthMpa: '',
        steelGrade: ''
      });

    const blankItem =
      () => ({
        materialId: '',
        locationId: '',
        lots: [
          blankLot()
        ]
      });

    let purchaseItems =
      purchase?.items?.length
        ? purchase.items.map(
            item => ({
              materialId:
                item.material_id,

              locationId:
                item.location_id,

              lots:
                (
                  item.lots ||
                  []
                ).length
                  ? item.lots.map(
                      lot => ({
                        lotNumber:
                          lot.lot_number ||
                          '',

                        weightKg:
                          lot.weight_kg ||
                          '',

                        heatNumber:
                          lot.heat_number ||
                          '',

                        tensileStrengthMpa:
                          lot.tensile_strength_mpa ||
                          '',

                        steelGrade:
                          lot.steel_grade ||
                          ''
                      })
                    )
                  : [
                      blankLot()
                    ]
            })
          )
        : [
            blankItem()
          ];

    backdrop.innerHTML = `
      <div
        class="modal wide-modal production-modal purchase-modal"
        role="dialog"
        aria-modal="true"
      >

        <div class="modal-header">

          <h2>
            ${
              purchase
                ? 'Editar compra'
                : 'Realizar compra'
            }
          </h2>

          <div class="modal-header-actions">

            <button
              class="secondary-button clear-purchase"
              type="button"
            >
              Limpar compra
            </button>

          </div>

        </div>

        <form class="purchase-realization-form">

          <div class="grid-form purchase-header-grid">

            <label>
              Data

              <input
                name="purchaseDate"
                type="date"
                required
                value="${escapeHtml(
                  String(
                    purchase?.purchase_date ||
                    todayBrazil()
                  ).slice(
                    0,
                    10
                  )
                )}"
              />
            </label>

            <label>
              Fornecedor

              <input
                name="supplier"
                required
                value="${escapeHtml(
                  purchase?.supplier ||
                  ''
                )}"
                placeholder="Digite o fornecedor"
              />
            </label>

            <label>
              Nota fiscal

              <input
                name="invoiceNumber"
                required
                value="${escapeHtml(
                  purchase?.invoice_number ||
                  ''
                )}"
              />
            </label>

            <label>
              Nº certificado de qualidade

              <input
                name="certificateNumber"
                required
                value="${escapeHtml(
                  purchase?.certificate_number ||
                  ''
                )}"
              />
            </label>

            <label>
              Peso total NF (kg)

              <input
                name="invoiceTotalWeightKg"
                type="number"
                step="0.001"
                min="0.001"
                required
                value="${escapeHtml(
                  purchase?.invoice_total_weight_kg ||
                  ''
                )}"
              />
            </label>

          </div>

          <section class="purchase-lines-section">

            <div class="section-heading compact-heading">

              <h3>
                Materiais comprados
              </h3>

              <button
                class="secondary-button add-purchase-item"
                type="button"
              >
                + Adicionar material
              </button>

            </div>

            <div class="purchase-items-target"></div>

          </section>

          <div
            class="purchase-weight-check"
            data-purchase-weight-check
          ></div>

          <label class="wide-field">
            Observação

            <input
              name="notes"
              value="${escapeHtml(
                purchase?.notes ||
                ''
              )}"
            />
          </label>

          <div class="form-actions production-modal-actions">

            ${
              isSuperAdmin &&
              purchase
                ? `
                  <button
                    class="danger-button icon-danger-button delete-purchase"
                    type="button"
                    title="Excluir compra"
                    aria-label="Excluir compra"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18"/>
                      <path d="M8 6V4h8v2"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v5"/>
                      <path d="M14 11v5"/>
                    </svg>
                  </button>
                `
                : ''
            }

            <button
              class="secondary-button close-modal"
              type="button"
            >
              Cancelar
            </button>

            <button
              class="primary-button"
              type="submit"
            >
              Salvar compra
            </button>

          </div>

        </form>

      </div>
    `;

    const form =
      backdrop.querySelector(
        'form'
      );

    const itemsTarget =
      backdrop.querySelector(
        '.purchase-items-target'
      );

    const weightCheck =
      backdrop.querySelector(
        '[data-purchase-weight-check]'
      );

    function collectPurchaseItems() {
      return [
        ...itemsTarget.querySelectorAll(
          '.purchase-item'
        )
      ].map(
        itemRow => ({
          materialId:
            itemRow.querySelector(
              '[name="purchaseMaterialId"]'
            )?.value ||
            '',

          locationId:
            itemRow.querySelector(
              '[name="purchaseLocationId"]'
            )?.value ||
            '',

          lots: [
            ...itemRow.querySelectorAll(
              '.purchase-lot-row'
            )
          ].map(
            lotRow => ({
              lotNumber:
                lotRow.querySelector(
                  '[name="purchaseLotNumber"]'
                )?.value ||
                '',

              weightKg:
                lotRow.querySelector(
                  '[name="purchaseLotWeightKg"]'
                )?.value ||
                '',

              heatNumber:
                lotRow.querySelector(
                  '[name="purchaseHeatNumber"]'
                )?.value ||
                '',

              tensileStrengthMpa:
                lotRow.querySelector(
                  '[name="purchaseTensileStrengthMpa"]'
                )?.value ||
                '',

              steelGrade:
                lotRow.querySelector(
                  '[name="purchaseSteelGrade"]'
                )?.value ||
                ''
            })
          )
        })
      );
    }

    function itemWeightFromDom(
      itemRow
    ) {
      return [
        ...itemRow.querySelectorAll(
          '[name="purchaseLotWeightKg"]'
        )
      ].reduce(
        (
          sum,
          input
        ) =>
          sum +
          Number(
            input.value ||
            0
          ),
        0
      );
    }

    function updatePurchaseItemDerived(
      itemRow
    ) {
      if (!itemRow) {
        return;
      }

      const materialId =
        itemRow.querySelector(
          '[name="purchaseMaterialId"]'
        )?.value;

      const material =
        materialById(
          materialId
        );

      const weightKg =
        itemWeightFromDom(
          itemRow
        );

      const stockQuantity =
        purchaseStockQuantityFromWeight(
          material,
          weightKg
        );

      const qtyInput =
        itemRow.querySelector(
          '[name="purchaseStockQuantity"]'
        );

      const unitInput =
        itemRow.querySelector(
          '[name="purchasePrimaryUnit"]'
        );

      const weightInput =
        itemRow.querySelector(
          '[name="purchaseItemWeightKg"]'
        );

      if (qtyInput) {
        qtyInput.value =
          stockQuantity === null
            ? ''
            : formatNumber(
                stockQuantity
              );
      }

      if (unitInput) {
        unitInput.value =
          material?.primary_unit ||
          '';
      }

      if (weightInput) {
        weightInput.value =
          weightKg > 0
            ? `${formatNumber(weightKg)} kg`
            : '';
      }
    }

    function updatePurchaseWeightCheck() {
      itemsTarget
        .querySelectorAll(
          '.purchase-item'
        )
        .forEach(
          updatePurchaseItemDerived
        );

      const invoiceWeight =
        Number(
          form.elements
            .invoiceTotalWeightKg
            .value ||
          0
        );

      const lotsWeight =
        [
          ...itemsTarget.querySelectorAll(
            '[name="purchaseLotWeightKg"]'
          )
        ].reduce(
          (
            sum,
            input
          ) =>
            sum +
            Number(
              input.value ||
              0
            ),
          0
        );

      const difference =
        Number(
          (
            lotsWeight -
            invoiceWeight
          ).toFixed(3)
        );

      const matches =
        invoiceWeight > 0
        && Math.abs(
          difference
        ) <= 0.001;

      weightCheck
        .classList
        .toggle(
          'is-ok',
          matches
        );

      weightCheck
        .classList
        .toggle(
          'is-warning',
          invoiceWeight > 0
          && !matches
        );

      weightCheck.innerHTML = `
        <article>
          <span>Peso total NF</span>
          <strong>
            ${
              invoiceWeight > 0
                ? `${formatNumber(invoiceWeight)} kg`
                : '-'
            }
          </strong>
        </article>

        <article>
          <span>Soma dos lotes</span>
          <strong>
            ${formatNumber(lotsWeight)} kg
          </strong>
        </article>

        <article>
          <span>Diferença</span>
          <strong>
            ${
              invoiceWeight > 0
                ? `${formatNumber(Math.abs(difference))} kg`
                : '-'
            }
          </strong>
        </article>

        <div class="purchase-weight-message">
          ${
            matches
              ? '✓ Peso dos lotes confere com a nota fiscal.'
              : invoiceWeight > 0
                ? difference < 0
                  ? `Faltam ${formatNumber(Math.abs(difference))} kg para conferir com a nota fiscal.`
                  : `${formatNumber(Math.abs(difference))} kg acima do peso total informado.`
                : 'Informe o peso total da nota fiscal.'
          }
        </div>
      `;

      return matches;
    }

    function renderPurchaseItems() {
      const materialItems =
        materials
          .filter(
            material =>
              material.active !==
              false
          )
          .sort(
            (
              a,
              b
            ) =>
              String(
                a.name ||
                ''
              ).localeCompare(
                String(
                  b.name ||
                  ''
                ),
                'pt-BR'
              )
          )
          .map(
            material => ({
              value:
                String(
                  material.id
                ),

              label:
                materialSearchLabel(
                  material
                ),

              search:
                [
                  material.name,
                  ...(
                    material.codes ||
                    []
                  )
                ].join(' ')
            })
          );

      itemsTarget.innerHTML =
        purchaseItems
          .map(
            (
              item,
              itemIndex
            ) => {
              const material =
                materialById(
                  item.materialId
                );

              const totalWeight =
                (
                  item.lots ||
                  []
                ).reduce(
                  (
                    sum,
                    lot
                  ) =>
                    sum +
                    Number(
                      lot.weightKg ||
                      0
                    ),
                  0
                );

              const stockQuantity =
                purchaseStockQuantityFromWeight(
                  material,
                  totalWeight
                );

              return `
                <article
                  class="purchase-item"
                  data-purchase-item-index="${itemIndex}"
                >

                  <div class="purchase-item-main">

                    ${renderTransportCombo({
                      name:
                        'purchaseMaterialId',

                      label:
                        'Material',

                      placeholder:
                        'Digite para buscar material cadastrado',

                      selectedValue:
                        item.materialId ||
                        '',

                      items:
                        materialItems
                    })}

                    <label>
                      Local de entrada

                      <select
                        name="purchaseLocationId"
                        required
                      >
                        ${locationOptions(
                          item.locationId ||
                          '',
                          true
                        )}
                      </select>
                    </label>

                    <label>
                      Quantidade estoque

                      <input
                        name="purchaseStockQuantity"
                        value="${escapeHtml(
                          stockQuantity === null
                            ? ''
                            : formatNumber(
                                stockQuantity
                              )
                        )}"
                        readonly
                      />
                    </label>

                    <label>
                      Unidade

                      <input
                        name="purchasePrimaryUnit"
                        value="${escapeHtml(
                          material?.primary_unit ||
                          ''
                        )}"
                        readonly
                      />
                    </label>

                    <label>
                      Peso dos lotes

                      <input
                        name="purchaseItemWeightKg"
                        value="${escapeHtml(
                          totalWeight > 0
                            ? `${formatNumber(totalWeight)} kg`
                            : ''
                        )}"
                        readonly
                      />
                    </label>

                    ${
                      purchaseItems.length <= 1
                        ? ''
                        : `
                          <button
                            class="small-action-button danger remove-purchase-item"
                            type="button"
                            aria-label="Remover material"
                          >
                            -
                          </button>
                        `
                    }

                  </div>

                  <details
                    class="purchase-lots-details"
                    open
                  >

                    <summary>

                      <span>
                        Lotes / UDs
                      </span>

                      <strong>
                        ${formatNumber(
                          (
                            item.lots ||
                            []
                          ).length
                        )}
                      </strong>

                    </summary>

                    <div class="purchase-lots-target">

                      ${
                        (
                          item.lots ||
                          []
                        )
                          .map(
                            (
                              lot,
                              lotIndex
                            ) => `
                              <div
                                class="purchase-lot-row"
                                data-purchase-lot-index="${lotIndex}"
                              >

                                <label>
                                  Lote / UD

                                  <input
                                    name="purchaseLotNumber"
                                    required
                                    value="${escapeHtml(
                                      lot.lotNumber ||
                                      ''
                                    )}"
                                  />
                                </label>

                                <label>
                                  Peso (kg)

                                  <input
                                    name="purchaseLotWeightKg"
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    required
                                    value="${escapeHtml(
                                      lot.weightKg ||
                                      ''
                                    )}"
                                  />
                                </label>

                                <label>
                                  Corrida

                                  <input
                                    name="purchaseHeatNumber"
                                    required
                                    value="${escapeHtml(
                                      lot.heatNumber ||
                                      ''
                                    )}"
                                  />
                                </label>

                                <label>
                                  Lim. resistência (MPa)

                                  <input
                                    name="purchaseTensileStrengthMpa"
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    required
                                    value="${escapeHtml(
                                      lot.tensileStrengthMpa ||
                                      ''
                                    )}"
                                  />
                                </label>

                                <label>
                                  Grau / Qualidade

                                  <input
                                    name="purchaseSteelGrade"
                                    required
                                    value="${escapeHtml(
                                      lot.steelGrade ||
                                      ''
                                    )}"
                                    placeholder="Ex.: 1008"
                                  />
                                </label>

                                ${
                                  (
                                    item.lots ||
                                    []
                                  ).length <= 1
                                    ? ''
                                    : `
                                      <button
                                        class="small-action-button danger remove-purchase-lot"
                                        type="button"
                                        aria-label="Remover lote"
                                      >
                                        -
                                      </button>
                                    `
                                }

                              </div>
                            `
                          )
                          .join('')
                      }

                    </div>

                    <button
                      class="secondary-button add-purchase-lot"
                      type="button"
                    >
                      + Adicionar lote
                    </button>

                  </details>

                </article>
              `;
            }
          )
          .join('');

      bindTransportCombos(
        itemsTarget,
        (
          name,
          value,
          combo
        ) => {
          if (
            name !==
            'purchaseMaterialId'
          ) {
            return;
          }

          updatePurchaseItemDerived(
            combo?.closest(
              '.purchase-item'
            )
          );

          updatePurchaseWeightCheck();
        }
      );

      updatePurchaseWeightCheck();
    }

    renderPurchaseItems();

    backdrop.addEventListener(
      'click',
      event => {
        if (
          event.target === backdrop
          || event.target.classList.contains(
            'close-modal'
          )
        ) {
          backdrop.remove();
        }
      }
    );

    backdrop
      .querySelector(
        '.add-purchase-item'
      )
      ?.addEventListener(
        'click',
        event => {
          event.preventDefault();

          purchaseItems =
            collectPurchaseItems();

          purchaseItems.push(
            blankItem()
          );

          renderPurchaseItems();
        }
      );

    itemsTarget.addEventListener(
      'click',
      event => {
        const itemRow =
          event.target.closest(
            '.purchase-item'
          );

        if (!itemRow) {
          return;
        }

        const itemIndex =
          Number(
            itemRow
              .dataset
              .purchaseItemIndex ||
            0
          );

        if (
          event.target.closest(
            '.remove-purchase-item'
          )
        ) {
          purchaseItems =
            collectPurchaseItems()
              .filter(
                (
                  _,
                  index
                ) =>
                  index !==
                  itemIndex
              );

          renderPurchaseItems();

          return;
        }

        if (
          event.target.closest(
            '.add-purchase-lot'
          )
        ) {
          purchaseItems =
            collectPurchaseItems();

          purchaseItems[
            itemIndex
          ].lots.push(
            blankLot()
          );

          renderPurchaseItems();

          return;
        }

        const removeLot =
          event.target.closest(
            '.remove-purchase-lot'
          );

        if (removeLot) {
          const lotIndex =
            Number(
              removeLot
                .closest(
                  '.purchase-lot-row'
                )
                ?.dataset
                .purchaseLotIndex ||
              0
            );

          purchaseItems =
            collectPurchaseItems();

          purchaseItems[
            itemIndex
          ].lots =
            purchaseItems[
              itemIndex
            ].lots.filter(
              (
                _,
                index
              ) =>
                index !==
                lotIndex
            );

          renderPurchaseItems();
        }
      }
    );

    itemsTarget.addEventListener(
      'input',
      event => {
        if (
          !event.target.closest(
            '.purchase-lot-row'
          )
        ) {
          return;
        }

        updatePurchaseWeightCheck();
      }
    );

    form.elements
      .invoiceTotalWeightKg
      .addEventListener(
        'input',
        updatePurchaseWeightCheck
      );

    backdrop
      .querySelector(
        '.clear-purchase'
      )
      ?.addEventListener(
        'click',
        () => {
          form.reset();

          form.elements
            .purchaseDate
            .value =
            todayBrazil();

          purchaseItems = [
            blankItem()
          ];

          renderPurchaseItems();
        }
      );

    backdrop
      .querySelector(
        '.delete-purchase'
      )
      ?.addEventListener(
        'click',
        async () => {
          if (
            !confirm(
              'Excluir definitivamente esta compra?'
            )
          ) {
            return;
          }

          await api(
            `/stock/material-purchases/${purchase.id}`,
            {
              method:
                'DELETE'
            }
          );

          backdrop.remove();

          window.dispatchEvent(
            new CustomEvent(
              'planejamento:toast',
              {
                detail:
                  'Compra excluída.'
              }
            )
          );

          await onSaved();
        }
      );

    form.addEventListener(
      'submit',
      async event => {
        event.preventDefault();

        const items =
          collectPurchaseItems();

        const invoiceTotalWeightKg =
          Number(
            form.elements
              .invoiceTotalWeightKg
              .value ||
            0
          );

        if (
          !form.elements
            .purchaseDate
            .value
          || !form.elements
            .supplier
            .value
            .trim()
          || !form.elements
            .invoiceNumber
            .value
            .trim()
          || !form.elements
            .certificateNumber
            .value
            .trim()
          || !(invoiceTotalWeightKg > 0)
        ) {
          toast(
            'Preencha data, fornecedor, nota fiscal, certificado e peso total da nota fiscal.'
          );

          return;
        }

        if (
          !items.length
          || items.some(
            item =>
              !item.materialId
              || !item.locationId
              || !item.lots.length
          )
        ) {
          toast(
            'Preencha material, local de entrada e pelo menos um lote para cada material.'
          );

          return;
        }

        const lotMissing =
          items.some(
            item =>
              item.lots.some(
                lot => (
                  !String(
                    lot.lotNumber ||
                    ''
                  ).trim()

                  || !(
                    Number(
                      lot.weightKg
                    ) > 0
                  )

                  || !String(
                    lot.heatNumber ||
                    ''
                  ).trim()

                  || !(
                    Number(
                      lot.tensileStrengthMpa
                    ) > 0
                  )

                  || !String(
                    lot.steelGrade ||
                    ''
                  ).trim()
                )
              )
          );

        if (
          lotMissing
        ) {
          toast(
            'Preencha lote / UD, peso, corrida, limite de resistência e grau / qualidade em todos os lotes.'
          );

          return;
        }

        if (
          !updatePurchaseWeightCheck()
        ) {
          toast(
            'A soma dos pesos dos lotes precisa ser igual ao peso total da nota fiscal.'
          );

          return;
        }

        const unsupportedMaterial =
          items.find(
            item => {
              const material =
                materialById(
                  item.materialId
                );

              const weight =
                item.lots.reduce(
                  (
                    sum,
                    lot
                  ) =>
                    sum +
                    Number(
                      lot.weightKg ||
                      0
                    ),
                  0
                );

              return !(
                purchaseStockQuantityFromWeight(
                  material,
                  weight
                ) > 0
              );
            }
          );

        if (
          unsupportedMaterial
        ) {
          toast(
            'Não foi possível converter o peso de um dos materiais para sua unidade principal de estoque.'
          );

          return;
        }

        const body = {
          purchaseDate:
            form.elements
              .purchaseDate
              .value,

          supplier:
            form.elements
              .supplier
              .value
              .trim(),

          invoiceNumber:
            form.elements
              .invoiceNumber
              .value
              .trim(),

          certificateNumber:
            form.elements
              .certificateNumber
              .value
              .trim(),

          invoiceTotalWeightKg,

          notes:
            form.elements
              .notes
              .value,

          items:
            items.map(
              item => ({
                materialId:
                  Number(
                    item.materialId
                  ),

                locationId:
                  Number(
                    item.locationId
                  ),

                lots:
                  item.lots.map(
                    lot => ({
                      lotNumber:
                        String(
                          lot.lotNumber ||
                          ''
                        ).trim(),

                      weightKg:
                        Number(
                          lot.weightKg ||
                          0
                        ),

                      heatNumber:
                        String(
                          lot.heatNumber ||
                          ''
                        ).trim(),

                      tensileStrengthMpa:
                        Number(
                          lot.tensileStrengthMpa ||
                          0
                        ),

                      steelGrade:
                        String(
                          lot.steelGrade ||
                          ''
                        ).trim()
                    })
                  )
              })
            )
        };

        const submit =
          form.querySelector(
            'button[type="submit"]'
          );

        submit.disabled =
          true;

        submit.textContent =
          'Salvando compra...';

        try {
          await api(
            purchase
              ? `/stock/material-purchases/${purchase.id}`
              : '/stock/material-purchases',
            {
              method:
                purchase
                  ? 'PUT'
                  : 'POST',

              body
            }
          );

          backdrop.remove();

          window.dispatchEvent(
            new CustomEvent(
              'planejamento:toast',
              {
                detail:
                  purchase
                    ? 'Compra atualizada.'
                    : 'Compra registrada.'
              }
            )
          );

          await onSaved();
        } catch (error) {
          submit.disabled =
            false;

          submit.textContent =
            'Salvar compra';

          toast(error);
        }
      }
    );

    page.appendChild(
      backdrop
    );
  }

    async function renderPurchaseRecords(
    container
  ) {
    await loadLookups();

    let purchaseFilterToReopen = '';

    container.innerHTML = `
      <div class="launches-wide-panel production-launch-panel production-launch-layout transport-launch-layout purchase-launch-layout">

        <div class="panel production-consult-card transport-consult-card">

          <div class="purchase-filters-target"></div>

          <div class="purchase-indicators-target"></div>

        </div>

        <div class="panel production-table-card transport-table-card">

          <div class="section-heading">

            <h2>
              Compras lançadas
            </h2>

            ${
              canWriteProduction
                ? `
                  <button
                    class="primary-button realize-purchase"
                    type="button"
                  >
                    Realizar compra
                  </button>
                `
                : ''
            }

          </div>

          <div class="table-target"></div>

        </div>

      </div>
    `;

    const loadTable =
      async () => {
        const rows =
          await api(
            '/stock/material-purchases'
          );

        const filteredRows =
          filteredPurchaseRecords(
            rows
          );

        const tableTarget =
          container.querySelector(
            '.table-target'
          );

        const filtersTarget =
          container.querySelector(
            '.purchase-filters-target'
          );

        const indicatorsTarget =
          container.querySelector(
            '.purchase-indicators-target'
          );

                const materialFilterItems =
          purchaseFilterOptions(
            rows.filter(
              row =>
                purchaseRowMatchesFilters(
                  row,
                  'material'
                )
            ),
            rows,
            purchaseFilters.materialIds,
            row =>
              (
                row.items || []
              ).map(item => {
                const code =
                  firstCodeFromCodes(
                    item.material_codes
                  );

                const label =
                  [
                    item.material_name || '-',
                    code
                  ]
                    .filter(Boolean)
                    .join(' — ');

                return {
                  value:
                    String(
                      item.material_id
                    ),

                  label,

                  search:
                    [
                      item.material_name,
                      ...(
                        item.material_codes ||
                        []
                      )
                    ].join(' ')
                };
              })
          );

        const supplierFilterItems =
          purchaseFilterOptions(
            rows.filter(
              row =>
                purchaseRowMatchesFilters(
                  row,
                  'supplier'
                )
            ),
            rows,
            purchaseFilters.suppliers,
            row => ({
              value:
                String(
                  row.supplier || ''
                ).trim(),

              label:
                String(
                  row.supplier || ''
                ).trim()
            })
          );

        const invoiceFilterItems =
          purchaseFilterOptions(
            rows.filter(
              row =>
                purchaseRowMatchesFilters(
                  row,
                  'invoice'
                )
            ),
            rows,
            purchaseFilters.invoiceNumbers,
            row => ({
              value:
                String(
                  row.invoice_number || ''
                ).trim(),

              label:
                String(
                  row.invoice_number || ''
                ).trim()
            })
          );

        const certificateFilterItems =
          purchaseFilterOptions(
            rows.filter(
              row =>
                purchaseRowMatchesFilters(
                  row,
                  'certificate'
                )
            ),
            rows,
            purchaseFilters.certificateNumbers,
            row => ({
              value:
                String(
                  row.certificate_number || ''
                ).trim(),

              label:
                String(
                  row.certificate_number || ''
                ).trim()
            })
          );

        filtersTarget.innerHTML = `
          <form class="filters purchase-filters">

            ${renderPurchaseMultiFilter({
              name:
                'material',

              label:
                'Material comprado',

              placeholder:
                'Selecionar materiais',

              selectedValues:
                purchaseFilters.materialIds,

              items:
                materialFilterItems
            })}

            ${renderPurchaseMultiFilter({
              name:
                'supplier',

              label:
                'Fornecedor',

              placeholder:
                'Selecionar fornecedores',

              selectedValues:
                purchaseFilters.suppliers,

              items:
                supplierFilterItems
            })}

            ${renderPurchaseMultiFilter({
              name:
                'invoice',

              label:
                'Nota fiscal',

              placeholder:
                'Selecionar notas fiscais',

              selectedValues:
                purchaseFilters.invoiceNumbers,

              items:
                invoiceFilterItems
            })}

            ${renderPurchaseMultiFilter({
              name:
                'certificate',

              label:
                'Certificado',

              placeholder:
                'Selecionar certificados',

              selectedValues:
                purchaseFilters.certificateNumbers,

              items:
                certificateFilterItems
            })}

            <label>
              Local

              <select name="filterLocationId">
                ${locationOptions(
                  purchaseFilters.locationId,
                  true
                )}
              </select>
            </label>

            <label>
              Data inicial

              <input
                name="filterStartDate"
                type="date"
                value="${escapeHtml(
                  purchaseFilters.startDate
                )}"
              />
            </label>

            <label>
              Data final

              <input
                name="filterEndDate"
                type="date"
                value="${escapeHtml(
                  purchaseFilters.endDate
                )}"
              />
            </label>

            <button
              class="primary-button"
              type="submit"
            >
              Filtrar
            </button>

            <button
              class="secondary-button clear-purchase-filters"
              type="button"
            >
              Limpar filtros
            </button>

          </form>
        `;

        bindPurchaseMultiFilters(
          filtersTarget,
          (
            filterName,
            values
          ) => {
            if (
              filterName === 'material'
            ) {
              purchaseFilters.materialIds =
                values;
            }

            if (
              filterName === 'supplier'
            ) {
              purchaseFilters.suppliers =
                values;
            }

            if (
              filterName === 'invoice'
            ) {
              purchaseFilters.invoiceNumbers =
                values;
            }

            if (
              filterName === 'certificate'
            ) {
              purchaseFilters.certificateNumbers =
                values;
            }

            purchaseFilterToReopen =
              filterName || '';

            loadTable()
              .catch(
                toast
              );
          }
        );

        if (
          purchaseFilterToReopen
        ) {
          const filter =
            filtersTarget.querySelector(
              `[data-purchase-filter-name="${purchaseFilterToReopen}"]`
            );

          const menu =
            filter?.querySelector(
              '.purchase-multi-filter-menu'
            );

          const toggle =
            filter?.querySelector(
              '[data-purchase-filter-toggle]'
            );

          if (
            menu
            && toggle
          ) {
            menu.hidden =
              false;

            toggle.setAttribute(
              'aria-expanded',
              'true'
            );
          }

          purchaseFilterToReopen =
            '';
        }

        tableTarget.innerHTML =
          '';

        const table =
          DataTable({
            columns: [
              {
                label:
                  'Data',

                render:
                  row =>
                    formatDateOnly(
                      row.purchase_date
                    ),

                sortValue:
                  row =>
                    row.purchase_date
              },

              {
                label:
                  'Fornecedor',

                render:
                  row =>
                    escapeHtml(
                      row.supplier ||
                      '-'
                    )
              },

              {
                label:
                  'Materiais comprados',

                render:
                  purchaseMaterialSummary
              },

              {
                label:
                  'Local',

                render:
                  purchaseLocationSummary
              },

              {
                label:
                  'Quantidade',

                render:
                  purchaseQuantitySummary
              },

              {
                label:
                  'Peso total',

                render:
                  row =>
                    `${formatNumber(
                      row.invoice_total_weight_kg
                    )} kg`,

                sortValue:
                  row =>
                    Number(
                      row.invoice_total_weight_kg ||
                      0
                    )
              },

              {
                label:
                  'Nota fiscal',

                render:
                  row =>
                    escapeHtml(
                      row.invoice_number ||
                      '-'
                    )
              },

              {
                label:
                  'Certificado',

                render:
                  row =>
                    escapeHtml(
                      row.certificate_number ||
                      '-'
                    )
              },

              {
                label:
                  'Lotes / UDs',

                render:
                  purchaseLotsSummary
              },

              {
                label:
                  'Observação',

                render:
                  row =>
                    escapeHtml(
                      row.notes ||
                      '-'
                    )
              },

              {
                label:
                  'Editar',

                render:
                  row =>
                    canWriteProduction
                      ? `
                        <button
                          class="link-button"
                          data-edit-purchase="${row.id}"
                        >
                          Editar
                        </button>
                      `
                      : ''
              }
            ],

            rows:
              filteredRows
          });

        table.classList.add(
          'transport-launch-table-wrap',
          'purchase-launch-table-wrap'
        );

        tableTarget.appendChild(
          table
        );

        renderPurchaseIndicators(
          indicatorsTarget,
          filteredRows
        );

                filtersTarget.onsubmit =
          event => {
            event.preventDefault();

            const filterForm =
              event.target.closest(
                'form'
              );

            if (!filterForm) {
              return;
            }

            purchaseFilters = {
              ...purchaseFilters,

              locationId:
                filterForm.elements
                  .filterLocationId
                  .value,

              startDate:
                filterForm.elements
                  .filterStartDate
                  .value,

              endDate:
                filterForm.elements
                  .filterEndDate
                  .value
            };

            loadTable()
              .catch(
                toast
              );
          };

        filtersTarget
          .querySelector(
            '.clear-purchase-filters'
          )
          ?.addEventListener(
            'click',
            () => {
              purchaseFilters = {
                materialIds: [],
                suppliers: [],
                invoiceNumbers: [],
                certificateNumbers: [],
                locationId: '',
                startDate: '',
                endDate: ''
              };

              purchaseFilterToReopen =
                '';

              loadTable()
                .catch(
                  toast
                );
            }
          );

        tableTarget.onclick =
  event => {

    /*
     * VISUALIZAR LOTES
     */
    const lotsButton =
      event.target.closest(
        '[data-view-purchase-lots]'
      );

    if (lotsButton) {
      const purchase =
        rows.find(
          row =>
            String(
              row.id
            )
            ===
            String(
              lotsButton
                .dataset
                .viewPurchaseLots
            )
        );

      if (purchase) {
        openPurchaseLotsModal(
          purchase
        );
      }

      return;
    }


    /*
     * EDITAR COMPRA
     */
    if (
      !canWriteProduction
    ) {
      return;
    }


    const button =
      event.target.closest(
        '[data-edit-purchase]'
      );


    if (!button) {
      return;
    }


    const purchase =
      rows.find(
        row =>
          String(
            row.id
          )
          ===
          String(
            button
              .dataset
              .editPurchase
          )
      );


    if (purchase) {
      openPurchaseModal(
        purchase,
        loadTable
      ).catch(
        toast
      );
    }
  };
      };

    container
      .querySelector(
        '.realize-purchase'
      )
      ?.addEventListener(
        'click',
        () =>
          openPurchaseModal(
            null,
            loadTable
          ).catch(
            toast
          )
      );

    await loadTable();
  }

  function materialSearchLabel(material) {
    if (!material) return '';
    const code = firstCode(material);
    return code ? `${material.name} — ${code}` : material.name;
  }

  function normalizeMaterialSearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function materialMatchesSearch(material, searchValue) {
    const normalized = normalizeMaterialSearch(searchValue);
    if (!normalized) return true;
    return [material.name, ...(material.codes || [])]
      .some(value => normalizeMaterialSearch(value).includes(normalized));
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
      const form = event.target.closest('form');
      if (!form) return;
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
            <label>Material produzido
              <div class="material-autocomplete production-material-autocomplete">
                <input name="materialSearch" type="search" autocomplete="off" placeholder="Digite nome ou código" required />
                <div class="material-suggestions" hidden></div>
              </div>
              <input name="materialId" type="hidden" />
            </label>
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
    const materialSuggestions = backdrop.querySelector('.production-material-autocomplete .material-suggestions');
    let lines = row ? producedLots(row) : [{ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', lot: '', benefitNumber: '' }];
    let consumedInputs = Array.isArray(row?.consumed_inputs) ? row.consumed_inputs.map(input => ({ ...input })) : [];

    function selectedProducedMaterial() {
      return materials.find(material => String(material.id) === String(form.elements.materialId.value));
    }

    function renderMaterialSuggestions() {
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
        if (fields[1]) fields[1].innerHTML = `<span>Unidade secundária</span>${chips([`${formatNumber(secondaryQty)} ${material?.secondary_unit || ''}`.trim()])}`;
      });
    }

    function resetProduction() {
      form.reset();
      form.elements.productionDate.value = todayBrazil();
      form.elements.materialId.value = '';
      form.elements.materialSearch.value = '';
      lines = [{ quantity: '', secondaryQty: 0, primaryUnit: '', secondaryUnit: '', lot: '', benefitNumber: '' }];
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
    if (row?.machine_name && !form.elements.machineName.disabled) form.elements.machineName.value = row.machine_name;
    renderLines();

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
    setInternalLoading(target, 'Carregando Lançamentos...');
    try {
      const sections = [
        (canReadLog || canImportCsv) ? { id: 'csv', label: 'Importação CSV', render: renderImportHistory } : null,
        canReadInventory ? { id: 'inventory', label: 'Inventário', render: renderInventory } : null,
        { id: 'transports', label: 'Transportes', render: renderTransportRecords },
        { id: 'purchase', label: 'Compra', render: renderPurchaseRecords }
      ].filter(Boolean);

      if (!sections.length) {
        target.innerHTML = '<div class="empty-state">Nenhuma area de lançamentos disponivel para este perfil.</div>';
        return;
      }

      if (!sections.some(section => section.id === activeLaunchTab)) activeLaunchTab = sections[0].id;
      sessionStorage.setItem('planejamento_launches_tab', activeLaunchTab);

      const section = sections.find(item => item.id === activeLaunchTab);
      pageTitle.textContent = `Lançamentos / ${section.label}`;
      const wrapperClass = section.id === 'transports'
        ? 'launches-wide-panel transport-section-shell'
        : `panel launches-wide-panel${section.id === 'inventory' ? ' inventory-history-panel' : ''}`;
      target.innerHTML = `<div class="${wrapperClass}" data-launch-section="${section.id}"></div>`;
      await section.render(target.querySelector(`[data-launch-section="${section.id}"]`));
    } catch (error) {
      setInternalError(target, error.message || 'Nao foi possivel carregar lançamentos.');
      throw error;
    }
  }

  render().catch(toast);
  return page;
}

