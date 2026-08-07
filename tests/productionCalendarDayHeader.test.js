import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildProductionCalendarDayProductivity,
  buildProductionCalendarDayPresentation,
  fillProductionCalendarDayRange
} from '../shared/production-calendar/productionCalendar.utils.js';
import { ProductionCalendarGrid } from '../shared/production-calendar/ProductionCalendarGrid.js';
import { resolveManualScheduleResourceByDate } from '../services/manualScheduleResourceValidation.service.js';

const shifts = [
  { shiftId: 'morning', label: 'Turno 1', teamAvailable: 6 },
  { shiftId: 'afternoon', label: 'Turno 2', teamAvailable: 3 }
];
const resource = {
  shifts: {
    morning: { peakPeople: 4, availablePeople: 6, overrideUsed: false },
    afternoon: { peakPeople: 2, availablePeople: 3, overrideUsed: false }
  }
};

const saturday = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-18' }, resource, shifts, manualWorkDates: []
});
assert.equal(saturday.isNonWorkingDay, true);
assert.equal(saturday.isManuallyEnabled, false);
assert.equal(saturday.team.peakPeople, 4);
assert.equal(saturday.team.availablePeople, 6);
assert.deepEqual(saturday.team.shifts.map(shift => [shift.label, shift.peakPeople, shift.availablePeople]), [
  ['Turno 1', 4, 6], ['Turno 2', 2, 3]
]);

const released = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-18' }, resource, shifts, manualWorkDates: ['2026-07-18']
});
assert.equal(released.isManuallyEnabled, true);
assert.equal(released.isWorkingDay, true);
assert.equal(released.isNonWorkingDay, false, 'sábado liberado não pode manter hachura de dia não útil');
assert.equal(buildProductionCalendarDayPresentation({ day: { date: '2026-07-20', isWorkingDay: false }, resource, shifts }).isNonWorkingDay, true);
assert.equal(buildProductionCalendarDayPresentation({ day: { date: '2026-07-20' }, resource, shifts }).isNonWorkingDay, false);

const overridden = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' },
  resource: { shifts: { morning: { peakPeople: 4, availablePeople: 5 } } },
  shifts,
  dailyTeamOverrides: { '2026-07-20': { morning: 5 } }
});
assert.equal(overridden.team.availablePeople, 5);
assert.equal(overridden.team.state, 'override');
assert.equal(buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' }, resource: { shifts: { morning: { peakPeople: 6, availablePeople: 6 } } }, shifts
}).team.state, 'attention');
assert.equal(buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' }, resource: { shifts: { morning: { peakPeople: 7, availablePeople: 6 } } }, shifts
}).team.state, 'error');

const allocationResource = resolveManualScheduleResourceByDate({
  allocations: [{
    allocationId: 'eq45', machineId: 'mt200', date: '2026-07-20',
    startTime: '07:00', endTime: '12:00', peopleCount: 2
  }],
  shifts: [{ ...shifts[0], startTime: '07:00', endTime: '15:00' }]
});
const allocationDay = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' },
  resource: allocationResource['2026-07-20'],
  shifts: [{ ...shifts[0], startTime: '07:00', endTime: '15:00' }]
});
assert.equal(allocationDay.team.peakPeople, 2, 'uso da pílula deve ser derivado das allocations sem validação persistida');
assert.equal(allocationDay.team.availablePeople, 6);
const productivity = buildProductionCalendarDayProductivity({
  day: allocationDay,
  allocations: [
    { date: '2026-07-20', peopleCount: 3, capacityPercent: 60 },
    { date: '2026-07-20', peopleCount: 2, capacityPercent: 50 },
    { date: '2026-07-21', peopleCount: 6, capacityPercent: 100 }
  ]
});
assert.deepEqual(productivity, { productivePeople: 2.8, availablePeople: 6, percent: 46.67 });

const filledDays = fillProductionCalendarDayRange([
  { date: '2026-07-17' },
  { date: '2026-07-20' }
]).map(day => buildProductionCalendarDayPresentation({
  day,
  resource,
  shifts,
  manualWorkDates: ['2026-07-18']
}));
assert.deepEqual(filledDays.slice(1, 3).map(day => [day.date, day.isNonWorkingDay, day.isManuallyEnabled]), [
  ['2026-07-18', false, true],
  ['2026-07-19', true, false]
]);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.classNames = new Set();
    this.classList = { add: value => this.classNames.add(value) };
    this.listeners = {};
  }
  append(...items) { items.forEach(item => this.appendChild(item)); }
  appendChild(item) {
    item.parentNode = this;
    this.children.push(item);
    return item;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    if (name === 'class') this.className = String(value);
    else if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = String(value);
    } else this[name] = value;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const matches = [];
    const visit = element => {
      if (element !== this && matchesProductionCalendarSelector(element, selector)) matches.push(element);
      element.children.forEach(child => visit(child));
    };
    visit(this);
    return matches;
  }
}

function matchesProductionCalendarSelector(element, selector) {
  if (selector === '.production-calendar-transport-connectors') {
    return hasClass(element, 'production-calendar-transport-connectors');
  }
  if (selector === '.production-calendar-transport-connector') {
    return hasClass(element, 'production-calendar-transport-connector');
  }
  const allocationCardMatch = /^\.production-calendar-card\[data-allocation-id="([^"]+)"\]$/.exec(selector);
  if (allocationCardMatch) {
    return hasClass(element, 'production-calendar-card')
      && String(element.dataset.allocationId || '') === allocationCardMatch[1];
  }
  if (/^\.[a-z0-9_-]+$/i.test(selector)) {
    return hasClass(element, selector.slice(1));
  }
  throw new Error(`FakeElement querySelector nao suporta o seletor: ${selector}`);
}

function hasClass(element, className) {
  return String(element.className || '').split(/\s+/).includes(className)
    || element.classNames?.has(className);
}
const previousDocument = globalThis.document;
globalThis.document = {
  createElement: tagName => new FakeElement(tagName),
  createElementNS: (_namespace, tagName) => new FakeElement(tagName)
};
try {
  const openedDays = [];
  const grid = ProductionCalendarGrid({
    days: filledDays.map((day, index) => index === 0 ? {
      ...day,
      productivity,
      stockAlert: {
        count: 3,
        criticalCount: 1,
        productionAlertCount: 1,
        belowTargetCount: 1,
        items: [
          { key: 'critical', label: 'Crítico', count: 1 },
          { key: 'production-alert', label: 'Alerta de produção', count: 1 },
          { key: 'below-target', label: 'Abaixo da meta', count: 1 }
        ]
      }
    } : day),
    machines: [],
    allocations: [],
    onOpenDay(day) { openedDays.push(day.date); },
    onToggleManualWorkDate() {}
  });
  const descendants = root => root.children.flatMap(child => [child, ...descendants(child)]);
  assert.equal(grid.querySelector('.production-calendar-transport-connectors'), null);
  assert.equal(grid.querySelectorAll('.production-calendar-transport-connector').length, 0);
  const dayHeadings = descendants(grid).filter(element => element.className === 'production-calendar-day-heading');
  assert.equal(grid.querySelectorAll('.production-calendar-day-heading').length, dayHeadings.length);
  dayHeadings[0].listeners.click({});
  dayHeadings[1].listeners.click({});
  assert.deepEqual(openedDays, ['2026-07-17', '2026-07-18'], 'dias úteis e sábado liberado abrem pelo cabeçalho');
  assert.equal(dayHeadings[1].role, 'button');
  assert.match(dayHeadings[1]['aria-label'], /estoque projetado/i);
  const checkboxes = descendants(grid).filter(element => element.tagName === 'input' && element.type === 'checkbox');
  assert.equal(checkboxes.length, 2, 'sábado e domingo devem renderizar checkbox');
  assert.deepEqual(checkboxes.map(input => input.checked), [true, false]);
  assert.ok(checkboxes.every(input => input['aria-label'] === 'Liberar produção neste dia'));
  const labels = descendants(grid).filter(element => element.className === 'production-calendar-manual-work-toggle');
  let stopped = false;
  labels[0].listeners.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'clique no checkbox não deve propagar para o cabeçalho');
  const teamButtons = descendants(grid).filter(element => String(element.className).includes('production-calendar-team-pill'));
  let teamStopped = false;
  teamButtons[0].listeners.click({ stopPropagation() { teamStopped = true; } });
  assert.equal(teamStopped, true, 'clique na equipe não deve propagar para o cabeçalho');
  const productivityBadges = descendants(grid).filter(element => element.className === 'production-calendar-day-productivity');
  assert.equal(productivityBadges.length, 1);
  assert.equal(productivityBadges[0].textContent, '2,8 / 6\n46,67%');
  const stockAlerts = descendants(grid).filter(element => String(element.className).includes('production-calendar-day-stock-alert is-'));
  assert.equal(stockAlerts.length, 3);
  assert.deepEqual(stockAlerts.map(item => item.textContent), ['▲ 1', '▲ 1', '▲ 1']);
  assert.match(stockAlerts[0].title, /Crítico: 1/);
} finally {
  globalThis.document = previousDocument;
}

const gridSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarGrid.js', import.meta.url), 'utf8');
const calendarSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../shared/production-calendar/production-calendar.css', import.meta.url), 'utf8');
assert.match(gridSource, /Liberar produção neste dia/);
assert.match(gridSource, /const isNonWorkingDay = isProductionCalendarNonWorkingDay\(day\)/);
assert.match(gridSource, /stopPropagation\(\)/);
assert.match(gridSource, /onOpenDay\(day\)/);
assert.match(gridSource, /shift\.label.*shift\.peakPeople.*shift\.availablePeople/);
assert.match(calendarSource, /Bloquear dia de produção/);
assert.match(calendarSource, /Bloquear e recalcular/);
assert.match(calendarSource, /Restaurar padrão/);
assert.match(cssSource, /production-calendar-day-heading[\s\S]*position:\s*relative/);
assert.match(cssSource, /production-calendar-manual-work-toggle[^}]*position:\s*absolute[^}]*right:/);
assert.match(gridSource, /production-calendar-day-productivity/);
assert.match(gridSource, /production-calendar-day-stock-alert/);
assert.match(cssSource, /production-calendar-day-productivity[^}]*line-height:\s*1\.35/);
assert.match(cssSource, /production-calendar-day-stock-alerts[^}]*bottom:\s*3px[^}]*right:\s*5px/);
assert.match(cssSource, /production-calendar-day-stock-alert\.is-production-alert/);
assert.match(cssSource, /production-calendar-day-stock-alert\.is-below-target/);

console.log('productionCalendarDayHeader.test.js: ok');
