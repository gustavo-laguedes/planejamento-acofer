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
  const key = String(machineName || '').trim().toLowerCase();
  if (!key) return null;
  return machines.find(machine => String(machine.machineName || '').trim().toLowerCase() === key) || null;
}

function operationMachine(operation, machines) {
  const explicitMachineId = firstValue(operation?.machineId, operation?.machine_id);
  const machineName = firstValue(operation?.machineName, operation?.machine_name);
  const matchedMachine = findMachineByName(machines, machineName);

  return {
    machineId: firstValue(explicitMachineId, matchedMachine?.machineId, machineName),
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
      calendarParentOperationId: calendarParentOperationId == null ? '' : String(calendarParentOperationId),
      parentOperationId: parentOperationId == null ? '' : String(parentOperationId),
      planningId: context.planningId == null ? null : String(context.planningId),
      materialId: String(materialId),
      materialCode: String(firstValue(operation?.materialCode, operation?.material_code, '')),
      materialName: String(firstValue(operation?.materialName, operation?.material_name, '')),
      machineId: String(machineId),
      machineName: String(firstValue(machine.machineName, operationMachineName(operation))),
      date,
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
 * @typedef {Object} ProductionCalendarAdapterInput
 * @property {Array<Object|string|Date>} [days] Days from the current planning response or saved plan.
 * @property {Array<Object>} [operations] Current scheduled operations, used when calendarOperations is absent.
 * @property {Array<Object>} [calendarOperations] Current daily calendar cards from the planning simulation.
 * @property {Array<Object|string>} [machines] Optional machine list.
 * @property {string|number} [planningId] Optional planning id used only for deterministic read-only ids.
 */

/**
 * @typedef {Object} ProductionCalendarAdapterOutput
 * @property {Array<{date: string, label: string, weekday: string, isWorkingDay?: boolean}>} days
 * @property {Array<{machineId: string, machineName: string, order: number}>} machines
 * @property {Array<Object>} allocations
 * @property {Array<{code: string, message: string, operationId?: string, value?: *}>} errors
 * @property {Array<{code: string, message: string, operationId?: string, value?: *}>} warnings
 */

/**
 * Converts the current planning/calendar result into read-only ProductionCalendar allocations.
 *
 * The adapter is pure: it does not call APIs, touch the DOM, mutate input data, or create
 * persistent identifiers. It only maps already scheduled planning cards into the V2 shape.
 *
 * @param {ProductionCalendarAdapterInput} input
 * @returns {ProductionCalendarAdapterOutput}
 */
export function adaptPlanningResultToProductionCalendar(input = {}) {
  const planningId = firstValue(input.planningId, input.planId, input.plan_id, input.id);
  const sourceOperations = toArray(input.calendarOperations).length
    ? toArray(input.calendarOperations)
    : toArray(input.operations);
  const errors = [];
  const warnings = [];
  const allocations = [];
  const days = [];
  const machines = [];
  const hasInputMachines = toArray(input.machines).length > 0;

  toArray(input.days).forEach(day => {
    pushUniqueBy(days, normalizeDay(day), item => item.date);
  });

  toArray(input.machines).forEach((machine, index) => {
    pushUniqueBy(machines, normalizeMachine(machine, index), item => item.machineId);
  });

  sourceOperations.forEach((operation, index) => {
    const { allocation, issues } = adaptOperation(operation, {
      planningId,
      status: input.status,
      machines,
      index
    });

    if (issues.length) {
      errors.push(...issues);
      return;
    }

    allocations.push(allocation);
    pushUniqueBy(days, normalizeDay({ date: allocation.date }), item => item.date);
    if (!hasInputMachines) {
      pushUniqueBy(machines, normalizeMachine({
        machineId: allocation.machineId,
        machineName: allocation.machineName
      }, machines.length), item => item.machineId);
    }
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
