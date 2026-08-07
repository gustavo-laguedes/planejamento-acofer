import assert from 'node:assert/strict';
import {
  blockingRegressionsForDelta,
  compareBlockingDiagnostics
} from '../services/planningDiagnosticDelta.service.js';

function diagnostic(code, magnitude, values = {}) {
  return {
    issueId: values.issueId || `${code}:12`,
    code,
    rule: values.rule || 'stock_ledger',
    severity: 'error',
    blocking: true,
    materialIds: values.materialIds || ['12'],
    allocationIds: values.allocationIds || [],
    parentOperationIds: values.parentOperationIds || [],
    dependencyIds: values.dependencyIds || [],
    locationId: values.locationId || '__default__',
    date: values.date || null,
    startTime: values.startTime || null,
    endTime: values.endTime || null,
    balanceAfter: -magnitude,
    deficitQuantity: values.deficitQuantity ?? magnitude,
    message: values.message || `Déficit ${magnitude}`
  };
}

function validation(errors = []) {
  return { valid: errors.length === 0, errors, warnings: [] };
}

function compare(previous, candidate) {
  return compareBlockingDiagnostics({
    previousDiagnostics: validation(previous),
    candidateDiagnostics: validation(candidate)
  });
}

// Déficit e estoque inicial iguais permanecem visíveis, mas não bloqueiam.
const negativeInitial = diagnostic('NEGATIVE_INITIAL_STOCK', 100);
const unchanged = compare([negativeInitial], [{ ...negativeInitial }]);
assert.equal(unchanged.unchanged.length, 1);
assert.equal(unchanged.introduced.length, 0);
assert.equal(blockingRegressionsForDelta(unchanged, validation([{ ...negativeInitial }])).length, 0);

const shortage = diagnostic('STOCK_SHORTAGE', 100, { date: '2026-07-20', allocationIds: ['before'] });
const sameShortageMoved = diagnostic('STOCK_SHORTAGE', 100, { date: '2026-07-21', allocationIds: ['after'] });
const equal = compare([shortage], [sameShortageMoved]);
assert.equal(equal.unchanged.length, 1, 'déficit igual deve ser comparado pela família lógica mesmo após reagendamento');

// Menor e resolvido não bloqueiam.
const improved = compare([shortage], [diagnostic('STOCK_SHORTAGE', 60, { date: '2026-07-21', allocationIds: ['after'] })]);
assert.equal(improved.improved.length, 1);
assert.equal(blockingRegressionsForDelta(improved, validation([improved.improved[0].candidateDiagnostic])).length, 0);
const resolved = compare([shortage], []);
assert.equal(resolved.resolved.length, 1);
assert.equal(blockingRegressionsForDelta(resolved, validation()).length, 0);

// Maior e novo bloqueiam.
const worsenedDiagnostic = diagnostic('STOCK_SHORTAGE', 120, { date: '2026-07-21', allocationIds: ['after'] });
const worsened = compare([shortage], [worsenedDiagnostic]);
assert.equal(worsened.worsened.length, 1);
assert.equal(blockingRegressionsForDelta(worsened, validation([worsenedDiagnostic]))[0].deficitQuantity, 120);
const introducedDiagnostic = diagnostic('STOCK_SHORTAGE', 30, { materialIds: ['15'] });
const introduced = compare([], [introducedDiagnostic]);
assert.equal(introduced.introduced.length, 1);
assert.equal(blockingRegressionsForDelta(introduced, validation([introducedDiagnostic])).length, 1);

// Erro estrutural bloqueia mesmo se já existia com a mesma magnitude.
const structural = diagnostic('TEAM_CAPACITY_EXCEEDED', 1, { materialIds: [], rule: 'team_capacity', date: '2026-07-20' });
const structuralDelta = compare([structural], [{ ...structural }]);
assert.equal(structuralDelta.unchanged.length, 1);
assert.equal(blockingRegressionsForDelta(structuralDelta, validation([{ ...structural }])).length, 1);

console.log('planningDiagnosticDelta.service.test.js: ok');
