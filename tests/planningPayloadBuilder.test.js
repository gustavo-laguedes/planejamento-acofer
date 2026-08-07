import assert from 'node:assert/strict';
import {
  buildNormalizedPlanningPayload,
  buildPlanningSimulationPayload,
  buildProductionPayload,
  buildShiftPayload,
  buildStockOnlyMaterialsForPayload
} from '../shared/planning-domain/planningPayloadBuilder.js';

const materials = [
  { id: 10, codes: ['MAT-10'], primary_unit: 'kg' },
  { id: 20, codes: [], primary_unit: '' }
];
const findMaterialById = (collection, id) => collection.find(material => String(material.id) === String(id));
const isHexColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
const getAutomaticProductionColor = index => `auto-${index}`;

const fullProductions = [
  {
    materialId: '10',
    color: '#aabbcc',
    plannedQty: '12.5',
    machineName: 'Laser',
    peopleCount: '3',
    desiredDate: '2026-08-10',
    productionModelName: 'Modelo A'
  },
  {
    materialId: 20,
    color: 'invalid',
    plannedQty: '',
    machineName: '',
    peopleCount: null,
    desiredDate: '',
    productionModelName: ''
  }
];
const fullProductionsBefore = JSON.stringify(fullProductions);

assert.deepEqual(buildProductionPayload({
  productions: fullProductions,
  materials,
  findMaterialById,
  isHexColor,
  getAutomaticProductionColor
}), [
  {
    materialId: 10,
    color: '#aabbcc',
    materialCode: 'MAT-10',
    plannedQty: 12.5,
    plannedUnit: 'kg',
    machineName: 'Laser',
    peopleCount: 3,
    desiredDate: '2026-08-10',
    productionModelName: 'Modelo A',
    transports: []
  },
  {
    materialId: 20,
    color: 'auto-1',
    materialCode: '',
    plannedQty: 0,
    plannedUnit: 'un',
    machineName: '',
    peopleCount: 0,
    desiredDate: null,
    productionModelName: '',
    transports: []
  }
]);
assert.equal(JSON.stringify(fullProductions), fullProductionsBefore);

assert.deepEqual(buildProductionPayload({
  productions: [fullProductions[1]],
  materials,
  findMaterialById,
  isHexColor,
  getAutomaticProductionColor,
  productionIndexOffset: 4
})[0], {
  materialId: 20,
  color: 'auto-4',
  materialCode: '',
  plannedQty: 0,
  plannedUnit: 'un',
  machineName: '',
  peopleCount: 0,
  desiredDate: null,
  productionModelName: '',
  transports: []
});

assert.deepEqual(buildShiftPayload([
  {
    label: 'Turno 1',
    hoursPerDay: ' 8,48 ',
    shiftStartTime: '07:00',
    pauseLabel: 'Horas de pausa',
    pauseHours: '99',
    shiftEndTime: '15:48',
    teamAvailable: ''
  },
  {
    label: 'Turno 2',
    hoursPerDay: '',
    shiftStartTime: '15:48',
    pauseLabel: 'Intervalo',
    shiftEndTime: '21:48',
    teamAvailable: 2
  }
], { getDefaultTeamAvailable: (value, index) => `${index}:${value || 'default'}` }), [
  {
    label: 'Turno 1',
    hoursPerDay: '8,48',
    shiftStartTime: '07:00',
    pauseLabel: 'Horas de pausa',
    pauseHours: '0',
    shiftEndTime: '15:48',
    teamAvailable: '0:default'
  },
  {
    label: 'Turno 2',
    hoursPerDay: '8,48',
    shiftStartTime: '15:48',
    pauseLabel: 'Intervalo',
    pauseHours: '0',
    shiftEndTime: '21:48',
    teamAvailable: '1:2'
  }
]);

const stockItemKept = { productionIndex: 2, materialId: 30 };
const stockItemRemoved = { productionIndex: 0, materialId: '10' };
assert.deepEqual(buildStockOnlyMaterialsForPayload({
  stockOnlyMaterials: [stockItemRemoved, stockItemKept],
  productions: fullProductions
}), [stockItemKept]);
assert.deepEqual(buildStockOnlyMaterialsForPayload({
  stockOnlyMaterials: undefined,
  productions: fullProductions
}), []);

const draft = {
  planningStartDate: '2026-08-07',
  productions: fullProductions,
  stockOnlyMaterialChoices: [{ materialId: 30 }],
  skipProductionMaterials: [{ materialId: 40 }],
  operationOverrides: { '0:10': { machineName: 'Laser' } },
  operationSplits: [{ operationId: 'op-1' }],
  dailyTeamOverrides: { '2026-08-08': { teamAvailable: 9 } },
  planningCode: 'PLAN-1'
};
const builtProductions = [{ materialId: 10 }];
const builtStockOnly = [stockItemKept];
const builtManualWorkDates = ['2026-08-09'];
const payload = buildPlanningSimulationPayload({
  draft,
  materials,
  findMaterialById,
  shifts: [{ label: 'Turno 1' }],
  setupHours: 1.5,
  productions: builtProductions,
  stockOnlyMaterials: builtStockOnly,
  manualWorkDates: builtManualWorkDates
});
assert.deepEqual(payload, {
  dateMode: 'start',
  selectedDate: '2026-08-07',
  startDate: '2026-08-07',
  planningStartDate: '2026-08-07',
  materialId: 10,
  materialCode: 'MAT-10',
  plannedQty: 12.5,
  plannedUnit: 'kg',
  machineName: 'Laser',
  peopleCount: 3,
  productionModelName: 'Modelo A',
  shifts: [{ label: 'Turno 1' }],
  setupHours: 1.5,
  productions: builtProductions,
  stockOnlyMaterials: builtStockOnly,
  stockOnlyMaterialChoices: [{ materialId: 30 }],
  skipProductionMaterials: [{ materialId: 40 }],
  operationOverrides: { '0:10': { machineName: 'Laser' } },
  operationSplits: [{ operationId: 'op-1' }],
  dailyTeamOverrides: { '2026-08-08': { teamAvailable: 9 } },
  manualWorkDates: builtManualWorkDates,
  planningCode: 'PLAN-1'
});
assert.equal(payload.productions, builtProductions);
assert.equal(payload.stockOnlyMaterials, builtStockOnly);
assert.equal(payload.manualWorkDates, builtManualWorkDates);

assert.deepEqual(buildPlanningSimulationPayload({
  draft: { planningStartDate: '2026-08-07', productions: [] },
  materials,
  findMaterialById,
  shifts: [],
  setupHours: 0,
  productions: [],
  stockOnlyMaterials: [],
  manualWorkDates: []
}), {
  dateMode: 'start',
  selectedDate: '2026-08-07',
  startDate: '2026-08-07',
  planningStartDate: '2026-08-07',
  materialId: NaN,
  materialCode: '',
  plannedQty: NaN,
  plannedUnit: 'un',
  machineName: undefined,
  peopleCount: NaN,
  productionModelName: undefined,
  shifts: [],
  setupHours: 0,
  productions: [],
  stockOnlyMaterials: [],
  stockOnlyMaterialChoices: [],
  skipProductionMaterials: [],
  operationOverrides: {},
  operationSplits: [],
  dailyTeamOverrides: {},
  manualWorkDates: [],
  planningCode: null
});

assert.deepEqual(buildNormalizedPlanningPayload({
  sourcePayload: {
    selectedDate: '2026-08-01',
    planningStartDate: '2026-08-02',
    endDate: '2026-08-03',
    other: true
  },
  planningCode: 'PLAN-2',
  draftPlanningStartDate: '2026-08-04',
  operations: [{ startDate: '2026-08-02', endDate: '2026-08-05' }],
  getOperationPeriod: (operations, start, fallbackEnd) => ({
    startDate: operations[0].startDate,
    endDate: `${start}|${fallbackEnd}`
  })
}), {
  selectedDate: '2026-08-02',
  planningStartDate: '2026-08-02',
  endDate: '2026-08-02|2026-08-03',
  other: true,
  startDate: '2026-08-02',
  planningEndDate: '2026-08-02|2026-08-03',
  planningCode: 'PLAN-2'
});

console.log('planningPayloadBuilder.test.js ok');
