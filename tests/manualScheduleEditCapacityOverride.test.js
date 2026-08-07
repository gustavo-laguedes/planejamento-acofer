import assert from 'node:assert/strict';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import { applyManualScheduleTransaction } from '../services/manualScheduleTransaction.service.js';

const machines = ['M1', 'M2'].map(machineId => ({ machineId, machineName: machineId }));
const materials = [{ id: 'RAW', name: 'RAW' }];
const productivityMatrix = machines.map(machine => ({
  material_id: 'RAW',
  material_code: 'RAW',
  machine_id: machine.machineId,
  machine_name: machine.machineName,
  people_count: 2,
  output_qty: 10,
  output_unit: 'kg',
  time_seconds: 32400
}));

const allocation = {
  allocationId: 'edit-capacity',
  parentOperationId: 'op:edit-capacity',
  productionId: 'production:edit-capacity',
  materialId: 'RAW',
  materialCode: 'RAW',
  materialName: 'RAW',
  machineId: 'M1',
  machineName: 'M1',
  date: '2026-07-13',
  startTime: '08:00',
  endTime: '10:00',
  quantity: 12,
  unit: 'kg',
  durationMinutes: 120,
  capacityPercent: 50,
  maxDailyCapacity: 10,
  peopleCount: 2,
  source: 'automatic'
};

const draft = createManualScheduleDraft({
  planningId: 'PLAN-EDIT-OVERRIDE',
  baseSimulationId: 'SIM-EDIT-OVERRIDE',
  allocations: [allocation],
  machines,
  now: '2026-07-13T12:00:00.000Z'
});

const validationContext = {
  operations: [],
  materials,
  machines,
  productivityMatrix,
  stock: [],
  stockMinimums: [],
  stockLocations: [],
  dependencies: [],
  transports: [],
  shifts: [{ shiftId: 'day', label: 'Diurno', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }],
  dailyTeamOverrides: {},
  manualWorkDates: [],
  setupMinutes: 0,
  minimumStartRatio: 1,
  dependencyCompletionBufferMinutes: 60,
  holidays: [],
  timezone: 'America/Sao_Paulo'
};

const draftContext = {
  machines,
  productivityMatrix,
  dailyMinutes: 540,
  now: '2026-07-13T13:00:00.000Z',
  validatedAt: '2026-07-13T13:00:00.000Z'
};

const editIntent = {
  type: 'EDIT_ALLOCATION',
  allocationId: 'edit-capacity',
  machineId: 'M2',
  peopleCount: 2,
  date: '2026-07-13',
  startTime: '08:00'
};

const decision = applyManualScheduleTransaction({
  currentDraft: draft,
  intent: editIntent,
  draftContext,
  validationContext
});

assert.equal(decision.decisionRequired, true);
assert.equal(decision.decisionContext.code, 'CAPACITY_EXCEEDED');

const result = applyManualScheduleTransaction({
  currentDraft: draft,
  intent: editIntent,
  draftContext,
  validationContext,
  decisions: { capacityDecision: 'override' }
});

assert.equal(result.accepted, true);
assert.equal(result.draft.allocations[0].isCapacityOverride, true);
assert.ok(result.warnings.some(item => item.code === 'ALLOCATION_OUTSIDE_SHIFT'));
assert.ok(result.warnings.some(item => item.code === 'TEAM_SHIFT_NOT_FOUND'));
assert.ok(result.warnings.some(item => item.code === 'EXTRAORDINARY_CAPACITY_AUTHORIZED'));

console.log('manualScheduleEditCapacityOverride.test.js ok');
