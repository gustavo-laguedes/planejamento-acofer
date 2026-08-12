import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
const controllerSource = readFileSync(new URL('../shared/planning-controller/planningHistoryController.js', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js', import.meta.url), 'utf8');

assert.match(controllerSource, /undoManualScheduleHistory/);
assert.match(controllerSource, /redoManualScheduleHistory/);
assert.match(controllerSource, /recordManualScheduleHistory/);
assert.match(controllerSource, /restoreSnapshot/);
assert.doesNotMatch(controllerSource, /simulatePlanningRequest|reoptimizePlanningFuture|scheduler|scheduleOperations/i);
assert.match(planningSource, /createPlanningHistoryController/);
assert.match(planningSource, /recordAcceptedManualState\(previousManualState\)/);
assert.match(planningSource, /manualScheduleHistory\.resetFromCurrent\(\)/);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarToolbar.js', import.meta.url)), false);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url)), false);
assert.match(planningSource, /canUndoManualChange|canRedoManualChange/);
assert.match(planningSource, /function\s+undoLastProductionCalendarChange\(\)\s*\{\s*manualScheduleHistory\.undo\(\);\s*\}/);
assert.match(planningSource, /function\s+redoProductionCalendarChange\(\)\s*\{\s*manualScheduleHistory\.redo\(\);\s*\}/);
assert.match(planningSource, /onRequestUndoManualChange:\s*\(\)\s*=>\s*undoLastProductionCalendarChange\(\)/);
assert.match(planningSource, /onRequestRedoManualChange:\s*\(\)\s*=>\s*redoProductionCalendarChange\(\)/);
assert.match(rendererSource, /data-action'\s*,\s*'undo-manual-change'|dataset\.action\s*=\s*'undo-manual-change'/);
assert.match(rendererSource, /data-action'\s*,\s*'redo-manual-change'|dataset\.action\s*=\s*'redo-manual-change'/);
assert.match(controllerSource, /undoManualScheduleHistory|redoManualScheduleHistory/);
assert.doesNotMatch(rendererSource, /planningHistoryController|manualScheduleHistory\.service|undoManualScheduleHistory|redoManualScheduleHistory/);
assert.doesNotMatch(rendererSource, /simulateCurrent|reoptimizePlanningFuture|persistAutomaticBaselineDiscard|savePlanningManualSchedule|buildPlan|scheduler/i);

console.log('manualScheduleHistory.service.test.js ok');
