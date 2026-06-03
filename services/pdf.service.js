import PDFDocument from 'pdfkit';

export function createPlanningPdf(plan, days) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));

  doc.fontSize(18).text('Programacao de Producao', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Material: ${plan.material_name}`);
  doc.text(`Maquina: ${plan.machine_name}`);
  doc.text(`Pessoas: ${plan.people_count}`);
  doc.text(`Quantidade total: ${plan.planned_qty} ${plan.planned_unit}`);
  doc.text(`Periodo: ${plan.start_date} ate ${plan.end_date}`);
  doc.moveDown();

  doc.fontSize(14).text('Lista por dia');
  doc.moveDown(0.5);
  days.forEach(day => {
    doc.fontSize(11).text(`${day.planned_date} - ${day.material_name}`);
    doc.fontSize(10).text(`Maquina: ${day.machine_name} | Pessoas: ${day.people_count} | Quantidade: ${day.planned_qty} ${day.planned_unit}`);
    if (day.notes) doc.text(`Observacoes: ${day.notes}`);
    doc.moveDown(0.4);
  });

  doc.end();

  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
