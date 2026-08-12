import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createAutomaticSimulationBaseline,
  hasManualChangesAgainstAutomaticBaseline,
  LEGACY_AUTOMATIC_BASELINE_MESSAGE,
  normalizeAutomaticSimulationBaseline,
  persistAutomaticBaselineDiscard,
  restoreAutomaticSimulationBaseline
} from '../services/automaticSimulationBaseline.service.js';
import { buildStoredAutomaticPlanningSnapshot } from '../services/planning.service.js';
import { projectPlanningStockByDay } from '../services/planningStockProjection.service.js';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';

const simulation = {
  code: 'SIM-7',
  operations: [{ operationId: 'op-1', machineName: 'M1', segments: [{ date: '2026-07-21', startTime: '07:00', endTime: '08:00', minutes: 60 }] }],
  tree: { materialId: 'FINAL', children: [{ materialId: 'MP' }] },
  days: [{ planned_date: '2026-07-21' }],
  summary: { dailyTeamOverrides: {}, manualWorkDates: [] }
};
const allocations = [{
  allocationId: 'a-1', parentOperationId: 'op-1', machineId: 'M1', date: '2026-07-21',
  materialId: 'MP', materialName: 'MP', unit: 'kg',
  startTime: '07:00', endTime: '08:00', quantity: 10, durationMinutes: 60, peopleCount: 2,
  pinned: false, components: [{ parentOperationId: 'op-1', materialId: 'MP', quantity: 10 }]
}];

const baseline = createAutomaticSimulationBaseline({ simulation, allocations });
const originalHash = baseline.hash;
assert.ok(Object.isFrozen(baseline));
assert.ok(Object.isFrozen(baseline.simulation.operations));
simulation.operations[0].machineName = 'MUTATED';
allocations[0].date = '2026-07-30';
assert.equal(baseline.simulation.operations[0].machineName, 'M1', 'captura não pode compartilhar referências');
assert.equal(baseline.allocations[0].date, '2026-07-21');

const manualProjection = projectPlanningStockByDay({
  calendarDays: ['2026-07-21', '2026-07-22'],
  stockContext: { stock: [{ materialId: 'MP', materialName: 'MP', unit: 'kg', quantity: 0 }] },
  allocations: baseline.allocations.map(item => ({ ...item, date: '2026-07-22', materialId: 'MP', materialName: 'MP', unit: 'kg' }))
});
const restoredProjection = projectPlanningStockByDay({
  calendarDays: ['2026-07-21', '2026-07-22'],
  stockContext: { stock: [{ materialId: 'MP', materialName: 'MP', unit: 'kg', quantity: 0 }] },
  allocations: restoreAutomaticSimulationBaseline(baseline).allocations.map(item => ({ ...item, materialId: 'MP', materialName: 'MP', unit: 'kg' }))
});
assert.equal(manualProjection.days[0].materials[0].productionIn, 0);
assert.equal(restoredProjection.days[0].materials[0].productionIn, 10, 'estoque restaurado deve voltar à data automática');

const restored = restoreAutomaticSimulationBaseline(baseline);
restored.simulation.operations[0].machineName = 'RESTORED-MUTATION';
restored.allocations[0].date = '2026-08-01';
assert.equal(baseline.hash, originalHash);
assert.equal(baseline.simulation.operations[0].machineName, 'M1', 'restauração também deve devolver clones');
assert.equal(baseline.allocations[0].date, '2026-07-21');
assert.equal(normalizeAutomaticSimulationBaseline(JSON.parse(JSON.stringify(baseline))).hash, originalHash, 'reload local preserva baseline válida');

const cleanDraft = { allocations: baseline.allocations, dirty: false, constraints: [], manualWorkDates: [], dailyTeamOverrides: {} };
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: cleanDraft, planningDraft: {} }), false);
const normalizedCleanDraft = createManualScheduleDraft({ allocations: baseline.allocations, machines: [{ machineId: 'M1', machineName: 'M1' }] });
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: normalizedCleanDraft, planningDraft: {} }), false, 'normalização do draft inicial não pode produzir falso positivo');
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: { ...cleanDraft, allocations: cleanDraft.allocations.map(item => ({ ...item, date: '2026-07-22' })) } }), true, 'arrasto deve ser detectado');
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: { ...cleanDraft, dailyTeamOverrides: { '2026-07-21': { T1: 4 } } } }), true, 'equipe deve ser detectada');
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: { ...cleanDraft, manualWorkDates: ['2026-07-25'] } }), true, 'sábado manual deve ser detectado');
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: cleanDraft, planningDraft: { operationSplits: [{ operationId: 'op-1' }] } }), true, 'divisão deve ser detectada');
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft: cleanDraft, planningDraft: { visibleEndDate: '2026-09-01' } }), false, 'horizonte vazio isolado não habilita descarte');

const storageValues = new Map([['draft', 'manual-state']]);
const storage = {
  getItem: key => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, String(value)),
  removeItem: key => storageValues.delete(key)
};
await assert.rejects(
  persistAutomaticBaselineDiscard({
    storage,
    storageKey: 'draft',
    nextDraft: { clean: true },
    persistRemote: async () => { throw new Error('database failure'); }
  }),
  /database failure/
);
assert.equal(storage.getItem('draft'), 'manual-state', 'falha remota deve restaurar integralmente o draft local anterior');
await persistAutomaticBaselineDiscard({ storage, storageKey: 'draft', nextDraft: { clean: true } });
assert.deepEqual(JSON.parse(storage.getItem('draft')), { clean: true }, 'descarte não salvo deve persistir localmente');

assert.equal(normalizeAutomaticSimulationBaseline(null), null);
assert.throws(() => restoreAutomaticSimulationBaseline(null), error => error.message === LEGACY_AUTOMATIC_BASELINE_MESSAGE);
assert.equal(hasManualChangesAgainstAutomaticBaseline({ baseline: null, manualScheduleDraft: cleanDraft }), true, 'draft legado deve manter ação disponível para exibir bloqueio claro');

const storedOperations = [{
  operationId: 'stored-op', materialId: 'M', materialName: 'Material M', materialCode: 'M',
  machineName: 'M1', peopleCount: 2, produceQty: 10, unit: 'kg', outputQty: 10, timeSeconds: 3600,
  startDate: '2026-07-21', endDate: '2026-07-21', startTime: '07:00', endTime: '08:00', totalMinutes: 60,
  segments: [{ date: '2026-07-21', startTime: '07:00', endTime: '08:00', minutes: 60 }],
  _planningMeta: { shifts: [{ label: 'Turno 1', shiftStartTime: '07:00', shiftEndTime: '17:00', hoursPerDay: 8, teamAvailable: 6 }] }
}];
const storedSnapshot = buildStoredAutomaticPlanningSnapshot({ id: 'plan-1', code: 'PLAN-1', planned_unit: 'kg', hours_per_day: 8 }, storedOperations);
assert.equal(storedSnapshot.operations[0].operationId, 'stored-op');
assert.equal(storedSnapshot.days[0].planned_date, '2026-07-21');
assert.ok(storedSnapshot.calendarOperations.length, 'plano salvo deve derivar cards da operation automática sem scheduler');

const planningSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const persistenceControllerSource = readFileSync(new URL('../shared/planning-controller/planningPersistenceController.js', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../server/routes/planning.routes.js', import.meta.url), 'utf8');
const discardStart = planningSource.indexOf('async function discardAllProductionCalendarChanges');
const discardEnd = planningSource.indexOf('function findProductionCalendarMachine', discardStart);
const discardSource = planningSource.slice(discardStart, discardEnd);
const routeStart = routeSource.indexOf("router.delete('/plans/:id/manual-schedule'");
const routeEnd = routeSource.indexOf("router.put('/plans/:id/manual-schedule'", routeStart);
const discardRoute = routeSource.slice(routeStart, routeEnd);

assert.match(planningSource, /onRequestDiscardAllChanges:\s*\(\)\s*=>\s*discardAllProductionCalendarChanges\(\)/);
assert.match(discardSource, /const\s+confirmed\s*=\s*confirm\(/);
assert.match(discardSource, /if\s*\(!confirmed\)\s*return;/);
assert.ok(
  discardSource.indexOf('if (!confirmed) return;') < discardSource.indexOf('persistAutomaticBaselineDiscard'),
  'cancelar confirmacao deve sair antes de persistir o descarte'
);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarToolbar.js', import.meta.url)), false);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url)), false);
assert.doesNotMatch(planningSource, /Descartar todas as alterações do calendário\?/);
assert.match(discardSource, /persistAutomaticBaselineDiscard/);
assert.match(discardSource, /productionCalendarVisualState = \{\}/);
assert.doesNotMatch(discardSource, /simulatePlanningRequest|reoptimizePlanningFuture|scheduleOperations|scheduler/i);
const reoptimizationApplySource = planningSource.slice(
  planningSource.indexOf('export function applyAcceptedPlanningReoptimization'),
  planningSource.indexOf('export function createProductionCalendarExclusivePage')
);
assert.doesNotMatch(reoptimizationApplySource, /currentAutomaticBaseline|automaticBaseline/, 'reotimização não pode tocar na baseline');
assert.match(routeSource, /automaticCalendarOperations: automaticSnapshot\.calendarOperations/);
assert.match(discardRoute, /db\.begin\(async tx/);
assert.match(discardRoute, /FOR UPDATE/);
assert.match(discardRoute, /manual_schedule_draft = NULL/);
assert.match(discardRoute, /schedule_tree: normalizeJsonObject\(result\.updated\.schedule_tree\)/);
assert.doesNotMatch(discardRoute, /scheduleOperations|rescheduleSavedPlan|buildPlan\(/);
assert.match(planningSource, /createAutomaticSimulationBaseline\([\s\S]*simulation: result/);
assert.ok(
  planningSource.indexOf('if (captureAutomaticBaseline)') < planningSource.indexOf('const candidateDraft = restoredDraft || createManualScheduleDraft'),
  'baseline deve ser capturada antes do primeiro draft manual'
);
assert.match(persistenceControllerSource, /calendarOperations: detail\.automaticCalendarOperations/);

console.log('automaticSimulationBaseline.service.test.js ok');
