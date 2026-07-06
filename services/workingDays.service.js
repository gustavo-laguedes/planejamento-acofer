import { holidayForDate, holidaysForYear } from '../shared/holidays.js';

export { holidayForDate, holidaysForYear };

function dateKey(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00Z`);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function isWeekend(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function businessDaysInclusive(startValue, endValue) {
  const start = dateKey(startValue);
  const end = dateKey(endValue);
  if (!start || !end || start > end) return 0;
  let count = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (!isWeekend(date) && !holidayForDate(date)) count += 1;
  }
  return count;
}

export function businessDaysBetween(startValue, endValue) {
  const start = dateKey(startValue);
  const end = dateKey(endValue);
  if (!start || !end || start >= end) return 0;
  let count = 0;
  for (let date = addDays(start, 1); date <= end; date = addDays(date, 1)) {
    if (!isWeekend(date) && !holidayForDate(date)) count += 1;
  }
  return count;
}
