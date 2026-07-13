/**
 * @param {string} date
 * @returns {boolean}
 */
function isValidDateOnly(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * @param {string} date
 * @returns {Date|null}
 */
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

/**
 * Formats an ISO date as dd/mm/yyyy in pt-BR.
 *
 * @param {string} date
 * @returns {string}
 */
export function formatProductionCalendarDate(date) {
  const parsed = dateOnlyToUtcDate(date);
  if (!parsed) return String(date || '');
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(parsed);
}

/**
 * Formats an ISO date weekday in pt-BR.
 *
 * @param {string} date
 * @returns {string}
 */
export function getProductionCalendarWeekday(date) {
  const parsed = dateOnlyToUtcDate(date);
  if (!parsed) return '';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(parsed);
}

/**
 * Formats a numeric quantity without changing the original value.
 *
 * @param {number|string} quantity
 * @param {string} unit
 * @returns {string}
 */
export function formatProductionCalendarQuantity(quantity, unit = '') {
  const value = Number(quantity);
  const suffix = unit ? ` ${unit}` : '';
  if (!Number.isFinite(value)) return `--${suffix}`;

  const formatted = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 3
  }).format(value);

  return `${formatted}${suffix}`;
}

/**
 * Formats a percentage with at most two decimal places.
 *
 * @param {number|string} percent
 * @returns {string}
 */
export function formatProductionCalendarPercent(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value)) return '--';

  return `${new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2
  }).format(value)}%`;
}

/**
 * Converts minutes to a compact hours/minutes label.
 *
 * @param {number|string} minutes
 * @returns {string}
 */
export function formatProductionCalendarDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return '--';

  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  if (hours <= 0) return `${remainingMinutes}min`;
  if (remainingMinutes <= 0) return `${hours}h`;
  return `${hours}h${remainingMinutes}min`;
}

/**
 * Calculates the widest allocation stack per day across all machines.
 *
 * @param {Array<Object>} rows
 * @param {Array<{date: string}>} days
 * @returns {Object<string, number>}
 */
export function getProductionCalendarDayCardCounts(rows = [], days = []) {
  return days.reduce((counts, day) => {
    counts[day.date] = Math.max(
      1,
      ...rows.map(row => row.allocationsByDate?.[day.date]?.length || 0)
    );
    return counts;
  }, {});
}

/**
 * @param {{date: string, isWorkingDay?: boolean}} day
 * @returns {boolean}
 */
export function isProductionCalendarNonWorkingDay(day) {
  if (day?.isWorkingDay === false) return true;

  const parsed = dateOnlyToUtcDate(day?.date);
  if (!parsed) return false;

  const weekday = parsed.getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Normalizes a day input for grid rendering.
 *
 * @param {string|Date|Object} day
 * @returns {{date: string, label: string, weekday: string, isWorkingDay?: boolean}}
 */
export function normalizeProductionCalendarDay(day) {
  if (day && typeof day === 'object' && !(day instanceof Date)) {
    const date = String(day.date || '');
    const normalized = {
      date,
      label: String(day.label || day.date || ''),
      weekday: String(day.weekday || day.weekDay || day.dayOfWeek || getProductionCalendarWeekday(date))
    };

    if (day.isWorkingDay !== undefined) normalized.isWorkingDay = Boolean(day.isWorkingDay);
    if (day.workingDay !== undefined) normalized.isWorkingDay = Boolean(day.workingDay);
    if (day.businessDay !== undefined) normalized.isWorkingDay = Boolean(day.businessDay);
    if (day.is_business_day !== undefined) normalized.isWorkingDay = Boolean(day.is_business_day);
    if (day.business_day !== undefined) normalized.isWorkingDay = Boolean(day.business_day);

    if (!normalized.label) normalized.label = formatProductionCalendarDate(date);
    return {
      ...normalized,
      label: normalized.label
    };
  }

  if (day instanceof Date) {
    const date = day.toISOString().slice(0, 10);
    return {
      date,
      label: formatProductionCalendarDate(date),
      weekday: getProductionCalendarWeekday(date)
    };
  }

  const date = String(day || '');
  return {
    date,
    label: formatProductionCalendarDate(date),
    weekday: getProductionCalendarWeekday(date)
  };
}

/**
 * Fills visual gaps between the first and last valid day without changing planning data.
 *
 * @param {Array<{date: string, label: string, weekday: string, isWorkingDay?: boolean}>} days
 * @returns {Array<{date: string, label: string, weekday: string, isWorkingDay?: boolean}>}
 */
export function fillProductionCalendarDayRange(days = []) {
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
      label: formatProductionCalendarDate(date),
      weekday: getProductionCalendarWeekday(date)
    });
  }

  return filled;
}

/**
 * Groups allocations by machine id and date.
 *
 * @param {Array<Object>} allocations
 * @returns {Map<string, Map<string, Array<Object>>>}
 */
export function groupAllocationsByMachineAndDate(allocations = []) {
  return allocations.reduce((grouped, allocation) => {
    const machineId = String(allocation.machineId);
    const date = String(allocation.date);

    if (!grouped.has(machineId)) grouped.set(machineId, new Map());
    const machineGroup = grouped.get(machineId);
    if (!machineGroup.has(date)) machineGroup.set(date, []);
    machineGroup.get(date).push(allocation);

    return grouped;
  }, new Map());
}

/**
 * Creates read-only grid rows from machines, days, and allocations.
 *
 * @param {Object} params
 * @param {Array<{date: string, label: string}>} params.days
 * @param {Array<Object>} params.machines
 * @param {Array<Object>} params.allocations
 * @returns {Array<Object>}
 */
export function createProductionCalendarGridRows({ days = [], machines = [], allocations = [] } = {}) {
  const grouped = groupAllocationsByMachineAndDate(allocations);

  return machines.map(machine => {
    const machineId = String(machine.machineId ?? machine.id ?? '');
    const machineGroup = grouped.get(machineId) || new Map();
    const allocationsByDate = {};

    days.forEach(day => {
      allocationsByDate[day.date] = [...(machineGroup.get(day.date) || [])]
        .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    });

    return {
      machine: {
        id: machineId,
        name: String(machine.machineName ?? machine.name ?? machineId)
      },
      allocationsByDate
    };
  });
}
