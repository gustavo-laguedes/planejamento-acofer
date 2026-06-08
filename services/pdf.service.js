import PDFDocument from 'pdfkit';

function renderTree(doc, node, level = 0) {
  if (!node) return;
  const prefix = '  '.repeat(level);
  doc.fontSize(10).text(`${prefix}${node.materialName} - necessário ${node.requiredQty} ${node.unit || ''} | estoque ${node.stockQty} | produzir ${node.produceQty} | ${node.status}`);
  for (const child of node.children || []) renderTree(doc, child, level + 1);
}

export function createPlanningPdf(plan, days, tree = null, operations = []) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));

  doc.fontSize(18).text('Programação de Produção', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Código: ${plan.code || plan.id}`);
  doc.text(`Material: ${plan.material_name}`);
  doc.text(`Máquina: ${plan.machine_name}`);
  doc.text(`Pessoas: ${plan.people_count}`);
  doc.text(`Quantidade total: ${plan.planned_qty} ${plan.planned_unit}`);
  doc.text(`Período: ${plan.start_date} até ${plan.end_date}`);
  doc.moveDown();

  doc.fontSize(14).text('Árvore produtiva');
  doc.moveDown(0.5);
  renderTree(doc, tree);
  doc.moveDown();

  doc.fontSize(14).text('Operações');
  doc.moveDown(0.5);
  operations.forEach(operation => {
    doc.fontSize(10).text(`${operation.materialName} | ${operation.machineName} | Pessoas: ${operation.peopleCount} | Quantidade: ${operation.produceQty} | ${operation.startDate} até ${operation.endDate}`);
  });
  doc.moveDown();

  doc.fontSize(14).text('Cronograma');
  doc.moveDown(0.5);
  days.forEach(day => {
    doc.fontSize(11).text(`${day.planned_date} - ${day.material_name}`);
    doc.fontSize(10).text(`Máquina: ${day.machine_name} | Pessoas: ${day.people_count} | Quantidade: ${day.planned_qty} ${day.planned_unit}`);
    if (day.notes) doc.text(`Observações: ${day.notes}`);
    doc.moveDown(0.4);
  });

  doc.end();

  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
