import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  adaptPlanningResultToProductionCalendar
} from '../shared/production-calendar/productionCalendar.adapter.js';
import {
  createManualScheduleDraft,
  moveDraftAllocation
} from '../services/manualScheduleDraft.service.js';

const BLUE = '#2563EB';
const ORANGE = '#EA580C';
const GREEN = '#15803D';

function raw(materialId, productionIndex, productionColor) {
  return {
    productionIndex,
    productionKey: `production-${productionIndex}`,
    productionColor,
    materialId,
    materialName: materialId,
    isInitialRawMaterial: true,
    produceQty: 0,
    children: []
  };
}

function produced(materialId, materialName, productionIndex, productionColor, children = []) {
  return {
    productionIndex,
    productionKey: `production-${productionIndex}`,
    productionTitle: `Produção ${productionIndex + 1}`,
    productionColor,
    materialId,
    materialName,
    produceQty: 10,
    children
  };
}

function productionTree({ productionIndex, color, finalId, finalName }) {
  const bobinaForLongitudinal = produced(
    'bobina', 'CA60 3,4 Bobina', productionIndex, color,
    [raw(`materia-prima-${productionIndex}`, productionIndex, color)]
  );
  const bobinaForTransversal = produced(
    'bobina', 'CA60 3,4 Bobina', productionIndex, color,
    [raw(`materia-prima-${productionIndex}`, productionIndex, color)]
  );
  return produced(finalId, finalName, productionIndex, color, [
    produced('longitudinal', '3,4 Longitudinal - 3m', productionIndex, color, [bobinaForLongitudinal]),
    produced('transversal', '3,4 Transversal - 2m', productionIndex, color, [bobinaForTransversal])
  ]);
}

function breakdown(productionIndex, color, materialId, quantity) {
  return {
    operationId: `${productionIndex}:${materialId}`,
    productionId: `production-${productionIndex}`,
    productionKey: `production-${productionIndex}`,
    productionIndex,
    productionColor: color,
    materialId,
    quantity
  };
}

function calendarOperation({
  operationId,
  materialId,
  materialName,
  quantity,
  memberships,
  allocationId = `allocation:${operationId}`,
  date = '2026-07-16',
  machineId = 'm1'
}) {
  const first = memberships[0];
  return {
    allocationId,
    operationId,
    calendarParentOperationId: operationId,
    productionId: first.productionId,
    productionIndex: first.productionIndex,
    productionColor: first.productionColor,
    materialId,
    materialName,
    machineId,
    machineName: machineId,
    startDate: date,
    date,
    startTime: '07:00',
    endTime: '08:00',
    quantity,
    produceQty: quantity,
    unit: 'kg',
    durationMinutes: 60,
    capacityPercent: 40,
    peopleCount: 2,
    productionBreakdown: memberships
  };
}

const tree = {
  materialName: 'Plano de produção',
  children: [
    productionTree({ productionIndex: 0, color: BLUE, finalId: 'eq-45', finalName: 'EQ-45' }),
    productionTree({ productionIndex: 1, color: ORANGE, finalId: 'q-61', finalName: 'Q-61' })
  ]
};

function sharedOperation(materialId, materialName, quantity) {
  return calendarOperation({
    operationId: `group:${materialId}`,
    materialId,
    materialName,
    quantity,
    memberships: [
      breakdown(0, BLUE, materialId, quantity / 2),
      breakdown(1, ORANGE, materialId, quantity / 2)
    ]
  });
}

const sourceOperations = [
  sharedOperation('bobina', 'CA60 3,4 Bobina', 40),
  sharedOperation('longitudinal', '3,4 Longitudinal - 3m', 24),
  sharedOperation('transversal', '3,4 Transversal - 2m', 16),
  calendarOperation({
    operationId: '0:eq-45',
    materialId: 'eq-45',
    materialName: 'EQ-45',
    quantity: 10,
    memberships: [breakdown(0, BLUE, 'eq-45', 10)]
  }),
  calendarOperation({
    operationId: '1:q-61',
    materialId: 'q-61',
    materialName: 'Q-61',
    quantity: 12,
    memberships: [breakdown(1, ORANGE, 'q-61', 12)]
  })
];
const adapted = adaptPlanningResultToProductionCalendar({ tree, calendarOperations: sourceOperations });

assert.equal(adapted.allocations.length, sourceOperations.length, 'adapter não cria nem remove allocations');
assert.deepEqual(
  adapted.allocations.map(allocation => allocation.quantity),
  sourceOperations.map(operation => operation.quantity),
  'quantidades permanecem idênticas'
);

for (const materialId of ['bobina', 'longitudinal', 'transversal']) {
  const allocations = adapted.allocations.filter(allocation => allocation.materialId === materialId);
  assert.equal(allocations.length, 1, `${materialId} permanece em um único card`);
  assert.deepEqual(
    allocations[0].productionMemberships.map(item => item.productionIndex),
    [0, 1]
  );
  assert.deepEqual(
    allocations[0].productionMemberships.map(item => ({
      quantity: item.quantity,
      unit: item.unit,
      quantitySource: item.quantitySource
    })),
    [
      { quantity: allocations[0].quantity / 2, unit: 'kg', quantitySource: 'production-breakdown' },
      { quantity: allocations[0].quantity / 2, unit: 'kg', quantitySource: 'production-breakdown' }
    ],
    `${materialId} preserva quantidade produzida atribuída por produção`
  );
}
assert.deepEqual(
  adapted.allocations.find(item => item.materialId === 'bobina').productionMemberships.map(item => item.productionStage),
  [1, 1]
);
assert.deepEqual(
  adapted.allocations.find(item => item.materialId === 'longitudinal').productionMemberships.map(item => item.productionStage),
  [2, 2]
);
assert.deepEqual(
  adapted.allocations.find(item => item.materialId === 'transversal').productionMemberships.map(item => item.productionStage),
  [2, 2]
);
assert.deepEqual(
  adapted.allocations.find(item => item.materialId === 'eq-45').productionMemberships.map(item => item.productionIndex),
  [0]
);
assert.deepEqual(
  adapted.allocations.find(item => item.materialId === 'q-61').productionMemberships.map(item => item.productionIndex),
  [1]
);

const threeProductionTree = {
  materialName: 'Plano de produção',
  children: [
    ...tree.children,
    productionTree({ productionIndex: 2, color: GREEN, finalId: 'terceiro-final', finalName: 'Terceiro final' })
  ]
};
const threeMembershipOperation = calendarOperation({
  operationId: 'group:bobina:three',
  materialId: 'bobina',
  materialName: 'CA60 3,4 Bobina',
  quantity: 60,
  memberships: [
    breakdown(2, GREEN, 'bobina', 20),
    breakdown(0, BLUE, 'bobina', 20),
    breakdown(1, ORANGE, 'bobina', 20)
  ]
});
const threeAdapted = adaptPlanningResultToProductionCalendar({
  tree: threeProductionTree,
  calendarOperations: [threeMembershipOperation]
});
assert.deepEqual(
  threeAdapted.allocations[0].productionMemberships.map(item => item.productionIndex),
  [0, 1, 2],
  'três memberships ficam em ordem produtiva estável'
);
assert.deepEqual(
  threeAdapted.allocations[0].productionMemberships.map(item => item.quantity),
  [20, 20, 20],
  'quantidade individual permanece associada à identidade canônica após ordenação'
);

const legacyUnresolved = adaptPlanningResultToProductionCalendar({
  tree,
  calendarOperations: [calendarOperation({
    operationId: 'group:legacy',
    materialId: 'bobina',
    materialName: 'CA60 3,4 Bobina',
    quantity: 40,
    memberships: [{ ...breakdown(0, BLUE, 'bobina', 20), quantity: undefined }]
  })]
});
assert.equal(legacyUnresolved.allocations[0].productionMemberships[0].quantity, undefined);
assert.equal(legacyUnresolved.allocations[0].productionMemberships[0].quantitySource, 'legacy-unresolved');

const differentStageTree = {
  materialName: 'Plano de produção',
  children: [
    tree.children[0],
    produced('q-61', 'Q-61', 1, ORANGE, [
      produced('bobina', 'CA60 3,4 Bobina', 1, ORANGE, [
        produced('pre-bobina', 'Pré-bobina', 1, ORANGE, [raw('materia-prima-1', 1, ORANGE)])
      ])
    ])
  ]
};
const differentStages = adaptPlanningResultToProductionCalendar({
  tree: differentStageTree,
  calendarOperations: [sharedOperation('bobina', 'CA60 3,4 Bobina', 40)]
});
assert.deepEqual(
  differentStages.allocations[0].productionMemberships.map(item => item.productionStage),
  [1, 2],
  'cada membership preserva a etapa específica de sua cadeia'
);

const distinctOperations = adaptPlanningResultToProductionCalendar({
  tree,
  calendarOperations: [
    calendarOperation({
      operationId: '0:bobina',
      materialId: 'bobina',
      materialName: 'CA60 3,4 Bobina',
      quantity: 20,
      memberships: [breakdown(0, BLUE, 'bobina', 20)]
    }),
    calendarOperation({
      operationId: '1:bobina',
      materialId: 'bobina',
      materialName: 'CA60 3,4 Bobina',
      quantity: 20,
      memberships: [breakdown(1, ORANGE, 'bobina', 20)]
    })
  ]
});
assert.equal(distinctOperations.allocations.length, 2);
assert.deepEqual(distinctOperations.allocations.map(item => item.productionMemberships.length), [1, 1]);

const sharedBobina = adapted.allocations.find(item => item.materialId === 'bobina');
const movedOperation = {
  ...sourceOperations[0],
  date: '2026-07-20',
  startDate: '2026-07-20',
  machineId: 'm2',
  machineName: 'm2'
};
const movedAdapted = adaptPlanningResultToProductionCalendar({ tree, calendarOperations: [movedOperation] });
assert.equal(movedAdapted.allocations[0].allocationId, sharedBobina.allocationId);
assert.deepEqual(movedAdapted.allocations[0].productionMemberships, sharedBobina.productionMemberships);

const draft = createManualScheduleDraft({
  allocations: [sharedBobina],
  machines: [{ machineId: 'm1' }, { machineId: 'm2' }],
  now: new Date('2026-07-16T12:00:00Z')
});
const movedDraft = moveDraftAllocation(draft, {
  allocationId: sharedBobina.allocationId,
  targetDate: '2026-07-20',
  targetMachineId: 'm2',
  machines: [
    { machineId: 'm1', machineName: 'm1' },
    { machineId: 'm2', machineName: 'm2' }
  ],
  matrixRows: [{
    machine_id: 'm2',
    machine_name: 'm2',
    material_id: 'bobina',
    people_count: 2,
    output_unit: 'kg',
    output_qty: 40,
    time_seconds: 3600
  }],
  now: new Date('2026-07-16T12:01:00Z')
});
assert.equal(movedDraft.allocations.length, 1);
assert.equal(movedDraft.allocations[0].allocationId, sharedBobina.allocationId);
assert.equal(movedDraft.allocations[0].quantity, sharedBobina.quantity);
assert.deepEqual(movedDraft.allocations[0].productionMemberships, sharedBobina.productionMemberships);

assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarCard.js', import.meta.url)), false);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarDetails.js', import.meta.url)), false);
assert.deepEqual(sharedBobina.productionMemberships.map(item => item.productionIndex), [0, 1]);
assert.deepEqual(
  sharedBobina.productionMemberships.map(item => [item.productionTitle, item.productionStage, item.productionMaterialName]),
  [['Produção 1', 1, 'EQ-45'], ['Produção 2', 1, 'Q-61']]
);

const planningPageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const transportControllerSource = readFileSync(new URL('../shared/planning-controller/planningTransportController.js', import.meta.url), 'utf8');
assert.match(
  transportControllerSource,
  /function productionCalendarParentMatchesDownstreamScope[\s\S]*productionCalendarCandidateMatchesDownstreamMembership/,
  'escopo de transporte deve filtrar dependencias pela cadeia da allocation'
);
assert.match(
  transportControllerSource,
  /sourceParentId[\s\S]*candidateParentId[\s\S]*sameMaterial[\s\S]*return false/,
  'transporte nao deve tratar outro card do mesmo material como etapa downstream'
);
assert.match(
  transportControllerSource,
  /scopedSuccessors[\s\S]*productionCalendarParentMatchesDownstreamScope/,
  'sucessores por dependencia precisam respeitar memberships da cadeia'
);
assert.match(
  transportControllerSource,
  /function productionCalendarSuccessorParentIds[\s\S]*productionCalendarHasDownstreamScope\(allocation\)[\s\S]*productionCalendarFallbackDownstreamParentIds\(allocation, \{ sourceDraft, immediate: true \}\)/,
  'sucessores de transporte com membership devem usar cadeia por etapa antes do grafo de dependencias'
);
assert.match(
  transportControllerSource,
  /function productionCalendarDownstreamParentIds[\s\S]*productionCalendarHasDownstreamScope\(allocation\)[\s\S]*productionCalendarFallbackDownstreamParentIds\(allocation, \{ sourceDraft \}\)/,
  'cadeia downstream de transporte com membership deve usar cadeia por etapa antes do grafo de dependencias'
);
assert.match(
  transportControllerSource,
  /directProductionId[\s\S]*directMemberships[\s\S]*normalizedMemberships\.length > 1 \? \[normalizedMemberships\[0\]\]/,
  'escopo de transporte deve escolher uma membership primaria em cards agregados para nao puxar cadeias laterais'
);
assert.doesNotMatch(
  transportControllerSource,
  /manual-transport-chain/,
  'transporte manual nao deve criar pin duro de maquina para downstream'
);
assert.match(
  transportControllerSource,
  /downstreamTransportScopeParentIds = \[\s*\.\.\.productionCalendarSuccessorParentIds\(allocation, scopeOptions\),\s*\.\.\.productionCalendarDownstreamParentIds\(allocation, scopeOptions\)/,
  'transporte manual deve reotimizar primeiro somente sucessores/downstream'
);
assert.doesNotMatch(
  transportControllerSource,
  /const transportScopeParentIds = \[\.\.\.new Set\(\[\s*productionCalendarParentOperationId\(current\),/,
  'transporte manual nao deve puxar a etapa produtora para o escopo principal'
);

console.log('productionCalendarMemberships.test.js: ok');
