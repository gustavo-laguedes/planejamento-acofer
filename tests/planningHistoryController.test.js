import assert from 'node:assert/strict';
import { createPlanningHistoryController } from '../shared/planning-controller/planningHistoryController.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseline = {
  manualScheduleDraft: {
    allocations: [
      { allocationId: 'alloc-1', operationId: 'op-1', date: '2026-08-10', machineId: 'M1', quantity: 100 }
    ],
    manualWorkDates: [],
    dailyTeamOverrides: {}
  },
  currentSimulation: {
    operations: [
      { operationId: 'op-1', startDate: '2026-08-10', allocationId: 'alloc-1' }
    ]
  },
  operationOverrides: {},
  operationSplits: [],
  dailyTeamOverrides: {},
  manualWorkDates: [],
  hasPendingSimulationChanges: false
};

const moved = clone(baseline);
moved.manualScheduleDraft.allocations[0].date = '2026-08-11';
moved.currentSimulation.operations[0].startDate = '2026-08-11';

const split = clone(moved);
split.manualScheduleDraft.allocations = [
  {
    allocationId: 'alloc-1-a',
    splitParentOperationId: 'op-1',
    parentOperationId: 'op-1',
    date: '2026-08-11',
    machineId: 'M1',
    quantity: 40
  },
  {
    allocationId: 'alloc-1-b',
    splitParentOperationId: 'op-1',
    parentOperationId: 'op-1',
    date: '2026-08-11',
    machineId: 'M1',
    quantity: 60
  }
];

{
  const calls = [];
  const emptyController = createPlanningHistoryController({
    restoreSnapshot: () => calls.push('restore'),
    onBeforeRestore: () => calls.push('before'),
    onAfterRestore: () => calls.push('after')
  });
  assert.equal(emptyController.canUndo(), false);
  assert.equal(emptyController.canRedo(), false);
  assert.deepEqual(emptyController.undo(), { changed: false, state: null, history: emptyController.getHistory() });
  assert.deepEqual(emptyController.redo(), { changed: false, state: null, history: emptyController.getHistory() });
  assert.deepEqual(calls, [], 'historico vazio nao deve chamar callbacks');
}

let currentState = clone(baseline);
const callbackOrder = [];
const controller = createPlanningHistoryController({
  initialState: currentState,
  captureSnapshot: () => clone(currentState),
  restoreSnapshot: snapshot => {
    callbackOrder.push('restore');
    currentState = clone(snapshot);
  },
  onBeforeRestore: () => callbackOrder.push('before'),
  onAfterRestore: () => callbackOrder.push('after')
});

const previousBaseline = clone(currentState);
currentState = clone(moved);
controller.record(previousBaseline);
assert.equal(controller.canUndo(), true);
assert.equal(controller.canRedo(), false);

previousBaseline.manualScheduleDraft.allocations[0].allocationId = 'mutated-before';
currentState.manualScheduleDraft.allocations[0].allocationId = 'mutated-after';

const undoMove = controller.undo();
assert.equal(undoMove.changed, true);
assert.deepEqual(callbackOrder, ['before', 'restore', 'after']);
assert.deepEqual(currentState, baseline, 'undo deve restaurar o snapshot anterior completo');
assert.equal(currentState.manualScheduleDraft.allocations[0].allocationId, 'alloc-1');
assert.equal(controller.canUndo(), false);
assert.equal(controller.canRedo(), true);

callbackOrder.length = 0;
const redoMove = controller.redo();
assert.equal(redoMove.changed, true);
assert.deepEqual(callbackOrder, ['before', 'restore', 'after']);
assert.equal(currentState.manualScheduleDraft.allocations[0].date, '2026-08-11');
assert.equal(currentState.manualScheduleDraft.allocations[0].allocationId, 'alloc-1');
assert.equal(controller.canUndo(), true);
assert.equal(controller.canRedo(), false);

const previousMoved = clone(currentState);
currentState = clone(split);
controller.record(previousMoved);
assert.equal(controller.canUndo(), true);
assert.equal(controller.canRedo(), false);
assert.deepEqual(
  currentState.manualScheduleDraft.allocations.map(allocation => allocation.allocationId),
  ['alloc-1-a', 'alloc-1-b'],
  'nova alteracao deve preservar IDs capturados'
);

controller.undo();
assert.equal(controller.canRedo(), true);
const previousAfterUndo = clone(currentState);
const branched = clone(currentState);
branched.manualScheduleDraft.allocations[0].machineId = 'M2';
currentState = branched;
controller.record(previousAfterUndo);
assert.equal(controller.canRedo(), false, 'nova alteracao apos undo deve invalidar redo');

const resetState = clone(split);
currentState = resetState;
controller.resetFromCurrent();
resetState.manualScheduleDraft.allocations[0].allocationId = 'mutated-reset-input';
assert.equal(controller.canUndo(), false);
assert.equal(controller.canRedo(), false);
assert.equal(controller.getHistory().present.manualScheduleDraft.allocations[0].allocationId, 'alloc-1-a');

console.log('planningHistoryController.test.js ok');
