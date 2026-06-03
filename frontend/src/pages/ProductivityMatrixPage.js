import { api } from '../api.js';
import { DataTable } from '../components/DataTable.js';

export function ProductivityMatrixPage() {
  const page = document.createElement('section');
  page.className = 'stack';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Matriz de Produtividade</h1>
        <p>Cadastre a relacao entre material, maquina, pessoas e tempo de producao.</p>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar list-actions">
        <input class="search" placeholder="Buscar por material, maquina ou codigo" />
        <button class="primary-button add-productivity" type="button">Cadastrar produtividade</button>
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
          <label>Material<input name="materialName" required /></label>
          <label>Codigos atrelados<input name="materialCodes" placeholder="123, 456, 789" /></label>
          <label>Maquina<input name="machineName" required /></label>
          <label>Pessoas utilizadas<input name="peopleCount" type="number" min="1" required /></label>
          <label>Quantidade que produz<input name="outputQty" type="number" step="0.001" required /></label>
          <label>Unidade que produz<input name="outputUnit" value="un" required /></label>
          <label>Segundos<input name="timeSeconds" type="number" step="1" min="1" required /></label>
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

  const columns = [
    { label: 'Material', key: 'material_name' },
    { label: 'Codigos atrelados', render: row => formatCodes(row) },
    { label: 'Maquina', key: 'machine_name' },
    { label: 'Pessoas', key: 'people_count' },
    { label: 'Produz', render: row => `${row.output_qty} ${row.output_unit}` },
    { label: 'Segundos', render: row => formatSeconds(row) },
    { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
    { label: 'Acoes', render: row => `<button class="link-button" data-edit="${row.id}">Editar</button>` }
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

  function formatSeconds(row) {
    return row.time_seconds || Math.round(Number(row.time_minutes || 0) * 60) || '';
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    form.reset();
    form.elements.id.value = '';
    form.elements.outputUnit.value = 'un';
  }

  function openModal(row = null) {
    form.reset();
    modalTitle.textContent = row ? 'Editar produtividade' : 'Cadastrar produtividade';
    form.elements.id.value = row?.id || '';
    form.elements.materialName.value = row?.material_name || '';
    form.elements.materialCodes.value = row ? formatCodes(row) : '';
    form.elements.machineName.value = row?.machine_name || '';
    form.elements.peopleCount.value = row?.people_count || '';
    form.elements.outputQty.value = row?.output_qty || '';
    form.elements.outputUnit.value = row?.output_unit || 'un';
    form.elements.timeSeconds.value = row ? formatSeconds(row) : '';
    modalBackdrop.hidden = false;
    form.elements.materialName.focus();
  }

  async function load() {
    rows = await api(`/productivity?search=${encodeURIComponent(search.value)}`);
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({ columns, rows }));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.active = true;
    data.materialCodes = parseCodes(data.materialCodes);
    data.peopleCount = Number(data.peopleCount);
    data.outputQty = Number(data.outputQty);
    data.timeSeconds = Number(data.timeSeconds);
    const id = data.id;
    delete data.id;
    await api(id ? `/productivity/${id}` : '/productivity', { method: id ? 'PUT' : 'POST', body: data });
    closeModal();
    await load();
  });

  tableTarget.addEventListener('click', async event => {
    const editId = event.target.dataset.edit;
    if (editId) {
      const row = rows.find(item => String(item.id) === editId);
      openModal(row);
    }
  });

  addButton.addEventListener('click', () => openModal());
  page.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', closeModal));
  modalBackdrop.addEventListener('click', event => {
    if (event.target === modalBackdrop) closeModal();
  });
  search.addEventListener('input', () => load());
  load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
