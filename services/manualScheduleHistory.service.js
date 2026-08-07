import { stableStringify } from './manualSchedulePersistence.service.js';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createManualScheduleHistory(initialState = null) {
  return {
    past: [],
    present: clone(initialState),
    future: []
  };
}

export function resetManualScheduleHistory(state = null) {
  return createManualScheduleHistory(state);
}

export function recordManualScheduleHistory(history, before, after) {
  const current = history || createManualScheduleHistory(before);
  if (stableStringify(before) === stableStringify(after)) return current;
  return {
    past: [...current.past, clone(before)],
    present: clone(after),
    future: []
  };
}

export function undoManualScheduleHistory(history) {
  if (!history?.past?.length) return { history, state: null, changed: false };
  const state = clone(history.past.at(-1));
  return {
    changed: true,
    state,
    history: {
      past: history.past.slice(0, -1).map(clone),
      present: clone(state),
      future: [clone(history.present), ...(history.future || []).map(clone)]
    }
  };
}

export function redoManualScheduleHistory(history) {
  if (!history?.future?.length) return { history, state: null, changed: false };
  const state = clone(history.future[0]);
  return {
    changed: true,
    state,
    history: {
      past: [...(history.past || []).map(clone), clone(history.present)],
      present: clone(state),
      future: history.future.slice(1).map(clone)
    }
  };
}
