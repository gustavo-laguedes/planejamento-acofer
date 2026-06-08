import { api } from '../shared/api.js';
import { CalendarTimeline } from '../shared/CalendarTimeline.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';

const planningTabs = [
  { id: 'simulation', label: 'Simulação' },
  { id: 'history', label: 'Histórico de Planejamentos' }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function parsePtBrDecimal(value, fallback = NaN) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return fallback;
  const normalizedValue = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue;
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : fallback;
}

function formatPtBrDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const hasDecimals = !Number.isInteger(number);
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 3
  });
}

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${value}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
}

function renderTree(node) {
  if (!node) return '';
  return `
    <li>
      <strong>${node.materialName}</strong>
      <span>${node.requiredQty} ${node.unit || ''} | estoque ${node.stockQty} | produzir ${node.produceQty} | ${node.status}</span>
      ${node.children?.length ? `<ul>${node.children.map(renderTree).join('')}</ul>` : ''}
    </li>
  `;
}

export function PlanningPage() {
  const page = document.createElement('section');
  page.className = 'stack planning-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Planejamento</h1>
        <p>Simule prazos a partir da engenharia cadastrada, estoque e matriz de produtividade.</p>
      </div>
    </div>
    <div class="internal-tabs-target"></div>
    <div class="planning-target"></div>
  `;

  const tabsTarget = page.querySelector('.internal-tabs-target');
  const target = page.querySelector('.planning-target');
  let activeTab = sessionStorage.getItem('planejamento_planning_tab') || 'simulation';
  let materials = [];
  let matrix = [];
  let lastPayload = null;

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function renderTabs() {
    tabsTarget.innerHTML = '';
    tabsTarget.appendChild(InternalTabs(planningTabs, activeTab, tab => {
      activeTab = tab;
      sessionStorage.setItem('planejamento_planning_tab', activeTab);
      render().catch(toast);
    }));
  }

  function selectedMaterial(form) {
    return materials.find(material => String(material.id) === String(form.elements.materialId.value));
  }

  function currentDateMode(form) {
    return form.querySelector('[name="dateModeChoice"][value="end"]').checked ? 'end' : 'start';
  }

  function matchingMatrix(material) {
    const codes = new Set((material?.codes || []).map(code => String(code).toLowerCase()));
    return matrix.filter(row => row.material_name === material?.name || (row.material_codes || []).some(code => codes.has(String(code).toLowerCase())));
  }

  async function loadLookups() {
    [materials, matrix] = await Promise.all([api('/materials'), api('/productivity')]);
  }

  async function renderSimulationTab() {
    await loadLookups();
    target.innerHTML = `
      <div class="panel">
        <form class="grid-form planning-form">
          <fieldset class="date-mode-field">
            <legend>Tipo de data</legend>
            <label class="choice-pill"><input name="dateModeChoice" type="checkbox" value="start" checked /> Data inicial</label>
            <label class="choice-pill"><input name="dateModeChoice" type="checkbox" value="end" /> Data final</label>
          </fieldset>
          <label>Data<input name="selectedDate" type="date" required /></label>
          <label>Material<select name="materialId" required></select></label>
          <div class="readonly-field">
            <span>Código</span>
            <div class="material-codes readonly-chip-list"></div>
          </div>
          <div class="readonly-field">
            <span>Unidade</span>
            <div class="material-unit readonly-chip-list"></div>
          </div>
          <label>Quantidade<input name="plannedQty" type="number" step="0.001" required /></label>
          <label>Máquina<select name="machineName" required></select></label>
          <label>Pessoas<select name="peopleCount" required></select></label>
          <label>Horas/dia<input name="hoursPerDay" type="text" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?" value="8" /></label>
          <div class="form-actions">
            <button class="primary-button" name="simulate" type="submit">Simular</button>
            <button class="secondary-button" name="save" type="button" disabled>Salvar planejamento</button>
          </div>
        </form>
      </div>
      <div class="summary-grid"></div>
      <div class="panel tree-panel" hidden>
        <h2>Árvore produtiva</h2>
        <ul class="production-tree"></ul>
      </div>
      <div class="panel">
        <h2>Linha do tempo</h2>
        <div class="timeline-target"></div>
      </div>
    `;

    const form = target.querySelector('form');
    const saveButton = target.querySelector('[name="save"]');
    const summaryGrid = target.querySelector('.summary-grid');
    const timelineTarget = target.querySelector('.timeline-target');
    const treePanel = target.querySelector('.tree-panel');
    const treeTarget = target.querySelector('.production-tree');
    form.elements.selectedDate.value = today();
    form.elements.materialId.innerHTML = materials.map(material => `<option value="${material.id}">${material.name}</option>`).join('');
    timelineTarget.appendChild(CalendarTimeline([]));

    function updateMaterialFields() {
      const material = selectedMaterial(form);
      target.querySelector('.material-codes').innerHTML = chips(material?.codes || [], 'Sem códigos');
      target.querySelector('.material-unit').innerHTML = chips([material?.primary_unit]);
      const rows = matchingMatrix(material);
      const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
      form.elements.machineName.innerHTML = machines.map(machine => `<option value="${machine}">${machine}</option>`).join('');
      form.elements.machineName.disabled = machines.length === 1;
      form.elements.machineName.dataset.locked = machines.length === 1 ? 'true' : 'false';
      updatePeopleOptions();
    }

    function updatePeopleOptions() {
      const rows = matchingMatrix(selectedMaterial(form)).filter(row => !form.elements.machineName.value || row.machine_name === form.elements.machineName.value);
      const people = [...new Set(rows.map(row => row.people_count).filter(Boolean))];
      form.elements.peopleCount.innerHTML = people.map(value => `<option value="${value}">${value}</option>`).join('');
      form.elements.peopleCount.disabled = people.length === 1;
      form.elements.peopleCount.dataset.locked = people.length === 1 ? 'true' : 'false';
    }

    function payload() {
      const material = selectedMaterial(form);
      const hoursPerDay = parsePtBrDecimal(form.elements.hoursPerDay.value, 8);
      return {
        dateMode: currentDateMode(form),
        selectedDate: form.elements.selectedDate.value,
        startDate: form.elements.selectedDate.value,
        materialId: Number(form.elements.materialId.value),
        materialCode: material?.codes?.[0] || '',
        plannedQty: Number(form.elements.plannedQty.value),
        plannedUnit: material?.primary_unit || 'un',
        machineName: form.elements.machineName.value,
        peopleCount: Number(form.elements.peopleCount.value),
        hoursPerDay
      };
    }

    function renderSimulation(result) {
      const cards = [
        ['Código previsto', result.code],
        ['Material', result.summary.materialName],
        ['Quantidade', `${result.summary.plannedQty} ${result.summary.plannedUnit}`],
        ['Período', `${result.summary.startDate} até ${result.summary.endDate}`],
        ['Operações', result.operations.length],
        ['Dias', result.summary.daysNeeded],
        ['Horas/dia', formatPtBrDecimal(result.summary.hoursPerDay)],
        ['Máquina inicial', result.summary.machineName || '-'],
        ['Pessoas', result.summary.peopleCount || '-']
      ];
      summaryGrid.innerHTML = cards.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
      treePanel.hidden = false;
      treeTarget.innerHTML = renderTree(result.tree);
      timelineTarget.innerHTML = '';
      timelineTarget.appendChild(CalendarTimeline(result.days));
    }

    form.querySelectorAll('[name="dateModeChoice"]').forEach(input => {
      input.addEventListener('change', () => {
        form.querySelectorAll('[name="dateModeChoice"]').forEach(option => {
          option.checked = option === input;
        });
      });
    });
    form.elements.materialId.addEventListener('change', updateMaterialFields);
    form.elements.machineName.addEventListener('change', updatePeopleOptions);
    form.elements.hoursPerDay.addEventListener('input', () => form.elements.hoursPerDay.setCustomValidity(''));
    updateMaterialFields();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const hoursPerDay = parsePtBrDecimal(form.elements.hoursPerDay.value, 8);
        form.elements.hoursPerDay.setCustomValidity('');
        if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) {
          form.elements.hoursPerDay.setCustomValidity('Informe as horas por dia com valor maior que zero.');
          form.reportValidity();
          return;
        }
        form.elements.hoursPerDay.value = formatPtBrDecimal(hoursPerDay);
        lastPayload = payload();
        const result = await api('/planning/simulate', { method: 'POST', body: lastPayload });
        if (result.summary.hasPastStart && !confirm(`ATENÇÃO\n\nO planejamento exige início em ${result.summary.startDate}.\nA data já passou.\n\nDeseja continuar mesmo assim?`)) return;
        renderSimulation(result);
        saveButton.disabled = false;
      } catch (error) {
        toast(error);
      }
    });

    saveButton.addEventListener('click', async () => {
      try {
        const saved = await api('/planning/plans', { method: 'POST', body: lastPayload || payload() });
        saveButton.disabled = true;
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Planejamento ${saved.plan.code || saved.plan.id} salvo.` }));
      } catch (error) {
        toast(error);
      }
    });
  }

  async function renderHistoryTab() {
    target.innerHTML = `
      <div class="panel planning-history-panel">
        <div class="section-heading">
          <h2>Histórico de Planejamentos</h2>
          <button class="secondary-button refresh-history" type="button">Atualizar</button>
        </div>
        <div class="planning-history-target"></div>
      </div>
    `;
    const historyTarget = target.querySelector('.planning-history-target');

    async function loadHistory() {
      const rows = await api('/planning/plans');
      historyTarget.innerHTML = '';
      historyTarget.appendChild(DataTable({
        columns: [
          { label: 'Código do planejamento', key: 'code' },
          { label: 'Material', key: 'material_name' },
          { label: 'Quantidade', render: row => `${row.planned_qty} ${row.planned_unit}` },
          { label: 'Horas/dia', render: row => formatPtBrDecimal(row.hours_per_day), sortValue: row => Number(row.hours_per_day || 0) },
          { label: 'Data de criação', render: row => formatDate(row.created_at), sortValue: row => row.created_at },
          { label: 'Status', key: 'status' },
          { label: 'Ações', render: row => `
            <button class="link-button" data-view="${row.id}">Visualizar</button>
            <button class="link-button" data-pdf="${row.id}">Gerar PDF</button>
            <button class="link-button danger" data-cancel="${row.id}">Cancelar</button>
          ` }
        ],
        rows
      }));
    }

    async function downloadPdf(id) {
      const blob = await api(`/planning/plans/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `planejamento-${id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    }

    async function cancelPlan(id) {
      if (!confirm('Confirma o cancelamento deste planejamento?')) return;
      await api(`/planning/plans/${id}/cancel`, { method: 'POST', body: { reason: 'Cancelado pelo usuário' } });
      await loadHistory();
    }

    async function viewPlan(id) {
      const detail = await api(`/planning/plans/${id}`);
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h2>${detail.plan.code || detail.plan.id}</h2>
            <button class="link-button close-modal" type="button">Fechar</button>
          </div>
          <pre class="plan-json">${JSON.stringify({ horasPorDia: formatPtBrDecimal(detail.plan.hours_per_day), arvore: detail.tree, operacoes: detail.operations }, null, 2)}</pre>
        </div>
      `;
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
      });
      page.appendChild(backdrop);
    }

    target.querySelector('.refresh-history').addEventListener('click', () => loadHistory().catch(toast));
    historyTarget.addEventListener('click', async event => {
      if (event.target.dataset.pdf) return downloadPdf(event.target.dataset.pdf);
      if (event.target.dataset.cancel) return cancelPlan(event.target.dataset.cancel);
      if (event.target.dataset.view) return viewPlan(event.target.dataset.view);
    });
    await loadHistory();
  }

  async function render() {
    renderTabs();
    if (activeTab === 'history') return renderHistoryTab();
    return renderSimulationTab();
  }

  render().catch(toast);
  return page;
}
