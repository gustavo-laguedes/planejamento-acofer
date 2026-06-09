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

function snapMinutes(date, step = 60) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  copy.setMinutes(Math.round(copy.getMinutes() / step) * step);
  return copy;
}

function parseTime(value, fallback = '00:00') {
  const [hours, minutes] = String(value || fallback).split(':').map(part => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return parseTime(fallback, '00:00');
  return Math.max(0, hours * 60 + minutes);
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function formatHour(minutes) {
  if (minutes % 60 === 0) return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h`;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
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

function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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

function parseLunchMinutes(value) {
  const raw = String(value ?? '0').trim();
  const duration = raw.match(/^(\d+)([,.])(\d{1,2})$/);
  if (duration) {
    const hours = Number(duration[1]);
    const minutes = Number(duration[3].padEnd(2, '0'));
    return (hours * 60) + Math.min(minutes, 59);
  }
  const hours = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Math.max(Number.isFinite(hours) ? hours * 60 : 0, 0);
}

function clampMinutes(minutes, start, end) {
  return Math.max(start, Math.min(minutes, end));
}

const MATERIAL_COLORS = [
  { bg: '#0f4c5c', border: '#1f7a8c', text: '#ffffff' },
  { bg: '#7a3e2f', border: '#b85743', text: '#ffffff' },
  { bg: '#2f5d50', border: '#4c9a82', text: '#ffffff' },
  { bg: '#5b4b8a', border: '#8270c8', text: '#ffffff' },
  { bg: '#7b5d1e', border: '#c18a25', text: '#ffffff' },
  { bg: '#24547a', border: '#3f88c5', text: '#ffffff' },
  { bg: '#6f3d66', border: '#aa63a0', text: '#ffffff' },
  { bg: '#4f5f2f', border: '#83994a', text: '#ffffff' },
  { bg: '#344054', border: '#667085', text: '#ffffff' },
  { bg: '#6941c6', border: '#9e77ed', text: '#ffffff' },
  { bg: '#175cd3', border: '#528bff', text: '#ffffff' },
  { bg: '#a15c07', border: '#dc8a1f', text: '#ffffff' }
];

function segmentStyle(segment, dayStart, dayEnd, hourHeight) {
  const start = clampMinutes(parseTime(segment.startTime, minutesToTime(dayStart)), dayStart, dayEnd);
  const end = clampMinutes(parseTime(segment.endTime, minutesToTime(dayEnd)), dayStart, dayEnd);
  const top = ((start - dayStart) / 60) * hourHeight;
  const rawHeight = ((Math.max(end - start, 1)) / 60) * hourHeight;
  const height = Math.max(rawHeight - 4, 1);
  return `--event-top: ${top + 2}px; --event-height: ${height}px;`;
}

function laneStyle(lane, laneCount) {
  const width = 100 / Math.max(laneCount, 1);
  return `--event-left: calc(8px + ${lane * width}%); --event-width: calc(${width}% - 16px);`;
}

function colorStyle(color) {
  return `--event-bg: ${color.bg}; --event-border: ${color.border}; --event-text: ${color.text};`;
}

function lunchStyle(lunchStart, lunchEnd, dayStart, dayEnd, hourHeight) {
  const start = clampMinutes(lunchStart, dayStart, dayEnd);
  const end = clampMinutes(lunchEnd, dayStart, dayEnd);
  const top = ((start - dayStart) / 60) * hourHeight;
  const height = Math.max(((Math.max(end - start, 0)) / 60) * hourHeight, 0);
  return `--lunch-top: ${top}px; --lunch-height: ${height}px;`;
}

function overlaps(first, second) {
  return first.start < second.end && second.start < first.end;
}

function arrangeParallelSegments(items) {
  const sorted = items
    .map((item, index) => ({
      ...item,
      index,
      start: parseTime(item.segment.startTime),
      end: Math.max(parseTime(item.segment.endTime), parseTime(item.segment.startTime) + 1)
    }))
    .sort((first, second) => first.start - second.start || first.end - second.end);
  const active = [];
  const groups = [];

  sorted.forEach(item => {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= item.start) active.splice(index, 1);
    }
    if (!active.length) groups.push([]);
    groups[groups.length - 1].push(item);
    active.push(item);
  });

  groups.forEach(group => {
    group.forEach(item => {
      const used = new Set(group.filter(other => other !== item && overlaps(item, other)).map(other => other.lane));
      let lane = 0;
      while (used.has(lane)) lane += 1;
      item.lane = lane;
    });
    const laneCount = Math.max(...group.map(item => item.lane), 0) + 1;
    group.forEach(item => {
      item.laneCount = laneCount;
    });
  });

  return sorted.sort((first, second) => first.index - second.index);
}

function splitSegmentByLunch(segment, lunchStart, lunchEnd, shiftStart, shiftEnd) {
  const start = clampMinutes(parseTime(segment.startTime, minutesToTime(shiftStart)), shiftStart, shiftEnd);
  const end = clampMinutes(parseTime(segment.endTime, minutesToTime(shiftEnd)), shiftStart, shiftEnd);
  if (end <= start) return [];
  if (lunchEnd <= lunchStart || end <= lunchStart || start >= lunchEnd) {
    return [{ ...segment, startTime: minutesToTime(start), endTime: minutesToTime(end) }];
  }
  return [
    start < lunchStart ? { ...segment, startTime: minutesToTime(start), endTime: minutesToTime(lunchStart) } : null,
    end > lunchEnd ? { ...segment, startTime: minutesToTime(lunchEnd), endTime: minutesToTime(end) } : null
  ].filter(Boolean);
}

function operationDaySegments(operation, dates, shiftStart, shiftEnd, lunchStart, lunchEnd) {
  const baseSegments = operation.segments?.length ? operation.segments : [{
    date: operation.startDate,
    startTime: operationStartTime(operation),
    endDate: operation.endDate,
    endTime: operationEndTime(operation)
  }];
  const byDate = new Map(dates.map(date => [date, []]));
  baseSegments.forEach(segment => {
    const startDate = segment.date || operation.startDate;
    const endDate = segment.endDate || segment.date || operation.endDate;
    if (!startDate || !endDate) return;
    eachDate(startDate, endDate).forEach(date => {
      if (!byDate.has(date)) return;
      const startTime = date === startDate ? segment.startTime : minutesToTime(shiftStart);
      const endTime = date === endDate ? segment.endTime : minutesToTime(shiftEnd);
      splitSegmentByLunch({ ...segment, date, startTime, endDate: date, endTime }, lunchStart, lunchEnd, shiftStart, shiftEnd)
        .forEach(part => byDate.get(date).push(part));
    });
  });
  return byDate;
}

function dispatchConfig(wrapper, operation, modal) {
  const machineSelect = modal.querySelector('[name="machinePeople"]');
  const peopleSelect = modal.querySelector('[name="peopleMachine"]');
  const [machineName, peopleCount] = (peopleSelect?.value || machineSelect?.value || '').split('||');
  const modelSelect = modal.querySelector('[name="productionModel"]');
  const productionModelName = modelSelect?.value || null;
  if (
    machineName === operation.machineName
    && Number(peopleCount || 0) === Number(operation.peopleCount || 0)
    && String(productionModelName || '') === String(operation.productionModelName || '')
  ) return;
  wrapper.dispatchEvent(new CustomEvent('operation-config-change', {
    bubbles: true,
    detail: {
      materialId: String(operation.materialId),
      machineName,
      peopleCount: Number(peopleCount || 0),
      productionModelName
    }
  }));
}

function tooltipText(operation) {
  const people = Number(operation.peopleCount || 0);
  const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
  return [
    `Material: ${operation.materialName || '-'}`,
    `Quantidade: ${quantity || '-'}`,
    `Maquina: ${operation.machineName || '-'}`,
    `Pessoas: ${people || '-'}`,
    '',
    `Data inicial: ${formatDate(operation.startDate)}`,
    `Hora inicial: ${operationStartTime(operation)}`,
    `Data final: ${formatDate(operation.endDate)}`,
    `Hora final: ${operationEndTime(operation)}`
  ].join('\n');
  return [
    operation.materialName,
    `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim(),
    operation.machineName || '-',
    `${people || '-'} pessoa${people === 1 ? '' : 's'}`,
    '',
    `${formatDate(operation.startDate)} ${operationStartTime(operation)}`,
    'até',
    `${formatDate(operation.endDate)} ${operationEndTime(operation)}`
  ].join('\n');
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
  const selectedModel = operation.productionModelName || models[0]?.modelName || '';
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
              ${models.length ? models.map(model => `<option value="${model.modelName}" ${String(model.modelName) === String(selectedModel) ? 'selected' : ''}>${model.label || model.modelName}</option>`).join('') : `<option value="">${productionModelFallback(operation)}</option>`}
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

export function CalendarTimeline(days = [], operations = [], config = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'calendar-gantt';
  const zoomLevels = [
    { dayWidth: 170, hourHeight: 58 },
    { dayWidth: 210, hourHeight: 72 },
    { dayWidth: 260, hourHeight: 88 },
    { dayWidth: 320, hourHeight: 108 },
    { dayWidth: 390, hourHeight: 132 }
  ];
  let zoomIndex = 2;

  if (!operations.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calend&aacute;rio.</div>';
    return wrapper;
  }

  const knownDates = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean).sort();
  const calendarStartDate = addDays(knownDates[0], -15);
  const calendarEndDate = addDays(knownDates[knownDates.length - 1], 15);
  const dates = eachDate(calendarStartDate, calendarEndDate);
  const materialColors = new Map();
  operations.forEach(operation => {
    const key = String(operation.materialId || operation.materialName || '');
    if (!materialColors.has(key)) {
      materialColors.set(key, MATERIAL_COLORS[materialColors.size % MATERIAL_COLORS.length]);
    }
  });
  const shiftStart = parseTime(config.shiftStartTime || '07:00', '07:00');
  const shiftEnd = Math.max(parseTime(config.shiftEndTime || '17:00', '17:00'), shiftStart + 60);
  const lunchStart = 12 * 60;
  const lunchMinutes = parseLunchMinutes(config.lunchHours);
  const lunchEnd = lunchStart + lunchMinutes;
  const dayStart = 0;
  const dayEnd = 24 * 60;
  const hourMarks = [];
  for (let minutes = dayStart; minutes < dayEnd; minutes += 60) {
    hourMarks.push(minutes);
  }

  wrapper.innerHTML = `
    <div class="gantt-zoom-controls" aria-label="Zoom do calend&aacute;rio">
      <button class="secondary-button" type="button" data-zoom-out aria-label="Diminuir zoom">-</button>
      <button class="secondary-button" type="button" data-zoom-in aria-label="Aumentar zoom">+</button>
    </div>
    <div class="gantt-board gantt-board-full"></div>
    <div class="calendar-tooltip" hidden></div>
  `;

  const tooltip = wrapper.querySelector('.calendar-tooltip');

  function showTooltip(event, text) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (tooltip.hidden) return;
    const padding = 12;
    const rect = tooltip.getBoundingClientRect();
    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + rect.width > window.innerWidth - padding) left = event.clientX - rect.width - 14;
    if (top + rect.height > window.innerHeight - padding) top = event.clientY - rect.height - 14;
    tooltip.style.left = `${Math.max(padding, left)}px`;
    tooltip.style.top = `${Math.max(padding, top)}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function setZoom(nextIndex) {
    zoomIndex = Math.max(0, Math.min(zoomLevels.length - 1, nextIndex));
    wrapper.querySelector('[data-zoom-out]')?.toggleAttribute('disabled', zoomIndex === 0);
    wrapper.querySelector('[data-zoom-in]')?.toggleAttribute('disabled', zoomIndex === zoomLevels.length - 1);
    renderBoard();
  }

  function renderBoard() {
    const zoom = zoomLevels[zoomIndex];
    const totalMinutes = dayEnd - dayStart;
    const bodyHeight = (totalMinutes / 60) * zoom.hourHeight;
    const lunchVisible = lunchMinutes > 0 && lunchEnd > dayStart && lunchStart < dayEnd;
    const board = wrapper.querySelector('.gantt-board');
    board.style.setProperty('--calendar-days', String(dates.length));
    board.style.setProperty('--calendar-day-width', `${zoom.dayWidth}px`);
    board.style.setProperty('--calendar-hour-height', `${zoom.hourHeight}px`);
    board.style.setProperty('--calendar-body-height', `${bodyHeight}px`);
    board.innerHTML = `
      <div class="agenda-grid">
        <div class="agenda-corner">
          <strong>Hor&aacute;rio</strong>
          <span>00:00-23:59</span>
        </div>
        <div class="gantt-dates">
          ${dates.map(date => `
            <div class="gantt-date" data-date="${date}">
              <strong>${formatDateLabel(date)}</strong>
              <span>${formatDate(date)}</span>
            </div>
          `).join('')}
        </div>
        <div class="agenda-time-axis">
          ${hourMarks.map(minutes => `
            <span style="--time-top: ${((minutes - dayStart) / 60) * zoom.hourHeight}px">${formatHour(minutes)}</span>
          `).join('')}
        </div>
        <div class="agenda-days">
          ${dates.map(date => {
            const daySegments = operations.flatMap(operation => {
              const segments = operationDaySegments(operation, dates, shiftStart, shiftEnd, lunchStart, lunchEnd).get(date) || [];
              return segments.map(segment => ({ operation, segment }));
            });
            const dayOperations = arrangeParallelSegments(daySegments).map(item => {
              const { operation, segment } = item;
              const startTime = operationStartTime(operation);
              const endTime = operationEndTime(operation);
              const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
              const materialKey = String(operation.materialId || operation.materialName || '');
              return `
                <button class="gantt-bar" type="button" data-operation-material="${operation.materialId}" style="${segmentStyle(segment, dayStart, dayEnd, zoom.hourHeight)} ${laneStyle(item.lane, item.laneCount)} ${colorStyle(materialColors.get(materialKey))}" data-tooltip="${escapeAttr(tooltipText(operation))}">
                  <strong>${operation.materialName}</strong>
                  <span>${quantity || '-'}</span>
                  <span>${operation.machineName || '-'} | ${operation.peopleCount || '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>
                  <small>${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
                </button>
              `;
            }).join('');
            return `
              <div class="agenda-day-column" data-date="${date}">
                ${hourMarks.map(minutes => `
                  <span class="agenda-hour-line" style="--time-top: ${((minutes - dayStart) / 60) * zoom.hourHeight}px"></span>
                `).join('')}
                ${lunchVisible ? `<span class="gantt-lunch-band" style="${lunchStyle(lunchStart, lunchEnd, dayStart, dayEnd, zoom.hourHeight)}">Almo&ccedil;o</span>` : ''}
                ${dayOperations}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  wrapper.addEventListener('mouseover', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    showTooltip(event, bar.dataset.tooltip || '');
  });
  wrapper.addEventListener('mousemove', event => {
    if (event.target.closest('.gantt-bar')) moveTooltip(event);
  });
  wrapper.addEventListener('mouseout', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar || bar.contains(event.relatedTarget)) return;
    hideTooltip();
  });
  wrapper.addEventListener('focusin', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    showTooltip({ clientX: rect.left + 8, clientY: rect.top + 8 }, bar.dataset.tooltip || '');
  });
  wrapper.addEventListener('focusout', event => {
    if (event.target.closest('.gantt-bar')) hideTooltip();
  });
  wrapper.addEventListener('click', event => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    const operation = operations.find(item => String(item.materialId) === String(bar.dataset.operationMaterial));
    if (operation) showOperationModal(wrapper, operation);
  });

  wrapper.querySelector('[data-zoom-out]')?.addEventListener('click', () => setZoom(zoomIndex - 1));
  wrapper.querySelector('[data-zoom-in]')?.addEventListener('click', () => setZoom(zoomIndex + 1));

  setZoom(zoomIndex);
  focusFirstOperation(wrapper, dates, operations);

  return wrapper;
}
