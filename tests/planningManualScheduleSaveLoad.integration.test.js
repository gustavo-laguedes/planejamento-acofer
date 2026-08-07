import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import { applyManualScheduleTransaction } from '../services/manualScheduleTransaction.service.js';
import { normalizePersistedManualScheduleDraft, serializeManualScheduleDraft } from '../services/manualSchedulePersistence.service.js';

const machines = [{ machineId: 'M1', machineName: 'M1' }, { machineId: 'M2', machineName: 'M2' }];
const materials = [{ id: 'MAT', name: 'MAT' }];
const productivityMatrix = machines.map(machine => ({
  material_id: 'MAT', material_code: 'MAT', machine_id: machine.machineId,
  machine_name: machine.machineName, people_count: 2, output_qty: 10,
  output_unit: 'kg', time_seconds: 32400
}));
const allocations = [0, 1, 2, 3].map(index => ({
  allocationId: `allocation-${index + 1}`,
  parentOperationId: `operation-${index + 1}`,
  productionId: 'production-1', materialId: 'MAT', materialCode: 'MAT', materialName: 'MAT',
  machineId: 'M1', machineName: 'M1', date: `2026-07-${String(13 + index).padStart(2, '0')}`,
  startTime: '08:00', endTime: '10:00', quantity: 5, unit: 'kg', durationMinutes: 120,
  capacityPercent: 50, maxDailyCapacity: 10, peopleCount: 2, source: 'automatic', pinned: false
}));
let active = createManualScheduleDraft({
  planningId: 'plan-16', baseSimulationId: 'simulation-16', allocations, machines,
  now: new Date('2026-07-13T10:00:00.000Z')
});
const validationContext = {
  operations: [], materials, machines, productivityMatrix, stock: [], stockMinimums: [], stockLocations: [],
  dependencies: [], transports: [], shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }],
  dailyTeamOverrides: {}, manualWorkDates: [], setupMinutes: 0, minimumStartRatio: 1,
  dependencyCompletionBufferMinutes: 60, holidays: [], timezone: 'America/Sao_Paulo'
};
const draftContext = {
  machines, productivityMatrix,
  days: allocations.map(item => ({ date: item.date })).concat([{ date: '2026-07-17' }]),
  dailyMinutes: 540, now: '2026-07-13T11:00:00.000Z', validatedAt: '2026-07-13T11:00:00.000Z'
};

for (let index = 0; index < 4; index += 1) {
  const transaction = applyManualScheduleTransaction({
    currentDraft: active,
    intent: {
      type: 'MOVE_ALLOCATION', allocationId: `allocation-${index + 1}`,
      targetDate: `2026-07-${String(14 + index).padStart(2, '0')}`, targetMachineId: 'M2'
    },
    draftContext: { ...draftContext, now: `2026-07-13T1${index + 1}:00:00.000Z` },
    validationContext
  });
  assert.equal(transaction.accepted, true, JSON.stringify(transaction.blockingIssues));
  active = transaction.draft;
}
const allocationsBeforeSaturdayRelease = structuredClone(active.allocations);
const saturdayRelease = applyManualScheduleTransaction({
  currentDraft: active,
  intent: { type: 'SET_MANUAL_WORK_DATE', date: '2026-07-18', enabled: true },
  draftContext: { ...draftContext, now: '2026-07-13T15:30:00.000Z' },
  validationContext
});
assert.equal(saturdayRelease.accepted, true, JSON.stringify(saturdayRelease.blockingIssues));
assert.deepEqual(saturdayRelease.draft.allocations, allocationsBeforeSaturdayRelease);
active = saturdayRelease.draft;
const expectedPositions = active.allocations.map(item => [item.allocationId, item.date, item.machineId]);
const stored = serializeManualScheduleDraft({
  draft: active, planningId: 'plan-16',
  baseSimulation: { operations: [], scheduleTree: {}, productivityMatrix, shifts: validationContext.shifts },
  now: '2026-07-13T16:00:00.000Z'
});

active = null;
const loaded = normalizePersistedManualScheduleDraft(JSON.stringify(stored));
assert.equal(loaded.status, 'ok');
const revalidation = applyManualScheduleTransaction({
  currentDraft: loaded.draft, intent: { type: 'VALIDATE_DRAFT' },
  draftContext: { validatedAt: '2026-07-13T17:00:00.000Z' }, validationContext
});
assert.equal(revalidation.accepted, true, JSON.stringify(revalidation.blockingIssues));
assert.deepEqual(revalidation.draft.allocations.map(item => [item.allocationId, item.date, item.machineId]), expectedPositions);
assert.deepEqual(revalidation.draft.manualWorkDates, ['2026-07-18']);
assert.ok(revalidation.draft.validation.valid);

const route = readFileSync(new URL('../server/routes/planning.routes.js', import.meta.url), 'utf8');
const updateStart = route.indexOf("router.put('/plans/:id/manual-schedule'");
const updateEnd = route.indexOf("router.post('/plans/:id/reschedule'", updateStart);
const updateRoute = route.slice(updateStart, updateEnd);
assert.match(updateRoute, /db\.begin\(async tx/);
assert.match(updateRoute, /FOR UPDATE/);
assert.match(updateRoute, /manual_schedule_revision = \$\{expectedRevision\}/);
assert.match(updateRoute, /DELETE FROM production_plan_days/);
assert.match(updateRoute, /insertPlanningAudit\(tx/);
assert.match(route, /stockLocations: \[\s*\{ locationId: '__default__' \}/);
assert.match(route, /validation\.incrementallyAccepted === true/);
assert.match(route, /previousDiagnostics:\s*previousValidation/);
assert.match(route, /draft\?\.frozenThrough\?\.date/);
assert.ok(updateRoute.indexOf('DELETE FROM production_plan_days') < updateRoute.indexOf('UPDATE production_plans'));

const createStart = route.indexOf("router.post('/plans'");
const createEnd = route.indexOf("router.get('/plans'", createStart);
const createRoute = route.slice(createStart, createEnd);
assert.match(createRoute, /manualScheduleDays\(persistedManualDraft\)/);
assert.match(createRoute, /insertPlanningAudit\(tx/);
assert.doesNotMatch(createRoute, /await recordAuditLog\(db/);

console.log('planningManualScheduleSaveLoad.integration.test.js ok');
