import assert from 'node:assert/strict';
import {
  addCalendarMonths,
  dateOnlyFromDate,
  isValidDateOnly,
  isWeekendDate,
  parseDateOnly
} from '../shared/planning-date/planningCivilDate.js';

function localDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertCurrentLocalDate(value) {
  const before = localDateOnly(new Date());
  const result = dateOnlyFromDate(value);
  const after = localDateOnly(new Date());
  assert.ok([before, after].includes(result));
}

assert.equal(dateOnlyFromDate(new Date(2026, 6, 15)), '2026-07-15');
assert.equal(dateOnlyFromDate(new Date(2026, 6, 1)), '2026-07-01');
assert.equal(dateOnlyFromDate(new Date(2026, 6, 31)), '2026-07-31');
assert.equal(dateOnlyFromDate(new Date(2026, 0, 1)), '2026-01-01');
assert.equal(dateOnlyFromDate(new Date(2026, 11, 31)), '2026-12-31');
assert.equal(dateOnlyFromDate(new Date(2028, 1, 29)), '2028-02-29');
assert.equal(dateOnlyFromDate(new Date(2026, 6, 15, 23, 59)), '2026-07-15');
assert.equal(dateOnlyFromDate(new Date(2026, 6, 15, 0, 1)), '2026-07-15');
assertCurrentLocalDate(new Date('invalid'));
assertCurrentLocalDate(null);
assertCurrentLocalDate(undefined);

assert.equal(dateOnlyFromDate(parseDateOnly('2026-07-15')), '2026-07-15');
assert.equal(dateOnlyFromDate(parseDateOnly('2026-07-01')), '2026-07-01');
assert.equal(dateOnlyFromDate(parseDateOnly('2026-07-31')), '2026-07-31');
assert.equal(dateOnlyFromDate(parseDateOnly('2028-02-29')), '2028-02-29');
assert.equal(dateOnlyFromDate(parseDateOnly('2026-02-31')), '2026-03-03');
assert.ok(parseDateOnly('') instanceof Date);
assert.ok(Number.isFinite(parseDateOnly('').getTime()));
assert.ok(Number.isFinite(parseDateOnly(null).getTime()));
assert.ok(Number.isFinite(parseDateOnly(undefined).getTime()));
assert.ok(Number.isFinite(parseDateOnly('fora-do-formato').getTime()));
assert.equal(dateOnlyFromDate(parseDateOnly('2026-13-01')), '2027-01-01');

assert.equal(isValidDateOnly('2026-07-15'), true);
assert.equal(isValidDateOnly('2026-01-01'), true);
assert.equal(isValidDateOnly('2026-12-31'), true);
assert.equal(isValidDateOnly('2024-02-29'), true);
assert.equal(isValidDateOnly('2026-02-28'), true);
assert.equal(isValidDateOnly('2026-02-29'), false);
assert.equal(isValidDateOnly('2026-02-31'), false);
assert.equal(isValidDateOnly('2026-13-01'), false);
assert.equal(isValidDateOnly('2026-00-01'), false);
assert.equal(isValidDateOnly(''), false);
assert.equal(isValidDateOnly(' '), false);
assert.equal(isValidDateOnly(null), false);
assert.equal(isValidDateOnly(undefined), false);
assert.equal(isValidDateOnly('fora-do-formato'), false);
assert.equal(isValidDateOnly('01/01/2026'), false);
assert.equal(isValidDateOnly('2026-01-01T12:34:56.000Z'), true);
assert.equal(isValidDateOnly(20260101), false);
assert.equal(isValidDateOnly(new Date(2026, 0, 1)), false);
assert.equal(isValidDateOnly(true), false);
assert.equal(isValidDateOnly({ toString() { return '2026-01-01'; } }), true);

assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 6, 15), 1)), '2026-08-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 6, 15), -1)), '2026-06-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 6, 15), 0)), '2026-07-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 0, 1), 1)), '2026-02-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 11, 1), 1)), '2027-01-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 0, 31), 1)), '2026-02-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 2, 31), -1)), '2026-02-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2028, 1, 29), 1)), '2028-03-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 0, 15), 14)), '2027-03-01');
assert.equal(dateOnlyFromDate(addCalendarMonths(new Date(2026, 0, 15), -14)), '2024-11-01');
const sourceDate = new Date(2026, 0, 31);
addCalendarMonths(sourceDate, 1);
assert.equal(dateOnlyFromDate(sourceDate), '2026-01-31');
assert.ok(Number.isNaN(addCalendarMonths(new Date('invalid'), 1).getTime()));
assert.throws(() => addCalendarMonths(null, 1), TypeError);

assert.equal(isWeekendDate(parseDateOnly('2026-07-13')), false);
assert.equal(isWeekendDate(parseDateOnly('2026-07-17')), false);
assert.equal(isWeekendDate(parseDateOnly('2026-07-18')), true);
assert.equal(isWeekendDate(parseDateOnly('2026-07-19')), true);
assert.equal(isWeekendDate(parseDateOnly('2026-08-01')), true);
assert.equal(isWeekendDate(parseDateOnly('2027-01-01')), false);
assert.equal(isWeekendDate(new Date('invalid')), false);
assert.throws(() => isWeekendDate(null), TypeError);

console.log('planningCivilDate.test.js ok');
