const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EPSILON = 0.001;

const allocationIdentityRegistry = new Map();

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isValidDateOnly(value) {
  const normalized = String(value || '').slice(0, 10);
  if (!DATE_PATTERN.test(normalized)) return false;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized;
}

function normalizeTime(value, fallback = '') {
  return String(value || fallback || '').slice(0, 5);
}

function stableParentOperationId(operation = {}) {
  return String(
    operation.calendarParentOperationId
    || operation.parentOperationId
    || operation.splitParentOperationId
    || operation.operationId
    || operation.materialId
    || ''
  ).replace(/:day-\d+$/i, '');
}

function allocationPlanningId(operation = {}, planningId = null) {
  return planningId == null || planningId === '' ? null : String(planningId);
}

function allocationFingerprint(allocation) {
  return [
    allocation.planningId || 'plan',
    allocation.parentOperationId,
    allocation.productionId,
    allocation.productionIndex,
    allocation.materialId,
    allocation.date,
    allocation.startTime,
    allocation.endTime,
    allocation.machineId,
    Number(allocation.quantity).toFixed(6)
  ].join('|');
}

function parentPartitionKey(allocation) {
  return [
    allocation.planningId || 'plan',
    allocation.parentOperationId,
    allocation.productionId,
    allocation.productionIndex,
    allocation.materialId
  ].join('|');
}

function createTechnicalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `alloc:${crypto.randomUUID()}`;
  }
  return `alloc:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function takeReusableId(registry, fingerprint, parentKey) {
  const existing = registry.existingId;
  if (existing && !registry.usedIds.has(existing)) {
    registry.usedIds.add(existing);
    return existing;
  }

  const exact = registry.byFingerprint.get(fingerprint);
  if (exact && !registry.usedIds.has(exact)) {
    registry.usedIds.add(exact);
    return exact;
  }

  const candidates = registry.byParent.get(parentKey) || [];
  const candidate = candidates.find(id => !registry.usedIds.has(id));
  if (candidate) {
    registry.usedIds.add(candidate);
    return candidate;
  }

  const id = createTechnicalId();
  registry.usedIds.add(id);
  return id;
}

function operationMachineId(operation = {}) {
  return String(operation.machineId || operation.machine_id || operation.machineName || operation.machine_name || '');
}

function toPlanningDailyAllocation(operation, { planningId = null, allocationOrder = 0, source = 'automatic' } = {}) {
  const parentOperationId = stableParentOperationId(operation);
  const date = String(operation.startDate || operation.date || '').slice(0, 10);
  const quantity = toNumber(operation.quantity ?? operation.produceQty);
  const durationMinutes = toNumber(operation.durationMinutes ?? operation.duration ?? operation.totalMinutes);
  return {
    allocationId: operation.allocationId ? String(operation.allocationId) : '',
    parentOperationId,
    planningId: allocationPlanningId(operation, planningId),
    productionId: String(operation.productionId || operation.productionKey || `production-${operation.productionIndex || 0}`),
    productionIndex: Number.isFinite(Number(operation.productionIndex)) ? Number(operation.productionIndex) : 0,
    materialId: String(operation.materialId || ''),
    machineId: operationMachineId(operation),
    date,
    startTime: normalizeTime(operation.startTime, '07:00'),
    endTime: normalizeTime(operation.endTime, operation.startTime || '07:00'),
    quantity,
    unit: String(operation.unit || operation.plannedUnit || operation.outputUnit || ''),
    durationMinutes,
    capacityPercent: Number.isFinite(Number(operation.capacityPercent)) ? Number(operation.capacityPercent) : null,
    peopleCount: toNumber(operation.peopleCount),
    allocationOrder,
    source
  };
}

function operationFromAllocation(sourceOperation, allocation) {
  const quantity = Number(allocation.quantity.toFixed(6));
  return {
    ...sourceOperation,
    allocationId: allocation.allocationId,
    parentOperationId: allocation.parentOperationId,
    calendarParentOperationId: allocation.parentOperationId,
    operationId: sourceOperation.operationId || allocation.parentOperationId,
    productionId: allocation.productionId,
    productionIndex: allocation.productionIndex,
    materialId: allocation.materialId,
    machineId: allocation.machineId,
    machineName: allocation.machineId,
    startDate: allocation.date,
    endDate: allocation.date,
    startTime: allocation.startTime,
    endTime: allocation.endTime,
    quantity,
    produceQty: quantity,
    duration: allocation.durationMinutes,
    durationMinutes: allocation.durationMinutes,
    capacityPercent: allocation.capacityPercent,
    peopleCount: allocation.peopleCount,
    sequence: allocation.allocationOrder,
    allocationOrder: allocation.allocationOrder,
    allocationSource: allocation.source,
    segments: [{
      date: allocation.date,
      startTime: allocation.startTime,
      endTime: allocation.endTime,
      minutes: allocation.durationMinutes
    }]
  };
}

function normalizedOverrides(overrides = []) {
  return (Array.isArray(overrides) ? overrides : [])
    .filter(override => override && override.active !== false)
    .map(override => ({
      allocationId: String(override.allocationId || ''),
      parentOperationId: String(override.parentOperationId || ''),
      targetDate: String(override.targetDate || '').slice(0, 10),
      targetMachineId: String(override.targetMachineId || ''),
      active: true,
      source: override.source === 'click_move' ? 'click_move' : 'drag'
    }))
    .filter(override => override.allocationId && override.parentOperationId && isValidDateOnly(override.targetDate) && override.targetMachineId);
}

function validatePlanningDailyAllocations(allocations, parentTotals, machines = []) {
  const errors = [];
  const seen = new Set();
  const machineIds = new Set((Array.isArray(machines) ? machines : [])
    .flatMap(machine => [machine.machineId, machine.machineName, machine.id, machine.name])
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(String));
  const sums = new Map();

  allocations.forEach((allocation, index) => {
    const prefix = `allocation[${index}]`;
    if (!allocation.allocationId) errors.push(`${prefix}: allocationId ausente.`);
    if (seen.has(String(allocation.allocationId))) errors.push(`${prefix}: allocationId duplicado.`);
    seen.add(String(allocation.allocationId));
    if (!allocation.parentOperationId || !parentTotals.has(allocation.parentOperationId)) errors.push(`${prefix}: parentOperationId inexistente.`);
    if (!(allocation.quantity > 0)) errors.push(`${prefix}: quantity deve ser maior que zero.`);
    if (!(allocation.durationMinutes > 0)) errors.push(`${prefix}: durationMinutes deve ser maior que zero.`);
    if (!isValidDateOnly(allocation.date)) errors.push(`${prefix}: data invalida.`);
    if (!allocation.machineId || (machineIds.size && !machineIds.has(String(allocation.machineId)))) errors.push(`${prefix}: maquina invalida.`);
    if (Object.values(allocation).some(value => typeof value === 'number' && Number.isNaN(value))) errors.push(`${prefix}: NaN encontrado.`);
    sums.set(allocation.parentOperationId, toNumber(sums.get(allocation.parentOperationId)) + allocation.quantity);
  });

  parentTotals.forEach((total, parentOperationId) => {
    const sum = toNumber(sums.get(parentOperationId));
    if (Math.abs(sum - total) > EPSILON) {
      errors.push(`${parentOperationId}: soma ${sum.toFixed(6)} difere do total ${total.toFixed(6)}.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function registerStableAllocationIds(allocations) {
  const nextByFingerprint = new Map();
  const nextByParent = new Map();
  const registry = {
    byFingerprint: allocationIdentityRegistry,
    byParent: new Map(),
    usedIds: new Set()
  };

  allocationIdentityRegistry.forEach((allocationId, key) => {
    const parentKey = key.split('|').slice(0, 5).join('|');
    const list = registry.byParent.get(parentKey) || [];
    list.push(allocationId);
    registry.byParent.set(parentKey, list);
  });

  allocations.forEach(allocation => {
    const fingerprint = allocationFingerprint(allocation);
    const parentKey = parentPartitionKey(allocation);
    allocation.allocationId = takeReusableId({
      ...registry,
      existingId: allocation.allocationId ? String(allocation.allocationId) : ''
    }, fingerprint, parentKey);
    nextByFingerprint.set(fingerprint, allocation.allocationId);
    const parentList = nextByParent.get(parentKey) || [];
    parentList.push(allocation.allocationId);
    nextByParent.set(parentKey, parentList);
  });

  allocationIdentityRegistry.clear();
  nextByFingerprint.forEach((allocationId, fingerprint) => {
    allocationIdentityRegistry.set(fingerprint, allocationId);
  });
}

function applyAllocationOverrides(allocations, overrides) {
  const manualAllocations = [];
  const overridesById = new Map(overrides.map(override => [override.allocationId, override]));
  const remainingByParent = new Map();

  allocations.forEach(allocation => {
    const total = toNumber(remainingByParent.get(allocation.parentOperationId));
    remainingByParent.set(allocation.parentOperationId, total + allocation.quantity);
  });

  allocations.forEach(allocation => {
    const override = overridesById.get(allocation.allocationId);
    if (!override || override.parentOperationId !== allocation.parentOperationId) return;
    manualAllocations.push({
      ...allocation,
      date: override.targetDate,
      machineId: override.targetMachineId,
      source: override.source
    });
    remainingByParent.set(allocation.parentOperationId, toNumber(remainingByParent.get(allocation.parentOperationId)) - allocation.quantity);
  });

  const automaticAllocations = [];
  const consumedByParent = new Map();
  allocations.forEach(allocation => {
    const override = overridesById.get(allocation.allocationId);
    if (override && override.parentOperationId === allocation.parentOperationId) return;
    const remaining = toNumber(remainingByParent.get(allocation.parentOperationId));
    const consumed = toNumber(consumedByParent.get(allocation.parentOperationId));
    const available = Math.max(remaining - consumed, 0);
    const quantity = Math.min(allocation.quantity, available);
    if (!(quantity > EPSILON)) return;
    consumedByParent.set(allocation.parentOperationId, consumed + quantity);
    automaticAllocations.push({
      ...allocation,
      quantity,
      durationMinutes: Math.max(Math.round(allocation.durationMinutes * (quantity / allocation.quantity)), 1),
      capacityPercent: allocation.capacityPercent == null
        ? null
        : Number((allocation.capacityPercent * (quantity / allocation.quantity)).toFixed(2)),
      source: 'automatic'
    });
  });

  return [...manualAllocations, ...automaticAllocations]
    .filter(allocation => allocation.quantity > EPSILON && allocation.durationMinutes > 0)
    .sort((left, right) =>
      left.date.localeCompare(right.date)
      || String(left.machineId).localeCompare(String(right.machineId))
      || left.allocationOrder - right.allocationOrder
    )
    .map((allocation, index) => ({ ...allocation, allocationOrder: index + 1 }));
}

export function buildPlanningDailyAllocations(calendarOperations, {
  planningId = null,
  allocationOverrides = [],
  machines = []
} = {}) {
  const sourceOperations = Array.isArray(calendarOperations) ? calendarOperations : [];
  const parentTotals = new Map();
  const sourceAllocations = sourceOperations
    .map((operation, index) => toPlanningDailyAllocation(operation, { planningId, allocationOrder: index + 1 }))
    .filter(allocation => allocation.parentOperationId && allocation.quantity > EPSILON && allocation.durationMinutes > 0);

  sourceAllocations.forEach(allocation => {
    parentTotals.set(allocation.parentOperationId, toNumber(parentTotals.get(allocation.parentOperationId)) + allocation.quantity);
  });

  registerStableAllocationIds(sourceAllocations);
  const allocations = applyAllocationOverrides(sourceAllocations, normalizedOverrides(allocationOverrides));
  registerStableAllocationIds(allocations);

  const validation = validatePlanningDailyAllocations(allocations, parentTotals, machines);
  if (!validation.valid) {
    const error = new Error('Falha ao validar alocacoes diarias do calendario de producao.');
    error.status = 400;
    error.details = validation.errors;
    throw error;
  }

  return {
    allocations,
    operations: allocations.map(allocation => {
      const sourceOperation = sourceOperations.find(operation => stableParentOperationId(operation) === allocation.parentOperationId) || {};
      return operationFromAllocation(sourceOperation, allocation);
    }),
    validation
  };
}

export function applyPlanningAllocationMove(allocationOverrides = [], {
  allocationId,
  parentOperationId,
  targetDate,
  targetMachineId,
  source = 'drag'
} = {}) {
  const next = (Array.isArray(allocationOverrides) ? allocationOverrides : [])
    .filter(override => String(override?.allocationId || '') !== String(allocationId || ''));
  next.push({
    allocationId: String(allocationId || ''),
    parentOperationId: String(parentOperationId || ''),
    targetDate: String(targetDate || '').slice(0, 10),
    targetMachineId: String(targetMachineId || ''),
    active: true,
    source: source === 'click_move' ? 'click_move' : 'drag'
  });
  return next;
}

export function resetPlanningAllocationIdentityRegistry() {
  allocationIdentityRegistry.clear();
}
