const LOCAL_HOLIDAYS = [
  { date: '2026-01-01', name: 'Confraternizacao Universal', type: 'nacional' },
  { date: '2026-02-17', name: 'Carnaval', type: 'nacional' },
  { date: '2026-04-03', name: 'Sexta-feira Santa', type: 'nacional' },
  { date: '2026-04-21', name: 'Tiradentes', type: 'nacional' },
  { date: '2026-05-01', name: 'Dia do Trabalho', type: 'nacional' },
  { date: '2026-06-04', name: 'Corpus Christi', type: 'nacional' },
  { date: '2026-09-07', name: 'Independencia do Brasil', type: 'nacional' },
  { date: '2026-10-12', name: 'Nossa Senhora Aparecida', type: 'nacional' },
  { date: '2026-11-02', name: 'Finados', type: 'nacional' },
  { date: '2026-11-15', name: 'Proclamacao da Republica', type: 'nacional' },
  { date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciencia Negra', type: 'nacional' },
  { date: '2026-12-25', name: 'Natal', type: 'nacional' },
  { date: '2026-07-10', name: 'Aniversario de Pindamonhangaba', type: 'municipal' }
];

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00`);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function isWeekend(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function holidayForDate(date) {
  return LOCAL_HOLIDAYS.find(holiday => holiday.date === date) || null;
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
