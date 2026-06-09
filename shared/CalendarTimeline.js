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

function dayDiff(startDate, endDate) {
  const start = Date.UTC(...startDate.split('-').map((part, index) => index === 1 ? Number(part) - 1 : Number(part)));
  const end = Date.UTC(...endDate.split('-').map((part, index) => index === 1 ? Number(part) - 1 : Number(part)));
  return Math.round((end - start) / 86400000);
}

function dateTimeMs(date, time = '00:00') {
  return new Date(`${date}T${time || '00:00'}`).getTime();
}

function dateTimeParts(date) {
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function snapMinutes(date, step = 15) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  copy.setMinutes(Math.round(copy.getMinutes() / step) * step);
  return copy;
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

function safeTime(value) {
  return value || '';
}

function operationStartTime(operation) {
  return safeTime(operation.startTime || operation.segments?.[0]?.startTime);
}

function operationEndTime(operation) {
  const segments = operation.segments || [];
  return safeTime(operation.endTime || segments[segments.length - 1]?.endTime);
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

function productionModelFallback(operation) {
  return operation.isInitialRawMaterial ? 'Mat&eacute;ria-prima inicial' : 'Sem origem';
}

function barStyle(operation, timelineStartMs, timelineEndMs) {
  const totalMs = Math.max(timelineEndMs - timelineStartMs, 1);
  const startMs = Math.max(timelineStartMs, Math.min(dateTimeMs(operation.startDate, operationStartTime(operation)), timelineEndMs));
  const endMs = Math.max(startMs, Math.min(dateTimeMs(operation.endDate, operationEndTime(operation)), timelineEndMs));
  const left = ((startMs - timelineStartMs) / totalMs) * 100;
  const width = Math.max(((endMs - startMs) / totalMs) * 100, 0.25);
  return `--bar-left: ${left}%; --bar-width: ${width}%;`;
}

function dateTimeFromDrop(event, row, calendarStartDate, calendarEndDate) {
  const rect = row.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(0.999, (event.clientX - rect.left) / rect.width));
  const startMs = dateTimeMs(calendarStartDate);
  const endMs = dateTimeMs(addDays(calendarEndDate, 1));
  const droppedAt = snapMinutes(new Date(startMs + ((endMs - startMs) * ratio)));
  const parts = dateTimeParts(droppedAt);
  return `${parts.date}T${parts.time}`;
}

function focusFirstOperation(wrapper, dates, operations) {
  const firstOperation = operations.find(operation => operation.startDate);
  const firstIndex = firstOperation ? dates.indexOf(firstOperation.startDate) : -1;
  if (firstIndex <= 0) return;
  requestAnimationFrame(() => {
    const board = wrapper.querySelector('.gantt-board');
    if (!board || !board.scrollWidth || !dates.length) return;
    board.scrollLeft = (board.scrollWidth / dates.length) * firstIndex;
  });
}

function dispatchConfig(wrapper, operation, modal) {
  const machineSelect = modal.querySelector('[name="machinePeople"]');
  const peopleSelect = modal.querySelector('[name="peopleMachine"]');
  const [machineName, peopleCount] = (peopleSelect?.value || machineSelect?.value || '').split('||');
  const modelSelect = modal.querySelector('[name="productionModel"]');
  const productionModelMaterialId = modelSelect?.value || null;
  if (
    machineName === operation.machineName
    && Number(peopleCount || 0) === Number(operation.peopleCount || 0)
    && String(productionModelMaterialId || '') === String(operation.productionModelMaterialId || '')
  ) return;
  wrapper.dispatchEvent(new CustomEvent('operation-config-change', {
    bubbles: true,
    detail: {
      materialId: String(operation.materialId),
      machineName,
      peopleCount: Number(peopleCount || 0),
      productionModelMaterialId
    }
  }));
}

function dispatchDate(wrapper, operation, modal) {
  const startDate = modal.querySelector('[name="operationStartDate"]')?.value;
  const startTime = modal.querySelector('[name="operationStartTime"]')?.value || operationStartTime(operation);
  const currentTime = operationStartTime(operation);
  if (!startDate || (startDate === operation.startDate && startTime === currentTime)) return;
  wrapper.dispatchEvent(new CustomEvent('operation-date-change', {
    bubbles: true,
    detail: { materialId: String(operation.materialId), startDate: `${startDate}T${startTime || currentTime || '00:00'}` }
  }));
}

function showOperationModal(wrapper, operation) {
  const machineOptions = operation.productivityOptions || [];
  const models = modelOptions(operation);
  const selectedModel = operation.productionModelMaterialId || models[0]?.materialId || '';
  const startTime = operationStartTime(operation);
  const endTime = operationEndTime(operation);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal operation-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${operation.materialName}</h2>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      <form class="operation-modal-form">
        <div class="operation-detail-grid">
          <article><span>Material</span><strong>${operation.materialName}</strong></article>
          <article><span>Quantidade</span><strong>${formatQty(operation.produceQty)} ${operation.unit || ''}</strong></article>
          <label>M&aacute;quina
            <select name="machinePeople" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
              ${machineOptions.map(option => `<option value="${optionValue(option)}" ${optionValue(option) === operationValue(operation) ? 'selected' : ''}>${option.machineName}</option>`).join('')}
            </select>
          </label>
          <label>Pessoas
            <select name="peopleMachine" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
              ${machineOptions.map(option => `<option value="${optionValue(option)}" ${optionValue(option) === operationValue(operation) ? 'selected' : ''}>${option.peopleCount}</option>`).join('')}
            </select>
          </label>
          <label>Modelo de produ&ccedil;&atilde;o
            <select name="productionModel" ${models.length > 1 ? '' : 'disabled data-locked="true"'}>
              ${models.length ? models.map(model => `<option value="${model.materialId}" ${String(model.materialId) === String(selectedModel) ? 'selected' : ''}>${model.materialName}</option>`).join('') : `<option value="">${productionModelFallback(operation)}</option>`}
            </select>
          </label>
          <article><span>Produtividade</span><strong>${formatQty(operation.outputQty)} ${operation.outputUnit || ''} em ${formatQty(operation.timeSeconds)}s</strong></article>
          <label>Data inicial
            <input name="operationStartDate" type="date" value="${operation.startDate || ''}" required />
          </label>
          <label>Hora inicial
            <input name="operationStartTime" type="time" value="${startTime}" required />
          </label>
          <article><span>Data final</span><strong>${formatDate(operation.endDate)}</strong></article>
          <article><span>Hora final</span><strong>${endTime}</strong></article>
        </div>
        <div class="form-actions modal-actions">
          <button class="secondary-button close-modal" type="button">Cancelar</button>
          <button class="primary-button" type="submit">Recalcular</button>
        </div>
      </form>
    </div>
  `;
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
  });
  backdrop.querySelectorAll('[name="machinePeople"], [name="peopleMachine"]').forEach(select => {
    select.addEventListener('change', () => {
      backdrop.querySelector('[name="machinePeople"]').value = select.value;
      backdrop.querySelector('[name="peopleMachine"]').value = select.value;
    });
  });
  backdrop.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    dispatchDate(wrapper, operation, backdrop);
    dispatchConfig(wrapper, operation, backdrop);
    backdrop.remove();
  });
  wrapper.appendChild(backdrop);
}

export function CalendarTimeline(days = [], operations = []) {
  const wrapper = document.createElement('section');
  wrapper.className = 'calendar-gantt';
  const zoomWidths = [90, 130, 180, 260, 360];
  let zoomIndex = 2;

  if (!operations.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calend&aacute;rio.</div>';
    return wrapper;
  }

  const knownDates = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean).sort();
  const calendarStartDate = addDays(knownDates[0], -15);
  const calendarEndDate = addDays(knownDates[knownDates.length - 1], 15);
  const dates = eachDate(calendarStartDate, calendarEndDate);
  const timelineStartMs = dateTimeMs(calendarStartDate);
  const timelineEndMs = dateTimeMs(addDays(calendarEndDate, 1));

  function setZoom(nextIndex) {
    zoomIndex = Math.max(0, Math.min(zoomWidths.length - 1, nextIndex));
    wrapper.querySelector('.gantt-board')?.style.setProperty('--calendar-day-width', `${zoomWidths[zoomIndex]}px`);
    wrapper.querySelector('[data-zoom-out]')?.toggleAttribute('disabled', zoomIndex === 0);
    wrapper.querySelector('[data-zoom-in]')?.toggleAttribute('disabled', zoomIndex === zoomWidths.length - 1);
  }

  wrapper.innerHTML = `
    <div class="gantt-zoom-controls" aria-label="Zoom do calend&aacute;rio">
      <button class="secondary-button" type="button" data-zoom-out aria-label="Diminuir zoom">-</button>
      <button class="secondary-button" type="button" data-zoom-in aria-label="Aumentar zoom">+</button>
    </div>
    <div class="gantt-board gantt-board-full" style="--calendar-days: ${dates.length}; --calendar-day-width: ${zoomWidths[zoomIndex]}px">
      <div class="gantt-dates">
        ${dates.map(date => `
          <div class="gantt-date" data-date="${date}">
            <strong>${formatDateLabel(date)}</strong>
            <span>${formatDate(date)}</span>
          </div>
        `).join('')}
      </div>
      ${operations.map(operation => {
        const startTime = operationStartTime(operation);
        const endTime = operationEndTime(operation);
        return `
          <div class="gantt-row" data-row-operation="${operation.materialId}">
            <button class="gantt-bar" type="button" draggable="true" data-operation-material="${operation.materialId}" style="${barStyle(operation, timelineStartMs, timelineEndMs)}">
              <strong>${operation.materialName}</strong>
              <span>${formatQty(operation.produceQty)} ${operation.unit || ''} | ${operation.machineName || '-'} | ${operation.peopleCount || '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>
              <small>${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  wrapper.addEventListener('click', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    const operation = operations.find(item => String(item.materialId) === String(bar.dataset.operationMaterial));
    if (operation) showOperationModal(wrapper, operation);
  });

  wrapper.querySelector('[data-zoom-out]')?.addEventListener('click', () => setZoom(zoomIndex - 1));
  wrapper.querySelector('[data-zoom-in]')?.addEventListener('click', () => setZoom(zoomIndex + 1));

  wrapper.addEventListener('dragstart', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', bar.dataset.operationMaterial);
  });

  wrapper.querySelectorAll('.gantt-row, .gantt-date').forEach(dropTarget => {
    dropTarget.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    dropTarget.addEventListener('drop', event => {
      event.preventDefault();
      const materialId = event.dataTransfer.getData('text/plain');
      if (!materialId) return;
      const row = event.currentTarget.classList.contains('gantt-row')
        ? event.currentTarget
        : wrapper.querySelector(`.gantt-row[data-row-operation="${materialId}"]`);
      const operation = operations.find(item => String(item.materialId) === String(materialId));
      const startDate = event.currentTarget.dataset.date
        ? `${event.currentTarget.dataset.date}T${operation ? operationStartTime(operation) || '00:00' : '00:00'}`
        : dateTimeFromDrop(event, row, calendarStartDate, calendarEndDate);
      wrapper.dispatchEvent(new CustomEvent('operation-date-change', {
        bubbles: true,
        detail: { materialId, startDate }
      }));
    });
  });

  setZoom(zoomIndex);
  focusFirstOperation(wrapper, dates, operations);

  return wrapper;
}
