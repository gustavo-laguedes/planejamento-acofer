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

console.log('planningProductionDecisions.service.test.js ok');
