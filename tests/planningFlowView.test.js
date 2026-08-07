import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderFlowGraph,
  renderFlowNodeCard,
  renderFlowTree
} from '../shared/planning-presentation/planningFlowView.js';

const viewOptions = {
  consolidatedStockOnlyChecked: productions => productions.some(production => Number(production.index) === 1),
  flowNodeKey: node => `fallback-${node.materialId || 'none'}`,
  hasStockAvailable: node => Number(node?.stockQty || 0) > 0,
  planningFlowNodeStockBalanceChecked: ({ checked, canUseStock }) => checked === true && canUseStock === true,
  productionThemeStyle: (index, color) => `--theme-index:${index}; --theme-color:${color || 'none'}`,
  productionCardSegmentStyle: productions => `--segments:${productions.length}`,
  productionSegmentStyle: productions => `segment-${productions.map(item => item.index).join('-')}`
};

test('renderFlowNodeCard preserva HTML de no simples, labels, classes e data attributes', () => {
  const node = {
    flowKey: 'node-10',
    materialId: 10,
    materialName: 'Peça & Final',
    unit: 'kg',
    requiredQty: 12.5,
    stockQty: 0,
    produceQty: 12.5,
    stockUsedQty: 0,
    productionIndex: 0,
    productionTitle: 'Produ&ccedil;&atilde;o A',
    productionColor: '#AA0000',
    operationIds: ['op-1', 'parent-1'],
    productionIds: ['prod-a']
  };

  const html = renderFlowNodeCard(node, viewOptions);

  assert.match(html, /class="production-flow-node needs-production"/);
  assert.match(html, /role="button" tabindex="0"/);
  assert.match(html, /data-flow-node-key="node-10"/);
  assert.match(html, /data-flow-material-id="10"/);
  assert.match(html, /data-flow-material-name="Peça &amp; Final"/);
  assert.match(html, /data-flow-operation-ids="op-1,parent-1"/);
  assert.match(html, /data-flow-production-ids="prod-a"/);
  assert.match(html, /data-flow-required="12,50"/);
  assert.match(html, /data-flow-stock="0"/);
  assert.match(html, /data-flow-produce="12,50"/);
  assert.match(html, /data-flow-unit="kg"/);
  assert.match(html, /data-flow-status="Produ&amp;ccedil;&amp;atilde;o cheia"/);
  assert.match(html, /data-flow-production-indexes="0"/);
  assert.match(html, /style="--theme-index:0; --theme-color:#AA0000; --segments:1"/);
  assert.match(html, /<strong>Peça &amp; Final<\/strong>/);
  assert.match(html, /<span class="production-flow-status full-production">Produ&ccedil;&atilde;o cheia<\/span>/);
  assert.match(html, /<span>A produzir: <strong>12,50 kg<\/strong><\/span>/);
  assert.match(html, /class="stock-only-toggle" title="Sem saldo disponível"/);
  assert.match(html, /<input type="checkbox" data-stock-only data-production-indexes="0" data-material-id="10"  disabled \/>/);
});

test('renderFlowGraph preserva pai/filho, colunas, edges escapadas e card consolidado', () => {
  const child = {
    flowKey: 'raw<&>',
    materialId: 20,
    materialName: 'MP <Base>',
    unit: 'kg',
    requiredQty: 5,
    stockQty: 3,
    produceQty: 2,
    stockUsedQty: 3,
    productions: [
      { index: 0, title: 'Produção A', color: '#AA0000' },
      { index: 1, title: 'Produção B', color: '#00AA00' }
    ],
    operationIds: ['raw-op'],
    productionIds: ['prod-a', 'prod-b']
  };
  const parent = {
    flowKey: 'final',
    materialId: 30,
    materialName: 'Final',
    unit: 'un',
    requiredQty: 1,
    stockQty: 0,
    produceQty: 1,
    isFinalProduct: true,
    productions: [{ index: 0, title: 'Produção A', color: '#AA0000' }]
  };
  const graph = {
    columns: [[child], [parent]],
    edges: [{ from: 'raw<&>', to: 'final', productionIndex: 0, color: '#AA0000' }]
  };

  const html = renderFlowGraph(['ignored-root'], {
    ...viewOptions,
    buildFlowGraph: roots => {
      assert.deepEqual(roots, ['ignored-root']);
      return graph;
    }
  });

  assert.match(html, /<div class="production-flow-graph" data-flow-graph>/);
  assert.match(html, /<svg class="production-flow-svg" aria-hidden="true"><\/svg>/);
  assert.match(html, /data-flow-level="0"/);
  assert.match(html, /data-flow-level="1"/);
  assert.match(html, /data-flow-node-key="raw&lt;&amp;&gt;"/);
  assert.match(html, /title="Produção A \| Produção B"/);
  assert.match(html, /data-flow-production-indexes="0,1"/);
  assert.match(html, /<span class="production-flow-status using-stock">Utilizando saldo<\/span>/);
  assert.match(html, /<span hidden data-flow-edges>\[\{&quot;from&quot;:&quot;raw&lt;&amp;&gt;&quot;,&quot;to&quot;:&quot;final&quot;,&quot;productionIndex&quot;:0,&quot;color&quot;:&quot;#AA0000&quot;\}\]<\/span>/);
});

test('renderFlowTree preserva arvore historica, labels e escaping', () => {
  const tree = {
    materialName: 'Final <A>',
    unit: 'un',
    requiredQty: 2,
    stockQty: 0,
    produceQty: 2,
    children: [{
      materialName: 'MP & Base',
      unit: 'kg',
      requiredQty: 5,
      stockQty: 9,
      produceQty: 0,
      isInitialRawMaterial: true,
      children: []
    }]
  };

  const html = renderFlowTree(tree);

  assert.match(html, /<div class="flow-tree-row" style="--flow-level: 0">/);
  assert.match(html, /<strong>Final &lt;A&gt;<\/strong>/);
  assert.match(html, /<span>Necessario 2 un<\/span>/);
  assert.match(html, /<span>A produzir 2 un<\/span>/);
  assert.match(html, /<em>Produzir<\/em>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<div class="flow-tree-row" style="--flow-level: 1">/);
  assert.match(html, /<strong>MP &amp; Base<\/strong>/);
  assert.match(html, /<em>Matéria-prima inicial com saldo<\/em>/);
});

test('renderFlowNodeCard preserva fallbacks, valores ausentes, modo somente leitura e nao muta entrada', () => {
  const node = {
    materialId: 40,
    materialName: undefined,
    unit: '',
    requiredQty: undefined,
    stockQty: 4,
    produceQty: 0,
    stockUsedQty: 4,
    productionIndex: 1
  };
  const before = JSON.stringify(node);

  const html = renderFlowNodeCard(node, {
    ...viewOptions,
    readOnlyStockToggle: true
  });

  assert.equal(JSON.stringify(node), before);
  assert.match(html, /data-flow-node-key="fallback-40"/);
  assert.match(html, /data-flow-material-name=""/);
  assert.match(html, /data-flow-required=""/);
  assert.match(html, /data-flow-status="Estoque atende"/);
  assert.match(html, /Produ&amp;ccedil;&amp;atilde;o 2/);
  assert.match(html, /<span class="stock-only-info">✓ Utilizando saldo<\/span>/);
  assert.doesNotMatch(html, /data-stock-only/);
});
