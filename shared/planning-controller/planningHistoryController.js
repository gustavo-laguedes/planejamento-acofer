import {
  createManualScheduleHistory,
  recordManualScheduleHistory,
  redoManualScheduleHistory,
  resetManualScheduleHistory,
  undoManualScheduleHistory
} from '../../services/manualScheduleHistory.service.js';

function noop() {}

function resolveSnapshot(captureSnapshot) {
  return typeof captureSnapshot === 'function' ? captureSnapshot() : null;
}

export function createPlanningHistoryController({
  initialState = null,
  captureSnapshot = null,
  restoreSnapshot = null,
  onBeforeRestore = noop,
  onAfterRestore = noop
} = {}) {
  let history = createManualScheduleHistory(initialState);

  function getHistory() {
    return history;
  }

  function reset(state = null) {
    history = resetManualScheduleHistory(state);
    return history;
  }

  function resetFromCurrent() {
    return reset(resolveSnapshot(captureSnapshot));
  }

  function record(previousState) {
    history = recordManualScheduleHistory(
      history,
      previousState,
      resolveSnapshot(captureSnapshot)
    );
    return history;
  }

  function applyHistoryResult(result) {
    if (!result?.changed || !result.state) return { changed: false, state: null, history };
    history = result.history;
    onBeforeRestore(result.state);
    if (typeof restoreSnapshot === 'function') restoreSnapshot(result.state);
    onAfterRestore(result.state);
    return { changed: true, state: result.state, history };
  }

  function undo() {
    return applyHistoryResult(undoManualScheduleHistory(history));
  }

  function redo() {
    return applyHistoryResult(redoManualScheduleHistory(history));
  }

  function canUndo() {
    return (history?.past || []).length > 0;
  }

  function canRedo() {
    return (history?.future || []).length > 0;
  }

  return {
    getHistory,
    reset,
    resetFromCurrent,
    record,
    undo,
    redo,
    canUndo,
    canRedo
  };
}
