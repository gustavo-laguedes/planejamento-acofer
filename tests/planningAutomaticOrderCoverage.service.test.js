import assert from 'node:assert/strict';
import { buildPlan } from '../services/planning.service.js';

const shifts = [{
  shiftId: 'day',
  label: 'Turno 1',
  hoursPerDay: 8,
  shiftStartTime: '07:00',
  shiftEndTime: '15:00',
  teamAvailable: 2
}];

const materials = [
  { id: 1, name: 'Produto A', codes: ['PROD-A'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 2, name: 'Produto B', codes: ['PROD-B'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 3, name: 'Produto C', codes: ['PROD-C'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 4, name: 'Produto D', codes: ['PROD-D'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 10, name: 'Raiz A', codes: ['RAW-A'], primary_unit: 'un', is_initial_raw_material: true },
  { id: 20, name: 'Raiz B', codes: ['RAW-B'], primary_unit: 'un', is_initial_raw_material: true }
];

const materialsById = new Map(materials.map(material => [String(material.id), material]));

const baseMatrixRows = [
  { material_code: 'PROD-A', machine_name: 'P1-A', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'PROD-A', machine_name: 'P2-A', machine_priority: 2, people_count: 1, output_qty: 5000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'PROD-B', machine_name: 'P1-B', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'PROD-C', machine_name: 'P1-C', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'PROD-D', machine_name: 'P1-D', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true }
];

function context({ stockRows = [], inputsByMaterialId = new Map(), matrixRows = baseMatrixRows, ...overrides } = {}) {
  return {
    material: materialsById.get('1'),
    materials,
    materialsById,
    inputsByMaterialId,
    matrixRows,
    stockRows,
    correctionRows: [],
    existingOperations: [],
    ...overrides
  };
}

function simulate(productions, options = {}) {
  return buildPlan({
    productions,
    planningStartDate: '2026-07-20',
    shifts,
    ...options.payload
  }, context(options.context));
}

function productionStartOrder(result) {
  return result.operations
    .filter(operation => ['1', '2', '3', '4'].includes(String(operation.materialId)))
    .map(operation => operation.productionIndex);
}

function scheduledProductionIndexes(result) {
  return new Set(result.calendarOperations.map(operation => Number(operation.productionIndex)));
}

{
  const result = simulate([
    { materialId: 1, plannedQty: 1000 },
    { materialId: 2, plannedQty: 300 }
  ], {
    context: {
      stockRows: [
        { product_code: 'PROD-A', fiscal_balance_unit: 200, error_balance_unit: 0 },
        { product_code: 'PROD-B', fiscal_balance_unit: 100, error_balance_unit: 0 }
      ]
    }
  });

  assert.deepEqual(productionStartOrder(result), [0, 1], '20% deve ter preferencia sobre 33,33%');
  assert.equal(result.operations[0].priorityCoverage, 0.2);
  assert.equal(Number(result.operations[1].priorityCoverage.toFixed(6)), 0.333333);
}

{
  const result = simulate([
    { materialId: 1, plannedQty: 1000 },
    { materialId: 2, plannedQty: 300 }
  ], {
    context: {
      stockRows: [
        { product_code: 'PROD-A', fiscal_balance_unit: 100, error_balance_unit: 0 },
        { product_code: 'PROD-B', fiscal_balance_unit: 100, error_balance_unit: 0 }
      ],
      correctionRows: [
        { material_id: 1, correction_qty: 100 }
      ]
    }
  });

  assert.deepEqual(productionStartOrder(result), [0, 1], 'correcao contextual deve compor o estoque final da cobertura');
  assert.equal(result.operations[0].priorityCoverage, 0.2);
}

{
  const result = simulate([
    { materialId: 1, plannedQty: 1000 },
    { materialId: 2, plannedQty: 1000 }
  ], {
    context: {
      stockRows: [
        { product_code: 'PROD-A', fiscal_balance_unit: -50, error_balance_unit: 0 },
        { product_code: 'PROD-B', fiscal_balance_unit: 200, error_balance_unit: 0 }
      ]
    }
  });

  assert.deepEqual(productionStartOrder(result), [0, 1], 'estoque negativo deve contar como cobertura 0% para ordenacao');
  assert.equal(result.operations[0].priorityCoverage, 0);
}

{
  const result = simulate([
    { materialId: 1, plannedQty: 1000 },
    { materialId: 2, plannedQty: 500 }
  ], {
    context: {
      stockRows: [
        { product_code: 'PROD-A', fiscal_balance_unit: 200, error_balance_unit: 0 },
        { product_code: 'PROD-B', fiscal_balance_unit: 100, error_balance_unit: 0 }
      ]
    }
  });

  assert.deepEqual(productionStartOrder(result), [0, 1], 'empate exato de 20% deve usar ordem de entrada como tie-break');
  assert.equal(result.operations[0].priorityCoverage, result.operations[1].priorityCoverage);
}

{
  const result = simulate([
    { materialId: 1, plannedQty: 1000 },
    { materialId: 2, plannedQty: 1000 }
  ], {
    context: {
      inputsByMaterialId: new Map([
        ['1', [{ material_id: 1, input_material_id: 10, qty_per_output: 1, production_model_name: 'Padrao' }]],
        ['2', [{ material_id: 2, input_material_id: 20, qty_per_output: 1, production_model_name: 'Padrao' }]]
      ]),
      stockRows: [
        { product_code: 'PROD-A', fiscal_balance_unit: 0, error_balance_unit: 0 },
        { product_code: 'PROD-B', fiscal_balance_unit: 300, error_balance_unit: 0 },
        { product_code: 'RAW-A', fiscal_balance_unit: 0, error_balance_unit: 0 },
        { product_code: 'RAW-B', fiscal_balance_unit: 1000, error_balance_unit: 0 }
      ]
    }
  });

  assert.ok(!scheduledProductionIndexes(result).has(0), 'producao A bloqueada nao deve gerar allocation diaria');
  assert.ok(scheduledProductionIndexes(result).has(1), 'producao B producivel nao pode sofrer starvation');
  assert.ok(result.diagnostics.errors.some(issue =>
    issue.productionIndex === 0
    && String(issue.componentMaterialId) === '10'
    && issue.reason === 'INSUFFICIENT_STOCK_FOR_FULL_DAILY_BATCH'
  ));
}

{
  const result = simulate([
    { materialId: 1, plannedQty: 1000 },
    { materialId: 2, plannedQty: 1000 },
    { materialId: 3, plannedQty: 300 },
    { materialId: 4, plannedQty: 100 }
  ], {
    context: {
      stockRows: [
        { product_code: 'PROD-A', fiscal_balance_unit: 0, error_balance_unit: 0 },
        { product_code: 'PROD-B', fiscal_balance_unit: 200, error_balance_unit: 0 },
        { product_code: 'PROD-C', fiscal_balance_unit: 150, error_balance_unit: 0 },
        { product_code: 'PROD-D', fiscal_balance_unit: 100, error_balance_unit: 0 }
      ]
    }
  });

  assert.deepEqual(productionStartOrder(result), [0, 1, 2, 3], 'ordem canonica deve ser 0%, 20%, 50%, 100%');
  assert.deepEqual([...scheduledProductionIndexes(result)].sort(), [0, 1, 2, 3], 'coverage maior nao deve fazer producao desaparecer');
}

{
  const result = simulate([
    { materialId: 2, plannedQty: 300 },
    { materialId: 1, plannedQty: 1000 }
  ], {
    context: {
      stockRows: [
        { product_code: 'PROD-B', fiscal_balance_unit: 100, error_balance_unit: 0 },
        { product_code: 'PROD-A', fiscal_balance_unit: 0, error_balance_unit: 0 }
      ]
    }
  });

  const productA = result.operations.find(operation => String(operation.materialId) === '1');
  assert.equal(productionStartOrder(result)[0], 1, 'cobertura menor deve vencer a ordem de entrada quando nao ha empate');
  assert.equal(productA.machineName, 'P1-A', 'prioridade entre producoes nao deve alterar selecao P1 da matriz');
}

console.log('planningAutomaticOrderCoverage.service.test.js: ok');
