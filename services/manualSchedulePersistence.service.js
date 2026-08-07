export const MANUAL_SCHEDULE_CONTRACT_VERSION = 2;
const SUPPORTED_MANUAL_SCHEDULE_VERSIONS = new Set([1, MANUAL_SCHEDULE_CONTRACT_VERSION]);
export const MANUAL_SCHEDULE_INCOMPATIBLE_MESSAGE = 'O calendário manual deste planejamento utiliza uma versão incompatível.';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DERIVED_DRAFT_FIELDS = new Set([
  'validation', 'errors', 'warnings', 'stockProjection', 'dependencyStatus',
  'setupConflicts', 'teamConflicts', 'transportConflicts', 'resourceProjection'
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fnv1a(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function manualScheduleBaseHash(base = {}) {
  const relevant = {
    operations: base.operations || [],
    scheduleTree: base.scheduleTree ?? base.schedule_tree ?? base.tree ?? {},
    productivityMatrix: base.productivityMatrix ?? base.matrix ?? [],
    shifts: base.shifts || [],
    parameters: base.parameters || {},
    referenceStock: base.referenceStock ?? base.stock ?? []
  };
  return `manual-base/v1:${fnv1a(stableStringify(relevant))}`;
}

function normalizeComponent(component = {}, allocation = {}) {
  return {
    ...clone(component),
    allocationId: text(component.allocationId || allocation.allocationId),
    parentOperationId: text(component.parentOperationId || allocation.parentOperationId),
    productionId: text(component.productionId || allocation.productionId),
    quantity: number(component.quantity)
  };
}

export function normalizePersistedAllocation(allocation = {}, index = 0) {
  const normalized = {
    ...clone(allocation),
    allocationId: text(allocation.allocationId),
    parentOperationId: text(allocation.parentOperationId),
    productionId: text(allocation.productionId),
    productionIndex: number(allocation.productionIndex),
    materialId: text(allocation.materialId),
    materialName: text(allocation.materialName),
    materialCode: text(allocation.materialCode),
    machineId: text(allocation.machineId),
    machineName: text(allocation.machineName),
    date: text(allocation.date).slice(0, 10),
    startTime: text(allocation.startTime || '07:00').slice(0, 5),
    endTime: text(allocation.endTime || allocation.startTime || '07:00').slice(0, 5),
    quantity: number(allocation.quantity),
    unit: text(allocation.unit),
    durationMinutes: number(allocation.durationMinutes),
    capacityPercent: allocation.capacityPercent === null || allocation.capacityPercent === undefined ? null : number(allocation.capacityPercent),
    maximumDailyQuantity: allocation.maximumDailyQuantity === null || allocation.maximumDailyQuantity === undefined
      ? (allocation.maxDailyCapacity === null || allocation.maxDailyCapacity === undefined ? null : number(allocation.maxDailyCapacity))
      : number(allocation.maximumDailyQuantity),
    peopleCount: number(allocation.peopleCount),
    sequence: Number.isFinite(Number(allocation.sequence)) ? Number(allocation.sequence) : index + 1,
    source: allocation.source === 'manual' ? 'manual' : 'automatic',
    pinned: Boolean(allocation.pinned),
    components: (Array.isArray(allocation.components) ? allocation.components : []).map(component => normalizeComponent(component, allocation)),
    sourceAllocationIds: uniqueStrings(allocation.sourceAllocationIds?.length ? allocation.sourceAllocationIds : [allocation.allocationId]),
    sourceParentOperationIds: uniqueStrings(allocation.sourceParentOperationIds?.length ? allocation.sourceParentOperationIds : [allocation.parentOperationId]),
    isCapacityOverride: Boolean(allocation.isCapacityOverride)
  };
  for (const field of DERIVED_DRAFT_FIELDS) delete normalized[field];
  for (const field of ['zoom', 'scroll', 'selected', 'selectedCard', 'drag', 'modal', 'hover']) delete normalized[field];
  return normalized;
}

export function validateManualScheduleContract(draft) {
  const errors = [];
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) errors.push('Draft manual ausente ou inválido.');
  if (draft && !SUPPORTED_MANUAL_SCHEDULE_VERSIONS.has(Number(draft.version))) errors.push(MANUAL_SCHEDULE_INCOMPATIBLE_MESSAGE);
  if (draft && !Array.isArray(draft.allocations)) errors.push('Allocations do calendário manual ausentes.');
  const ids = new Set();
  for (const allocation of draft?.allocations || []) {
    const id = text(allocation?.allocationId);
    if (!id) errors.push('Allocation sem allocationId.');
    else if (ids.has(id)) errors.push(`Allocation duplicada: ${id}.`);
    ids.add(id);
    if (!DATE_PATTERN.test(text(allocation?.date))) errors.push(`Data inválida na allocation ${id || '?'}.`);
    if (!TIME_PATTERN.test(text(allocation?.startTime)) || !TIME_PATTERN.test(text(allocation?.endTime))) errors.push(`Horário inválido na allocation ${id || '?'}.`);
    if (!(number(allocation?.quantity) > 0)) errors.push(`Quantidade inválida na allocation ${id || '?'}.`);
  }
  return { valid: errors.length === 0, errors };
}

export function serializeManualScheduleDraft({
  draft,
  planningId = null,
  baseSimulation = {},
  settings = {},
  now = new Date()
} = {}) {
  const timestamp = now instanceof Date ? now.toISOString() : String(now);
  const allocations = (draft?.allocations || []).map(normalizePersistedAllocation);
  const persisted = {
    version: MANUAL_SCHEDULE_CONTRACT_VERSION,
    draftId: text(draft?.draftId) || `manual-draft:${fnv1a(`${timestamp}:${allocations.length}`)}`,
    planningId: planningId === null || planningId === undefined ? null : text(planningId),
    baseSimulationId: draft?.baseSimulationId === null || draft?.baseSimulationId === undefined ? null : text(draft.baseSimulationId),
    baseSimulationHash: manualScheduleBaseHash(baseSimulation),
    allocations,
    constraints: clone(Array.isArray(draft?.constraints) ? draft.constraints : []),
    frozenThrough: clone(draft?.frozenThrough || null),
    schedulerState: clone(draft?.schedulerState || { workItems: [], operationRevisions: [] }),
    identityMap: clone(draft?.identityMap || {}),
    manualWorkDates: uniqueStrings(settings.manualWorkDates ?? draft?.manualWorkDates),
    dailyTeamOverrides: clone(settings.dailyTeamOverrides ?? draft?.dailyTeamOverrides ?? {}),
    setupMinutes: number(settings.setupMinutes ?? draft?.setupMinutes),
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: number(settings.dependencyCompletionBufferMinutes ?? draft?.dependencyCompletionBufferMinutes, 60),
    createdAt: text(draft?.createdAt) || timestamp,
    updatedAt: timestamp
  };
  const validation = validateManualScheduleContract(persisted);
  if (!validation.valid) {
    const error = new Error(validation.errors[0]);
    error.code = validation.errors.includes(MANUAL_SCHEDULE_INCOMPATIBLE_MESSAGE) ? 'INCOMPATIBLE_MANUAL_SCHEDULE_VERSION' : 'INVALID_MANUAL_SCHEDULE';
    error.details = validation.errors;
    throw error;
  }
  return persisted;
}

export function normalizePersistedManualScheduleDraft(value) {
  if (value === null || value === undefined || value === '') return { status: 'legacy', draft: null, diagnostics: [] };
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return { status: 'invalid', draft: null, diagnostics: ['O calendário manual salvo está corrompido.'] }; }
  }
  if (!SUPPORTED_MANUAL_SCHEDULE_VERSIONS.has(Number(parsed?.version))) {
    return { status: 'incompatible', draft: null, raw: clone(parsed), diagnostics: [MANUAL_SCHEDULE_INCOMPATIBLE_MESSAGE] };
  }
  const draft = {
    ...clone(parsed),
    version: MANUAL_SCHEDULE_CONTRACT_VERSION,
    allocations: (parsed.allocations || []).map(normalizePersistedAllocation),
    constraints: clone(Array.isArray(parsed.constraints) ? parsed.constraints : []),
    frozenThrough: clone(parsed.frozenThrough || null),
    schedulerState: clone(parsed.schedulerState || { workItems: [], operationRevisions: [] }),
    identityMap: clone(parsed.identityMap || {}),
    dirty: false
  };
  const validation = validateManualScheduleContract(draft);
  return validation.valid
    ? { status: 'ok', draft, diagnostics: [] }
    : { status: 'invalid', draft, diagnostics: validation.errors };
}

export function manualScheduleDays(draft) {
  const normalized = normalizePersistedManualScheduleDraft(draft);
  if (normalized.status !== 'ok') {
    const error = new Error(normalized.diagnostics[0] || 'Calendário manual inválido.');
    error.code = 'INVALID_MANUAL_SCHEDULE';
    throw error;
  }
  return normalized.draft.allocations.map(allocation => ({
    allocation_id: allocation.allocationId,
    planned_date: allocation.date,
    material_name: allocation.materialName,
    material_code: allocation.materialCode || null,
    machine_name: allocation.machineName || allocation.machineId,
    people_count: allocation.peopleCount,
    planned_qty: allocation.quantity,
    planned_unit: allocation.unit,
    start_time: allocation.startTime,
    end_time: allocation.endTime
  }));
}

export function manualScheduleAuditSummary(draft, warningCount = 0) {
  const allocations = draft?.allocations || [];
  return {
    allocationCount: allocations.length,
    pinnedCount: allocations.filter(allocation => allocation.pinned).length,
    warningCount: Math.max(number(warningCount), 0),
    version: Number(draft?.version || MANUAL_SCHEDULE_CONTRACT_VERSION)
  };
}

export function resolveManualScheduleRecovery({ persistedDraft, localDraft, planningId, persistedUpdatedAt, persistedRevision = 0 } = {}) {
  const persisted = normalizePersistedManualScheduleDraft(persistedDraft);
  if (persisted.status === 'ok') return { source: 'database', draft: persisted.draft, discardLocal: true };
  if (persisted.status === 'incompatible' || persisted.status === 'invalid') return { source: 'database', draft: null, discardLocal: false, diagnostics: persisted.diagnostics };
  const localPlanningId = text(localDraft?.planningId);
  const compatibleId = !planningId || !localPlanningId || text(planningId) === localPlanningId;
  const localRevision = number(localDraft?.persistedRevision ?? localDraft?.revision, 0);
  const localUpdatedAt = Date.parse(localDraft?.updatedAt || '') || 0;
  const databaseUpdatedAt = Date.parse(persistedUpdatedAt || '') || 0;
  if (localDraft && compatibleId && localRevision >= number(persistedRevision) && localUpdatedAt >= databaseUpdatedAt) {
    return { source: 'local-recovery', draft: clone(localDraft), discardLocal: false };
  }
  return { source: 'legacy', draft: null, discardLocal: Boolean(localDraft) };
}
