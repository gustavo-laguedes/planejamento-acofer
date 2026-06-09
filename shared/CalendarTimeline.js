function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00`);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function eachDate(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function formatDate(date) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR') : '';
}

function formatDateLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
}

function formatQty(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function optionValue(option) {
  return `${option.machineName}||${option.peopleCount}`;
}

function operationValue(operation) {
  return `${operation.machineName}||${operation.peopleCount}`;
}

function modelOptions(operation) {
  return Array.isArray(operation.productionModelOptions) ? operation.productionModelOptions : [];
}

function barStyle(operation, dates) {
  const startIndex = Math.max(dates.indexOf(operation.startDate), 0);
  const endIndex = Math.max(dates.indexOf(operation.endDate), startIndex);
  return `--bar-start: ${startIndex + 1}; --bar-span: ${endIndex - startIndex + 1};`;
}

function showOperationModal(wrapper, operation) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${operation.materialName}</h2>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      <div class="operation-detail-grid">
        <article><span>Material</span><strong>${operation.materialName}</strong></article>
        <article><span>Quantidade</span><strong>${formatQty(operation.produceQty)} ${operation.unit || ''}</strong></article>
        <article><span>M&aacute;quina</span><strong>${operation.machineName || '-'}</strong></article>
        <article><span>Pessoas</span><strong>${operation.peopleCount || '-'}</strong></article>
        <article><span>Modelo de produ&ccedil;&atilde;o</span><strong>${operation.productionModelName || '-'}</strong></article>
        <article><span>Produtividade</span><strong>${formatQty(operation.outputQty)} ${operation.outputUnit || ''} em ${formatQty(operation.timeSeconds)}s</strong></article>
        <article class="wide"><span>Per&iacute;odo</span><strong>${formatDate(operation.startDate)} ${operation.startTime} at&eacute; ${formatDate(operation.endDate)} ${operation.endTime}</strong></article>
      </div>
    </div>
  `;
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
  });
  wrapper.appendChild(backdrop);
}

export function CalendarTimeline(days = [], operations = []) {
  const wrapper = document.createElement('section');
  wrapper.className = 'calendar-gantt';

  if (!operations.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calend&aacute;rio.</div>';
    return wrapper;
  }

  const knownDates = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean).sort();
  const dates = eachDate(knownDates[0], knownDates[knownDates.length - 1]);

  wrapper.innerHTML = `
    <div class="gantt-board">
      <div class="gantt-left gantt-header">
        <span>Material</span>
        <span>M&aacute;quina</span>
        <span>Pessoas</span>
        <span>Quantidade</span>
      </div>
      <div class="gantt-right gantt-header gantt-dates" style="--calendar-days: ${dates.length}">
        ${dates.map(date => `
          <div class="gantt-date" data-date="${date}">
            <strong>${formatDateLabel(date)}</strong>
            <span>${formatDate(date)}</span>
          </div>
        `).join('')}
      </div>
      ${operations.map(operation => {
        const machineOptions = operation.productivityOptions || [];
        const models = modelOptions(operation);
        const selectedModel = operation.productionModelMaterialId || models[0]?.materialId || '';
        return `
          <div class="gantt-left gantt-row-controls" data-operation-id="${operation.materialId}">
            <strong>${operation.materialName}</strong>
            <select data-action="machine" data-operation-material="${operation.materialId}" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
              ${machineOptions.map(option => `<option value="${optionValue(option)}" ${optionValue(option) === operationValue(operation) ? 'selected' : ''}>${option.machineName} / ${option.peopleCount}</option>`).join('')}
            </select>
            <select data-action="people" data-operation-material="${operation.materialId}" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
              ${machineOptions.map(option => `<option value="${optionValue(option)}" ${optionValue(option) === operationValue(operation) ? 'selected' : ''}>${option.peopleCount}</option>`).join('')}
            </select>
            <span>${formatQty(operation.produceQty)} ${operation.unit || ''}</span>
            <label class="production-model-control">Modelo
              <select data-action="model" data-operation-material="${operation.materialId}" ${models.length > 1 ? '' : 'disabled data-locked="true"'}>
                ${models.length ? models.map(model => `<option value="${model.materialId}" ${String(model.materialId) === String(selectedModel) ? 'selected' : ''}>${model.materialName}</option>`).join('') : '<option value="">Sem origem</option>'}
              </select>
            </label>
          </div>
          <div class="gantt-right gantt-row" style="--calendar-days: ${dates.length}">
            <button class="gantt-bar" type="button" draggable="true" data-operation-material="${operation.materialId}" style="${barStyle(operation, dates)}">
              <strong>${operation.materialName}</strong>
              <span>${formatQty(operation.produceQty)} ${operation.unit || ''} | ${operation.machineName || '-'} | ${operation.peopleCount || '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>
              <small>${formatDate(operation.startDate)} ${operation.startTime} - ${formatDate(operation.endDate)} ${operation.endTime}</small>
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  wrapper.addEventListener('change', event => {
    const materialId = event.target.dataset.operationMaterial;
    if (!materialId) return;
    const row = event.target.closest('.gantt-row-controls');
    const machineSelect = row?.querySelector('[data-action="machine"]');
    const modelSelect = row?.querySelector('[data-action="model"]');
    const [machineName, peopleCount] = (machineSelect?.value || '').split('||');
    wrapper.dispatchEvent(new CustomEvent('operation-config-change', {
      bubbles: true,
      detail: {
        materialId,
        machineName,
        peopleCount: Number(peopleCount || 0),
        productionModelMaterialId: modelSelect?.value || null
      }
    }));
  });

  wrapper.addEventListener('click', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    const operation = operations.find(item => String(item.materialId) === String(bar.dataset.operationMaterial));
    if (operation) showOperationModal(wrapper, operation);
  });

  wrapper.addEventListener('dragstart', event => {
    const bar = event.target.closest('.gantt-bar');
    if (bar) event.dataTransfer.setData('text/plain', bar.dataset.operationMaterial);
  });

  wrapper.querySelectorAll('.gantt-date').forEach(dateCell => {
    dateCell.addEventListener('dragover', event => event.preventDefault());
    dateCell.addEventListener('drop', event => {
      event.preventDefault();
      const materialId = event.dataTransfer.getData('text/plain');
      if (!materialId) return;
      wrapper.dispatchEvent(new CustomEvent('operation-date-change', {
        bubbles: true,
        detail: { materialId, startDate: dateCell.dataset.date }
      }));
    });
  });

  return wrapper;
}
