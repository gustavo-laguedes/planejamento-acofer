import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFlowNodeKey,
  buildPlanningFlowGraph,
  normalizeFlowQuantities,
  resolveFlowNodeModelName,
  selectProductionFlowTrees
} from '../shared/planning-domain/planningFlowModel.js';

test('selectProductionFlowTrees preserva entrada vazia, raiz unica e filhos do plano', () => {
  assert.deepEqual(selectProductionFlowTrees(null), []);
  assert.deepEqual(selectProductionFlowTrees({}), []);

  const singleRoot = { materialName: 'Produto A' };
  assert.deepEqual(selectProductionFlowTrees({ tree: singleRoot }), [singleRoot]);

  const first = { materialName: 'Produto A' };
  const second = { materialName: 'Produto B' };
  const result = {
    tree: {
      materialName: 'Plano de produção',
      children: [first, second]
    }
  };
  const trees = selectProductionFlowTrees(result);
  assert.deepEqual(trees, [first, second]);
  assert.equal(trees[0], first);
  assert.equal(trees[1], second);
});

test('resolveFlowNodeModelName preserva precedencia de modelo e fallbacks', () => {
  const productions = [
    { materialId: 10, productionModelName: 'Modelo raiz' },
    { materialId: 20, productionModelName: 'Outro modelo' }
  ];
  const operationOverrides = {
    '0:10': { productionModelName: 'Modelo escopado' },
    '10': { productionModelName: 'Modelo material' }
  };

  assert.equal(resolveFlowNodeModelName(
    { productionIndex: 0, materialId: 10, productionModelName: 'Modelo do no' },
    { operationOverrides, productions }
  ), 'Modelo do no');
  assert.equal(resolveFlowNodeModelName(
    { productionIndex: 0, materialId: 10 },
    { operationOverrides, productions }
  ), 'Modelo escopado');
  assert.equal(resolveFlowNodeModelName(
    { productionIndex: 1, materialId: 10 },
    { operationOverrides, productions }
  ), 'Modelo material');
  assert.equal(resolveFlowNodeModelName(
    { productionIndex: 0, materialId: 10 },
    { operationOverrides: {}, productions }
  ), 'Modelo raiz');
  assert.equal(resolveFlowNodeModelName(
    { productionIndex: 1, materialId: 10 },
    { operationOverrides: {}, productions }
  ), '');
});

test('buildFlowNodeKey preserva campos, normalizacao textual e modelo no key', () => {
  const key = buildFlowNodeKey(
    {
      materialId: ' 10 ',
      materialCode: ' COD-A ',
      materialName: ' Peça Final ',
      unit: ' KG ',
      productionIndex: 0
    },
    {
      productions: [{ materialId: ' 10 ', productionModelName: ' Modelo X ' }]
    }
  );
  assert.equal(key, '10|cod-a|peça final|kg|modelo x');
});

test('normalizeFlowQuantities preserva regra de maximo, minimos e ausencias', () => {
  assert.deepEqual(normalizeFlowQuantities({}), {
    requiredQty: 0,
    stockUsedQty: 0,
    produceQty: 0
  });
  assert.deepEqual(normalizeFlowQuantities({
    requiredQty: 5,
    stockUsedQty: 8,
    produceQty: 4
  }), {
    requiredQty: 12,
    stockUsedQty: 8,
    produceQty: 4
  });
  assert.deepEqual(normalizeFlowQuantities({
    requiredQty: 10,
    stockUsedQty: 20,
    produceQty: 30
  }), {
    requiredQty: 50,
    stockUsedQty: 20,
    produceQty: 30
  });
});

test('buildPlanningFlowGraph monta pai/filho preservando IDs, ordem e labels', () => {
  const tree = {
    materialId: 100,
    materialCode: 'FINAL',
    materialName: 'Produto Final',
    unit: 'un',
    requiredQty: 5,
    produceQty: 5,
    stockQty: 0,
    productionIndex: 0,
    productionKey: 'prod-a',
    productionId: 'P-A',
    productionTitle: 'Produção Alpha',
    productionColor: '#AA0000',
    operationId: 'op-final',
    parentOperationId: 'parent-final',
    calendarParentOperationId: 'calendar-final',
    splitParentOperationId: 'split-final',
    children: [{
      materialId: 10,
      materialCode: 'RAW',
      materialName: 'Materia Prima',
      unit: 'kg',
      requiredQty: 3,
      stockUsedQty: 1,
      produceQty: 2,
      stockQty: 4,
      productionIndex: 0,
      productionKey: 'prod-a',
      productionId: 'P-A',
      productionTitle: 'Produção Alpha',
      productionColor: '#AA0000',
      operationId: 'op-raw',
      parentOperationId: 'parent-raw',
      calendarParentOperationId: 'calendar-raw',
      splitParentOperationId: 'split-raw',
      children: []
    }]
  };

  const graph = buildPlanningFlowGraph([tree]);
  assert.equal(graph.columns.length, 2);
  assert.equal(graph.columns[0][0].materialName, 'Materia Prima');
  assert.equal(graph.columns[1][0].materialName, 'Produto Final');
  assert.equal(graph.columns[1][0].isFinalProduct, true);
  assert.deepEqual(graph.columns[0][0].operationIds, ['op-raw', 'parent-raw', 'calendar-raw', 'split-raw']);
  assert.deepEqual(graph.columns[1][0].productionIds, ['P-A', 'prod-a']);
  assert.deepEqual(graph.columns[1][0].productions, [{
    key: 'prod-a',
    index: 0,
    title: 'Produção Alpha',
    color: '#AA0000'
  }]);
  assert.deepEqual(graph.edges, [{
    from: graph.columns[0][0].flowKey,
    to: graph.columns[1][0].flowKey,
    productionIndex: 0,
    color: '#AA0000'
  }]);
});

test('buildPlanningFlowGraph mescla materiais iguais de multiplas producoes preservando ordem por indice', () => {
  const roots = [
    {
      materialId: 100,
      materialCode: 'F1',
      materialName: 'Final 1',
      unit: 'un',
      requiredQty: 2,
      produceQty: 2,
      productionIndex: 1,
      productionKey: 'prod-b',
      productionTitle: 'Produção B',
      productionColor: '#00AA00',
      children: [{
        materialId: 10,
        materialCode: 'RAW',
        materialName: 'Materia Prima',
        unit: 'kg',
        requiredQty: 2,
        stockUsedQty: 1,
        produceQty: 1,
        stockQty: 3,
        productionIndex: 1,
        productionKey: 'prod-b',
        productionTitle: 'Produção B',
        productionColor: '#00AA00',
        children: []
      }]
    },
    {
      materialId: 200,
      materialCode: 'F2',
      materialName: 'Final 2',
      unit: 'un',
      requiredQty: 4,
      produceQty: 4,
      productionIndex: 0,
      productionKey: 'prod-a',
      productionTitle: 'Produção A',
      productionColor: '#AA0000',
      children: [{
        materialId: 10,
        materialCode: 'RAW',
        materialName: 'Materia Prima',
        unit: 'kg',
        requiredQty: 5,
        stockUsedQty: 2,
        produceQty: 3,
        stockQty: 7,
        productionIndex: 0,
        productionKey: 'prod-a',
        productionTitle: 'Produção A',
        productionColor: '#AA0000',
        children: []
      }]
    }
  ];

  const graph = buildPlanningFlowGraph(roots);
  const raw = graph.columns[0][0];
  assert.equal(raw.materialName, 'Materia Prima');
  assert.equal(raw.requiredQty, 7);
  assert.equal(raw.stockUsedQty, 3);
  assert.equal(raw.produceQty, 4);
  assert.equal(raw.stockQty, 7);
  assert.deepEqual(raw.productions, [
    { key: 'prod-a', index: 0, title: 'Produção A', color: '#AA0000' },
    { key: 'prod-b', index: 1, title: 'Produção B', color: '#00AA00' }
  ]);
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(graph.edges.map(edge => edge.productionIndex), [1, 0]);
});

test('buildPlanningFlowGraph ignora wrapper de plano, ciclos e nao muta entradas', () => {
  const child = {
    materialId: 10,
    materialName: 'Componente',
    requiredQty: 1,
    produceQty: 1,
    productionIndex: 0,
    children: []
  };
  const root = {
    materialId: 20,
    materialName: 'Final',
    requiredQty: 1,
    produceQty: 1,
    productionIndex: 0,
    children: [child]
  };
  child.children.push(root);
  const wrapped = {
    materialName: 'Plano de producao',
    children: [root]
  };
  const rootChildrenBefore = root.children.slice();
  const childChildrenBefore = child.children.slice();

  const graph = buildPlanningFlowGraph([wrapped]);
  assert.deepEqual(root.children, rootChildrenBefore);
  assert.deepEqual(child.children, childChildrenBefore);
  assert.equal(child.children[0], root);
  assert.equal(graph.columns.length, 1);
  assert.equal(graph.edges.length, 2);
});
