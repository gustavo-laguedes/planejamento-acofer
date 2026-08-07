import {
  formatProductionCalendarDate,
  formatProductionCalendarDuration,
  formatProductionCalendarPercent,
  formatProductionCalendarQuantity
} from './productionCalendar.utils.js';
import {
  getProductionDisplayColor,
  mixProductionDisplayColor
} from './productionDisplayColor.js';

function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

export function getProductionCalendarStage(allocation) {
  const stage = Number(allocation?.productionStage);
  return Number.isInteger(stage) && stage > 0 ? stage : null;
}

function stripDailyOperationSuffix(value) {
  return String(value || '').replace(/:day-\d+$/i, '');
}

function getProductionDisplayNumber(allocation) {
  const productionIndex = firstExisting(allocation?.productionIndex);
  if (productionIndex !== undefined) {
    const numericIndex = Number(productionIndex);
    return Number.isFinite(numericIndex) ? numericIndex + 1 : productionIndex;
  }

  const productionOrder = firstExisting(allocation?.productionOrder);
  if (productionOrder !== undefined) {
    const numericOrder = Number(productionOrder);
    return Number.isFinite(numericOrder) ? numericOrder + 1 : productionOrder;
  }

  return firstExisting(
    allocation?.productionCode,
    allocation?.productionNumber,
    allocation?.production,
    allocation?.orderNumber,
    allocation?.orderCode
  );
}

export function getProductionCalendarMemberships(allocation) {
  return (Array.isArray(allocation?.productionMemberships) ? allocation.productionMemberships : [])
    .filter(membership => membership && membership.productionId)
    .slice()
    .sort((left, right) => (
      Number(left.productionIndex ?? left.productionOrder ?? Number.MAX_SAFE_INTEGER)
        - Number(right.productionIndex ?? right.productionOrder ?? Number.MAX_SAFE_INTEGER)
      || String(left.productionId).localeCompare(String(right.productionId))
    ));
}

export function getProductionCalendarMembershipDisplayNumber(membership) {
  const productionIndex = firstExisting(membership?.productionIndex);
  if (productionIndex !== undefined) {
    const numericIndex = Number(productionIndex);
    return Number.isFinite(numericIndex) ? numericIndex + 1 : productionIndex;
  }
  const productionOrder = firstExisting(membership?.productionOrder);
  if (productionOrder !== undefined) {
    const numericOrder = Number(productionOrder);
    return Number.isFinite(numericOrder) ? numericOrder + 1 : productionOrder;
  }
  return '';
}

function allocationForMembership(allocation, membership) {
  return {
    ...allocation,
    productionId: membership.productionId,
    productionIndex: membership.productionIndex,
    productionOrder: membership.productionOrder,
    productionColor: membership.productionColor
  };
}

function sharedProductionBackground(allocation, memberships) {
  const step = 100 / memberships.length;
  const stops = memberships.flatMap((membership, index) => {
    const color = getProductionCalendarAllocationColor(allocationForMembership(allocation, membership));
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return [`${color.bg} ${start}%`, `${color.bg} ${end}%`];
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function getProductionCalendarAllocationColor(allocation) {
  const explicitColor = String(allocation?.productionColor || '').trim();
  const identity = firstExisting(
    allocation?.productionId,
    allocation?.calendarParentOperationId,
    stripDailyOperationSuffix(allocation?.operationId)
  );
  const accent = getProductionDisplayColor(explicitColor, {
    productionIndex: firstExisting(allocation?.productionIndex, allocation?.productionOrder),
    productionId: allocation?.productionId,
    identity
  });
  return {
    accent,
    bg: mixProductionDisplayColor(accent, 0.88),
    border: mixProductionDisplayColor(accent, 0.58)
  };
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
 * @param {(allocation: Object) => void} [props.onToggleSelection]
 * @param {(allocation: Object, opener: HTMLElement) => void} [props.onEdit]
 * @param {(allocation: Object, opener: HTMLElement) => void} [props.onTransport]
 * @param {(event: PointerEvent, allocation: Object, card: HTMLElement) => void} [props.onStartDrag]
 * @param {(allocationId: string|number) => boolean} [props.shouldSuppressClick]
 * @returns {HTMLElement}
 */
export function ProductionCalendarCard({
  allocation,
  selected = false,
  onToggleSelection,
  onEdit,
  onTransport,
  onStartDrag,
  shouldSuppressClick
} = {}) {
  const card = document.createElement('article');
  card.className = 'production-calendar-card';
  card.dataset.allocationId = String(allocation.allocationId);
  card.dataset.selected = String(Boolean(selected));
  const color = getProductionCalendarAllocationColor(allocation);
  const memberships = getProductionCalendarMemberships(allocation);
  const isShared = memberships.length > 1;
  card.dataset.shared = String(isShared);
  card.style.setProperty('--production-calendar-card-accent', color.accent);
  card.style.setProperty(
    '--production-calendar-card-bg',
    isShared ? sharedProductionBackground(allocation, memberships) : color.bg
  );
  card.style.setProperty('--production-calendar-card-border', color.border);
  const validationErrors = Array.isArray(allocation.errors) ? allocation.errors : [];
  const validationWarnings = Array.isArray(allocation.warnings) ? allocation.warnings : [];

  const productionCode = getProductionDisplayNumber(allocation);
  const productionStage = getProductionCalendarStage(allocation);
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

  const editButton = typeof onEdit === 'function' ? document.createElement('button') : null;
  if (editButton) {
    editButton.type = 'button';
    editButton.className = 'production-calendar-card-edit';
    editButton.textContent = '✎';
    editButton.title = 'Editar máquina e pessoas';
    editButton.setAttribute('aria-label', 'Editar máquina e quantidade de pessoas');
    editButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onEdit(allocation, editButton);
    });
  }

  const transportButton = typeof onTransport === 'function' ? document.createElement('button') : null;
  if (transportButton) {
    transportButton.type = 'button';
    transportButton.className = 'production-calendar-card-transport';
    transportButton.textContent = '\u26DF';
    transportButton.title = allocation.manualTransport?.arrivalDate
      ? 'Editar transporte registrado'
      : 'Registrar transporte';
    transportButton.setAttribute('aria-label', transportButton.title);
    transportButton.dataset.active = String(Boolean(allocation.manualTransport?.arrivalDate));
    transportButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onTransport(allocation, transportButton);
    });
  }

  const title = document.createElement('div');
  title.className = 'production-calendar-card-title';
  title.textContent = productionCode ? `PRODUÇÃO ${productionCode}` : 'PRODUÇÃO';

  const stage = productionStage ? document.createElement('div') : null;
  if (stage) {
    stage.className = 'production-calendar-card-stage';
    stage.textContent = `ETAPA ${productionStage}`;
  }

  const membershipList = isShared ? document.createElement('div') : null;
  if (membershipList) {
    membershipList.className = 'production-calendar-card-memberships';
    memberships.forEach(membership => {
      const membershipColor = getProductionCalendarAllocationColor(allocationForMembership(allocation, membership));
      const row = document.createElement('div');
      row.className = 'production-calendar-card-membership';
      const marker = document.createElement('span');
      marker.className = 'production-calendar-card-membership-marker';
      marker.style.setProperty('--production-calendar-membership-color', membershipColor.accent);
      const label = document.createElement('span');
      const displayNumber = getProductionCalendarMembershipDisplayNumber(membership);
      const membershipStage = getProductionCalendarStage(membership);
      label.textContent = [
        displayNumber === '' ? 'PRODUÇÃO' : `PRODUÇÃO ${displayNumber}`,
        membershipStage ? `ETAPA ${membershipStage}` : ''
      ].filter(Boolean).join(' · ');
      row.append(marker, label);
      membershipList.appendChild(row);
    });
  }

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

  if (allocation.manualTransport?.arrivalDate) {
    const hours = allocation.manualTransport.hours ? `${allocation.manualTransport.hours}h, ` : '';
    appendMetric(metrics, 'Transporte:', `${hours}chegada ${formatProductionCalendarDate(allocation.manualTransport.arrivalDate)}`);
  }

  card.append(selectionButton);
  if (editButton) card.append(editButton);
  if (transportButton) card.append(transportButton);
  if (membershipList) {
    card.appendChild(membershipList);
  } else {
    card.appendChild(title);
    if (stage) card.appendChild(stage);
  }
  card.append(materialElement, metrics);
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

  card.tabIndex = 0;

  return card;
}
