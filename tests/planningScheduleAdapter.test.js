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
