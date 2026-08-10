import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  adaptPlanningResultToProductionCalendar,
  buildProductionStageIndex
} from '../shared/production-calendar/productionCalendar.adapter.js';
import {
  getProductionCalendarStage,
  ProductionCalendarCard
} from '../shared/production-calendar/ProductionCalendarCard.js';
import {
  createManualScheduleDraft,
  moveDraftAllocation
} from '../services/manualScheduleDraft.service.js';

function raw(materialId, productionIndex) {
  return {
    productionIndex,
    productionKey: `production-${productionIndex}`,
    materialId,
    isInitialRawMaterial: true,
    produceQty: 0,
    children: []
  };
}

function produced(materialId, productionIndex, children = []) {
  return {
    productionIndex,
    productionKey: `production-${productionIndex}`,
    materialId,
    produceQty: 10,
    children
  };
}

function operation({ materialId, productionIndex = 0, day = 13, machineId = 'm1', sequence = 900 }) {
  return {
    operationId: `${productionIndex}:${materialId}:day-${day - 12}`,
    calendarParentOperationId: `${productionIndex}:${materialId}`,
    productionId: `production-${productionIndex}`,
    productionIndex,
    materialId,
    materialName: materialId,
    machineId,
    machineName: machineId,
    date: `2026-07-${String(day).padStart(2, '0')}`,
    quantity: 10,
    unit: 'kg',
    durationMinutes: 60,
    peopleCount: 2,
    sequence
  };
}

const mainChain = produced('final', 0, [
  produced('corte', 0, [
    produced('bobina', 0, [raw('materia-prima', 0)])
  ])
]);
const alternateChain = produced('outro-final', 1, [
  produced('bobina', 1, [
    produced('pre-bobina', 1, [raw('outra-materia-prima', 1)])
  ])
]);
const tree = { materialName: 'Plano de produção', children: [mainChain, alternateChain] };

const stageIndex = buildProductionStageIndex(tree);
assert.equal(stageIndex.get('production-0|material|bobina'), 1);
assert.equal(stageIndex.get('production-0|material|corte'), 2);
assert.equal(stageIndex.get('production-0|material|final'), 3);

const dailyOperations = [
  operation({ materialId: 'final', sequence: 1 }),
  operation({ materialId: 'bobina', day: 15, sequence: 999 }),
  operation({ materialId: 'corte', day: 14, sequence: -50 }),
  operation({ materialId: 'bobina', day: 13, sequence: 300 })
];
const adapted = adaptPlanningResultToProductionCalendar({ tree, calendarOperations: dailyOperations });
const byMaterial = materialId => adapted.allocations.filter(item => item.materialId === materialId);

assert.deepEqual(byMaterial('bobina').map(item => item.productionStage), [1, 1]);
assert.equal(byMaterial('corte')[0].productionStage, 2);
assert.equal(byMaterial('final')[0].productionStage, 3);
assert.equal(byMaterial('final')[0].productionStageLabel, 'ETAPA 3');

const movedVisualOperation = operation({ materialId: 'corte', day: 20, machineId: 'm2', sequence: 0 });
const movedVisual = adaptPlanningResultToProductionCalendar({ tree, calendarOperations: [movedVisualOperation] });
assert.equal(movedVisual.allocations[0].productionStage, 2, 'data, máquina e sequence não alteram a etapa');

const independentProductions = adaptPlanningResultToProductionCalendar({
  tree,
  calendarOperations: [
    operation({ materialId: 'bobina', productionIndex: 0 }),
    operation({ materialId: 'bobina', productionIndex: 1 })
  ]
});
assert.deepEqual(independentProductions.allocations.map(item => item.productionStage), [1, 2]);

const manualSource = adapted.allocations.find(item => item.materialId === 'corte');
const draft = createManualScheduleDraft({
  allocations: [manualSource],
  machines: [{ machineId: 'm1' }, { machineId: 'm2' }],
  now: new Date('2026-07-16T12:00:00Z')
});
const movedDraft = moveDraftAllocation(draft, {
  allocationId: manualSource.allocationId,
  targetDate: '2026-07-20',
  targetMachineId: 'm2',
  machines: [
    { machineId: 'm1', machineName: 'm1' },
    { machineId: 'm2', machineName: 'm2' }
  ],
  matrixRows: [{
    machine_id: 'm2',
    machine_name: 'm2',
    material_id: 'corte',
    people_count: 2,
    output_unit: 'kg',
    output_qty: 10,
    time_seconds: 3600
  }],
  now: new Date('2026-07-16T12:01:00Z')
});
assert.equal(movedDraft.allocations[0].productionStage, 2, 'movimento manual preserva a etapa derivada');

const explicitStage = adaptPlanningResultToProductionCalendar({
  tree,
  calendarOperations: [{ ...operation({ materialId: 'bobina' }), productionStage: 7 }]
});
assert.equal(explicitStage.allocations[0].productionStage, 7, 'campo real já existente tem prioridade');

const withoutStage = adaptPlanningResultToProductionCalendar({
  calendarOperations: [operation({ materialId: 'sem-arvore' })]
});
assert.equal(withoutStage.allocations[0].productionStage, null);
assert.equal(withoutStage.allocations[0].productionStageLabel, '');
assert.equal(getProductionCalendarStage(withoutStage.allocations[0]), null);
assert.equal(getProductionCalendarStage({ productionStage: 0 }), null);

class FakeElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.className = '';
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute() {}
  addEventListener() {}
}
const previousDocument = globalThis.document;
globalThis.document = { createElement: () => new FakeElement() };
try {
  const cardWithoutStage = ProductionCalendarCard({ allocation: withoutStage.allocations[0] });
  assert.equal(cardWithoutStage.children.some(child => child.className === 'production-calendar-card-stage'), false);
  const cardWithStage = ProductionCalendarCard({ allocation: byMaterial('corte')[0] });
  const stageElement = cardWithStage.children.find(child => child.className === 'production-calendar-card-stage');
  assert.equal(stageElement?.textContent, 'ETAPA 2');
} finally {
  globalThis.document = previousDocument;
}

const adapterSource = readFileSync(fileURLToPath(new URL('../shared/planning-schedule/planningScheduleAdapter.js', import.meta.url)), 'utf8');
const stageFunction = adapterSource.slice(
  adapterSource.indexOf('export function buildProductionStageIndex'),
  adapterSource.indexOf('function productionRoots')
);
assert.doesNotMatch(stageFunction, /sequence|productionOrder|calendarDayIndex|context\.index|:day-/i);

console.log('productionCalendarStage.test.js: ok');
