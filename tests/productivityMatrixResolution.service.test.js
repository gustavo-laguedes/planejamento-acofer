import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveMaterialProductivityLines,
  resolveProductivityConfiguration,
  resolveProductivityMaterial,
  summarizeProductivityMatrix
} from '../services/productivityMatrixResolution.service.js';

const materials = [
  { id: 'EQ45', name: 'EQ-45 (3,0x2,0)', codes: ['00808500036', '00808500037'], primary_unit: 'un' },
  { id: 'LONG34', name: '3,4 Longitudinal - 3m', codes: ['LONG-34'], primary_unit: 'un' }
];
const matrix = [
  { id: 1, material_codes: ['00808500036', '00808500037'], material_name: 'EQ-45 (3,0x2,0)', machine_name: 'MT-200', machine_priority: 1, people_count: 3, output_qty: 960, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 2, material_codes: ['00808500036', '00808500037'], material_name: 'EQ-45 (3,0x2,0)', machine_name: 'MT-200', machine_priority: 2, people_count: 2, output_qty: 689, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 3, material_codes: ['00808500036', '00808500037'], material_name: 'EQ-45 (3,0x2,0)', machine_name: 'MT-200', machine_priority: 3, people_count: 1, output_qty: 434, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 4, material_code: 'LONG-34', material_codes: ['LONG-34'], material_name: '3,4 Longitudinal - 3m', machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 8490, output_unit: 'un', time_seconds: 86400, active: true },
  { id: 5, material_code: 'LONG-34', material_codes: ['LONG-34'], material_name: '3,4 Longitudinal - 3m', machine_name: 'EC-60', machine_priority: 2, people_count: 2, output_qty: 7000, output_unit: 'un', time_seconds: 86400, active: true }
];

const materialFromSecondaryCode = resolveProductivityMaterial({
  reference: { materialCode: '00808500037' },
  materials
});
assert.equal(materialFromSecondaryCode.id, 'EQ45');

const idPreferredRows = resolveMaterialProductivityLines({
  material: { id: 'A', codes: ['SHARED'] },
  productivityMatrix: [
    { ...matrix[0], id: 101, material_id: 'A', material_codes: ['SHARED'] },
    { ...matrix[0], id: 102, material_id: 'B', material_codes: ['SHARED'] }
  ]
});
assert.deepEqual(idPreferredRows.map(row => row.material_id), ['A'], 'material_id confiável deve preceder códigos compartilhados');

const eq45Lines = resolveMaterialProductivityLines({
  material: materialFromSecondaryCode,
  reference: { materialCode: '00808500037' },
  productivityMatrix: matrix
});
assert.deepEqual(eq45Lines.map(row => row.people_count), [3, 2, 1]);
assert.deepEqual(eq45Lines.map(row => row.output_qty), [960, 689, 434]);
assert.equal(resolveProductivityConfiguration({ productivityRows: eq45Lines, machineName: 'MT-200', peopleCount: 3 }).output_qty, 960);
assert.equal(resolveProductivityConfiguration({ productivityRows: eq45Lines, machineName: 'MT-200', peopleCount: 2 }).output_qty, 689);
assert.equal(resolveProductivityConfiguration({ productivityRows: eq45Lines, machineName: 'MT-200', peopleCount: 1 }).output_qty, 434);

const longitudinalLines = resolveMaterialProductivityLines({
  material: materials[1],
  productivityMatrix: matrix
});
assert.deepEqual(longitudinalLines.map(row => row.machine_name), ['EC-125', 'EC-60']);
assert.equal(resolveProductivityConfiguration({ productivityRows: longitudinalLines, machineName: 'EC-125', peopleCount: 1 }).output_qty, 8490);
assert.equal(resolveProductivityConfiguration({ productivityRows: longitudinalLines, machineName: 'EC-60', peopleCount: 2 }).output_qty, 7000);

const reto42Rows = resolveMaterialProductivityLines({
  material: {
    materialId: '40',
    materialCode: '00808700091',
    materialCodes: ['00808700091'],
    materialName: '4,2 Reto - 12m'
  },
  reference: {
    materialId: '40',
    materialCode: '00808700091',
    materialCodes: ['00808700091'],
    materialName: '4,2 Reto - 12m'
  },
  productivityMatrix: [
    { id: 'wrong-bobina', material_id: '40', material_code: '00808700093', material_codes: ['00808700093'], material_name: 'CA60 4,2 Bobina', machine_name: 'Trefila', people_count: 1, output_qty: 7000, output_unit: 'un', time_seconds: 31680, active: true },
    { id: 'reto-aco8', material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Aço-8', people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680, active: true },
    { id: 'reto-focus8', material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Focus-8', people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680, active: true }
  ],
  unit: 'un'
});
assert.deepEqual(reto42Rows.map(row => row.id).sort(), ['reto-aco8', 'reto-focus8']);
assert.equal(resolveProductivityConfiguration({
  productivityRows: reto42Rows,
  machine: { machineId: 'focus8', machineName: 'Focus 8' },
  machineId: 'focus8',
  peopleCount: 1
}).id, 'reto-focus8');

const duplicatePeople = [
  { ...matrix[1], id: 20, machine_priority: 3, output_qty: 600 },
  { ...matrix[1], id: 21, machine_priority: 1, output_qty: 700 }
];
assert.equal(
  resolveProductivityConfiguration({ productivityRows: duplicatePeople, machineName: 'MT-200', peopleCount: 2 }).id,
  21,
  'prioridade define preferência, sem excluir configurações secundárias'
);

const summaries = summarizeProductivityMatrix({ materials, productivityMatrix: matrix });
const eq45Summary = summaries.find(row => row.material_key === 'EQ45');
const longitudinalSummary = summaries.find(row => row.material_key === 'LONG34');
assert.equal(eq45Summary.line_count, 3);
assert.deepEqual(eq45Summary.machines, ['MT-200']);
assert.equal(eq45Summary.max_output_qty, 960);
assert.equal(longitudinalSummary.line_count, 2);
assert.deepEqual(longitudinalSummary.machines, ['EC-125', 'EC-60']);
assert.equal(longitudinalSummary.max_output_qty, 8490);

const routeSource = readFileSync(new URL('../server/routes/productivity.routes.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../pages/ProductivityMatrixPage.js', import.meta.url), 'utf8');
const planningPageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
assert.doesNotMatch(routeSource, /DISTINCT ON|LIMIT\s+1/i, 'a rota deve entregar todas as linhas ativas');
assert.match(routeSource, /ORDER BY material_name, machine_priority, machine_name, people_count/);
assert.doesNotMatch(pageSource, /productivityMatrixResolution\.service\.js|summarizeProductivityMatrix/, 'a tela cadastral não deve usar o resolvedor operacional');
assert.doesNotMatch(planningPageSource, /productivityMatrix:\s*productivityRows/);

console.log('productivityMatrixResolution.service.test.js: ok');
