import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildPlanningAllocationEditorOperation,
  runPlanningAllocationEditorController
} from '../shared/planning-controller/planningAllocationEditorController.js';

const machines = [
  { machineId: 'machine-1', machineName: 'Maquina 1' },
  { machineId: 'machine-2', machineName: 'Maquina 2' }
];

const matrixRows = [
  { id: 'line-1', material_id: 'material-1', machine_id: 'machine-1', machine_name: 'Maquina 1', people_count: 2, output_qty: 1000, output_unit: 'kg', time_minutes: 540 },
  { id: 'line-2', material_id: 'material-1', machine_id: 'machine-2', machine_name: 'Maquina 2', people_count: 1, output_qty: 5000, output_unit: 'kg', time_minutes: 528 }
];

function allocation(overrides = {}) {
  return {
    allocationId: 'allocation-original',
    operationId: 'operation-1',
    parentOperationId: 'operation-1',
    productionId: 'production-1',
    productionIndex: 0,
    materialId: 'material-1',
    materialName: 'Material 1',
    machineId: 'machine-1',
    machineName: 'Maquina 1',
    date: '2026-07-20',
    startTime: '07:00',
    endTime: '16:00',
    quantity: 1000,
    unit: 'kg',
    durationMinutes: 540,
    capacityPercent: 100,
    maxDailyCapacity: 1000,
    peopleCount: 2,
    productionMemberships: [
      { productionId: 'production-1', productionIndex: 0, quantity: 1000, unit: 'kg', quantitySource: 'production-breakdown' }
    ],
    components: [{
      allocationId: 'allocation-original',
      parentOperationId: 'operation-1',
      productionId: 'production-1',
      materialId: 'material-1',
      quantity: 1000,
      unit: 'kg'
    }],
    sourceAllocationIds: ['allocation-original'],
    sourceParentOperationIds: ['operation-1'],
    productivity: { machineName: 'Maquina 1', peopleCount: 2, outputQty: 1000, outputUnit: 'kg', timeSeconds: 32400 },
    ...overrides
  };
}

function draft(allocations = [allocation()]) {
  return {
    draftId: 'draft-editor',
    planningId: 'plan-1',
    allocations,
    manualWorkDates: [],
    dailyTeamOverrides: {},
    dirty: false
  };
}

function validationContext(extra = {}) {
  return {
    operations: [],
    materials: [{ id: 'material-1', name: 'Material 1' }],
    machines,
    productivityMatrix: matrixRows,
    stock: [],
    stockMinimums: [],
    stockLocations: [],
    dependencies: [],
    transports: [],
    shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }],
    dailyTeamOverrides: {},
    manualWorkDates: [],
    setupMinutes: 0,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60,
    holidays: [],
    timezone: 'America/Sao_Paulo',
    ...extra
  };
}

function draftContext(extra = {}) {
  return {
    now: '2026-07-17T12:00:00.000Z',
    validatedAt: '2026-07-17T12:00:00.000Z',
    machines,
    matrixRows,
    dailyMinutes: 540,
    ...extra
  };
}

test('monta operacoes canonicas de edit e split sem derivar identidade', () => {
  const current = allocation();
  const edit = buildPlanningAllocationEditorOperation({
    mode: 'edit',
    currentAllocation: current,
    machineId: 'machine-1',
    peopleCount: 2,
    quantity: 800,
    date: '2026-07-21',
    startTime: '08:00'
  });
  assert.deepEqual(edit.intent, {
    type: 'EDIT_ALLOCATION',
    allocationId: 'allocation-original',
    machineId: 'machine-1',
    peopleCount: 2,
    quantity: 800,
    date: '2026-07-21',
    startTime: '08:00'
  });

  const split = buildPlanningAllocationEditorOperation({
    mode: 'split',
    currentAllocation: current,
    relativePercents: [40, 60],
    partEdits: [{ machineId: 'machine-1' }, { machineId: 'machine-1' }]
  });
  assert.deepEqual(split.intent, {
    type: 'SPLIT_ALLOCATION',
    allocationId: 'allocation-original',
    relativePercents: [40, 60],
    partEdits: [{ machineId: 'machine-1' }, { machineId: 'machine-1' }]
  });
});

test('edit aceito aplica draft somente no callback e preserva ordem/IDs', async () => {
  const activeDraft = draft([
    allocation({ allocationId: 'before', operationId: 'before', parentOperationId: 'before', date: '2026-07-22', quantity: 10, capacityPercent: 10, components: [{ allocationId: 'before', parentOperationId: 'before', productionId: 'production-before', materialId: 'material-1', quantity: 10, unit: 'kg' }] }),
    allocation(),
    allocation({ allocationId: 'after', operationId: 'after', parentOperationId: 'after', date: '2026-07-23', quantity: 20, capacityPercent: 20, components: [{ allocationId: 'after', parentOperationId: 'after', productionId: 'production-after', materialId: 'material-1', quantity: 20, unit: 'kg' }] })
  ]);
  let appliedDraft = activeDraft;
  const callbacks = [];
  const result = await runPlanningAllocationEditorController({
    currentDraft: activeDraft,
    editRequest: {
      mode: 'edit',
      allocation: activeDraft.allocations[1],
      machineId: 'machine-2',
      peopleCount: 1,
      quantity: 1000,
      date: '2026-07-21',
      startTime: '08:00'
    },
    draftContext: draftContext({ dailyMinutes: 528 }),
    validationContext: validationContext(),
    onAccepted: transaction => {
      callbacks.push('accepted');
      appliedDraft = transaction.draft;
    }
  });
  assert.equal(result.accepted, true, JSON.stringify(result.transaction?.blockingIssues));
  assert.deepEqual(callbacks, ['accepted']);
  assert.notEqual(appliedDraft, activeDraft);
  assert.deepEqual(appliedDraft.allocations.map(item => item.allocationId), ['before', 'allocation-original', 'after']);
  const edited = appliedDraft.allocations[1];
  assert.equal(edited.allocationId, 'allocation-original');
  assert.equal(edited.operationId, 'operation-1');
  assert.equal(edited.parentOperationId, 'operation-1');
  assert.equal(edited.machineId, 'machine-2');
  assert.equal(edited.peopleCount, 1);
  assert.equal(edited.date, '2026-07-21');
  assert.equal(edited.components[0].allocationId, 'allocation-original');
});

test('edit rejeitado preserva draft e diagnosticos', async () => {
  const activeDraft = draft();
  const before = JSON.stringify(activeDraft);
  const result = await runPlanningAllocationEditorController({
    currentDraft: activeDraft,
    editRequest: {
      mode: 'edit',
      allocation: activeDraft.allocations[0],
      machineId: 'machine-missing',
      peopleCount: 1,
      quantity: 1000,
      date: '2026-07-21',
      startTime: '08:00'
    },
    draftContext: draftContext(),
    validationContext: validationContext(),
    onAccepted: () => assert.fail('draft rejeitado nao pode acionar callback de aceite')
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'rejected');
  assert.equal(JSON.stringify(activeDraft), before);
  assert.ok(result.transaction.blockingIssues.length > 0);
  assert.deepEqual(result.transaction.draft, activeDraft);
});

test('split aceito preserva ordem, IDs, linhagem, memberships e residuo deterministico', async () => {
  const activeDraft = draft();
  let appliedDraft = null;
  const result = await runPlanningAllocationEditorController({
    currentDraft: activeDraft,
    editRequest: {
      mode: 'split',
      allocation: activeDraft.allocations[0],
      relativePercents: [33.33, 33.33, 33.34],
      partEdits: [
        { machineId: 'machine-1', peopleCount: 2, date: '2026-07-20', startTime: '07:00' },
        { machineId: 'machine-1', peopleCount: 2, date: '2026-07-20', startTime: '10:00' },
        { machineId: 'machine-1', peopleCount: 2, date: '2026-07-20', startTime: '13:00' }
      ]
    },
    draftContext: draftContext(),
    validationContext: validationContext(),
    onAccepted: transaction => { appliedDraft = transaction.draft; }
  });
  assert.equal(result.accepted, true, JSON.stringify(result.transaction?.blockingIssues));
  assert.equal(new Set(appliedDraft.allocations.map(item => item.allocationId)).size, 3);
  assert.equal(appliedDraft.allocations.every(item => String(item.allocationId).startsWith('split:allocation-original:')), true);
  assert.equal(appliedDraft.allocations.every(item => item.splitPartId === item.allocationId), true);
  assert.deepEqual(appliedDraft.allocations.map(item => item.splitParentAllocationId), [
    'allocation-original',
    'allocation-original',
    'allocation-original'
  ]);
  assert.deepEqual(appliedDraft.allocations.map(item => item.splitOrder), [1, 2, 3]);
  assert.deepEqual(appliedDraft.allocations.map(item => item.quantity), [333.3, 333.3, 333.4]);
  assert.equal(Number(appliedDraft.allocations.reduce((sum, item) => sum + item.quantity, 0).toFixed(6)), 1000);
  assert.equal(Number(appliedDraft.allocations.reduce((sum, item) => sum + item.components[0].quantity, 0).toFixed(6)), 1000);
  assert.deepEqual(appliedDraft.allocations.map(item => item.productionMemberships[0].quantity), [333.3, 333.3, 333.4]);
});

test('split rejeitado preserva atomicamente o draft anterior', async () => {
  const activeDraft = draft();
  const before = JSON.stringify(activeDraft);
  const result = await runPlanningAllocationEditorController({
    currentDraft: activeDraft,
    editRequest: {
      mode: 'split',
      allocation: activeDraft.allocations[0],
      relativePercents: [50, 50],
      partEdits: [
        { machineId: 'machine-1', peopleCount: 2, date: '2026-07-20', startTime: '07:00' },
        { machineId: 'machine-missing', peopleCount: 2, date: '2026-07-21', startTime: '07:00' }
      ]
    },
    draftContext: draftContext(),
    validationContext: validationContext(),
    onAccepted: () => assert.fail('split rejeitado nao pode acionar callback de aceite')
  });
  assert.equal(result.accepted, false);
  assert.equal(JSON.stringify(activeDraft), before);
  assert.deepEqual(result.transaction.draft, activeDraft);
});

test('split recursivo preserva raiz, pai imediato e quantidade fisica', async () => {
  const first = await runPlanningAllocationEditorController({
    currentDraft: draft(),
    editRequest: { mode: 'split', allocation: allocation(), relativePercents: [50, 50] },
    draftContext: draftContext(),
    validationContext: validationContext()
  });
  assert.equal(first.accepted, true, JSON.stringify(first.transaction?.blockingIssues));
  const target = first.transaction.draft.allocations[0];
  const second = await runPlanningAllocationEditorController({
    currentDraft: first.transaction.draft,
    editRequest: { mode: 'split', allocation: target, relativePercents: [50, 50] },
    draftContext: draftContext(),
    validationContext: validationContext()
  });
  assert.equal(second.accepted, true, JSON.stringify(second.transaction?.blockingIssues));
  const leaves = second.transaction.draft.allocations;
  assert.equal(new Set(leaves.map(item => item.allocationId)).size, 3);
  assert.equal(leaves[0].splitPartId, leaves[0].allocationId);
  assert.equal(leaves[1].splitPartId, leaves[1].allocationId);
  assert.equal(leaves[2].splitPartId, leaves[2].allocationId);
  assert.deepEqual(leaves.map(item => item.splitRootAllocationId), [
    'allocation-original',
    'allocation-original',
    'allocation-original'
  ]);
  assert.equal(leaves[0].splitParentAllocationId, target.allocationId);
  assert.equal(leaves[1].splitParentAllocationId, target.allocationId);
  assert.equal(Number(leaves.reduce((sum, item) => sum + item.quantity, 0).toFixed(6)), 1000);
});

test('callbacks ocorrem depois da transacao aceita e antes do retorno', async () => {
  const activeDraft = draft();
  const acceptedDraft = { ...activeDraft, dirty: true };
  const calls = [];
  const result = await runPlanningAllocationEditorController({
    currentDraft: activeDraft,
    editRequest: {
      mode: 'edit',
      allocation: activeDraft.allocations[0],
      machineId: 'machine-1',
      peopleCount: 2,
      quantity: 900,
      date: '2026-07-20',
      startTime: '07:00'
    },
    draftContext: draftContext(),
    validationContext: validationContext(),
    applyTransaction: payload => {
      calls.push(`transaction:${payload.intent.type}:${payload.intent.allocationId}`);
      return { accepted: true, draft: acceptedDraft, validation: { valid: true, errors: [], warnings: [] }, blockingIssues: [] };
    },
    onAccepted: transaction => {
      calls.push(`accepted:${transaction.draft.dirty}`);
    }
  });
  calls.push(`return:${result.accepted}`);
  assert.deepEqual(calls, [
    'transaction:EDIT_ALLOCATION:allocation-original',
    'accepted:true',
    'return:true'
  ]);
});

test('controller nao chama solver, reotimizacao, DOM, storage ou API', () => {
  const source = readFileSync(
    new URL('../shared/planning-controller/planningAllocationEditorController.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /applyManualScheduleTransaction/);
  assert.doesNotMatch(source, /\b(simulateCurrent|buildPlan|scheduleOperations|reoptimizePlanningFuture)\b/);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bapi\s*\(|document\.|window\.|localStorage|sessionStorage/);
});

console.log('planningAllocationEditorController.test.js ok');
