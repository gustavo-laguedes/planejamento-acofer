import { normalizePlanningMachineName as normalizeProductionCalendarMachineName } from './planningMachineOrder.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.replace(',', '.'));
  return Number(value);
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function productionIdentity(source = {}) {
  const productionIndex = firstValue(source?.productionIndex, source?.production_index);
  return firstValue(
    source?.productionId,
    source?.production_id,
    source?.productionKey,
    source?.production_key,
    productionIndex === undefined ? undefined : `production-${productionIndex}`
  );
}

function productionStageKeys(source = {}, inheritedProductionId = null) {
  const productionId = firstValue(productionIdentity(source), inheritedProductionId);
  if (productionId === undefined) return [];
  const operationId = firstValue(source?.operationId, source?.operation_id);
  const materialId = firstValue(source?.materialId, source?.material_id);
  return [
    operationId === undefined ? null : `${productionId}|operation|${String(operationId).replace(/:day-\d+$/i, '')}`,
    materialId === undefined ? null : `${productionId}|material|${materialId}`
  ].filter(Boolean);
}

function isProductiveTreeNode(node = {}) {
  if (node?.isInitialRawMaterial === true || node?.is_initial_raw_material === true) return false;
  const produceQty = firstValue(node?.produceQty, node?.produce_qty);
  return produceQty !== undefined && toNumber(produceQty) > 0;
}

/**
 * Indexes real production-chain stages from a requirement tree. The tree is oriented
 * from final product to inputs, so stages are resolved bottom-up per production.
 */
export function buildProductionStageIndex(tree) {
  const stages = new Map();
  const roots = productionIdentity(tree) === undefined && toArray(tree?.children).length
    ? toArray(tree.children)
    : tree && typeof tree === 'object' ? [tree] : [];

  function visit(node, inheritedProductionId, path) {
    if (!node || typeof node !== 'object' || path.has(node)) return 0;
    const productionId = firstValue(productionIdentity(node), inheritedProductionId);
    const nextPath = new Set(path);
    nextPath.add(node);
    const childStages = toArray(node.children).map(child => visit(child, productionId, nextPath));
    const deepestProductiveChild = childStages.length ? Math.max(...childStages) : 0;
    if (!isProductiveTreeNode(node)) return deepestProductiveChild;

    const stage = deepestProductiveChild + 1;
    productionStageKeys(node, productionId).forEach(key => {
      stages.set(key, Math.max(stages.get(key) || 0, stage));
    });
    return stage;
  }

  roots.forEach(root => visit(root, productionIdentity(root), new Set()));
  return stages;
}

function productionRoots(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return productionIdentity(tree) === undefined && toArray(tree.children).length
    ? toArray(tree.children)
    : [tree];
}

export function buildProductionMembershipIndex(tree, stageIndex = buildProductionStageIndex(tree)) {
  const memberships = new Map();

  function visit(node, production, path) {
    if (!node || typeof node !== 'object' || path.has(node)) return;
    const nextPath = new Set(path);
    nextPath.add(node);
    const productionId = firstValue(productionIdentity(node), production.productionId);
    if (isProductiveTreeNode(node)) {
      const membership = {
        productionId: String(productionId),
        productionIndex: toOptionalNumber(firstValue(node?.productionIndex, node?.production_index, production.productionIndex)),
        productionOrder: toOptionalNumber(production.productionOrder),
        productionColor: String(firstValue(node?.productionColor, node?.production_color, production.productionColor, '')),
        productionStage: productionStageForOperation({
          ...node,
          productionId
        }, stageIndex),
        productionTitle: String(firstValue(node?.productionTitle, node?.production_title, production.productionTitle, '')),
        productionMaterialName: String(production.productionMaterialName || '')
      };
      productionStageKeys(node, productionId).forEach(key => memberships.set(key, membership));
    }
    toArray(node.children).forEach(child => visit(child, { ...production, productionId }, nextPath));
  }

  productionRoots(tree).forEach((root, rootOrder) => {
    const productionIndex = firstValue(root?.productionIndex, root?.production_index, rootOrder);
    const productionId = firstValue(productionIdentity(root), `production-${productionIndex}`);
    visit(root, {
      productionId,
      productionIndex,
      productionOrder: productionIndex,
      productionColor: firstValue(root?.productionColor, root?.production_color, ''),
      productionTitle: firstValue(root?.productionTitle, root?.production_title, ''),
      productionMaterialName: firstValue(root?.materialName, root?.material_name, '')
    }, new Set());
  });

  return memberships;
}

function productionStageForOperation(operation, stageIndex) {
  const explicit = positiveInteger(firstValue(
    operation?.productionStage,
    operation?.production_stage
  ));
  if (explicit) return explicit;
  for (const key of productionStageKeys(operation)) {
    const stage = positiveInteger(stageIndex.get(key));
    if (stage) return stage;
  }
  return null;
}

function productionMembershipFor(source, operation, context, sourceKind = 'legacy') {
  const candidate = {
    ...operation,
    ...source,
    materialId: firstValue(source?.materialId, source?.material_id, operation?.materialId, operation?.material_id)
  };
  const indexed = productionStageKeys(candidate)
    .map(key => context.productionMembershipIndex.get(key))
    .find(Boolean);
  if (!indexed) return null;
  const productionIndex = toOptionalNumber(firstValue(source?.productionIndex, source?.production_index, indexed.productionIndex));
  const quantity = toOptionalNumber(firstValue(source?.quantity, source?.produceQty, source?.produce_qty));
  const membership = {
    productionId: String(firstValue(productionIdentity(source), indexed.productionId)),
    productionIndex,
    productionOrder: toOptionalNumber(firstValue(source?.productionOrder, source?.production_order, indexed.productionOrder, productionIndex)),
    productionColor: String(firstValue(source?.productionColor, source?.production_color, indexed.productionColor, '')),
    productionStage: positiveInteger(firstValue(source?.productionStage, source?.production_stage, indexed.productionStage)),
    productionTitle: String(firstValue(source?.productionTitle, source?.production_title, indexed.productionTitle, '')),
    productionMaterialName: String(indexed.productionMaterialName || ''),
    unit: String(firstValue(source?.unit, source?.plannedUnit, source?.planned_unit, operation?.unit, operation?.plannedUnit, operation?.planned_unit, '')),
    quantitySource: quantity === null
      ? 'legacy-unresolved'
      : String(firstValue(source?.quantitySource, source?.quantity_source, sourceKind === 'production-breakdown'
        ? 'production-breakdown'
        : 'allocation-primary'))
  };
  if (quantity !== null) membership.quantity = quantity;
  return membership;
}

function productionMembershipsForOperation(operation, context) {
  const hasProductionBreakdown = toArray(operation?.productionBreakdown).length > 0;
  const breakdown = hasProductionBreakdown
    ? toArray(operation.productionBreakdown)
    : [operation];
  const byProduction = new Map();
  breakdown.forEach(source => {
    const membership = productionMembershipFor(
      source,
      operation,
      context,
      hasProductionBreakdown ? 'production-breakdown' : 'allocation-primary'
    );
    if (!membership?.productionId) return;
    const key = `${membership.productionId}\u0000${String(membership.unit || '').trim().toLocaleLowerCase('pt-BR')}`;
    const current = byProduction.get(key);
    if (!current) {
      byProduction.set(key, membership);
      return;
    }
    const currentResolved = current.quantitySource !== 'legacy-unresolved' && Number.isFinite(Number(current.quantity));
    const nextResolved = membership.quantitySource !== 'legacy-unresolved' && Number.isFinite(Number(membership.quantity));
    if (!currentResolved || !nextResolved) {
      delete current.quantity;
      current.quantitySource = 'legacy-unresolved';
      return;
    }
    current.quantity = Number((Number(current.quantity) + Number(membership.quantity)).toFixed(6));
  });
  return [...byProduction.values()].sort((left, right) => (
    Number(left.productionIndex ?? left.productionOrder ?? Number.MAX_SAFE_INTEGER)
      - Number(right.productionIndex ?? right.productionOrder ?? Number.MAX_SAFE_INTEGER)
    || String(left.productionId).localeCompare(String(right.productionId))
  ));
}

function normalizeDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.slice(0, 10);
}

function isValidDateOnly(value) {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatDateLabel(date) {
  if (!isValidDateOnly(date)) return date;
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function weekdayLabel(date) {
  if (!isValidDateOnly(date)) return '';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

function normalizeDay(day) {
  const date = normalizeDateOnly(firstValue(
    day?.date,
    day?.planned_date,
    day?.plannedDate,
    day?.startDate,
    day
  ));

  if (!isValidDateOnly(date)) return null;

  const isWorkingDay = firstValue(
    day?.isWorkingDay,
    day?.workingDay,
    day?.is_business_day,
    day?.business_day,
    day?.businessDay
  );

  const normalized = {
    date,
    label: String(firstValue(day?.label, day?.dateLabel, day?.plannedDateLabel, formatDateLabel(date))),
    weekday: String(firstValue(day?.weekday, day?.weekDay, day?.dayOfWeek, weekdayLabel(date)))
  };

  if (isWorkingDay !== undefined) normalized.isWorkingDay = Boolean(isWorkingDay);
  return normalized;
}

function normalizeMachine(machine, order) {
  const machineId = firstValue(
    machine?.machineId,
    machine?.machine_id,
    machine?.id,
    machine?.machineName,
    machine?.machine_name,
    machine?.name,
    machine
  );
  const machineName = firstValue(
    machine?.machineName,
    machine?.machine_name,
    machine?.name,
    machineId
  );

  if (!machineId) return null;

  return {
    machineId: String(machineId),
    machineName: String(machineName),
    order: Number.isFinite(Number(machine?.order ?? machine?.machinePriority ?? machine?.machine_priority))
      ? Number(machine?.order ?? machine?.machinePriority ?? machine?.machine_priority)
      : order
  };
}

function pushUniqueBy(items, item, keyForItem) {
  if (!item) return;
  const key = keyForItem(item);
  if (!key || items.some(current => keyForItem(current) === key)) return;
  items.push(item);
}

function pushUniqueMachine(machines, machine) {
  if (!machine) return;
  const machineId = String(machine.machineId || '');
  const machineName = normalizeProductionCalendarMachineName(machine.machineName);
  const exists = machines.some(current => (
    String(current.machineId || '') === machineId
    || (
      machineName
      && normalizeProductionCalendarMachineName(current.machineName) === machineName
    )
  ));
  if (!exists) machines.push(machine);
}

function operationDate(operation) {
  return normalizeDateOnly(firstValue(
    operation?.date,
    operation?.planned_date,
    operation?.plannedDate,
    operation?.startDate,
    operation?.endDate
  ));
}

function operationQuantity(operation) {
  return toNumber(firstValue(
    operation?.quantity,
    operation?.produceQty,
    operation?.planned_qty,
    operation?.plannedQty
  ));
}

function operationDurationMinutes(operation) {
  return toNumber(firstValue(
    operation?.durationMinutes,
    operation?.duration,
    operation?.daily_minutes,
    operation?.dailyMinutes,
    operation?.totalMinutes,
    operation?.total_minutes
  ));
}

function findMachineByName(machines, machineName) {
  const key = normalizeProductionCalendarMachineName(machineName);
  if (!key) return null;
  return machines.find(machine => normalizeProductionCalendarMachineName(machine.machineName) === key) || null;
}

function operationMachine(operation, machines) {
  const explicitMachineId = firstValue(operation?.machineId, operation?.machine_id);
  const machineName = firstValue(operation?.machineName, operation?.machine_name);
  const matchedMachine = findMachineByName(machines, machineName);

  return {
    machineId: firstValue(matchedMachine?.machineId, explicitMachineId, machineName),
    machineName: firstValue(machineName, matchedMachine?.machineName, explicitMachineId)
  };
}

function operationMachineName(operation) {
  return firstValue(
    operation?.machineName,
    operation?.machine_name,
    operation?.machineId,
    operation?.machine_id
  );
}

function operationIdFor(operation) {
  return firstValue(
    operation?.operationId,
    operation?.operation_id,
    operation?.calendarParentOperationId,
    operation?.splitParentOperationId
  );
}

function operationProductionId(operation) {
  return firstValue(
    operation?.productionId,
    operation?.production_id,
    operation?.productionKey,
    operation?.production_key
  );
}

function operationCalendarParentOperationId(operation) {
  return firstValue(
    operation?.calendarParentOperationId,
    operation?.calendar_parent_operation_id,
    operation?.splitParentOperationId,
    operation?.split_parent_operation_id
  );
}

function operationParentOperationId(operation) {
  return firstValue(
    operation?.parentOperationId,
    operation?.parent_operation_id,
    operation?.splitParentOperationId,
    operation?.split_parent_operation_id
  );
}

function operationMaterialId(operation) {
  return firstValue(operation?.materialId, operation?.material_id);
}

function currentDailyId(operation) {
  return firstValue(
    operation?.allocationId,
    operation?.allocation_id,
    operation?.event_id,
    operation?.eventId,
    operation?.day_id,
    operation?.dayId,
    operation?.calendarDayId,
    operation?.calendar_day_id,
    operation?.id
  );
}

function deterministicAllocationId({ operation, operationId, planningId, machineId, date, sequence }) {
  const dailyId = currentDailyId(operation);
  if (dailyId) return String(dailyId);

  return [
    'readonly',
    planningId ? `plan-${planningId}` : 'plan-unknown',
    `operation-${operationId}`,
    `date-${date}`,
    `machine-${machineId}`,
    `sequence-${sequence}`
  ].join(':');
}

function validationError(code, message, operationId, value) {
  const error = { code, message };
  if (operationId) error.operationId = String(operationId);
  if (value !== undefined) error.value = value;
  return error;
}

function adaptOperation(operation, context) {
  const operationId = operationIdFor(operation);
  const productionId = operationProductionId(operation);
  const productionIndex = firstValue(operation?.productionIndex, operation?.production_index);
  const productionOrder = firstValue(operation?.productionOrder, operation?.production_order);
  const productionColor = firstValue(operation?.productionColor, operation?.production_color);
  const calendarParentOperationId = operationCalendarParentOperationId(operation);
  const parentOperationId = operationParentOperationId(operation);
  const materialId = operationMaterialId(operation);
  const machine = operationMachine(operation, context.machines);
  const machineId = machine.machineId;
  const date = operationDate(operation);
  const quantity = operationQuantity(operation);
  const durationMinutes = operationDurationMinutes(operation);
  const sequence = Number(firstValue(operation?.sequence, operation?.productionOrder, operation?.calendarDayIndex, context.index));
  const productionStage = productionStageForOperation(operation, context.productionStageIndex);
  const productionMemberships = productionMembershipsForOperation(operation, context);
  const issues = [];

  if (!operationId) issues.push(validationError('operationId.missing', 'operationId ausente.', null, operationId));
  if (!materialId) issues.push(validationError('materialId.missing', 'materialId ausente.', operationId, materialId));
  if (!machineId) issues.push(validationError('machineId.missing', 'machineId ausente.', operationId, machineId));
  if (!isValidDateOnly(date)) issues.push(validationError('date.invalid', 'Data invalida.', operationId, date));
  if (!(quantity > 0)) issues.push(validationError('quantity.invalid', 'quantity deve ser maior que zero.', operationId, quantity));
  if (!(durationMinutes > 0)) issues.push(validationError('durationMinutes.invalid', 'durationMinutes deve ser maior que zero.', operationId, durationMinutes));

  if (issues.length) return { allocation: null, issues };

  const safeSequence = Number.isFinite(sequence) ? sequence : context.index;

  return {
    allocation: {
      allocationId: deterministicAllocationId({
        operation,
        operationId,
        planningId: context.planningId,
        machineId,
        date,
        sequence: safeSequence
      }),
      operationId: String(operationId),
      productionId: productionId == null ? '' : String(productionId),
      productionIndex: toOptionalNumber(productionIndex),
      productionOrder: toOptionalNumber(productionOrder),
      productionColor: productionColor == null ? '' : String(productionColor),
      productionStage,
      productionStageLabel: productionStage ? `ETAPA ${productionStage}` : '',
      productionMemberships,
      calendarParentOperationId: calendarParentOperationId == null ? '' : String(calendarParentOperationId),
      parentOperationId: parentOperationId == null ? '' : String(parentOperationId),
      planningId: context.planningId == null ? null : String(context.planningId),
      materialId: String(materialId),
      materialCode: String(firstValue(operation?.materialCode, operation?.material_code, '')),
      materialName: String(firstValue(operation?.materialName, operation?.material_name, '')),
      machineId: String(machineId),
      machineName: String(firstValue(machine.machineName, operationMachineName(operation))),
      date,
      endDate: String(firstValue(operation?.endDate, operation?.end_date, date)),
      startTime: String(firstValue(operation?.startTime, operation?.start_time, '')),
      endTime: String(firstValue(operation?.endTime, operation?.end_time, '')),
      quantity,
      unit: String(firstValue(operation?.unit, operation?.planned_unit, '')),
      durationMinutes,
      capacityPercent: toNumber(firstValue(operation?.capacityPercent, operation?.capacity_percent, 0)),
      maxDailyCapacity: toOptionalNumber(firstValue(
        operation?.maxDailyCapacity,
        operation?.dailyMaxCapacity,
        operation?.capacityMaxPerDay,
        operation?.maxCapacityPerDay,
        operation?.calendarDailyCapacity?.capacityPerDay,
        operation?.dailyCapacity?.capacityPerDay
      )),
      peopleCount: toNumber(firstValue(operation?.peopleCount, operation?.people_count, 0)),
      productivityOptions: toArray(operation?.productivityOptions).map(option => ({ ...option })),
      productivity: operation?.machineName || operation?.machine_name || operation?.outputQty || operation?.timeSeconds
        ? {
            machineName: String(firstValue(operation?.machineName, operation?.machine_name, machine.machineName, '')),
            peopleCount: toNumber(firstValue(operation?.peopleCount, operation?.people_count, 0)),
            outputQty: toNumber(firstValue(operation?.outputQty, operation?.output_qty, 0)),
            outputUnit: String(firstValue(operation?.outputUnit, operation?.output_unit, operation?.unit, operation?.planned_unit, '')),
            timeSeconds: toNumber(firstValue(operation?.timeSeconds, operation?.time_seconds, 0))
          }
        : null,
      sequence: safeSequence,
      source: 'automatic',
      status: String(firstValue(operation?.status, context.status, 'planned'))
    },
    issues: []
  };
}

/**
 * @typedef {Object} PlanningScheduleAdapterInput
 * @property {Array<Object|string|Date>} [days] Days from the current planning response or saved plan.
 * @property {Array<Object>} [operations] Current scheduled operations, used when calendarOperations is absent.
 * @property {Array<Object>} [calendarOperations] Current daily calendar cards from the planning simulation.
 * @property {Object} [tree] Real production requirement tree used to derive chain depth.
 * @property {Array<Object|string>} [machines] Optional machine list.
 * @property {string|number} [planningId] Optional planning id used only for deterministic read-only ids.
 */

/**
 * @typedef {Object} PlanningScheduleAdapterOutput
 * @property {Array<{date: string, label: string, weekday: string, isWorkingDay?: boolean}>} days
 * @property {Array<{machineId: string, machineName: string, order: number}>} machines
 * @property {Array<Object>} allocations
 * @property {Array<{code: string, message: string, operationId?: string, value?: *}>} errors
 * @property {Array<{code: string, message: string, operationId?: string, value?: *}>} warnings
 */

/**
 * Converts the current planning/calendar result into read-only schedule allocations.
 *
 * The adapter is pure: it does not call APIs, touch the DOM, mutate input data, or create
 * persistent identifiers. It only maps already scheduled planning cards into the V2 shape.
 *
 * @param {PlanningScheduleAdapterInput} input
 * @returns {PlanningScheduleAdapterOutput}
 */
export function adaptPlanningResultToScheduleSnapshot(input = {}) {
  const planningId = firstValue(input.planningId, input.planId, input.plan_id, input.id);
  const sourceOperations = toArray(input.calendarOperations).length
    ? toArray(input.calendarOperations)
    : toArray(input.operations);
  const errors = [];
  const warnings = [];
  const allocations = [];
  const days = [];
  const machines = [];
  const productionStageIndex = buildProductionStageIndex(input.tree ?? input.scheduleTree ?? input.schedule_tree);
  const productionMembershipIndex = buildProductionMembershipIndex(
    input.tree ?? input.scheduleTree ?? input.schedule_tree,
    productionStageIndex
  );

  toArray(input.days).forEach(day => {
    pushUniqueBy(days, normalizeDay(day), item => item.date);
  });

  toArray(input.machines).forEach((machine, index) => {
    pushUniqueMachine(machines, normalizeMachine(machine, index));
  });

  sourceOperations.forEach((operation, index) => {
    const { allocation, issues } = adaptOperation(operation, {
      planningId,
      status: input.status,
      machines,
      productionStageIndex,
      productionMembershipIndex,
      index
    });

    if (issues.length) {
      errors.push(...issues);
      return;
    }

    allocations.push(allocation);
    pushUniqueBy(days, normalizeDay({ date: allocation.date }), item => item.date);
    pushUniqueMachine(machines, normalizeMachine({
      machineId: allocation.machineId,
      machineName: allocation.machineName
    }, machines.length));
  });

  if (!sourceOperations.length) {
    warnings.push(validationError(
      'operations.empty',
      'Nenhuma operation/calendarOperation recebida para converter em allocation.',
      null,
      0
    ));
  }

  return {
    days,
    machines,
    allocations,
    errors,
    warnings
  };
}
