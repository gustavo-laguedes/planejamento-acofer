export const PLANNING_SCHEDULE_VIEW_CONTRACT_VERSION = 'planning-schedule-view/v1';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}

function freezeValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeValue);
  return Object.freeze(value);
}

function stringOrNull(value) {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function dailyCapacityValue(allocation = {}) {
  const candidates = [
    allocation.nominalDailyCapacity,
    allocation.maxDailyCapacity,
    allocation.capacityMaxPerDay,
    allocation.dailyMaxCapacity,
    allocation.maximumDailyQuantity
  ];
  for (const value of candidates) {
    const number = numberOrNull(value);
    if (number !== null && number > 0) return number;
  }
  return null;
}

function timeMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return Number.MAX_SAFE_INTEGER;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function orderTaskWithinMachineDay(left, right) {
  const leftSequence = numberOrNull(left.sequence ?? left.allocationOrder);
  const rightSequence = numberOrNull(right.sequence ?? right.allocationOrder);
  const leftSplitOrder = numberOrNull(left.splitOrder ?? left.split?.splitOrder);
  const rightSplitOrder = numberOrNull(right.splitOrder ?? right.split?.splitOrder);
  return (
    timeMinutes(left.start?.time) - timeMinutes(right.start?.time)
    || (leftSequence ?? Number.MAX_SAFE_INTEGER) - (rightSequence ?? Number.MAX_SAFE_INTEGER)
    || (leftSplitOrder ?? Number.MAX_SAFE_INTEGER) - (rightSplitOrder ?? Number.MAX_SAFE_INTEGER)
    || String(left.id ?? '').localeCompare(String(right.id ?? ''), 'pt-BR', { numeric: true })
  );
}

function applyIntradayCapacityOffsets(tasks = []) {
  const groups = new Map();
  tasks.forEach(task => {
    const resourceId = stringOrNull(task.resourceId);
    const date = stringOrNull(task.start?.date);
    if (!resourceId || !date) return;
    const key = `${resourceId}\u0000${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  });

  const offsets = new Map();
  const warnings = [];
  groups.forEach(group => {
    let used = 0;
    const ordered = [...group].sort(orderTaskWithinMachineDay);
    ordered.forEach(task => {
      const capacityPercent = Math.max(0, numberOrNull(task.capacityPercent) ?? 0);
      const startCapacityPercent = roundPercent(used) ?? 0;
      const endCapacityPercent = roundPercent(used + capacityPercent) ?? startCapacityPercent;
      offsets.set(task.id, {
        startCapacityPercent,
        endCapacityPercent,
        capacityOverrunPercent: Math.max(0, roundPercent(endCapacityPercent - 100) ?? 0)
      });
      used = endCapacityPercent;
    });
    if (used > 100) {
      warnings.push({
        code: 'GANTT_INTRADAY_CAPACITY_OVERFLOW',
        rule: 'gantt_intraday_capacity_offsets',
        severity: 'warning',
        blocking: false,
        resourceId: ordered[0]?.resourceId ?? null,
        date: ordered[0]?.start?.date ?? null,
        capacityPercentTotal: roundPercent(used),
        allocationIds: ordered.map(task => String(task.id))
      });
    }
  });

  return {
    tasks: tasks.map(task => ({
      ...task,
      startCapacityPercent: offsets.get(task.id)?.startCapacityPercent ?? 0,
      endCapacityPercent: offsets.get(task.id)?.endCapacityPercent ?? roundPercent(numberOrNull(task.capacityPercent) ?? 0),
      capacityOverrunPercent: offsets.get(task.id)?.capacityOverrunPercent ?? 0
    })),
    warnings
  };
}

function planningScheduleResource(machine = {}, order = 0) {
  const id = stringOrNull(machine.machineId ?? machine.id);
  if (!id) return null;
  return {
    ...cloneValue(machine),
    id,
    name: String(machine.machineName ?? machine.name ?? id),
    order: numberOrNull(machine.order) ?? order
  };
}

function planningScheduleTask(allocation = {}) {
  const allocationId = stringOrNull(allocation.allocationId ?? allocation.id);
  if (!allocationId) return null;
  const date = stringOrNull(allocation.date ?? allocation.startDate);
  const endDate = stringOrNull(allocation.endDate) || date;
  const quantity = numberOrNull(allocation.quantity);
  const nominalDailyCapacity = dailyCapacityValue(allocation);
  const capacityPercent = quantity !== null && nominalDailyCapacity !== null
    ? roundPercent((quantity / nominalDailyCapacity) * 100)
    : numberOrNull(allocation.capacityPercent);
  const presentation = {
    productionTitle: stringOrNull(allocation.productionTitle),
    stage: allocation.productionStage ?? null,
    stageLabel: stringOrNull(allocation.productionStageLabel),
    materialName: stringOrNull(allocation.materialName),
    materialCode: stringOrNull(allocation.materialCode),
    productionColor: stringOrNull(allocation.productionColor),
    productionMemberships: cloneValue(
      Array.isArray(allocation.productionMemberships) ? allocation.productionMemberships : []
    ),
    ...cloneValue(allocation.presentation || {})
  };
  return {
    ...cloneValue(allocation),
    id: allocationId,
    persistable: !allocationId.startsWith('readonly:'),
    operationId: stringOrNull(allocation.operationId),
    parentOperationId: stringOrNull(allocation.parentOperationId),
    calendarParentOperationId: stringOrNull(allocation.calendarParentOperationId),
    productionId: stringOrNull(allocation.productionId),
    productionIndex: numberOrNull(allocation.productionIndex),
    resourceId: stringOrNull(allocation.machineId),
    start: {
      date,
      time: stringOrNull(allocation.startTime)
    },
    end: {
      date: endDate,
      time: stringOrNull(allocation.endTime)
    },
    quantity,
    unit: stringOrNull(allocation.unit),
    durationMinutes: numberOrNull(allocation.durationMinutes),
    capacityPercent,
    nominalDailyCapacity,
    startCapacityPercent: numberOrNull(allocation.startCapacityPercent),
    endCapacityPercent: numberOrNull(allocation.endCapacityPercent),
    peopleCount: numberOrNull(allocation.peopleCount),
    pinned: allocation.pinned === true,
    isCapacityOverride: allocation.isCapacityOverride === true,
    split: cloneValue(allocation.split || {}),
    presentation
  };
}

/**
 * Builds the immutable, renderer-neutral projection of one accepted calendar snapshot.
 * The source is copied once and never mutated or promoted back to productive state.
 */
export function buildPlanningScheduleViewModel(snapshot = {}) {
  const sourceResources = (Array.isArray(snapshot.machines) ? snapshot.machines : [])
    .map(planningScheduleResource)
    .filter(Boolean);
  const rawTasks = (Array.isArray(snapshot.allocations) ? snapshot.allocations : [])
    .map(planningScheduleTask)
    .filter(Boolean);
  const resources = [...sourceResources];
  const resourceIds = new Set(resources.map(resource => String(resource.id)));
  rawTasks.forEach(task => {
    const id = stringOrNull(task.resourceId);
    if (!id || resourceIds.has(id)) return;
    resources.push({
      id,
      name: String(task.machineName ?? id),
      order: resources.length
    });
    resourceIds.add(id);
  });
  const intraday = applyIntradayCapacityOffsets(rawTasks);
  const model = {
    contractVersion: PLANNING_SCHEDULE_VIEW_CONTRACT_VERSION,
    capabilities: {
      inspect: true,
      mutate: false,
      manualMove: snapshot.permissions?.canEditAllocations === true,
      daySettings: snapshot.permissions?.canEditDaySettings === true
    },
    resources,
    tasks: intraday.tasks,
    calendar: {
      days: cloneValue(Array.isArray(snapshot.days) ? snapshot.days : []),
      shifts: cloneValue(Array.isArray(snapshot.shifts) ? snapshot.shifts : []),
      timezone: stringOrNull(snapshot.timezone)
    },
    projections: {
      stock: cloneValue(snapshot.stockProjection ?? null),
      dependencies: cloneValue(snapshot.dependencyProjection ?? null),
      resources: cloneValue(snapshot.resourceProjection ?? null),
      setup: cloneValue(snapshot.setupProjection ?? null),
      validation: cloneValue(snapshot.validation ?? null)
    },
    permissions: cloneValue(snapshot.permissions || {}),
    metadata: {
      errors: cloneValue(Array.isArray(snapshot.errors) ? snapshot.errors : []),
      warnings: [
        ...cloneValue(Array.isArray(snapshot.warnings) ? snapshot.warnings : []),
        ...intraday.warnings
      ],
      validationIssues: cloneValue(
        Array.isArray(snapshot.validation?.presentation?.issues)
          ? snapshot.validation.presentation.issues
          : []
      ),
      visualState: cloneValue(snapshot.visualState || {})
    }
  };
  return freezeValue(model);
}
