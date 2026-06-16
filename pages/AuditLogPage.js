import { api } from '../shared/api.js';
import { DataTable } from '../shared/DataTable.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const time = date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${day} ${time}`;
}

export function AuditLogPage() {
  const page = document.createElement('section');
  page.className = 'stack audit-log-page';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Log de Auditoria</h1>
        <p>Rastreabilidade das principais a&ccedil;&otilde;es realizadas no sistema.</p>
      </div>
    </div>
    <div class="panel">
      <form class="filters audit-filters">
        <label>Per&iacute;odo inicial<input name="startDate" type="date" /></label>
        <label>Per&iacute;odo final<input name="endDate" type="date" /></label>
        <label>Usu&aacute;rio<input name="user" type="search" placeholder="Nome ou e-mail" /></label>
        <button class="primary-button" type="submit">Filtrar</button>
        <button class="secondary-button clear-audit-filters" type="button">Limpar filtros</button>
      </form>
      <div class="table-target"></div>
    </div>
  `;

  const form = page.querySelector('form');
  const target = page.querySelector('.table-target');

  async function load() {
    const params = new URLSearchParams();
    if (form.elements.startDate.value) params.set('startDate', form.elements.startDate.value);
    if (form.elements.endDate.value) params.set('endDate', form.elements.endDate.value);
    if (form.elements.user.value.trim()) params.set('user', form.elements.user.value.trim());

    const rows = await api(`/audit${params.toString() ? `?${params}` : ''}`);
    target.innerHTML = '';
    target.appendChild(DataTable({
      columns: [
        { label: 'Data/Hora', render: row => formatDateTime(row.occurred_at), sortValue: row => row.occurred_at },
        { label: 'Usu&aacute;rio', render: row => escapeHtml(row.user_name || '-') },
        { label: 'Fun&ccedil;&atilde;o', render: row => escapeHtml(row.user_role || '-') },
        { label: 'A&ccedil;&atilde;o', render: row => escapeHtml(row.action) },
        { label: 'M&oacute;dulo', render: row => escapeHtml(row.module) },
        { label: 'Descri&ccedil;&atilde;o', render: row => escapeHtml(row.description) }
      ],
      rows,
      emptyText: 'Nenhum registro de auditoria encontrado.'
    }));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  page.querySelector('.clear-audit-filters').addEventListener('click', () => {
    form.reset();
    load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  });

  load().catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
  return page;
}
