import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';
import { UploadCsvButton } from '../shared/UploadCsvButton.js';

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

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function formatDateOnly(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '';
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${escapeHtml(value)}</span>`).join('')
    : `<span class="muted-text">${escapeHtml(emptyText)}</span>`;
}

function materialCodes(material) {
  return Array.isArray(material?.codes) ? material.codes : [];
}

function firstCode(material) {
  return materialCodes(material)[0] || '';
}

function producedLots(row) {
  if (Array.isArray(row.produced_lots) && row.produced_lots.length) return row.produced_lots;
  return [{
    quantity: Number(row.quantity || 0),
    primaryUnit: row.primary_unit,
    secondaryUnit: row.secondary_unit,
    lot: ''
  }];
}

export function ImportHistoryPage() {
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
  let activeTab = sessionStorage.getItem('planejamento_launch_tab') || 'nasajon';
  let materials = [];
  let machines = [];

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function renderTabs() {
    tabsTarget.innerHTML = '';
    tabsTarget.appendChild(InternalTabs(tabs, activeTab, tab => {
      activeTab = tab;
      sessionStorage.setItem('planejamento_launch_tab', activeTab);
      render().catch(toast);
    }));
  }

  async function loadLookups() {
    [materials, machines] = await Promise.all([api('/materials'), api('/machines')]);
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
    target.querySelector('.csv-target').appendChild(UploadCsvButton({ onImported: () => renderNasajon().catch(toast) }));
    const rows = await api('/imports');
    target.querySelector('.table-target').appendChild(DataTable({
      columns: [
        { label: 'Data', render: row => row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : '', sortValue: row => row.created_at },
        { label: 'Hora', render: row => row.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR') : '', sortValue: row => row.created_at },
        { label: 'Arquivo', key: 'filename' },
        { label: 'Registros', key: 'total_rows' },
        { label: 'Usuário', render: row => row.user_id || '-' },
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
          <button class="primary-button start-inventory" type="button">Realizar inventário</button>
        </div>
        <div class="table-target"></div>
      </div>
    `;
    target.querySelector('.start-inventory').addEventListener('click', () => openInventoryModal().catch(toast));
    const rows = await api('/stock/inventory/counts');
    target.querySelector('.table-target').appendChild(DataTable({
      columns: [
        { label: 'Data/hora', render: row => formatDate(row.created_at), sortValue: row => row.created_at },
        { label: 'Observação', key: 'notes' },
        { label: 'Usuário', render: row => row.user_id || '-' },
        { label: 'Itens', key: 'item_count' }
      ],
      rows
    }));
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
          <label class="wide-field">Observação<input name="notes" /></label>
          <div class="inventory-picker">
            <label>Buscar material<input name="inventorySearch" type="search" placeholder="Digite nome ou código" autocomplete="off" /></label>
            <button class="primary-button add-inventory-material" type="button">Adicionar</button>
          </div>
          <div class="inventory-search-results"></div>
          <div class="inventory-card-list"></div>
          <div class="form-actions inventory-modal-actions">
            <button class="secondary-button close-modal" type="button">Cancelar</button>
            <button class="primary-button save-inventory" type="button">Salvar inventário</button>
          </div>
        ` : `
          <div class="empty-state">Cadastre materiais e locais antes de realizar o inventário.</div>
          <div class="form-actions">
            <button class="secondary-button close-modal" type="button">Fechar</button>
          </div>
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
              return `
                <label>
                  <span>${escapeHtml(location.name)}</span>
                  <small>Saldo atual: ${formatNumber(current)}</small>
                  <input type="number" step="0.001" placeholder="Saldo atualizado" data-material-id="${row.material.id}" data-location-id="${location.id}" data-current="${current}" />
                </label>
              `;
            }).join('')}
          </div>
        </article>
      `).join('') : '<div class="empty-state">Busque e adicione materiais para este inventário.</div>';
    }

    function addSelectedMaterial() {
      const query = String(backdrop.querySelector('[name="inventorySearch"]').value || '').trim().toLowerCase();
      const row = template.rows.find(item => String(item.material.id) === String(inventoryCandidateId))
        || template.rows.find(item => matches(item, query) && !selected.has(String(item.material.id)));
      if (!row) return;
      selected.set(String(row.material.id), row);
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
    backdrop.querySelector('[name="inventorySearch"]')?.addEventListener('input', renderSearchResults);
    backdrop.querySelector('.add-inventory-material')?.addEventListener('click', addSelectedMaterial);
    backdrop.querySelector('.save-inventory')?.addEventListener('click', async () => {
      const inputs = [...backdrop.querySelectorAll('.inventory-card-list input[data-material-id]')];
      if (!inputs.length) {
        toast('Adicione pelo menos um material ao inventário.');
        return;
      }
      const items = inputs.map(input => ({
        materialId: Number(input.dataset.materialId),
        locationId: Number(input.dataset.locationId),
        previousQty: Number(input.dataset.current || 0),
        countedQty: input.value === '' ? input.dataset.current : input.value
      }));
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

  function materialOptions(selectedId = '') {
    return materials
      .filter(material => material.active !== false)
      .map(material => `<option value="${material.id}" ${String(material.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(material.name)}</option>`)
      .join('');
  }

  function machineOptions(selectedName = '') {
    return machines
      .filter(machine => machine.active !== false)
      .map(machine => `<option value="${escapeHtml(machine.name)}" ${String(machine.name) === String(selectedName) ? 'selected' : ''}>${escapeHtml(machine.name)}</option>`)
      .join('');
  }

  function consumedMaterialsFor(materialId) {
    const produced = materials.find(material => String(material.id) === String(materialId));
    const items = new Map();
    (produced?.production_models || []).forEach(model => {
      (model.inputMaterials || []).forEach(input => {
        const material = materials.find(item => String(item.id) === String(input.inputMaterialId || input.id));
        if (material) items.set(String(material.id), material);
      });
    });
    return [...items.values()];
  }

  async function renderProductionLaunch() {
    await loadLookups();
    target.innerHTML = `
      <div class="panel launches-wide-panel production-launch-panel">
        <div class="section-heading">
          <h2>Produções lançadas</h2>
          <button class="primary-button realize-production" type="button">Realizar produção</button>
        </div>
        <div class="table-target"></div>
      </div>
    `;
    target.querySelector('.realize-production').addEventListener('click', () => openProductionModal().catch(toast));
    await loadProductionTable();
  }

  async function loadProductionTable() {
    const rows = await api('/actuals/launches');
    const tableTarget = target.querySelector('.table-target');
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({
      columns: [
        { label: 'Data', render: row => formatDateOnly(row.production_date), sortValue: row => row.production_date },
        { label: 'Material produzido', key: 'material_name' },
        { label: 'Material consumido', render: row => row.input_material_name || '-' },
        { label: 'Lote consumido', render: row => row.consumed_lot || '-' },
        { label: 'Máquina', render: row => row.machine_name || '-' },
        { label: 'Pessoas', render: row => row.people_count || '-' },
        { label: 'Quantidade', render: row => formatNumber(row.quantity) },
        { label: 'Unidade principal', key: 'primary_unit' },
        { label: 'Unidade secundária', key: 'secondary_unit' },
        { label: 'Lotes gerados', render: row => producedLots(row).map(lot => lot.lot).filter(Boolean).join(', ') || '-' },
        { label: 'Observação', render: row => row.notes || '-' },
        { label: 'Número de beneficiamento', render: row => row.benefit_number || '-' },
        { label: 'Status', render: row => row.status === 'canceled' ? 'Cancelada' : 'Lançada' },
        { label: 'Editar', render: row => `<button class="link-button" data-edit-production="${row.id}">Editar</button>` }
      ],
      rows,
      rowClass: row => row.status === 'canceled' ? 'production-canceled-row' : ''
    }));
    tableTarget.onclick = event => {
      const button = event.target.closest('[data-edit-production]');
      if (!button) return;
      const row = rows.find(item => String(item.id) === String(button.dataset.editProduction));
      if (row) openProductionModal(row).catch(toast);
    };
  }

  async function openProductionModal(row = null) {
    await loadLookups();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal production-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>${row ? 'Editar produção' : 'Realizar produção'}</h2>
          <div class="modal-header-actions">
            <button class="secondary-button clear-production" type="button">Limpar produção</button>
            <button class="link-button close-modal" type="button">Fechar</button>
          </div>
        </div>
        <form class="production-realization-form">
          <div class="grid-form">
            <label>Data<input name="productionDate" type="date" required /></label>
            <label>Material produzido<select name="materialId" required>${materialOptions(row?.material_id)}</select></label>
            <label>Material consumido<select name="inputMaterialId" required></select></label>
            <label>Lote consumido<input name="consumedLot" /></label>
            <label>Máquina<select name="machineName" required><option value="">Selecione</option>${machineOptions(row?.machine_name)}</select></label>
            <label>Quantidade de pessoas<input name="peopleCount" type="number" min="1" /></label>
            <label>Número de Beneficiamento<input name="benefitNumber" /></label>
            <label class="wide-field">Observação<input name="notes" /></label>
          </div>
          <section class="production-lines-section">
            <div class="section-heading compact-heading">
              <h3>Lotes produzidos</h3>
              <button class="secondary-button add-produced-line" type="button">Adicionar produção</button>
            </div>
            <div class="produced-lines-target"></div>
          </section>
          <div class="form-actions production-modal-actions">
            ${row ? '<button class="danger-button cancel-production" type="button">Cancelar produção</button>' : ''}
            <button class="secondary-button close-modal" type="button">Cancelar</button>
            <button class="primary-button" type="submit">Salvar produção</button>
          </div>
        </form>
      </div>
    `;
    const form = backdrop.querySelector('form');
    const linesTarget = backdrop.querySelector('.produced-lines-target');
    let lines = producedLots(row || { quantity: 0, primary_unit: '', secondary_unit: '', produced_lots: [] });
    if (!row) lines = [{ quantity: '', primaryUnit: '', secondaryUnit: '', lot: '' }];

    function selectedProducedMaterial() {
      return materials.find(material => String(material.id) === String(form.elements.materialId.value));
    }

    function updateConsumedOptions() {
      const consumed = consumedMaterialsFor(form.elements.materialId.value);
      form.elements.inputMaterialId.innerHTML = consumed.length
        ? consumed.map(material => `<option value="${material.id}">${escapeHtml(material.name)}</option>`).join('')
        : '<option value="">Sem material consumido cadastrado</option>';
      form.elements.inputMaterialId.value = row?.input_material_id && consumed.some(material => String(material.id) === String(row.input_material_id))
        ? String(row.input_material_id)
        : consumed[0]?.id || '';
      form.elements.inputMaterialId.disabled = consumed.length <= 1;
    }

    function updateMachineLock() {
      const validMachines = machines.filter(machine => machine.active !== false);
      if (validMachines.length === 1) {
        form.elements.machineName.value = validMachines[0].name;
        form.elements.machineName.disabled = true;
      } else {
        form.elements.machineName.disabled = false;
      }
    }

    function renderLines() {
      const material = selectedProducedMaterial();
      linesTarget.innerHTML = lines.map((line, index) => `
        <div class="produced-line" data-line-index="${index}">
          <label>Quantidade<input name="lineQuantity" type="number" step="0.001" min="0.001" required value="${escapeHtml(line.quantity)}" /></label>
          <div class="readonly-field"><span>Unidade principal</span>${chips([line.primaryUnit || material?.primary_unit])}</div>
          <div class="readonly-field"><span>Unidade secundária</span>${chips([line.secondaryUnit || material?.secondary_unit])}</div>
          <label>Lote gerado<input name="lineLot" value="${escapeHtml(line.lot)}" /></label>
          <button class="small-action-button danger remove-produced-line" type="button" ${lines.length === 1 ? 'disabled' : ''}>-</button>
        </div>
      `).join('');
    }

    function collectLines() {
      return [...linesTarget.querySelectorAll('.produced-line')].map(line => {
        const material = selectedProducedMaterial();
        return {
          quantity: Number(line.querySelector('[name="lineQuantity"]').value || 0),
          primaryUnit: material?.primary_unit || '',
          secondaryUnit: material?.secondary_unit || '',
          lot: line.querySelector('[name="lineLot"]').value
        };
      });
    }

    function resetProduction() {
      form.reset();
      form.elements.productionDate.value = new Date().toISOString().slice(0, 10);
      lines = [{ quantity: '', primaryUnit: '', secondaryUnit: '', lot: '' }];
      updateConsumedOptions();
      updateMachineLock();
      renderLines();
    }

    form.elements.productionDate.value = row?.production_date ? String(row.production_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    form.elements.materialId.value = row?.material_id || materials.find(material => material.active !== false)?.id || '';
    form.elements.consumedLot.value = row?.consumed_lot || '';
    form.elements.peopleCount.value = row?.people_count || '';
    form.elements.benefitNumber.value = row?.benefit_number || '';
    form.elements.notes.value = row?.notes || '';
    updateConsumedOptions();
    updateMachineLock();
    if (row?.machine_name && !form.elements.machineName.disabled) form.elements.machineName.value = row.machine_name;
    renderLines();

    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    form.elements.materialId.addEventListener('change', () => {
      updateConsumedOptions();
      lines = collectLines();
      renderLines();
    });
    backdrop.querySelector('.add-produced-line').addEventListener('click', () => {
      lines = collectLines();
      lines.push({ quantity: '', primaryUnit: '', secondaryUnit: '', lot: '' });
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
      if (!producedLines.some(line => line.quantity > 0)) {
        toast('Informe pelo menos uma quantidade produzida.');
        return;
      }
      const body = {
        productionDate: form.elements.productionDate.value,
        materialId: Number(form.elements.materialId.value),
        inputMaterialId: Number(form.elements.inputMaterialId.value || 0) || null,
        consumedLot: form.elements.consumedLot.value,
        machineName: form.elements.machineName.value,
        peopleCount: Number(form.elements.peopleCount.value || 0) || null,
        benefitNumber: form.elements.benefitNumber.value,
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
    if (activeTab === 'nasajon') return renderNasajon();
    if (activeTab === 'inventory') return renderInventory();
    return renderProductionLaunch();
  }

  render().catch(toast);
  return page;
}
