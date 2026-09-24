import assert from 'node:assert/strict';
import { validateManualScheduleTemporalRules } from '../services/manualScheduleValidation.service.js';

const timezone = 'America/Sao_Paulo';
const dayShift = [{ shiftId: 'day', label: 'Diurno', startTime: '07:00', endTime: '16:00', hoursPerDay: 9, teamAvailable: 4 }];

function allocation(overrides = {}) {
  return {
    allocationId: 'a1',
    machineId: 'M1',
    date: '2026-07-13',
    startTime: '08:00',
    endTime: '10:00',
    durationMinutes: 120,
    ...overrides
  };
}

function validate(allocations, options = {}) {
  return validateManualScheduleTemporalRules({
    draft: { draftId: 'draft-1', allocations },
    shifts: options.shifts || dayShift,
    manualWorkDates: options.manualWorkDates || [],
    holidays: options.holidays || [],
    timezone,
    operations: options.operations || [],
    dependencies: options.dependencies || [],
    transports: options.transports || [],
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: options.dependencyCompletionBufferMinutes ?? 60,
    ...(Object.hasOwn(options, 'stock') ? { stock: options.stock } : {}),
    ...(Object.hasOwn(options, 'stockMinimums') ? { stockMinimums: options.stockMinimums } : {}),
    ...(Object.hasOwn(options, 'stockLocations') ? { stockLocations: options.stockLocations } : {}),
    ...(Object.hasOwn(options, 'quantityPrecision') ? { quantityPrecision: options.quantityPrecision } : {}),
    ...(Object.hasOwn(options, 'setupMinutes') ? { setupMinutes: options.setupMinutes } : {}),
    ...(Object.hasOwn(options, 'setupRules') ? { setupRules: options.setupRules } : {}),
    ...(Object.hasOwn(options, 'dailyTeamOverrides') ? { dailyTeamOverrides: options.dailyTeamOverrides } : {}),
    ...(Object.hasOwn(options, 'teamOverrides') ? { teamOverrides: options.teamOverrides } : {}),
    ...(Object.hasOwn(options, 'setupOverrides') ? { setupOverrides: options.setupOverrides } : {})
  });
}

function productionAllocation({ allocationId, parentOperationId, materialId, quantity, startTime, endTime, machineId, ...overrides }) {
  return allocation({
    allocationId,
    parentOperationId,
    materialId,
    quantity,
    durationMinutes: (Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3)))
      - (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3))),
    startTime,
    endTime,
    machineId,
    ...overrides
  });
}

function dependency(dependencyId, producerParentOperationId, consumerParentOperationId, materialId, requiredQuantity, overrides = {}) {
  return { dependencyId, producerParentOperationId, consumerParentOperationId, materialId, requiredQuantity, ...overrides };
}

function codes(result) {
  return result.errors.map(error => error.code);
}

// A. Allocation válida em dia útil e dentro do turno.
{
  const result = validate([allocation()]);
  assert.equal(result.valid, true);
  assert.equal(result.summary.validAllocationCount, 1);
  assert.deepEqual(result.errors, []);
  assert.ok(result.timeline.events.some(event => event.type === 'ALLOCATION_START'));
  assert.ok(result.timeline.events.some(event => event.type === 'SHIFT_END'));
}

// B. Allocation em sábado não liberado é bloqueada.
{
  const result = validate([allocation({ date: '2026-07-18' })]);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('NON_WORKING_DATE_NOT_RELEASED'));
}

// B2. Sexta-feira é útil e domingo é fim de semana.
{
  const friday = validate([allocation({ allocationId: 'friday', date: '2026-07-17' })]);
  assert.equal(friday.valid, true);
  const sunday = validate([allocation({ allocationId: 'sunday', date: '2026-07-19' })]);
  assert.ok(codes(sunday).includes('NON_WORKING_DATE_NOT_RELEASED'));
}

// C. O mesmo sábado em manualWorkDates é permitido quando há turno válido.
{
  const result = validate([allocation({ date: '2026-07-18' })], { manualWorkDates: ['2026-07-18'] });
  assert.equal(result.valid, true);
}

// D. Feriado conhecido não liberado é bloqueado.
{
  const result = validate([allocation({ date: '2026-09-07' })]);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('NON_WORKING_DATE_NOT_RELEASED'));
}

// E. Allocation começando antes do turno é bloqueada.
{
  const result = validate([allocation({ startTime: '06:59' })]);
  assert.ok(codes(result).includes('ALLOCATION_OUTSIDE_SHIFT'));
}

// F. Allocation terminando depois do turno é bloqueada.
{
  const result = validate([allocation({ endTime: '16:01' })]);
  assert.ok(codes(result).includes('ALLOCATION_OUTSIDE_SHIFT'));
}

// G. Duas allocations sobrepostas na mesma máquina são bloqueadas e relacionadas.
{
  const result = validate([
    allocation({ allocationId: 'overlap-a', startTime: '08:00', endTime: '11:00' }),
    allocation({ allocationId: 'overlap-b', startTime: '10:00', endTime: '12:00' })
  ]);
  const issue = result.errors.find(error => error.code === 'MACHINE_TIME_OVERLAP');
  assert.deepEqual(issue.allocationIds, ['overlap-a', 'overlap-b']);
  assert.ok(result.affectedAllocations.byAllocationId['overlap-a'].errors.includes(issue.issueId));
  assert.ok(result.affectedAllocations.byAllocationId['overlap-b'].errors.includes(issue.issueId));
}

// H. Fim exatamente no início da próxima allocation é permitido.
{
  const result = validate([
    allocation({ allocationId: 'touch-a', startTime: '08:00', endTime: '10:00' }),
    allocation({ allocationId: 'touch-b', startTime: '10:00', endTime: '12:00' })
  ]);
  assert.equal(result.valid, true);
  assert.ok(!codes(result).includes('MACHINE_TIME_OVERLAP'));
  const sameInstant = result.timeline.events.filter(event => event.timestampKey === '2026-07-13T10:00');
  assert.deepEqual(sameInstant.map(event => event.type), ['ALLOCATION_END', 'ALLOCATION_START']);
}

// I. Máquinas diferentes no mesmo horário não conflitam.
{
  const result = validate([
    allocation({ allocationId: 'machine-a', machineId: 'M1' }),
    allocation({ allocationId: 'machine-b', machineId: 'M2' })
  ]);
  assert.equal(result.valid, true);
}

// J. Dois turnos sobrepostos geram erro de configuração.
{
  const result = validate([allocation()], {
    shifts: [
      { shiftId: 's1', startTime: '07:00', endTime: '12:00' },
      { shiftId: 's2', startTime: '11:00', endTime: '16:00' }
    ]
  });
  assert.ok(codes(result).includes('OVERLAPPING_SHIFTS_CONFIGURATION'));
  assert.equal(result.summary.shiftConfigurationErrorCount, 1);
}

// K. Intervalo sem cobertura entre dois turnos não conta como produção.
{
  const result = validate([allocation({ startTime: '11:00', endTime: '14:00' })], {
    shifts: [
      { shiftId: 'morning', startTime: '07:00', endTime: '12:00' },
      { shiftId: 'afternoon', startTime: '13:00', endTime: '17:00' }
    ]
  });
  assert.ok(codes(result).includes('ALLOCATION_OUTSIDE_SHIFT'));
}

// L. Turno e allocation atravessando meia-noite são normalizados corretamente.
{
  const result = validate([allocation({ date: '2026-07-13', startTime: '23:00', endTime: '02:00' })], {
    shifts: [{ shiftId: 'night', startTime: '22:00', endTime: '06:00' }]
  });
  assert.equal(result.valid, true);
  assert.ok(result.timeline.events.some(event => event.type === 'ALLOCATION_END' && event.date === '2026-07-14' && event.time === '02:00'));
  assert.ok(result.timeline.events.some(event => event.type === 'SHIFT_END' && event.date === '2026-07-14' && event.time === '06:00'));
}

// Contratos estruturais mínimos adicionais.
{
  const invalid = validate([allocation({ date: '2026-02-30', startTime: '25:00' })], {
    shifts: [{ shiftId: 'invalid', startTime: '07:00', endTime: '07:00' }]
  });
  assert.ok(codes(invalid).includes('INVALID_ALLOCATION_DATE'));
  assert.ok(codes(invalid).includes('INVALID_ALLOCATION_TIME'));
  assert.ok(codes(invalid).includes('INVALID_SHIFT_CONFIGURATION'));
}
{
  const invalidDateOnly = validate([allocation({ date: '2026-02-30' })]);
  assert.ok(codes(invalidDateOnly).includes('INVALID_ALLOCATION_DATE'));
  assert.ok(!codes(invalidDateOnly).includes('INVALID_ALLOCATION_TIME'));
}
{
  const missing = validate([allocation()], { shifts: [] });
  assert.ok(codes(missing).includes('SHIFT_NOT_FOUND'));
}

// M. Entradas permanecem serializadas de forma idêntica antes e depois.
{
  const draft = { allocations: [allocation()] };
  const shifts = structuredClone(dayShift);
  const manualWorkDates = ['2026-07-18'];
  const holidays = [{ date: '2026-07-20', name: 'Feriado local' }];
  const before = JSON.stringify({ draft, shifts, manualWorkDates, holidays });
  validateManualScheduleTemporalRules({ draft, shifts, manualWorkDates, holidays, timezone });
  assert.equal(JSON.stringify({ draft, shifts, manualWorkDates, holidays }), before);
}

// N. Duas execuções equivalentes produzem exatamente o mesmo resultado.
{
  const input = {
    draft: {
      allocations: [
        allocation({ allocationId: 'det-a', startTime: '08:00', endTime: '11:00' }),
        allocation({ allocationId: 'det-b', startTime: '10:00', endTime: '12:00' })
      ]
    },
    shifts: dayShift,
    manualWorkDates: [],
    holidays: [],
    timezone
  };
  assert.deepEqual(
    validateManualScheduleTemporalRules(input),
    validateManualScheduleTemporalRules(input)
  );
}

// Dependências A. O produtor forma o lote diário integral antes do consumidor e conclui com buffer.
{
  const result = validate([
    productionAllocation({ allocationId: 'pa', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'MP' }),
    productionAllocation({ allocationId: 'ca', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '10:00', endTime: '12:00', machineId: 'MC' })
  ], { dependencies: [dependency('d-a', 'P', 'C', 'MAT', 100)] });
  assert.equal(result.valid, true);
  assert.equal(result.dependencyStatus.byDependencyId['d-a'].state, 'ok');
}

// B. Consumidor inicia antes de o lote diário integral estar disponível.
{
  const result = validate([
    productionAllocation({ allocationId: 'pb', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'MP' }),
    productionAllocation({ allocationId: 'cb', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '08:20', endTime: '12:00', machineId: 'MC' })
  ], { dependencies: [dependency('d-b', 'P', 'C', 'MAT', 100)] });
  const issue = result.errors.find(item => item.code === 'DEPENDENCY_MINIMUM_NOT_AVAILABLE');
  assert.ok(issue);
  assert.deepEqual(issue.allocationIds, ['cb']);
  assert.deepEqual(issue.parentOperationIds, ['C', 'P']);
}

// C. Dois insumos são avaliados individualmente.
{
  const result = validate([
    productionAllocation({ allocationId: 'pc1', parentOperationId: 'P1', materialId: 'M1', quantity: 100, startTime: '08:00', endTime: '09:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'pc2', parentOperationId: 'P2', materialId: 'M2', quantity: 100, startTime: '08:00', endTime: '12:00', machineId: 'M2' }),
    productionAllocation({ allocationId: 'cc', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '09:00', endTime: '14:00', machineId: 'M3' })
  ], { dependencies: [dependency('d-c1', 'P1', 'C', 'M1', 100), dependency('d-c2', 'P2', 'C', 'M2', 100)] });
  const minimum = result.errors.find(error => error.code === 'DEPENDENCY_MINIMUM_NOT_AVAILABLE');
  assert.deepEqual(minimum.materialIds, ['M2']);
}

// D. Consumidores simultâneos competem em lote, sem privilégio por ordem.
{
  const allocations = [
    productionAllocation({ allocationId: 'pd', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'cd1', parentOperationId: 'C1', materialId: 'O1', quantity: 100, startTime: '08:40', endTime: '13:00', machineId: 'M2' }),
    productionAllocation({ allocationId: 'cd2', parentOperationId: 'C2', materialId: 'O2', quantity: 100, startTime: '08:40', endTime: '13:00', machineId: 'M3' })
  ];
  const dependencies = [dependency('d-d1', 'P', 'C1', 'MAT', 100), dependency('d-d2', 'P', 'C2', 'MAT', 100)];
  const first = validate(allocations, { dependencies });
  const reversed = validate([...allocations].reverse(), { dependencies: [...dependencies].reverse() });
  const firstIssue = first.errors.find(error => error.code === 'DEPENDENCY_MINIMUM_NOT_AVAILABLE');
  const reversedIssue = reversed.errors.find(error => error.code === 'DEPENDENCY_MINIMUM_NOT_AVAILABLE');
  assert.deepEqual(firstIssue.allocationIds, ['cd1', 'cd2']);
  assert.deepEqual(reversedIssue.allocationIds, ['cd1', 'cd2']);
  assert.equal(firstIssue.details.individualDemands.length, 2);
}

// E. O consumidor inicia assim que o produtor completa seu lote diário integral.
{
  const result = validate([
    productionAllocation({ allocationId: 'pe', parentOperationId: 'P', materialId: 'MAT', quantity: 120, startTime: '08:00', endTime: '12:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'ce', parentOperationId: 'C', materialId: 'OUT', quantity: 80, startTime: '10:40', endTime: '14:40', machineId: 'M2' })
  ], { dependencies: [dependency('d-e', 'P', 'C', 'MAT', 80)] });
  assert.equal(result.valid, true);
}

// F. Consumidor sem o lote diário integral é bloqueado já no início.
{
  const result = validate([
    productionAllocation({ allocationId: 'pf', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '12:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'cf', parentOperationId: 'C', materialId: 'OUT', quantity: 80, startTime: '09:30', endTime: '11:30', machineId: 'M2' })
  ], { dependencies: [dependency('d-f', 'P', 'C', 'MAT', 80)] });
  assert.ok(codes(result).includes('DEPENDENCY_MINIMUM_NOT_AVAILABLE'));
}

// G. Quantidade integral precisa respeitar o buffer produtivo padrão.
{
  const result = validate([
    productionAllocation({ allocationId: 'pg', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '12:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'cg', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '12:00', endTime: '12:30', machineId: 'M2' })
  ], { dependencies: [dependency('d-g', 'P', 'C', 'MAT', 100)] });
  assert.ok(result.errors.some(error => error.code === 'DEPENDENCY_FULL_QUANTITY_NOT_AVAILABLE' && error.rule === 'dependency_completion_buffer'));
}

// H. Múltiplas produtoras vinculadas somam oferta.
{
  const result = validate([
    productionAllocation({ allocationId: 'ph1', parentOperationId: 'P1', materialId: 'MAT', quantity: 50, startTime: '08:00', endTime: '10:00', machineId: 'M1', sourceParentOperationIds: ['P1', 'P2'] }),
    productionAllocation({ allocationId: 'ph2', parentOperationId: 'P2', materialId: 'MAT', quantity: 50, startTime: '08:00', endTime: '10:00', machineId: 'M2', sourceParentOperationIds: ['P1', 'P2'] }),
    productionAllocation({ allocationId: 'ch', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '10:00', endTime: '12:00', machineId: 'M3' })
  ], { dependencies: [dependency('d-h', 'P1', 'C', 'MAT', 100, { sourceParentOperationIds: ['P1', 'P2'] })] });
  assert.equal(result.valid, true);
  assert.deepEqual(result.dependencyStatus.byDependencyId['d-h'].producerAllocationIds, ['ph1', 'ph2']);
}

// I/J. Cadeia acíclica é válida; ciclo é bloqueado com caminho.
{
  const allocations = [
    productionAllocation({ allocationId: 'pi-a', parentOperationId: 'A', materialId: 'MA', quantity: 100, startTime: '08:00', endTime: '09:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'pi-b', parentOperationId: 'B', materialId: 'MB', quantity: 100, startTime: '09:30', endTime: '10:30', machineId: 'M2' }),
    productionAllocation({ allocationId: 'pi-c', parentOperationId: 'C', materialId: 'MC', quantity: 100, startTime: '10:30', endTime: '13:00', machineId: 'M3' })
  ];
  const chain = validate(allocations, { dependencies: [dependency('ab', 'A', 'B', 'MA', 100), dependency('bc', 'B', 'C', 'MB', 100)] });
  assert.equal(chain.valid, true);
  const cycle = validate(allocations.slice(0, 2), { dependencies: [dependency('ab', 'A', 'B', 'MA', 100), dependency('ba', 'B', 'A', 'MB', 100)] });
  const cycleIssue = cycle.errors.find(error => error.code === 'DEPENDENCY_CYCLE_DETECTED');
  assert.deepEqual(cycleIssue.details.cyclePath, ['A', 'B', 'A']);
}

// K-N. Transporte só disponibiliza no destino ao final e exige quantidade integral na origem.
{
  const allocations = [
    productionAllocation({ allocationId: 'pt', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '09:00', machineId: 'M1', sourceLocation: 'L1' }),
    productionAllocation({ allocationId: 'ct', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '10:00', endTime: '12:00', machineId: 'M2', targetLocation: 'L2' })
  ];
  const edge = dependency('dt', 'P', 'C', 'MAT', 100, { sourceLocation: 'L1', targetLocation: 'L2', transportId: 'T' });
  const validTransport = { transportId: 'T', materialId: 'MAT', quantity: 100, sourceLocation: 'L1', targetLocation: 'L2', durationMinutes: 60 };
  const valid = validate(allocations, { dependencies: [edge], transports: [validTransport] });
  assert.equal(valid.valid, true);
  assert.equal(valid.dependencyStatus.byDependencyId.dt.transportState, 'completed');
  const missing = validate(allocations, { dependencies: [edge] });
  assert.ok(codes(missing).includes('TRANSPORT_REQUIRED_MISSING'));
  const invalid = validate(allocations, { dependencies: [edge], transports: [{ ...validTransport, durationMinutes: 0 }] });
  assert.ok(codes(invalid).includes('TRANSPORT_INVALID_CONFIGURATION'));
  const early = validate(allocations, {
    dependencies: [edge],
    transports: [{ ...validTransport, startDate: '2026-07-13', startTime: '08:30' }]
  });
  assert.ok(codes(early).includes('TRANSPORT_QUANTITY_NOT_AVAILABLE'));
  const incomplete = validate([
    allocations[0],
    productionAllocation({ allocationId: 'ct-early', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '09:30', endTime: '12:00', machineId: 'M2', targetLocation: 'L2' })
  ], { dependencies: [edge], transports: [validTransport] });
  assert.ok(codes(incomplete).includes('TRANSPORT_NOT_COMPLETED'));
}

// O/P. Card unificado preserva vínculos e rateio; inconsistência é estrutural e bloqueante.
{
  const unified = productionAllocation({
    allocationId: 'unified', parentOperationId: 'P1', materialId: 'MAT', quantity: 100,
    startTime: '08:00', endTime: '09:00', machineId: 'M1', sourceParentOperationIds: ['P1', 'P2'],
    components: [
      { parentOperationId: 'P1', materialId: 'MAT', quantity: 40 },
      { parentOperationId: 'P2', materialId: 'MAT', quantity: 60 }
    ]
  });
  const consumer = productionAllocation({ allocationId: 'co', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '10:00', endTime: '12:00', machineId: 'M2' });
  const reconciled = validate([unified, consumer], {
    dependencies: [dependency('do1', 'P1', 'C', 'MAT', 40), dependency('do2', 'P2', 'C', 'MAT', 60)]
  });
  assert.ok(!codes(reconciled).includes('DEPENDENCY_COMPONENT_RECONCILIATION_ERROR'));
  assert.deepEqual(reconciled.dependencyStatus.byDependencyId.do1.producerAllocationIds, ['unified']);
  assert.deepEqual(reconciled.dependencyStatus.byDependencyId.do2.producerAllocationIds, ['unified']);
  const inconsistent = validate([{ ...unified, components: [{ parentOperationId: 'P1', materialId: 'MAT', quantity: 90 }] }, consumer], {
    dependencies: [dependency('dp', 'P1', 'C', 'MAT', 90)]
  });
  assert.ok(codes(inconsistent).includes('DEPENDENCY_COMPONENT_RECONCILIATION_ERROR'));
}

// Q. Entradas ampliadas permanecem imutáveis e o resultado continua determinístico.
{
  const input = {
    draft: { allocations: [
      productionAllocation({ allocationId: 'pq', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'M1' }),
      productionAllocation({ allocationId: 'cq', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '08:40', endTime: '12:00', machineId: 'M2' })
    ] },
    shifts: dayShift,
    manualWorkDates: [],
    holidays: [],
    timezone,
    operations: [],
    dependencies: [dependency('dq', 'P', 'C', 'MAT', 100)],
    transports: [],
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: 60
  };
  const before = JSON.stringify(input);
  const first = validateManualScheduleTemporalRules(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, validateManualScheduleTemporalRules(input));
}

// Ledger A. Estoque inicial suficiente é reservado e consumido sem saldo negativo.
{
  const consumer = productionAllocation({ allocationId: 'stock-a', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'MC' });
  const result = validate([consumer], { dependencies: [dependency('sd-a', 'P', 'C', 'MAT', 100)], stock: [{ materialId: 'MAT', quantity: 100, unit: 'kg' }] });
  assert.equal(result.valid, true);
  assert.equal(result.stockProjection.byMaterial.MAT.locations.__default__.finalPhysicalBalance, 0);
  assert.equal(result.stockProjection.byMaterial.MAT.locations.__default__.finalCommittedQuantity, 0);
}

// Configuração estrutural rejeita estoque inicial negativo e quantidade não numérica.
{
  const result = validate([], { stock: [{ materialId: 'MAT', quantity: -1, unit: 'kg' }, { materialId: 'M2', quantity: 'x', unit: 'kg' }] });
  assert.ok(codes(result).includes('NEGATIVE_INITIAL_STOCK'));
  assert.ok(codes(result).includes('INVALID_STOCK_CONFIGURATION'));
}

// Ledger B/E. Produção anterior ou parcial alimenta consumo progressivo.
{
  const previous = validate([
    productionAllocation({ allocationId: 'stock-pb', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '09:00', machineId: 'MP' }),
    productionAllocation({ allocationId: 'stock-cb', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '09:00', endTime: '10:00', machineId: 'MC' })
  ], { dependencies: [dependency('sd-b', 'P', 'C', 'MAT', 100)], stock: [] });
  assert.equal(previous.valid, true);
  const partial = validate([
    productionAllocation({ allocationId: 'stock-pe', parentOperationId: 'P', materialId: 'MAT', quantity: 120, startTime: '08:00', endTime: '12:00', machineId: 'MP' }),
    productionAllocation({ allocationId: 'stock-ce', parentOperationId: 'C', materialId: 'OUT', quantity: 80, startTime: '10:40', endTime: '14:40', machineId: 'MC' })
  ], { dependencies: [dependency('sd-e', 'P', 'C', 'MAT', 80)], stock: [] });
  assert.equal(partial.valid, true);
}

// Ledger C/D/S. Compromissos simultâneos são avaliados em lote e independem da ordem.
{
  const consumers = [
    productionAllocation({ allocationId: 'stock-c1', parentOperationId: 'C1', materialId: 'O1', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'stock-c2', parentOperationId: 'C2', materialId: 'O2', quantity: 100, startTime: '08:00', endTime: '10:00', machineId: 'M2' })
  ];
  const dependencies = [dependency('sd-c1', 'P', 'C1', 'MAT', 100), dependency('sd-c2', 'P', 'C2', 'MAT', 100)];
  const first = validate(consumers, { dependencies, stock: [{ materialId: 'MAT', quantity: 50, unit: 'kg' }] });
  const reversed = validate([...consumers].reverse(), { dependencies: [...dependencies].reverse(), stock: [{ materialId: 'MAT', quantity: 50, unit: 'kg' }] });
  const issue = first.errors.find(item => item.code === 'STOCK_COMMITMENT_SHORTAGE');
  assert.deepEqual(issue.allocationIds, ['stock-c1', 'stock-c2']);
  assert.deepEqual(reversed.errors.find(item => item.code === 'STOCK_COMMITMENT_SHORTAGE').allocationIds, issue.allocationIds);
  assert.deepEqual(first.stockProjection, reversed.stockProjection);
}

// Ledger F/N. Consumo mais rápido que a entrada produz saldo negativo bloqueante.
{
  const result = validate([
    productionAllocation({ allocationId: 'stock-pf', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '12:00', machineId: 'MP' }),
    productionAllocation({ allocationId: 'stock-cf', parentOperationId: 'C', materialId: 'OUT', quantity: 80, startTime: '09:00', endTime: '11:00', machineId: 'MC' })
  ], { dependencies: [dependency('sd-f', 'P', 'C', 'MAT', 80)], stock: [] });
  assert.ok(codes(result).includes('STOCK_NEGATIVE_BALANCE'));
  assert.ok(result.stockProjection.summary.shortageCount > 0);
}

// Ledger G/H. Materiais são independentes e múltiplas produtoras somam entradas.
{
  const result = validate([
    productionAllocation({ allocationId: 'stock-pg1', parentOperationId: 'P1', materialId: 'M1', quantity: 40, startTime: '08:00', endTime: '09:00', machineId: 'M1' }),
    productionAllocation({ allocationId: 'stock-pg2', parentOperationId: 'P2', materialId: 'M1', quantity: 60, startTime: '08:00', endTime: '09:00', machineId: 'M2' }),
    productionAllocation({ allocationId: 'stock-cg', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '09:00', endTime: '11:00', machineId: 'M3' })
  ], {
    dependencies: [dependency('sd-g1', 'P1', 'C', 'M1', 100, { sourceParentOperationIds: ['P1', 'P2'] }), dependency('sd-g2', 'PX', 'C', 'M2', 10)],
    stock: [{ materialId: 'M2', quantity: 5, unit: 'kg' }]
  });
  assert.equal(result.stockProjection.byMaterial.M1.locations.__default__.initialQuantity, 0);
  assert.ok(result.errors.some(item => item.code === 'STOCK_NEGATIVE_BALANCE' && item.materialIds.includes('M2')));
}

// Ledger I-K. Transporte retira na origem, mantém trânsito e só então entra no destino.
{
  const allocations = [
    productionAllocation({ allocationId: 'stock-pt', parentOperationId: 'P', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '09:00', machineId: 'MP', sourceLocation: 'L1' }),
    productionAllocation({ allocationId: 'stock-ct', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '10:00', endTime: '12:00', machineId: 'MC', targetLocation: 'L2' })
  ];
  const edge = dependency('sd-t', 'P', 'C', 'MAT', 100, { sourceLocation: 'L1', targetLocation: 'L2', transportId: 'ST' });
  const transport = { transportId: 'ST', materialId: 'MAT', quantity: 100, sourceLocation: 'L1', targetLocation: 'L2', durationMinutes: 60, producerParentOperationIds: ['P'] };
  const valid = validate(allocations, { dependencies: [edge], transports: [transport], stock: [] });
  assert.equal(valid.valid, true);
  const origin = valid.stockProjection.byMaterial.MAT.locations.L1;
  const destination = valid.stockProjection.byMaterial.MAT.locations.L2;
  assert.ok(origin.events.some(item => item.type === 'TRANSPORT_DISPATCH'));
  assert.ok(destination.events.some(item => item.type === 'TRANSPORT_ARRIVAL'));
  assert.equal(destination.finalPhysicalBalance, 0);

  const early = validate([allocations[0], { ...allocations[1], startTime: '09:30' }], { dependencies: [edge], transports: [transport], stock: [] });
  assert.ok(codes(early).includes('STOCK_COMMITMENT_SHORTAGE'));
  const dispatchWithoutStock = validate([allocations[1]], { dependencies: [edge], transports: [{ ...transport, startDate: '2026-07-13', startTime: '09:00' }], stock: [] });
  assert.ok(codes(dispatchWithoutStock).includes('STOCK_TRANSPORT_DISPATCH_SHORTAGE'));
}

// Ledger L. IDs de transporte repetidos não geram duas chegadas.
{
  const transports = [
    { transportId: 'DUP', materialId: 'MAT', quantity: 10, sourceLocation: 'L1', targetLocation: 'L2', startDate: '2026-07-13', startTime: '08:00', durationMinutes: 60 },
    { transportId: 'DUP', materialId: 'MAT', quantity: 10, sourceLocation: 'L1', targetLocation: 'L2', startDate: '2026-07-13', startTime: '08:00', durationMinutes: 60 }
  ];
  const result = validate([], { transports, stock: [{ materialId: 'MAT', locationId: 'L1', quantity: 10, unit: 'kg' }] });
  assert.ok(codes(result).includes('STOCK_TRANSPORT_DUPLICATE_EVENT'));
  assert.equal(result.stockProjection.byMaterial.MAT.locations.L2.events.filter(item => item.type === 'TRANSPORT_ARRIVAL').length, 1);
}

// Ledger M. Estoque mínimo alerta sem invalidar o draft.
{
  const consumer = productionAllocation({ allocationId: 'stock-min', parentOperationId: 'C', materialId: 'OUT', quantity: 60, startTime: '08:00', endTime: '10:00', machineId: 'MC' });
  const result = validate([consumer], {
    dependencies: [dependency('sd-min', 'P', 'C', 'MAT', 60)],
    stock: [{ materialId: 'MAT', quantity: 100, unit: 'kg' }],
    stockMinimums: [{ materialId: 'MAT', minimumQuantity: 40 }]
  });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(item => item.code === 'STOCK_MINIMUM_REACHED'));
}

// Ledger O. Componentes unificados reconciliam e não duplicam produção.
{
  const unified = productionAllocation({
    allocationId: 'stock-unified', parentOperationId: 'P1', materialId: 'MAT', quantity: 100, startTime: '08:00', endTime: '09:00', machineId: 'MP',
    sourceParentOperationIds: ['P1', 'P2'], components: [{ parentOperationId: 'P1', materialId: 'MAT', quantity: 40 }, { parentOperationId: 'P2', materialId: 'MAT', quantity: 60 }]
  });
  const consumer = productionAllocation({ allocationId: 'stock-uc', parentOperationId: 'C', materialId: 'OUT', quantity: 100, startTime: '09:00', endTime: '10:00', machineId: 'MC' });
  const result = validate([unified, consumer], { dependencies: [dependency('sd-u1', 'P1', 'C', 'MAT', 40), dependency('sd-u2', 'P2', 'C', 'MAT', 60)], stock: [] });
  const productionTotal = result.stockProjection.byMaterial.MAT.locations.__default__.events.filter(item => item.type === 'PRODUCTION_AVAILABLE').reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(productionTotal, 100);
}

// Ledger P/Q. Local errado não atende consumo e unidade incompatível é estrutural.
{
  const consumer = productionAllocation({ allocationId: 'stock-loc', parentOperationId: 'C', materialId: 'OUT', quantity: 10, startTime: '08:00', endTime: '09:00', machineId: 'MC', targetLocation: 'L2' });
  const wrongLocation = validate([consumer], { dependencies: [dependency('sd-loc', 'P', 'C', 'MAT', 10, { targetLocation: 'L2' })], stock: [{ materialId: 'MAT', locationId: 'L1', quantity: 10, unit: 'kg' }] });
  assert.ok(codes(wrongLocation).includes('STOCK_COMMITMENT_SHORTAGE'));
  assert.ok(codes(wrongLocation).includes('STOCK_LOCATION_MISMATCH'));
  const invalidUnit = validate([{ ...consumer, unit: 'kg' }], { dependencies: [{ ...dependency('sd-unit', 'P', 'C', 'MAT', 10), unit: 'kg' }], stock: [{ materialId: 'MAT', quantity: 10, unit: 't' }] });
  assert.ok(codes(invalidUnit).includes('INVALID_STOCK_UNIT'));
}

// Local agregado e local real preservam detalhes técnicos sem expor IDs crus na mensagem.
{
  const aggregated = validate([], {
    stock: [{ materialId: 'MAT', quantity: 10, unit: 'kg' }],
    stockMinimums: [],
    stockLocations: [{ locationId: 'L1' }]
  });
  const aggregatedIssue = aggregated.errors.find(item => item.code === 'STOCK_LOCATION_MISMATCH');
  assert.equal(aggregatedIssue.locationId, '__default__');
  assert.equal(aggregatedIssue.message, 'O estoque agregado do material não está configurado corretamente.');
  assert.ok(!aggregatedIssue.message.includes('__default__'));
  assert.deepEqual(aggregatedIssue.details.configuredLocations, ['L1']);

  const named = validate([], {
    stock: [{ materialId: 'MAT', locationId: 'LOC-INTERNO-9', locationName: 'Almoxarifado', quantity: 10, unit: 'kg' }],
    stockMinimums: [],
    stockLocations: [{ locationId: 'L1' }]
  });
  const namedIssue = named.errors.find(item => item.code === 'STOCK_LOCATION_MISMATCH');
  assert.equal(namedIssue.locationId, 'LOC-INTERNO-9');
  assert.match(namedIssue.message, /Almoxarifado/);
  assert.ok(!namedIssue.message.includes('LOC-INTERNO-9'));
}

// Ledger R/T. Precisão decimal, imutabilidade e determinismo.
{
  const input = {
    draft: { allocations: [productionAllocation({ allocationId: 'stock-dec', parentOperationId: 'C', materialId: 'OUT', quantity: 1, startTime: '08:00', endTime: '09:00', machineId: 'MC' })] },
    shifts: dayShift, manualWorkDates: [], holidays: [], timezone, operations: [],
    dependencies: [dependency('sd-dec', 'P', 'C', 'MAT', 0.12345678)], transports: [],
    minimumStartRatio: 1, dependencyCompletionBufferMinutes: 60,
    stock: [{ materialId: 'MAT', quantity: 0.12345678, unit: 'kg' }], stockMinimums: [], stockLocations: [], quantityPrecision: 8
  };
  const before = JSON.stringify(input);
  const first = validateManualScheduleTemporalRules(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, validateManualScheduleTemporalRules(input));
  assert.equal(first.stockProjection.byMaterial.MAT.locations.__default__.finalPhysicalBalance, 0);
}

// Recursos A. Mesmo material/configuração consecutivo não exige setup.
{
  const result = validate([
    allocation({ allocationId: 'same-a', materialId: 'MAT-A', materialCode: 'A', unit: 'kg', startTime: '08:00', endTime: '09:00' }),
    allocation({ allocationId: 'same-b', materialId: 'MAT-A', materialCode: 'A', unit: 'kg', startTime: '09:00', endTime: '10:00' })
  ], { setupMinutes: 30 });
  assert.equal(result.resourceProjection.summary.setupCount, 0);
  assert.deepEqual(result.setupConflicts, []);
}

// Recursos B/C. Troca com intervalo suficiente é válida; sem intervalo é bloqueada.
{
  const base = [
    allocation({ allocationId: 'change-a', materialId: 'MAT-A', startTime: '08:00', endTime: '09:00' }),
    allocation({ allocationId: 'change-b', materialId: 'MAT-B', startTime: '09:30', endTime: '10:30' })
  ];
  const enough = validate(base, { setupMinutes: 30 });
  assert.equal(enough.valid, true);
  assert.equal(enough.resourceProjection.byMachine.M1.setupMinutes, 30);
  const insufficient = validate([{ ...base[0] }, { ...base[1], startTime: '09:15' }], { setupMinutes: 30 });
  assert.ok(codes(insufficient).includes('SETUP_INTERVAL_INSUFFICIENT'));
}

// Recursos D. A mudança de turno não elimina o setup.
{
  const result = validate([
    allocation({ allocationId: 'turn-a', materialId: 'A', startTime: '10:00', endTime: '12:00' }),
    allocation({ allocationId: 'turn-b', materialId: 'B', startTime: '13:00', endTime: '14:00' })
  ], {
    shifts: [{ shiftId: 'morning', startTime: '07:00', endTime: '12:00', teamAvailable: 4 }, { shiftId: 'afternoon', startTime: '13:00', endTime: '17:00', teamAvailable: 4 }],
    setupMinutes: 30
  });
  assert.equal(result.resourceProjection.summary.setupCount, 1);
  assert.ok(codes(result).includes('SETUP_OUTSIDE_WORK_WINDOW'));
}

// Recursos E. Setup atravessando meia-noite dentro do turno noturno.
{
  const result = validate([
    allocation({ allocationId: 'night-a', materialId: 'A', date: '2026-07-13', startTime: '22:00', endTime: '23:00' }),
    allocation({ allocationId: 'night-b', materialId: 'B', date: '2026-07-14', startTime: '00:15', endTime: '01:00' })
  ], { shifts: [{ shiftId: 'night', startTime: '22:00', endTime: '06:00', teamAvailable: 4 }], setupMinutes: 30 });
  assert.equal(result.valid, true);
  assert.equal(result.resourceProjection.summary.setupCount, 1);
}

// Recursos F/G. Setup fora da janela e sobrepondo produção são bloqueados.
{
  const outside = validate([
    allocation({ allocationId: 'outside-a', materialId: 'A', startTime: '08:00', endTime: '12:00' }),
    allocation({ allocationId: 'outside-b', materialId: 'B', startTime: '13:00', endTime: '14:00' })
  ], { shifts: [{ shiftId: 's1', startTime: '07:00', endTime: '12:00', teamAvailable: 4 }, { shiftId: 's2', startTime: '13:00', endTime: '17:00', teamAvailable: 4 }], setupMinutes: 20 });
  assert.ok(codes(outside).includes('SETUP_OUTSIDE_WORK_WINDOW'));
  const overlap = validate([
    allocation({ allocationId: 'setup-prod-a', materialId: 'A', startTime: '08:00', endTime: '10:00' }),
    allocation({ allocationId: 'setup-prod-b', materialId: 'B', startTime: '10:15', endTime: '11:00' })
  ], { setupMinutes: 30 });
  assert.ok(codes(overlap).includes('SETUP_INTERVAL_INSUFFICIENT'));
  assert.ok(codes(overlap).includes('SETUP_OVERLAP'));
}

// Recursos H/I/J. Equipe abaixo, exatamente e acima do limite.
{
  assert.equal(validate([allocation({ peopleCount: 3 })]).valid, true);
  assert.equal(validate([allocation({ peopleCount: 4 })]).valid, true);
  const exceeded = validate([allocation({ peopleCount: 5 })]);
  assert.ok(codes(exceeded).includes('TEAM_CAPACITY_EXCEEDED'));
  assert.equal(exceeded.resourceProjection.byDate['2026-07-13'].shifts.day.peakPeople, 5);
}

// Recursos K. Máquinas diferentes competem pela mesma equipe.
{
  const result = validate([
    allocation({ allocationId: 'team-m1', machineId: 'M1', peopleCount: 3 }),
    allocation({ allocationId: 'team-m2', machineId: 'M2', peopleCount: 2 })
  ]);
  const issue = result.errors.find(item => item.code === 'TEAM_CAPACITY_EXCEEDED');
  assert.deepEqual(issue.allocationIds, ['team-m1', 'team-m2']);
  assert.deepEqual(issue.machineIds, ['M1', 'M2']);
  assert.equal(issue.requiredPeople, 5);
}

// Recursos L. Fim e início no mesmo minuto não são simultâneos.
{
  const result = validate([
    allocation({ allocationId: 'team-touch-a', machineId: 'M1', peopleCount: 4, startTime: '08:00', endTime: '10:00' }),
    allocation({ allocationId: 'team-touch-b', machineId: 'M2', peopleCount: 4, startTime: '10:00', endTime: '12:00' })
  ]);
  assert.ok(!codes(result).includes('TEAM_CAPACITY_EXCEEDED'));
  assert.equal(result.resourceProjection.byDate['2026-07-13'].shifts.day.peakPeople, 4);
}

// Recursos L2. Overlap parcial deve bloquear pelo pico de simultaneidade.
{
  const result = validate([
    allocation({ allocationId: 'team-partial-a', machineId: 'M1', peopleCount: 2, startTime: '07:00', endTime: '12:17' }),
    allocation({ allocationId: 'team-partial-b', machineId: 'M2', peopleCount: 2, startTime: '10:31', endTime: '14:02' })
  ], { shifts: [{ ...dayShift[0], teamAvailable: 3 }] });
  assert.ok(codes(result).includes('TEAM_CAPACITY_EXCEEDED'));
  assert.equal(result.resourceProjection.byDate['2026-07-13'].shifts.day.peakPeople, 4);
}

// Recursos M/N. dailyTeamOverride aumenta ou reduz a capacidade exata.
{
  const increased = validate([allocation({ peopleCount: 5 })], { dailyTeamOverrides: { '2026-07-13': { day: 5 } } });
  assert.equal(increased.valid, true);
  assert.equal(increased.resourceProjection.byDate['2026-07-13'].shifts.day.availablePeople, 5);
  const reduced = validate([allocation({ peopleCount: 3 })], { dailyTeamOverrides: [{ date: '2026-07-13', shiftId: 'day', availablePeople: 2 }] });
  assert.ok(codes(reduced).includes('TEAM_CAPACITY_EXCEEDED'));
}

// Recursos O/P. Override extraordinário autoriza até o próprio limite.
{
  const allocations = [
    allocation({ allocationId: 'extra-a', machineId: 'M1', peopleCount: 3 }),
    allocation({ allocationId: 'extra-b', machineId: 'M2', peopleCount: 2 })
  ];
  const override = { overrideId: 'team-extra-1', date: '2026-07-13', shiftId: 'day', allowedPeople: 5, allocationIds: ['extra-a', 'extra-b'], reason: 'Equipe extraordinária aprovada' };
  const allowed = validate(allocations, { teamOverrides: [override] });
  assert.equal(allowed.valid, true);
  assert.ok(allowed.warnings.some(item => item.code === 'TEAM_CAPACITY_OVERRIDE_USED' && item.overrideId === 'team-extra-1'));
  const exceeded = validate([{ ...allocations[0], peopleCount: 4 }, allocations[1]], { teamOverrides: [override] });
  assert.ok(codes(exceeded).includes('TEAM_CAPACITY_EXCEEDED'));
}

// Recursos Q. peopleCount zero é válido.
{
  const result = validate([allocation({ peopleCount: 0 })]);
  assert.equal(result.valid, true);
  assert.equal(result.resourceProjection.byDate['2026-07-13'].shifts.day.peakPeople, 0);
}

// Recursos R. Allocation atravessando turnos é segmentada.
{
  const result = validate([allocation({ peopleCount: 3, startTime: '11:00', endTime: '13:00' })], {
    shifts: [{ shiftId: 'morning', startTime: '07:00', endTime: '12:00', teamAvailable: 4 }, { shiftId: 'afternoon', startTime: '12:00', endTime: '17:00', teamAvailable: 2 }]
  });
  assert.equal(result.resourceProjection.byDate['2026-07-13'].shifts.morning.peakPeople, 3);
  assert.equal(result.resourceProjection.byDate['2026-07-13'].shifts.afternoon.peakPeople, 3);
  assert.ok(result.errors.some(item => item.code === 'TEAM_CAPACITY_EXCEEDED' && item.shiftIds.includes('afternoon')));
}

// Regras específicas sobrescrevem setup por máquina/transição sem mutar o draft.
{
  const result = validate([
    allocation({ allocationId: 'rule-a', materialId: 'A', startTime: '08:00', endTime: '09:00' }),
    allocation({ allocationId: 'rule-b', materialId: 'B', startTime: '09:15', endTime: '10:00' })
  ], { setupMinutes: 30, setupRules: [{ machineId: 'M1', fromMaterialId: 'A', toMaterialId: 'B', setupMinutes: 15 }] });
  assert.equal(result.valid, true);
  assert.equal(result.setupIntervals[0].durationMinutes, 15);
}

// Overrides estruturais inválidos não são aceitos silenciosamente.
{
  const invalidDaily = validate([allocation()], { dailyTeamOverrides: { '2026-07-13': { day: -1 } } });
  assert.ok(codes(invalidDaily).includes('INVALID_TEAM_OVERRIDE'));
  const invalidSetup = validate([allocation()], { setupOverrides: [{ overrideId: 'bad-setup', fromAllocationId: 'missing', toAllocationId: 'a1', setupMinutes: 10 }] });
  assert.ok(codes(invalidSetup).includes('INVALID_SETUP_CONFIGURATION'));
}

// Recursos S/T. Ordem não altera o resultado; imutabilidade e determinismo.
{
  const input = {
    draft: { allocations: [
      allocation({ allocationId: 'stable-b', machineId: 'M2', materialId: 'B', peopleCount: 2, startTime: '09:00', endTime: '11:00' }),
      allocation({ allocationId: 'stable-a', machineId: 'M1', materialId: 'A', peopleCount: 3, startTime: '08:00', endTime: '10:00' })
    ] },
    shifts: structuredClone(dayShift), setupMinutes: 20,
    dailyTeamOverrides: { '2026-07-13': { day: 4 } }, teamOverrides: [], setupOverrides: [], manualWorkDates: [], holidays: [], timezone
  };
  const before = JSON.stringify(input);
  const first = validateManualScheduleTemporalRules(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, validateManualScheduleTemporalRules(input));
  const reversed = validateManualScheduleTemporalRules({ ...input, draft: { allocations: [...input.draft.allocations].reverse() } });
  assert.deepEqual(first.errors, reversed.errors);
  assert.deepEqual(first.warnings, reversed.warnings);
  assert.deepEqual(first.resourceProjection, reversed.resourceProjection);
}

console.log('manualScheduleValidation.service.test.js ok');
