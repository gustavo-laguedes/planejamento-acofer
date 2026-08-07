import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  presentManualScheduleIssue,
  presentManualScheduleValidation
} from '../services/manualScheduleDiagnosticPresenter.service.js';

const context = {
  allocations: [
    { allocationId: 'alloc:old', parentOperationId: 'op-old', materialId: 'mat-42', materialName: 'CA60 4,2 Bobina', machineId: 'machine-1', machineName: 'Trefila', date: '2026-07-13', startTime: '08:00', unit: 'kg', peopleCount: 5 },
    { allocationId: 'alloc:new', parentOperationId: 'op-new', materialId: 'mat-50', materialName: 'CA60 5,0 Bobina', machineId: 'machine-1', machineName: 'Trefila', date: '2026-07-13', startTime: '08:00', unit: 'kg', peopleCount: 5 }
  ],
  materials: [
    { id: 'mat-42', name: 'CA60 4,2 Bobina', unit: 'kg' },
    { id: 'mat-50', name: 'CA60 5,0 Bobina', unit: 'kg' }
  ],
  machines: [{ machineId: 'machine-1', machineName: 'Trefila' }],
  operations: [],
  locations: [{ id: 'warehouse-1', name: 'Depósito principal' }],
  dependencies: [],
  shifts: [{ id: 'shift-1', label: 'Turno 1' }]
};

function issue(code, values = {}) {
  return {
    issueId: `${code}:technical`,
    code,
    severity: 'error',
    blocking: true,
    allocationIds: ['alloc:new'],
    machineIds: ['machine-1'],
    parentOperationIds: [],
    materialIds: ['mat-50'],
    dependencyIds: [],
    date: '2026-07-13',
    startTime: '08:00',
    details: {},
    ...values
  };
}

function visibleText(presentation) {
  return [presentation.title, presentation.message, ...(presentation.details || [])].join(' ');
}

{
  const result = presentManualScheduleIssue(issue('STOCK_NEGATIVE_BALANCE', {
    deficitQuantity: 12,
    message: 'O consumo simultâneo tornou negativo o saldo de mat-50.'
  }), context);
  assert.equal(result.title, 'Estoque insuficiente');
  assert.match(result.message, /CA60 5,0 Bobina/);
  assert.match(result.message, /12 kg/);
  assert.doesNotMatch(visibleText(result), /alloc:/);
}

{
  const result = presentManualScheduleIssue(issue('SETUP_INTERVAL_INSUFFICIENT', {
    allocationIds: ['alloc:old', 'alloc:new'],
    materialIds: ['mat-42', 'mat-50'],
    requiredSetupMinutes: 60,
    availableSetupMinutes: 20,
    message: 'Conflito de setup entre alloc:old e alloc:new.'
  }), context);
  assert.match(result.message, /Trefila/);
  assert.match(result.message, /CA60 4,2 Bobina/);
  assert.match(result.message, /CA60 5,0 Bobina/);
  assert.doesNotMatch(visibleText(result), /alloc:|machine-1|mat-42|mat-50/);
}

{
  const result = presentManualScheduleIssue(issue('TEAM_CAPACITY_EXCEEDED', {
    requiredPeople: 9,
    availablePeople: 6,
    shiftIds: ['shift-1']
  }), context);
  assert.match(result.message, /9 pessoa/);
  assert.match(result.message, /6 disponível/);
  assert.match(result.message, /Turno 1/);
}

{
  const result = presentManualScheduleIssue(issue('NON_WORKING_DATE_NOT_RELEASED'), context);
  assert.match(result.message, /13\/07\/2026/);
}

{
  const result = presentManualScheduleIssue(issue('PRODUCTIVITY_NOT_FOUND'), context);
  assert.match(result.message, /CA60 5,0 Bobina/);
  assert.match(result.message, /Trefila/);
  assert.match(result.message, /Pessoas: 5/);
}

{
  const duplicate = issue('STOCK_NEGATIVE_BALANCE', { deficitQuantity: 12, rule: 'stock_negative_balance' });
  const result = presentManualScheduleValidation({ errors: [duplicate, { ...duplicate, issueId: 'duplicate:2' }], warnings: [] }, context);
  assert.equal(result.errors.length, 1);
  assert.equal(result.technicalIssueCount, 2);
  assert.equal(result.errors[0].sourceIssueIds.length, 2);
}

{
  const warning = issue('EXTRAORDINARY_CAPACITY_AUTHORIZED', { severity: 'warning', blocking: false });
  const result = presentManualScheduleValidation({ errors: [issue('STOCK_NEGATIVE_BALANCE', { deficitQuantity: 12 })], warnings: [warning] }, context);
  assert.equal(result.errors.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.primaryIssue.title, 'Estoque insuficiente');
}

{
  const result = presentManualScheduleIssue(issue('UNMAPPED_INTERNAL_FAILURE', {
    message: 'Falhou em alloc:new parentOperationId=op-new __default__ 550e8400-e29b-41d4-a716-446655440000'
  }), context);
  assert.equal(result.title, 'Não foi possível concluir a movimentação');
  assert.equal(result.message, 'A programação resultante possui uma inconsistência que precisa ser revisada.');
  assert.doesNotMatch(visibleText(result), /alloc:|parentOperationId|__default__|550e8400/);
  assert.match(JSON.stringify(result.technicalDetails), /alloc:new/);
}

{
  const result = presentManualScheduleIssue(issue('STOCK_NEGATIVE_BALANCE', {
    allocationIds: [],
    machineIds: [],
    materialIds: [],
    date: null,
    deficitQuantity: 12
  }), {});
  assert.match(result.message, /estoque negativo em 12/);
  assert.doesNotMatch(visibleText(result), /undefined|null|NaN/);
}

{
  const stock = issue('STOCK_NEGATIVE_BALANCE', { deficitQuantity: 12 });
  const setup = issue('SETUP_INTERVAL_INSUFFICIENT', {
    issueId: 'setup:1', allocationIds: ['alloc:old', 'alloc:new'], materialIds: ['mat-42', 'mat-50'], requiredSetupMinutes: 60, availableSetupMinutes: 20
  });
  const setupDuplicate = { ...setup, issueId: 'setup:2', code: 'SETUP_OVERLAP' };
  const capacity = issue('EXTRAORDINARY_CAPACITY_AUTHORIZED', { issueId: 'capacity:1', severity: 'warning', blocking: false });
  const result = presentManualScheduleValidation({ errors: [stock, setup, setupDuplicate], warnings: [capacity] }, context);
  assert.deepEqual(result.errors.map(item => item.title), ['Estoque insuficiente', 'Tempo de setup insuficiente']);
  assert.deepEqual(result.warnings.map(item => item.title), ['Capacidade extraordinária']);
  assert.equal(result.technicalIssueCount, 4);
  assert.doesNotMatch(result.issues.map(visibleText).join(' '), /alloc:/);
}

{
  const source = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
  assert.match(source, /new Error\(presentation\.primaryIssue\?\.message/);
  assert.doesNotMatch(source, /new Error\(firstIssue\?\.message/);
  assert.match(source, /isLocalDevelopment\(\)[\s\S]*production-calendar-technical-details/);
}

console.log('manualScheduleDiagnosticPresenter.service.test.js ok');
