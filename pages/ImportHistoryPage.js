import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';

export function ImportHistoryPage() {
  const page = document.createElement('section');
  page.className = 'stack';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Historico de Importacoes</h1>
        <p>Acompanhe os arquivos processados e eventuais erros de importacao.</p>
      </div>
    </div>
    <div class="summary-grid"></div>
    <div class="panel table-target"></div>
  `;

  const columns = [
    { label: 'Data/hora', render: row => row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '' },
    { label: 'Arquivo', key: 'filename' },
    { label: 'Linhas', key: 'total_rows' },
    { label: 'Status', key: 'status' },
    { label: 'Erro', key: 'error_message' }
  ];

  api('/imports').then(rows => {
    const last = rows[0];
    page.querySelector('.summary-grid').innerHTML = `
      <article class="metric-card"><span>Ultima importacao</span><strong>${last ? new Date(last.created_at).toLocaleString('pt-BR') : 'Sem registros'}</strong></article>
      <article class="metric-card"><span>Status da ultima</span><strong>${last?.status || '-'}</strong></article>
    `;
    const target = page.querySelector('.table-target');
    target.appendChild(DataTable({ columns, rows }));
  }).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));

  return page;
}
