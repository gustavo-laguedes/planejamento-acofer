import { api } from '../shared/api.js';
import { CalendarTimeline } from '../shared/CalendarTimeline.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';

const DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';

const planningTabs = [
  { id: 'simulation', label: 'Simulacao' },
  { id: 'history', label: 'Historico de Planejamentos' }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function formatDateOnly(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '';
}

function parsePtBrDecimal(value, fallback = NaN) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return fallback;
  const timeLikeValue = rawValue.match(/^(\d+),(\d{2})$/);
  if (timeLikeValue && Number(timeLikeValue[2]) <= 59) {
    return Number(timeLikeValue[1]) + (Number(timeLikeValue[2]) / 60);
  }
  const normalizedValue = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue;
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function matrixSecondsPerUnit(row) {
  const timeSeconds = Number(row.time_seconds || Number(row.time_minutes || 0) * 60);
  return timeSeconds / Math.max(Number(row.output_qty || 1), 1);
}

function chips(values = [], emptyText = 'Sem informa&ccedil;&atilde;o') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${escapeHtml(value)}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
}

function materialLabel(material) {
  return material?.name || '';
}

function productionModelsFor(material) {
  return Array.isArray(material?.production_models) ? material.production_models.filter(model => (model.inputMaterials || []).length) : [];
}

function minutesToTime(minutes) {
  const normalized = ((Math.round(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function defaultShift(index = 0, startTime = null) {
  const shiftStartTime = startTime || (index === 0 ? '07:00' : '17:00');
  const hoursPerDay = '8,48';
  const pauseHours = '1,12';
  const shiftEndMinutes = timeToMinutes(shiftStartTime)
    + (parsePtBrDecimal(hoursPerDay, 8.8) * 60)
    + (parsePtBrDecimal(pauseHours, 1.2) * 60);
  return {
    id: `shift-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: `Turno ${index + 1}`,
    hoursPerDay,
    shiftStartTime,
    pauseLabel: index === 0 ? 'Horas de almo&ccedil;o' : 'Horas de janta',
    pauseHours,
    shiftEndTime: minutesToTime(shiftEndMinutes)
  };
}

function emptyProduction(index = 0) {
  return {
    id: `production-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `Produ&ccedil;&atilde;o ${index + 1}`,
    materialId: '',
    materialSearch: '',
    productionModelName: '',
    plannedQty: '',
    machineName: '',
    peopleCount: ''
  };
}

function defaultDraft() {
  const start = today();
  return {
    planningStartDate: start,
    planningEndDate: addDays(start, 7),
    shifts: [defaultShift(0)],
    productions: [emptyProduction(0)],
    stockOnlyMaterials: []
  };
}

function normalizeDraft(rawDraft) {
  const draft = rawDraft && typeof rawDraft === 'object' ? rawDraft : {};
  const normalized = {
    ...defaultDraft(),
    ...draft,
    shifts: Array.isArray(draft.shifts) && draft.shifts.length ? draft.shifts : [defaultShift(0)],
    productions: Array.isArray(draft.productions) && draft.productions.length ? draft.productions : [emptyProduction(0)],
    stockOnlyMaterials: Array.isArray(draft.stockOnlyMaterials) ? draft.stockOnlyMaterials : []
  };
  normalized.shifts = normalized.shifts.map((shift, index) => ({
    ...defaultShift(index, shift.shiftStartTime),
    ...shift,
    id: shift.id || `shift-${index}-${Date.now()}`,
    label: `Turno ${index + 1}`,
    pauseLabel: shift.pauseLabel || (index === 0 ? 'Horas de almo&ccedil;o' : 'Horas de janta')
  }));
  normalized.productions = normalized.productions.map((production, index) => ({
    ...emptyProduction(index),
    ...production,
    id: production.id || `production-${index}-${Date.now()}`,
    title: `Produ&ccedil;&atilde;o ${index + 1}`
  }));
  return normalized;
}

function loadDraft() {
  try {
    return normalizeDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'));
  } catch {
    return defaultDraft();
  }
}

export function PlanningPage() {
  const page = document.createElement('section');
  page.className = 'stack planning-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Planejamento</h1>
        <p>Monte o plano por per&iacute;odo, com turnos e v&aacute;rias produ&ccedil;&otilde;es.</p>
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
  let draft = loadDraft();
  let lastPayload = null;
  let currentSimulation = null;
  let autosaveTimer = null;

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

  function saveDraftNow() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function queueAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveDraftNow, 80);
  }

  function materialById(id) {
    return materials.find(material => String(material.id) === String(id));
  }

  function matchingMatrix(material) {
    const codes = new Set((material?.codes || []).map(code => String(code).toLowerCase()));
    return matrix
      .filter(row => row.material_name === material?.name || (row.material_codes || []).some(code => codes.has(String(code).toLowerCase())))
      .sort((left, right) => matrixSecondsPerUnit(left) - matrixSecondsPerUnit(right));
  }

  function hydrateProductionDefaults(production) {
    const material = materialById(production.materialId);
    if (!material) return;
    const models = productionModelsFor(material);
    if (!production.productionModelName && models[0]) production.productionModelName = models[0].name;
    const rows = matchingMatrix(material);
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    if (!production.machineName && machines[0]) production.machineName = machines[0];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(Boolean))];
    if (!production.peopleCount && people[0]) production.peopleCount = String(people[0]);
  }

  async function loadLookups() {
    [materials, matrix] = await Promise.all([api('/materials'), api('/productivity')]);
  }

  function productionPayload() {
    return draft.productions.map(production => {
      hydrateProductionDefaults(production);
      const material = materialById(production.materialId);
      return {
        materialId: Number(production.materialId),
        materialCode: material?.codes?.[0] || '',
        plannedQty: Number(production.plannedQty),
        plannedUnit: material?.primary_unit || 'un',
        machineName: production.machineName,
        peopleCount: Number(production.peopleCount),
        productionModelName: production.productionModelName
      };
    });
  }

  function payload() {
    const firstProduction = draft.productions[0] || {};
    const firstMaterial = materialById(firstProduction.materialId);
    return {
      dateMode: 'start',
      selectedDate: draft.planningStartDate,
      startDate: draft.planningStartDate,
      planningStartDate: draft.planningStartDate,
      planningEndDate: draft.planningEndDate,
      materialId: Number(firstProduction.materialId),
      materialCode: firstMaterial?.codes?.[0] || '',
      plannedQty: Number(firstProduction.plannedQty),
      plannedUnit: firstMaterial?.primary_unit || 'un',
      machineName: firstProduction.machineName,
      peopleCount: Number(firstProduction.peopleCount),
      productionModelName: firstProduction.productionModelName,
      shifts: draft.shifts.map(shift => ({
        label: shift.label,
        hoursPerDay: parsePtBrDecimal(shift.hoursPerDay, 8),
        shiftStartTime: shift.shiftStartTime,
        pauseLabel: shift.pauseLabel,
        pauseHours: parsePtBrDecimal(shift.pauseHours, 0),
        shiftEndTime: shift.shiftEndTime
      })),
      productions: productionPayload(),
      stockOnlyMaterials: draft.stockOnlyMaterials || []
    };
  }

  function validateDraft(form) {
    if (!draft.planningStartDate || !draft.planningEndDate) {
      form.reportValidity();
      return false;
    }
    if (draft.planningEndDate < draft.planningStartDate) {
      form.elements.planningEndDate.setCustomValidity('A data final deve ser maior ou igual a data inicial.');
      form.reportValidity();
      return false;
    }
    form.elements.planningEndDate.setCustomValidity('');
    const invalidProduction = draft.productions.find(production => !materialById(production.materialId) || !(Number(production.plannedQty) > 0));
    if (invalidProduction) {
      toast('Selecione material e quantidade maior que zero em todas as producoes.');
      return false;
    }
    const invalidShift = draft.shifts.find(shift =>
      !(parsePtBrDecimal(shift.hoursPerDay, 0) > 0)
      || !(parsePtBrDecimal(shift.pauseHours, -1) >= 0)
      || !shift.shiftStartTime
      || !shift.shiftEndTime
    );
    if (invalidShift) {
      toast('Revise os horarios e pausas dos turnos.');
      return false;
    }
    return true;
  }

  function materialMatches(material, searchValue) {
    const haystack = [
      material.name,
      ...(material.codes || [])
    ].map(value => String(value || '').toLowerCase());
    return haystack.some(value => value.includes(searchValue));
  }

  function renderShift(shift, index) {
    return `
      <article class="planning-subcard shift-card" data-shift-id="${shift.id}">
        <div class="planning-subcard-header">
          <h3>Turno ${index + 1}</h3>
          ${index > 0 ? '<button class="link-button danger remove-shift" type="button">Excluir turno</button>' : ''}
        </div>
        <div class="grid-form planning-inner-grid">
          <label>Horas/dia<input name="hoursPerDay" type="text" inputmode="decimal" value="${escapeHtml(shift.hoursPerDay)}" /></label>
          <label>Come&ccedil;o do turno<input name="shiftStartTime" type="time" value="${escapeHtml(shift.shiftStartTime)}" required /></label>
          <label>${shift.pauseLabel || 'Horas de pausa'}<input name="pauseHours" type="text" inputmode="decimal" value="${escapeHtml(shift.pauseHours)}" /></label>
          <label>Final do turno<input name="shiftEndTime" type="time" value="${escapeHtml(shift.shiftEndTime)}" required /></label>
        </div>
      </article>
    `;
  }

  function renderProduction(production, index) {
    hydrateProductionDefaults(production);
    const material = materialById(production.materialId);
    const rows = matchingMatrix(material);
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(Boolean))];
    const models = productionModelsFor(material);
    return `
      <article class="planning-subcard production-block" data-production-id="${production.id}">
        <div class="planning-subcard-header">
          <h3>Produ&ccedil;&atilde;o ${index + 1}</h3>
          ${draft.productions.length > 1 ? '<button class="link-button danger remove-production" type="button">Excluir produ&ccedil;&atilde;o</button>' : ''}
        </div>
        <div class="grid-form planning-inner-grid">
          <label>Material
            <div class="material-autocomplete">
              <input name="materialSearch" type="search" autocomplete="off" placeholder="Digite para pesquisar" value="${escapeHtml(production.materialSearch || materialLabel(material))}" required />
              <div class="material-suggestions" hidden></div>
            </div>
            <input name="materialId" type="hidden" value="${escapeHtml(production.materialId)}" />
          </label>
          <div class="readonly-field">
            <span>C&oacute;digo</span>
            <div class="material-codes readonly-chip-list">${chips(material?.codes || [], 'Sem c&oacute;digos')}</div>
          </div>
          <div class="readonly-field">
            <span>Unidade</span>
            <div class="material-unit readonly-chip-list">${chips([material?.primary_unit])}</div>
          </div>
          <label>Modelo de produ&ccedil;&atilde;o
            <select name="productionModelName" ${!material || models.length <= 1 ? 'disabled data-locked="true"' : ''}>
              ${models.length
                ? models.map(model => `<option value="${escapeHtml(model.name)}" ${String(model.name) === String(production.productionModelName) ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('')
                : '<option value="">Sem modelo</option>'}
            </select>
          </label>
          <label>Quantidade<input name="plannedQty" type="number" step="0.001" value="${escapeHtml(production.plannedQty)}" required /></label>
          <label>M&aacute;quina
            <select name="machineName" ${!material || machines.length <= 1 ? 'disabled data-locked="true"' : ''}>
              ${machines.length
                ? machines.map(machine => `<option value="${escapeHtml(machine)}" ${String(machine) === String(production.machineName) ? 'selected' : ''}>${escapeHtml(machine)}</option>`).join('')
                : '<option value="">Selecione um material</option>'}
            </select>
          </label>
          <label>Pessoas
            <select name="peopleCount" ${!material || people.length <= 1 ? 'disabled data-locked="true"' : ''}>
              ${people.length
                ? people.map(value => `<option value="${value}" ${String(value) === String(production.peopleCount) ? 'selected' : ''}>${value}</option>`).join('')
                : '<option value="">Selecione um material</option>'}
            </select>
          </label>
        </div>
      </article>
    `;
  }

  function stockOnlyChecked(productionIndex, materialId) {
    return (draft.stockOnlyMaterials || []).some(item =>
      Number(item.productionIndex) === Number(productionIndex)
      && String(item.materialId) === String(materialId)
    );
  }

  function renderFlowNode(node) {
    const productionIndex = Number(node.productionIndex || 0);
    const canUseStock = Number(node.stockQty || 0) >= Number(node.requiredQty || 0);
    const checked = stockOnlyChecked(productionIndex, node.materialId);
    const stockStatus = checked || Number(node.produceQty || 0) <= 0 ? 'Estoque atende' : 'Precisa produzir';
    return `
      <li>
        <div class="production-flow-node${Number(node.produceQty || 0) > 0 ? ' needs-production' : ' stock-covered'}">
          <div>
            <strong>${escapeHtml(node.materialName)}</strong>
            <span>${escapeHtml(node.materialCode || '')}</span>
          </div>
          <div class="production-flow-metrics">
            <span>Necess&aacute;rio: <strong>${formatPtBrDecimal(node.requiredQty)} ${escapeHtml(node.unit || '')}</strong></span>
            <span>Saldo: <strong>${formatPtBrDecimal(node.stockQty)} ${escapeHtml(node.unit || '')}</strong></span>
            <span>A produzir: <strong>${formatPtBrDecimal(node.produceQty)} ${escapeHtml(node.unit || '')}</strong></span>
            <span>${stockStatus}</span>
          </div>
          <label class="stock-only-toggle">
            <input type="checkbox" data-stock-only data-production-index="${productionIndex}" data-material-id="${node.materialId}" ${checked ? 'checked' : ''} ${canUseStock ? '' : 'disabled'} />
            <span>N&atilde;o produzir este material / usar estoque</span>
          </label>
        </div>
        ${(node.children || []).length ? `<ul>${node.children.map(renderFlowNode).join('')}</ul>` : ''}
      </li>
    `;
  }

  function renderProductionFlows(result) {
    const trees = result.tree?.children?.length && result.tree.materialName === 'Plano de producao'
      ? result.tree.children
      : result.tree ? [result.tree] : [];
    return trees.map((tree, index) => {
      const production = result.summary.productions?.[index];
      const title = production?.title || tree.productionTitle || `Produ&ccedil;&atilde;o ${index + 1}`;
      const quantity = production ? `${formatPtBrDecimal(production.plannedQty)} ${production.plannedUnit || ''}`.trim() : '';
      return `
        <article class="production-flow-card" data-flow-production="${tree.productionIndex ?? index}">
          <div class="planning-subcard-header">
            <h3>${escapeHtml(title)}${quantity ? ` <span>${escapeHtml(quantity)}</span>` : ''}</h3>
          </div>
          <ul class="production-flow-tree">${renderFlowNode(tree)}</ul>
        </article>
      `;
    }).join('');
  }

  function renderSimulation(result, form) {
    currentSimulation = result;
    const resultsTarget = target.querySelector('.planning-results');
    const summaryGrid = target.querySelector('.summary-grid');
    const timelineTarget = target.querySelector('.timeline-target');
    const flowsTarget = target.querySelector('.production-flows-target');
    const firstOperation = result.operations[0];
    const lastOperation = result.operations[result.operations.length - 1];
    const cards = [
      ['C&oacute;digo previsto', result.code],
      ['Plano', result.summary.materialName],
      ['Produ&ccedil;&otilde;es', result.summary.productions?.length || draft.productions.length],
      ['Range informado', `${formatDateOnly(result.summary.planningStartDate || draft.planningStartDate)} at&eacute; ${formatDateOnly(result.summary.planningEndDate || draft.planningEndDate)}`],
      ['Per&iacute;odo estimado', `${formatDateOnly(result.summary.startDate)} ${firstOperation?.startTime || ''} at&eacute; ${formatDateOnly(result.summary.endDate)} ${lastOperation?.endTime || ''}`],
      ['Total de opera&ccedil;&otilde;es', result.operations.length],
      ['Total de dias', result.summary.daysNeeded],
      ['Turnos', draft.shifts.length],
      ['Horas/dia', formatPtBrDecimal(result.summary.hoursPerDay)]
    ];
    summaryGrid.innerHTML = cards.map(([label, value]) => `<article class="metric-card compact"><span>${label}</span><strong>${value}</strong></article>`).join('');
    timelineTarget.innerHTML = '';
    timelineTarget.appendChild(CalendarTimeline(result.days, result.operations, result.summary));
    flowsTarget.innerHTML = renderProductionFlows(result);
    resultsTarget.hidden = false;
    form.elements.save.disabled = false;
  }

  async function renderSimulationTab() {
    await loadLookups();
    target.innerHTML = `
      <div class="panel planning-builder-panel">
        <form class="planning-form">
          <div class="section-heading">
            <h2>Range do planejamento</h2>
            <button class="secondary-button clear-planning" type="button">Limpar planejamento</button>
          </div>
          <div class="grid-form planning-inner-grid">
            <label>Data inicial do planejamento<input name="planningStartDate" type="date" value="${escapeHtml(draft.planningStartDate)}" required /></label>
            <label>Data final do planejamento<input name="planningEndDate" type="date" value="${escapeHtml(draft.planningEndDate)}" required /></label>
          </div>

          <div class="section-heading planning-section-heading">
            <h2>Turnos</h2>
            <button class="secondary-button add-shift" type="button">+ Adicionar turno</button>
          </div>
          <div class="shifts-target">${draft.shifts.map(renderShift).join('')}</div>

          <div class="section-heading planning-section-heading">
            <h2>Produ&ccedil;&otilde;es</h2>
            <button class="secondary-button add-production" type="button">+ Adicionar produ&ccedil;&atilde;o</button>
          </div>
          <div class="productions-target">${draft.productions.map(renderProduction).join('')}</div>

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
        <div class="panel calendar-panel">
          <div class="section-heading">
            <h2>Calend&aacute;rio de produ&ccedil;&atilde;o</h2>
          </div>
          <div class="timeline-target"></div>
        </div>
        <div class="panel production-flows-panel">
          <div class="section-heading">
            <h2>Fluxo produtivo por produ&ccedil;&atilde;o</h2>
          </div>
          <div class="production-flows-target"></div>
        </div>
      </div>
    `;

    const form = target.querySelector('form');
    const shiftsTarget = target.querySelector('.shifts-target');
    const productionsTarget = target.querySelector('.productions-target');
    target.querySelector('.timeline-target').appendChild(CalendarTimeline([]));

    function rerenderBuilder() {
      saveDraftNow();
      renderSimulationTab().catch(toast);
    }

    function updateDraftFromGeneral() {
      draft.planningStartDate = form.elements.planningStartDate.value;
      draft.planningEndDate = form.elements.planningEndDate.value;
      queueAutosave();
    }

    form.elements.planningStartDate.addEventListener('input', updateDraftFromGeneral);
    form.elements.planningEndDate.addEventListener('input', updateDraftFromGeneral);

    shiftsTarget.addEventListener('input', event => {
      const card = event.target.closest('[data-shift-id]');
      if (!card) return;
      const shift = draft.shifts.find(item => item.id === card.dataset.shiftId);
      if (!shift || !event.target.name) return;
      shift[event.target.name] = event.target.value;
      queueAutosave();
    });

    shiftsTarget.addEventListener('click', event => {
      const card = event.target.closest('[data-shift-id]');
      if (!card || !event.target.classList.contains('remove-shift')) return;
      draft.shifts = draft.shifts.filter(shift => shift.id !== card.dataset.shiftId);
      rerenderBuilder();
    });

    productionsTarget.addEventListener('input', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production || !event.target.name) return;
      production[event.target.name] = event.target.value;
      if (event.target.name === 'materialSearch') {
        const searchValue = event.target.value.trim().toLowerCase();
        const material = materials.find(item =>
          materialLabel(item).toLowerCase() === searchValue
          || (item.codes || []).some(code => String(code).toLowerCase() === searchValue)
        );
        production.materialId = material?.id || '';
        production.productionModelName = '';
        production.machineName = '';
        production.peopleCount = '';
        renderMaterialSuggestions(card, production);
        if (material) rerenderBuilder();
      }
      queueAutosave();
    });

    productionsTarget.addEventListener('change', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production || !event.target.name) return;
      production[event.target.name] = event.target.value;
      if (event.target.name === 'machineName') production.peopleCount = '';
      rerenderBuilder();
    });

    function renderMaterialSuggestions(card, production) {
      const suggestionsTarget = card.querySelector('.material-suggestions');
      const searchValue = String(production.materialSearch || '').trim().toLowerCase();
      if (!searchValue) {
        suggestionsTarget.hidden = true;
        suggestionsTarget.innerHTML = '';
        return;
      }
      const matches = materials.filter(material => materialMatches(material, searchValue)).slice(0, 12);
      suggestionsTarget.innerHTML = matches.length
        ? matches.map(material => `
            <button type="button" data-material-id="${material.id}">
              <strong>${escapeHtml(materialLabel(material))}</strong>
              <span>${escapeHtml((material.codes || []).join(' | '))}</span>
            </button>
          `).join('')
        : '<div class="material-suggestion-empty">Nenhum material encontrado.</div>';
      suggestionsTarget.hidden = false;
    }

    productionsTarget.addEventListener('focusin', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card || event.target.name !== 'materialSearch') return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      renderMaterialSuggestions(card, production);
    });

    productionsTarget.addEventListener('focusout', event => {
      if (event.target.name !== 'materialSearch') return;
      const card = event.target.closest('[data-production-id]');
      setTimeout(() => {
        const suggestionsTarget = card?.querySelector('.material-suggestions');
        if (suggestionsTarget) suggestionsTarget.hidden = true;
      }, 120);
    });

    productionsTarget.addEventListener('mousedown', event => {
      const button = event.target.closest('[data-material-id]');
      const card = event.target.closest('[data-production-id]');
      if (!button || !card) return;
      event.preventDefault();
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      const material = materialById(button.dataset.materialId);
      production.materialId = material?.id || '';
      production.materialSearch = materialLabel(material);
      production.productionModelName = '';
      production.machineName = '';
      production.peopleCount = '';
      rerenderBuilder();
    });

    productionsTarget.addEventListener('click', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card || !event.target.classList.contains('remove-production')) return;
      draft.productions = draft.productions.filter(production => production.id !== card.dataset.productionId);
      lastPayload = null;
      currentSimulation = null;
      rerenderBuilder();
    });

    target.querySelector('.add-shift').addEventListener('click', () => {
      const previous = draft.shifts.at(-1);
      draft.shifts.push(defaultShift(draft.shifts.length, previous?.shiftEndTime || '17:00'));
      rerenderBuilder();
    });

    target.querySelector('.add-production').addEventListener('click', () => {
      draft.productions.push(emptyProduction(draft.productions.length));
      rerenderBuilder();
    });

    target.querySelector('.clear-planning').addEventListener('click', () => {
      if (!confirm('Limpar o planejamento atual e apagar o rascunho local?')) return;
      localStorage.removeItem(DRAFT_KEY);
      draft = defaultDraft();
      lastPayload = null;
      currentSimulation = null;
      rerenderBuilder();
    });

    async function simulateCurrent() {
      updateDraftFromGeneral();
      if (!validateDraft(form)) return;
      lastPayload = payload();
      const result = await api('/planning/simulate', { method: 'POST', body: lastPayload });
      renderSimulation(result, form);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await simulateCurrent();
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('change', async event => {
      if (!event.target.matches('[data-stock-only]')) return;
      const materialId = Number(event.target.dataset.materialId);
      const productionIndex = Number(event.target.dataset.productionIndex || 0);
      draft.stockOnlyMaterials = (draft.stockOnlyMaterials || []).filter(item =>
        !(Number(item.productionIndex) === productionIndex && Number(item.materialId) === materialId)
      );
      if (event.target.checked) draft.stockOnlyMaterials.push({ productionIndex, materialId });
      saveDraftNow();
      try {
        await simulateCurrent();
      } catch (error) {
        toast(error);
      }
    });

    form.elements.save.addEventListener('click', async () => {
      try {
        const saved = await api('/planning/plans', { method: 'POST', body: lastPayload || payload() });
        form.elements.save.disabled = true;
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
          <h2>Hist&oacute;rico de Planejamentos</h2>
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
          { label: 'C&oacute;digo do planejamento', key: 'code' },
          { label: 'Material', key: 'material_name' },
          { label: 'Quantidade', render: row => `${row.planned_qty} ${row.planned_unit}` },
          { label: 'Horas/dia', render: row => formatPtBrDecimal(row.hours_per_day), sortValue: row => Number(row.hours_per_day || 0) },
          { label: 'Data de cria&ccedil;&atilde;o', render: row => formatDate(row.created_at), sortValue: row => row.created_at },
          { label: 'In&iacute;cio', render: row => formatDateOnly(row.start_date), sortValue: row => row.start_date },
          { label: 'Fim', render: row => formatDateOnly(row.end_date), sortValue: row => row.end_date },
          { label: 'Status', key: 'status' },
          { label: 'A&ccedil;&otilde;es', render: row => `
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
      await api(`/planning/plans/${id}/cancel`, { method: 'POST', body: { reason: 'Cancelado pelo usuario' } });
      await loadHistory();
    }

    async function viewPlan(id) {
      const detail = await api(`/planning/plans/${id}`);
      const operations = (detail.operations || []).map(operation => ({
        material: operation.materialName,
        quantidade: `${formatPtBrDecimal(operation.produceQty)} ${operation.unit || ''}`,
        maquina: operation.machineName,
        pessoas: operation.peopleCount,
        inicio: `${formatDateOnly(operation.startDate)} ${operation.startTime || ''}`.trim(),
        fim: `${formatDateOnly(operation.endDate)} ${operation.endTime || ''}`.trim()
      }));
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h2>${escapeHtml(detail.plan.code || detail.plan.id)}</h2>
            <button class="link-button close-modal" type="button">Fechar</button>
          </div>
          <pre class="plan-json">${escapeHtml(JSON.stringify({ horasPorDia: formatPtBrDecimal(detail.plan.hours_per_day), operacoes: operations }, null, 2))}</pre>
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
