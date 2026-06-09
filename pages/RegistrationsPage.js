import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';
import { CodeChipsInput } from '../shared/CodeChipsInput.js';

const registrationTabs = [
  { id: 'locations', label: 'Locais' },
  { id: 'machines', label: 'Máquinas' },
  { id: 'materials', label: 'Materiais' }
];

export function RegistrationsPage() {
  const page = document.createElement('section');
  page.className = 'stack registrations-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Cadastros</h1>
        <p>Organize locais, máquinas e materiais usados no planejamento.</p>
      </div>
    </div>
    <div class="internal-tabs-target"></div>
    <div class="registrations-target"></div>
  `;

  const tabsTarget = page.querySelector('.internal-tabs-target');
  const target = page.querySelector('.registrations-target');
  let activeTab = sessionStorage.getItem('planejamento_registration_tab') || 'locations';
  let locations = [];
  let machines = [];
  let materials = [];

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function renderTabs() {
    tabsTarget.innerHTML = '';
    tabsTarget.appendChild(InternalTabs(registrationTabs, activeTab, tab => {
      activeTab = tab;
      sessionStorage.setItem('planejamento_registration_tab', activeTab);
      render().catch(toast);
    }));
  }

  async function refreshLookups() {
    [locations, materials] = await Promise.all([
      api('/locations'),
      api('/materials')
    ]);
  }

  async function render() {
    renderTabs();
    if (activeTab === 'locations') return renderLocations();
    if (activeTab === 'machines') return renderMachines();
    return renderMaterials();
  }

  async function renderLocations() {
    target.innerHTML = sectionShell('Locais', 'Cadastrar local', 'Buscar por código ou local');
    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');
    let rows = [];

    async function load() {
      rows = await api(`/locations?search=${encodeURIComponent(search.value)}`);
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns: [
          { label: 'Código', key: 'code' },
          { label: 'Nome do local', key: 'name' },
          { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
          { label: 'Ações', render: row => `<button class="link-button" data-edit="${row.id}">Editar</button>` }
        ],
        rows
      }));
    }

    function openModal(row = null) {
      const modal = createModal(row ? 'Editar local' : 'Cadastrar local', `
        <form class="grid-form registration-form">
          <label>Código do local<input name="code" required /></label>
          <label>Nome do local<input name="name" required /></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
          </div>
        </form>
      `);
      const form = modal.querySelector('form');
      form.elements.code.value = row?.code || '';
      form.elements.name.value = row?.name || '';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const body = { code: form.elements.code.value, name: form.elements.name.value, active: true };
        await api(row ? `/locations/${row.id}` : '/locations', { method: row ? 'PUT' : 'POST', body });
        closeModal(modal);
        await load();
      });
      form.elements.code.focus();
    }

    bindListEvents(target, () => rows, openModal);
    search.addEventListener('input', () => load().catch(toast));
    await load();
  }

  async function renderMachines() {
    await refreshLookups();
    target.innerHTML = sectionShell('Máquinas', 'Cadastrar máquina', 'Buscar por máquina ou local');
    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');
    let rows = [];

    async function load() {
      rows = await api(`/machines?search=${encodeURIComponent(search.value)}`);
      machines = rows;
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns: [
          { label: 'Nome da máquina', key: 'name' },
          { label: 'Local', key: 'location_name' },
          { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
          { label: 'Ações', render: row => `<button class="link-button" data-edit="${row.id}">Editar</button>` }
        ],
        rows
      }));
    }

    function locationOptions(selectedId = '') {
      return locations.map(location => `<option value="${location.id}" ${String(location.id) === String(selectedId) ? 'selected' : ''}>${location.name}</option>`).join('');
    }

    function openModal(row = null) {
      const modal = createModal(row ? 'Editar máquina' : 'Cadastrar máquina', `
        <form class="grid-form registration-form">
          <label>Nome da máquina<input name="name" required /></label>
          <label>Local<select name="locationId" required><option value="">Selecione</option>${locationOptions(row?.location_id)}</select></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
          </div>
        </form>
      `);
      const form = modal.querySelector('form');
      form.elements.name.value = row?.name || '';
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const body = {
          name: form.elements.name.value,
          locationId: Number(form.elements.locationId.value),
          active: true
        };
        await api(row ? `/machines/${row.id}` : '/machines', { method: row ? 'PUT' : 'POST', body });
        closeModal(modal);
        await load();
      });
      form.elements.name.focus();
    }

    bindListEvents(target, () => rows, openModal);
    search.addEventListener('input', () => load().catch(toast));
    await load();
  }

  async function renderMaterials() {
    await refreshLookups();
    target.innerHTML = sectionShell('Materiais', 'Cadastrar material', 'Buscar por material ou código');
    const search = target.querySelector('.search');
    const tableTarget = target.querySelector('.table-target');
    let rows = [];

    async function load() {
      rows = await api(`/materials?search=${encodeURIComponent(search.value)}`);
      materials = rows;
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({
        columns: [
          { label: 'Nome', key: 'name' },
          { label: 'Códigos', render: row => formatCodes(row.codes) },
          { label: 'Unidade principal', key: 'primary_unit' },
          { label: 'Unidade secundária', key: 'secondary_unit' },
          { label: 'Fator', key: 'primary_to_secondary_factor' },
          { label: 'Matéria-prima inicial', render: row => row.is_initial_raw_material ? 'Sim' : 'Não' },
          { label: 'Modelos de produção', render: row => formatProductionModels(row.production_models || row.input_materials) },
          { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
          { label: 'Ações', render: row => `<button class="link-button" data-edit="${row.id}">Editar</button>` }
        ],
        rows
      }));
    }

    function openModal(row = null) {
      const selectedModels = normalizeProductionModels(row);
      const codeInput = CodeChipsInput({ initialCodes: row?.codes || [] });
      const modal = createModal(row ? 'Editar material' : 'Cadastrar material', `
        <form class="grid-form registration-form material-form">
          <label>Nome do material<input name="name" required /></label>
          <label>Unidade principal<select name="primaryUnit" required><option value="un">un</option><option value="kg">kg</option></select></label>
          <label>Unidade secundária<select name="secondaryUnit" required><option value="un">un</option><option value="kg">kg</option></select></label>
          <label>Fator fixo<input name="primaryToSecondaryFactor" type="number" step="0.001" min="0.001" required /></label>
          <label class="checkbox-line wide-field"><input name="isInitialRawMaterial" type="checkbox" /> Matéria-prima inicial</label>
          <label class="wide-field">Códigos atrelados<div class="codes-target"></div></label>
          <div class="wide-field consumed-selector-block">
            <div class="section-heading compact-heading">
              <h3>Modelos de Produção</h3>
              <button class="secondary-button new-production-model" type="button">Novo modelo</button>
            </div>
            <div class="production-models-target"></div>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
          </div>
        </form>
      `);
      const form = modal.querySelector('form');
      modal.querySelector('.codes-target').appendChild(codeInput.element);
      renderProductionModels(modal, selectedModels, row?.id || null);
      form.elements.name.value = row?.name || '';
      form.elements.primaryUnit.value = row?.primary_unit || 'un';
      form.elements.secondaryUnit.value = row?.secondary_unit || 'kg';
      form.elements.primaryToSecondaryFactor.value = row?.primary_to_secondary_factor || '';
      form.elements.isInitialRawMaterial.checked = row?.is_initial_raw_material === true;
      updateConsumedVisibility(modal);
      form.elements.isInitialRawMaterial.addEventListener('change', () => updateConsumedVisibility(modal));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const body = {
          name: form.elements.name.value,
          codes: codeInput.getCodes(),
          primaryUnit: form.elements.primaryUnit.value,
          secondaryUnit: form.elements.secondaryUnit.value,
          primaryToSecondaryFactor: Number(form.elements.primaryToSecondaryFactor.value),
          isInitialRawMaterial: form.elements.isInitialRawMaterial.checked,
          productionModels: form.elements.isInitialRawMaterial.checked ? [] : getProductionModels(modal),
          active: true
        };
        await api(row ? `/materials/${row.id}` : '/materials', { method: row ? 'PUT' : 'POST', body });
        closeModal(modal);
        await load();
      });
      form.elements.name.focus();
    }

    bindListEvents(target, () => rows, openModal);
    search.addEventListener('input', () => load().catch(toast));
    await load();
  }

  function sectionShell(title, buttonLabel, searchPlaceholder) {
    return `
      <div class="panel">
        <div class="section-heading">
          <h2>${title}</h2>
          <button class="primary-button add-registration" type="button">${buttonLabel}</button>
        </div>
        <div class="toolbar list-actions registration-actions">
          <input class="search" placeholder="${searchPlaceholder}" />
        </div>
        <div class="table-target"></div>
      </div>
    `;
  }

  function bindListEvents(container, getRows, openModal) {
    container.querySelector('.add-registration').addEventListener('click', () => openModal());
    container.querySelector('.table-target').addEventListener('click', event => {
      const id = event.target.dataset.edit;
      if (!id) return;
      const row = getRows().find(item => String(item.id) === String(id));
      if (row) openModal(row);
    });
  }

  function createModal(title, body) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="registration-modal-title">
        <div class="modal-header">
          <h2 id="registration-modal-title">${title}</h2>
          <button class="link-button close-modal" type="button" aria-label="Fechar">Fechar</button>
        </div>
        ${body}
      </div>
    `;
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) closeModal(backdrop);
    });
    page.appendChild(backdrop);
    return backdrop;
  }

  function closeModal(modal) {
    modal.remove();
  }

  function formatCodes(codes = []) {
    return Array.isArray(codes) ? codes.join(', ') : '';
  }

  function normalizeProductionModels(row = null) {
    const sourceModels = Array.isArray(row?.production_models) && row.production_models.length
      ? row.production_models
      : [{ name: 'Modelo padrão', inputMaterials: row?.input_materials || [] }];
    return sourceModels.map((model, index) => ({
      name: model.name || model.modelName || `Modelo ${index + 1}`,
      inputs: new Map((model.inputMaterials || model.inputs || []).map(input => [
        String(input.inputMaterialId || input.id),
        input.qtyPerOutput || 1
      ]))
    }));
  }

  function formatProductionModels(models = []) {
    const normalized = Array.isArray(models) && models[0]?.inputMaterials
      ? models
      : [{ name: 'Modelo padrão', inputMaterials: models }];
    return normalized
      .filter(model => (model.inputMaterials || []).length)
      .map(model => `${model.name || model.modelName || 'Modelo padrão'}: ${(model.inputMaterials || []).map(input => `${input.name} (${input.qtyPerOutput || 1})`).join(', ')}`)
      .join(' | ');
  }

  function renderProductionModels(modal, selectedModels, excludeId) {
    const target = modal.querySelector('.production-models-target');
    const available = materials.filter(material => String(material.id) !== String(excludeId || ''));
    const render = () => {
      target.innerHTML = selectedModels.map((model, modelIndex) => `
        <article class="production-model-card" data-model-index="${modelIndex}">
          <div class="production-model-card-header">
            <label>Nome do modelo<input class="production-model-name" value="${model.name}" required /></label>
            ${selectedModels.length > 1 ? `<button class="link-button danger remove-production-model" type="button">Remover</button>` : ''}
          </div>
          <div class="material-selector-list">
            ${available.length
              ? available.map(material => `
                  <label class="checkbox-line material-option">
                    <input class="model-material-check" type="checkbox" value="${material.id}" ${model.inputs.has(String(material.id)) ? 'checked' : ''} />
                    ${material.name}
                  </label>
                `).join('')
              : '<div class="empty-state compact">Nenhum material cadastrado.</div>'}
          </div>
          <h3>Materiais consumidos</h3>
          <div class="consumed-materials-target">
            ${consumedRowsHtml(model)}
          </div>
        </article>
      `).join('');
    };

    target.addEventListener('input', event => {
      const card = event.target.closest('[data-model-index]');
      if (!card) return;
      const model = selectedModels[Number(card.dataset.modelIndex)];
      if (event.target.classList.contains('production-model-name')) model.name = event.target.value;
      if (event.target.classList.contains('usage-qty')) model.inputs.set(String(event.target.dataset.materialId), Number(event.target.value || 1));
    });
    target.addEventListener('change', event => {
      if (!event.target.classList.contains('model-material-check')) return;
      const card = event.target.closest('[data-model-index]');
      const model = selectedModels[Number(card.dataset.modelIndex)];
      if (event.target.checked) model.inputs.set(String(event.target.value), 1);
      else model.inputs.delete(String(event.target.value));
      render();
    });
    target.addEventListener('click', event => {
      if (!event.target.classList.contains('remove-production-model')) return;
      const card = event.target.closest('[data-model-index]');
      selectedModels.splice(Number(card.dataset.modelIndex), 1);
      render();
    });
    modal.querySelector('.new-production-model').addEventListener('click', () => {
      selectedModels.push({ name: `Modelo ${selectedModels.length + 1}`, inputs: new Map() });
      render();
    });
    render();
  }

  function consumedRowsHtml(model) {
    const selectedRows = [...model.inputs.entries()]
      .map(([id, qty]) => ({ material: materials.find(item => String(item.id) === id), qty }))
      .filter(row => row.material);
    return selectedRows.length
      ? `
        <div class="consumed-material-header">
          <strong>Material consumido</strong>
          <strong>Quantidade utilizada</strong>
        </div>
        ${selectedRows.map(row => `
          <div class="consumed-material-row" data-material-id="${row.material.id}">
            <span>${row.material.name}</span>
            <input class="usage-qty" data-material-id="${row.material.id}" type="number" step="0.001" min="0.001" value="${row.qty || 1}" />
          </div>
        `).join('')}
      `
      : '<div class="empty-state compact">Nenhum material consumido selecionado.</div>';
  }

  function getProductionModels(modal) {
    return [...modal.querySelectorAll('.production-model-card')].map(card => ({
      name: card.querySelector('.production-model-name').value || 'Modelo padrão',
      inputMaterials: [...card.querySelectorAll('.consumed-material-row')].map(row => ({
        inputMaterialId: Number(row.dataset.materialId),
        qtyPerOutput: Number(row.querySelector('.usage-qty').value || 1)
      }))
    })).filter(model => model.inputMaterials.length);
  }

  function updateConsumedVisibility(modal) {
    const disabled = modal.querySelector('[name="isInitialRawMaterial"]').checked;
    const block = modal.querySelector('.consumed-selector-block');
    block.classList.toggle('muted-block', disabled);
    block.querySelectorAll('input').forEach(input => {
      input.disabled = disabled;
    });
  }

  render().catch(toast);
  return page;
}
