export const PLANNING_SCHEDULE_RENDERERS = Object.freeze({
  GANTT_APS: 'gantt-aps',
  AUTO: 'auto'
});

const ALLOWED_RENDERERS = new Set(Object.values(PLANNING_SCHEDULE_RENDERERS));

export function normalizePlanningScheduleRenderer(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_RENDERERS.has(normalized)
    ? normalized
    : PLANNING_SCHEDULE_RENDERERS.AUTO;
}

export function resolvePlanningScheduleRenderer(value, { autoPolicy } = {}) {
  const requested = normalizePlanningScheduleRenderer(value);
  if (requested !== PLANNING_SCHEDULE_RENDERERS.AUTO) return requested;
  if (typeof autoPolicy === 'function') normalizePlanningScheduleRenderer(autoPolicy());
  return PLANNING_SCHEDULE_RENDERERS.GANTT_APS;
}

function assertRendererLifecycle(renderer, rendererId) {
  const methods = ['mount', 'update', 'getViewportState', 'destroy'];
  const missing = methods.filter(method => typeof renderer?.[method] !== 'function');
  if (missing.length) {
    throw new Error(`Renderer ${rendererId} sem lifecycle completo: ${missing.join(', ')}.`);
  }
}

function safeDestroy(renderer) {
  try {
    renderer?.destroy?.();
  } catch (error) {
    console.warn('Falha ao destruir renderer de planejamento.', error);
  }
}

export function createPlanningScheduleRendererHost({
  factories = {},
  fallbackRenderer = null,
  onLifecycleError
} = {}) {
  void fallbackRenderer;
  let activeRenderer = null;
  let activeRendererId = null;
  let mountedContainer = null;
  let currentModel = null;

  const createAndMount = (rendererId, container, model) => {
    let candidate = null;
    try {
      const factory = factories[rendererId];
      if (typeof factory !== 'function') throw new Error(`Renderer ${rendererId} não registrado.`);
      candidate = factory();
      assertRendererLifecycle(candidate, rendererId);
      candidate.mount(container, model);
      activeRenderer = candidate;
      activeRendererId = rendererId;
      mountedContainer = container;
      currentModel = model;
      return candidate;
    } catch (error) {
      safeDestroy(candidate);
      onLifecycleError?.({ error, rendererId, phase: 'mount' });
      throw error;
    }
  };

  return {
    mount(container, model, { renderer = PLANNING_SCHEDULE_RENDERERS.AUTO, autoPolicy } = {}) {
      safeDestroy(activeRenderer);
      activeRenderer = null;
      activeRendererId = null;
      const selectedRenderer = resolvePlanningScheduleRenderer(renderer, { autoPolicy });
      return createAndMount(selectedRenderer, container, model);
    },

    update(model) {
      if (!activeRenderer) throw new Error('Renderer de planejamento não foi montado.');
      try {
        const result = activeRenderer.update(model);
        currentModel = model;
        return result;
      } catch (error) {
        const failedRenderer = activeRenderer;
        const failedRendererId = activeRendererId;
        safeDestroy(failedRenderer);
        activeRenderer = null;
        activeRendererId = null;
        onLifecycleError?.({ error, rendererId: failedRendererId, phase: 'update' });
        throw error;
      }
    },

    focusAllocation(allocationId) {
      return activeRenderer?.focusAllocation?.(allocationId) === true;
    },

    getViewportState() {
      return activeRenderer?.getViewportState?.() || null;
    },

    getRootElement() {
      return activeRenderer?.getRootElement?.() || null;
    },

    get activeRendererId() {
      return activeRendererId;
    },

    get container() {
      return mountedContainer;
    },

    get model() {
      return currentModel;
    },

    destroy() {
      safeDestroy(activeRenderer);
      activeRenderer = null;
      activeRendererId = null;
      mountedContainer = null;
      currentModel = null;
    }
  };
}
