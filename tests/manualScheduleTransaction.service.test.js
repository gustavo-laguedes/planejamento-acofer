import assert from 'node:assert/strict';
import { createManualScheduleDraft } from '../services/manualScheduleDraft.service.js';
import {
  applyManualScheduleTransaction,
  isManualScheduleValidationCompatible,
  MANUAL_SCHEDULE_VALIDATION_VERSION
} from '../services/manualScheduleTransaction.service.js';

const machines = ['M1', 'M2', 'M3'].map(machineId => ({ machineId, machineName: machineId }));
const materials = ['RAW', 'FINAL', 'OTHER', 'CAP'].map(id => ({ id, name: id }));
const productivityMatrix = materials.flatMap(material => machines.map(machine => ({
  material_id: material.id,
  material_code: material.id,
  machine_id: machine.machineId,
  machine_name: machine.machineName,
  people_count: 2,
  output_qty: material.id === 'CAP' ? 5 : 10,
  output_unit: 'kg',
  time_seconds: 32400
})));

function allocation(id, overrides = {}) {
  const materialId = overrides.materialId || 'RAW';
  return {
    allocationId: id,
    parentOperationId: overrides.parentOperationId || `op:${id}`,
    productionId: overrides.productionId || `production:${id}`,
    materialId,
    materialCode: materialId,
    materialName: materialId,
    machineId: overrides.machineId || 'M1',
    machineName: overrides.machineId || 'M1',
    date: overrides.date || '2026-07-13',
    startTime: overrides.startTime || '08:00',
    endTime: overrides.endTime || '10:00',
    quantity: overrides.quantity ?? 5,
    unit: 'kg',
    durationMinutes: overrides.durationMinutes ?? 120,
    capacityPercent: overrides.capacityPercent ?? 50,
    maxDailyCapacity: overrides.maxDailyCapacity ?? (materialId === 'CAP' ? 5 : 10),
    peopleCount: overrides.peopleCount ?? 2,
    source: 'automatic',
    pinned: Boolean(overrides.pinned)
  };
}

function draft(allocations) {
  return createManualScheduleDraft({
    planningId: 'PLAN-15.5',
    baseSimulationId: 'SIM-15.5',
    allocations,
    machines,
    now: new Date('2026-07-13T12:00:00.000Z')
  });
}

function context(overrides = {}) {
  return {
    operations: [],
    materials,
    machines,
    productivityMatrix,
    stock: [],
    stockMinimums: [],
    stockLocations: [],
    dependencies: [],
    transports: [],
    shifts: [{ shiftId: 'day', label: 'Diurno', startTime: '07:00', endTime: '16:00', teamAvailable: 6 }],
    dailyTeamOverrides: {},
    manualWorkDates: [],
    setupMinutes: 0,
    minimumStartRatio: 0.30,
    dependencyCompletionBufferMinutes: 60,
    holidays: [],
    timezone: 'America/Sao_Paulo',
    ...overrides
  };
}

function transact(currentDraft, intent, validationOverrides = {}, decisions = {}, draftOverrides = {}) {
  return applyManualScheduleTransaction({
    currentDraft,
    intent,
    draftContext: {
      machines,
      productivityMatrix,
      days: [
        { date: '2026-07-13' }, { date: '2026-07-14' }, { date: '2026-07-15' },
        { date: '2026-07-16' }, { date: '2026-07-17' }, { date: '2026-07-18', isWorkingDay: false }
      ],
      dailyMinutes: 540,
      now: '2026-07-13T13:00:00.000Z',
      validatedAt: '2026-07-13T13:00:00.000Z',
      ...draftOverrides
    },
    validationContext: context(validationOverrides),
    decisions
  });
}

function totalsByParent(allocations = []) {
  const totals = {};
  allocations.forEach(item => {
    const components = Array.isArray(item.components) && item.components.length
      ? item.components
      : [{ parentOperationId: item.parentOperationId, quantity: item.quantity }];
    components.forEach(component => {
      const key = String(component.parentOperationId || '');
      totals[key] = Number(((totals[key] || 0) + Number(component.quantity || 0)).toFixed(6));
    });
  });
  return totals;
}

function move(id, date, machineId = 'M1', source = 'drag') {
  return { type: 'MOVE_ALLOCATION', allocationId: id, targetDate: date, targetMachineId: machineId, source };
}

// A. Movimento válido em draft realista: múltiplas máquinas e produção multi-dia.
{
  const previous = draft([
    allocation('single-day', { parentOperationId: 'op:single', machineId: 'M1' }),
    allocation('multi-day-1', { parentOperationId: 'op:multi', machineId: 'M2', date: '2026-07-14', quantity: 4 }),
    allocation('multi-day-2', { parentOperationId: 'op:multi', machineId: 'M2', date: '2026-07-15', quantity: 6 }),
    allocation('preserved', { parentOperationId: 'op:preserved', machineId: 'M3', date: '2026-07-16' })
  ]);
  const before = structuredClone(previous.allocations);
  const result = transact(previous, move('multi-day-1', '2026-07-17', 'M1'));
  assert.equal(result.accepted, true, JSON.stringify(result.blockingIssues));
  const moved = result.draft.allocations.find(item => item.allocationId === 'multi-day-1');
  assert.equal(moved.allocationId, 'multi-day-1');
  assert.equal(moved.date, '2026-07-17');
  assert.equal(moved.machineId, 'M1');
  assert.equal(moved.quantity, 4);
  assert.equal(moved.pinned, true);
  assert.deepEqual(
    result.draft.allocations.filter(item => item.allocationId !== 'multi-day-1'),
    before.filter(item => item.allocationId !== 'multi-day-1')
  );
  assert.equal(result.draft.validation.validationVersion, MANUAL_SCHEDULE_VALIDATION_VERSION);
  assert.equal(isManualScheduleValidationCompatible(result.draft), true);
  assert.equal(result.validation.valid, true);
  assert.deepEqual(totalsByParent(result.draft.allocations), totalsByParent(previous.allocations));
  assert.equal(previous.allocations.find(item => item.allocationId === 'multi-day-1').date, '2026-07-14');
}

// A2. Segundo movimento do mesmo bloco parte do último draft aceito e não duplica identidade.
{
  const original = draft([allocation('twice'), allocation('twice-other', { machineId: 'M3', date: '2026-07-16' })]);
  const first = transact(original, move('twice', '2026-07-14', 'M2'));
  assert.equal(first.accepted, true);
  const second = transact(first.draft, move('twice', '2026-07-15', 'M3', 'click_move'));
  assert.equal(second.accepted, true);
  const occurrences = second.draft.allocations.filter(item => item.allocationId === 'twice');
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].date, '2026-07-15');
  assert.equal(occurrences[0].machineId, 'M3');
  assert.equal(occurrences[0].pinned, true);
  assert.ok(!second.draft.allocations.some(item => item.allocationId === 'twice' && item.date === '2026-07-14'));
}

const dependentDraft = () => draft([
  allocation('producer', { parentOperationId: 'op:producer', materialId: 'RAW', date: '2026-07-13' }),
  allocation('consumer', { parentOperationId: 'op:consumer', materialId: 'FINAL', machineId: 'M2', date: '2026-07-14' })
]);
const dependency = {
  dependencyId: 'dep:raw',
  producerParentOperationId: 'op:producer',
  consumerParentOperationId: 'op:consumer',
  materialId: 'RAW',
  requiredQuantity: 5,
  unit: 'kg'
};

// B/C. Estoque insuficiente e compromisso mínimo de 30% recusam sem alteração parcial.
for (const stock of [[], [{ materialId: 'RAW', quantity: 1, unit: 'kg' }]]) {
  const previous = dependentDraft();
  const bytes = JSON.stringify(previous);
  const result = transact(previous, move('producer', '2026-07-15'), { dependencies: [dependency], stock });
  assert.equal(result.accepted, false);
  assert.equal(JSON.stringify(result.draft), bytes);
  assert.equal(JSON.stringify(previous), bytes);
  assert.ok(result.blockingIssues.some(item => item.code.startsWith('STOCK_')));
}

// D. Dia não útil sem liberação.
{
  const previous = draft([allocation('weekend')]);
  const result = transact(previous, move('weekend', '2026-07-18'));
  assert.equal(result.accepted, false);
  assert.ok(result.blockingIssues.some(item => item.code === 'NON_WORKING_DATE_NOT_RELEASED'));
}

// E. Setup insuficiente.
{
  const previous = draft([
    allocation('setup-a', { materialId: 'RAW', endTime: '10:00' }),
    allocation('setup-b', { materialId: 'OTHER', startTime: '10:15', endTime: '12:00' })
  ]);
  const result = transact(previous, { type: 'VALIDATE_DRAFT' }, { setupMinutes: 30 });
  assert.equal(result.accepted, false);
  assert.ok(result.blockingIssues.some(item => item.code.startsWith('SETUP_')));
}

// F. Equipe excedida após o movimento.
{
  const previous = draft([
    allocation('team-a', { date: '2026-07-15', machineId: 'M1' }),
    allocation('team-b', { date: '2026-07-13', machineId: 'M2' })
  ]);
  const result = transact(previous, move('team-a', '2026-07-13', 'M1'), {
    shifts: [{ shiftId: 'day', startTime: '07:00', endTime: '16:00', teamAvailable: 3 }]
  });
  assert.equal(result.accepted, false);
  assert.ok(result.blockingIssues.some(item => item.code === 'TEAM_CAPACITY_EXCEEDED'));
}

// G. Estoque mínimo gera warning e aceita.
{
  const previous = dependentDraft();
  const result = transact(previous, move('producer', '2026-07-13', 'M2'), {
    dependencies: [dependency],
    stock: [{ materialId: 'RAW', quantity: 2, unit: 'kg' }],
    stockMinimums: [{ materialId: 'RAW', minimumQuantity: 2 }]
  });
  assert.equal(result.accepted, true);
  assert.ok(result.warnings.some(item => item.code === 'STOCK_MINIMUM_REACHED'));
}

// H. Capacidade extraordinária autorizada gera warning.
{
  const previous = draft([allocation('capacity', { materialId: 'CAP', quantity: 8, capacityPercent: 160, maxDailyCapacity: 5 })]);
  const decision = transact(previous, move('capacity', '2026-07-14'));
  assert.equal(decision.decisionRequired, true);
  const result = transact(previous, move('capacity', '2026-07-14'), {}, { capacityDecision: 'override' });
  assert.equal(result.accepted, true);
  assert.equal(result.draft.allocations[0].isCapacityOverride, true);
  assert.ok(result.warnings.some(item => item.code === 'EXTRAORDINARY_CAPACITY_AUTHORIZED'));
}

// I. Unificação válida preserva os componentes.
{
  const previous = draft([
    allocation('merge-a', { date: '2026-07-13', quantity: 3, capacityPercent: 30 }),
    allocation('merge-b', { date: '2026-07-14', quantity: 2, capacityPercent: 20 })
  ]);
  const result = transact(previous, move('merge-b', '2026-07-13'), {}, { confirmMerge: true });
  assert.equal(result.accepted, true);
  assert.equal(result.draft.allocations.length, 1);
  const merged = result.draft.allocations[0];
  assert.equal(merged.allocationId, 'merge-a');
  assert.equal(merged.quantity, 5);
  assert.equal(merged.durationMinutes, 270);
  assert.equal(merged.capacityPercent, 50);
  assert.equal(merged.components.length, 2);
  assert.deepEqual([...merged.sourceAllocationIds].sort(), ['merge-a', 'merge-b']);
  assert.deepEqual(totalsByParent(result.draft.allocations), totalsByParent(previous.allocations));
}

// J. Substituição válida reage nda o ocupante e preserva movimento anterior pinned.
{
  const previous = draft([
    allocation('replace-moved', { materialId: 'RAW', date: '2026-07-13' }),
    allocation('replace-occupant', { materialId: 'OTHER', date: '2026-07-14' }),
    allocation('already-pinned', { materialId: 'FINAL', date: '2026-07-16', machineId: 'M3', pinned: true })
  ]);
  const result = transact(previous, move('replace-moved', '2026-07-14'), {}, { confirmReplace: true });
  assert.equal(result.accepted, true);
  assert.equal(result.draft.allocations.find(item => item.allocationId === 'replace-moved').date, '2026-07-14');
  assert.notEqual(result.draft.allocations.find(item => item.allocationId === 'replace-occupant').date, '2026-07-14');
  assert.equal(result.draft.allocations.find(item => item.allocationId === 'already-pinned').pinned, true);
}

// J2. Substituição sem qualquer próximo dia útil faz rollback integral.
{
  const previous = draft([
    allocation('replace-no-slot', { materialId: 'RAW', date: '2026-07-13' }),
    allocation('occupant-no-slot', { materialId: 'OTHER', date: '2026-07-14' })
  ]);
  const bytes = JSON.stringify(previous);
  const blockedDays = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6, 15 + index)).toISOString().slice(0, 10);
    return { date, isWorkingDay: false };
  });
  const result = transact(
    previous,
    move('replace-no-slot', '2026-07-14'),
    {},
    { confirmReplace: true },
    { days: [{ date: '2026-07-14' }, ...blockedDays] }
  );
  assert.equal(result.accepted, false);
  assert.equal(result.blockingIssues[0].code, 'NO_NEXT_SLOT');
  assert.equal(JSON.stringify(result.draft), bytes);
}

// J3. Máquina sem produtividade: mensagem específica e nenhuma autorização de persistência.
{
  const previous = draft([allocation('no-productivity')]);
  const bytes = JSON.stringify(previous);
  const restrictedMatrix = productivityMatrix.filter(row => !(row.material_id === 'RAW' && row.machine_id === 'M3'));
  const result = transact(
    previous,
    move('no-productivity', '2026-07-14', 'M3'),
    { productivityMatrix: restrictedMatrix },
    {},
    { productivityMatrix: restrictedMatrix }
  );
  assert.equal(result.accepted, false);
  assert.equal(JSON.stringify(result.draft), bytes);
  assert.equal(result.blockingIssues[0].code, 'PRODUCTIVITY_NOT_FOUND');
  assert.equal(result.blockingIssues[0].message, 'Não existe produtividade cadastrada para este material na máquina selecionada com esta quantidade de pessoas.');
  assert.equal(result.accepted === true, false, 'candidato recusado não pode ser persistido');
}

// K/N. Falha posterior ao candidato faz rollback byte a byte e não autoriza gravação local.
{
  const previous = draft([allocation('rollback')]);
  const bytes = JSON.stringify(previous);
  const result = transact(previous, move('rollback', '2026-07-14'), { shifts: [] });
  assert.equal(result.accepted, false);
  assert.equal(JSON.stringify(result.draft), bytes);
  assert.equal(result.accepted, false, 'somente accepted=true autoriza persistência local');
}

// L. Quatro movimentos em allocations diferentes não desfazem os anteriores.
{
  let current = draft([
    allocation('sequence-1', { parentOperationId: 'op:sequence-1' }),
    allocation('sequence-2', { parentOperationId: 'op:sequence-2', machineId: 'M2', date: '2026-07-14' }),
    allocation('sequence-3', { parentOperationId: 'op:sequence-3', machineId: 'M3', date: '2026-07-15' }),
    allocation('sequence-4', { parentOperationId: 'op:sequence-4', machineId: 'M1', date: '2026-07-16' })
  ]);
  const originalTotals = totalsByParent(current.allocations);
  const identities = current.allocations.map(item => item.allocationId).sort();
  const expectedPositions = {};
  for (const [id, date, machineId] of [
    ['sequence-1', '2026-07-14', 'M3'],
    ['sequence-2', '2026-07-15', 'M1'],
    ['sequence-3', '2026-07-16', 'M2'],
    ['sequence-4', '2026-07-17', 'M3']
  ]) {
    const result = transact(current, move(id, date, machineId));
    assert.equal(result.accepted, true, JSON.stringify(result.blockingIssues));
    current = result.draft;
    expectedPositions[id] = { date, machineId };
    Object.entries(expectedPositions).forEach(([movedId, expected]) => {
      const item = current.allocations.find(allocation => allocation.allocationId === movedId);
      assert.deepEqual({ date: item.date, machineId: item.machineId }, expected);
    });
    assert.deepEqual(current.allocations.map(item => item.allocationId).sort(), identities);
    assert.deepEqual(totalsByParent(current.allocations), originalTotals);
  }
  assert.equal(current.allocations.length, 4);
  assert.equal(current.dirty, true);
}

// Regras cronológicas transacionais: feriado, turno e sobreposição revertem integralmente.
{
  const scenarios = [
    {
      previous: draft([allocation('holiday')]),
      intent: move('holiday', '2026-07-14'),
      overrides: { holidays: ['2026-07-14'] },
      code: 'NON_WORKING_DATE_NOT_RELEASED'
    },
    {
      previous: draft([allocation('outside-shift', { startTime: '06:00', endTime: '08:00' })]),
      intent: { type: 'VALIDATE_DRAFT' },
      overrides: {},
      code: 'ALLOCATION_OUTSIDE_SHIFT'
    },
    {
      previous: draft([
        allocation('overlap-a', { startTime: '08:00', endTime: '10:00' }),
        allocation('overlap-b', { materialId: 'OTHER', startTime: '09:00', endTime: '11:00' })
      ]),
      intent: { type: 'VALIDATE_DRAFT' },
      overrides: {},
      code: 'MACHINE_TIME_OVERLAP'
    }
  ];
  scenarios.forEach(scenario => {
    const bytes = JSON.stringify(scenario.previous);
    const result = transact(scenario.previous, scenario.intent, scenario.overrides);
    assert.equal(result.accepted, false);
    assert.equal(JSON.stringify(result.draft), bytes);
    assert.ok(result.blockingIssues.some(item => item.code === scenario.code), JSON.stringify(result.blockingIssues));
  });
}

// Dependência de 30%: diagnóstico relaciona produtor/consumidor e o caso válido é aceito.
{
  const previous = dependentDraft();
  const bytes = JSON.stringify(previous);
  const invalid = transact(previous, move('producer', '2026-07-15'), {
    dependencies: [dependency],
    stock: []
  });
  assert.equal(invalid.accepted, false);
  assert.equal(JSON.stringify(invalid.draft), bytes);
  const dependencyIssue = invalid.blockingIssues.find(item => item.code === 'STOCK_COMMITMENT_SHORTAGE');
  assert.ok(dependencyIssue, JSON.stringify(invalid.blockingIssues));
  assert.deepEqual([...dependencyIssue.parentOperationIds].sort(), ['op:consumer', 'op:producer']);

  const valid = transact(previous, move('producer', '2026-07-13', 'M2'), {
    dependencies: [dependency],
    stock: [{ materialId: 'RAW', quantity: 100, unit: 'kg' }]
  });
  assert.equal(valid.accepted, true, JSON.stringify(valid.blockingIssues));
  assert.equal(valid.validation.dependencyStatus.byDependencyId['dep:raw'].state, 'ok');
}

// M/O. Drag e click_move têm o mesmo domínio; entrada é imutável e resultado determinístico.
{
  const previous = draft([allocation('domain')]);
  const bytes = JSON.stringify(previous);
  const drag = transact(previous, move('domain', '2026-07-14', 'M2', 'drag'));
  const click = transact(previous, move('domain', '2026-07-14', 'M2', 'click_move'));
  assert.deepEqual(drag, click);
  assert.equal(JSON.stringify(previous), bytes);
  assert.deepEqual(transact(previous, move('domain', '2026-07-14', 'M2')), drag);
}

// Contexto obrigatório ausente nunca é aceito silenciosamente.
{
  const previous = draft([allocation('missing-context')]);
  const result = applyManualScheduleTransaction({ currentDraft: previous, intent: move('missing-context', '2026-07-14') });
  assert.equal(result.accepted, false);
  assert.ok(result.blockingIssues.some(item => item.code === 'MISSING_VALIDATION_CONTEXT'));
}

console.log('manualScheduleTransaction.service.test.js ok');
