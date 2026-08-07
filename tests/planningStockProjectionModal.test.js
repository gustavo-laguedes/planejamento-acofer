import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  setInterval: () => 0,
  clearInterval() {},
  addEventListener() {},
  location: { hostname: 'localhost' }
};
const { getPlanningStockProjectionDay, buildPlanningStockModalModel, buildPlanningStockCalendarAlert } = await import('../pages/PlanningPage.js');

const projection = {
  days: [
    {
      date: '2026-07-16',
      materials: [
        { materialId: 'A', materialCode: '00808700065', materialName: '3,4 Longitudinal - 3m', unit: 'kg', closingStock: -1, status: 'NEGATIVE', movements: [] },
        { materialId: 'B', materialCode: 'MP01', materialName: 'Matéria-prima B', unit: 'kg', openingStock: 1000, productionConsumption: 100, closingStock: -2, status: 'NEGATIVE', movements: [] },
        { materialId: 'C', materialCode: 'LEG', materialName: 'Material legado', unit: 'un', closingStock: 5, status: 'OK', movements: [] }
      ],
      summary: { negativeCount: 2, criticalCount: 0, warningCount: 0 }
    },
    { date: '2026-07-17', materials: [{ materialId: 'B', materialName: 'Matéria-prima B', openingStock: -2, productionConsumption: 200, closingStock: 8, status: 'OK', movements: [] }], summary: { negativeCount: 0, criticalCount: 0, warningCount: 0 } }
  ],
  alerts: [
    { date: '2026-07-16', materialId: 'A', code: 'A16' },
    { date: '2026-07-17', materialId: 'B', code: 'B17' }
  ]
};

const first = getPlanningStockProjectionDay(projection, '2026-07-16');
const second = getPlanningStockProjectionDay(projection, '2026-07-17');
assert.equal(first.date, '2026-07-16');
assert.deepEqual(first.materials.map(item => item.materialId), ['A', 'B', 'C']);
assert.deepEqual(first.alerts.map(item => item.code), ['A16']);
assert.equal(second.date, '2026-07-17');
assert.deepEqual(second.materials.map(item => item.materialId), ['B']);
assert.deepEqual(second.alerts.map(item => item.code), ['B17']);
assert.equal(getPlanningStockProjectionDay(projection, '2026-07-18'), null);

const catalog = [
  { id: 'A', permits_sales: true },
  { id: 'B', permits_sales: false },
  { id: 'C', permits_sales: null }
];
const model = buildPlanningStockModalModel(projection, '2026-07-16', catalog);
assert.deepEqual(model.salesMaterials.map(item => item.materialId), ['A', 'C']);
assert.deepEqual(model.productionMaterials.map(item => item.materialId), ['B']);
assert.equal(new Set([...model.salesMaterials, ...model.productionMaterials].map(item => item.materialId)).size, 3);
assert.deepEqual(model.salesSummary, {
  materialCount: 2,
  negativeCount: 1,
  criticalCount: 1,
  warningCount: 0,
  productionAlertCount: 0,
  belowTargetCount: 0
});
assert.deepEqual(buildPlanningStockCalendarAlert(projection, '2026-07-16', catalog), {
  count: 1,
  criticalCount: 1,
  productionAlertCount: 0,
  belowTargetCount: 0,
  items: [{ key: 'critical', label: 'Crítico', count: 1 }]
});
assert.equal(model.productionMaterials[0].closingStock, -2, 'estoque estimado usa closingStock sem mascarar negativo');
assert.equal(model.productionMaterials[0].currentStock, 1000);
assert.equal(model.productionMaterials[0].cumulativeProductionConsumption, 100);
assert.deepEqual(model.salesAlerts.map(item => item.code), ['A16']);
const secondModel = buildPlanningStockModalModel(projection, '2026-07-17', catalog);
assert.equal(secondModel.productionMaterials[0].closingStock, 8);
assert.equal(secondModel.productionMaterials[0].currentStock, 1000);
assert.equal(secondModel.productionMaterials[0].cumulativeProductionConsumption, 300);

const source = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.match(source, /Estoque projetado — \$\{escapeHtml\(formatDateOnly\(day\.date\)\)\}/);
assert.match(source, /currentPlanningStockProjection, selectedDate/);
assert.match(source, /event\.target === backdrop/);
assert.match(source, /event\.key === 'Escape'/);
assert.match(source, /close-planning-stock-modal/);
assert.doesNotMatch(source, /planning-stock-projection-panel/);
assert.doesNotMatch(source, /planning-stock-projection-target/);
const modalSource = source.slice(source.indexOf('function openPlanningStockProjectionModal'), source.indexOf('function refreshPlanningStockProjection'));
assert.match(modalSource, /Estoque de venda/);
assert.match(modalSource, /Estoque de produção/);
assert.match(modalSource, /planning-stock-groups/);
assert.match(modalSource, /escapeHtml\(item\.materialName\)/);
assert.doesNotMatch(modalSource, /item\.materialCode\s*\?/);
assert.match(modalSource, /Entradas por produção/);
assert.match(modalSource, /Estoque hoje/);
assert.match(modalSource, /Vendas\/dia/);
const salesColumnsSource = modalSource.slice(modalSource.indexOf('const salesColumns'), modalSource.indexOf('const productionColumns'));
const productionColumnsSource = modalSource.slice(modalSource.indexOf('const productionColumns'), modalSource.indexOf("const backdrop"));
assert.doesNotMatch(salesColumnsSource, /Consumo produtivo/);
assert.doesNotMatch(salesColumnsSource, /Estoque inicial/);
assert.match(productionColumnsSource, /Consumo produtivo/);
assert.match(productionColumnsSource, /Estoque hoje/);
assert.doesNotMatch(productionColumnsSource, /Vendas\/dia|Cobertura|Situação|Entradas por produção/);
assert.doesNotMatch(modalSource, /Outras saídas/);
assert.doesNotMatch(modalSource, /planning-stock-movements/);
assert.doesNotMatch(modalSource, /<details><summary>\$\{escapeHtml\(item\.materialName\)\}/);
assert.match(modalSource, /DataTable\(\{ columns: salesColumns/);
assert.match(modalSource, /DataTable\(\{ columns: productionColumns/);
assert.match(css, /planning-stock-groups[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(css, /planning-stock-projection-dialog[\s\S]*width:\s*min\(96vw, 1800px\)/);

console.log('planningStockProjectionModal.test.js ok');
