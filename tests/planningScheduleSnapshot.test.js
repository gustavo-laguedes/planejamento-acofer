import assert from 'node:assert/strict';
import {
  buildProductionCalendarValidationSnapshot,
  buildTimelineOperations,
  mergeDraftAllocationDays,
  resolveProductionCalendarPlanningId,
  selectProductionCalendarMachines
} from '../shared/planning-domain/planningScheduleSnapshot.js';

const validDateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const dateLabel = value => `label:${value}`;

assert.deepEqual(buildTimelineOperations({}), []);
{
  const current = [{ operationId: 'current-1' }];
  const existing = [{ operationId: 'existing-1' }];
  const result = buildTimelineOperations({
    calendarOperations: current,
    operations: [{ operationId: 'ignored' }],
    summary: { existingOperations: existing }
  });
  assert.deepEqual(result.map(item => item.operationId), ['existing-1', 'current-1']);
  assert.equal(result[0]._existingScheduleBlocker, true);
  assert.notEqual(result[0], existing[0], 'bloqueio existente recebe clone decorado');
  assert.equal(result[1], current[0], 'operacao atual preserva identidade');
  assert.deepEqual(existing, [{ operationId: 'existing-1' }], 'entrada nao deve ser mutada');
}

{
  const registered = [{ machineId: 'registered' }];
  assert.deepEqual(selectProductionCalendarMachines({ machines: [{ machineId: 'result' }] }, registered), [{ machineId: 'registered' }, { machineId: 'result' }]);
  assert.deepEqual(selectProductionCalendarMachines({ summary: { machines: [{ machineId: 'summary' }] } }, []), [{ machineId: 'summary' }]);
  assert.deepEqual(selectProductionCalendarMachines({ machineOptions: [{ machineId: 'option' }] }, []), [{ machineId: 'option' }]);
  assert.deepEqual(selectProductionCalendarMachines({}, []), []);
  assert.deepEqual(
    selectProductionCalendarMachines({
      machines: [
        { machineId: 'trefila', machineName: 'Trefila' },
        { machineId: 'ec125-from-result', machineName: 'EC 125' }
      ]
    }, [
      { machineId: 'ec125', machineName: 'EC-125' },
      { machineId: 'mt100', machineName: 'MT-100' }
    ]).map(machine => [machine.machineId, machine.machineName]),
    [
      ['ec125', 'EC-125'],
      ['mt100', 'MT-100'],
      ['trefila', 'Trefila']
    ],
    'cadastro ativo nao pode descartar maquina que veio da simulacao; duplicatas por nome normalizado continuam removidas'
  );
}

assert.equal(resolveProductionCalendarPlanningId({ planningId: 'direct' }, { draftPlanningCode: 'draft' }), 'direct');
assert.equal(resolveProductionCalendarPlanningId({ planning_id: 'snake' }, { draftPlanningCode: 'draft' }), 'snake');
assert.equal(resolveProductionCalendarPlanningId({ id: 'id' }, { draftPlanningCode: 'draft' }), 'id');
assert.equal(resolveProductionCalendarPlanningId({ summary: { planningId: 'summary' } }, { draftPlanningCode: 'draft' }), 'summary');
assert.equal(resolveProductionCalendarPlanningId({}, { draftPlanningCode: 'draft', lastPayloadPlanningCode: 'last' }), 'draft');
assert.equal(resolveProductionCalendarPlanningId({}, { lastPayloadPlanningCode: 'last' }), 'last');
assert.equal(resolveProductionCalendarPlanningId({}, {}), null);

{
  const dayA = { date: '2026-07-15', label: 'original' };
  const dayB = { date: '2026-07-13', label: 'first' };
  const allocations = [
    { allocationId: 'allocation-1', date: '2026-07-14' },
    { allocationId: 'allocation-2', date: 'invalid' },
    { allocationId: 'allocation-3', date: '2026-07-15' }
  ];
  const merged = mergeDraftAllocationDays([dayA, dayB], allocations, {
    isValidDateOnly: validDateOnly,
    formatDateOnly: dateLabel
  });
  assert.deepEqual(merged.map(day => day.date), ['2026-07-13', '2026-07-14', '2026-07-15']);
  assert.equal(merged[0], dayB);
  assert.equal(merged[2], dayA);
  assert.deepEqual(merged[1], { date: '2026-07-14', label: 'label:2026-07-14', weekday: '' });
  assert.deepEqual(allocations.map(item => item.allocationId), ['allocation-1', 'allocation-2', 'allocation-3']);
}
assert.deepEqual(mergeDraftAllocationDays([], [], { isValidDateOnly: validDateOnly, formatDateOnly: dateLabel }), []);

const allocations = [
  { allocationId: 'a1', date: '2026-07-14', isCapacityOverride: true },
  { allocationId: 'a2', date: '2026-07-15' }
];
const days = [{ date: '2026-07-14' }, { date: '2026-07-15' }];
const validation = {
  validationVersion: 'v-test',
  valid: false,
  errors: [
    { issueId: 'err-1', code: 'STOCK_COMMITMENT_SHORTAGE', date: '2026-07-14', materialIds: ['MAT1', 'MAT1'] }
  ],
  warnings: [{ issueId: 'warn-1', code: 'TEAM_CAPACITY_OVERRIDE_USED', date: '2026-07-14' }],
  affectedAllocations: {
    byAllocationId: {
      a1: { errors: ['err-1'], warnings: ['warn-1'] }
    },
    byDate: {
      '2026-07-14': { errors: ['err-1'], warnings: ['warn-1'] }
    }
  },
  dependencyStatus: { byAllocationId: { a1: { state: 'blocked' } } },
  resourceProjection: { byDate: { '2026-07-14': { peakPeople: 7, availablePeople: 6 } } },
  stockProjection: { timeline: [{ allocationIds: ['a1'], availableBalance: -2 }] },
  summary: { errorCount: 1, warningCount: 1 }
};
const presenter = source => ({
  issues: [
    { title: 'Erro', message: 'estoque', sourceIssueIds: ['err-1'] },
    { title: 'Aviso', message: 'capacidade', sourceIssueIds: ['warn-1'] }
  ],
  valid: source.valid
});
const validationBefore = structuredClone(validation);
const snapshot = buildProductionCalendarValidationSnapshot(validation, allocations, days, {
  validationVersion: 'v-test',
  presentValidation: presenter
});
assert.deepEqual(validation, validationBefore, 'validation de entrada nao deve ser mutada');
assert.equal(snapshot.allocations[0].allocationId, 'a1');
assert.notEqual(snapshot.allocations[0], allocations[0], 'allocations decoradas sao clones');
assert.equal(snapshot.allocations[0].stockState, 'shortage');
assert.equal(snapshot.allocations[0].dependencyState, 'blocked');
assert.deepEqual(snapshot.allocations[0].errors, ['Erro: estoque']);
assert.deepEqual(snapshot.allocations[0].warnings, ['Aviso: capacidade']);
assert.equal(snapshot.allocations[1].stockState, 'unknown');
assert.equal(snapshot.allocations[1].dependencyState, 'ok');
assert.equal(snapshot.days[0].extraordinaryCapacity, true);
assert.equal(snapshot.days[0].teamPeak, 7);
assert.equal(snapshot.days[0].teamAvailable, 6);
assert.deepEqual(snapshot.days[0].materialShortages, ['MAT1']);
assert.deepEqual(snapshot.validation.issuesByAllocationId.a1, { errors: ['Erro: estoque'], warnings: ['Aviso: capacidade'] });
assert.deepEqual(snapshot.validation.summary, { errorCount: 1, warningCount: 1 });
assert.equal(buildProductionCalendarValidationSnapshot(null, allocations, days, {
  validationVersion: 'v-test',
  presentValidation: presenter
}), null);
assert.equal(buildProductionCalendarValidationSnapshot({ validationVersion: 'other' }, allocations, days, {
  validationVersion: 'v-test',
  presentValidation: presenter
}), null);

console.log('planningScheduleSnapshot.test.js ok');
