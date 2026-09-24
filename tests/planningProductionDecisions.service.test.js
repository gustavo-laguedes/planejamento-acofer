import assert from 'node:assert/strict';
import { buildPlan } from '../services/planning.service.js';

const materials = [
  { id: 1, name: '4,2 Reto - 12m', codes: ['00808700091'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 2, name: 'CA60 4,2 Bobina', codes: ['00808700093'], primary_unit: 'kg', is_initial_raw_material: false },
  { id: 3, name: 'Fio Máquina 5,5', codes: ['00808400001'], primary_unit: 'kg', is_initial_raw_material: true },
  { id: 4, name: 'Fio Máquina 6,5', codes: ['00808400002'], primary_unit: 'kg', is_initial_raw_material: true }
];

const context = {
  material: materials[0],
  materialsById: new Map(materials.map(material => [String(material.id), material])),
  inputsByMaterialId: new Map([
    ['1', [{ input_material_id: 2, qty_per_output: 1, production_model_name: 'CA60 4,2 Bobina' }]],
    ['2', [
      { input_material_id: 3, qty_per_output: 1.3, production_model_name: 'Fio 5,5' },
      { input_material_id: 4, qty_per_output: 1.3, production_model_name: 'Fio 6,5' }
    ]]
  ]),
  matrixRows: [
    { material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Aço-8', machine_priority: 1, people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680, active: true },
    { material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Focus-8', machine_priority: 2, people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680, active: true },
    { material_code: '00808700093', material_codes: ['00808700093'], material_name: 'CA60 4,2 Bobina', machine_name: 'Trefila', machine_priority: 1, people_count: 1, output_qty: 5000, output_unit: 'kg', time_seconds: 31680, active: true }
  ],
  stockRows: [],
  correctionRows: [],
  existingOperations: []
};

const basePayload = {
  planningStartDate: '2026-07-24',
  selectedDate: '2026-07-24',
  materialId: 1,
  plannedQty: 9357,
  machineName: 'Aço-8',
  peopleCount: 1,
  productionModelName: 'CA60 4,2 Bobina',
  shifts: [{ label: 'Turno 1', shiftStartTime: '07:00', shiftEndTime: '16:00', hoursPerDay: '8,8', teamAvailable: 6 }],
  productions: [{ materialId: 1, plannedQty: 9357, machineName: 'Aço-8', peopleCount: 1, productionModelName: 'CA60 4,2 Bobina' }]
};

assert.throws(() => {
  buildPlan({
    ...basePayload,
    machineName: 'MT-100',
    productions: [{ ...basePayload.productions[0], machineName: 'MT-100' }]
  }, context);
}, /Nenhuma produtividade ativa encontrada para 4,2 Reto - 12m para MT-100 \/ 1 pessoa\(s\)/);

const skipped = buildPlan({
  ...basePayload,
  skipProductionMaterials: [{ productionIndex: 0, materialId: 2 }]
}, context);
assert.equal(skipped.operations.length, 0, 'sem a bobina, toda cadeia consumidora sai do calendario');
assert.equal(skipped.calendarOperations.length, 0, 'calendario tambem fica vazio quando a cadeia e cortada');
assert.ok(!skipped.operations.some(operation => String(operation.materialId) === '2'), 'cadeia intermediaria marcada como nao produzir sai do calendario');

const realChainMaterials = [
  { id: 138, name: 'Q-138 (6,0x2,45)', codes: ['Q-138'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 113, name: 'Q-113', codes: ['Q-113'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 61, name: '6,0 Longitudinal - 2,45m', codes: ['LONG-60'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 62, name: '6,0 Transversal - 2,45m', codes: ['TRANS-60'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 42, name: 'CA60 4,2 Bobina', codes: ['CA60-42'], primary_unit: 'kg', is_initial_raw_material: false },
  { id: 71, name: '3,8 Longitudinal - 6m', codes: ['LONG-38'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 72, name: '3,8 Transversal - 2,45m', codes: ['TRANS-38'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 38, name: 'CA60 3,8 Bobina', codes: ['CA60-38'], primary_unit: 'kg', is_initial_raw_material: false },
  { id: 55, name: 'Fio Maquina 5,5', codes: ['FM-55'], primary_unit: 'kg', is_initial_raw_material: true },
  { id: 65, name: 'Fio Maquina 6,5', codes: ['FM-65'], primary_unit: 'kg', is_initial_raw_material: true },
  { id: 900, name: 'Produto Independente', codes: ['INDEP'], primary_unit: 'un', is_initial_raw_material: false },
  { id: 901, name: 'Insumo Independente', codes: ['RAW-INDEP'], primary_unit: 'un', is_initial_raw_material: true }
];

const realChainMaterialsById = new Map(realChainMaterials.map(material => [String(material.id), material]));
const realChainInputsByMaterialId = new Map([
  ['138', [
    { material_id: 138, input_material_id: 61, qty_per_output: 2, production_model_name: 'Padrao' },
    { material_id: 138, input_material_id: 62, qty_per_output: 3, production_model_name: 'Padrao' }
  ]],
  ['113', [
    { material_id: 113, input_material_id: 71, qty_per_output: 1, production_model_name: 'Padrao' },
    { material_id: 113, input_material_id: 72, qty_per_output: 1, production_model_name: 'Padrao' }
  ]],
  ['61', [
    { material_id: 61, input_material_id: 42, qty_per_output: 1, production_model_name: 'Padrao' }
  ]],
  ['62', [
    { material_id: 62, input_material_id: 42, qty_per_output: 1, production_model_name: 'Padrao' }
  ]],
  ['71', [
    { material_id: 71, input_material_id: 38, qty_per_output: 1, production_model_name: 'Padrao' }
  ]],
  ['72', [
    { material_id: 72, input_material_id: 38, qty_per_output: 1, production_model_name: 'Padrao' }
  ]],
  ['42', [
    { material_id: 42, input_material_id: 55, qty_per_output: 1.3, production_model_name: 'Fio Maquina 5,5' },
    { material_id: 42, input_material_id: 65, qty_per_output: 1.3, production_model_name: 'Fio Maquina 6,5' }
  ]],
  ['38', [
    { material_id: 38, input_material_id: 55, qty_per_output: 1.3, production_model_name: 'Fio Maquina 5,5' },
    { material_id: 38, input_material_id: 65, qty_per_output: 1.3, production_model_name: 'Fio Maquina 6,5' }
  ]],
  ['900', [
    { material_id: 900, input_material_id: 901, qty_per_output: 1, production_model_name: 'Padrao' }
  ]]
]);

const realChainMatrixRows = [
  { material_code: 'Q-138', material_codes: ['Q-138'], material_name: 'Q-138 (6,0x2,45)', machine_name: 'MT-100', machine_priority: 1, people_count: 2, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'Q-113', material_codes: ['Q-113'], material_name: 'Q-113', machine_name: 'MT-100', machine_priority: 1, people_count: 2, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'LONG-60', material_codes: ['LONG-60'], material_name: '6,0 Longitudinal - 2,45m', machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'TRANS-60', material_codes: ['TRANS-60'], material_name: '6,0 Transversal - 2,45m', machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'CA60-42', material_codes: ['CA60-42'], material_name: 'CA60 4,2 Bobina', machine_name: 'Trefila', machine_priority: 1, people_count: 1, output_qty: 7000, output_unit: 'kg', time_seconds: 28800, active: true },
  { material_code: 'LONG-38', material_codes: ['LONG-38'], material_name: '3,8 Longitudinal - 6m', machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'TRANS-38', material_codes: ['TRANS-38'], material_name: '3,8 Transversal - 2,45m', machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true },
  { material_code: 'CA60-38', material_codes: ['CA60-38'], material_name: 'CA60 3,8 Bobina', machine_name: 'Trefila', machine_priority: 1, people_count: 1, output_qty: 7000, output_unit: 'kg', time_seconds: 28800, active: true },
  { material_code: 'INDEP', material_codes: ['INDEP'], material_name: 'Produto Independente', machine_name: 'P1', machine_priority: 1, people_count: 1, output_qty: 1000, output_unit: 'un', time_seconds: 28800, active: true }
];

const realChainPayload = {
  planningStartDate: '2026-07-24',
  shifts: [{ label: 'Turno 1', shiftStartTime: '07:00', shiftEndTime: '15:00', hoursPerDay: 8, teamAvailable: 6 }],
  productions: [
    { materialId: 138, plannedQty: 100, machineName: 'MT-100', peopleCount: 2, productionModelName: 'Padrao' },
    { materialId: 113, plannedQty: 100, machineName: 'MT-100', peopleCount: 2, productionModelName: 'Padrao' },
    { materialId: 900, plannedQty: 50, machineName: 'P1', peopleCount: 1, productionModelName: 'Padrao' }
  ]
};

const realChainContext = {
  material: realChainMaterialsById.get('138'),
  materials: realChainMaterials,
  materialsById: realChainMaterialsById,
  inputsByMaterialId: realChainInputsByMaterialId,
  matrixRows: realChainMatrixRows,
  stockRows: [
    { product_code: 'FM-55', fiscal_balance_unit: 0, error_balance_unit: 0 },
    { product_code: 'FM-65', fiscal_balance_unit: 1000, error_balance_unit: 0 },
    { product_code: 'RAW-INDEP', fiscal_balance_unit: 1000, error_balance_unit: 0 }
  ],
  correctionRows: [],
  existingOperations: []
};

function nodeByMaterial(node, materialId) {
  if (!node || typeof node !== 'object') return null;
  if (String(node.materialId) === String(materialId)) return node;
  for (const child of node.children || []) {
    const found = nodeByMaterial(child, materialId);
    if (found) return found;
  }
  return null;
}

const firstSimulation = buildPlan(realChainPayload, realChainContext);
assert.equal(firstSimulation.operations.length > 0, true, 'primeira simulacao ainda monta a arvore produtiva');
assert.equal(firstSimulation.calendarOperations.length, 1, 'antes da decisao so a producao independente deve chegar ao calendario');
assert.equal(firstSimulation.calendarOperations[0].materialName, 'Produto Independente');
assert.ok(firstSimulation.diagnostics.errors.some(issue =>
  String(issue.componentMaterialId) === '55'
  && issue.componentMaterialName === 'Fio Maquina 5,5'
), 'falta ativa antes da decisao deve apontar o Fio Maquina 5,5');
assert.equal(nodeByMaterial(firstSimulation.tree.children[0], 42).productionModelName, 'Fio Maquina 5,5');
assert.equal(nodeByMaterial(firstSimulation.tree.children[0], 55).requiredQty, 650);

const swapped = buildPlan({
  ...realChainPayload,
    operationOverrides: {
      '0:42': { productionModelName: 'Fio Maquina 6,5' },
      '1:38': { productionModelName: 'Fio Maquina 6,5' }
    }
  }, realChainContext);
assert.equal(nodeByMaterial(swapped.tree.children[0], 42).productionModelName, 'Fio Maquina 6,5');
assert.equal(nodeByMaterial(swapped.tree.children[0], 55), null, 'arvore de Q-138 nao deve continuar usando Fio Maquina 5,5 apos troca');
assert.equal(nodeByMaterial(swapped.tree.children[0], 65).requiredQty, 650);
assert.equal(nodeByMaterial(swapped.tree.children[1], 38).productionModelName, 'Fio Maquina 6,5');
assert.equal(nodeByMaterial(swapped.tree.children[1], 55), null, 'arvore de Q-113 nao deve continuar usando Fio Maquina 5,5 apos troca');
assert.ok(!swapped.diagnostics.errors.some(issue =>
  String(issue.componentMaterialId) === '55'
), 'blocker ativo do insumo antigo deve desaparecer apos troca de modelo');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '42'), true, 'CA60 4,2 Bobina resolvida deve gerar calendarOperations');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '38'), true, 'CA60 3,8 Bobina resolvida deve gerar calendarOperations');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '62'), true, 'Transversal de Q-138 deve ser programada quando a cadeia fica produzivel');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '72'), true, 'Transversal de Q-113 deve ser programada quando a cadeia fica produzivel');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '138'), true, 'Q-138 deve ser programada quando a cadeia fica produzivel');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '113'), true, 'Q-113 deve ser programada quando a cadeia fica produzivel');
assert.equal(swapped.calendarOperations.some(operation => String(operation.materialId) === '900'), true, 'producao independente nunca pode desaparecer');
assert.equal(swapped.calendarOperations
  .filter(operation => operation.materialName === '6,0 Transversal - 2,45m')
  .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 300);
assert.equal(swapped.calendarOperations
  .filter(operation => operation.materialName === '3,8 Transversal - 2,45m')
  .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 100);
assert.equal(swapped.calendarOperations
  .filter(operation => operation.materialName === 'Q-138 (6,0x2,45)')
  .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 100);
assert.equal(swapped.calendarOperations
  .filter(operation => operation.materialName === 'Q-113')
  .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 100);

const cut = buildPlan({
  ...realChainPayload,
  skipProductionMaterials: [{ productionIndex: 0, materialId: 42 }]
}, realChainContext);
assert.equal(cut.calendarOperations.some(operation => Number(operation.productionIndex) === 0), false, 'cadeia cortada fica pendente fora do calendario');
assert.equal(cut.calendarOperations.some(operation => Number(operation.productionIndex) === 1), false, 'outra producao que depende do mesmo insumo sem decisao continua bloqueada');
assert.equal(cut.calendarOperations.some(operation => Number(operation.productionIndex) === 2), true, 'producao independente deve continuar programada quando uma cadeia e cortada');

console.log('planningProductionDecisions.service.test.js ok');

