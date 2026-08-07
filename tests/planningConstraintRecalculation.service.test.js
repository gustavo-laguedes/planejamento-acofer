import assert from 'node:assert/strict';
import { rescheduleSavedPlan } from '../services/planning.service.js';

const OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';
const FIXTURE_SAFETY_DAYS = 45;

function operationalToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  assert.ok(match, `data invalida: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatDateOnly({ year, month, day }) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function daysFromCivil(year, month, day) {
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(dayNumber) {
  dayNumber += 719468;
  const era = Math.floor(dayNumber / 146097);
  const dayOfEra = dayNumber - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const yearDay = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * yearDay + 2) / 153);
  const day = yearDay - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  const year = era * 400 + yearOfEra + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

function addCalendarDays(value, offset) {
  const { year, month, day } = parseDateOnly(value);
  return formatDateOnly(civilFromDays(daysFromCivil(year, month, day) + offset));
}

function weekday(value) {
  const { year, month, day } = parseDateOnly(value);
  return ((daysFromCivil(year, month, day) + 4) % 7 + 7) % 7;
}

function nextWeekdayOnOrAfter(value, targetWeekday) {
  let current = value;
  while (weekday(current) !== targetWeekday) {
    current = addCalendarDays(current, 1);
  }
  return current;
}

// A margem deixa toda a fixture no futuro; a sexta preserva os offsets originais: sabado, domingo e segunda.
const date = nextWeekdayOnOrAfter(addCalendarDays(operationalToday(), FIXTURE_SAFETY_DAYS), 5);
const previousDate = addCalendarDays(date, -1);
const saturdayDate = addCalendarDays(date, 1);
const sundayDate = addCalendarDays(date, 2);
const mondayDate = addCalendarDays(date, 3);
const tuesdayDate = addCalendarDays(date, 4);
const planEndDate = addCalendarDays(date, 14);
const shifts = [{
  shiftId: 'shift-1', label: 'Turno 1', hoursPerDay: 8,
  shiftStartTime: '07:00', shiftEndTime: '15:00', teamAvailable: 6
}];
const plan = { id: 'PLAN-55-1', code: 'PLAN-55-1', start_date: date, end_date: planEndDate, hours_per_day: 8, planned_unit: 'kg' };

function operation(peopleCount = 6, quantity = 100) {
  return {
    operationId: 'operation-1', materialId: 'MAT', materialCode: 'MAT', materialName: 'Material',
    machineName: 'M1', peopleCount, requiredQty: quantity, produceQty: quantity, stockQty: 0,
    stockUsedQty: 0, unit: 'kg', productionOrder: 0, productionIndex: 0,
    startDate: date, startTime: '07:00', endDate: date, endTime: '15:00',
    segments: [{ date, startTime: '07:00', endTime: '15:00', minutes: 480 }],
    _planningMeta: { shifts, setupHours: 0, dailyTeamOverrides: {}, manualWorkDates: [] }
  };
}

const matrix = [
  [6, 120], [5, 100], [4, 80], [3, 60], [2, 40], [1, 20]
].map(([people, output]) => ({
  material_code: 'MAT', machine_name: 'M1', people_count: people,
  output_qty: output, output_unit: 'kg', time_seconds: 28800, active: true
})).concat([{
  material_code: 'MAT', machine_name: 'M2', people_count: 4,
  output_qty: 200, output_unit: 'kg', time_seconds: 28800, active: true
}]);

function recalculate(operations, capacity, matrixRows = matrix, manualWorkDates = [], updatePeopleCount = true) {
  return rescheduleSavedPlan(plan, operations, {
    capacityDate: date,
    recalculateFromDate: date,
    ...(updatePeopleCount ? { peopleCount: capacity } : {}),
    capacityOverrides: { 'shift-1': capacity },
    dailyTeamOverrides: { [date]: { 'shift-1': capacity } },
    replaceDailyTeamOverrides: true,
    manualWorkDates
  }, matrixRows);
}

const reducedToFive = recalculate([operation()], 5);
assert.equal(reducedToFive.operations[0].peopleCount, 5);
assert.equal(reducedToFive.operations[0].produceQty, 100);
assert.equal(reducedToFive.operations[0].dailyCapacity.capacityPerDay, 100);
assert.deepEqual(reducedToFive.summary.dailyTeamOverrides, { [date]: { 'shift-1': 5 } });

const earlierOperation = {
  ...operation(2, 20), operationId: 'operation-earlier', materialId: 'PRE', materialCode: 'PRE', materialName: 'Anterior',
  startDate: previousDate, startTime: '07:00', endDate: previousDate, endTime: '09:00',
  segments: [{ date: previousDate, startTime: '07:00', endTime: '09:00', minutes: 120 }],
  productionOrder: -1
};
const withEarlier = recalculate([earlierOperation, operation()], 5, matrix.concat([{
  material_code: 'PRE', machine_name: 'M1', people_count: 2,
  output_qty: 80, output_unit: 'kg', time_seconds: 28800, active: true
}]));
assert.equal(withEarlier.operations.find(item => item.materialId === 'PRE').startDate, previousDate, 'operações anteriores devem ser preservadas');

const reducedToFour = recalculate(reducedToFive.operations, 4);
assert.equal(reducedToFour.operations[0].peopleCount, 4);
assert.equal(reducedToFour.operations[0].machineName, 'M1', 'mesma máquina deve ser preferida quando possuir opção válida');
assert.equal(reducedToFour.operations[0].produceQty, 100, 'quantidade total deve ser preservada');
assert.equal(reducedToFour.operations[0].dailyCapacity.capacityPerDay, 80);
assert.equal(reducedToFour.operations[0].totalMinutes, 600);
assert.deepEqual(reducedToFour.operations[0].segments.map(segment => segment.date), [date, mondayDate]);
assert.ok(reducedToFour.operations[0].segments.every(segment => reducedToFour.operations[0].peopleCount <= 4));
assert.equal(reducedToFour.calendarOperations.reduce((sum, item) => sum + Number(item.produceQty || 0), 0), 100);
assert.ok(reducedToFour.calendarOperations.every(item => item.peopleCount === 4));

const reducedToThree = recalculate(reducedToFour.operations, 3);
assert.equal(reducedToThree.operations[0].peopleCount, 3);
assert.equal(reducedToThree.operations[0].dailyCapacity.capacityPerDay, 60);
assert.equal(reducedToThree.operations[0].totalMinutes, 800);

const onlyFivePeople = matrix.filter(row => row.people_count === 5);
const movedForward = recalculate([operation(5)], 4, onlyFivePeople, [], false);
assert.equal(movedForward.operations[0].peopleCount, 5);
assert.equal(movedForward.operations[0].startDate, mondayDate, 'sem opção compatível, allocation deve seguir para período válido');
assert.equal(movedForward.operations[0].produceQty, 100);

const mondayOperation = {
  ...operation(4),
  startDate: mondayDate, startTime: '07:00', endDate: tuesdayDate, endTime: '09:00',
  segments: [
    { date: mondayDate, startTime: '07:00', endTime: '15:00', minutes: 480 },
    { date: tuesdayDate, startTime: '07:00', endTime: '09:00', minutes: 120 }
  ]
};
const saturdayEnabled = rescheduleSavedPlan(plan, [mondayOperation], {
  capacityDate: saturdayDate,
  recalculateFromDate: saturdayDate,
  dailyTeamOverrides: {},
  replaceDailyTeamOverrides: true,
  manualWorkDates: [saturdayDate]
}, matrix.filter(row => row.people_count === 4));
assert.deepEqual(saturdayEnabled.operations[0].segments.map(segment => segment.date), [saturdayDate, mondayDate]);
assert.ok(saturdayEnabled.calendarOperations.some(item => item.startDate === saturdayDate));

const sundayEnabled = rescheduleSavedPlan(plan, [mondayOperation], {
  capacityDate: sundayDate, recalculateFromDate: sundayDate,
  dailyTeamOverrides: {}, replaceDailyTeamOverrides: true, manualWorkDates: [sundayDate]
}, matrix.filter(row => row.people_count === 4 && row.machine_name === 'M1'));
assert.equal(sundayEnabled.operations[0].segments[0].date, sundayDate);

const impossibleSource = [operation(7)];
const impossibleSnapshot = structuredClone(impossibleSource);
assert.throws(() => recalculate(impossibleSource, 4, [{
  material_code: 'MAT', machine_name: 'M1', people_count: 7,
  output_qty: 140, output_unit: 'kg', time_seconds: 28800, active: true
}], [], false), /Nao foi possivel encaixar/);
assert.deepEqual(impossibleSource, impossibleSnapshot, 'falha deve permitir rollback integral da origem');

console.log('planningConstraintRecalculation.service.test.js: ok');
