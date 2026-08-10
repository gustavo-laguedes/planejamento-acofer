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
  buildProductionCalendarValidationSnapshot,
  applyAcceptedPlanningReoptimization,
  normalizeManualScheduleStockLocations,
  focusPlanningFlowAllocation,
  resolvePlanningFlowAllocation
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
  minimumStartRatio: 1,
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
assert.deepEqual(context.stockLocations.map(item => item.locationId), ['L1', 'L2', '__default__']);

// Estoque agregado usa o local técnico internamente; locais explícitos continuam estritos.
{
  const aggregated = normalizeManualScheduleStockLocations({
    stock: [{ materialId: 'MAT', quantity: 100, unit: 'kg' }],
    stockMinimums: [],
    stockLocations: []
  });
  assert.deepEqual(aggregated, [{ locationId: '__default__' }]);

  const explicit = normalizeManualScheduleStockLocations({
    stock: [{ materialId: 'MAT', locationId: 'L1', quantity: 100, unit: 'kg' }],
    stockMinimums: [{ materialId: 'MAT', location_id: 'L2', minimumQuantity: 10 }],
    stockLocations: [
      { location_id: 'L1', name: 'Almoxarifado' },
      { id: 'L1' },
      'L2',
      '',
      { locationId: '' }
    ]
  });
  assert.deepEqual(explicit.map(item => item.locationId), ['L1', 'L2']);
  assert.ok(!explicit.some(item => item.locationId === '__default__'));
  assert.equal(explicit[0].name, 'Almoxarifado');
}

const source = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const manualMoveControllerSource = readFileSync(
  new URL('../shared/planning-controller/planningManualMoveController.js', import.meta.url),
  'utf8'
);
assert.match(source, /productionIndexesToRemove/, 'cortar cadeia deve remover a producao do builder');
assert.match(source, /rerenderProductionsBuilder\(\);\s*lastPayload = payload\(\);/, 'builder deve renumerar producoes antes de simular novamente');
assert.match(source, /buildProductionShortageCascade/, 'modal de falta deve calcular saldo em cascata');
assert.match(source, /availableAfter/, 'preview de falta deve mostrar saldo depois do consumo');
assert.match(source, /data-production-drag-handle/, 'produções devem expor alça de reordenação');
assert.match(source, /moveProductionPriority/, 'builder deve permitir alterar prioridade por ordem');
assert.match(source, /closeCalendarAfterProductionPriorityChange/, 'alterar prioridade deve fechar o calendário atual');
assert.match(source, /draft\.operationOverrides\s*=\s*\{\}/, 'alterar prioridade deve limpar decisões dependentes da ordem');
const runnerStart = source.indexOf('productionCalendarMoveRunner = async');
const runnerEnd = source.indexOf('function openFlowNodeDetailsModal', runnerStart);
assert.ok(runnerStart > 0 && runnerEnd > runnerStart, 'harness do movimento manual deve existir');
const runner = source.slice(runnerStart, runnerEnd);

assert.match(runner, /runPlanningManualMoveController\s*\(/, 'todos os movimentos V2 devem passar pelo controller manual');
assert.match(manualMoveControllerSource, /applyManualScheduleTransaction/, 'controller de move deve usar o coordenador transacional');
assert.doesNotMatch(runner, /simulateCurrent\s*\(/, 'movimento manual não pode simular novamente');
assert.doesNotMatch(runner, /scheduleOperations\s*\(/, 'movimento manual não pode chamar o scheduler');
assert.doesNotMatch(manualMoveControllerSource, /\b(simulateCurrent|buildPlan|scheduleOperations|reoptimizePlanningFuture)\b/, 'controller de move nao pode chamar solver/reotimizacao');
assert.doesNotMatch(source, /applyDraftMove\s*\(/, 'PlanningPage não pode aplicar allocations diretamente');
const manualWorkDateStart = source.indexOf('async function handleProductionCalendarManualWorkDate');
const manualWorkDateEnd = source.indexOf('async function handleProductionCalendarDailyTeam', manualWorkDateStart);
const manualWorkDateHandler = source.slice(manualWorkDateStart, manualWorkDateEnd);
assert.match(manualWorkDateHandler, /reoptimizeProductionCalendarConstraints\s*\(/, 'alterar dia útil deve chamar o reotimizador oficial');
assert.match(manualWorkDateHandler, /candidateDraft:\s*recalculated\.manualScheduleDraft/, 'liberação deve transacionar o candidato completo');
assert.match(manualWorkDateHandler, /currentDraft:\s*manualScheduleDraft/, 'liberação deve comparar contra o draft aceito');
const dailyTeamStart = manualWorkDateEnd;
const dailyTeamEnd = source.indexOf('function daysWithDraftAllocations', dailyTeamStart);
const dailyTeamHandler = source.slice(dailyTeamStart, dailyTeamEnd);
assert.match(dailyTeamHandler, /cutoffDate:\s*date/);
assert.match(dailyTeamHandler, /reoptimizeProductionCalendarConstraints\s*\(/, 'alterar equipe deve usar o mesmo reotimizador');
assert.match(dailyTeamHandler, /candidateAllocations/);
assert.match(dailyTeamHandler, /currentDraft:\s*manualScheduleDraft/, 'recálculo de equipe deve manter o draft aceito como origem transacional');
const payloadStart = source.indexOf('function payload()');
const payloadEnd = source.indexOf('function productionColorByIndex', payloadStart);
assert.match(source.slice(payloadStart, payloadEnd), /manualWorkDates:\s*manualScheduleDraft\?\.manualWorkDates\s*\|\|\s*draft\.manualWorkDates/, 'nova simulação deve enviar dias manuais persistidos');
const simulateStart = source.indexOf('async function simulateCurrent(');
const simulateEnd = source.indexOf('function openManualDraftChoiceModal', simulateStart);
const simulateHandler = source.slice(simulateStart, simulateEnd);
assert.ok(simulateHandler.indexOf('preservedManualWorkDates') < simulateHandler.indexOf('manualScheduleDraft = null'), 'restrições devem ser preservadas antes de descartar movimentos manuais');
assert.match(simulateHandler, /draft\.manualWorkDates\s*=\s*preservedManualWorkDates/);
assert.match(runner, /const installAcceptedMove = \(transaction, \{ operation \} = \{\}\) => \{[\s\S]*manualScheduleDraft = transaction\.draft[\s\S]*saveDraftNow\(\)/, 'bloqueio deve impedir troca do draft ativo');
assert.match(manualMoveControllerSource, /if \(fullTransaction\.accepted\) \{[\s\S]*onAccepted\?\.?\(fullTransaction, \{ operation, mode: 'full' \}\)[\s\S]*return \{ accepted: true/, 'movimento integral aceito deve instalar o candidato e encerrar');
assert.match(manualMoveControllerSource, /if \(!\(maxQuantity > 0\)\) \{[\s\S]*onStockUnavailable\?\.?\([\s\S]*return \{ accepted: false, status: 'rejected'/, 'bloqueio total de estoque deve retornar sem trocar o draft ativo');
assert.ok(
  runner.indexOf('manualScheduleDraft = transaction.draft') < runner.indexOf('saveDraftNow()'),
  'localStorage só pode ser atualizado após aceitar o candidato'
);
const rejectionBranch = manualMoveControllerSource.slice(manualMoveControllerSource.indexOf('const analysis ='), manualMoveControllerSource.indexOf('const acceptedQuantity ='));
assert.doesNotMatch(rejectionBranch, /saveDraftNow\s*\(/, 'candidato recusado não pode ir ao localStorage');
assert.doesNotMatch(rejectionBranch, /manualScheduleDraft\s*=/, 'candidato recusado não pode trocar o draft ativo');
assert.match(runner, /transaction\.warnings\.length/, 'warning deve confirmar movimento com alertas');
assert.match(runner, /selectedAllocationId:\s*null/, 'seleção deve limpar no sucesso');
assert.match(runner, /finally\s*\{[\s\S]*setOperationLoading\(false\)/, 'loading sempre deve encerrar');
const replaceModalStart = source.indexOf("if (error?.code === 'CONFIRM_REPLACE')");
const replaceModalEnd = source.indexOf("return choice === 'confirm';", replaceModalStart);
const replaceModal = source.slice(replaceModalStart, replaceModalEnd);
assert.match(replaceModal, /sourceDate/);
assert.match(replaceModal, /destinationDate/);
assert.match(replaceModal, /destinationMachine/);
assert.match(replaceModal, /próximo período válido/);
assert.doesNotMatch(replaceModal, /occupant\.materialId|proposed\.productionId|source\.operationId/);
assert.doesNotMatch(source, /production-calendar-card\[data-allocation-id/, 'PlanningPage nao deve conhecer seletor DOM do calendario');
assert.doesNotMatch(source, /gantt-aps__bar/, 'PlanningPage nao deve conhecer seletor DOM do Gantt');

{
  const allocations = [
    {
      allocationId: 'direct-allocation',
      operationId: 'op-direct',
      parentOperationId: 'parent-direct',
      materialId: 'MAT-DIRECT',
      productionIndex: 0,
      date: '2026-07-22',
      startTime: '10:00',
      status: 'planned'
    },
    {
      allocationId: 'split-completed',
      operationId: 'op-split',
      parentOperationId: 'parent-split',
      materialId: 'MAT-SPLIT',
      productionIndex: 1,
      date: '2026-07-20',
      startTime: '07:00',
      splitPartOrder: 1,
      status: 'completed'
    },
    {
      allocationId: 'split-open-late',
      operationId: 'op-split',
      parentOperationId: 'parent-split',
      materialId: 'MAT-SPLIT',
      productionIndex: 1,
      date: '2026-07-21',
      startTime: '07:00',
      splitPartOrder: 1,
      status: 'planned'
    },
    {
      allocationId: 'split-open-first',
      operationId: 'op-split',
      parentOperationId: 'parent-split',
      materialId: 'MAT-SPLIT',
      productionIndex: 1,
      date: '2026-07-21',
      startTime: '07:00',
      splitPartOrder: 0,
      status: 'planned'
    },
    {
      allocationId: 'shared-membership',
      operationId: 'op-shared',
      parentOperationId: 'parent-shared',
      materialId: 'MAT-SHARED',
      date: '2026-07-19',
      startTime: '08:00',
      productionMemberships: [{ productionIndex: 2, productionId: 'production-2' }]
    }
  ];
  assert.equal(resolvePlanningFlowAllocation({ flowAllocationId: 'direct-allocation' }, allocations).allocationId, 'direct-allocation');
  assert.equal(
    resolvePlanningFlowAllocation({ flowOperationIds: 'op-shared', flowProductionIndexes: '2' }, allocations).allocationId,
    'shared-membership',
    'matching deve respeitar memberships de producao compartilhada'
  );
  assert.equal(
    resolvePlanningFlowAllocation({ flowOperationIds: 'op-split', flowProductionIndexes: '1' }, allocations).allocationId,
    'split-open-first',
    'multiplas partes devem priorizar nao concluida, inicio e splitPartOrder'
  );
  assert.equal(
    resolvePlanningFlowAllocation({ flowMaterialId: 'MAT-SHARED', flowProductionIndexes: '2' }, allocations).allocationId,
    'shared-membership',
    'fallback conservador usa material e producao quando nao ha operationId no no'
  );
  assert.equal(resolvePlanningFlowAllocation({ flowOperationIds: 'missing' }, allocations), null);

  const calls = [];
  assert.equal(focusPlanningFlowAllocation({
    node: { dataset: { flowOperationIds: 'op-split', flowProductionIndexes: '1' } },
    allocations,
    rendererHost: { focusAllocation: allocationId => {
      calls.push(allocationId);
      return true;
    } }
  }), true);
  assert.deepEqual(calls, ['split-open-first']);
  assert.equal(focusPlanningFlowAllocation({
    node: { dataset: { flowOperationIds: 'missing' } },
    allocations,
    rendererHost: { focusAllocation: () => { throw new Error('nao deveria focar'); } }
  }), false);
}

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
    minimumStartRatio: 1,
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

const futureAllocation = {
  allocationId: 'future-1', operationId: 'operation-1', parentOperationId: 'operation-1',
  machineId: 'M1', machineName: 'M1', date: '2026-07-20', quantity: 10, durationMinutes: 60
};
const previousFutureDraft = { allocations: [futureAllocation], dailyTeamOverrides: {}, manualWorkDates: [] };
const acceptedFutureDraft = {
  ...previousFutureDraft,
  allocations: [{ ...futureAllocation, allocationId: 'reopt:operation-1:001', peopleCount: 4 }],
  dailyTeamOverrides: { '2026-07-20': { day: 4 } },
  manualWorkDates: ['2026-07-18'],
  frozenThrough: { date: '2026-07-18', time: '00:00' }
};
const appliedReoptimization = applyAcceptedPlanningReoptimization({
  currentSimulation: { operations: [{ operationId: 'operation-1' }], calendarOperations: [{ operationId: 'stale' }], days: [{ date: '2026-07-20' }], summary: {} },
  currentDraft: previousFutureDraft,
  recalculated: { operations: [{ operationId: 'operation-1', peopleCount: 4 }], cutoffSnapshot: { cutoff: { date: '2026-07-18' } } },
  transaction: { accepted: true, draft: acceptedFutureDraft }
});
assert.equal(appliedReoptimization.manualScheduleDraft.allocations.length, 1, 'aplicação atômica mantém allocations futuras');
assert.deepEqual(appliedReoptimization.manualWorkDates, ['2026-07-18']);
assert.deepEqual(appliedReoptimization.currentSimulation.calendarOperations, [], 'operações diárias antigas não podem sobrescrever o candidato');
assert.throws(() => applyAcceptedPlanningReoptimization({
  currentSimulation: { operations: [], days: [], summary: {} },
  currentDraft: previousFutureDraft,
  recalculated: { operations: [], cutoffSnapshot: { cutoff: { date: '2026-07-18' } } },
  transaction: { accepted: true, draft: { ...acceptedFutureDraft, allocations: [] } }
}), error => error?.code === 'ACCEPTED_REOPTIMIZATION_LOST_FUTURE_WORK');

console.log('planningManualScheduleIntegration.test.js ok');
process.exit(0);
