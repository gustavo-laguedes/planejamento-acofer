import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(__dirname, '..', 'assets', 'logo-acofer.png');

const THEMES = [
  { border: '#48a6b5', soft: '#e8f6f8', text: '#123942' },
  { border: '#de9642', soft: '#fff4e4', text: '#56320d' },
  { border: '#63b485', soft: '#ecf8f1', text: '#173d2e' },
  { border: '#7d90d8', soft: '#f0f3ff', text: '#26376f' },
  { border: '#cf7ca4', soft: '#fff0f6', text: '#552345' }
];

function formatDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10).split('-').reverse().join('/');
  }
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return '';
  return dateValue.split('-').reverse().join('/');
}

function formatDateTime(date, time) {
  return [formatDate(date), time].filter(Boolean).join(' ');
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 3
  });
}

function formatDuration(minutes) {
  const total = Math.max(Math.round(Number(minutes || 0)), 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${hours}h`;
}

function formatHourDuration(value) {
  const totalMinutes = Math.max(Math.round(Number(value || 0) * 60), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} h/dia`;
}

function statusLabel(value) {
  const labels = { planned: 'Planejado', launched: 'Lançado', canceled: 'Cancelado' };
  return labels[String(value || '').toLowerCase()] || value || 'Sem status';
}

function isPlanningRootName(value) {
  return ['Plano de producao', 'Plano de produção'].includes(String(value || ''));
}

function treeRoots(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return Array.isArray(tree.children) && isPlanningRootName(tree.materialName) ? tree.children : [tree];
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function productionRows(tree, plan) {
  const rows = treeRoots(tree).map((node, index) => ({
    title: node.productionTitle || `Produção ${Number(node.productionIndex ?? index) + 1}`,
    material: node.materialName,
    code: node.materialCode,
    quantity: node.requiredQty,
    unit: node.unit,
    machine: node.machineName,
    people: node.peopleCount,
    model: node.productionModelName
  }));
  if (rows.length) return rows;
  return [{
    title: 'Produção 1',
    material: plan.material_name,
    code: plan.material_code,
    quantity: plan.planned_qty,
    unit: plan.planned_unit,
    machine: plan.machine_name,
    people: plan.people_count,
    model: ''
  }];
}

function collectAlerts(tree, operations) {
  const alerts = [];
  function visit(node) {
    if (!node) return;
    if (node.isInitialRawMaterial && Number(node.stockQty || 0) < Number(node.requiredQty || 0)) {
      alerts.push(`Matéria-prima insuficiente: ${node.materialName} precisa ${formatNumber(node.requiredQty)} ${node.unit || ''} e possui ${formatNumber(node.stockQty)}.`);
    }
    if (!node.isInitialRawMaterial && Number(node.produceQty || 0) <= 0 && Number(node.requiredQty || 0) > 0) {
      alerts.push(`Material atendido por saldo: ${node.materialName}.`);
    }
    (node.children || []).forEach(visit);
  }
  treeRoots(tree).forEach(visit);
  operations.forEach(operation => {
    if (Number(operation.teamAvailable || 0) && Number(operation.peopleCount || 0) > Number(operation.teamAvailable || 0)) {
      alerts.push(`Equipe excedida em ${operation.materialName}: ${operation.peopleCount} pessoas para ${operation.teamAvailable} disponíveis.`);
    }
    if (operation.operationType === 'transport') {
      alerts.push(`Transporte pendente de conferência: ${operation.materialName}.`);
    }
  });
  return [...new Set(alerts)];
}

function linkedProductions(operation) {
  if (!Array.isArray(operation.productionItems) || !operation.productionItems.length) {
    return operation.productionTitle || '-';
  }
  return operation.productionItems
    .map(item => `${item.productionTitle || `Produção ${Number(item.productionIndex || 0) + 1}`}: ${formatNumber(item.quantity)} ${item.unit || operation.unit || ''}`.trim())
    .join(' | ');
}

function drawHeader(doc, title, plan, pageNumber) {
  doc.save();
  doc.rect(0, 0, doc.page.width, 76).fill('#f7fafb');
  doc.strokeColor('#d8e2e8').lineWidth(0.8).moveTo(42, 76).lineTo(doc.page.width - 42, 76).stroke();
  if (fs.existsSync(logoPath)) doc.image(logoPath, 42, 24, { width: 48 });
  doc.fillColor('#123942').font('Helvetica-Bold').fontSize(12).text(title, 150, 28, { width: 280 });
  doc.fillColor('#667085').font('Helvetica').fontSize(8).text(`Planejamento ${plan.code || plan.id}`, 150, 47, { width: 260 });
  doc.fillColor('#667085').fontSize(8).text(`Página ${pageNumber}`, doc.page.width - 130, 47, { width: 88, align: 'right' });
  doc.restore();
  doc.y = 100;
}

function addPage(doc, title, plan, pageNumberRef) {
  if (pageNumberRef.value > 0) doc.addPage();
  pageNumberRef.value += 1;
  drawHeader(doc, title, plan, pageNumberRef.value);
}

function pill(doc, text, x, y, width, color = '#123942') {
  doc.roundedRect(x, y, width, 20, 10).fill('#eef3f5');
  doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(text, x + 8, y + 6, { width: width - 16 });
}

function summaryCard(doc, label, value, x, y, width, height = 58) {
  doc.roundedRect(x, y, width, height, 6).fillAndStroke('#ffffff', '#d8e2e8');
  doc.fillColor('#667085').font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x + 10, y + 10, { width: width - 20 });
  doc.fillColor('#101828').font('Helvetica-Bold').fontSize(12).text(String(value ?? '-'), x + 10, y + 27, { width: width - 20, height: height - 32 });
}

function sectionTitle(doc, text, x, y, width = 511) {
  doc.fillColor('#123942').font('Helvetica-Bold').fontSize(11).text(text, x, y, { width });
  doc.strokeColor('#d8e2e8').lineWidth(0.7).moveTo(x, y + 18).lineTo(x + width, y + 18).stroke();
}

function drawTable(doc, columns, rows, x, y, width, options = {}) {
  const rowFontSize = options.fontSize || 7.5;
  const headerHeight = 24;
  const rowMinHeight = options.rowHeight || 28;
  const colWidths = columns.map(column => column.width);
  const total = colWidths.reduce((sum, item) => sum + item, 0);
  const scaled = colWidths.map(item => (item / total) * width);
  let cursorY = y;

  doc.rect(x, cursorY, width, headerHeight).fill('#123942');
  let cursorX = x;
  columns.forEach((column, index) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(column.label, cursorX + 5, cursorY + 8, { width: scaled[index] - 10 });
    cursorX += scaled[index];
  });
  cursorY += headerHeight;

  rows.forEach((row, rowIndex) => {
    const values = columns.map(column => String(column.render ? column.render(row) : row[column.key] ?? ''));
    const rowHeight = Math.max(rowMinHeight, ...values.map((value, index) => doc.heightOfString(value || '-', { width: scaled[index] - 10, fontSize: rowFontSize }) + 12));
    doc.rect(x, cursorY, width, rowHeight).fill(rowIndex % 2 ? '#ffffff' : '#f8fafb');
    doc.strokeColor('#e4e7ec').lineWidth(0.5).moveTo(x, cursorY + rowHeight).lineTo(x + width, cursorY + rowHeight).stroke();
    cursorX = x;
    values.forEach((value, index) => {
      doc.fillColor('#101828').font('Helvetica').fontSize(rowFontSize).text(value || '-', cursorX + 5, cursorY + 7, { width: scaled[index] - 10, height: rowHeight - 10 });
      cursorX += scaled[index];
    });
    cursorY += rowHeight;
  });

  if (!rows.length) {
    doc.rect(x, cursorY, width, rowMinHeight).fill('#ffffff');
    doc.fillColor('#667085').font('Helvetica').fontSize(9).text('Sem registros.', x + 8, cursorY + 8, { width: width - 16 });
    cursorY += rowMinHeight;
  }
  return cursorY;
}

function flowNodeKey(node) {
  return String(node.materialId ?? node.materialCode ?? node.materialName);
}

function mergeFlowNode(targetNode, sourceNode) {
  const productionKey = String(sourceNode.productionKey || `production-${Number(sourceNode.productionIndex || 0)}`);
  if (!targetNode.productionKeys.has(productionKey)) {
    targetNode.requiredQty = Number(targetNode.requiredQty || 0) + Number(sourceNode.requiredQty || 0);
    targetNode.stockUsedQty = Number(targetNode.stockUsedQty || 0) + Number(sourceNode.stockUsedQty || 0);
    targetNode.produceQty = Number(targetNode.produceQty || 0) + Number(sourceNode.produceQty || 0);
  } else {
    targetNode.requiredQty = Math.max(Number(targetNode.requiredQty || 0), Number(sourceNode.requiredQty || 0));
    targetNode.stockUsedQty = Math.max(Number(targetNode.stockUsedQty || 0), Number(sourceNode.stockUsedQty || 0));
    targetNode.produceQty = Math.max(Number(targetNode.produceQty || 0), Number(sourceNode.produceQty || 0));
  }
  targetNode.stockQty = Math.max(Number(targetNode.stockQty || 0), Number(sourceNode.stockQty || 0));
  targetNode.isInitialRawMaterial = targetNode.isInitialRawMaterial || sourceNode.isInitialRawMaterial;
  targetNode.productionKeys.add(productionKey);
  if (!targetNode.productions.some(item => item.key === productionKey)) {
    targetNode.productions.push({
      key: productionKey,
      index: Number(sourceNode.productionIndex || 0),
      title: sourceNode.productionTitle || `Produção ${Number(sourceNode.productionIndex || 0) + 1}`
    });
    targetNode.productions.sort((left, right) => Number(left.index || 0) - Number(right.index || 0));
  }
}

function buildFlowGraph(roots) {
  const nodes = new Map();
  const incoming = new Map();
  const outgoing = new Map();

  function ensureNode(node) {
    const key = flowNodeKey(node);
    if (!nodes.has(key)) {
      const productionKey = String(node.productionKey || `production-${Number(node.productionIndex || 0)}`);
      nodes.set(key, {
        ...node,
        flowKey: key,
        flowOrder: nodes.size,
        productionKeys: new Set([productionKey]),
        productions: [{
          key: productionKey,
          index: Number(node.productionIndex || 0),
          title: node.productionTitle || `Produção ${Number(node.productionIndex || 0) + 1}`
        }]
      });
      incoming.set(key, new Set());
      outgoing.set(key, new Set());
    } else {
      mergeFlowNode(nodes.get(key), node);
    }
    return key;
  }

  function visit(node, parentKey = null, stack = []) {
    if (!node) return;
    const key = ensureNode(node);
    if (parentKey && parentKey !== key) {
      incoming.get(parentKey).add(key);
      outgoing.get(key).add(parentKey);
    }
    if (stack.includes(key)) return;
    (node.children || []).forEach(child => visit(child, key, [...stack, key]));
  }

  roots.forEach(root => visit(root));
  const levels = new Map();
  const sourceKeys = [...nodes.keys()].filter(key => !(incoming.get(key)?.size));
  function assignLevel(key, level, stack = []) {
    if (stack.includes(key)) return;
    levels.set(key, Math.max(levels.get(key) ?? 0, level));
    for (const childKey of outgoing.get(key) || []) assignLevel(childKey, level + 1, [...stack, key]);
  }
  sourceKeys.forEach(key => assignLevel(key, 0));

  const columns = [];
  for (const [key, node] of nodes.entries()) {
    const level = levels.get(key) ?? 0;
    if (!columns[level]) columns[level] = [];
    columns[level].push(node);
  }
  columns.forEach(column => column.sort((left, right) => Number(left.flowOrder || 0) - Number(right.flowOrder || 0)));
  const edges = [];
  for (const [from, children] of outgoing.entries()) {
    for (const to of children) edges.push({ from, to });
  }
  return { columns, edges };
}

function nodeStatus(node) {
  const stockQty = Number(node.stockQty || 0);
  const requiredQty = Number(node.requiredQty || 0);
  const produceQty = Number(node.produceQty || 0);
  if (node.isInitialRawMaterial) return stockQty >= requiredQty ? 'Estoque suficiente' : 'Comprar / matéria-prima inicial';
  if (produceQty > 0) return 'Produção cheia';
  return 'Estoque atende';
}

function drawFlowCard(doc, node, x, y, width, height, positions) {
  const productionIndex = Number(node.productions?.[0]?.index || node.productionIndex || 0);
  const theme = THEMES[productionIndex % THEMES.length];
  const warning = node.isInitialRawMaterial && Number(node.stockQty || 0) < Number(node.requiredQty || 0);
  const border = warning ? '#e66f3f' : theme.border;
  doc.roundedRect(x, y, width, height, 7).fillAndStroke('#ffffff', border);
  doc.rect(x, y, 5, height).fill(border);
  const compact = height < 96;
  const ultra = height < 80;
  doc.fillColor('#101828').font('Helvetica-Bold').fontSize(ultra ? 6.4 : compact ? 7.2 : 8.5).text(node.materialName || '-', x + 10, y + 8, { width: width - 18, height: ultra ? 14 : compact ? 18 : 22 });
  doc.fillColor('#667085').font('Helvetica').fontSize(ultra ? 5.8 : 6.4).text(node.materialCode || '', x + 10, y + (ultra ? 22 : compact ? 25 : 29), { width: width - 18 });
  doc.roundedRect(x + 10, y + (ultra ? 31 : compact ? 36 : 43), width - 20, ultra ? 13 : compact ? 15 : 17, 8).fill(theme.soft);
  doc.fillColor(theme.text).font('Helvetica-Bold').fontSize(ultra ? 5.3 : compact ? 5.9 : 6.7).text(nodeStatus(node), x + 16, y + (ultra ? 35 : compact ? 40 : 48), { width: width - 32 });
  doc.fillColor('#667085').font('Helvetica').fontSize(ultra ? 5.7 : compact ? 6.2 : 7).text(`Necessário: ${formatNumber(node.requiredQty)} ${node.unit || ''}`, x + 10, y + (ultra ? 50 : compact ? 57 : 69), { width: width - 20 });
  doc.text(`Saldo: ${formatNumber(node.stockQty)} ${node.unit || ''}`, x + 10, y + (ultra ? 58 : compact ? 67 : 81), { width: width - 20 });
  const origin = node.isInitialRawMaterial ? 'Origem: Compra / base' : `A produzir: ${formatNumber(node.produceQty)} ${node.unit || ''}`;
  doc.text(origin, x + 10, y + (ultra ? 66 : compact ? 77 : 93), { width: width - 20 });
  positions.set(node.flowKey, { x, y, width, height });
}

function drawFlowGraph(doc, tree) {
  const roots = treeRoots(tree);
  if (!roots.length) {
    doc.fillColor('#667085').font('Helvetica').fontSize(10).text('Fluxo produtivo não registrado.');
    return;
  }
  const graph = buildFlowGraph(roots);
  const left = 42;
  const top = 112;
  const availableWidth = doc.page.width - 84;
  const availableHeight = doc.page.height - top - 58;
  const cardGap = 12;
  const levelsCount = Math.max(graph.columns.length, 1);
  const rowGap = levelsCount > 6 ? 12 : 28;
  const maxCardsInLevel = Math.max(1, ...graph.columns.map(column => column.length));
  const cardWidth = Math.max(96, Math.min(158, (availableWidth - cardGap * (maxCardsInLevel - 1)) / maxCardsInLevel));
  const cardHeight = Math.max(68, Math.min(104, (availableHeight - rowGap * (levelsCount - 1)) / levelsCount));
  const positions = new Map();

  graph.columns.forEach((column, levelIndex) => {
    const totalWidth = column.length * cardWidth + Math.max(column.length - 1, 0) * cardGap;
    let x = left + Math.max((availableWidth - totalWidth) / 2, 0);
    const y = top + levelIndex * (cardHeight + rowGap);
    column.forEach(node => {
      drawFlowCard(doc, node, x, y, cardWidth, cardHeight, positions);
      x += cardWidth + cardGap;
    });
  });

  graph.edges.forEach(edge => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    const startX = from.x + from.width / 2;
    const startY = from.y + from.height;
    const endX = to.x + to.width / 2;
    const endY = to.y;
    const mid = Math.max(12, (endY - startY) / 2);
    doc.save();
    doc.strokeColor('#9fb6c1').lineWidth(1.5)
      .moveTo(startX, startY)
      .bezierCurveTo(startX, startY + mid, endX, endY - mid, endX, endY)
      .stroke();
    doc.polygon([endX, endY], [endX - 5, endY - 6], [endX + 5, endY - 6]).fill('#9fb6c1');
    doc.restore();
  });
}

function drawPage1(doc, plan, rows, operations, transports, pageNumberRef) {
  addPage(doc, 'PLANEJAMENTO DE PRODUÇÃO', plan, pageNumberRef);
  const firstOperation = operations[0];
  const lastOperation = operations[operations.length - 1];
  doc.fillColor('#123942').font('Helvetica-Bold').fontSize(18).text('PLANEJAMENTO DE PRODUÇÃO', 42, 106, { width: 510 });
  doc.fillColor('#667085').font('Helvetica').fontSize(8).text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 42, 130);
  pill(doc, statusLabel(plan.status), 424, 108, 126);

  const infoY = 154;
  const info = [
    ['Código', plan.code || plan.id],
    ['Emissão', new Date().toLocaleDateString('pt-BR')],
    ['Período', `${formatDate(plan.start_date)} até ${formatDate(plan.end_date)}`],
    ['Responsável', 'PCP'],
    ['Turno', formatHourDuration(plan.hours_per_day)],
    ['Status', statusLabel(plan.status)]
  ];
  info.forEach((item, index) => {
    const x = 42 + (index % 3) * 170;
    const y = infoY + Math.floor(index / 3) * 40;
    doc.fillColor('#667085').font('Helvetica-Bold').fontSize(7).text(item[0].toUpperCase(), x, y);
    doc.fillColor('#101828').font('Helvetica-Bold').fontSize(9.5).text(String(item[1] || '-'), x, y + 14, { width: 150 });
  });

  const cardY = 244;
  const cardW = 158;
  summaryCard(doc, 'Produções', rows.length, 42, cardY, cardW, 50);
  summaryCard(doc, 'Operações', operations.length, 42 + cardW + 14, cardY, cardW, 50);
  summaryCard(doc, 'Transportes', transports.length, 42 + (cardW + 14) * 2, cardY, cardW, 50);
  summaryCard(doc, 'Início previsto', formatDateTime(firstOperation?.startDate, firstOperation?.startTime), 42, cardY + 64, cardW, 50);
  summaryCard(doc, 'Fim previsto', formatDateTime(lastOperation?.endDate, lastOperation?.endTime), 42 + cardW + 14, cardY + 64, cardW, 50);
  summaryCard(doc, 'Turno operacional', formatHourDuration(plan.hours_per_day), 42 + (cardW + 14) * 2, cardY + 64, cardW, 50);
  return cardY + 132;
}

function productionColumns() {
  return [
    { label: 'Produção', width: 76, render: row => row.title },
    { label: 'Material', width: 150, render: row => [row.material, row.code].filter(Boolean).join('\n') },
    { label: 'Quantidade', width: 82, render: row => `${formatNumber(row.quantity)} ${row.unit || ''}`.trim() },
    { label: 'Máquina', width: 78, render: row => row.machine || '-' },
    { label: 'Pessoas', width: 52, render: row => row.people || '-' },
    { label: 'Modelo', width: 92, render: row => row.model || '-' }
  ];
}

function operationColumns() {
  return [
    { label: 'Data', width: 58, render: row => formatDate(row.startDate) },
    { label: 'Hora', width: 54, render: row => `${row.startTime || ''} - ${row.endTime || ''}` },
    { label: 'Operação', width: 95, render: row => row.operationType === 'transport' ? 'Transporte' : 'Produção' },
    { label: 'Material', width: 122, render: row => row.materialName || '-' },
    { label: 'Máquina', width: 70, render: row => row.machineName || '-' },
    { label: 'Duração', width: 58, render: row => formatDuration(row.totalMinutes) },
    { label: 'Vínculo', width: 92, render: linkedProductions }
  ];
}

function drawSignatures(doc, plan, pageNumberRef) {
  addPage(doc, 'ASSINATURAS', plan, pageNumberRef);
  const items = ['PCP', 'Supervisor Produção', 'Data'];
  let y = 190;
  items.forEach(label => {
    doc.fillColor('#123942').font('Helvetica-Bold').fontSize(12).text(label, 90, y);
    doc.strokeColor('#98a2b3').lineWidth(1).moveTo(90, y + 54).lineTo(500, y + 54).stroke();
    y += 130;
  });
}

export function createPlanningPdf(plan, days, tree = null, operations = []) {
  tree = normalizeObject(tree);
  operations = normalizeArray(operations);
  const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: false });
  const chunks = [];
  const pageNumberRef = { value: 0 };
  const rows = productionRows(tree, plan);
  const operationRows = operations.map((operation, index) => ({ ...operation, sequence: index + 1 }));
  const transports = operations.filter(operation => operation.operationType === 'transport');

  doc.on('data', chunk => chunks.push(chunk));

  const page1TableY = drawPage1(doc, plan, rows, operations, transports, pageNumberRef);
  sectionTitle(doc, 'PRODUÇÕES PLANEJADAS', 42, page1TableY);
  const page1Rows = rows.slice(0, 6);
  const remainingProductionRows = rows.slice(page1Rows.length);
  drawTable(doc, productionColumns(), page1Rows, 42, page1TableY + 26, 511, { rowHeight: 30, fontSize: 6.8 });

  addPage(doc, 'PRODUÇÕES E CRONOGRAMA', plan, pageNumberRef);
  let cursorY = 116;
  if (remainingProductionRows.length) {
    sectionTitle(doc, 'PRODUÇÕES PLANEJADAS (CONTINUAÇÃO)', 42, cursorY);
    cursorY = drawTable(doc, productionColumns(), remainingProductionRows, 42, cursorY + 26, 511, { rowHeight: 30, fontSize: 6.8 }) + 20;
  }
  sectionTitle(doc, 'CRONOGRAMA OPERACIONAL', 42, cursorY);
  drawTable(doc, operationColumns(), operationRows, 42, cursorY + 26, 511, { rowHeight: 24, fontSize: 6.4 });

  addPage(doc, 'FLUXO PRODUTIVO', plan, pageNumberRef);
  drawFlowGraph(doc, tree);

  drawSignatures(doc, plan, pageNumberRef);
  doc.end();

  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
