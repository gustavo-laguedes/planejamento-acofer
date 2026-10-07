import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const brDate = value => { const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '-'); };
const brDateTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(date); };
const ptNumber = (value, digits = 3) => num(value).toLocaleString('pt-BR', { maximumFractionDigits: digits });

function display(value, format = 'text') {
  if (value === null || value === undefined || value === '') return '-';
  if (format === 'date') return brDate(value);
  if (format === 'integer') return ptNumber(value, 0);
  if (format === 'number2') return ptNumber(value, 2);
  if (format === 'number3') return ptNumber(value, 3);
  if (format === 'number6') return ptNumber(value, 6);
  if (format === 'kg') return `${ptNumber(value, 3)} kg`;
  if (format === 'percent') return `${ptNumber(value, 2)}%`;
  return String(value);
}

function excelFormat(format) {
  return ({ integer: '#,##0', number2: '#,##0.00', number3: '#,##0.000', kg: '#,##0.000', number6: '#,##0.000000' })[format] || null;
}

function safeSheet(value, used) {
  const base = String(value || 'Relatório').replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Relatório';
  let name = base;
  let index = 2;
  while (used.has(name)) { const suffix = ` ${index++}`; name = `${base.slice(0, 31 - suffix.length)}${suffix}`; }
  used.add(name);
  return name;
}

function styleHeader(row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F343B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

export async function createDashboardReportXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aço-Fer / LINE';
  workbook.created = new Date();
  const used = new Set();
  const summary = workbook.addWorksheet(safeSheet('Resumo', used));
  summary.columns = [{ width: 34 }, { width: 24 }];
  summary.mergeCells('A1:B1'); summary.getCell('A1').value = report.title; summary.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FF172033' } };
  summary.mergeCells('A2:B2'); summary.getCell('A2').value = report.description;
  summary.getCell('A3').value = 'Período'; summary.getCell('B3').value = `${brDate(report.period.startDate)} até ${brDate(report.period.endDate)}`;
  summary.getCell('A4').value = 'Gerado em'; summary.getCell('B4').value = brDateTime(report.generatedAt);
  styleHeader(summary.addRow(['Indicador', 'Valor']));
  for (const item of report.summary || []) {
    const row = summary.addRow([item.label, num(item.value)]);
    if (item.format === 'percent') { row.getCell(2).value = num(item.value) / 100; row.getCell(2).numFmt = '0.00%'; }
    else { const format = excelFormat(item.format); if (format) row.getCell(2).numFmt = format; }
  }
  for (const section of report.sections || []) {
    const columns = section.columns || [];
    const sheet = workbook.addWorksheet(safeSheet(section.title, used));
    sheet.columns = columns.map(item => ({ header: item.label, key: item.key, width: Math.min(34, Math.max(12, String(item.label || '').length + 5)) }));
    styleHeader(sheet.getRow(1)); sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const source of section.rows || []) {
      const row = sheet.addRow(Object.fromEntries(columns.map(item => [item.key, item.format === 'date' ? brDate(source?.[item.key]) : ['integer', 'number2', 'number3', 'number6', 'kg', 'percent'].includes(item.format) ? num(source?.[item.key]) : source?.[item.key] ?? ''])));
      columns.forEach((item, index) => { const cell = row.getCell(index + 1); cell.alignment = { vertical: 'top', wrapText: true }; if (item.format === 'percent') { cell.value = num(source?.[item.key]) / 100; cell.numFmt = '0.00%'; } else { const format = excelFormat(item.format); if (format) cell.numFmt = format; } });
    }
    if (columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function header(doc, report) {
  const left = doc.page.margins.left; const right = doc.page.width - doc.page.margins.right;
  doc.fillColor('#D97706').font('Helvetica-Bold').fontSize(8).text('RELATÓRIO EXECUTIVO', left, 29, { width: right - left, align: 'right' });
  doc.fillColor('#172033').fontSize(18).text(report.title, left, 42, { width: right - left, align: 'right' });
  doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(`${brDate(report.period.startDate)} até ${brDate(report.period.endDate)}`, left, 66, { width: right - left, align: 'right' });
  doc.moveTo(left, 84).lineTo(right, 84).strokeColor('#D7DEE7').stroke();
}

function newPage(doc, report) { doc.addPage(); header(doc, report); return 102; }

function drawTable(doc, report, section) {
  let y = newPage(doc, report); const left = doc.page.margins.left; const width = doc.page.width - left - doc.page.margins.right; const columns = section.columns || []; const cellWidth = columns.length ? width / columns.length : width;
  doc.fillColor('#172033').font('Helvetica-Bold').fontSize(14).text(section.title, left, y); y += 24;
  const drawHeader = () => { columns.forEach((item, index) => { const x = left + index * cellWidth; doc.rect(x, y, cellWidth, 22).fillAndStroke('#2F343B', '#2F343B'); doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6).text(item.label, x + 3, y + 6, { width: cellWidth - 6, height: 12, align: 'center', ellipsis: true }); }); y += 22; };
  drawHeader();
  if (!(section.rows || []).length) { doc.fillColor('#64748B').font('Helvetica').fontSize(9).text('Sem dados no período.', left, y + 14, { width, align: 'center' }); return; }
  for (const [rowIndex, source] of (section.rows || []).entries()) {
    if (y + 24 > doc.page.height - 58) { y = newPage(doc, report); drawHeader(); }
    columns.forEach((item, index) => { const x = left + index * cellWidth; doc.rect(x, y, cellWidth, 24).fillAndStroke(rowIndex % 2 ? '#F8FAFC' : '#FFFFFF', '#D7DEE7'); doc.fillColor('#172033').font('Helvetica').fontSize(6.2).text(display(source?.[item.key], item.format), x + 3, y + 5, { width: cellWidth - 6, height: 14, ellipsis: true }); }); y += 24;
  }
}

export async function createDashboardReportPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, size: 'A4', layout: 'landscape', margins: { top: 28, right: 34, bottom: 48, left: 34 }, info: { Title: report.title, Author: 'Aço-Fer / LINE', Subject: report.description } });
    const chunks = []; doc.on('data', chunk => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)));
    let y = newPage(doc, report); const left = doc.page.margins.left; const width = doc.page.width - left - doc.page.margins.right;
    doc.fillColor('#64748B').font('Helvetica').fontSize(9).text(report.description, left, y, { width }); y += 28;
    for (const item of report.summary || []) { doc.fillColor('#172033').font('Helvetica-Bold').fontSize(9).text(`${item.label}: `, left, y, { continued: true }); doc.font('Helvetica').text(display(item.value, item.format)); y += 15; }
    for (const section of report.sections || []) drawTable(doc, report, section);
    doc.end();
  });
}
