import assert from 'node:assert/strict';
import {
  applyPlanningAllocationMove,
  buildPlanningDailyAllocations,
  resetPlanningAllocationIdentityRegistry
} from '../services/planningAllocation.service.js';

function baseOperations() {
  return [
    {
      operationId: '0:CA60',
      calendarParentOperationId: '0:CA60',
      productionId: 'production-0',
      productionIndex: 0,
      materialId: 'CA60',
      machineName: 'M1',
      startDate: '2026-07-13',
      startTime: '07:00',
      endTime: '16:00',
      quantity: 7000,
      duration: 528,
      unit: 'kg',
      capacityPercent: 100,
      peopleCount: 4
    },
    {
      operationId: '0:CA60',
      calendarParentOperationId: '0:CA60',
      productionId: 'production-0',
      productionIndex: 0,
      materialId: 'CA60',
      machineName: 'M1',
      startDate: '2026-07-14',
      startTime: '07:00',
      endTime: '16:00',
      quantity: 7000,
      duration: 528,
      unit: 'kg',
      capacityPercent: 100,
      peopleCount: 4
    },
    {
      operationId: '0:CA60',
      calendarParentOperationId: '0:CA60',
      productionId: 'production-0',
      productionIndex: 0,
      materialId: 'CA60',
      machineName: 'M1',
      startDate: '2026-07-15',
      startTime: '07:00',
      endTime: '07:03',
      quantity: 41.93,
      duration: 3,
      unit: 'kg',
      capacityPercent: 0.6,
      peopleCount: 4
    }
  ];
}

const machines = [{ machineId: 'M1', machineName: 'M1' }, { machineId: 'M2', machineName: 'M2' }];

function totalQuantity(result) {
  return Number(result.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0).toFixed(6));
}

resetPlanningAllocationIdentityRegistry();

const initial = buildPlanningDailyAllocations(baseOperations(), { planningId: 'PLAN-13', machines });
assert.equal(initial.allocations.length, 3, 'cenario A deve iniciar com tres allocations');
assert.notEqual(initial.allocations[0].allocationId, initial.allocations[2].allocationId, 'primeira e terceira nao podem compartilhar allocationId');

const movedAllocation = initial.allocations.find(allocation => allocation.date === '2026-07-14');
const dragOverrides = applyPlanningAllocationMove([], {
  allocationId: movedAllocation.allocationId,
  parentOperationId: movedAllocation.parentOperationId,
  targetDate: '2026-07-20',
  targetMachineId: 'M2',
  source: 'drag'
});
const moved = buildPlanningDailyAllocations(baseOperations(), {
  planningId: 'PLAN-13',
  allocationOverrides: dragOverrides,
  machines
});
assert.equal(totalQuantity(moved), 14041.93, 'cenario A deve preservar quantidade total');
assert.ok(moved.allocations.some(allocation => allocation.allocationId === movedAllocation.allocationId && allocation.date === '2026-07-20' && allocation.machineId === 'M2'));
assert.ok(moved.allocations.every(allocation => allocation.quantity > 0 && allocation.durationMinutes > 0), 'cenario D nao permite allocation zero');

const recalculated = buildPlanningDailyAllocations(baseOperations(), {
  planningId: 'PLAN-13',
  allocationOverrides: dragOverrides,
  machines
});
assert.ok(recalculated.allocations.every(allocation => allocation.parentOperationId === '0:CA60'), 'cenario B mantem parentOperationId valido');
assert.ok(recalculated.allocations.some(allocation => allocation.allocationId === movedAllocation.allocationId), 'cenario B preserva allocationId movido');

assert.throws(() => {
  buildPlanningDailyAllocations(baseOperations(), {
    planningId: 'PLAN-13',
    allocationOverrides: applyPlanningAllocationMove([], {
      allocationId: movedAllocation.allocationId,
      parentOperationId: movedAllocation.parentOperationId,
      targetDate: '2026-07-21',
      targetMachineId: 'M-inexistente',
      source: 'drag'
    }),
    machines
  });
}, /Falha ao validar alocacoes diarias/, 'cenario C rejeita erro para permitir rollback externo');
assert.equal(totalQuantity(initial), 14041.93, 'cenario C preserva estado anterior em memoria de teste');

const clickOverrides = applyPlanningAllocationMove([], {
  allocationId: movedAllocation.allocationId,
  parentOperationId: movedAllocation.parentOperationId,
  targetDate: '2026-07-20',
  targetMachineId: 'M2',
  source: 'click_move'
});
assert.deepEqual(
  clickOverrides.map(({ source, ...override }) => override),
  dragOverrides.map(({ source, ...override }) => override),
  'cenario E drag e click_move usam o mesmo contrato de dominio'
);
assert.equal(clickOverrides[0].source, 'click_move');

resetPlanningAllocationIdentityRegistry();
const reorderInitial = buildPlanningDailyAllocations(baseOperations(), { planningId: 'PLAN-13-REORDER', machines });
const reorderByDate = new Map(reorderInitial.allocations.map(allocation => [allocation.date, allocation.allocationId]));
const reorderMiddle = reorderInitial.allocations.find(allocation => allocation.date === '2026-07-14');
const reorderMoved = buildPlanningDailyAllocations(baseOperations(), {
  planningId: 'PLAN-13-REORDER',
  allocationOverrides: applyPlanningAllocationMove([], {
    allocationId: reorderMiddle.allocationId,
    parentOperationId: reorderMiddle.parentOperationId,
    targetDate: '2026-07-10',
    targetMachineId: 'M2',
    source: 'drag'
  }),
  machines
});
assert.ok(
  reorderMoved.allocations.some(allocation =>
    allocation.allocationId === reorderMiddle.allocationId
    && allocation.date === '2026-07-10'
    && allocation.machineId === 'M2'
  ),
  'cenario F preserva allocationId quando o movimento muda a ordenacao'
);
assert.ok(
  reorderMoved.allocations.some(allocation =>
    allocation.allocationId === reorderByDate.get('2026-07-13')
    && allocation.date === '2026-07-13'
  ),
  'cenario F nao reutiliza ID do primeiro bloco para a parcela movida'
);
assert.equal(totalQuantity(reorderMoved), 14041.93, 'cenario F preserva quantidade total apos reordenacao');

console.log('planningAllocation.service.test.js ok');
