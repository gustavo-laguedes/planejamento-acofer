import assert from 'node:assert/strict';
import { buildPlan } from '../services/planning.service.js';

const shifts = [{
  shiftId: 'day',
  label: 'Turno 1',
  hoursPerDay: '8,48',
  shiftStartTime: '07:00',
  shiftEndTime: '15:48',
  teamAvailable: 10
}];

function material(id, name, code) {
  return { id, name, codes: [code], primary_unit: 'kg', is_initial_raw_material: false };
}

function matrix(materialCode, materialName, machineName, peopleCount, outputQty) {
  return {
    material_code: materialCode,
    material_codes: [materialCode],
    material_name: materialName,
    machine_name: machineName,
    machine_priority: 1,
    people_count: peopleCount,
    output_qty: outputQty,
    output_unit: 'kg',
    time_seconds: 31680,
    active: true
  };
}

function simulateMachine({ quantities, machines }) {
  const materials = [
    material(1, 'A', 'A'),
    material(2, 'B', 'B')
  ];
  return buildPlan({
    planningStartDate: '2026-09-10',
    productions: [
      { materialId: 1, plannedQty: quantities[0] },
      { materialId: 2, plannedQty: quantities[1] }
    ],
    shifts
  }, {
    material: materials[0],
    materials,
    materialsById: new Map(materials.map(item => [String(item.id), item])),
    inputsByMaterialId: new Map(),
    matrixRows: [
      matrix('A', 'A', machines[0], 1, 100),
      matrix('B', 'B', machines[1], 1, 100)
    ],
    stockRows: [],
    correctionRows: [],
    existingOperations: []
  });
}

function simulateTrefilaBrowserRegression() {
  const materials = [
    material(42, 'CA60 4,2 Bobina', 'CA60-42'),
    material(38, 'CA60 3,8 Bobina', 'CA60-38')
  ];
  return buildPlan({
    planningStartDate: '2026-09-10',
    productions: [
      { materialId: 42, plannedQty: 7000 },
      { materialId: 38, plannedQty: 3185.08 }
    ],
    shifts
  }, {
    material: materials[0],
    materials,
    materialsById: new Map(materials.map(item => [String(item.id), item])),
    inputsByMaterialId: new Map(),
    matrixRows: [
      matrix('CA60-42', 'CA60 4,2 Bobina', 'Trefila', 1, 7000),
      matrix('CA60-38', 'CA60 3,8 Bobina', 'Trefila', 1, 7000)
    ],
    stockRows: [],
    correctionRows: [],
    existingOperations: []
  });
}

function simulateDependencyPropagation() {
  const materials = [
    material(1, 'A1', 'A1'),
    material(2, 'A2', 'A2'),
    material(3, 'A3', 'A3'),
    { id: 10, name: 'Raiz', codes: ['RAW'], primary_unit: 'kg', is_initial_raw_material: true }
  ];
  return buildPlan({
    planningStartDate: '2026-09-10',
    productions: [
      { materialId: 3, plannedQty: 50 }
    ],
    shifts
  }, {
    material: materials[0],
    materials,
    materialsById: new Map(materials.map(item => [String(item.id), item])),
    inputsByMaterialId: new Map([
      ['1', [{ material_id: 1, input_material_id: 10, qty_per_output: 1, production_model_name: 'Padrao' }]],
      ['2', [{ material_id: 2, input_material_id: 1, qty_per_output: 1, production_model_name: 'Padrao' }]],
      ['3', [{ material_id: 3, input_material_id: 2, qty_per_output: 1, production_model_name: 'Padrao' }]]
    ]),
    matrixRows: [
      matrix('A1', 'A1', 'M-A1', 1, 100),
      matrix('A2', 'A2', 'M-A2', 1, 100),
      matrix('A3', 'A3', 'M-A3', 1, 100)
    ],
    stockRows: [{ product_code: 'RAW', fiscal_balance_unit: 10000, error_balance_unit: 0 }],
    correctionRows: [],
    existingOperations: [{
      operationId: 'block-a2',
      materialId: 'block-a2',
      materialName: 'Bloqueio A2',
      machineName: 'M-A2',
      peopleCount: 0,
      startDate: '2026-09-11',
      startTime: '07:00',
      endDate: '2026-09-11',
      endTime: '15:48'
    }]
  });
}

function operationsOn(result, date, machineName) {
  return result.calendarOperations.filter(operation =>
    operation.startDate === date
    && operation.machineName === machineName
  );
}

function minutes(time) {
  const [hour, minute] = String(time).split(':').map(Number);
  return (hour * 60) + minute;
}

function assertNoMachineOverlap(result) {
  const byMachineDate = new Map();
  result.calendarOperations.forEach(operation => {
    const key = `${operation.machineName}\u0000${operation.startDate}`;
    if (!byMachineDate.has(key)) byMachineDate.set(key, []);
    byMachineDate.get(key).push(operation);
  });
  byMachineDate.forEach(operations => {
    const ordered = [...operations].sort((left, right) => minutes(left.startTime) - minutes(right.startTime));
    for (let index = 1; index < ordered.length; index += 1) {
      assert.ok(
        minutes(ordered[index - 1].endTime) <= minutes(ordered[index].startTime),
        `${ordered[index - 1].materialName} e ${ordered[index].materialName} nao podem sobrepor a mesma maquina`
      );
    }
  });
}

{
  const result = simulateMachine({ quantities: [100, 45.5], machines: ['Trefila', 'Trefila'] });
  assert.equal(operationsOn(result, '2026-09-10', 'Trefila').length, 1, '100% + 45,5% nao cabem na mesma maquina/dia');
  assert.equal(result.calendarOperations.find(operation => operation.materialName === 'B').startDate, '2026-09-11');
  assertNoMachineOverlap(result);
}

{
  const result = simulateTrefilaBrowserRegression();
  const firstDay = operationsOn(result, '2026-09-10', 'Trefila');
  assert.deepEqual(firstDay.map(operation => [operation.materialName, operation.quantity, operation.capacityPercent]), [
    ['CA60 4,2 Bobina', 7000, 100]
  ]);
  const displaced = result.calendarOperations.find(operation => operation.materialName === 'CA60 3,8 Bobina');
  assert.equal(displaced.startDate, '2026-09-11', 'CA60 3,8 Bobina deve perder o slot quando Trefila ja esta 100% ocupada');
  assert.equal(displaced.quantity, 3185.08);
  assert.equal(displaced.capacityPercent, 45.5);
  assertNoMachineOverlap(result);
}

{
  const result = simulateMachine({ quantities: [40, 50], machines: ['Trefila', 'Trefila'] });
  const day = operationsOn(result, '2026-09-10', 'Trefila');
  assert.equal(day.length, 2, '40% + 50% cabem sequencialmente na mesma maquina/dia');
  assert.equal(day[1].startTime, day[0].endTime);
  assertNoMachineOverlap(result);
}

{
  const result = simulateMachine({ quantities: [60, 50], machines: ['Trefila', 'Trefila'] });
  assert.equal(operationsOn(result, '2026-09-10', 'Trefila').length, 1, '60% + 50% nao cabem na mesma maquina/dia');
  assert.equal(result.calendarOperations.find(operation => operation.materialName === 'B').startDate, '2026-09-11');
  assertNoMachineOverlap(result);
}

{
  const result = simulateMachine({ quantities: [100, 100], machines: ['Trefila', 'EC-125'] });
  assert.equal(result.calendarOperations.find(operation => operation.materialName === 'A').startDate, '2026-09-10');
  assert.equal(result.calendarOperations.find(operation => operation.materialName === 'B').startDate, '2026-09-10');
  assertNoMachineOverlap(result);
}

{
  const result = simulateDependencyPropagation();
  const a1 = result.calendarOperations.find(operation => operation.materialName === 'A1');
  const a2 = result.calendarOperations.find(operation => operation.materialName === 'A2');
  const a3 = result.calendarOperations.find(operation => operation.materialName === 'A3');
  assert.equal(a1.startDate, '2026-09-10', 'A1 predecessor ja concluido deve permanecer');
  assert.ok(a2.startDate > '2026-09-11', 'A2 deve perder o slot e procurar proxima data valida');
  assert.ok(a3.startDate > a2.startDate, 'A3 sucessor deve ser revalidado e deslocado para frente');
  assertNoMachineOverlap(result);
}

console.log('planningAutomaticResourceCapacity.service.test.js: ok');
