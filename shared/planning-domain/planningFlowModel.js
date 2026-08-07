function defaultIsPlanningRootName(value) {
  return ['Plano de producao', 'Plano de produção'].includes(String(value || ''));
}

export function selectProductionFlowTrees(result, { isPlanningRootName = defaultIsPlanningRootName } = {}) {
  return result?.tree?.children?.length && isPlanningRootName(result.tree.materialName)
    ? result.tree.children
    : result?.tree ? [result.tree] : [];
}

export function resolveFlowNodeModelName(node = {}, { operationOverrides = {}, productions = [] } = {}) {
  const productionIndex = Number(node.productionIndex || 0);
  const materialId = String(node.materialId ?? '');
  const scopedOverride = operationOverrides?.[`${productionIndex}:${materialId}`];
  const materialOverride = operationOverrides?.[materialId];
  const rootProduction = productions?.[productionIndex];
  const rootModelName = String(rootProduction?.materialId || '') === materialId
    ? rootProduction?.productionModelName
    : null;
  return node.productionModelName
    || scopedOverride?.productionModelName
    || materialOverride?.productionModelName
    || rootModelName
    || '';
}

export function buildFlowNodeKey(node = {}, options = {}) {
  return [
    node.materialId,
    node.materialCode,
    node.materialName,
    node.unit,
    resolveFlowNodeModelName(node, options)
  ].map(value => String(value ?? '').trim().toLocaleLowerCase('pt-BR')).join('|');
}

export function normalizeFlowQuantities(node = {}) {
  const stockUsedQty = Number(node.stockUsedQty || 0);
  const produceQty = Number(node.produceQty || 0);
  const requiredQty = Math.max(Number(node.requiredQty || 0), stockUsedQty + produceQty);
  return {
    requiredQty,
    stockUsedQty: Math.min(stockUsedQty, requiredQty),
    produceQty: Math.min(produceQty, requiredQty)
  };
}

function stockOnlyNodeKey(node = {}) {
  return `${Number(node?.productionIndex || 0)}:${Number(node?.materialId)}`;
}

function mergeFlowNode(targetNode, sourceNode) {
  const productionKey = String(sourceNode.productionKey || `production-${Number(sourceNode.productionIndex || 0)}`);
  const sourceQuantities = normalizeFlowQuantities(sourceNode);
  if (!targetNode.productionKeys.has(productionKey)) {
    targetNode.requiredQty = Number(targetNode.requiredQty || 0) + sourceQuantities.requiredQty;
    targetNode.stockUsedQty = Number(targetNode.stockUsedQty || 0) + sourceQuantities.stockUsedQty;
    targetNode.produceQty = Number(targetNode.produceQty || 0) + sourceQuantities.produceQty;
  } else {
    targetNode.requiredQty = Math.max(Number(targetNode.requiredQty || 0), sourceQuantities.requiredQty);
    targetNode.stockUsedQty = Math.max(Number(targetNode.stockUsedQty || 0), sourceQuantities.stockUsedQty);
    targetNode.produceQty = Math.max(Number(targetNode.produceQty || 0), sourceQuantities.produceQty);
  }
  targetNode.stockQty = Math.max(Number(targetNode.stockQty || 0), Number(sourceNode.stockQty || 0));
  targetNode.forceStockOnly = targetNode.forceStockOnly || sourceNode.forceStockOnly;
  targetNode.isInitialRawMaterial = targetNode.isInitialRawMaterial || sourceNode.isInitialRawMaterial;
  targetNode.productionKeys.add(productionKey);
  [
    sourceNode.operationId,
    sourceNode.parentOperationId,
    sourceNode.calendarParentOperationId,
    sourceNode.splitParentOperationId
  ].map(value => String(value ?? '').trim()).filter(Boolean)
    .forEach(value => targetNode.operationIds.add(value));
  [
    sourceNode.productionId,
    sourceNode.productionKey
  ].map(value => String(value ?? '').trim()).filter(Boolean)
    .forEach(value => targetNode.productionIds.add(value));
  if (!targetNode.productions.some(item => item.key === productionKey)) {
    targetNode.productions.push({
      key: productionKey,
      index: Number(sourceNode.productionIndex || 0),
      title: sourceNode.productionTitle || `Produ&ccedil;&atilde;o ${Number(sourceNode.productionIndex || 0) + 1}`,
      color: sourceNode.productionColor
    });
    targetNode.productions.sort((left, right) => Number(left.index || 0) - Number(right.index || 0));
  }
}

export function buildPlanningFlowGraph(roots, {
  isPlanningRootName = defaultIsPlanningRootName,
  operationOverrides = {},
  productions = []
} = {}) {
  const rootNodes = Array.isArray(roots) ? roots.filter(Boolean) : [roots].filter(Boolean);
  const finalProductKeys = new Set(rootNodes.map(stockOnlyNodeKey));
  const nodes = new Map();
  const incoming = new Map();
  const outgoing = new Map();
  const edgesByKey = new Map();

  function ensureNode(node) {
    const productionKey = String(node.productionKey || `production-${Number(node.productionIndex || 0)}`);
    const key = buildFlowNodeKey(node, { operationOverrides, productions });
    if (!nodes.has(key)) {
      const quantities = normalizeFlowQuantities(node);
      const operationIds = new Set([
        node.operationId,
        node.parentOperationId,
        node.calendarParentOperationId,
        node.splitParentOperationId
      ].map(value => String(value ?? '').trim()).filter(Boolean));
      const productionIds = new Set([
        node.productionId,
        node.productionKey
      ].map(value => String(value ?? '').trim()).filter(Boolean));
      nodes.set(key, {
        ...node,
        ...quantities,
        flowKey: key,
        flowOrder: nodes.size,
        isFinalProduct: finalProductKeys.has(stockOnlyNodeKey(node)),
        children: [],
        operationIds,
        productionIds,
        productionKeys: new Set([productionKey]),
        productions: [{
          key: productionKey,
          index: Number(node.productionIndex || 0),
          title: node.productionTitle || `Produ&ccedil;&atilde;o ${Number(node.productionIndex || 0) + 1}`,
          color: node.productionColor
        }]
      });
      incoming.set(key, new Set());
      outgoing.set(key, new Set());
    } else {
      const targetNode = nodes.get(key);
      mergeFlowNode(targetNode, node);
      targetNode.isFinalProduct = targetNode.isFinalProduct || finalProductKeys.has(stockOnlyNodeKey(node));
    }
    return key;
  }

  function visit(node, parentKey = null, stack = []) {
    if (!node) return;
    if (isPlanningRootName(node.materialName)) {
      (node.children || []).forEach(child => visit(child, parentKey, stack));
      return;
    }
    const key = ensureNode(node);
    if (parentKey && parentKey !== key) {
      incoming.get(parentKey).add(key);
      outgoing.get(key).add(parentKey);
      const productionKey = String(node.productionKey || `production-${Number(node.productionIndex || 0)}`);
      edgesByKey.set(`${key}:${parentKey}:${productionKey}`, {
        from: key,
        to: parentKey,
        productionIndex: Number(node.productionIndex || 0),
        color: node.productionColor || null
      });
    }
    if (stack.includes(key)) return;
    (node.children || []).forEach(child => visit(child, key, [...stack, key]));
  }

  rootNodes.forEach(root => visit(root));
  const levels = new Map();
  const sourceKeys = [...nodes.keys()].filter(key => !(incoming.get(key)?.size));

  function assignLevel(key, level, stack = []) {
    if (stack.includes(key)) return;
    levels.set(key, Math.max(levels.get(key) ?? 0, level));
    for (const childKey of outgoing.get(key) || []) {
      assignLevel(childKey, level + 1, [...stack, key]);
    }
  }

  sourceKeys.forEach(key => assignLevel(key, 0));
  const columns = [];
  for (const [key, node] of nodes.entries()) {
    const level = levels.get(key) ?? 0;
    if (!columns[level]) columns[level] = [];
    columns[level].push(node);
  }
  columns.forEach(column => column.sort((left, right) => Number(left.flowOrder || 0) - Number(right.flowOrder || 0)));
  const edges = [...edgesByKey.values()];
  const plainColumns = columns.map(column => column.map(node => {
    const { productionKeys, operationIds, productionIds, ...plainNode } = node;
    return {
      ...plainNode,
      operationIds: [...(operationIds || [])],
      productionIds: [...(productionIds || [])]
    };
  }));
  return { columns: plainColumns, edges };
}
