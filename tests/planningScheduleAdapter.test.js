import assert from 'node:assert/strict';
import {
  adaptPlanningResultToScheduleSnapshot,
  buildProductionMembershipIndex,
  buildProductionStageIndex
} from '../shared/planning-schedule/planningScheduleAdapter.js';
import {
  adaptPlanningResultToProductionCalendar as legacyAdaptPlanningResultToProductionCalendar,
  buildProductionMembershipIndex as legacyBuildProductionMembershipIndex,
  buildProductionStageIndex as legacyBuildProductionStageIndex
} from '../shared/production-calendar/productionCalendar.adapter.js';

const tree = {
  materialName: 'Plano',
  children: [{
    productionIndex: 3,
    productionKey: 'production-3',
    productionColor: '#2563EB',
    materialId: 'final',
    materialName: 'Final',
    produceQty: 10,
    children: [{
      productionIndex: 3,
      productionKey: 'production-3',
      productionColor: '#2563EB',
      materialId: 'base',
      materialName: 'Base',
      produceQty: 10,
      children: [{
        productionIndex: 3,
        productionKey: 'production-3',
        materialId: 'raw',
        isInitialRawMaterial: true,
        produceQty: 0,
        children: []
      }]
    }]
  }]
};

const explicitOperation = {
  allocationId: 'allocation:preserved',
  operationId: 'operation:child:day-2',
  productionId: 'production-3',
  productionIndex: 3,
  productionOrder: 7,
  productionColor: '#2563EB',
  calendarParentOperationId: 'operation:child',
  splitParentOperationId: 'operation:root',
  parentOperationId: 'operation:parent',
  parentAllocationId: 'allocation:parent',
  splitParentId: 'split:parent',
  splitOrder: 2,
  materialId: 'base',
  materialName: 'Base',
  machineId: 'm-base',
  machineName: 'M Base',
  date: '2026-07-20',
  startTime: '07:00',
  endTime: '08:00',
  quantity: 12.5,
  unit: 'kg',
  durationMinutes: 60,
  capacityPercent: 50,
  peopleCount: 2,
  productionBreakdown: [{
    operationId: 'operation:child:day-2',
    productionId: 'production-3',
    productionIndex: 3,
    productionOrder: 7,
    productionColor: '#2563EB',
    materialId: 'base',
    quantity: 12.5,
    unit: 'kg'
  }]
};

const fallbackOperation = {
  operation_id: 'fallback-operation',
  production_index: 4,
  material_id: 'fallback-material',
  material_name: 'Fallback Material',
  machine_name: 'FOCUS 8',
  plannedDate: '2026-07-21',
  plannedQty: '3,5',
  planned_unit: 'kg',
  dailyMinutes: '30',
  sequence: 9
};

const source = {
  planningId: 'plan-40',
  days: ['2026-07-20'],
  machines: [{ machineId: 'focus8', machineName: 'Focus-8' }],
  tree,
  operations: [{
    operationId: 'raw-operation-must-not-be-used',
    materialId: 'raw-material',
    materialName: 'Raw Operation Must Not Be Used',
    machineName: 'MT-100',
    plannedDate: '2026-07-22',
    plannedQty: 99
  }],
  calendarOperations: [explicitOperation, fallbackOperation]
};
const before = JSON.parse(JSON.stringify(source));
const adapted = adaptPlanningResultToScheduleSnapshot(source);

assert.equal(adapted.allocations.length, 2);
assert.deepEqual(source, before, 'adapter neutro nao deve mutar entrada');

assert.equal(adapted.allocations[0].allocationId, 'allocation:preserved');
assert.equal(adapted.allocations[0].operationId, 'operation:child:day-2');
assert.equal(adapted.allocations[0].productionId, 'production-3');
assert.equal(adapted.allocations[0].calendarParentOperationId, 'operation:child');
assert.equal(adapted.allocations[0].parentOperationId, 'operation:parent');
assert.equal(adapted.allocations[0].productionStage, 1);
assert.equal(adapted.allocations[0].productionStageLabel, 'ETAPA 1');
assert.deepEqual(adapted.allocations[0].productionMemberships, [{
  productionId: 'production-3',
  productionIndex: 3,
  productionOrder: 7,
  productionColor: '#2563EB',
  productionStage: 1,
  productionTitle: 'undefined',
  productionMaterialName: 'Final',
  unit: 'kg',
  quantitySource: 'production-breakdown',
  quantity: 12.5
}]);
assert.equal('parentAllocationId' in adapted.allocations[0], false, 'adapter nao inventa IDs de split fora do contrato atual');
assert.equal('splitParentId' in adapted.allocations[0], false, 'adapter nao inventa IDs de split fora do contrato atual');
assert.equal('splitOrder' in adapted.allocations[0], false, 'adapter nao inventa ordem de split fora do contrato atual');

assert.equal(
  adapted.allocations[1].allocationId,
  'readonly:plan-plan-40:operation-fallback-operation:date-2026-07-21:machine-focus8:sequence-9'
);
assert.equal(adapted.allocations[1].operationId, 'fallback-operation');
assert.equal(adapted.allocations[1].productionId, '');
assert.equal(adapted.allocations[1].productionIndex, 4);
assert.equal(adapted.allocations[1].machineId, 'focus8');
assert.equal(adapted.allocations[1].machineName, 'FOCUS 8');
assert.equal(adapted.allocations[1].quantity, 3.5);
assert.equal(adapted.allocations[1].sequence, 9);
assert.equal(
  adapted.allocations.some(allocation => allocation.operationId === 'raw-operation-must-not-be-used'),
  false,
  'contrato moderno com calendarOperations validas deve ignorar operations brutas'
);

const modernEmptyCalendarOperations = adaptPlanningResultToScheduleSnapshot({
  planningId: 'modern-empty',
  operations: Array.from({ length: 8 }, (_item, index) => ({
    operationId: `raw-operation-${index + 1}`,
    materialId: `raw-material-${index + 1}`,
    materialName: `Raw Material ${index + 1}`,
    machineName: 'Trefila',
    plannedDate: '2026-09-10',
    plannedQty: 10
  })),
  calendarOperations: [],
  diagnostics: {
    errors: [{
      code: 'RESOURCE_CAPACITY_BLOCKED_DAILY_BATCH',
      message: 'Operacao produtiva sem data livre.',
      materialId: 'raw-material-1'
    }]
  }
});
assert.equal(
  modernEmptyCalendarOperations.allocations.length,
  0,
  'calendarOperations=[] e resultado moderno explicito; operations brutas nao podem gerar allocations fallback'
);
assert.equal(
  modernEmptyCalendarOperations.errors.some(error => error.code === 'RESOURCE_CAPACITY_BLOCKED_DAILY_BATCH'),
  true,
  'diagnostico canonico deve chegar ao snapshot quando uma operation nao virou allocation'
);
assert.equal(
  modernEmptyCalendarOperations.warnings[0]?.code,
  'operations.empty',
  'resultado moderno parcial pode seguir com diagnostico sem inventar Gantt'
);

const splitFallback = adaptPlanningResultToScheduleSnapshot({
  planningId: 'daily-contract',
  machines: [{ machineId: 'MT-100', machineName: 'MT-100' }],
  operations: [{
    operationId: 'Q-138',
    productionId: 'production-q138',
    productionIndex: 0,
    materialId: 'Q-138',
    materialName: 'Q-138',
    machineId: 'MT-100',
    machineName: 'MT-100',
    startDate: '2026-07-20',
    endDate: '2026-07-21',
    startTime: '07:00',
    endTime: '16:00',
    quantity: 400,
    unit: 'un',
    durationMinutes: 960,
    maxDailyCapacity: 220,
    capacityPercent: 181.82,
    peopleCount: 3
  }, {
    operationId: 'EQ-45',
    productionId: 'production-eq45',
    productionIndex: 1,
    materialId: 'EQ-45',
    materialName: 'EQ-45',
    machineId: 'MT-100',
    machineName: 'MT-100',
    startDate: '2026-07-22',
    endDate: '2026-07-23',
    startTime: '07:00',
    endTime: '16:00',
    quantity: 1000,
    unit: 'un',
    durationMinutes: 960,
    nominalDailyCapacity: 700,
    capacityPercent: 142.86,
    peopleCount: 3
  }, {
    operationId: 'CA60-42',
    productionId: 'production-ca60',
    productionIndex: 2,
    materialId: 'CA60-42',
    materialName: 'CA60 4,2 Bobina',
    machineId: 'MT-100',
    machineName: 'MT-100',
    startDate: '2026-07-24',
    endDate: '2026-07-25',
    startTime: '07:00',
    endTime: '16:00',
    quantity: 10063.68,
    unit: 'kg',
    durationMinutes: 960,
    maxDailyCapacity: 7000,
    capacityPercent: 143.77,
    peopleCount: 3
  }]
});

assert.deepEqual(
  splitFallback.allocations.filter(item => item.parentOperationId === 'Q-138').map(item => [item.date, item.quantity, item.maxDailyCapacity, item.capacityPercent]),
  [['2026-07-20', 220, 220, 100], ['2026-07-21', 180, 220, 81.82]],
  'Q-138 400/220 deve virar duas allocations diarias sem percentual agregado'
);
assert.deepEqual(
  splitFallback.allocations.filter(item => item.parentOperationId === 'EQ-45').map(item => [item.date, item.quantity, item.nominalDailyCapacity, item.capacityPercent]),
  [['2026-07-22', 700, 700, 100], ['2026-07-23', 300, 700, 42.86]],
  '1000/700 deve virar 700 e 300 em linhas diarias'
);
assert.deepEqual(
  splitFallback.allocations.filter(item => item.parentOperationId === 'CA60-42').map(item => [item.date, item.quantity, item.maxDailyCapacity, item.capacityPercent]),
  [['2026-07-24', 7000, 7000, 100], ['2026-07-25', 3063.68, 7000, 43.77]],
  'CA60 4,2 Bobina 10063.68/7000 deve virar duas allocations diarias'
);
assert.equal(
  new Set(splitFallback.allocations.map(item => item.allocationId)).size,
  splitFallback.allocations.length,
  'cada parcela diaria expandida precisa manter allocationId proprio'
);

assert.deepEqual(
  adaptPlanningResultToScheduleSnapshot(),
  {
    days: [],
    machines: [],
    allocations: [],
    errors: [],
    warnings: [{
      code: 'operations.empty',
      message: 'Nenhuma operation/calendarOperation recebida para converter em allocation.',
      value: 0
    }]
  }
);
assert.throws(
  () => adaptPlanningResultToScheduleSnapshot(null),
  TypeError,
  'entrada null preserva o erro atual do adapter legado'
);

assert.equal(legacyAdaptPlanningResultToProductionCalendar, adaptPlanningResultToScheduleSnapshot);
assert.equal(legacyBuildProductionMembershipIndex, buildProductionMembershipIndex);
assert.equal(legacyBuildProductionStageIndex, buildProductionStageIndex);

console.log('planningScheduleAdapter.test.js ok');
