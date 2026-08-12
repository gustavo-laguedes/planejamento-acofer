import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildManualScheduleAllocationParts } from '../services/manualScheduleDraft.service.js';
import { ensurePlanningAllocationEditorCss } from '../shared/planning-editor/planningAllocationEditorCss.js';
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
    this.parentNode = null;
    this.dataset = {};
    this.listeners = new Map();
    this.selectorMap = new Map();
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.required = false;
    this.name = '';
    this.type = '';
    this.inputMode = '';
    this.autocomplete = '';
    this.elements = {};
  }
  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    this.selectorMap = new Map();
    if (this.className.includes('production-calendar-unified-editor-modal')) this.buildPlanningAllocationEditorTemplate();
  }
  get innerHTML() { return this._innerHTML || ''; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === 'SELECT' && !this.value && child.value) this.value = child.value;
    return child;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'aria-label') this.ariaLabel = String(value);
    if (name === 'type') this.type = String(value);
  }
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
  async dispatch(type, event = {}) {
    const listeners = this.listeners.get(type) || [];
    await Promise.all(listeners.map(listener => listener({ target: this, ...event })));
  }
  click() { return this.dispatch('click'); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const direct = this.selectorMap.get(selector);
    if (direct) return Array.isArray(direct) ? direct : [direct];
    const matches = [];
    const visit = node => {
      if (node.matchesSelector?.(selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  matchesSelector(selector) {
    if (selector === this.tagName.toLowerCase()) return true;
    if (selector.startsWith('.') && this.className.split(/\s+/).includes(selector.slice(1))) return true;
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attr) {
      const [, name, value] = attr;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        return value === undefined ? Object.hasOwn(this.dataset, key) : this.dataset[key] === value;
      }
      if (name === 'aria-label') return value === undefined ? Boolean(this.ariaLabel) : this.ariaLabel === value;
      return value === undefined ? Boolean(this[name]) : String(this[name]) === value;
    }
    const named = /^\[name="([^"]+)"\]$/.exec(selector);
    if (named) return this.name === named[1];
    return false;
  }
  buildPlanningAllocationEditorTemplate() {
    const headerText = new FakeElement('p');
    const close = new FakeElement('button');
    close.className = 'production-calendar-editor-close';
    const identification = new FakeElement('section');
    identification.ariaLabel = 'IdentificaÃ§Ã£o';
    const quantities = new FakeElement('section');
    quantities.ariaLabel = 'Quantidades';
    const lineage = new FakeElement('section');
    lineage.ariaLabel = 'InformaÃ§Ãµes da divisÃ£o';
    const form = new FakeElement('form');
    const date = new FakeElement('input');
    date.name = 'date';
    date.type = 'date';
    const machine = new FakeElement('select');
    machine.name = 'machineId';
    const people = new FakeElement('select');
    people.name = 'peopleCount';
    form.elements = { date, machineId: machine, peopleCount: people };
    const preview = new FakeElement('section');
    preview.className = 'production-calendar-editor-preview';
    ['capacity', 'usage', 'duration', 'start', 'end'].forEach(key => {
      const metric = new FakeElement('strong');
      metric.dataset.editorPreview = key;
      preview.appendChild(metric);
    });
    const splitToggle = new FakeElement('button');
    splitToggle.className = 'production-calendar-editor-split-toggle';
    const distribution = new FakeElement('section');
    distribution.className = 'production-calendar-editor-distribution';
    distribution.hidden = true;
    const parts = new FakeElement('div');
    parts.className = 'production-calendar-editor-parts';
    const splitEqual = new FakeElement('button');
    splitEqual.dataset.splitEqual = '';
    const splitAdd = new FakeElement('button');
    splitAdd.dataset.splitAdd = '';
    const error = new FakeElement('p');
    error.className = 'production-calendar-editor-error';
    const cancel = new FakeElement('button');
    cancel.dataset.editorCancel = '';
    const submit = new FakeElement('button');
    submit.type = 'submit';
    form.selectorMap.set('[type="submit"]', submit);
    [
      date, machine, people, preview, splitToggle, distribution, parts,
      splitEqual, splitAdd, error, cancel, submit
    ].forEach(child => form.appendChild(child));
    [
      headerText, close, identification, quantities, lineage, form
    ].forEach(child => this.appendChild(child));
    this.selectorMap = new Map([
      ['header p', headerText],
      ['[aria-label="Identificação"]', identification],
      ['[aria-label="IdentificaÃ§Ã£o"]', identification],
      ['[aria-label="Quantidades"]', quantities],
      ['[aria-label="Quantidades"]', quantities],
      ['[aria-label="Informações da divisão"]', lineage],
      ['[aria-label="InformaÃ§Ãµes da divisÃ£o"]', lineage],
      ['form', form],
      ['.production-calendar-editor-error', error],
      ['.production-calendar-editor-distribution', distribution],
      ['.production-calendar-editor-parts', parts],
      ['.production-calendar-editor-split-toggle', splitToggle],
      ['.production-calendar-editor-close', close],
      ['[data-editor-cancel]', cancel],
      ['[data-split-add]', splitAdd],
      ['[data-split-equal]', splitEqual]
    ]);
  }
}

function allocation(overrides = {}) {
  return {
    allocationId: 'edit-normal',
    operationId: 'OP-1',
    parentOperationId: 'OP-1',
    productionId: 'P-1',
    productionIndex: 0,
    materialId: 'MAT',
    materialName: 'Material',
    machineId: 'M1',
    machineName: 'M1',
    date: '2026-07-20',
    startTime: '07:00',
    endTime: '08:00',
    quantity: 10,
    unit: 'un',
    durationMinutes: 60,
    peopleCount: 1,
    capacityPercent: 10,
    ...overrides
  };
}

[
  'ProductionCalendar.js',
  'ProductionCalendarGrid.js',
  'ProductionCalendarCard.js',
  'ProductionCalendarDrag.js',
  'ProductionCalendarDetails.js',
  'ProductionCalendarState.js',
  'ProductionCalendarToolbar.js',
  'productionCalendar.validation.js'
].forEach(name => {
  assert.equal(
    existsSync(new URL(`../shared/production-calendar/${name}`, import.meta.url)),
    false,
    `${name} deve permanecer removido fisicamente`
  );
});

const pageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const barrelSource = readFileSync(new URL('../shared/production-calendar/index.js', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../shared/planning-editor/PlanningAllocationEditor.js', import.meta.url), 'utf8');
const editorCssLoaderSource = readFileSync(new URL('../shared/planning-editor/planningAllocationEditorCss.js', import.meta.url), 'utf8');
const planningEditorCss = readFileSync(new URL('../shared/planning-editor/planning-allocation-editor.css', import.meta.url), 'utf8');
const legacyEditorSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarEditor.js', import.meta.url), 'utf8');
const productionCalendarCss = readFileSync(new URL('../shared/production-calendar/production-calendar.css', import.meta.url), 'utf8');
const allocationEditorControllerSource = readFileSync(new URL('../shared/planning-controller/planningAllocationEditorController.js', import.meta.url), 'utf8');

assert.doesNotMatch(pageSource, /shared\/production-calendar\/index\.js/);
assert.doesNotMatch(pageSource, /renderProductionCalendarSnapshot/);
assert.doesNotMatch(pageSource, /\bProductionCalendar\(\{/);
assert.match(pageSource, /onRequestEdit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation\)/);
assert.match(pageSource, /onRequestSplit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation,\s*\{\s*startSplit:\s*true\s*\}\)/);
assert.match(pageSource, /const\s+allocationId\s*=\s*allocation\?\.allocationId\s*\?\?\s*allocation\?\.id/);
assert.match(pageSource, /PlanningAllocationEditor\(\{[\s\S]*onSave:\s*payload\s*=>\s*handleProductionCalendarAllocationSave\(\{\s*\.\.\.payload,\s*productivityRows\s*\}\)/);
assert.match(pageSource, /getDistributionPreview:\s*\(previewAllocation,\s*percents,\s*options\)\s*=>\s*buildManualScheduleAllocationParts\(previewAllocation,\s*percents,\s*options\)/);
assert.match(pageSource, /ensurePlanningAllocationEditorCss\(\)/);
assert.doesNotMatch(barrelSource, /from\s*['"]\.\/ProductionCalendar(?:\.js|Grid\.js|Card\.js|Drag\.js|Details\.js|State\.js|Toolbar\.js)['"]/);
assert.doesNotMatch(barrelSource, /validateProductionCalendarAllocations|productionCalendar\.validation/);
assert.match(barrelSource, /ProductionCalendarEditor/);
assert.match(barrelSource, /ProductionCalendarSplitEditor/);
assert.match(barrelSource, /productionCalendar\.utils\.js/);
assert.match(barrelSource, /productionCalendar\.adapter\.js/);
assert.doesNotMatch(editorCssLoaderSource, /production-calendar\/production-calendar\.css|data-production-calendar-css/);
assert.match(editorCssLoaderSource, /planning-allocation-editor\.css/);
assert.match(editorCssLoaderSource, /data-planning-allocation-editor-css/);
assert.match(legacyEditorSource, /PlanningAllocationEditor/);
assert.match(legacyEditorSource, /buildManualScheduleAllocationParts/);
assert.doesNotMatch(editorSource, /\.\.\/\.\.\/services\//);
assert.doesNotMatch(editorSource, /\.\.\/production-calendar|productionCalendar\.utils|ProductionCalendarCard/);
assert.match(pageSource, /runPlanningAllocationEditorController/);
assert.match(allocationEditorControllerSource, /type:\s*'EDIT_ALLOCATION'/);
assert.match(allocationEditorControllerSource, /type:\s*'SPLIT_ALLOCATION'/);
assert.doesNotMatch(pageSource, /manualDraftDailyMinutes/);
assert.match(pageSource, /dailyMinutes:\s*planningDraftDailyMinutes\(\{ requireConfiguredShifts: true \}\)/);

const previewMachine = { machineId: 'M2' };
assert.equal(resolvePlanningAllocationEditorPreview(
  ({ machine, peopleCount }) => ({ capacityPerDay: machine.machineId === 'M2' ? peopleCount * 30 : 0 }),
  { machine: previewMachine, peopleCount: 2 }
).capacityPerDay, 60);
assert.equal(resolvePlanningAllocationEditorPreview(
  ({ machine, peopleCount }) => ({ capacityPerDay: machine.machineId === 'M2' ? peopleCount * 30 : 0 }),
  { machine: previewMachine, peopleCount: 3 }
).capacityPerDay, 90);
assert.equal(resolvePlanningAllocationEditorPreview(() => null, {}), null);
assert.equal(resolvePlanningAllocationEditorPreview(() => { throw new ReferenceError('missing daily minutes'); }, {}), null);

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

{
  const previousDocument = globalThis.document;
  const body = new FakeElement('body');
  globalThis.document = { createElement: tagName => new FakeElement(tagName), body };
  try {
    const sourceAllocation = allocation({ quantity: 100, capacityPercent: 20, maxDailyCapacity: 500 });
    const originalBytes = JSON.stringify(sourceAllocation);
    const machines = [
      { machineId: 'M1', machineName: 'Maquina 1', peopleCounts: [1, 2] },
      { machineId: 'M2', machineName: 'Maquina 2', peopleCounts: [2, 3] }
    ];
    const previewCalls = [];
    const saves = [];
    let closes = 0;
    const editor = PlanningAllocationEditor({
      allocation: sourceAllocation,
      machines,
      getPreview: values => {
        previewCalls.push(values);
        return {
          capacityPerDay: values.machine?.machineId === 'M2' ? 800 : 500,
          durationMinutes: values.peopleCount * 30,
          startDate: values.date,
          endDate: values.date
        };
      },
      onSave: async payload => {
        saves.push(payload);
        return { accepted: true };
      },
      onClose: () => { closes += 1; }
    });
    assert.equal(body.children.length, 1, 'editor neutro deve abrir em modal para allocation valida');
    assert.equal(editor.element, body.children[0]);
    assert.equal(JSON.stringify(sourceAllocation), originalBytes, 'abrir e renderizar preview nao deve mutar a allocation recebida');
    assert.equal(previewCalls.length > 0, true, 'preview principal deve ser resolvido na abertura sem lancar erro');
    assert.equal(previewCalls.at(-1).allocation, sourceAllocation, 'preview deve receber a allocation original por referencia');
    assert.notEqual(editor.element.querySelector('[data-editor-preview="capacity"]').textContent, '--');

    await editor.element.querySelector('[data-editor-cancel]').dispatch('click');
    assert.equal(body.children.length, 0, 'cancelar deve fechar o editor');
    assert.equal(closes, 1);
    assert.equal(saves.length, 0, 'cancelar nao pode chamar onSave');
    assert.equal(JSON.stringify(sourceAllocation), originalBytes, 'cancelar nao deve mutar a allocation recebida');

    const secondEditor = PlanningAllocationEditor({
      allocation: sourceAllocation,
      machines,
      getPreview: values => {
        previewCalls.push(values);
        return {
          capacityPerDay: values.machine?.machineId === 'M2' ? 800 : 500,
          durationMinutes: values.peopleCount * 30,
          startDate: values.date,
          endDate: values.date
        };
      },
      onSave: async payload => {
        saves.push(payload);
        return { accepted: true };
      },
      onClose: () => { closes += 1; }
    });
    const form = secondEditor.element.querySelector('form');
    form.elements.machineId.value = 'M2';
    await form.elements.machineId.dispatch('change');
    form.elements.peopleCount.value = '3';
    await form.elements.peopleCount.dispatch('input');
    form.elements.date.value = '2026-07-21';
    await form.elements.date.dispatch('input');
    await form.dispatch('submit', { preventDefault() {} });
    assert.equal(saves.length, 1, 'alteracao valida deve chegar ao callback onSave');
    assert.equal(saves[0].mode, 'edit');
    assert.equal(saves[0].allocation, sourceAllocation);
    assert.equal(saves[0].machineId, 'M2');
    assert.equal(saves[0].peopleCount, 3);
    assert.equal(saves[0].date, '2026-07-21');
    assert.equal(body.children.length, 0, 'save aceito deve fechar o editor');
    assert.equal(JSON.stringify(sourceAllocation), originalBytes, 'salvar via callback nao deve mutar a allocation recebida pelo editor');
  } finally {
    globalThis.document = previousDocument;
  }
}

assert.match(editorSource, /<select name="peopleCount" required>/);
assert.match(editorSource, /appendEditableInfo\(quantities,[\s\S]*'quantity'/);
assert.match(editorSource, /appendEditableInfo\(quantities,[\s\S]*'capacityPercent'/);
assert.match(editorSource, /quantity,\s*capacityPercent:\s*currentPercent\(\)/);
assert.match(editorSource, /raw\.replace\(\/\\\.\/g,\s*''\)/);
assert.match(editorSource, /minimumEditableQuantity/);
assert.match(editorSource, /<select name="partPeopleCount" required>/);
assert.doesNotMatch(editorSource, /name="startTime"|name="partStartTime"|type="time"/);
assert.match(editorSource, /data-split-add/);
assert.match(editorSource, /data-split-equal/);
assert.doesNotMatch(editorSource, /productivityLineId|Allocation original|desta allocation|Dividir esta allocation/);
assert.doesNotMatch(editorSource, /\b(simulateCurrent|buildPlan|scheduleOperations|reoptimizePlanningFuture|persistAutomaticBaselineDiscard)\b/);
assert.doesNotMatch(editorSource, /\bfetch\s*\(|\bapi\s*\(|localStorage|sessionStorage/);
const mainPreviewSource = editorSource.slice(editorSource.indexOf('const syncMainPreview'), editorSource.indexOf('let splitValues'));
assert.match(mainPreviewSource, /preview\?\.startDate \|\| dateInput\.value/);
assert.match(mainPreviewSource, /preview\?\.endDate \|\| allocation\?\.endDate \|\| allocation\?\.date/);
assert.doesNotMatch(mainPreviewSource, /preview\?\.startTime|preview\?\.endTime/);
assert.match(planningEditorCss, /\.production-calendar-editor-form\s*\{[^}]*padding:\s*32px 20px 20px;/s);
assert.ok(productionCalendarCss.length > 0, 'production-calendar.css deve permanecer fisicamente presente nesta REF');
[
  'production-calendar-editor-backdrop',
  'production-calendar-editor-modal',
  'production-calendar-unified-editor-modal',
  'production-calendar-editor-scroll',
  'production-calendar-editor-summary',
  'production-calendar-editor-summary-editable',
  'production-calendar-editor-lineage',
  'production-calendar-editor-form',
  'production-calendar-editor-fields',
  'production-calendar-editor-preview',
  'production-calendar-editor-distribution',
  'production-calendar-editor-distribution-header',
  'production-calendar-editor-parts',
  'production-calendar-editor-part',
  'production-calendar-editor-part-result',
  'production-calendar-editor-header',
  'production-calendar-editor-close',
  'production-calendar-editor-error'
].forEach(className => {
  assert.match(planningEditorCss, new RegExp(`\\.${className}\\b`), `${className} deve estar coberta pelo CSS neutro`);
});

{
  const previousDocumentForCss = globalThis.document;
  const links = [];
  globalThis.document = {
    createElement: tagName => ({ tagName: String(tagName).toUpperCase(), dataset: {}, rel: '', href: '' }),
    head: { appendChild: link => { links.push(link); } },
    querySelector: selector => selector === 'link[data-planning-allocation-editor-css="true"]'
      ? links.find(link => link.dataset.planningAllocationEditorCss === 'true') || null
      : null
  };
  try {
    ensurePlanningAllocationEditorCss();
    ensurePlanningAllocationEditorCss();
    assert.equal(links.length, 1, 'loader neutro deve permanecer idempotente');
    assert.equal(links[0].rel, 'stylesheet');
    assert.match(links[0].href, /planning-allocation-editor\.css$/);
    assert.doesNotMatch(links[0].href, /production-calendar\.css/);
    assert.equal(links[0].dataset.planningAllocationEditorCss, 'true');
  } finally {
    globalThis.document = previousDocumentForCss;
  }
}

console.log('productionCalendarEditButton.test.js: ok');
