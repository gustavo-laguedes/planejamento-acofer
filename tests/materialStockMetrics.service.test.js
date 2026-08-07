import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveMaterialDailySales,
  resolveMaterialStockMetrics,
  resolveMaterialTotalLocalStock
} from '../services/materialStockMetrics.service.js';
import { buildPlanningOpeningStock, projectPlanningStockByDay } from '../services/planningStockProjection.service.js';

const material = { id: 1, codes: ['A1'], permits_sales: true };
const locations = [{ id: 1, code: 'Matriz', name: 'Matriz' }, { id: 2, code: 'Feital', name: 'Feital' }];
const stockRows = [
  { establishment: 'Matriz', product_code: 'A1', fiscal_balance_unit: 3000, error_balance_unit: -50, sales_unit: 400 },
  { establishment: 'Feital', old_product_code: 'A1', fiscal_balance_unit: 500, error_balance_unit: 0, sales_unit: 100 },
  { establishment: 'Sem cadastro', product_code: 'A1', fiscal_balance_unit: 999, error_balance_unit: 1, sales_unit: 0 }
];
const correctionRows = [{ material_id: 1, correction_qty: 3 }];

assert.equal(resolveMaterialTotalLocalStock({ material, locations, stockRows, correctionRows }).totalLocationsQty, 3453);
assert.equal(resolveMaterialDailySales({ material, stockRows, businessDays: 5 }).salesPerDayQty, 100);
assert.deepEqual(resolveMaterialStockMetrics({ material, locations, stockRows, correctionRows, businessDays: 5 }), {
  totalLocationsQty: 3453,
  correctionQty: 3,
  salesPeriodQty: 500,
  salesPerDayQty: 100,
  blocked: false,
  notEstimated: false,
  stockDurationDays: 34.53
});
assert.equal(resolveMaterialDailySales({ material: { ...material, permits_sales: false }, stockRows, businessDays: 5 }).salesPerDayQty, null);
const canonicalOpening = buildPlanningOpeningStock({ materials: [material], locations, stockRows, correctionRows });
const projection = projectPlanningStockByDay({ calendarDays: ['2026-07-20'], stockContext: { stock: canonicalOpening } });
assert.equal(projection.days[0].materials[0].openingStock, 3453, 'modal e tela de Estoque partem da mesma Qtd. total locais');

const stockRouteSource = readFileSync(new URL('../server/routes/stock.routes.js', import.meta.url), 'utf8');
const projectionSource = readFileSync(new URL('../services/planningStockProjection.service.js', import.meta.url), 'utf8');
assert.match(stockRouteSource, /resolveMaterialStockMetrics/);
assert.match(projectionSource, /resolveMaterialTotalLocalStock/);
assert.match(projectionSource, /resolveMaterialDailySales/);

console.log('materialStockMetrics.service.test.js ok');
