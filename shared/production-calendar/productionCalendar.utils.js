import { holidayForDate } from '../holidays.js';

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

const PREFERRED_MACHINE_ORDER = [
  'trefila',
  'ec125',
  'ec60',
  'aco8',
  'focus8',
  'mt200',
  'mt150',
  'mt100'
];

const PREFERRED_MACHINE_POSITIONS = new Map(
  PREFERRED_MACHINE_ORDER.map((name, index) => [name, index])
);

export function normalizeProductionCalendarMachineName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

export function compareProductionCalendarMachineOrder(left, right) {
  const machineName = machine => String(
    machine?.machineName
      ?? machine?.name
      ?? machine?.machineId
      ?? machine?.id
      ?? ''
  );
  const leftPosition = PREFERRED_MACHINE_POSITIONS.get(
    normalizeProductionCalendarMachineName(machineName(left))
  ) ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = PREFERRED_MACHINE_POSITIONS.get(
    normalizeProductionCalendarMachineName(machineName(right))
  ) ?? Number.MAX_SAFE_INTEGER;
  return leftPosition - rightPosition;
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
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(parsed);
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
  const integerUnit = String(unit || '').trim().toLowerCase() === 'un';
  const displayValue = integerUnit ? Math.round(value) : value;

  const formatted = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: integerUnit ? 0 : 3
  }).format(displayValue);

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

export function formatProductionCalendarCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1
  }).format(number);
}

function roundedPercent(value) {
  return Number(Number(value).toFixed(2));
}

export function buildProductionCalendarDayProductivity({ day = {}, allocations = [] } = {}) {
  const date = String(day?.date || '');
  const productivePeople = (Array.isArray(allocations) ? allocations : [])
    .filter(allocation => String(allocation?.date || '') === date)
    .reduce((sum, allocation) => {
      const peopleCount = Number(allocation?.peopleCount);
      const capacityPercent = Number(allocation?.capacityPercent);
      if (!(peopleCount > 0) || !Number.isFinite(capacityPercent)) return sum;
      return sum + (peopleCount * (capacityPercent / 100));
    }, 0);
  const availablePeople = Number(day?.team?.availablePeople);
  const percent = availablePeople > 0
    ? roundedPercent((productivePeople / availablePeople) * 100)
    : (productivePeople > 0 ? null : 0);
  return {
    productivePeople: Number(productivePeople.toFixed(2)),
    availablePeople: Number.isFinite(availablePeople) ? availablePeople : 0,
    percent
  };
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
  if (day?.isWorkingDay === true) return false;
  if (day?.isWorkingDay === false) return true;

  const parsed = dateOnlyToUtcDate(day?.date);
  if (!parsed) return false;

  if (holidayForDate(day.date)) return true;

  const weekday = parsed.getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function addProductionCalendarDays(date, amount) {
  const parsed = dateOnlyToUtcDate(date);
  const days = Number(amount);
  if (!parsed || !Number.isFinite(days)) return String(date || '');
  return utcDateToDateOnly(addUtcDays(parsed, Math.trunc(days)));
}

export function getProductionCalendarProductionLimitDate(allocations = []) {
  return (Array.isArray(allocations) ? allocations : [])
    .map(allocation => String(allocation?.date || ''))
    .filter(isValidDateOnly)
    .sort()
    .at(-1) || null;
}

function productionCalendarShiftId(shift, index) {
  return String(shift?.shiftId ?? shift?.id ?? `shift-${index + 1}`);
}

function productionCalendarShiftOverride(overrides, shift, shiftId, index) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return { found: false, value: null };
  const keys = [shiftId, shift?.label, `Turno ${index + 1}`, `T${index + 1}`]
    .map(value => String(value || ''))
    .filter(Boolean);
  const key = keys.find(candidate => Object.hasOwn(overrides, candidate));
  return key ? { found: true, value: Number(overrides[key]) } : { found: false, value: null };
}

/**
 * Builds the read-only day header contract from the validated resource projection.
 * No resource usage is recalculated here.
 */
export function buildProductionCalendarDayPresentation({
  day,
  resource = {},
  shifts = [],
  manualWorkDates = [],
  dailyTeamOverrides = {},
  extraordinaryCapacity = false
} = {}) {
  const date = String(day?.date || '');
  const dateOverrides = dailyTeamOverrides?.[date] || {};
  const projectedShifts = resource?.shifts || {};
  const normalizedShifts = (Array.isArray(shifts) ? shifts : []).map((shift, index) => {
    const shiftId = productionCalendarShiftId(shift, index);
    const projection = projectedShifts[shiftId]
      || projectedShifts[String(shift?.label || '')]
      || {};
    const override = productionCalendarShiftOverride(dateOverrides, shift, shiftId, index);
    const standardPeople = Number(shift?.availablePeople ?? shift?.teamAvailable);
    const projectedAvailable = Number(projection.availablePeople);
    const availablePeople = Number.isFinite(projectedAvailable)
      ? projectedAvailable
      : (override.found && Number.isFinite(override.value) ? override.value : (Number.isFinite(standardPeople) ? standardPeople : 0));
    return {
      shiftId,
      label: String(shift?.label || `Turno ${index + 1}`),
      standardPeople: Number.isFinite(standardPeople) ? standardPeople : 0,
      peakPeople: Math.max(0, Number(projection.peakPeople) || 0),
      availablePeople: Math.max(0, availablePeople),
      hasDailyOverride: override.found,
      overrideUsed: Boolean(projection.overrideUsed)
    };
  });
  Object.entries(projectedShifts).forEach(([shiftId, projection]) => {
    if (normalizedShifts.some(shift => shift.shiftId === shiftId)) return;
    normalizedShifts.push({
      shiftId,
      label: String(projection?.label || shiftId),
      standardPeople: Number(projection?.availablePeople) || 0,
      peakPeople: Math.max(0, Number(projection?.peakPeople) || 0),
      availablePeople: Math.max(0, Number(projection?.availablePeople) || 0),
      hasDailyOverride: Object.hasOwn(dateOverrides, shiftId),
      overrideUsed: Boolean(projection?.overrideUsed)
    });
  });
  const peakShift = normalizedShifts.reduce((selected, shift) => (
    !selected || shift.peakPeople > selected.peakPeople ? shift : selected
  ), null) || { peakPeople: 0, availablePeople: 0, hasDailyOverride: false, overrideUsed: false };
  let state = 'normal';
  if (peakShift.peakPeople > peakShift.availablePeople) state = 'error';
  else if (extraordinaryCapacity || peakShift.hasDailyOverride || peakShift.overrideUsed) state = 'override';
  else if (peakShift.peakPeople > 0 && peakShift.peakPeople === peakShift.availablePeople) state = 'attention';
  const isManuallyEnabled = (Array.isArray(manualWorkDates) ? manualWorkDates : [])
    .some(value => String(value?.date ?? value ?? '') === date);
  return {
    date,
    isWorkingDay: isManuallyEnabled ? true : day?.isWorkingDay,
    isNonWorkingDay: isManuallyEnabled ? false : isProductionCalendarNonWorkingDay(day),
    isManuallyEnabled,
    team: {
      peakPeople: peakShift.peakPeople,
      availablePeople: peakShift.availablePeople,
      state,
      shifts: normalizedShifts
    }
  };
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
      ...day,
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
 * Extends the calendar contract with fully usable empty days through endDate.
 * Existing day metadata is preserved; generated days receive the same normalized
 * date/weekday/non-working-day contract used by the grid.
 */
export function extendProductionCalendarDayRange(days = [], endDate = null) {
  const normalized = fillProductionCalendarDayRange(days.map(normalizeProductionCalendarDay));
  if (!normalized.length || !isValidDateOnly(endDate)) return normalized;
  const lastDate = normalized.at(-1).date;
  if (endDate <= lastDate) return normalized.filter(day => day.date <= endDate);

  const extended = [...normalized];
  for (let date = addProductionCalendarDays(lastDate, 1); date <= endDate; date = addProductionCalendarDays(date, 1)) {
    const holiday = holidayForDate(date);
    const day = normalizeProductionCalendarDay({
      date,
      label: formatProductionCalendarDate(date),
      weekday: getProductionCalendarWeekday(date),
      holiday: holiday || null,
      isWorkingDay: holiday ? false : undefined
    });
    extended.push(day);
  }
  return extended;
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
  const normalizedMachines = machines.map((machine, originalIndex) => {
    return {
      machine,
      originalIndex
    };
  });

  normalizedMachines.sort((left, right) => (
    compareProductionCalendarMachineOrder(left.machine, right.machine)
    || left.originalIndex - right.originalIndex
  ));

  return normalizedMachines.map(({ machine }) => {
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
