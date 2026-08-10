import assert from 'node:assert/strict';
import {
  comparePlanningMachineOrder,
  normalizePlanningMachineName
} from '../shared/planning-schedule/planningMachineOrder.js';
import {
  compareProductionCalendarMachineOrder,
  normalizeProductionCalendarMachineName
} from '../shared/production-calendar/productionCalendar.utils.js';

const canonicalMachines = [
  { machineId: 'focus8-id', machineName: 'Focus-8', order: 1 },
  { machineId: 'mt100-id', machineName: 'MT-100', order: 2 },
  { machineId: 'ec60-id', machineName: 'EC-60', order: 3 },
  { machineId: 'empty-aco8-id', machineName: 'Aço-8', order: 4 },
  { machineId: 'trefila-id', machineName: 'Trefila', order: 5 },
  { machineId: 'mt150-id', machineName: 'MT-150', order: 6 },
  { machineId: 'ec125-id', machineName: 'EC-125', order: 7 },
  { machineId: 'mt200-id', machineName: 'MT-200', order: 8 }
];

assert.deepEqual(
  [...canonicalMachines].sort(comparePlanningMachineOrder).map(machine => machine.machineName),
  ['Trefila', 'EC-125', 'EC-60', 'Aço-8', 'Focus-8', 'MT-200', 'MT-150', 'MT-100'],
  'ordem canonica de maquinas deve ser preservada'
);

assert.equal(normalizePlanningMachineName(' Aço-8 '), 'aco8');
assert.equal(normalizePlanningMachineName('FOCUS 8'), 'focus8');
assert.equal(normalizePlanningMachineName('EC 125'), 'ec125');
assert.equal(normalizePlanningMachineName('MT-200'), 'mt200');
assert.equal(normalizePlanningMachineName(null), '');
assert.equal(normalizePlanningMachineName(undefined), '');
assert.equal(normalizePlanningMachineName(''), '');

assert.equal(
  comparePlanningMachineOrder({ machineName: 'Aço-8' }, { name: 'Focus 8' }) < 0,
  true,
  'aliases atuais por acento, hifen, espaco e caixa devem preservar comparacao'
);
assert.equal(
  comparePlanningMachineOrder({ machineId: 'mt200' }, { id: 'MT-150' }) < 0,
  true,
  'fallbacks machineId e id devem continuar entrando na comparacao'
);
assert.equal(
  comparePlanningMachineOrder({ machineName: 'Maquina X' }, { machineName: 'Maquina Y' }),
  0,
  'desconhecidos devem manter estabilidade para o sort chamador'
);
assert.equal(
  comparePlanningMachineOrder(null, undefined),
  0,
  'vazios e nulos devem continuar sem deslocamento relativo'
);

assert.equal(normalizeProductionCalendarMachineName('Aço-8'), normalizePlanningMachineName('Aço-8'));
assert.equal(
  compareProductionCalendarMachineOrder({ machineName: 'Trefila' }, { machineName: 'MT-100' }),
  comparePlanningMachineOrder({ machineName: 'Trefila' }, { machineName: 'MT-100' }),
  're-export antigo deve preservar o contrato'
);

console.log('planningMachineOrder.test.js ok');
