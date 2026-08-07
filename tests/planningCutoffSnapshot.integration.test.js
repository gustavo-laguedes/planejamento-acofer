import assert from 'node:assert/strict';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import {
  applyManualScheduleTransaction,
  buildManualScheduleCutoffSnapshot
} from '../services/manualScheduleTransaction.service.js';

const machines = [
  { machineId: 'MP', machineName: 'MP' },
  { machineId: 'MC', machineName: 'MC' }
];
const materials = [{ id: 'MAT', name: 'MAT' }, { id: 'FINAL', name: 'FINAL' }];
const productivityMatrix = [
  { material_id: 'MAT', material_code: 'MAT', machine_id: 'MP', machine_name: 'MP', people_count: 2, output_qty: 40, output_unit: 'kg', time_seconds: 7200 },
  { material_id: 'FINAL', material_code: 'FINAL', machine_id: 'MC', machine_name: 'MC', people_count: 3, output_qty: 20, output_unit: 'kg', time_seconds: 3600 },
  { material_id: 'FINAL', material_code: 'FINAL', machine_id: 'MC', machine_name: 'MC', people_count: 4, output_qty: 30, output_unit: 'kg', time_seconds: 3600 },
  { material_id: 'FINAL', material_code: 'FINAL', machine_id: 'MC', machine_name: 'MC', people_count: 5, output_qty: 40, output_unit: 'kg', time_seconds: 3600 }
];
const shifts = [{ shiftId: 'day', label: 'Turno 1', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }];

function allocation({ allocationId, parentOperationId, materialId, machineId, date, startTime, endTime, quantity, peopleCount, pinned = false }) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  return {
    allocationId, parentOperationId, operationId: parentOperationId,
    productionId: 'production-1', materialId, materialCode: materialId, materialName: materialId,
    machineId, machineName: machineId, date, startTime, endTime, quantity, unit: 'kg',
    durationMinutes: (endHour * 60 + endMinute) - (startHour * 60 + startMinute),
    capacityPercent: 100, maxDailyCapacity: quantity, peopleCount,
    source: pinned ? 'manual' : 'automatic', pinned,
    sourceAllocationIds: [allocationId],
    productionMemberships: [{ productionId: 'production-1', productionStage: materialId === 'MAT' ? 1 : 2 }],
    productionStage: materialId === 'MAT' ? 1 : 2
  };
}

const allocations = [
  allocation({ allocationId: 'past-production', parentOperationId: 'P', materialId: 'MAT', machineId: 'MP', date: '2026-07-16', startTime: '07:00', endTime: '09:00', quantity: 40, peopleCount: 2, pinned: true }),
  allocation({ allocationId: 'past-consumption', parentOperationId: 'C', materialId: 'FINAL', machineId: 'MC', date: '2026-07-16', startTime: '10:00', endTime: '11:00', quantity: 10, peopleCount: 3 }),
  allocation({ allocationId: 'future-consumption', parentOperationId: 'C', materialId: 'FINAL', machineId: 'MC', date: '2026-07-17', startTime: '07:00', endTime: '09:00', quantity: 20, peopleCount: 5 })
];
const context = {
  operations: [], materials, machines, productivityMatrix,
  stock: [{ materialId: 'MAT', quantity: 10, unit: 'kg' }],
  stockMinimums: [], stockLocations: [{ locationId: '__default__' }],
  dependencies: [{ dependencyId: 'P-C', producerParentOperationId: 'P', consumerParentOperationId: 'C', materialId: 'MAT', requiredQuantity: 30, unit: 'kg' }],
  transports: [], shifts, dailyTeamOverrides: { '2026-07-17': { day: 5 } }, manualWorkDates: [],
  setupMinutes: 0, minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60,
  holidays: [], timezone: 'America/Sao_Paulo'
};
const draft = createManualScheduleDraft({ allocations, machines, now: new Date('2026-07-16T12:00:00Z') });
const baseline = applyManualScheduleTransaction({
  currentDraft: draft,
  intent: { type: 'VALIDATE_DRAFT' },
  draftContext: { validatedAt: '2026-07-16T12:00:00Z' },
  validationContext: context
});
assert.equal(baseline.accepted, true, JSON.stringify(baseline.blockingIssues));

const snapshot = buildManualScheduleCutoffSnapshot({
  acceptedDraft: baseline.draft,
  validationContext: context,
  cutoffDate: '2026-07-17'
});
assert.equal(snapshot.balances.MAT.__default__.physicalBalance, 40, 'abertura deve ser o saldo acumulado até 16/07');
assert.equal(snapshot.balances.MAT.__default__.availableBalance, 40);
assert.equal(snapshot.accumulated.byMaterial.MAT.PRODUCTION_AVAILABLE, 40);
assert.equal(snapshot.accumulated.byMaterial.MAT.MATERIAL_CONSUMPTION, 10);
assert.equal(snapshot.events.filter(event => event.materialId === 'MAT' && event.type === 'PRODUCTION_AVAILABLE').reduce((sum, event) => sum + event.quantity, 0), 40);
assert.equal(snapshot.events.filter(event => event.materialId === 'MAT' && event.type === 'MATERIAL_CONSUMPTION').reduce((sum, event) => sum + event.quantity, 0), 10);

const candidateAllocations = baseline.draft.allocations.map(item => item.allocationId === 'future-consumption'
  ? { ...item, date: '2026-07-20', peopleCount: 4, durationMinutes: 180, endTime: '10:00' }
  : item);
const reduced = applyManualScheduleTransaction({
  currentDraft: baseline.draft,
  intent: {
    type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-17', overrides: { day: 4 },
    cutoffDate: '2026-07-17', candidateAllocations
  },
  draftContext: { validatedAt: '2026-07-16T13:00:00Z' },
  validationContext: context
});
assert.equal(reduced.accepted, true, JSON.stringify(reduced.blockingIssues));
assert.deepEqual(
  reduced.draft.allocations.filter(item => item.date < '2026-07-17'),
  baseline.draft.allocations.filter(item => item.date < '2026-07-17'),
  'passado e pin anterior devem permanecer byte a byte'
);
assert.equal(reduced.cutoffSnapshot.balances.MAT.__default__.physicalBalance, 40);
assert.equal(reduced.validation.stockProjection.byMaterial.MAT.locations.__default__.finalPhysicalBalance, 20, 'passado e futuro devem ser aplicados uma vez');
assert.equal(reduced.draft.allocations.reduce((sum, item) => sum + item.quantity, 0), baseline.draft.allocations.reduce((sum, item) => sum + item.quantity, 0));

const changedPast = candidateAllocations.map(item => item.allocationId === 'past-production' ? { ...item, startTime: '08:00' } : item);
const rejected = applyManualScheduleTransaction({
  currentDraft: baseline.draft,
  intent: {
    type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-17', overrides: { day: 4 },
    cutoffDate: '2026-07-17', candidateAllocations: changedPast
  },
  draftContext: { validatedAt: '2026-07-16T13:00:00Z' },
  validationContext: context
});
assert.equal(rejected.accepted, false);
assert.deepEqual(rejected.draft, baseline.draft, 'violação do corte deve fazer rollback integral');
assert.equal(rejected.blockingIssues[0].code, 'CUTOFF_PAST_ALLOCATION_CHANGED');

console.log('planningCutoffSnapshot.integration.test.js: ok');
