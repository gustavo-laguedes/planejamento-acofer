import {
  applyDraftMove,
  validateManualScheduleDraft
} from './manualScheduleDraft.service.js';
import { validateManualScheduleTemporalRules } from './manualScheduleValidation.service.js';

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

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function draftFingerprint(draft) {
  const serialized = JSON.stringify(Array.isArray(draft?.allocations) ? draft.allocations : []);
  let hash = 2166136261;
  for (const character of serialized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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
    machineIds: [],
    parentOperationIds: [],
    dependencyIds: [],
    materialIds: [],
    locationId: null,
    date: values.date || null,
    startTime: null,
    endTime: null,
    details: values.details || {}
  };
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

function finalizeValidation(validation, candidate, validatedAt) {
  const capacityWarnings = authorizedCapacityWarnings(candidate);
  const warnings = [...(validation.warnings || []), ...capacityWarnings];
  return {
    ...clone(validation),
    valid: !(validation.errors || []).some(item => item.blocking !== false),
    warnings,
    affectedAllocations: addWarningsToAffected(validation, capacityWarnings),
    summary: {
      ...(validation.summary || {}),
      errorCount: (validation.errors || []).length,
      warningCount: warnings.length
    },
    ...(validatedAt ? { validatedAt: String(validatedAt) } : {}),
    draftFingerprint: draftFingerprint(candidate),
    validationVersion: MANUAL_SCHEDULE_VALIDATION_VERSION
  };
}

function transactionResult({ accepted, draft, previousDraft, validation, decisionRequired = false, decisionContext = null }) {
  const blockingIssues = (validation?.errors || []).filter(item => item.blocking !== false);
  return {
    accepted,
    draft: clone(draft),
    previousDraft: clone(previousDraft),
    validation: clone(validation),
    blockingIssues: clone(blockingIssues),
    warnings: clone(validation?.warnings || []),
    decisionRequired,
    decisionContext: clone(decisionContext)
  };
}

function draftMoveOptions(intent, draftContext, validationContext, decisions, currentDraft) {
  const target = intent?.to || intent?.target || {};
  return {
    allocationId: intent?.allocationId,
    targetDate: intent?.targetDate || target.date,
    targetMachineId: intent?.targetMachineId || target.machineId,
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
  const contextIssues = missingContextIssues(validationContext);
  if (contextIssues.length) {
    const validation = emptyValidation(contextIssues);
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  let candidate;
  try {
    candidate = intent?.type === 'VALIDATE_DRAFT'
      ? clone(previousDraft)
      : applyDraftMove(previousDraft, draftMoveOptions(intent, draftContext, validationContext, decisions, previousDraft));
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
          proposedAllocation: error.proposedAllocation || null,
          occupyingAllocation: error.occupyingAllocation || null
        }
      });
    }
    const validation = emptyValidation([issue(
      error?.code || 'MANUAL_SCHEDULE_CANDIDATE_FAILED',
      error?.message || 'Não foi possível criar o candidato do rascunho manual.',
      { details: { errors: error?.details || [] } }
    )]);
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  const structural = validateManualScheduleDraft(candidate, {
    machines: validationContext.machines,
    matrixRows: validationContext.productivityMatrix,
    previousAllocations: previousDraft?.allocations || []
  });
  if (!structural.valid) {
    const validation = emptyValidation(structuralIssues(structural));
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  let chronological;
  try {
    chronological = validateManualScheduleTemporalRules({
      draft: candidate,
      shifts: validationContext.shifts,
      manualWorkDates: validationContext.manualWorkDates,
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
      dailyTeamOverrides: validationContext.dailyTeamOverrides,
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
  if (!validation.valid) {
    return transactionResult({ accepted: false, draft: previousDraft, previousDraft, validation });
  }

  const acceptedDraft = {
    ...candidate,
    validation
  };
  return transactionResult({ accepted: true, draft: acceptedDraft, previousDraft, validation });
}
