const EPSILON = 1e-6;

export const REOPTIMIZATION_STRUCTURAL_DIAGNOSTIC_CODES = new Set([
  'PAST_ALLOCATION_CHANGED',
  'CUTOFF_PAST_ALLOCATION_CHANGED',
  'IDENTITY_CONSERVATION_FAILED',
  'TEAM_CAPACITY_EXCEEDED',
  'MACHINE_OVERLAP',
  'MACHINE_TIME_OVERLAP',
  'NON_WORKING_DATE_NOT_RELEASED',
  'DEPENDENCY_CANNOT_BE_SCHEDULED',
  'NO_PRODUCTIVITY_CONFIGURATION_FOR_CAPACITY',
  'PINNED_ALLOCATION_BECAME_INFEASIBLE',
  'MISSING_VALIDATION_CONTEXT',
  'INVALID_REOPTIMIZATION_CUTOFF',
  'INVALID_MANUAL_SCHEDULE_DRAFT',
  'ALLOCATION_OUTSIDE_SHIFT',
  'SHIFT_NOT_FOUND',
  'INVALID_TEAM_OVERRIDE'
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortedStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))].sort();
}

function blockingErrors(diagnostics) {
  return (diagnostics?.errors || []).filter(item => item?.blocking !== false);
}

export function blockingDiagnosticIdentity(diagnostic = {}) {
  return JSON.stringify({
    code: String(diagnostic.code || ''),
    rule: String(diagnostic.rule || ''),
    materialIds: sortedStrings(diagnostic.materialIds),
    allocationIds: sortedStrings(diagnostic.allocationIds),
    parentOperationIds: sortedStrings(diagnostic.parentOperationIds),
    dependencyIds: sortedStrings(diagnostic.dependencyIds),
    locationId: diagnostic.locationId == null ? null : String(diagnostic.locationId),
    date: diagnostic.date || null,
    startTime: diagnostic.startTime || diagnostic.time || null,
    endTime: diagnostic.endTime || null
  });
}

function quantitativeFamilyIdentity(diagnostic = {}) {
  if (!(String(diagnostic.code || '').startsWith('STOCK_') || diagnostic.code === 'NEGATIVE_INITIAL_STOCK')) return null;
  return JSON.stringify({
    code: String(diagnostic.code || ''),
    rule: String(diagnostic.rule || ''),
    materialIds: sortedStrings(diagnostic.materialIds),
    parentOperationIds: sortedStrings(diagnostic.parentOperationIds),
    dependencyIds: sortedStrings(diagnostic.dependencyIds),
    locationId: diagnostic.locationId == null ? null : String(diagnostic.locationId)
  });
}

export function blockingDiagnosticMagnitude(diagnostic = {}) {
  const values = diagnostic.details || {};
  const deficit = finite(diagnostic.deficitQuantity ?? values.deficitQuantity);
  if (deficit !== null) return Math.max(deficit, 0);
  const balanceAfter = finite(diagnostic.balanceAfter ?? values.balanceAfter);
  if (balanceAfter !== null && balanceAfter < 0) return Math.abs(balanceAfter);
  const required = finite(diagnostic.requiredQuantity ?? values.requiredQuantity);
  const available = finite(diagnostic.availableQuantity ?? values.availableQuantity);
  if (required !== null && available !== null) return Math.max(required - available, 0);
  const excessPeople = finite(diagnostic.excessPeople ?? values.excessPeople);
  if (excessPeople !== null) return Math.max(excessPeople, 0);
  const requiredPeople = finite(diagnostic.requiredPeople ?? values.requiredPeople);
  const availablePeople = finite(diagnostic.availablePeople ?? values.availablePeople);
  if (requiredPeople !== null && availablePeople !== null) return Math.max(requiredPeople - availablePeople, 0);
  const excessCapacity = finite(diagnostic.excessCapacity ?? values.excessCapacity ?? values.capacityExcess);
  if (excessCapacity !== null) return Math.max(excessCapacity, 0);
  const requiredDuration = finite(diagnostic.requiredDuration ?? values.requiredDuration ?? values.requiredMinutes);
  const availableDuration = finite(diagnostic.availableDuration ?? values.availableDuration ?? values.availableMinutes);
  if (requiredDuration !== null && availableDuration !== null) return Math.max(requiredDuration - availableDuration, 0);
  return 0;
}

function comparisonEntry(previousDiagnostic, candidateDiagnostic) {
  return {
    identity: blockingDiagnosticIdentity(candidateDiagnostic || previousDiagnostic),
    previousMagnitude: previousDiagnostic ? blockingDiagnosticMagnitude(previousDiagnostic) : null,
    candidateMagnitude: candidateDiagnostic ? blockingDiagnosticMagnitude(candidateDiagnostic) : null,
    previousDiagnostic: clone(previousDiagnostic || null),
    candidateDiagnostic: clone(candidateDiagnostic || null),
    diagnostic: clone(candidateDiagnostic || previousDiagnostic)
  };
}

function takeMatch(candidate, previous, used) {
  const exact = previous.findIndex((item, index) => !used.has(index)
    && blockingDiagnosticIdentity(item) === blockingDiagnosticIdentity(candidate));
  if (exact >= 0) return exact;
  const family = quantitativeFamilyIdentity(candidate);
  if (!family) return -1;
  const compatible = previous
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => !used.has(index) && quantitativeFamilyIdentity(item) === family)
    .sort((left, right) => (
      Math.abs(blockingDiagnosticMagnitude(left.item) - blockingDiagnosticMagnitude(candidate))
      - Math.abs(blockingDiagnosticMagnitude(right.item) - blockingDiagnosticMagnitude(candidate))
      || blockingDiagnosticIdentity(left.item).localeCompare(blockingDiagnosticIdentity(right.item))
    ));
  return compatible[0]?.index ?? -1;
}

export function compareBlockingDiagnostics({ previousDiagnostics, candidateDiagnostics } = {}) {
  const previous = blockingErrors(previousDiagnostics);
  const candidate = blockingErrors(candidateDiagnostics);
  const usedPrevious = new Set();
  const delta = { introduced: [], resolved: [], unchanged: [], improved: [], worsened: [] };

  candidate.forEach(candidateDiagnostic => {
    const previousIndex = takeMatch(candidateDiagnostic, previous, usedPrevious);
    if (previousIndex < 0) {
      delta.introduced.push(comparisonEntry(null, candidateDiagnostic));
      return;
    }
    usedPrevious.add(previousIndex);
    const previousDiagnostic = previous[previousIndex];
    const previousMagnitude = blockingDiagnosticMagnitude(previousDiagnostic);
    const candidateMagnitude = blockingDiagnosticMagnitude(candidateDiagnostic);
    const entry = comparisonEntry(previousDiagnostic, candidateDiagnostic);
    if (candidateMagnitude > previousMagnitude + EPSILON) delta.worsened.push(entry);
    else if (candidateMagnitude + EPSILON < previousMagnitude) delta.improved.push(entry);
    else delta.unchanged.push(entry);
  });

  previous.forEach((previousDiagnostic, index) => {
    if (!usedPrevious.has(index)) delta.resolved.push(comparisonEntry(previousDiagnostic, null));
  });
  return delta;
}

export function structuralBlockingDiagnostics(diagnostics) {
  return blockingErrors(diagnostics).filter(item => REOPTIMIZATION_STRUCTURAL_DIAGNOSTIC_CODES.has(String(item.code || '')));
}

export function blockingRegressionsForDelta(delta, candidateDiagnostics) {
  const regressions = [
    ...(delta?.introduced || []).map(item => item.candidateDiagnostic || item.diagnostic),
    ...(delta?.worsened || []).map(item => item.candidateDiagnostic || item.diagnostic),
    ...structuralBlockingDiagnostics(candidateDiagnostics)
  ].filter(Boolean);
  const seen = new Set();
  return regressions.filter(item => {
    const key = blockingDiagnosticIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(clone);
}
