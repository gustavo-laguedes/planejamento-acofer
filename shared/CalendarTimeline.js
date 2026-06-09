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
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}h`;
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

function barStyle(operation, timelineStartMs, timelineEndMs) {
  const totalMs = Math.max(timelineEndMs - timelineStartMs, 1);
  const startMs = Math.max(timelineStartMs, Math.min(dateTimeMs(operation.startDate, operationStartTime(operation)), timelineEndMs));
  const endMs = Math.max(startMs, Math.min(dateTimeMs(operation.endDate, operationEndTime(operation)), timelineEndMs));
  const left = ((startMs - timelineStartMs) / totalMs) * 100;
  const width = Math.max(((endMs - startMs) / totalMs) * 100, 0.25);
  return `--bar-left: ${left}%; --bar-width: ${width}%;`;
}

function slotPosition(slots, date, time, fallback) {
  const targetMs = dateTimeMs(date, time);
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const startMs = dateTimeMs(slot.date, slot.startTime);
    const endMs = dateTimeMs(slot.endDate || slot.date, slot.endTime);
    if (targetMs >= startMs && targetMs < endMs) {
      return index + ((targetMs - startMs) / Math.max(endMs - startMs, 1));
    }
    if (targetMs === endMs) return index + 1;
  }
  return fallback;
}

function segmentStyle(segment, slots) {
  const start = slotPosition(slots, segment.date, segment.startTime, 0);
  const end = slotPosition(slots, segment.endDate || segment.date, segment.endTime, slots.length);
  const left = (Math.max(0, Math.min(start, slots.length)) / Math.max(slots.length, 1)) * 100;
  const width = (Math.max(end - start, 0.05) / Math.max(slots.length, 1)) * 100;
  return `--bar-left: ${left}%; --bar-width: ${width}%;`;
}

function slotStyle(index, total) {
  const left = (index / Math.max(total, 1)) * 100;
  const width = (1 / Math.max(total, 1)) * 100;
  return `--slot-left: ${left}%; --slot-width: ${width}%;`;
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
  const zoomWidths = [90, 130, 180, 84, 62];
  let zoomIndex = 2;

  if (!operations.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calend&aacute;rio.</div>';
    return wrapper;
  }

  const knownDates = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean).sort();
  const calendarStartDate = addDays(knownDates[0], -15);
  const calendarEndDate = addDays(knownDates[knownDates.length - 1], 15);
  const dates = eachDate(calendarStartDate, calendarEndDate);
  const shiftStart = parseTime(config.shiftStartTime || '07:00', '07:00');
  const shiftEnd = Math.max(parseTime(config.shiftEndTime || '17:00', '17:00'), shiftStart + 60);
  const lunchStart = 12 * 60;
  const lunchHours = String(config.lunchHours ?? '0').includes(',')
    ? Number(String(config.lunchHours).replace(/\./g, '').replace(',', '.'))
    : Number(config.lunchHours || 0);
  const lunchMinutes = Math.max(Number.isFinite(lunchHours) ? lunchHours * 60 : 0, 0);
  const lunchEnd = lunchStart + lunchMinutes;

  function buildSlots() {
    if (zoomIndex >= 4) {
      return dates.flatMap(date => {
        const slots = [];
        for (let minutes = shiftStart; minutes < shiftEnd;) {
          if (lunchMinutes > 0 && minutes <= lunchStart && lunchStart < shiftEnd && lunchStart >= shiftStart) {
            if (minutes < lunchStart) {
              const end = Math.min(lunchStart, shiftEnd);
              slots.push({
                date,
                startTime: minutesToTime(minutes),
                endDate: date,
                endTime: minutesToTime(end),
                label: formatHour(minutes),
                sublabel: formatDate(date)
              });
              minutes = end;
              continue;
            }
            const end = Math.min(lunchEnd, shiftEnd);
            slots.push({
              date,
              startTime: minutesToTime(lunchStart),
              endDate: date,
              endTime: minutesToTime(end),
              label: 'Almo&ccedil;o',
              sublabel: `${minutesToTime(lunchStart)}-${minutesToTime(end)}`,
              isLunch: true
            });
            minutes = end;
            continue;
          }
          const nextLunchStart = lunchMinutes > 0 && minutes < lunchStart ? lunchStart : shiftEnd;
          const end = Math.min(minutes + 60, shiftEnd, nextLunchStart);
          slots.push({
            date,
            startTime: minutesToTime(minutes),
            endDate: date,
            endTime: minutesToTime(end),
            label: formatHour(minutes),
            sublabel: formatDate(date)
          });
          minutes = end;
        }
        return slots;
      });
    }
    if (zoomIndex >= 3) {
      return dates.map(date => ({
        date,
        startTime: minutesToTime(shiftStart),
        endDate: date,
        endTime: minutesToTime(shiftEnd),
        label: formatDateLabel(date),
        sublabel: `${formatHour(shiftStart)}-${formatHour(shiftEnd)}`
      }));
    }
    return dates.map(date => ({
      date,
      startTime: '00:00',
      endDate: addDays(date, 1),
      endTime: '00:00',
      label: formatDateLabel(date),
      sublabel: formatDate(date)
    }));
  }

  function setZoom(nextIndex) {
    zoomIndex = Math.max(0, Math.min(zoomWidths.length - 1, nextIndex));
    wrapper.querySelector('[data-zoom-out]')?.toggleAttribute('disabled', zoomIndex === 0);
    wrapper.querySelector('[data-zoom-in]')?.toggleAttribute('disabled', zoomIndex === zoomWidths.length - 1);
    renderBoard();
  }

  wrapper.innerHTML = `
    <div class="gantt-zoom-controls" aria-label="Zoom do calend&aacute;rio">
      <button class="secondary-button" type="button" data-zoom-out aria-label="Diminuir zoom">-</button>
      <button class="secondary-button" type="button" data-zoom-in aria-label="Aumentar zoom">+</button>
    </div>
    <div class="gantt-board gantt-board-full"></div>
  `;

  function renderBoard() {
    const slots = buildSlots();
    const timelineStartMs = dateTimeMs(slots[0].date, slots[0].startTime);
    const lastSlot = slots[slots.length - 1];
    const timelineEndMs = dateTimeMs(lastSlot.endDate || lastSlot.date, lastSlot.endTime);
    const board = wrapper.querySelector('.gantt-board');
    board.style.setProperty('--calendar-days', String(slots.length));
    board.style.setProperty('--calendar-day-width', `${zoomWidths[zoomIndex]}px`);
    board.innerHTML = `
      <div class="gantt-dates">
        ${slots.map(slot => `
          <div class="gantt-date ${slot.isLunch ? 'gantt-date-lunch' : ''}" data-date="${slot.date}" data-start-time="${slot.startTime}">
            <strong>${slot.label}</strong>
            <span>${slot.sublabel}</span>
          </div>
        `).join('')}
      </div>
      ${operations.map(operation => {
        const startTime = operationStartTime(operation);
        const endTime = operationEndTime(operation);
        const visualSegments = (operation.segments?.length ? operation.segments : [{
          date: operation.startDate,
          startTime,
          endDate: operation.endDate,
          endTime
        }]).map(segment => ({ ...segment, endDate: segment.endDate || segment.date }));
        const lunchBands = slots
          .map((slot, index) => ({ slot, index }))
          .filter(item => item.slot.isLunch)
          .map(item => `<span class="gantt-lunch-band" style="${slotStyle(item.index, slots.length)}">Almo&ccedil;o</span>`)
          .join('');
        return `
          <div class="gantt-row" data-row-operation="${operation.materialId}">
            ${lunchBands}
            ${visualSegments.map(segment => `
              <button class="gantt-bar" type="button" data-operation-material="${operation.materialId}" style="${segmentStyle(segment, slots)}" data-tooltip="${escapeAttr(tooltipText(operation))}">
                <strong>${operation.materialName}</strong>
                <span>${formatQty(operation.produceQty)} ${operation.unit || ''} | ${operation.machineName || '-'} | ${operation.peopleCount || '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>
                <small>${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
              </button>
            `).join('')}
          </div>
        `;
      }).join('')}
    `;
  }

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
