import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bindPlanningFlowEvents,
  extractPlanningFlowNodeData
} from '../shared/planning-presentation/planningFlowEvents.js';

class FakeElement {
  constructor({ className = '', dataset = {}, parent = null } = {}) {
    this.className = className;
    this.dataset = dataset;
    this.parent = parent;
  }

  closest(selector) {
    if (selector === '.production-flow-node[data-flow-material-id]') {
      return this.findClosest(element =>
        String(element.className || '').split(/\s+/).includes('production-flow-node')
          && Object.prototype.hasOwnProperty.call(element.dataset || {}, 'flowMaterialId')
      );
    }
    if (selector === '[data-stock-only], .stock-only-toggle') {
      return this.findClosest(element =>
        Object.prototype.hasOwnProperty.call(element.dataset || {}, 'stockOnly')
          || String(element.className || '').split(/\s+/).includes('stock-only-toggle')
      );
    }
    return null;
  }

  findClosest(predicate) {
    let current = this;
    while (current) {
      if (predicate(current)) return current;
      current = current.parent;
    }
    return null;
  }
}

class FakeRoot {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(candidate => candidate !== listener));
  }

  dispatch(type, event) {
    (this.listeners.get(type) || []).forEach(listener => listener(event));
  }
}

function createFlowNode(dataset = {}) {
  return new FakeElement({
    className: 'production-flow-node needs-production',
    dataset: {
      flowNodeKey: 'node-10',
      flowMaterialId: '10',
      flowMaterialName: 'CA50 10mm',
      flowOperationIds: 'op-1,op-2',
      flowProductionIds: 'prod-a',
      flowRequired: '1.000',
      flowStock: '200',
      flowProduce: '800',
      flowUnit: 'kg',
      flowStatus: 'Precisa produzir',
      flowProductionIndexes: '0,1',
      ...dataset
    }
  });
}

function bindWithSpy(root = new FakeRoot()) {
  const calls = [];
  const unbind = bindPlanningFlowEvents({
    root,
    onActivateNode: detail => calls.push(detail)
  });
  return { root, calls, unbind };
}

test('bindPlanningFlowEvents preserva root ausente sem registrar eventos', () => {
  assert.equal(bindPlanningFlowEvents(), false);
  assert.equal(bindPlanningFlowEvents({ root: null, onActivateNode: () => {} }), false);
});

test('click no no chama callback uma unica vez com data attributes', () => {
  const { root, calls } = bindWithSpy();
  const node = createFlowNode();

  root.dispatch('click', { target: node });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].node, node);
  assert.equal(calls[0].activationType, 'click');
  assert.deepEqual(calls[0].data, extractPlanningFlowNodeData(node));
  assert.equal(calls[0].data.flowMaterialId, '10');
  assert.equal(calls[0].data.flowOperationIds, 'op-1,op-2');
  assert.equal(calls[0].data.flowProductionIndexes, '0,1');
});

test('click em filho do no ativa o no pai', () => {
  const { root, calls } = bindWithSpy();
  const node = createFlowNode();
  const child = new FakeElement({ className: 'production-flow-node-header', parent: node });

  root.dispatch('click', { target: child });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].node, node);
});

test('click no toggle de estoque dentro do no nao ativa detalhes/foco', () => {
  const { root, calls } = bindWithSpy();
  const node = createFlowNode();
  const toggle = new FakeElement({ className: 'stock-only-toggle', parent: node });
  const checkbox = new FakeElement({ dataset: { stockOnly: '' }, parent: toggle });

  root.dispatch('click', { target: checkbox });

  assert.equal(calls.length, 0);
});

test('Enter ativa o no e executa preventDefault', () => {
  const { root, calls } = bindWithSpy();
  const node = createFlowNode();
  let prevented = 0;

  root.dispatch('keydown', {
    target: node,
    key: 'Enter',
    preventDefault: () => { prevented += 1; }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].activationType, 'keyboard');
  assert.equal(prevented, 1);
});

test('Space ativa o no e executa preventDefault', () => {
  const { root, calls } = bindWithSpy();
  const node = createFlowNode();
  let prevented = 0;

  root.dispatch('keydown', {
    target: node,
    key: ' ',
    preventDefault: () => { prevented += 1; }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].activationType, 'keyboard');
  assert.equal(prevented, 1);
});

test('tecla irrelevante e clique fora do no nao chamam callback', () => {
  const { root, calls } = bindWithSpy();
  let prevented = 0;

  root.dispatch('keydown', {
    target: createFlowNode(),
    key: 'Escape',
    preventDefault: () => { prevented += 1; }
  });
  root.dispatch('click', { target: new FakeElement({ className: 'outside' }) });

  assert.equal(calls.length, 0);
  assert.equal(prevented, 0);
});

test('unbind remove listeners registrados', () => {
  const { root, calls, unbind } = bindWithSpy();

  unbind();
  root.dispatch('click', { target: createFlowNode() });

  assert.equal(calls.length, 0);
});

test('modulo de eventos nao executa modal, Gantt, renderer ou API', () => {
  const source = readFileSync('shared/planning-presentation/planningFlowEvents.js', 'utf8');

  assert.doesNotMatch(source, /renderPlanFlowDetail|focusPlanningFlowAllocation|focusAllocation|renderer|Gantt/i);
  assert.doesNotMatch(source, /modal|document\.createElement|fetch\(|api\./i);
  assert.doesNotMatch(source, /manualScheduleDraft|applyManualScheduleTransaction|moveDraftAllocation/);
});
