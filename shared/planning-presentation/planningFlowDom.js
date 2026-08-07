export function drawProductionFlowConnectors(root, { productionTheme = () => ({ border: '#2563eb' }) } = {}) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('[data-flow-graph]').forEach(graph => {
    const svg = graph.querySelector('.production-flow-svg');
    const edgeScript = graph.querySelector('[data-flow-edges]');
    if (!svg || !edgeScript) return;
    let edges = [];
    try {
      edges = JSON.parse(edgeScript.textContent || '[]');
    } catch {
      edges = [];
    }
    const nodeMap = new Map([...graph.querySelectorAll('[data-flow-node-key]')]
      .map(node => [node.dataset.flowNodeKey, node]));
    const rect = graph.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
    const markerColors = new Map();
    const connectorAnchorY = (node, nodeRect, productionIndex) => {
      const productionIndexes = String(node.dataset.flowProductionIndexes || '')
        .split(',')
        .map(Number)
        .filter(Number.isFinite);
      const slot = productionIndexes.findIndex(index => index === productionIndex);
      if (slot < 0 || productionIndexes.length < 2) return nodeRect.top - rect.top + (nodeRect.height / 2);
      return nodeRect.top - rect.top + (nodeRect.height * ((slot + 0.5) / productionIndexes.length));
    };
    const paths = edges.map(edge => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return '';
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const startX = fromRect.right - rect.left;
      const productionIndex = Number(edge.productionIndex || 0);
      const startY = connectorAnchorY(from, fromRect, productionIndex);
      const endX = toRect.left - rect.left;
      const endY = connectorAnchorY(to, toRect, productionIndex);
      const color = productionTheme(productionIndex, edge.color).border;
      const markerId = `production-flow-arrow-${color.replace('#', '').toLowerCase()}`;
      markerColors.set(markerId, color);
      const laneOffset = Math.min(Math.max(productionIndex, 0), 8) * 8;
      const middleX = startX + Math.max(32, ((endX - startX) / 2) + laneOffset);
      return `<path class="production-flow-connector" style="--flow-color: ${color}" marker-end="url(#${markerId})" d="M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}" />`;
    }).join('');
    const markers = [...markerColors.entries()].map(([markerId, color]) => `
          <marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path class="production-flow-arrow" style="--flow-color: ${color}" d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
      `).join('');
    svg.innerHTML = `
        <defs>
          ${markers}
        </defs>
        ${paths}
      `;
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
