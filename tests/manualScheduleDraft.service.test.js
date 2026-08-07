import assert from 'node:assert/strict';
import {
  applyDraftMove,
  createManualScheduleDraft,
  validateManualScheduleDraft
} from '../services/manualScheduleDraft.service.js';

const machines = [
  { machineId: 'M1', machineName: 'M1' },
  { machineId: 'M2', machineName: 'M2' },
  { machineId: 'M3', machineName: 'M3' },
  { machineId: 'MT-100', machineName: 'MT-100' },
  { machineId: 'MT-200', machineName: 'MT-200' },
  { machineId: 'CAP-1', machineName: 'CAP-1' },
  { machineId: 'focus8', machineName: 'Focus-8' }
];

const matrixRows = [
  { material_name: 'CA60', material_code: 'CA60', machine_name: 'M1', people_count: 4, output_qty: 6, output_unit: 'kg', time_seconds: 31680 },
  { material_name: 'CA60', material_code: 'CA60', machine_name: 'M2', people_count: 4, output_qty: 12, output_unit: 'kg', time_seconds: 31680 },
  { material_name: 'Q-196', material_code: 'Q-196', machine_name: 'M1', people_count: 4, output_qty: 10, output_unit: 'kg', time_seconds: 31680 },
  { material_name: 'BR70', material_code: 'BR70', machine_name: 'M1', people_count: 4, output_qty: 10, output_unit: 'kg', time_seconds: 31680 },
  { material_name: 'BR70', material_code: 'BR70', machine_name: 'M2', people_count: 4, output_qty: 10, output_unit: 'kg', time_seconds: 31680 },
  { material_name: 'BR70', material_code: 'BR70', machine_name: 'M3', people_count: 4, output_qty: 10, output_unit: 'kg', time_seconds: 31680 },
  { material_id: 'CA60-6.0', machine_id: 'M1', peopleCount: 4, outputQty: 7000, outputUnit: 'KG', timeSeconds: 31680 },
  { materialId: 'CA60-5.0', machineId: 'M1', peopleCount: 4, outputQty: 7000, outputUnit: 'kg', timeSeconds: 31680 },
  { materialId: 'Q-196', machineId: 'MT-100', peopleCount: 4, outputQty: 8000, outputUnit: 'kg', timeSeconds: 31680 },
  { material_name: 'Q-196', material_code: 'OUTRO-MATERIAL', machine_name: 'MT-200', people_count: 4, output_qty: 99999, output_unit: 'kg', time_seconds: 31680 },
  { material_code: 'Q-196', machine_name: 'MT-200', people_count: 4, output_qty: 99999, output_unit: 'un', time_seconds: 31680 },
  { material_code: 'Q-196', machine_name: 'MT-200', people_count: 3, output_qty: 99999, output_unit: 'kg', time_seconds: 31680 },
  { material_id: 'CAPACITY-TEST', machine_id: 'CAP-1', people_count: 4, output_qty: 10, output_unit: 'kg', time_seconds: 31680 }
  , { id: 'wrong-reto-id', material_id: '40', material_code: '00808700093', material_codes: ['00808700093'], material_name: 'CA60 4,2 Bobina', machine_name: 'Trefila', people_count: 1, output_qty: 7000, output_unit: 'un', time_seconds: 31680 }
  , { id: 'reto42-aco8', material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Aço-8', people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680 }
  , { id: 'reto42-focus8', material_code: '00808700091', material_codes: ['00808700091'], material_name: '4,2 Reto - 12m', machine_name: 'Focus-8', people_count: 1, output_qty: 2314, output_unit: 'un', time_seconds: 31680 }
];

function allocation(overrides = {}) {
  const materialId = overrides.materialId || 'CA60';
  return {
    allocationId: overrides.allocationId,
    parentOperationId: overrides.parentOperationId || `${overrides.allocationId}:parent`,
    productionId: overrides.productionId || `production-${overrides.allocationId || '0'}`,
    materialId,
    materialCode: overrides.materialCode || materialId,
    materialName: overrides.materialName || materialId,
    machineId: overrides.machineId || 'M1',
    machineName: overrides.machineName || overrides.machineId || 'M1',
    date: overrides.date || '2026-07-16',
    startTime: '07:00',
    endTime: '16:00',
    quantity: overrides.quantity ?? 6,
    unit: overrides.unit || 'kg',
    durationMinutes: overrides.durationMinutes ?? 528,
    capacityPercent: overrides.capacityPercent ?? 100,
    maxDailyCapacity: overrides.maxDailyCapacity ?? 6,
    peopleCount: overrides.peopleCount ?? 4,
    source: 'automatic',
    pinned: false
  };
}

function draft(allocations) {
  return createManualScheduleDraft({
    planningId: 'PLAN-V2',
    baseSimulationId: 'SIM-1',
    machines,
    allocations
  });
}

function move(sourceDraft, options = {}) {
  return applyDraftMove(sourceDraft, {
    machines,
    matrixRows,
    dailyMinutes: 528,
    ...options
  });
}

function byId(sourceDraft, allocationId) {
  return sourceDraft.allocations.find(item => item.allocationId === allocationId);
}

function parentTotals(sourceDraft) {
  const totals = new Map();
  sourceDraft.allocations.forEach(item => {
    const components = item.components?.length ? item.components : [{ parentOperationId: item.parentOperationId, quantity: item.quantity }];
    components.forEach(component => {
      const key = String(component.parentOperationId);
      totals.set(key, Number(((totals.get(key) || 0) + component.quantity).toFixed(6)));
    });
  });
  return totals;
}

function assertIntegrity(result, previous) {
  const ids = result.allocations.map(item => item.allocationId);
  assert.equal(new Set(ids).size, ids.length, 'allocationId deve ser unico');
  result.allocations.forEach(item => {
    assert.ok(Number.isFinite(item.quantity) && item.quantity > 0, `${item.allocationId}: quantity positiva`);
    assert.ok(Number.isFinite(item.durationMinutes) && item.durationMinutes > 0, `${item.allocationId}: durationMinutes positiva`);
    assert.ok(Number.isFinite(item.capacityPercent), `${item.allocationId}: capacityPercent finito`);
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/, `${item.allocationId}: data valida`);
    assert.ok(Number.isFinite(new Date(`${item.date}T00:00:00`).getTime()), `${item.allocationId}: data existente`);
    assert.equal(new Set(item.sourceAllocationIds).size, item.sourceAllocationIds.length, `${item.allocationId}: rastros sem duplicacao interna`);
    assert.ok(item.components.every(component => Number.isFinite(component.quantity) && component.quantity > 0), `${item.allocationId}: componentes positivos`);
  });
  assert.deepEqual(parentTotals(result), parentTotals(previous), 'quantidade por operacao pai deve ser preservada');
  const validation = validateManualScheduleDraft(result, {
    machines,
    matrixRows,
    previousAllocations: previous.allocations
  });
  assert.deepEqual(validation, { valid: true, errors: [] });
}

function assertPinnedUnchanged(previous, result, exceptIds = []) {
  const ignored = new Set(exceptIds);
  previous.allocations.filter(item => item.pinned && !ignored.has(item.allocationId)).forEach(item => {
    const current = byId(result, item.allocationId);
    assert.ok(current, `${item.allocationId}: movimento pinned nao pode desaparecer`);
    assert.equal(current.date, item.date, `${item.allocationId}: data pinned preservada`);
    assert.equal(current.machineId, item.machineId, `${item.allocationId}: maquina pinned preservada`);
  });
}

function captureError(callback, expectedCode) {
  let captured;
  assert.throws(callback, error => {
    captured = error;
    return error.code === expectedCode;
  });
  return captured;
}

function assertRollback(source, before, error) {
  assert.equal(JSON.stringify(source), before, 'draft deve permanecer byte a byte equivalente');
  assert.equal(JSON.stringify(error.snapshot), before, 'snapshot de rollback deve ser o draft integral anterior');
  assert.equal(Object.hasOwn(error.snapshot, 'selection'), false);
  assert.equal(Object.hasOwn(error.snapshot, 'pendingAction'), false);
}

function domainResult(result) {
  return {
    allocations: result.allocations,
    dirty: result.dirty,
    lastManualAction: result.lastManualAction
  };
}

// A. Destino vazio em maquina valida.
{
  const source = draft([allocation({ allocationId: 'a1', quantity: 6 })]);
  const moved = move(source, { allocationId: 'a1', targetDate: '2026-07-17', targetMachineId: 'M2' });
  assert.equal(byId(moved, 'a1').date, '2026-07-17');
  assert.equal(byId(moved, 'a1').machineId, 'M2');
  assert.equal(byId(moved, 'a1').durationMinutes, 264);
  assert.equal(byId(moved, 'a1').capacityPercent, 50);
  assert.equal(byId(moved, 'a1').pinned, true);
}

// B. Destino vazio em maquina sem produtividade bloqueia e preserva draft.
{
  const source = draft([allocation({ allocationId: 'q1', materialId: 'Q-196', quantity: 4 })]);
  assert.throws(() => move(source, { allocationId: 'q1', targetDate: '2026-07-17', targetMachineId: 'M2' }), /produtividade cadastrada/);
  assert.equal(byId(source, 'q1').date, '2026-07-16');
  assert.equal(byId(source, 'q1').machineId, 'M1');
}

// C. Duas allocations compativeis unificam com quantidade e componentes preservados.
{
  const source = draft([
    allocation({ allocationId: 'ca5', quantity: 5, date: '2026-07-16', capacityPercent: 83.33, parentOperationId: 'op-5' }),
    allocation({ allocationId: 'ca1', quantity: 1, date: '2026-07-17', capacityPercent: 16.67, parentOperationId: 'op-1' })
  ]);
  assert.throws(() => move(source, { allocationId: 'ca1', targetDate: '2026-07-16', targetMachineId: 'M1' }), /Unificar/);
  const merged = move(source, { allocationId: 'ca1', targetDate: '2026-07-16', targetMachineId: 'M1', confirmMerge: true });
  assert.equal(merged.allocations.length, 1);
  assert.equal(merged.allocations[0].quantity, 6);
  assert.deepEqual(merged.allocations[0].sourceAllocationIds.sort(), ['ca1', 'ca5']);
  assert.deepEqual(merged.allocations[0].components.map(item => item.parentOperationId).sort(), ['op-1', 'op-5']);
}

// D. Capacidade acima de 100: cancelar, preencher/reagendar e extraordinaria.
{
  const source = draft([
    allocation({ allocationId: 'ca5', quantity: 5, date: '2026-07-16', capacityPercent: 83.33 }),
    allocation({ allocationId: 'ca2', quantity: 2, date: '2026-07-17', capacityPercent: 33.33 })
  ]);
  assert.throws(() => move(source, { allocationId: 'ca2', targetDate: '2026-07-16', targetMachineId: 'M1', confirmMerge: true }), /Capacidade/);

  const split = move(source, {
    allocationId: 'ca2',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmMerge: true,
    capacityDecision: 'split'
  });
  assert.equal(split.allocations.reduce((sum, item) => sum + item.quantity, 0), 7);
  assert.ok(split.allocations.some(item => item.date === '2026-07-16' && item.quantity === 6));
  assert.ok(split.allocations.some(item => item.date > '2026-07-16' && item.quantity === 1));

  const override = move(source, {
    allocationId: 'ca2',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmMerge: true,
    capacityDecision: 'override'
  });
  assert.equal(override.allocations.length, 1);
  assert.equal(override.allocations[0].isCapacityOverride, true);
  assert.ok(override.allocations[0].capacityPercent > 100);
}

// E. Substituicao: 6,0 ocupa o lugar do 5,0 e o ocupante e reagendado.
{
  let source = draft([
    allocation({ allocationId: 'ca6', quantity: 6, date: '2026-07-21', parentOperationId: 'op-6' }),
    allocation({ allocationId: 'br5', materialId: 'BR70', quantity: 5, date: '2026-07-16', parentOperationId: 'op-br' })
  ]);
  source = move(source, {
    allocationId: 'ca6',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmReplace: true
  });
  assert.equal(byId(source, 'ca6').date, '2026-07-16');
  assert.notEqual(byId(source, 'br5').date, '2026-07-16');

  source = move(source, { allocationId: 'br5', targetDate: '2026-07-20', targetMachineId: 'M2' });
  assert.equal(byId(source, 'ca6').date, '2026-07-16');
}

// F/G. Quatro movimentos consecutivos e drag/click_move usando mesmo dominio.
{
  let source = draft([
    allocation({ allocationId: 'm1', materialId: 'BR70', quantity: 1, date: '2026-07-10' }),
    allocation({ allocationId: 'm2', materialId: 'BR70', quantity: 2, date: '2026-07-13' }),
    allocation({ allocationId: 'm3', materialId: 'BR70', quantity: 3, date: '2026-07-14' }),
    allocation({ allocationId: 'm4', materialId: 'BR70', quantity: 4, date: '2026-07-15' })
  ]);
  for (const [allocationId, targetDate, targetMachineId] of [
    ['m1', '2026-07-20', 'M1'],
    ['m2', '2026-07-21', 'M2'],
    ['m3', '2026-07-22', 'M3'],
    ['m4', '2026-07-23', 'M1']
  ]) {
    source = move(source, { allocationId, targetDate, targetMachineId });
  }
  assert.equal(byId(source, 'm1').date, '2026-07-20');
  assert.equal(byId(source, 'm2').machineId, 'M2');
  assert.equal(byId(source, 'm3').date, '2026-07-22');
  assert.equal(byId(source, 'm4').date, '2026-07-23');

  const dragResult = move(draft([allocation({ allocationId: 'drag', materialId: 'BR70' })]), { allocationId: 'drag', targetDate: '2026-07-24', targetMachineId: 'M2' });
  const clickResult = move(draft([allocation({ allocationId: 'drag', materialId: 'BR70' })]), { allocationId: 'drag', targetDate: '2026-07-24', targetMachineId: 'M2' });
  assert.deepEqual(dragResult.allocations, clickResult.allocations);
}

// I. Rollback integral.
{
  const source = draft([allocation({ allocationId: 'ok', date: '2026-07-16' })]);
  const before = JSON.stringify(source);
  assert.throws(() => move(source, { allocationId: 'ok', targetDate: '2026-07-30', targetMachineId: 'M-inexistente' }));
  assert.equal(JSON.stringify(source), before);
}

// Missao 14.1 / 2. Q-196 nao pode usar card adaptado, produtividade copiada, nome ou unidade incompativel.
{
  const source = draft([allocation({
    allocationId: 'q-196-real',
    materialId: 'Q-196',
    machineId: 'M1',
    quantity: 4000,
    durationMinutes: 212,
    capacityPercent: 40,
    maxDailyCapacity: 10000,
    productivityOptions: [{ machineName: 'MT-200', peopleCount: 4, outputQty: 20000, outputUnit: 'kg', timeSeconds: 31680 }],
    productivity: { machineName: 'MT-200', peopleCount: 4, outputQty: 20000, outputUnit: 'kg', timeSeconds: 31680 }
  })]);
  const before = JSON.stringify(source);
  const error = captureError(() => move(source, {
    allocationId: 'q-196-real',
    targetDate: '2026-07-21',
    targetMachineId: 'MT-200'
  }), 'PRODUCTIVITY_NOT_FOUND');
  assert.equal(error.message, 'Não existe produtividade cadastrada para este material na máquina selecionada com esta quantidade de pessoas.');
  assertRollback(source, before, error);
  assert.equal(source.allocations.length, 1);
  assert.deepEqual(byId(source, 'q-196-real'), JSON.parse(before).allocations[0]);

  const accepted = move(source, {
    allocationId: 'q-196-real',
    targetDate: '2026-07-21',
    targetMachineId: 'MT-100'
  });
  const q196 = byId(accepted, 'q-196-real');
  assert.equal(q196.date, '2026-07-21');
  assert.equal(q196.machineId, 'MT-100');
  assert.equal(q196.durationMinutes, 264);
  assert.equal(q196.capacityPercent, 50);
  assert.equal(q196.maxDailyCapacity, 8000);
  assert.equal(q196.capacityMaxPerDay, 8000);
  assert.equal(q196.quantity, 4000);
  assertIntegrity(accepted, source);
}

// Missao 14.1 / 3. Sequencia real CA60 6,0 e CA60 5,0, incluindo substituicao.
{
  const initial = draft([
    allocation({ allocationId: 'ca60-6', materialId: 'CA60-6.0', quantity: 6000, date: '2026-07-16', capacityPercent: 85.71, maxDailyCapacity: 7000, parentOperationId: 'op-ca60-6' }),
    allocation({ allocationId: 'ca60-5', materialId: 'CA60-5.0', quantity: 5000, date: '2026-07-17', capacityPercent: 71.43, maxDailyCapacity: 7000, parentOperationId: 'op-ca60-5' }),
    allocation({ allocationId: 'other-preserved', materialId: 'BR70', quantity: 4, date: '2026-07-15', capacityPercent: 40, maxDailyCapacity: 10, parentOperationId: 'op-other' })
  ]);

  const afterA = move(initial, { allocationId: 'ca60-6', targetDate: '2026-07-21', targetMachineId: 'M1' });
  assert.equal(byId(afterA, 'ca60-6').date, '2026-07-21');
  assert.equal(byId(afterA, 'ca60-6').allocationId, 'ca60-6');
  assertIntegrity(afterA, initial);

  const afterB = move(afterA, { allocationId: 'ca60-5', targetDate: '2026-07-16', targetMachineId: 'M1' });
  assert.equal(byId(afterB, 'ca60-6').date, '2026-07-21');
  assert.equal(byId(afterB, 'ca60-5').date, '2026-07-16');
  assertPinnedUnchanged(afterA, afterB, ['ca60-5']);
  assertIntegrity(afterB, afterA);

  const afterC = move(afterB, {
    allocationId: 'ca60-6',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmReplace: true
  });
  assert.equal(byId(afterC, 'ca60-6').date, '2026-07-16');
  assert.equal(byId(afterC, 'ca60-5').date, '2026-07-17');
  assert.equal(byId(afterC, 'ca60-6').allocationId, 'ca60-6');
  assert.equal(byId(afterC, 'other-preserved').date, '2026-07-15');
  assertIntegrity(afterC, afterB);

  const afterCPreferSource = move(afterB, {
    allocationId: 'ca60-6',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmReplace: true,
    preferSourceDateForReplace: true
  });
  assert.equal(byId(afterCPreferSource, 'ca60-6').date, '2026-07-16');
  assert.equal(byId(afterCPreferSource, 'ca60-5').date, '2026-07-21');
  assertIntegrity(afterCPreferSource, afterB);

  const afterD = move(afterC, {
    allocationId: 'other-preserved',
    targetDate: '2026-07-20',
    targetMachineId: 'M2'
  });
  assert.equal(byId(afterD, 'ca60-6').date, '2026-07-16');
  assert.equal(byId(afterD, 'ca60-5').date, '2026-07-17');
  assertPinnedUnchanged(afterC, afterD, ['other-preserved']);
  assertIntegrity(afterD, afterC);
}

// Reordenacao dentro do mesmo quadrante preserva quantidades e coloca o card arrastado antes.
{
  const source = draft([
    allocation({ allocationId: 'order-a', materialId: 'CA60', quantity: 2, date: '2026-07-16', capacityPercent: 33.33, maxDailyCapacity: 6 }),
    allocation({ allocationId: 'order-b', materialId: 'BR70', quantity: 3, date: '2026-07-16', capacityPercent: 30, maxDailyCapacity: 10 })
  ]);
  const reordered = move(source, {
    allocationId: 'order-b',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    moveMode: 'reorder_before'
  });
  assert.equal(byId(reordered, 'order-b').startTime, '07:00');
  assert.equal(byId(reordered, 'order-a').startTime, byId(reordered, 'order-b').endTime);
  assertIntegrity(reordered, source);
}

// Missao 14.1 / 4. Unificacao exata de CA60 5,0 pela capacidade real de 7.000 kg.
{
  const source = draft([
    allocation({ allocationId: 'ca5-main', materialId: 'CA60-5.0', quantity: 5753.788, date: '2026-07-16', capacityPercent: 82.2, maxDailyCapacity: 7000, parentOperationId: 'op-ca5-main' }),
    allocation({ allocationId: 'ca5-extra', materialId: 'CA60-5.0', quantity: 1219.697, date: '2026-07-17', capacityPercent: 17.42, maxDailyCapacity: 7000, parentOperationId: 'op-ca5-extra' })
  ]);
  const mergedDraft = move(source, {
    allocationId: 'ca5-extra',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmMerge: true
  });
  assert.equal(mergedDraft.allocations.length, 1);
  const merged = mergedDraft.allocations[0];
  assert.equal(merged.quantity, 6973.485);
  assert.deepEqual([...merged.sourceAllocationIds].sort(), ['ca5-extra', 'ca5-main']);
  assert.deepEqual([...merged.sourceParentOperationIds].sort(), ['op-ca5-extra', 'op-ca5-main']);
  assert.deepEqual(merged.components.map(component => component.quantity).sort((a, b) => a - b), [1219.697, 5753.788]);
  assert.equal(merged.durationMinutes, Math.ceil((6973.485 / 7000) * 528));
  assert.equal(merged.capacityPercent, Number(((6973.485 / 7000) * 100).toFixed(2)));
  assert.equal(merged.maxDailyCapacity, 7000);
  assertIntegrity(mergedDraft, source);
}

// Missao 14.1 / 5. Excesso 80% + 30%: cancelar, preencher/reagendar e extraordinaria.
{
  const source = draft([
    allocation({ allocationId: 'capacity-80', materialId: 'CAPACITY-TEST', machineId: 'CAP-1', quantity: 8, date: '2026-07-16', capacityPercent: 80, maxDailyCapacity: 999, parentOperationId: 'op-cap-80' }),
    allocation({ allocationId: 'capacity-30', materialId: 'CAPACITY-TEST', machineId: 'CAP-1', quantity: 3, date: '2026-07-17', capacityPercent: 30, maxDailyCapacity: 10, parentOperationId: 'op-cap-30' })
  ]);
  const before = JSON.stringify(source);
  const canceled = captureError(() => move(source, {
    allocationId: 'capacity-30', targetDate: '2026-07-16', targetMachineId: 'CAP-1', confirmMerge: true
  }), 'CAPACITY_EXCEEDED');
  assertRollback(source, before, canceled);

  const split = move(source, {
    allocationId: 'capacity-30',
    targetDate: '2026-07-16',
    targetMachineId: 'CAP-1',
    confirmMerge: true,
    capacityDecision: 'split'
  });
  const filled = split.allocations.find(item => item.date === '2026-07-16');
  const excess = split.allocations.find(item => item.date !== '2026-07-16');
  assert.equal(filled.quantity, 10);
  assert.equal(filled.capacityPercent, 100);
  assert.equal(excess.quantity, 1);
  assert.equal(excess.capacityPercent, 10);
  assert.equal(excess.date, '2026-07-17');
  assert.ok(excess.sourceAllocationIds.includes('capacity-30'));
  assert.ok(excess.sourceParentOperationIds.includes('op-cap-30'));
  assert.equal(split.allocations.reduce((sum, item) => sum + item.quantity, 0), 11);
  assertIntegrity(split, source);

  const override = move(source, {
    allocationId: 'capacity-30',
    targetDate: '2026-07-16',
    targetMachineId: 'CAP-1',
    confirmMerge: true,
    capacityDecision: 'override'
  });
  assert.equal(override.allocations.length, 1);
  assert.equal(override.allocations[0].quantity, 11);
  assert.equal(override.allocations[0].capacityPercent, 110);
  assert.equal(override.allocations[0].isCapacityOverride, true);
  assertIntegrity(override, source);
}

// Missao 14.1 / 6. click_move percorre o mesmo dominio de destino vazio, unificacao e substituicao.
{
  const scenarios = [
    {
      source: draft([allocation({ allocationId: 'click-empty', materialId: 'Q-196', quantity: 4000 })]),
      options: { allocationId: 'click-empty', targetDate: '2026-07-21', targetMachineId: 'MT-100' }
    },
    {
      source: draft([
        allocation({ allocationId: 'click-merge-a', materialId: 'CA60-5.0', quantity: 5000, date: '2026-07-16', maxDailyCapacity: 7000 }),
        allocation({ allocationId: 'click-merge-b', materialId: 'CA60-5.0', quantity: 1000, date: '2026-07-17', maxDailyCapacity: 7000 })
      ]),
      options: { allocationId: 'click-merge-b', targetDate: '2026-07-16', targetMachineId: 'M1', confirmMerge: true }
    },
    {
      source: draft([
        allocation({ allocationId: 'click-replace-a', materialId: 'CA60-6.0', quantity: 6000, date: '2026-07-21', maxDailyCapacity: 7000 }),
        allocation({ allocationId: 'click-replace-b', materialId: 'CA60-5.0', quantity: 5000, date: '2026-07-16', maxDailyCapacity: 7000 })
      ]),
      options: { allocationId: 'click-replace-a', targetDate: '2026-07-16', targetMachineId: 'M1', confirmReplace: true }
    }
  ];
  scenarios.forEach(({ source, options }) => {
    const dragResult = move(source, { ...options, source: 'drag' });
    const clickResult = move(source, { ...options, source: 'click_move' });
    assert.deepEqual(domainResult(clickResult), domainResult(dragResult));
    assertIntegrity(clickResult, source);
  });
}

// Missao 14.1 / 7. Rollback de unificacao, substituicao sem futuro e divisao impossivel.
{
  const invalidMerge = draft([
    allocation({ allocationId: 'rollback-merge-a', materialId: 'CAPACITY-TEST', machineId: 'CAP-1', quantity: 8, date: '2026-07-16', maxDailyCapacity: 10 }),
    allocation({ allocationId: 'rollback-merge-b', materialId: 'CAPACITY-TEST', machineId: 'CAP-1', quantity: 3, date: '2026-07-17', maxDailyCapacity: 10 })
  ]);
  const mergeBefore = JSON.stringify(invalidMerge);
  const mergeError = captureError(() => move(invalidMerge, {
    allocationId: 'rollback-merge-b', targetDate: '2026-07-16', targetMachineId: 'CAP-1', confirmMerge: true
  }), 'CAPACITY_EXCEEDED');
  assertRollback(invalidMerge, mergeBefore, mergeError);

  const noFuture = draft([
    allocation({ allocationId: 'rollback-replace-moved', materialId: 'CA60-6.0', quantity: 6000, date: '2026-07-21', maxDailyCapacity: 7000 }),
    allocation({ allocationId: 'rollback-replace-occupant', materialId: 'CA60-5.0', quantity: 5000, date: '2026-07-16', maxDailyCapacity: 7000 })
  ]);
  const closedDays = Array.from({ length: 365 }, (_, index) => {
    const date = new Date('2026-07-16T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index + 1);
    return { date: date.toISOString().slice(0, 10), isWorkingDay: false };
  });
  const replaceBefore = JSON.stringify(noFuture);
  const replaceError = captureError(() => move(noFuture, {
    allocationId: 'rollback-replace-moved',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    confirmReplace: true,
    days: closedDays
  }), 'NO_NEXT_SLOT');
  assertRollback(noFuture, replaceBefore, replaceError);

  const splitFailure = draft([
    allocation({ allocationId: 'rollback-split-full', materialId: 'CAPACITY-TEST', machineId: 'CAP-1', quantity: 10, date: '2026-07-16', maxDailyCapacity: 10 }),
    allocation({ allocationId: 'rollback-split-moved', materialId: 'CAPACITY-TEST', machineId: 'CAP-1', quantity: 3, date: '2026-07-17', maxDailyCapacity: 10 })
  ]);
  const splitBefore = JSON.stringify(splitFailure);
  const splitError = captureError(() => move(splitFailure, {
    allocationId: 'rollback-split-moved',
    targetDate: '2026-07-16',
    targetMachineId: 'CAP-1',
    confirmMerge: true,
    capacityDecision: 'split'
  }), 'CAPACITY_SPLIT_INVALID');
  assertRollback(splitFailure, splitBefore, splitError);
}

// Draft ocupado: escolha explicita entre substituir e completar dia.
{
  const focusSource = draft([allocation({
    allocationId: 'reto42-focus-move',
    materialId: '40',
    materialCode: '00808700091',
    materialCodes: ['00808700091'],
    materialName: '4,2 Reto - 12m',
    machineId: 'M1',
    machineName: 'Aço-8',
    quantity: 1319,
    unit: 'un',
    peopleCount: 1,
    date: '2026-07-21',
    capacityPercent: 57.01,
    maxDailyCapacity: 2314,
    parentOperationId: 'op-reto42-focus'
  })]);
  const focusMoved = move(focusSource, {
    allocationId: 'reto42-focus-move',
    targetDate: '2026-07-21',
    targetMachineId: 'focus8'
  });
  assert.equal(byId(focusMoved, 'reto42-focus-move').machineId, 'focus8');
  assert.equal(byId(focusMoved, 'reto42-focus-move').machineName, 'Focus-8');
  assert.equal(byId(focusMoved, 'reto42-focus-move').maxDailyCapacity, 2314);
  assertIntegrity(focusMoved, focusSource);

  const source = draft([
    allocation({ allocationId: 'same-replace-source', materialId: 'CA60', quantity: 3, date: '2026-07-21', parentOperationId: 'op-same-source' }),
    allocation({ allocationId: 'same-replace-occupant', materialId: 'CA60', quantity: 2, date: '2026-07-16', parentOperationId: 'op-same-occupant' })
  ]);
  const replaced = move(source, {
    allocationId: 'same-replace-source',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    moveMode: 'replace',
    confirmReplace: true
  });
  assert.equal(replaced.allocations.length, 2);
  assert.equal(byId(replaced, 'same-replace-source').date, '2026-07-16');
  assert.notEqual(byId(replaced, 'same-replace-occupant').date, '2026-07-16');
  assertIntegrity(replaced, source);

  const completeDifferent = draft([
    allocation({ allocationId: 'complete-ca60', materialId: 'CA60', quantity: 3, date: '2026-07-16', capacityPercent: 50, parentOperationId: 'op-complete-ca60' }),
    allocation({ allocationId: 'complete-br70', materialId: 'BR70', quantity: 3, date: '2026-07-17', capacityPercent: 30, parentOperationId: 'op-complete-br70' })
  ]);
  const completed = move(completeDifferent, {
    allocationId: 'complete-br70',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    moveMode: 'complete_day'
  });
  assert.equal(completed.allocations.length, 2);
  assert.equal(byId(completed, 'complete-br70').date, '2026-07-16');
  assert.equal(byId(completed, 'complete-br70').machineId, 'M1');
  assert.ok(byId(completed, 'complete-br70').startTime >= byId(completed, 'complete-ca60').endTime);
  assertIntegrity(completed, completeDifferent);

  const overCapacity = draft([
    allocation({ allocationId: 'complete-over-ca60', materialId: 'CA60', quantity: 5, date: '2026-07-16', capacityPercent: 83.33, parentOperationId: 'op-over-ca60' }),
    allocation({ allocationId: 'complete-over-br70', materialId: 'BR70', quantity: 3, date: '2026-07-17', capacityPercent: 30, parentOperationId: 'op-over-br70' })
  ]);
  const overError = captureError(() => move(overCapacity, {
    allocationId: 'complete-over-br70',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    moveMode: 'complete_day'
  }), 'CAPACITY_EXCEEDED');
  assert.equal(overError.proposedAllocation.capacityPercent, 113.33);
  const authorized = move(overCapacity, {
    allocationId: 'complete-over-br70',
    targetDate: '2026-07-16',
    targetMachineId: 'M1',
    moveMode: 'complete_day',
    capacityDecision: 'override'
  });
  assert.equal(authorized.allocations.length, 2);
  assert.equal(byId(authorized, 'complete-over-br70').isCapacityOverride, true);
  assertIntegrity(authorized, overCapacity);
}

console.log('manualScheduleDraft.service.test.js ok');
