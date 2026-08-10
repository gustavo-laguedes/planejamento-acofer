import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildLoadedPlanningManualScheduleState,
  buildManualScheduleCreatePayload,
  buildManualScheduleUpdatePayload,
  savePlanningManualSchedule
} from '../shared/planning-controller/planningPersistenceController.js';
import {
  MANUAL_SCHEDULE_CONTRACT_VERSION
} from '../services/manualSchedulePersistence.service.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const allocation = {
  allocationId: 'allocation-1',
  parentOperationId: 'operation-1',
  calendarParentOperationId: 'operation-1:day-1',
  splitParentOperationId: 'operation-1',
  productionId: 'production-1',
  productionIndex: 0,
  materialId: 'MAT',
  materialName: 'Material',
  materialCode: 'MAT',
  machineId: 'M1',
  machineName: 'Maquina 1',
  date: '2026-08-10',
  startTime: '08:00',
  endTime: '10:00',
  quantity: 10,
  unit: 'kg',
  durationMinutes: 120,
  peopleCount: 2,
  sourceAllocationIds: ['legacy-1'],
  components: [{ allocationId: 'allocation-1', parentOperationId: 'operation-1', productionId: 'production-1', quantity: 10 }]
};

const manualScheduleDraft = {
  version: MANUAL_SCHEDULE_CONTRACT_VERSION,
  draftId: 'draft-1',
  allocations: [allocation],
  constraints: [{ type: 'PIN_START', parentOperationId: 'operation-1', date: '2026-08-10' }],
  manualWorkDates: ['2026-08-15'],
  dailyTeamOverrides: { '2026-08-10': { teamAvailable: 4 } },
  validation: { errors: [], warnings: [{ message: 'warning' }] }
};

const draft = {
  savedPlanningId: '42',
  savedPlanningRevision: 7,
  shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00' }],
  setupHours: 1.5,
  dailyTeamOverrides: { fallback: true }
};

{
  const sourceDraft = deepFreeze(clone(draft));
  const sourceManualDraft = deepFreeze(clone(manualScheduleDraft));
  const currentSimulation = deepFreeze({ dependencyCompletionBufferMinutes: 90, manualWorkDates: ['2026-08-20'] });
  const payload = buildManualScheduleUpdatePayload({
    draft: sourceDraft,
    manualScheduleDraft: sourceManualDraft,
    currentSimulation
  });
  assert.equal(payload.expectedRevision, 7);
  assert.equal(payload.manualScheduleDraft, sourceManualDraft);
  assert.equal(payload.manualScheduleValidation, sourceManualDraft.validation);
  assert.deepEqual(payload.shifts, draft.shifts);
  assert.deepEqual(payload.settings, {
    manualWorkDates: ['2026-08-15'],
    dailyTeamOverrides: { '2026-08-10': { teamAvailable: 4 } },
    setupMinutes: 90,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 90
  });
  assert.equal(payload.manualScheduleDraft.allocations[0].allocationId, 'allocation-1');
  assert.equal(payload.manualScheduleDraft.allocations[0].splitParentOperationId, 'operation-1');
}

{
  const lastPayload = deepFreeze({
    planningCode: 'PLANO-1',
    planningStartDate: '2026-08-10',
    operationOverrides: { keep: true }
  });
  const stockAuthorization = deepFreeze({ confirmed: true, method: 'clerk_authenticated_confirmation' });
  const payload = buildManualScheduleCreatePayload({
    draft,
    lastPayload,
    manualScheduleDraft,
    currentSimulation: { dependencyCompletionBufferMinutes: 60 },
    stockAuthorization
  });
  assert.equal(payload.planningCode, 'PLANO-1');
  assert.equal(payload.manualScheduleDraft, manualScheduleDraft);
  assert.equal(payload.manualScheduleValidation, manualScheduleDraft.validation);
  assert.equal(payload.stockAuthorization, stockAuthorization);
  assert.deepEqual(payload.settings.manualWorkDates, ['2026-08-15']);
  assert.equal(payload.settings.setupMinutes, 90);
  assert.equal(payload.dependencyCompletionBufferMinutes, 60);
}

{
  const calls = [];
  const saved = await savePlanningManualSchedule({
    draft,
    manualScheduleDraft,
    currentSimulation: { dependencyCompletionBufferMinutes: 45 },
    persistUpdate: async ({ planningId, body }) => {
      calls.push(['put', planningId, body.expectedRevision, body.manualScheduleDraft.allocations[0].allocationId]);
      return { plan: { id: planningId, code: 'PLANO-42' } };
    }
  });
  assert.equal(saved.accepted, true);
  assert.equal(saved.mode, 'update');
  assert.deepEqual(calls, [['put', '42', 7, 'allocation-1']]);
  assert.equal(saved.body.expectedRevision, 7);
}

{
  const calls = [];
  const saved = await savePlanningManualSchedule({
    draft: { ...draft, savedPlanningId: null },
    lastPayload: { planningCode: 'NOVO' },
    manualScheduleDraft,
    currentSimulation: {},
    stockShortages: [{ materialId: 'MAT' }],
    requestStockAuthorization: async shortages => {
      calls.push(['authorization', shortages[0].materialId]);
      return { confirmed: true };
    },
    persistCreate: async ({ body }) => {
      calls.push(['post', body.planningCode, body.stockAuthorization.confirmed]);
      return { plan: { id: 99, code: 'NOVO' } };
    }
  });
  assert.equal(saved.accepted, true);
  assert.equal(saved.mode, 'create');
  assert.deepEqual(calls, [['authorization', 'MAT'], ['post', 'NOVO', true]]);
}

{
  const calls = [];
  const cancelled = await savePlanningManualSchedule({
    draft: { ...draft, savedPlanningId: null },
    manualScheduleDraft,
    stockShortages: [{ materialId: 'MAT' }],
    requestStockAuthorization: async () => null,
    persistCreate: async () => calls.push('post')
  });
  assert.deepEqual(cancelled, { accepted: false, cancelled: true });
  assert.deepEqual(calls, []);
}

{
  const conflict = new Error('Este planejamento foi alterado por outro usuario. Recarregue antes de salvar.');
  conflict.status = 409;
  await assert.rejects(
    savePlanningManualSchedule({
      draft,
      manualScheduleDraft,
      persistUpdate: async () => {
        throw conflict;
      }
    }),
    error => error === conflict && error.status === 409
  );
}

{
  const detail = deepFreeze({
    plan: {
      id: 42,
      code: 'PLANO-42',
      start_date: '2026-08-10',
      end_date: '2026-08-12',
      status: 'planned',
      manual_schedule_revision: 8
    },
    summary: {
      planningStartDate: '2026-08-10',
      planningEndDate: '2026-08-12',
      shifts: [{ shiftId: 'day' }],
      setupHours: 2
    },
    tree: { materialId: 'MAT' },
    operations: [{ operationId: 'operation-1' }],
    automaticCalendarOperations: [{ operationId: 'auto-1' }],
    automaticDays: [{ planned_date: '2026-08-10' }],
    manualScheduleDraft
  });
  const state = buildLoadedPlanningManualScheduleState(detail, {
    normalizeDraft: value => ({ ...value, normalized: true }),
    defaultShift: index => ({ shiftId: `default-${index}` })
  });
  assert.equal(state.draft.savedPlanningId, '42');
  assert.equal(state.draft.savedPlanningRevision, 8);
  assert.equal(state.lastPayload.planningCode, 'PLANO-42');
  assert.equal(state.currentSimulation.code, 'PLANO-42');
  assert.deepEqual(state.currentSimulation.operations, [{ operationId: 'operation-1' }]);
  assert.deepEqual(state.currentSimulation.calendarOperations, [{ operationId: 'auto-1' }]);
  assert.equal(state.manualScheduleDraft.allocations[0].allocationId, 'allocation-1');
  assert.equal(state.manualScheduleDraft.dirty, false);
}

{
  assert.throws(
    () => buildLoadedPlanningManualScheduleState({
      plan: { id: 1, manual_schedule_revision: 0 },
      manualScheduleDraft: { version: 99, allocations: [] }
    }, {
      normalizeDraft: value => value,
      defaultShift: () => ({})
    }),
    /versão incompatível|versÃ£o incompat/i
  );
}

{
  const source = readFileSync(new URL('../shared/planning-controller/planningPersistenceController.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bdocument\b/);
  assert.doesNotMatch(source, /\bwindow\b/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /querySelector|innerHTML|ProductionCalendar/);
  assert.doesNotMatch(source, /from ['"].*\bapi\.js['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
}

console.log('planningPersistenceController.test.js ok');
