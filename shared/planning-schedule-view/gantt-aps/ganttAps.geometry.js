import { comparePlanningMachineOrder } from '../../planning-schedule/planningMachineOrder.js';

export const GANTT_APS_MAX_VISIBLE_DAYS = 120;
export const GANTT_APS_DEFAULT_PIXELS_PER_HOUR = 6;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DAY_MS = 86400000;
const TREFILA_RESOURCE_ID = 'Trefila';

function isTrefilaResource(resource = {}) {
  return [
    resource.name,
    resource.machineName,
    resource.machine_name,
    resource.id,
    resource.machineId,
    resource.machine_id
  ].some(value => (
    comparePlanningMachineOrder({ name: value }, { name: TREFILA_RESOURCE_ID }) === 0
    && comparePlanningMachineOrder({ name: TREFILA_RESOURCE_ID }, { name: value }) === 0
  ));
}

function normalizeGanttApsResource(resource = {}) {
  if (!isTrefilaResource(resource)) return { ...resource };
  const id = String(resource.id ?? resource.machineId ?? resource.machine_id ?? TREFILA_RESOURCE_ID).trim()
    || TREFILA_RESOURCE_ID;
  const name = String(resource.name ?? resource.machineName ?? resource.machine_name ?? TREFILA_RESOURCE_ID).trim()
    || TREFILA_RESOURCE_ID;
  return { ...resource, id, name };
}

export function civilDayNumber(value) {
  const match = DATE_PATTERN.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) return null;
  return Math.floor(timestamp / DAY_MS);
}

export function civilDateFromDayNumber(dayNumber) {
  if (!Number.isFinite(dayNumber)) return null;
  const date = new Date(dayNumber * DAY_MS);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timeMinutes(value) {
  const match = TIME_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return (hour * 60) + minute + (second / 60);
}

export function taskMinuteRange(task = {}) {
  const startDay = civilDayNumber(task.start?.date ?? task.date);
  const startMinute = timeMinutes(task.start?.time ?? task.startTime);
  if (startDay === null || startMinute === null) return null;

  const endDay = civilDayNumber(
    task.end?.date
      ?? task.endDate
      ?? task.start?.date
      ?? task.date
  );
  const endMinute = timeMinutes(task.end?.time ?? task.endTime);
  const duration = Number(task.durationMinutes);
  const start = (startDay * 1440) + startMinute;
  let end = endDay === null || endMinute === null
    ? null
    : (endDay * 1440) + endMinute;
  if (!(end > start) && Number.isFinite(duration) && duration > 0) end = start + duration;
  if (!(end > start)) end = start + 30;
  return { start, end, durationMinutes: end - start };
}

export function buildGanttApsWindow(model = {}, { maxDays = GANTT_APS_MAX_VISIBLE_DAYS } = {}) {
  const calendarDays = (Array.isArray(model.calendar?.days) ? model.calendar.days : [])
    .map(day => ({ ...day, dayNumber: civilDayNumber(day?.date ?? day) }))
    .filter(day => day.dayNumber !== null)
    .sort((left, right) => left.dayNumber - right.dayNumber);
  const taskDays = (Array.isArray(model.tasks) ? model.tasks : [])
    .flatMap(task => [
      civilDayNumber(task.start?.date ?? task.date),
      civilDayNumber(task.end?.date ?? task.endDate ?? task.start?.date ?? task.date)
    ])
    .filter(value => value !== null);
  const candidates = [...calendarDays.map(day => day.dayNumber), ...taskDays];
  if (!candidates.length) return { startDay: null, endDay: null, days: [], totalDays: 0 };

  const startDay = Math.min(...candidates);
  const requestedEndDay = Math.max(...candidates);
  const safeMaxDays = Math.max(1, Number(maxDays) || GANTT_APS_MAX_VISIBLE_DAYS);
  const endDay = Math.min(requestedEndDay, startDay + safeMaxDays - 1);
  const dayByNumber = new Map(calendarDays.map(day => [day.dayNumber, day]));
  const days = [];
  for (let dayNumber = startDay; dayNumber <= endDay; dayNumber += 1) {
    const source = dayByNumber.get(dayNumber) || {};
    days.push({
      ...source,
      date: source.date || civilDateFromDayNumber(dayNumber),
      dayNumber
    });
  }
  return {
    startDay,
    endDay,
    days,
    totalDays: days.length,
    truncated: requestedEndDay > endDay
  };
}

export function taskGeometry(task, window, pixelsPerHour = GANTT_APS_DEFAULT_PIXELS_PER_HOUR) {
  const range = taskMinuteRange(task);
  if (!range || window?.startDay === null || window?.startDay === undefined) return null;
  const pixelsPerMinute = Number(pixelsPerHour) / 60;
  const windowStartMinute = window.startDay * 1440;
  return {
    left: (range.start - windowStartMinute) * pixelsPerMinute,
    width: Math.max(3, range.durationMinutes * pixelsPerMinute),
    start: range.start,
    end: range.end,
    durationMinutes: range.durationMinutes
  };
}

export function ganttApsProductionIdentity(task = {}) {
  const productionId = task?.productionId;
  if (productionId !== null && productionId !== undefined && productionId !== '') {
    return `production:${String(productionId)}`;
  }
  const productionIndex = task?.productionIndex;
  if (productionIndex !== null && productionIndex !== undefined && productionIndex !== '') {
    return `production-index:${String(productionIndex)}`;
  }
  return `allocation:${String(task?.id ?? '')}`;
}

export function orderGanttApsTasks(tasks = []) {
  return [...tasks].sort((left, right) => {
    const leftRange = taskMinuteRange(left);
    const rightRange = taskMinuteRange(right);
    const leftIdentity = ganttApsProductionIdentity(left);
    const rightIdentity = ganttApsProductionIdentity(right);
    const leftHasProduction = !leftIdentity.startsWith('allocation:');
    const rightHasProduction = !rightIdentity.startsWith('allocation:');
    const leftProductionIndex = Number(left?.productionIndex);
    const rightProductionIndex = Number(right?.productionIndex);
    const leftHasProductionIndex = left?.productionIndex !== null
      && left?.productionIndex !== undefined
      && left?.productionIndex !== ''
      && Number.isFinite(leftProductionIndex);
    const rightHasProductionIndex = right?.productionIndex !== null
      && right?.productionIndex !== undefined
      && right?.productionIndex !== ''
      && Number.isFinite(rightProductionIndex);
    let productionOrder = 0;
    if (leftHasProduction && rightHasProduction && leftIdentity !== rightIdentity) {
      productionOrder = leftHasProductionIndex && rightHasProductionIndex
        ? leftProductionIndex - rightProductionIndex
        : (leftHasProductionIndex ? -1 : (rightHasProductionIndex ? 1 : 0));
      productionOrder ||= leftIdentity.localeCompare(rightIdentity, 'pt-BR', { numeric: true });
    } else if (leftHasProduction !== rightHasProduction) {
      productionOrder = leftHasProduction ? -1 : 1;
    }
    const leftSequenceValue = left?.sequence ?? left?.allocationOrder;
    const rightSequenceValue = right?.sequence ?? right?.allocationOrder;
    const leftSequence = leftSequenceValue === '' || leftSequenceValue == null
      ? Number.MAX_SAFE_INTEGER
      : Number(leftSequenceValue);
    const rightSequence = rightSequenceValue === '' || rightSequenceValue == null
      ? Number.MAX_SAFE_INTEGER
      : Number(rightSequenceValue);
    return (
      productionOrder
      || Number(leftRange?.start ?? Number.MAX_SAFE_INTEGER)
      - Number(rightRange?.start ?? Number.MAX_SAFE_INTEGER)
      || (Number.isFinite(leftSequence) ? leftSequence : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(rightSequence) ? rightSequence : Number.MAX_SAFE_INTEGER)
      || String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
    );
  });
}

export function stackGanttApsTasks(tasks = []) {
  const sorted = orderGanttApsTasks(tasks)
    .map(task => ({ task, range: taskMinuteRange(task) }));
  const trackEnds = [];
  return sorted.map(item => {
    if (!item.range) return { ...item, track: 0 };
    let track = trackEnds.findIndex(end => end <= item.range.start);
    if (track < 0) track = trackEnds.length;
    trackEnds[track] = item.range.end;
    return { ...item, track };
  });
}

export function orderGanttApsResources(model = {}) {
  const tasks = Array.isArray(model.tasks) ? model.tasks : [];
  const taskResourceNames = new Map();
  tasks.forEach(task => {
    const id = String(task?.resourceId ?? '');
    if (!id || taskResourceNames.has(id)) return;
    const name = task?.machineName ?? task?.resourceName ?? task?.resourceLabel ?? id;
    taskResourceNames.set(id, String(name || id));
  });
  const resources = (Array.isArray(model.resources) ? model.resources : [])
    .map(resource => {
      const id = String(resource.id ?? '');
      return resource.name || !taskResourceNames.has(id)
        ? { ...resource }
        : { ...resource, name: taskResourceNames.get(id) };
    })
    .map(normalizeGanttApsResource);
  const taskResourceIds = new Set(tasks.map(task => String(task.resourceId ?? '')));
  const knownResourceIds = new Set(resources.map(resource => String(resource.id)));
  const hasTrefilaResource = resources.some(isTrefilaResource);
  if (!hasTrefilaResource) {
    resources.push({ id: TREFILA_RESOURCE_ID, name: TREFILA_RESOURCE_ID, order: -1 });
    knownResourceIds.add(TREFILA_RESOURCE_ID);
  }
  if (taskResourceIds.has('') && !knownResourceIds.has('')) {
    resources.push({ id: '', name: 'Máquina não informada', order: resources.length });
  }
  [...taskResourceIds]
    .filter(id => id && !knownResourceIds.has(id))
    .forEach((id, index) => resources.push({
      id,
      name: taskResourceNames.get(id) || id,
      order: resources.length + index
    }));
  return resources.sort((left, right) => (
    comparePlanningMachineOrder(left, right)
    || Number(left.order ?? Number.MAX_SAFE_INTEGER) - Number(right.order ?? Number.MAX_SAFE_INTEGER)
    || String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR')
    || String(left.id).localeCompare(String(right.id))
  ));
}
