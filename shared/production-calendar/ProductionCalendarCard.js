import {
  formatProductionCalendarDuration,
  formatProductionCalendarPercent,
  formatProductionCalendarQuantity
} from './productionCalendar.utils.js';

const CARD_PALETTE = [
  { accent: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { accent: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  { accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { accent: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { accent: '#ca8a04', bg: '#fefce8', border: '#fde68a' },
  { accent: '#dc2626', bg: '#fff1f2', border: '#fecdd3' },
  { accent: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' }
];

function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function isValidHexColor(value) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());
}

function hashString(value) {
  return String(value || '').split('').reduce((hash, char) => {
    return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }, 0);
}

function stripDailyOperationSuffix(value) {
  return String(value || '').replace(/:day-\d+$/i, '');
}

export function getProductionCalendarAllocationColor(allocation) {
  const explicitColor = String(allocation?.productionColor || '').trim();
  if (isValidHexColor(explicitColor)) {
    return {
      accent: explicitColor,
      bg: '#ffffff',
      border: explicitColor
    };
  }

  const key = firstExisting(
    allocation?.productionId,
    allocation?.productionIndex,
    allocation?.productionOrder,
    allocation?.calendarParentOperationId,
    stripDailyOperationSuffix(allocation?.operationId)
  );
  return CARD_PALETTE[Math.abs(hashString(key)) % CARD_PALETTE.length];
}

function appendMetric(parent, label, value) {
  const item = document.createElement('div');
  item.className = 'production-calendar-card-metric';

  const labelElement = document.createElement('span');
  labelElement.className = 'production-calendar-card-label';
  labelElement.textContent = label;

  const valueElement = document.createElement('span');
  valueElement.className = 'production-calendar-card-value';
  valueElement.textContent = value;

  item.append(labelElement, valueElement);
  parent.appendChild(item);
}

/**
 * Renders one read-only allocation card.
 *
 * @param {Object} props
 * @param {Object} props.allocation
 * @param {boolean} [props.selected]
 * @param {(allocation: Object) => void} [props.onOpenDetails]
 * @param {(allocation: Object) => void} [props.onToggleSelection]
 * @param {(event: PointerEvent, allocation: Object, card: HTMLElement) => void} [props.onStartDrag]
 * @param {(allocationId: string|number) => boolean} [props.shouldSuppressClick]
 * @returns {HTMLElement}
 */
export function ProductionCalendarCard({
  allocation,
  selected = false,
  onOpenDetails,
  onToggleSelection,
  onStartDrag,
  shouldSuppressClick
} = {}) {
  const card = document.createElement('article');
  card.className = 'production-calendar-card';
  card.dataset.allocationId = String(allocation.allocationId);
  card.dataset.selected = String(Boolean(selected));
  const color = getProductionCalendarAllocationColor(allocation);
  card.style.setProperty('--production-calendar-card-accent', color.accent);
  card.style.setProperty('--production-calendar-card-bg', color.bg);
  card.style.setProperty('--production-calendar-card-border', color.border);
  const validationErrors = Array.isArray(allocation.errors) ? allocation.errors : [];
  const validationWarnings = Array.isArray(allocation.warnings) ? allocation.warnings : [];

  const productionCode = firstExisting(
    allocation.productionCode,
    allocation.productionNumber,
    allocation.production,
    allocation.orderNumber,
    allocation.orderCode
  );
  const maxDailyCapacity = firstExisting(
    allocation.maxDailyCapacity,
    allocation.dailyMaxCapacity,
    allocation.capacityMaxPerDay,
    allocation.maxCapacityPerDay
  );

  const selectionButton = document.createElement('button');
  selectionButton.type = 'button';
  selectionButton.className = 'production-calendar-card-selector';
  selectionButton.setAttribute('aria-pressed', String(Boolean(selected)));
  selectionButton.setAttribute(
    'aria-label',
    `Selecionar ${productionCode ? `produ\u00e7\u00e3o ${productionCode}` : 'produ\u00e7\u00e3o'}${allocation.materialName ? `, ${allocation.materialName}` : ''}`
  );
  selectionButton.title = selected ? 'Cancelar sele\u00e7\u00e3o deste bloco' : 'Selecionar este bloco';
  selectionButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof onToggleSelection === 'function') onToggleSelection(allocation);
  });
  selectionButton.addEventListener('keydown', event => {
    event.stopPropagation();
  });
  selectionButton.addEventListener('keyup', event => {
    event.stopPropagation();
  });

  const title = document.createElement('div');
  title.className = 'production-calendar-card-title';
  title.textContent = productionCode ? `PRODUÇÃO ${productionCode}` : 'PRODUÇÃO';

  const materialElement = document.createElement('div');
  materialElement.className = 'production-calendar-card-material';

  const materialName = document.createElement('span');
  materialName.className = 'production-calendar-card-material-name';
  materialName.textContent = allocation.materialName || 'Material';
  materialElement.appendChild(materialName);

  const metrics = document.createElement('div');
  metrics.className = 'production-calendar-card-metrics';

  appendMetric(metrics, 'Qtd.:', formatProductionCalendarQuantity(allocation.quantity, allocation.unit || ''));
  appendMetric(metrics, 'Pessoas:', Number.isFinite(Number(allocation.peopleCount)) ? String(Number(allocation.peopleCount)) : '--');
  appendMetric(metrics, 'Duração:', formatProductionCalendarDuration(allocation.durationMinutes));
  appendMetric(metrics, 'Capacidade utilizada:', formatProductionCalendarPercent(allocation.capacityPercent));
  if (allocation.isCapacityOverride) {
    appendMetric(metrics, 'Exceção:', 'Capacidade extraordinária');
  }

  if (maxDailyCapacity !== undefined) {
    appendMetric(
      metrics,
      'Capacidade máxima/dia:',
      formatProductionCalendarQuantity(maxDailyCapacity, allocation.unit || '')
    );
  }

  card.append(selectionButton, title, materialElement, metrics);
  if (validationErrors.length || validationWarnings.length) {
    const indicator = document.createElement('span');
    indicator.className = `production-calendar-card-validation ${validationErrors.length ? 'has-error' : 'has-warning'}`;
    indicator.textContent = validationErrors.length ? '⛔' : '⚠';
    indicator.title = [...validationErrors, ...validationWarnings].join('\n');
    indicator.setAttribute('aria-label', validationErrors.length ? 'Erros de validação' : 'Alertas de validação');
    card.appendChild(indicator);
  }

  if (typeof onStartDrag === 'function') {
    card.addEventListener('pointerdown', event => {
      onStartDrag(event, allocation, card);
    });
  }

  if (typeof onOpenDetails === 'function') {
    const openDetails = () => onOpenDetails(allocation, card);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute(
      'aria-label',
      `Abrir detalhes da ${productionCode ? `produção ${productionCode}` : 'produção'}${allocation.materialName ? `, ${allocation.materialName}` : ''}`
    );
    card.addEventListener('click', event => {
      if (typeof shouldSuppressClick === 'function' && shouldSuppressClick(allocation.allocationId)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      openDetails();
    });
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetails();
    });
  }

  return card;
}
