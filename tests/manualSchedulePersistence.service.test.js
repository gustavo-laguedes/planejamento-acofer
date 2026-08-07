import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MANUAL_SCHEDULE_CONTRACT_VERSION,
  MANUAL_SCHEDULE_INCOMPATIBLE_MESSAGE,
  manualScheduleBaseHash,
  manualScheduleDays,
  normalizePersistedManualScheduleDraft,
  resolveManualScheduleRecovery,
  serializeManualScheduleDraft
} from '../services/manualSchedulePersistence.service.js';

function allocation(id, overrides = {}) {
  return {
    allocationId: id,
    parentOperationId: `op:${id}`,
    productionId: 'production:1',
    productionIndex: 0,
    materialId: 'MAT',
    materialName: 'Material',
    materialCode: 'MAT',
    machineId: 'M1',
    machineName: 'Máquina 1',
    date: '2026-07-13',
    startTime: '08:00',
    endTime: '10:00',
    quantity: 5,
    unit: 'kg',
    durationMinutes: 120,
    capacityPercent: 50,
    maximumDailyQuantity: 10,
    peopleCount: 2,
    sequence: 1,
    source: 'manual',
    pinned: true,
    components: [{ allocationId: id, parentOperationId: `op:${id}`, productionId: 'production:1', quantity: 5 }],
    sourceAllocationIds: [id],
    sourceParentOperationIds: [`op:${id}`],
    ...overrides
  };
}

const baseSimulation = {
  operations: [{ operationId: 'op:1', quantity: 10 }],
  scheduleTree: { materialId: 'MAT', children: [] },
  productivityMatrix: [{ material_id: 'MAT', machine_id: 'M1', output_qty: 10 }],
  shifts: [{ startTime: '07:00', endTime: '16:00' }],
  parameters: { setupMinutes: 30 }
};

const source = {
  draftId: 'draft:16',
  baseSimulationId: 'simulation:16',
  createdAt: '2026-07-13T10:00:00.000Z',
  allocations: [
    allocation('a1'),
    allocation('a2', { date: '2026-07-14', machineId: 'M2', machineName: 'Máquina 2', pinned: false }),
    allocation('merged', {
      date: '2026-07-15', quantity: 8,
      components: [
        { allocationId: 'c1', parentOperationId: 'op:c1', productionId: 'production:1', quantity: 3 },
        { allocationId: 'c2', parentOperationId: 'op:c2', productionId: 'production:1', quantity: 5 }
      ],
      sourceAllocationIds: ['c1', 'c2'],
      sourceParentOperationIds: ['op:c1', 'op:c2']
    }),
    allocation('override', { date: '2026-07-16', isCapacityOverride: true, capacityPercent: 140 })
  ],
  validation: { errors: [], warnings: [{ code: 'OLD' }] }
};

const persisted = serializeManualScheduleDraft({
  draft: source,
  planningId: 16,
  baseSimulation,
  settings: {
    manualWorkDates: ['2026-07-18'],
    dailyTeamOverrides: { '2026-07-15': { teamAvailable: 8 } },
    setupMinutes: 30,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60
  },
  now: '2026-07-13T12:00:00.000Z'
});

assert.equal(persisted.version, MANUAL_SCHEDULE_CONTRACT_VERSION);
assert.deepEqual(persisted.allocations.map(item => item.allocationId), ['a1', 'a2', 'merged', 'override']);
assert.equal(Object.hasOwn(persisted, 'validation'), false, 'diagnóstico derivado não deve persistir');
assert.equal(persisted.allocations.find(item => item.allocationId === 'merged').components.length, 2);
assert.equal(persisted.allocations.find(item => item.allocationId === 'override').isCapacityOverride, true);

const reopened = normalizePersistedManualScheduleDraft(JSON.stringify(persisted));
assert.equal(reopened.status, 'ok');
assert.deepEqual(reopened.draft.allocations, persisted.allocations);
assert.deepEqual(reopened.draft.allocations.map(item => [item.allocationId, item.date, item.machineId]), persisted.allocations.map(item => [item.allocationId, item.date, item.machineId]));

const days = manualScheduleDays(persisted);
assert.equal(days.length, 4);
assert.equal(new Set(days.map(day => day.allocation_id)).size, 4);
assert.equal(days.reduce((sum, day) => sum + day.planned_qty, 0), persisted.allocations.reduce((sum, item) => sum + item.quantity, 0));
assert.equal(days.find(day => day.allocation_id === 'a2').planned_date, '2026-07-14');
assert.equal(days[0].start_time, '08:00');

const incompatibleRaw = { ...persisted, version: 99 };
const incompatible = normalizePersistedManualScheduleDraft(incompatibleRaw);
assert.equal(incompatible.status, 'incompatible');
assert.equal(incompatible.diagnostics[0], MANUAL_SCHEDULE_INCOMPATIBLE_MESSAGE);
assert.deepEqual(incompatible.raw, incompatibleRaw);

const reorderedBase = {
  parameters: { setupMinutes: 30 },
  shifts: [{ endTime: '16:00', startTime: '07:00' }],
  productivityMatrix: [{ output_qty: 10, machine_id: 'M1', material_id: 'MAT' }],
  scheduleTree: { children: [], materialId: 'MAT' },
  operations: [{ quantity: 10, operationId: 'op:1' }]
};
assert.equal(manualScheduleBaseHash(baseSimulation), manualScheduleBaseHash(reorderedBase));
assert.notEqual(manualScheduleBaseHash(baseSimulation), manualScheduleBaseHash({ ...baseSimulation, operations: [{ operationId: 'op:1', quantity: 11 }] }));

const recovery = resolveManualScheduleRecovery({
  persistedDraft: persisted,
  localDraft: { ...source, planningId: '16', updatedAt: '2026-07-14T00:00:00.000Z' },
  planningId: 16,
  persistedUpdatedAt: persisted.updatedAt,
  persistedRevision: 1
});
assert.equal(recovery.source, 'database');
assert.equal(recovery.discardLocal, true);

assert.throws(() => serializeManualScheduleDraft({
  draft: { ...source, allocations: [allocation('zero', { quantity: 0 })] },
  baseSimulation
}), /Quantidade inválida/);

const migration = readFileSync(new URL('../database/020_manual_schedule_persistence.sql', import.meta.url), 'utf8');
assert.match(migration, /ADD COLUMN IF NOT EXISTS manual_schedule_draft JSONB/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS manual_schedule_revision INTEGER/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_production_plan_days_plan_allocation_unique/);

console.log('manualSchedulePersistence.service.test.js ok');
