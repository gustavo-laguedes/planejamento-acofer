function isValidDateOnly(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function dateOnlyToUtcDate(date) {
  return isValidDateOnly(date) ? new Date(`${date}T00:00:00Z`) : null;
}

function addUtcDays(date, amount) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function utcDateToDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export function isPlanningScheduleDateOnly(date) {
  return isValidDateOnly(date);
}

export function parsePlanningScheduleDateOnlyToUtcDate(date) {
  return dateOnlyToUtcDate(date);
}

export function formatPlanningScheduleDate(date) {
  const parsed = dateOnlyToUtcDate(date);
  if (!parsed) return String(date || '');
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(parsed);
}

export function getPlanningScheduleWeekday(date) {
  const parsed = dateOnlyToUtcDate(date);
  if (!parsed) return '';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(parsed);
}

export function addPlanningScheduleDays(date, amount) {
  const parsed = dateOnlyToUtcDate(date);
  const days = Number(amount);
  if (!parsed || !Number.isFinite(days)) return String(date || '');
  return utcDateToDateOnly(addUtcDays(parsed, Math.trunc(days)));
}

export function getPlanningScheduleProductionLimitDate(allocations = []) {
  return (Array.isArray(allocations) ? allocations : [])
    .map(allocation => String(allocation?.date || ''))
    .filter(isValidDateOnly)
    .sort()
    .at(-1) || null;
}

export function normalizePlanningScheduleDay(day) {
  if (day && typeof day === 'object' && !(day instanceof Date)) {
    const date = String(day.date || '');
    const normalized = {
      ...day,
      date,
      label: String(day.label || day.date || ''),
      weekday: String(day.weekday || day.weekDay || day.dayOfWeek || getPlanningScheduleWeekday(date))
    };

    if (day.isWorkingDay !== undefined) normalized.isWorkingDay = Boolean(day.isWorkingDay);
    if (day.workingDay !== undefined) normalized.isWorkingDay = Boolean(day.workingDay);
    if (day.businessDay !== undefined) normalized.isWorkingDay = Boolean(day.businessDay);
    if (day.is_business_day !== undefined) normalized.isWorkingDay = Boolean(day.is_business_day);
    if (day.business_day !== undefined) normalized.isWorkingDay = Boolean(day.business_day);

    if (!normalized.label) normalized.label = formatPlanningScheduleDate(date);
    return {
      ...normalized,
      label: normalized.label
    };
  }

  if (day instanceof Date) {
    const date = day.toISOString().slice(0, 10);
    return {
      date,
      label: formatPlanningScheduleDate(date),
      weekday: getPlanningScheduleWeekday(date)
    };
  }

  const date = String(day || '');
  return {
    date,
    label: formatPlanningScheduleDate(date),
    weekday: getPlanningScheduleWeekday(date)
  };
}

export function fillPlanningScheduleDayRange(days = []) {
  const byDate = days.reduce((map, day) => {
    if (isValidDateOnly(day?.date) && !map.has(day.date)) map.set(day.date, day);
    return map;
  }, new Map());
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return [];

  const start = dateOnlyToUtcDate(dates[0]);
  const end = dateOnlyToUtcDate(dates[dates.length - 1]);
  const filled = [];

  for (let current = start; current <= end; current = addUtcDays(current, 1)) {
    const date = utcDateToDateOnly(current);
    filled.push(byDate.get(date) || {
      date,
      label: formatPlanningScheduleDate(date),
      weekday: getPlanningScheduleWeekday(date)
    });
  }

  return filled;
}
