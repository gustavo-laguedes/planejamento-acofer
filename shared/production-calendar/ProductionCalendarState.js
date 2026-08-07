export const PRODUCTION_CALENDAR_ZOOM_LEVELS = [
  { id: 'compact', cardWidth: 160 },
  { id: 'normal', cardWidth: 190 },
  { id: 'comfortable', cardWidth: 225 },
  { id: 'large', cardWidth: 260 }
];

export const PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID = 'normal';
export const PRODUCTION_CALENDAR_DEFAULT_VISIBLE_DAY_COUNT = 8;

const DEFAULT_STATE = {
  zoom: PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID,
  visibleDayCount: null,
  totalDayCount: 0,
  visibleEndDate: null,
  productionLimitDate: null,
  scroll: {
    left: 0,
    top: 0
  },
  details: {
    isOpen: false,
    allocation: null,
    opener: null
  },
  selectedAllocationId: null,
  drag: {
    draggingAllocationId: null,
    dragPointerX: 0,
    dragPointerY: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragActive: false,
    dragOriginDate: null,
    dragOriginMachineId: null,
    hoverDate: null,
    hoverMachineId: null,
    destinationKind: null,
    occupiedAllocationIds: []
  },
  filters: {}
};

export function getProductionCalendarZoomIndex(zoomId = PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID) {
  const index = PRODUCTION_CALENDAR_ZOOM_LEVELS.findIndex(level => level.id === zoomId);
  if (index >= 0) return index;
  return PRODUCTION_CALENDAR_ZOOM_LEVELS.findIndex(level => level.id === PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID);
}

export function getProductionCalendarZoomLevel(zoomId = PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID) {
  return PRODUCTION_CALENDAR_ZOOM_LEVELS[getProductionCalendarZoomIndex(zoomId)];
}

export function setProductionCalendarZoom(state, zoomId) {
  if (!state) return getProductionCalendarZoomLevel();
  const level = getProductionCalendarZoomLevel(zoomId);
  state.zoom = level.id;
  return level;
}

export function stepProductionCalendarZoom(state, direction) {
  const currentIndex = getProductionCalendarZoomIndex(state?.zoom);
  const nextIndex = Math.max(
    0,
    Math.min(PRODUCTION_CALENDAR_ZOOM_LEVELS.length - 1, currentIndex + direction)
  );
  return setProductionCalendarZoom(state, PRODUCTION_CALENDAR_ZOOM_LEVELS[nextIndex].id);
}

export function resetProductionCalendarZoom(state) {
  return setProductionCalendarZoom(state, PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID);
}

export function resolveProductionCalendarVisibleDayCount(visibleDayCount, totalDayCount) {
  const total = Math.max(0, Number(totalDayCount) || 0);
  if (!total) return 0;
  const requested = Number(visibleDayCount);
  const initial = Number.isFinite(requested) && requested > 0
    ? Math.floor(requested)
    : PRODUCTION_CALENDAR_DEFAULT_VISIBLE_DAY_COUNT;
  return Math.min(total, Math.max(1, initial));
}

export function setProductionCalendarHorizon(state, visibleDayCount, totalDayCount) {
  if (!state) return 0;
  state.totalDayCount = Math.max(0, Number(totalDayCount) || 0);
  state.visibleDayCount = resolveProductionCalendarVisibleDayCount(visibleDayCount, state.totalDayCount);
  return state.visibleDayCount;
}

export function expandProductionCalendarHorizon(state, additionalDays, totalDayCount = state?.totalDayCount) {
  const current = resolveProductionCalendarVisibleDayCount(state?.visibleDayCount, totalDayCount);
  const expanded = current + Math.max(0, Number(additionalDays) || 0);
  return setProductionCalendarHorizon(state, expanded, Math.max(Number(totalDayCount) || 0, expanded));
}

export function showAllProductionCalendarDays(state, totalDayCount = state?.totalDayCount) {
  return setProductionCalendarHorizon(state, totalDayCount, totalDayCount);
}

export function openProductionCalendarDetails(state, allocation, opener = null) {
  if (!state) return null;
  state.details = {
    ...(state.details || {}),
    isOpen: Boolean(allocation),
    allocation: allocation || null,
    opener: opener || null
  };
  return state.details;
}

export function closeProductionCalendarDetails(state) {
  if (!state) return null;
  state.details = {
    ...(state.details || {}),
    isOpen: false,
    allocation: null,
    opener: null
  };
  return state.details;
}

export function selectProductionCalendarAllocation(state, allocationId) {
  if (!state) return null;
  state.selectedAllocationId = allocationId === null || allocationId === undefined
    ? null
    : String(allocationId);
  return state.selectedAllocationId;
}

export function clearProductionCalendarSelection(state) {
  return selectProductionCalendarAllocation(state, null);
}

export function toggleProductionCalendarSelection(state, allocationId) {
  if (!state) return null;
  const normalizedId = allocationId === null || allocationId === undefined
    ? null
    : String(allocationId);
  if (!normalizedId || state.selectedAllocationId === normalizedId) {
    return clearProductionCalendarSelection(state);
  }
  return selectProductionCalendarAllocation(state, normalizedId);
}

export function reconcileProductionCalendarSelection(state, allocations = []) {
  if (!state?.selectedAllocationId) return null;
  const selectedExists = allocations.some(allocation => {
    return String(allocation?.allocationId) === String(state.selectedAllocationId);
  });
  if (!selectedExists) clearProductionCalendarSelection(state);
  return state.selectedAllocationId;
}

export function startProductionCalendarDragIntent(state, allocation, pointerX, pointerY) {
  if (!state) return null;
  state.drag = {
    ...(state.drag || {}),
    draggingAllocationId: allocation?.allocationId === null || allocation?.allocationId === undefined
      ? null
      : String(allocation.allocationId),
    dragPointerX: Number(pointerX) || 0,
    dragPointerY: Number(pointerY) || 0,
    dragStartX: Number(pointerX) || 0,
    dragStartY: Number(pointerY) || 0,
    dragActive: false,
    dragOriginDate: allocation?.date || null,
    dragOriginMachineId: allocation?.machineId === null || allocation?.machineId === undefined
      ? null
      : String(allocation.machineId),
    hoverDate: null,
    hoverMachineId: null,
    destinationKind: null,
    occupiedAllocationIds: []
  };
  return state.drag;
}

export function activateProductionCalendarDrag(state) {
  if (!state?.drag?.draggingAllocationId) return null;
  state.drag.dragActive = true;
  return state.drag;
}

export function updateProductionCalendarDragPointer(state, pointerX, pointerY) {
  if (!state?.drag?.draggingAllocationId) return null;
  state.drag.dragPointerX = Number(pointerX) || 0;
  state.drag.dragPointerY = Number(pointerY) || 0;
  return state.drag;
}

export function updateProductionCalendarDragHover(state, date = null, machineId = null, destinationKind = null, occupiedAllocationIds = []) {
  if (!state?.drag) return null;
  state.drag.hoverDate = date || null;
  state.drag.hoverMachineId = machineId === null || machineId === undefined ? null : String(machineId);
  state.drag.destinationKind = destinationKind || null;
  state.drag.occupiedAllocationIds = Array.isArray(occupiedAllocationIds)
    ? occupiedAllocationIds.map(id => String(id)).filter(Boolean)
    : [];
  return state.drag;
}

export function finishProductionCalendarDrag(state) {
  return cancelProductionCalendarDrag(state);
}

export function cancelProductionCalendarDrag(state) {
  if (!state) return null;
  state.drag = {
    ...DEFAULT_STATE.drag
  };
  return state.drag;
}

/**
 * Creates the visual-only state container for the production calendar.
 *
 * This module intentionally keeps only presentation state. Business rules,
 * planning mutations, stock checks, and recalculation do not belong here.
 *
 * @param {Partial<typeof DEFAULT_STATE>} initialState
 * @returns {typeof DEFAULT_STATE}
 */
export function createProductionCalendarState(initialState = {}) {
  const state = {
    ...DEFAULT_STATE,
    ...initialState,
    scroll: {
      ...DEFAULT_STATE.scroll,
      ...(initialState.scroll || {})
    },
    details: {
      ...DEFAULT_STATE.details,
      ...(initialState.details || {})
    },
    selectedAllocationId: initialState.selectedAllocationId === null || initialState.selectedAllocationId === undefined
      ? null
      : String(initialState.selectedAllocationId),
    filters: {
      ...DEFAULT_STATE.filters,
      ...(initialState.filters || {})
    },
    drag: {
      ...DEFAULT_STATE.drag,
      ...(initialState.drag || {})
    }
  };
  setProductionCalendarZoom(state, initialState.zoom || DEFAULT_STATE.zoom);
  return state;
}
