import {
  clearProductionCalendarSelection,
  closeProductionCalendarDetails,
  createProductionCalendarState,
  openProductionCalendarDetails,
  reconcileProductionCalendarSelection,
  resetProductionCalendarZoom,
  stepProductionCalendarZoom,
  toggleProductionCalendarSelection
} from './ProductionCalendarState.js';
import { ProductionCalendarDetails } from './ProductionCalendarDetails.js';
import {
  applyProductionCalendarGridZoom,
  ProductionCalendarGrid
} from './ProductionCalendarGrid.js';
import { createProductionCalendarDragController } from './ProductionCalendarDrag.js';
import {
  ProductionCalendarToolbar,
  updateProductionCalendarToolbar
} from './ProductionCalendarToolbar.js';
import { validateProductionCalendarAllocations } from './productionCalendar.validation.js';

function getScrollableGrid(wrapper) {
  return wrapper?.querySelector('.production-calendar-grid') || null;
}

function getScrollRatio(grid) {
  if (!grid) return { left: 0, top: 0 };
  return {
    left: grid.scrollWidth > grid.clientWidth
      ? grid.scrollLeft / (grid.scrollWidth - grid.clientWidth)
      : 0,
    top: grid.scrollHeight > grid.clientHeight
      ? grid.scrollTop / (grid.scrollHeight - grid.clientHeight)
      : 0
  };
}

function restoreScrollRatio(grid, ratio) {
  if (!grid) return;
  grid.scrollLeft = Math.round((grid.scrollWidth - grid.clientWidth) * (ratio?.left || 0));
  grid.scrollTop = Math.round((grid.scrollHeight - grid.clientHeight) * (ratio?.top || 0));
}

function storeGridScroll(state, grid) {
  if (!state || !grid) return;
  state.scroll = {
    left: grid.scrollLeft,
    top: grid.scrollTop
  };
}

function restoreGridScroll(state, grid) {
  if (!grid) return;
  grid.scrollLeft = Number(state?.scroll?.left) || 0;
  grid.scrollTop = Number(state?.scroll?.top) || 0;
}

/**
 * @typedef {Object} ProductionCalendarAllocation
 * @property {string|number} allocationId
 * @property {string|number} operationId
 * @property {string|number} planningId
 * @property {string|number} materialId
 * @property {string} materialCode
 * @property {string} materialName
 * @property {string|number} machineId
 * @property {string} machineName
 * @property {string} date ISO date in YYYY-MM-DD format.
 * @property {string} startTime Time in HH:mm format.
 * @property {string} endTime Time in HH:mm format.
 * @property {number} quantity
 * @property {string} unit
 * @property {number} durationMinutes
 * @property {number} capacityPercent
 * @property {number} peopleCount
 * @property {number} sequence
 * @property {string} source
 * @property {string} status
 */

/**
 * @typedef {Object} ProductionCalendarProps
 * @property {Array<string|Date|Object>} days
 * @property {Array<Object>} machines
 * @property {Array<ProductionCalendarAllocation>} allocations
 * @property {Object} permissions
 * @property {Object} visualState
 * @property {(allocation: ProductionCalendarAllocation) => void} [onOpenDetails]
 * @property {(intent: Object) => void} [onRequestMove]
 * @property {(visualState: Object) => void} [onVisualStateChange]
 */

/**
 * Main shell for the isolated production calendar.
 *
 * It receives ready-to-render data, composes the toolbar and grid, and does not
 * call APIs or mutate planning data.
 *
 * @param {ProductionCalendarProps} props
 * @returns {HTMLElement}
 */
export function ProductionCalendar({
  days = [],
  machines = [],
  allocations = [],
  permissions = {},
  visualState = {},
  onRequestMove,
  onVisualStateChange
} = {}) {
  const state = createProductionCalendarState(visualState);
  const validation = validateProductionCalendarAllocations(allocations);
  reconcileProductionCalendarSelection(state, allocations);
  const wrapper = document.createElement('section');
  wrapper.className = 'production-calendar-container';
  wrapper.dataset.zoom = String(state.zoom);

  let toolbar;
  let detailsElement = null;
  let dragController = null;

  const getSelectedAllocation = () => {
    if (!state.selectedAllocationId) return null;
    return allocations.find(allocation => {
      return String(allocation?.allocationId) === String(state.selectedAllocationId);
    }) || null;
  };

  const updateSelectionPresentation = () => {
    const selectedAllocationId = state.selectedAllocationId ? String(state.selectedAllocationId) : null;
    wrapper.querySelectorAll('.production-calendar-card').forEach(card => {
      const selected = Boolean(selectedAllocationId && card.dataset.allocationId === selectedAllocationId);
      card.dataset.selected = String(selected);
      const selector = card.querySelector('.production-calendar-card-selector');
      if (!selector) return;
      selector.setAttribute('aria-pressed', String(selected));
      selector.title = selected ? 'Cancelar sele\u00e7\u00e3o deste bloco' : 'Selecionar este bloco';
    });
    updateProductionCalendarToolbar(toolbar, state, {
      selectedAllocation: getSelectedAllocation()
    });
    if (typeof onVisualStateChange === 'function') {
      onVisualStateChange({ selectedAllocationId: state.selectedAllocationId });
    }
  };

  const closeDetails = () => {
    const opener = state.details?.opener;
    closeProductionCalendarDetails(state);
    if (detailsElement?.parentNode) detailsElement.parentNode.removeChild(detailsElement);
    detailsElement = null;
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      opener.focus({ preventScroll: true });
    }
  };

  const renderDetails = () => {
    if (detailsElement?.parentNode) detailsElement.parentNode.removeChild(detailsElement);
    detailsElement = null;
    if (!state.details?.isOpen || !state.details?.allocation) return;

    detailsElement = ProductionCalendarDetails({
      allocation: state.details.allocation,
      onClose: closeDetails
    });
    wrapper.appendChild(detailsElement);
  };

  const openDetails = (allocation, opener) => {
    openProductionCalendarDetails(state, allocation, opener);
    renderDetails();
  };

  const syncZoomPresentation = scrollRatio => {
    const grid = getScrollableGrid(wrapper);
    wrapper.dataset.zoom = String(state.zoom);
    updateProductionCalendarToolbar(toolbar, state, {
      selectedAllocation: getSelectedAllocation()
    });
    applyProductionCalendarGridZoom(grid, {
      ...(grid?.__productionCalendarZoomContext || {}),
      zoom: state.zoom
    });
    restoreScrollRatio(grid, scrollRatio);
  };

  toolbar = ProductionCalendarToolbar({
    permissions,
    state,
    actions: {
      onZoomOut: () => {
        const grid = getScrollableGrid(wrapper);
        const ratio = getScrollRatio(grid);
        stepProductionCalendarZoom(state, -1);
        syncZoomPresentation(ratio);
      },
      onZoomIn: () => {
        const grid = getScrollableGrid(wrapper);
        const ratio = getScrollRatio(grid);
        stepProductionCalendarZoom(state, 1);
        syncZoomPresentation(ratio);
      },
      onZoomReset: () => {
        const grid = getScrollableGrid(wrapper);
        const ratio = getScrollRatio(grid);
        resetProductionCalendarZoom(state);
        syncZoomPresentation(ratio);
      },
      onGoToStart: () => {
        const grid = getScrollableGrid(wrapper);
        if (!grid) return;
        grid.scrollLeft = 0;
        grid.scrollTop = 0;
        storeGridScroll(state, grid);
      },
      onClearSelection: () => {
        clearProductionCalendarSelection(state);
        updateSelectionPresentation();
      }
    }
  });
  wrapper.appendChild(toolbar);

  if (!validation.valid) {
    const errorBox = document.createElement('div');
    errorBox.className = 'production-calendar-error';
    errorBox.setAttribute('role', 'alert');
    errorBox.innerHTML = `
      <strong>Dados invalidos para o calendario de producao.</strong>
      <ul>
        ${validation.errors.map(error => `<li>${error.message}</li>`).join('')}
      </ul>
    `;
    wrapper.appendChild(errorBox);
    return wrapper;
  }

  const grid = ProductionCalendarGrid({
    days,
    machines,
    allocations,
    state,
    onOpenDetails: openDetails,
    onStartDrag: (event, allocation, card) => {
      dragController?.start(event, allocation, card);
    },
    shouldSuppressClick: allocationId => {
      return Boolean(dragController?.shouldSuppressClick(allocationId));
    },
    onToggleSelection: allocation => {
      toggleProductionCalendarSelection(state, allocation?.allocationId);
      reconcileProductionCalendarSelection(state, allocations);
      updateSelectionPresentation();
    }
  });
  grid.addEventListener('click', event => {
    if (event.target.closest('.production-calendar-card-selector')) return;
    const cell = event.target.closest('.production-calendar-cell');
    if (!cell || !grid.contains(cell)) return;
    const selectedAllocation = getSelectedAllocation();
    if (!selectedAllocation || typeof onRequestMove !== 'function') return;
    const date = cell.dataset.date || null;
    const machineId = cell.dataset.machineId || null;
    if (!date || !machineId) return;
    if (String(selectedAllocation.date || '') === String(date) && String(selectedAllocation.machineId || '') === String(machineId)) return;
    const occupiedAllocationIds = [...cell.querySelectorAll('.production-calendar-card[data-allocation-id]')]
      .map(card => card.dataset.allocationId)
      .filter(id => id !== null && id !== undefined && id !== '')
      .filter(id => String(id) !== String(selectedAllocation.allocationId));
    if (event.target.closest('.production-calendar-card')) {
      event.preventDefault();
      event.stopPropagation();
    }
    onRequestMove({
      type: 'MOVE_ALLOCATION',
      allocationId: selectedAllocation.allocationId,
      operationId: selectedAllocation.operationId,
      calendarParentOperationId: selectedAllocation.calendarParentOperationId,
      parentOperationId: selectedAllocation.parentOperationId,
      productionId: selectedAllocation.productionId,
      productionIndex: selectedAllocation.productionIndex,
      from: {
        date: selectedAllocation.date || null,
        machineId: selectedAllocation.machineId === null || selectedAllocation.machineId === undefined
          ? null
          : String(selectedAllocation.machineId)
      },
      to: { date, machineId },
      source: 'click_move',
      destination: {
        kind: occupiedAllocationIds.length ? 'occupied' : 'empty',
        occupiedAllocationIds
      }
    });
  }, true);
  wrapper.appendChild(grid);

  dragController = createProductionCalendarDragController({
    state,
    grid,
    root: wrapper,
    onRequestMove
  });
  wrapper.__productionCalendarDestroy = () => {
    dragController?.destroy();
  };
  updateSelectionPresentation();

  return wrapper;
}
