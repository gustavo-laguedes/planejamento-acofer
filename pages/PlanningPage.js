import { api } from '../shared/api.js';
import { CalendarTimeline } from '../shared/CalendarTimeline.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';

const DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';
const PRODUCTION_THEMES = [
  { start: '#0f6b7c', end: '#7cc7d4', soft: '#e8f6f8', border: '#48a6b5', text: '#123942', card: '#e8f6f8' },
  { start: '#bd6f22', end: '#f2bf71', soft: '#fff4e4', border: '#de9642', text: '#56320d', card: '#fff4e4' },
  { start: '#2f7d57', end: '#8fd0aa', soft: '#ecf8f1', border: '#63b485', text: '#173d2e', card: '#ecf8f1' },
  { start: '#5269b0', end: '#aebdf0', soft: '#f0f3ff', border: '#7d90d8', text: '#26376f', card: '#f0f3ff' },
  { start: '#9a4f74', end: '#e4a0bf', soft: '#fff0f6', border: '#cf7ca4', text: '#552345', card: '#fff0f6' }
];

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

function generatePlanningCode(productionCount = 1, date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const suffix = Number(productionCount || 0) > 1 ? String(productionCount).padStart(2, '0') : '';
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}${pad(date.getHours())}${pad(date.getMinutes())}PLANO${suffix}`;
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
    shiftEndTime: minutesToTime(shiftEndMinutes),
    teamAvailable: ''
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
    peopleCount: '',
    desiredDate: '',
    transports: []
  };
}

function productionTheme(index = 0) {
  return PRODUCTION_THEMES[index % PRODUCTION_THEMES.length];
}

function productionThemeStyle(index = 0) {
  const theme = productionTheme(index);
  return [
    `--production-start: ${theme.start}`,
    `--production-end: ${theme.end}`,
    `--production-soft: ${theme.soft}`,
    `--production-border: ${theme.border}`,
    `--production-text: ${theme.text}`,
    `--production-card: ${theme.card || theme.soft}`
  ].join('; ');
}

function productionSegmentStyle(productions = []) {
  const items = productions.length ? productions : [{ index: 0 }];
  const step = 100 / items.length;
  const stops = items.map((item, index) => {
    const theme = productionTheme(Number(item.index || 0));
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return `${theme.border} ${start}% ${end}%`;
  }).join(', ');
  return `background: linear-gradient(90deg, ${stops});`;
}

function emptyTransport() {
  return {
    id: `transport-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materialId: '',
    originLocationId: '',
    destinationLocationId: '',
    hours: ''
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
    stockOnlyMaterials: Array.isArray(draft.stockOnlyMaterials) ? draft.stockOnlyMaterials : [],
    operationOverrides: draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {},
    operationSplits: Array.isArray(draft.operationSplits) ? draft.operationSplits : []
  };
  normalized.shifts = normalized.shifts.map((shift, index) => ({
    ...defaultShift(index, shift.shiftStartTime),
    ...shift,
    id: shift.id || `shift-${index}-${Date.now()}`,
    label: `Turno ${index + 1}`,
    pauseLabel: shift.pauseLabel || (index === 0 ? 'Horas de almo&ccedil;o' : 'Horas de janta'),
    teamAvailable: shift.teamAvailable ?? ''
  }));
  normalized.productions = normalized.productions.map((production, index) => ({
    ...emptyProduction(index),
    ...production,
    id: production.id || `production-${index}-${Date.now()}`,
    title: `Produ&ccedil;&atilde;o ${index + 1}`,
    transports: Array.isArray(production.transports)
      ? production.transports.map((transport, transportIndex) => ({
          ...emptyTransport(),
          ...transport,
          id: transport.id || `transport-${index}-${transportIndex}-${Date.now()}`
        }))
      : []
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
  let locations = [];
  let draft = loadDraft();
  let lastPayload = null;
  let currentSimulation = null;
  let hasPendingSimulationChanges = false;
  let autosaveTimer = null;
  let recalculationTimer = null;

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
    [materials, matrix, locations] = await Promise.all([api('/materials'), api('/productivity'), api('/locations')]);
  }

  function productionMaterialOptions(production) {
    const root = materialById(production.materialId);
    if (!root) return [];
    const seen = new Set();
    const result = [];

    function visit(material) {
      if (!material || seen.has(String(material.id))) return;
      seen.add(String(material.id));
      result.push(material);
      const models = productionModelsFor(material);
      const selectedModel = models.find(model =>
        String(model.name) === String(material.id === root.id ? production.productionModelName : '')
      ) || models[0];
      (selectedModel?.inputMaterials || []).forEach(input => visit(materialById(input.materialId || input.id)));
    }

    visit(root);
    return result;
  }

  function locationOptions(selectedId) {
    return locations.map(location => `
      <option value="${location.id}" ${String(location.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(location.name)}</option>
    `).join('');
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
        desiredDate: production.desiredDate || null,
        productionModelName: production.productionModelName,
        transports: (production.transports || []).map(transport => ({
          materialId: Number(transport.materialId),
          originLocationId: Number(transport.originLocationId),
          destinationLocationId: Number(transport.destinationLocationId),
          hours: parsePtBrDecimal(transport.hours, 0)
        })).filter(transport =>
          transport.materialId
          && transport.originLocationId
          && transport.destinationLocationId
          && transport.hours > 0
        )
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
        shiftEndTime: shift.shiftEndTime,
        teamAvailable: Number(shift.teamAvailable || 0)
      })),
      productions: productionPayload(),
      stockOnlyMaterials: draft.stockOnlyMaterials || [],
      operationOverrides: draft.operationOverrides || {},
      operationSplits: draft.operationSplits || [],
      planningCode: draft.planningCode || null
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
    const invalidDesiredDate = draft.productions.find(production =>
      production.desiredDate
      && (production.desiredDate < draft.planningStartDate || production.desiredDate > draft.planningEndDate)
    );
    if (invalidDesiredDate) {
      toast('A data desejada deve ficar dentro do range do planejamento.');
      return false;
    }
    const invalidShift = draft.shifts.find(shift =>
      !(parsePtBrDecimal(shift.hoursPerDay, 0) > 0)
      || !(parsePtBrDecimal(shift.pauseHours, -1) >= 0)
      || !(Number(shift.teamAvailable || 0) >= 0)
      || !shift.shiftStartTime
      || !shift.shiftEndTime
    );
    if (invalidShift) {
      toast('Revise os horarios e pausas dos turnos.');
      return false;
    }
    const invalidTransport = draft.productions.some(production => {
      const activeTransports = (production.transports || []).filter(transport =>
        transport.materialId
        || transport.originLocationId
        || transport.destinationLocationId
        || String(transport.hours || '').trim()
      );
      return activeTransports.some(transport =>
        !materialById(transport.materialId)
        || !locations.some(location => String(location.id) === String(transport.originLocationId))
        || !locations.some(location => String(location.id) === String(transport.destinationLocationId))
        || !(parsePtBrDecimal(transport.hours, 0) > 0)
      );
    });
    if (invalidTransport) {
      toast('Revise material, origem, destino e tempo dos transportes.');
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
          <label>Equipe dispon&iacute;vel<input name="teamAvailable" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(shift.teamAvailable)}" /></label>
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
    const transportMaterials = productionMaterialOptions(production);
    const themeStyle = productionThemeStyle(index);
    const transportRows = (production.transports || []).map((transport, transportIndex) => `
      <article class="transport-row" data-transport-id="${transport.id}">
        <label>Material transportado
          <select name="materialId">
            <option value="">Selecione</option>
            ${transportMaterials.map(item => `<option value="${item.id}" ${String(item.id) === String(transport.materialId) ? 'selected' : ''}>${escapeHtml(materialLabel(item))}</option>`).join('')}
          </select>
        </label>
        <label>Origem
          <select name="originLocationId">
            <option value="">Selecione</option>
            ${locationOptions(transport.originLocationId)}
          </select>
        </label>
        <label>Destino
          <select name="destinationLocationId">
            <option value="">Selecione</option>
            ${locationOptions(transport.destinationLocationId)}
          </select>
        </label>
        <label>Tempo de transporte (horas)
          <input name="hours" type="text" inputmode="decimal" placeholder="4" value="${escapeHtml(transport.hours)}" />
        </label>
        <button class="link-button danger remove-transport" type="button">Remover</button>
      </article>
    `).join('');
    return `
      <article class="planning-subcard production-block" data-production-id="${production.id}" style="${themeStyle}">
        <div class="planning-subcard-header">
          <h3 class="production-title"><span class="production-gradient-key" aria-hidden="true"></span>Produ&ccedil;&atilde;o ${index + 1}</h3>
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
          <label>Data desejada
            <input name="desiredDate" type="date" min="${escapeHtml(draft.planningStartDate)}" max="${escapeHtml(draft.planningEndDate)}" value="${escapeHtml(production.desiredDate)}" />
          </label>
        </div>
        <section class="transport-section">
          <div class="planning-subcard-header">
            <h3>Transportes</h3>
            <button class="secondary-button add-transport" type="button">+ Adicionar transporte</button>
          </div>
          <div class="transport-list">
            ${transportRows || '<div class="empty-state compact">Nenhum transporte cadastrado.</div>'}
          </div>
        </section>
      </article>
    `;
  }

  function stockOnlyChecked(productionIndex, materialId) {
    return (draft.stockOnlyMaterials || []).some(item =>
      Number(item.productionIndex) === Number(productionIndex)
      && String(item.materialId) === String(materialId)
    );
  }

  function consolidatedStockOnlyChecked(productions, materialId) {
    return productions.length > 0 && productions.every(production => stockOnlyChecked(production.index, materialId));
  }

  function flowNodeKey(node) {
    return String(node.materialId ?? node.materialCode ?? node.materialName);
  }

  function mergeFlowNode(targetNode, sourceNode) {
    const productionKey = String(sourceNode.productionKey || `production-${Number(sourceNode.productionIndex || 0)}`);
    if (!targetNode.productionKeys.has(productionKey)) {
      targetNode.requiredQty = Number(targetNode.requiredQty || 0) + Number(sourceNode.requiredQty || 0);
      targetNode.stockUsedQty = Number(targetNode.stockUsedQty || 0) + Number(sourceNode.stockUsedQty || 0);
      targetNode.produceQty = Number(targetNode.produceQty || 0) + Number(sourceNode.produceQty || 0);
    } else {
      targetNode.requiredQty = Math.max(Number(targetNode.requiredQty || 0), Number(sourceNode.requiredQty || 0));
      targetNode.stockUsedQty = Math.max(Number(targetNode.stockUsedQty || 0), Number(sourceNode.stockUsedQty || 0));
      targetNode.produceQty = Math.max(Number(targetNode.produceQty || 0), Number(sourceNode.produceQty || 0));
    }
    targetNode.stockQty = Math.max(Number(targetNode.stockQty || 0), Number(sourceNode.stockQty || 0));
    targetNode.forceStockOnly = targetNode.forceStockOnly || sourceNode.forceStockOnly;
    targetNode.isInitialRawMaterial = targetNode.isInitialRawMaterial || sourceNode.isInitialRawMaterial;
    targetNode.productionKeys.add(productionKey);
    if (!targetNode.productions.some(item => item.key === productionKey)) {
      targetNode.productions.push({
        key: productionKey,
        index: Number(sourceNode.productionIndex || 0),
        title: sourceNode.productionTitle || `Produ&ccedil;&atilde;o ${Number(sourceNode.productionIndex || 0) + 1}`
      });
      targetNode.productions.sort((left, right) => Number(left.index || 0) - Number(right.index || 0));
    }
  }

  function buildFlowGraph(roots) {
    const rootNodes = Array.isArray(roots) ? roots.filter(Boolean) : [roots].filter(Boolean);
    const nodes = new Map();
    const incoming = new Map();
    const outgoing = new Map();

    function ensureNode(node) {
      const key = flowNodeKey(node);
      if (!nodes.has(key)) {
        const productionKey = String(node.productionKey || `production-${Number(node.productionIndex || 0)}`);
        nodes.set(key, {
          ...node,
          flowKey: key,
          flowOrder: nodes.size,
          children: [],
          productionKeys: new Set([productionKey]),
          productions: [{
            key: productionKey,
            index: Number(node.productionIndex || 0),
            title: node.productionTitle || `Produ&ccedil;&atilde;o ${Number(node.productionIndex || 0) + 1}`
          }]
        });
        incoming.set(key, new Set());
        outgoing.set(key, new Set());
      } else {
        mergeFlowNode(nodes.get(key), node);
      }
      return key;
    }

    function visit(node, parentKey = null, stack = []) {
      if (!node) return;
      const key = ensureNode(node);
      if (parentKey && parentKey !== key) {
        incoming.get(parentKey).add(key);
        outgoing.get(key).add(parentKey);
      }
      if (stack.includes(key)) return;
      (node.children || []).forEach(child => visit(child, key, [...stack, key]));
    }

    rootNodes.forEach(root => visit(root));
    const levels = new Map();
    const sourceKeys = [...nodes.keys()].filter(key => !(incoming.get(key)?.size));

    function assignLevel(key, level, stack = []) {
      if (stack.includes(key)) return;
      levels.set(key, Math.max(levels.get(key) ?? 0, level));
      for (const childKey of outgoing.get(key) || []) {
        assignLevel(childKey, level + 1, [...stack, key]);
      }
    }

    sourceKeys.forEach(key => assignLevel(key, 0));
    const columns = [];
    for (const [key, node] of nodes.entries()) {
      const level = levels.get(key) ?? 0;
      if (!columns[level]) columns[level] = [];
      columns[level].push(node);
    }
    columns.forEach(column => column.sort((left, right) => Number(left.flowOrder || 0) - Number(right.flowOrder || 0)));
    const edges = [];
    for (const [from, children] of outgoing.entries()) {
      for (const to of children) edges.push({ from, to });
    }
    const plainColumns = columns.map(column => column.map(node => {
      const { productionKeys, ...plainNode } = node;
      return plainNode;
    }));
    return { columns: plainColumns, edges };
  }

  function clearProductionMaterialDecisions(productionIndex) {
    draft.stockOnlyMaterials = (draft.stockOnlyMaterials || [])
      .filter(item => Number(item.productionIndex) !== Number(productionIndex));
    draft.operationSplits = (draft.operationSplits || [])
      .filter(item => Number(item.productionIndex || 0) !== Number(productionIndex));
  }

  function removeProductionScopedState(removedIndex) {
    if (removedIndex < 0) return;
    const activeMaterialIds = new Set();
    draft.productions.forEach(production => {
      productionMaterialOptions(production).forEach(material => activeMaterialIds.add(String(material.id)));
    });
    const reindex = item => {
      const currentIndex = Number(item.productionIndex || 0);
      return currentIndex > removedIndex ? { ...item, productionIndex: currentIndex - 1 } : item;
    };
    draft.stockOnlyMaterials = (draft.stockOnlyMaterials || [])
      .filter(item => Number(item.productionIndex || 0) !== removedIndex)
      .map(reindex);
    draft.operationSplits = (draft.operationSplits || [])
      .filter(item => Number(item.productionIndex || 0) !== removedIndex)
      .map(reindex);
    draft.operationOverrides = Object.fromEntries(Object.entries(draft.operationOverrides || {})
      .filter(([key]) => !key.startsWith(`${removedIndex}:`))
      .filter(([key]) => key.includes(':') || activeMaterialIds.has(String(key)))
      .map(([key, value]) => {
        const match = key.match(/^(\d+):(.*)$/);
        if (!match || Number(match[1]) <= removedIndex) return [key, value];
        return [`${Number(match[1]) - 1}:${match[2]}`, value];
      }));
    currentSimulation = null;
    lastPayload = null;
    hasPendingSimulationChanges = false;
    clearTimeout(recalculationTimer);
    clearTimeout(autosaveTimer);
  }

  function flowNodeStatus(node, checked, produceQty, stockUsedQty, stockQty, requiredQty) {
    if (node.isInitialRawMaterial) {
      if (stockQty >= requiredQty) return { label: 'Estoque suficiente', className: 'stock-ok' };
      return { label: stockQty > 0 ? 'Estoque insuficiente' : 'Comprar / mat&eacute;ria-prima inicial', className: 'raw-warning' };
    }
    if (checked && produceQty <= 0) return { label: 'Estoque atende', className: 'stock-ok' };
    if (checked && stockUsedQty > 0) return { label: 'Utilizando saldo', className: 'using-stock' };
    if (produceQty > 0) return { label: checked ? 'Precisa produzir' : 'Produ&ccedil;&atilde;o cheia', className: checked ? 'needs-production' : 'full-production' };
    return { label: 'Estoque atende', className: 'stock-ok' };
  }

  function renderFlowNodeCard(node) {
    const productions = Array.isArray(node.productions) && node.productions.length
      ? node.productions
      : [{ index: Number(node.productionIndex || 0), title: node.productionTitle || `Produ&ccedil;&atilde;o ${Number(node.productionIndex || 0) + 1}` }];
    const productionIndex = Number(productions[0]?.index || node.productionIndex || 0);
    const checked = consolidatedStockOnlyChecked(productions, node.materialId);
    const stockQty = Number(node.stockQty || 0);
    const requiredQty = Number(node.requiredQty || 0);
    const produceQty = Number(node.produceQty || 0);
    const stockUsedQty = Number(node.stockUsedQty || 0);
    const status = flowNodeStatus(node, checked, produceQty, stockUsedQty, stockQty, requiredQty);
    const rawMaterialWarning = node.isInitialRawMaterial && stockQty < requiredQty;
    return `
        <div class="production-flow-node${produceQty > 0 ? ' needs-production' : ' stock-covered'}${rawMaterialWarning ? ' raw-material-warning' : ''}" data-flow-node-key="${escapeHtml(node.flowKey || flowNodeKey(node))}" style="${productionThemeStyle(productionIndex)}">
          <div class="production-flow-node-header">
            <div>
              <strong>${escapeHtml(node.materialName)}</strong>
              <span>${escapeHtml(node.materialCode || '')}</span>
            </div>
            <span class="production-flow-status ${status.className}">${status.label}</span>
          </div>
          <div class="production-flow-production-markers" style="${escapeHtml(productionSegmentStyle(productions))}" title="${escapeHtml(productions.map(item => item.title || `Produ&ccedil;&atilde;o ${Number(item.index || 0) + 1}`).join(' | '))}" aria-hidden="true"></div>
          <div class="production-flow-metrics">
            <span>Necess&aacute;rio: <strong>${formatPtBrDecimal(node.requiredQty)} ${escapeHtml(node.unit || '')}</strong></span>
            <span>Saldo: <strong>${formatPtBrDecimal(node.stockQty)} ${escapeHtml(node.unit || '')}</strong></span>
            ${node.isInitialRawMaterial
              ? '<span>Origem: <strong>Compra / base</strong></span>'
              : `<span>A produzir: <strong>${formatPtBrDecimal(node.produceQty)} ${escapeHtml(node.unit || '')}</strong></span>`}
          </div>
          ${node.isInitialRawMaterial ? '' : `<label class="stock-only-toggle">
            <input type="checkbox" data-stock-only data-production-indexes="${escapeHtml(productions.map(production => Number(production.index || 0)).join(','))}" data-material-id="${node.materialId}" ${checked ? 'checked' : ''} />
            <span>Utilizar saldo</span>
          </label>`}
        </div>
    `;
  }

  function renderFlowGraph(trees) {
    const graph = buildFlowGraph(trees);
    return `
      <div class="production-flow-graph" data-flow-graph>
        <svg class="production-flow-svg" aria-hidden="true"></svg>
        ${graph.columns.map((column, index) => `
          <div class="production-flow-column" data-flow-level="${index}">
            ${column.map(renderFlowNodeCard).join('')}
          </div>
        `).join('')}
        <span hidden data-flow-edges>${escapeHtml(JSON.stringify(graph.edges))}</span>
      </div>
    `;
  }

  function drawProductionFlowConnectors() {
    target.querySelectorAll('[data-flow-graph]').forEach(graph => {
      const svg = graph.querySelector('.production-flow-svg');
      const edgeScript = graph.querySelector('[data-flow-edges]');
      if (!svg || !edgeScript) return;
      let edges = [];
      try {
        edges = JSON.parse(edgeScript.textContent || '[]');
      } catch {
        edges = [];
      }
      const nodeMap = new Map([...graph.querySelectorAll('[data-flow-node-key]')]
        .map(node => [node.dataset.flowNodeKey, node]));
      const rect = graph.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
      const paths = edges.map(edge => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return '';
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const startX = fromRect.right - rect.left;
        const startY = fromRect.top - rect.top + (fromRect.height / 2);
        const endX = toRect.left - rect.left;
        const endY = toRect.top - rect.top + (toRect.height / 2);
        const middle = Math.max(28, (endX - startX) / 2);
        return `<path class="production-flow-connector" marker-end="url(#production-flow-arrow)" d="M ${startX} ${startY} C ${startX + middle} ${startY}, ${endX - middle} ${endY}, ${endX} ${endY}" />`;
      }).join('');
      svg.innerHTML = `
        <defs>
          <marker id="production-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path class="production-flow-arrow" d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
        </defs>
        ${paths}
      `;
    });
  }

  function renderProductionFlows(result) {
    const trees = result.tree?.children?.length && result.tree.materialName === 'Plano de producao'
      ? result.tree.children
      : result.tree ? [result.tree] : [];
    const summary = result.summary.productions || [];
    const title = summary.length > 1
      ? summary.map((production, index) => `${production.title || `Produ&ccedil;&atilde;o ${index + 1}`}${production.plannedQty ? ` ${formatPtBrDecimal(production.plannedQty)} ${production.plannedUnit || ''}` : ''}`.trim()).join(' | ')
      : (summary[0]?.title || trees[0]?.productionTitle || 'Fluxo produtivo');
    return `
      <article class="production-flow-card consolidated-flow-card" data-flow-production="consolidated" style="${productionThemeStyle(0)}">
        <div class="planning-subcard-header">
          <h3 class="production-title"><span class="production-gradient-key" aria-hidden="true"></span>${escapeHtml(title)}</h3>
        </div>
        ${renderFlowGraph(trees)}
      </article>
    `;
  }

  function renderSimulation(result, form) {
    currentSimulation = result;
    hasPendingSimulationChanges = false;
    const resultsTarget = target.querySelector('.planning-results');
    const timelineTarget = target.querySelector('.timeline-target');
    const flowsTarget = target.querySelector('.production-flows-target');
    const notice = target.querySelector('.unsimulated-notice');
    target.querySelector('.final-summary-panel').hidden = true;
    timelineTarget.innerHTML = '';
    timelineTarget.appendChild(CalendarTimeline(result.days, result.operations, result.summary));
    flowsTarget.innerHTML = renderProductionFlows(result);
    requestAnimationFrame(drawProductionFlowConnectors);
    if (notice) notice.hidden = true;
    resultsTarget.hidden = false;
    form.elements.save.disabled = false;
  }

  function restoreSimulation(form) {
    if (!currentSimulation) return;
    const wasPending = hasPendingSimulationChanges;
    renderSimulation(currentSimulation, form);
    hasPendingSimulationChanges = wasPending;
    const notice = target.querySelector('.unsimulated-notice');
    if (notice) notice.hidden = !hasPendingSimulationChanges;
  }

  function renderFinalSummary(result, planningCode) {
    const firstOperation = result.operations[0];
    const lastOperation = result.operations[result.operations.length - 1];
    const productions = result.summary.productions || [];
    const transports = draft.productions.reduce((sum, production) => sum + (production.transports || []).length, 0);
    const cards = [
      ['C&oacute;digo previsto', planningCode],
      ['Per&iacute;odo', `${formatDateOnly(result.summary.planningStartDate || draft.planningStartDate)} ate ${formatDateOnly(result.summary.planningEndDate || draft.planningEndDate)}`],
      ['Produ&ccedil;&otilde;es inclu&iacute;das', productions.length || draft.productions.length],
      ['Materiais finais', productions.map(production => production.materialName).join(', ') || result.summary.materialName],
      ['Quantidades', productions.map(production => `${formatPtBrDecimal(production.plannedQty)} ${production.plannedUnit || ''}`.trim()).join(' | ') || `${formatPtBrDecimal(result.summary.plannedQty)} ${result.summary.plannedUnit || ''}`.trim()],
      ['Turnos', draft.shifts.length],
      ['Transportes', transports],
      ['Total de opera&ccedil;&otilde;es', result.operations.length],
      ['In&iacute;cio/fim estimado', `${formatDateOnly(result.summary.startDate)} ${firstOperation?.startTime || ''} ate ${formatDateOnly(result.summary.endDate)} ${lastOperation?.endTime || ''}`]
    ];
    const panel = target.querySelector('.final-summary-panel');
    panel.querySelector('.final-summary-grid').innerHTML = cards.map(([label, value]) => `<article class="metric-card compact"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        <div class="panel calendar-panel">
          <div class="section-heading">
            <h2>Calend&aacute;rio de produ&ccedil;&atilde;o</h2>
          </div>
          <p class="unsimulated-notice" hidden>H&aacute; altera&ccedil;&otilde;es n&atilde;o simuladas. Clique em Simular para atualizar o calend&aacute;rio.</p>
          <div class="timeline-target"></div>
        </div>
        <div class="panel production-flows-panel">
          <div class="section-heading">
            <h2>Fluxo produtivo por produ&ccedil;&atilde;o</h2>
          </div>
          <div class="production-flows-target"></div>
        </div>
        <div class="panel final-summary-panel" hidden>
          <div class="section-heading">
            <h2>Resumo final</h2>
          </div>
          <div class="final-summary-grid summary-grid compact-summary"></div>
          <div class="form-actions">
            <button class="primary-button launch-planning" type="button">Lan&ccedil;ar planejamento</button>
          </div>
        </div>
      </div>
    `;

    const form = target.querySelector('form');
    const shiftsTarget = target.querySelector('.shifts-target');
    const productionsTarget = target.querySelector('.productions-target');
    target.querySelector('.timeline-target').appendChild(CalendarTimeline([]));
    restoreSimulation(form);

    function rerenderBuilder() {
      saveDraftNow();
      renderSimulationTab().catch(toast);
    }

    function rerenderProductionsBuilder() {
      saveDraftNow();
      productionsTarget.innerHTML = draft.productions.map(renderProduction).join('');
    }

    function queueSimulationRefresh() {
      if (!currentSimulation) return;
      if (!draft.productions.every(production => materialById(production.materialId) && Number(production.plannedQty) > 0)) {
        hasPendingSimulationChanges = true;
        const notice = target.querySelector('.unsimulated-notice');
        if (notice) notice.hidden = false;
        return;
      }
      clearTimeout(recalculationTimer);
      recalculationTimer = setTimeout(() => simulateCurrent().catch(toast), 250);
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
      queueSimulationRefresh();
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
      const transportRow = event.target.closest('[data-transport-id]');
      if (transportRow) {
        const transport = (production.transports || []).find(item => item.id === transportRow.dataset.transportId);
        if (!transport) return;
        transport[event.target.name] = event.target.value;
        queueAutosave();
        queueSimulationRefresh();
        return;
      }
      production[event.target.name] = event.target.value;
      if (event.target.name === 'materialSearch') {
        const previousMaterialId = production.materialId;
        const searchValue = event.target.value.trim().toLowerCase();
        const material = materials.find(item =>
          materialLabel(item).toLowerCase() === searchValue
          || (item.codes || []).some(code => String(code).toLowerCase() === searchValue)
        );
        production.materialId = material?.id || '';
        if (String(previousMaterialId || '') !== String(production.materialId || '')) {
          clearProductionMaterialDecisions(draft.productions.indexOf(production));
        }
        production.productionModelName = '';
        production.machineName = '';
        production.peopleCount = '';
        production.transports = [];
        renderMaterialSuggestions(card, production);
        if (material) rerenderBuilder();
      }
      queueAutosave();
      if (event.target.name !== 'materialSearch') queueSimulationRefresh();
    });

    productionsTarget.addEventListener('change', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production || !event.target.name) return;
      const transportRow = event.target.closest('[data-transport-id]');
      if (transportRow) {
        const transport = (production.transports || []).find(item => item.id === transportRow.dataset.transportId);
        if (!transport) return;
        transport[event.target.name] = event.target.value;
        saveDraftNow();
        queueSimulationRefresh();
        return;
      }
      production[event.target.name] = event.target.value;
      if (event.target.name === 'machineName') production.peopleCount = '';
      queueSimulationRefresh();
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
      const previousMaterialId = production.materialId;
      production.materialId = material?.id || '';
      if (String(previousMaterialId || '') !== String(production.materialId || '')) {
        clearProductionMaterialDecisions(draft.productions.indexOf(production));
      }
      production.materialSearch = materialLabel(material);
      production.productionModelName = '';
      production.machineName = '';
      production.peopleCount = '';
      production.transports = [];
      hasPendingSimulationChanges = true;
      rerenderBuilder();
    });

    productionsTarget.addEventListener('click', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production) return;
      if (event.target.classList.contains('add-transport')) {
        production.transports = [...(production.transports || []), emptyTransport()];
        rerenderProductionsBuilder();
        queueSimulationRefresh();
        return;
      }
      if (event.target.classList.contains('remove-transport')) {
        const row = event.target.closest('[data-transport-id]');
        production.transports = (production.transports || []).filter(transport => transport.id !== row?.dataset.transportId);
        rerenderProductionsBuilder();
        queueSimulationRefresh();
        return;
      }
      if (!event.target.classList.contains('remove-production')) return;
      const removedIndex = draft.productions.findIndex(item => item.id === card.dataset.productionId);
      draft.productions = draft.productions.filter(item => item.id !== card.dataset.productionId);
      removeProductionScopedState(removedIndex);
      rerenderBuilder();
    });

    target.querySelector('.add-shift').addEventListener('click', () => {
      const previous = draft.shifts.at(-1);
      draft.shifts.push(defaultShift(draft.shifts.length, previous?.shiftEndTime || '17:00'));
      hasPendingSimulationChanges = true;
      rerenderBuilder();
    });

    target.querySelector('.add-production').addEventListener('click', () => {
      draft.productions.push(emptyProduction(draft.productions.length));
      hasPendingSimulationChanges = true;
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
      if (!validateDraft(form)) return null;
      lastPayload = payload();
      const result = await api('/planning/simulate', { method: 'POST', body: lastPayload });
      renderSimulation(result, form);
      return result;
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
      const productionIndexes = String(event.target.dataset.productionIndexes || event.target.dataset.productionIndex || '0')
        .split(',')
        .map(value => Number(value))
        .filter(value => Number.isFinite(value));
      const indexSet = new Set(productionIndexes);
      draft.stockOnlyMaterials = (draft.stockOnlyMaterials || []).filter(item =>
        !(indexSet.has(Number(item.productionIndex)) && Number(item.materialId) === materialId)
      );
      if (event.target.checked) {
        productionIndexes.forEach(productionIndex => draft.stockOnlyMaterials.push({ productionIndex, materialId }));
      }
      saveDraftNow();
      try {
        await simulateCurrent();
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-date-change', async event => {
      const key = String(event.detail.operationId || event.detail.materialId);
      draft.operationOverrides[key] = {
        ...(draft.operationOverrides[key] || {}),
        startDate: event.detail.startDate,
        startTime: event.detail.startTime
      };
      if (!key.includes(':')) {
        draft.operationOverrides[String(event.detail.materialId)] = {
          ...(draft.operationOverrides[String(event.detail.materialId)] || {}),
          startDate: event.detail.startDate,
          startTime: event.detail.startTime
        };
      }
      saveDraftNow();
      try {
        await simulateCurrent();
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-config-change', async event => {
      const changes = Array.isArray(event.detail.changes) ? event.detail.changes : [event.detail];
      changes.forEach(change => {
        const key = String(change.operationId || change.materialId);
        const override = {
          machineName: change.machineName,
          peopleCount: change.peopleCount,
          productionModelName: change.productionModelName
        };
        draft.operationOverrides[key] = {
          ...(draft.operationOverrides[key] || {}),
          ...override
        };
        if (!String(key).includes(':')) {
          draft.operationOverrides[String(change.materialId)] = {
            ...(draft.operationOverrides[String(change.materialId)] || {}),
            ...override
          };
        }
      });
      saveDraftNow();
      try {
        await simulateCurrent();
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-split-change', async event => {
      const splits = Array.isArray(event.detail.splits) ? event.detail.splits : [event.detail];
      const operationIds = new Set(splits.map(split => String(split.operationId || split.materialId)));
      draft.operationSplits = (draft.operationSplits || []).filter(split => !operationIds.has(String(split.operationId)));
      splits.forEach(split => {
        draft.operationSplits.push({
          operationId: String(split.operationId || split.materialId),
          materialId: split.materialId,
          productionIndex: split.productionIndex,
          parts: split.parts
        });
      });
      saveDraftNow();
      try {
        await simulateCurrent();
      } catch (error) {
        toast(error);
      }
    });

    form.elements.save.addEventListener('click', async () => {
      try {
        const simulation = await simulateCurrent();
        if (!simulation) return;
        draft.planningCode = draft.planningCode || generatePlanningCode(draft.productions.length);
        lastPayload = { ...(lastPayload || payload()), planningCode: draft.planningCode };
        saveDraftNow();
        renderFinalSummary(currentSimulation, draft.planningCode);
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Resumo do planejamento ${draft.planningCode} pronto para lancamento.` }));
      } catch (error) {
        toast(error);
      }
    });

    target.querySelector('.launch-planning').addEventListener('click', async () => {
      try {
        const simulation = await simulateCurrent();
        if (!simulation) return;
        draft.planningCode = draft.planningCode || generatePlanningCode(draft.productions.length);
        lastPayload = { ...(lastPayload || payload()), planningCode: draft.planningCode };
        const saved = await api('/planning/plans', { method: 'POST', body: lastPayload });
        localStorage.removeItem(DRAFT_KEY);
        draft = defaultDraft();
        lastPayload = null;
        currentSimulation = null;
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Planejamento ${saved.plan.code || saved.plan.id} lancado.` }));
        activeTab = 'history';
        sessionStorage.setItem('planejamento_planning_tab', activeTab);
        await render();
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
          { label: 'Per&iacute;odo', render: row => `${formatDateOnly(row.start_date)} ate ${formatDateOnly(row.end_date)}`, sortValue: row => row.start_date },
          { label: 'Produ&ccedil;&otilde;es', render: row => {
            const children = Array.isArray(row.schedule_tree?.children) ? row.schedule_tree.children : [];
            const match = String(row.material_name || '').match(/^(\d+)\s+produ/i);
            return children.length && row.schedule_tree?.materialName === 'Plano de producao' ? children.length : Number(match?.[1] || 1);
          } },
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
