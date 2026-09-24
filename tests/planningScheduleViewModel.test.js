import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPlanningScheduleViewModel,
  PLANNING_SCHEDULE_VIEW_CONTRACT_VERSION
} from '../shared/planning-schedule-view/planningScheduleViewModel.js';

const baseAllocation = {
  allocationId: 'allocation-1',
  operationId: 'operation-1',
  parentOperationId: 'parent-1',
  calendarParentOperationId: 'calendar-parent-1',
  productionId: 'production-1',
  productionIndex: 1,
  machineId: 'machine-1',
  machineName: 'Máquina 1',
  date: '2026-07-24',
  startTime: '07:00',
  endDate: '2026-07-25',
  endTime: '01:00',
  quantity: 12.5,
  unit: 'kg',
  durationMinutes: 1080,
  capacityPercent: 82.5,
  peopleCount: 3,
  productionColor: '#123456',
  productionMemberships: [{
    productionId: 'production-1',
    productionIndex: 1,
    quantity: 12.5,
    unit: 'kg',
    quantitySource: 'production-breakdown'
  }]
};
const source = {
  days: [{ date: '2026-07-24', isWorkingDay: true }],
  machines: [{ machineId: 'machine-1', machineName: 'Máquina 1', order: 2 }],
  allocations: [
    baseAllocation,
    {
      ...baseAllocation,
      allocationId: 'readonly:plan-legacy:operation-2',
      operationId: 'operation-2',
      quantity: 7
    }
  ],
  validation: {
    valid: true,
    warnings: [],
    presentation: {
      issues: [{
        code: 'TEAM_DAILY_CAPACITY',
        severity: 'warning',
        message: 'Equipe diaria abaixo do pico',
        date: '2026-07-24',
        resourceId: 'machine-1'
      }]
    }
  },
  permissions: { readOnly: true, canEditAllocations: true, canEditDaySettings: true },
  visualState: { zoom: 1.25, selectedAllocationId: 'allocation-1' },
  errors: []
};
const sourceBefore = structuredClone(source);

const model = buildPlanningScheduleViewModel(source);
assert.deepEqual(source, sourceBefore, 'derivação não pode mutar o snapshot aceito');
assert.equal(model.contractVersion, PLANNING_SCHEDULE_VIEW_CONTRACT_VERSION);
assert.deepEqual(model.capabilities, { inspect: true, mutate: false, manualMove: true, daySettings: true });
assert.equal(model.tasks[0].id, String(baseAllocation.allocationId));
assert.equal(model.tasks[0].persistable, true);
assert.equal(model.tasks[1].persistable, false, 'ID readonly de adapter nunca pode ser persistível');
assert.deepEqual(model.tasks[0].start, { date: '2026-07-24', time: '07:00' });
assert.deepEqual(model.tasks[0].end, { date: '2026-07-25', time: '01:00' });
assert.equal(model.tasks[0].resourceId, 'machine-1');
assert.equal(model.tasks[0].quantity, 12.5);
assert.equal(model.tasks[0].startCapacityPercent, 0);
assert.equal(model.tasks[0].endCapacityPercent, 82.5);
assert.equal(model.tasks[1].startCapacityPercent, 82.5);
assert.equal(model.tasks[1].endCapacityPercent, 165);
assert.equal(model.tasks[1].capacityOverrunPercent, 65);
assert.equal(model.metadata.warnings[0].code, 'GANTT_INTRADAY_CAPACITY_OVERFLOW');
assert.deepEqual(model.metadata.validationIssues, [{
  code: 'TEAM_DAILY_CAPACITY',
  severity: 'warning',
  message: 'Equipe diaria abaixo do pico',
  date: '2026-07-24',
  resourceId: 'machine-1'
}]);
assert.notEqual(model.metadata.validationIssues, source.validation.presentation.issues);
assert.notEqual(model.metadata.validationIssues[0], source.validation.presentation.issues[0]);
assert.equal(model.tasks[0].presentation.productionColor, '#123456');
assert.deepEqual(model.tasks[0].presentation.productionMemberships, baseAllocation.productionMemberships);
assert.deepEqual(model.tasks[0].productionMemberships, baseAllocation.productionMemberships);
assert.ok(Object.isFrozen(model));
assert.ok(Object.isFrozen(model.tasks[0]));
assert.ok(Object.isFrozen(model.metadata.validationIssues));
assert.ok(Object.isFrozen(model.metadata.validationIssues[0]));
assert.throws(() => { model.tasks[0].quantity = 99; }, TypeError);
assert.throws(() => { model.metadata.validationIssues[0].message = 'mutado'; }, TypeError);

const derivedCapacity = buildPlanningScheduleViewModel({
  allocations: [
    { ...baseAllocation, allocationId: 'daily-220', quantity: 220, maxDailyCapacity: 220, capacityPercent: 181.82 },
    { ...baseAllocation, allocationId: 'daily-180', quantity: 180, nominalDailyCapacity: 220, capacityPercent: 181.82 },
    { ...baseAllocation, allocationId: 'daily-130', quantity: 130, maxDailyCapacity: 220, capacityPercent: 181.82 }
  ],
  machines: source.machines
});
assert.deepEqual(
  derivedCapacity.tasks.map(task => [task.id, task.quantity, task.nominalDailyCapacity, task.capacityPercent]),
  [['daily-220', 220, 220, 100], ['daily-180', 180, 220, 81.82], ['daily-130', 130, 220, 59.09]],
  'Capacidade utilizada do view-model deve ser readonly e derivada da allocation diaria'
);

const trefilaResource = buildPlanningScheduleViewModel({
  allocations: [{
    ...baseAllocation,
    allocationId: 'allocation:trefila',
    machineId: 'Trefila',
    machineName: 'Trefila'
  }],
  machines: []
});
assert.deepEqual(
  trefilaResource.resources.map(resource => [resource.id, resource.name]),
  [['Trefila', 'Trefila']],
  'Gantt APS deve restaurar grupo de maquina pelo machineName real da allocation quando o catalogo nao chega no snapshot'
);

const genericResource = buildPlanningScheduleViewModel({
  allocations: [{
    ...baseAllocation,
    allocationId: 'allocation:generic-resource',
    machineId: 'resource-from-task',
    machineName: 'Recurso Externo'
  }],
  machines: []
});
assert.deepEqual(
  genericResource.resources.map(resource => [resource.id, resource.name]),
  [['resource-from-task', 'Recurso Externo']],
  'resource generico fora do catalogo original deve renderizar grupo pelo mesmo contrato visual'
);

for (const snapshot of [
  { allocations: [baseAllocation] },
  { allocations: [{ ...baseAllocation, source: 'manual-draft-v2' }] },
  { allocations: [{ ...baseAllocation, source: 'normalized-v1' }] },
  { allocations: [{ ...baseAllocation, allocationId: 'readonly:legacy-fallback' }] }
]) {
  const projected = buildPlanningScheduleViewModel(snapshot);
  assert.equal(projected.tasks.length, 1);
  assert.equal(projected.tasks[0].id, String(snapshot.allocations[0].allocationId));
}

assert.equal(
  buildPlanningScheduleViewModel({
    ...source,
    permissions: { readOnly: true, canEditAllocations: false }
  }).capabilities.manualMove,
  false,
  'movimento manual do Gantt deve depender da permissao canonica de edicao de allocations'
);

const moduleSource = [
  readFileSync(new URL('../shared/planning-schedule-view/planningScheduleViewModel.js', import.meta.url), 'utf8')
].join('\n');
assert.doesNotMatch(moduleSource, /\bfetch\s*\(|\bapi\s*\(/, 'contrato neutro não pode fazer HTTP');
assert.doesNotMatch(moduleSource, /scheduleOperations|simulateCurrent|buildPlan\s*\(/, 'contrato neutro não pode chamar scheduler');
assert.doesNotMatch(moduleSource, /onRequestMove|onEditAllocation|onSplitAllocation/, 'read model não transporta callbacks mutáveis');
assert.doesNotMatch(moduleSource, /planningScheduleViewToProductionCalendarSnapshot/);

console.log('planningScheduleViewModel.test.js ok');
