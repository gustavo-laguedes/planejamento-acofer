export function drawProductionFlowConnectors(root, { productionTheme = () => ({ border: '#2563eb' }) } = {}) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('[data-flow-graph]').forEach((graph, graphIndex) => {
    const svg = graph.querySelector('.production-flow-svg');
    const edgeScript = graph.querySelector('[data-flow-edges]');
    if (!svg || !edgeScript) return;

    let edges = [];
    try {
      edges = JSON.parse(edgeScript.textContent || '[]');
    } catch {
      edges = [];
    }

    const nodeMap = new Map();
    [...graph.querySelectorAll('[data-flow-node-key]')].forEach(node => {
      const key = node.dataset.flowNodeKey;
      if (!key) return;
      const current = nodeMap.get(key);
      const nodeHasProductionIndexes = node.hasAttribute('data-flow-production-indexes');
      const currentHasProductionIndexes = current?.hasAttribute?.('data-flow-production-indexes');
      if (!current || (nodeHasProductionIndexes && !currentHasProductionIndexes)) {
        nodeMap.set(key, node);
      }
    });

    const rect = graph.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const markerColors = new Map();
    const productionIndexesForNode = node => [...new Set(
      String(node?.dataset?.flowProductionIndexes || '')
        .split(',')
        .map(value => Number(value))
        .filter(Number.isFinite)
    )];
    const connectorAnchorY = (node, nodeRect, productionIndex) => {
      const productionIndexes = productionIndexesForNode(node);
      const baseTop = nodeRect.top - rect.top;
      if (productionIndexes.length <= 1) return baseTop + (nodeRect.height / 2);
      const slot = productionIndexes.findIndex(index => index === productionIndex);
      if (slot < 0) return baseTop + (nodeRect.height / 2);
      return baseTop + (nodeRect.height * ((slot + 1) / (productionIndexes.length + 1)));
    };
    const isConsolidatedGraph = graph.classList.contains('planning-program-consolidated-graph');

    const paths = edges.map((edge, edgeIndex) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return '';

      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const startX = fromRect.right - rect.left;
      const endX = toRect.left - rect.left;
      const productionIndex = Number(edge.productionIndex || 0);
      const startY = connectorAnchorY(from, fromRect, productionIndex);
      const endY = connectorAnchorY(to, toRect, productionIndex);
      const color = productionTheme(productionIndex, edge.color).border;
      const safeColor = String(color || '#2563eb').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const markerId = `production-flow-arrow-${graphIndex}-${safeColor}`;
      markerColors.set(markerId, color);

      let pathData;
      if (isConsolidatedGraph) {
        const distance = Math.max(endX - startX, 1);
        const curve = Math.max(24, Math.min(72, distance * 0.42));
        pathData = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
      } else {
        const laneOffset = Math.min(Math.max(productionIndex, 0), 8) * 8;
        const middleX = startX + Math.max(32, ((endX - startX) / 2) + laneOffset);
        pathData = `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
      }

      return `<path class="production-flow-connector" data-flow-edge-index="${edgeIndex}" style="--flow-color: ${color}" marker-end="url(#${markerId})" d="${pathData}" />`;
    }).join('');
    const markers = [...markerColors.entries()].map(([markerId, color]) => `
      <marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path class="production-flow-arrow" style="--flow-color: ${color}" d="M 0 0 L 10 5 L 0 10 z"></path>
      </marker>
    `).join('');
    svg.innerHTML = `<defs>${markers}</defs>${paths}`;
  });
}

export function scheduleProductionFlowConnectors(root, {
  requestAnimationFrame = globalThis.requestAnimationFrame,
  productionTheme
} = {}) {
  const draw = () => drawProductionFlowConnectors(root, { productionTheme });
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(draw);
  } else {
    draw();
  }
}

export function renderProductionFlowDom(container, html, options = {}) {
  if (!container) return false;
  container.innerHTML = html;
  scheduleProductionFlowConnectors(options.root || container, options);
  return true;
}
