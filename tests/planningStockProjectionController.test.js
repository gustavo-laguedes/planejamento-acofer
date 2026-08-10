import assert from 'node:assert/strict';
import {
  buildPlanningStockCalendarAlert,
  buildPlanningStockModalModel,
  buildPlanningStockProjection,
  getPlanningStockProjectionDay
} from '../shared/planning-controller/planningStockProjectionController.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const days = [{ date: '2026-07-20' }, { date: '2026-07-21' }];
const material = (materialId, extra = {}) => ({ materialId, materialName: materialId, unit: 'kg', ...extra });
const allocation = (allocationId, materialId, date, quantity, extra = {}) => ({
  allocationId,
  materialId,
  materialName: materialId,
  unit: 'kg',
  date,
  startTime: '08:00',
  endTime: '10:00',
  quantity,
  parentOperationId: `0:${materialId}`,
  components: [{ parentOperationId: `0:${materialId}`, materialId, quantity, unit: 'kg' }],
  ...extra
});

{
  assert.equal(getPlanningStockProjectionDay(null, '2026-07-20'), null);
  assert.equal(buildPlanningStockModalModel(null, '2026-07-20'), null);
  assert.equal(buildPlanningStockCalendarAlert(null, '2026-07-20'), null);
  assert.equal(buildPlanningStockProjection(), null);
}

{
  const projection = {
    days: [
      { date: '2026-07-20', materials: [material('A'), material('B')], summary: {} },
      { date: '2026-07-21', materials: [material('B')], summary: {} }
    ],
    alerts: [
      { date: '2026-07-20', materialId: 'A', code: 'A20' },
      { date: '2026-07-21', materialId: 'B', code: 'B21' }
    ]
  };
  assert.deepEqual(getPlanningStockProjectionDay(projection, '2026-07-20').materials.map(item => item.materialId), ['A', 'B']);
  assert.deepEqual(getPlanningStockProjectionDay(projection, '2026-07-20').alerts.map(item => item.code), ['A20']);
  assert.deepEqual(getPlanningStockProjectionDay(projection, '2026-07-21').materials.map(item => item.materialId), ['B']);
}

{
  const projection = {
    days: [
      {
        date: '2026-07-20',
        materials: [
          { ...material('A', { materialName: 'Venda A' }), openingStock: 10, productionIn: 0, productionConsumption: 0, demandOut: 0, closingStock: 8, coverageDays: 4, status: 'OK', movements: [] },
          { ...material('B', { materialName: 'Producao B' }), openingStock: 5, productionIn: 0, productionConsumption: 3, demandOut: 0, closingStock: 2, coverageDays: null, status: 'OK', movements: [] }
        ],
        summary: {}
      },
      {
        date: '2026-07-21',
        materials: [
          { ...material('A', { materialName: 'Venda A' }), openingStock: 8, productionIn: 0, productionConsumption: 0, demandOut: 0, closingStock: -1, coverageDays: 0, status: 'NEGATIVE', movements: [] },
          { ...material('B', { materialName: 'Producao B' }), openingStock: 2, productionIn: 0, productionConsumption: 4, demandOut: 0, closingStock: 1, coverageDays: null, status: 'OK', movements: [] }
        ],
        summary: {}
      }
    ],
    alerts: [
      { date: '2026-07-21', materialId: 'A', code: 'RUPTURE', severity: 'error', message: 'Ruptura' },
      { date: '2026-07-21', materialId: 'B', code: 'PROD', severity: 'warning', message: 'Produção' }
    ]
  };
  const original = clone(projection);
  deepFreeze(projection);
  const model = buildPlanningStockModalModel(
    projection,
    '2026-07-21',
    [{ id: 'A', permits_sales: true }, { id: 'B', permits_sales: false }],
    { minimumDays: 10, idealDays: 20 }
  );
  assert.deepEqual(model.salesMaterials.map(item => item.materialId), ['A']);
  assert.deepEqual(model.productionMaterials.map(item => item.materialId), ['B']);
  assert.equal(model.salesMaterials[0].pcpStatus.key, 'critical');
  assert.equal(model.salesMaterials[0].currentStock, 10);
  assert.equal(model.productionMaterials[0].currentStock, 5);
  assert.equal(model.productionMaterials[0].cumulativeProductionConsumption, 7);
  assert.deepEqual(model.salesAlerts.map(item => item.code), ['RUPTURE']);
  assert.deepEqual(buildPlanningStockCalendarAlert(projection, '2026-07-21', [{ id: 'A', permits_sales: true }, { id: 'B', permits_sales: false }], { minimumDays: 10 }).items, [
    { key: 'critical', label: 'Crítico', count: 1 }
  ]);
  assert.deepEqual(projection, original);
}

{
  const projection = {
    days: [
      {
        date: '2026-07-20',
        materials: [
          { ...material('A'), openingStock: 100, productionIn: 0, productionConsumption: 0, demandOut: 0, closingStock: 90, coverageDays: 9, status: 'OK', movements: [] },
          { ...material('B'), openingStock: 50, productionIn: 0, productionConsumption: 0, demandOut: 0, closingStock: 50, coverageDays: null, status: 'NO_DEMAND', movements: [] }
        ],
        summary: {}
      }
    ],
    alerts: []
  };
  const model = buildPlanningStockModalModel(projection, '2026-07-20', [{ id: 'A', permits_sales: true }, { id: 'B', permits_sales: true }]);
  assert.deepEqual(model.salesMaterials.map(item => item.pcpStatus.key), ['ok', 'ok']);
  assert.equal(buildPlanningStockCalendarAlert(projection, '2026-07-20', [{ id: 'A', permits_sales: true }, { id: 'B', permits_sales: true }]), null);
}

{
  const currentSimulation = {
    stockContext: { stock: [material('A', { quantity: 10 }), material('B', { quantity: 0 })] },
    tree: { productionIndex: 0, materialId: 'B', requiredQty: 10, unit: 'kg', children: [{ productionIndex: 0, materialId: 'A', requiredQty: 20, unit: 'kg', children: [] }] },
    operations: [],
    summary: { productions: [] },
    demandContext: {}
  };
  const snapshot = { days, allocations: [allocation('snapshot-b', 'B', '2026-07-20', 10)] };
  const manualScheduleDraft = { allocations: [allocation('draft-b', 'B', '2026-07-21', 10)] };
  const original = clone({ currentSimulation, snapshot, manualScheduleDraft });
  deepFreeze(currentSimulation);
  deepFreeze(snapshot);
  deepFreeze(manualScheduleDraft);
  const projection = buildPlanningStockProjection({ currentSimulation, snapshot, manualScheduleDraft, materials: [], validationStock: [], warningCoverageDays: 5 });
  assert.deepEqual(projection.days.map(day => day.date), ['2026-07-20', '2026-07-21']);
  assert.equal(projection.generatedFrom.allocationCount, 1);
  assert.deepEqual(projection.days.map(day => day.materials.find(item => item.materialId === 'B').productionIn), [0, 10]);
  assert.ok(projection.alerts.some(item => item.code === 'PROJECTED_STOCK_NEGATIVE'));
  assert.deepEqual({ currentSimulation, snapshot, manualScheduleDraft }, original);
}

console.log('planningStockProjectionController.test.js ok');
