import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createManualScheduleHistory,
  recordManualScheduleHistory,
  redoManualScheduleHistory,
  resetManualScheduleHistory,
  undoManualScheduleHistory
} from '../services/manualScheduleHistory.service.js';

const baseline = {
  manualScheduleDraft: { allocations: [{ allocationId: 'a', date: '2026-07-21', machineId: 'M1' }], manualWorkDates: [], dailyTeamOverrides: {} },
  currentSimulation: { operations: [{ operationId: 'op', startDate: '2026-07-21' }] },
  operationOverrides: {}, operationSplits: [], dailyTeamOverrides: {}, manualWorkDates: []
};
const moved = JSON.parse(JSON.stringify(baseline));
moved.manualScheduleDraft.allocations[0].date = '2026-07-22';
const combined = JSON.parse(JSON.stringify(moved));
combined.manualScheduleDraft.manualWorkDates = ['2026-07-25'];
combined.manualScheduleDraft.dailyTeamOverrides = { '2026-07-22': { T1: 4 } };
combined.currentSimulation.operations[0].startDate = '2026-07-22';

let history = createManualScheduleHistory(baseline);
assert.equal(history.past.length, 0);
assert.equal(history.future.length, 0);
history = recordManualScheduleHistory(history, baseline, moved);
history = recordManualScheduleHistory(history, moved, combined);
assert.equal(history.past.length, 2);
assert.equal(history.future.length, 0);

const firstUndo = undoManualScheduleHistory(history);
assert.equal(firstUndo.changed, true);
assert.deepEqual(firstUndo.state, moved, 'undo deve restaurar snapshot completo anterior');
assert.equal(firstUndo.history.future.length, 1);
const secondUndo = undoManualScheduleHistory(firstUndo.history);
assert.deepEqual(secondUndo.state, baseline);
assert.equal(undoManualScheduleHistory(secondUndo.history).changed, false, 'não deve ultrapassar o estado inicial');

const firstRedo = redoManualScheduleHistory(secondUndo.history);
assert.deepEqual(firstRedo.state, moved);
const secondRedo = redoManualScheduleHistory(firstRedo.history);
assert.deepEqual(secondRedo.state, combined);
assert.equal(redoManualScheduleHistory(secondRedo.history).changed, false);

const newAfterUndo = JSON.parse(JSON.stringify(moved));
newAfterUndo.manualScheduleDraft.allocations[0].machineId = 'M2';
const branched = recordManualScheduleHistory(firstUndo.history, moved, newAfterUndo);
assert.equal(branched.future.length, 0, 'nova alteração após undo deve limpar redo');
newAfterUndo.manualScheduleDraft.allocations[0].date = 'MUTATED';
assert.equal(branched.present.manualScheduleDraft.allocations[0].date, '2026-07-22', 'histórico não pode compartilhar referências');

const cleared = resetManualScheduleHistory(baseline);
assert.equal(cleared.past.length, 0);
assert.equal(cleared.future.length, 0);

const planningSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const toolbarSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendarToolbar.js', import.meta.url), 'utf8');
const calendarSource = readFileSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../shared/production-calendar/production-calendar.css', import.meta.url), 'utf8');
const historyHandlers = planningSource.slice(
  planningSource.indexOf('function applyManualHistoryResult'),
  planningSource.indexOf('function findSimulationOperation')
);

assert.match(historyHandlers, /undoManualScheduleHistory/);
assert.match(historyHandlers, /redoManualScheduleHistory/);
assert.match(historyHandlers, /restoreDraftPlanningState/);
assert.doesNotMatch(historyHandlers, /simulatePlanningRequest|reoptimizePlanningFuture|scheduler|scheduleOperations/i);
assert.match(planningSource, /recordAcceptedManualState\(previousManualState\)/);
assert.match(planningSource, /manualScheduleHistory = resetManualScheduleHistory\(cloneDraftPlanningState\(\)\)/);
assert.match(toolbarSource, /label: '←'/);
assert.match(toolbarSource, /label: '→'/);
assert.match(toolbarSource, /Desfazer última alteração/);
assert.match(toolbarSource, /Refazer alteração/);
assert.match(toolbarSource, /production-calendar-manual-actions/);
assert.match(calendarSource, /onUndoManualChange/);
assert.match(calendarSource, /onRedoManualChange/);
assert.match(cssSource, /production-calendar-manual-actions[\s\S]*grid-area:\s*manual/);
assert.match(cssSource, /production-calendar-discard-button[\s\S]*background:\s*#dc2626/);
assert.match(cssSource, /production-calendar-toolbar[\s\S]*grid-template-areas:[\s\S]*manual/);

console.log('manualScheduleHistory.service.test.js ok');
