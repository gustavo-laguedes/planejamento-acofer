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

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (!hours) return `${remainingMinutes}min`;
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function matrixSecondsPerUnit(row) {
  const timeSeconds = Number(row.time_seconds || Number(row.time_minutes || 0) * 60);
  return timeSeconds / Math.max(Number(row.output_qty || 1), 1);
}

function chips(values = [], emptyText = 'Sem informação') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${value}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
}

function productivityLabel(option) {
  if (!option) return '-';
  return `${formatPtBrDecimal(option.outputQty)} ${option.outputUnit} em ${formatPtBrDecimal(option.timeSeconds)}s`;
}

function renderTreeLevels(node, level = 0, levels = []) {
  if (!node) return levels;
  levels[level] ||= [];
  levels[level].push(node);
  for (const child of node.children || []) renderTreeLevels(child, level + 1, levels);
  return levels;
}

function renderEngineeringTree(node) {
  const levels = renderTreeLevels(node).reverse();
  return levels.map((items, index) => `
    <div class="engineering-level">
      <span class="engineering-level-label">${index === 0 ? 'Matéria-prima / início' : index === levels.length - 1 ? 'Material final' : 'Intermediário'}</span>
      <div class="engineering-level-items">
        ${items.map(item => `
          <article class="engineering-node">
            <strong>${item.materialName}</strong>
            <span>Necessário: ${formatPtBrDecimal(item.requiredQty)} ${item.unit || ''}</span>
            <span>Produzir: ${formatPtBrDecimal(item.produceQty)} ${item.unit || ''}</span>
          </article>
        `).join('')}
      </div>
    </div>
  `).join('');
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
  let operationOverrides = {};

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
    return matrix
      .filter(row => row.material_name === material?.name || (row.material_codes || []).some(code => codes.has(String(code).toLowerCase())))
      .sort((left, right) => matrixSecondsPerUnit(left) - matrixSecondsPerUnit(right));
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
      <div class="planning-results" hidden>
        <div class="panel">
          <div class="section-heading">
            <h2>Resumo da simula&ccedil;&atilde;o</h2>
          </div>
          <div class="summary-grid compact-summary"></div>
        </div>
        <div class="panel operation-panel">
          <div class="section-heading">
            <h2>Configura&ccedil;&atilde;o por opera&ccedil;&atilde;o</h2>
          </div>
          <div class="operation-config-target"></div>
        </div>
        <div class="panel engineering-panel">
          <div class="section-heading">
            <h2>Engenharia do planejamento</h2>
          </div>
          <div class="engineering-tree"></div>
        </div>
        <div class="panel calendar-panel">
          <div class="section-heading">
            <h2>Calend&aacute;rio de produ&ccedil;&atilde;o</h2>
          </div>
          <div class="timeline-target"></div>
        </div>
      </div>
    `;

    const form = target.querySelector('form');
    const saveButton = target.querySelector('[name="save"]');
    const resultsTarget = target.querySelector('.planning-results');
    const summaryGrid = target.querySelector('.summary-grid');
    const operationConfigTarget = target.querySelector('.operation-config-target');
    const timelineTarget = target.querySelector('.timeline-target');
    const engineeringTarget = target.querySelector('.engineering-tree');
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
        hoursPerDay,
        operationOverrides
      };
    }

    function renderSimulation(result) {
      resultsTarget.hidden = false;
      const cards = [
        ['C&oacute;digo previsto', result.code],
        ['Material final', result.summary.materialName],
        ['Quantidade final', `${formatPtBrDecimal(result.summary.plannedQty)} ${result.summary.plannedUnit}`],
        ['Tipo de data', result.summary.dateMode === 'end' ? 'Data final' : 'Data inicial'],
        ['Data informada', result.summary.selectedDate || form.elements.selectedDate.value],
        ['Per&iacute;odo estimado', `${result.summary.startDate} at&eacute; ${result.summary.endDate}`],
        ['Total de opera&ccedil;&otilde;es', result.operations.length],
        ['Total de dias', result.summary.daysNeeded],
        ['Horas/dia', formatPtBrDecimal(result.summary.hoursPerDay)]
      ];
      summaryGrid.innerHTML = cards.map(([label, value]) => `<article class="metric-card compact"><span>${label}</span><strong>${value}</strong></article>`).join('');
      operationConfigTarget.innerHTML = result.operations.map(operation => {
        const options = operation.productivityOptions || [];
        const selectedValue = `${operation.machineName}||${operation.peopleCount}`;
        const editable = options.length > 1;
        return `
          <article class="operation-config-card">
            <div>
              <strong>${operation.materialName}</strong>
              <span>${formatPtBrDecimal(operation.produceQty)} ${operation.unit || result.summary.plannedUnit} &middot; ${formatMinutes(operation.totalMinutes)}</span>
            </div>
            <label>M&aacute;quina / pessoas
              <select data-operation-material="${operation.materialId}" ${editable ? '' : 'disabled data-locked="true"'}>
                ${options.map(option => {
                  const value = `${option.machineName}||${option.peopleCount}`;
                  return `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${option.machineName} &middot; ${option.peopleCount} pessoa${option.peopleCount === 1 ? '' : 's'}</option>`;
                }).join('')}
              </select>
            </label>
            <div class="operation-meta">
              <span>Produtividade: ${productivityLabel(options.find(option => `${option.machineName}||${option.peopleCount}` === selectedValue))}</span>
              <span>Per&iacute;odo: ${operation.startDate} at&eacute; ${operation.endDate}</span>
            </div>
          </article>
        `;
      }).join('');
      engineeringTarget.innerHTML = renderEngineeringTree(result.tree);
      timelineTarget.innerHTML = '';
      timelineTarget.appendChild(CalendarTimeline(result.days, result.operations));
    }

    async function simulate() {
      const hoursPerDay = parsePtBrDecimal(form.elements.hoursPerDay.value, 8);
      form.elements.hoursPerDay.setCustomValidity('');
      if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) {
        form.elements.hoursPerDay.setCustomValidity('Informe as horas por dia com valor maior que zero.');
        form.reportValidity();
        return null;
      }
      form.elements.hoursPerDay.value = formatPtBrDecimal(hoursPerDay);
      lastPayload = payload();
      const result = await api('/planning/simulate', { method: 'POST', body: lastPayload });
      if (result.summary.hasPastStart && !confirm(`ATENCAO

O planejamento exige inicio em ${result.summary.startDate}.
A data ja passou.

Deseja continuar mesmo assim?`)) return null;
      renderSimulation(result);
      saveButton.disabled = false;
      return result;
    }

    form.querySelectorAll('[name="dateModeChoice"]').forEach(input => {
      input.addEventListener('change', () => {
        form.querySelectorAll('[name="dateModeChoice"]').forEach(option => {
          option.checked = option === input;
        });
      });
    });
    form.elements.materialId.addEventListener('change', () => {
      operationOverrides = {};
      updateMaterialFields();
      resultsTarget.hidden = true;
      saveButton.disabled = true;
    });
    form.elements.machineName.addEventListener('change', updatePeopleOptions);
    form.elements.hoursPerDay.addEventListener('input', () => form.elements.hoursPerDay.setCustomValidity(''));
    operationConfigTarget.addEventListener('change', async event => {
      if (!event.target.dataset.operationMaterial) return;
      const [machineName, peopleCount] = event.target.value.split('||');
      operationOverrides[event.target.dataset.operationMaterial] = {
        machineName,
        peopleCount: Number(peopleCount)
      };
      try {
        await simulate();
      } catch (error) {
        toast(error);
      }
    });
    updateMaterialFields();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await simulate();
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
