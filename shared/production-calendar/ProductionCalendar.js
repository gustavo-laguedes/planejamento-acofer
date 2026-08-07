import {
  clearProductionCalendarSelection,
  closeProductionCalendarDetails,
  createProductionCalendarState,
  expandProductionCalendarHorizon,
  openProductionCalendarDetails,
  reconcileProductionCalendarSelection,
  resetProductionCalendarZoom,
  setProductionCalendarHorizon,
  showAllProductionCalendarDays,
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
import {
  fillProductionCalendarDayRange,
  addProductionCalendarDays,
  extendProductionCalendarDayRange,
  formatProductionCalendarDate,
  getProductionCalendarProductionLimitDate,
  normalizeProductionCalendarDay
} from './productionCalendar.utils.js';

function openProductionCalendarModal(root, { title, body, actions = [] } = {}) {
  root.querySelector('.production-calendar-day-modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'production-calendar-day-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'production-calendar-day-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const heading = document.createElement('h2');
  heading.textContent = title;
  const content = document.createElement('div');
  content.className = 'production-calendar-day-modal-body';
  if (typeof body === 'string') content.textContent = body;
  else if (body) content.appendChild(body);
  const footer = document.createElement('div');
  footer.className = 'production-calendar-day-modal-actions';
  let resolveChoice;
  const close = value => {
    backdrop.remove();
    resolveChoice(value);
  };
  actions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.destructive ? 'danger-button' : (action.primary ? 'primary-button' : 'secondary-button');
    button.textContent = action.label;
    button.addEventListener('click', () => close(action.value));
    footer.appendChild(button);
  });
  modal.append(heading, content, footer);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close('cancel');
  });
  backdrop.addEventListener('keydown', event => {
    if (event.key === 'Escape') close('cancel');
  });
  footer.querySelector('button')?.focus();
  return new Promise(resolve => { resolveChoice = resolve; });
}

async function confirmProductionCalendarDayBlock(root) {
  return await openProductionCalendarModal(root, {
    title: 'Bloquear dia de produção',
    body: 'Existem produções programadas nesta data. Ao bloquear o dia, elas precisarão ser recalculadas ou o calendário ficará inconsistente.',
    actions: [
      { value: 'cancel', label: 'Cancelar' },
      { value: 'confirm', label: 'Bloquear e recalcular', primary: true }
    ]
  }) === 'confirm';
}

async function confirmDiscardAllProductionCalendarChanges(root) {
  return await openProductionCalendarModal(root, {
    title: 'Descartar todas as alterações do calendário?',
    body: 'Todos os arrastos, divisões, junções, alterações de equipe, liberações de dias e demais edições manuais serão removidos. O calendário voltará ao resultado original da simulação.',
    actions: [
      { value: 'cancel', label: 'Cancelar' },
      { value: 'confirm', label: 'Descartar alterações', destructive: true }
    ]
  }) === 'confirm';
}

async function editProductionCalendarDailyTeam(root, day, onSaveDailyTeam) {
  const form = document.createElement('form');
  form.className = 'production-calendar-team-form';
  (day.team?.shifts || []).forEach(shift => {
    const row = document.createElement('label');
    row.className = 'production-calendar-team-row';
    const label = document.createElement('span');
    label.textContent = `${shift.label} — padrão: ${shift.standardPeople}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.required = true;
    input.value = String(shift.availablePeople);
    input.dataset.shiftId = shift.shiftId;
    row.append(label, input);
    form.appendChild(row);
  });
  const choice = await openProductionCalendarModal(root, {
    title: `Equipe disponível em ${formatProductionCalendarDate(day.date)}`,
    body: form,
    actions: [
      { value: 'cancel', label: 'Cancelar' },
      { value: 'restore', label: 'Restaurar padrão' },
      { value: 'save', label: 'Salvar equipe do dia', primary: true }
    ]
  });
  if (choice === 'cancel') return;
  const overrides = {};
  if (choice === 'restore') {
    (day.team?.shifts || []).forEach(shift => { overrides[shift.shiftId] = null; });
  } else {
    const inputs = [...form.querySelectorAll('input[data-shift-id]')];
    if (inputs.some(input => !input.checkValidity() || !Number.isInteger(Number(input.value)) || Number(input.value) < 0)) {
      return onSaveDailyTeam?.({ date: day.date, overrides: null, invalid: true });
    }
    inputs.forEach(input => { overrides[input.dataset.shiftId] = Number(input.value); });
  }
  return onSaveDailyTeam?.({ date: day.date, overrides, restore: choice === 'restore' });
}

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
 * @property {(day: Object) => void} [onOpenDay]
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
  validation: scheduleValidation = null,
  permissions = {},
  visualState = {},
  onRequestMove,
  onEditAllocation,
  onTransportAllocation,
  onSplitAllocation,
  onOpenDay,
  onOpenFullscreen,
  onHorizonChange,
  onDiscardAllChanges,
  onOptimizeUtilization,
  onUndoManualChange,
  onRedoManualChange,
  onVisualStateChange,
  onToggleManualWorkDate,
  onSaveDailyTeam
} = {}) {
  const state = createProductionCalendarState(visualState);
  const normalizedDays = fillProductionCalendarDayRange(days.map(normalizeProductionCalendarDay));
  const productionLimitDate = getProductionCalendarProductionLimitDate(allocations)
    || normalizedDays.at(-1)?.date
    || null;
  const requestedVisibleEndDate = String(state.visibleEndDate || '');
  const visibleEndDate = requestedVisibleEndDate && requestedVisibleEndDate >= String(productionLimitDate || '')
    ? requestedVisibleEndDate
    : productionLimitDate;
  const availableDays = extendProductionCalendarDayRange(normalizedDays, visibleEndDate);
  state.productionLimitDate = productionLimitDate;
  state.visibleEndDate = visibleEndDate;
  setProductionCalendarHorizon(state, availableDays.length, availableDays.length);
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

  const toolbarContext = () => ({ selectedAllocation: getSelectedAllocation() });

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
    updateProductionCalendarToolbar(toolbar, state, toolbarContext());
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
    if (typeof onEditAllocation === 'function') {
      onEditAllocation(allocation, opener);
      return;
    }
    openProductionCalendarDetails(state, allocation, opener);
    renderDetails();
  };

  const syncZoomPresentation = scrollRatio => {
    const grid = getScrollableGrid(wrapper);
    wrapper.dataset.zoom = String(state.zoom);
    updateProductionCalendarToolbar(toolbar, state, toolbarContext());
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
      onExpandHorizon: additionalDays => {
        const currentEndDate = state.visibleEndDate || availableDays.at(-1)?.date;
        if (!currentEndDate) return;
        state.visibleEndDate = addProductionCalendarDays(currentEndDate, additionalDays);
        expandProductionCalendarHorizon(state, additionalDays);
        updateProductionCalendarToolbar(toolbar, state, toolbarContext());
        onVisualStateChange?.({
          visibleDayCount: state.visibleDayCount,
          visibleEndDate: state.visibleEndDate
        });
        onHorizonChange?.({
          visibleEndDate: state.visibleEndDate,
          productionLimitDate: state.productionLimitDate
        });
      },
      onShowAllDays: () => {
        state.productionLimitDate = getProductionCalendarProductionLimitDate(allocations)
          || normalizedDays.at(-1)?.date
          || null;
        state.visibleEndDate = state.productionLimitDate;
        const productionDayCount = normalizedDays.filter(day => !state.productionLimitDate || day.date <= state.productionLimitDate).length;
        showAllProductionCalendarDays(state, productionDayCount);
        updateProductionCalendarToolbar(toolbar, state, toolbarContext());
        onVisualStateChange?.({
          visibleDayCount: state.visibleDayCount,
          visibleEndDate: state.visibleEndDate
        });
        onHorizonChange?.({
          visibleEndDate: state.visibleEndDate,
          productionLimitDate: state.productionLimitDate
        });
      },
      onDiscardAllChanges: async () => {
        if (!state.hasManualChanges) return;
        const confirmed = await confirmDiscardAllProductionCalendarChanges(wrapper);
        if (!confirmed) return;
        await onDiscardAllChanges?.();
      },
      onOptimizeUtilization: () => onOptimizeUtilization?.(),
      onUndoManualChange: () => onUndoManualChange?.(),
      onRedoManualChange: () => onRedoManualChange?.(),
      onOpenFullscreen: () => onOpenFullscreen?.(wrapper),
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
      <strong>Não foi possível exibir o calendário de produção.</strong>
      <p>Os dados do calendário estão incompletos e precisam ser revisados.</p>
    `;
    wrapper.appendChild(errorBox);
    return wrapper;
  }

  const grid = ProductionCalendarGrid({
    days: availableDays,
    machines,
    allocations,
    validation: scheduleValidation,
    state,
    onOpenDay,
    onToggleManualWorkDate: permissions.canEditDaySettings ? async (day, enabled, input) => {
      input.disabled = true;
      try {
        if (!enabled && allocations.some(allocation => allocation.date === day.date)) {
          const confirmed = await confirmProductionCalendarDayBlock(wrapper);
          if (!confirmed) {
            input.checked = true;
            return;
          }
        }
        const result = await onToggleManualWorkDate?.({ date: day.date, enabled });
        if (!result?.accepted) input.checked = !enabled;
      } finally {
        if (input.isConnected) input.disabled = false;
      }
    } : undefined,
    onEditDailyTeam: permissions.canEditDaySettings
      ? day => editProductionCalendarDailyTeam(wrapper, day, onSaveDailyTeam)
      : undefined,
    onOpenDetails: openDetails,
    onEditAllocation: permissions.canEditAllocations ? onEditAllocation : undefined,
    onTransportAllocation: permissions.canEditAllocations ? onTransportAllocation : undefined,
    onSplitAllocation: permissions.canEditAllocations ? onSplitAllocation : undefined,
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
