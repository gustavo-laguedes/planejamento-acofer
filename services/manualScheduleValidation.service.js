import { holidayForDate } from '../shared/holidays.js';
import { buildManualScheduleStockLedger } from './manualScheduleStockLedger.service.js';
import { validateManualScheduleResources } from './manualScheduleResourceValidation.service.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;
const QUANTITY_EPSILON = 0.001;
const DEFAULT_MINIMUM_START_RATIO = 0.30;
const DEFAULT_DEPENDENCY_COMPLETION_BUFFER_MINUTES = 60;
const EVENT_ORDER = {
  ALLOCATION_END: 0,
  SHIFT_END: 1,
  SHIFT_START: 2,
  ALLOCATION_START: 3
};

function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function timeToMinutes(value) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function civilDayNumber(date) {
  const [year, month, day] = date.split('-').map(Number);
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - (era * 400);
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

function addCivilDays(date, amount) {
  let [year, month, day] = date.split('-').map(Number);
  const direction = amount < 0 ? -1 : 1;
  for (let remaining = Math.abs(amount); remaining > 0; remaining -= 1) {
    day += direction;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    } else if (day < 1) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(date) {
  const day = (civilDayNumber(date) + 3) % 7;
  return day === 0 || day === 6;
}

function civilPoint(date, minutes) {
  return (civilDayNumber(date) * MINUTES_PER_DAY) + minutes;
}

function intervalsOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function diagnosticSignature(diagnostic) {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.allocationIds,
    diagnostic.machineIds,
    diagnostic.parentOperationIds,
    diagnostic.dependencyIds,
    diagnostic.materialIds,
    diagnostic.locationId,
    diagnostic.date,
    diagnostic.startTime,
    diagnostic.endTime,
    diagnostic.shiftIds,
    diagnostic.requiredSetupMinutes,
    diagnostic.availableSetupMinutes,
    diagnostic.availablePeople,
    diagnostic.requiredPeople,
    diagnostic.excessPeople,
    diagnostic.intervals,
    diagnostic.overrideId,
    diagnostic.details
  ]);
}

function makeDiagnostic(code, rule, message, values = {}) {
  const diagnostic = {
    issueId: '',
    code,
    severity: values.severity || 'error',
    blocking: values.blocking !== false,
    rule,
    message,
    allocationIds: [...new Set((values.allocationIds || []).map(String).filter(Boolean))].sort(),
    machineIds: [...new Set((values.machineIds || []).map(String).filter(Boolean))].sort(),
    parentOperationIds: [...new Set((values.parentOperationIds || []).map(String).filter(Boolean))].sort(),
    dependencyIds: [...new Set((values.dependencyIds || []).map(String).filter(Boolean))].sort(),
    materialIds: [...new Set((values.materialIds || []).map(String).filter(Boolean))].sort(),
    locationId: values.locationId || null,
    date: values.date || null,
    time: values.time || values.startTime || null,
    startTime: values.startTime || null,
    endTime: values.endTime || null,
    shiftIds: [...new Set((values.shiftIds || []).map(String).filter(Boolean))].sort(),
    requiredSetupMinutes: values.requiredSetupMinutes ?? null,
    availableSetupMinutes: values.availableSetupMinutes ?? null,
    availablePeople: values.availablePeople ?? null,
    requiredPeople: values.requiredPeople ?? null,
    excessPeople: values.excessPeople ?? null,
    intervals: Array.isArray(values.intervals) ? values.intervals.map(interval => ({ ...interval })) : [],
    overrideId: values.overrideId || null,
    requiredQuantity: values.requiredQuantity ?? null,
    availableQuantity: values.availableQuantity ?? null,
    deficitQuantity: values.deficitQuantity ?? null,
    balanceBefore: values.balanceBefore ?? null,
    balanceAfter: values.balanceAfter ?? null,
    details: values.details || {}
  };
  diagnostic.issueId = `${code}:${stableHash(diagnosticSignature(diagnostic))}`;
  return diagnostic;
}

function normalizeShift(shift, index) {
  const startTime = String(shift?.startTime ?? shift?.shiftStartTime ?? '');
  const endTime = String(shift?.endTime ?? shift?.shiftEndTime ?? '');
  const startMinutes = timeToMinutes(startTime);
  const endClockMinutes = timeToMinutes(endTime);
  const valid = startMinutes !== null && endClockMinutes !== null && startMinutes !== endClockMinutes;
  const shiftId = String(shift?.shiftId ?? shift?.id ?? `shift-${index + 1}`);
  const crossesMidnight = valid && endClockMinutes < startMinutes;
  return {
    shiftId,
    label: String(shift?.label ?? `Turno ${index + 1}`),
    startTime,
    endTime,
    hoursPerDay: shift?.hoursPerDay ?? null,
    teamAvailable: shift?.teamAvailable ?? null,
    startMinutes,
    endMinutes: valid ? endClockMinutes + (crossesMidnight ? MINUTES_PER_DAY : 0) : null,
    crossesMidnight,
    valid
  };
}

function findOverlappingShiftPairs(shifts) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < shifts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < shifts.length; rightIndex += 1) {
      const left = shifts[leftIndex];
      const right = shifts[rightIndex];
      let overlaps = false;
      for (const offset of [-MINUTES_PER_DAY, 0, MINUTES_PER_DAY]) {
        if (intervalsOverlap(
          { start: left.startMinutes, end: left.endMinutes },
          { start: right.startMinutes + offset, end: right.endMinutes + offset }
        )) overlaps = true;
      }
      if (overlaps) pairs.push([left, right]);
    }
  }
  return pairs;
}

function normalizeAllocation(allocation, index) {
  const allocationId = String(allocation?.allocationId ?? allocation?.id ?? `allocation-${index + 1}`);
  const date = String(allocation?.date ?? allocation?.startDate ?? '');
  const endDateInput = String(allocation?.endDate ?? '');
  const startTime = String(allocation?.startTime ?? '');
  const endTime = String(allocation?.endTime ?? '');
  const machineId = String(allocation?.machineId ?? allocation?.machine_id ?? allocation?.machineName ?? '');
  const validDate = isValidIsoDate(date) && (!endDateInput || isValidIsoDate(endDateInput));
  const startMinutes = timeToMinutes(startTime);
  const endClockMinutes = timeToMinutes(endTime);
  const validClockInterval = startMinutes !== null && endClockMinutes !== null && (
    Boolean(endDateInput) || startMinutes !== endClockMinutes
  );
  let endDate = endDateInput || date;
  if (validDate && validClockInterval && !endDateInput && endClockMinutes < startMinutes) endDate = addCivilDays(date, 1);
  const start = validDate && validClockInterval ? civilPoint(date, startMinutes) : null;
  const end = validDate && validClockInterval ? civilPoint(endDate, endClockMinutes) : null;
  const intervalValid = start !== null && end !== null && end > start;
  const quantity = Number(allocation?.quantity ?? allocation?.produceQty);
  const durationMinutes = Number(allocation?.durationMinutes ?? allocation?.duration);
  const directParentOperationId = String(
    allocation?.parentOperationId
    ?? allocation?.calendarParentOperationId
    ?? ''
  ).replace(/:day-\d+$/i, '');
  const sourceAllocationIds = (Array.isArray(allocation?.sourceAllocationIds) && allocation.sourceAllocationIds.length
    ? allocation.sourceAllocationIds
    : [allocationId]).map(String).filter(Boolean);
  const sourceParentOperationIds = (Array.isArray(allocation?.sourceParentOperationIds) && allocation.sourceParentOperationIds.length
    ? allocation.sourceParentOperationIds
    : []).map(value => String(value).replace(/:day-\d+$/i, '')).filter(Boolean);
  const auxiliaryOperationId = String(allocation?.operationId ?? '').replace(/:day-\d+$/i, '');
  const parentOperationId = directParentOperationId || sourceParentOperationIds[0] || auxiliaryOperationId;
  const rawComponents = Array.isArray(allocation?.components) && allocation.components.length
    ? allocation.components
    : [{
        parentOperationId,
        quantity,
        materialId: allocation?.materialId ?? allocation?.material_id,
        allocationId
      }];
  const components = rawComponents.map((component, componentIndex) => ({
    componentId: String(component?.componentId ?? `${allocationId}:component-${componentIndex + 1}`),
    allocationId: String(component?.allocationId ?? allocationId),
    parentOperationId: String(component?.parentOperationId ?? (directParentOperationId || sourceParentOperationIds[0] || auxiliaryOperationId)).replace(/:day-\d+$/i, ''),
    materialId: String(component?.materialId ?? component?.material_id ?? allocation?.materialId ?? allocation?.material_id ?? ''),
    quantity: Number(component?.quantity ?? component?.produceQty),
    unit: String(component?.unit ?? allocation?.unit ?? ''),
    sourceAllocationIds: (Array.isArray(component?.sourceAllocationIds) ? component.sourceAllocationIds : sourceAllocationIds).map(String).filter(Boolean),
    sourceParentOperationIds: (Array.isArray(component?.sourceParentOperationIds) ? component.sourceParentOperationIds : sourceParentOperationIds)
      .map(value => String(value).replace(/:day-\d+$/i, '')).filter(Boolean)
  }));
  return {
    allocationId,
    machineId,
    date,
    endDate,
    startTime,
    endTime,
    startMinutes,
    endClockMinutes,
    start,
    end,
    validDate,
    validTime: validClockInterval && (!validDate || intervalValid),
    crossesMidnight: validDate && endDate !== date
    ,
    parentOperationId,
    materialId: String(allocation?.materialId ?? allocation?.material_id ?? ''),
    unit: String(allocation?.unit ?? ''),
    sourceLocation: String(allocation?.sourceLocation ?? allocation?.locationId ?? allocation?.location ?? ''),
    targetLocation: String(allocation?.targetLocation ?? allocation?.locationId ?? allocation?.location ?? ''),
    quantity,
    durationMinutes,
    sourceAllocationIds,
    sourceParentOperationIds,
    components
  };
}

function shiftInterval(shift, anchorDate) {
  const endDate = shift.crossesMidnight ? addCivilDays(anchorDate, 1) : anchorDate;
  return {
    shiftId: shift.shiftId,
    startDate: anchorDate,
    endDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    start: civilPoint(anchorDate, shift.startMinutes),
    end: civilPoint(endDate, shift.endMinutes % MINUTES_PER_DAY)
  };
}

function shiftIntervalsForAllocation(allocation, shifts) {
  const dates = new Set([addCivilDays(allocation.date, -1), allocation.date]);
  if (allocation.endDate !== allocation.date) dates.add(allocation.endDate);
  return [...dates]
    .flatMap(date => shifts.map(shift => shiftInterval(shift, date)))
    .filter(interval => interval.end > allocation.start && interval.start < allocation.end)
    .sort((left, right) => left.start - right.start || left.end - right.end || left.shiftId.localeCompare(right.shiftId));
}

function intervalIsCovered(allocation, intervals) {
  let cursor = allocation.start;
  for (const interval of intervals) {
    if (interval.end <= cursor) continue;
    if (interval.start > cursor) return false;
    cursor = Math.max(cursor, interval.end);
    if (cursor >= allocation.end) return true;
  }
  return false;
}

function normalizedDateSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map(value => String(value?.date ?? value ?? ''))
    .filter(isValidIsoDate));
}

function isKnownHoliday(date, suppliedHolidays) {
  if (suppliedHolidays.has(date)) return true;
  return Boolean(holidayForDate(date));
}

function eventForPoint(point, type, values = {}) {
  return {
    timestampKey: `${point.date}T${point.time}`,
    date: point.date,
    time: point.time,
    type,
    allocationId: values.allocationId || null,
    machineId: values.machineId || null
  };
}

function buildTimeline(allocations, shifts) {
  const events = [];
  const shiftIntervals = new Map();
  allocations.filter(allocation => allocation.validDate && allocation.validTime).forEach(allocation => {
    events.push(eventForPoint({ date: allocation.date, time: allocation.startTime }, 'ALLOCATION_START', allocation));
    events.push(eventForPoint({ date: allocation.endDate, time: allocation.endTime }, 'ALLOCATION_END', allocation));
    const anchorDates = [addCivilDays(allocation.date, -1), allocation.date, allocation.endDate];
    anchorDates.forEach(date => shifts.forEach(shift => {
      const interval = shiftInterval(shift, date);
      shiftIntervals.set(`${shift.shiftId}|${interval.startDate}`, interval);
    }));
  });
  [...shiftIntervals.values()].forEach(interval => {
    events.push(eventForPoint({ date: interval.startDate, time: interval.startTime }, 'SHIFT_START'));
    events.push(eventForPoint({ date: interval.endDate, time: interval.endTime }, 'SHIFT_END'));
  });
  events.sort((left, right) => (
    left.timestampKey.localeCompare(right.timestampKey)
    || EVENT_ORDER[left.type] - EVENT_ORDER[right.type]
    || String(left.machineId || '').localeCompare(String(right.machineId || ''))
    || String(left.allocationId || '').localeCompare(String(right.allocationId || ''))
  ));
  return { events };
}

function buildAffectedAllocations(diagnostics) {
  const affected = { byAllocationId: {}, byDate: {} };
  diagnostics.forEach(diagnostic => {
    const bucket = diagnostic.severity === 'warning' ? 'warnings' : 'errors';
    diagnostic.allocationIds.forEach(allocationId => {
      affected.byAllocationId[allocationId] ||= { errors: [], warnings: [] };
      affected.byAllocationId[allocationId][bucket].push(diagnostic.issueId);
    });
    if (diagnostic.date) {
      affected.byDate[diagnostic.date] ||= { errors: [], warnings: [] };
      affected.byDate[diagnostic.date][bucket].push(diagnostic.issueId);
    }
  });
  return affected;
}

function countDiagnostics(diagnostics, code) {
  return diagnostics.filter(diagnostic => diagnostic.code === code).length;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(String).filter(Boolean))].sort();
}

function operationParentId(operation = {}) {
  return String(
    operation.parentOperationId
    ?? operation.calendarParentOperationId
    ?? operation.splitParentOperationId
    ?? operation.operationId
    ?? ''
  ).replace(/:day-\d+$/i, '');
}

function normalizeDependencies(dependencies, operations) {
  const operationList = Array.isArray(operations) ? operations : [];
  const parentByOperationId = new Map();
  operationList.forEach(operation => {
    const parentId = operationParentId(operation);
    [operation?.operationId, operation?.id, parentId].map(String).filter(Boolean)
      .forEach(id => parentByOperationId.set(id.replace(/:day-\d+$/i, ''), parentId));
  });
  const resolveParent = value => {
    const id = String(value ?? '').replace(/:day-\d+$/i, '');
    return parentByOperationId.get(id) || id;
  };
  const explicit = Array.isArray(dependencies) ? dependencies : [];
  const derived = [];
  operationList.forEach(consumer => {
    const requirements = Array.isArray(consumer?.dependencyRequirements) && consumer.dependencyRequirements.length
      ? consumer.dependencyRequirements
      : (consumer?.dependencyOperationIds || []).map(operationId => ({ operationId }));
    requirements.forEach((requirement, index) => derived.push({
      dependencyId: `dependency:${operationParentId(consumer)}:${index + 1}`,
      producerParentOperationId: resolveParent(requirement?.producerParentOperationId ?? requirement?.operationId ?? requirement?.materialId),
      consumerParentOperationId: operationParentId(consumer),
      materialId: requirement?.materialId ?? operationList.find(item => operationParentId(item) === resolveParent(requirement?.operationId))?.materialId,
      requiredQuantity: requirement?.requiredQuantity ?? requirement?.requiredQty,
      sourceLocation: requirement?.sourceLocation ?? requirement?.originLocationId,
      targetLocation: requirement?.targetLocation ?? consumer?.locationId ?? consumer?.destinationLocationId,
      transportId: requirement?.transportId
    }));
  });
  const source = explicit.length ? explicit : derived;
  return source.map((dependency, index) => {
    const sourceParents = uniqueStrings(dependency?.sourceParentOperationIds || []);
    const producerParentOperationId = resolveParent(
      dependency?.producerParentOperationId
      ?? dependency?.sourceParentOperationId
      ?? sourceParents[0]
      ?? dependency?.producerOperationId
      ?? dependency?.sourceOperationId
      ?? dependency?.operationId
    );
    const consumerParentOperationId = resolveParent(
      dependency?.consumerParentOperationId
      ?? dependency?.targetParentOperationId
      ?? dependency?.parentOperationId
      ?? dependency?.consumerOperationId
      ?? dependency?.targetOperationId
    );
    const materialId = String(dependency?.materialId ?? dependency?.material_id ?? '');
    return {
      dependencyId: String(dependency?.dependencyId ?? dependency?.id ?? `dependency-${index + 1}`),
      producerParentOperationId,
      consumerParentOperationId,
      materialId,
      requiredQuantity: Number(dependency?.requiredQuantity ?? dependency?.requiredQty ?? dependency?.quantity),
      sourceLocation: String(dependency?.sourceLocation ?? dependency?.originLocationId ?? dependency?.originLocation ?? ''),
      targetLocation: String(dependency?.targetLocation ?? dependency?.destinationLocationId ?? dependency?.destinationLocation ?? ''),
      transportId: String(dependency?.transportId ?? ''),
      unit: String(dependency?.unit ?? ''),
      sourceParentOperationIds: uniqueStrings(sourceParents.length ? sourceParents : [producerParentOperationId])
    };
  });
}

function normalizeTransports(transports) {
  return (Array.isArray(transports) ? transports : []).map((transport, index) => {
    const startDate = String(transport?.startDate ?? transport?.date ?? '');
    const startTime = String(transport?.startTime ?? '');
    const endDate = String(transport?.endDate ?? startDate);
    const endTime = String(transport?.endTime ?? '');
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    return {
      transportId: String(transport?.transportId ?? transport?.id ?? `transport-${index + 1}`),
      materialId: String(transport?.materialId ?? transport?.material_id ?? ''),
      quantity: Number(transport?.quantity ?? transport?.requiredQuantity ?? transport?.produceQty),
      sourceLocation: String(transport?.sourceLocation ?? transport?.originLocationId ?? transport?.originLocation ?? ''),
      targetLocation: String(transport?.targetLocation ?? transport?.destinationLocationId ?? transport?.destinationLocation ?? ''),
      durationMinutes: Number(transport?.durationMinutes ?? (Number(transport?.hours) * 60)),
      producerParentOperationIds: uniqueStrings(transport?.producerParentOperationIds || transport?.sourceParentOperationIds || []),
      consumerParentOperationIds: uniqueStrings(transport?.consumerParentOperationIds || transport?.targetParentOperationIds || []),
      unit: String(transport?.unit ?? ''),
      startDate,
      startTime,
      endDate,
      endTime,
      explicitStart: isValidIsoDate(startDate) && startMinutes !== null ? civilPoint(startDate, startMinutes) : null,
      explicitEnd: isValidIsoDate(endDate) && endMinutes !== null ? civilPoint(endDate, endMinutes) : null
    };
  });
}

function productiveSegments(allocation, shifts) {
  if (!allocation.validDate || !allocation.validTime) return [];
  return shiftIntervalsForAllocation(allocation, shifts).map(interval => ({
    start: Math.max(interval.start, allocation.start),
    end: Math.min(interval.end, allocation.end)
  })).filter(interval => interval.end > interval.start);
}

function productiveMinutesAt(segments, point) {
  return segments.reduce((sum, segment) => sum + Math.max(Math.min(point, segment.end) - segment.start, 0), 0);
}

function progressAt(profile, point) {
  if (!(profile.productiveMinutes > 0)) return point >= profile.end ? 1 : 0;
  return Math.min(Math.max(productiveMinutesAt(profile.segments, point) / profile.productiveMinutes, 0), 1);
}

function quantityAt(profile, point) {
  return profile.quantity * progressAt(profile, point);
}

function pointForProfileQuantity(profile, wanted) {
  if (!(wanted > QUANTITY_EPSILON)) return profile.start;
  if (wanted > profile.quantity + QUANTITY_EPSILON || !(profile.productiveMinutes > 0)) return null;
  let remaining = profile.productiveMinutes * Math.min(wanted / profile.quantity, 1);
  for (const segment of profile.segments) {
    const minutes = segment.end - segment.start;
    if (remaining <= minutes + QUANTITY_EPSILON) return segment.start + Math.max(remaining, 0);
    remaining -= minutes;
  }
  return profile.end;
}

function aggregateQuantityAt(profiles, point) {
  return profiles.reduce((sum, profile) => sum + quantityAt(profile, point), 0);
}

function aggregateQuantityTime(profiles, wanted) {
  if (!(wanted > QUANTITY_EPSILON)) return profiles.length ? Math.min(...profiles.map(profile => profile.start)) : null;
  if (profiles.reduce((sum, profile) => sum + profile.quantity, 0) + QUANTITY_EPSILON < wanted) return null;
  const points = uniqueStrings(profiles.flatMap(profile => profile.segments.flatMap(segment => [segment.start, segment.end]))).map(Number).sort((a, b) => a - b);
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const leftQty = aggregateQuantityAt(profiles, left);
    if (leftQty + QUANTITY_EPSILON >= wanted) return left;
    const rightQty = aggregateQuantityAt(profiles, right);
    if (rightQty + QUANTITY_EPSILON >= wanted && rightQty > leftQty) {
      return left + ((wanted - leftQty) / (rightQty - leftQty)) * (right - left);
    }
  }
  const last = points.at(-1);
  return last !== undefined && aggregateQuantityAt(profiles, last) + QUANTITY_EPSILON >= wanted ? last : null;
}

function pointFields(allocation) {
  return {
    date: allocation?.date || null,
    startTime: allocation?.startTime || null,
    endTime: allocation?.endTime || null
  };
}

function dependencyCycle(dependencies) {
  const adjacency = new Map();
  dependencies.forEach(edge => {
    if (!edge.producerParentOperationId || !edge.consumerParentOperationId) return;
    if (!adjacency.has(edge.producerParentOperationId)) adjacency.set(edge.producerParentOperationId, []);
    adjacency.get(edge.producerParentOperationId).push(edge.consumerParentOperationId);
  });
  adjacency.forEach(values => values.sort());
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  let found = null;
  function visit(node) {
    if (found) return;
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      found = [...stack.slice(start), node];
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    (adjacency.get(node) || []).forEach(visit);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  [...adjacency.keys()].sort().forEach(visit);
  return found;
}

function previousProductivePoint(point, minutes, shifts) {
  let remaining = Math.max(Number(minutes) || 0, 0);
  if (!remaining) return point;
  const shiftSlots = [];
  const approximateDate = Math.floor(point / MINUTES_PER_DAY);
  for (let offset = -35; offset <= 1; offset += 1) {
    const civil = approximateDate + offset;
    // Allocation/shift points use the same civil-day epoch. Finding an anchor through a known ISO date
    // is unnecessary here because the shift clock repeats identically on every civil day.
    shifts.forEach(shift => shiftSlots.push({
      start: civil * MINUTES_PER_DAY + shift.startMinutes,
      end: civil * MINUTES_PER_DAY + shift.endMinutes
    }));
  }
  shiftSlots.filter(slot => slot.start < point).sort((a, b) => b.end - a.end).forEach(slot => {
    if (remaining <= 0) return;
    const end = Math.min(slot.end, point);
    if (end <= slot.start) return;
    const used = Math.min(end - slot.start, remaining);
    point = end - used;
    remaining -= used;
  });
  return remaining > QUANTITY_EPSILON ? null : point;
}

function initialDependencyStatus(dependencies) {
  const result = { byDependencyId: {}, byAllocationId: {} };
  dependencies.forEach(dependency => {
    result.byDependencyId[dependency.dependencyId] = {
      state: 'ok',
      producerAllocationIds: [],
      consumerAllocationIds: [],
      minimumRequired: 0,
      availableAtConsumerStart: 0,
      fullRequired: 0,
      fullAvailableAt: null,
      transportState: 'not-required',
      issueIds: []
    };
  });
  return result;
}

function evaluateDependencyRules({
  normalizedAllocations,
  validShifts,
  operations,
  dependencies,
  transports,
  minimumStartRatio,
  dependencyCompletionBufferMinutes,
  allowStockSupply,
  diagnostics
}) {
  const normalizedDependencies = normalizeDependencies(dependencies, operations);
  const normalizedTransports = normalizeTransports(transports);
  const status = initialDependencyStatus(normalizedDependencies);
  const addIssue = (diagnostic, dependencyIds = []) => {
    diagnostics.push(diagnostic);
    dependencyIds.forEach(id => {
      const item = status.byDependencyId[id];
      if (!item) return;
      item.state = diagnostic.blocking ? 'broken' : 'at-risk';
      item.issueIds.push(diagnostic.issueId);
    });
  };

  if (!Number.isFinite(minimumStartRatio) || minimumStartRatio < 0 || minimumStartRatio > 1) {
    addIssue(makeDiagnostic('INVALID_DEPENDENCY_CONFIGURATION', 'dependency_configuration', 'minimumStartRatio deve estar entre 0 e 1.', {
      details: { minimumStartRatio }
    }), normalizedDependencies.map(item => item.dependencyId));
  }
  if (!Number.isFinite(dependencyCompletionBufferMinutes) || dependencyCompletionBufferMinutes < 0) {
    addIssue(makeDiagnostic('INVALID_DEPENDENCY_CONFIGURATION', 'dependency_configuration', 'dependencyCompletionBufferMinutes deve ser maior ou igual a zero.', {
      details: { dependencyCompletionBufferMinutes }
    }), normalizedDependencies.map(item => item.dependencyId));
  }

  normalizedAllocations.forEach(allocation => {
    status.byAllocationId[allocation.allocationId] = { incoming: [], outgoing: [], state: 'ok' };
  });
  if (!normalizedDependencies.length) return { dependencyStatus: status, normalizedDependencies };

  const logicalProfiles = [];
  normalizedAllocations.forEach(allocation => {
    const componentTotal = allocation.components.reduce((sum, component) => sum + (finitePositive(component.quantity) || 0), 0);
    const allocationQuantity = finitePositive(allocation.quantity);
    const invalidComponents = allocation.components.some(component => !component.parentOperationId || !finitePositive(component.quantity));
    if (!allocationQuantity || invalidComponents || Math.abs(componentTotal - allocationQuantity) > QUANTITY_EPSILON) {
      addIssue(makeDiagnostic(
        'DEPENDENCY_COMPONENT_RECONCILIATION_ERROR',
        'dependency_component_reconciliation',
        `Os componentes da allocation ${allocation.allocationId} não reconciliam com o card.`,
        {
          allocationIds: [allocation.allocationId],
          parentOperationIds: allocation.components.map(component => component.parentOperationId),
          materialIds: allocation.components.map(component => component.materialId),
          ...pointFields(allocation),
          details: { allocationQuantity: allocation.quantity, componentQuantity: componentTotal, tolerance: QUANTITY_EPSILON }
        }
      ));
      return;
    }
    const segments = productiveSegments(allocation, validShifts);
    const productiveMinutes = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
    allocation.components.forEach(component => logicalProfiles.push({
      allocationId: allocation.allocationId,
      sourceAllocationIds: uniqueStrings([...allocation.sourceAllocationIds, ...component.sourceAllocationIds]),
      parentOperationId: component.parentOperationId,
      sourceParentOperationIds: uniqueStrings([...allocation.sourceParentOperationIds, ...component.sourceParentOperationIds]),
      materialId: component.materialId || allocation.materialId,
      sourceLocation: allocation.sourceLocation,
      targetLocation: allocation.targetLocation,
      quantity: component.quantity,
      durationMinutes: allocation.durationMinutes * (component.quantity / componentTotal),
      start: allocation.start,
      end: allocation.end,
      allocation,
      segments,
      productiveMinutes
    }));
  });

  normalizedDependencies.forEach(dependency => {
    const invalid = !dependency.dependencyId
      || !dependency.producerParentOperationId
      || !dependency.consumerParentOperationId
      || !dependency.materialId
      || !finitePositive(dependency.requiredQuantity);
    if (!invalid) return;
    addIssue(makeDiagnostic('INVALID_DEPENDENCY_CONFIGURATION', 'dependency_configuration', `A dependência ${dependency.dependencyId} está incompleta.`, {
      parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
      materialIds: [dependency.materialId],
      details: { dependency }
    }), [dependency.dependencyId]);
  });

  const cyclePath = dependencyCycle(normalizedDependencies);
  if (cyclePath) {
    const cycleDependencies = normalizedDependencies.filter(edge => cyclePath.includes(edge.producerParentOperationId) && cyclePath.includes(edge.consumerParentOperationId));
    addIssue(makeDiagnostic('DEPENDENCY_CYCLE_DETECTED', 'dependency_cycle', 'Foi detectado um ciclo no grafo de dependências.', {
      parentOperationIds: cyclePath,
      materialIds: cycleDependencies.map(edge => edge.materialId),
      details: { cyclePath }
    }), cycleDependencies.map(edge => edge.dependencyId));
  }

  const transportById = new Map(normalizedTransports.map(transport => [transport.transportId, transport]));
  const groups = new Map();
  normalizedDependencies.forEach(dependency => {
    const producerParentIds = new Set(uniqueStrings([
      dependency.producerParentOperationId,
      ...dependency.sourceParentOperationIds
    ]));
    const producerProfiles = logicalProfiles.filter(profile => (
      producerParentIds.has(profile.parentOperationId)
      && (!dependency.materialId || profile.materialId === dependency.materialId)
    ));
    const consumerProfiles = logicalProfiles.filter(profile => (
      profile.parentOperationId === dependency.consumerParentOperationId
    ));
    const dependencyState = status.byDependencyId[dependency.dependencyId];
    dependencyState.producerAllocationIds = uniqueStrings(producerProfiles.map(profile => profile.allocationId));
    dependencyState.consumerAllocationIds = uniqueStrings(consumerProfiles.map(profile => profile.allocationId));
    const consumerTotal = consumerProfiles.reduce((sum, profile) => sum + profile.quantity, 0);
    const requirements = consumerProfiles.map(profile => ({
      dependency,
      profile,
      required: dependency.requiredQuantity * (profile.quantity / consumerTotal),
      minimum: dependency.requiredQuantity * (profile.quantity / consumerTotal) * minimumStartRatio
    }));
    dependencyState.minimumRequired = requirements.reduce((sum, item) => sum + item.minimum, 0);
    dependencyState.fullRequired = requirements.reduce((sum, item) => sum + item.required, 0);

    if ((!producerProfiles.length && !allowStockSupply) || !consumerProfiles.length || !(consumerTotal > 0)) {
      addIssue(makeDiagnostic('INVALID_DEPENDENCY_CONFIGURATION', 'dependency_binding', `A dependência ${dependency.dependencyId} não possui allocations vinculadas.`, {
        allocationIds: [...producerProfiles, ...consumerProfiles].map(profile => profile.allocationId),
        parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
        materialIds: [dependency.materialId],
        details: { dependencyId: dependency.dependencyId, producerFound: Boolean(producerProfiles.length), consumerFound: Boolean(consumerProfiles.length) }
      }), [dependency.dependencyId]);
      return;
    }

    const transportRequired = Boolean(dependency.transportId) || (
      Boolean(dependency.sourceLocation) && Boolean(dependency.targetLocation) && dependency.sourceLocation !== dependency.targetLocation
    );
    let supplyProfiles = producerProfiles;
    let supplyAt = point => aggregateQuantityAt(supplyProfiles, point);
    let supplyTime = quantity => aggregateQuantityTime(supplyProfiles, quantity);
    let groupKey = `${uniqueStrings(producerProfiles.map(profile => profile.parentOperationId)).join(',')}|${dependency.materialId}|${dependency.targetLocation}`;
    if (transportRequired) {
      const transport = transportById.get(dependency.transportId) || normalizedTransports.find(item => (
        item.materialId === dependency.materialId
        && (!item.sourceLocation || item.sourceLocation === dependency.sourceLocation)
        && (!item.targetLocation || item.targetLocation === dependency.targetLocation)
      ));
      if (!transport) {
        dependencyState.transportState = 'missing';
        addIssue(makeDiagnostic('TRANSPORT_REQUIRED_MISSING', 'transport_required', `A dependência ${dependency.dependencyId} exige transporte.`, {
          allocationIds: [...dependencyState.producerAllocationIds, ...dependencyState.consumerAllocationIds],
          parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
          materialIds: [dependency.materialId],
          details: { dependencyId: dependency.dependencyId, sourceLocation: dependency.sourceLocation, targetLocation: dependency.targetLocation }
        }), [dependency.dependencyId]);
        supplyAt = () => 0;
        supplyTime = () => null;
      } else if (!finitePositive(transport.quantity) || !finitePositive(transport.durationMinutes)
        || transport.materialId !== dependency.materialId
        || (transport.sourceLocation && dependency.sourceLocation && transport.sourceLocation !== dependency.sourceLocation)
        || (transport.targetLocation && dependency.targetLocation && transport.targetLocation !== dependency.targetLocation)) {
        dependencyState.transportState = 'invalid';
        addIssue(makeDiagnostic('TRANSPORT_INVALID_CONFIGURATION', 'transport_configuration', `O transporte ${transport.transportId} possui configuração inválida.`, {
          allocationIds: [...dependencyState.producerAllocationIds, ...dependencyState.consumerAllocationIds],
          parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
          materialIds: [dependency.materialId],
          details: { transport }
        }), [dependency.dependencyId]);
        supplyAt = () => 0;
        supplyTime = () => null;
      } else {
        groupKey = `transport:${transport.transportId}`;
        const availableAtOrigin = aggregateQuantityTime(producerProfiles, transport.quantity);
        const transportStart = transport.explicitStart ?? availableAtOrigin;
        const originAvailableAtStart = transportStart === null ? 0 : aggregateQuantityAt(producerProfiles, transportStart);
        if (availableAtOrigin === null || transportStart === null || originAvailableAtStart + QUANTITY_EPSILON < transport.quantity) {
          dependencyState.transportState = 'quantity-unavailable';
          addIssue(makeDiagnostic('TRANSPORT_QUANTITY_NOT_AVAILABLE', 'transport_origin_quantity', `O transporte ${transport.transportId} não possui a quantidade integral na origem ao iniciar.`, {
            allocationIds: dependencyState.producerAllocationIds,
            parentOperationIds: [dependency.producerParentOperationId],
            materialIds: [dependency.materialId],
            date: transport.startDate || null,
            startTime: transport.startTime || null,
            details: { transportId: transport.transportId, requiredQuantity: transport.quantity, availableQuantity: originAvailableAtStart, deficit: Math.max(transport.quantity - originAvailableAtStart, 0) }
          }), [dependency.dependencyId]);
          supplyAt = () => 0;
          supplyTime = () => null;
        } else {
          const transportEnd = transport.explicitEnd ?? transportStart + transport.durationMinutes;
          const invalidExplicitInterval = transport.explicitEnd !== null && (
            transport.explicitEnd <= transportStart
            || Math.abs((transport.explicitEnd - transportStart) - transport.durationMinutes) > QUANTITY_EPSILON
          );
          if (invalidExplicitInterval) {
            dependencyState.transportState = 'invalid';
            addIssue(makeDiagnostic('TRANSPORT_INVALID_CONFIGURATION', 'transport_configuration', `O intervalo do transporte ${transport.transportId} não corresponde à duração configurada.`, {
              allocationIds: dependencyState.consumerAllocationIds,
              parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
              materialIds: [dependency.materialId],
              details: { transportId: transport.transportId, durationMinutes: transport.durationMinutes, actualDurationMinutes: transport.explicitEnd - transportStart }
            }), [dependency.dependencyId]);
          }
          if (!invalidExplicitInterval) dependencyState.transportState = 'completed';
          supplyAt = point => point + QUANTITY_EPSILON >= transportEnd ? transport.quantity : 0;
          supplyTime = quantity => quantity <= transport.quantity + QUANTITY_EPSILON ? transportEnd : null;
          const earlyConsumers = consumerProfiles.filter(profile => profile.start + QUANTITY_EPSILON < transportEnd);
          if (earlyConsumers.length) {
            dependencyState.transportState = 'not-completed';
            addIssue(makeDiagnostic('TRANSPORT_NOT_COMPLETED', 'transport_completion', `O transporte ${transport.transportId} ainda não terminou no início do consumo.`, {
              allocationIds: earlyConsumers.map(profile => profile.allocationId),
              parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
              materialIds: [dependency.materialId],
              ...pointFields(earlyConsumers[0].allocation),
              details: { transportId: transport.transportId, transportStart, transportEnd }
            }), [dependency.dependencyId]);
          }
        }
      }
    }
    if (!groups.has(groupKey)) groups.set(groupKey, { requirements: [], supplyAt, supplyTime, profiles: supplyProfiles });
    groups.get(groupKey).requirements.push(...requirements);
  });

  if (!cyclePath) groups.forEach(group => {
    const requirements = group.requirements.filter(item => finitePositive(item.required));
    const demandAt = point => requirements.reduce((sum, item) => {
      if (point < item.profile.start) return sum;
      return sum + Math.max(item.minimum, item.required * progressAt(item.profile, point));
    }, 0);
    const starts = [...new Set(requirements.map(item => item.profile.start))].sort((a, b) => a - b);
    const minimumFailures = new Set();
    starts.forEach(point => {
      const batch = requirements.filter(item => item.profile.start === point);
      const demand = demandAt(point);
      const available = group.supplyAt(point);
      if (available + QUANTITY_EPSILON >= demand) return;
      const allocationIds = uniqueStrings(batch.map(item => item.profile.allocationId));
      const dependencyIds = uniqueStrings(batch.map(item => item.dependency.dependencyId));
      batch.forEach(item => minimumFailures.add(`${item.dependency.dependencyId}|${item.profile.allocationId}`));
      addIssue(makeDiagnostic('DEPENDENCY_MINIMUM_NOT_AVAILABLE', 'dependency_minimum_start', 'A oferta disponível não atende ao mínimo simultâneo para início do consumo.', {
        allocationIds,
        parentOperationIds: batch.flatMap(item => [item.dependency.producerParentOperationId, item.dependency.consumerParentOperationId]),
        materialIds: batch.map(item => item.dependency.materialId),
        ...pointFields(batch[0]?.profile.allocation),
        details: {
          minimumStartRatio,
          totalRequiredAtStart: demand,
          availableQuantity: available,
          deficit: Math.max(demand - available, 0),
          individualDemands: batch.map(item => ({ allocationId: item.profile.allocationId, dependencyId: item.dependency.dependencyId, requiredQuantity: item.minimum }))
        }
      }), dependencyIds);
    });

    const flowPoints = [...new Set([
      ...requirements.flatMap(item => item.profile.segments.flatMap(segment => [segment.start, segment.end])),
      ...group.profiles.flatMap(profile => profile.segments.flatMap(segment => [segment.start, segment.end]))
    ])].sort((a, b) => a - b);
    flowPoints.forEach(point => {
      const demand = demandAt(point);
      const available = group.supplyAt(point);
      if (available + QUANTITY_EPSILON >= demand) return;
      const affected = requirements.filter(item => item.profile.start < point && point <= item.profile.end
        && !minimumFailures.has(`${item.dependency.dependencyId}|${item.profile.allocationId}`));
      if (!affected.length) return;
      addIssue(makeDiagnostic('DEPENDENCY_FULL_QUANTITY_NOT_AVAILABLE', 'dependency_progressive_flow', 'O consumo progride mais rápido do que a disponibilidade do insumo.', {
        allocationIds: affected.map(item => item.profile.allocationId),
        parentOperationIds: affected.flatMap(item => [item.dependency.producerParentOperationId, item.dependency.consumerParentOperationId]),
        materialIds: affected.map(item => item.dependency.materialId),
        ...pointFields(affected[0]?.profile.allocation),
        details: { checkpoint: point, requiredQuantity: demand, availableQuantity: available, deficit: Math.max(demand - available, 0) }
      }), uniqueStrings(affected.map(item => item.dependency.dependencyId)));
    });

    requirements.forEach(item => {
      const dependencyState = status.byDependencyId[item.dependency.dependencyId];
      dependencyState.availableAtConsumerStart += group.supplyAt(item.profile.start);
      const deadline = previousProductivePoint(item.profile.end, dependencyCompletionBufferMinutes, validShifts);
      const requiredThroughDeadline = requirements.filter(candidate => candidate.profile.start <= item.profile.start)
        .reduce((sum, candidate) => sum + candidate.required, 0);
      const fullAvailableAt = group.supplyTime(requiredThroughDeadline);
      if (fullAvailableAt !== null) dependencyState.fullAvailableAt = dependencyState.fullAvailableAt === null
        ? fullAvailableAt
        : Math.max(dependencyState.fullAvailableAt, fullAvailableAt);
      if (deadline !== null && fullAvailableAt !== null && fullAvailableAt <= deadline + QUANTITY_EPSILON) return;
      if (minimumFailures.has(`${item.dependency.dependencyId}|${item.profile.allocationId}`)) return;
      addIssue(makeDiagnostic('DEPENDENCY_FULL_QUANTITY_NOT_AVAILABLE', 'dependency_completion_buffer', 'A quantidade integral do insumo não fica disponível dentro do limite com buffer.', {
        allocationIds: [item.profile.allocationId],
        parentOperationIds: [item.dependency.producerParentOperationId, item.dependency.consumerParentOperationId],
        materialIds: [item.dependency.materialId],
        ...pointFields(item.profile.allocation),
        details: {
          dependencyCompletionBufferMinutes,
          requiredQuantity: item.required,
          cumulativeRequiredQuantity: requiredThroughDeadline,
          availableQuantity: deadline === null ? 0 : group.supplyAt(deadline),
          deficit: deadline === null ? item.required : Math.max(requiredThroughDeadline - group.supplyAt(deadline), 0),
          fullAvailableAt,
          deadline
        }
      }), [item.dependency.dependencyId]);
    });
  });

  normalizedDependencies.forEach(dependency => {
    const item = status.byDependencyId[dependency.dependencyId];
    item.issueIds = uniqueStrings(item.issueIds);
    [...item.producerAllocationIds].forEach(allocationId => {
      status.byAllocationId[allocationId] ||= { incoming: [], outgoing: [], state: 'ok' };
      status.byAllocationId[allocationId].outgoing.push(dependency.dependencyId);
      if (item.state === 'broken') status.byAllocationId[allocationId].state = 'broken';
      else if (item.state === 'at-risk' && status.byAllocationId[allocationId].state === 'ok') status.byAllocationId[allocationId].state = 'at-risk';
    });
    [...item.consumerAllocationIds].forEach(allocationId => {
      status.byAllocationId[allocationId] ||= { incoming: [], outgoing: [], state: 'ok' };
      status.byAllocationId[allocationId].incoming.push(dependency.dependencyId);
      if (item.state === 'broken') status.byAllocationId[allocationId].state = 'broken';
      else if (item.state === 'at-risk' && status.byAllocationId[allocationId].state === 'ok') status.byAllocationId[allocationId].state = 'at-risk';
    });
  });
  normalizedAllocations.forEach(allocation => {
    status.byAllocationId[allocation.allocationId] ||= { incoming: [], outgoing: [], state: 'ok' };
  });
  Object.values(status.byAllocationId).forEach(item => {
    item.incoming = uniqueStrings(item.incoming);
    item.outgoing = uniqueStrings(item.outgoing);
  });
  return { dependencyStatus: status, normalizedDependencies };
}

export function validateManualScheduleTemporalRules({
  draft,
  shifts = [],
  manualWorkDates = [],
  holidays = [],
  timezone = null,
  operations = [],
  dependencies = [],
  transports = [],
  minimumStartRatio = DEFAULT_MINIMUM_START_RATIO,
  dependencyCompletionBufferMinutes = DEFAULT_DEPENDENCY_COMPLETION_BUFFER_MINUTES,
  stock,
  stockMinimums,
  stockLocations,
  quantityPrecision = 6,
  setupMinutes = 0,
  setupRules = [],
  dailyTeamOverrides = {},
  teamOverrides = [],
  setupOverrides = []
} = {}) {
  const sourceAllocations = Array.isArray(draft?.allocations) ? draft.allocations : [];
  const normalizedAllocations = sourceAllocations.map(normalizeAllocation);
  const normalizedShifts = (Array.isArray(shifts) ? shifts : []).map(normalizeShift);
  const validShifts = normalizedShifts.filter(shift => shift.valid);
  const releasedDates = normalizedDateSet(manualWorkDates);
  const suppliedHolidays = normalizedDateSet(holidays);
  const diagnostics = [];

  normalizedShifts.filter(shift => !shift.valid).forEach(shift => {
    diagnostics.push(makeDiagnostic(
      'INVALID_SHIFT_CONFIGURATION',
      'shift_configuration',
      `O turno ${shift.label} possui horário inicial ou final inválido.`,
      {
        startTime: shift.startTime,
        endTime: shift.endTime,
        details: { shiftId: shift.shiftId, timezone }
      }
    ));
  });

  findOverlappingShiftPairs(validShifts).forEach(([left, right]) => {
    diagnostics.push(makeDiagnostic(
      'OVERLAPPING_SHIFTS_CONFIGURATION',
      'shift_configuration_overlap',
      `Os turnos ${left.label} e ${right.label} possuem janelas sobrepostas.`,
      {
        startTime: left.startTime,
        endTime: left.endTime,
        details: { shiftIds: [left.shiftId, right.shiftId].sort(), timezone }
      }
    ));
  });

  normalizedAllocations.forEach(allocation => {
    if (!allocation.validDate) {
      diagnostics.push(makeDiagnostic(
        'INVALID_ALLOCATION_DATE',
        'allocation_date',
        `A allocation ${allocation.allocationId} possui data inválida.`,
        {
          allocationIds: [allocation.allocationId],
          machineIds: [allocation.machineId],
          date: allocation.date,
          startTime: allocation.startTime,
          endTime: allocation.endTime,
          details: { endDate: allocation.endDate, timezone }
        }
      ));
    }
    if (!allocation.validTime) {
      diagnostics.push(makeDiagnostic(
        'INVALID_ALLOCATION_TIME',
        'allocation_time',
        `A allocation ${allocation.allocationId} possui intervalo de horário inválido.`,
        {
          allocationIds: [allocation.allocationId],
          machineIds: [allocation.machineId],
          date: allocation.validDate ? allocation.date : null,
          startTime: allocation.startTime,
          endTime: allocation.endTime,
          details: { endDate: allocation.endDate, timezone }
        }
      ));
    }
    if (!allocation.validDate || !allocation.validTime) return;

    if (!releasedDates.has(allocation.date) && (isWeekend(allocation.date) || isKnownHoliday(allocation.date, suppliedHolidays))) {
      diagnostics.push(makeDiagnostic(
        'NON_WORKING_DATE_NOT_RELEASED',
        'working_date',
        `A data ${allocation.date} não é útil e não foi liberada para produção manual.`,
        {
          allocationIds: [allocation.allocationId],
          machineIds: [allocation.machineId],
          date: allocation.date,
          startTime: allocation.startTime,
          endTime: allocation.endTime,
          details: {
            weekend: isWeekend(allocation.date),
            holiday: isKnownHoliday(allocation.date, suppliedHolidays),
            timezone
          }
        }
      ));
    }

    if (!validShifts.length) {
      diagnostics.push(makeDiagnostic(
        'SHIFT_NOT_FOUND',
        'shift_coverage',
        `Não existe turno válido para cobrir a allocation ${allocation.allocationId}.`,
        {
          allocationIds: [allocation.allocationId],
          machineIds: [allocation.machineId],
          date: allocation.date,
          startTime: allocation.startTime,
          endTime: allocation.endTime,
          details: { timezone }
        }
      ));
      return;
    }

    const intervals = shiftIntervalsForAllocation(allocation, validShifts);
    if (!intervalIsCovered(allocation, intervals)) {
      diagnostics.push(makeDiagnostic(
        'ALLOCATION_OUTSIDE_SHIFT',
        'shift_coverage',
        `A allocation ${allocation.allocationId} não está integralmente coberta pelos turnos válidos.`,
        {
          allocationIds: [allocation.allocationId],
          machineIds: [allocation.machineId],
          date: allocation.date,
          startTime: allocation.startTime,
          endTime: allocation.endTime,
          details: { endDate: allocation.endDate, timezone }
        }
      ));
    }
  });

  const allocationsByMachine = new Map();
  normalizedAllocations.filter(allocation => allocation.validDate && allocation.validTime).forEach(allocation => {
    if (!allocationsByMachine.has(allocation.machineId)) allocationsByMachine.set(allocation.machineId, []);
    allocationsByMachine.get(allocation.machineId).push(allocation);
  });
  [...allocationsByMachine.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([machineId, allocations]) => {
    allocations.sort((left, right) => left.start - right.start || left.end - right.end || left.allocationId.localeCompare(right.allocationId));
    for (let leftIndex = 0; leftIndex < allocations.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < allocations.length; rightIndex += 1) {
        const left = allocations[leftIndex];
        const right = allocations[rightIndex];
        if (right.start >= left.end) break;
        if (!intervalsOverlap(left, right)) continue;
        diagnostics.push(makeDiagnostic(
          'MACHINE_TIME_OVERLAP',
          'machine_time_overlap',
          `As allocations ${left.allocationId} e ${right.allocationId} se sobrepõem na máquina ${machineId}.`,
          {
            allocationIds: [left.allocationId, right.allocationId],
            machineIds: [machineId],
            date: right.date,
            startTime: right.startTime,
            endTime: left.end <= right.end ? left.endTime : right.endTime,
            details: { timezone }
          }
        ));
      }
    }
  });

  const { dependencyStatus, normalizedDependencies } = evaluateDependencyRules({
    normalizedAllocations,
    validShifts,
    operations,
    dependencies,
    transports,
    minimumStartRatio: Number(minimumStartRatio),
    dependencyCompletionBufferMinutes: Number(dependencyCompletionBufferMinutes),
    allowStockSupply: stock !== undefined || stockMinimums !== undefined || stockLocations !== undefined,
    diagnostics
  });

  const stockLedgerEnabled = stock !== undefined || stockMinimums !== undefined || stockLocations !== undefined;
  let stockProjection = {
    byMaterial: {},
    timeline: [],
    summary: {
      materialCount: 0,
      locationCount: 0,
      eventCount: 0,
      shortageCount: 0,
      minimumWarningCount: 0,
      firstShortageAt: null,
      materialsWithShortage: []
    }
  };
  if (stockLedgerEnabled) {
    const supersededRules = new Set([
      'dependency_minimum_start',
      'dependency_progressive_flow',
      'dependency_completion_buffer',
      'transport_origin_quantity',
      'transport_completion'
    ]);
    for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
      if (supersededRules.has(diagnostics[index].rule)) diagnostics.splice(index, 1);
    }
    const ledgerResult = buildManualScheduleStockLedger({
      normalizedAllocations,
      normalizedDependencies,
      normalizedTransports: normalizeTransports(transports),
      productiveSegments: allocation => productiveSegments(allocation, validShifts),
      stock,
      stockMinimums,
      stockLocations,
      minimumStartRatio: Number(minimumStartRatio),
      quantityPrecision
    });
    stockProjection = ledgerResult.stockProjection;
    ledgerResult.diagnostics.forEach(item => diagnostics.push(makeDiagnostic(item.code, item.rule, item.message, item)));
    const retainedIssueIds = new Set(diagnostics.map(item => item.issueId));
    Object.entries(dependencyStatus.byDependencyId).forEach(([dependencyId, item]) => {
      item.issueIds = uniqueStrings([
        ...item.issueIds.filter(issueId => retainedIssueIds.has(issueId)),
        ...diagnostics.filter(diagnostic => diagnostic.dependencyIds.includes(dependencyId)).map(diagnostic => diagnostic.issueId)
      ]);
      const issues = diagnostics.filter(diagnostic => item.issueIds.includes(diagnostic.issueId));
      item.state = issues.some(issue => issue.blocking) ? 'broken' : (issues.length ? 'at-risk' : 'ok');
    });
    Object.values(dependencyStatus.byAllocationId).forEach(item => {
      const related = uniqueStrings([...item.incoming, ...item.outgoing]).map(id => dependencyStatus.byDependencyId[id]).filter(Boolean);
      item.state = related.some(dependency => dependency.state === 'broken') ? 'broken' : (related.some(dependency => dependency.state === 'at-risk') ? 'at-risk' : 'ok');
    });
  }

  const resourceValidation = validateManualScheduleResources({
    draft,
    shifts,
    setupMinutes,
    setupRules,
    dailyTeamOverrides,
    teamOverrides,
    setupOverrides,
    manualWorkDates,
    holidays
  });
  [...resourceValidation.setupConflicts, ...resourceValidation.teamConflicts]
    .forEach(item => diagnostics.push(makeDiagnostic(item.code, item.rule, item.message, item)));

  diagnostics.sort((left, right) => (
    String(left.date || '').localeCompare(String(right.date || ''))
    || String(left.startTime || '').localeCompare(String(right.startTime || ''))
    || left.code.localeCompare(right.code)
    || left.issueId.localeCompare(right.issueId)
  ));
  const errors = diagnostics.filter(diagnostic => diagnostic.severity === 'error');
  const warnings = diagnostics.filter(diagnostic => diagnostic.severity === 'warning');
  const affectedAllocations = buildAffectedAllocations(diagnostics);
  const invalidAllocationIds = new Set(errors.flatMap(error => error.allocationIds));
  const transportConflicts = diagnostics.filter(diagnostic => diagnostic.code.startsWith('TRANSPORT_'));
  const stockConflicts = diagnostics.filter(diagnostic => (
    diagnostic.code.startsWith('STOCK_')
    || diagnostic.code === 'NEGATIVE_INITIAL_STOCK'
    || diagnostic.code.startsWith('INVALID_STOCK_')
  ));

  return {
    valid: !errors.some(error => error.blocking),
    errors,
    warnings,
    affectedAllocations,
    summary: {
      allocationCount: normalizedAllocations.length,
      validAllocationCount: normalizedAllocations.filter(allocation => !invalidAllocationIds.has(allocation.allocationId)).length,
      errorCount: errors.length,
      warningCount: warnings.length,
      invalidDateCount: countDiagnostics(errors, 'INVALID_ALLOCATION_DATE'),
      nonWorkingDateCount: countDiagnostics(errors, 'NON_WORKING_DATE_NOT_RELEASED'),
      outsideShiftCount: countDiagnostics(errors, 'ALLOCATION_OUTSIDE_SHIFT'),
      machineOverlapCount: countDiagnostics(errors, 'MACHINE_TIME_OVERLAP'),
      shiftConfigurationErrorCount: errors.filter(error => [
        'INVALID_SHIFT_CONFIGURATION',
        'OVERLAPPING_SHIFTS_CONFIGURATION'
      ].includes(error.code)).length
    },
    timeline: buildTimeline(normalizedAllocations, validShifts),
    dependencyStatus,
    transportConflicts,
    stockProjection,
    stockConflicts,
    setupIntervals: resourceValidation.setupIntervals,
    setupConflicts: diagnostics.filter(diagnostic => diagnostic.code.startsWith('SETUP_') || diagnostic.code === 'INVALID_SETUP_CONFIGURATION'),
    teamConflicts: diagnostics.filter(diagnostic => diagnostic.code.startsWith('TEAM_') || diagnostic.code === 'INVALID_TEAM_OVERRIDE'),
    resourceProjection: resourceValidation.resourceProjection
  };
}
