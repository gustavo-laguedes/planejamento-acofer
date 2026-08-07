import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  productivityCatalogGroupKey,
  productivityRowsForCatalogGroup,
  summarizeProductivityCatalog
} from '../services/productivityMatrixCatalog.service.js';

const materials = [
  { id: 65, name: '3,4 Longitudinal - 3m', codes: ['00808700065'], primary_unit: 'un', active: true },
  { id: 80, name: 'Aço-8', codes: ['00808700080', '00808700065'], primary_unit: 'un', active: true },
  { id: 90, name: 'Material homônimo', codes: ['HOMO-A'], primary_unit: 'un', active: true },
  { id: 91, name: 'Material homônimo', codes: ['HOMO-B'], primary_unit: 'un', active: true }
];

const longitudinalRows = [
  { id: '1', material_name: '3,4 Longitudinal - 3m', material_code: '00808700065', material_codes: ['00808700065'], machine_name: 'EC-125', machine_priority: 1, people_count: 1, output_qty: 8490, output_unit: 'un', active: true },
  { id: '5', material_name: '3,4 Longitudinal - 3m', material_code: '00808700065', material_codes: ['00808700065'], machine_name: 'EC-60', machine_priority: 2, people_count: 1, output_qty: 2830, output_unit: 'un', active: true }
];
const relatedOtherMaterial = {
  id: '8', material_name: 'Aço-8', material_code: '00808700080',
  material_codes: ['00808700080', '00808700065'], machine_name: 'Aço-8',
  machine_priority: 1, people_count: 1, output_qty: 9259, output_unit: 'un', active: true
};

const matrix = [
  ...longitudinalRows,
  relatedOtherMaterial,
  { id: '9', material_name: 'Material homônimo', material_code: 'HOMO-A', material_codes: ['HOMO-A'], machine_name: 'M-A', machine_priority: 1, people_count: 1, output_qty: 100, active: true },
  { id: '10', material_name: 'Material homônimo', material_code: 'HOMO-B', material_codes: ['HOMO-B'], machine_name: 'M-B', machine_priority: 1, people_count: 1, output_qty: 200, active: true },
  { id: '11', material_name: 'Material homônimo similar', material_code: 'HOMO-A', material_codes: ['HOMO-A'], machine_name: 'M-C', machine_priority: 1, people_count: 1, output_qty: 300, active: true }
];

const summaries = summarizeProductivityCatalog({ materials, productivityMatrix: matrix });
const longitudinal = summaries.find(summary => summary.material_name === '3,4 Longitudinal - 3m');
assert.ok(longitudinal);
assert.equal(longitudinal.line_count, 2, 'duas linhas com mesmo nome e código formam um grupo');
assert.deepEqual(longitudinal.machines, ['EC-125', 'EC-60'], 'o grupo contém somente as máquinas persistidas');
assert.equal(longitudinal.max_output_qty, 8490);
assert.equal(longitudinal.catalog_material_id, 65);

const openedLines = productivityRowsForCatalogGroup({
  groupKey: longitudinal.material_key,
  materials,
  productivityMatrix: matrix
});
assert.deepEqual(openedLines.map(row => row.id), ['1', '5'], 'o modal recebe somente IDs do grupo selecionado');
assert.deepEqual(openedLines.map(row => row.machine_name), ['EC-125', 'EC-60']);
assert.equal(openedLines.some(row => row.machine_name === 'Aço-8'), false, 'código relacionado não incorpora outro material');
assert.equal(openedLines.length > 0, true, 'grupo real não deve cair na criação de linha padrão');

const homonymSummaries = summaries.filter(summary => summary.material_name === 'Material homônimo');
assert.equal(homonymSummaries.length, 2, 'homônimos com códigos principais diferentes permanecem separados');
assert.deepEqual(homonymSummaries.map(summary => summary.machines).sort(), [['M-A'], ['M-B']]);
assert.notEqual(
  productivityCatalogGroupKey(matrix[3], materials),
  productivityCatalogGroupKey(matrix[5], materials),
  'nomes semelhantes não se misturam nem mesmo quando o código principal coincide'
);

const pageSource = readFileSync(new URL('../pages/ProductivityMatrixPage.js', import.meta.url), 'utf8');
assert.doesNotMatch(pageSource, /productivityMatrixResolution\.service\.js|resolveProductivityMaterial|summarizeProductivityMatrix/);
assert.match(pageSource, /productivityRowsForCatalogGroup\(\{ groupKey: materialKey, materials, productivityMatrix: rows \}\)/);
assert.match(pageSource, /renderLines\(groupLines\)/, 'linhas reais são entregues ao modal sem fallback operacional');
assert.match(pageSource, /api\(item\.id \? `\/productivity\/\$\{item\.id\}` : '\/productivity'/, 'PUT usa somente o ID da própria linha');
assert.match(pageSource, /deletedLineIds\.map\(id => api\(`\/productivity\/\$\{id\}`/, 'DELETE desativa somente IDs removidos no modal');

console.log('productivityMatrixCatalog.service.test.js: ok');
