import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createManualScheduleDraft, validateManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import { applyManualScheduleTransaction } from '../services/manualScheduleTransaction.service.js';
import {
  buildPlanningOperationResourcePreview,
  buildPlanningProductionConfigurationEditCommand,
  getPlanningOperationResourceOptions,
  reoptimizePlanningFuture,
  selectPlanningEditorProductivityRows
} from '../services/planningReoptimization.service.js';
import { resolveCanonicalProductivityConfiguration } from '../services/productivityMatrixResolution.service.js';

const date = '2026-07-20';
const material = {
  id: 'material-eq45',
  code: '00808500036',
  codes: ['00808500036', '00808500037'],
  name: 'EQ-45 (3,0x2,0)',
  primary_unit: 'un'
};
const machine = { machineId: 'machine-mt200', machineName: 'MT-200' };
const matrix = [
  { id: 'eq45-3', material_codes: material.codes, material_name: material.name, machine_name: 'MT-200', machine_priority: 1, people_count: 3, output_qty: 960, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'eq45-2', material_codes: material.codes, material_name: material.name, machine_name: 'MT-200', machine_priority: 2, people_count: 2, output_qty: 689, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'eq45-1', material_codes: material.codes, material_name: material.name, machine_name: 'MT-200', machine_priority: 3, people_count: 1, output_qty: 434, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'long-ec125', material_code: 'LONG-34', material_name: '3,4 Longitudinal - 3m', machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 8490, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'long-ec60', material_code: 'LONG-34', material_name: '3,4 Longitudinal - 3m', machine_name: 'EC-60', machine_priority: 2, people_count: 2, output_qty: 7000, output_unit: 'un', time_seconds: 86400, active: true }
];
const allocation = {
  allocationId: 'allocation-eq45', parentOperationId: 'operation-eq45', operationId: 'operation-eq45',
  productionId: 'production-1', productionIndex: 0,
  materialId: material.id,
  // Reproduz o contrato incompleto real: a allocation usa o código secundário e não carrega materialCodes.
  materialCode: '00808500037', materialName: material.name,
  machineId: machine.machineId, machineName: machine.machineName,
  date, startTime: '07:00', endTime: '15:00', quantity: 100, unit: 'un',
  durationMinutes: 480, peopleCount: 3, capacityPercent: 10.42, maxDailyCapacity: 960,
  source: 'automatic', pinned: false,
  sourceAllocationIds: ['allocation-eq45'], sourceParentOperationIds: ['operation-eq45'],
  components: [{ allocationId: 'allocation-eq45', parentOperationId: 'operation-eq45', productionId: 'production-1', quantity: 100 }]
};
const shifts = [{ shiftId: 'day', label: 'Turno 1', startTime: '07:00', endTime: '15:00', teamAvailable: 6 }];
const baseline = {
  // A operação também não carrega códigos: somente o comando canônico pode restaurar o contexto.
  operations: [{
    operationId: 'operation-eq45', materialId: material.id, materialName: material.name,
    machineId: machine.machineId, machineName: machine.machineName, peopleCount: 3,
    produceQty: 100, unit: 'un', productionOrder: 0,
    startDate: date, startTime: '07:00', endDate: date, endTime: '15:00'
  }],
  materials: [material], machines: [machine], productivityMatrix: matrix,
  dependencies: [], transports: [], shifts, holidays: [], timezone: 'America/Sao_Paulo',
  stock: [], stockMinimums: [], stockLocations: [], setupMinutes: 0,
  minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60
};
const draft = createManualScheduleDraft({ allocations: [allocation], machines: [machine], now: new Date('2026-07-17T12:00:00Z') });

const editorRows = selectPlanningEditorProductivityRows({ material, productivityMatrix: matrix });
const editorMachines = getPlanningOperationResourceOptions({ productivityRows: editorRows, machines: [machine], material });
const editorMachine = editorMachines[0];
assert.deepEqual(editorMachine.peopleCounts, [1, 2, 3]);

const previews = [3, 2, 1].map(peopleCount => buildPlanningOperationResourcePreview({
  allocation, machine: editorMachine, peopleCount, dailyMinutes: 480
}));
assert.deepEqual(previews.map(preview => preview.capacityPerDay), [960, 689, 434]);
const preview = previews[1];
assert.equal(preview.productivityConfiguration.priority, 2);
assert.equal(preview.productivityConfiguration.productivityLineId, 'eq45-2');

const command = buildPlanningProductionConfigurationEditCommand({
  allocation,
  parentOperationId: allocation.parentOperationId,
  machine: editorMachine,
  peopleCount: 2,
  productivityConfiguration: preview.productivityConfiguration,
  cutoff: { date, time: '00:00' }
});
assert.deepEqual(command.materialIdentity, {
  id: material.id, code: material.code, codes: material.codes, name: material.name
});
assert.deepEqual(command.requestedConfiguration, {
  machineId: machine.machineId, machineName: machine.machineName, people: 2, productivityLineId: 'eq45-2'
});
const previewIdentity = {
  materialId: preview.productivityConfiguration.materialId,
  materialCodes: preview.productivityConfiguration.materialCodes,
  machineId: preview.productivityConfiguration.machineId,
  people: preview.productivityConfiguration.people,
  productivityLineId: preview.productivityConfiguration.productivityLineId
};
const submitConfiguration = resolveCanonicalProductivityConfiguration({
  material: command.materialIdentity,
  reference: command.materialIdentity,
  productivityMatrix: matrix,
  machines: [machine],
  machineId: command.requestedConfiguration.machineId,
  machineName: command.requestedConfiguration.machineName,
  peopleCount: command.requestedConfiguration.people,
  productivityLineId: command.requestedConfiguration.productivityLineId,
  unit: 'un'
});
assert.deepEqual(previewIdentity, {
  materialId: submitConfiguration.materialId,
  materialCodes: submitConfiguration.materialCodes,
  machineId: submitConfiguration.machineId,
  people: submitConfiguration.people,
  productivityLineId: submitConfiguration.productivityLineId
});

const recalculated = reoptimizePlanningFuture({
  baseline, acceptedDraft: draft, cutoff: command.cutoff,
  constraintChanges: { operationResourceEdits: [command], now: '2026-07-17T13:00:00Z' },
  productivityMatrix: matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(recalculated.accepted, true, JSON.stringify(recalculated.diagnostics?.errors));
assert.ok(recalculated.allocations.every(item => item.peopleCount === 2));
assert.ok(recalculated.allocations.every(item => item.productivity.outputQty === 689));
assert.ok(recalculated.allocations.every(item => item.materialCodes.includes('00808500037')));

const validationContext = {
  ...baseline, dailyTeamOverrides: {}, manualWorkDates: []
};
const transaction = applyManualScheduleTransaction({
  currentDraft: draft,
  intent: {
    ...command,
    cutoffDate: date,
    cutoffSnapshot: recalculated.cutoffSnapshot,
    previousDiagnostics: recalculated.previousDiagnostics,
    diagnosticDelta: recalculated.diagnosticDelta,
    candidateAllocations: recalculated.allocations,
    candidateDraft: recalculated.manualScheduleDraft
  },
  draftContext: { validatedAt: '2026-07-17T13:00:00Z' },
  validationContext
});
assert.equal(transaction.accepted, true, JSON.stringify(transaction.blockingIssues));
assert.ok(transaction.draft.allocations.every(item => item.peopleCount === 2));
assert.ok(transaction.draft.allocations.every(item => item.productivity.outputQty === 689));
assert.equal(transaction.blockingIssues.some(issue => issue.code === 'PRODUCTIVITY_NOT_FOUND'), false);

// A validação estrutural não deve revalidar globalmente a Matriz. A configuração
// editada já foi validada canonicamente; allocations legadas não relacionadas
// podem não carregar identidade material suficiente para uma nova resolução.
const unrelatedLegacyAllocation = {
  ...allocation,
  allocationId: 'allocation-legacy',
  parentOperationId: 'operation-legacy',
  operationId: 'operation-legacy',
  productionId: 'production-legacy',
  materialId: 'material-legacy',
  materialCode: '',
  materialName: 'Material legado sem identidade da Matriz',
  date: '2026-07-17',
  sourceAllocationIds: ['allocation-legacy'],
  sourceParentOperationIds: ['operation-legacy'],
  components: [{ allocationId: 'allocation-legacy', parentOperationId: 'operation-legacy', productionId: 'production-legacy', quantity: 100 }]
};
assert.deepEqual(validateManualScheduleDraft({ allocations: [allocation, unrelatedLegacyAllocation] }, {
  machines: [machine],
  matrixRows: matrix
}), { valid: true, errors: [] });

const draftWithLegacyAllocation = createManualScheduleDraft({
  allocations: [allocation, unrelatedLegacyAllocation],
  machines: [machine],
  now: new Date('2026-07-17T12:00:00Z')
});
const normalizedLegacyAllocation = draftWithLegacyAllocation.allocations.find(item => item.allocationId === 'allocation-legacy');
const submitWithUnrelatedLegacyAllocation = applyManualScheduleTransaction({
  currentDraft: draftWithLegacyAllocation,
  intent: {
    ...command,
    cutoffDate: date,
    cutoffSnapshot: recalculated.cutoffSnapshot,
    previousDiagnostics: recalculated.previousDiagnostics,
    diagnosticDelta: recalculated.diagnosticDelta,
    candidateAllocations: [...recalculated.allocations, normalizedLegacyAllocation],
    candidateDraft: {
      ...recalculated.manualScheduleDraft,
      allocations: [...recalculated.allocations, normalizedLegacyAllocation]
    }
  },
  draftContext: { validatedAt: '2026-07-17T13:00:00Z' },
  validationContext
});
assert.equal(submitWithUnrelatedLegacyAllocation.accepted, true, JSON.stringify(submitWithUnrelatedLegacyAllocation.blockingIssues));
assert.ok(submitWithUnrelatedLegacyAllocation.draft.allocations.some(item => item.peopleCount === 2 && item.productivity?.outputQty === 689));
assert.ok(submitWithUnrelatedLegacyAllocation.draft.allocations.some(item => item.allocationId === 'allocation-legacy'));

for (const requestedConfiguration of [
  { machineId: 'machine-unknown', machineName: 'INCOMPATIVEL', people: 2, productivityLineId: 'missing-machine' },
  { machineId: machine.machineId, machineName: machine.machineName, people: 9, productivityLineId: 'missing-people' }
]) {
  const incompatible = applyManualScheduleTransaction({
    currentDraft: draft,
    intent: {
      ...command,
      requestedConfiguration,
      candidateAllocations: recalculated.allocations,
      candidateDraft: recalculated.manualScheduleDraft
    },
    draftContext: { validatedAt: '2026-07-17T13:00:00Z' },
    validationContext
  });
  assert.equal(incompatible.accepted, false);
  assert.equal(incompatible.blockingIssues[0].code, 'PRODUCTIVITY_NOT_FOUND');
  assert.deepEqual(incompatible.blockingIssues[0].allocationIds, ['allocation-eq45']);
  assert.deepEqual(incompatible.blockingIssues[0].parentOperationIds, ['operation-eq45']);
  assert.deepEqual(incompatible.blockingIssues[0].materialIds, ['material-eq45']);
  assert.deepEqual(incompatible.blockingIssues[0].machineIds, [requestedConfiguration.machineId]);
  assert.equal(incompatible.blockingIssues[0].details.people, requestedConfiguration.people);
}

const longitudinal = { id: 'long-34', code: 'LONG-34', codes: ['LONG-34'], name: '3,4 Longitudinal - 3m' };
const longitudinalRows = selectPlanningEditorProductivityRows({ material: longitudinal, productivityMatrix: matrix });
assert.deepEqual(getPlanningOperationResourceOptions({ productivityRows: longitudinalRows, material: longitudinal }).map(item => item.machineName), ['EC-125', 'EC-60']);

const transversal = {
  id: 'transversal-34-2m', code: 'TRANS-34-2M', codes: ['TRANS-34-2M'],
  name: '3,4 Transversal - 2m', primary_unit: 'un'
};
const transversalMatrix = [
  {
    id: 'trans-line-1', material_name: transversal.name, material_code: 'TRANS-34-2M',
    material_codes: ['TRANS-34-2M'], machine_name: 'MT-100', machine_priority: 1,
    people_count: 2, output_qty: 1200, output_unit: 'un', time_seconds: 86400, active: true
  },
  {
    id: 'trans-line-2', material_name: transversal.name, material_code: 'TRANS-34-2M',
    material_codes: ['TRANS-34-2M'], machine_name: 'MT-200', machine_priority: 2,
    people_count: 3, output_qty: 1800, output_unit: 'un', time_seconds: 86400, active: true
  },
  {
    id: 'focus-machine-id', material_name: 'Material Focus', material_code: 'FOCUS-MATERIAL',
    material_codes: ['FOCUS-MATERIAL', 'TRANS-34-2M'], machine_name: 'Focus-8', machine_priority: 1,
    people_count: 1, output_qty: 9000, output_unit: 'un', time_seconds: 86400, active: true
  }
];
const transversalRows = selectPlanningEditorProductivityRows({
  material: transversal,
  productivityMatrix: transversalMatrix
});
assert.deepEqual(transversalRows.map(row => row.id), ['trans-line-1', 'trans-line-2']);
assert.equal(transversalRows.some(row => row.machine_name === 'Focus-8'), false);
const transversalOptions = getPlanningOperationResourceOptions({
  productivityRows: transversalRows,
  machines: [
    { machineId: 'trans-line-1', machineName: 'Focus-8' },
    { machineId: 'mt-100', machineName: 'MT-100' },
    { machineId: 'mt-200', machineName: 'MT-200' }
  ],
  material: transversal
});
assert.deepEqual(transversalOptions.map(option => option.machineName), ['MT-100', 'MT-200']);
assert.deepEqual(transversalOptions.map(option => option.machineId), ['mt-100', 'mt-200']);
assert.deepEqual(selectPlanningEditorProductivityRows({
  material: { id: 'focus-material', codes: ['FOCUS-MATERIAL', 'TRANS-34-2M'], name: 'Material Focus' },
  productivityMatrix: transversalMatrix
}).map(row => row.id), ['focus-machine-id'], 'o código relacionado também não deve vazar no sentido inverso');
assert.equal(buildPlanningOperationResourcePreview({
  allocation: { ...allocation, materialId: transversal.id, materialName: transversal.name, quantity: 600 },
  machine: transversalOptions[1],
  peopleCount: 3,
  dailyMinutes: 480
}).capacityPerDay, 1800);

const q61 = {
  id: 'q61-material', code: '00808500038', codes: ['00808500038', '00808500039'],
  name: 'Q-61 (3,0x2,0)', primary_unit: 'un'
};
const q61Machine = { machineId: 'mt-150', machineName: 'MT-150' };
const q61Matrix = [
  { id: 'q61-3', material_name: q61.name, material_code: '00808500038', material_codes: q61.codes, machine_name: 'MT-150', machine_priority: 1, people_count: 3, output_qty: 720, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'q61-2', material_name: q61.name, material_code: '00808500038', material_codes: q61.codes, machine_name: 'MT-150', machine_priority: 2, people_count: 2, output_qty: 511, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'q61-1', material_name: q61.name, material_code: '00808500038', material_codes: q61.codes, machine_name: 'MT-150', machine_priority: 3, people_count: 1, output_qty: 327, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 'q61-mt100-1', material_name: q61.name, material_code: '00808500038', material_codes: q61.codes, machine_name: 'MT-100', machine_priority: 4, people_count: 1, output_qty: 81, output_unit: 'un', time_seconds: 86400, active: true }
];
const q61Allocation = {
  allocationId: 'allocation-q61', parentOperationId: 'operation-q61', operationId: 'operation-q61',
  productionId: 'production-q61', productionIndex: 1,
  materialId: q61.id, materialCode: '00808500038', materialName: q61.name,
  machineId: q61Machine.machineId, machineName: q61Machine.machineName,
  date, startTime: '13:21', endTime: '15:48', quantity: 200.455, unit: 'un',
  durationMinutes: 147, peopleCount: 3, capacityPercent: 27.84, maxDailyCapacity: 720,
  source: 'automatic', pinned: false,
  sourceAllocationIds: ['allocation-q61'], sourceParentOperationIds: ['operation-q61'],
  components: [{ allocationId: 'allocation-q61', parentOperationId: 'operation-q61', productionId: 'production-q61', quantity: 200.455 }]
};
const q61Rows = selectPlanningEditorProductivityRows({ material: q61Allocation, productivityMatrix: q61Matrix });
const q61Options = getPlanningOperationResourceOptions({ productivityRows: q61Rows, machines: [q61Machine], material: q61 });
const q61Mt150Option = q61Options.find(option => option.machineName === 'MT-150');
assert.deepEqual(q61Mt150Option.peopleCounts, [1, 2, 3]);
const q61Preview = buildPlanningOperationResourcePreview({
  allocation: q61Allocation,
  machine: q61Mt150Option,
  peopleCount: 2,
  dailyMinutes: 480
});
assert.equal(q61Preview.capacityPerDay, 511);
const q61Command = buildPlanningProductionConfigurationEditCommand({
  allocation: q61Allocation,
  parentOperationId: q61Allocation.parentOperationId,
  machine: q61Mt150Option,
  peopleCount: 2,
  productivityConfiguration: q61Preview.productivityConfiguration,
  cutoff: { date: q61Allocation.date, time: q61Allocation.startTime }
});
const q61Draft = createManualScheduleDraft({ allocations: [q61Allocation], machines: [q61Machine], now: new Date('2026-07-17T12:00:00Z') });
const q61Recalculated = reoptimizePlanningFuture({
  baseline: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61Allocation.date,
      startTime: q61Allocation.startTime,
      endDate: q61Allocation.date,
      endTime: q61Allocation.endTime
    }],
    materials: [q61], machines: [q61Machine], productivityMatrix: q61Matrix,
    dependencies: [], transports: [], shifts, holidays: [], timezone: 'America/Sao_Paulo',
    stock: [], stockMinimums: [], stockLocations: [], setupMinutes: 0,
    minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60
  },
  acceptedDraft: q61Draft,
  cutoff: q61Command.cutoff,
  constraintChanges: { operationResourceEdits: [q61Command], now: '2026-07-17T13:00:00Z' },
  productivityMatrix: q61Matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(q61Recalculated.accepted, true, JSON.stringify(q61Recalculated.diagnostics?.errors));
assert.ok(q61Recalculated.allocations.every(item => item.machineName === 'MT-150'));
assert.equal(q61Recalculated.allocations.find(item => item.date === q61Allocation.date).peopleCount, 2);
assert.equal(q61Recalculated.allocations.find(item => item.date === q61Allocation.date).productivity.outputQty, 511);
assert.equal(q61Recalculated.allocations.find(item => item.date === q61Allocation.date).maxDailyCapacity, 511);
const q61MatrixWithoutStableLineIds = q61Matrix.map(({ id, ...row }) => row);
const q61RecalculatedFromCanonicalCommand = reoptimizePlanningFuture({
  baseline: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61Allocation.date,
      startTime: q61Allocation.startTime,
      endDate: q61Allocation.date,
      endTime: q61Allocation.endTime
    }],
    materials: [q61], machines: [q61Machine], productivityMatrix: q61MatrixWithoutStableLineIds,
    dependencies: [], transports: [], shifts, holidays: [], timezone: 'America/Sao_Paulo',
    stock: [], stockMinimums: [], stockLocations: [], setupMinutes: 0,
    minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60
  },
  acceptedDraft: q61Draft,
  cutoff: q61Command.cutoff,
  constraintChanges: { operationResourceEdits: [q61Command], now: '2026-07-17T13:00:00Z' },
  productivityMatrix: q61MatrixWithoutStableLineIds,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(q61RecalculatedFromCanonicalCommand.accepted, true, JSON.stringify(q61RecalculatedFromCanonicalCommand.diagnostics?.errors));
assert.ok(q61RecalculatedFromCanonicalCommand.allocations.every(item => item.machineName === 'MT-150'));
assert.equal(q61RecalculatedFromCanonicalCommand.allocations.find(item => item.date === q61Allocation.date).peopleCount, 2);
assert.equal(q61RecalculatedFromCanonicalCommand.allocations.find(item => item.date === q61Allocation.date).productivity.outputQty, 511);
const q61Transaction = applyManualScheduleTransaction({
  currentDraft: q61Draft,
  intent: {
    ...q61Command,
    cutoffDate: q61Command.cutoff.date,
    cutoffSnapshot: q61Recalculated.cutoffSnapshot,
    previousDiagnostics: q61Recalculated.previousDiagnostics,
    diagnosticDelta: q61Recalculated.diagnosticDelta,
    candidateAllocations: q61Recalculated.allocations,
    candidateDraft: q61Recalculated.manualScheduleDraft
  },
  draftContext: { validatedAt: '2026-07-17T13:00:00Z' },
  validationContext: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61Allocation.date,
      startTime: q61Allocation.startTime,
      endDate: q61Allocation.date,
      endTime: q61Allocation.endTime
    }],
    materials: [q61],
    machines: [q61Machine],
    productivityMatrix: q61Matrix.filter(row => row.id !== 'q61-2'),
    dependencies: [],
    transports: [],
    shifts,
    holidays: [],
    timezone: 'America/Sao_Paulo',
    stock: [],
    stockMinimums: [],
    stockLocations: [],
    setupMinutes: 0,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60,
    dailyTeamOverrides: {},
    manualWorkDates: []
  }
});
assert.equal(q61Transaction.accepted, true, JSON.stringify(q61Transaction.blockingIssues));
assert.equal(q61Transaction.draft.allocations.find(item => item.date === q61Allocation.date).peopleCount, 2);
assert.equal(q61Transaction.draft.allocations.find(item => item.date === q61Allocation.date).productivity.outputQty, 511);

const q61SpillAllocation = {
  ...q61Allocation,
  date: '2026-07-22',
  startTime: '13:21',
  endTime: '15:48'
};
const q61SpillPreview = buildPlanningOperationResourcePreview({
  allocation: q61SpillAllocation,
  machine: q61Mt150Option,
  peopleCount: 2,
  dailyMinutes: 480
});
const q61SpillCommand = buildPlanningProductionConfigurationEditCommand({
  allocation: q61SpillAllocation,
  parentOperationId: q61SpillAllocation.parentOperationId,
  machine: q61Mt150Option,
  peopleCount: 2,
  productivityConfiguration: q61SpillPreview.productivityConfiguration,
  cutoff: { date: q61SpillAllocation.date, time: q61SpillAllocation.startTime }
});
const q61SecondAllocation = {
  ...q61Allocation,
  allocationId: 'allocation-q61-second',
  date: '2026-07-23',
  startTime: '07:00',
  endTime: '10:40',
  quantity: 299.545,
  durationMinutes: 220,
  capacityPercent: 41.6,
  sourceAllocationIds: ['allocation-q61-second'],
  components: [{ allocationId: 'allocation-q61-second', parentOperationId: 'operation-q61', productionId: 'production-q61', quantity: 299.545 }]
};
const q61TwoCardDraft = createManualScheduleDraft({
  allocations: [q61SpillAllocation, q61SecondAllocation],
  machines: [q61Machine],
  now: new Date('2026-07-17T12:00:00Z')
});
const q61TwoCardRecalculated = reoptimizePlanningFuture({
  baseline: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity + q61SecondAllocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61SpillAllocation.date,
      startTime: q61SpillAllocation.startTime,
      endDate: q61SecondAllocation.date,
      endTime: q61SecondAllocation.endTime
    }],
    materials: [q61], machines: [q61Machine], productivityMatrix: q61Matrix,
    dependencies: [], transports: [], shifts, holidays: [], timezone: 'America/Sao_Paulo',
    stock: [], stockMinimums: [], stockLocations: [], setupMinutes: 0,
    minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60
  },
  acceptedDraft: q61TwoCardDraft,
  cutoff: q61SpillCommand.cutoff,
  constraintChanges: { operationResourceEdits: [q61SpillCommand], now: '2026-07-17T13:00:00Z' },
  productivityMatrix: q61Matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(q61TwoCardRecalculated.accepted, true, JSON.stringify(q61TwoCardRecalculated.diagnostics?.errors));
const preservedQ61Second = q61TwoCardRecalculated.allocations.find(item => item.sourceAllocationIds?.includes('allocation-q61-second'));
assert.equal(preservedQ61Second.peopleCount, 3, 'editar o primeiro card Q-61 nao deve alterar o segundo card Q-61');
assert.ok(preservedQ61Second.sourceAllocationIds.includes('allocation-q61'), 'sobra compativel deve consolidar com Q-61 existente no dia 23');
assert.equal(preservedQ61Second.date, q61SecondAllocation.date);
assert.equal(q61TwoCardRecalculated.allocations.filter(item => item.date === q61SecondAllocation.date && item.materialName === q61.name).length, 1);
assert.ok(preservedQ61Second.capacityPercent <= 100);
assert.equal(preservedQ61Second.maxDailyCapacity, 720);
assert.equal(q61TwoCardRecalculated.allocations.some(item => item.machineName === 'MT-100' || item.machineId === 'MT-100'), false);
const editedQ61FirstParts = q61TwoCardRecalculated.allocations.filter(item => item.sourceAllocationIds?.includes('allocation-q61'));
assert.ok(editedQ61FirstParts.length >= 1);
assert.equal(editedQ61FirstParts.find(item => item.date === q61SpillAllocation.date).peopleCount, 2);
assert.equal(Number(editedQ61FirstParts.flatMap(item => item.components || [])
  .filter(component => component.allocationId === 'allocation-q61')
  .reduce((sum, component) => sum + component.quantity, 0).toFixed(6)), q61Allocation.quantity);
const q61TwoCardTransaction = applyManualScheduleTransaction({
  currentDraft: q61TwoCardDraft,
  intent: {
    ...q61SpillCommand,
    cutoffDate: q61SpillCommand.cutoff.date,
    cutoffSnapshot: q61TwoCardRecalculated.cutoffSnapshot,
    previousDiagnostics: q61TwoCardRecalculated.previousDiagnostics,
    diagnosticDelta: q61TwoCardRecalculated.diagnosticDelta,
    candidateAllocations: q61TwoCardRecalculated.allocations,
    candidateDraft: q61TwoCardRecalculated.manualScheduleDraft
  },
  draftContext: { validatedAt: '2026-07-17T13:00:00Z' },
  validationContext: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity + q61SecondAllocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61SpillAllocation.date,
      startTime: q61SpillAllocation.startTime,
      endDate: q61SecondAllocation.date,
      endTime: q61SecondAllocation.endTime
    }],
    materials: [q61],
    machines: [q61Machine],
    productivityMatrix: q61Matrix.filter(row => row.id !== 'q61-2'),
    dependencies: [],
    transports: [],
    shifts,
    holidays: [],
    timezone: 'America/Sao_Paulo',
    stock: [],
    stockMinimums: [],
    stockLocations: [],
    setupMinutes: 0,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60,
    dailyTeamOverrides: {},
    manualWorkDates: []
  }
});
assert.equal(q61TwoCardTransaction.accepted, true, JSON.stringify(q61TwoCardTransaction.blockingIssues));
assert.equal(q61TwoCardTransaction.blockingIssues.some(issue => issue.code === 'PRODUCTIVITY_NOT_FOUND'), false);
assert.equal(q61TwoCardTransaction.draft.allocations.find(item => item.sourceAllocationIds?.includes('allocation-q61-second')).peopleCount, 3);

const q61ConsolidatedAllocation = q61TwoCardTransaction.draft.allocations.find(item => item.sourceAllocationIds?.includes('allocation-q61-second'));
const q61ConsolidatedPreview = buildPlanningOperationResourcePreview({
  allocation: q61ConsolidatedAllocation,
  machine: q61Mt150Option,
  peopleCount: 2,
  dailyMinutes: 480
});
const q61ConsolidatedCommand = buildPlanningProductionConfigurationEditCommand({
  allocation: q61ConsolidatedAllocation,
  parentOperationId: q61ConsolidatedAllocation.parentOperationId,
  machine: q61Mt150Option,
  peopleCount: 2,
  productivityConfiguration: q61ConsolidatedPreview.productivityConfiguration,
  cutoff: { date: q61ConsolidatedAllocation.date, time: q61ConsolidatedAllocation.startTime }
});
const q61ConsolidatedRecalculated = reoptimizePlanningFuture({
  baseline: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity + q61SecondAllocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61SpillAllocation.date,
      startTime: q61SpillAllocation.startTime,
      endDate: q61SecondAllocation.date,
      endTime: q61SecondAllocation.endTime
    }],
    materials: [q61], machines: [q61Machine], productivityMatrix: q61Matrix,
    dependencies: [], transports: [], shifts, holidays: [], timezone: 'America/Sao_Paulo',
    stock: [], stockMinimums: [], stockLocations: [], setupMinutes: 0,
    minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60
  },
  acceptedDraft: q61TwoCardTransaction.draft,
  cutoff: q61ConsolidatedCommand.cutoff,
  constraintChanges: { operationResourceEdits: [q61ConsolidatedCommand], now: '2026-07-17T14:00:00Z' },
  productivityMatrix: q61Matrix,
  calendar: { shifts, dailyTeamOverrides: {}, manualWorkDates: [], holidays: [] },
  stockContext: { stock: [], stockMinimums: [], stockLocations: [] }
});
assert.equal(q61ConsolidatedRecalculated.accepted, true, JSON.stringify(q61ConsolidatedRecalculated.diagnostics?.errors));
const q61ConsolidatedTransaction = applyManualScheduleTransaction({
  currentDraft: q61TwoCardTransaction.draft,
  intent: {
    ...q61ConsolidatedCommand,
    cutoffDate: q61ConsolidatedCommand.cutoff.date,
    cutoffSnapshot: q61ConsolidatedRecalculated.cutoffSnapshot,
    previousDiagnostics: q61ConsolidatedRecalculated.previousDiagnostics,
    diagnosticDelta: q61ConsolidatedRecalculated.diagnosticDelta,
    candidateAllocations: q61ConsolidatedRecalculated.allocations,
    candidateDraft: q61ConsolidatedRecalculated.manualScheduleDraft
  },
  draftContext: { validatedAt: '2026-07-17T14:00:00Z' },
  validationContext: {
    operations: [{
      operationId: q61Allocation.parentOperationId,
      materialId: q61.id,
      materialCode: q61.code,
      materialName: q61.name,
      machineId: q61Machine.machineId,
      machineName: q61Machine.machineName,
      peopleCount: 3,
      produceQty: q61Allocation.quantity + q61SecondAllocation.quantity,
      unit: 'un',
      productionOrder: 0,
      startDate: q61SpillAllocation.date,
      startTime: q61SpillAllocation.startTime,
      endDate: q61SecondAllocation.date,
      endTime: q61SecondAllocation.endTime
    }],
    materials: [q61],
    machines: [q61Machine],
    productivityMatrix: q61Matrix.filter(row => row.id !== 'q61-2'),
    dependencies: [],
    transports: [],
    shifts,
    holidays: [],
    timezone: 'America/Sao_Paulo',
    stock: [],
    stockMinimums: [],
    stockLocations: [],
    setupMinutes: 0,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60,
    dailyTeamOverrides: {},
    manualWorkDates: []
  }
});
assert.equal(q61ConsolidatedTransaction.accepted, true, JSON.stringify(q61ConsolidatedTransaction.blockingIssues));
assert.equal(q61ConsolidatedTransaction.blockingIssues.some(issue => issue.code === 'PRODUCTIVITY_NOT_FOUND'), false);

const planningPageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
assert.match(planningPageSource, /buildPlanningProductionConfigurationEditCommand/);
assert.match(planningPageSource, /operationResourceEdits: \[command\]/);
assert.match(planningPageSource, /Configuração atualizada e produções seguintes recalculadas/);

console.log('productionCalendarConfigurationEdit.integration.test.js: ok');
