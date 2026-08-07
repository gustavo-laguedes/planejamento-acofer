import assert from 'node:assert/strict';
import { buildPlan } from '../services/planning.service.js';
import { adaptPlanningResultToProductionCalendar } from '../shared/production-calendar/productionCalendar.adapter.js';

const shifts = [{
  shiftId: 'day',
  label: 'Turno 1',
  hoursPerDay: 8,
  shiftStartTime: '07:00',
  shiftEndTime: '15:00',
  teamAvailable: 6
}];

const materials = [
  { id: 1, name: 'Arame', codes: ['RAW'], primary_unit: 'un', is_initial_raw_material: true },
  { id: 2, name: 'Componente A', codes: ['COMP-A'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 3, name: 'Componente B', codes: ['COMP-B'], primary_unit: 'un', is_initial_raw_material: true },
  { id: 4, name: 'EQ-45', codes: ['EQ45'], primary_unit: 'un', is_initial_raw_material: false }
];

const inputsByMaterialId = new Map([
  ['2', [
    { material_id: 2, input_material_id: 1, qty_per_output: 1, production_model_name: 'Padrao' }
  ]],
  ['4', [
    { material_id: 4, input_material_id: 2, qty_per_output: 1, production_model_name: 'Padrao' },
    { material_id: 4, input_material_id: 3, qty_per_output: 2, production_model_name: 'Padrao' }
  ]]
]);

const baseMatrixRows = [
  { id: 'raw-ec125-3', material_code: 'COMP-A', machine_name: 'EC-125', people_count: 3, output_qty: 700, output_unit: 'un', time_seconds: 28800, active: true },
  { id: 'eq-mt200-3', material_code: 'EQ45', machine_name: 'MT-200', people_count: 3, output_qty: 700, output_unit: 'un', time_seconds: 28800, active: true },
  { id: 'eq-mt200-2', material_code: 'EQ45', machine_name: 'MT-200', people_count: 2, output_qty: 500, output_unit: 'un', time_seconds: 28800, active: true },
  { id: 'eq-mt150-3', material_code: 'EQ45', machine_name: 'MT-150', people_count: 3, output_qty: 300, output_unit: 'un', time_seconds: 28800, active: true }
];

function context(stockRows = [], matrixRows = baseMatrixRows, inputMap = inputsByMaterialId, overrides = {}) {
  const materialsById = new Map(materials.map(material => [String(material.id), material]));
  return {
    material: materialsById.get('4'),
    materials,
    materialsById,
    inputsByMaterialId: inputMap,
    matrixRows,
    stockRows,
    correctionRows: [],
    existingOperations: [],
    ...overrides
  };
}

function simulate({
  plannedQty = 1500,
  stockA = 0,
  stockB = 10000,
  peopleCount = 3,
  machineName = 'MT-200',
  matrixRows = baseMatrixRows,
  inputMap = inputsByMaterialId,
  stockOnlyMaterials = [{ productionIndex: 0, materialId: 2 }],
  stockOnlyMaterialChoices = [],
  existingOperations = []
} = {}) {
  return buildPlan({
    productions: [{ materialId: 4, plannedQty, machineName, peopleCount }],
    planningStartDate: '2026-07-20',
    shifts,
    stockOnlyMaterials,
    stockOnlyMaterialChoices
  }, context([
    { product_code: 'RAW', fiscal_balance_unit: 10000, error_balance_unit: 0 },
    { product_code: 'COMP-A', fiscal_balance_unit: stockA, error_balance_unit: 0 },
    { product_code: 'COMP-B', fiscal_balance_unit: stockB, error_balance_unit: 0 }
  ], matrixRows, inputMap, { existingOperations }));
}

function eqAllocations(result) {
  return result.calendarOperations.filter(operation => String(operation.materialId) === '4');
}

function firstEq(result) {
  return eqAllocations(result)[0];
}

{
  const result = simulate({ stockA: 700 });
  assert.equal(firstEq(result).quantity, 700, 'estoque integral para 700 deve alocar 700');
  assert.equal(firstEq(result).maxDailyCapacity, 700);
  assert.equal(firstEq(result).capacityPercent, 100);
}

{
  const result = simulate({ stockA: 400 });
  assert.equal(firstEq(result).startDate, '2026-07-21', '400 em estoque nao pode gerar allocation parcial de 400 no primeiro dia');
  assert.equal(firstEq(result).quantity, 700);
}

{
  const result = simulate({ plannedQty: 266.48, stockA: 266.48, stockB: 532.96 });
  assert.equal(eqAllocations(result).length, 1);
  assert.equal(firstEq(result).quantity, 266.48, 'ultima parcela pode ser menor que a capacidade diaria');
  assert.equal(firstEq(result).capacityPercent, 38.07);
}

{
  const result = simulate({ stockA: 700, stockB: 1399 });
  assert.equal(eqAllocations(result).length, 0, 'um componente insuficiente bloqueia a allocation mesmo com os demais suficientes');
  assert.ok(result.diagnostics.errors.some(issue =>
    issue.componentMaterialId === '3'
    && issue.requiredQuantity === 1400
    && issue.availableQuantity === 1399
  ));
}

{
  const repeatedComponentInputs = new Map([
    ...inputsByMaterialId,
    ['4', [
      { material_id: 4, input_material_id: 3, qty_per_output: 1, production_model_name: 'Padrao' },
      { material_id: 4, input_material_id: 3, qty_per_output: 1, production_model_name: 'Padrao' }
    ]]
  ]);
  const result = simulate({ plannedQty: 700, stockA: 0, stockB: 700, inputMap: repeatedComponentInputs });
  assert.equal(eqAllocations(result).length, 0, 'componentes repetidos devem ser somados antes de validar disponibilidade integral');
  assert.ok(result.diagnostics.errors.some(issue =>
    issue.componentMaterialId === '3'
    && issue.requiredQuantity === 1400
    && issue.availableQuantity === 700
  ));
}

{
  const result = simulate({ stockA: 400, stockB: 10000 });
  assert.equal(firstEq(result).startDate, '2026-07-21', 'material produzido hoje so deve liberar sucessora amanha');
}

{
  const result = simulate({
    plannedQty: 1000,
    stockA: 1000,
    stockB: 2000,
    existingOperations: [{
      operationId: 'block-mt200-morning',
      materialId: 'blocker',
      materialName: 'Bloqueio existente',
      machineName: 'MT-200',
      peopleCount: 0,
      startDate: '2026-07-20',
      startTime: '07:00',
      endDate: '2026-07-20',
      endTime: '11:00'
    }]
  });
  const allocations = eqAllocations(result);
  assert.equal(allocations[0].startDate, '2026-07-20');
  assert.equal(allocations[0].endDate, '2026-07-20', 'allocation diaria nao pode atravessar a celula do dia');
  assert.equal(allocations[0].quantity, 350, 'primeira parcela deve usar apenas a capacidade restante do dia');
  assert.equal(allocations[0].capacityPercent, 50);
  assert.equal(allocations[1].startDate, '2026-07-21');
  assert.equal(allocations[1].endDate, '2026-07-21');
  assert.equal(allocations[1].quantity, 650);
  assert.equal(allocations[1].capacityPercent, 92.86);
}

{
  const result = simulate({
    stockA: 1500,
    stockB: 3000,
    stockOnlyMaterials: []
  });
  assert.equal(result.operations.some(operation => String(operation.materialId) === '2'), false, 'saldo inicial de intermediario deve ser usado imediatamente');
  assert.equal(firstEq(result).startDate, '2026-07-20', 'sucessora pode iniciar no primeiro dia viavel quando o saldo inicial cobre o lote');
}

{
  const result = simulate({
    stockA: 1500,
    stockB: 3000,
    stockOnlyMaterials: [],
    stockOnlyMaterialChoices: [{ productionIndex: 0, materialId: 2, useStock: false }]
  });
  assert.equal(result.operations.some(operation => String(operation.materialId) === '2'), true, 'escolha explicita de nao usar saldo deve ser respeitada');
  assert.equal(firstEq(result).startDate, '2026-07-22', 'material produzido no proprio plano segue liberacao no dia seguinte apos o lote requerido');
}

{
  const result = simulate({ stockA: 500, peopleCount: 2 });
  assert.equal(firstEq(result).quantity, 500, 'troca de pessoas recalcula a parcela diaria pela Matriz');
  assert.equal(firstEq(result).maxDailyCapacity, 500);
  assert.equal(firstEq(result).capacityPercent, 100);
}

{
  const result = simulate({ stockA: 300, machineName: 'MT-150', peopleCount: 3 });
  assert.equal(firstEq(result).quantity, 300, 'troca de maquina recalcula a parcela diaria pela Matriz');
  assert.equal(firstEq(result).maxDailyCapacity, 300);
}

{
  assert.throws(
    () => simulate({ machineName: 'MT-999', peopleCount: 3 }),
    error => error.code === 'PRODUCTIVITY_MATRIX_CONFIGURATION_NOT_FOUND'
      && error.diagnostic?.code === 'PRODUCTIVITY_MATRIX_CONFIGURATION_NOT_FOUND'
  );
}

{
  const result = simulate({ plannedQty: 700.000001, stockA: 700.000001, stockB: 1400.000002 });
  assert.ok(eqAllocations(result).every(allocation => allocation.quantity > 0));
  assert.ok(result.calendarOperations.every(operation => operation.quantity >= 0));
}

{
  const blocked = simulate({ stockA: 700, stockB: 0 });
  const snapshot = adaptPlanningResultToProductionCalendar(blocked);
  assert.equal(snapshot.allocations.filter(allocation => allocation.materialId === '4').length, 0, 'Gantt nao cria barra sem allocation');

  const recalculated = simulate({ stockA: 500, peopleCount: 2 });
  const recalculatedSnapshot = adaptPlanningResultToProductionCalendar(recalculated);
  const allocation = recalculatedSnapshot.allocations.find(item => item.materialId === '4');
  assert.equal(allocation.quantity, 500);
  assert.equal(allocation.maxDailyCapacity, 500);
}

{
  const source = simulate({
    plannedQty: 1000,
    stockA: 1000,
    stockB: 2000,
    existingOperations: [{
      operationId: 'adapter-blocker',
      materialId: 'blocker',
      materialName: 'Bloqueio existente',
      machineName: 'MT-200',
      peopleCount: 0,
      startDate: '2026-07-20',
      startTime: '07:00',
      endDate: '2026-07-20',
      endTime: '11:00'
    }]
  });
  const snapshot = adaptPlanningResultToProductionCalendar(source);
  assert.equal(
    snapshot.allocations.filter(allocation => allocation.materialId === '4').every(allocation => allocation.endDate === allocation.date),
    true,
    'Gantt deve receber allocations diarias sem barra atravessando outro dia'
  );
}

{
  const realMaterials = [
    { id: 21, name: '3,4 Longitudinal - 3m', codes: ['LONG-34'], primary_unit: 'un', is_initial_raw_material: false },
    { id: 22, name: '3,4 Transversal - 2m', codes: ['TRANS-34-2M'], primary_unit: 'un', is_initial_raw_material: false },
    { id: 23, name: 'EQ-45', codes: ['EQ-45'], primary_unit: 'un', is_initial_raw_material: false },
    { id: 24, name: 'Q-61 (3,0x2,0)', codes: ['Q-61'], primary_unit: 'un', is_initial_raw_material: false }
  ];
  const realMaterialsById = new Map(realMaterials.map(material => [String(material.id), material]));
  const result = buildPlan({
    productions: [
      { materialId: 23, plannedQty: 300, machineName: 'MT-200', peopleCount: 3 },
      { materialId: 24, plannedQty: 300, machineName: 'MT-150', peopleCount: 3 }
    ],
    planningStartDate: '2026-07-28',
    shifts
  }, {
    material: realMaterialsById.get('23'),
    materials: realMaterials,
    materialsById: realMaterialsById,
    inputsByMaterialId: new Map([
      ['23', [
        { material_id: 23, input_material_id: 21, qty_per_output: 2, production_model_name: 'Padrao' },
        { material_id: 23, input_material_id: 22, qty_per_output: 3, production_model_name: 'Padrao' }
      ]],
      ['24', [
        { material_id: 24, input_material_id: 21, qty_per_output: 2, production_model_name: 'Padrao' },
        { material_id: 24, input_material_id: 22, qty_per_output: 3, production_model_name: 'Padrao' }
      ]]
    ]),
    matrixRows: [
      { material_code: 'LONG-34', machine_name: 'EC-125', people_count: 1, output_qty: 8490, output_unit: 'un', time_seconds: 28800, active: true },
      { material_code: 'TRANS-34-2M', machine_name: 'MT-100', people_count: 2, output_qty: 1200, output_unit: 'un', time_seconds: 28800, active: true },
      { material_code: 'EQ-45', machine_name: 'MT-200', people_count: 3, output_qty: 960, output_unit: 'un', time_seconds: 28800, active: true },
      { material_code: 'Q-61', machine_name: 'MT-150', people_count: 3, output_qty: 720, output_unit: 'un', time_seconds: 28800, active: true }
    ],
    stockRows: [
      { product_code: 'LONG-34', fiscal_balance_unit: 5000, error_balance_unit: 0 },
      { product_code: 'TRANS-34-2M', fiscal_balance_unit: 5000, error_balance_unit: 0 }
    ],
    correctionRows: [],
    existingOperations: []
  });
  const materialsScheduled = result.calendarOperations.map(operation => operation.materialName);
  assert.equal(materialsScheduled.includes('3,4 Longitudinal - 3m'), false);
  assert.equal(materialsScheduled.includes('3,4 Transversal - 2m'), false);
  assert.equal(result.calendarOperations.find(operation => operation.materialName === 'EQ-45')?.startDate, '2026-07-28');
  assert.equal(result.calendarOperations.find(operation => operation.materialName === 'Q-61 (3,0x2,0)')?.startDate, '2026-07-28');
}

console.log('planningDailyBatchStock.service.test.js ok');
