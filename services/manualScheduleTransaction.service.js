import {
  applyIndependentDraftMove,
  applyDraftMove,
  editDraftAllocation,
  splitDraftAllocation,
  validateManualScheduleDraft
} from './manualScheduleDraft.service.js';
import { validateManualScheduleTemporalRules } from './manualScheduleValidation.service.js';
import {
  blockingRegressionsForDelta,
  compareBlockingDiagnostics
} from './planningDiagnosticDelta.service.js';
import {
  productivityMachineKeys,
  resolveCanonicalProductivityConfiguration
} from './productivityMatrixResolution.service.js';

export const MANUAL_SCHEDULE_VALIDATION_VERSION = 'manual-schedule-validation/v1';

const REQUIRED_VALIDATION_CONTEXT = [
  'operations',
  'materials',
  'machines',
  'productivityMatrix',
  'stock',
  'stockMinimums',
  'stockLocations',
  'dependencies',
  'transports',
  'shifts',
  'dailyTeamOverrides',
  'manualWorkDates',
  'setupMinutes',
  'minimumStartRatio',
  'dependencyCompletionBufferMinutes',
  'holidays',
  'timezone'
];

const DECISION_CODES = new Set(['CONFIRM_MERGE', 'CONFIRM_REPLACE', 'CAPACITY_EXCEEDED']);
const STOCK_BLOCKING_CODES = new Set([
  'STOCK_COMMITMENT_SHORTAGE',
  'STOCK_NEGATIVE_BALANCE',
  'STOCK_TRANSPORT_DISPATCH_SHORTAGE',
  'NEGATIVE_INITIAL_STOCK'
]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function draftFingerprint(draft) {
  const serialized = JSON.stringify({
    allocations: Array.isArray(draft?.allocations) ? draft.allocations : [],
    manualWorkDates: Array.isArray(draft?.manualWorkDates) ? draft.manualWorkDates : [],
    dailyTeamOverrides: draft?.dailyTeamOverrides && typeof draft.dailyTeamOverrides === 'object' ? draft.dailyTeamOverrides : {}
  });
  let hash = 2166136261;
  for (const character of serialized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function applyCalendarSettingsIntent(previousDraft, intent, now) {
  const candidate = intent?.candidateDraft ? clone(intent.candidateDraft) : clone(previousDraft);
  if (intent?.type === 'SET_MANUAL_WORK_DATE') {
    const date = String(intent.date || '');
    const dates = new Set((candidate.manualWorkDates || []).map(String));
    if (intent.enabled) dates.add(date);
    else dates.delete(date);
    candidate.manualWorkDates = [...dates].sort();
    if (Array.isArray(intent.candidateAllocations)) candidate.allocations = clone(intent.candidateAllocations);
  } else if (intent?.type === 'SET_DAILY_TEAM_OVERRIDES') {
    const date = String(intent.date || '');
    const allOverrides = clone(candidate.dailyTeamOverrides || {});
    const dateOverrides = { ...(allOverrides[date] || {}) };
    Object.entries(intent.overrides || {}).forEach(([shiftId, value]) => {
      if (value === null || value === undefined || value === '') delete dateOverrides[shiftId];
      else dateOverrides[shiftId] = Number(value);
    });
    if (Object.keys(dateOverrides).length) allOverrides[date] = dateOverrides;
    else delete allOverrides[date];
    candidate.dailyTeamOverrides = allOverrides;
    if (Array.isArray(intent.candidateAllocations)) {
      candidate.allocations = clone(intent.candidateAllocations);
    }
  } else if (['EDIT_OPERATION_RESOURCES', 'EDIT_PRODUCTION_CONFIGURATION'].includes(intent?.type)) {
    if (Array.isArray(intent.candidateAllocations)) candidate.allocations = clone(intent.candidateAllocations);
  } else {
    return null;
  }
  candidate.updatedAt = String(now || new Date().toISOString());
  candidate.dirty = true;
  candidate.lastManualAction = clone(intent);
  return candidate;
}

export function isManualScheduleValidationCompatible(draft) {
  return draft?.validation?.validationVersion === MANUAL_SCHEDULE_VALIDATION_VERSION
    && draft.validation.draftFingerprint === draftFingerprint(draft);
}

function issue(code, message, values = {}) {
  return {
    issueId: `${code}:${String(values.field || values.allocationId || 'transaction')}`,
    code,
    severity: values.severity || 'error',
    blocking: values.blocking !== false,
    rule: values.rule || 'manual_schedule_transaction',
    message,
    allocationIds: values.allocationId ? [String(values.allocationId)] : [],
    machineIds: values.machineId ? [String(values.machineId)] : [],
    parentOperationIds: values.parentOperationId ? [String(values.parentOperationId)] : [],
    dependencyIds: [],
    materialIds: values.materialId ? [String(values.materialId)] : [],
    locationId: values.locationId ?? null,
    date: values.date || null,
    startTime: null,
    endTime: null,
    details: values.details || {}
  };
}

function validateProductionConfigurationIntent(previousDraft, intent, validationContext) {
  if (intent?.type !== 'EDIT_PRODUCTION_CONFIGURATION') return null;
  const requested = intent.requestedConfiguration || {};
  const relatedAllocation = (previousDraft?.allocations || []).find(allocation => (
    String(allocation.allocationId || '') === String(intent.allocationId || '')
    || String(allocation.parentOperationId || allocation.calendarParentOperationId || '') === String(intent.parentOperationId || '')
  )) || {};
  const materialIdentity = intent.materialIdentity || {};
  const reference = {
    ...relatedAllocation,
    materialId: materialIdentity.id || relatedAllocation.materialId,
    materialCode: materialIdentity.code || relatedAllocation.materialCode,
    materialCodes: materialIdentity.codes || relatedAllocation.materialCodes,
    materialName: materialIdentity.name || relatedAllocation.materialName
  };
  const material = (validationContext.materials || []).find(candidate => (
    String(candidate.id ?? candidate.materialId ?? '') === String(materialIdentity.id || '')
  )) || reference;
  const configuration = resolveCanonicalProductivityConfiguration({
    material,
    reference,
    productivityMatrix: validationContext.productivityMatrix,
    machines: validationContext.machines,
    machineId: requested.machineId,
    machineName: requested.machineName,
    peopleCount: Number(requested.people),
    productivityLineId: requested.productivityLineId,
    unit: relatedAllocation.unit || ''
  });
  if (configuration) return configuration;
  const canonical = intent.productivityConfiguration || {};
  const canonicalMachineIds = [
    ...productivityMachineKeys({ machineId: canonical.machineId, machineName: canonical.machineName }),
    ...productivityMachineKeys(canonical.row || {})
  ];
  const requestedMachineIds = productivityMachineKeys({ machineId: requested.machineId, machineName: requested.machineName });
  const sameMachine = canonicalMachineIds.length > 0
    && requestedMachineIds.length > 0
    && canonicalMachineIds.some(value => requestedMachineIds.includes(value));
  const samePeople = Number(canonical.people ?? canonical.peopleCount) === Number(requested.people);
  const sameLine = !requested.productivityLineId
    || String(canonical.productivityLineId || '') === String(requested.productivityLineId || '');
  const editedAllocationId = String(intent.allocationId || '');
  const editedTraceIds = new Set([editedAllocationId, ...(intent.sourceAllocationIds || [])].map(String).filter(Boolean));
  const allocationCarriesEditedTrace = allocation => {
    const values = [
      allocation.allocationId,
      ...(allocation.sourceAllocationIds || []),
      ...(allocation.components || []).map(component => component.allocationId)
    ].map(String).filter(Boolean);
    return values.some(value => editedTraceIds.has(value));
  };
  const relatedCandidates = (Array.isArray(intent.candidateAllocations) ? intent.candidateAllocations : [])
    .filter(allocation => (
      editedAllocationId
        ? allocationCarriesEditedTrace(allocation)
        : String(allocation.parentOperationId || allocation.calendarParentOperationId || '') === String(intent.parentOperationId || '')
    ));
  const candidateCarriesEditedTrace = relatedCandidates.length > 0
    && relatedCandidates.some(allocationCarriesEditedTrace);
  const editedDate = String(relatedAllocation.date || '').slice(0, 10);
  const candidateMatches = relatedCandidates.length > 0
    && (relatedCandidates.some(allocation => (
      (!editedDate || String(allocation.date || '').slice(0, 10) === editedDate)
      &&
      Number(allocation.peopleCount) === Number(requested.people)
      && (!canonical.quantityPerDay || Number(allocation.productivity?.outputQty || 0) === Number(canonical.quantityPerDay))
    )) || candidateCarriesEditedTrace);
  if (sameMachine && samePeople && sameLine && candidateMatches) return canonical;
  throw Object.assign(new Error('Não existe produtividade cadastrada para este material na máquina selecionada com esta quantidade de pessoas.'), {
    code: 'PRODUCTIVITY_NOT_FOUND',
    details: {
      allocationId: intent.allocationId || relatedAllocation.allocationId,
      parentOperationId: intent.parentOperationId || relatedAllocation.parentOperationId,
      materialId: materialIdentity.id || relatedAllocation.materialId,
      materialCode: materialIdentity.code || relatedAllocation.materialCode,
      materialCodes: materialIdentity.codes || relatedAllocation.materialCodes || [],
      materialName: materialIdentity.name || relatedAllocation.materialName,
      machineId: requested.machineId,
      machineName: requested.machineName,
      people: Number(requested.people),
      productivityLineId: requested.productivityLineId,
      locationId: relatedAllocation.locationId ?? null
    }
  });
}

function emptyValidation(errors = [], warnings = []) {
  return {
    valid: !errors.some(item => item.blocking !== false),
    errors,
    warnings,
    affectedAllocations: { byAllocationId: {}, byDate: {} },
    stockProjection: { byMaterial: {}, timeline: [], summary: {} },
    dependencyStatus: { byDependencyId: {}, byAllocationId: {} },
    setupConflicts: [],
    teamConflicts: [],
    transportConflicts: [],
    resourceProjection: { byDate: {}, byMachine: {}, summary: {} },
    summary: { errorCount: errors.length, warningCount: warnings.length },
    validationVersion: MANUAL_SCHEDULE_VALIDATION_VERSION
  };
}

function missingContextIssues(context) {
  const missing = REQUIRED_VALIDATION_CONTEXT
    .filter(field => !Object.hasOwn(context || {}, field) || context[field] === undefined || context[field] === null)
    .map(field => issue(
      'MISSING_VALIDATION_CONTEXT',
      `O contexto obrigatório de validação "${field}" não está disponível.`,
      { field, details: { field } }
    ));
  for (const field of ['materials', 'machines', 'productivityMatrix', 'shifts']) {
    if (missing.some(item => item.details.field === field)) continue;
    if (Array.isArray(context[field]) && context[field].length) continue;
    missing.push(issue(
      'MISSING_VALIDATION_CONTEXT',
      `O contexto obrigatório de validação "${field}" está vazio.`,
      { field, details: { field, empty: true } }
    ));
  }
  return missing;
}

function structuralIssues(result) {
  return (result?.errors || []).map((message, index) => issue(
    'INVALID_MANUAL_SCHEDULE_DRAFT',
    String(message),
    { field: `structural-${index + 1}`, rule: 'draft_structure' }
  ));
}

function authorizedCapacityWarnings(candidate) {
  return (candidate?.allocations || [])
    .filter(allocation => allocation?.isCapacityOverride)
    .map(allocation => issue(
      'EXTRAORDINARY_CAPACITY_AUTHORIZED',
      'Capacidade extraordinária autorizada para esta allocation.',
      {
        allocationId: allocation.allocationId,
        date: allocation.date,
        severity: 'warning',
        blocking: false,
        rule: 'extraordinary_capacity'
      }
    ));
}

function addWarningsToAffected(validation, warnings) {
  const affected = clone(validation.affectedAllocations || { byAllocationId: {}, byDate: {} });
  affected.byAllocationId ||= {};
  affected.byDate ||= {};
  warnings.forEach(warning => {
    warning.allocationIds.forEach(allocationId => {
      affected.byAllocationId[allocationId] ||= { errors: [], warnings: [] };
      affected.byAllocationId[allocationId].warnings ||= [];
      if (!affected.byAllocationId[allocationId].warnings.includes(warning.issueId)) {
        affected.byAllocationId[allocationId].warnings.push(warning.issueId);
      }
    });
    if (warning.date) {
      affected.byDate[warning.date] ||= { errors: [], warnings: [] };
      affected.byDate[warning.date].warnings ||= [];
      if (!affected.byDate[warning.date].warnings.includes(warning.issueId)) {
        affected.byDate[warning.date].warnings.push(warning.issueId);
      }
    }
  });
  return affected;
}

function extraordinaryCapacityShiftWarnings(validation, candidate) {
  const overrideIds = new Set((candidate?.allocations || [])
    .filter(allocation => allocation?.isCapacityOverride)
    .map(allocation => String(allocation.allocationId)));
  if (!overrideIds.size) return { errors: validation?.errors || [], warnings: [] };
  const canRelax = diagnostic => (
    ['ALLOCATION_OUTSIDE_SHIFT', 'TEAM_SHIFT_NOT_FOUND'].includes(diagnostic?.code)
    && (diagnostic.allocationIds || []).length > 0
    && (diagnostic.allocationIds || []).every(allocationId => overrideIds.has(String(allocationId)))
  );
  const relaxed = [];
  const errors = (validation?.errors || []).filter(diagnostic => {
    if (!canRelax(diagnostic)) return true;
    relaxed.push({
      ...diagnostic,
      severity: 'warning',
      blocking: false,
      details: {
        ...(diagnostic.details || {}),
        extraordinaryCapacity: true
      }
    });
    return false;
  });
  return { errors, warnings: relaxed };
}

function finalizeValidation(validation, candidate, validatedAt) {
  const relaxed = extraordinaryCapacityShiftWarnings(validation, candidate);
  const capacityWarnings = authorizedCapacityWarnings(candidate);
  const warnings = [...(validation.warnings || []), ...relaxed.warnings, ...capacityWarnings];
  const nextValidation = {
    ...clone(validation),
    errors: relaxed.errors
  };
  return {
    ...nextValidation,
    valid: !relaxed.errors.some(item => item.blocking !== false),
    warnings,
    affectedAllocations: addWarningsToAffected(nextValidation, [...relaxed.warnings, ...capacityWarnings]),
    summary: {
      ...(validation.summary || {}),
      errorCount: relaxed.errors.length,
      warningCount: warnings.length
    },
    ...(validatedAt ? { validatedAt: String(validatedAt) } : {}),
    draftFingerprint: draftFingerprint(candidate),
    validationVersion: MANUAL_SCHEDULE_VALIDATION_VERSION
  };
}

function transactionResult({ accepted, draft, previousDraft, validation, decisionRequired = false, decisionContext = null, diagnosticDelta = null, blockingRegressions = null }) {
  const blockingIssues = Array.isArray(blockingRegressions)
    ? blockingRegressions
    : (validation?.errors || []).filter(item => item.blocking !== false);
  return {
    accepted,
    draft: clone(draft),
    previousDraft: clone(previousDraft),
    validation: clone(validation),
    blockingIssues: clone(blockingIssues),
    warnings: clone(validation?.warnings || []),
    diagnosticDelta: clone(diagnosticDelta),
    blockingRegressions: clone(blockingIssues),
    decisionRequired,
    decisionContext: clone(decisionContext)
  };
}

function stockIssuesForAllocation(validation, allocationId) {
  const normalizedId = String(allocationId || '');
  return (validation?.errors || []).filter(issue => (
    STOCK_BLOCKING_CODES.has(issue?.code)
    && (issue.allocationIds || []).map(String).includes(normalizedId)
  ));
}

function stockQuantityRatioForAllocation(diagnostic, allocationId, allocationQuantity) {
  const normalizedId = String(allocationId || '');
  const consumers = Array.isArray(diagnostic?.details?.consumers) && diagnostic.details.consumers.length
    ? diagnostic.details.consumers.map(String)
    : (diagnostic?.allocationIds || []).map(String);
  const consumerCount = Math.max(consumers.length || 1, 1);
  if (!consumers.includes(normalizedId)) return null;
  const required = Number(diagnostic?.requiredQuantity ?? diagnostic?.details?.requiredQuantity);
  const available = Number(diagnostic?.availableQuantity ?? diagnostic?.details?.availableQuantity);
  if (!(required > 0) || !(available >= 0)) return null;
  const shareRequired = required / consumerCount;
  if (!(shareRequired > 0)) return null;
  return Math.max(Math.min(available / shareRequired, 1), 0) * Number(allocationQuantity || 0);
}

function manualMoveStockAnalysis({ validation, candidate, allocationId }) {
  const allocation = (candidate?.allocations || []).find(item => String(item?.allocationId) === String(allocationId || '')) || null;
  const issues = stockIssuesForAllocation(validation, allocationId);
  const quantity = Number(allocation?.quantity || 0);
  const maxQuantity = issues.length
    ? Math.max(0, Math.min(...issues.map(issue => stockQuantityRatioForAllocation(issue, allocationId, quantity))
      .filter(value => Number.isFinite(value))))
    : quantity;
  return {
    allocation,
    stockIssues: issues,
    maxQuantity: Number((Number.isFinite(maxQuantity) ? maxQuantity : 0).toFixed(6)),
    accepted: issues.length === 0
  };
}

function normalizedQuantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(6)) : null;
}

function allocationCutoffFingerprint(allocations, cutoffDate) {
  return JSON.stringify((allocations || [])
    .filter(allocation => String(allocation?.date || '') < cutoffDate)
    .map(allocation => clone(allocation))
    .sort((left, right) => String(left.allocationId).localeCompare(String(right.allocationId))));
}

export function buildManualScheduleCutoffSnapshot({ acceptedDraft, validationContext, cutoffDate } = {}) {
  const date = String(cutoffDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data de corte inválida.');
  const validation = acceptedDraft?.validation;
  if (validation?.draftFingerprint !== draftFingerprint(acceptedDraft)) {
    throw new Error('A projeção cronológica não corresponde ao draft aceito.');
  }
  const projection = validation?.stockProjection;
  if (!projection || !Array.isArray(projection.timeline)) {
    throw new Error('A projeção cronológica aceita é obrigatória para calcular o snapshot de corte.');
  }
  const cutoffKey = `${date}T00:00`;
  const events = [];
  const balances = {};
  Object.entries(projection.byMaterial || {}).forEach(([materialId, material]) => {
    Object.entries(material?.locations || {}).forEach(([locationId, location]) => {
      const previousEvents = (location?.events || []).filter(event => String(event?.timestampKey || '') < cutoffKey);
      events.push(...previousEvents.map(clone));
      const lastTimeline = projection.timeline
        .filter(item => String(item?.materialId) === String(materialId)
          && String(item?.locationId) === String(locationId)
          && String(item?.timestampKey || '') < cutoffKey)
        .sort((left, right) => String(left.timestampKey).localeCompare(String(right.timestampKey)))
        .at(-1);
      const physicalBalance = lastTimeline
        ? normalizedQuantity(lastTimeline.physicalBalance)
        : normalizedQuantity(location.initialQuantity) ?? 0;
      const committedQuantity = lastTimeline ? normalizedQuantity(lastTimeline.committedQuantity) ?? 0 : 0;
      balances[materialId] ||= {};
      balances[materialId][locationId] = {
        unit: material?.unit || null,
        physicalBalance,
        committedQuantity,
        availableBalance: normalizedQuantity(physicalBalance - committedQuantity)
      };
    });
  });
  const quantityByType = events.reduce((totals, event) => {
    totals[event.type] = normalizedQuantity((totals[event.type] || 0) + Number(event.quantity || 0));
    return totals;
  }, {});
  const quantityByMaterial = events.reduce((totals, event) => {
    const materialId = String(event.materialId || '');
    if (!materialId) return totals;
    totals[materialId] ||= {};
    totals[materialId][event.type] = normalizedQuantity((totals[materialId][event.type] || 0) + Number(event.quantity || 0));
    return totals;
  }, {});
  return {
    cutoffDate: date,
    balances,
    stock: Object.entries(balances).flatMap(([materialId, locations]) => Object.entries(locations).map(([locationId, balance]) => ({
      materialId,
      locationId,
      quantity: balance.physicalBalance,
      committedQuantity: balance.committedQuantity,
      availableQuantity: balance.availableBalance,
      unit: balance.unit
    }))),
    events: events.sort((left, right) => String(left.timestampKey).localeCompare(String(right.timestampKey)) || String(left.eventId).localeCompare(String(right.eventId))),
    accumulated: {
      production: quantityByType.PRODUCTION_AVAILABLE || 0,
      consumption: quantityByType.MATERIAL_CONSUMPTION || 0,
      transportDispatched: quantityByType.TRANSPORT_DISPATCH || 0,
      transportReceived: quantityByType.TRANSPORT_ARRIVAL || 0,
      sales: quantityByType.SALE || 0,
      byMaterial: quantityByMaterial
    },
    validationContext: {
      timezone: validationContext?.timezone || null,
      stockLocationCount: Array.isArray(validationContext?.stockLocations) ? validationContext.stockLocations.length : 0
    }
  };
}

function draftMoveOptions(intent, draftContext, validationContext, decisions, currentDraft) {
  const target = intent?.to || intent?.target || {};
  return {
    allocationId: intent?.allocationId,
    targetDate: intent?.targetDate || target.date,
    targetMachineId: intent?.targetMachineId || target.machineId,
    peopleCount: intent?.peopleCount ?? target.peopleCount,
    moveMode: intent?.moveMode || intent?.destination?.moveMode || null,
    machines: draftContext?.machines || validationContext.machines,
    matrixRows: draftContext?.matrixRows || draftContext?.productivityMatrix || validationContext.productivityMatrix,
    days: draftContext?.days || [],
    dailyMinutes: draftContext?.dailyMinutes,
    ...((draftContext?.now ?? draftContext?.validatedAt ?? currentDraft?.updatedAt ?? currentDraft?.createdAt) !== undefined
      ? { now: draftContext?.now ?? draftContext?.validatedAt ?? currentDraft?.updatedAt ?? currentDraft?.createdAt }
      : {}),
    ...(decisions || {})
  };
}

/**
 * Produces, validates and atomically accepts or rejects one manual schedule move.
 * The function never mutates currentDraft and performs no persistence or I/O.
 */
export function applyManualScheduleTransaction({
  currentDraft,
  intent,
  draftContext = {},
  validationContext = {},
  decisions = {}
} = {}) {
  const previousDraft = clone(currentDraft);
  const incrementalReoptimization = ['SET_DAILY_TEAM_OVERRIDES', 'SET_MANUAL_WORK_DATE', 'EDIT_OPERATION_RESOURCES', 'EDIT_PRODUCTION_CONFIGURATION'].includes(intent?.type)
    && Boolean(intent?.candidateDraft)
    && Boolean(intent?.previousDiagnostics)
    && Boolean(intent?.candidateDraft?.validation);
  const localizedSplitValidation = ['SPLIT_ALLOCATION', 'EDIT_ALLOCATION'].includes(intent?.type)
    && isManualScheduleValidationCompatible(previousDraft);
  const localizedMoveValidation = intent?.type === 'MOVE_ALLOCATION'
    && isManualScheduleValidationCompatible(previousDraft);
  const stockOnlyIndependentMove = intent?.type === 'MOVE_ALLOCATION'
    && intent?.manualMovePolicy === 'stock_only_independent';
  const usesDiagnosticDelta = incrementalReoptimization || localizedSplitValidation || localizedMoveValidation;
  let cutoffSnapshot = null;
  const contextIssues = missingContextIssues(validationContext);
  if (contextIssues.length) {
    const validation = emptyValidation(contextIssues);
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  let candidate;
  try {
    validateProductionConfigurationIntent(previousDraft, intent, validationContext);
    candidate = intent?.type === 'VALIDATE_DRAFT'
      ? clone(previousDraft)
      : intent?.type === 'SPLIT_ALLOCATION'
        ? splitDraftAllocation(previousDraft, {
            allocationId: intent.allocationId,
            firstPercent: intent.firstPercent,
            relativePercents: intent.relativePercents,
            partEdits: intent.partEdits,
            splitGroupId: intent.splitGroupId,
            now: draftContext?.now ?? draftContext?.validatedAt,
            machines: draftContext?.machines || validationContext.machines,
            matrixRows: draftContext?.matrixRows || draftContext?.productivityMatrix || validationContext.productivityMatrix,
            dailyMinutes: draftContext?.dailyMinutes
          })
      : intent?.type === 'EDIT_ALLOCATION'
        ? editDraftAllocation(previousDraft, {
            allocationId: intent.allocationId,
            machineId: intent.machineId,
            peopleCount: intent.peopleCount,
            quantity: intent.quantity,
            date: intent.date,
            startTime: intent.startTime,
            capacityDecision: decisions.capacityDecision,
            now: draftContext?.now ?? draftContext?.validatedAt,
            machines: draftContext?.machines || validationContext.machines,
            matrixRows: draftContext?.matrixRows || draftContext?.productivityMatrix || validationContext.productivityMatrix,
            dailyMinutes: draftContext?.dailyMinutes
          })
      : stockOnlyIndependentMove
        ? applyIndependentDraftMove(previousDraft, {
            allocationId: intent.allocationId,
            targetDate: intent?.targetDate || intent?.to?.date,
            targetMachineId: intent?.targetMachineId || intent?.to?.machineId,
            peopleCount: intent?.peopleCount,
            quantity: intent?.quantity,
            remainderDate: intent?.remainderDate,
            machines: draftContext?.machines || validationContext.machines,
            matrixRows: draftContext?.matrixRows || draftContext?.productivityMatrix || validationContext.productivityMatrix,
            days: draftContext?.days || [],
            dailyMinutes: draftContext?.dailyMinutes,
            ...((draftContext?.now ?? draftContext?.validatedAt) !== undefined
              ? { now: draftContext?.now ?? draftContext?.validatedAt }
              : {})
          })
      : applyCalendarSettingsIntent(previousDraft, intent, draftContext?.now ?? draftContext?.validatedAt)
        || applyDraftMove(previousDraft, draftMoveOptions(intent, draftContext, validationContext, decisions, previousDraft));
    if (intent?.cutoffDate && Array.isArray(intent?.candidateAllocations)) {
      cutoffSnapshot = intent.cutoffSnapshot ? clone(intent.cutoffSnapshot) : null;
      if (!cutoffSnapshot && previousDraft?.validation?.draftFingerprint === draftFingerprint(previousDraft)) {
        cutoffSnapshot = buildManualScheduleCutoffSnapshot({
          acceptedDraft: previousDraft,
          validationContext,
          cutoffDate: intent.cutoffDate
        });
      }
      if (allocationCutoffFingerprint(previousDraft?.allocations, intent.cutoffDate)
        !== allocationCutoffFingerprint(candidate?.allocations, intent.cutoffDate)) {
        throw Object.assign(new Error('O recálculo tentou alterar allocations anteriores à data de corte.'), {
          code: 'CUTOFF_PAST_ALLOCATION_CHANGED'
        });
      }
    }
  } catch (error) {
    if (DECISION_CODES.has(error?.code)) {
      return transactionResult({
        accepted: false,
        draft: previousDraft,
        previousDraft,
        validation: emptyValidation(),
        decisionRequired: true,
        decisionContext: {
          code: error.code,
          message: error.message,
          sourceAllocation: error.sourceAllocation || null,
          proposedAllocation: error.proposedAllocation || null,
          occupyingAllocation: error.occupyingAllocation || null
        }
      });
    }
    const validation = emptyValidation([issue(
      error?.code || 'MANUAL_SCHEDULE_CANDIDATE_FAILED',
      error?.message || 'Não foi possível criar o candidato do rascunho manual.',
      { ...(error?.details || {}), details: error?.details || {} }
    )]);
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  const allowsQuantityEdit = intent?.type === 'EDIT_ALLOCATION' && intent.quantity !== undefined && intent.quantity !== null;
  const structural = validateManualScheduleDraft(candidate, {
    machines: validationContext.machines,
    previousAllocations: allowsQuantityEdit ? null : (previousDraft?.allocations || [])
  });
  if (!structural.valid) {
    const validation = emptyValidation(structuralIssues(structural));
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  let chronological;
  try {
    chronological = incrementalReoptimization
      ? clone(candidate.validation)
      : validateManualScheduleTemporalRules({
      draft: candidate,
      shifts: validationContext.shifts,
      manualWorkDates: candidate.manualWorkDates ?? validationContext.manualWorkDates,
      holidays: validationContext.holidays,
      timezone: validationContext.timezone,
      operations: validationContext.operations,
      dependencies: validationContext.dependencies,
      transports: validationContext.transports,
      minimumStartRatio: validationContext.minimumStartRatio,
      dependencyCompletionBufferMinutes: validationContext.dependencyCompletionBufferMinutes,
      stock: validationContext.stock,
      stockMinimums: validationContext.stockMinimums,
      stockLocations: validationContext.stockLocations,
      setupMinutes: validationContext.setupMinutes,
      dailyTeamOverrides: candidate.dailyTeamOverrides ?? validationContext.dailyTeamOverrides,
      setupRules: validationContext.setupRules || [],
      teamOverrides: validationContext.teamOverrides || [],
      setupOverrides: validationContext.setupOverrides || []
        });
  } catch (error) {
    const validation = emptyValidation([issue(
      'MANUAL_SCHEDULE_VALIDATION_FAILED',
      error?.message || 'A validação cronológica do candidato falhou.',
      { details: { name: error?.name || 'Error' } }
    )]);
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  const validation = finalizeValidation(
    chronological,
    candidate,
    draftContext.validatedAt || validationContext.validatedAt
  );
  if (stockOnlyIndependentMove) {
    const stockAnalysis = manualMoveStockAnalysis({ validation, candidate, allocationId: intent.allocationId });
    if (!stockAnalysis.accepted) {
      return transactionResult({
        accepted: false,
        draft: previousDraft,
        previousDraft,
        validation: {
          ...validation,
          manualMoveStockAnalysis: clone(stockAnalysis)
        },
        blockingRegressions: stockAnalysis.stockIssues
      });
    }
    const acceptedDraft = {
      ...candidate,
      validation: {
        ...validation,
        valid: true,
        manualMovePolicy: 'stock_only_independent',
        manualMoveStockAnalysis: clone(stockAnalysis),
        incrementallyAccepted: true
      }
    };
    return transactionResult({
      accepted: true,
      draft: acceptedDraft,
      previousDraft,
      validation: acceptedDraft.validation,
      blockingRegressions: []
    });
  }
  const previousDiagnosticsForDelta = localizedSplitValidation || localizedMoveValidation
    ? previousDraft.validation
    : intent.previousDiagnostics;
  const diagnosticDelta = usesDiagnosticDelta
    ? compareBlockingDiagnostics({
        previousDiagnostics: previousDiagnosticsForDelta,
        candidateDiagnostics: validation
      })
    : null;
  const blockingRegressions = usesDiagnosticDelta
    ? blockingRegressionsForDelta(diagnosticDelta, validation)
    : null;
  if (usesDiagnosticDelta ? blockingRegressions.length > 0 : !validation.valid) {
    return transactionResult({
      accepted: false,
      draft: previousDraft,
      previousDraft,
      validation,
      diagnosticDelta,
      blockingRegressions
    });
  }

  const acceptedDraft = {
    ...candidate,
    validation: usesDiagnosticDelta
      ? {
          ...validation,
          diagnosticDelta: clone(diagnosticDelta),
          blockingRegressions: clone(blockingRegressions),
          incrementallyAccepted: true
        }
      : validation
  };
  const result = transactionResult({
    accepted: true,
    draft: acceptedDraft,
    previousDraft,
    validation: acceptedDraft.validation,
    diagnosticDelta,
    blockingRegressions
  });
  if (cutoffSnapshot) result.cutoffSnapshot = clone(cutoffSnapshot);
  return result;
}
