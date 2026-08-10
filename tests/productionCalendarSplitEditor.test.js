import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildManualScheduleAllocationSplit } from '../services/manualScheduleDraft.service.js';
import {
  PlanningAllocationSplitEditor,
  resolvePlanningAllocationSplitPreview
} from '../shared/planning-editor/PlanningAllocationSplitEditor.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.selectorMap = new Map();
  }
  set innerHTML(value) {
    this._innerHTML = value;
    if (!this.className.includes('production-calendar-split-editor-modal')) return;
    const form = new FakeElement('form');
    const input = new FakeElement('input');
    const submit = new FakeElement('button');
    const current = new FakeElement('section');
    const preview = new FakeElement('section');
    const headerText = new FakeElement('p');
    const error = new FakeElement('p');
    const close = new FakeElement('button');
    const cancel = new FakeElement('button');
    form.elements = { firstPercent: input };
    form.selectorMap.set('[type="submit"]', submit);
    this.selectorMap = new Map([
      ['form', form], ['header p', headerText],
      ['[aria-label="Configuração atual"]', current], ['[aria-label="Prévia da divisão"]', preview],
      ['.production-calendar-editor-error', error], ['.production-calendar-editor-close', close],
      ['[data-split-cancel]', cancel]
    ]);
    [form, current, preview, headerText, error, close, cancel].forEach(child => this.appendChild(child));
  }
  get innerHTML() { return this._innerHTML; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute() {}
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
  dispatch(type, event = {}) { (this.listeners.get(type) || []).forEach(listener => listener(event)); }
  querySelector(selector) {
    if (this.selectorMap.has(selector)) return this.selectorMap.get(selector);
    if (selector === 'strong' && this.tagName === 'STRONG') return this;
    const splitMatch = /^\[data-split-preview="(.+)"\]$/.exec(selector);
    if (splitMatch && this.dataset.splitPreview === splitMatch[1]) return this;
    for (const child of this.children) {
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
}

const allocation = {
  allocationId: 'allocation-modal', operationId: 'operation-modal', parentOperationId: 'operation-modal', productionId: 'production-modal',
  materialId: 'material-modal', materialName: 'Material modal', machineId: 'machine-1', machineName: 'Máquina 1',
  date: '2026-07-20', startTime: '07:00', endTime: '15:00', quantity: 800, unit: 'un', durationMinutes: 480,
  capacityPercent: 80, maxDailyCapacity: 1000, peopleCount: 2,
  components: [{ allocationId: 'allocation-modal', parentOperationId: 'operation-modal', productionId: 'production-modal', quantity: 800 }]
};

const splitPreview = (sourceAllocation, firstPercent, options) => buildManualScheduleAllocationSplit(sourceAllocation, firstPercent, options);
assert.equal(resolvePlanningAllocationSplitPreview(splitPreview, allocation, '30,00', { splitGroupId: 'preview' }).second.capacityPercent, 56);
assert.equal(resolvePlanningAllocationSplitPreview(splitPreview, allocation, '30,00', { splitGroupId: 'preview' }).second.splitRatioPercent, 70);
assert.equal(resolvePlanningAllocationSplitPreview(splitPreview, allocation, 'texto').valid, false);

const splitEditorSource = readFileSync(new URL('../shared/planning-editor/PlanningAllocationSplitEditor.js', import.meta.url), 'utf8');
const legacySplitEditorSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarSplitEditor.js', import.meta.url), 'utf8');
assert.doesNotMatch(splitEditorSource, /\.\.\/\.\.\/services\//);
assert.doesNotMatch(splitEditorSource, /\.\.\/production-calendar|productionCalendar\.utils/);
assert.match(legacySplitEditorSource, /PlanningAllocationSplitEditor/);
assert.match(legacySplitEditorSource, /buildManualScheduleAllocationSplit/);

const previousDocument = globalThis.document;
const body = new FakeElement('body');
globalThis.document = { createElement: tagName => new FakeElement(tagName), body };
try {
  let saves = 0;
  const bytes = JSON.stringify(allocation);
  const editor = PlanningAllocationSplitEditor({ allocation, getSplitPreview: splitPreview, onSave: () => { saves += 1; } });
  const modal = editor.element.children[0];
  assert.equal(modal.querySelector('[data-split-preview="secondPercent"]').textContent, '50%');
  modal.querySelector('[data-split-cancel]').dispatch('click');
  assert.equal(body.children.length, 0);
  assert.equal(saves, 0);
  assert.equal(JSON.stringify(allocation), bytes);
} finally {
  globalThis.document = previousDocument;
}

console.log('productionCalendarSplitEditor.test.js: ok');
