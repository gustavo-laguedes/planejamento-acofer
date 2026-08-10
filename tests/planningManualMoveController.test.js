import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPlanningManualMoveOperation,
  runPlanningManualMoveController
} from '../shared/planning-controller/planningManualMoveController.js';

const allocation = (extra = {}) => ({
  allocationId: 'alloc-1',
  operationId: 'op-1',
  parentOperationId: 'parent-1',
  productionId: 'prod-1',
  productionIndex: 0,
  machineId: 'M1',
  machineName: 'M1',
  date: '2026-07-20',
  startTime: '08:00',
  endTime: '10:00',
  quantity: 10,
  durationMinutes: 120,
  capacityPercent: 50,
  peopleCount: 2,
  productionMemberships: [{ productionId: 'prod-1', productionIndex: 0, quantity: 10 }],
  components: [{ allocationId: 'alloc-1', parentOperationId: 'parent-1', productionId: 'prod-1', quantity: 10 }],
  ...extra
});

const draft = (allocations = [allocation()]) => ({
  draftId: 'draft-1',
  planningId: 'plan-1',
  allocations,
  manualWorkDates: [],
  dailyTeamOverrides: {},
  dirty: false
});

const baseIntent = {
  type: 'MOVE_ALLOCATION',
  allocationId: 'alloc-1',
  operationId: 'op-1',
  parentOperationId: 'parent-1',
  productionId: 'prod-1',
  productionIndex: 0,
  from: { date: '2026-07-20', machineId: 'M1' },
  to: { date: '2026-07-21', machineId: 'M2' },
  source: 'gantt-drag',
  destination: { kind: 'empty', occupiedAllocationIds: [] }
};

const baseMove = {
  allocation: allocation(),
  parentOperationId: 'parent-1',
  machine: { machineId: 'M2', machineName: 'M2' }
};

const moveConfiguration = {
  machineId: 'M2',
  machineName: 'M2',
  date: '2026-07-21',
  peopleCount: 3,
  productivityRows: [{ rowId: 'matrix-1' }]
};

const calendarSnapshot = {
  machines: [{ machineId: 'M1' }, { machineId: 'M2' }],
  days: [{ date: '2026-07-21' }, { date: '2026-07-22' }, { date: '2026-07-23' }]
};

const validationContext = { stock: [], operations: [] };
const draftContext = { now: '2026-07-20T12:00:00.000Z', dailyMinutes: 540 };

{
  const operation = buildPlanningManualMoveOperation({
    intent: baseIntent,
    move: baseMove,
    moveConfiguration
  });
  assert.equal(operation.baseMoveIntent.type, 'MOVE_ALLOCATION');
  assert.equal(operation.baseMoveIntent.allocationId, 'alloc-1');
  assert.equal(operation.baseMoveIntent.targetDate, '2026-07-21');
  assert.equal(operation.baseMoveIntent.targetMachineId, 'M2');
  assert.equal(operation.baseMoveIntent.peopleCount, 3);
  assert.equal(operation.baseMoveIntent.manualMovePolicy, 'stock_only_independent');
  assert.equal(operation.intent.operationId, 'op-1');
  assert.equal(operation.intent.parentOperationId, 'parent-1');
  assert.equal(operation.intent.productionId, 'prod-1');
  assert.equal(operation.intent.productionIndex, 0);
}

{
  const activeDraft = draft();
  const acceptedDraft = {
    ...activeDraft,
    dirty: true,
    allocations: [{ ...activeDraft.allocations[0], machineId: 'M2', date: '2026-07-21', peopleCount: 3 }],
    validation: { valid: true, errors: [], warnings: [{ code: 'WARN', allocationIds: ['alloc-1'] }] }
  };
  const calls = [];
  const result = await runPlanningManualMoveController({
    currentDraft: activeDraft,
    intent: baseIntent,
    move: baseMove,
    moveConfiguration,
    calendarSnapshot,
    validationContext,
    draftContext,
    applyTransaction: payload => {
      calls.push(['transaction', payload.intent.type, payload.intent.allocationId, payload.intent.targetDate, payload.intent.targetMachineId]);
      assert.deepEqual(payload.draftContext.machines, calendarSnapshot.machines);
      assert.deepEqual(payload.draftContext.matrixRows, moveConfiguration.productivityRows);
      return {
        accepted: true,
        draft: acceptedDraft,
        validation: acceptedDraft.validation,
        warnings: acceptedDraft.validation.warnings,
        blockingIssues: []
      };
    },
    onAccepted: transaction => {
      calls.push(['accepted', transaction.draft.allocations[0].allocationId, transaction.draft.allocations[0].operationId]);
    }
  });
  assert.equal(result.accepted, true);
  assert.deepEqual(calls, [
    ['transaction', 'MOVE_ALLOCATION', 'alloc-1', '2026-07-21', 'M2'],
    ['accepted', 'alloc-1', 'op-1']
  ]);
  assert.equal(result.transaction.draft.allocations[0].allocationId, 'alloc-1');
  assert.equal(result.transaction.draft.allocations[0].parentOperationId, 'parent-1');
  assert.deepEqual(result.transaction.draft.allocations[0].productionMemberships, [{ productionId: 'prod-1', productionIndex: 0, quantity: 10 }]);
}

{
  const activeDraft = draft();
  const before = JSON.stringify(activeDraft);
  const diagnostics = {
    valid: false,
    errors: [{ code: 'STOCK_NEGATIVE_BALANCE', message: 'Sem estoque', allocationIds: ['alloc-1'] }],
    manualMoveStockAnalysis: {
      stockIssues: [{ code: 'STOCK_NEGATIVE_BALANCE', message: 'Sem estoque', allocationIds: ['alloc-1'] }],
      maxQuantity: 0
    }
  };
  const callbacks = [];
  const result = await runPlanningManualMoveController({
    currentDraft: activeDraft,
    intent: baseIntent,
    move: baseMove,
    moveConfiguration,
    calendarSnapshot,
    validationContext,
    draftContext,
    applyTransaction: () => ({
      accepted: false,
      draft: activeDraft,
      validation: diagnostics,
      warnings: [],
      blockingIssues: diagnostics.errors
    }),
    onAccepted: () => callbacks.push('accepted'),
    onStockUnavailable: payload => {
      callbacks.push(`unavailable:${payload.analysis.validation.errors[0].code}`);
    }
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, 'rejected');
  assert.equal(JSON.stringify(activeDraft), before, 'draft ativo nao pode ser alterado em rejeicao');
  assert.deepEqual(callbacks, ['unavailable:STOCK_NEGATIVE_BALANCE']);
  assert.deepEqual(result.analysis.validation, diagnostics);
}

{
  const activeDraft = draft();
  let appliedDraft = activeDraft;
  await assert.rejects(
    runPlanningManualMoveController({
      currentDraft: activeDraft,
      intent: baseIntent,
      move: baseMove,
      moveConfiguration,
      calendarSnapshot,
      validationContext,
      draftContext,
      applyTransaction: () => {
        throw new Error('falha controlada');
      },
      onAccepted: transaction => { appliedDraft = transaction.draft; }
    }),
    /falha controlada/
  );
  assert.equal(appliedDraft, activeDraft, 'erro nao pode aplicar candidato');
}

{
  let transactionCalls = 0;
  await assert.rejects(
    runPlanningManualMoveController({
      currentDraft: draft([]),
      intent: baseIntent,
      move: baseMove,
      moveConfiguration,
      calendarSnapshot,
      validationContext,
      draftContext,
      applyTransaction: () => {
        transactionCalls += 1;
        return { accepted: true, draft: draft(), validation: {}, warnings: [], blockingIssues: [] };
      }
    }),
    /Allocation nao encontrada/
  );
  assert.equal(transactionCalls, 0, 'allocation inexistente deve bloquear antes da transacao');
}

{
  const activeDraft = draft();
  let appliedDraft = activeDraft;
  const acceptedDraft = {
    ...activeDraft,
    dirty: true,
    allocations: [{ ...activeDraft.allocations[0], date: '2026-07-23' }],
    validation: { valid: true, errors: [], warnings: [] }
  };
  const order = [];
  const result = await runPlanningManualMoveController({
    currentDraft: activeDraft,
    intent: baseIntent,
    move: baseMove,
    moveConfiguration,
    calendarSnapshot,
    validationContext,
    draftContext,
    applyTransaction: payload => {
      order.push(payload.intent.remainderDate ? `transaction:${payload.intent.remainderDate}` : `transaction:${payload.intent.quantity || 'full'}`);
      if (!payload.intent.quantity) {
        return {
          accepted: false,
          draft: activeDraft,
          validation: { manualMoveStockAnalysis: { maxQuantity: 6, stockIssues: [{ code: 'STOCK' }] } },
          warnings: [],
          blockingIssues: [{ code: 'STOCK', message: 'Estoque parcial' }]
        };
      }
      if (payload.intent.remainderDate === '2026-07-23' || !payload.intent.remainderDate) {
        return { accepted: true, draft: acceptedDraft, validation: acceptedDraft.validation, warnings: [], blockingIssues: [] };
      }
      return {
        accepted: false,
        draft: activeDraft,
        validation: { errors: [{ message: 'Data inviavel' }] },
        warnings: [],
        blockingIssues: [{ message: 'Data inviavel' }]
      };
    },
    onBeforePartialChoice: () => order.push('before-partial'),
    onStockPartialChoice: async ({ getDateOptions }) => {
      order.push('partial-modal');
      const options = await getDateOptions(6);
      order.push(`options:${options.map(option => `${option.date}:${option.viable}`).join('|')}`);
      return { quantity: 6, remainderDate: '2026-07-23' };
    },
    onAccepted: transaction => {
      order.push('accepted');
      appliedDraft = transaction.draft;
    }
  });
  assert.equal(result.accepted, true);
  assert.equal(appliedDraft, acceptedDraft, 'draft so deve ser aplicado pelo callback de aceite');
  assert.deepEqual(order, [
    'transaction:full',
    'before-partial',
    'partial-modal',
    'transaction:2026-07-22',
    'transaction:2026-07-23',
    'options:2026-07-22:false|2026-07-23:true',
    'accepted'
  ]);
}

{
  const controllerSource = readFileSync(
    new URL('../shared/planning-controller/planningManualMoveController.js', import.meta.url),
    'utf8'
  );
  assert.match(controllerSource, /applyManualScheduleTransaction/);
  assert.doesNotMatch(controllerSource, /\b(simulateCurrent|buildPlan|scheduleOperations|reoptimizePlanningFuture)\b/);
  assert.doesNotMatch(controllerSource, /\bfetch\s*\(|\bapi\s*\(|document\.|window\.|localStorage|sessionStorage/);
}

console.log('planningManualMoveController.test.js ok');
process.exit(0);
