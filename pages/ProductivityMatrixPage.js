import { api, getCurrentUser } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${value}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
}

export function ProductivityMatrixPage() {
  const canWriteMatrix = canAccess(getCurrentUser(), 'matrix:write');
  const page = document.createElement('section');
  page.className = 'stack productivity-matrix-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Matriz de Produtividade</h1>
        <p>Cadastre a relação entre material, máquina, pessoas e tempo de produção.</p>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar list-actions">
        <input class="search" placeholder="Buscar por material, máquina ou código" />
        ${canWriteMatrix ? '<button class="primary-button add-productivity" type="button">Cadastrar produtividade</button>' : ''}
      </div>
      <div class="table-target"></div>
    </div>
    <div class="modal-backdrop" hidden>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="productivity-modal-title">
        <div class="modal-header">
          <h2 id="productivity-modal-title">Cadastrar produtividade</h2>
          <button class="link-button close-modal" type="button" aria-label="Fechar">Fechar</button>
        </div>
        <form class="grid-form productivity-form">
          <input type="hidden" name="id" />
          <label>Material<select name="materialId" required></select></label>
          <div class="readonly-field wide-field">
            <span>Códigos atrelados</span>
            <div class="material-codes readonly-chip-list"></div>
          </div>
          <label>Máquina<select name="machineName" required></select></label>
          <label>Pessoas utilizadas<input name="peopleCount" type="number" min="1" required /></label>
          <label>Quantidade que produz<input name="outputQty" type="number" step="0.001" required /></label>
          <div class="readonly-field">
            <span>Unidade que produz</span>
            <div class="output-unit readonly-chip-list"></div>
          </div>
          <label>Segundos<input name="timeSeconds" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" required /></label>
          <div class="form-actions">
            <button class="primary-button" type="submit">Salvar</button>
            <button class="secondary-button close-modal" type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = page.querySelector('form');
  const tableTarget = page.querySelector('.table-target');
  const search = page.querySelector('.search');
  const modalBackdrop = page.querySelector('.modal-backdrop');
  const modalTitle = page.querySelector('#productivity-modal-title');
  const addButton = page.querySelector('.add-productivity');
  let rows = [];
  let materials = [];
  let machines = [];

  const columns = [
    { label: 'Material', key: 'material_name' },
    { label: 'Códigos atrelados', render: row => formatCodes(row) },
    { label: 'Máquina', key: 'machine_name' },
    { label: 'Pessoas', key: 'people_count' },
    { label: 'Produz', render: row => `${row.output_qty} ${row.output_unit}` },
    { label: 'Segundos', render: row => formatSeconds(row) },
    { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
    { label: 'Ações', render: row => canWriteMatrix ? `<button class="link-button" data-edit="${row.id}">Editar</button>` : '' }
  ];

  function parseCodes(value) {
    return String(value || '')
      .split(',')
      .map(code => code.trim())
      .filter(Boolean);
  }

  function formatCodes(row) {
    const codes = Array.isArray(row.material_codes) && row.material_codes.length
      ? row.material_codes
      : parseCodes(row.material_code);
    return codes.join(', ');
  }

  function parsePtBrDecimal(value) {
    const rawValue = String(value || '').trim();
    const normalizedValue = rawValue.includes(',')
      ? rawValue.replace(/\./g, '').replace(',', '.')
      : rawValue;
    const number = Number(normalizedValue);
    return Number.isFinite(number) ? number : NaN;
  }

  function formatPtBrDecimal(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '';
    const hasDecimals = !Number.isInteger(number);
    return number.toLocaleString('pt-BR', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 3
    });
  }

  function formatSeconds(row) {
    const seconds = row.time_seconds ?? (Number(row.time_minutes || 0) * 60);
    return formatPtBrDecimal(seconds);
  }

  function selectedMaterial() {
    return materials.find(material => String(material.id) === String(form.elements.materialId.value));
  }

  function updateMaterialPreview() {
    const material = selectedMaterial();
    modalBackdrop.querySelector('.material-codes').innerHTML = chips(material?.codes || [], 'Sem códigos');
    modalBackdrop.querySelector('.output-unit').innerHTML = chips([material?.primary_unit]);
  }

  function materialForRow(row) {
    const rowCodes = new Set((row.material_codes || []).map(code => String(code)));
    return materials.find(material =>
      material.name === row.material_name
      || (material.codes || []).some(code => rowCodes.has(String(code)))
    );
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    form.reset();
    form.elements.id.value = '';
  }

  function openModal(row = null) {
    form.reset();
    modalTitle.textContent = row ? 'Editar produtividade' : 'Cadastrar produtividade';
    form.elements.id.value = row?.id || '';
    form.elements.materialId.value = row ? materialForRow(row)?.id || '' : materials[0]?.id || '';
    form.elements.machineName.value = row?.machine_name || machines[0]?.name || '';
    form.elements.peopleCount.value = row?.people_count || '';
    form.elements.outputQty.value = row?.output_qty || '';
    form.elements.timeSeconds.value = row ? formatSeconds(row) : '';
    updateMaterialPreview();
    modalBackdrop.hidden = false;
    form.elements.materialId.focus();
  }

  async function loadLookups() {
    [materials, machines] = await Promise.all([api('/materials'), api('/machines')]);
    form.elements.materialId.innerHTML = materials.map(material => `<option value="${material.id}">${material.name}</option>`).join('');
    form.elements.machineName.innerHTML = machines.map(machine => `<option value="${machine.name}">${machine.name}</option>`).join('');
    updateMaterialPreview();
  }

  async function load() {
    setInternalLoading(tableTarget, 'Carregando matriz...');
    try {
      rows = await api(`/productivity?search=${encodeURIComponent(search.value)}`);
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({ columns, rows }));
    } catch (error) {
      setInternalError(tableTarget, error.message || 'Nao foi possivel carregar a matriz.');
      throw error;
    }
  }

  form.elements.materialId.addEventListener('change', updateMaterialPreview);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!canWriteMatrix) return;
    const material = selectedMaterial();
    const timeSeconds = parsePtBrDecimal(form.elements.timeSeconds.value);
    form.elements.timeSeconds.setCustomValidity('');
    if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
      form.elements.timeSeconds.setCustomValidity('Informe os segundos com valor maior que zero.');
      form.reportValidity();
      return;
    }
    const data = {
      active: true,
      materialId: Number(form.elements.materialId.value),
      materialName: material?.name || '',
      materialCodes: material?.codes || [],
      machineName: form.elements.machineName.value,
      peopleCount: Number(form.elements.peopleCount.value),
      outputQty: Number(form.elements.outputQty.value),
      outputUnit: material?.primary_unit || 'un',
      timeSeconds
    };
    const id = form.elements.id.value;
    await api(id ? `/productivity/${id}` : '/productivity', { method: id ? 'PUT' : 'POST', body: data });
    closeModal();
    await load();
  });
  form.elements.timeSeconds.addEventListener('input', () => form.elements.timeSeconds.setCustomValidity(''));

  tableTarget.addEventListener('click', async event => {
    if (!canWriteMatrix) return;
    const editId = event.target.dataset.edit;
    if (editId) {
      const row = rows.find(item => String(item.id) === editId);
      openModal(row);
    }
  });

  addButton?.addEventListener('click', () => openModal());
  page.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', closeModal));
  modalBackdrop.addEventListener('click', event => {
    if (event.target === modalBackdrop) closeModal();
  });
  search.addEventListener('input', () => load());
  Promise.all([loadLookups(), load()]).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
