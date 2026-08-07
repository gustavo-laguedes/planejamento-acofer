import {
  activateProductionCalendarDrag,
  cancelProductionCalendarDrag,
  finishProductionCalendarDrag,
  startProductionCalendarDragIntent,
  updateProductionCalendarDragHover,
  updateProductionCalendarDragPointer
} from './ProductionCalendarState.js';
import { getProductionCalendarAllocationColor } from './ProductionCalendarCard.js';
import {
  formatProductionCalendarDate,
  formatProductionCalendarQuantity
} from './productionCalendar.utils.js';

const DRAG_THRESHOLD_PX = 6;
const AUTO_SCROLL_EDGE_PX = 72;
const AUTO_SCROLL_MAX_SPEED = 22;
const CLICK_SUPPRESSION_MS = 350;

function isInteractivePointerTarget(target, card) {
  if (!target || !card || !card.contains(target)) return true;
  return Boolean(target.closest(
    '.production-calendar-card-selector, button, input, select, textarea, a, [contenteditable="true"]'
  ));
}

function getPointerDistance(startX, startY, pointerX, pointerY) {
  return Math.hypot(pointerX - startX, pointerY - startY);
}

function clampSpeed(value) {
  return Math.max(-AUTO_SCROLL_MAX_SPEED, Math.min(AUTO_SCROLL_MAX_SPEED, value));
}

function getAutoScrollSpeed(pointerPosition, startEdge, endEdge) {
  if (pointerPosition < startEdge + AUTO_SCROLL_EDGE_PX) {
    return -clampSpeed(((startEdge + AUTO_SCROLL_EDGE_PX - pointerPosition) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_SPEED);
  }
  if (pointerPosition > endEdge - AUTO_SCROLL_EDGE_PX) {
    return clampSpeed(((pointerPosition - (endEdge - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_SPEED);
  }
  return 0;
}

function safeReleasePointerCapture(element, pointerId) {
  if (!element || pointerId === null || pointerId === undefined) return;
  try {
    if (typeof element.hasPointerCapture === 'function' && !element.hasPointerCapture(pointerId)) return;
    if (typeof element.releasePointerCapture === 'function') element.releasePointerCapture(pointerId);
  } catch (error) {
    // The source card may already have left the DOM when the calendar is rebuilt.
  }
}

function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function createPreview(allocation) {
  const preview = document.createElement('div');
  preview.className = 'production-calendar-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  const color = getProductionCalendarAllocationColor(allocation);
  preview.style.setProperty('--production-calendar-card-accent', color.accent);
  preview.style.setProperty('--production-calendar-card-bg', color.bg);
  preview.style.setProperty('--production-calendar-card-border', color.border);

  const productionCode = firstExisting(
    allocation?.productionCode,
    allocation?.productionNumber,
    allocation?.production,
    allocation?.orderNumber,
    allocation?.orderCode
  );

  const title = document.createElement('div');
  title.className = 'production-calendar-drag-preview-title';
  title.textContent = productionCode ? `PRODUCAO ${productionCode}` : 'PRODUCAO';

  const material = document.createElement('div');
  material.className = 'production-calendar-drag-preview-material';
  material.textContent = allocation?.materialName || 'Material';

  const meta = document.createElement('div');
  meta.className = 'production-calendar-drag-preview-meta';
  meta.textContent = [
    formatProductionCalendarQuantity(allocation?.quantity, allocation?.unit || ''),
    allocation?.date ? formatProductionCalendarDate(allocation.date) : null
  ].filter(Boolean).join(' - ');

  preview.append(title, material, meta);
  return preview;
}

export function createProductionCalendarDragController({
  state,
  grid,
  root,
  onRequestMove,
  threshold = DRAG_THRESHOLD_PX
} = {}) {
  let intent = null;
  let preview = null;
  let autoScrollFrame = null;
  let suppressClickUntil = 0;
  let suppressClickAllocationId = null;
  let lastHoverCell = null;
  let selectionLocked = false;

  function getCellAtPointer(pointerX, pointerY) {
    if (!grid) return null;
    const element = document.elementFromPoint(pointerX, pointerY);
    const cell = element?.closest?.('.production-calendar-cell') || null;
    return cell && grid.contains(cell) ? cell : null;
  }

  function getCellAllocationIds(cell) {
    if (!cell) return [];
    return [...cell.querySelectorAll('.production-calendar-card[data-allocation-id]')]
      .map(card => card.dataset.allocationId)
      .filter(id => id !== null && id !== undefined && id !== '')
      .map(id => String(id));
  }

  function isSameOrigin(cell) {
    if (!cell || !intent?.allocation) return false;
    return String(cell.dataset.date || '') === String(intent.allocation.date || '')
      && String(cell.dataset.machineId || '') === String(intent.allocation.machineId ?? '');
  }

  function classifyDestinationCell(cell) {
    if (!cell) {
      return {
        date: null,
        machineId: null,
        kind: null,
        occupiedAllocationIds: []
      };
    }

    const occupiedAllocationIds = getCellAllocationIds(cell);
    const otherAllocationIds = occupiedAllocationIds
      .filter(id => String(id) !== String(intent?.allocation?.allocationId ?? ''));
    const kind = isSameOrigin(cell)
      ? (otherAllocationIds.length ? 'reorder' : 'same-origin')
      : occupiedAllocationIds.length ? 'occupied' : 'empty';

    return {
      date: cell.dataset.date || null,
      machineId: cell.dataset.machineId || null,
      kind,
      occupiedAllocationIds: kind === 'reorder' ? otherAllocationIds : occupiedAllocationIds
    };
  }

  function clearTextSelection() {
    try {
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      // Selection APIs may be unavailable in restricted browser contexts.
    }
  }

  function preventDragSelection(event) {
    if (!selectionLocked) return;
    event.preventDefault();
  }

  function lockTextSelection() {
    if (selectionLocked) return;
    selectionLocked = true;
    clearTextSelection();
    document.body?.classList.add('production-calendar-drag-no-select');
    document.addEventListener('selectstart', preventDragSelection, true);
  }

  function unlockTextSelection() {
    if (!selectionLocked) return;
    selectionLocked = false;
    document.body?.classList.remove('production-calendar-drag-no-select');
    document.removeEventListener('selectstart', preventDragSelection, true);
  }

  function updateSourcePresentation(active) {
    if (!intent?.card) return;
    intent.card.dataset.dragging = String(Boolean(active));
    intent.card.setAttribute('aria-grabbed', String(Boolean(active)));
  }

  function updatePreviewPosition() {
    if (!preview || !state?.drag) return;
    preview.style.transform = `translate3d(${state.drag.dragPointerX + 12}px, ${state.drag.dragPointerY + 12}px, 0)`;
  }

  function clearHoverCell() {
    if (lastHoverCell) {
      lastHoverCell.dataset.dragHover = 'false';
      delete lastHoverCell.dataset.dragHoverKind;
    }
    lastHoverCell = null;
    updateProductionCalendarDragHover(state, null, null, null, []);
  }

  function updateHoverTarget(pointerX, pointerY) {
    if (!grid) return;
    const cell = getCellAtPointer(pointerX, pointerY);
    if (!cell) {
      clearHoverCell();
      return;
    }
    if (lastHoverCell && lastHoverCell !== cell) {
      lastHoverCell.dataset.dragHover = 'false';
      delete lastHoverCell.dataset.dragHoverKind;
    }
    const destination = classifyDestinationCell(cell);
    lastHoverCell = cell;
    lastHoverCell.dataset.dragHover = 'true';
    lastHoverCell.dataset.dragHoverKind = destination.kind || '';
    updateProductionCalendarDragHover(
      state,
      destination.date,
      destination.machineId,
      destination.kind,
      destination.occupiedAllocationIds
    );
  }

  function ensurePreview() {
    if (preview || !intent?.allocation) return;
    preview = createPreview(intent.allocation);
    document.body.appendChild(preview);
    updatePreviewPosition();
  }

  function stopAutoScroll() {
    if (!autoScrollFrame) return;
    cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
  }

  function runAutoScroll() {
    autoScrollFrame = null;
    if (!state?.drag?.dragActive || !grid) return;

    const gridRect = grid.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const pointerX = state.drag.dragPointerX;
    const pointerY = state.drag.dragPointerY;
    const horizontalSpeed = getAutoScrollSpeed(pointerX, gridRect.left, gridRect.right);
    const verticalSpeed = getAutoScrollSpeed(pointerY, 0, viewportHeight);

    if (horizontalSpeed) grid.scrollLeft += horizontalSpeed;
    if (verticalSpeed) window.scrollBy(0, verticalSpeed);
    if (horizontalSpeed || verticalSpeed) {
      updateHoverTarget(pointerX, pointerY);
      autoScrollFrame = requestAnimationFrame(runAutoScroll);
    }
  }

  function updateAutoScroll() {
    if (!state?.drag?.dragActive || !grid) {
      stopAutoScroll();
      return;
    }

    const gridRect = grid.getBoundingClientRect();
    const pointerX = state.drag.dragPointerX;
    const pointerY = state.drag.dragPointerY;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const horizontalSpeed = getAutoScrollSpeed(pointerX, gridRect.left, gridRect.right);
    const verticalSpeed = getAutoScrollSpeed(pointerY, 0, viewportHeight);

    if (!horizontalSpeed && !verticalSpeed) {
      stopAutoScroll();
      return;
    }
    if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(runAutoScroll);
  }

  function activateDrag(pointerX, pointerY) {
    activateProductionCalendarDrag(state);
    updateProductionCalendarDragPointer(state, pointerX, pointerY);
    lockTextSelection();
    updateSourcePresentation(true);
    ensurePreview();
    updateHoverTarget(pointerX, pointerY);
    updateAutoScroll();
  }

  function cleanupIntent() {
    clearTransientListeners();
    safeReleasePointerCapture(intent?.card, intent?.pointerId);
    intent = null;
  }

  function removePreview() {
    if (preview?.parentNode) preview.parentNode.removeChild(preview);
    preview = null;
  }

  function requestMove(destination) {
    if (!destination || destination.kind === 'same-origin') return;
    if (!destination.date || !destination.machineId || !intent?.allocation) return;
    if (typeof onRequestMove !== 'function') return;

    onRequestMove({
      type: 'MOVE_ALLOCATION',
      allocationId: intent.allocation.allocationId,
      operationId: intent.allocation.operationId,
      calendarParentOperationId: intent.allocation.calendarParentOperationId,
      parentOperationId: intent.allocation.parentOperationId,
      productionId: intent.allocation.productionId,
      productionIndex: intent.allocation.productionIndex,
      from: {
        date: intent.allocation.date || null,
        machineId: intent.allocation.machineId === null || intent.allocation.machineId === undefined
          ? null
          : String(intent.allocation.machineId)
      },
      to: {
        date: destination.date,
        machineId: destination.machineId
      },
      source: 'drag',
      destination: {
        kind: destination.kind,
        occupiedAllocationIds: destination.occupiedAllocationIds
      }
    });
  }

  function endDrag({ cancelled = false } = {}) {
    const wasActive = Boolean(state?.drag?.dragActive);
    const destination = !cancelled && wasActive
      ? classifyDestinationCell(getCellAtPointer(state.drag.dragPointerX, state.drag.dragPointerY))
      : null;
    if (!cancelled && wasActive && destination?.kind && destination.kind !== 'same-origin') {
      requestMove(destination);
    }
    if (wasActive && intent?.allocation?.allocationId !== null && intent?.allocation?.allocationId !== undefined) {
      suppressClickAllocationId = String(intent.allocation.allocationId);
      suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS;
    }
    stopAutoScroll();
    clearHoverCell();
    updateSourcePresentation(false);
    unlockTextSelection();
    removePreview();
    cleanupIntent();
    if (cancelled) {
      cancelProductionCalendarDrag(state);
    } else {
      finishProductionCalendarDrag(state);
    }
  }

  function handlePointerMove(event) {
    if (!intent || event.pointerId !== intent.pointerId) return;
    if (state?.drag?.dragActive) {
      event.preventDefault();
      clearTextSelection();
    }
    updateProductionCalendarDragPointer(state, event.clientX, event.clientY);

    if (!state.drag.dragActive) {
      const distance = getPointerDistance(intent.startX, intent.startY, event.clientX, event.clientY);
      if (distance < threshold) return;
      activateDrag(event.clientX, event.clientY);
    } else {
      updatePreviewPosition();
      updateHoverTarget(event.clientX, event.clientY);
      updateAutoScroll();
    }

    event.preventDefault();
  }

  function handlePointerUp(event) {
    if (!intent || event.pointerId !== intent.pointerId) return;
    endDrag({ cancelled: false });
  }

  function handlePointerCancel(event) {
    if (!intent || event.pointerId !== intent.pointerId) return;
    endDrag({ cancelled: true });
  }

  function handleLostPointerCapture(event) {
    if (!intent || event.pointerId !== intent.pointerId) return;
    endDrag({ cancelled: true });
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !state?.drag?.dragActive) return;
    event.preventDefault();
    event.stopPropagation();
    endDrag({ cancelled: true });
  }

  function start(event, allocation, card) {
    if (!event || !allocation || !card) return false;
    if (event.button !== undefined && event.button !== 0) return false;
    if (isInteractivePointerTarget(event.target, card)) return false;
    event.preventDefault();
    clearTextSelection();

    if (intent) endDrag({ cancelled: true });
    intent = {
      allocation,
      card,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    startProductionCalendarDragIntent(state, allocation, event.clientX, event.clientY);

    try {
      if (typeof card.setPointerCapture === 'function') card.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is a resilience enhancement; drag still works through document listeners.
    }

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    card.addEventListener('lostpointercapture', handleLostPointerCapture);
    return true;
  }

  function clearTransientListeners() {
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerCancel);
    intent?.card?.removeEventListener('lostpointercapture', handleLostPointerCapture);
  }

  function shouldSuppressClick(allocationId) {
    if (allocationId === null || allocationId === undefined || suppressClickAllocationId === null) return false;
    if (Date.now() > suppressClickUntil) return false;
    return String(allocationId) === suppressClickAllocationId;
  }

  function destroy() {
    clearTransientListeners();
    stopAutoScroll();
    clearHoverCell();
    updateSourcePresentation(false);
    unlockTextSelection();
    removePreview();
    cleanupIntent();
    cancelProductionCalendarDrag(state);
    document.removeEventListener('keydown', handleKeydown, true);
  }

  document.addEventListener('keydown', handleKeydown, true);

  return {
    threshold,
    start,
    shouldSuppressClick,
    destroy,
    root
  };
}
