export function buildTimelineOperations(result) {
  const current = Array.isArray(result?.calendarOperations)
    ? result.calendarOperations
    : Array.isArray(result?.operations) ? result.operations : [];
  const existing = Array.isArray(result?.summary?.existingOperations)
    ? result.summary.existingOperations.map(operation => ({
        ...operation,
        _existingScheduleBlocker: true
      }))
    : [];
  return [...existing, ...current];
}

export function selectProductionCalendarMachines(result, registeredMachines = []) {
  if (registeredMachines.length) return registeredMachines;
  const machineSources = [
    result?.machines,
    result?.summary?.machines,
    result?.machineOptions,
    result?.summary?.machineOptions
  ];
  return machineSources.find(source => Array.isArray(source) && source.length) || [];
}

export function resolveProductionCalendarPlanningId(result, { draftPlanningCode, lastPayloadPlanningCode } = {}) {
  return result?.planningId
    || result?.planning_id
    || result?.id
    || result?.summary?.planningId
    || result?.summary?.planning_id
    || draftPlanningCode
    || lastPayloadPlanningCode
    || null;
}

export function mergeDraftAllocationDays(days = [], allocations = [], { isValidDateOnly, formatDateOnly } = {}) {
  const byDate = new Map((Array.isArray(days) ? days : []).map(day => [String(day.date || ''), day]));
  (Array.isArray(allocations) ? allocations : []).forEach(allocation => {
    const date = String(allocation?.date || '');
    if (isValidDateOnly(date) && !byDate.has(date)) {
      byDate.set(date, { date, label: formatDateOnly(date), weekday: '' });
    }
  });
  return [...byDate.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

export function buildManualScheduleIssueMessages(issueIds, presentation) {
  const requested = new Set((Array.isArray(issueIds) ? issueIds : []).map(String));
  return (presentation?.issues || [])
    .filter(item => (item.sourceIssueIds || []).some(issueId => requested.has(String(issueId))))
    .map(item => `${item.title}: ${item.message}`);
}

export function buildProductionCalendarValidationSnapshot(
  validation,
  allocations = [],
  days = [],
  { validationVersion, presentValidation } = {}
) {
  if (!validation || validation.validationVersion !== validationVersion) return null;
  const presentation = presentValidation(validation, { allocations });
  const affected = validation.affectedAllocations || { byAllocationId: {}, byDate: {} };
  const dependencyByAllocation = validation.dependencyStatus?.byAllocationId || {};
  const resourceByDate = validation.resourceProjection?.byDate || {};
  const stockTimeline = validation.stockProjection?.timeline || [];
  const issuesByAllocationId = {};
  const decoratedAllocations = allocations.map(allocation => {
    const allocationId = String(allocation.allocationId);
    const allocationIssues = affected.byAllocationId?.[allocationId] || { errors: [], warnings: [] };
    const errors = buildManualScheduleIssueMessages(allocationIssues.errors, presentation);
    const warnings = buildManualScheduleIssueMessages(allocationIssues.warnings, presentation);
    const stockEvents = stockTimeline.filter(item => (item.allocationIds || []).map(String).includes(allocationId));
    const stockState = stockEvents.some(item => Number(item.availableBalance) < 0) ? 'shortage' : (stockEvents.length ? 'ok' : 'unknown');
    issuesByAllocationId[allocationId] = { errors, warnings };
    return {
      ...allocation,
      errors,
      warnings,
      stockState,
      dependencyState: dependencyByAllocation[allocationId]?.state || 'ok',
      hasCapacityOverride: Boolean(allocation.isCapacityOverride)
    };
  });
  const issuesByDate = {};
  const decoratedDays = days.map(day => {
    const date = String(day.date || '');
    const dateIssues = affected.byDate?.[date] || { errors: [], warnings: [] };
    const errors = buildManualScheduleIssueMessages(dateIssues.errors, presentation);
    const warnings = buildManualScheduleIssueMessages(dateIssues.warnings, presentation);
    const resource = resourceByDate[date] || {};
    const materialShortages = (validation.errors || [])
      .filter(item => item.date === date && item.code?.startsWith('STOCK_'))
      .flatMap(item => item.materialIds || []);
    const daily = {
      errorCount: errors.length,
      warningCount: warnings.length,
      materialShortages: [...new Set(materialShortages)],
      teamPeak: resource.peakPeople ?? null,
      teamAvailable: resource.availablePeople ?? null,
      extraordinaryCapacity: decoratedAllocations.some(allocation => allocation.date === date && allocation.hasCapacityOverride),
      errors,
      warnings
    };
    issuesByDate[date] = daily;
    return { ...day, ...daily };
  });
  return {
    allocations: decoratedAllocations,
    days: decoratedDays,
    validation: {
      valid: validation.valid,
      issuesByAllocationId,
      issuesByDate,
      stockProjection: validation.stockProjection,
      dependencyStatus: validation.dependencyStatus,
      summary: validation.summary,
      presentation
    }
  };
}
