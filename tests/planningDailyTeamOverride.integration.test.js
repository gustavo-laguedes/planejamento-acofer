import assert from 'node:assert/strict';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import { applyManualScheduleTransaction } from '../services/manualScheduleTransaction.service.js';
import { reoptimizePlanningFuture } from '../services/planningReoptimization.service.js';
import { buildProductionCalendarDayPresentation } from '../shared/production-calendar/productionCalendar.utils.js';

const machines = [{ machineId: 'M1', machineName: 'M1' }];
const materials = [{ id: 'MAT', name: 'MAT' }];
const productivityMatrix = [{
  material_id: 'MAT', material_code: 'MAT', machine_id: 'M1', machine_name: 'M1',
  people_count: 4, output_qty: 10, output_unit: 'kg', time_seconds: 32400
}];
const shifts = [{ shiftId: 'day', label: 'Turno 1', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }];
const allocation = {
  allocationId: 'team-allocation', parentOperationId: 'team-operation', productionId: 'production-1',
  materialId: 'MAT', materialCode: 'MAT', materialName: 'MAT', machineId: 'M1', machineName: 'M1',
  date: '2026-07-13', startTime: '08:00', endTime: '10:00', quantity: 5, unit: 'kg',
  durationMinutes: 120, capacityPercent: 50, maxDailyCapacity: 10, peopleCount: 4,
  source: 'automatic', pinned: false
};

function makeDraft() {
  return createManualScheduleDraft({ allocations: [allocation], machines, now: new Date('2026-07-13T10:00:00Z') });
}

function context(stock) {
  return {
    operations: [], materials, machines, productivityMatrix,
    stock, stockMinimums: [], stockLocations: [{ locationId: '__default__' }],
    dependencies: [], transports: [], shifts, dailyTeamOverrides: {}, manualWorkDates: [],
    setupMinutes: 0, minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60,
    holidays: [], timezone: 'America/Sao_Paulo'
  };
}

function transact(currentDraft, intent, validationContext) {
  return applyManualScheduleTransaction({
    currentDraft,
    intent,
    draftContext: { validatedAt: '2026-07-13T11:00:00Z' },
    validationContext
  });
}

const validStock = [
  { materialId: 'MAT', quantity: 10, unit: 'kg' },
  { materialId: '12', quantity: 7, unit: 'kg' }
];
const stockBefore = structuredClone(validStock);
const baseline = transact(makeDraft(), { type: 'VALIDATE_DRAFT' }, context(validStock));
assert.equal(baseline.accepted, true, JSON.stringify(baseline.blockingIssues));

const reduced = transact(baseline.draft, {
  type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-13', overrides: { day: 5 }
}, context(validStock));
assert.equal(reduced.accepted, true, JSON.stringify(reduced.blockingIssues));
assert.equal(reduced.draft.dailyTeamOverrides['2026-07-13'].day, 5);
assert.ok(!reduced.validation.errors.some(issue => String(issue.code).includes('STOCK')));
assert.deepEqual(validStock, stockBefore, 'edição de equipe não pode mutar nem inverter o estoque');
const pill = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-13' },
  resource: reduced.validation.resourceProjection.byDate['2026-07-13'],
  shifts,
  dailyTeamOverrides: reduced.draft.dailyTeamOverrides
});
assert.equal(`${pill.team.peakPeople} / ${pill.team.availablePeople}`, '4 / 5');

const restored = transact(reduced.draft, {
  type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-13', overrides: { day: null }
}, context(validStock));
assert.equal(restored.accepted, true, JSON.stringify(restored.blockingIssues));
assert.equal(restored.draft.dailyTeamOverrides['2026-07-13'], undefined);
assert.equal(restored.validation.resourceProjection.byDate['2026-07-13'].shifts.day.availablePeople, 6);

const conflict = transact(reduced.draft, {
  type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-13', overrides: { day: 3 }
}, context(validStock));
assert.equal(conflict.accepted, false);
assert.equal(conflict.draft.dailyTeamOverrides['2026-07-13'].day, 5);
assert.ok(conflict.blockingIssues.some(issue => issue.code === 'TEAM_CAPACITY_EXCEEDED'));

const negativeStock = [{ materialId: '12', quantity: -2, unit: 'kg' }];
const invalidBaseline = transact(makeDraft(), { type: 'VALIDATE_DRAFT' }, context(negativeStock));
assert.equal(invalidBaseline.accepted, false);
const draftWithExistingDiagnostic = { ...invalidBaseline.draft, validation: invalidBaseline.validation };
const teamWithExistingStockIssue = transact(draftWithExistingDiagnostic, {
  type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-13', overrides: { day: 5 }
}, context(negativeStock));
assert.equal(teamWithExistingStockIssue.accepted, false, 'intent comum sem candidato reotimizado deve manter validação absoluta');
assert.ok(teamWithExistingStockIssue.validation.errors.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK'));
assert.ok(!teamWithExistingStockIssue.validation.errors.some(issue => issue.code === 'TEAM_CAPACITY_EXCEEDED'));
assert.deepEqual(teamWithExistingStockIssue.draft, draftWithExistingDiagnostic, 'candidato inválido deve preservar o draft anterior');

const releasedDayWithExistingStockIssue = transact(draftWithExistingDiagnostic, {
  type: 'SET_MANUAL_WORK_DATE', date: '2026-07-18', enabled: true
}, context(negativeStock));
assert.equal(releasedDayWithExistingStockIssue.accepted, false);
assert.deepEqual(releasedDayWithExistingStockIssue.draft.manualWorkDates, []);
assert.deepEqual(releasedDayWithExistingStockIssue.draft.allocations, draftWithExistingDiagnostic.allocations, 'liberar sábado vazio não pode redistribuir allocations');
assert.ok(releasedDayWithExistingStockIssue.validation.errors.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK'));

function reoptimize(draft, changes, cutoffDate) {
  const validationContext = context(negativeStock);
  return reoptimizePlanningFuture({
    baseline: validationContext,
    acceptedDraft: draft,
    cutoff: { date: cutoffDate, time: '00:00' },
    constraintChanges: changes,
    productivityMatrix,
    calendar: {
      shifts,
      dailyTeamOverrides: changes.dailyTeamOverrides ?? draft.dailyTeamOverrides ?? {},
      manualWorkDates: changes.manualWorkDates ?? draft.manualWorkDates ?? [],
      holidays: []
    },
    stockContext: { stock: negativeStock, stockMinimums: [], stockLocations: [{ locationId: '__default__' }] }
  });
}

// Fluxo real da Missão 5: material 12 já negativo não foi criado nem agravado pela redução 6 → 4.
const reducedWithNegativeStock = reoptimize(makeDraft(), {
  dailyTeamOverrides: { '2026-07-13': { day: 4 } }, manualWorkDates: []
}, '2026-07-13');
assert.equal(reducedWithNegativeStock.accepted, true, JSON.stringify(reducedWithNegativeStock.blockingRegressions));
assert.ok(reducedWithNegativeStock.previousDiagnostics.errors.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK' && issue.materialIds.includes('12')));
assert.ok(reducedWithNegativeStock.diagnostics.errors.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK' && issue.materialIds.includes('12')));
assert.equal(reducedWithNegativeStock.diagnosticDelta.unchanged.some(item => item.diagnostic.code === 'NEGATIVE_INITIAL_STOCK'), true);
assert.equal(reducedWithNegativeStock.blockingRegressions.length, 0);

const acceptedReduction = transact(makeDraft(), {
  type: 'SET_DAILY_TEAM_OVERRIDES', date: '2026-07-13', overrides: { day: 4 }, cutoffDate: '2026-07-13',
  cutoffSnapshot: reducedWithNegativeStock.cutoffSnapshot,
  candidateAllocations: reducedWithNegativeStock.allocations,
  candidateDraft: reducedWithNegativeStock.manualScheduleDraft,
  previousDiagnostics: reducedWithNegativeStock.previousDiagnostics
}, context(negativeStock));
assert.equal(acceptedReduction.accepted, true, JSON.stringify(acceptedReduction.blockingRegressions));
assert.ok(acceptedReduction.validation.errors.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK'));
assert.equal(acceptedReduction.validation.incrementallyAccepted, true);

// Sábado e uma segunda reotimização continuam aceitos com o mesmo erro inicial unchanged.
const saturdayReoptimization = reoptimize(acceptedReduction.draft, {
  dailyTeamOverrides: acceptedReduction.draft.dailyTeamOverrides,
  manualWorkDates: ['2026-07-18']
}, '2026-07-18');
assert.equal(saturdayReoptimization.accepted, true, JSON.stringify(saturdayReoptimization.blockingRegressions));
assert.equal(saturdayReoptimization.diagnosticDelta.unchanged.some(item => item.diagnostic.code === 'NEGATIVE_INITIAL_STOCK'), true);
const secondReoptimization = reoptimize(saturdayReoptimization.manualScheduleDraft, {
  dailyTeamOverrides: { '2026-07-13': { day: 5 } },
  manualWorkDates: ['2026-07-18']
}, '2026-07-18');
assert.equal(secondReoptimization.accepted, true, JSON.stringify(secondReoptimization.blockingRegressions));

const movedWithNegativeStock = transact(makeDraft(), {
  type: 'MOVE_ALLOCATION', allocationId: 'team-allocation', targetDate: '2026-07-14', targetMachineId: 'M1'
}, context(negativeStock));
assert.equal(movedWithNegativeStock.accepted, false, 'movimento manual deve continuar validando estoque');
assert.ok(movedWithNegativeStock.blockingIssues.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK'));

const movedWithExistingNegativeStock = transact(draftWithExistingDiagnostic, {
  type: 'MOVE_ALLOCATION', allocationId: 'team-allocation', targetDate: '2026-07-14', targetMachineId: 'M1'
}, context(negativeStock));
assert.equal(movedWithExistingNegativeStock.accepted, true, JSON.stringify(movedWithExistingNegativeStock.blockingRegressions));
assert.ok(movedWithExistingNegativeStock.validation.errors.some(issue => issue.code === 'NEGATIVE_INITIAL_STOCK'));
assert.equal(movedWithExistingNegativeStock.validation.diagnosticDelta.unchanged.some(item => item.diagnostic.code === 'NEGATIVE_INITIAL_STOCK'), true);

console.log('planningDailyTeamOverride.integration.test.js: ok');
