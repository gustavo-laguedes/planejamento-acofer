import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';
import { UploadCsvButton } from '../shared/UploadCsvButton.js';

const tabs = [
  { id: 'nasajon', label: 'Importação Nasajon' },
  { id: 'inventory', label: 'Contagem de Inventário' },
  { id: 'production', label: 'Lançamento de Produção' }
];

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${value}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
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
      <div class="panel">
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
        { label: 'Data', render: row => row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : '' },
        { label: 'Hora', render: row => row.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR') : '' },
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
      <div class="panel">
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
        { label: 'Data/hora', render: row => formatDate(row.created_at) },
        { label: 'Observação', key: 'notes' },
        { label: 'Usuário', render: row => row.user_id || '-' },
        { label: 'Itens', key: 'item_count' }
      ],
      rows
    }));
  }

  async function openInventoryModal() {
    const template = await api('/stock/inventory/template');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Realizar inventário</h2>
          <button class="link-button close-modal" type="button">Fechar</button>
        </div>
        <label class="wide-field">Observação<input name="notes" /></label>
        <div class="inventory-grid">
          ${template.rows.map(row => `
            <article class="inventory-material">
              <h3>${row.material.name}</h3>
              <p>${(row.codes || []).join(', ') || 'Sem códigos'}</p>
              ${template.locations.map(location => {
                const current = row.inventoryByLocation?.[String(location.id)] ?? row.stockByLocation?.[String(location.id)]?.nasajonQty ?? 0;
                return `
                  <label>${location.name}
                    <span>Saldo atual: ${current}</span>
                    <input type="number" step="0.001" placeholder="Saldo atualizado" data-material-id="${row.material.id}" data-location-id="${location.id}" data-current="${current}" />
                  </label>
                `;
              }).join('')}
            </article>
          `).join('')}
        </div>
        <div class="form-actions">
          <button class="primary-button save-inventory" type="button">Salvar inventário</button>
          <button class="secondary-button close-modal" type="button">Cancelar</button>
        </div>
      </div>
    `;
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    backdrop.querySelector('.save-inventory').addEventListener('click', async () => {
      const items = [...backdrop.querySelectorAll('.inventory-grid input[data-material-id]')].map(input => ({
        materialId: Number(input.dataset.materialId),
        locationId: Number(input.dataset.locationId),
        previousQty: Number(input.dataset.current || 0),
        countedQty: input.value
      }));
      await api('/stock/inventory/counts', {
        method: 'POST',
        body: { notes: backdrop.querySelector('[name="notes"]').value, items }
      });
      backdrop.remove();
      await renderInventory();
    });
    page.appendChild(backdrop);
  }

  async function renderProductionLaunch() {
    await loadLookups();
    target.innerHTML = `
      <div class="panel">
        <form class="grid-form production-launch-form">
          <label>Data<input name="productionDate" type="date" required /></label>
          <label>Material<select name="materialId" required>${materials.map(material => `<option value="${material.id}">${material.name}</option>`).join('')}</select></label>
          <label>Quantidade<input name="quantity" type="number" step="0.001" required /></label>
          <div class="readonly-field">
            <span>Unidade principal</span>
            <div class="primary-unit readonly-chip-list"></div>
          </div>
          <div class="readonly-field">
            <span>Unidade secundária</span>
            <div class="secondary-unit readonly-chip-list"></div>
          </div>
          <label>Máquina<select name="machineName"><option value="">Selecione</option>${machines.map(machine => `<option value="${machine.name}">${machine.name}</option>`).join('')}</select></label>
          <label>Pessoas<input name="peopleCount" type="number" min="1" /></label>
          <label class="wide-field">Observação<input name="notes" /></label>
          <div class="form-actions"><button class="primary-button" type="submit">Lançar produção</button></div>
        </form>
      </div>
      <div class="panel table-target"></div>
    `;
    const form = target.querySelector('form');
    form.elements.productionDate.value = new Date().toISOString().slice(0, 10);
    function updateUnits() {
      const material = materials.find(item => String(item.id) === String(form.elements.materialId.value));
      const quantity = Number(form.elements.quantity.value || 0);
      target.querySelector('.primary-unit').innerHTML = chips([material?.primary_unit]);
      target.querySelector('.secondary-unit').innerHTML = chips([`${Number((quantity * Number(material?.primary_to_secondary_factor || 1)).toFixed(3))} ${material?.secondary_unit || ''}`]);
    }
    form.elements.materialId.addEventListener('change', updateUnits);
    form.elements.quantity.addEventListener('input', updateUnits);
    updateUnits();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.materialId = Number(data.materialId);
      data.quantity = Number(data.quantity);
      data.peopleCount = Number(data.peopleCount || 0) || null;
      await api('/actuals/launches', { method: 'POST', body: data });
      await renderProductionLaunch();
    });
    const rows = await api('/actuals/launches');
    target.querySelector('.table-target').appendChild(DataTable({
      columns: [
        { label: 'Data', key: 'production_date' },
        { label: 'Material', key: 'material_name' },
        { label: 'Quantidade', render: row => `${row.quantity} ${row.primary_unit}` },
        { label: 'Unidade secundária', render: row => `${row.secondary_qty} ${row.secondary_unit}` },
        { label: 'Máquina', key: 'machine_name' },
        { label: 'Pessoas', key: 'people_count' },
        { label: 'Observação', key: 'notes' }
      ],
      rows
    }));
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
