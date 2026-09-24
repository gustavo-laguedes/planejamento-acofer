import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageValues = new Map();
globalThis.sessionStorage = {
  getItem(key) { return storageValues.has(String(key)) ? storageValues.get(String(key)) : null; },
  setItem(key, value) { storageValues.set(String(key), String(value)); },
  removeItem(key) { storageValues.delete(String(key)); }
};
globalThis.localStorage = globalThis.sessionStorage;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const {
  buildManualPlanningSchedulingResult,
  buildPlanningLocalInitialStockSnapshot,
  buildPlanningProductivityMachineOptions,
  buildPlanningMaterialsToScheduleModel
} = await import('../pages/PlanningPage.js');
const { selectProductionCalendarMachines } = await import('../shared/planning-domain/planningScheduleSnapshot.js');
const { adaptPlanningResultToScheduleSnapshot } = await import('../shared/planning-schedule/planningScheduleAdapter.js');
const { orderGanttApsResources } = await import('../shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js');
const { buildPlanningScheduleViewModel } = await import('../shared/planning-schedule-view/planningScheduleViewModel.js');

const simulated = {
  summary: {
    planningStartDate: '2026-09-10',
    productions: [{
      productionIndex: 0,
      productionKey: 'production-0',
      title: 'Q-138',
      materialName: 'Q-138',
      plannedQty: 400,
      plannedUnit: 'un',
      color: '#2563eb'
    }]
  },
  machines: [
    { machineId: 'trefila', machineName: 'Trefila' },
    { machineId: 'solda', machineName: 'Solda' }
  ],
  tree: {
    materialId: 'Q138',
    materialName: 'Q-138',
    productionIndex: 0,
    requiredQty: 400,
    produceQty: 400,
    unit: 'un',
    children: [{
      materialId: 'LONG',
      materialName: '4,2 Longitudinal - 6m',
      productionIndex: 0,
      requiredQty: 1000,
      produceQty: 1000,
      unit: 'kg',
      children: [{
        materialId: 'BOBINA',
        materialName: 'CA60 4,2 Bobina',
        productionIndex: 0,
        requiredQty: 1200,
        produceQty: 1200,
        unit: 'kg',
        children: []
      }]
    }]
  },
  operations: [
    {
      operationId: '0:BOBINA',
      productionIndex: 0,
      productionKey: 'production-0',
      productionTitle: 'Q-138',
      materialId: 'BOBINA',
      materialName: 'CA60 4,2 Bobina',
      requiredQty: 1200,
      produceQty: 1200,
      stockUsedQty: 0,
      unit: 'kg',
      dependencyOperationIds: []
    },
    {
      operationId: '0:LONG',
      productionIndex: 0,
      productionKey: 'production-0',
      productionTitle: 'Q-138',
      materialId: 'LONG',
      materialName: '4,2 Longitudinal - 6m',
      requiredQty: 1000,
      produceQty: 1000,
      stockUsedQty: 0,
      unit: 'kg',
      dependencyOperationIds: ['0:BOBINA']
    },
    {
      operationId: '0:TRANS',
      productionIndex: 0,
      productionKey: 'production-0',
      productionTitle: 'Q-138',
      materialId: 'TRANS',
      materialName: '4,2 Transversal - 2,45m',
      requiredQty: 1000,
      produceQty: 1000,
      stockUsedQty: 0,
      unit: 'kg',
      dependencyOperationIds: ['0:BOBINA']
    },
    {
      operationId: '0:Q138',
      productionIndex: 0,
      productionKey: 'production-0',
      productionTitle: 'Q-138',
      materialId: 'Q138',
      materialName: 'Q-138',
      requiredQty: 400,
      produceQty: 400,
      stockUsedQty: 0,
      unit: 'un',
      dependencyOperationIds: ['0:LONG', '0:TRANS']
    }
  ],
  calendarOperations: [{
    allocationId: 'automatic-should-not-render',
    operationId: '0:Q138',
    machineId: 'solda',
    machineName: 'Solda',
    date: '2026-09-10',
    quantity: 400,
    unit: 'un',
    durationMinutes: 60
  }],
  days: [{ date: '2026-09-10' }]
};

const manualFoundation = buildManualPlanningSchedulingResult(simulated);
assert.equal(manualFoundation.manualPlanningMode, 'manual-foundation/v1');
assert.equal(manualFoundation.calendarOperations.length, 0, 'fundacao manual nao deve expor barras automaticas ao Gantt');
assert.equal(manualFoundation.operations.length, 4, 'operacoes calculadas continuam disponiveis para Flow e cards');
assert.deepEqual(
  manualFoundation.days.map(day => day.date),
  ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'],
  'janela inicial deve abrir em 7 dias a partir da data inicial'
);
assert.equal(manualFoundation.days[2].isWorkingDay, false, 'sabado permanece identificado como nao produtivo');
assert.equal(manualFoundation.days[3].isWorkingDay, false, 'domingo permanece identificado como nao produtivo');

const model = buildPlanningScheduleViewModel({
  days: manualFoundation.days,
  machines: manualFoundation.machines,
  allocations: manualFoundation.calendarOperations,
  permissions: { readOnly: true, canEditAllocations: true, canEditDaySettings: true },
  visualState: { groupsCollapsedByDefault: true }
});
assert.equal(model.tasks.length, 0, 'Gantt inicial nasce sem tasks/allocations');
assert.deepEqual(model.resources.map(resource => resource.id), ['trefila', 'solda'], 'maquinas cadastradas continuam visiveis sem barras');
assert.equal(model.metadata.visualState.groupsCollapsedByDefault, true);

const registeredWithoutTrefila = [
  { machineId: 'ec125', machineName: 'EC-125' },
  { machineId: 'ec60', machineName: 'EC-60' },
  { machineId: 'aco8', machineName: 'Aço-8' },
  { machineId: 'focus8', machineName: 'Focus-8' },
  { machineId: 'mt200', machineName: 'MT-200' },
  { machineId: 'mt150', machineName: 'MT-150' },
  { machineId: 'mt100', machineName: 'MT-100' }
];
const emptyManualFoundationMachines = selectProductionCalendarMachines({
  ...manualFoundation,
  machines: [],
  machineOptions: [
    ...buildPlanningProductivityMachineOptions([
      { machine_name: 'Trefila', machine_priority: 1, active: true },
      { machine_name: 'EC 125', machine_priority: 2, active: true },
      { machine_name: 'Inativa', machine_priority: 3, active: false }
    ])
  ],
  calendarOperations: []
}, registeredWithoutTrefila);
const emptyManualFoundationSnapshot = adaptPlanningResultToScheduleSnapshot({
  ...manualFoundation,
  calendarOperations: [],
  machines: emptyManualFoundationMachines
});
const emptyManualFoundationModel = buildPlanningScheduleViewModel({
  days: emptyManualFoundationSnapshot.days,
  machines: emptyManualFoundationSnapshot.machines,
  allocations: [],
  permissions: { readOnly: true, canEditAllocations: true, canEditDaySettings: true },
  visualState: { groupsCollapsedByDefault: true }
});
const emptyResourceNames = orderGanttApsResources(emptyManualFoundationModel).map(resource => resource.name);
assert.equal(emptyManualFoundationModel.tasks.length, 0, 'manualScheduleDraft.allocations=[] nao cria barras no Gantt vazio');
assert.equal(emptyResourceNames.filter(name => name === 'Trefila').length, 1, 'Trefila deve existir uma unica vez no Gantt vazio');
assert.equal(emptyResourceNames[0], 'Trefila', 'Trefila deve aparecer como primeira maquina no Gantt vazio');
assert.equal(emptyResourceNames[1], 'EC-125', 'EC-125 deve permanecer logo apos Trefila no Gantt vazio');
assert.equal(
  emptyResourceNames[0],
  'Trefila',
  'linha inicial nao pode ser fantasma: label da primeira maquina deve ser Trefila'
);

const emptyManualFoundationWithoutMatrix = buildPlanningScheduleViewModel({
  days: emptyManualFoundationSnapshot.days,
  machines: selectProductionCalendarMachines({
    ...manualFoundation,
    machines: [],
    machineOptions: [{ machineId: 'Trefila', machineName: 'Trefila', order: -1 }],
    calendarOperations: []
  }, registeredWithoutTrefila),
  allocations: [],
  permissions: { readOnly: true, canEditAllocations: true, canEditDaySettings: true },
  visualState: { groupsCollapsedByDefault: true }
});
const emptyWithoutMatrixResourceNames = orderGanttApsResources(emptyManualFoundationWithoutMatrix)
  .map(resource => resource.name);
assert.equal(emptyWithoutMatrixResourceNames.filter(name => name === 'Trefila').length, 1, 'Trefila obrigatoria nao pode duplicar no Gantt vazio');
assert.equal(emptyWithoutMatrixResourceNames[0], 'Trefila', 'Trefila obrigatoria deve aparecer antes da EC-125 mesmo sem matriz');

const rendererSource = readFileSync(new URL('../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js', import.meta.url), 'utf8');
assert.match(rendererSource, /groupsCollapsedByDefault/);
assert.match(rendererSource, /resources\.forEach\(resource => collapsedResources\.add/);

const materials = buildPlanningMaterialsToScheduleModel(manualFoundation);
assert.equal(materials.length, 1);
assert.equal(materials[0].title, 'Produção #1 • Q-138 • 400 un');
assert.deepEqual(
  materials[0].materials.map(item => [item.materialName, item.requiredQty, item.scheduledQty, item.remainingQty, item.blocked]),
  [
    ['CA60 4,2 Bobina', 1200, 0, 1200, false],
    ['4,2 Longitudinal - 6m', 1000, 0, 1000, true],
    ['4,2 Transversal - 2,45m', 1000, 0, 1000, true],
    ['Q-138', 400, 0, 400, true]
  ],
  'cards devem vir da necessidade produtiva real e marcar sucessores como bloqueados inicialmente'
);

const partialStockSimulation = buildManualPlanningSchedulingResult({
  summary: {
    planningStartDate: '2026-09-10',
    productions: [{
      productionIndex: 0,
      productionKey: 'production-0',
      title: 'EQ-45',
      materialName: 'EQ-45',
      plannedQty: 4000,
      plannedUnit: 'un'
    }]
  },
  tree: {
    materialId: 'EQ45',
    materialName: 'EQ-45',
    productionIndex: 0,
    requiredQty: 4000,
    produceQty: 4000,
    unit: 'un',
    children: []
  },
  operations: [
    {
      operationId: '0:LONG',
      productionIndex: 0,
      productionKey: 'production-0',
      materialId: 'LONG',
      materialName: 'Longitudinal',
      requiredQty: 4000,
      produceQty: 3700,
      stockUsedQty: 300,
      unit: 'un',
      dependencyOperationIds: []
    },
    {
      operationId: '0:TRANS',
      productionIndex: 0,
      productionKey: 'production-0',
      materialId: 'TRANS',
      materialName: 'Transversal',
      requiredQty: 8000,
      produceQty: 7600,
      stockUsedQty: 400,
      unit: 'un',
      dependencyOperationIds: []
    },
    {
      operationId: '0:NEG',
      productionIndex: 0,
      productionKey: 'production-0',
      materialId: 'NEG',
      materialName: 'Estoque negativo',
      requiredQty: 500,
      produceQty: 500,
      stockUsedQty: -500,
      unit: 'un',
      dependencyOperationIds: []
    },
    {
      operationId: '0:UNUSED',
      productionIndex: 0,
      productionKey: 'production-0',
      materialId: 'UNUSED',
      materialName: 'Saldo desmarcado',
      requiredQty: 500,
      produceQty: 500,
      stockUsedQty: 0,
      unit: 'un',
      dependencyOperationIds: []
    },
    {
      operationId: '0:EQ45',
      productionIndex: 0,
      productionKey: 'production-0',
      materialId: 'EQ45',
      materialName: 'EQ-45',
      requiredQty: 4000,
      produceQty: 4000,
      stockUsedQty: 0,
      unit: 'un',
      dependencyOperationIds: ['0:LONG', '0:TRANS'],
      dependencyRequirements: [
        { materialId: 'LONG', requiredQuantity: 4000, unit: 'un' },
        { materialId: 'TRANS', requiredQuantity: 8000, unit: 'un' }
      ]
    }
  ],
  calendarOperations: [],
  days: [{ date: '2026-09-10' }]
});

assert.deepEqual(
  buildPlanningLocalInitialStockSnapshot(partialStockSimulation).stock.map(item => [item.materialId, item.quantity]),
  [['LONG', 300], ['TRANS', 400]],
  'snapshot local deve usar apenas saldo utilizado na simulacao, com negativo e saldo desmarcado em zero'
);

const partialMaterials = buildPlanningMaterialsToScheduleModel(partialStockSimulation);
const eq45Partial = partialMaterials[0].materials.find(item => item.materialId === 'EQ45');
assert.equal(eq45Partial.permittedQty, 200, 'Permitido deve usar o componente limitante');
assert.equal(eq45Partial.remainingQty, 4000);
assert.equal(eq45Partial.status, 'partial');
assert.equal(eq45Partial.partial, true);
assert.equal(eq45Partial.blocked, false);

const afterReservation = buildPlanningMaterialsToScheduleModel(partialStockSimulation, {
  allocations: [{
    allocationId: 'manual-eq45-150',
    operationId: '0:EQ45',
    parentOperationId: '0:EQ45',
    materialId: 'EQ45',
    quantity: 150,
    unit: 'un',
    components: [{ parentOperationId: '0:EQ45', materialId: 'EQ45', quantity: 150, unit: 'un' }]
  }]
});
const eq45AfterReservation = afterReservation[0].materials.find(item => item.materialId === 'EQ45');
assert.equal(eq45AfterReservation.scheduledQty, 150);
assert.equal(eq45AfterReservation.remainingQty, 3850);
assert.equal(eq45AfterReservation.permittedQty, 50, 'allocation criada deve reservar saldo local e impedir duplo consumo');
assert.equal(eq45AfterReservation.status, 'partial');

const fullyReserved = buildPlanningMaterialsToScheduleModel(partialStockSimulation, {
  allocations: [{
    allocationId: 'manual-eq45-200',
    operationId: '0:EQ45',
    parentOperationId: '0:EQ45',
    materialId: 'EQ45',
    quantity: 200,
    unit: 'un',
    components: [{ parentOperationId: '0:EQ45', materialId: 'EQ45', quantity: 200, unit: 'un' }]
  }]
});
const eq45FullyReserved = fullyReserved[0].materials.find(item => item.materialId === 'EQ45');
assert.equal(eq45FullyReserved.permittedQty, 0);
assert.equal(eq45FullyReserved.status, 'blocked');

console.log('planningManual01Foundation.test.js ok');
process.exit(0);
