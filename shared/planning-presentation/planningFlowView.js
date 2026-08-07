import {
  escapeHtml,
  formatPtBrDecimal
} from './planningFormatters.js';

function flowNodeStatus(node, checked, produceQty, stockUsedQty, stockQty, requiredQty) {
  if (node.isInitialRawMaterial) {
    if (stockQty >= requiredQty) return { label: 'Estoque suficiente', className: 'stock-ok' };
    return { label: stockQty > 0 ? 'Estoque insuficiente' : 'Comprar / mat&eacute;ria-prima inicial', className: 'raw-warning' };
  }
  if (checked && produceQty <= 0) return { label: 'Estoque atende', className: 'stock-ok' };
  if (checked && stockUsedQty > 0) return { label: 'Utilizando saldo', className: 'using-stock' };
  if (produceQty > 0) return { label: checked ? 'Precisa produzir' : 'Produ&ccedil;&atilde;o cheia', className: checked ? 'needs-production' : 'full-production' };
  return { label: 'Estoque atende', className: 'stock-ok' };
}

function nodeUsesStockBalance(node) {
  if (!node || node.isInitialRawMaterial || node.isFinalProduct === true) return false;
  const requiredQty = Number(node.requiredQty || 0);
  const produceQty = Number(node.produceQty || 0);
  const stockUsedQty = Number(node.stockUsedQty || 0);
  return stockUsedQty > 0 || (requiredQty > 0 && produceQty <= 0);
}

function renderStockBalanceInfo(node) {
  return nodeUsesStockBalance(node)
    ? '<span class="stock-only-info">✓ Utilizando saldo</span>'
    : '';
}

export function renderFlowNodeCard(node, options = {}) {
  const {
    consolidatedStockOnlyChecked = () => false,
    flowNodeKey = () => '',
    hasStockAvailable = candidate => Number(candidate?.stockQty || 0) > 0,
    planningFlowNodeStockBalanceChecked = ({ checked = false } = {}) => checked === true,
    productionCardSegmentStyle = () => '',
    productionSegmentStyle = () => '',
    productionThemeStyle = () => ''
  } = options;
  const productions = Array.isArray(node.productions) && node.productions.length
    ? node.productions
    : [{ index: Number(node.productionIndex || 0), title: node.productionTitle || `Produ&ccedil;&atilde;o ${Number(node.productionIndex || 0) + 1}`, color: node.productionColor }];
  const productionIndex = Number(productions[0]?.index || node.productionIndex || 0);
  const stockQty = Number(node.stockQty || 0);
  const isFinalProduct = node.isFinalProduct === true;
  const canUseStock = !isFinalProduct && hasStockAvailable(node);
  const requiredQty = Number(node.requiredQty || 0);
  const produceQty = Number(node.produceQty || 0);
  const stockUsedQty = Number(node.stockUsedQty || 0);
  const checked = consolidatedStockOnlyChecked(productions, node.materialId)
    || node.forceStockOnly === true
    || stockUsedQty > 0;
  const effectiveChecked = planningFlowNodeStockBalanceChecked({ node, checked, canUseStock });
  const status = flowNodeStatus(node, effectiveChecked, produceQty, stockUsedQty, stockQty, requiredQty);
  const rawMaterialWarning = node.isInitialRawMaterial && stockQty < requiredQty;
  const operationIds = Array.isArray(node.operationIds) ? node.operationIds : [];
  const productionIds = Array.isArray(node.productionIds) ? node.productionIds : [];
  return `
        <div class="production-flow-node${produceQty > 0 ? ' needs-production' : ' stock-covered'}${rawMaterialWarning ? ' raw-material-warning' : ''}" role="button" tabindex="0" data-flow-node-key="${escapeHtml(node.flowKey || flowNodeKey(node))}" data-flow-material-id="${escapeHtml(node.materialId || '')}" data-flow-material-name="${escapeHtml(node.materialName || '')}" data-flow-operation-ids="${escapeHtml(operationIds.join(','))}" data-flow-production-ids="${escapeHtml(productionIds.join(','))}" data-flow-required="${escapeHtml(formatPtBrDecimal(node.requiredQty))}" data-flow-stock="${escapeHtml(formatPtBrDecimal(node.stockQty))}" data-flow-produce="${escapeHtml(formatPtBrDecimal(node.produceQty))}" data-flow-unit="${escapeHtml(node.unit || '')}" data-flow-status="${escapeHtml(status.label)}" data-flow-production-indexes="${escapeHtml(productions.map(production => Number(production.index || 0)).join(','))}" style="${productionThemeStyle(productionIndex, productions[0]?.color || node.productionColor)}; ${productionCardSegmentStyle(productions)}">
          <div class="production-flow-node-header">
            <div>
              <strong>${escapeHtml(node.materialName)}</strong>
            </div>
            <span class="production-flow-status ${status.className}">${status.label}</span>
          </div>
          <div class="production-flow-production-markers" style="${escapeHtml(productionSegmentStyle(productions))}" title="${escapeHtml(productions.map(item => item.title || `Produ&ccedil;&atilde;o ${Number(item.index || 0) + 1}`).join(' | '))}" aria-hidden="true"></div>
          <div class="production-flow-metrics">
            ${node.isInitialRawMaterial
              ? '<span>Origem: <strong>Compra / base</strong></span>'
              : `<span>A produzir: <strong>${formatPtBrDecimal(node.produceQty)} ${escapeHtml(node.unit || '')}</strong></span>`}
          </div>
          ${options.readOnlyStockToggle ? renderStockBalanceInfo(node) : node.isInitialRawMaterial || isFinalProduct ? '' : `<label class="stock-only-toggle"${canUseStock ? '' : ' title="Sem saldo disponível"'}>
            <input type="checkbox" data-stock-only data-production-indexes="${escapeHtml(productions.map(production => Number(production.index || 0)).join(','))}" data-material-id="${node.materialId}" ${effectiveChecked ? 'checked' : ''} ${canUseStock ? '' : 'disabled'} />
            <span>Utilizar saldo</span>
          </label>`}
        </div>
    `;
}

export function renderFlowGraph(trees, options = {}) {
  const {
    buildFlowGraph = () => ({ columns: [], edges: [] }),
    renderNodeCard = renderFlowNodeCard
  } = options;
  const graph = buildFlowGraph(trees);
  return `
      <div class="production-flow-graph" data-flow-graph>
        <svg class="production-flow-svg" aria-hidden="true"></svg>
        ${graph.columns.map((column, index) => `
          <div class="production-flow-column" data-flow-level="${index}">
            ${column.map(node => renderNodeCard(node, options)).join('')}
          </div>
        `).join('')}
        <span hidden data-flow-edges>${escapeHtml(JSON.stringify(graph.edges))}</span>
      </div>
    `;
}

export function renderFlowTree(node, level = 0) {
  if (!node) return '';
  const status = node.isInitialRawMaterial
    ? Number(node.stockQty || 0) >= Number(node.requiredQty || 0) ? 'Matéria-prima inicial com saldo' : 'Matéria-prima inicial / comprar'
    : Number(node.produceQty || 0) > 0 ? 'Produzir' : 'Usar saldo';
  return `
      <li>
        <div class="flow-tree-row" style="--flow-level: ${level}">
          <strong>${escapeHtml(node.materialName || '')}</strong>
          <span>Necessario ${formatPtBrDecimal(node.requiredQty)} ${escapeHtml(node.unit || '')}</span>
          <span>Saldo ${formatPtBrDecimal(node.stockQty)} ${escapeHtml(node.unit || '')}</span>
          <span>A produzir ${formatPtBrDecimal(node.produceQty)} ${escapeHtml(node.unit || '')}</span>
          <em>${escapeHtml(status)}</em>
        </div>
        ${(node.children || []).length ? `<ul>${node.children.map(child => renderFlowTree(child, level + 1)).join('')}</ul>` : ''}
      </li>
    `;
}
