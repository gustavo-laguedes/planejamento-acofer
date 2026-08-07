import { stableStringify } from './manualSchedulePersistence.service.js';

export const AUTOMATIC_SIMULATION_BASELINE_VERSION = 'automatic-simulation-baseline/v1';
export const LEGACY_AUTOMATIC_BASELINE_MESSAGE = 'A simulação automática original não está disponível para este rascunho legado. Execute uma nova simulação para habilitar o descarte integral.';

export function cloneAutomaticBaselineValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function fnv1a(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function baselinePayload({ simulation = {}, allocations = [] } = {}) {
  return {
    simulation: cloneAutomaticBaselineValue(simulation),
    allocations: cloneAutomaticBaselineValue(Array.isArray(allocations) ? allocations : [])
  };
}

export function createAutomaticSimulationBaseline(input = {}) {
  const payload = baselinePayload(input);
  const baseline = {
    version: AUTOMATIC_SIMULATION_BASELINE_VERSION,
    hash: `automatic-baseline/v1:${fnv1a(stableStringify(payload))}`,
    ...payload
  };
  return deepFreeze(baseline);
}

export function normalizeAutomaticSimulationBaseline(value) {
  if (!value || value.version !== AUTOMATIC_SIMULATION_BASELINE_VERSION) return null;
  if (!value.simulation || typeof value.simulation !== 'object' || !Array.isArray(value.allocations)) return null;
  const normalized = createAutomaticSimulationBaseline({
    simulation: value.simulation,
    allocations: value.allocations
  });
  return normalized.hash === value.hash ? normalized : null;
}

export function restoreAutomaticSimulationBaseline(value) {
  const baseline = normalizeAutomaticSimulationBaseline(value);
  if (!baseline) {
    const error = new Error(LEGACY_AUTOMATIC_BASELINE_MESSAGE);
    error.code = 'AUTOMATIC_BASELINE_UNAVAILABLE';
    throw error;
  }
  return {
    simulation: cloneAutomaticBaselineValue(baseline.simulation),
    allocations: cloneAutomaticBaselineValue(baseline.allocations),
    hash: baseline.hash
  };
}

function allocationSignature(allocation = {}) {
  return {
    allocationId: String(allocation.allocationId || ''),
    parentOperationId: String(allocation.parentOperationId || ''),
    machineId: String(allocation.machineId || ''),
    date: String(allocation.date || ''),
    startTime: String(allocation.startTime || ''),
    endTime: String(allocation.endTime || ''),
    quantity: Number(allocation.quantity || 0),
    durationMinutes: Number(allocation.durationMinutes || 0),
    peopleCount: Number(allocation.peopleCount || 0),
    pinned: Boolean(allocation.pinned),
    components: (allocation.components || []).map(component => ({
      parentOperationId: String(component.parentOperationId || ''),
      materialId: String(component.materialId || ''),
      quantity: Number(component.quantity || 0)
    }))
  };
}

function nonEmptyObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
}

export function hasManualChangesAgainstAutomaticBaseline({ baseline, manualScheduleDraft, planningDraft = {} } = {}) {
  const normalized = normalizeAutomaticSimulationBaseline(baseline);
  const structuralChanges = Boolean(manualScheduleDraft?.dirty)
    || Boolean((manualScheduleDraft?.constraints || []).length)
    || Boolean((manualScheduleDraft?.manualWorkDates || []).length)
    || nonEmptyObject(manualScheduleDraft?.dailyTeamOverrides)
    || Boolean((planningDraft.operationSplits || []).length)
    || nonEmptyObject(planningDraft.operationOverrides);
  if (!normalized) return Boolean(manualScheduleDraft) || structuralChanges;
  if (!manualScheduleDraft) return structuralChanges;
  const baselineAllocations = normalized.allocations.map(allocationSignature);
  const currentAllocations = (manualScheduleDraft.allocations || []).map(allocationSignature);
  return stableStringify(baselineAllocations) !== stableStringify(currentAllocations)
    || structuralChanges;
}

export async function persistAutomaticBaselineDiscard({ storage, storageKey, nextDraft, persistRemote } = {}) {
  const previous = storage.getItem(storageKey);
  storage.setItem(storageKey, JSON.stringify(nextDraft));
  try {
    if (typeof persistRemote === 'function') await persistRemote();
  } catch (error) {
    if (previous === null) storage.removeItem(storageKey);
    else storage.setItem(storageKey, previous);
    throw error;
  }
  return nextDraft;
}
