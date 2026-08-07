import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drawProductionFlowConnectors,
  renderProductionFlowDom,
  scheduleProductionFlowConnectors
} from '../shared/planning-presentation/planningFlowDom.js';

class FakeElement {
  constructor({ dataset = {}, rect = {}, textContent = '' } = {}) {
    this.dataset = dataset;
    this.textContent = textContent;
    this.innerHTML = '';
    this.attributes = {};
    this.rect = {
      left: 0,
      top: 0,
      right: 0,
      width: 0,
      height: 0,
      ...rect
    };
  }

  getBoundingClientRect() {
    return this.rect;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

class FakeGraph extends FakeElement {
  constructor({ edges = [], nodes = [], rect = {} } = {}) {
    super({ rect });
    this.svg = new FakeElement();
    this.edgeScript = new FakeElement({ textContent: JSON.stringify(edges) });
    this.nodes = nodes;
  }

  querySelector(selector) {
    if (selector === '.production-flow-svg') return this.svg;
    if (selector === '[data-flow-edges]') return this.edgeScript;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-flow-node-key]') return this.nodes;
    return [];
  }
}

class FakeRoot {
  constructor(graphs = []) {
    this.graphs = graphs;
    this.innerHTML = '';
  }

  querySelectorAll(selector) {
    if (selector === '[data-flow-graph]') return this.graphs;
    return [];
  }
}

function flowNode(flowNodeKey, flowProductionIndexes, rect) {
  return new FakeElement({
    dataset: {
      flowNodeKey,
      flowProductionIndexes
    },
    rect
  });
}

test('renderProductionFlowDom preserva container ausente sem eventos ou foco Gantt', () => {
  let focused = false;
  const result = renderProductionFlowDom(null, '<div>Flow</div>', {
    requestAnimationFrame: callback => callback(),
    rendererHost: { focusAllocation: () => { focused = true; } }
  });

  assert.equal(result, false);
  assert.equal(focused, false);
});

test('renderProductionFlowDom insere HTML e agenda conectores no root informado', () => {
  const root = new FakeRoot();
  const container = new FakeRoot();
  let scheduled = 0;

  const result = renderProductionFlowDom(container, '<section class="production-flow-graph">novo</section>', {
    root,
    requestAnimationFrame: callback => {
      scheduled += 1;
      callback();
    },
    productionTheme: () => ({ border: '#123456' })
  });

  assert.equal(result, true);
  assert.equal(container.innerHTML, '<section class="production-flow-graph">novo</section>');
  assert.equal(scheduled, 1);
});

test('drawProductionFlowConnectors cria conectores SVG para multiplos fluxos', () => {
  const firstGraph = new FakeGraph({
    rect: { left: 10, top: 20, width: 400, height: 200 },
    nodes: [
      flowNode('raw-a', '0,1', { left: 30, top: 60, right: 90, width: 60, height: 40 }),
      flowNode('final-a', '0', { left: 260, top: 80, right: 340, width: 80, height: 60 })
    ],
    edges: [{ from: 'raw-a', to: 'final-a', productionIndex: 1, color: '#00AA00' }]
  });
  const secondGraph = new FakeGraph({
    rect: { left: 0, top: 0, width: 300, height: 160 },
    nodes: [
      flowNode('raw-b', '0', { left: 20, top: 40, right: 70, width: 50, height: 30 }),
      flowNode('final-b', '0', { left: 180, top: 50, right: 240, width: 60, height: 30 })
    ],
    edges: [{ from: 'raw-b', to: 'final-b', productionIndex: 0, color: '#AA0000' }]
  });
  const root = new FakeRoot([firstGraph, secondGraph]);

  drawProductionFlowConnectors(root, {
    productionTheme: (index, color) => ({ border: color || (index === 1 ? '#00AA00' : '#AA0000') })
  });

  assert.equal(firstGraph.svg.attributes.viewBox, '0 0 400 200');
  assert.match(firstGraph.svg.innerHTML, /id="production-flow-arrow-00aa00"/);
  assert.match(firstGraph.svg.innerHTML, /class="production-flow-connector"/);
  assert.match(firstGraph.svg.innerHTML, /style="--flow-color: #00AA00"/);
  assert.match(firstGraph.svg.innerHTML, /d="M 80 70 H 173 V 90 H 250"/);
  assert.equal(secondGraph.svg.attributes.viewBox, '0 0 300 160');
  assert.match(secondGraph.svg.innerHTML, /id="production-flow-arrow-aa0000"/);
  assert.match(secondGraph.svg.innerHTML, /d="M 70 55 H 125 V 65 H 180"/);
});

test('drawProductionFlowConnectors limpa no re-render e preserva ausencia de edge valido', () => {
  const graph = new FakeGraph({
    rect: { left: 0, top: 0, width: 0, height: 0 },
    nodes: [flowNode('only', '0', { left: 0, top: 0, right: 10, width: 10, height: 10 })],
    edges: [{ from: 'missing', to: 'only', productionIndex: 0, color: '#AA0000' }]
  });
  graph.svg.innerHTML = '<path class="stale"></path>';

  drawProductionFlowConnectors(new FakeRoot([graph]), {
    productionTheme: () => ({ border: '#AA0000' })
  });

  assert.equal(graph.svg.attributes.viewBox, '0 0 1 1');
  assert.doesNotMatch(graph.svg.innerHTML, /stale/);
  assert.doesNotMatch(graph.svg.innerHTML, /production-flow-connector/);
  assert.match(graph.svg.innerHTML, /<defs>/);
});

test('scheduleProductionFlowConnectors usa fallback sincrono sem requestAnimationFrame', () => {
  const graph = new FakeGraph({
    rect: { left: 0, top: 0, width: 100, height: 100 },
    nodes: [
      flowNode('a', '0', { left: 0, top: 0, right: 10, width: 10, height: 10 }),
      flowNode('b', '0', { left: 50, top: 0, right: 60, width: 10, height: 10 })
    ],
    edges: [{ from: 'a', to: 'b', productionIndex: 0, color: '#000000' }]
  });

  scheduleProductionFlowConnectors(new FakeRoot([graph]), {
    requestAnimationFrame: null,
    productionTheme: () => ({ border: '#000000' })
  });

  assert.match(graph.svg.innerHTML, /production-flow-connector/);
});
