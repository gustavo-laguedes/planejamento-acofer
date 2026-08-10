import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import { applyManualScheduleTransaction } from '../services/manualScheduleTransaction.service.js';
import {
  createManualScheduleHistory,
  recordManualScheduleHistory,
  redoManualScheduleHistory,
  undoManualScheduleHistory
} from '../services/manualScheduleHistory.service.js';
import { normalizePersistedManualScheduleDraft, serializeManualScheduleDraft } from '../services/manualSchedulePersistence.service.js';
import {
  buildPlanningOperationResourcePreview,
  buildRemainingWorkItems,
  getPlanningOperationResourceOptions,
  reoptimizePlanningFuture,
  selectPlanningEditorProductivityRows
} from '../services/planningReoptimization.service.js';
import { createProductionCalendarGridRows } from '../shared/production-calendar/productionCalendar.utils.js';
import {
  buildProductionCalendarDayPresentation,
  formatProductionCalendarQuantity
} from '../shared/production-calendar/productionCalendar.utils.js';

const monday = '2026-07-20';
const shifts = [{ shiftId: 'day', label: 'Turno 1', startTime: '07:00', endTime: '15:00', teamAvailable: 6 }];
const machines = [{ machineId: 'M1', machineName: 'M1' }, { machineId: 'M2', machineName: 'M2' }];
const materials = [{ id: 'MAT', name: 'Material' }, { id: 'FINAL', name: 'Final' }];
const matrix = [
  [6, 100], [5, 85], [4, 70]
].map(([people, output]) => ({
  material_id: 'MAT', material_code: 'MAT', machine_id: 'M1', machine_name: 'M1',
  people_count: people, output_qty: output, output_unit: 'kg', time_seconds: 28800, active: true
})).concat([{
  material_id: 'FINAL', material_code: 'FINAL', machine_id: 'M2', machine_name: 'M2',
  people_count: 2, output_qty: 100, output_unit: 'kg', time_seconds: 28800, active: true
}]);

function allocation({
  allocationId = 'A1', parentOperationId = 'OP1', materialId = 'MAT', machineId = 'M1',
  date = monday, startTime = '07:00', endTime = '15:00', quantity = 100, peopleCount = 6,
  capacityPercent = 100, maxDailyCapacity = quantity,
  memberships = [{ productionId: 'production-1', productionIndex: 0, productionStage: 1 }]
} = {}) {
  const durationMinutes = ((Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3)))
    - (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3))));
  return {
    allocationId, parentOperationId, operationId: parentOperationId,
    productionId: memberships[0]?.productionId || 'production-1', productionIndex: memberships[0]?.productionIndex || 0,
    materialId, materialCode: materialId, materialName: materialId === 'MAT' ? 'Material' : 'Final',
    machineId, machineName: machineId, date, startTime, endTime, quantity, unit: 'kg',
    durationMinutes, peopleCount, capacityPercent, maximumDailyQuantity: maxDailyCapacity, maxDailyCapacity,
    source: 'automatic', pinned: false, sourceAllocationIds: [allocationId], sourceParentOperationIds: [parentOperationId],
    components: [{ allocationId, parentOperationId, productionId: memberships[0]?.productionId, quantity }],
    productionMemberships: memberships, productionStage: memberships[0]?.productionStage
  };
}

function operation(parentOperationId = 'OP1', materialId = 'MAT', order = 0) {
  return {
    operationId: parentOperationId, materialId, materialCode: materialId,
    materialName: materialId === 'MAT' ? 'Material' : 'Final', productionOrder: order,
    machineName: materialId === 'MAT' ? 'M1' : 'M2', peopleCount: materialId === 'MAT' ? 6 : 2,
    produceQty: 100, unit: 'kg', startDate: monday, startTime: '07:00', endDate: monday, endTime: '15:00',
    segments: [{ date: monday, startTime: '07:00', endTime: '15:00', minutes: 480 }]
  };
}

function baseline(operations = [operation()], dependencies = []) {
  return {
    operations, dependencies, transports: [], shifts, holidays: [], timezone: 'America/Sao_Paulo',
    stock: [], stockMinimums: [], stockLocations: [], setupMinutes: 0,
    minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60,
    materials, machines, productivityMatrix: matrix
  };
}

function optimize(draft, changes = {}, base = baseline(), cutoff = { date: monday, time: '00:00' }, matrixRows = matrix) {
  return reoptimizePlanningFuture({
    baseline: base, acceptedDraft: draft, cutoff, constraintChanges: changes,
    productivityMatrix: matrixRows,
    calendar: {
      shifts,
      dailyTeamOverrides: changes.dailyTeamOverrides ?? draft.dailyTeamOverrides ?? {},
      manualWorkDates: changes.manualWorkDates ?? draft.manualWorkDates ?? [],
      holidays: []
    },
    stockContext: { stock: [], stockMinimums: [], stockLocations: [] },
    policies: changes.policies
  });
}

// 1 e 2 — redução escolhe a configuração da mesma máquina e divide entre dias.
const initial = createManualScheduleDraft({ allocations: [allocation()], machines, now: new Date('2026-07-16T12:00:00Z') });
const reduced = optimize(initial, { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [] });
assert.equal(reduced.accepted, true, JSON.stringify(reduced.diagnostics.errors));
assert.deepEqual(reduced.allocations.map(item => item.machineId), ['M1', 'M1']);
assert.deepEqual(reduced.allocations.map(item => item.peopleCount), [4, 4]);
assert.deepEqual(reduced.allocations.map(item => item.date), [monday, '2026-07-21']);
assert.equal(reduced.allocations.reduce((sum, item) => sum + item.quantity, 0), 100);
assert.equal(reduced.allocations[0].quantity, 70);
assert.equal(reduced.allocations[1].quantity, 30);
assert.equal(formatProductionCalendarQuantity(52.4, 'un'), '52 un');
assert.equal(formatProductionCalendarQuantity(52.5, 'un'), '53 un');
assert.equal(formatProductionCalendarQuantity(52.1, 'un'), '52 un');

// Matriz real referencia máquina por nome; a grade usa o ID cadastral. O reotimizador deve canonicalizar.
const registeredMachine = [{ machineId: '101', machineName: 'M1' }];
const canonicalDraft = createManualScheduleDraft({
  allocations: [allocation({ machineId: '101' })].map(item => ({ ...item, machineName: 'M1' })),
  machines: registeredMachine
});
const canonicalResult = optimize(
  canonicalDraft,
  { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [] },
  { ...baseline(), machines: registeredMachine }
);
assert.equal(canonicalResult.accepted, true, JSON.stringify(canonicalResult.blockingRegressions));
assert.ok(canonicalResult.allocations.length > 0);
assert.ok(canonicalResult.allocations.every(item => item.machineId === '101'));
const canonicalRows = createProductionCalendarGridRows({
  days: canonicalResult.allocations.map(item => ({ date: item.date })),
  machines: registeredMachine,
  allocations: canonicalResult.allocations
});
assert.equal(Object.values(canonicalRows[0].allocationsByDate).flat().length, canonicalResult.allocations.length, 'todas as allocations reotimizadas devem permanecer renderizáveis');
const integratedAcceptance = applyManualScheduleTransaction({
  currentDraft: initial,
  intent: {
    type: 'SET_DAILY_TEAM_OVERRIDES', date: monday, overrides: { day: 4 }, cutoffDate: monday,
    cutoffSnapshot: reduced.cutoffSnapshot, candidateAllocations: reduced.allocations, candidateDraft: reduced.manualScheduleDraft
  },
  draftContext: { validatedAt: '2026-07-16T13:00:00Z' },
  validationContext: { ...baseline(), dailyTeamOverrides: {}, manualWorkDates: [] }
});
assert.equal(integratedAcceptance.accepted, true, JSON.stringify(integratedAcceptance.blockingIssues));
assert.deepEqual(integratedAcceptance.draft.allocations, reduced.allocations);

const utilizationMatrix = [
  {
    material_id: 'MAT', material_code: 'MAT', machine_id: 'M1', machine_name: 'M1',
    people_count: 4, output_qty: 100, output_unit: 'kg', time_seconds: 28800, active: true
  },
  {
    material_id: 'FINAL', material_code: 'FINAL', machine_id: 'M2', machine_name: 'M2',
    people_count: 2, output_qty: 100, output_unit: 'kg', time_seconds: 28800, active: true
  }
];
const utilizationDraft = createManualScheduleDraft({
  allocations: [
    allocation({ allocationId: 'U1', parentOperationId: 'UOP1', materialId: 'MAT', machineId: 'M1', peopleCount: 4 }),
    allocation({ allocationId: 'U2', parentOperationId: 'UOP2', materialId: 'FINAL', machineId: 'M2', peopleCount: 2 })
  ],
  machines
});
const utilizationResult = optimize(
  utilizationDraft,
  {},
  baseline([operation('UOP1', 'MAT', 0), operation('UOP2', 'FINAL', 1)]),
  { date: monday, time: '00:00' },
  utilizationMatrix
);
assert.equal(utilizationResult.accepted, true, JSON.stringify(utilizationResult.diagnostics.errors));
const utilizationResultAi = optimize(
  utilizationDraft,
  { policies: { mode: 'utilization' } },
  baseline([operation('UOP1', 'MAT', 0), operation('UOP2', 'FINAL', 1)]),
  { date: monday, time: '00:00' },
  utilizationMatrix
);
assert.equal(utilizationResultAi.accepted, true, JSON.stringify(utilizationResultAi.diagnostics.errors));
assert.deepEqual(utilizationResultAi.allocations.map(item => `${item.machineId}:${item.startTime}-${item.endTime}`).sort(), [
  'M1:07:00-15:00',
  'M2:07:00-15:00'
]);

// 3 — allocation que atravessa o cutoff é decomposta por quantidade, sem reagendar o concluído.
const crossingDraft = createManualScheduleDraft({
  allocations: [allocation({ date: monday, startTime: '08:00', endTime: '16:00' })], machines
});
const crossing = buildRemainingWorkItems({ acceptedDraft: crossingDraft, cutoff: { date: monday, time: '12:00' }, productivityMatrix: matrix, baseline: baseline() });
assert.equal(crossing.frozenAllocations[0].quantity, 50);
assert.equal(crossing.frozenAllocations[0].endTime, '12:00');
assert.equal(crossing.workItems[0].completedQuantity, 50);
assert.equal(crossing.workItems[0].remainingQuantity, 50);

// Editor avançado: opções vêm somente da Matriz e a edição preserva o passado byte a byte.
const editorMatrix = matrix.concat([
  {
    material_id: 'MAT', material_code: 'MAT', machine_id: 'M2', machine_name: 'M2',
    people_count: 2, output_qty: 60, output_unit: 'kg', time_seconds: 28800, active: true
  },
  {
    material_id: 'MAT', material_code: 'MAT', machine_id: 'M2', machine_name: 'M2',
    people_count: 3, output_qty: 90, output_unit: 'kg', time_seconds: 28800, active: true
  }
]);
const editorOptions = getPlanningOperationResourceOptions({
  productivityRows: selectPlanningEditorProductivityRows({
    material: { name: 'Material', codes: ['MAT'] },
    productivityMatrix: editorMatrix
  }),
  machines
});
assert.deepEqual(editorOptions.map(option => option.machineId), ['M1', 'M2']);
assert.deepEqual(editorOptions.find(option => option.machineId === 'M2').peopleCounts, [2, 3]);
assert.equal(editorOptions.find(option => option.machineId === 'M2').maxPeople, 3);
const previewForTwo = buildPlanningOperationResourcePreview({
  allocation: allocation({ machineId: 'M2' }),
  machine: editorOptions.find(option => option.machineId === 'M2'),
  peopleCount: 2,
  dailyMinutes: 480
});
const previewForThree = buildPlanningOperationResourcePreview({
  allocation: allocation({ machineId: 'M2' }),
  machine: editorOptions.find(option => option.machineId === 'M2'),
  peopleCount: 3,
  dailyMinutes: 480
});
const previewWithoutDailyMinutes = buildPlanningOperationResourcePreview({
  allocation: allocation({ machineId: 'M2' }),
  machine: editorOptions.find(option => option.machineId === 'M2'),
  peopleCount: 2,
  dailyMinutes: null
});
assert.equal(previewForTwo.capacityPerDay, 60);
assert.equal(previewForThree.capacityPerDay, 90);
assert.equal(previewWithoutDailyMinutes, null, 'a prévia deve usar fallback quando os minutos diários não estão disponíveis');
assert.equal(previewForTwo.startTime, '07:00');
assert.notEqual(previewForTwo.endTime, previewForThree.endTime);
const previewInput = allocation({ machineId: 'M2' });
const previewInputBytes = JSON.stringify(previewInput);
buildPlanningOperationResourcePreview({
  allocation: previewInput,
  machine: editorOptions.find(option => option.machineId === 'M2'),
  peopleCount: 3,
  dailyMinutes: 480
});
assert.equal(JSON.stringify(previewInput), previewInputBytes, 'a prévia não pode mutar a allocation exibida');

const realCaseMatrix = [
  { material_name: 'Tela', material_codes: ['EQ-45'], machine_name: 'MT-200', people_count: 1, output_qty: 100, output_unit: 'un', time_seconds: 28800, active: true },
  { material_name: 'Tela', material_codes: ['ACO-8'], machine_name: 'Aço-8', people_count: 1, output_qty: 100, output_unit: 'un', time_seconds: 28800, active: true },
  { material_name: 'Tela', material_codes: ['LONG-34'], machine_name: 'EC-125', people_count: 1, output_qty: 100, output_unit: 'un', time_seconds: 28800, active: true },
  { material_name: 'Tela', material_codes: ['LONG-34'], machine_name: 'EC-60', people_count: 2, output_qty: 80, output_unit: 'un', time_seconds: 28800, active: true }
];
const eq45Rows = selectPlanningEditorProductivityRows({
  material: { name: 'EQ-45 (3,0x2,0)', codes: ['EQ-45'] }, productivityMatrix: realCaseMatrix
});
const longitudinalRows = selectPlanningEditorProductivityRows({
  material: { name: '3,4 Longitudinal - 3m', codes: ['LONG-34'] }, productivityMatrix: realCaseMatrix
});
assert.deepEqual(getPlanningOperationResourceOptions({ productivityRows: eq45Rows }).map(option => option.machineName), ['MT-200']);
assert.deepEqual(getPlanningOperationResourceOptions({ productivityRows: longitudinalRows }).map(option => option.machineName), ['EC-125', 'EC-60']);

const eq45Matrix = [
  { material_codes: ['00808500036', '00808500037'], material_name: 'EQ-45 (3,0x2,0)', machine_name: 'MT-200', machine_priority: 1, people_count: 3, output_qty: 960, output_unit: 'un', time_seconds: 86400, active: true },
  { material_codes: ['00808500036', '00808500037'], material_name: 'EQ-45 (3,0x2,0)', machine_name: 'MT-200', machine_priority: 2, people_count: 2, output_qty: 689, output_unit: 'un', time_seconds: 86400, active: true },
  { material_codes: ['00808500036', '00808500037'], material_name: 'EQ-45 (3,0x2,0)', machine_name: 'MT-200', machine_priority: 3, people_count: 1, output_qty: 434, output_unit: 'un', time_seconds: 86400, active: true }
];
const eq45Allocation = {
  ...allocation({ machineId: 'MT', peopleCount: 3 }),
  materialId: 'EQ45', materialCode: '00808500037', materialCodes: ['00808500036', '00808500037'],
  materialName: 'EQ-45 (3,0x2,0)', machineName: 'MT-200', unit: 'un'
};
const eq45Machines = [{ machineId: 'MT', machineName: 'MT-200' }];
const eq45Draft = createManualScheduleDraft({ allocations: [eq45Allocation], machines: eq45Machines });
const eq45Baseline = {
  ...baseline([{ ...operation(), materialId: 'EQ45', materialCode: '00808500037', materialName: 'EQ-45 (3,0x2,0)', machineName: 'MT-200', machineId: 'MT', peopleCount: 3, unit: 'un' }]),
  materials: [{ id: 'EQ45', name: 'EQ-45 (3,0x2,0)', codes: ['00808500036', '00808500037'] }],
  machines: eq45Machines,
  productivityMatrix: eq45Matrix
};
const eq45RowsComplete = selectPlanningEditorProductivityRows({
  material: eq45Baseline.materials[0],
  productivityMatrix: eq45Matrix
});
const eq45Options = getPlanningOperationResourceOptions({ productivityRows: eq45RowsComplete, machines: eq45Machines });
assert.deepEqual(eq45Options[0].peopleCounts, [1, 2, 3]);
assert.deepEqual([3, 2, 1].map(peopleCount => buildPlanningOperationResourcePreview({
  allocation: eq45Allocation,
  machine: eq45Options[0],
  peopleCount,
  dailyMinutes: 480
}).capacityPerDay), [960, 689, 434]);
const eq45PreviewTwo = buildPlanningOperationResourcePreview({
  allocation: eq45Allocation,
  machine: eq45Options[0],
  peopleCount: 2,
  dailyMinutes: 480
});
assert.equal(eq45PreviewTwo.capacityPerDay, 689);
const eq45EditedTwo = optimize(
  eq45Draft,
  { operationResourceEdits: [{ parentOperationId: 'OP1', machineId: 'MT', peopleCount: 2 }] },
  eq45Baseline,
  { date: monday, time: '00:00' },
  eq45Matrix
);
assert.equal(eq45EditedTwo.accepted, true, JSON.stringify(eq45EditedTwo.diagnostics?.errors));
assert.ok(eq45EditedTwo.allocations.every(item => item.peopleCount === 2 && item.machineId === 'MT'));
for (const peopleCount of [3, 2, 1]) {
  const editedConfiguration = optimize(
    eq45Draft,
    { operationResourceEdits: [{ parentOperationId: 'OP1', machineId: 'MT', peopleCount }] },
    eq45Baseline,
    { date: monday, time: '00:00' },
    eq45Matrix
  );
  assert.equal(editedConfiguration.accepted, true, `MT-200 + ${peopleCount} pessoa(s) deve ser aceita no submit`);
  assert.ok(editedConfiguration.allocations.every(item => item.peopleCount === peopleCount));
}
const eq45ReducedTeam = optimize(
  eq45Draft,
  { dailyTeamOverrides: { [monday]: { day: 2 } }, manualWorkDates: [] },
  eq45Baseline,
  { date: monday, time: '00:00' },
  eq45Matrix
);
assert.equal(eq45ReducedTeam.accepted, true, JSON.stringify(eq45ReducedTeam.diagnostics?.errors));
assert.ok(eq45ReducedTeam.allocations.every(item => item.machineId === 'MT' && item.peopleCount <= 2));

const pastDate = '2026-07-17';
const editorDraft = createManualScheduleDraft({
  allocations: [
    allocation({ allocationId: 'EDIT-PAST', date: pastDate, quantity: 50 }),
    allocation({ allocationId: 'EDIT-FUTURE', date: monday, quantity: 100 })
  ],
  machines
});
const frozenBeforeEdit = JSON.stringify(editorDraft.allocations.filter(item => item.date < monday));
const edited = optimize(
  editorDraft,
  {
    operationResourceEdits: [{ parentOperationId: 'OP1', machineId: 'M2', peopleCount: 3 }],
    dailyTeamOverrides: {}, manualWorkDates: []
  },
  baseline(),
  { date: monday, time: '00:00' },
  editorMatrix
);
assert.equal(edited.accepted, true, JSON.stringify(edited.blockingRegressions));
assert.equal(JSON.stringify(edited.allocations.filter(item => item.date < monday)), frozenBeforeEdit);
assert.ok(edited.allocations.filter(item => item.date >= monday).every(item => item.machineId === 'M2'));
assert.ok(edited.allocations.filter(item => item.date >= monday).every(item => item.peopleCount === 3));
assert.ok(edited.allocations.filter(item => item.date >= monday).every(item => item.durationMinutes > 0));
assert.ok(edited.stockProjection && edited.diagnostics && edited.dependencyProjection);
assert.ok(edited.manualScheduleDraft.constraints.some(constraint => (
  constraint.type === 'OPERATION_RESOURCES' && constraint.machineId === 'M2' && constraint.peopleCount === 3
)));

const acceptedEditorTransaction = applyManualScheduleTransaction({
  currentDraft: editorDraft,
  intent: {
    type: 'EDIT_OPERATION_RESOURCES', cutoffDate: monday,
    cutoffSnapshot: edited.cutoffSnapshot,
    previousDiagnostics: edited.previousDiagnostics,
    candidateAllocations: edited.allocations,
    candidateDraft: edited.manualScheduleDraft
  },
  draftContext: { validatedAt: '2026-07-17T12:00:00Z' },
  validationContext: { ...baseline(), productivityMatrix: editorMatrix, dailyTeamOverrides: {}, manualWorkDates: [] }
});
assert.equal(acceptedEditorTransaction.accepted, true, JSON.stringify(acceptedEditorTransaction.blockingIssues));
assert.equal(JSON.stringify(acceptedEditorTransaction.draft.allocations.filter(item => item.date < monday)), frozenBeforeEdit);
const beforeEditorState = { manualScheduleDraft: editorDraft, currentSimulation: { operations: baseline().operations } };
const afterEditorState = { manualScheduleDraft: acceptedEditorTransaction.draft, currentSimulation: { operations: edited.operations } };
const editorHistory = recordManualScheduleHistory(createManualScheduleHistory(beforeEditorState), beforeEditorState, afterEditorState);
assert.equal(editorHistory.past.length, 1, 'uma confirmação deve criar exatamente um snapshot');
const editorUndo = undoManualScheduleHistory(editorHistory);
assert.deepEqual(editorUndo.state, beforeEditorState, 'undo restaura máquina, pessoas e calendário anteriores');
const editorRedo = redoManualScheduleHistory(editorUndo.history);
assert.deepEqual(editorRedo.state, afterEditorState, 'redo restaura o resultado completo da edição');
const planningPageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const transportControllerSource = readFileSync(new URL('../shared/planning-controller/planningTransportController.js', import.meta.url), 'utf8');
const transportIdSource = transportControllerSource.slice(
  transportControllerSource.indexOf('export function manualTransportIdFor'),
  transportControllerSource.indexOf('export function manualTransportConstraints')
);
assert.match(transportIdSource, /allocation\.allocationId/, 'transporte manual precisa ser unitario por allocation, nao por parent+material');
assert.match(transportControllerSource, /producerAllocationId:\s*String\(allocation\.allocationId/, 'registro de transporte deve preservar a allocation de origem');
const applyTransportSource = transportControllerSource.slice(
  transportControllerSource.indexOf('export function applyManualTransportConstraints'),
  transportControllerSource.indexOf('export function withManualTransportPresentation')
);
assert.match(applyTransportSource, /legacyTransportIds/, 'transporte novo deve localizar ids legados do mesmo produtor/material');
assert.match(applyTransportSource, /legacyTransportIds\.has\(String\(constraint\.transportId \|\| ''\)\)/, 'pins operacionais de transporte legado precisam ser removidos junto com o registro antigo');
const editorHandlerSource = planningPageSource.slice(
  planningPageSource.indexOf('async function handleProductionCalendarAllocationSave'),
  planningPageSource.indexOf('function openProductionCalendarAllocationEditor')
);
const allocationEditorControllerSource = readFileSync(new URL('../shared/planning-controller/planningAllocationEditorController.js', import.meta.url), 'utf8');
assert.match(editorHandlerSource, /runPlanningAllocationEditorController/);
assert.match(allocationEditorControllerSource, /type:\s*'EDIT_ALLOCATION'/);
assert.match(allocationEditorControllerSource, /type:\s*'SPLIT_ALLOCATION'/);
assert.match(allocationEditorControllerSource, /applyManualScheduleTransaction/);
assert.doesNotMatch(editorHandlerSource, /productivityMatrix:\s*productivityRows/);
assert.doesNotMatch(editorHandlerSource, /reoptimizePlanningFuture|simulatePlanning|simulateCurrent|scheduleOperations/);
assert.match(editorHandlerSource, /acceptProductionCalendarEditorTransaction/);
const editorComponentSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarEditor.js', import.meta.url), 'utf8');
const reoptimizationSource = readFileSync(new URL('../services/planningReoptimization.service.js', import.meta.url), 'utf8');
const previewSource = reoptimizationSource.slice(
  reoptimizationSource.indexOf('export function buildPlanningOperationResourcePreview'),
  reoptimizationSource.indexOf('function operationResourceEdits')
);
assert.doesNotMatch(previewSource, /reoptimizePlanningFuture|validateManualSchedule|applyManualScheduleTransaction/);
assert.match(editorComponentSource, /name="machineId"/);
assert.match(editorComponentSource, /name="peopleCount"/);
assert.match(editorComponentSource, /machineSelect\.addEventListener\('change'/);
assert.match(editorComponentSource, /peopleInput[\s\S]*addEventListener\('input', syncMainPreview\)/);
assert.match(editorComponentSource, /Capacidade diária/);
assert.match(editorComponentSource, /Início previsto/);
assert.match(editorComponentSource, /Fim previsto/);
assert.doesNotMatch(editorComponentSource, /name="(?:material|stage|production|dependencies)"/);
assert.doesNotMatch(editorComponentSource, /mergeAllocations|splitAllocation|contextmenu|multipleSelection/i);

// 4 — sucessor só começa depois da conclusão e do buffer da dependência.
const scopedMatrix = [
  {
    material_id: 'MAT', material_code: 'MAT', machine_id: 'M1', machine_name: 'M1',
    people_count: 3, output_qty: 120, output_unit: 'kg', time_seconds: 28800, active: true
  },
  {
    material_id: 'MAT', material_code: 'MAT', machine_id: 'M1', machine_name: 'M1',
    people_count: 2, output_qty: 100, output_unit: 'kg', time_seconds: 28800, active: true
  }
];
const scopedDraft = createManualScheduleDraft({
  allocations: [
    allocation({ allocationId: 'SCOPED-EDIT', parentOperationId: 'OP-SCOPED', quantity: 120, peopleCount: 3, maxDailyCapacity: 120 }),
    allocation({ allocationId: 'SCOPED-NEXT', parentOperationId: 'OP-SCOPED', date: '2026-07-21', endTime: '10:20', quantity: 50, durationMinutes: 200, peopleCount: 3, maxDailyCapacity: 120, capacityPercent: 41.666667 })
  ],
  machines
});
const scopedEdit = optimize(
  scopedDraft,
  {
    operationResourceEdits: [{
      type: 'EDIT_PRODUCTION_CONFIGURATION',
      allocationId: 'SCOPED-EDIT',
      parentOperationId: 'OP-SCOPED',
      materialIdentity: { id: 'MAT', code: 'MAT', codes: ['MAT'], name: 'Material' },
      requestedConfiguration: { machineId: 'M1', machineName: 'M1', people: 2 },
      productivityConfiguration: {
        materialId: 'MAT', materialCode: 'MAT', materialCodes: ['MAT'], materialName: 'Material',
        machineId: 'M1', machineName: 'M1', people: 2, quantityPerDay: 100,
        row: scopedMatrix[1]
      }
    }],
    dailyTeamOverrides: {}, manualWorkDates: []
  },
  { ...baseline([operation('OP-SCOPED', 'MAT', 0)]), productivityMatrix: scopedMatrix },
  { date: monday, time: '00:00' },
  scopedMatrix
);
assert.equal(scopedEdit.accepted, true, JSON.stringify(scopedEdit.diagnostics?.errors));
const scopedEditedParts = scopedEdit.allocations.filter(item => item.sourceAllocationIds?.includes('SCOPED-EDIT'));
assert.equal(scopedEditedParts.find(item => item.date === monday).peopleCount, 2);
assert.equal(Number(scopedEditedParts.flatMap(item => item.components || [])
  .filter(component => component.allocationId === 'SCOPED-EDIT')
  .reduce((sum, component) => sum + component.quantity, 0).toFixed(6)), 120);
const scopedMergedNextDay = scopedEdit.allocations.find(item => item.date === '2026-07-21' && item.sourceAllocationIds?.includes('SCOPED-NEXT'));
assert.ok(scopedMergedNextDay.sourceAllocationIds.includes('SCOPED-EDIT'));
assert.equal(scopedMergedNextDay.peopleCount, 3);
assert.equal(scopedMergedNextDay.quantity, 70);
assert.equal(Number(scopedMergedNextDay.capacityPercent.toFixed(6)), 58.333333);

const hoursOnlyShift = [{ shiftId: 'day', label: 'Turno 1', shiftStartTime: '07:00', hoursPerDay: '8,48', teamAvailable: 6 }];
const hoursOnlyResult = reoptimizePlanningFuture({
  baseline: { ...baseline([operation('OP-HOURS', 'MAT', 0)]), shifts: hoursOnlyShift },
  acceptedDraft: createManualScheduleDraft({ allocations: [allocation({ allocationId: 'HOURS-A', parentOperationId: 'OP-HOURS' })], machines }),
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: { dailyTeamOverrides: {}, manualWorkDates: [] },
  productivityMatrix: matrix,
  calendar: { shifts: hoursOnlyShift, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(hoursOnlyResult.accepted, true, JSON.stringify(hoursOnlyResult.diagnostics?.errors));
assert.equal(hoursOnlyResult.allocations[0].endTime, '15:48');

const mergeSpanDraft = createManualScheduleDraft({
  allocations: [
    allocation({ allocationId: 'MERGE-A', parentOperationId: 'MERGE-A-OP', startTime: '09:00', endTime: '10:45', quantity: 20, maxDailyCapacity: 100, capacityPercent: 20 }),
    allocation({ allocationId: 'MERGE-BLOCK', parentOperationId: 'MERGE-BLOCK-OP', materialId: 'FINAL', machineId: 'M1', startTime: '10:45', endTime: '13:23', quantity: 33, peopleCount: 2, maxDailyCapacity: 100, capacityPercent: 33 }),
    allocation({ allocationId: 'MERGE-C', parentOperationId: 'MERGE-C-OP', startTime: '13:23', endTime: '15:00', quantity: 19, maxDailyCapacity: 100, capacityPercent: 19 })
  ],
  machines
});
const mergeSpanResult = reoptimizePlanningFuture({
  baseline: baseline([
    operation('MERGE-A-OP', 'MAT', 0),
    operation('MERGE-BLOCK-OP', 'FINAL', 1),
    operation('MERGE-C-OP', 'MAT', 2)
  ]),
  acceptedDraft: mergeSpanDraft,
  cutoff: { date: monday, time: '08:00' },
  constraintChanges: { dailyTeamOverrides: {}, manualWorkDates: [] },
  productivityMatrix: matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(mergeSpanResult.accepted, true, JSON.stringify(mergeSpanResult.diagnostics?.errors));
const mergedMaterial = mergeSpanResult.allocations.find(item => item.sourceAllocationIds?.includes('MERGE-A') && item.sourceAllocationIds?.includes('MERGE-C'));
assert.ok(mergedMaterial);
assert.ok(mergedMaterial.endTime <= '15:00', JSON.stringify(mergedMaterial));
assert.ok(mergeSpanResult.allocations.every(item => item.endTime !== item.startTime), JSON.stringify(mergeSpanResult.allocations));

const nightShift = [{ shiftId: 'night', label: 'Turno noite', startTime: '22:00', endTime: '06:00', teamAvailable: 6 }];
const nightMatrix = [{
  material_id: 'NIGHT', material_code: 'NIGHT', machine_id: 'M1', machine_name: 'M1',
  people_count: 1, output_qty: 8, output_unit: 'kg', time_seconds: 28800, active: true
}];
const nightResult = reoptimizePlanningFuture({
  baseline: {
    ...baseline([{
      ...operation('NIGHT-OP', 'NIGHT', 0),
      startDate: monday,
      startTime: '22:00',
      endDate: '2026-07-21',
      endTime: '06:00'
    }]),
    shifts: nightShift,
    productivityMatrix: nightMatrix
  },
  acceptedDraft: createManualScheduleDraft({
    allocations: [allocation({
      allocationId: 'NIGHT-A',
      parentOperationId: 'NIGHT-OP',
      materialId: 'NIGHT',
      machineId: 'M1',
      date: monday,
      startTime: '22:00',
      endTime: '23:00',
      quantity: 8,
      peopleCount: 1,
      maxDailyCapacity: 8,
      capacityPercent: 100
    })],
    machines
  }),
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: { dailyTeamOverrides: {}, manualWorkDates: [] },
  productivityMatrix: nightMatrix,
  calendar: { shifts: nightShift, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(nightResult.accepted, true, JSON.stringify(nightResult.diagnostics?.errors));
assert.equal(nightResult.allocations[0].date, monday);
assert.equal(nightResult.allocations[0].endDate, '2026-07-21');
assert.equal(nightResult.allocations[0].endTime, '06:00');

const stockPriorityMatrix = [
  { material_id: 'LOW-STOCK', material_code: 'LOW-STOCK', machine_id: 'M1', machine_name: 'M1', people_count: 3, output_qty: 100, output_unit: 'kg', time_seconds: 28800, active: true },
  { material_id: 'LOW-STOCK', material_code: 'LOW-STOCK', machine_id: 'M1', machine_name: 'M1', people_count: 2, output_qty: 80, output_unit: 'kg', time_seconds: 28800, active: true },
  { material_id: 'HIGH-STOCK', material_code: 'HIGH-STOCK', machine_id: 'M2', machine_name: 'M2', people_count: 3, output_qty: 100, output_unit: 'kg', time_seconds: 28800, active: true },
  { material_id: 'HIGH-STOCK', material_code: 'HIGH-STOCK', machine_id: 'M2', machine_name: 'M2', people_count: 2, output_qty: 80, output_unit: 'kg', time_seconds: 28800, active: true }
];
const stockPriorityDraft = createManualScheduleDraft({
  allocations: [
    allocation({ allocationId: 'HIGH-STOCK-A', parentOperationId: 'HIGH-STOCK-OP', materialId: 'HIGH-STOCK', machineId: 'M2', quantity: 80, peopleCount: 3 }),
    allocation({ allocationId: 'LOW-STOCK-A', parentOperationId: 'LOW-STOCK-OP', materialId: 'LOW-STOCK', machineId: 'M1', quantity: 80, peopleCount: 3 })
  ],
  machines
});
const stockPriority = reoptimizePlanningFuture({
  baseline: {
    ...baseline([
      { ...operation('HIGH-STOCK-OP', 'HIGH-STOCK', 1), machineId: 'M2', machineName: 'M2' },
      { ...operation('LOW-STOCK-OP', 'LOW-STOCK', 2), machineId: 'M1', machineName: 'M1' }
    ]),
    materials: [{ id: 'HIGH-STOCK', name: 'HIGH-STOCK' }, { id: 'LOW-STOCK', name: 'LOW-STOCK' }],
    productivityMatrix: stockPriorityMatrix
  },
  acceptedDraft: stockPriorityDraft,
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: { dailyTeamOverrides: { [monday]: { day: 5 } }, manualWorkDates: [] },
  productivityMatrix: stockPriorityMatrix,
  calendar: { shifts, dailyTeamOverrides: { [monday]: { day: 5 } }, manualWorkDates: [], holidays: [] },
  stockContext: {
    stock: [
      { materialId: 'HIGH-STOCK', quantity: 100 },
      { materialId: 'LOW-STOCK', quantity: 0 }
    ],
    stockMinimums: [],
    stockLocations: []
  }
});
assert.equal(stockPriority.accepted, true, JSON.stringify(stockPriority.diagnostics?.errors));
assert.equal(stockPriority.allocations.find(item => item.materialId === 'LOW-STOCK').peopleCount, 3);
assert.equal(stockPriority.allocations.find(item => item.materialId === 'HIGH-STOCK').peopleCount, 2);

const dependentAllocations = [
  allocation({ allocationId: 'P1', parentOperationId: 'P', quantity: 100 }),
  allocation({ allocationId: 'C1', parentOperationId: 'C', materialId: 'FINAL', machineId: 'M2', quantity: 100, peopleCount: 2 })
];
const dependentDraft = createManualScheduleDraft({ allocations: dependentAllocations, machines });
const dependency = { dependencyId: 'P-C', producerParentOperationId: 'P', consumerParentOperationId: 'C', materialId: 'MAT', requiredQuantity: 100 };
const dependent = optimize(dependentDraft, { dailyTeamOverrides: {}, manualWorkDates: [] }, baseline([
  operation('P', 'MAT', 0), operation('C', 'FINAL', 1)
], [dependency]));
assert.equal(dependent.accepted, true, JSON.stringify(dependent.diagnostics.errors));
const producerEnd = dependent.allocations.filter(item => item.parentOperationId === 'P').at(-1);
const consumerStart = dependent.allocations.find(item => item.parentOperationId === 'C');
assert.ok(`${consumerStart.date}T${consumerStart.startTime}` > `${producerEnd.date}T${producerEnd.endTime}`);

// Transporte com escopo nao pode falhar por operacao futura fora da cadeia afetada.
const scopedMachines = [...machines, { machineId: 'M3', machineName: 'M3' }];
const unrelatedAllocation = allocation({
  allocationId: 'U1', parentOperationId: 'U', materialId: 'UNRELATED',
  machineId: 'M3', date: '2026-07-22', quantity: 50, peopleCount: 1,
  memberships: [{ productionId: 'production-u', productionIndex: 9, productionStage: 1 }]
});
const transportScopedDraft = createManualScheduleDraft({
  allocations: [...dependentAllocations, unrelatedAllocation],
  machines: scopedMachines
});
transportScopedDraft.constraints = [
  { type: 'PIN_MACHINE', parentOperationId: 'P', machineId: 'M1', source: 'manual-transport-chain' },
  { type: 'MIN_START', parentOperationId: 'C', date: '2026-07-21', time: '07:00', source: 'manual-transport' }
];
const unrelatedBefore = JSON.stringify(transportScopedDraft.allocations.find(item => item.parentOperationId === 'U'));
const scopedTransport = reoptimizePlanningFuture({
  baseline: {
    ...baseline([
      operation('P', 'MAT', 0),
      operation('C', 'FINAL', 1),
      { ...operation('U', 'UNRELATED', 9), machineId: 'M3', machineName: 'M3', materialName: 'Sem matriz' }
    ], [dependency]),
    machines: scopedMachines
  },
  acceptedDraft: transportScopedDraft,
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: {
    dailyTeamOverrides: {},
    manualWorkDates: [],
    scopeParentOperationIds: ['P', 'C']
  },
  productivityMatrix: matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(scopedTransport.accepted, true, JSON.stringify(scopedTransport.diagnostics.errors));
assert.equal(JSON.stringify(scopedTransport.allocations.find(item => item.parentOperationId === 'U')), unrelatedBefore);

// Transporte manual nao troca para maquina produtiva incompatível com a matriz.
const rodMachines = [{ machineId: 'EC-125', machineName: 'EC-125' }, { machineId: 'Aco-8', machineName: 'Aco-8' }];
const rodMatrix = [
  { material_id: 'ROD', material_code: 'ROD', machine_id: 'Aco-8', machine_name: 'Aco-8', people_count: 1, output_qty: 1000, output_unit: 'kg', time_seconds: 28800, active: true }
];
const rodAllocation = allocation({
  allocationId: 'ROD-1', parentOperationId: 'ROD-OP', materialId: 'ROD',
  machineId: 'EC-125', quantity: 100, peopleCount: 1
});
const rodDraft = createManualScheduleDraft({ allocations: [rodAllocation], machines: rodMachines });
rodDraft.constraints = [
  { type: 'PIN_MACHINE', parentOperationId: 'ROD-OP', machineId: 'EC-125', source: 'manual-transport-chain' },
  { type: 'MIN_START', parentOperationId: 'ROD-OP', date: '2026-07-21', time: '07:00', source: 'manual-transport' }
];
const rodTransport = reoptimizePlanningFuture({
  baseline: {
    ...baseline([{ ...operation('ROD-OP', 'ROD', 0), machineId: 'EC-125', machineName: 'EC-125' }]),
    materials: [{ id: 'ROD', name: 'ROD' }],
    machines: rodMachines,
    productivityMatrix: rodMatrix
  },
  acceptedDraft: rodDraft,
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: { dailyTeamOverrides: {}, manualWorkDates: [] },
  productivityMatrix: rodMatrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(rodTransport.accepted, false, 'maquina fixada sem linha de matriz nao pode ser aceita por fallback do card');
assert.equal(rodTransport.diagnostics.errors[0].code, 'PINNED_ALLOCATION_BECAME_INFEASIBLE');

const rodCompatibleMatrix = rodMatrix.concat([
  { material_id: 'ROD', material_code: 'ROD', machine_id: 'EC-125', machine_name: 'EC-125', people_count: 1, output_qty: 900, output_unit: 'kg', time_seconds: 28800, active: true }
]);
const rodCompatibleTransport = reoptimizePlanningFuture({
  baseline: {
    ...baseline([{ ...operation('ROD-OP', 'ROD', 0), machineId: 'EC-125', machineName: 'EC-125' }]),
    materials: [{ id: 'ROD', name: 'ROD' }],
    machines: rodMachines,
    productivityMatrix: rodCompatibleMatrix
  },
  acceptedDraft: rodDraft,
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: { dailyTeamOverrides: {}, manualWorkDates: [] },
  productivityMatrix: rodCompatibleMatrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(rodCompatibleTransport.accepted, true, JSON.stringify(rodCompatibleTransport.diagnostics.errors));
assert.ok(rodCompatibleTransport.allocations.every(item => item.machineId === 'EC-125'), 'transporte deve manter a maquina quando ela existe na matriz');
assert.ok(rodCompatibleTransport.allocations.every(item => item.date >= '2026-07-21'));

// 5 — memberships e etapas de um card compartilhado sobrevivem à reconstrução.
// Matriz da tela cadastral usa nome/codigo; transporte pode vir pinado pelo ID interno da maquina.
const longitudinal42Allocation = {
  ...allocation({
    allocationId: 'LONG42-1',
    parentOperationId: 'LONG42-OP',
    materialId: 'material-72',
    machineId: 'machine-aco8-id',
    quantity: 4629,
    peopleCount: 1,
    maxDailyCapacity: 4629
  }),
  materialCode: '',
  materialCodes: ['00808700072'],
  materialName: '4,2 Longitudinal - 6m',
  machineName: 'Aço-8',
  unit: 'un'
};
const longitudinal42Draft = createManualScheduleDraft({
  allocations: [longitudinal42Allocation],
  machines: [{ machineId: 'machine-aco8-id', machineName: 'Aço-8' }]
});
longitudinal42Draft.constraints = [
  {
    type: 'PIN_MACHINE',
    parentOperationId: 'LONG42-OP',
    machineId: 'machine-aco8-id',
    machineName: 'Aço-8',
    source: 'manual-transport-chain'
  },
  { type: 'MIN_START', parentOperationId: 'LONG42-OP', date: '2026-07-21', time: '07:00', source: 'manual-transport' }
];
const longitudinal42Matrix = [
  { id: 'long42-aco8', material_code: '00808700072', material_codes: ['00808700072'], material_name: '4,2 Longitudinal - 6m', machine_name: 'Aço-8', machine_priority: 1, people_count: 1, output_qty: 4629, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'long42-focus', material_code: '00808700072', material_codes: ['00808700072'], material_name: '4,2 Longitudinal - 6m', machine_name: 'Focus-8', machine_priority: 2, people_count: 1, output_qty: 4629, output_unit: 'un', time_seconds: 86400, active: true }
];
const longitudinal42Transport = reoptimizePlanningFuture({
  baseline: {
    ...baseline([{
      ...operation('LONG42-OP', 'material-72', 0),
      materialCode: '',
      materialCodes: ['00808700072'],
      materialName: '4,2 Longitudinal - 6m',
      machineId: 'machine-aco8-id',
      machineName: 'Aço-8',
      peopleCount: 1,
      unit: 'un'
    }]),
    materials: [{ id: 'material-72', name: '4,2 Longitudinal - 6m', codes: ['00808700072'], primary_unit: 'un' }],
    machines: [{ machineId: 'machine-aco8-id', machineName: 'Aço-8' }],
    productivityMatrix: longitudinal42Matrix
  },
  acceptedDraft: longitudinal42Draft,
  cutoff: { date: monday, time: '00:00' },
  constraintChanges: { dailyTeamOverrides: {}, manualWorkDates: [], scopeParentOperationIds: ['LONG42-OP'] },
  productivityMatrix: longitudinal42Matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(longitudinal42Transport.accepted, true, JSON.stringify(longitudinal42Transport.diagnostics.errors));
assert.ok(longitudinal42Transport.allocations.every(item => item.machineName === 'Aço-8'), 'pin por ID interno deve casar com a linha Aço-8 da matriz');

const wrongMaterialMatrix = [
  { material_id: '40', material_code: '00808700093', material_codes: ['00808700093'], material_name: 'CA60 4,2 Bobina', machine_name: 'MT-100', people_count: 1, output_qty: 220, output_unit: 'un', time_seconds: 86400, active: true }
];
const reto42Draft = createManualScheduleDraft({
  allocations: [{
    ...allocation({ allocationId: 'RETO42-1', parentOperationId: 'RETO42-OP', materialId: '40', machineId: 'MT-100', quantity: 220, peopleCount: 1 }),
    materialCode: '00808700091',
    materialCodes: ['00808700091'],
    materialName: '4,2 Reto - 12m',
    machineName: 'MT-100',
    unit: 'un'
  }],
  machines: [{ machineId: 'MT-100', machineName: 'MT-100' }]
});
const reto42Work = buildRemainingWorkItems({
  acceptedDraft: reto42Draft,
  cutoff: { date: monday, time: '00:00' },
  productivityMatrix: wrongMaterialMatrix,
  baseline: {
    ...baseline([{
      ...operation('RETO42-OP', '40', 0),
      materialCode: '00808700091',
      materialCodes: ['00808700091'],
      materialName: '4,2 Reto - 12m',
      machineName: 'MT-100',
      peopleCount: 1,
      unit: 'un'
    }]),
    machines: [{ machineId: 'MT-100', machineName: 'MT-100' }],
    productivityMatrix: wrongMaterialMatrix
  }
});
assert.equal(reto42Work.workItems[0].allowedConfigurations.length, 0, 'reotimizador nao deve aceitar matriz de CA60 bobina para 4,2 Reto - 12m');

const reto42CorrectMatrixWithCollidingMaterialId = [
  ...wrongMaterialMatrix,
  { id: 'reto42-aco8', material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Aço-8', machine_priority: 1, people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680, active: true },
  { id: 'reto42-focus8', material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Focus-8', machine_priority: 2, people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680, active: true }
];
const reto42WorkWithCollision = buildRemainingWorkItems({
  acceptedDraft: reto42Draft,
  cutoff: { date: monday, time: '00:00' },
  productivityMatrix: reto42CorrectMatrixWithCollidingMaterialId,
  baseline: {
    ...baseline([{
      ...operation('RETO42-OP', '40', 0),
      materialCode: '00808700093',
      materialCodes: ['00808700093'],
      materialName: 'CA60 4,2 Bobina',
      machineName: 'MT-100',
      peopleCount: 1,
      unit: 'un'
    }]),
    machines: [
      { machineId: 'Aço-8', machineName: 'Aço-8' },
      { machineId: 'Focus-8', machineName: 'Focus-8' },
      { machineId: 'MT-100', machineName: 'MT-100' }
    ],
    productivityMatrix: reto42CorrectMatrixWithCollidingMaterialId
  }
});
assert.deepEqual(
  reto42WorkWithCollision.workItems[0].allowedConfigurations.map(item => item.machineName).sort(),
  ['Aço-8', 'Focus-8'],
  'reotimizador deve voltar para codigo/nome correto quando material_id colide com outra matriz'
);

const sharedMemberships = [
  { productionId: 'production-1', productionIndex: 0, productionStage: 1 },
  { productionId: 'production-2', productionIndex: 1, productionStage: 3 }
];
const sharedDraft = createManualScheduleDraft({ allocations: [allocation({ memberships: sharedMemberships })], machines });
const shared = optimize(sharedDraft, { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [] });
assert.equal(shared.accepted, true, JSON.stringify(shared.diagnostics.errors));
assert.ok(shared.allocations.every(item => item.productionMemberships.length === 2));
assert.deepEqual(shared.allocations[0].productionMemberships.map(item => item.productionStage), [1, 3]);

// 6 e 7 — liberar sábado antecipa; remover redistribui para o próximo dia útil.
const saturday = '2026-07-18';
const saturdayEnabled = optimize(initial, { dailyTeamOverrides: {}, manualWorkDates: [saturday] }, baseline(), { date: saturday, time: '00:00' });
assert.equal(saturdayEnabled.accepted, true, JSON.stringify(saturdayEnabled.diagnostics.errors));
assert.equal(saturdayEnabled.allocations[0].date, saturday);
const persistedSaturday = serializeManualScheduleDraft({
  draft: saturdayEnabled.manualScheduleDraft,
  settings: { manualWorkDates: [saturday], dailyTeamOverrides: {} },
  baseSimulation: baseline()
});
const reopenedSaturday = normalizePersistedManualScheduleDraft(persistedSaturday);
assert.deepEqual(reopenedSaturday.draft.manualWorkDates, [saturday]);
assert.equal(buildProductionCalendarDayPresentation({
  day: { date: saturday }, shifts, manualWorkDates: reopenedSaturday.draft.manualWorkDates
}).isNonWorkingDay, false, 'sábado salvo e reaberto deve permanecer sem hachura');
const saturdayRemoved = optimize(saturdayEnabled.manualScheduleDraft, { dailyTeamOverrides: {}, manualWorkDates: [] }, baseline(), { date: saturday, time: '00:00' });
assert.equal(saturdayRemoved.accepted, true, JSON.stringify(saturdayRemoved.diagnostics.errors));
assert.equal(saturdayRemoved.allocations.some(item => item.date === saturday), false);
assert.equal(saturdayRemoved.allocations[0].date, monday);
const persistedSaturdayRemoval = serializeManualScheduleDraft({
  draft: saturdayRemoved.manualScheduleDraft,
  settings: { manualWorkDates: [], dailyTeamOverrides: {} },
  baseSimulation: baseline()
});
const reopenedSaturdayRemoval = normalizePersistedManualScheduleDraft(persistedSaturdayRemoval);
assert.deepEqual(reopenedSaturdayRemoval.draft.manualWorkDates, []);
assert.equal(buildProductionCalendarDayPresentation({
  day: { date: saturday }, shifts, manualWorkDates: reopenedSaturdayRemoval.draft.manualWorkDates
}).isNonWorkingDay, true, 'sábado bloqueado e reaberto deve recuperar a hachura');

// 8 — diagnóstico antigo não participa do aceite do candidato novo.
const independenceDay = '2026-09-07';
const holidayDraft = createManualScheduleDraft({
  allocations: [allocation({ allocationId: 'HOLIDAY-A', date: independenceDay })],
  machines
});
const holidaySkipped = optimize(holidayDraft, { dailyTeamOverrides: {}, manualWorkDates: [] }, baseline(), { date: independenceDay, time: '00:00' });
assert.equal(holidaySkipped.accepted, true, JSON.stringify(holidaySkipped.diagnostics.errors));
assert.equal(holidaySkipped.allocations.some(item => item.date === independenceDay), false);
assert.equal(holidaySkipped.allocations[0].date, '2026-09-08');
const holidayReleased = optimize(holidayDraft, { dailyTeamOverrides: {}, manualWorkDates: [independenceDay] }, baseline(), { date: independenceDay, time: '00:00' });
assert.equal(holidayReleased.accepted, true, JSON.stringify(holidayReleased.diagnostics.errors));
assert.equal(holidayReleased.allocations[0].date, independenceDay);

const staleIssueDraft = { ...initial, validation: { valid: false, errors: [{ code: 'OLD_ERROR', blocking: true }] } };
const staleIssueResult = optimize(staleIssueDraft, { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [] });
assert.equal(staleIssueResult.accepted, true, JSON.stringify(staleIssueResult.diagnostics.errors));
assert.equal(staleIssueResult.diagnostics.errors.some(item => item.code === 'OLD_ERROR'), false);

// 9 — contrato v2 reabre com estado do scheduler e identidade, pronto para nova alteração.
const persisted = serializeManualScheduleDraft({ draft: reduced.manualScheduleDraft, baseSimulation: baseline(), now: new Date('2026-07-16T13:00:00Z') });
const reopened = normalizePersistedManualScheduleDraft(persisted);
assert.equal(reopened.status, 'ok');
assert.equal(reopened.draft.version, 2);
assert.ok(reopened.draft.schedulerState.workItems.length > 0);
assert.deepEqual(reopened.draft.identityMap, reduced.identityMap);
const secondChange = optimize(reopened.draft, { dailyTeamOverrides: { [monday]: { day: 5 } }, manualWorkDates: [] });
assert.equal(secondChange.accepted, true, JSON.stringify(secondChange.diagnostics.errors));
assert.equal(new Set(secondChange.allocations.map(item => item.allocationId)).size, secondChange.allocations.length);

// 10 — passado permanece byte a byte.
const pastAllocation = allocation({ allocationId: 'PAST', date: '2026-07-17', quantity: 20, startTime: '07:00', endTime: '09:00' });
const futureAllocation = allocation({ allocationId: 'FUTURE', quantity: 80 });
const withPast = createManualScheduleDraft({ allocations: [pastAllocation, futureAllocation], machines });
const pastSnapshot = JSON.stringify(withPast.allocations.find(item => item.allocationId === 'PAST'));
const pastPreserved = optimize(withPast, { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [] });
assert.equal(pastPreserved.accepted, true, JSON.stringify(pastPreserved.diagnostics.errors));
assert.equal(JSON.stringify(pastPreserved.allocations.find(item => item.allocationId === 'PAST')), pastSnapshot);

// 11 — sem configuração compatível, há diagnóstico específico e rollback integral.
const impossibleMatrix = [{ ...matrix[0], people_count: 7 }];
const impossible = optimize(initial, { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [] }, baseline(), { date: monday, time: '00:00' }, impossibleMatrix);
assert.equal(impossible.accepted, false);
assert.equal(impossible.diagnostics.errors[0].code, 'NO_PRODUCTIVITY_CONFIGURATION_FOR_CAPACITY');
assert.deepEqual(impossible.manualScheduleDraft, initial);

// 12 — alterações sucessivas são determinísticas, conservam quantidade e não duplicam IDs.
let successive = reduced;
successive = optimize(successive.manualScheduleDraft, { dailyTeamOverrides: { [monday]: { day: 4 } }, manualWorkDates: [saturday] }, baseline(), { date: saturday, time: '00:00' });
successive = optimize(successive.manualScheduleDraft, { dailyTeamOverrides: { [monday]: { day: 5 } }, manualWorkDates: [saturday] }, baseline(), { date: monday, time: '00:00' });
successive = optimize(successive.manualScheduleDraft, { dailyTeamOverrides: { [monday]: { day: 5 } }, manualWorkDates: [] }, baseline(), { date: saturday, time: '00:00' });
assert.equal(successive.accepted, true, JSON.stringify(successive.diagnostics.errors));
assert.equal(successive.allocations.reduce((sum, item) => sum + item.quantity, 0), 100);
assert.equal(new Set(successive.allocations.map(item => item.allocationId)).size, successive.allocations.length);
const repeated = optimize(successive.manualScheduleDraft, { dailyTeamOverrides: { [monday]: { day: 5 } }, manualWorkDates: [] }, baseline(), { date: saturday, time: '00:00' });
assert.deepEqual(repeated.allocations, successive.allocations);

console.log('planningReoptimization.service.test.js: ok');
