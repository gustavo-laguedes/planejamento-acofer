import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(__dirname, '..', 'assets', 'logo-acofer.png');

function formatDate(value) {
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

function statusLabel(value) {
  const labels = { planned: 'Planejado', launched: 'Lancado', canceled: 'Cancelado' };
  return labels[String(value || '').toLowerCase()] || value || 'Sem status';
}

function treeRoots(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return Array.isArray(tree.children) && tree.materialName === 'Plano de producao' ? tree.children : [tree];
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
    title: node.productionTitle || `Producao ${Number(node.productionIndex ?? index) + 1}`,
    material: node.materialName,
    code: node.materialCode,
    quantity: node.requiredQty,
    unit: node.unit,
    machine: node.machineName,
    people: node.peopleCount,
    model: node.productionModelName,
    desiredDate: node.desiredDate
  }));
  if (rows.length) return rows;
  return [{
    title: 'Producao 1',
    material: plan.material_name,
    code: plan.material_code,
    quantity: plan.planned_qty,
    unit: plan.planned_unit,
    machine: plan.machine_name,
    people: plan.people_count,
    model: ''
  }];
}

function linkedProductions(operation) {
  if (!Array.isArray(operation.productionItems) || !operation.productionItems.length) {
    return operation.productionTitle || '-';
  }
  return operation.productionItems
    .map(item => `${item.productionTitle || `Producao ${Number(item.productionIndex || 0) + 1}`}: ${formatNumber(item.quantity)} ${item.unit || operation.unit || ''}`.trim())
    .join(' | ');
}

function collectAlerts(tree, operations) {
  const alerts = [];
  function visit(node) {
    if (!node) return;
    if (node.isInitialRawMaterial && Number(node.stockQty || 0) < Number(node.requiredQty || 0)) {
      alerts.push(`Estoque insuficiente: ${node.materialName} precisa ${formatNumber(node.requiredQty)} ${node.unit || ''} e possui ${formatNumber(node.stockQty)}.`);
    }
    (node.children || []).forEach(visit);
  }
  treeRoots(tree).forEach(visit);
  operations.forEach(operation => {
    if (Number(operation.teamAvailable || 0) && Number(operation.peopleCount || 0) > Number(operation.teamAvailable || 0)) {
      alerts.push(`Equipe excedida em ${operation.materialName}: ${operation.peopleCount} pessoas para ${operation.teamAvailable} disponiveis.`);
    }
  });
  return [...new Set(alerts)];
}

function drawFrame(doc, plan, pageNumber) {
  const code = plan.code || plan.id;
  doc.save();
  doc.font('Helvetica').fontSize(8).fillColor('#667085');
  doc.text(`Planejamento ${code}`, 48, doc.page.height - 34, { width: 240 });
  doc.text(`Pagina ${pageNumber}`, doc.page.width - 168, doc.page.height - 34, { width: 120, align: 'right' });
  doc.strokeColor('#e4e7ec').lineWidth(0.6)
    .moveTo(48, doc.page.height - 44)
    .lineTo(doc.page.width - 48, doc.page.height - 44)
    .stroke();
  doc.restore();
}

function ensureSpace(doc, plan, pageNumberRef, height = 80) {
  if (doc.y + height < doc.page.height - 58) return pageNumberRef.value;
  doc.addPage();
  pageNumberRef.value += 1;
  drawFrame(doc, plan, pageNumberRef.value);
  return pageNumberRef.value;
}

function sectionTitle(doc, plan, pageNumberRef, title) {
  ensureSpace(doc, plan, pageNumberRef, 42);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#123942').text(title);
  doc.moveDown(0.35);
}

function keyValueGrid(doc, plan, pageNumberRef, items, columns = 3) {
  const gap = 10;
  const startX = doc.page.margins.left;
  const width = (doc.page.width - doc.page.margins.left - doc.page.margins.right - (gap * (columns - 1))) / columns;
  items.forEach((item, index) => {
    if (index % columns === 0) ensureSpace(doc, plan, pageNumberRef, 58);
    const x = startX + ((index % columns) * (width + gap));
    const y = doc.y;
    doc.roundedRect(x, y, width, 44, 5).fillAndStroke('#f8fafb', '#e4e7ec');
    doc.fillColor('#667085').font('Helvetica-Bold').fontSize(7).text(item.label.toUpperCase(), x + 8, y + 8, { width: width - 16 });
    doc.fillColor('#101828').font('Helvetica-Bold').fontSize(9).text(String(item.value || '-'), x + 8, y + 22, { width: width - 16 });
    if (index % columns === columns - 1 || index === items.length - 1) doc.y = y + 52;
  });
}

function table(doc, plan, pageNumberRef, columns, rows) {
  const left = doc.page.margins.left;
  const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = columns.map(column => column.width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const scale = fullWidth / totalWidth;
  const scaled = widths.map(width => width * scale);

  function drawHeader() {
    ensureSpace(doc, plan, pageNumberRef, 34);
    let x = left;
    const y = doc.y;
    doc.rect(left, y, fullWidth, 22).fill('#123942');
    columns.forEach((column, index) => {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(column.label, x + 4, y + 7, { width: scaled[index] - 8 });
      x += scaled[index];
    });
    doc.y = y + 24;
  }

  drawHeader();
  rows.forEach((row, rowIndex) => {
    const values = columns.map(column => String(column.render ? column.render(row) : row[column.key] ?? ''));
    const height = Math.max(22, ...values.map((value, index) => doc.heightOfString(value, { width: scaled[index] - 8, fontSize: 7 }) + 12));
    if (doc.y + height > doc.page.height - 58) drawHeader();
    let x = left;
    const y = doc.y;
    doc.rect(left, y, fullWidth, height).fill(rowIndex % 2 ? '#ffffff' : '#f8fafb');
    values.forEach((value, index) => {
      doc.fillColor('#101828').font('Helvetica').fontSize(7).text(value || '-', x + 4, y + 6, { width: scaled[index] - 8 });
      x += scaled[index];
    });
    doc.y = y + height;
  });
  if (!rows.length) {
    doc.fillColor('#667085').font('Helvetica').fontSize(9).text('Sem registros.', left + 6, doc.y + 6);
    doc.moveDown();
  }
}

function renderFlow(doc, plan, pageNumberRef, node, level = 0) {
  ensureSpace(doc, plan, pageNumberRef, 30);
  const status = node.isInitialRawMaterial
    ? Number(node.stockQty || 0) >= Number(node.requiredQty || 0) ? 'materia-prima com saldo' : 'comprar / materia-prima inicial'
    : Number(node.produceQty || 0) > 0 ? 'produzir' : 'usar saldo';
  const indent = level * 14;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#101828')
    .text(`${' '.repeat(level * 2)}${node.materialName || '-'}`, 48 + indent, doc.y, { continued: false, width: 500 - indent });
  doc.font('Helvetica').fontSize(7).fillColor('#667085')
    .text(`Necessario ${formatNumber(node.requiredQty)} ${node.unit || ''} | Saldo ${formatNumber(node.stockQty)} | A produzir ${formatNumber(node.produceQty)} | ${status}`, 58 + indent, doc.y, { width: 500 - indent });
  doc.moveDown(0.25);
  (node.children || []).forEach(child => renderFlow(doc, plan, pageNumberRef, child, level + 1));
}

export function createPlanningPdf(plan, days, tree = null, operations = []) {
  tree = normalizeObject(tree);
  operations = normalizeArray(operations);
  const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: false });
  const chunks = [];
  const pageNumberRef = { value: 1 };
  const code = plan.code || plan.id;
  const rows = productionRows(tree, plan);
  const operationRows = operations.map((operation, index) => ({ ...operation, sequence: index + 1 }));
  const alerts = collectAlerts(tree, operations);
  const transports = operations.filter(operation => operation.operationType === 'transport');
  const firstOperation = operations[0];
  const lastOperation = operations[operations.length - 1];

  doc.on('data', chunk => chunks.push(chunk));

  drawFrame(doc, plan, pageNumberRef.value);
  if (fs.existsSync(logoPath)) doc.image(logoPath, 48, 42, { width: 92 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#123942').text('Planejamento de Producao', 160, 48, { align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#667085').text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 160, 76, { align: 'right' });
  doc.moveDown(3);

  keyValueGrid(doc, plan, pageNumberRef, [
    { label: 'Codigo do planejamento', value: code },
    { label: 'Periodo planejado', value: `${formatDate(plan.start_date)} ate ${formatDate(plan.end_date)}` },
    { label: 'Status', value: statusLabel(plan.status) },
    { label: 'Producoes', value: rows.length },
    { label: 'Materiais finais', value: rows.map(row => row.material).join(', ') },
    { label: 'Inicio/fim estimado', value: `${formatDateTime(firstOperation?.startDate, firstOperation?.startTime)} ate ${formatDateTime(lastOperation?.endDate, lastOperation?.endTime)}` }
  ], 3);

  sectionTitle(doc, plan, pageNumberRef, 'Resumo');
  keyValueGrid(doc, plan, pageNumberRef, [
    { label: 'Quantidades finais', value: rows.map(row => `${formatNumber(row.quantity)} ${row.unit || ''}`).join(' | ') },
    { label: 'Turnos', value: plan.hours_per_day ? `${formatNumber(plan.hours_per_day)} h/dia` : '-' },
    { label: 'Transportes', value: transports.length },
    { label: 'Total de operacoes', value: operations.length },
    { label: 'Data inicial', value: formatDateTime(firstOperation?.startDate, firstOperation?.startTime) },
    { label: 'Data final', value: formatDateTime(lastOperation?.endDate, lastOperation?.endTime) }
  ], 3);

  sectionTitle(doc, plan, pageNumberRef, 'Producoes');
  table(doc, plan, pageNumberRef, [
    { label: 'Producao', width: 64, render: row => row.title },
    { label: 'Material final', width: 120, render: row => [row.material, row.code].filter(Boolean).join('\n') },
    { label: 'Quantidade', width: 70, render: row => `${formatNumber(row.quantity)} ${row.unit || ''}`.trim() },
    { label: 'Maquina', width: 80, render: row => row.machine || '-' },
    { label: 'Pessoas', width: 46, render: row => row.people || '-' },
    { label: 'Modelo', width: 82, render: row => row.model || '-' },
    { label: 'Data desejada', width: 66, render: row => formatDate(row.desiredDate) || '-' }
  ], rows);

  sectionTitle(doc, plan, pageNumberRef, 'Operacoes / Calendario');
  table(doc, plan, pageNumberRef, [
    { label: '#', width: 22, render: row => row.sequence },
    { label: 'Material/operacao', width: 110, render: row => row.materialName || '-' },
    { label: 'Tipo', width: 54, render: row => row.operationType === 'transport' ? 'Transporte' : 'Producao' },
    { label: 'Qtd.', width: 48, render: row => `${formatNumber(row.produceQty)} ${row.unit || ''}`.trim() },
    { label: 'Maq.', width: 58, render: row => row.machineName || '-' },
    { label: 'Pess.', width: 34, render: row => row.peopleCount || '-' },
    { label: 'Inicio', width: 62, render: row => formatDateTime(row.startDate, row.startTime) },
    { label: 'Fim', width: 62, render: row => formatDateTime(row.endDate, row.endTime) },
    { label: 'Duracao', width: 48, render: row => formatDuration(row.totalMinutes) },
    { label: 'Producoes vinculadas', width: 110, render: linkedProductions }
  ], operationRows);

  sectionTitle(doc, plan, pageNumberRef, 'Fluxo produtivo');
  const roots = treeRoots(tree);
  if (roots.length) roots.forEach(root => renderFlow(doc, plan, pageNumberRef, root));
  else doc.font('Helvetica').fontSize(9).fillColor('#667085').text('Fluxo produtivo nao registrado.');

  sectionTitle(doc, plan, pageNumberRef, 'Alertas');
  if (alerts.length) {
    alerts.forEach(alert => {
      ensureSpace(doc, plan, pageNumberRef, 20);
      doc.font('Helvetica').fontSize(9).fillColor('#101828').text(`- ${alert}`);
    });
  } else {
    doc.font('Helvetica').fontSize(9).fillColor('#667085').text('Sem alertas registrados.');
  }

  doc.end();

  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
