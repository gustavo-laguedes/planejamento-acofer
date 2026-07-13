import {
  formatProductionCalendarDate,
  formatProductionCalendarDuration,
  formatProductionCalendarPercent,
  formatProductionCalendarQuantity
} from './productionCalendar.utils.js';
import { getProductionCalendarAllocationColor } from './ProductionCalendarCard.js';

function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function hasDisplayValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  const text = String(value).trim();
  if (!text || text === '--') return false;
  return !['undefined', 'null', 'nan'].includes(text.toLowerCase());
}

function appendText(parent, className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function createField(label, value) {
  if (!hasDisplayValue(value)) return null;

  const field = document.createElement('div');
  field.className = 'production-calendar-details-field';
  appendText(field, 'production-calendar-details-label', label);
  appendText(field, 'production-calendar-details-value', String(value));
  return field;
}

function appendField(section, label, value) {
  const field = createField(label, value);
  if (field) section.appendChild(field);
}

function appendSection(parent, title, fields) {
  const section = document.createElement('section');
  section.className = 'production-calendar-details-section';

  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'production-calendar-details-fields';
  fields(grid);

  if (!grid.children.length) return;
  section.appendChild(grid);
  parent.appendChild(section);
}

function formattedQuantity(value, unit) {
  if (!hasDisplayValue(value)) return '';
  const formatted = formatProductionCalendarQuantity(value, unit || '');
  return formatted === '--' ? '' : formatted;
}

function formattedDuration(value) {
  if (!hasDisplayValue(value)) return '';
  const formatted = formatProductionCalendarDuration(value);
  return formatted === '--' ? '' : formatted;
}

function formattedPercent(value) {
  if (!hasDisplayValue(value)) return '';
  const formatted = formatProductionCalendarPercent(value);
  return formatted === '--' ? '' : formatted;
}

function shouldShowSequence(value) {
  const sequence = Number(value);
  return Number.isFinite(sequence) && sequence > 0;
}

function sourceLabel(source) {
  const normalized = String(source || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'automatic' || normalized === 'auto') return 'Automática';
  if (normalized === 'manual') return 'Manual';
  return source;
}

/**
 * Read-only allocation details modal.
 *
 * @param {Object} props
 * @param {Object} props.allocation
 * @param {() => void} props.onClose
 * @returns {HTMLElement}
 */
export function ProductionCalendarDetails({ allocation, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'production-calendar-details-backdrop';
  overlay.setAttribute('role', 'presentation');

  const color = getProductionCalendarAllocationColor(allocation);
  const productionCode = firstExisting(
    allocation?.productionCode,
    allocation?.productionNumber,
    allocation?.production,
    allocation?.orderNumber,
    allocation?.orderCode,
    allocation?.productionOrder
  );
  const maxDailyCapacity = firstExisting(
    allocation?.maxDailyCapacity,
    allocation?.dailyMaxCapacity,
    allocation?.capacityMaxPerDay,
    allocation?.maxCapacityPerDay
  );

  const modal = document.createElement('div');
  modal.className = 'production-calendar-details-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'production-calendar-details-title');
  modal.style.setProperty('--production-calendar-details-accent', color.accent);

  const header = document.createElement('header');
  header.className = 'production-calendar-details-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'production-calendar-details-title-group';

  const title = document.createElement('h2');
  title.id = 'production-calendar-details-title';
  title.textContent = productionCode ? `PRODUÇÃO ${productionCode}` : 'PRODUÇÃO';
  titleGroup.appendChild(title);

  if (hasDisplayValue(allocation?.materialName)) {
    appendText(titleGroup, 'production-calendar-details-subtitle', allocation.materialName);
  }

  if (hasDisplayValue(allocation?.status)) {
    appendText(titleGroup, 'production-calendar-details-status', allocation.status);
  }

  const closeIcon = document.createElement('button');
  closeIcon.type = 'button';
  closeIcon.className = 'production-calendar-details-close-icon';
  closeIcon.setAttribute('aria-label', 'Fechar detalhes da produção');
  closeIcon.textContent = '×';

  header.append(titleGroup, closeIcon);

  const body = document.createElement('div');
  body.className = 'production-calendar-details-body';

  appendSection(body, 'Identificação', grid => {
    appendField(grid, 'Produção', productionCode);
    appendField(grid, 'Material', allocation?.materialName);
    appendField(grid, 'Unidade', allocation?.unit);
    appendField(grid, 'Origem', sourceLabel(allocation?.source));
  });

  appendSection(body, 'Programação', grid => {
    appendField(grid, 'Data', allocation?.date ? formatProductionCalendarDate(allocation.date) : '');
    appendField(grid, 'Horário inicial', allocation?.startTime);
    appendField(grid, 'Horário final', allocation?.endTime);
    appendField(grid, 'Máquina', allocation?.machineName);
    appendField(grid, 'Pessoas', Number.isFinite(Number(allocation?.peopleCount)) ? Number(allocation.peopleCount) : '');
    appendField(grid, 'Sequência', shouldShowSequence(allocation?.sequence) ? Number(allocation.sequence) : '');
  });

  appendSection(body, 'Quantidades', grid => {
    appendField(grid, 'Quantidade desta allocation', formattedQuantity(allocation?.quantity, allocation?.unit));
    appendField(grid, 'Duração', formattedDuration(allocation?.durationMinutes));
    appendField(grid, 'Capacidade utilizada', formattedPercent(allocation?.capacityPercent));
    appendField(grid, 'Capacidade máxima/dia', formattedQuantity(maxDailyCapacity, allocation?.unit));
  });

  const technicalFields = [
    createField('allocationId', allocation?.allocationId),
    createField('operationId', allocation?.operationId),
    createField('planningId', allocation?.planningId)
  ].filter(Boolean);

  if (technicalFields.length) {
    const technical = document.createElement('details');
    technical.className = 'production-calendar-details-technical';

    const summary = document.createElement('summary');
    summary.textContent = 'Informações técnicas';

    const technicalGrid = document.createElement('div');
    technicalGrid.className = 'production-calendar-details-fields';
    technicalFields.forEach(field => technicalGrid.appendChild(field));

    technical.append(summary, technicalGrid);
    body.appendChild(technical);
  }

  const footer = document.createElement('footer');
  footer.className = 'production-calendar-details-footer';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'production-calendar-details-close-button';
  closeButton.textContent = 'Fechar';
  footer.appendChild(closeButton);

  modal.append(header, body, footer);
  overlay.appendChild(modal);

  const cleanup = () => {
    document.removeEventListener('keydown', handleKeydown);
    removalObserver.disconnect();
  };
  const close = () => {
    cleanup();
    if (typeof onClose === 'function') onClose();
  };
  function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  }

  overlay.addEventListener('click', close);
  modal.addEventListener('click', event => event.stopPropagation());
  closeIcon.addEventListener('click', close);
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', handleKeydown);
  const removalObserver = new MutationObserver(() => {
    if (document.contains(overlay)) return;
    cleanup();
  });
  removalObserver.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => closeButton.focus({ preventScroll: true }), 0);

  return overlay;
}
