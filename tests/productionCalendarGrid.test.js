import assert from 'node:assert/strict';
import { adaptPlanningResultToProductionCalendar } from '../shared/production-calendar/productionCalendar.adapter.js';
import { createProductionCalendarGridRows } from '../shared/production-calendar/productionCalendar.utils.js';

const machines = [
  { machineId: 'trefila', machineName: 'Trefila' },
  { machineId: 'ec125', machineName: 'EC-125' },
  { machineId: 'ec60', machineName: 'EC-60' },
  { machineId: 'focus8', machineName: 'Focus-8' },
  { machineId: 'aco8', machineName: 'Aço-8' },
  { machineId: 'mt200', machineName: 'MT-200' },
  { machineId: 'mt150', machineName: 'MT-150' },
  { machineId: 'mt100', machineName: 'MT-100' }
];

const usedMachineIds = ['trefila', 'ec125', 'aco8', 'mt200', 'mt150', 'mt100'];
const calendarOperations = usedMachineIds.map((machineId, index) => ({
  operationId: `operation-${index + 1}`,
  productionIndex: 0,
  productionOrder: index,
  materialId: `material-${index + 1}`,
  materialName: `Material ${index + 1}`,
  machineId,
  machineName: machines.find(machine => machine.machineId === machineId).machineName,
  date: '2026-07-13',
  quantity: 10,
  unit: 'kg',
  durationMinutes: 60
}));

const adapted = adaptPlanningResultToProductionCalendar({ machines, calendarOperations });
assert.equal(adapted.machines.length, 8, 'adapter deve preservar todas as máquinas recebidas');

const rows = createProductionCalendarGridRows({
  days: [{ date: '2026-07-13' }],
  machines: adapted.machines,
  allocations: adapted.allocations
});

assert.deepEqual(
  rows.map(row => row.machine.name),
  ['Trefila', 'EC-125', 'EC-60', 'Aço-8', 'Focus-8', 'MT-200', 'MT-150', 'MT-100']
);
assert.deepEqual(
  rows.map(row => row.machine.id),
  ['trefila', 'ec125', 'ec60', 'aco8', 'focus8', 'mt200', 'mt150', 'mt100'],
  'ordenação visual não pode alterar IDs canônicos'
);
assert.equal(rows.find(row => row.machine.id === 'ec60').allocationsByDate['2026-07-13'].length, 0);
assert.equal(rows.find(row => row.machine.id === 'focus8').allocationsByDate['2026-07-13'].length, 0);

const withFallback = adaptPlanningResultToProductionCalendar({
  machines,
  calendarOperations: [
    ...calendarOperations,
    {
      operationId: 'operation-fallback',
      productionIndex: 1,
      materialId: 'material-fallback',
      materialName: 'Material fallback',
      machineId: 'fallback',
      machineName: 'Máquina fallback',
      date: '2026-07-13',
      quantity: 5,
      unit: 'kg',
      durationMinutes: 30
    }
  ]
});

assert.equal(withFallback.machines.length, 9, 'máquina ausente do cadastro deve entrar como fallback');
assert.equal(withFallback.machines.at(-1).machineName, 'Máquina fallback');

const withoutDuplicateVariation = adaptPlanningResultToProductionCalendar({
  machines,
  calendarOperations: [{
    operationId: 'operation-focus',
    productionIndex: 0,
    materialId: 'material-focus',
    materialName: 'Material Focus',
    machineName: 'FOCUS 8',
    date: '2026-07-13',
    quantity: 5,
    unit: 'kg',
    durationMinutes: 30
  }]
});

assert.equal(withoutDuplicateVariation.machines.length, 8, 'variação do nome não deve duplicar máquina');
assert.equal(withoutDuplicateVariation.allocations[0].machineId, 'focus8');

console.log('productionCalendarGrid.test.js: ok');
