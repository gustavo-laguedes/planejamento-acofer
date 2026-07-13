import { ProductionCalendarCard } from './ProductionCalendarCard.js';
import {
  createProductionCalendarGridRows,
  fillProductionCalendarDayRange,
  formatProductionCalendarDate,
  getProductionCalendarDayCardCounts,
  getProductionCalendarWeekday,
  isProductionCalendarNonWorkingDay,
  normalizeProductionCalendarDay
} from './productionCalendar.utils.js';
import { getProductionCalendarZoomLevel } from './ProductionCalendarState.js';

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

/**
 * Renders a simple read-only grid grouped by machine and day.
 *
 * @param {Object} props
 * @param {Array<string|Date|Object>} props.days
 * @param {Array<Object>} props.machines
 * @param {Array<Object>} props.allocations
 * @param {Object} props.state
 * @param {(allocation: Object) => void} [props.onOpenDetails]
 * @param {(allocation: Object) => void} [props.onToggleSelection]
 * @param {(event: PointerEvent, allocation: Object, card: HTMLElement) => void} [props.onStartDrag]
 * @param {(allocationId: string|number) => boolean} [props.shouldSuppressClick]
 * @returns {HTMLElement}
 */
export function ProductionCalendarGrid({
  days = [],
  machines = [],
  allocations = [],
  state = {},
  onOpenDetails,
  onToggleSelection,
  onStartDrag,
  shouldSuppressClick
} = {}) {
  const normalizedDays = fillProductionCalendarDayRange(days.map(normalizeProductionCalendarDay));
  const rows = createProductionCalendarGridRows({ days: normalizedDays, machines, allocations });
  const dayCardCounts = getProductionCalendarDayCardCounts(rows, normalizedDays);
  const grid = document.createElement('div');
  grid.className = 'production-calendar-grid';
  grid.style.setProperty('--production-calendar-day-count', String(Math.max(normalizedDays.length, 1)));
  applyProductionCalendarGridZoom(grid, {
    days: normalizedDays,
    dayCardCounts,
    zoom: state.zoom
  });
  grid.__productionCalendarZoomContext = {
    days: normalizedDays,
    dayCardCounts
  };

  const header = document.createElement('div');
  header.className = 'production-calendar-grid-header';

  const machineHeading = document.createElement('div');
  machineHeading.className = 'production-calendar-machine-heading';
  machineHeading.textContent = 'Máquina';
  header.appendChild(machineHeading);

  normalizedDays.forEach(day => {
    const dayHeading = document.createElement('div');
    dayHeading.className = 'production-calendar-day-heading';
    dayHeading.dataset.date = day.date;
    if (isProductionCalendarNonWorkingDay(day)) {
      dayHeading.classList.add('is-non-working-day');
    }

    const weekdayLine = document.createElement('span');
    weekdayLine.className = 'production-calendar-day-weekday';
    weekdayLine.textContent = `${day.weekday || getProductionCalendarWeekday(day.date)}, ${formatProductionCalendarDate(day.date).slice(0, 5)}`;

    const dateLine = document.createElement('span');
    dateLine.className = 'production-calendar-day-date';
    dateLine.textContent = formatProductionCalendarDate(day.date);

    dayHeading.append(weekdayLine, dateLine);
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

    normalizedDays.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'production-calendar-cell';
      cell.dataset.machineId = String(row.machine.id);
      cell.dataset.date = day.date;
      if (isProductionCalendarNonWorkingDay(day)) {
        cell.classList.add('is-non-working-day');
      }

      row.allocationsByDate[day.date].forEach(allocation => {
        cell.appendChild(ProductionCalendarCard({
          allocation,
          selected: String(allocation.allocationId) === String(state.selectedAllocationId),
          onOpenDetails,
          onToggleSelection,
          onStartDrag,
          shouldSuppressClick
        }));
      });

      rowElement.appendChild(cell);
    });

    grid.appendChild(rowElement);
  });

  return grid;
}
