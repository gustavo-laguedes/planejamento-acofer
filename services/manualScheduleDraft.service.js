import {
  resolveMaterialProductivityLines,
  resolveProductivityConfiguration
} from './productivityMatrixResolution.service.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EPSILON = 0.001;
const DEFAULT_DAILY_MINUTES = 528;
export const MANUAL_SCHEDULE_PERCENT_PRECISION = 2;
export const MANUAL_SCHEDULE_QUANTITY_PRECISION = 6;
const NO_PRODUCTIVITY_MESSAGE = 'Não existe produtividade cadastrada para este material na máquina selecionada com esta quantidade de pessoas.';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix = 'draft') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function isValidDateOnly(value) {
  const normalized = String(value || '').slice(0, 10);
  if (!DATE_PATTERN.test(normalized)) return false;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeUnit(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(value) {
  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function normalizedMachineIds(machines = []) {
  return new Set((Array.isArray(machines) ? machines : [])
    .flatMap(machine => [machine?.machineId, machine?.machineName, machine?.id, machine?.name])
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(String));
}

function allocationTraceIds(allocation = {}) {
  const ids = Array.isArray(allocation.sourceAllocationIds) && allocation.sourceAllocationIds.length
    ? allocation.sourceAllocationIds
    : [allocation.allocationId];
  return ids.map(String).filter(Boolean);
}

function allocationParentIds(allocation = {}) {
  const ids = Array.isArray(allocation.sourceParentOperationIds) && allocation.sourceParentOperationIds.length
    ? allocation.sourceParentOperationIds
    : [allocation.parentOperationId];
  return ids.map(String).filter(Boolean);
}

function normalizeComponents(allocation = {}) {
  const components = Array.isArray(allocation.components) && allocation.components.length
    ? allocation.components
    : [{
        allocationId: allocation.allocationId,
        parentOperationId: allocation.parentOperationId || allocation.calendarParentOperationId || allocation.operationId || '',
        productionId: allocation.productionId || allocation.productionKey || `production-${allocation.productionIndex || 0}`,
        quantity: allocation.quantity ?? allocation.produceQty
      }];
  return components
    .map(component => ({
      ...component,
      allocationId: String(component.allocationId || allocation.allocationId || ''),
      parentOperationId: String(component.parentOperationId || allocation.parentOperationId || ''),
      productionId: String(component.productionId || allocation.productionId || ''),
      quantity: toNumber(component.quantity)
    }))
    .filter(component => component.quantity > 0);
}

function normalizeAllocation(allocation = {}, index = 0) {
  const allocationId = String(allocation.allocationId || createId('alloc'));
  const durationMinutes = toNumber(allocation.durationMinutes ?? allocation.duration);
  return {
    ...allocation,
    allocationId,
    parentOperationId: String(allocation.parentOperationId || allocation.calendarParentOperationId || allocation.operationId || ''),
    productionId: String(allocation.productionId || allocation.productionKey || `production-${allocation.productionIndex || 0}`),
    materialId: String(allocation.materialId ?? allocation.material_id ?? ''),
    machineId: String(allocation.machineId ?? allocation.machine_id ?? allocation.machineName ?? allocation.machine_name ?? ''),
    date: String(allocation.date || allocation.startDate || '').slice(0, 10),
    startTime: String(allocation.startTime || '07:00').slice(0, 5),
    endTime: String(allocation.endTime || allocation.startTime || '07:00').slice(0, 5),
    quantity: toNumber(allocation.quantity ?? allocation.produceQty),
    unit: String(allocation.unit ?? allocation.plannedUnit ?? allocation.planned_unit ?? allocation.outputUnit ?? allocation.output_unit ?? ''),
    durationMinutes,
    capacityPercent: allocation.capacityPercent === null || allocation.capacityPercent === undefined
      ? null
      : toNumber(allocation.capacityPercent, null),
    peopleCount: toNumber(allocation.peopleCount ?? allocation.people_count),
    sequence: Number.isFinite(Number(allocation.sequence)) ? Number(allocation.sequence) : index + 1,
    source: allocation.source === 'manual' ? 'manual' : 'automatic',
    pinned: Boolean(allocation.pinned),
    sourceAllocationIds: allocationTraceIds({ ...allocation, allocationId }),
    sourceParentOperationIds: allocationParentIds(allocation),
    components: normalizeComponents({ ...allocation, allocationId })
  };
}

function parentTotals(allocations = []) {
  return allocations.reduce((totals, allocation) => {
    const components = normalizeComponents(allocation);
    components.forEach(component => {
      const key = String(component.parentOperationId || '');
      totals.set(key, toNumber(totals.get(key)) + toNumber(component.quantity));
    });
    return totals;
  }, new Map());
}

function traceIdSet(allocations = []) {
  return allocations.reduce((set, allocation) => {
    allocationTraceIds(allocation).forEach(id => set.add(id));
    return set;
  }, new Set());
}

function consolidationKey(allocation = {}) {
  return [
    allocation.materialId,
    allocation.machineId,
    allocation.date,
    allocation.unit,
    allocation.peopleCount
  ].map(value => String(value || '')).join('|');
}

function mergeComponents(...groups) {
  return groups
    .flat()
    .map(component => ({ ...component, quantity: toNumber(component.quantity) }))
    .filter(component => component.quantity > 0);
}

function splitComponentsByQuantity(components = [], quantity) {
  const wanted = Math.max(toNumber(quantity), 0);
  const total = components.reduce((sum, component) => sum + toNumber(component.quantity), 0);
  if (!(wanted > 0) || !(total > 0)) return [];
  return components.map(component => ({
    ...component,
    quantity: Number((toNumber(component.quantity) * (wanted / total)).toFixed(6))
  })).filter(component => component.quantity > 0);
}

function fixedUnits(value, precision) {
  return Math.round(toNumber(value) * (10 ** precision));
}

function unitsValue(value, precision) {
  return Number((value / (10 ** precision)).toFixed(precision));
}

function clockMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').slice(0, 5));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? (hours * 60) + minutes : null;
}

function minutesClock(value) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function applySequentialTimes(allocations = [], { startTime = '07:00', overrideAllocationIds = [] } = {}) {
  const overrideIds = new Set(overrideAllocationIds.map(String));
  let cursor = clockMinutes(startTime);
  if (cursor === null) cursor = clockMinutes('07:00');
  return allocations.map(allocation => {
    const duration = Math.ceil(toNumber(allocation.durationMinutes));
    const start = cursor;
    const end = cursor + Math.max(duration, 1);
    cursor = end;
    return {
      ...allocation,
      startTime: minutesClock(start),
      endTime: minutesClock(end),
      endDate: addDays(allocation.date, Math.floor(end / 1440)),
      isCapacityOverride: Boolean(allocation.isCapacityOverride || overrideIds.has(String(allocation.allocationId)))
    };
  });
}

function splitError(message, code = 'ALLOCATION_SPLIT_INVALID') {
  return Object.assign(new Error(message), { code });
}

function partitionComponents(components, firstQuantityUnits, totalQuantityUnits, firstAllocationId, secondAllocationId) {
  const normalized = normalizeComponents({ components });
  if (!normalized.length) return [[], []];
  const componentUnits = normalized.map(component => fixedUnits(component.quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION));
  const componentTotalUnits = componentUnits.reduce((sum, value) => sum + value, 0);
  if (!(componentTotalUnits > 0)) return [[], []];

  const apportioned = componentUnits.map((value, index) => {
    const numerator = value * firstQuantityUnits;
    return { index, units: Math.floor(numerator / totalQuantityUnits), remainder: numerator % totalQuantityUnits };
  });
  let missing = firstQuantityUnits - apportioned.reduce((sum, item) => sum + item.units, 0);
  [...apportioned]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach(item => {
      if (missing <= 0 || item.units >= componentUnits[item.index]) return;
      item.units += 1;
      missing -= 1;
    });
  if (missing !== 0 || componentTotalUnits !== totalQuantityUnits) {
    throw splitError('Os componentes da allocation original não reconciliam com sua quantidade.', 'ALLOCATION_SPLIT_COMPONENTS_INVALID');
  }

  const first = [];
  const second = [];
  apportioned.sort((left, right) => left.index - right.index).forEach(item => {
    const component = normalized[item.index];
    const secondUnits = componentUnits[item.index] - item.units;
    if (item.units > 0) first.push({
      ...component,
      allocationId: firstAllocationId,
      quantity: unitsValue(item.units, MANUAL_SCHEDULE_QUANTITY_PRECISION)
    });
    if (secondUnits > 0) second.push({
      ...component,
      allocationId: secondAllocationId,
      quantity: unitsValue(secondUnits, MANUAL_SCHEDULE_QUANTITY_PRECISION)
    });
  });
  return [first, second];
}

function normalizedRelativePercentUnits(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw splitError('Informe percentuais numéricos válidos.');
  const units = fixedUnits(numeric, MANUAL_SCHEDULE_PERCENT_PRECISION);
  if (Math.abs(numeric - unitsValue(units, MANUAL_SCHEDULE_PERCENT_PRECISION)) > Number.EPSILON * Math.max(1, Math.abs(numeric))) {
    throw splitError(`Use no máximo ${MANUAL_SCHEDULE_PERCENT_PRECISION} casas decimais no percentual.`);
  }
  if (!(units > 0) || units > 100 * (10 ** MANUAL_SCHEDULE_PERCENT_PRECISION)) {
    throw splitError('Cada parte deve ser maior que 0% e menor ou igual a 100%.');
  }
  return units;
}

function partitionUnits(totalUnits, ratioUnits) {
  const values = [];
  let used = 0;
  ratioUnits.forEach((ratio, index) => {
    const units = index === ratioUnits.length - 1
      ? totalUnits - used
      : Math.round(totalUnits * ratio / (100 * (10 ** MANUAL_SCHEDULE_PERCENT_PRECISION)));
    if (!(units > 0)) throw splitError('Uma parte resultou em quantidade zero após o arredondamento.');
    values.push(units);
    used += units;
  });
  if (used !== totalUnits) throw splitError('A distribuição não reconciliou com o total selecionado.');
  return values;
}

function partitionProductionMemberships(memberships, ratioUnits) {
  const source = Array.isArray(memberships) ? memberships : [];
  const parts = ratioUnits.map(() => []);
  source.forEach(membership => {
    const quantity = membership?.quantity;
    const resolved = membership?.quantitySource !== 'legacy-unresolved'
      && quantity !== null
      && quantity !== undefined
      && quantity !== ''
      && Number.isFinite(Number(quantity));
    if (!resolved) {
      const unresolved = {
        ...clone(membership),
        quantitySource: 'legacy-unresolved'
      };
      delete unresolved.quantity;
      parts.forEach(part => part.push(clone(unresolved)));
      return;
    }
    const quantityUnits = fixedUnits(quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION);
    const quantityParts = partitionUnits(quantityUnits, ratioUnits);
    quantityParts.forEach((partQuantity, index) => {
      parts[index].push({
        ...clone(membership),
        quantity: unitsValue(partQuantity, MANUAL_SCHEDULE_QUANTITY_PRECISION),
        quantitySource: String(membership.quantitySource || 'production-breakdown')
      });
    });
  });
  return parts;
}

function partitionComponentsForQuantities(components, quantityUnits, allocationIds) {
  let remaining = normalizeComponents({ components }).map(component => ({
    component,
    units: fixedUnits(component.quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION)
  }));
  let remainingTotal = remaining.reduce((sum, item) => sum + item.units, 0);
  if (remainingTotal !== quantityUnits.reduce((sum, value) => sum + value, 0)) {
    throw splitError('Os componentes da allocation selecionada não reconciliam com sua quantidade.', 'ALLOCATION_SPLIT_COMPONENTS_INVALID');
  }
  return quantityUnits.map((wanted, partIndex) => {
    if (partIndex === quantityUnits.length - 1) {
      return remaining.filter(item => item.units > 0).map(item => ({
        ...item.component,
        allocationId: allocationIds[partIndex],
        quantity: unitsValue(item.units, MANUAL_SCHEDULE_QUANTITY_PRECISION)
      }));
    }
    const apportioned = remaining.map((item, index) => ({
      index,
      units: Math.floor(item.units * wanted / remainingTotal),
      remainder: (item.units * wanted) % remainingTotal
    }));
    let missing = wanted - apportioned.reduce((sum, item) => sum + item.units, 0);
    [...apportioned]
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
      .forEach(item => {
        if (missing <= 0 || item.units >= remaining[item.index].units) return;
        item.units += 1;
        missing -= 1;
      });
    if (missing !== 0) throw splitError('Não foi possível reconciliar os componentes da parte.');
    const result = apportioned.filter(item => item.units > 0).map(item => ({
      ...remaining[item.index].component,
      allocationId: allocationIds[partIndex],
      quantity: unitsValue(item.units, MANUAL_SCHEDULE_QUANTITY_PRECISION)
    }));
    remaining = remaining.map((item, index) => ({ ...item, units: item.units - apportioned[index].units }));
    remainingTotal -= wanted;
    return result;
  });
}

function splitLineage(original, relativePercent, order, siblingCount, groupId) {
  const rootId = String(original.splitRootAllocationId || original.allocationId);
  const parentPath = String(original.splitPath || '');
  const parentAccumulated = Number.isFinite(Number(original.splitAccumulatedRatioPercent))
    ? Number(original.splitAccumulatedRatioPercent)
    : 100;
  return {
    splitGroupId: groupId,
    splitRootAllocationId: rootId,
    splitParentAllocationId: original.allocationId,
    splitDepth: Number(original.splitDepth || 0) + 1,
    splitOrder: order,
    splitSiblingCount: siblingCount,
    splitRatioPercent: relativePercent,
    splitAccumulatedRatioPercent: Number((parentAccumulated * relativePercent / 100).toFixed(6)),
    splitPath: parentPath ? `${parentPath}.${order}` : String(order),
    splitRootQuantity: Number(original.splitRootQuantity ?? original.quantity),
    splitRootCapacityPercent: Number(original.splitRootCapacityPercent ?? original.capacityPercent)
  };
}

export function buildManualScheduleAllocationParts(allocation, relativePercents, { splitGroupId = null } = {}) {
  const original = normalizeAllocation(allocation);
  const values = Array.isArray(relativePercents) ? relativePercents : [];
  if (values.length < 2) throw splitError('A divisão deve possuir pelo menos duas partes.');
  if (values.length > 100) throw splitError('A divisão excede o limite técnico de 100 partes.');
  const ratioUnits = values.map(normalizedRelativePercentUnits);
  const relativeTotalUnits = ratioUnits.reduce((sum, value) => sum + value, 0);
  const hundredUnits = 100 * (10 ** MANUAL_SCHEDULE_PERCENT_PRECISION);
  if (relativeTotalUnits !== hundredUnits) throw splitError('A soma dos percentuais relativos deve ser exatamente 100%.');

  const capacityUnits = fixedUnits(original.capacityPercent, MANUAL_SCHEDULE_PERCENT_PRECISION);
  const quantityTotalUnits = fixedUnits(original.quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION);
  const durationTotalUnits = fixedUnits(original.durationMinutes, MANUAL_SCHEDULE_QUANTITY_PRECISION);
  if (!(capacityUnits > 0) || !(quantityTotalUnits >= values.length) || !(durationTotalUnits >= values.length)) {
    throw splitError('A allocation selecionada não possui precisão suficiente para todas as partes.');
  }
  const capacityParts = partitionUnits(capacityUnits, ratioUnits);
  const quantityParts = partitionUnits(quantityTotalUnits, ratioUnits);
  const durationParts = partitionUnits(durationTotalUnits, ratioUnits);
  const start = clockMinutes(original.startTime);
  const end = clockMinutes(original.endTime);
  if (start === null || end === null || String(original.endDate || original.date) !== original.date || end <= start) {
    throw splitError('A allocation selecionada não representa um único intervalo diário divisível.', 'ALLOCATION_SPLIT_AMBIGUOUS');
  }
  const clockParts = partitionUnits(end - start, ratioUnits);
  const groupId = String(splitGroupId || createId(`split:${original.allocationId}`));
  const allocationIds = values.map((_, index) => `${groupId}:part-${index + 1}`);
  if (new Set(allocationIds).size !== allocationIds.length) throw splitError('A divisão gerou IDs duplicados.');
  const componentParts = partitionComponentsForQuantities(normalizeComponents(original), quantityParts, allocationIds);
  const productionMembershipParts = partitionProductionMemberships(original.productionMemberships, ratioUnits);
  let cursor = start;
  const parts = values.map((value, index) => {
    const partStart = cursor;
    cursor += clockParts[index];
    const relativePercent = unitsValue(ratioUnits[index], MANUAL_SCHEDULE_PERCENT_PRECISION);
    const allocationId = allocationIds[index];
    return {
      ...original,
      ...splitLineage(original, relativePercent, index + 1, values.length, groupId),
      allocationId,
      splitPartId: allocationId,
      source: 'manual',
      pinned: true,
      startTime: minutesClock(partStart),
      endTime: index === values.length - 1 ? original.endTime : minutesClock(cursor),
      quantity: unitsValue(quantityParts[index], MANUAL_SCHEDULE_QUANTITY_PRECISION),
      durationMinutes: unitsValue(durationParts[index], MANUAL_SCHEDULE_QUANTITY_PRECISION),
      capacityPercent: unitsValue(capacityParts[index], MANUAL_SCHEDULE_PERCENT_PRECISION),
      sequence: toNumber(original.sequence) + (index * 0.000001),
      sourceAllocationIds: allocationTraceIds(original),
      productionMemberships: productionMembershipParts[index],
      components: componentParts[index]
    };
  });
  return {
    original,
    splitGroupId: groupId,
    parts,
    quantityTotal: unitsValue(quantityTotalUnits, MANUAL_SCHEDULE_QUANTITY_PRECISION),
    percentTotal: unitsValue(capacityUnits, MANUAL_SCHEDULE_PERCENT_PRECISION)
  };
}

export function buildManualScheduleAllocationSplit(allocation, firstPercent, { splitGroupId = null } = {}) {
  const result = buildManualScheduleAllocationParts(allocation, [firstPercent, 100 - Number(firstPercent)], { splitGroupId });
  return { ...result, first: result.parts[0], second: result.parts[1] };
}

export function splitDraftAllocation(draft, {
  allocationId, firstPercent, relativePercents, partEdits = [], splitGroupId = null, now, ...context
} = {}) {
  const previous = clone(draft);
  const allocations = Array.isArray(previous?.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const index = allocations.findIndex(allocation => String(allocation.allocationId) === String(allocationId || ''));
  if (index < 0) throw splitError('Allocation não encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND');
  const split = Array.isArray(relativePercents)
    ? buildManualScheduleAllocationParts(allocations[index], relativePercents, { splitGroupId })
    : buildManualScheduleAllocationSplit(allocations[index], firstPercent, { splitGroupId });
  const editedParts = split.parts.map((part, partIndex) => applyAllocationConfigurationEdit(part, partEdits[partIndex], context));
  const nextAllocations = [...allocations];
  nextAllocations.splice(index, 1, ...editedParts);
  return {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined ? new Date().toISOString() : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: {
      type: 'SPLIT_ALLOCATION',
      allocationId: String(allocationId),
      splitGroupId: split.splitGroupId,
      relativePercents: editedParts.map(part => part.splitRatioPercent)
    }
  };
}

function machineById(machines = [], machineId) {
  return (Array.isArray(machines) ? machines : []).find(machine => {
    return [machine?.machineId, machine?.machineName, machine?.id, machine?.name]
      .map(value => String(value || ''))
      .includes(String(machineId || ''));
  }) || null;
}

function productivityDailyCapacity(row, dailyMinutes = DEFAULT_DAILY_MINUTES) {
  const outputQty = toNumber(row?.output_qty ?? row?.outputQty);
  const safeDailyMinutes = Math.max(toNumber(dailyMinutes, DEFAULT_DAILY_MINUTES), 1);
  const dailySeconds = safeDailyMinutes * 60;
  const sourceTimeSeconds = toNumber(row?.time_seconds ?? (toNumber(row?.time_minutes ?? row?.timeMinutes) * 60));
  const usesCycleTime = sourceTimeSeconds > 0 && sourceTimeSeconds < dailySeconds;
  const capacityPerDay = outputQty > 0
    ? usesCycleTime
      ? outputQty * (dailySeconds / sourceTimeSeconds)
      : outputQty
    : 0;
  return {
    capacityPerDay,
    secondsPerUnit: outputQty > 0 && capacityPerDay > 0 ? dailySeconds / capacityPerDay : 0,
    sourceTimeSeconds: usesCycleTime ? sourceTimeSeconds : dailySeconds,
    sourceOutputQty: outputQty
  };
}

export function calculateProductivityDailyCapacity(row, dailyMinutes = DEFAULT_DAILY_MINUTES) {
  return productivityDailyCapacity(row, dailyMinutes);
}

function findProductivity(allocation, targetMachineId, { machines = [], matrixRows = [] } = {}) {
  const machine = machineById(machines, targetMachineId) || {
    machineId: String(targetMachineId || ''),
    machineName: String(targetMachineId || '')
  };
  const peopleCount = toNumber(allocation.peopleCount);
  if (!(peopleCount >= 0)) return null;
  const allocationUnit = normalizeUnit(allocation.unit ?? allocation.plannedUnit);
  const productivityRows = resolveMaterialProductivityLines({
    material: allocation,
    reference: allocation,
    productivityMatrix: matrixRows,
    unit: allocationUnit
  }).filter(row => {
    const rowUnit = normalizeUnit(row.output_unit ?? row.outputUnit);
    return Boolean(rowUnit && allocationUnit && rowUnit === allocationUnit);
  });
  const matrixMatch = resolveProductivityConfiguration({
    productivityRows,
    machine,
    peopleCount
  });
  return matrixMatch || null;
}

function recalculateWithProductivity(allocation, targetMachineId, context = {}) {
  const matrix = findProductivity(allocation, targetMachineId, context);
  if (!matrix) {
    const error = new Error(NO_PRODUCTIVITY_MESSAGE);
    error.code = 'PRODUCTIVITY_NOT_FOUND';
    throw error;
  }
  const machine = machineById(context.machines, targetMachineId) || {};
  const capacity = productivityDailyCapacity(matrix, context.dailyMinutes);
  if (!(capacity.capacityPerDay > 0) || !(capacity.secondsPerUnit > 0)) {
    const error = new Error(NO_PRODUCTIVITY_MESSAGE);
    error.code = 'PRODUCTIVITY_NOT_FOUND';
    throw error;
  }
  const quantity = toNumber(allocation.quantity);
  return {
    ...allocation,
    machineId: String(targetMachineId || ''),
    machineName: String(machine.machineName || matrix.machine_name || targetMachineId || ''),
    peopleCount: Number(matrix.people_count ?? matrix.peopleCount),
    unit: String(matrix.output_unit || matrix.outputUnit || allocation.unit || ''),
    durationMinutes: Math.ceil(quantity * capacity.secondsPerUnit / 60),
    capacityPercent: Number(((quantity / capacity.capacityPerDay) * 100).toFixed(2)),
    maxDailyCapacity: Number(capacity.capacityPerDay.toFixed(6)),
    capacityMaxPerDay: Number(capacity.capacityPerDay.toFixed(6)),
    productivityLineId: matrix.id ?? matrix.productivity_line_id ?? matrix.productivityLineId ?? allocation.productivityLineId ?? null,
    productivity: {
      machineName: matrix.machine_name || matrix.machineName || '',
      peopleCount: Number(matrix.people_count ?? matrix.peopleCount),
      outputQty: toNumber(matrix.output_qty ?? matrix.outputQty),
      outputUnit: matrix.output_unit || matrix.outputUnit || allocation.unit || '',
      timeSeconds: toNumber(matrix.time_seconds ?? (toNumber(matrix.time_minutes ?? matrix.timeMinutes) * 60))
    }
  };
}

function applyAllocationConfigurationEdit(allocation, edit = null, context = {}) {
  if (!edit) return allocation;
  const machineId = String(edit.machineId ?? allocation.machineId ?? '');
  const peopleCount = Number(edit.peopleCount ?? allocation.peopleCount);
  const date = normalizeDateOnly(edit.date ?? allocation.date);
  const startTime = String(edit.startTime ?? allocation.startTime ?? '').slice(0, 5);
  const requestedQuantity = edit.quantity === undefined || edit.quantity === null || edit.quantity === ''
    ? toNumber(allocation.quantity)
    : toNumber(edit.quantity);
  if (!machineId) throw splitError('Cada parte precisa de uma máquina válida.', 'ALLOCATION_MACHINE_REQUIRED');
  if (!Number.isInteger(peopleCount) || peopleCount < 1) throw splitError('Cada parte precisa de uma quantidade inteira de pessoas.', 'ALLOCATION_PEOPLE_INVALID');
  if (!(requestedQuantity > 0)) throw splitError('A quantidade da producao precisa ser maior que zero.', 'ALLOCATION_QUANTITY_INVALID');
  if (!isValidDateOnly(date)) throw splitError('Cada parte precisa de uma data válida.', 'ALLOCATION_DATE_INVALID');
  const start = clockMinutes(startTime);
  if (start === null) throw splitError('Cada parte precisa de um horário inicial válido.', 'ALLOCATION_START_INVALID');
  const resourceChanged = machineId !== String(allocation.machineId) || peopleCount !== Number(allocation.peopleCount);
  const quantityChanged = Math.abs(requestedQuantity - toNumber(allocation.quantity)) > EPSILON;
  const positionChanged = date !== String(allocation.date) || startTime !== String(allocation.startTime);
  const baseAllocation = quantityChanged
    ? {
        ...allocation,
        quantity: Number(requestedQuantity.toFixed(6)),
        components: splitComponentsByQuantity(normalizeComponents(allocation), requestedQuantity)
      }
    : allocation;
  if (!resourceChanged && !quantityChanged && !positionChanged) return { ...baseAllocation, source: 'manual', pinned: true };
  const configured = resourceChanged || quantityChanged
    ? recalculateWithProductivity({ ...baseAllocation, peopleCount }, machineId, context)
    : { ...baseAllocation, peopleCount };
  const durationMinutes = Number(configured.durationMinutes);
  const end = start + Math.ceil(durationMinutes);
  if (!(durationMinutes > 0)) {
    throw splitError('A posição escolhida ultrapassa o dia produtivo aceito.', 'ALLOCATION_POSITION_AMBIGUOUS');
  }
  return {
    ...configured,
    date,
    endDate: addDays(date, Math.floor(end / 1440)),
    startTime,
    endTime: minutesClock(end),
    source: 'manual',
    pinned: true
  };
}

export function editDraftAllocation(draft, {
  allocationId, machineId, peopleCount, quantity, date, startTime, now, capacityDecision = 'cancel', ...context
} = {}) {
  const previous = clone(draft);
  const allocations = Array.isArray(previous?.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const index = allocations.findIndex(allocation => String(allocation.allocationId) === String(allocationId || ''));
  if (index < 0) throw splitError('Allocation não encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND');
  const edited = applyAllocationConfigurationEdit(allocations[index], {
    machineId, peopleCount, quantity, date, startTime
  }, context);
  if (toNumber(edited.capacityPercent) > 100 + EPSILON && capacityDecision === 'cancel') {
    const error = splitError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED');
    error.proposedAllocation = edited;
    throw error;
  }
  const normalizedAllocationId = String(allocationId || '');
  const others = allocations.filter(allocation => String(allocation.allocationId) !== normalizedAllocationId);
  let nextAllocations;
  if (toNumber(edited.capacityPercent) > 100 + EPSILON && capacityDecision === 'split') {
    const availableQty = toNumber(edited.maxDailyCapacity ?? edited.capacityMaxPerDay);
    if (!(availableQty > 0) || availableQty >= toNumber(edited.quantity)) {
      throw splitError('Nao ha capacidade normal disponivel para dividir o excedente.', 'CAPACITY_SPLIT_INVALID');
    }
    const filled = recalculateWithProductivity({
      ...edited,
      quantity: Number(availableQty.toFixed(6)),
      components: splitComponentsByQuantity(normalizeComponents(edited), availableQty)
    }, edited.machineId, context);
    const remainderQty = Number((toNumber(edited.quantity) - availableQty).toFixed(6));
    const remainder = {
      ...edited,
      allocationId: createId(`${edited.allocationId}:excedente`),
      quantity: remainderQty,
      components: splitComponentsByQuantity(normalizeComponents(edited), remainderQty),
      sourceAllocationIds: allocationTraceIds(edited),
      sourceParentOperationIds: allocationParentIds(edited)
    };
    const placement = findNextPlacement(remainder, [...others, filled], context, {
      startDate: edited.date,
      preferredMachineId: edited.machineId
    });
    if (!placement) throw splitError('Nao foi encontrado proximo periodo valido para o excedente.', 'NO_NEXT_SLOT');
    nextAllocations = allocations.map(allocation => (
      String(allocation.allocationId) === normalizedAllocationId ? filled : allocation
    ));
    if (placement.mergeIntoAllocationId) {
      nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
    }
    nextAllocations.push(placement.allocation);
  } else {
    const editedAllocation = {
      ...edited,
      isCapacityOverride: toNumber(edited.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
    };
    nextAllocations = allocations.map(allocation => (
      String(allocation.allocationId) === normalizedAllocationId ? editedAllocation : allocation
    ));
  }
  return {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined ? new Date().toISOString() : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: { type: 'EDIT_ALLOCATION', allocationId: String(allocationId) }
  };
}

function sameMaterialCompatible(left = {}, right = {}) {
  return normalizeText(left.materialId) === normalizeText(right.materialId)
    && normalizeUnit(left.unit) === normalizeUnit(right.unit)
    && Number(left.peopleCount || 0) === Number(right.peopleCount || 0);
}

function mergeAllocations(target, moved, context = {}) {
  const quantity = Number((toNumber(target.quantity) + toNumber(moved.quantity)).toFixed(6));
  const merged = {
    ...target,
    allocationId: target.allocationId,
    quantity,
    date: moved.date,
    machineId: moved.machineId,
    machineName: moved.machineName || target.machineName,
    source: 'manual',
    pinned: true,
    sourceAllocationIds: [...new Set([...allocationTraceIds(target), ...allocationTraceIds(moved)])],
    sourceParentOperationIds: [...new Set([...allocationParentIds(target), ...allocationParentIds(moved)])],
    components: mergeComponents(normalizeComponents(target), normalizeComponents(moved))
  };
  return recalculateWithProductivity(merged, merged.machineId, context);
}

function makeMoveError(message, code, snapshot, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.snapshot = snapshot;
  Object.assign(error, extra);
  return error;
}

function withRollbackSnapshot(callback, snapshot) {
  try {
    return callback();
  } catch (error) {
    if (error?.snapshot) throw error;
    throw makeMoveError(error?.message || 'Movimento invalido.', error?.code || 'DRAFT_INVALID', snapshot);
  }
}

function isWorkingDate(date, days = []) {
  const day = (Array.isArray(days) ? days : []).find(item => String(item?.date || item).slice(0, 10) === date);
  if (day && day.isWorkingDay === false) return false;
  return !isWeekend(date);
}

function cellAllocations(allocations, date, machineId, excludeIds = []) {
  const excludes = new Set(excludeIds.map(String));
  return allocations.filter(allocation => (
    !excludes.has(String(allocation.allocationId))
    && String(allocation.date || '') === String(date)
    && String(allocation.machineId || '') === String(machineId)
  ));
}

function findNextPlacement(allocation, allocations, context = {}, { startDate, preferredDate, preferredMachineId } = {}) {
  const machines = Array.isArray(context.machines) ? context.machines : [];
  const machineIds = [
    preferredMachineId,
    ...machines.map(machine => machine.machineId || machine.machineName || machine.id || machine.name)
  ].map(value => String(value || '')).filter(Boolean);
  const uniqueMachineIds = [...new Set(machineIds)];
  const candidateDates = [
    ...(isValidDateOnly(preferredDate) ? [preferredDate] : []),
    ...Array.from({ length: 365 }, (_, index) => addDays(startDate || allocation.date, index + 1))
  ];
  for (const date of [...new Set(candidateDates)]) {
    if (!isWorkingDate(date, context.days)) continue;
    for (const machineId of uniqueMachineIds) {
      let moved;
      try {
        moved = recalculateWithProductivity({
          ...allocation,
          date,
          machineId,
          source: 'manual',
          pinned: true
        }, machineId, context);
      } catch {
        continue;
      }
      const occupants = cellAllocations(allocations, date, machineId, [allocation.allocationId]);
      if (!occupants.length && toNumber(moved.capacityPercent) <= 100 + EPSILON) return { allocation: moved };
      const compatible = occupants.find(item => sameMaterialCompatible(item, moved));
      if (compatible) {
        const merged = mergeAllocations(compatible, moved, context);
        if (toNumber(merged.capacityPercent) <= 100 + EPSILON) {
          return { allocation: merged, mergeIntoAllocationId: compatible.allocationId };
        }
      }
    }
  }
  return null;
}

function pushReplacementChain(allocation, allocations, context = {}, {
  startDate,
  preferredMachineId,
  capacityDecision = 'cancel',
  depth = 0
} = {}) {
  if (depth > 365) return null;
  const machineId = String(preferredMachineId || allocation.machineId || '');
  if (!machineId) return null;
  for (let index = 1; index <= 365; index += 1) {
    const date = addDays(startDate || allocation.date, index);
    if (!isWorkingDate(date, context.days)) continue;
    let moved;
    try {
      moved = recalculateWithProductivity({
        ...allocation,
        date,
        machineId,
        source: 'manual',
        pinned: true
      }, machineId, context);
    } catch {
      continue;
    }
    if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision !== 'override') continue;
    const occupants = cellAllocations(allocations, date, machineId, [moved.allocationId])
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0) || String(left.allocationId).localeCompare(String(right.allocationId)));
    if (!occupants.length) {
      return {
        allocations: [...allocations, {
          ...moved,
          isCapacityOverride: Boolean(moved.isCapacityOverride || (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'))
        }],
        allocation: moved
      };
    }
    const occupant = occupants[0];
    const nextAllocations = allocations.filter(item => String(item.allocationId) !== String(occupant.allocationId));
    const cascade = pushReplacementChain(occupant, [...nextAllocations, moved], context, {
      startDate: date,
      preferredMachineId: machineId,
      capacityDecision,
      depth: depth + 1
    });
    if (cascade) return cascade;
  }
  return null;
}

export function consolidateManualScheduleAllocations(allocations = []) {
  const grouped = new Map();
  const result = [];

  allocations.forEach((allocation, index) => {
    const normalized = normalizeAllocation(allocation, index);
    const key = consolidationKey(normalized);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, normalized);
      result.push(normalized);
      return;
    }

    existing.quantity = Number((toNumber(existing.quantity) + toNumber(normalized.quantity)).toFixed(6));
    existing.durationMinutes = Number((toNumber(existing.durationMinutes) + toNumber(normalized.durationMinutes)).toFixed(6));
    existing.capacityPercent = existing.capacityPercent === null && normalized.capacityPercent === null
      ? null
      : Number((toNumber(existing.capacityPercent) + toNumber(normalized.capacityPercent)).toFixed(6));
    existing.peopleCount = Math.max(toNumber(existing.peopleCount), toNumber(normalized.peopleCount));
    existing.source = existing.source === 'manual' || normalized.source === 'manual' ? 'manual' : 'automatic';
    existing.pinned = Boolean(existing.pinned || normalized.pinned);
    existing.sourceAllocationIds = [...new Set([
      ...allocationTraceIds(existing),
      ...allocationTraceIds(normalized)
    ])];
    existing.sourceParentOperationIds = [...new Set([
      ...allocationParentIds(existing),
      ...allocationParentIds(normalized)
    ])];
    existing.components = mergeComponents(normalizeComponents(existing), normalizeComponents(normalized));
  });

  return result.map((allocation, index) => ({
    ...allocation,
    sequence: index + 1
  }));
}

export function validateManualScheduleDraft(draft, { machines = [], previousAllocations = null } = {}) {
  const errors = [];
  const allocations = Array.isArray(draft?.allocations) ? draft.allocations : [];
  const ids = new Set();
  const splitPartIds = new Set();
  const machineIds = normalizedMachineIds(machines);
  const totals = parentTotals(allocations);
  const previousTotals = previousAllocations ? parentTotals(previousAllocations) : null;
  const previousTraceIds = previousAllocations ? traceIdSet(previousAllocations) : null;
  const nextTraceIds = traceIdSet(allocations);

  allocations.forEach((allocation, index) => {
    const prefix = `allocation[${index}]`;
    const allocationId = String(allocation?.allocationId || '');
    if (!allocationId) errors.push(`${prefix}: allocationId ausente.`);
    if (ids.has(allocationId)) errors.push(`${prefix}: allocationId duplicado.`);
    ids.add(allocationId);
    if (!String(allocation?.parentOperationId || '')) errors.push(`${prefix}: parentOperationId ausente.`);
    if (!(toNumber(allocation?.quantity) > 0)) errors.push(`${prefix}: quantity deve ser maior que zero.`);
    if (!(toNumber(allocation?.durationMinutes) > 0)) errors.push(`${prefix}: durationMinutes deve ser maior que zero.`);
    if (!isValidDateOnly(allocation?.date)) errors.push(`${prefix}: data invalida.`);
    if (!String(allocation?.machineId || '') || (machineIds.size && !machineIds.has(String(allocation.machineId)))) {
      errors.push(`${prefix}: machineId invalido.`);
    }
    Object.values(allocation || {}).forEach(value => {
      if (typeof value === 'number' && !Number.isFinite(value)) errors.push(`${prefix}: número não finito encontrado.`);
    });
    const componentTotal = normalizeComponents(allocation).reduce((sum, component) => sum + toNumber(component.quantity), 0);
    if (Math.abs(componentTotal - toNumber(allocation?.quantity)) > (10 ** -MANUAL_SCHEDULE_QUANTITY_PRECISION)) {
      errors.push(`${prefix}: componentes não reconciliam com quantity.`);
    }
    if (allocation?.splitParentAllocationId) {
      const splitPartId = String(allocation.splitPartId || '');
      if (!String(allocation.splitRootAllocationId || '')) errors.push(`${prefix}: splitRootAllocationId ausente.`);
      if (!String(allocation.splitGroupId || '')) errors.push(`${prefix}: splitGroupId ausente.`);
      if (!splitPartId || splitPartId !== allocationId) errors.push(`${prefix}: splitPartId inválido.`);
      if (splitPartIds.has(splitPartId)) errors.push(`${prefix}: splitPartId duplicado.`);
      splitPartIds.add(splitPartId);
      if (!(Number(allocation.splitDepth) >= 1)) errors.push(`${prefix}: splitDepth inválido.`);
      if (!(Number(allocation.splitOrder) >= 1)) errors.push(`${prefix}: splitOrder inválido.`);
      if (!(Number(allocation.splitRatioPercent) > 0) || Number(allocation.splitRatioPercent) > 100) errors.push(`${prefix}: splitRatioPercent inválido.`);
      if (!(Number(allocation.splitAccumulatedRatioPercent) > 0) || Number(allocation.splitAccumulatedRatioPercent) > 100) errors.push(`${prefix}: splitAccumulatedRatioPercent inválido.`);
    }
  });

  if (previousTotals) {
    previousTotals.forEach((total, parentOperationId) => {
      const next = toNumber(totals.get(parentOperationId));
      if (Math.abs(next - total) > EPSILON) {
        errors.push(`${parentOperationId}: quantidade total alterada.`);
      }
    });
  }

  if (previousTraceIds) {
    previousTraceIds.forEach(id => {
      if (!nextTraceIds.has(id)) errors.push(`${id}: allocation original desapareceu.`);
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function applyDraftMove(draft, {
  allocationId,
  targetDate,
  targetMachineId,
  peopleCount,
  machines = [],
  matrixRows = [],
  days = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES,
  confirmMerge = false,
  confirmReplace = false,
  moveMode = null,
  preferSourceDateForReplace = false,
  capacityDecision = 'cancel',
  now
} = {}) {
  const previous = clone(draft);
  const context = { machines, matrixRows, days, dailyMinutes };
  const sourceAllocations = Array.isArray(previous.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const normalizedId = String(allocationId || '');
  const source = sourceAllocations.find(allocation => String(allocation?.allocationId || '') === normalizedId);
  if (!source) throw makeMoveError('Allocation nao encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND', previous);
  if (!isValidDateOnly(targetDate)) throw makeMoveError('Destino sem data valida.', 'INVALID_DATE', previous);

  const moved = withRollbackSnapshot(() => recalculateWithProductivity({
    ...source,
    ...(peopleCount !== undefined && peopleCount !== null && peopleCount !== '' ? { peopleCount: Number(peopleCount) } : {}),
    date: normalizeDateOnly(targetDate),
    machineId: String(targetMachineId || ''),
    source: 'manual',
    pinned: true
  }, targetMachineId, context), previous);
  const others = sourceAllocations.filter(allocation => String(allocation.allocationId) !== normalizedId);
  const occupants = cellAllocations(others, moved.date, moved.machineId);
  const normalizedMoveMode = ['replace', 'complete_day', 'reorder_before'].includes(String(moveMode || ''))
    ? String(moveMode)
    : null;
  let nextAllocations = others;
  let action = 'move';

  if (!occupants.length) {
    if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'cancel') {
      throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: moved });
    }
    if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'split') {
      const availableQty = toNumber(moved.maxDailyCapacity ?? moved.capacityMaxPerDay);
      if (!(availableQty > 0) || availableQty >= toNumber(moved.quantity)) {
        throw makeMoveError('Nao ha capacidade normal disponivel para dividir o excedente.', 'CAPACITY_SPLIT_INVALID', previous);
      }
      const filled = withRollbackSnapshot(() => recalculateWithProductivity({
        ...moved,
        quantity: Number(availableQty.toFixed(6)),
        components: splitComponentsByQuantity(normalizeComponents(moved), availableQty)
      }, moved.machineId, context), previous);
      const remainderQty = Number((toNumber(moved.quantity) - availableQty).toFixed(6));
      const remainder = {
        ...moved,
        allocationId: createId(`${moved.allocationId}:excedente`),
        quantity: remainderQty,
        components: splitComponentsByQuantity(normalizeComponents(moved), remainderQty),
        sourceAllocationIds: allocationTraceIds(moved),
        sourceParentOperationIds: allocationParentIds(moved)
      };
      const placement = findNextPlacement(remainder, [...others, filled], context, {
        startDate: moved.date,
        preferredMachineId: moved.machineId
      });
      if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para o excedente.', 'NO_NEXT_SLOT', previous);
      nextAllocations = [...others, filled];
      if (placement.mergeIntoAllocationId) {
        nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
      }
      nextAllocations.push(placement.allocation);
      action = 'split_over_capacity';
    } else {
      nextAllocations = [...others, {
        ...moved,
        isCapacityOverride: toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
      }];
      action = toNumber(moved.capacityPercent) > 100 + EPSILON ? 'override_capacity' : 'move';
    }
  } else {
    const compatible = occupants.find(item => sameMaterialCompatible(item, moved));
    if (normalizedMoveMode === 'replace' || (!compatible && !['complete_day', 'reorder_before'].includes(normalizedMoveMode))) {
      const occupant = occupants[0];
      if (!confirmReplace) {
        throw makeMoveError('Substituir producao programada', 'CONFIRM_REPLACE', previous, {
          sourceAllocation: source,
          proposedAllocation: moved,
          occupyingAllocation: occupant
        });
      }
      nextAllocations = others.filter(allocation => String(allocation.allocationId) !== String(occupant.allocationId));
      if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision !== 'override') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: moved });
      }
      nextAllocations.push({
        ...moved,
        isCapacityOverride: toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
      });
      const placement = preferSourceDateForReplace
        ? findNextPlacement(occupant, nextAllocations, context, {
            preferredDate: source.date,
            startDate: moved.date,
            preferredMachineId: source.machineId || occupant.machineId
          })
        : pushReplacementChain(occupant, nextAllocations, context, {
            startDate: moved.date,
            preferredMachineId: source.machineId || occupant.machineId,
            capacityDecision
          }) || findNextPlacement(occupant, nextAllocations, context, {
            startDate: moved.date,
            preferredMachineId: source.machineId || occupant.machineId
          });
      if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para reagendar o ocupante.', 'NO_NEXT_SLOT', previous);
      if (placement.allocations) {
        nextAllocations = placement.allocations;
      } else {
        if (placement.mergeIntoAllocationId) {
          nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
        }
        nextAllocations.push(placement.allocation);
      }
      action = 'replace';
    } else if (compatible) {
      const merged = withRollbackSnapshot(() => mergeAllocations(compatible, moved, context), previous);
      if (!confirmMerge) {
        throw makeMoveError('Unificar producoes', 'CONFIRM_MERGE', previous, { proposedAllocation: merged });
      }
      if (toNumber(merged.capacityPercent) > 100 + EPSILON && capacityDecision === 'cancel') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: merged });
      }
      nextAllocations = others.filter(allocation => String(allocation.allocationId) !== String(compatible.allocationId));
      if (toNumber(merged.capacityPercent) > 100 + EPSILON && capacityDecision === 'split') {
        const availableQty = Math.max(toNumber(merged.maxDailyCapacity ?? merged.capacityMaxPerDay) - toNumber(compatible.quantity), 0);
        if (!(availableQty > 0) || availableQty >= toNumber(moved.quantity)) {
          throw makeMoveError('Nao ha capacidade normal disponivel para dividir o excedente.', 'CAPACITY_SPLIT_INVALID', previous);
        }
        const filledMoved = {
          ...moved,
          quantity: Number(availableQty.toFixed(6)),
          components: splitComponentsByQuantity(normalizeComponents(moved), availableQty)
        };
        const filled = withRollbackSnapshot(() => mergeAllocations(compatible, filledMoved, context), previous);
        const remainderQty = Number((toNumber(moved.quantity) - availableQty).toFixed(6));
        const remainder = {
          ...moved,
          allocationId: createId(`${moved.allocationId}:excedente`),
          quantity: remainderQty,
          components: splitComponentsByQuantity(normalizeComponents(moved), remainderQty),
          sourceAllocationIds: allocationTraceIds(moved),
          sourceParentOperationIds: allocationParentIds(moved)
        };
        const placement = findNextPlacement(remainder, [...nextAllocations, filled], context, {
          startDate: moved.date,
          preferredMachineId: moved.machineId
        });
        if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para o excedente.', 'NO_NEXT_SLOT', previous);
        nextAllocations.push(filled);
        if (placement.mergeIntoAllocationId) {
          nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
        }
        nextAllocations.push(placement.allocation);
        action = 'split_over_capacity';
      } else {
        nextAllocations.push({
          ...merged,
          isCapacityOverride: toNumber(merged.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
        });
        action = toNumber(merged.capacityPercent) > 100 + EPSILON ? 'override_capacity' : 'merge';
      }
    } else {
      const totalCapacity = occupants.reduce((sum, allocation) => sum + toNumber(allocation.capacityPercent), 0) + toNumber(moved.capacityPercent);
      const proposedAllocation = { ...moved, capacityPercent: Number(totalCapacity.toFixed(2)) };
      if (totalCapacity > 100 + EPSILON && capacityDecision !== 'override') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation });
      }
      const sameCellIds = new Set(occupants.map(allocation => String(allocation.allocationId)));
      nextAllocations = others.filter(allocation => !sameCellIds.has(String(allocation.allocationId)));
      const orderedCellAllocations = normalizedMoveMode === 'reorder_before'
        ? [moved, ...occupants]
        : [...occupants, moved];
      const sequenced = applySequentialTimes(orderedCellAllocations, {
        overrideAllocationIds: totalCapacity > 100 + EPSILON && capacityDecision === 'override' ? [moved.allocationId] : []
      });
      nextAllocations.push(...sequenced);
      action = totalCapacity > 100 + EPSILON ? 'complete_day_override_capacity' : 'complete_day';
    }
  }

  const next = {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined
      ? new Date().toISOString()
      : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: action
  };
  const validation = validateManualScheduleDraft(next, {
    machines,
    previousAllocations: sourceAllocations
  });
  if (!validation.valid) {
    throw makeMoveError('Movimento invalido. O rascunho manual foi mantido sem alteracoes.', 'DRAFT_INVALID', previous, { details: validation.errors });
  }
  return next;
}

export function applyIndependentDraftMove(draft, {
  allocationId,
  targetDate,
  targetMachineId,
  peopleCount,
  quantity,
  remainderDate,
  machines = [],
  matrixRows = [],
  days = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES,
  now
} = {}) {
  const previous = clone(draft);
  const context = { machines, matrixRows, days, dailyMinutes };
  const sourceAllocations = Array.isArray(previous.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const normalizedId = String(allocationId || '');
  const source = sourceAllocations.find(allocation => String(allocation?.allocationId || '') === normalizedId);
  if (!source) throw makeMoveError('Allocation nao encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND', previous);
  if (!isValidDateOnly(targetDate)) throw makeMoveError('Destino sem data valida.', 'INVALID_DATE', previous);

  const requestedQuantity = quantity === undefined || quantity === null || quantity === ''
    ? toNumber(source.quantity)
    : toNumber(quantity);
  if (!(requestedQuantity > 0) || requestedQuantity > toNumber(source.quantity) + EPSILON) {
    throw makeMoveError('Quantidade invalida para movimentacao manual.', 'INVALID_MOVE_QUANTITY', previous);
  }
  const targetMachine = String(targetMachineId || source.machineId || '');
  const targetPeople = peopleCount !== undefined && peopleCount !== null && peopleCount !== ''
    ? Number(peopleCount)
    : Number(source.peopleCount);
  const moved = withRollbackSnapshot(() => recalculateWithProductivity({
    ...source,
    quantity: Number(requestedQuantity.toFixed(6)),
    components: splitComponentsByQuantity(normalizeComponents(source), requestedQuantity),
    peopleCount: targetPeople,
    date: normalizeDateOnly(targetDate),
    machineId: targetMachine,
    source: 'manual',
    pinned: true
  }, targetMachine, context), previous);

  const nextAllocations = sourceAllocations.filter(allocation => String(allocation.allocationId) !== normalizedId);
  nextAllocations.push(moved);
  const remainderQty = Number((toNumber(source.quantity) - requestedQuantity).toFixed(6));
  if (remainderQty > EPSILON) {
    if (!isValidDateOnly(remainderDate)) {
      throw makeMoveError('Data do restante nao informada.', 'REMAINDER_DATE_REQUIRED', previous);
    }
    const remainderId = createId(`${source.allocationId}:restante`);
    const remainder = withRollbackSnapshot(() => recalculateWithProductivity({
      ...source,
      allocationId: remainderId,
      quantity: remainderQty,
      components: splitComponentsByQuantity(normalizeComponents(source), remainderQty).map(component => ({
        ...component,
        allocationId: remainderId
      })),
      sourceAllocationIds: allocationTraceIds(source),
      sourceParentOperationIds: allocationParentIds(source),
      peopleCount: targetPeople,
      date: normalizeDateOnly(remainderDate),
      machineId: targetMachine,
      source: 'manual',
      pinned: true
    }, targetMachine, context), previous);
    nextAllocations.push(remainder);
  }

  const next = {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined
      ? new Date().toISOString()
      : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: remainderQty > EPSILON ? 'stock_split_move' : 'independent_move'
  };
  const validation = validateManualScheduleDraft(next, {
    machines,
    previousAllocations: sourceAllocations
  });
  if (!validation.valid) {
    throw makeMoveError('Movimento invalido. O rascunho manual foi mantido sem alteracoes.', 'DRAFT_INVALID', previous, { details: validation.errors });
  }
  return next;
}

export function createManualScheduleDraft({
  planningId = null,
  baseSimulationId = null,
  allocations = [],
  machines = [],
  manualWorkDates = [],
  dailyTeamOverrides = {},
  now = new Date()
} = {}) {
  const normalized = consolidateManualScheduleAllocations(allocations.map(normalizeAllocation));
  const timestamp = now instanceof Date ? now.toISOString() : new Date().toISOString();
  const draft = {
    draftId: createId('manual-draft'),
    planningId: planningId == null ? null : String(planningId),
    baseSimulationId: baseSimulationId == null ? null : String(baseSimulationId),
    allocations: normalized,
    manualWorkDates: [...new Set((Array.isArray(manualWorkDates) ? manualWorkDates : []).map(value => String(value?.date ?? value ?? '')).filter(Boolean))].sort(),
    dailyTeamOverrides: clone(dailyTeamOverrides && typeof dailyTeamOverrides === 'object' ? dailyTeamOverrides : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    dirty: false
  };
  const validation = validateManualScheduleDraft(draft, { machines });
  if (!validation.valid) {
    const error = new Error('Falha ao criar rascunho manual do calendario.');
    error.details = validation.errors;
    throw error;
  }
  return draft;
}

export function moveDraftAllocation(draft, options = {}) {
  return applyDraftMove(draft, options);
}

export function restoreManualScheduleDraftSnapshot(snapshot) {
  return clone(snapshot);
}

export function discardManualScheduleDraft() {
  return null;
}
