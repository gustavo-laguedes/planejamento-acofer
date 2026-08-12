import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ProductionCalendarCard } from '../shared/production-calendar/ProductionCalendarCard.js';
import { buildManualScheduleAllocationParts } from '../services/manualScheduleDraft.service.js';
import {
  addPlanningAllocationSplitPart,
  equalPlanningAllocationSplitPercents,
  PlanningAllocationEditor,
  resolvePlanningAllocationDistribution,
  resolvePlanningAllocationEditorPreview
} from '../shared/planning-editor/PlanningAllocationEditor.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.className = '';
    this.textContent = '';
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this._innerHTML = '';
    this.selectorMap = new Map();
  }
  set innerHTML(value) {
    this._innerHTML = value;
    if (this.className !== 'production-calendar-editor-modal') return;
    const form = new FakeElement('form');
    const machineSelect = new FakeElement('select');
    const peopleInput = new FakeElement('input');
    form.elements = { machineId: machineSelect, peopleCount: peopleInput };
    const submit = new FakeElement('button');
    const headerText = new FakeElement('p');
    const limit = new FakeElement('small');
    const error = new FakeElement('p');
    const capacity = new FakeElement('strong');
    const start = new FakeElement('strong');
    const end = new FakeElement('strong');
    const close = new FakeElement('button');
    const cancel = new FakeElement('button');
    form.selectorMap.set('[type="submit"]', submit);
    [machineSelect, peopleInput, submit].forEach(child => form.appendChild(child));
    this.selectorMap = new Map([
      ['form', form], ['header p', headerText],
      ['.production-calendar-editor-limit', limit], ['.production-calendar-editor-error', error],
      ['[data-editor-preview="capacity"]', capacity], ['[data-editor-preview="start"]', start],
      ['[data-editor-preview="end"]', end], ['.production-calendar-editor-close', close],
      ['[data-editor-cancel]', cancel]
    ]);
    [form, headerText, limit, error, capacity, start, end, close, cancel].forEach(child => this.appendChild(child));
  }
  get innerHTML() { return this._innerHTML; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute() {}
  querySelector(selector) { return this.selectorMap.get(selector) || null; }
  focus() {}
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, event = {}) {
    (this.listeners.get(type) || []).forEach(listener => listener(event));
  }
  async dispatchAsync(type, event = {}) {
    await Promise.all((this.listeners.get(type) || []).map(listener => listener(event)));
  }
  contains(target) {
    return target === this || this.children.some(child => child.contains?.(target));
  }
  closest(selector) {
    if (selector.includes('button') && this.tagName === 'BUTTON') return this;
    if (selector.includes('.production-calendar-card-edit') && this.className === 'production-calendar-card-edit') return this;
    return this.parentNode?.closest?.(selector) || null;
  }
}

function allocation(overrides = {}) {
  return {
    allocationId: 'edit-normal', operationId: 'OP-1', parentOperationId: 'OP-1',
    productionId: 'P-1', productionIndex: 0, materialId: 'MAT', materialName: 'Material',
    machineId: 'M1', machineName: 'M1', date: '2026-07-20', startTime: '07:00', endTime: '08:00',
    quantity: 10, unit: 'un', durationMinutes: 60, peopleCount: 1, capacityPercent: 10,
    ...overrides
  };
}

function exerciseEditButton(sourceAllocation, { reparent = false } = {}) {
  let edited = null;
  let detailsOpened = 0;
  let selected = 0;
  let dragStarted = 0;
  const card = ProductionCalendarCard({
    allocation: sourceAllocation,
    onEdit: value => { edited = value; },
    onOpenDetails: () => { detailsOpened += 1; },
    onToggleSelection: () => { selected += 1; },
    onStartDrag: () => { dragStarted += 1; }
  });
  if (reparent) new FakeElement('section').appendChild(card);
  const button = card.children.find(child => child.className === 'production-calendar-card-edit');
  assert.ok(button, 'card editável deve criar o botão de edição');
  const event = {
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  button.dispatch('click', event);
  card.dispatch('click', {
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  });
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(edited, sourceAllocation, 'callback deve receber a mesma referência da allocation do card');
  assert.equal(detailsOpened, 0, 'botão não pode abrir os detalhes gerais do card');
  assert.equal(selected, 0, 'botão não pode selecionar o card');
  assert.equal(dragStarted, 0, 'click do botão não pode iniciar drag');
}

const previousDocument = globalThis.document;
globalThis.document = { createElement: tagName => new FakeElement(tagName) };
try {
  exerciseEditButton(allocation());
  exerciseEditButton(allocation({
    allocationId: 'edit-shared',
    productionMemberships: [
      { productionId: 'P-1', productionIndex: 0, productionStage: 1 },
      { productionId: 'P-2', productionIndex: 1, productionStage: 1 }
    ]
  }));
  exerciseEditButton(allocation({ allocationId: 'edit-fullscreen' }), { reparent: true });
} finally {
  globalThis.document = previousDocument;
}

const cardSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarCard.js', import.meta.url), 'utf8');
const gridSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarGrid.js', import.meta.url), 'utf8');
const calendarSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url), 'utf8');
const dragSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarDrag.js', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../shared/planning-editor/PlanningAllocationEditor.js', import.meta.url), 'utf8');
const editorCssLoaderSource = readFileSync(new URL('../shared/planning-editor/planningAllocationEditorCss.js', import.meta.url), 'utf8');
const legacyEditorSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarEditor.js', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('../shared/production-calendar/production-calendar.css', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');

assert.match(cardSource, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*onEdit\(allocation, editButton\)/);
assert.doesNotMatch(cardSource, /production-calendar-card-split|onSplit/);
assert.match(gridSource, /onEdit:\s*onEditAllocation/);
assert.match(calendarSource, /onEditAllocation:\s*permissions\.canEditAllocations\s*\?\s*onEditAllocation/);
assert.match(dragSource, /\.production-calendar-card-selector, button, input, select, textarea/);
assert.match(dragSource, /if \(isInteractivePointerTarget\(event\.target, card\)\) return false/);
assert.match(editorSource, /\[data-editor-cancel\][\s\S]*addEventListener\('click', close\)/);
assert.doesNotMatch(pageSource, /shared\/production-calendar\/index\.js/);
assert.doesNotMatch(pageSource, /renderProductionCalendarSnapshot/);
assert.doesNotMatch(pageSource, /\bProductionCalendar\(\{/);
assert.doesNotMatch(pageSource, /onEditAllocation:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation\)/);
assert.match(pageSource, /onRequestEdit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation\)/);
assert.match(pageSource, /onRequestSplit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation,\s*\{\s*startSplit:\s*true\s*\}\)/);
assert.match(pageSource, /const\s+allocationId\s*=\s*allocation\?\.allocationId\s*\?\?\s*allocation\?\.id/);
assert.match(pageSource, /PlanningAllocationEditor\(\{[\s\S]*onSave:\s*payload\s*=>\s*handleProductionCalendarAllocationSave\(\{\s*\.\.\.payload,\s*productivityRows\s*\}\)/);
assert.match(pageSource, /getDistributionPreview:\s*\(previewAllocation,\s*percents,\s*options\)\s*=>\s*buildManualScheduleAllocationParts\(previewAllocation,\s*percents,\s*options\)/);
assert.match(pageSource, /ensurePlanningAllocationEditorCss\(\)/);
assert.match(editorCssLoaderSource, /production-calendar\/production-calendar\.css/);
assert.match(editorCssLoaderSource, /data-production-calendar-css/);
assert.match(legacyEditorSource, /PlanningAllocationEditor/);
assert.match(legacyEditorSource, /buildManualScheduleAllocationParts/);
assert.doesNotMatch(editorSource, /\.\.\/\.\.\/services\//);
assert.doesNotMatch(editorSource, /\.\.\/production-calendar|productionCalendar\.utils|ProductionCalendarCard/);
assert.match(pageSource, /runPlanningAllocationEditorController/);
const allocationEditorControllerSource = readFileSync(new URL('../shared/planning-controller/planningAllocationEditorController.js', import.meta.url), 'utf8');
assert.match(allocationEditorControllerSource, /type:\s*'EDIT_ALLOCATION'/);
assert.match(allocationEditorControllerSource, /type:\s*'SPLIT_ALLOCATION'/);
assert.doesNotMatch(pageSource, /manualDraftDailyMinutes/);
assert.match(pageSource, /dailyMinutes:\s*planningDraftDailyMinutes\(\{ requireConfiguredShifts: true \}\)/);

const previewMachine = { machineId: 'M2' };
const currentPreview = resolvePlanningAllocationEditorPreview(
  ({ machine, peopleCount }) => ({ capacityPerDay: machine.machineId === 'M2' ? peopleCount * 30 : 0 }),
  { machine: previewMachine, peopleCount: 2 }
);
const changedPeoplePreview = resolvePlanningAllocationEditorPreview(
  ({ machine, peopleCount }) => ({ capacityPerDay: machine.machineId === 'M2' ? peopleCount * 30 : 0 }),
  { machine: previewMachine, peopleCount: 3 }
);
assert.equal(currentPreview.capacityPerDay, 60);
assert.equal(changedPeoplePreview.capacityPerDay, 90);
assert.equal(resolvePlanningAllocationEditorPreview(() => null, {}), null);
assert.equal(
  resolvePlanningAllocationEditorPreview(() => { throw new ReferenceError('missing daily minutes'); }, {}),
  null,
  'falha na prévia não pode impedir a abertura do editor'
);

assert.deepEqual(equalPlanningAllocationSplitPercents(3), [33.33, 33.33, 33.34]);
assert.deepEqual(addPlanningAllocationSplitPart([50, 50]), [50, 25, 25]);
assert.deepEqual(addPlanningAllocationSplitPart([50, 25, 25]), [50, 25, 12.5, 12.5]);
const distribution = resolvePlanningAllocationDistribution(
  (sourceAllocation, percents, options) => buildManualScheduleAllocationParts(sourceAllocation, percents, options),
  allocation({ quantity: 10, capacityPercent: 60.5 }),
  ['50,00', '50,00'],
  { splitGroupId: 'ui-preview' }
);
assert.equal(distribution.valid, true);
assert.deepEqual(distribution.parts.map(part => part.capacityPercent), [30.25, 30.25]);
assert.deepEqual(distribution.parts.map(part => part.quantity), [5, 5]);
assert.equal(resolvePlanningAllocationDistribution(
  (sourceAllocation, percents, options) => buildManualScheduleAllocationParts(sourceAllocation, percents, options),
  allocation(),
  ['40', '40']
).valid, false);
assert.match(editorSource, /Participação no pai/);
assert.match(editorSource, /Participação na produção original/);
assert.match(editorSource, /Capacidade utilizada desta parte/);
assert.match(editorSource, /<select name="peopleCount" required>/);
assert.match(editorSource, /appendEditableInfo\(quantities,[\s\S]*'quantity'/);
assert.match(editorSource, /appendEditableInfo\(quantities,[\s\S]*'capacityPercent'/);
assert.match(editorSource, /quantity,\s*capacityPercent:\s*currentPercent\(\)/);
assert.match(editorSource, /raw\.replace\(\/\\\.\/g,\s*''\)/);
assert.match(editorSource, /minimumEditableQuantity/);
assert.match(editorSource, /capacidade utilizada não pode ser menor|capacidade utilizada não pode ser menor/i);
assert.match(editorSource, /<select name="partPeopleCount" required>/);
assert.doesNotMatch(editorSource, /name="startTime"|name="partStartTime"|type="time"|Horário inicial|<span>Início<\/span>/);
assert.match(editorSource, /data-split-add/);
assert.match(editorSource, /data-split-equal/);
assert.match(editorSource, /Quantidade da produção/);
assert.match(editorSource, /Produção original/);
assert.match(editorSource, /Dividir esta produção/);
assert.doesNotMatch(editorSource, /Informações técnicas|productivityLineId|Allocation original|desta allocation|Dividir esta allocation/);
const mainPreviewSource = editorSource.slice(editorSource.indexOf('const syncMainPreview'), editorSource.indexOf('let splitValues'));
assert.match(mainPreviewSource, /preview\?\.startDate \|\| dateInput\.value/);
assert.match(mainPreviewSource, /preview\?\.endDate \|\| allocation\?\.endDate \|\| allocation\?\.date/);
assert.doesNotMatch(mainPreviewSource, /preview\?\.startTime|preview\?\.endTime/);
assert.match(editorCss, /\.production-calendar-editor-form\s*\{[^}]*padding:\s*32px 20px 20px;/s);

console.log('productionCalendarEditButton.test.js: ok');
