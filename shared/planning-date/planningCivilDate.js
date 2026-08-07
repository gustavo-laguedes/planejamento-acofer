export function dateOnlyFromDate(date) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateOnly(value) {
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return new Date();
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addCalendarMonths(date, offset) {
  const next = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  return next;
}

export function isWeekendDate(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}
