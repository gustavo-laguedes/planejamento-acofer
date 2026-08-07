import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createProductionCalendarState,
  expandProductionCalendarHorizon,
  setProductionCalendarHorizon,
  showAllProductionCalendarDays
} from '../shared/production-calendar/ProductionCalendarState.js';
import { ProductionCalendarGrid } from '../shared/production-calendar/ProductionCalendarGrid.js';
import { updateProductionCalendarToolbar } from '../shared/production-calendar/ProductionCalendarToolbar.js';
import {
  addProductionCalendarDays,
  extendProductionCalendarDayRange,
  getProductionCalendarProductionLimitDate,
  isProductionCalendarNonWorkingDay
} from '../shared/production-calendar/productionCalendar.utils.js';

const state = createProductionCalendarState();
assert.equal(setProductionCalendarHorizon(state, null, 80), 8, 'horizonte inicial deve cobrir sete dias após a data inicial');
assert.equal(expandProductionCalendarHorizon(state, 7), 15);
assert.equal(expandProductionCalendarHorizon(state, 15), 30);
assert.equal(expandProductionCalendarHorizon(state, 30), 60);
assert.equal(expandProductionCalendarHorizon(state, 30), 90, 'expansão deve criar horizonte além dos dias existentes');
assert.equal(showAllProductionCalendarDays(state, 80), 80, 'data limite deve voltar ao horizonte da produção atual');

let visibleEndDate = '2026-07-21';
visibleEndDate = addProductionCalendarDays(visibleEndDate, 7);
assert.equal(visibleEndDate, '2026-07-28');
visibleEndDate = addProductionCalendarDays(visibleEndDate, 15);
assert.equal(visibleEndDate, '2026-08-12');
visibleEndDate = addProductionCalendarDays(visibleEndDate, 30);
assert.equal(visibleEndDate, '2026-09-11', 'expansão por data deve ser cumulativa');
assert.equal(getProductionCalendarProductionLimitDate([
  { date: '2026-07-21' },
  { date: '2026-07-28' }
]), '2026-07-28', 'limite da produção deve vir das allocations aceitas atuais');

const extendedDays = extendProductionCalendarDayRange([{ date: '2026-09-05' }], '2026-09-08');
assert.deepEqual(extendedDays.map(day => day.date), [
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
  '2026-09-08'
]);
assert.equal(isProductionCalendarNonWorkingDay(extendedDays[2]), true, 'feriado gerado deve manter regra de dia não útil');

const expansionButtons = Array.from({ length: 4 }, () => ({ disabled: null }));
const discardButton = { disabled: null };
const undoButton = { disabled: null };
const redoButton = { disabled: null };
const toolbarStub = {
  dataset: {},
  querySelector(selector) {
    if (selector === '[data-production-calendar-action="discard-all-changes"]') return discardButton;
    if (selector === '[data-production-calendar-action="undo-manual-change"]') return undoButton;
    if (selector === '[data-production-calendar-action="redo-manual-change"]') return redoButton;
    return null;
  },
  querySelectorAll(selector) { return selector === '[data-production-calendar-expand]' ? expansionButtons : []; }
};
updateProductionCalendarToolbar(toolbarStub, { zoom: 'normal', visibleDayCount: 0, totalDayCount: 0 });
assert.ok(expansionButtons.every(button => button.disabled === false), 'sem projeção carregada os botões não devem nascer desabilitados');
assert.equal(discardButton.disabled, true, 'descarte deve ficar desabilitado sem alterações manuais');
assert.equal(undoButton.disabled, true);
assert.equal(redoButton.disabled, true);
updateProductionCalendarToolbar(toolbarStub, { zoom: 'normal', visibleDayCount: 8, totalDayCount: 80 });
assert.ok(expansionButtons.every(button => button.disabled === false));
updateProductionCalendarToolbar(toolbarStub, { zoom: 'normal', visibleDayCount: 80, totalDayCount: 80 });
assert.ok(expansionButtons.every(button => button.disabled === false), 'fim da produção não deve desabilitar expansão');
updateProductionCalendarToolbar(toolbarStub, { zoom: 'normal', hasManualChanges: true });
assert.equal(discardButton.disabled, false, 'descarte deve habilitar ao detectar alterações manuais');
updateProductionCalendarToolbar(toolbarStub, { zoom: 'normal', hasManualChanges: true, canUndoManualChange: true, canRedoManualChange: true });
assert.equal(undoButton.disabled, false);
assert.equal(redoButton.disabled, false);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.style = { setProperty() {} };
    this.classNames = new Set();
    this.classList = { add: value => this.classNames.add(value) };
  }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  addEventListener() {}
  querySelector() { return null; }
  setAttribute(name, value) { this[name] = value; }
}

const previousDocument = globalThis.document;
globalThis.document = { createElement: tagName => new FakeElement(tagName) };
try {
  const days = Array.from({ length: 12 }, (_, index) => ({
    date: `2026-07-${String(16 + index).padStart(2, '0')}`
  }));
  const grid = ProductionCalendarGrid({ days, machines: [], allocations: [], state: {} });
  const descendants = root => root.children.flatMap(child => [child, ...descendants(child)]);
  const headings = descendants(grid).filter(element => element.className === 'production-calendar-day-heading');
  const firstHeading = headings[0];
  assert.equal(headings.filter(element => !element.hidden).length, 8);
  grid.__setProductionCalendarVisibleDayCount(12);
  assert.equal(headings.filter(element => !element.hidden).length, 12);
  assert.equal(headings[0], firstHeading, 'expansão não deve reconstruir elementos já renderizados');
} finally {
  globalThis.document = previousDocument;
}

const toolbarSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarToolbar.js', import.meta.url), 'utf8');
const calendarSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url), 'utf8');
const gridSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarGrid.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../shared/production-calendar/production-calendar.css', import.meta.url), 'utf8');
const planningSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const expansionHandlers = calendarSource.slice(
  calendarSource.indexOf('onExpandHorizon:'),
  calendarSource.indexOf('onClearSelection:')
);

assert.match(toolbarSource, /\[7, 15, 30\]/);
assert.match(toolbarSource, /label: `\+\$\{dayCount\} dias`/);
assert.match(toolbarSource, /Data limite produção/);
assert.match(toolbarSource, /Calend\\u00e1rio em tela cheia/);
assert.match(toolbarSource, /toolbar\.append\(manualActions, zoomControls, horizonControls, selectionPanel\)/);
assert.doesNotMatch(toolbarSource, /visibleDayCount[\s\S]*>=\s*totalDayCount/);
assert.match(gridSource, /__setProductionCalendarVisibleDayCount/);
assert.match(cssSource, /production-calendar-cell\[hidden\]/);
assert.match(expansionHandlers, /visibleEndDate/);
assert.match(expansionHandlers, /onHorizonChange/);
assert.doesNotMatch(expansionHandlers, /simulatePlanning|scheduler|reoptimi|projectPlanningStock|diagnostic/i);
assert.match(planningSource, /openProductionCalendarExclusiveView/);
assert.match(planningSource, /content\.appendChild\(calendar\)/, 'modo exclusivo deve mover a mesma instância do calendário');
assert.doesNotMatch(planningSource, /requestFullscreen|exitFullscreen/);
assert.match(cssSource, /production-calendar-exclusive-page[\s\S]*position:\s*fixed/);

console.log('productionCalendarHorizon.test.js: ok');
