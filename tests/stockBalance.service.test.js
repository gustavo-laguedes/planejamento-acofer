import assert from 'node:assert/strict';
import { aggregateImportedSales, buildStockBalances } from '../services/stockBalance.service.js';

const materials = [
  { id: 1, name: 'Vergalhao', codes: ['A1', 'A2'], primary_unit: 'un', active: true },
  { id: 2, name: 'Fio', codes: ['B1'], primary_unit: 'un', active: true },
  { id: 3, name: 'Insumo', codes: ['C1'], primary_unit: 'un', active: true }
];

const locations = [
  { id: 10, code: 'MATRIZ', name: 'Matriz', active: true },
  { id: 20, code: 'FEITAL', name: 'Feital', active: true }
];

{
  const result = aggregateImportedSales({
    materials,
    locations,
    records: [
      { product_code: 'A1', establishment: 'MATRIZ', sales_unit: 2 },
      { product_code: 'A2', establishment: 'MATRIZ', sales_unit: 3 },
      { product_code: 'A1', establishment: 'FILIALFEITAL', sales_unit: 4 },
      { product_code: 'ZZ', establishment: 'MATRIZ', sales_unit: 99 },
      { product_code: 'A1', establishment: 'IGNORADO', sales_unit: 99 }
    ]
  });

  const matriz = result.rows.find(row => row.materialId === 1 && row.locationId === 10);
  const feital = result.rows.find(row => row.materialId === 1 && row.locationId === 20);
  assert.equal(matriz.salesQty, 5);
  assert.deepEqual(matriz.productCodes, ['A1', 'A2']);
  assert.equal(feital.salesQty, 4);
  assert.equal(result.matchedRows, 3);
  assert.equal(result.ignoredRows, 2);
}

{
  const rows = buildStockBalances({
    materials,
    locations,
    inventories: [
      { inventory_count_id: 1, material_id: 1, location_id: 10, counted_qty: 100, created_at: '2026-01-01T10:00:00.000Z' },
      { inventory_count_id: 2, material_id: 1, location_id: 10, counted_qty: 80, created_at: '2026-01-02T10:00:00.000Z' },
      { inventory_count_id: 3, material_id: 3, location_id: 10, counted_qty: 50, created_at: '2026-01-01T10:00:00.000Z' }
    ],
    productionLaunches: [
      {
        id: 10,
        production_date: '2026-01-02',
        created_at: '2026-01-02T09:00:00.000Z',
        material_id: 1,
        location_id: 10,
        quantity: 7,
        production_model_name: 'Padrao',
        consumed_inputs: [{ materialId: 3 }]
      },
      {
        id: 11,
        production_date: '2026-01-02',
        created_at: '2026-01-02T11:00:00.000Z',
        material_id: 1,
        location_id: 10,
        quantity: 10,
        production_model_name: 'Padrao',
        consumed_inputs: [{ materialId: 3 }]
      }
    ],
    transports: [
      {
        id: 20,
        transport_date: '2026-01-03',
        created_at: '2026-01-03T10:00:00.000Z',
        material_id: 1,
        origin_location_id: 10,
        destination_location_id: 20,
        quantity: 5
      }
    ],
    materialPurchases: [
      {
        id: 25,
        purchase_date: '2026-01-03',
        created_at: '2026-01-03T11:00:00.000Z',
        material_id: 1,
        location_id: 10,
        quantity: 1000
      }
    ],
    sales: [
      { import_id: 30, material_id: 1, location_id: 10, period_start: '2026-01-01', period_end: '2026-01-31', sales_qty: 99 }
    ],
    plannedRows: [
      { material_id: 1, location_id: 10, planned_qty: 30 }
    ],
    materialInputs: [
      { material_id: 1, input_material_id: 3, production_model_name: 'Padrao', qty_per_output: 2 }
    ]
  });

  const matriz = rows.find(row => row.materialId === 1 && row.locationId === 10);
  const feital = rows.find(row => row.materialId === 1 && row.locationId === 20);
  const insumo = rows.find(row => row.materialId === 3 && row.locationId === 10);

  assert.equal(matriz.openingQty, 80);
  assert.equal(matriz.movementTotals.productionInQty, 10, 'producao anterior ao ultimo inventario nao entra no saldo atual');
  assert.equal(matriz.movementTotals.transportOutQty, 5);
  assert.equal(matriz.movementTotals.salesQty, 99);
  assert.equal(matriz.currentQty, 85, 'vendas importadas e compras manuais nao entram na formula fisica solicitada');
  assert.equal(feital.movementTotals.transportInQty, 5);
  assert.equal(feital.currentQty, 5);
  assert.equal(insumo.movementTotals.consumptionOutQty, 34);
  assert.equal(insumo.movementTotals.productionReserveQty, 26);
  assert.equal(matriz.movementTotals.pendingProductionQty, 13);
}
