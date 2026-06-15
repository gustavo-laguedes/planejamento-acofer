function stripHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value ?? '');
  return template.content.textContent || template.content.innerText || '';
}

function normalizeSortValue(value) {
  if (value === null || value === undefined) return { type: 'empty', value: '' };
  if (typeof value === 'number') return { type: 'number', value };
  const text = stripHtml(value).trim();
  if (!text) return { type: 'empty', value: '' };

  const numeric = Number(text.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  if (Number.isFinite(numeric) && /[\d]/.test(text)) return { type: 'number', value: numeric };

  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(text) ? Date.parse(text) : NaN;
  if (Number.isFinite(isoDate)) return { type: 'date', value: isoDate };

  const brDateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (brDateMatch) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = brDateMatch;
    return { type: 'date', value: new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime() };
  }

  return { type: 'text', value: text.toLocaleLowerCase('pt-BR') };
}

export function compareTableValues(a, b) {
  const left = normalizeSortValue(a);
  const right = normalizeSortValue(b);
  if (left.type === 'empty' && right.type !== 'empty') return 1;
  if (right.type === 'empty' && left.type !== 'empty') return -1;
  if (['number', 'date'].includes(left.type) && left.type === right.type) return left.value - right.value;
  return String(left.value).localeCompare(String(right.value), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function sortTableRows(rows, columns, sortState) {
  if (!sortState?.direction) return [...rows];
  const column = columns[sortState.index];
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const left = column.sortValue ? column.sortValue(a.row) : column.key ? a.row[column.key] : column.render?.(a.row);
      const right = column.sortValue ? column.sortValue(b.row) : column.key ? b.row[column.key] : column.render?.(b.row);
      const compared = compareTableValues(left, right);
      return (sortState.direction === 'asc' ? compared : -compared) || a.index - b.index;
    })
    .map(item => item.row);
}

export function nextSortDirection(currentDirection) {
  if (!currentDirection) return 'asc';
  if (currentDirection === 'asc') return 'desc';
  return null;
}

export function DataTable({ columns, rows, emptyText = 'Nenhum registro encontrado.', rowClass = null }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';

  if (!rows?.length) {
    wrapper.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return wrapper;
  }

  const table = document.createElement('table');
  let sortState = { index: null, direction: null };

  table.innerHTML = `
    <thead><tr>${columns.map((column, index) => `
      <th>
        <button class="sortable-header" type="button" data-sort-index="${index}" aria-label="Ordenar por ${column.label}">
          <span>${column.label}</span>
          <span class="sort-indicator" aria-hidden="true">↕</span>
        </button>
      </th>
    `).join('')}</tr></thead>
    <tbody></tbody>
  `;

  const body = table.querySelector('tbody');

  function renderBody() {
    const sortedRows = sortTableRows(rows, columns, sortState);
    body.innerHTML = '';
    sortedRows.forEach(row => {
      const tr = document.createElement('tr');
      const className = typeof rowClass === 'function' ? rowClass(row) : '';
      if (className) tr.className = className;
      tr.innerHTML = columns.map(column => `<td>${column.render ? column.render(row) : row[column.key] ?? ''}</td>`).join('');
      body.appendChild(tr);
    });
  }

  function renderIndicators() {
    table.querySelectorAll('.sortable-header').forEach(button => {
      const index = Number(button.dataset.sortIndex);
      const indicator = button.querySelector('.sort-indicator');
      indicator.textContent = sortState.index === index && sortState.direction
        ? sortState.direction === 'asc' ? '↑' : '↓'
        : '↕';
      button.classList.toggle('active', sortState.index === index && Boolean(sortState.direction));
    });
  }

  table.querySelector('thead').addEventListener('click', event => {
    const button = event.target.closest('.sortable-header');
    if (!button) return;
    const index = Number(button.dataset.sortIndex);
    const currentDirection = sortState.index === index ? sortState.direction : null;
    sortState = { index, direction: nextSortDirection(currentDirection) };
    if (!sortState.direction) sortState.index = null;
    renderIndicators();
    renderBody();
  });

  renderIndicators();
  renderBody();

  wrapper.appendChild(table);
  return wrapper;
}
