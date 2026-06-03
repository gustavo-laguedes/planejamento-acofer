export function DataTable({ columns, rows, emptyText = 'Nenhum registro encontrado.' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';

  if (!rows?.length) {
    wrapper.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return wrapper;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr>${columns.map(column => `<th>${column.label}</th>`).join('')}</tr></thead>
    <tbody></tbody>
  `;

  const body = table.querySelector('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map(column => `<td>${column.render ? column.render(row) : row[column.key] ?? ''}</td>`).join('');
    body.appendChild(tr);
  });

  wrapper.appendChild(table);
  return wrapper;
}
