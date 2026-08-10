const FLOW_NODE_SELECTOR = '.production-flow-node[data-flow-material-id]';
const FLOW_CLICK_IGNORE_SELECTOR = '[data-stock-only], .stock-only-toggle';
const FLOW_ACTIVATION_KEYS = new Set(['Enter', ' ']);

function closestFromEventTarget(target, selector) {
  return typeof target?.closest === 'function' ? target.closest(selector) : null;
}

export function extractPlanningFlowNodeData(node = {}) {
  const dataset = node?.dataset && typeof node.dataset === 'object' ? node.dataset : {};
  return { ...dataset };
}

export function bindPlanningFlowEvents({ root, onActivateNode } = {}) {
  if (!root?.addEventListener) return false;

  const activate = (event, activationType) => {
    const flowNode = closestFromEventTarget(event.target, FLOW_NODE_SELECTOR);
    if (!flowNode) return;
    onActivateNode?.({
      node: flowNode,
      data: extractPlanningFlowNodeData(flowNode),
      event,
      activationType
    });
  };

  const handleClick = event => {
    if (closestFromEventTarget(event.target, FLOW_CLICK_IGNORE_SELECTOR)) return;
    activate(event, 'click');
  };

  const handleKeydown = event => {
    if (!FLOW_ACTIVATION_KEYS.has(event.key)) return;
    const flowNode = closestFromEventTarget(event.target, FLOW_NODE_SELECTOR);
    if (!flowNode) return;
    event.preventDefault();
    onActivateNode?.({
      node: flowNode,
      data: extractPlanningFlowNodeData(flowNode),
      event,
      activationType: 'keyboard'
    });
  };

  root.addEventListener('click', handleClick);
  root.addEventListener('keydown', handleKeydown);

  return () => {
    root.removeEventListener?.('click', handleClick);
    root.removeEventListener?.('keydown', handleKeydown);
  };
}
