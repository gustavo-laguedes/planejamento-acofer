import assert from 'node:assert/strict';
import {
  addPlanningScheduleDays,
  fillPlanningScheduleDayRange,
  formatPlanningScheduleDate,
  getPlanningScheduleProductionLimitDate,
  getPlanningScheduleWeekday,
  isPlanningScheduleDateOnly,
  normalizePlanningScheduleDay,
  parsePlanningScheduleDateOnlyToUtcDate
} from '../shared/planning-schedule/planningScheduleDay.js';
import {
  addProductionCalendarDays,
  fillProductionCalendarDayRange,
  formatProductionCalendarDate,
  getProductionCalendarProductionLimitDate,
  getProductionCalendarWeekday,
  normalizeProductionCalendarDay
} from '../shared/production-calendar/productionCalendar.utils.js';

assert.equal(isPlanningScheduleDateOnly('2026-07-20'), true);
assert.equal(isPlanningScheduleDateOnly('2026-02-30'), false);
assert.equal(isPlanningScheduleDateOnly('2026-7-20'), false);
assert.equal(isPlanningScheduleDateOnly(null), false);
assert.equal(parsePlanningScheduleDateOnlyToUtcDate('2026-07-20')?.toISOString(), '2026-07-20T00:00:00.000Z');
assert.equal(parsePlanningScheduleDateOnlyToUtcDate('2026-02-30'), null);

assert.equal(formatPlanningScheduleDate('2026-07-20'), '20/07/2026');
assert.equal(formatPlanningScheduleDate(''), '');
assert.equal(formatPlanningScheduleDate(null), '');
assert.equal(formatPlanningScheduleDate('2026-02-30'), '2026-02-30');
assert.equal(getPlanningScheduleWeekday('2026-07-20'), 'segunda-feira');
assert.equal(getPlanningScheduleWeekday('invalid'), '');

assert.equal(addPlanningScheduleDays('2026-07-20', 1.9), '2026-07-21');
assert.equal(addPlanningScheduleDays('2026-07-20', -2), '2026-07-18');
assert.equal(addPlanningScheduleDays('invalid', 2), 'invalid');
assert.equal(addPlanningScheduleDays(null, 2), '');
assert.equal(addPlanningScheduleDays('2026-07-20', Number.NaN), '2026-07-20');

assert.equal(getPlanningScheduleProductionLimitDate([
  { date: '2026-07-21' },
  { date: 'invalid' },
  { date: '2026-07-20' }
]), '2026-07-21');
assert.equal(getPlanningScheduleProductionLimitDate(null), null);

const originalDay = { date: '2026-07-20', label: '', weekDay: 'Segunda', workingDay: 1, extra: { keep: true } };
const normalized = normalizePlanningScheduleDay(originalDay);
assert.deepEqual(normalized, {
  date: '2026-07-20',
  label: '2026-07-20',
  weekDay: 'Segunda',
  weekday: 'Segunda',
  workingDay: 1,
  isWorkingDay: true,
  extra: { keep: true }
});
assert.equal(normalized.extra, originalDay.extra);
assert.deepEqual(normalizePlanningScheduleDay(new Date('2026-07-20T15:00:00.000Z')), {
  date: '2026-07-20',
  label: '20/07/2026',
  weekday: 'segunda-feira'
});
assert.deepEqual(normalizePlanningScheduleDay('2026-07-20'), {
  date: '2026-07-20',
  label: '20/07/2026',
  weekday: 'segunda-feira'
});
assert.deepEqual(normalizePlanningScheduleDay(null), { date: '', label: '', weekday: '' });

const dayA = { date: '2026-07-20', label: 'original' };
const dayB = { date: '2026-07-18' };
const filled = fillPlanningScheduleDayRange([
  dayA,
  { date: 'invalid' },
  { date: '2026-07-20', label: 'duplicate' },
  dayB
]);
assert.deepEqual(filled.map(day => day.date), ['2026-07-18', '2026-07-19', '2026-07-20']);
assert.equal(filled[0], dayB);
assert.equal(filled[2], dayA);
assert.deepEqual(filled[1], {
  date: '2026-07-19',
  label: '19/07/2026',
  weekday: 'domingo'
});
assert.throws(() => fillPlanningScheduleDayRange(null), TypeError);

assert.equal(formatProductionCalendarDate('2026-07-20'), formatPlanningScheduleDate('2026-07-20'));
assert.equal(getProductionCalendarWeekday('2026-07-20'), getPlanningScheduleWeekday('2026-07-20'));
assert.equal(addProductionCalendarDays('2026-07-20', 2), addPlanningScheduleDays('2026-07-20', 2));
assert.equal(getProductionCalendarProductionLimitDate([{ date: '2026-07-20' }]), getPlanningScheduleProductionLimitDate([{ date: '2026-07-20' }]));
assert.deepEqual(normalizeProductionCalendarDay({ date: '2026-07-20' }), normalizePlanningScheduleDay({ date: '2026-07-20' }));
assert.deepEqual(fillProductionCalendarDayRange([{ date: '2026-07-20' }]), fillPlanningScheduleDayRange([{ date: '2026-07-20' }]));

console.log('planningScheduleDay.test.js ok');
