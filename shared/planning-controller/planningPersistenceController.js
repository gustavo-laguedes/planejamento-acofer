import { normalizePersistedManualScheduleDraft } from '../../services/manualSchedulePersistence.service.js';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setupMinutesFromDraft(draft = {}) {
  return number(draft.setupHours || 0) * 60;
}

function dependencyCompletionBufferMinutesFromSimulation(currentSimulation = {}) {
  return number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60, 60);
}

export function buildManualScheduleCreatePayload({
  draft = {},
  lastPayload = null,
  manualScheduleDraft = null,
  currentSimulation = null,
  stockAuthorization = null
} = {}) {
  const setupMinutes = setupMinutesFromDraft(draft);
  const dependencyCompletionBufferMinutes = dependencyCompletionBufferMinutesFromSimulation(currentSimulation);
  const body = {
    ...(lastPayload || {}),
    manualScheduleDraft,
    manualScheduleValidation: manualScheduleDraft?.validation || null,
    setupMinutes,
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes,
    shifts: draft.shifts || [],
    settings: {
      manualWorkDates: manualScheduleDraft?.manualWorkDates || [],
      dailyTeamOverrides: manualScheduleDraft?.dailyTeamOverrides || {},
      setupMinutes,
      minimumStartRatio: 1,
      dependencyCompletionBufferMinutes
    }
  };
  if (stockAuthorization) body.stockAuthorization = stockAuthorization;
  return body;
}

export function buildManualScheduleUpdatePayload({
  draft = {},
  manualScheduleDraft = null,
  currentSimulation = null
} = {}) {
  const setupMinutes = setupMinutesFromDraft(draft);
  const dependencyCompletionBufferMinutes = dependencyCompletionBufferMinutesFromSimulation(currentSimulation);
  return {
    manualScheduleDraft,
    manualScheduleValidation: manualScheduleDraft?.validation || null,
    expectedRevision: Number(draft.savedPlanningRevision || 0),
    shifts: draft.shifts || [],
    settings: {
      manualWorkDates: manualScheduleDraft?.manualWorkDates || currentSimulation?.manualWorkDates || [],
      dailyTeamOverrides: manualScheduleDraft?.dailyTeamOverrides || draft.dailyTeamOverrides || {},
      setupMinutes,
      minimumStartRatio: 1,
      dependencyCompletionBufferMinutes
    }
  };
}

export async function savePlanningManualSchedule({
  draft = {},
  lastPayload = null,
  manualScheduleDraft = null,
  currentSimulation = null,
  stockShortages = [],
  requestStockAuthorization = async () => null,
  persistCreate,
  persistUpdate
} = {}) {
  const savedPlanningId = draft.savedPlanningId;
  if (savedPlanningId) {
    const body = buildManualScheduleUpdatePayload({ draft, manualScheduleDraft, currentSimulation });
    const saved = await persistUpdate({ planningId: savedPlanningId, body });
    return { accepted: true, mode: 'update', saved, body };
  }

  let stockAuthorization = null;
  if ((stockShortages || []).length) {
    stockAuthorization = await requestStockAuthorization(stockShortages);
    if (!stockAuthorization) return { accepted: false, cancelled: true };
  }
  const body = buildManualScheduleCreatePayload({
    draft,
    lastPayload,
    manualScheduleDraft,
    currentSimulation,
    stockAuthorization
  });
  const saved = await persistCreate({ body });
  return { accepted: true, mode: 'create', saved, body };
}

export function buildLoadedPlanningManualScheduleState(detail = {}, {
  normalizeDraft,
  defaultShift
} = {}) {
  const plan = detail.plan || {};
  const persisted = normalizePersistedManualScheduleDraft(detail.manualScheduleDraft ?? plan.manual_schedule_draft);
  if (persisted.status === 'incompatible' || persisted.status === 'invalid') {
    throw new Error(persisted.diagnostics[0]);
  }
  const draftState = normalizeDraft({
    planningStartDate: detail.summary?.planningStartDate || plan.start_date,
    shifts: detail.summary?.shifts || [defaultShift(0)],
    dailyTeamOverrides: persisted.draft?.dailyTeamOverrides || detail.summary?.dailyTeamOverrides || {},
    manualWorkDates: persisted.draft?.manualWorkDates || detail.summary?.manualWorkDates || [],
    setupHours: Number(detail.summary?.setupHours || 0),
    savedPlanningId: String(plan.id),
    savedPlanningRevision: Number(plan.manual_schedule_revision || 0),
    planningCode: plan.code || String(plan.id)
  });
  const lastPayload = {
    planningCode: plan.code || String(plan.id),
    planningStartDate: detail.summary?.planningStartDate || plan.start_date,
    planningEndDate: detail.summary?.planningEndDate || plan.end_date,
    manualWorkDates: persisted.draft?.manualWorkDates || detail.summary?.manualWorkDates || []
  };
  const currentSimulation = {
    id: plan.id,
    planningId: plan.id,
    code: plan.code,
    tree: detail.tree || plan.schedule_tree,
    operations: detail.operations || plan.operations || [],
    calendarOperations: detail.automaticCalendarOperations || [],
    days: detail.automaticDays || [],
    stockContext: detail.stockContext || null,
    demandContext: detail.demandContext || null,
    summary: {
      ...(detail.summary || {}),
      planningId: plan.id,
      planningStartDate: detail.summary?.planningStartDate || plan.start_date,
      planningEndDate: detail.summary?.planningEndDate || plan.end_date,
      status: plan.status
    }
  };
  return {
    plan,
    persisted,
    draft: draftState,
    lastPayload,
    currentSimulation,
    manualScheduleDraft: persisted.draft
  };
}
