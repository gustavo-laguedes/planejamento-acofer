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

function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function holidaysForYear(yearValue) {
  const year = Number(yearValue);
  if (!Number.isInteger(year)) return [];
  const easter = easterDate(year);
  return [
    { date: `${year}-01-01`, name: 'Confraternização Universal', type: 'nacional' },
    { date: addDays(easter, -47), name: 'Carnaval', type: 'nacional' },
    { date: addDays(easter, -2), name: 'Sexta-feira Santa', type: 'nacional' },
    { date: `${year}-04-21`, name: 'Tiradentes', type: 'nacional' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho', type: 'nacional' },
    { date: addDays(easter, 60), name: 'Corpus Christi', type: 'nacional' },
    { date: `${year}-07-10`, name: 'Aniversário de Pindamonhangaba', type: 'municipal' },
    { date: `${year}-09-07`, name: 'Independência do Brasil', type: 'nacional' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida', type: 'nacional' },
    { date: `${year}-11-02`, name: 'Finados', type: 'nacional' },
    { date: `${year}-11-15`, name: 'Proclamação da República', type: 'nacional' },
    { date: `${year}-11-20`, name: 'Dia Nacional de Zumbi e da Consciência Negra', type: 'nacional' },
    { date: `${year}-12-25`, name: 'Natal', type: 'nacional' }
  ];
}

export function holidayForDate(value) {
  const date = dateKey(value);
  if (!date) return null;
  return holidaysForYear(Number(date.slice(0, 4))).find(holiday => holiday.date === date) || null;
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
