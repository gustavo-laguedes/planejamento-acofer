import { api, getCurrentUser } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';

const DAILY_PRODUCTIVITY_SECONDS = 24 * 60 * 60;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${escapeHtml(value)}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
}

function parseCodes(value) {
  return String(value || '')
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
}

function rowCodes(row) {
  return Array.isArray(row.material_codes) && row.material_codes.length
    ? row.material_codes
    : parseCodes(row.material_code);
}

function formatCodes(row) {
  return rowCodes(row).join(', ');
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

function materialMatchesRow(material, row) {
  const codes = new Set((material.codes || []).map(code => String(code).toLowerCase()));
  return String(material.name || '').toLowerCase() === String(row.material_name || '').toLowerCase()
    || rowCodes(row).some(code => codes.has(String(code).toLowerCase()));
}

export function ProductivityMatrixPage() {
  const canWriteMatrix = canAccess(getCurrentUser(), 'matrix:write');
  const page = document.createElement('section');
  page.className = 'stack productivity-matrix-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Matriz de Produtividade</h1>
        <p>Cadastre uma ou mais produtividades di&aacute;rias por material e m&aacute;quina.</p>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar list-actions">
        <input class="search" placeholder="Buscar por material, m&aacute;quina ou c&oacute;digo" />
        ${canWriteMatrix ? '<button class="primary-button add-productivity" type="button">Adicionar produtividade</button>' : ''}
      </div>
      <div class="table-target"></div>
    </div>
    <div class="modal-backdrop" hidden>
      <div class="modal wide-modal productivity-lines-modal" role="dialog" aria-modal="true" aria-labelledby="productivity-modal-title">
        <div class="modal-header">
          <h2 id="productivity-modal-title">Produtividades do material</h2>
          <button class="link-button close-modal" type="button" aria-label="Fechar">Fechar</button>
        </div>
        <form class="productivity-form">
          <label>Material<select name="materialId" required></select></label>
          <div class="readonly-field wide-field">
            <span>C&oacute;digos atrelados</span>
            <div class="material-codes readonly-chip-list"></div>
          </div>
          <div class="productivity-lines-header">
            <h3>Linhas de produtividade</h3>
            ${canWriteMatrix ? '<button class="secondary-button add-productivity-line" type="button">Adicionar produtividade</button>' : ''}
          </div>
          <div class="productivity-lines-target"></div>
          <div class="form-actions modal-actions">
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
  const addButton = page.querySelector('.add-productivity');
  const linesTarget = page.querySelector('.productivity-lines-target');
  const addLineButton = page.querySelector('.add-productivity-line');
  let rows = [];
  let materials = [];
  let machines = [];
  let deletedLineIds = [];

  const columns = [
    { label: 'Material', key: 'material_name' },
    { label: 'Códigos atrelados', render: row => escapeHtml(formatCodes(row)) },
    { label: 'Produtividades', render: row => row.line_count },
    { label: 'Máquinas', render: row => escapeHtml(row.machines.join(', ')) },
    { label: 'Maior produtividade/dia', render: row => `${formatPtBrDecimal(row.max_output_qty)} ${escapeHtml(row.output_unit || '')}`.trim() },
    { label: 'Status', render: row => row.active_count > 0 ? 'Ativo' : 'Inativo' },
    { label: 'Ações', render: row => canWriteMatrix ? `<button class="link-button" data-edit-material="${escapeHtml(row.material_key)}">Editar linhas</button>` : '' }
  ];

  function selectedMaterial() {
    return materials.find(material => String(material.id) === String(form.elements.materialId.value));
  }

  function materialKeyForRow(row) {
    return String(materialForRow(row)?.id || row.material_name || row.id);
  }

  function materialForRow(row) {
    return materials.find(material => materialMatchesRow(material, row));
  }

  function groupedRows() {
    const groups = new Map();
    rows.filter(row => row.active !== false).forEach(row => {
      const material = materialForRow(row);
      const key = String(material?.id || row.material_name || row.id);
      if (!groups.has(key)) {
        groups.set(key, {
          material_key: key,
          material_name: material?.name || row.material_name,
          material_codes: material?.codes || rowCodes(row),
          output_unit: material?.primary_unit || row.output_unit || 'un',
          machines: [],
          line_count: 0,
          active_count: 0,
          max_output_qty: 0
        });
      }
      const group = groups.get(key);
      group.line_count += 1;
      group.active_count += 1;
      if (row.machine_name && !group.machines.includes(row.machine_name)) group.machines.push(row.machine_name);
      group.max_output_qty = Math.max(group.max_output_qty, Number(row.output_qty || 0));
    });
    return [...groups.values()].sort((left, right) => left.material_name.localeCompare(right.material_name));
  }

  function updateMaterialPreview() {
    const material = selectedMaterial();
    modalBackdrop.querySelector('.material-codes').innerHTML = chips(material?.codes || [], 'Sem códigos');
  }

  function normalizeLinePriorities() {
    [...linesTarget.querySelectorAll('.productivity-line [name="machinePriority"]')]
      .forEach((input, index) => {
        input.value = String(index + 1);
      });
  }

  function moveLineToPriority(line, priority) {
    const lines = [...linesTarget.querySelectorAll('.productivity-line')].filter(item => item !== line);
    const targetIndex = Math.max(Math.min(priority - 1, lines.length), 0);
    if (targetIndex >= lines.length) {
      linesTarget.appendChild(line);
    } else {
      linesTarget.insertBefore(line, lines[targetIndex]);
    }
    normalizeLinePriorities();
  }

  function lineTemplate(line = {}, index = 0) {
    const material = selectedMaterial();
    const priority = Number(line.machine_priority) > 0 ? Number(line.machine_priority) : index + 1;
    return `
      <article class="productivity-line" data-line-id="${escapeHtml(line.id || '')}">
        <label>M&aacute;quina
          <select name="machineName" required>
            ${machines.map(machine => `<option value="${escapeHtml(machine.name)}" ${String(machine.name) === String(line.machine_name || '') ? 'selected' : ''}>${escapeHtml(machine.name)}</option>`).join('')}
          </select>
        </label>
        <label>Prioridade
          <input name="machinePriority" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(priority)}" required />
        </label>
        <label>Pessoas utilizadas
          <input name="peopleCount" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(line.people_count ?? '')}" required />
        </label>
        <label>Quantidade produzida por dia
          <input name="outputQty" type="number" min="0.001" step="0.001" inputmode="decimal" value="${escapeHtml(line.output_qty || '')}" required />
        </label>
        <div class="readonly-field">
          <span>Unidade</span>
          <div class="readonly-chip-list">${chips([material?.primary_unit || line.output_unit || 'un'])}</div>
        </div>
        ${canWriteMatrix ? '<button class="link-button danger remove-productivity-line" type="button">Excluir linha</button>' : ''}
      </article>
    `;
  }

  function renderLines(lines = []) {
    const activeLines = lines.filter(line => line.active !== false);
    const sortedLines = [...activeLines].sort((left, right) =>
      Number(left.machine_priority || 0) - Number(right.machine_priority || 0)
      || String(left.machine_name || '').localeCompare(String(right.machine_name || ''))
    );
    linesTarget.innerHTML = sortedLines.length
      ? sortedLines.map(lineTemplate).join('')
      : lineTemplate();
    normalizeLinePriorities();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    form.reset();
    linesTarget.innerHTML = '';
    deletedLineIds = [];
  }

  function openModal(materialId = null) {
    form.reset();
    deletedLineIds = [];
    form.elements.materialId.value = materialId || materials[0]?.id || '';
    updateMaterialPreview();
    renderLines(rows.filter(row => materialKeyForRow(row) === String(form.elements.materialId.value)));
    modalBackdrop.hidden = false;
    form.elements.materialId.focus();
  }

  async function loadLookups() {
    [materials, machines] = await Promise.all([api('/materials'), api('/machines')]);
    form.elements.materialId.innerHTML = materials.map(material => `<option value="${material.id}">${escapeHtml(material.name)}</option>`).join('');
    updateMaterialPreview();
  }

  async function load() {
    setInternalLoading(tableTarget, 'Carregando matriz...');
    try {
      rows = await api(`/productivity?search=${encodeURIComponent(search.value)}`);
      tableTarget.innerHTML = '';
      tableTarget.appendChild(DataTable({ columns, rows: groupedRows() }));
    } catch (error) {
      setInternalError(tableTarget, error.message || 'Não foi possível carregar a matriz.');
      throw error;
    }
  }

  form.elements.materialId.addEventListener('change', () => {
    updateMaterialPreview();
    deletedLineIds = [];
    renderLines(rows.filter(row => materialKeyForRow(row) === String(form.elements.materialId.value)));
  });

  addLineButton?.addEventListener('click', () => {
    linesTarget.insertAdjacentHTML('beforeend', lineTemplate({}, linesTarget.querySelectorAll('.productivity-line').length));
    normalizeLinePriorities();
  });

  linesTarget.addEventListener('change', event => {
    if (!event.target.matches('[name="machinePriority"]')) return;
    const line = event.target.closest('.productivity-line');
    const priority = Math.max(Number(event.target.value) || 1, 1);
    if (line) moveLineToPriority(line, priority);
  });

  linesTarget.addEventListener('click', event => {
    const button = event.target.closest('.remove-productivity-line');
    if (!button) return;
    const line = button.closest('.productivity-line');
    const id = line?.dataset.lineId;
    if (id) deletedLineIds.push(id);
    line?.remove();
    if (!linesTarget.querySelector('.productivity-line')) renderLines([]);
    normalizeLinePriorities();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!canWriteMatrix) return;
    const material = selectedMaterial();
    const lineForms = [...linesTarget.querySelectorAll('.productivity-line')];
    if (!lineForms.length) return;
    normalizeLinePriorities();
    const payloads = lineForms.map((line, index) => ({
      id: line.dataset.lineId || '',
      active: true,
      materialId: Number(form.elements.materialId.value),
      materialName: material?.name || '',
      materialCodes: material?.codes || [],
      machineName: line.querySelector('[name="machineName"]').value,
      machinePriority: index + 1,
      peopleCount: Number(line.querySelector('[name="peopleCount"]').value),
      outputQty: Number(line.querySelector('[name="outputQty"]').value),
      outputUnit: material?.primary_unit || 'un',
      timeSeconds: DAILY_PRODUCTIVITY_SECONDS
    }));
    if (payloads.some(item => !item.machineName || !Number.isInteger(item.peopleCount) || item.peopleCount < 0 || !(item.outputQty > 0))) {
      form.reportValidity();
      return;
    }
    await Promise.all(deletedLineIds.map(id => api(`/productivity/${id}`, { method: 'DELETE' })));
    await Promise.all(payloads.map(item => api(item.id ? `/productivity/${item.id}` : '/productivity', {
      method: item.id ? 'PUT' : 'POST',
      body: item
    })));
    closeModal();
    await load();
  });

  tableTarget.addEventListener('click', event => {
    if (!canWriteMatrix) return;
    const materialKey = event.target.dataset.editMaterial;
    if (materialKey) openModal(materialKey);
  });

  addButton?.addEventListener('click', () => openModal());
  page.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', closeModal));
  modalBackdrop.addEventListener('click', event => {
    if (event.target === modalBackdrop) closeModal();
  });
  search.addEventListener('input', () => load());
  loadLookups()
    .then(load)
    .catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
