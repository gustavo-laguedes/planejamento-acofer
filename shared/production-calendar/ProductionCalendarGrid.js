import { ProductionCalendarCard } from './ProductionCalendarCard.js';
import {
  createProductionCalendarGridRows,
  fillProductionCalendarDayRange,
  formatProductionCalendarCompactNumber,
  formatProductionCalendarDate,
  formatProductionCalendarPercent,
  getProductionCalendarDayCardCounts,
  getProductionCalendarWeekday,
  isProductionCalendarNonWorkingDay,
  normalizeProductionCalendarDay
} from './productionCalendar.utils.js';
import {
  getProductionCalendarZoomLevel,
  resolveProductionCalendarVisibleDayCount
} from './ProductionCalendarState.js';

const CARD_GAP = 8;
const CELL_HORIZONTAL_PADDING = 16;

function dayColumnWidth(cardCount, cardWidth) {
  const count = Math.max(1, Number(cardCount) || 1);
  return count * cardWidth + (count - 1) * CARD_GAP + CELL_HORIZONTAL_PADDING;
}

function getGridColumns(days, dayCardCounts, cardWidth) {
  return [
    'var(--production-calendar-machine-width)',
    ...days.map(day => `${dayColumnWidth(dayCardCounts[day.date], cardWidth)}px`)
  ].join(' ');
}

export function applyProductionCalendarGridZoom(grid, { days = [], dayCardCounts = {}, zoom } = {}) {
  if (!grid) return;
  const zoomLevel = getProductionCalendarZoomLevel(zoom);
  grid.dataset.zoom = zoomLevel.id;
  grid.style.setProperty('--production-calendar-card-min-width', `${zoomLevel.cardWidth}px`);
  grid.style.setProperty(
    '--production-calendar-grid-columns',
    getGridColumns(days, dayCardCounts, zoomLevel.cardWidth)
  );
}

function calendarParentId(allocation = {}) {
  return String(allocation.parentOperationId || allocation.calendarParentOperationId || allocation.operationId || '').replace(/:day-\d+$/i, '');
}

function allocationOrderKey(allocation = {}) {
  return [
    String(allocation.date || ''),
    String(allocation.startTime || ''),
    String(allocation.machineName || allocation.machineId || ''),
    String(allocation.allocationId || '')
  ].join('|');
}

function cssEscape(value) {
  return typeof window !== 'undefined' && window.CSS?.escape
    ? window.CSS.escape(String(value))
    : String(value).replace(/["\\]/g, '\\$&');
}

function queueProductionTransportConnectorDraw(grid, allocations) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => drawProductionTransportConnectors(grid, allocations));
    return;
  }
  drawProductionTransportConnectors(grid, allocations);
}

function drawProductionTransportConnectors(grid, allocations = []) {
  grid.querySelector('.production-calendar-transport-connectors')?.remove();
  const transportSources = (allocations || []).filter(allocation => allocation.manualTransport?.arrivalDate);
  if (!transportSources.length) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('production-calendar-transport-connectors');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(grid.scrollWidth));
  svg.setAttribute('height', String(grid.scrollHeight));
  svg.setAttribute('viewBox', `0 0 ${grid.scrollWidth} ${grid.scrollHeight}`);
  svg.innerHTML = `
    <defs>
      <marker id="production-calendar-transport-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L9,3.5 L0,7 Z"></path>
      </marker>
    </defs>
  `;

  const gridRect = grid.getBoundingClientRect();
  transportSources.forEach(source => {
    const targets = new Set([
      ...(source.manualTransport.consumerParentOperationIds || []),
      ...(source.manualTransport.affectedParentOperationIds || [])
    ].map(String).filter(Boolean));
    if (!targets.size) return;
    const target = (allocations || [])
      .filter(candidate => targets.has(calendarParentId(candidate)))
      .sort((left, right) => allocationOrderKey(left).localeCompare(allocationOrderKey(right)))[0];
    if (!target) return;
    const sourceCard = grid.querySelector(`.production-calendar-card[data-allocation-id="${cssEscape(source.allocationId)}"]`);
    const targetCard = grid.querySelector(`.production-calendar-card[data-allocation-id="${cssEscape(target.allocationId)}"]`);
    if (!sourceCard || !targetCard || sourceCard.hidden || targetCard.hidden) return;

    const sourceRect = sourceCard.getBoundingClientRect();
    const targetRect = targetCard.getBoundingClientRect();
    const x1 = sourceRect.right - gridRect.left + grid.scrollLeft - 4;
    const y1 = sourceRect.top + (sourceRect.height / 2) - gridRect.top + grid.scrollTop;
    const x2 = targetRect.left - gridRect.left + grid.scrollLeft + 4;
    const y2 = targetRect.top + (targetRect.height / 2) - gridRect.top + grid.scrollTop;
    const bend = Math.max(34, Math.abs(x2 - x1) * 0.45);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'production-calendar-transport-connector');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    svg.appendChild(path);
  });

  if (svg.querySelectorAll('.production-calendar-transport-connector').length) {
    grid.appendChild(svg);
  }
}

/**
 * Renders a simple read-only grid grouped by machine and day.
 *
 * @param {Object} props
 * @param {Array<string|Date|Object>} props.days
 * @param {Array<Object>} props.machines
 * @param {Array<Object>} props.allocations
 * @param {Object} props.state
 * @param {(allocation: Object) => void} [props.onOpenDetails]
 * @param {(day: Object) => void} [props.onOpenDay]
 * @param {(allocation: Object) => void} [props.onToggleSelection]
 * @param {(event: PointerEvent, allocation: Object, card: HTMLElement) => void} [props.onStartDrag]
 * @param {(allocationId: string|number) => boolean} [props.shouldSuppressClick]
 * @returns {HTMLElement}
 */
export function ProductionCalendarGrid({
  days = [],
  machines = [],
  allocations = [],
  validation = null,
  state = {},
  onOpenDay,
  onOpenDetails,
  onEditAllocation,
  onTransportAllocation,
  onSplitAllocation,
  onToggleSelection,
  onStartDrag,
  shouldSuppressClick,
  onToggleManualWorkDate,
  onEditDailyTeam
} = {}) {
  const normalizedDays = fillProductionCalendarDayRange(days.map(normalizeProductionCalendarDay));
  const rows = createProductionCalendarGridRows({ days: normalizedDays, machines, allocations });
  const dayCardCounts = getProductionCalendarDayCardCounts(rows, normalizedDays);
  const dayElements = normalizedDays.map(() => []);
  let visibleDayCount = resolveProductionCalendarVisibleDayCount(state.visibleDayCount, normalizedDays.length);
  const grid = document.createElement('div');
  grid.className = 'production-calendar-grid';
  grid.style.setProperty('--production-calendar-day-count', String(Math.max(normalizedDays.length, 1)));
  applyProductionCalendarGridZoom(grid, {
    days: normalizedDays.slice(0, visibleDayCount),
    dayCardCounts,
    zoom: state.zoom
  });
  grid.__productionCalendarZoomContext = {
    days: normalizedDays.slice(0, visibleDayCount),
    dayCardCounts
  };
  grid.__setProductionCalendarVisibleDayCount = nextVisibleDayCount => {
    visibleDayCount = resolveProductionCalendarVisibleDayCount(nextVisibleDayCount, normalizedDays.length);
    dayElements.forEach((elements, index) => {
      elements.forEach(element => { element.hidden = index >= visibleDayCount; });
    });
    grid.__productionCalendarZoomContext.days = normalizedDays.slice(0, visibleDayCount);
    applyProductionCalendarGridZoom(grid, {
      ...grid.__productionCalendarZoomContext,
      zoom: state.zoom
    });
    queueProductionTransportConnectorDraw(grid, allocations);
    return visibleDayCount;
  };

  const header = document.createElement('div');
  header.className = 'production-calendar-grid-header';

  const machineHeading = document.createElement('div');
  machineHeading.className = 'production-calendar-machine-heading';
  machineHeading.textContent = 'Máquina';
  header.appendChild(machineHeading);

  normalizedDays.forEach((day, dayIndex) => {
    const isNonWorkingDay = isProductionCalendarNonWorkingDay(day);
    const dayHeading = document.createElement('div');
    dayHeading.className = 'production-calendar-day-heading';
    dayHeading.dataset.date = day.date;
    dayHeading.hidden = dayIndex >= visibleDayCount;
    dayElements[dayIndex].push(dayHeading);
    if (typeof onOpenDay === 'function') {
      dayHeading.classList.add('is-clickable');
      dayHeading.tabIndex = 0;
      dayHeading.setAttribute('role', 'button');
      dayHeading.setAttribute('aria-label', `Ver estoque projetado de ${formatProductionCalendarDate(day.date)}`);
      dayHeading.addEventListener('click', () => onOpenDay(day));
      dayHeading.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        onOpenDay(day);
      });
    }
    if (isNonWorkingDay) {
      dayHeading.classList.add('is-non-working-day');
    }

    const dateLine = document.createElement('span');
    dateLine.className = 'production-calendar-day-date';
    dateLine.textContent = formatProductionCalendarDate(day.date);

    const weekdayLine = document.createElement('span');
    weekdayLine.className = 'production-calendar-day-weekday';
    weekdayLine.textContent = getProductionCalendarWeekday(day.date);

    dayHeading.append(dateLine, weekdayLine);
    if ((isNonWorkingDay || day.isManuallyEnabled) && typeof onToggleManualWorkDate === 'function') {
      const manualWorkLabel = document.createElement('label');
      manualWorkLabel.className = 'production-calendar-manual-work-toggle';
      manualWorkLabel.title = 'Liberar produção neste dia';
      const manualWorkInput = document.createElement('input');
      manualWorkInput.type = 'checkbox';
      manualWorkInput.checked = Boolean(day.isManuallyEnabled);
      manualWorkInput.setAttribute('aria-label', 'Liberar produção neste dia');
      manualWorkInput.title = 'Liberar produção neste dia';
      manualWorkLabel.addEventListener('click', event => event.stopPropagation());
      manualWorkInput.addEventListener('change', () => onToggleManualWorkDate(day, manualWorkInput.checked, manualWorkInput));
      manualWorkLabel.appendChild(manualWorkInput);
      dayHeading.appendChild(manualWorkLabel);
    }
    if (day.team) {
      const teamPill = document.createElement('button');
      teamPill.type = 'button';
      teamPill.className = `production-calendar-team-pill is-${day.team.state || 'normal'}`;
      teamPill.textContent = `${day.team.peakPeople ?? 0} / ${day.team.availablePeople ?? 0}`;
      teamPill.title = (day.team.shifts || [])
        .map(shift => `${shift.label}: ${shift.peakPeople} / ${shift.availablePeople}`)
        .join('\n');
      teamPill.setAttribute('aria-label', `Equipe usada e disponível em ${formatProductionCalendarDate(day.date)}: ${teamPill.textContent}`);
      teamPill.disabled = typeof onEditDailyTeam !== 'function';
      teamPill.addEventListener('click', event => {
        event.stopPropagation();
        onEditDailyTeam?.(day, teamPill);
      });
      dayHeading.appendChild(teamPill);
    }
    if (day.productivity) {
      const productivePeople = Number(day.productivity.productivePeople);
      const availablePeople = Number(day.productivity.availablePeople);
      const percent = Number(day.productivity.percent);
      const percentLabel = day.productivity.percent === null ? '--' : formatProductionCalendarPercent(percent);
      const productivityBadge = document.createElement('span');
      productivityBadge.className = 'production-calendar-day-productivity';
      productivityBadge.textContent = `${formatProductionCalendarCompactNumber(productivePeople)} / ${formatProductionCalendarCompactNumber(availablePeople)}\n${percentLabel}`;
      productivityBadge.title = `Produtividade do dia: ${formatProductionCalendarCompactNumber(productivePeople)} colaboradores equivalentes de ${formatProductionCalendarCompactNumber(availablePeople)} disponíveis (${percentLabel}).`;
      productivityBadge.setAttribute('aria-label', productivityBadge.title);
      dayHeading.appendChild(productivityBadge);
    }
    if (day.stockAlert?.count > 0) {
      const stockAlerts = document.createElement('span');
      stockAlerts.className = 'production-calendar-day-stock-alerts';
      const items = Array.isArray(day.stockAlert.items) && day.stockAlert.items.length
        ? day.stockAlert.items
        : [{ key: 'critical', label: 'Crítico', count: day.stockAlert.count }];
      items.forEach(item => {
        const stockAlert = document.createElement('span');
        stockAlert.className = `production-calendar-day-stock-alert is-${item.key}`;
        stockAlert.textContent = `▲ ${item.count}`;
        stockAlert.title = `${item.label}: ${item.count} material(is) de venda`;
        stockAlert.setAttribute('aria-label', stockAlert.title);
        stockAlerts.appendChild(stockAlert);
      });
      dayHeading.appendChild(stockAlerts);
    }
    header.appendChild(dayHeading);
  });

  grid.appendChild(header);

  rows.forEach(row => {
    const rowElement = document.createElement('div');
    rowElement.className = 'production-calendar-grid-row';

    const machineCell = document.createElement('div');
    machineCell.className = 'production-calendar-machine-cell';
    machineCell.textContent = row.machine.name;
    rowElement.appendChild(machineCell);

    normalizedDays.forEach((day, dayIndex) => {
      const cell = document.createElement('div');
      cell.className = 'production-calendar-cell';
      cell.dataset.machineId = String(row.machine.id);
      cell.dataset.date = day.date;
      cell.hidden = dayIndex >= visibleDayCount;
      dayElements[dayIndex].push(cell);
      if (isProductionCalendarNonWorkingDay(day)) {
        cell.classList.add('is-non-working-day');
      }

      row.allocationsByDate[day.date].forEach(allocation => {
        cell.appendChild(ProductionCalendarCard({
          allocation,
          selected: String(allocation.allocationId) === String(state.selectedAllocationId),
          onOpenDetails,
          onEdit: onEditAllocation,
          onTransport: onTransportAllocation,
          onToggleSelection,
          onStartDrag,
          shouldSuppressClick
        }));
      });

      rowElement.appendChild(cell);
    });

    grid.appendChild(rowElement);
  });

  queueProductionTransportConnectorDraw(grid, allocations);

  return grid;
}
