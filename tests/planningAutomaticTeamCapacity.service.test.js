import assert from 'node:assert/strict';
import { buildPlan } from '../services/planning.service.js';

const shift = teamAvailable => [{
  shiftId: 'day',
  label: 'Turno 1',
  hoursPerDay: '8,48',
  shiftStartTime: '07:00',
  shiftEndTime: '15:48',
  teamAvailable
}];

function material(id, name, code) {
  return { id, name, codes: [code], primary_unit: 'un', is_initial_raw_material: false };
}

function matrix(materialCode, materialName, machineName, peopleCount, outputQty = 1000) {
  return {
    material_code: materialCode,
    material_codes: [materialCode],
    material_name: materialName,
    machine_name: machineName,
    machine_priority: 1,
    people_count: peopleCount,
    output_qty: outputQty,
    output_unit: 'un',
    time_seconds: 31680,
    active: true
  };
}

function simulateTeam({
  teamAvailable,
  existingPeople = 1,
  existingQty = 100,
  existingOutputQty = 1000,
  candidatePeople,
  candidateQty = 100,
  candidateOutputQty = 1000
}) {
  const materials = [
    material(1, 'Existente 1 pessoa', 'EXISTING'),
    material(2, `Candidate ${candidatePeople} pessoas`, 'CANDIDATE')
  ];
  const materialsById = new Map(materials.map(item => [String(item.id), item]));
  return buildPlan({
    planningStartDate: '2026-09-14',
    productions: [
      { materialId: 1, plannedQty: existingQty },
      { materialId: 2, plannedQty: candidateQty }
    ],
    shifts: shift(teamAvailable)
  }, {
    material: materials[0],
    materials,
    materialsById,
    inputsByMaterialId: new Map(),
    matrixRows: [
      matrix('EXISTING', 'Existente 1 pessoa', 'M1', existingPeople, existingOutputQty),
      matrix('CANDIDATE', `Candidate ${candidatePeople} pessoas`, 'M2', candidatePeople, candidateOutputQty)
    ],
    stockRows: [],
    correctionRows: [],
    existingOperations: []
  });
}

function byMaterial(result, name) {
  return result.calendarOperations.find(operation => operation.materialName === name);
}

function teamUsedByDate(result, date) {
  return result.calendarOperations
    .filter(operation => operation.startDate === date)
    .reduce((sum, operation) => sum + Number(operation.peopleCount || 0), 0);
}

{
  const result = simulateTeam({
    teamAvailable: 3,
    existingPeople: 1,
    existingQty: 100,
    existingOutputQty: 100,
    candidatePeople: 3,
    candidateQty: 130,
    candidateOutputQty: 220
  });
  assert.equal(byMaterial(result, 'Existente 1 pessoa').startDate, '2026-09-14');
  assert.equal(byMaterial(result, 'Candidate 3 pessoas').startDate, '2026-09-15');
  assert.equal(teamUsedByDate(result, '2026-09-14'), 1);
  assert.equal(teamUsedByDate(result, '2026-09-15'), 3);
}

{
  const result = simulateTeam({
    teamAvailable: 3,
    existingPeople: 1,
    existingQty: 100,
    existingOutputQty: 250,
    candidatePeople: 3,
    candidateQty: 100,
    candidateOutputQty: 250
  });
  const existing = byMaterial(result, 'Existente 1 pessoa');
  const candidate = byMaterial(result, 'Candidate 3 pessoas');
  assert.equal(candidate.startDate, '2026-09-14');
  assert.equal(existing.startTime, '07:00');
  assert.equal(candidate.startTime, existing.endTime);
}

{
  const result = simulateTeam({ teamAvailable: 3, candidatePeople: 2 });
  assert.equal(byMaterial(result, 'Candidate 2 pessoas').startDate, '2026-09-14');
  assert.equal(teamUsedByDate(result, '2026-09-14'), 3);
}

{
  const result = simulateTeam({ teamAvailable: 6, candidatePeople: 3 });
  assert.equal(byMaterial(result, 'Candidate 3 pessoas').startDate, '2026-09-14');
  assert.equal(teamUsedByDate(result, '2026-09-14'), 4);
}

{
  const result = simulateTeam({
    teamAvailable: 3,
    candidatePeople: 3,
    candidateQty: 130,
    candidateOutputQty: 220
  });
  const candidate = byMaterial(result, 'Candidate 3 pessoas');
  assert.equal(candidate.startDate, '2026-09-14');
  assert.equal(candidate.peopleCount, 3);
  assert.equal(candidate.capacityPercent, 59.09);
  assert.equal(candidate.quantity, 130);
}

{
  const materials = [
    material(138, 'Q-138', 'Q-138'),
    material(113, 'Q-113 (6,0x2,45)', 'Q-113'),
    material(42, '4,2 Longitudinal - 6m', 'LONG42'),
    { id: 1, name: 'Materia prima', codes: ['RAW'], primary_unit: 'un', is_initial_raw_material: true }
  ];
  const materialsById = new Map(materials.map(item => [String(item.id), item]));
  const result = buildPlan({
    planningStartDate: '2026-09-10',
    productions: [
      { materialId: 138, plannedQty: 400 },
      { materialId: 113, plannedQty: 130 }
    ],
    operationOverrides: {
      '1:42': { startDate: '2026-09-14', startTime: '07:00' }
    },
    shifts: shift(3)
  }, {
    material: materials[0],
    materials,
    materialsById,
    inputsByMaterialId: new Map([
      ['113', [{ material_id: 113, input_material_id: 42, qty_per_output: 1, production_model_name: 'Padrao' }]],
      ['42', [{ material_id: 42, input_material_id: 1, qty_per_output: 1, production_model_name: 'Padrao' }]]
    ]),
    matrixRows: [
      matrix('Q-138', 'Q-138', 'MT-100', 3, 220),
      matrix('Q-113', 'Q-113 (6,0x2,45)', 'MT-200', 3, 220),
      matrix('LONG42', '4,2 Longitudinal - 6m', 'EC-125', 1, 106.363637)
    ],
    stockRows: [{ product_code: 'RAW', fiscal_balance_unit: 100000, error_balance_unit: 0 }],
    correctionRows: [],
    existingOperations: []
  });
  const day14 = result.calendarOperations.filter(operation => operation.startDate === '2026-09-14');
  const q113 = result.calendarOperations.find(operation => operation.materialName === 'Q-113 (6,0x2,45)');
  assert.deepEqual(day14.map(operation => operation.materialName), ['4,2 Longitudinal - 6m']);
  assert.deepEqual(day14.map(operation => operation.peopleCount), [1]);
  assert.deepEqual(day14.map(operation => operation.capacityPercent), [100]);
  assert.ok(q113.startDate > '2026-09-14');
  assert.equal(q113.peopleCount, 3);
  assert.ok(!day14.some(operation => operation.materialName === 'Q-113 (6,0x2,45)'));
  assert.equal(result.calendarOperations
    .filter(operation => operation.materialName === 'Q-138')
    .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 400);
  assert.equal(result.calendarOperations
    .filter(operation => operation.materialName === '4,2 Longitudinal - 6m')
    .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 130);
  assert.equal(result.calendarOperations
    .filter(operation => operation.materialName === 'Q-113 (6,0x2,45)')
    .reduce((sum, operation) => sum + Number(operation.quantity || 0), 0), 130);
}

console.log('planningAutomaticTeamCapacity.service.test.js: ok');
