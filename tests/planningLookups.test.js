import assert from 'node:assert/strict';
import {
  findMaterialById,
  materialMatchesSearch,
  selectMatchingMatrixRows,
  selectProductionMaterialOptions
} from '../shared/planning-domain/planningLookups.js';

const materialA = {
  id: 10,
  name: 'Chapa A',
  codes: ['CHA-10'],
  production_models: [
    { name: 'corte', inputMaterials: [{ materialId: 20 }] },
    { name: 'dobra', inputMaterials: [{ materialId: 30 }] }
  ]
};
const materialB = {
  id: '10',
  name: 'Chapa A duplicada',
  codes: ['DUP-10'],
  production_models: []
};
const materialC = {
  id: 20,
  name: 'Bobina B',
  codes: ['BOB-20'],
  production_models: [
    { name: 'bobina-modelo', inputMaterials: [{ materialId: 40 }] }
  ]
};
const materialD = {
  id: 30,
  name: 'Barra C',
  codes: ['BAR-30'],
  production_models: []
};
const materialE = {
  id: 40,
  name: 'Minerio D',
  codes: ['MIN-40'],
  production_models: []
};
const materials = [materialA, materialB, materialC, materialD, materialE];

function assertThrowsTypeError(action) {
  assert.throws(action, TypeError);
}

assert.equal(findMaterialById(materials, 10), materialA);
assert.equal(findMaterialById(materials, '10'), materialA);
assert.equal(findMaterialById(materials, 999), undefined);
assert.equal(findMaterialById([], 10), undefined);
assertThrowsTypeError(() => findMaterialById(undefined, 10));
const materialWithoutId = { name: 'sem id' };
assert.equal(findMaterialById([materialWithoutId], undefined), materialWithoutId);

const matrixRows = [
  { id: 'inactive', active: false, material_name: 'Chapa A', material_codes: ['CHA-10'], priority: 0, seconds_per_unit: 1 },
  { id: 'slow', active: true, material_name: 'Chapa A', material_codes: [], priority: 2, seconds_per_unit: 30 },
  { id: 'first-priority', active: true, material_name: 'Outro', material_codes: ['cha-10'], priority: 1, seconds_per_unit: 60 },
  { id: 'first-faster', active: true, material_name: 'Chapa A', material_codes: [], priority: 1, seconds_per_unit: 20 },
  { id: 'missing-codes', active: true, material_name: 'Outro', material_codes: [] }
];
const selectedRows = selectMatchingMatrixRows(matrixRows, materialA);
assert.deepEqual(selectedRows.map(row => row.id), ['first-faster', 'first-priority', 'slow']);
assert.equal(selectedRows[0], matrixRows[3]);
assert.equal(selectMatchingMatrixRows([], materialA).length, 0);
assert.equal(selectMatchingMatrixRows(matrixRows, null).length, 0);
assertThrowsTypeError(() => selectMatchingMatrixRows(undefined, materialA));

const customRows = [
  { id: 'a', active: true, material_name: 'Chapa A', material_codes: [], order: 2 },
  { id: 'b', active: true, material_name: 'Chapa A', material_codes: [], order: 1 }
];
assert.deepEqual(
  selectMatchingMatrixRows(customRows, materialA, {
    getPriority: row => row.order,
    getSecondsPerUnit: () => 0
  }).map(row => row.id),
  ['b', 'a']
);

assert.deepEqual(selectProductionMaterialOptions(materials, {
  materialId: 10,
  productionModelName: 'dobra'
}), [materialA, materialD]);
assert.deepEqual(selectProductionMaterialOptions(materials, {
  materialId: 10,
  productionModelName: 'corte'
}), [materialA, materialC, materialE]);
assert.deepEqual(selectProductionMaterialOptions(materials, { materialId: 999 }), []);
assert.deepEqual(selectProductionMaterialOptions([], { materialId: 10 }), []);
assertThrowsTypeError(() => selectProductionMaterialOptions(undefined, { materialId: 10 }));
assertThrowsTypeError(() => selectProductionMaterialOptions(materials, undefined));

const cyclicMaterials = [
  {
    id: 'root',
    name: 'Raiz',
    codes: [],
    production_models: [{ name: 'modelo', inputMaterials: [{ materialId: 'child' }] }]
  },
  {
    id: 'child',
    name: 'Filho',
    codes: [],
    production_models: [{ name: 'volta', inputMaterials: [{ materialId: 'root' }] }]
  }
];
assert.deepEqual(
  selectProductionMaterialOptions(cyclicMaterials, { materialId: 'root', productionModelName: 'modelo' }),
  cyclicMaterials
);

assert.equal(materialMatchesSearch({ name: 'Chapa A', codes: ['CHA-10'] }, 'cha'), true);
assert.equal(materialMatchesSearch({ name: 'Chapa A', codes: ['CHA-10'] }, '10'), true);
assert.equal(materialMatchesSearch({ name: 'Chapa A', codes: ['CHA-10'] }, 'bob'), false);
assert.equal(materialMatchesSearch({ name: null, codes: [null, 'ABC'] }, 'ab'), true);
assertThrowsTypeError(() => materialMatchesSearch(undefined, 'ab'));
assert.equal(materialMatchesSearch({ name: 'Sem codes' }, 'sem'), true);

console.log('planningLookups.test.js ok');
