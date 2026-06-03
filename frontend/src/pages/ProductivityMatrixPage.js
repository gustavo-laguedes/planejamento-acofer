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
      <form class="grid-form productivity-form">
        <input type="hidden" name="id" />
        <label>Material<input name="materialName" required /></label>
        <label>Codigo<input name="materialCode" /></label>
        <label>Maquina<input name="machineName" required /></label>
        <label>Pessoas<input name="peopleCount" type="number" min="1" required /></label>
        <label>Quantidade produzida<input name="outputQty" type="number" step="0.001" required /></label>
        <label>Unidade<input name="outputUnit" value="un" required /></label>
        <label>Tempo em minutos<input name="timeMinutes" type="number" step="0.1" required /></label>
        <label>Observacoes<input name="notes" /></label>
        <label class="checkbox-line"><input name="active" type="checkbox" checked /> Ativo</label>
        <div class="form-actions">
          <button class="primary-button" type="submit">Salvar</button>
          <button class="secondary-button" type="reset">Limpar</button>
        </div>
      </form>
    </div>
    <div class="panel">
      <div class="toolbar">
        <input class="search" placeholder="Buscar por material, maquina ou codigo" />
      </div>
      <div class="table-target"></div>
    </div>
  `;

  const form = page.querySelector('form');
  const tableTarget = page.querySelector('.table-target');
  const search = page.querySelector('.search');
  let rows = [];

  const columns = [
    { label: 'Material', key: 'material_name' },
    { label: 'Codigo', key: 'material_code' },
    { label: 'Maquina', key: 'machine_name' },
    { label: 'Pessoas', key: 'people_count' },
    { label: 'Produz', render: row => `${row.output_qty} ${row.output_unit}` },
    { label: 'Minutos', key: 'time_minutes' },
    { label: 'Status', render: row => row.active ? 'Ativo' : 'Inativo' },
    { label: 'Acoes', render: row => `<button class="link-button" data-edit="${row.id}">Editar</button> <button class="link-button danger" data-delete="${row.id}">Inativar</button>` }
  ];

  async function load() {
    rows = await api(`/productivity?search=${encodeURIComponent(search.value)}`);
    tableTarget.innerHTML = '';
    tableTarget.appendChild(DataTable({ columns, rows }));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.active = form.elements.active.checked;
    data.peopleCount = Number(data.peopleCount);
    data.outputQty = Number(data.outputQty);
    data.timeMinutes = Number(data.timeMinutes);
    const id = data.id;
    delete data.id;
    await api(id ? `/productivity/${id}` : '/productivity', { method: id ? 'PUT' : 'POST', body: data });
    form.reset();
    form.elements.active.checked = true;
    await load();
  });

  tableTarget.addEventListener('click', async event => {
    const editId = event.target.dataset.edit;
    const deleteId = event.target.dataset.delete;
    if (editId) {
      const row = rows.find(item => String(item.id) === editId);
      form.elements.id.value = row.id;
      form.elements.materialName.value = row.material_name || '';
      form.elements.materialCode.value = row.material_code || '';
      form.elements.machineName.value = row.machine_name || '';
      form.elements.peopleCount.value = row.people_count || '';
      form.elements.outputQty.value = row.output_qty || '';
      form.elements.outputUnit.value = row.output_unit || 'un';
      form.elements.timeMinutes.value = row.time_minutes || '';
      form.elements.notes.value = row.notes || '';
      form.elements.active.checked = row.active;
    }
    if (deleteId) {
      await api(`/productivity/${deleteId}`, { method: 'DELETE' });
      await load();
    }
  });

  search.addEventListener('input', () => load());
  load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
