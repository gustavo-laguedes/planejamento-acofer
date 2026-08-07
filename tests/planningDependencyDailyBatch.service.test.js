import assert from 'node:assert/strict';
import { buildPlan } from '../services/planning.service.js';

const shifts = [{
  shiftId: 'day', label: 'Turno 1', hoursPerDay: 8,
  shiftStartTime: '07:00', shiftEndTime: '15:00', teamAvailable: 6
}];

const materials = [
  { id: 1, name: 'Longitudinal', codes: ['LONG'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 2, name: 'Transversal', codes: ['TRANS'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 3, name: 'Malha A', codes: ['MESH'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 4, name: 'Malha B', codes: ['MESH-B'], primary_unit: 'un', is_initial_raw_material: false }
];

const inputsByMaterialId = new Map([
  ['3', [
    { material_id: 3, input_material_id: 1, qty_per_output: 2, production_model_name: 'Padrao' },
    { material_id: 3, input_material_id: 2, qty_per_output: 3, production_model_name: 'Padrao' }
  ]],
  ['4', [
    { material_id: 4, input_material_id: 1, qty_per_output: 2, production_model_name: 'Padrao' },
    { material_id: 4, input_material_id: 2, qty_per_output: 3, production_model_name: 'Padrao' }
  ]]
]);

const matrixRows = [
  { material_code: 'LONG', machine_name: 'ML', people_count: 0, output_qty: 100, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'TRANS', machine_name: 'MT', people_count: 0, output_qty: 100, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'MESH', machine_name: 'MM-A', people_count: 0, output_qty: 50, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'MESH-B', machine_name: 'MM-B', people_count: 0, output_qty: 50, output_unit: 'un', time_seconds: 28800, active: true }
];

function simulate(plannedQty, extra = {}, productions = [{ materialId: 3, plannedQty }], contextOverrides = {}) {
  const materialsById = new Map(materials.map(material => [String(material.id), material]));
  return buildPlan({
    productions,
    planningStartDate: '2026-07-20',
    shifts,
    ...extra
  }, {
    material: materialsById.get('3'),
    materials,
    materialsById,
    inputsByMaterialId,
    matrixRows,
    stockRows: [],
    correctionRows: [],
    existingOperations: [],
    ...contextOverrides
  });
}

const twoDayConsumer = simulate(100);
const mesh = twoDayConsumer.operations.find(operation => operation.materialId === 3);
const longitudinal = twoDayConsumer.operations.find(operation => operation.materialId === 1);
const transversal = twoDayConsumer.operations.find(operation => operation.materialId === 2);

assert.ok(mesh && longitudinal && transversal);
assert.equal(longitudinal.endDate, '2026-07-21');
assert.equal(transversal.endDate, '2026-07-22');
assert.equal(mesh.startDate, '2026-07-22');
assert.equal(mesh.startTime, '07:00', 'a malha deve aguardar o proximo dia produtivo apos os insumos do lote requerido');
assert.ok(
  mesh.endDate >= transversal.endDate,
  'a etapa consumidora nao pode terminar antes da producao integral de seus insumos'
);

const partialDayConsumer = simulate(40);
const partialMesh = partialDayConsumer.operations.find(operation => operation.materialId === 3);
assert.equal(partialMesh.startDate, '2026-07-22');
assert.equal(partialMesh.startTime, '07:00', 'quando resta menos de um dia, deve aguardar o proximo dia produtivo apos todo o saldo restante');

const sharedInputs = simulate(50, {}, [
  { materialId: 3, plannedQty: 50 },
  { materialId: 4, plannedQty: 50 }
]);
const sharedTransversal = sharedInputs.operations.find(operation => operation.materialId === 2);
const meshA = sharedInputs.operations.find(operation => operation.materialId === 3);
const meshB = sharedInputs.operations.find(operation => operation.materialId === 4);

assert.ok(sharedTransversal && meshA && meshB);
assert.equal(meshA.startDate, '2026-07-22');
assert.equal(meshA.startTime, '07:00');
assert.ok(
  meshB.startDate > meshA.startDate || (meshB.startDate === meshA.startDate && meshB.startTime > meshA.startTime),
  'duas malhas nao podem reutilizar virtualmente o mesmo lote de insumos'
);
assert.ok(
  meshB.startDate >= sharedTransversal.endDate,
  'a segunda malha deve aguardar a reserva cumulativa do transversal compartilhado'
);

const usingAvailableBalance = simulate(100, {
  stockOnlyMaterials: [
    { productionIndex: 0, materialId: 1 },
    { productionIndex: 0, materialId: 2 }
  ]
}, undefined, {
  stockRows: [
    { product_code: 'LONG', fiscal_balance_unit: 200, error_balance_unit: 0 },
    { product_code: 'TRANS', fiscal_balance_unit: 300, error_balance_unit: 0 }
  ]
});
const stockCoveredMesh = usingAvailableBalance.operations.find(operation => operation.materialId === 3);
assert.equal(stockCoveredMesh.startDate, '2026-07-20');
assert.equal(stockCoveredMesh.startTime, '07:00', 'marcar Utilizar saldo deve recalcular sem travar e liberar o lote coberto pelo estoque');

console.log('planningDependencyDailyBatch.service.test.js: ok');
