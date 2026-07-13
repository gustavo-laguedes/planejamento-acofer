const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EPSILON = 0.001;
const DEFAULT_DAILY_MINUTES = 528;
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

function machineById(machines = [], machineId) {
  return (Array.isArray(machines) ? machines : []).find(machine => {
    return [machine?.machineId, machine?.machineName, machine?.id, machine?.name]
      .map(value => String(value || ''))
      .includes(String(machineId || ''));
  }) || null;
}

function matrixMaterialKeys(row = {}) {
  return [
    row.material_id,
    row.materialId,
    row.material_code,
    row.materialCode,
    ...(Array.isArray(row.material_codes) ? row.material_codes : []),
    ...(Array.isArray(row.codes) ? row.codes : [])
  ].map(normalizeText).filter(Boolean);
}

function allocationMaterialKeys(allocation = {}) {
  return [
    allocation.materialId,
    allocation.material_id,
    allocation.materialCode,
    allocation.material_code,
    ...(Array.isArray(allocation.materialCodes) ? allocation.materialCodes : []),
    ...(Array.isArray(allocation.material_codes) ? allocation.material_codes : []),
    ...(Array.isArray(allocation.codes) ? allocation.codes : [])
  ].map(normalizeText).filter(Boolean);
}

function matrixMatchesAllocation(row, allocation, machine, peopleCount) {
  if (row?.active === false) return false;
  const rowMachineKeys = [row.machine_id, row.machineId, row.machine_name, row.machineName]
    .map(normalizeText)
    .filter(Boolean);
  const machineKeys = [machine?.machineId, machine?.id, machine?.machineName, machine?.name]
    .map(normalizeText)
    .filter(Boolean);
  if (!rowMachineKeys.some(key => machineKeys.includes(key))) return false;
  if (Number(row.people_count ?? row.peopleCount) !== Number(peopleCount)) return false;
  const rowKeys = new Set(matrixMaterialKeys(row));
  if (!allocationMaterialKeys(allocation).some(key => rowKeys.has(key))) return false;
  const rowUnit = normalizeUnit(row.output_unit ?? row.outputUnit);
  const allocationUnit = normalizeUnit(allocation.unit ?? allocation.plannedUnit);
  return Boolean(rowUnit && allocationUnit && rowUnit === allocationUnit);
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

function findProductivity(allocation, targetMachineId, { machines = [], matrixRows = [] } = {}) {
  const machine = machineById(machines, targetMachineId) || {
    machineId: String(targetMachineId || ''),
    machineName: String(targetMachineId || '')
  };
  const peopleCount = toNumber(allocation.peopleCount);
  if (!(peopleCount >= 0)) return null;
  const matrixMatch = (Array.isArray(matrixRows) ? matrixRows : []).find(row => (
    matrixMatchesAllocation(row, allocation, machine, peopleCount)
  ));
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
    productivity: {
      machineName: matrix.machine_name || matrix.machineName || '',
      peopleCount: Number(matrix.people_count ?? matrix.peopleCount),
      outputQty: toNumber(matrix.output_qty ?? matrix.outputQty),
      outputUnit: matrix.output_unit || matrix.outputUnit || allocation.unit || '',
      timeSeconds: toNumber(matrix.time_seconds ?? (toNumber(matrix.time_minutes ?? matrix.timeMinutes) * 60))
    }
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

function findNextPlacement(allocation, allocations, context = {}, { startDate, preferredMachineId } = {}) {
  const machines = Array.isArray(context.machines) ? context.machines : [];
  const machineIds = [
    preferredMachineId,
    ...machines.map(machine => machine.machineId || machine.machineName || machine.id || machine.name)
  ].map(value => String(value || '')).filter(Boolean);
  const uniqueMachineIds = [...new Set(machineIds)];
  for (let offset = 1; offset <= 365; offset += 1) {
    const date = addDays(startDate || allocation.date, offset);
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

export function validateManualScheduleDraft(draft, { machines = [], previousAllocations = null, matrixRows = [] } = {}) {
  const errors = [];
  const allocations = Array.isArray(draft?.allocations) ? draft.allocations : [];
  const ids = new Set();
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
    if (Array.isArray(matrixRows) && matrixRows.length && !findProductivity(allocation, allocation.machineId, { machines, matrixRows })) {
      errors.push(`${prefix}: maquina sem produtividade valida para material/pessoas.`);
    }
    Object.values(allocation || {}).forEach(value => {
      if (typeof value === 'number' && Number.isNaN(value)) errors.push(`${prefix}: NaN encontrado.`);
    });
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
  machines = [],
  matrixRows = [],
  days = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES,
  confirmMerge = false,
  confirmReplace = false,
  capacityDecision = 'cancel'
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
    date: normalizeDateOnly(targetDate),
    machineId: String(targetMachineId || ''),
    source: 'manual',
    pinned: true
  }, targetMachineId, context), previous);
  const others = sourceAllocations.filter(allocation => String(allocation.allocationId) !== normalizedId);
  const occupants = cellAllocations(others, moved.date, moved.machineId);
  let nextAllocations = others;
  let action = 'move';

  if (!occupants.length) {
    nextAllocations = [...others, moved];
  } else {
    const compatible = occupants.find(item => sameMaterialCompatible(item, moved));
    if (compatible) {
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
      const occupant = occupants[0];
      if (!confirmReplace) {
        throw makeMoveError('Substituir producao programada', 'CONFIRM_REPLACE', previous, { occupyingAllocation: occupant });
      }
      nextAllocations = others.filter(allocation => String(allocation.allocationId) !== String(occupant.allocationId));
      if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision !== 'override') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: moved });
      }
      nextAllocations.push({
        ...moved,
        isCapacityOverride: toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
      });
      const placement = findNextPlacement(occupant, nextAllocations, context, {
        startDate: moved.date,
        preferredMachineId: occupant.machineId
      });
      if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para reagendar o ocupante.', 'NO_NEXT_SLOT', previous);
      if (placement.mergeIntoAllocationId) {
        nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
      }
      nextAllocations.push(placement.allocation);
      action = 'replace';
    }
  }

  const next = {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation).map((allocation, index) => ({ ...allocation, sequence: index + 1 })),
    updatedAt: new Date().toISOString(),
    dirty: true,
    lastManualAction: action
  };
  const validation = validateManualScheduleDraft(next, {
    machines,
    previousAllocations: sourceAllocations,
    matrixRows
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
  now = new Date()
} = {}) {
  const normalized = consolidateManualScheduleAllocations(allocations.map(normalizeAllocation));
  const timestamp = now instanceof Date ? now.toISOString() : new Date().toISOString();
  const draft = {
    draftId: createId('manual-draft'),
    planningId: planningId == null ? null : String(planningId),
    baseSimulationId: baseSimulationId == null ? null : String(baseSimulationId),
    allocations: normalized,
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
