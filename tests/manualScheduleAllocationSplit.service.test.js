import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildManualScheduleAllocationParts,
  buildManualScheduleAllocationSplit,
  editDraftAllocation,
  splitDraftAllocation
} from '../services/manualScheduleDraft.service.js';
import {
  createManualScheduleHistory,
  recordManualScheduleHistory,
  redoManualScheduleHistory,
  undoManualScheduleHistory
} from '../services/manualScheduleHistory.service.js';
import {
  normalizePersistedManualScheduleDraft,
  serializeManualScheduleDraft
} from '../services/manualSchedulePersistence.service.js';
import { projectPlanningStockByDay } from '../services/planningStockProjection.service.js';
import {
  applyManualScheduleTransaction,
  isManualScheduleValidationCompatible
} from '../services/manualScheduleTransaction.service.js';

function allocation(overrides = {}) {
  return {
    allocationId: 'allocation-original',
    operationId: 'operation-1',
    parentOperationId: 'operation-1',
    productionId: 'production-1',
    productionMemberships: [
      { productionId: 'production-1', productionIndex: 0, productionColor: '#111111' },
      { productionId: 'production-2', productionIndex: 1, productionColor: '#222222' }
    ],
    materialId: 'material-1',
    materialName: 'Material 1',
    machineId: 'machine-1',
    machineName: 'Máquina 1',
    date: '2026-07-20',
    startTime: '07:00',
    endTime: '16:00',
    quantity: 1000,
    unit: 'un',
    durationMinutes: 540,
    capacityPercent: 100,
    maxDailyCapacity: 1000,
    peopleCount: 2,
    sequence: 1,
    components: [{
      allocationId: 'allocation-original',
      parentOperationId: 'operation-1',
      productionId: 'production-1',
      materialId: 'material-1',
      quantity: 1000,
      unit: 'un'
    }],
    sourceAllocationIds: ['allocation-original'],
    sourceParentOperationIds: ['operation-1'],
    productivity: { machineName: 'Máquina 1', peopleCount: 2, outputQty: 1000, outputUnit: 'un', timeSeconds: 32400 },
    ...overrides
  };
}

test('divide 100% em 40% + 60% sem alterar quantidade física ou configuração', () => {
  const source = allocation();
  const result = buildManualScheduleAllocationSplit(source, 40, { splitGroupId: 'split-fixed' });
  assert.deepEqual(result.first.capacityPercent, 40);
  assert.deepEqual(result.second.capacityPercent, 60);
  assert.deepEqual(result.first.quantity, 400);
  assert.deepEqual(result.second.quantity, 600);
  assert.equal(result.first.endTime, result.second.startTime);
  assert.equal(result.first.startTime, source.startTime);
  assert.equal(result.second.endTime, source.endTime);
  assert.equal(result.first.machineId, source.machineId);
  assert.equal(result.second.peopleCount, source.peopleCount);
  assert.deepEqual(result.first.productivity, source.productivity);
  assert.deepEqual(result.first.productionMemberships, source.productionMemberships.map(item => ({
    ...item,
    quantitySource: 'legacy-unresolved'
  })));
  assert.deepEqual(result.second.productionMemberships, source.productionMemberships.map(item => ({
    ...item,
    quantitySource: 'legacy-unresolved'
  })));
  assert.equal(result.first.parentOperationId, source.parentOperationId);
  assert.equal(result.second.parentOperationId, source.parentOperationId);
});

test('split particiona memberships quantitativos com a mesma regra física e resíduo determinístico', () => {
  const source = allocation({
    quantity: 18000,
    unit: 'kg',
    productionMemberships: [
      {
        productionId: 'production-a',
        productionIndex: 0,
        quantity: 10000,
        unit: 'kg',
        quantitySource: 'production-breakdown'
      },
      {
        productionId: 'production-b',
        productionIndex: 1,
        quantity: 8000,
        unit: 'kg',
        quantitySource: 'production-breakdown'
      }
    ],
    components: [{
      allocationId: 'allocation-original',
      parentOperationId: 'operation-1',
      productionId: 'production-1',
      materialId: 'material-1',
      quantity: 18000,
      unit: 'kg'
    }]
  });
  const before = structuredClone(source);
  const result = buildManualScheduleAllocationSplit(source, 60, { splitGroupId: 'membership-60-40' });
  assert.deepEqual(result.first.productionMemberships.map(item => item.quantity), [6000, 4800]);
  assert.deepEqual(result.second.productionMemberships.map(item => item.quantity), [4000, 3200]);
  source.productionMemberships.forEach((membership, index) => {
    assert.equal(
      Number((result.first.productionMemberships[index].quantity + result.second.productionMemberships[index].quantity).toFixed(6)),
      membership.quantity
    );
  });
  assert.deepEqual(source, before, 'split quantitativo não pode mutar a allocation original');
});

test('split mantém precisão de memberships e entrega o resíduo à última parte', () => {
  const source = allocation({
    quantity: 1,
    capacityPercent: 1,
    productionMemberships: [{
      productionId: 'production-1',
      productionIndex: 0,
      quantity: 1,
      unit: 'kg',
      quantitySource: 'production-breakdown'
    }],
    components: [{
      allocationId: 'allocation-original',
      parentOperationId: 'operation-1',
      productionId: 'production-1',
      materialId: 'material-1',
      quantity: 1,
      unit: 'kg'
    }]
  });
  const result = buildManualScheduleAllocationParts(source, [33.33, 33.33, 33.34], {
    splitGroupId: 'membership-residual'
  });
  assert.deepEqual(
    result.parts.map(part => part.productionMemberships[0].quantity),
    [0.3333, 0.3333, 0.3334]
  );
  assert.equal(
    result.parts.reduce((sum, part) => sum + part.productionMemberships[0].quantity, 0),
    1
  );
});

test('interpreta 30% como proporção relativa de uma allocation com 80%', () => {
  const source = allocation({ quantity: 1, capacityPercent: 80, maxDailyCapacity: 1.25, components: [{
    allocationId: 'allocation-original', parentOperationId: 'operation-1', productionId: 'production-1', materialId: 'material-1', quantity: 1, unit: 'un'
  }] });
  const result = buildManualScheduleAllocationSplit(source, 30, { splitGroupId: 'split-rounding' });
  assert.equal(result.first.capacityPercent, 24);
  assert.equal(result.second.capacityPercent, 56);
  assert.equal(result.first.splitRatioPercent, 30);
  assert.equal(result.second.splitRatioPercent, 70);
  assert.equal(result.first.quantity, 0.3);
  assert.equal(result.second.quantity, 0.7);
  assert.equal(Number((result.first.quantity + result.second.quantity).toFixed(6)), source.quantity);
  assert.equal(Number((result.first.components[0].quantity + result.second.components[0].quantity).toFixed(6)), source.quantity);
});

test('rejeita percentuais inválidos e precisão excessiva', () => {
  for (const value of [0, -1, 100, 101, NaN, Infinity, 'texto']) {
    assert.throws(() => buildManualScheduleAllocationSplit(allocation(), value, { splitGroupId: 'invalid' }));
  }
  assert.throws(() => buildManualScheduleAllocationSplit(allocation(), 33.333, { splitGroupId: 'precision' }), /no máximo 2 casas/);
});

test('60,50% e 4.235 kg preservam capacidade e quantidade em divisão recursiva 50/50', () => {
  const source = allocation({
    quantity: 4235, capacityPercent: 60.5, maxDailyCapacity: 7000,
    durationMinutes: 319, endTime: '12:19',
    components: [{ allocationId: 'allocation-original', parentOperationId: 'operation-1', productionId: 'production-1', materialId: 'material-1', quantity: 4235, unit: 'kg' }],
    unit: 'kg'
  });
  const first = buildManualScheduleAllocationParts(source, [50, 50], { splitGroupId: 'recursive-1' });
  assert.deepEqual(first.parts.map(item => item.capacityPercent), [30.25, 30.25]);
  assert.deepEqual(first.parts.map(item => item.quantity), [2117.5, 2117.5]);
  const second = buildManualScheduleAllocationParts(first.parts[0], [50, 50], { splitGroupId: 'recursive-2' });
  assert.deepEqual(second.parts.map(item => item.capacityPercent), [15.13, 15.12]);
  assert.deepEqual(second.parts.map(item => item.quantity), [1058.75, 1058.75]);
  assert.deepEqual(second.parts.map(item => item.splitPath), ['1.1', '1.2']);
  assert.deepEqual(second.parts.map(item => item.splitDepth), [2, 2]);
  assert.deepEqual(second.parts.map(item => item.splitRatioPercent), [50, 50]);
  assert.deepEqual(second.parts.map(item => item.splitAccumulatedRatioPercent), [25, 25]);
  const leaves = [...second.parts, first.parts[1]];
  assert.equal(Number(leaves.reduce((sum, item) => sum + item.capacityPercent, 0).toFixed(2)), 60.5);
  assert.equal(Number(leaves.reduce((sum, item) => sum + item.quantity, 0).toFixed(6)), 4235);
  assert.equal(leaves.every(item => item.splitRootAllocationId === 'allocation-original'), true);
});

test('três ou mais partes reconciliam resíduos deterministicamente na última parte', () => {
  const result = buildManualScheduleAllocationParts(allocation({
    quantity: 1, capacityPercent: 1,
    components: [{ allocationId: 'allocation-original', parentOperationId: 'operation-1', productionId: 'production-1', materialId: 'material-1', quantity: 1, unit: 'un' }]
  }), [33.33, 33.33, 33.34], { splitGroupId: 'three' });
  assert.deepEqual(result.parts.map(item => item.capacityPercent), [0.33, 0.33, 0.34]);
  assert.deepEqual(result.parts.map(item => item.quantity), [0.3333, 0.3333, 0.3334]);
  assert.equal(result.parts.reduce((sum, item) => sum + item.components[0].quantity, 0), 1);
});

test('edição localizada mantém quantidade, linhagem e parte irmã', () => {
  const beforeUnrelated = allocation({
    allocationId: 'before-unrelated',
    operationId: 'operation-before',
    parentOperationId: 'operation-before',
    productionId: 'production-before',
    quantity: 10,
    capacityPercent: 10,
    maxDailyCapacity: 100,
    components: [{
      allocationId: 'before-unrelated', parentOperationId: 'operation-before', productionId: 'production-before', materialId: 'material-1', quantity: 10, unit: 'kg'
    }]
  });
  const source = allocation({ quantity: 4235, capacityPercent: 60.5, maxDailyCapacity: 7000, unit: 'kg', components: [{
    allocationId: 'allocation-original', parentOperationId: 'operation-1', productionId: 'production-1', materialId: 'material-1', quantity: 4235, unit: 'kg'
  }] });
  const afterUnrelated = allocation({
    allocationId: 'after-unrelated',
    operationId: 'operation-after',
    parentOperationId: 'operation-after',
    productionId: 'production-after',
    quantity: 20,
    capacityPercent: 20,
    maxDailyCapacity: 100,
    components: [{
      allocationId: 'after-unrelated', parentOperationId: 'operation-after', productionId: 'production-after', materialId: 'material-1', quantity: 20, unit: 'kg'
    }]
  });
  const split = splitDraftAllocation({ allocations: [beforeUnrelated, source, afterUnrelated] }, {
    allocationId: source.allocationId, relativePercents: [50, 50], splitGroupId: 'local-edit'
  });
  const originalOrder = split.allocations.map(item => item.allocationId);
  const originalIndex = split.allocations.findIndex(item => item.allocationId === 'local-edit:part-1');
  const targetBefore = structuredClone(split.allocations[originalIndex]);
  const siblingBefore = structuredClone(split.allocations[originalIndex + 1]);
  const totalBefore = split.allocations
    .filter(item => item.splitRootAllocationId === 'allocation-original')
    .reduce((sum, item) => sum + item.quantity, 0);
  const edited = editDraftAllocation(split, {
    allocationId: targetBefore.allocationId,
    machineId: 'machine-2', peopleCount: 1, date: '2026-07-21', startTime: '08:00', dailyMinutes: 528,
    machines: [{ machineId: 'machine-1', machineName: 'Máquina 1' }, { machineId: 'machine-2', machineName: 'Máquina 2' }],
    matrixRows: [{ id: 'line-2', material_id: 'material-1', machine_id: 'machine-2', machine_name: 'Máquina 2', people_count: 1, output_qty: 5000, output_unit: 'kg', time_minutes: 528 }]
  });
  const editedOrder = edited.allocations.map(item => item.allocationId);
  const changedIndex = edited.allocations.findIndex(item => item.allocationId === targetBefore.allocationId);
  const changed = edited.allocations[originalIndex];
  const splitParts = edited.allocations.filter(item => item.splitRootAllocationId === 'allocation-original');

  assert.equal(originalIndex, 1);
  assert.equal(changedIndex, originalIndex, 'allocation editada deve permanecer no mesmo índice');
  assert.deepEqual(editedOrder, originalOrder, 'edição não deve reordenar o array do draft');
  assert.equal(edited.allocations[0].allocationId, beforeUnrelated.allocationId, 'item anterior mantém índice');
  assert.equal(edited.allocations[3].allocationId, afterUnrelated.allocationId, 'item posterior mantém índice');
  assert.equal(changed.allocationId, targetBefore.allocationId);
  assert.equal(changed.operationId, targetBefore.operationId);
  assert.equal(changed.productionId, targetBefore.productionId);
  assert.equal(changed.quantity, 2117.5);
  assert.equal(changed.capacityPercent, 42.35);
  assert.equal(changed.machineId, 'machine-2');
  assert.equal(changed.peopleCount, 1);
  assert.equal(changed.date, '2026-07-21');
  assert.equal(changed.unit, 'kg');
  assert.equal(changed.splitGroupId, targetBefore.splitGroupId);
  assert.equal(changed.splitRootAllocationId, targetBefore.splitRootAllocationId);
  assert.equal(changed.splitParentAllocationId, 'allocation-original');
  assert.equal(changed.splitPartOrder, targetBefore.splitPartOrder);
  assert.equal(changed.splitOrder, targetBefore.splitOrder);
  assert.equal(changed.splitDepth, targetBefore.splitDepth);
  assert.equal(changed.splitPath, targetBefore.splitPath);
  assert.equal(changed.components.length, 1);
  assert.equal(changed.components[0].allocationId, changed.allocationId);
  assert.equal(changed.components[0].quantity, changed.quantity);
  assert.deepEqual(edited.allocations[originalIndex + 1], siblingBefore, 'parte irmã não deve receber a edição');
  assert.notEqual(edited.allocations[originalIndex + 1].capacityPercent, changed.capacityPercent);
  assert.equal(Number(splitParts.reduce((sum, item) => sum + item.quantity, 0).toFixed(6)), totalBefore);
  assert.equal(Number(splitParts.flatMap(item => item.components).reduce((sum, component) => sum + component.quantity, 0).toFixed(6)), totalBefore);
  assert.equal(new Set(edited.allocations.map(item => item.allocationId)).size, edited.allocations.length);
});

test('split é uma única alteração de histórico e undo/redo preservam IDs', () => {
  const before = { draftId: 'draft-1', allocations: [allocation()], dirty: false };
  const after = splitDraftAllocation(before, {
    allocationId: 'allocation-original', firstPercent: 40, splitGroupId: 'split-history', now: '2026-07-17T12:00:00.000Z'
  });
  let history = recordManualScheduleHistory(createManualScheduleHistory(before), before, after);
  const undone = undoManualScheduleHistory(history);
  history = undone.history;
  assert.deepEqual(undone.state, before);
  const redone = redoManualScheduleHistory(history);
  assert.deepEqual(redone.state.allocations.map(item => item.allocationId), [
    'split-history:part-1', 'split-history:part-2'
  ]);
  assert.deepEqual(redone.state, after);
});

test('save/reload preserva metadados, percentuais, memberships e ordem do split', () => {
  const draft = splitDraftAllocation({
    draftId: 'draft-save', planningId: 'plan-1', allocations: [allocation()], manualWorkDates: [], dailyTeamOverrides: {}
  }, { allocationId: 'allocation-original', firstPercent: 40, splitGroupId: 'split-save', now: '2026-07-17T12:00:00.000Z' });
  const persisted = serializeManualScheduleDraft({ draft, planningId: 'plan-1', now: new Date('2026-07-17T13:00:00.000Z') });
  const reload = normalizePersistedManualScheduleDraft(JSON.parse(JSON.stringify(persisted))).draft;
  assert.deepEqual(reload.allocations.map(item => ({
    allocationId: item.allocationId,
    splitGroupId: item.splitGroupId,
    splitParentAllocationId: item.splitParentAllocationId,
    splitOrder: item.splitOrder,
    capacityPercent: item.capacityPercent,
    quantity: item.quantity,
    memberships: item.productionMemberships
  })), persisted.allocations.map(item => ({
    allocationId: item.allocationId,
    splitGroupId: item.splitGroupId,
    splitParentAllocationId: item.splitParentAllocationId,
    splitOrder: item.splitOrder,
    capacityPercent: item.capacityPercent,
    quantity: item.quantity,
    memberships: item.productionMemberships
  }))); 
});

test('save/reload e undo/redo preservam IDs e linhagem de divisão recursiva', () => {
  const before = { draftId: 'recursive-save', planningId: 'plan-1', allocations: [allocation()], manualWorkDates: [], dailyTeamOverrides: {} };
  const level1 = splitDraftAllocation(before, {
    allocationId: 'allocation-original', relativePercents: [50, 50], splitGroupId: 'save-level-1', now: '2026-07-17T12:00:00.000Z'
  });
  const level2 = splitDraftAllocation(level1, {
    allocationId: 'save-level-1:part-1', relativePercents: [50, 50], splitGroupId: 'save-level-2', now: '2026-07-17T13:00:00.000Z'
  });
  const persisted = serializeManualScheduleDraft({ draft: level2, planningId: 'plan-1', now: new Date('2026-07-17T14:00:00.000Z') });
  const reloaded = normalizePersistedManualScheduleDraft(JSON.stringify(persisted)).draft;
  const signature = value => value.allocations.map(item => ({
    allocationId: item.allocationId,
    root: item.splitRootAllocationId,
    parent: item.splitParentAllocationId,
    depth: item.splitDepth,
    path: item.splitPath,
    ratio: item.splitRatioPercent,
    accumulated: item.splitAccumulatedRatioPercent
  }));
  assert.deepEqual(signature(reloaded), signature(level2));
  const history = recordManualScheduleHistory(createManualScheduleHistory(level1), level1, level2);
  const undone = undoManualScheduleHistory(history);
  assert.deepEqual(undone.state, level1);
  assert.deepEqual(redoManualScheduleHistory(undone.history).state, level2);
});

test('projeção de estoque soma partes físicas uma vez, independentemente dos memberships', () => {
  const source = allocation();
  const split = buildManualScheduleAllocationSplit(source, 40, { splitGroupId: 'split-stock' });
  const project = allocations => projectPlanningStockByDay({
    stockContext: { stock: [{ materialId: 'material-1', quantity: 0, unit: 'un' }] },
    allocations,
    calendarDays: [{ date: '2026-07-20' }]
  });
  const movements = result => [...new Map(result.days
    .flatMap(day => day.materials)
    .flatMap(material => material.movements)
    .map(item => [item.movementId, item])).values()];
  const productionTotal = result => movements(result)
    .filter(item => item.type === 'PRODUCTION_IN')
    .reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(productionTotal(project([source])), 1000);
  assert.equal(productionTotal(project([split.first, split.second])), 1000);
  assert.equal(movements(project([split.first, split.second])).filter(item => item.type === 'PRODUCTION_IN').length, 2);
});

test('transação aceita o split sem reotimização e produz validação compatível', () => {
  const machine = { machineId: 'machine-1', machineName: 'Máquina 1' };
  const validationContext = {
    operations: [],
    materials: [{ id: 'material-1', name: 'Material 1' }],
    machines: [machine],
    productivityMatrix: [{ material_id: 'material-1', machine_id: 'machine-1', machine_name: 'Máquina 1', people_count: 2, output_qty: 1000, output_unit: 'un', time_seconds: 32400 }],
    stock: [], stockMinimums: [], stockLocations: [], dependencies: [], transports: [],
    shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }],
    dailyTeamOverrides: {}, manualWorkDates: [], setupMinutes: 0, minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60, holidays: [], timezone: 'America/Sao_Paulo'
  };
  const currentDraft = {
    draftId: 'draft-transaction', allocations: [allocation()], manualWorkDates: [], dailyTeamOverrides: {}
  };
  const validated = applyManualScheduleTransaction({
    currentDraft,
    intent: { type: 'VALIDATE_DRAFT' },
    draftContext: { validatedAt: '2026-07-17T12:00:00.000Z' },
    validationContext
  });
  assert.equal(validated.accepted, true, JSON.stringify(validated.blockingIssues));
  const split = applyManualScheduleTransaction({
    currentDraft: validated.draft,
    intent: { type: 'SPLIT_ALLOCATION', allocationId: 'allocation-original', firstPercent: 40, splitGroupId: 'split-transaction' },
    draftContext: { now: '2026-07-17T13:00:00.000Z', validatedAt: '2026-07-17T13:00:00.000Z' },
    validationContext
  });
  assert.equal(split.accepted, true, JSON.stringify(split.blockingIssues));
  assert.equal(split.draft.allocations.length, 2);
  assert.equal(isManualScheduleValidationCompatible(split.draft), true);
  assert.equal(split.diagnosticDelta.introduced.length, 0);

  const rejected = applyManualScheduleTransaction({
    currentDraft: validated.draft,
    intent: {
      type: 'SPLIT_ALLOCATION', allocationId: 'allocation-original', relativePercents: [50, 50],
      partEdits: [
        { machineId: 'machine-1', peopleCount: 2, date: '2026-07-20', startTime: '07:00' },
        { machineId: 'machine-inexistente', peopleCount: 2, date: '2026-07-21', startTime: '07:00' }
      ]
    },
    draftContext: { now: '2026-07-17T14:00:00.000Z', validatedAt: '2026-07-17T14:00:00.000Z', machines: [machine], matrixRows: validationContext.productivityMatrix, dailyMinutes: 540 },
    validationContext
  });
  assert.equal(rejected.accepted, false);
  assert.deepEqual(rejected.draft, validated.draft, 'falha em uma parte deve preservar atomicamente todo o draft anterior');
});
