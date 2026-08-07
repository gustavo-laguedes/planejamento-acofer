import assert from 'node:assert/strict';
import {
  buildPlanningDemandContext,
  buildPlanningOpeningStock,
  projectPlanningStockByDay
} from '../services/planningStockProjection.service.js';

const days = ['2026-07-20', '2026-07-21', '2026-07-22'];
const material = (id, extra = {}) => ({ materialId: id, materialName: id, unit: 'kg', ...extra });
const allocation = (id, materialId, date, quantity, parentOperationId, extra = {}) => ({
  allocationId: id, materialId, materialName: materialId, unit: 'kg', date,
  startTime: '08:00', endTime: '10:00', quantity, parentOperationId,
  components: [{ parentOperationId, materialId, quantity, unit: 'kg' }], ...extra
});
const project = overrides => projectPlanningStockByDay({ calendarDays: days, ...overrides });
const row = (projection, date, id) => projection.days.find(day => day.date === date).materials.find(item => item.materialId === id);

// 1. Saldo simples permanece inalterado em todos os dias.
{
  const result = project({ stockContext: { stock: [{ ...material('A'), quantity: 1000 }] } });
  assert.deepEqual(result.days.map(day => row(result, day.date, 'A').closingStock), [1000, 1000, 1000]);
}

// 2. Entrada física ocorre uma vez, ao término da allocation.
{
  const result = project({ stockContext: { stock: [{ ...material('B'), quantity: 0 }] }, allocations: [allocation('b1', 'B', days[0], 500, '0:B')] });
  assert.equal(row(result, days[0], 'B').productionIn, 500);
  assert.equal(row(result, days[0], 'B').closingStock, 500);
  assert.equal(row(result, days[0], 'B').movements[0].time, '10:00');
}

// 3 e 4. Consumo produtivo, intermediário e ordem intradiária.
{
  const tree = {
    productionIndex: 0, materialId: 'C', requiredQty: 200, unit: 'kg', children: [
      { productionIndex: 0, materialId: 'B', requiredQty: 200, unit: 'kg', children: [
        { productionIndex: 0, materialId: 'A', requiredQty: 400, unit: 'kg', children: [] }
      ] }
    ]
  };
  const result = project({
    stockContext: { stock: [material('A', { quantity: 1000 }), material('B', { quantity: 0 }), material('C', { quantity: 0 })] },
    scheduleTree: tree,
    allocations: [
      allocation('make-b', 'B', days[0], 350, '0:B', { startTime: '08:00', endTime: '10:00' }),
      allocation('make-c', 'C', days[0], 200, '0:C', { startTime: '14:00', endTime: '16:00' })
    ]
  });
  assert.equal(row(result, days[0], 'A').closingStock, 600);
  assert.equal(row(result, days[0], 'B').productionIn, 350);
  assert.equal(row(result, days[0], 'B').productionConsumption, 200);
  assert.equal(row(result, days[0], 'B').closingStock, 150);
  assert.deepEqual(row(result, days[0], 'B').movements.map(item => item.time), ['10:00', '14:00']);
}

// 5 e 15. Operação dividida conserva entrada e consumo proporcional.
{
  const tree = { productionIndex: 0, materialId: 'B', requiredQty: 100, unit: 'kg', children: [{ productionIndex: 0, materialId: 'A', requiredQty: 40, unit: 'kg', children: [] }] };
  const allocations = [allocation('part-1', 'B', days[0], 25, '0:B'), allocation('part-2', 'B', days[1], 75, '0:B')];
  const result = project({ stockContext: { stock: [material('A', { quantity: 100 }), material('B', { quantity: 0 })] }, scheduleTree: tree, allocations });
  assert.equal(row(result, days[0], 'A').productionConsumption, 10);
  assert.equal(row(result, days[1], 'A').productionConsumption, 30);
  assert.equal(result.days.reduce((sum, day) => sum + row(result, day.date, 'B').productionIn, 0), 100);
}

// 6. Card compartilhado gera uma entrada física; memberships não multiplicam quantidade.
{
  const shared = allocation('shared', 'B', days[0], 50, 'group:B', {
    productionMemberships: [{ productionId: 'p1' }, { productionId: 'p2' }],
    components: [
      { parentOperationId: '0:B', materialId: 'B', quantity: 20, unit: 'kg' },
      { parentOperationId: '1:B', materialId: 'B', quantity: 30, unit: 'kg' }
    ]
  });
  const result = project({ stockContext: { stock: [material('B', { quantity: 0 })] }, allocations: [shared, { ...shared }] });
  assert.equal(row(result, days[0], 'B').productionIn, 50);
}

// Card compartilhado conserva também o consumo físico dos insumos e sucessores.
{
  const tree = { materialName: 'Plano', children: [
    { productionIndex: 0, materialId: 'X', requiredQty: 20, unit: 'kg', children: [
      { productionIndex: 0, materialId: 'B', requiredQty: 20, unit: 'kg', children: [
        { productionIndex: 0, materialId: 'A', requiredQty: 40, unit: 'kg', children: [] }
      ] }
    ] },
    { productionIndex: 1, materialId: 'Y', requiredQty: 30, unit: 'kg', children: [
      { productionIndex: 1, materialId: 'B', requiredQty: 30, unit: 'kg', children: [
        { productionIndex: 1, materialId: 'A', requiredQty: 60, unit: 'kg', children: [] }
      ] }
    ] }
  ] };
  const shared = allocation('shared-physical', 'B', days[0], 50, 'group:B', {
    components: [
      { parentOperationId: '0:B', materialId: 'B', quantity: 20, unit: 'kg' },
      { parentOperationId: '1:B', materialId: 'B', quantity: 30, unit: 'kg' }
    ]
  });
  const result = project({
    stockContext: { stock: [material('A', { quantity: 1000 }), material('B', { quantity: 0 }), material('X', { quantity: 0 }), material('Y', { quantity: 0 })] },
    scheduleTree: tree,
    allocations: [shared, { ...shared }, allocation('make-x', 'X', days[1], 20, '0:X'), allocation('make-y', 'Y', days[1], 30, '1:Y')]
  });
  assert.equal(row(result, days[0], 'B').productionIn, 50);
  assert.equal(row(result, days[0], 'A').productionConsumption, 100);
  assert.equal(row(result, days[1], 'B').productionConsumption, 50);
}

// 7 e 8. Negativo inicial é preservado e primeira ruptura futura é identificada.
{
  const negative = project({ stockContext: { stock: [material('A', { quantity: -5 })] } });
  assert.equal(row(negative, days[0], 'A').openingStock, -5);
  assert.ok(negative.alerts.some(item => item.code === 'NEGATIVE_INITIAL_STOCK'));
  const tree = { productionIndex: 0, materialId: 'B', requiredQty: 1, unit: 'kg', children: [{ productionIndex: 0, materialId: 'A', requiredQty: 15, unit: 'kg', children: [] }] };
  const future = project({ stockContext: { stock: [material('A', { quantity: 10 }), material('B', { quantity: 0 })] }, scheduleTree: tree, allocations: [allocation('rupture', 'B', days[1], 1, '0:B')] });
  const rupture = future.alerts.find(item => item.code === 'PROJECTED_STOCK_NEGATIVE');
  assert.equal(rupture.date, days[1]);
  assert.equal(rupture.time, '08:00');
}

// 9. Cruzamento de mínimo classifica e alerta.
{
  const tree = { productionIndex: 0, materialId: 'B', requiredQty: 1, unit: 'kg', children: [{ productionIndex: 0, materialId: 'A', requiredQty: 6, unit: 'kg', children: [] }] };
  const result = project({ stockContext: { stock: [material('A', { quantity: 10, minimumStock: 5 }), material('B', { quantity: 0 })] }, scheduleTree: tree, allocations: [allocation('minimum', 'B', days[0], 1, '0:B')] });
  assert.equal(row(result, days[0], 'A').status, 'CRITICAL');
  assert.ok(result.alerts.some(item => item.code === 'MINIMUM_STOCK_REACHED'));
}

// 10. Cobertura válida; demanda zero não gera Infinity/NaN.
{
  const result = project({
    stockContext: { stock: [material('A', { quantity: 100 }), material('B', { quantity: 100 })] },
    demandContext: { materials: [{ materialId: 'A', averageDailyDemand: 10 }, { materialId: 'B', averageDailyDemand: 0 }] }
  });
  assert.equal(row(result, days[0], 'A').coverageDays, 9);
  assert.equal(row(result, days[0], 'A').demandOut, 10);
  assert.equal(row(result, days[0], 'B').coverageDays, null);
  assert.equal(row(result, days[0], 'B').status, 'NO_DEMAND');
}

// 11, 12, 13 e 14. Qualquer draft aceito (e seu reload) determina imediatamente as datas.
{
  const stockContext = { stock: [material('B', { quantity: 0 })] };
  const monday = project({ stockContext, allocations: [allocation('team', 'B', days[1], 10, '0:B')] });
  const saturdayDate = '2026-07-18';
  const saturday = project({ calendarDays: [saturdayDate, ...days], stockContext, allocations: [allocation('team', 'B', saturdayDate, 10, '0:B')] });
  assert.equal(row(monday, days[0], 'B').closingStock, 0);
  assert.equal(row(monday, days[1], 'B').closingStock, 10);
  assert.equal(row(saturday, saturdayDate, 'B').productionIn, 10);
  const removed = project({ stockContext, allocations: [allocation('team', 'B', days[0], 10, '0:B')] });
  assert.equal(row(removed, days[0], 'B').productionIn, 10);
  const reload = project({ stockContext: JSON.parse(JSON.stringify(stockContext)), allocations: JSON.parse(JSON.stringify([allocation('team', 'B', days[0], 10, '0:B')])) });
  assert.deepEqual(reload, removed);
}

// 16. Unidade incompatível não altera saldo e gera diagnóstico específico.
{
  const result = project({ stockContext: { stock: [material('B', { quantity: 0 })] }, allocations: [allocation('unit', 'B', days[0], 10, '0:B', { unit: 'un', components: [{ parentOperationId: '0:B', materialId: 'B', quantity: 10, unit: 'un' }] })] });
  assert.equal(row(result, days[0], 'B').closingStock, 0);
  assert.ok(result.diagnostics.some(item => item.code === 'INCOMPATIBLE_UNIT'));
}

// 17. Legado sem draft v2 usa allocations adaptadas normalmente.
{
  const result = project({ stockContext: { stock: [material('B', { quantity: 0 })] }, allocations: [{ id: 'legacy', material_id: 'B', startDate: days[0], startTime: '08:00', endTime: '09:00', produceQty: 7, planned_unit: 'kg', operationId: '0:B' }] });
  assert.equal(row(result, days[0], 'B').closingStock, 7);
  assert.equal(result.generatedFrom.scheduleSource, 'manualScheduleDraft.allocations');
}

// Fontes canônicas: Qtd. total locais considera apenas locais cadastrados; Vendas/dia é aplicada diariamente.
{
  const materials = [{ id: 1, name: 'A', codes: ['A1'], primary_unit: 'kg', permits_sales: true }];
  const locations = [{ id: 1, code: 'Matriz', name: 'Matriz' }];
  const stockRows = [
    { establishment: 'Matriz', product_code: 'A1', fiscal_balance_unit: 100, error_balance_unit: -2, sales_unit: 50 },
    { establishment: 'Não mapeado', product_code: 'A1', fiscal_balance_unit: 999, error_balance_unit: 1, sales_unit: 0 }
  ];
  assert.equal(buildPlanningOpeningStock({ materials, locations, stockRows, correctionRows: [{ material_id: 1, correction_qty: 3 }] })[0].quantity, 101);
  assert.equal(buildPlanningDemandContext({ materials, stockRows, businessDays: 5 }).materials[0].averageDailyDemand, 10);
}

// Venda acumulativa: saldo anterior + produção - Vendas/dia.
{
  const demandContext = { materials: [{ materialId: 'V', permitsSales: true, averageDailyDemand: 100 }] };
  const base = project({ stockContext: { stock: [material('V', { quantity: 1000 })] }, demandContext });
  assert.deepEqual(base.days.map(day => row(base, day.date, 'V').closingStock), [900, 800, 700]);
  assert.deepEqual(base.days.map(day => row(base, day.date, 'V').openingStock), [1000, 900, 800]);
  const withProduction = project({
    stockContext: { stock: [material('V', { quantity: 1000 })] }, demandContext,
    allocations: [allocation('sale-production', 'V', days[1], 500, '0:V')]
  });
  assert.deepEqual(withProduction.days.map(day => row(withProduction, day.date, 'V').closingStock), [900, 1300, 1200]);
  assert.equal(row(withProduction, days[1], 'V').productionIn, 500);
  assert.equal(row(withProduction, days[1], 'V').demandOut, 100);
}

// Cobertura usa o saldo final estimado; negativo resulta em zero dias.
{
  const positive = projectPlanningStockByDay({
    calendarDays: [days[0]],
    stockContext: { stock: [material('V', { quantity: 1100 })] },
    demandContext: { materials: [{ materialId: 'V', permitsSales: true, averageDailyDemand: 100 }] }
  });
  assert.equal(row(positive, days[0], 'V').closingStock, 1000);
  assert.equal(row(positive, days[0], 'V').coverageDays, 10);
  const negative = projectPlanningStockByDay({
    calendarDays: [days[0]],
    stockContext: { stock: [material('V', { quantity: 50 })] },
    demandContext: { materials: [{ materialId: 'V', permitsSales: true, averageDailyDemand: 100 }] }
  });
  assert.equal(row(negative, days[0], 'V').coverageDays, 0);
}

// Produção acumulativa: não recebe Vendas/dia e combina entrada e consumo produtivos.
{
  const tree = { productionIndex: 0, materialId: 'B', requiredQty: 1, unit: 'kg', children: [{ productionIndex: 0, materialId: 'P', requiredQty: 3000, unit: 'kg', children: [] }] };
  const result = project({
    stockContext: { stock: [material('P', { quantity: 10000 }), material('B', { quantity: 0 })] },
    demandContext: { materials: [{ materialId: 'P', permitsSales: false, averageDailyDemand: 100 }] },
    scheduleTree: tree,
    allocations: [
      allocation('produce-p', 'P', days[0], 1500, '0:P'),
      allocation('consume-p', 'B', days[0], 1, '0:B')
    ]
  });
  assert.equal(row(result, days[0], 'P').productionIn, 1500);
  assert.equal(row(result, days[0], 'P').productionConsumption, 3000);
  assert.equal(row(result, days[0], 'P').demandOut, 0);
  assert.equal(row(result, days[0], 'P').closingStock, 8500);
  assert.equal(row(result, days[1], 'P').openingStock, 8500);
}

// Horizonte visual estendido continua a projeção e aceita produção movida para um dia novo.
{
  const visibleEndDate = '2026-07-25';
  const result = projectPlanningStockByDay({
    calendarDays: [days[0], visibleEndDate],
    stockContext: { stock: [material('V', { quantity: 1000 })] },
    demandContext: { materials: [{ materialId: 'V', permitsSales: true, averageDailyDemand: 100 }] },
    allocations: [allocation('moved-to-expanded-day', 'V', visibleEndDate, 500, '0:V')]
  });
  assert.equal(result.days.at(-1).date, visibleEndDate);
  assert.equal(row(result, visibleEndDate, 'V').productionIn, 500);
  assert.equal(row(result, visibleEndDate, 'V').demandOut, 100);
  assert.equal(row(result, visibleEndDate, 'V').closingStock, 900);
}

console.log('planningStockProjection.service.test.js ok');
