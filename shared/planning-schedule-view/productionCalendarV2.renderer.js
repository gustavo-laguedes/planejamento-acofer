import { ProductionCalendar } from '../production-calendar/ProductionCalendar.js';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}

export function planningScheduleViewToProductionCalendarSnapshot(model = {}) {
  return {
    days: cloneValue(model.calendar?.days || []),
    machines: (model.resources || []).map(resource => ({
      ...cloneValue(resource),
      machineId: String(resource.id),
      machineName: String(resource.name)
    })),
    allocations: (model.tasks || []).map(task => ({
      ...cloneValue(task),
      allocationId: String(task.id),
      machineId: task.resourceId == null ? null : String(task.resourceId),
      date: task.start?.date ?? task.date ?? null,
      startTime: task.start?.time ?? task.startTime ?? '',
      endDate: task.end?.date ?? task.endDate ?? task.start?.date ?? task.date ?? null,
      endTime: task.end?.time ?? task.endTime ?? ''
    })),
    validation: cloneValue(model.projections?.validation ?? null),
    permissions: cloneValue(model.permissions || {}),
    errors: cloneValue(model.metadata?.errors || []),
    warnings: cloneValue(model.metadata?.warnings || []),
    visualState: cloneValue(model.metadata?.visualState || {})
  };
}

function defaultRenderSnapshot(container, snapshot, options) {
  container.innerHTML = '';
  const calendar = ProductionCalendar({
    ...snapshot,
    ...(options || {})
  });
  container.appendChild(calendar);
  return calendar;
}

function escapeSelectorValue(value) {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function createProductionCalendarV2Renderer({
  renderSnapshot = defaultRenderSnapshot,
  options = {}
} = {}) {
  let container = null;
  let root = null;
  let currentModel = null;
  let focusTimer = null;

  const destroyRoot = () => {
    if (focusTimer !== null) {
      globalThis.clearTimeout?.(focusTimer);
      focusTimer = null;
    }
    root?.__productionCalendarDestroy?.();
    root?.remove?.();
    root = null;
  };

  const render = model => {
    if (!container) throw new Error('Renderer V2 não foi montado.');
    destroyRoot();
    currentModel = model;
    root = renderSnapshot(
      container,
      planningScheduleViewToProductionCalendarSnapshot(model),
      options
    );
    return root;
  };

  return {
    mount(nextContainer, model) {
      if (!nextContainer) throw new Error('Container do renderer V2 é obrigatório.');
      container = nextContainer;
      return render(model);
    },

    update(model) {
      return render(model);
    },

    focusAllocation(allocationId) {
      if (!root || allocationId === null || allocationId === undefined) return false;
      const card = root.querySelector?.(
        `.production-calendar-card[data-allocation-id="${escapeSelectorValue(allocationId)}"]`
      );
      if (!card) return false;
      root.querySelectorAll?.('.production-calendar-card.is-flow-focused')
        .forEach(item => item.classList.remove('is-flow-focused'));
      card.classList.add('is-flow-focused');
      const board = card.closest?.('.production-calendar-grid');
      if (board) {
        const boardRect = board.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        board.scrollTo({
          left: Math.max(0, board.scrollLeft + cardRect.left - boardRect.left - (board.clientWidth / 2) + (cardRect.width / 2)),
          top: Math.max(0, board.scrollTop + cardRect.top - boardRect.top - (board.clientHeight / 2) + (cardRect.height / 2)),
          behavior: 'smooth'
        });
      }
      card.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      card.focus?.({ preventScroll: true });
      focusTimer = globalThis.setTimeout?.(() => {
        card.classList.remove('is-flow-focused');
        focusTimer = null;
      }, 2200) ?? null;
      return true;
    },

    getViewportState() {
      const grid = root?.querySelector?.('.production-calendar-grid');
      return {
        zoom: root?.dataset?.zoom ?? null,
        scrollLeft: Number(grid?.scrollLeft || 0),
        scrollTop: Number(grid?.scrollTop || 0),
        horizon: currentModel?.metadata?.visualState?.visibleEndDate ?? null,
        selectedAllocationId: currentModel?.metadata?.visualState?.selectedAllocationId ?? null
      };
    },

    getRootElement() {
      return root;
    },

    destroy() {
      destroyRoot();
      container = null;
      currentModel = null;
    }
  };
}

