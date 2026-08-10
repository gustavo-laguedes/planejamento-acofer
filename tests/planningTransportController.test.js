import assert from 'node:assert/strict';
import {
  applyManualTransportConstraints,
  buildManualTransportScopeParentIds,
  manualTransportForAllocation,
  manualTransportIdFor,
  productionCalendarDownstreamParentIds,
  productionCalendarSuccessorParentIds,
  savePlanningManualTransport,
  transportArrivalDateFromHours,
  transportHoursForArrivalDate,
  withManualTransportPresentation
} from '../shared/planning-controller/planningTransportController.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const now = () => new Date('2026-08-10T12:34:56.000Z');

const producer = {
  allocationId: 'alloc/1',
  sourceAllocationIds: ['legacy-a', 'legacy-b'],
  calendarParentOperationId: 'P:day-1',
  parentOperationId: 'P',
  operationId: 'P:day-1',
  materialId: 'MAT/1',
  materialName: 'Material A',
  machineId: 'M1',
  machineName: 'Maquina 1',
  date: '2026-08-10',
  startTime: '08:00',
  endTime: '10:00',
  productionId: 'prod-1',
  productionIndex: 0,
  productionStage: 1,
  status: 'Planejado',
  quantity: 100
};

const consumer = {
  allocationId: 'alloc-2',
  parentOperationId: 'C',
  operationId: 'C:day-1',
  materialId: 'MAT-C',
  materialName: 'Material C',
  date: '2026-08-11',
  startTime: '07:00',
  productionId: 'prod-1',
  productionIndex: 0,
  productionStage: 2
};

const downstream = {
  allocationId: 'alloc-3',
  parentOperationId: 'D',
  operationId: 'D:day-1',
  materialId: 'MAT-D',
  materialName: 'Material D',
  date: '2026-08-12',
  startTime: '07:00',
  productionId: 'prod-1',
  productionIndex: 0,
  productionStage: 3
};

const lateralSameMaterial = {
  allocationId: 'alloc-4',
  parentOperationId: 'X',
  operationId: 'X:day-1',
  materialId: 'MAT/1',
  materialName: 'Material A',
  date: '2026-08-11',
  startTime: '07:00',
  productionId: 'prod-2',
  productionIndex: 1,
  productionStage: 2
};

const dependencies = [
  { producerParentOperationId: 'P:day-1', consumerParentOperationId: 'C' },
  { producerParentOperationId: 'C', consumerParentOperationId: 'D' },
  { producerParentOperationId: 'P:day-1', consumerParentOperationId: 'X' }
];

{
  assert.equal(manualTransportIdFor(producer), 'manual-transport:P_day-1:MAT_1:alloc_1');
  assert.equal(manualTransportIdFor({ ...producer, calendarParentOperationId: '', parentOperationId: '', operationId: 'P:day-7' }), 'manual-transport:P:MAT_1:alloc_1');
}

{
  assert.equal(transportArrivalDateFromHours(producer, '1,5'), '2026-08-10');
  assert.equal(transportArrivalDateFromHours(producer, '-1'), '');
  assert.equal(transportArrivalDateFromHours(producer, 'abc'), '');
  assert.equal(transportHoursForArrivalDate(producer, '2026-08-11'), '24');
  assert.equal(transportHoursForArrivalDate(producer, 'invalida'), '');
  assert.equal(transportHoursForArrivalDate(producer, '2026-08-09'), '0');
}

{
  const sourceDraft = {
    allocations: [producer, consumer, downstream, lateralSameMaterial],
    constraints: [
      { type: 'PIN_START', transportId: 'unrelated', parentOperationId: 'Z', date: '2026-08-09' },
      { type: 'MANUAL_TRANSPORT', transportId: 'legacy', producerParentOperationId: 'P:day-1', materialId: 'MAT/1' },
      { type: 'PIN_START', transportId: 'legacy', parentOperationId: 'C', source: 'manual-transport' }
    ],
    dailyTeamOverrides: { '2026-08-10': { M1: 2 } },
    manualWorkDates: ['2026-08-15']
  };
  const original = clone(sourceDraft);
  deepFreeze(sourceDraft);
  const result = applyManualTransportConstraints({
    sourceDraft,
    allocation: producer,
    arrivalDate: '2026-08-11',
    hours: '24',
    dependencies,
    now
  });
  assert.notEqual(result, sourceDraft);
  assert.deepEqual(sourceDraft, original);
  assert.deepEqual(result.constraints.map(item => item.type), ['PIN_START', 'MANUAL_TRANSPORT', 'PIN_MACHINE', 'PIN_START', 'MIN_START']);
  assert.equal(result.constraints[0].transportId, 'unrelated');
  const record = result.constraints.find(item => item.type === 'MANUAL_TRANSPORT');
  assert.equal(record.transportId, 'manual-transport:P_day-1:MAT_1:alloc_1');
  assert.equal(record.producerParentOperationId, 'P:day-1');
  assert.equal(record.producerAllocationId, 'alloc/1');
  assert.deepEqual(record.producerSourceAllocationIds, ['alloc/1', 'legacy-a', 'legacy-b']);
  assert.deepEqual(record.consumerParentOperationIds, ['C']);
  assert.deepEqual(record.affectedParentOperationIds, ['C', 'D']);
  assert.equal(record.materialId, 'MAT/1');
  assert.equal(record.materialName, 'Material A');
  assert.equal(record.arrivalDate, '2026-08-11');
  assert.equal(record.hours, '24');
  assert.equal(record.createdAt, '2026-08-10T12:34:56.000Z');
  assert.equal(result.constraints.find(item => item.type === 'PIN_MACHINE').source, 'manual-transport-producer');
  assert.equal(result.constraints.find(item => item.type === 'PIN_START' && item.transportId === record.transportId).source, 'manual-transport-producer');
  assert.equal(result.constraints.find(item => item.type === 'MIN_START').source, 'manual-transport');
  assert.equal(result.constraints.find(item => item.type === 'MIN_START').time, '07:00');
}

{
  const transportId = manualTransportIdFor(producer);
  const sourceDraft = {
    allocations: [producer, consumer],
    constraints: [
      { type: 'MANUAL_TRANSPORT', transportId, producerParentOperationId: 'P:day-1', producerAllocationId: 'alloc/1', materialId: 'MAT/1' },
      { type: 'PIN_MACHINE', transportId, parentOperationId: 'P:day-1' },
      { type: 'MANUAL_TRANSPORT', transportId: 'legacy', producerParentOperationId: 'P:day-1', materialId: 'MAT/1' },
      { type: 'PIN_START', transportId: 'keep', parentOperationId: 'Z' }
    ]
  };
  const result = applyManualTransportConstraints({ sourceDraft, allocation: producer, arrivalDate: null, now });
  assert.deepEqual(result.constraints, [{ type: 'PIN_START', transportId: 'keep', parentOperationId: 'Z' }]);
}

{
  const sourceDraft = {
    constraints: [
      {
        type: 'MANUAL_TRANSPORT',
        transportId: 'different-id',
        producerParentOperationId: 'P:day-1',
        producerAllocationId: 'legacy-a',
        producerSourceAllocationIds: ['older'],
        materialId: 'MAT/1',
        arrivalDate: '2026-08-11',
        hours: '24',
        consumerParentOperationIds: ['C'],
        affectedParentOperationIds: ['C', 'D']
      }
    ]
  };
  assert.equal(manualTransportForAllocation(producer, sourceDraft)?.transportId, 'different-id');
  const presented = withManualTransportPresentation([producer, consumer], sourceDraft);
  assert.equal(presented[0].allocationId, producer.allocationId);
  assert.equal(presented[0].status, 'Planejado');
  assert.equal(presented[0].manualTransport.transportId, 'different-id');
  assert.deepEqual(presented[0].manualTransport.affectedParentOperationIds, ['C', 'D']);
  assert.deepEqual(presented[1], consumer);
}

{
  assert.deepEqual(productionCalendarSuccessorParentIds(producer, { sourceDraft: { allocations: [producer, consumer, downstream, lateralSameMaterial] }, dependencies }), ['C']);
  assert.deepEqual(productionCalendarDownstreamParentIds(producer, { sourceDraft: { allocations: [producer, consumer, downstream, lateralSameMaterial] }, dependencies }), ['C', 'D']);
  assert.deepEqual(buildManualTransportScopeParentIds({ sourceDraft: { allocations: [producer, consumer, downstream, lateralSameMaterial] }, allocation: producer, dependencies }), ['C', 'D']);
}

{
  const calls = [];
  const baseDraft = { allocations: [producer, consumer, downstream], constraints: [], dailyTeamOverrides: {}, manualWorkDates: [] };
  const accepted = await savePlanningManualTransport({
    canWritePlanning: true,
    manualScheduleDraft: baseDraft,
    currentSimulation: { dependencies },
    allocation: producer,
    arrivalDate: '2026-08-11',
    hours: '24',
    now,
    withOperationLoading: async (label, action) => {
      calls.push(['loading', label]);
      return action();
    },
    reoptimizeProductionCalendarConstraints: payload => {
      calls.push(['reoptimize', payload.scopeParentOperationIds, payload.acceptedDraft.constraints.map(item => item.type)]);
      return {
        accepted: true,
        allocations: [{ allocationId: 'candidate' }],
        manualScheduleDraft: { allocations: [{ allocationId: 'candidate' }] },
        cutoffSnapshot: { id: 'cutoff' },
        previousDiagnostics: { errors: [] },
        diagnosticDelta: { accepted: true }
      };
    },
    applyManualScheduleTransaction: payload => {
      calls.push(['transaction', payload.intent.type, payload.intent.parentOperationId, payload.intent.candidateAllocations.map(item => item.allocationId)]);
      return { accepted: true, draft: payload.intent.candidateDraft };
    },
    currentManualScheduleValidationContextWithFreshStock: async () => {
      calls.push(['validation']);
      return { stock: [] };
    },
    acceptRecalculatedCalendar: payload => calls.push(['accept', payload.transaction.accepted]),
    toast: message => calls.push(['toast', message])
  });
  assert.deepEqual(accepted, { accepted: true });
  assert.deepEqual(calls, [
    ['loading', 'Recalculando transporte...'],
    ['reoptimize', ['C', 'D'], ['MANUAL_TRANSPORT', 'PIN_MACHINE', 'PIN_START', 'MIN_START']],
    ['validation'],
    ['transaction', 'SET_DAILY_TEAM_OVERRIDES', 'P:day-1', ['candidate']],
    ['accept', true],
    ['toast', 'Transporte registrado e cadeia recalculada.']
  ]);
}

{
  const calls = [];
  const invalid = await savePlanningManualTransport({
    canWritePlanning: true,
    manualScheduleDraft: { allocations: [producer], constraints: [] },
    allocation: producer,
    arrivalDate: '2026-08-09',
    hours: '24',
    withOperationLoading: async () => calls.push('loading')
  });
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.message, 'A chegada estimada deve ser igual ou posterior ao dia desta etapa.');
  assert.deepEqual(calls, []);
}

{
  const calls = [];
  const originalWarn = console.warn;
  console.warn = () => {};
  let rejected;
  try {
    rejected = await savePlanningManualTransport({
      canWritePlanning: true,
      manualScheduleDraft: { allocations: [producer], constraints: [] },
      currentSimulation: { dependencies },
      allocation: producer,
      arrivalDate: '2026-08-11',
      now,
      withOperationLoading: async (label, action) => action(),
      reoptimizeProductionCalendarConstraints: () => ({ accepted: false, blockingRegressions: [{ message: 'bloqueado' }] }),
      applyManualScheduleTransaction: () => calls.push('transaction'),
      currentManualScheduleValidationContextWithFreshStock: async () => ({}),
      acceptRecalculatedCalendar: () => calls.push('accept'),
      toast: () => calls.push('toast')
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(rejected, { accepted: false, message: 'bloqueado' });
  assert.deepEqual(calls, []);
}

{
  const calls = [];
  const rejected = await savePlanningManualTransport({
    canWritePlanning: true,
    manualScheduleDraft: { allocations: [producer], constraints: [] },
    currentSimulation: { dependencies },
    allocation: producer,
    arrivalDate: '2026-08-11',
    now,
    withOperationLoading: async (label, action) => action(),
    reoptimizeProductionCalendarConstraints: () => ({
      accepted: true,
      allocations: [],
      manualScheduleDraft: {},
      cutoffSnapshot: {},
      previousDiagnostics: {},
      diagnosticDelta: {}
    }),
    applyManualScheduleTransaction: () => ({ accepted: false, blockingIssues: [{ message: 'transacao recusada' }] }),
    currentManualScheduleValidationContextWithFreshStock: async () => ({}),
    acceptRecalculatedCalendar: () => calls.push('accept'),
    toast: () => calls.push('toast')
  });
  assert.deepEqual(rejected, { accepted: false, message: 'transacao recusada' });
  assert.deepEqual(calls, []);
}

console.log('planningTransportController.test.js ok');
