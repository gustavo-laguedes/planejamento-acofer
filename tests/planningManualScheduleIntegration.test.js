import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageValues = new Map();
globalThis.sessionStorage = {
  getItem(key) { return storageValues.has(String(key)) ? storageValues.get(String(key)) : null; },
  setItem(key, value) { storageValues.set(String(key), String(value)); },
  removeItem(key) { storageValues.delete(String(key)); }
};
globalThis.localStorage = globalThis.sessionStorage;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const {
  buildManualScheduleValidationContext,
  buildProductionCalendarValidationSnapshot
} = await import('../pages/PlanningPage.js');
const { createManualScheduleDraft } = await import('../services/manualScheduleDraft.service.js');
const {
  applyManualScheduleTransaction,
  isManualScheduleValidationCompatible,
  MANUAL_SCHEDULE_VALIDATION_VERSION
} = await import('../services/manualScheduleTransaction.service.js');

const simulation = {
  operations: [{
    operationId: 'consumer',
    operationType: 'production',
    materialId: 'FINAL',
    dependencyRequirements: [{ operationId: 'producer', materialId: 'RAW', requiredQty: 3 }]
  }, {
    operationId: 'transport-1',
    operationType: 'transport',
    materialId: 'RAW',
    produceQty: 3,
    totalMinutes: 60,
    originLocationId: 'L1',
    destinationLocationId: 'L2'
  }],
  tree: {
    materialId: 'FINAL',
    stockQty: 0,
    unit: 'kg',
    children: [{ materialId: 'RAW', stockQty: 7, unit: 'kg', children: [] }]
  }
};
const input = {
  simulation,
  materials: [{ id: 'RAW', minimumQuantity: 2 }],
  machines: [{ machineId: 'M1' }],
  productivityMatrix: [{ material_id: 'RAW', machine_id: 'M1' }],
  stockLocations: [{ id: 'L1' }, { id: 'L2' }],
  shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00' }],
  dailyTeamOverrides: { '2026-07-13': { teamAvailable: 8 } },
  manualWorkDates: ['2026-07-18'],
  setupMinutes: 45,
  minimumStartRatio: 0.30,
  dependencyCompletionBufferMinutes: 60,
  holidays: ['2026-09-07'],
  timezone: 'America/Sao_Paulo'
};
const context = buildManualScheduleValidationContext(input);

for (const field of [
  'operations', 'materials', 'machines', 'productivityMatrix', 'stock', 'stockMinimums',
  'stockLocations', 'dependencies', 'transports', 'shifts', 'dailyTeamOverrides',
  'manualWorkDates', 'setupMinutes', 'minimumStartRatio',
  'dependencyCompletionBufferMinutes', 'holidays', 'timezone'
]) {
  assert.ok(Object.hasOwn(context, field), `PlanningPage deve montar ${field}`);
}
assert.deepEqual(context.operations, simulation.operations);
assert.deepEqual(context.stock.find(item => item.materialId === 'RAW'), { materialId: 'RAW', quantity: 7, unit: 'kg' });
assert.deepEqual(context.stockMinimums, [{ materialId: 'RAW', minimumQuantity: 2 }]);
assert.equal(context.transports[0].transportId, 'transport-1');
assert.deepEqual(context.stockLocations, input.stockLocations);

const source = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const runnerStart = source.indexOf('productionCalendarMoveRunner = async');
const runnerEnd = source.indexOf('function focusCalendarCardFromFlow', runnerStart);
assert.ok(runnerStart > 0 && runnerEnd > runnerStart, 'harness do movimento manual deve existir');
const runner = source.slice(runnerStart, runnerEnd);

assert.match(runner, /applyManualScheduleTransaction\s*\(/, 'todos os movimentos V2 devem usar o coordenador');
assert.doesNotMatch(runner, /simulateCurrent\s*\(/, 'movimento manual não pode simular novamente');
assert.doesNotMatch(runner, /scheduleOperations\s*\(/, 'movimento manual não pode chamar o scheduler');
assert.doesNotMatch(source, /applyDraftMove\s*\(/, 'PlanningPage não pode aplicar allocations diretamente');
assert.match(runner, /if \(!transaction\.accepted\)/, 'bloqueio deve impedir troca do draft ativo');
assert.ok(
  runner.indexOf('manualScheduleDraft = transaction.draft') < runner.indexOf('saveDraftNow()'),
  'localStorage só pode ser atualizado após aceitar o candidato'
);
const rejectionBranch = runner.slice(runner.indexOf('if (!transaction.accepted)'), runner.indexOf('manualScheduleDraft = transaction.draft'));
assert.doesNotMatch(rejectionBranch, /saveDraftNow\s*\(/, 'candidato recusado não pode ir ao localStorage');
assert.match(runner, /transaction\.warnings\.length/, 'warning deve confirmar movimento com alertas');
assert.match(runner, /selectedAllocationId:\s*null/, 'seleção deve limpar no sucesso');
assert.match(runner, /finally\s*\{[\s\S]*setOperationLoading\(false\)/, 'loading sempre deve encerrar');

// Harness sem DOM/localStorage real: persiste somente o último candidato aceito.
{
  const storageKey = 'planning-page-harness';
  const harnessMachines = [{ machineId: 'M1', machineName: 'M1' }, { machineId: 'M2', machineName: 'M2' }];
  const harnessMaterials = [{ id: 'CAP', name: 'CAP' }];
  const harnessMatrix = harnessMachines.map(machine => ({
    material_id: 'CAP',
    material_code: 'CAP',
    machine_id: machine.machineId,
    machine_name: machine.machineName,
    people_count: 2,
    output_qty: 5,
    output_unit: 'kg',
    time_seconds: 32400
  }));
  const baseDraft = createManualScheduleDraft({
    planningId: 'PLAN-HARNESS',
    baseSimulationId: 'SIM-HARNESS',
    machines: harnessMachines,
    now: new Date('2026-07-13T12:00:00.000Z'),
    allocations: [{
      allocationId: 'harness-allocation',
      parentOperationId: 'op:harness',
      productionId: 'production:harness',
      materialId: 'CAP',
      materialCode: 'CAP',
      materialName: 'CAP',
      machineId: 'M1',
      machineName: 'M1',
      date: '2026-07-13',
      startTime: '08:00',
      endTime: '10:00',
      quantity: 8,
      unit: 'kg',
      durationMinutes: 120,
      capacityPercent: 160,
      maxDailyCapacity: 5,
      peopleCount: 2,
      source: 'automatic',
      pinned: false
    }]
  });
  const validationContext = {
    operations: [],
    materials: harnessMaterials,
    machines: harnessMachines,
    productivityMatrix: harnessMatrix,
    stock: [],
    stockMinimums: [],
    stockLocations: [],
    dependencies: [],
    transports: [],
    shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00', teamAvailable: 4 }],
    dailyTeamOverrides: {},
    manualWorkDates: [],
    setupMinutes: 0,
    minimumStartRatio: 0.30,
    dependencyCompletionBufferMinutes: 60,
    holidays: [],
    timezone: 'America/Sao_Paulo'
  };
  const draftContext = {
    machines: harnessMachines,
    productivityMatrix: harnessMatrix,
    days: [
      { date: '2026-07-13' },
      { date: '2026-07-14' },
      { date: '2026-07-18', isWorkingDay: false }
    ],
    dailyMinutes: 540,
    now: '2026-07-13T13:00:00.000Z',
    validatedAt: '2026-07-13T13:00:00.000Z'
  };
  const runMove = (activeDraft, targetDate, decisions = {}) => {
    const transaction = applyManualScheduleTransaction({
      currentDraft: activeDraft,
      intent: {
        type: 'MOVE_ALLOCATION',
        allocationId: 'harness-allocation',
        targetDate,
        targetMachineId: 'M2',
        source: 'drag'
      },
      draftContext,
      validationContext,
      decisions
    });
    if (transaction.accepted) localStorage.setItem(storageKey, JSON.stringify(transaction.draft));
    return transaction;
  };

  const accepted = runMove(baseDraft, '2026-07-14', { capacityDecision: 'override' });
  assert.equal(accepted.accepted, true);
  assert.ok(accepted.warnings.some(item => item.code === 'EXTRAORDINARY_CAPACITY_AUTHORIZED'));
  const acceptedBytes = localStorage.getItem(storageKey);
  assert.equal(isManualScheduleValidationCompatible(accepted.draft), true);
  assert.equal(accepted.draft.validation.validationVersion, MANUAL_SCHEDULE_VALIDATION_VERSION);

  const rejected = runMove(accepted.draft, '2026-07-18', { capacityDecision: 'override' });
  assert.equal(rejected.accepted, false);
  assert.equal(localStorage.getItem(storageKey), acceptedBytes, 'recusa não substitui o draft ativo');

  const reloaded = JSON.parse(localStorage.getItem(storageKey));
  assert.deepEqual(reloaded, accepted.draft, 'reload restaura somente o último draft aceito');
  assert.equal(isManualScheduleValidationCompatible(reloaded), true);

  const incompatible = structuredClone(reloaded);
  incompatible.allocations[0].date = '2026-07-15';
  assert.equal(isManualScheduleValidationCompatible(incompatible), false);
  const recalculated = applyManualScheduleTransaction({
    currentDraft: incompatible,
    intent: { type: 'VALIDATE_DRAFT' },
    draftContext,
    validationContext
  });
  assert.equal(recalculated.accepted, true, JSON.stringify(recalculated.blockingIssues));
  assert.equal(isManualScheduleValidationCompatible(recalculated.draft), true);

  const v2Snapshot = buildProductionCalendarValidationSnapshot(
    reloaded.validation,
    reloaded.allocations,
    [{ date: '2026-07-14' }]
  );
  assert.deepEqual(v2Snapshot.allocations.map(item => item.allocationId), ['harness-allocation']);
  for (const field of ['issuesByAllocationId', 'issuesByDate', 'stockProjection', 'dependencyStatus', 'summary']) {
    assert.ok(Object.hasOwn(v2Snapshot.validation, field), `snapshot V2 deve conter ${field}`);
  }
  assert.ok(Array.isArray(v2Snapshot.allocations[0].errors));
  assert.ok(Array.isArray(v2Snapshot.allocations[0].warnings));
  assert.equal(v2Snapshot.allocations[0].warnings.length, 1);
  assert.equal(v2Snapshot.days[0].errorCount, 0);
  assert.equal(v2Snapshot.days[0].warningCount, 1);
  assert.equal(v2Snapshot.validation.summary.errorCount, 0);
  assert.equal(v2Snapshot.validation.summary.warningCount, 1);
  assert.equal(v2Snapshot.allocations[0].date, '2026-07-14', 'candidato recusado nunca chega ao snapshot V2');
}

console.log('planningManualScheduleIntegration.test.js ok');
process.exit(0);
