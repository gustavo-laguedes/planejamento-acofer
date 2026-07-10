import { holidayForDate } from './holidays.js';

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

function minDate(...dates) {
  return dates.filter(Boolean).sort()[0] || null;
}

function maxDate(...dates) {
  const sorted = dates.filter(Boolean).sort();
  return sorted[sorted.length - 1] || null;
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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_TEAM_AVAILABLE = 6;

function isDefaultShiftLabel(label = '') {
  return /^Turno\s*1$/i.test(String(label || '').trim()) || /^T1$/i.test(String(label || '').trim());
}

function defaultTeamAvailableForShift(shift = {}, index = 0) {
  const label = shift.label || `Turno ${index + 1}`;
  const available = Math.max(Number(shift.teamAvailable || DEFAULT_TEAM_AVAILABLE), 0);
  return isDefaultShiftLabel(label) ? Math.max(available, DEFAULT_TEAM_AVAILABLE) : available;
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

function isWeekend(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function nonWorkingInfo(date) {
  const holiday = holidayForDate(date);
  if (holiday) return { kind: 'holiday', name: holiday.name };
  if (isWeekend(date)) return { kind: 'weekend', name: 'Fim de semana' };
  return null;
}

function confirmProductionDate(date) {
  const info = nonWorkingInfo(date);
  if (!info) return true;
  if (info.kind === 'holiday') {
    return window.confirm(`Esta data \u00e9 feriado: ${info.name}. Deseja manter produ\u00e7\u00e3o mesmo assim?`);
  }
  return window.confirm('Esta data \u00e9 fim de semana. Deseja manter produ\u00e7\u00e3o mesmo assim?');
}

function formatHours(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function productiveMinutes(value, fallback = 8) {
  const rawValue = String(value ?? '').trim();
  const durationValue = rawValue.match(/^(\d+),(\d{2})$/);
  if (durationValue && Number(durationValue[2]) <= 59) {
    return Math.max((Number(durationValue[1]) * 60) + Number(durationValue[2]), 1);
  }
  const number = Number(rawValue.replace(',', '.'));
  return Math.max(Math.round((Number.isFinite(number) && number > 0 ? number : fallback) * 60), 1);
}

function formatProductiveMinutes(minutes) {
  const safeMinutes = Math.max(Math.round(Number(minutes) || 0), 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return mins ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`;
}

function formatDurationMinutes(minutes) {
  const safeMinutes = Math.max(Math.round(Number(minutes) || 0), 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}min`;
}

function escapeAttr(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function hexToRgb(value) {
  const normalized = String(value || '').replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function mixHex(firstColor, secondColor, amount = 0.5) {
  const first = hexToRgb(firstColor);
  const second = hexToRgb(secondColor);
  return rgbToHex({
    r: first.r + ((second.r - first.r) * amount),
    g: first.g + ((second.g - first.g) * amount),
    b: first.b + ((second.b - first.b) * amount)
  });
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

function machineOptionTags(options, selectedValue) {
  return options.map(option => `
    <option value="${escapeAttr(optionValue(option))}" ${optionValue(option) === selectedValue ? 'selected' : ''}>${escapeAttr(option.machineName)} | ${escapeAttr(option.peopleCount)} pessoa${Number(option.peopleCount) === 1 ? '' : 's'}</option>
  `).join('');
}

function machineNameOptionTags(options, selectedValue) {
  return options.map(option => `
    <option value="${escapeAttr(optionValue(option))}" ${optionValue(option) === selectedValue ? 'selected' : ''}>${escapeAttr(option.machineName)}</option>
  `).join('');
}

function peopleOptionTags(options, selectedValue) {
  return options.map(option => `
    <option value="${escapeAttr(optionValue(option))}" ${optionValue(option) === selectedValue ? 'selected' : ''}>${escapeAttr(option.peopleCount)}</option>
  `).join('');
}

function modelOptions(operation) {
  return Array.isArray(operation.productionModelOptions) ? operation.productionModelOptions : [];
}

function productionModelFallback(operation) {
  return operation.isInitialRawMaterial ? 'Mat&eacute;ria-prima inicial' : 'Sem origem';
}

function focusFirstOperation(wrapper, dates, operations) {
  const firstOperation = operations
    .filter(operation => operation.startDate)
    .sort((first, second) => dateTimeMs(first.startDate, operationStartTime(first)) - dateTimeMs(second.startDate, operationStartTime(second)))[0];
  const firstIndex = firstOperation ? dates.indexOf(firstOperation.startDate) : -1;
  if (firstIndex < 0) return;
  requestAnimationFrame(() => {
    const board = wrapper.querySelector('.gantt-board');
    if (!board || !board.scrollWidth || !dates.length) return;
    const timeAxisWidth = board.querySelector('.agenda-time-axis')?.offsetWidth || 0;
    const dayWidth = (board.scrollWidth - timeAxisWidth) / dates.length;
    const hourHeight = Number(board.style.getPropertyValue('--calendar-hour-height').replace('px', '')) || 58;
    const topPad = Number(board.style.getPropertyValue('--calendar-top-pad').replace('px', '')) || 0;
    const startMinutes = parseTime(operationStartTime(firstOperation), '00:00');
    board.scrollLeft = Math.max(0, dayWidth * (firstIndex - 0.5));
    board.scrollTop = Math.max(0, topPad + ((Math.max(startMinutes - 60, 0)) / 60) * hourHeight);
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

const PRODUCTION_STAGE_COLORS = [
  [
    { bg: '#E5E7EB', border: '#111827', text: '#111827' },
    { bg: '#F3F4F6', border: '#374151', text: '#111827' },
    { bg: '#F9FAFB', border: '#6B7280', text: '#111827' },
    { bg: '#FFFFFF', border: '#9CA3AF', text: '#111827' }
  ],
  [
    { bg: '#D9EEF7', border: '#0E7490', text: '#083344' },
    { bg: '#E8F6FB', border: '#0891B2', text: '#083344' },
    { bg: '#F0FAFD', border: '#22A7C7', text: '#083344' },
    { bg: '#FFFFFF', border: '#67C3D8', text: '#083344' }
  ],
  [
    { bg: '#DDF4E7', border: '#15803D', text: '#052E16' },
    { bg: '#EAF8F0', border: '#16A34A', text: '#052E16' },
    { bg: '#F2FBF6', border: '#4FBC73', text: '#052E16' },
    { bg: '#FFFFFF', border: '#86D39E', text: '#052E16' }
  ],
  [
    { bg: '#FFE7C2', border: '#C76A00', text: '#431407' },
    { bg: '#FFF0D6', border: '#EA8500', text: '#431407' },
    { bg: '#FFF6E8', border: '#F59E0B', text: '#431407' },
    { bg: '#FFFFFF', border: '#F7B844', text: '#431407' }
  ],
  [
    { bg: '#EBDDF8', border: '#7E22CE', text: '#2E1065' },
    { bg: '#F2E9FB', border: '#9333EA', text: '#2E1065' },
    { bg: '#F8F2FE', border: '#A855F7', text: '#2E1065' },
    { bg: '#FFFFFF', border: '#C084FC', text: '#2E1065' }
  ],
  [
    { bg: '#FADBE2', border: '#BE123C', text: '#4C0519' },
    { bg: '#FCE8ED', border: '#E11D48', text: '#4C0519' },
    { bg: '#FFF1F4', border: '#F43F5E', text: '#4C0519' },
    { bg: '#FFFFFF', border: '#FB7185', text: '#4C0519' }
  ],
  [
    { bg: '#D6F0ED', border: '#0F766E', text: '#042F2E' },
    { bg: '#E4F7F5', border: '#0D9488', text: '#042F2E' },
    { bg: '#F0FCFA', border: '#14B8A6', text: '#042F2E' },
    { bg: '#FFFFFF', border: '#5EEAD4', text: '#042F2E' }
  ],
  [
    { bg: '#F8E8B8', border: '#A16207', text: '#422006' },
    { bg: '#FCF0CA', border: '#CA8A04', text: '#422006' },
    { bg: '#FEF7E0', border: '#EAB308', text: '#422006' },
    { bg: '#FFFFFF', border: '#FACC15', text: '#422006' }
  ],
  [
    { bg: '#E2E8F0', border: '#475569', text: '#0F172A' },
    { bg: '#EEF2F6', border: '#64748B', text: '#0F172A' },
    { bg: '#F8FAFC', border: '#94A3B8', text: '#0F172A' },
    { bg: '#FFFFFF', border: '#CBD5E1', text: '#0F172A' }
  ],
  [
    { bg: '#D7F0F4', border: '#117184', text: '#082F49' },
    { bg: '#E6F7FA', border: '#0E8CA6', text: '#082F49' },
    { bg: '#F1FBFD', border: '#38AFC8', text: '#082F49' },
    { bg: '#FFFFFF', border: '#79CEE0', text: '#082F49' }
  ],
  [
    { bg: '#E7EFBF', border: '#657A16', text: '#1A2E05' },
    { bg: '#F0F6D4', border: '#84A11B', text: '#1A2E05' },
    { bg: '#F7FAE7', border: '#A3BF3F', text: '#1A2E05' },
    { bg: '#FFFFFF', border: '#C6D96B', text: '#1A2E05' }
  ],
  [
    { bg: '#F2DECF', border: '#9A3412', text: '#431407' },
    { bg: '#F8E9DE', border: '#C2410C', text: '#431407' },
    { bg: '#FCF3EC', border: '#EA580C', text: '#431407' },
    { bg: '#FFFFFF', border: '#FB923C', text: '#431407' }
  ],
  [
    { bg: '#F8DDE6', border: '#A21CAF', text: '#4A044E' },
    { bg: '#FCE9F1', border: '#C026D3', text: '#4A044E' },
    { bg: '#FDF4F8', border: '#D946EF', text: '#4A044E' },
    { bg: '#FFFFFF', border: '#E879F9', text: '#4A044E' }
  ]
];
const PRODUCTION_COLOR_SEQUENCE = [1, 3, 2, 4, 7, 6, 5, 8, 10, 9, 11, 12, 0];

const TRANSPORT_COLOR = { bg: '#f3f5f7', border: '#c6ced6', text: '#3d4752' };
const SEQUENTIAL_EVENT_VISUAL_GAP_MINUTES = 1;
const CALENDAR_VIEW_STORAGE_KEY = 'planejamento_calendar_view';
const CALENDAR_RANGE_MARGIN_DAYS = 3;
const CALENDAR_MAX_EXTRA_DAYS = 14;
const CALENDAR_MAX_VISIBLE_DAYS = 45;
const CALENDAR_MODE_DEFAULTS = {
  planning: {
    showTeamCapacity: true,
    editableTeamCapacity: true,
    showStockModal: true,
    showProductionDetails: true,
    showOnlyFinalProducts: false,
    readOnly: false
  },
  analysis: {
    showTeamCapacity: true,
    editableTeamCapacity: true,
    showStockModal: true,
    showProductionDetails: true,
    showOnlyFinalProducts: false,
    readOnly: false
  },
  commercial: {
    showTeamCapacity: false,
    editableTeamCapacity: false,
    showStockModal: false,
    showProductionDetails: true,
    showOnlyFinalProducts: true,
    showTeamDetails: false,
    readOnly: true
  }
};
const MACHINE_CALENDAR_ORDER = [
  'Trefila',
  'EC-125',
  'EC-60',
  'Focus-8',
  'Aco-8',
  'MT-200',
  'MT-150',
  'MT-100'
];

function normalizeMachineName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function machineLabel(machineName) {
  return machineName === 'Aco-8' ? 'A&ccedil;o-8' : escapeAttr(machineName);
}

function operationMachineNames(operation) {
  const breakdown = productionBreakdown(operation);
  const names = breakdown.length > 1
    ? breakdown.map(item => item.machineName || operation.machineName)
    : [operation.machineName];
  return [...new Set(names.filter(Boolean).map(String))];
}

function savedCalendarView() {
  try {
    return sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) || 'machines';
  } catch {
    return 'machines';
  }
}

function saveCalendarView(viewMode) {
  try {
    sessionStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, viewMode);
  } catch {
    // Ignore blocked storage; the view still works for the current component instance.
  }
}

function segmentMinutes(segment, dayStart, dayEnd) {
  const start = clampMinutes(parseTime(segment.startTime, minutesToTime(dayStart)), dayStart, dayEnd);
  const end = clampMinutes(parseTime(segment.endTime, minutesToTime(dayEnd)), dayStart, dayEnd);
  return { start, end };
}

function segmentStyle(segment, dayStart, dayEnd, hourHeight) {
  const { start, end } = segmentMinutes(segment, dayStart, dayEnd);
  const visualStart = Number.isFinite(segment.visualStart)
    ? clampMinutes(segment.visualStart, dayStart, end)
    : start;
  const top = ((visualStart - dayStart) / 60) * hourHeight;
  const rawHeight = ((Math.max(end - visualStart, 1)) / 60) * hourHeight;
  const height = Math.max(rawHeight - 4, 18);
  return `--event-top: calc(var(--calendar-top-pad, 0px) + ${top + 2}px); --event-height: ${height}px;`;
}

function laneStyle(lane, laneCount) {
  const width = 100 / Math.max(laneCount, 1);
  return `--event-left: calc(8px + ${lane * width}%); --event-width: calc(${width}% - 16px);`;
}

function machineSegmentStyle(segment, dayStart, dayEnd, lane, laneCount) {
  const { start, end } = segmentMinutes(segment, dayStart, dayEnd);
  const visualStart = Number.isFinite(segment.visualStart)
    ? clampMinutes(segment.visualStart, dayStart, end)
    : start;
  const left = ((visualStart - dayStart) / (dayEnd - dayStart)) * 100;
  const width = (Math.max(end - visualStart, 1) / (dayEnd - dayStart)) * 100;
  const laneHeight = 100 / Math.max(laneCount, 1);
  return `--event-left: calc(${left}% + 4px); --event-width: max(calc(${width}% - 8px), 1px); --event-top: calc(${lane * laneHeight}% + 5px); --event-height: calc(${laneHeight}% - 10px);`;
}

function shiftRangesForMachine(shifts) {
  return shifts
    .map(shift => ({ start: shift.shiftStart, end: shift.shiftEnd }))
    .filter(range => range.end > range.start)
    .sort((left, right) => left.start - right.start);
}

function rangesDuration(ranges) {
  return ranges.reduce((sum, range) => sum + Math.max(range.end - range.start, 0), 0);
}

function rangeOffset(minutes, ranges) {
  let offset = 0;
  for (const range of ranges) {
    if (minutes <= range.start) return offset;
    if (minutes <= range.end) return offset + (minutes - range.start);
    offset += range.end - range.start;
  }
  return offset;
}

function machineSegmentStyleByRanges(segment, ranges, lane, laneCount) {
  const dayStart = ranges[0]?.start ?? 0;
  const dayEnd = ranges[ranges.length - 1]?.end ?? 24 * 60;
  const { start, end } = segmentMinutes(segment, dayStart, dayEnd);
  const totalMinutes = Math.max(rangesDuration(ranges), 1);
  const visualStart = Number.isFinite(segment.visualStart)
    ? clampMinutes(segment.visualStart, start, end)
    : start;
  const left = (rangeOffset(visualStart, ranges) / totalMinutes) * 100;
  const width = ((rangeOffset(end, ranges) - rangeOffset(visualStart, ranges)) / totalMinutes) * 100;
  const laneHeight = 100 / Math.max(laneCount, 1);
  return `--event-left: calc(${left}% + 4px); --event-width: max(calc(${width}% - 8px), 1px); --event-top: calc(${lane * laneHeight}% + 5px); --event-height: calc(${laneHeight}% - 10px);`;
}

function colorStyle(color) {
  return `--event-bg: ${color.bg}; --event-border: ${color.border}; --event-text: ${color.text};`;
}

function stableProductionIndex(item = {}) {
  const explicit = Number(item.productionIndex);
  if (Number.isFinite(explicit)) return explicit;
  const match = String(item.productionKey || '').match(/production-(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function stableProductionKey(item = {}) {
  return item.productionKey || `production-${stableProductionIndex(item)}`;
}

function productionColorSequenceIndex(index = 0) {
  const normalized = Math.max(Number(index) || 0, 0);
  return PRODUCTION_COLOR_SEQUENCE[normalized % PRODUCTION_COLOR_SEQUENCE.length] || 0;
}

function productionStageColorsFromBase(color) {
  if (!isHexColor(color)) return null;
  const border = String(color).toUpperCase();
  const solid = { bg: mixHex(border, '#FFFFFF', 0.78), border, text: '#1F2937' };
  return [solid, solid, solid, solid];
}

function operationDailyCapacity(operation = {}) {
  const capacity = operation.calendarDailyCapacity || operation.dailyCapacity || {};
  const capacityPerDay = Number(capacity.capacityPerDay || capacity.maxQtyPerMachineDay || capacity.maxQtyPerTeamDay || 0);
  const quantity = Number(operation.produceQty || 0);
  const percent = capacityPerDay > 0 ? Math.round((quantity / capacityPerDay) * 100) : null;
  const available = capacityPerDay > 0 ? Math.max(capacityPerDay - quantity, 0) : null;
  return { capacityPerDay, percent, available };
}

function operationCapacityLabel(operation = {}) {
  const { percent } = operationDailyCapacity(operation);
  return percent == null ? '-' : `${percent}%`;
}

function operationAvailableCapacityLabel(operation = {}) {
  const { available } = operationDailyCapacity(operation);
  if (available == null) return '-';
  return `${formatQty(available)} ${operation.unit || ''}`.trim();
}

function operationMaxCapacityLabel(operation = {}) {
  const { capacityPerDay } = operationDailyCapacity(operation);
  if (!(capacityPerDay > 0)) return '-';
  return `${formatQty(capacityPerDay)} ${operation.unit || ''}`.trim();
}

function operationDayDurationLabel(operation = {}, segments = []) {
  const segmentMinutesTotal = segments.reduce((sum, segment) => {
    const start = parseTime(segment.startTime, '00:00');
    const end = parseTime(segment.endTime, '00:00');
    return sum + Math.max(end - start, 0);
  }, 0);
  const fallbackMinutes = Number(operation.totalMinutes || operation.durationMinutes || 0);
  return formatDurationMinutes(segmentMinutesTotal || fallbackMinutes);
}

export function productionCalendarColor(index = 0, color = null) {
  const customPalette = productionStageColorsFromBase(color);
  if (customPalette) return { ...customPalette[0] };
  const paletteIndex = productionColorSequenceIndex(index);
  return { ...PRODUCTION_STAGE_COLORS[paletteIndex % PRODUCTION_STAGE_COLORS.length][0] };
}

function eventColorStyle(color, breakdown, colorForProduction) {
  const items = stableProductionBreakdown(breakdown);
  if (items.length <= 1) return colorStyle(color);
  const firstColor = colorForProduction(items[0]);
  return colorStyle(firstColor);
}

function stableProductionBreakdown(items = []) {
  return [...items].sort((left, right) =>
    stableProductionIndex(left) - stableProductionIndex(right)
    || String(stableProductionKey(left)).localeCompare(String(stableProductionKey(right)))
  );
}

function productionBreakdown(operation) {
  const source = Array.isArray(operation.productionBreakdown) && operation.productionBreakdown.length
    ? operation.productionBreakdown
    : [{
      productionIndex: Number(operation.productionIndex || 0),
      productionKey: operation.productionKey || `production-${Number(operation.productionIndex || 0)}`,
      productionTitle: operation.productionTitle || `Produção ${Number(operation.productionIndex || 0) + 1}`,
      quantity: Number(operation.produceQty || 0),
      unit: operation.unit || ''
    }];
  const grouped = new Map();
  source.forEach(item => {
    const productionIndex = stableProductionIndex(item);
    const key = String(item.productionKey || `production-${productionIndex}`);
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...item,
        productionIndex,
        productionKey: key,
        operationIds: [],
        quantity: 0,
        unit: item.unit || operation.unit || ''
      });
    }
    const current = grouped.get(key);
    const fallbackOperationId = `${productionIndex}:${item.materialId || operation.materialId}`;
    const itemOperationId = item.operationId || fallbackOperationId || operation.operationId || operation.materialId;
    current.operationId = current.operationId || itemOperationId;
    current.operationIds = [...new Set([...(current.operationIds || []), itemOperationId].filter(Boolean).map(String))];
    current.materialId = current.materialId || item.materialId || operation.materialId;
    current.materialName = current.materialName || item.materialName || operation.materialName;
    current.machineName = current.machineName || item.machineName || operation.machineName;
    current.peopleCount = current.peopleCount ?? item.peopleCount ?? operation.peopleCount;
    current.productionModelName = current.productionModelName || item.productionModelName || operation.productionModelName;
    current.productivityOptions = current.productivityOptions?.length ? current.productivityOptions : item.productivityOptions || operation.productivityOptions || [];
    current.productionModelOptions = current.productionModelOptions?.length ? current.productionModelOptions : item.productionModelOptions || operation.productionModelOptions || [];
    current.quantity = Number((Number(current.quantity || 0) + Number(item.quantity || 0)).toFixed(3));
  });
  return stableProductionBreakdown([...grouped.values()]);
}

function splitRootOperationId(operation = {}) {
  const id = String(operation.splitParentOperationId || operation.operationId || operation.materialId || '');
  return id.includes(':parte:') ? id.split(':parte:')[0] : id;
}

function splitPartsFromOperations(parentId, operationList = []) {
  return operationList
    .filter(item => String(item.splitParentOperationId || '') === String(parentId))
    .sort((left, right) =>
      Number(left.splitPartNumber || 0) - Number(right.splitPartNumber || 0)
      || dateTimeMs(left.startDate, operationStartTime(left)) - dateTimeMs(right.startDate, operationStartTime(right))
    )
    .map(item => ({
      quantity: Number(item.produceQty || 0),
      startDate: item.startDate,
      startTime: operationStartTime(item),
      machineName: item.machineName,
      peopleCount: item.peopleCount,
      productionModelName: item.productionModelName
    }));
}

function operationWithSplitParent(operation, operationList = []) {
  if (!operation?.splitParentOperationId) return operation;
  const parentId = splitRootOperationId(operation);
  const siblings = operationList.filter(item => String(item.splitParentOperationId || '') === String(parentId));
  if (!siblings.length) return operation;
  const ordered = siblings.slice().sort((left, right) =>
    dateTimeMs(left.startDate, operationStartTime(left)) - dateTimeMs(right.startDate, operationStartTime(right))
  );
  const last = ordered[ordered.length - 1];
  return {
    ...operation,
    operationId: parentId,
    splitParentOperationId: null,
    splitParts: splitPartsFromOperations(parentId, operationList),
    produceQty: Number(siblings.reduce((sum, item) => sum + Number(item.produceQty || 0), 0).toFixed(3)),
    startDate: ordered[0]?.startDate || operation.startDate,
    startTime: operationStartTime(ordered[0]) || operationStartTime(operation),
    endDate: last?.endDate || operation.endDate,
    endTime: operationEndTime(last) || operationEndTime(operation)
  };
}

function productivitySummary(operation, breakdown = productionBreakdown(operation)) {
  const items = breakdown.length ? breakdown : [operation];
  const labels = [...new Set(items.map(item => {
    const outputQty = item.outputQty ?? operation.outputQty;
    const outputUnit = item.outputUnit ?? operation.outputUnit;
    if (outputQty) return `${formatQty(outputQty)} ${outputUnit || ''}/dia`.trim();
    const machineName = item.machineName || operation.machineName || '-';
    const peopleCount = item.peopleCount ?? operation.peopleCount ?? '-';
    return `${machineName} | ${peopleCount} pessoa${Number(peopleCount) === 1 ? '' : 's'}`;
  }).filter(Boolean))];
  return labels.join(' | ');
}

function productivityLabelForSelection(options = [], machineName, peopleCount, fallbackOperation = {}) {
  const selected = options.find(option =>
    option.machineName === machineName
    && Number(option.peopleCount || 0) === Number(peopleCount || 0)
  );
  return productivitySummary({
    ...fallbackOperation,
    machineName,
    peopleCount,
    outputQty: selected?.outputQty,
    outputUnit: selected?.outputUnit,
    timeSeconds: selected?.timeSeconds
  }, []);
}

function breakdownText(operation) {
  const items = productionBreakdown(operation);
  if (items.length <= 1) return [];
  return [
    '',
    'Produções:',
    ...items.map(item => `${item.productionTitle || `Produção ${Number(item.productionIndex || 0) + 1}`}: ${formatQty(item.quantity)} ${item.unit || operation.unit || ''}`.trim())
  ];
}

function normalizeShiftConfig(config = {}) {
  const dailyTeamOverrides = normalizeDailyTeamOverrides(config.dailyTeamOverrides);
  const source = Array.isArray(config.shifts) && config.shifts.length ? config.shifts : [{
    label: 'Turno 1',
    shiftStartTime: config.shiftStartTime || '07:00',
    shiftEndTime: config.shiftEndTime || '17:00',
    pauseHours: config.lunchHours || 0,
    teamAvailable: DEFAULT_TEAM_AVAILABLE
  }];
  return source.map((shift, index) => {
    const shiftStart = parseTime(shift.shiftStartTime, index === 0 ? '07:00' : '17:00');
    const dailyMinutes = productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6);
    let shiftEnd = parseTime(shift.shiftEndTime, minutesToTime(shiftStart + dailyMinutes));
    if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
    return {
      label: shift.label || `Turno ${index + 1}`,
      shiftStart,
      shiftEnd,
      lunchStart: shiftStart,
      lunchEnd: shiftStart,
      dailyMinutes: Math.min(dailyMinutes, Math.max(shiftEnd - shiftStart, 1)),
      teamAvailable: defaultTeamAvailableForShift(shift, index),
      dailyTeamOverrides
    };
  });
}

function normalizeDailyTeamOverrides(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([date, shifts]) => {
    if (!shifts || typeof shifts !== 'object' || Array.isArray(shifts)) return [date, {}];
    return [date, Object.fromEntries(Object.entries(shifts)
      .map(([label, amount]) => [label, Math.max(Number(amount || 0), 0)])
      .filter(([, amount]) => Number.isFinite(amount)))];
  }));
}

function teamAvailableForShift(shift, date) {
  const overrides = shift.dailyTeamOverrides?.[date] || {};
  const override = overrides[shift.label] ?? overrides[String(shift.label || '').replace(/^Turno\s*/i, 'T')];
  return override == null ? shift.teamAvailable : Math.max(Number(override || 0), 0);
}

function peakPeople(items) {
  const points = [];
  const seen = new Set();
  items.forEach(item => {
    const people = Number(item.operation.peopleCount || 0);
    if (!people || item.operation.operationType === 'transport') return;
    const { start, end } = item;
    if (end <= start) return;
    const operationKey = String(item.operation.operationId || item.operation.materialId || item.operation.materialName || '');
    const segmentKey = `${operationKey}:${start}:${end}`;
    if (seen.has(segmentKey)) return;
    seen.add(segmentKey);
    points.push({ minute: start, delta: people });
    points.push({ minute: end, delta: -people });
  });
  points.sort((left, right) => left.minute - right.minute || left.delta - right.delta);
  let current = 0;
  let peak = 0;
  points.forEach(point => {
    current += point.delta;
    peak = Math.max(peak, current);
  });
  return peak;
}

function capacityForDate(date, operations, dates, shifts) {
  return shifts.map(shift => {
    const segments = operations.flatMap(operation => {
      const dayParts = operationDaySegments(operation, dates, shift.shiftStart, shift.shiftEnd, shift.lunchStart, shift.lunchEnd).get(date) || [];
      return dayParts.map(segment => {
        const { start, end } = segmentMinutes(segment, shift.shiftStart, shift.shiftEnd);
        return { operation, start, end };
      });
    });
    const used = peakPeople(segments);
    const hasOverride = shift.dailyTeamOverrides?.[date]?.[shift.label] != null;
    const available = teamAvailableForShift(shift, date);
    return {
      label: shift.label,
      used,
      available,
      overridden: hasOverride,
      exceeded: available > 0 && used > available
    };
  });
}

function capacityForDateFromSegments(date, operationSegments, shifts) {
  return shifts.map(shift => {
    const segments = [];
    for (const [operation, byDate] of operationSegments.entries()) {
      const dayParts = byDate.get(date) || [];
      for (const segment of dayParts) {
        const { start, end } = segmentMinutes(segment, shift.shiftStart, shift.shiftEnd);
        segments.push({ operation, start, end });
      }
    }
    const used = peakPeople(segments);
    const hasOverride = shift.dailyTeamOverrides?.[date]?.[shift.label] != null;
    const available = teamAvailableForShift(shift, date);
    return {
      label: shift.label,
      used,
      available,
      overridden: hasOverride,
      exceeded: available > 0 && used > available
    };
  });
}

function capacityTooltip(items) {
  return items.map(item => (
    item.exceeded
      ? `${item.label}: Equipe excedida: ${item.used} pessoas usadas simultaneamente, ${item.available || 0} disponiveis.`
      : `${item.label}: equipe ${item.used}/${item.available || 0}`
  )).join('\n');
}

function renderCapacityHeader(date, operations, dates, shifts, blockedDay) {
  const capacity = capacityForDate(date, operations, dates, shifts);
  return renderCapacityHeaderWithCapacity(date, capacity, blockedDay);
}

function stockAlertTitle(alert) {
  const count = Number(alert?.criticalCount ?? alert?.count ?? 0);
  if (!count) return '';
  return `${count} materiais abaixo do estoque minimo`;
}

function renderStockAlertIcon(alert) {
  const title = stockAlertTitle(alert);
  if (!title) return '';
  return `<span class="calendar-stock-alert" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">!</span>`;
}

function hasStockAlert(alert) {
  return Boolean(alert && Number(alert?.criticalCount ?? alert?.count ?? 0) > 0);
}

function renderCapacityHeaderWithCapacity(date, capacity, blockedDay, stockAlert = null) {
  const capacityText = capacityTooltip(capacity);
  const title = [blockedDay?.name, stockAlertTitle(stockAlert), capacityText].filter(Boolean).join('\n');
  const hasOverride = capacity.some(item => item.overridden);
  return `
    <div class="gantt-date${capacity.some(item => item.exceeded) ? ' team-exceeded' : ''}${hasStockAlert(stockAlert) ? ' has-stock-alert' : ''}${blockedDay ? ' non-working-day' : ''}${hasOverride ? ' has-team-override' : ''}" data-date="${date}" title="${escapeAttr(title)}">
      <strong>${formatDateLabel(date)}${renderStockAlertIcon(stockAlert)}</strong>
      <span>${formatDate(date)}</span>
      <div class="team-capacity-list">
        ${capacity.map(item => `
          <button class="team-capacity${item.exceeded ? ' exceeded' : ''}" type="button" data-capacity-date="${date}" title="${escapeAttr(item.exceeded ? `Equipe excedida: ${item.used} pessoas usadas simultaneamente, ${item.available || 0} disponiveis.` : `${item.label}: Equipe ${item.used}/${item.available || 0}`)}">
            ${escapeAttr(item.label.replace(/^Turno\s*/i, 'T'))}: ${item.used}/${item.available || 0}${item.exceeded ? ' !' : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function showCapacityModal(wrapper, date, shifts) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal capacity-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <h2>Equipe dispon&iacute;vel</h2>
          <p class="modal-subtitle">${escapeAttr(formatDate(date))}</p>
        </div>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      <form class="capacity-form">
        <div class="grid-form">
          ${shifts.map(shift => `
            <label>${escapeAttr(shift.label)}
              <input name="${escapeAttr(shift.label)}" type="number" min="0" step="1" inputmode="numeric" value="${escapeAttr(teamAvailableForShift(shift, date))}" />
            </label>
          `).join('')}
        </div>
        <div class="form-actions modal-actions">
          <button class="secondary-button close-modal" type="button">Cancelar</button>
          <button class="primary-button" type="submit">Salvar</button>
        </div>
      </form>
    </div>
  `;
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop || event.target.classList.contains('close-modal')) close();
  });
  backdrop.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const overrides = {};
    for (const shift of shifts) {
      const input = form.elements.namedItem(shift.label);
      const amount = Number(String(input?.value || '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0) {
        alert('Informe uma quantidade valida de pessoas.');
        return;
      }
      overrides[shift.label] = Math.floor(amount);
    }
    wrapper.dispatchEvent(new CustomEvent('calendar-team-capacity-change', {
      bubbles: true,
      detail: { date, overrides, recalculateFromDate: date }
    }));
    close();
  });
  document.body.appendChild(backdrop);
}

function isHistoricalOperation(operation, minEditableDate = todayKey()) {
  return String(operation?.startDate || '') < minEditableDate;
}

function lunchStyle(lunchStart, lunchEnd, dayStart, dayEnd, hourHeight) {
  const start = clampMinutes(lunchStart, dayStart, dayEnd);
  const end = clampMinutes(lunchEnd, dayStart, dayEnd);
  const top = ((start - dayStart) / 60) * hourHeight;
  const height = Math.max(((Math.max(end - start, 0)) / 60) * hourHeight, 0);
  return `--lunch-top: calc(var(--calendar-top-pad, 0px) + ${top}px); --lunch-height: ${height}px;`;
}

function overlaps(first, second) {
  return first.start < second.end && second.start < first.end;
}

function segmentLaneKey(item = {}) {
  const operation = item.operation || {};
  return [
    operation.productionKey || operation.productionIndex || '',
    operation.productionColor || '',
    operation.machineName || '',
    operation.operationId || operation.materialId || operation.materialName || ''
  ].join('|');
}

function arrangeParallelSegments(items) {
  const sorted = items
    .map((item, index) => ({
      ...item,
      index,
      laneKey: segmentLaneKey(item),
      start: parseTime(item.segment.startTime),
      end: Math.max(parseTime(item.segment.endTime), parseTime(item.segment.startTime) + 1)
    }))
    .sort((first, second) => first.start - second.start || first.end - second.end);
  const active = [];
  const lanesByKey = new Map();
  let laneCount = 0;

  sorted.forEach(item => {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= item.start) active.splice(index, 1);
    }
    if (lanesByKey.has(item.laneKey) && !active.some(activeItem => activeItem.lane === lanesByKey.get(item.laneKey))) {
      item.lane = lanesByKey.get(item.laneKey);
    } else {
      const used = new Set(active.map(activeItem => activeItem.lane));
      item.lane = 0;
      while (used.has(item.lane)) item.lane += 1;
      if (!lanesByKey.has(item.laneKey)) lanesByKey.set(item.laneKey, item.lane);
    }
    laneCount = Math.max(laneCount, item.lane + 1);
    active.push(item);
  });
  sorted.forEach(item => {
    item.laneCount = laneCount;
  });

  sorted
    .slice()
    .sort((first, second) => first.lane - second.lane || first.start - second.start || first.end - second.end)
    .forEach((item, index, ordered) => {
      const touchesPrevious = ordered
        .slice(0, index)
        .some(previous => previous.lane === item.lane && previous.end === item.start);
      item.visualStart = touchesPrevious
        ? Math.min(item.start + SEQUENTIAL_EVENT_VISUAL_GAP_MINUTES, item.end)
        : item.start;
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

function normalizeLunchBreaks(lunchStart, lunchEnd) {
  if (Array.isArray(lunchStart)) {
    return lunchStart
      .filter(item => item && Number(item.lunchEnd) > Number(item.lunchStart))
      .map(item => ({ lunchStart: Number(item.lunchStart), lunchEnd: Number(item.lunchEnd) }));
  }
  return Number(lunchEnd) > Number(lunchStart) ? [{ lunchStart, lunchEnd }] : [];
}

function splitSegmentByLunchBreaks(segment, lunchBreaks, shiftStart, shiftEnd) {
  return lunchBreaks.reduce((parts, lunch) => (
    parts.flatMap(part => splitSegmentByLunch(part, lunch.lunchStart, lunch.lunchEnd, shiftStart, shiftEnd))
  ), [segment]);
}

function operationDaySegments(operation, dates, shiftStart, shiftEnd, lunchStart, lunchEnd) {
  const lunchBreaks = normalizeLunchBreaks(lunchStart, lunchEnd);
  const hasExplicitSegments = Boolean(operation.segments?.length);
  const baseSegments = hasExplicitSegments ? operation.segments : [{
    date: operation.startDate,
    startTime: operationStartTime(operation),
    endDate: operation.endDate,
    endTime: operationEndTime(operation)
  }];
  const byDate = new Map(dates.map(date => [date, []]));
  const visualSegments = [];
  baseSegments.forEach(segment => {
    const startDate = segment.date || operation.startDate;
    const endDate = segment.endDate || segment.date || operation.endDate;
    if (!startDate || !endDate) return;
    dates.forEach(date => {
      if (date < startDate || date > endDate) return;
      if (!byDate.has(date)) return;
      if (nonWorkingInfo(date) && !(operation.forcedNonWorkingDates || []).includes(date)) return;
      const startTime = date === startDate ? segment.startTime : minutesToTime(shiftStart);
      const endTime = date === endDate ? segment.endTime : minutesToTime(shiftEnd);
      splitSegmentByLunchBreaks({ ...segment, date, startTime, endDate: date, endTime }, lunchBreaks, shiftStart, shiftEnd)
        .forEach(part => visualSegments.push(part));
    });
  });
  visualSegments
    .sort((first, second) => dateTimeMs(first.date, first.startTime) - dateTimeMs(second.date, second.startTime))
    .forEach((part, index) => {
      byDate.get(part.date)?.push({ ...part, visualIndex: index });
    });
  return byDate;
}

function dispatchConfig(wrapper, operation, modal) {
  const productionRows = modal.querySelectorAll('.operation-production-row');
  if (productionRows.length) {
    const currentItems = productionBreakdown(operation);
    const changes = [...productionRows].map(row => {
      const machineSelect = row.querySelector('[name="productionMachine"]');
      const peopleSelect = row.querySelector('[name="productionPeople"]');
      const [machineName, peopleCount] = (peopleSelect?.value || machineSelect?.value || '').split('||');
      const productionModelName = row.querySelector('[name="productionModel"]')?.value || null;
      return {
        operationId: String(row.dataset.operationId || operation.operationId || operation.materialId),
        materialId: String(row.dataset.materialId || operation.materialId),
        productionIndex: Number(row.dataset.productionIndex || 0),
        machineName,
        peopleCount: Number(peopleCount || 0),
        productionModelName
      };
    }).filter(change => {
      const item = currentItems.find(part => Number(part.productionIndex || 0) === Number(change.productionIndex || 0));
      return item && (
        change.machineName !== item.machineName
        || Number(change.peopleCount || 0) !== Number(item.peopleCount || 0)
        || String(change.productionModelName || '') !== String(item.productionModelName || '')
      );
    });
    if (!changes.length) return;
    wrapper.dispatchEvent(new CustomEvent('operation-config-change', {
      bubbles: true,
      detail: { changes }
    }));
    return;
  }
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
      operationId: String(operation.operationId || operation.materialId),
      productionIndex: Number(operation.productionIndex || 0),
      machineName,
      peopleCount: Number(peopleCount || 0),
      productionModelName
    }
  }));
}

function operationForProductionRow(row, operation) {
  const [machineName, peopleCount] = (row.querySelector('[name="productionPeople"]')?.value
    || row.querySelector('[name="productionMachine"]')?.value
    || operationValue(operation)).split('||');
  return {
    ...operation,
    operationId: row.dataset.operationId || operation.operationId || operation.materialId,
    materialId: row.dataset.materialId || operation.materialId,
    productionIndex: Number(row.dataset.productionIndex || 0),
    produceQty: Number(row.dataset.quantity || 0),
    unit: row.dataset.unit || operation.unit,
    machineName,
    peopleCount: Number(peopleCount || 0),
    productionModelName: row.querySelector('[name="productionModel"]')?.value || operation.productionModelName,
    productivityOptions: productionBreakdown(operation).find(item =>
      Number(item.productionIndex || 0) === Number(row.dataset.productionIndex || 0)
    )?.productivityOptions || operation.productivityOptions || []
  };
}

function productionConfigTemplate(item, operation) {
  const machineOptions = item.productivityOptions?.length ? item.productivityOptions : operation.productivityOptions || [];
  const models = item.productionModelOptions?.length ? item.productionModelOptions : modelOptions(operation);
  const selectedValue = optionValue({
    machineName: item.machineName || operation.machineName,
    peopleCount: item.peopleCount ?? operation.peopleCount
  });
  const selectedModel = item.productionModelName || operation.productionModelName || models[0]?.modelName || '';
  return `
    <article class="operation-production-row" data-operation-id="${escapeAttr(item.operationId || operation.operationId || operation.materialId)}" data-material-id="${escapeAttr(item.materialId || operation.materialId)}" data-production-index="${Number(item.productionIndex || 0)}" data-quantity="${escapeAttr(item.quantity || 0)}" data-unit="${escapeAttr(item.unit || operation.unit || '')}">
      <div class="operation-production-heading">
        <strong>${escapeAttr(item.productionTitle || `Produção ${Number(item.productionIndex || 0) + 1}`)}</strong>
        <span>${formatQty(item.quantity)} ${escapeAttr(item.unit || operation.unit || '')}</span>
      </div>
      <label>Quantidade
        <input type="text" value="${escapeAttr(`${formatQty(item.quantity)} ${item.unit || operation.unit || ''}`.trim())}" disabled data-locked="true" />
      </label>
      <label>M&aacute;quina
        <select name="productionMachine" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
          ${machineNameOptionTags(machineOptions, selectedValue)}
        </select>
      </label>
      <label>Pessoas
        <select name="productionPeople" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
          ${peopleOptionTags(machineOptions, selectedValue)}
        </select>
      </label>
      <label>Modelo de produ&ccedil;&atilde;o
        <select name="productionModel" ${models.length > 1 ? '' : 'disabled data-locked="true"'}>
          ${models.length ? models.map(model => `<option value="${escapeAttr(model.modelName)}" ${String(model.modelName) === String(selectedModel) ? 'selected' : ''}>${escapeAttr(model.label || model.modelName)}</option>`).join('') : `<option value="">${productionModelFallback(operation)}</option>`}
        </select>
      </label>
      <div class="operation-production-split">
        <button class="secondary-button divide-production" type="button">Dividir produ&ccedil;&atilde;o</button>
        <p class="form-error split-warning" hidden></p>
        <div class="operation-splits-target"></div>
        <button class="secondary-button add-split" type="button" hidden>+ Adicionar divis&atilde;o</button>
      </div>
    </article>
  `;
}

function makeModalDraggable(backdrop) {
  const modal = backdrop.querySelector('.operation-modal');
  const handle = modal?.querySelector('.modal-header');
  if (!modal || !handle) return;
  let drag = null;
  const startDrag = event => {
    if (event.target.closest('button, input, select, textarea, a')) return false;
    const rect = modal.getBoundingClientRect();
    drag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.top}px`;
    modal.style.width = `${rect.width}px`;
    modal.style.transform = 'none';
    backdrop.classList.add('modal-backdrop-floating');
    modal.classList.add('is-floating');
    modal.classList.add('is-dragging');
    return true;
  };
  const moveDrag = event => {
    if (!drag) return;
    const rect = modal.getBoundingClientRect();
    const padding = 8;
    const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxTop = Math.max(padding, window.innerHeight - Math.min(rect.height, window.innerHeight - (padding * 2)) - padding);
    modal.style.left = `${Math.min(Math.max(padding, event.clientX - drag.offsetX), maxLeft)}px`;
    modal.style.top = `${Math.min(Math.max(padding, event.clientY - drag.offsetY), maxTop)}px`;
  };
  const stopDrag = () => {
    if (!drag) return;
    drag = null;
    modal.classList.remove('is-dragging');
  };
  handle.addEventListener('pointerdown', event => {
    if (!startDrag(event)) return;
    event.preventDefault();
    const movePointer = moveEvent => moveDrag(moveEvent);
    const stopPointer = () => {
      stopDrag();
      document.removeEventListener('pointermove', movePointer);
      document.removeEventListener('pointerup', stopPointer);
      document.removeEventListener('pointercancel', stopPointer);
    };
    document.addEventListener('pointermove', movePointer);
    document.addEventListener('pointerup', stopPointer);
    document.addEventListener('pointercancel', stopPointer);
  });
  handle.addEventListener('mousedown', event => {
    if (window.PointerEvent) return;
    if (!startDrag(event)) return;
    const moveMouse = moveEvent => moveDrag(moveEvent);
    const stopMouse = () => {
      stopDrag();
      document.removeEventListener('mousemove', moveMouse);
      document.removeEventListener('mouseup', stopMouse);
    };
    document.addEventListener('mousemove', moveMouse);
    document.addEventListener('mouseup', stopMouse);
  });
}

function tooltipText(operation) {
  const prefix = operation._existingScheduleBlocker
    ? [`Ja planejado${operation.planningCode ? `: ${operation.planningCode}` : ''}`, '']
    : [];
  if (operation.operationType === 'transport') {
    return [
      ...prefix,
      'Transporte',
      `Material: ${operation.materialName || '-'}`,
      `Rota: ${operation.originLocationName || '-'} -> ${operation.destinationLocationName || '-'}`,
      `Duração: ${formatHours(operation.transportHours)}h`,
      '',
      `Data inicial: ${formatDate(operation.startDate)}`,
      `Hora inicial: ${operationStartTime(operation)}`,
      `Data final: ${formatDate(operation.endDate)}`,
      `Hora final: ${operationEndTime(operation)}`
    ].join('\n');
  }
  const people = Number(operation.peopleCount || 0);
  const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
  return [
    ...prefix,
    `Material: ${operation.materialName || '-'}`,
    `Quantidade: ${quantity || '-'}`,
    `Máquina: ${operation.machineName || '-'}`,
    `Pessoas: ${people || '-'}`,
    '',
    `Data inicial: ${formatDate(operation.startDate)}`,
    `Hora inicial: ${operationStartTime(operation)}`,
    `Data final: ${formatDate(operation.endDate)}`,
    `Hora final: ${operationEndTime(operation)}`,
    ...breakdownText(operation)
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
    detail: {
      materialId: String(operation.materialId),
      operationId: String(operation.operationId || operation.materialId),
      productionIndex: Number(operation.productionIndex || 0),
      materialName: operation.materialName,
      previousStartDate: operation.startDate,
      previousStartTime: currentTime,
      startDate,
      startTime: startTime || currentTime || '00:00'
    }
  }));
}

function normalizeSplitQuantity(value) {
  const raw = String(value ?? '').trim();
  const dotMatches = raw.match(/\./g) || [];
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : dotMatches.length > 1 || /^\d{1,3}\.\d{3}$/.test(raw)
      ? raw.replace(/\./g, '')
      : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function splitRowTemplate(index, part, operation, machineOptions, totalParts = 0) {
  const models = modelOptions(operation);
  const selectedValue = optionValue({
    machineName: part.machineName || operation.machineName,
    peopleCount: part.peopleCount ?? operation.peopleCount
  });
  const selectedModel = part.productionModelName || operation.productionModelName || models[0]?.modelName || '';
  return `
    <article class="operation-split-row" data-split-index="${index}">
      <strong>Parte ${index + 1}</strong>
      <label>Quantidade
        <input name="splitQty" type="text" inputmode="decimal" value="${escapeAttr(part.quantity)}" required />
      </label>
      <label>Data inicial
        <input name="splitStartDate" type="date" value="${escapeAttr(part.startDate || operation.startDate || '')}" required />
      </label>
      <label>Hora inicial
        <input name="splitStartTime" type="time" value="${escapeAttr(part.startTime || operationStartTime(operation))}" required />
      </label>
      <label>M&aacute;quina / pessoas
        <select name="splitMachinePeople" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
          ${machineOptionTags(machineOptions, selectedValue)}
        </select>
      </label>
      <label>Modelo de produ&ccedil;&atilde;o
        <select name="splitProductionModel" ${models.length > 1 ? '' : 'disabled data-locked="true"'}>
          ${models.length ? models.map(model => `<option value="${escapeAttr(model.modelName)}" ${String(model.modelName) === String(selectedModel) ? 'selected' : ''}>${escapeAttr(model.label || model.modelName)}</option>`).join('') : `<option value="">${productionModelFallback(operation)}</option>`}
        </select>
      </label>
      ${totalParts > 1 ? '<button class="link-button danger remove-split" type="button">Remover</button>' : ''}
    </article>
  `;
}

function collectSplitRows(container, operation) {
  return [...container.querySelectorAll('.operation-split-row')].map(row => {
    const [machineName, peopleCount] = (row.querySelector('[name="splitMachinePeople"]')?.value || operationValue(operation)).split('||');
    return {
      quantity: normalizeSplitQuantity(row.querySelector('[name="splitQty"]')?.value),
      startDate: row.querySelector('[name="splitStartDate"]')?.value,
      startTime: row.querySelector('[name="splitStartTime"]')?.value,
      machineName,
      peopleCount: Number(peopleCount || 0),
      productionModelName: row.querySelector('[name="splitProductionModel"]')?.value || null
    };
  });
}

function validateSplitParts(parts, total, warning, unit = '') {
  const sum = parts.reduce((amount, part) => amount + Number(part.quantity || 0), 0);
  if (Math.abs(sum - total) > 0.001 || parts.some(part => !(part.quantity > 0) || !part.startDate || !part.startTime || !part.machineName || !Number.isFinite(Number(part.peopleCount)) || Number(part.peopleCount) < 0)) {
    if (warning) {
      warning.textContent = `A soma das partes deve ser ${formatQty(total)} ${unit} e todos os campos devem estar preenchidos.`;
      warning.hidden = false;
    }
    return false;
  }
  if (warning) warning.hidden = true;
  return true;
}

function dispatchSplit(wrapper, operation, modal) {
  const productionRows = [...modal.querySelectorAll('.operation-production-row')];
  const rowSplits = productionRows
    .filter(row => row.querySelectorAll('.operation-split-row').length)
    .map(row => {
      const parts = collectSplitRows(row, operation);
      const total = Number(row.dataset.quantity || 0);
      const warning = row.querySelector('.split-warning');
      return {
        valid: validateSplitParts(parts, total, warning, row.dataset.unit || operation.unit || ''),
        split: {
          operationId: String(row.dataset.operationId || operation.operationId || operation.materialId),
          materialId: String(row.dataset.materialId || operation.materialId),
          productionIndex: Number(row.dataset.productionIndex || 0),
          parts
        }
      };
    });
  if (rowSplits.length) {
    if (rowSplits.some(item => !item.valid)) return false;
    wrapper.dispatchEvent(new CustomEvent('operation-split-change', {
      bubbles: true,
      detail: { splits: rowSplits.map(item => item.split) }
    }));
    return true;
  }

  const splitRows = modal.querySelector('.operation-splits-target')?.querySelectorAll('.operation-split-row') || [];
  if (!splitRows.length) return true;
  const parts = collectSplitRows(modal.querySelector('.operation-splits-target'), operation);
  const total = Number(operation.produceQty || 0);
  const warning = modal.querySelector('.operation-split-section > .split-warning');
  if (!validateSplitParts(parts, total, warning, operation.unit || '')) return false;
  wrapper.dispatchEvent(new CustomEvent('operation-split-change', {
    bubbles: true,
    detail: {
      operationId: String(operation.operationId || operation.materialId),
      materialId: String(operation.materialId),
      productionIndex: Number(operation.productionIndex || 0),
      parts
    }
  }));
  return true;
}

function dispatchRemoveSplit(wrapper, operation) {
  wrapper.dispatchEvent(new CustomEvent('operation-split-remove', {
    bubbles: true,
    detail: {
      operationId: splitRootOperationId(operation),
      materialId: String(operation.materialId),
      productionIndex: Number(operation.productionIndex || 0)
    }
  }));
}

function confirmManualNonWorkingDates(modal, operation) {
  const dates = [];
  const operationDate = modal.querySelector('[name="operationStartDate"]')?.value;
  const operationTime = modal.querySelector('[name="operationStartTime"]')?.value || operationStartTime(operation);
  if (operationDate && (operationDate !== operation.startDate || operationTime !== operationStartTime(operation))) {
    dates.push(operationDate);
  }
  modal.querySelectorAll('[name="splitStartDate"]').forEach(input => {
    if (input.value) dates.push(input.value);
  });
  for (const date of [...new Set(dates)]) {
    if (!confirmProductionDate(date)) return false;
  }
  return true;
}

function showOperationModal(wrapper, operation, eventColor = null) {
  const machineOptions = operation.productivityOptions || [];
  const models = modelOptions(operation);
  const selectedModel = operation.productionModelName || models[0]?.modelName || '';
  const startTime = operationStartTime(operation);
  const endTime = operationEndTime(operation);
  const breakdown = productionBreakdown(operation);
  const isSharedOperation = breakdown.length > 1;
  const productivityLabel = productivitySummary(operation, breakdown);
  const modalColor = eventColor || { bg: '#F4F6F8', border: '#2F343B', text: '#1F2937' };
  const modalColorStyle = colorStyle(modalColor);
  const dayCapacity = operationDailyCapacity(operation);
  const planLabel = operation.productionTitle || `Produção ${Number(operation.productionIndex || 0) + 1}`;
  const flowLabel = [
    operation.productionModelName || selectedModel || productionModelFallback(operation),
    operation.calendarParentOperationId ? `operação base ${operation.calendarParentOperationId}` : null
  ].filter(Boolean).join(' | ');
  const breakdownHtml = breakdown.length > 1 ? `
    <section class="wide operation-breakdown operation-productions-section">
      <div class="section-heading compact-heading">
        <h3>Produ&ccedil;&otilde;es inclu&iacute;das</h3>
      </div>
      <div class="operation-productions-list">
        ${breakdown.map(item => productionConfigTemplate(item, operation)).join('')}
      </div>
    </section>
  ` : '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal operation-modal" role="dialog" aria-modal="true" style="${modalColorStyle}">
      <div class="modal-header">
        <div>
          <h2>${operation.materialName}</h2>
          <p class="modal-subtitle">${escapeAttr(planLabel)} | ${escapeAttr(formatDate(operation.startDate))}</p>
        </div>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      <form class="operation-modal-form">
        <section class="operation-day-summary">
          <div>
            <span>Qtd dia</span>
            <strong>${formatQty(operation.produceQty)} ${escapeAttr(operation.unit || '')}</strong>
          </div>
          <div>
            <span>M&aacute;quina</span>
            <strong>${escapeAttr(operation.machineName || '-')}</strong>
          </div>
          <div>
            <span>Pessoas</span>
            <strong>${escapeAttr(operation.peopleCount ?? '-')}</strong>
          </div>
          <div>
            <span>Capacidade usada</span>
            <strong>${dayCapacity.percent == null ? '-' : `${dayCapacity.percent}%`}</strong>
          </div>
          <div>
            <span>Capacidade m&aacute;xima</span>
            <strong>${operationMaxCapacityLabel(operation)}</strong>
          </div>
          <div class="wide">
            <span>Plano e fluxo produtivo</span>
            <strong>${escapeAttr(planLabel)}${flowLabel ? ` | ${escapeAttr(flowLabel)}` : ''}</strong>
          </div>
        </section>
        <div class="operation-detail-grid">
          <article><span>Material</span><strong>${operation.materialName}</strong></article>
          <article><span>Quantidade total</span><strong>${formatQty(operation.produceQty)} ${operation.unit || ''}</strong></article>
          ${isSharedOperation ? '' : `
            <label class="split-hide-when-active">M&aacute;quina
              <select name="machinePeople" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
                ${machineOptions.map(option => `<option value="${optionValue(option)}" ${optionValue(option) === operationValue(operation) ? 'selected' : ''}>${option.machineName}</option>`).join('')}
              </select>
            </label>
            <label class="split-hide-when-active">Pessoas
              <select name="peopleMachine" ${machineOptions.length > 1 ? '' : 'disabled data-locked="true"'}>
                ${machineOptions.map(option => `<option value="${optionValue(option)}" ${optionValue(option) === operationValue(operation) ? 'selected' : ''}>${option.peopleCount}</option>`).join('')}
              </select>
            </label>
            <label class="split-hide-when-active">Modelo de produ&ccedil;&atilde;o
              <select name="productionModel" ${models.length > 1 ? '' : 'disabled data-locked="true"'}>
                ${models.length ? models.map(model => `<option value="${model.modelName}" ${String(model.modelName) === String(selectedModel) ? 'selected' : ''}>${model.label || model.modelName}</option>`).join('') : `<option value="">${productionModelFallback(operation)}</option>`}
              </select>
            </label>
          `}
          <article class="split-hide-when-active"><span>Produtividade</span><strong data-productivity-summary>${escapeAttr(productivityLabel)}</strong></article>
          <label>Data inicial
            <input name="operationStartDate" type="date" value="${operation.startDate || ''}" required />
          </label>
          <label>Hora inicial
            <input name="operationStartTime" type="time" value="${startTime}" required />
          </label>
          <article><span>Data final</span><strong>${formatDate(operation.endDate)}</strong></article>
          <article><span>Hora final</span><strong>${endTime}</strong></article>
          ${breakdownHtml}
        </div>
        <div class="operation-split-section" ${isSharedOperation ? 'hidden' : ''}>
          <div class="section-heading">
            <h3>Divis&atilde;o de produ&ccedil;&atilde;o</h3>
            <div class="split-section-actions">
              <button class="secondary-button divide-production" type="button">Dividir produ&ccedil;&atilde;o</button>
              <button class="secondary-button danger remove-splits" type="button" hidden>Unificar produ&ccedil;&atilde;o</button>
            </div>
          </div>
          <p class="form-error split-warning" hidden></p>
          <div class="operation-splits-target"></div>
          <button class="secondary-button add-split" type="button" hidden>+ Adicionar divis&atilde;o</button>
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
  makeModalDraggable(backdrop);
  backdrop.querySelectorAll('[name="machinePeople"], [name="peopleMachine"]').forEach(select => {
    select.addEventListener('change', () => {
      backdrop.querySelector('[name="machinePeople"]').value = select.value;
      backdrop.querySelector('[name="peopleMachine"]').value = select.value;
      const [machineName, peopleCount] = select.value.split('||');
      const summary = backdrop.querySelector('[data-productivity-summary]');
      if (summary) summary.textContent = productivityLabelForSelection(machineOptions, machineName, peopleCount, operation);
    });
  });
  backdrop.querySelectorAll('[name="productionMachine"], [name="productionPeople"]').forEach(select => {
    select.addEventListener('change', () => {
      const row = select.closest('.operation-production-row');
      row.querySelector('[name="productionMachine"]').value = select.value;
      row.querySelector('[name="productionPeople"]').value = select.value;
      const summary = backdrop.querySelector('[data-productivity-summary]');
      if (summary) {
        const items = [...backdrop.querySelectorAll('.operation-production-row')].map(itemRow => {
          const currentOperation = operationForProductionRow(itemRow, operation);
          const options = currentOperation.productivityOptions || operation.productivityOptions || [];
          const selected = options.find(option =>
            option.machineName === currentOperation.machineName
            && Number(option.peopleCount || 0) === Number(currentOperation.peopleCount || 0)
          );
          return {
            ...currentOperation,
            outputQty: selected?.outputQty,
            outputUnit: selected?.outputUnit,
            timeSeconds: selected?.timeSeconds
          };
        });
        summary.textContent = productivitySummary(operation, items);
      }
    });
  });
  const splitsTarget = backdrop.querySelector('.operation-splits-target');
  const addSplitButton = backdrop.querySelector('.add-split');
  const removeSplitsButton = backdrop.querySelector('.remove-splits');
  const renderSplits = (target, parts, scopeOperation, scopeMachineOptions, addButton = null) => {
    backdrop.querySelector('.operation-modal')?.classList.add('is-split-mode');
    target.innerHTML = parts.map((part, index) => splitRowTemplate(index, part, scopeOperation, scopeMachineOptions, parts.length)).join('');
    if (addButton) addButton.hidden = false;
    if (removeSplitsButton && target === splitsTarget) removeSplitsButton.hidden = false;
    target.closest('.operation-production-row, .operation-split-section')?.querySelector('.split-warning')?.toggleAttribute('hidden', true);
  };
  if (operation.splitParts?.length) {
    renderSplits(splitsTarget, operation.splitParts, operation, machineOptions, addSplitButton);
  }
  backdrop.querySelector('.operation-split-section .divide-production')?.addEventListener('click', () => {
    const total = Number(operation.produceQty || 0);
    const half = Number((total / 2).toFixed(3));
    renderSplits(splitsTarget, [
      { quantity: half, startDate: operation.startDate, startTime, machineName: operation.machineName, peopleCount: operation.peopleCount, productionModelName: selectedModel },
      { quantity: Number((total - half).toFixed(3)), startDate: operation.startDate, startTime, machineName: operation.machineName, peopleCount: operation.peopleCount, productionModelName: selectedModel }
    ], operation, machineOptions, addSplitButton);
  });
  addSplitButton.addEventListener('click', () => {
    const parts = collectSplitRows(splitsTarget, operation);
    parts.push({ quantity: 0, startDate: operation.startDate, startTime, machineName: operation.machineName, peopleCount: operation.peopleCount, productionModelName: selectedModel });
    renderSplits(splitsTarget, parts, operation, machineOptions, addSplitButton);
  });
  removeSplitsButton?.addEventListener('click', () => {
    dispatchRemoveSplit(wrapper, operation);
    backdrop.remove();
  });
  backdrop.addEventListener('click', event => {
    if (event.target.classList.contains('divide-production') && event.target.closest('.operation-production-row')) {
      const row = event.target.closest('.operation-production-row');
      const scopeOperation = operationForProductionRow(row, operation);
      const scopeMachineOptions = scopeOperation.productivityOptions || machineOptions;
      const target = row.querySelector('.operation-splits-target');
      const addButton = row.querySelector('.add-split');
      const total = Number(row.dataset.quantity || scopeOperation.produceQty || 0);
      const half = Number((total / 2).toFixed(3));
      renderSplits(target, [
        { quantity: half, startDate: operation.startDate, startTime, machineName: scopeOperation.machineName, peopleCount: scopeOperation.peopleCount, productionModelName: scopeOperation.productionModelName },
        { quantity: Number((total - half).toFixed(3)), startDate: operation.startDate, startTime, machineName: scopeOperation.machineName, peopleCount: scopeOperation.peopleCount, productionModelName: scopeOperation.productionModelName }
      ], scopeOperation, scopeMachineOptions, addButton);
      return;
    }
    if (event.target.classList.contains('add-split') && event.target.closest('.operation-production-row')) {
      const row = event.target.closest('.operation-production-row');
      const scopeOperation = operationForProductionRow(row, operation);
      const scopeMachineOptions = scopeOperation.productivityOptions || machineOptions;
      const target = row.querySelector('.operation-splits-target');
      const parts = collectSplitRows(target, scopeOperation);
      parts.push({ quantity: 0, startDate: operation.startDate, startTime, machineName: scopeOperation.machineName, peopleCount: scopeOperation.peopleCount, productionModelName: scopeOperation.productionModelName });
      renderSplits(target, parts, scopeOperation, scopeMachineOptions, row.querySelector('.add-split'));
      return;
    }
    if (!event.target.classList.contains('remove-split')) return;
    const container = event.target.closest('.operation-splits-target');
    event.target.closest('.operation-split-row')?.remove();
    container?.querySelectorAll('.operation-split-row').forEach((row, index) => {
      row.dataset.splitIndex = String(index);
      row.querySelector('strong').textContent = `Parte ${index + 1}`;
    });
  });
  backdrop.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!confirmManualNonWorkingDates(backdrop, operation)) return;
    if (!dispatchSplit(wrapper, operation, backdrop)) return;
    dispatchDate(wrapper, operation, backdrop);
    dispatchConfig(wrapper, operation, backdrop);
    backdrop.remove();
  });
  document.body.appendChild(backdrop);
}

function isExistingScheduleBlocker(operation) {
  return operation?._existingScheduleBlocker === true;
}

function calendarConfig(config = {}) {
  const mode = ['planning', 'analysis', 'commercial'].includes(config.mode) ? config.mode : 'planning';
  return {
    mode,
    ...(CALENDAR_MODE_DEFAULTS[mode] || CALENDAR_MODE_DEFAULTS.planning),
    ...config
  };
}

export function CalendarTimeline(days = [], operations = [], config = {}) {
  config = calendarConfig(config);
  const wrapper = document.createElement('section');
  const readOnly = config.readOnly === true;
  const showTeamCapacity = config.showTeamCapacity !== false;
  const showTeamDetails = config.showTeamDetails !== false;
  const editableTeamCapacity = config.editableTeamCapacity !== false && !readOnly;
  const showProductionDetails = config.showProductionDetails !== false;
  const disablePastEditing = config.disablePastEditing === true;
  const minEditableDate = config.minEditableDate || todayKey();
  const showOperationalControls = config.mode !== 'commercial';
  const showViewToggle = showOperationalControls && config.mode !== 'planning';
  const stockAlerts = config.stockAlerts instanceof Map
    ? config.stockAlerts
    : new Map(Object.entries(config.stockAlerts || {}));
  wrapper.className = `calendar-gantt calendar-gantt-${config.mode}${readOnly ? ' is-read-only' : ''}${disablePastEditing ? ' has-historical-lock' : ''}`;
  const zoomLevels = [
    { dayWidth: 170, hourHeight: 58, machineRowHeight: 76 },
    { dayWidth: 210, hourHeight: 72, machineRowHeight: 88 },
    { dayWidth: 260, hourHeight: 88, machineRowHeight: 104 },
    { dayWidth: 320, hourHeight: 108, machineRowHeight: 122 },
    { dayWidth: 390, hourHeight: 132, machineRowHeight: 144 }
  ];
  const topPad = 18;
  let zoomIndex = zoomLevels.length - 1;
  let viewMode = config.mode === 'commercial' ? 'time' : config.mode === 'planning' ? 'machines' : savedCalendarView();

  if (!operations.length && config.mode !== 'commercial') {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calend&aacute;rio.</div>';
    return wrapper;
  }

  const knownDates = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean).sort();
  const fallbackStartDate = days[0];
  const fallbackEndDate = days[days.length - 1] || fallbackStartDate;
  const plannedStartDate = config.planningStartDate || config.startDate || config.selectedDate || knownDates[0] || fallbackStartDate;
  const plannedEndDate = config.planningEndDate || config.endDate || plannedStartDate || knownDates[knownDates.length - 1] || fallbackEndDate;
  const operationStartDate = knownDates[0];
  const operationEndDate = knownDates[knownDates.length - 1];
  const calendarStartDate = config.mode === 'commercial'
    ? plannedStartDate
    : minDate(plannedStartDate, operationStartDate ? addDays(operationStartDate, -CALENDAR_RANGE_MARGIN_DAYS) : null) || operationStartDate;
  const naturalEndDate = config.mode === 'commercial'
    ? plannedEndDate
    : maxDate(plannedEndDate, operationEndDate ? addDays(operationEndDate, CALENDAR_RANGE_MARGIN_DAYS) : null) || operationEndDate;
  const hardEndDate = addDays(plannedEndDate || calendarStartDate, CALENDAR_MAX_EXTRA_DAYS);
  let calendarEndDate = naturalEndDate > hardEndDate ? hardEndDate : naturalEndDate;
  if (dayDiff(calendarStartDate, calendarEndDate) + 1 > CALENDAR_MAX_VISIBLE_DAYS) {
    calendarEndDate = addDays(calendarStartDate, CALENDAR_MAX_VISIBLE_DAYS - 1);
  }
  const dates = eachDate(calendarStartDate, calendarEndDate);
  const isRangeClipped = Boolean(operationEndDate && operationEndDate > calendarEndDate);
  const shifts = normalizeShiftConfig(config);
  const configuredProductionColors = new Map();
  (config.productions || []).forEach(production => {
    const color = production.color || production.productionColor;
    if (!isHexColor(color)) return;
    configuredProductionColors.set(String(production.productionKey || `production-${Number(production.productionIndex || 0)}`), color);
    configuredProductionColors.set(String(Number(production.productionIndex || 0)), color);
  });
  const colorForProduction = item => {
    const productionKey = typeof item === 'string' ? item : stableProductionKey(item);
    const productionIndex = stableProductionIndex(typeof item === 'string' ? { productionKey: item } : item);
    const configuredColor = typeof item === 'object' && isHexColor(item.productionColor)
      ? item.productionColor
      : configuredProductionColors.get(String(productionKey)) || configuredProductionColors.get(String(productionIndex));
    const customPalette = productionStageColorsFromBase(configuredColor);
    if (customPalette) return customPalette[0];
    const productionColorIndex = productionColorSequenceIndex(productionIndex);
    return PRODUCTION_STAGE_COLORS[productionColorIndex % PRODUCTION_STAGE_COLORS.length][0];
  };
  const paletteForProduction = item => {
    const productionKey = stableProductionKey(item);
    const productionIndex = stableProductionIndex(item);
    const configuredColor = isHexColor(item.productionColor)
      ? item.productionColor
      : configuredProductionColors.get(String(productionKey)) || configuredProductionColors.get(String(productionIndex));
    const customPalette = productionStageColorsFromBase(configuredColor);
    if (customPalette) return customPalette;
    const productionColorIndex = productionColorSequenceIndex(productionIndex);
    const solid = PRODUCTION_STAGE_COLORS[productionColorIndex % PRODUCTION_STAGE_COLORS.length][0];
    return [solid, solid, solid, solid];
  };
  const shiftStart = Math.min(...shifts.map(shift => shift.shiftStart));
  const shiftEnd = Math.max(...shifts.map(shift => shift.shiftEnd));
  const dayStart = 0;
  const dayEnd = 24 * 60;
  const hourMarks = [];
  for (let minutes = dayStart; minutes < dayEnd; minutes += 60) {
    hourMarks.push(minutes);
  }

  wrapper.innerHTML = `
    <div class="gantt-zoom-controls" aria-label="Zoom do calend&aacute;rio">
      ${showOperationalControls ? `${showViewToggle ? `<div class="calendar-view-toggle" role="group" aria-label="Visualiza&ccedil;&atilde;o do calend&aacute;rio">
        <button class="secondary-button" type="button" data-calendar-view="time">Por tempo</button>
        <button class="secondary-button" type="button" data-calendar-view="machines">Por m&aacute;quinas</button>
      </div>` : ''}
      <div class="calendar-selection-status" data-selection-status hidden></div>
      <button class="secondary-button" type="button" data-zoom-out aria-label="Diminuir zoom">-</button>
      <button class="secondary-button" type="button" data-zoom-in aria-label="Aumentar zoom">+</button>
      <button class="secondary-button fullscreen-button" type="button" data-fullscreen aria-label="Tela cheia">Tela cheia</button>
      <button class="secondary-button fullscreen-close" type="button" data-fullscreen-close aria-label="Sair da tela cheia">X</button>` : ''}
    </div>
    ${isRangeClipped ? '<p class="calendar-range-alert">A produ&ccedil;&atilde;o ultrapassa muito o per&iacute;odo planejado. Verifique produtividade, quantidade ou turnos.</p>' : ''}
    <div class="gantt-board gantt-board-full"></div>
    <div class="calendar-tooltip" hidden></div>
  `;

  const tooltip = wrapper.querySelector('.calendar-tooltip');

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function operationDragId(operation = {}) {
    return String(operation.operationId || operation.materialId || '');
  }

  let selectedOperationId = null;
  let selectedOperationDate = null;

  function selectedOperation() {
    if (!selectedOperationId) return null;
    return operations.find(item => operationDragId(item) === selectedOperationId) || null;
  }

  function operationSelectionLabel(operation = {}) {
    const productionLabel = operation.productionTitle || `Produ\u00e7\u00e3o ${Number(operation.productionIndex || 0) + 1}`;
    const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim() || '-';
    return `${productionLabel} \u00b7 ${operation.materialName || '-'} \u00b7 ${formatDate(selectedOperationDate || operation.startDate)} \u00b7 ${quantity}`;
  }

  function updateSelectionStatus() {
    const status = wrapper.querySelector('[data-selection-status]');
    if (!status) return;
    const operation = selectedOperation();
    if (!operation) {
      selectedOperationId = null;
      selectedOperationDate = null;
      status.hidden = true;
      status.innerHTML = '';
      wrapper.classList.remove('has-selected-operation');
      wrapper.querySelectorAll('.machine-production-card.is-selected').forEach(card => card.classList.remove('is-selected'));
      wrapper.querySelectorAll('.machine-day-cell.is-click-move-target, .machine-day-cell.is-click-move-invalid').forEach(cell => {
        cell.classList.remove('is-click-move-target', 'is-click-move-invalid');
      });
      wrapper.querySelectorAll('[data-operation-selector]').forEach(selector => {
        selector.setAttribute('aria-checked', 'false');
      });
      return;
    }
    const label = operationSelectionLabel(operation);
    status.hidden = false;
    status.innerHTML = `
      <span title="${escapeAttr(label)}"><strong>Selecionado:</strong> ${escapeAttr(label)}</span>
      <button class="link-button" type="button" data-clear-selection>Cancelar sele&ccedil;&atilde;o</button>
    `;
    wrapper.classList.add('has-selected-operation');
    wrapper.querySelectorAll('.machine-production-card[data-drag-operation-id]').forEach(card => {
      const selected = String(card.dataset.dragOperationId) === selectedOperationId;
      card.classList.toggle('is-selected', selected);
      card.querySelector('[data-operation-selector]')?.setAttribute('aria-checked', String(selected));
    });
  }

  function setSelectedOperation(operation, date = null) {
    const nextId = operation ? operationDragId(operation) : null;
    selectedOperationId = nextId || null;
    selectedOperationDate = nextId ? (date || operation.startDate || null) : null;
    updateSelectionStatus();
  }

  function canDragOperation(operation = {}) {
    return Boolean(operation && operationDragId(operation))
      && viewMode === 'machines'
      && !readOnly
      && operation.operationType !== 'transport'
      && !isExistingScheduleBlocker(operation)
      && !(disablePastEditing && isHistoricalOperation(operation, minEditableDate));
  }

  function operationCompatibleWithMachine(operation = {}, machineName = '') {
    const targetMachine = normalizeMachineName(machineName);
    if (!targetMachine) return false;
    const options = Array.isArray(operation.productivityOptions) ? operation.productivityOptions : [];
    if (options.length) {
      return options.some(option => normalizeMachineName(option.machineName) === targetMachine);
    }
    return normalizeMachineName(operation.machineName) === targetMachine;
  }

  function operationMachineOption(operation = {}, machineName = '') {
    const targetMachine = normalizeMachineName(machineName);
    const options = Array.isArray(operation.productivityOptions) ? operation.productivityOptions : [];
    return options.find(option =>
      normalizeMachineName(option.machineName) === targetMachine
      && Number(option.peopleCount || 0) === Number(operation.peopleCount || 0)
    ) || options.find(option => normalizeMachineName(option.machineName) === targetMachine) || null;
  }

  function draggableAttrs(operation = {}) {
    if (!canDragOperation(operation)) return '';
    return ` draggable="true" data-drag-operation-id="${escapeAttr(operationDragId(operation))}"`;
  }

  function dispatchOperationDrop(operation, cell, source = 'drag') {
    const targetDate = cell?.dataset.date;
    const targetMachine = cell?.closest('.machine-row')?.dataset.machine;
    if (!operation || !targetDate || !targetMachine) return false;
    if (!operationCompatibleWithMachine(operation, targetMachine)) {
      window.alert('Não existe produtividade cadastrada para este material nesta máquina.');
      return false;
    }
    const targetOption = operationMachineOption(operation, targetMachine);
    if (!confirmProductionDate(targetDate)) return false;
    wrapper.dispatchEvent(new CustomEvent('operation-card-drop', {
      bubbles: true,
      detail: {
        materialId: String(operation.materialId),
        operationId: operationDragId(operation),
        sourceOperationId: String(operation.calendarParentOperationId || operation.splitParentOperationId || operation.operationId || operation.materialId),
        productionIndex: Number(operation.productionIndex || 0),
        materialName: operation.materialName,
        source,
        previousStartDate: operation.startDate,
        previousStartTime: operationStartTime(operation),
        previousMachine: operation.machineName,
        startDate: targetDate,
        startTime: operationStartTime(operation) || '00:00',
        machineName: targetOption?.machineName || targetMachine,
        peopleCount: Number(targetOption?.peopleCount ?? operation.peopleCount ?? 0),
        productionModelName: operation.productionModelName || null,
        movedBackward: Boolean(operation.startDate && targetDate < operation.startDate),
        dailyCapacity: operation.calendarDailyCapacity || operation.dailyCapacity || null,
        produceQty: Number(operation.produceQty || 0),
        unit: operation.unit || ''
      }
    }));
    return true;
  }

  function setZoom(nextIndex) {
    zoomIndex = Math.max(0, Math.min(zoomLevels.length - 1, nextIndex));
    wrapper.querySelector('[data-zoom-out]')?.toggleAttribute('disabled', zoomIndex === 0);
    wrapper.querySelector('[data-zoom-in]')?.toggleAttribute('disabled', zoomIndex === zoomLevels.length - 1);
    renderBoard();
  }

  function setViewMode(nextMode) {
    viewMode = config.mode === 'planning' ? 'machines' : nextMode === 'machines' ? 'machines' : 'time';
    if (config.mode !== 'commercial') saveCalendarView(viewMode);
    wrapper.querySelectorAll('[data-calendar-view]').forEach(button => {
      const isActive = button.dataset.calendarView === viewMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    renderBoard();
  }

  function renderOperationButton(operation, segment, item, style, shouldShowText, colorStyleText) {
    const startTime = operationStartTime(operation);
    const endTime = operationEndTime(operation);
    const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
    const isTransport = operation.operationType === 'transport';
    const isHistorical = disablePastEditing && isHistoricalOperation(operation, minEditableDate);
    const isExisting = isExistingScheduleBlocker(operation);
    const breakdown = isTransport ? [] : productionBreakdown(operation);
    const shortLabel = isTransport ? 'TR' : (showTeamDetails ? `${operation.peopleCount ?? '-'}p` : String(operation.materialName || '-').slice(0, 2).toUpperCase());
    return `
      <button class="gantt-bar${isTransport ? ' gantt-bar-transport' : ''}${isHistorical ? ' gantt-bar-historical' : ''}${isExisting ? ' gantt-bar-existing' : ''}${shouldShowText ? '' : ' gantt-bar-compact'}" type="button" data-operation-id="${escapeAttr(operation.operationId || operation.materialId)}" style="${style} ${colorStyleText}" data-tooltip="${escapeAttr(tooltipText(operation))}">
        ${shouldShowText && isTransport ? `
          <strong>Transporte</strong>
          <span>${operation.materialName || '-'}</span>
          <span>${operation.originLocationName || '-'} -&gt; ${operation.destinationLocationName || '-'}</span>
          <small>${formatHours(operation.transportHours)}h | ${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
        ` : shouldShowText ? `
          ${isExisting ? '<em class="gantt-status-pill">Ja planejado</em>' : ''}
          <strong>${operation.materialName}</strong>
          <span>${quantity || '-'}</span>
          ${showTeamDetails ? `<span>${operation.machineName || '-'} | ${operation.peopleCount ?? '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>` : ''}
          ${breakdown.length > 1 ? `<small>${breakdown.map(part => `${escapeAttr(part.productionTitle || `P${Number(part.productionIndex || 0) + 1}`)}: ${formatQty(part.quantity)}`).join(' | ')}</small>` : ''}
          <small>${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
        ` : `<span class="gantt-compact-label">${escapeAttr(shortLabel)}</span>`}
      </button>
    `;
  }

  function renderMachineDayCard(operation, colorStyleText, daySegments = []) {
    const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
    const isHistorical = disablePastEditing && isHistoricalOperation(operation, minEditableDate);
    const productionLabel = operation.productionTitle || `Produção ${Number(operation.productionIndex || 0) + 1}`;
    const dragId = operationDragId(operation);
    const isSelected = dragId && dragId === selectedOperationId;
    return `
      <button class="gantt-bar machine-production-card${isHistorical ? ' gantt-bar-historical' : ''}${isSelected ? ' is-selected' : ''}" type="button" data-operation-id="${escapeAttr(operation.operationId || operation.materialId)}" data-material-id="${escapeAttr(operation.materialId || '')}" data-production-index="${escapeAttr(Number(operation.productionIndex || 0))}"${draggableAttrs(operation)} style="${colorStyleText}">
        ${canDragOperation(operation) ? `<span class="machine-card-selector" role="checkbox" tabindex="0" aria-label="Selecionar ${escapeAttr(productionLabel)}" aria-checked="${isSelected ? 'true' : 'false'}" data-operation-selector data-operation-selector-id="${escapeAttr(dragId)}"></span>` : ''}
        <span class="machine-card-kicker">${escapeAttr(productionLabel)}</span>
        <strong>${escapeAttr(operation.materialName || '-')}</strong>
        <span>Qtd dia: ${escapeAttr(quantity || '-')}</span>
        <span>Pessoas: ${escapeAttr(operation.peopleCount ?? '-')}</span>
        <span>Dura&ccedil;&atilde;o: ${escapeAttr(operationDayDurationLabel(operation, daySegments))}</span>
        <span>Capacidade utilizada: ${escapeAttr(operationCapacityLabel(operation))}</span>
        <span>Capacidade m&aacute;xima/dia: ${escapeAttr(operationMaxCapacityLabel(operation))}</span>
      </button>
    `;
  }

  function renderMachineShiftBands() {
    if (shifts.length <= 1) return '';
    const totalMinutes = shifts.reduce((sum, shift) => sum + Math.max(Number(shift.dailyMinutes || (shift.shiftEnd - shift.shiftStart)), 1), 0) || 1;
    let offset = 0;
    return shifts.map((shift, index) => {
      const minutes = Math.max(Number(shift.dailyMinutes || (shift.shiftEnd - shift.shiftStart)), 1);
      const top = (offset / totalMinutes) * 100;
      const height = (minutes / totalMinutes) * 100;
      offset += minutes;
      return `
        <span class="machine-shift-band shift-band-${index % 2 === 0 ? 'light' : 'dark'}" style="--shift-top: ${top}%; --shift-height: ${height}%;">
          ${escapeAttr(shift.label.replace(/^Turno\s*/i, 'T'))} ${formatProductiveMinutes(minutes)}
        </span>
      `;
    }).join('');
  }

  function operationEventColor(operation) {
    const isTransport = operation.operationType === 'transport';
    const palette = paletteForProduction(operation);
    const productionBaseColor = palette[0];
    return isTransport ? { ...TRANSPORT_COLOR, border: productionBaseColor.border } : productionBaseColor;
  }

  function renderMachineBoard() {
    const zoom = zoomLevels[zoomIndex];
    const minMachineCardWidth = wrapper.classList.contains('is-calendar-fullscreen')
      ? Math.min(240, Math.max(170, Math.round(zoom.dayWidth * 0.8)))
      : Math.min(240, Math.max(140, Math.round(zoom.dayWidth * 0.72)));
    const machineCellPadding = 16;
    const machineCardGap = 8;
    const baseMachineDayWidth = Math.max(zoom.dayWidth, minMachineCardWidth);
    const board = wrapper.querySelector('.gantt-board');
    const machineOperations = new Map();
    for (const machine of MACHINE_CALENDAR_ORDER) {
      const normalizedMachine = normalizeMachineName(machine);
      machineOperations.set(machine, operations.filter(operation =>
        operation.operationType !== 'transport'
        && operationMachineNames(operation).some(name => normalizeMachineName(name) === normalizedMachine)
      ));
    }
    const segmentCache = new Map();
    for (const machineOps of machineOperations.values()) {
      for (const operation of machineOps) {
        if (!segmentCache.has(operation)) {
          const byDate = new Map(dates.map(date => [date, []]));
          shifts.forEach(shift => {
            const shiftSegments = operationDaySegments(operation, dates, shift.shiftStart, shift.shiftEnd, shift.lunchStart, shift.lunchEnd);
            dates.forEach(date => {
              byDate.get(date)?.push(...(shiftSegments.get(date) || []));
            });
          });
          segmentCache.set(operation, byDate);
        }
      }
    }
    const dayOperationsForMachine = (machine, date) => {
      const dayMap = new Map();
      (machineOperations.get(machine) || []).forEach(operation => {
        const segments = segmentCache.get(operation)?.get(date) || [];
        if (!segments.length) return;
        const id = String(operation.operationId || operation.materialId || operation.materialName || '');
        if (!dayMap.has(id)) dayMap.set(id, operation);
      });
      return [...dayMap.values()].sort((left, right) =>
        dateTimeMs(left.startDate, operationStartTime(left)) - dateTimeMs(right.startDate, operationStartTime(right))
        || String(left.materialName || '').localeCompare(String(right.materialName || ''))
      );
    };
    const maxCardsByMachine = new Map(MACHINE_CALENDAR_ORDER.map(machine => [
      machine,
      Math.max(...dates.map(date => dayOperationsForMachine(machine, date).length), 1)
    ]));
    const maxCardsPerDay = Math.max(...maxCardsByMachine.values(), 1);
    const requiredMachineDayWidth = (maxCardsPerDay * minMachineCardWidth)
      + (Math.max(maxCardsPerDay - 1, 0) * machineCardGap)
      + machineCellPadding;
    const machineDayWidth = Math.max(baseMachineDayWidth, requiredMachineDayWidth);
    const cardHeight = 164;
    const rowHeight = Math.max(
      zoom.machineRowHeight,
      cardHeight + 20
    );
    const bodyHeight = MACHINE_CALENDAR_ORDER.length * rowHeight;
    const capacityCache = showTeamCapacity
      ? new Map(dates.map(date => [date, capacityForDateFromSegments(date, segmentCache, shifts)]))
      : new Map();
    board.style.setProperty('--calendar-days', String(dates.length));
    board.style.setProperty('--calendar-day-width', `${machineDayWidth}px`);
    board.style.setProperty('--machine-card-min-width', `${minMachineCardWidth}px`);
    board.style.setProperty('--machine-row-height', `${rowHeight}px`);
    board.style.setProperty('--calendar-body-height', `${bodyHeight}px`);
    board.innerHTML = `
      <div class="machine-grid">
        <div class="machine-corner">
          <strong>M&aacute;quina</strong>
          <span>Ocupa&ccedil;&atilde;o</span>
        </div>
        <div class="machine-dates">
          ${dates.map(date => {
            const blockedDay = nonWorkingInfo(date);
            return renderCapacityHeaderWithCapacity(date, capacityCache.get(date) || [], blockedDay, stockAlerts.get(date));
          }).join('')}
        </div>
        <div class="machine-axis">
          ${MACHINE_CALENDAR_ORDER.map(machine => `<div class="machine-axis-row">${machineLabel(machine)}</div>`).join('')}
        </div>
        <div class="machine-days">
          ${MACHINE_CALENDAR_ORDER.map(machine => `
            <div class="machine-row" data-machine="${escapeAttr(machine)}">
              ${dates.map(date => {
                const blockedDay = nonWorkingInfo(date);
                const dayItems = dayOperationsForMachine(machine, date);
                const dayOperations = dayItems.map(operation => {
                  const eventColor = operationEventColor(operation);
                  const breakdown = productionBreakdown(operation);
                  return renderMachineDayCard(operation, eventColorStyle(eventColor, breakdown, colorForProduction), segmentCache.get(operation)?.get(date) || []);
                }).join('');
                return `
                  <div class="machine-day-cell${blockedDay ? ' non-working-day' : ''}${shifts.length > 1 ? ' has-shift-bands' : ' has-single-shift'}" data-date="${date}" style="--machine-card-count: ${Math.max(dayItems.length, 1)};">
                    ${renderMachineShiftBands()}
                    ${dayOperations}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderBoard() {
    if (viewMode === 'machines') {
      renderMachineBoard();
      updateSelectionStatus();
      return;
    }
    const zoom = zoomLevels[zoomIndex];
    const totalMinutes = dayEnd - dayStart;
    const bodyHeight = topPad + (totalMinutes / 60) * zoom.hourHeight;
    const lunchBands = shifts
      .filter(shift => shift.lunchEnd > shift.lunchStart && shift.lunchEnd > dayStart && shift.lunchStart < dayEnd)
      .map(shift => ({
        label: shift.label,
        style: lunchStyle(shift.lunchStart, shift.lunchEnd, dayStart, dayEnd, zoom.hourHeight)
      }));
    const board = wrapper.querySelector('.gantt-board');
    const lunchBreaks = shifts.map(shift => ({ lunchStart: shift.lunchStart, lunchEnd: shift.lunchEnd }));
    const segmentCache = new Map(operations.map(operation => [
      operation,
      operationDaySegments(operation, dates, dayStart, dayEnd, lunchBreaks)
    ]));
    const capacityCache = showTeamCapacity
      ? new Map(dates.map(date => [date, capacityForDateFromSegments(date, segmentCache, shifts)]))
      : new Map();
    board.style.setProperty('--calendar-days', String(dates.length));
    board.style.setProperty('--calendar-day-width', `${zoom.dayWidth}px`);
    board.style.setProperty('--calendar-hour-height', `${zoom.hourHeight}px`);
    board.style.setProperty('--calendar-body-height', `${bodyHeight}px`);
    board.style.setProperty('--calendar-top-pad', `${topPad}px`);
    board.innerHTML = `
      <div class="agenda-grid">
        <div class="agenda-corner">
          <strong>Hor&aacute;rio</strong>
          <span>00:00-23:59</span>
        </div>
        <div class="gantt-dates">
          ${dates.map(date => {
            const blockedDay = nonWorkingInfo(date);
            return renderCapacityHeaderWithCapacity(date, capacityCache.get(date) || [], blockedDay, stockAlerts.get(date));
          }).join('')}
        </div>
        <div class="agenda-time-axis">
          ${hourMarks.map(minutes => `
            <span style="--time-top: calc(var(--calendar-top-pad) + ${((minutes - dayStart) / 60) * zoom.hourHeight}px)">${formatHour(minutes)}</span>
          `).join('')}
        </div>
        <div class="agenda-days">
          ${dates.map(date => {
            const blockedDay = nonWorkingInfo(date);
            const daySegments = operations.flatMap(operation => {
              const segments = segmentCache.get(operation)?.get(date) || [];
              return segments.map(segment => ({ operation, segment }));
            });
            const dayOperations = arrangeParallelSegments(daySegments).map(item => {
              const { operation, segment } = item;
              const startTime = operationStartTime(operation);
              const endTime = operationEndTime(operation);
              const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
              const isTransport = operation.operationType === 'transport';
              const isHistorical = disablePastEditing && isHistoricalOperation(operation, minEditableDate);
              const isExisting = isExistingScheduleBlocker(operation);
              const { start, end } = segmentMinutes(segment, dayStart, dayEnd);
              const shouldShowText = segment.visualIndex === 0 && ((end - start) / 60) * zoom.hourHeight >= 62;
              const shortLabel = isTransport ? 'TR' : (showTeamDetails ? `${operation.peopleCount ?? '-'}p` : String(operation.materialName || '-').slice(0, 2).toUpperCase());
              const palette = paletteForProduction(operation);
              const productionBaseColor = palette[0];
              const eventColor = isTransport ? { ...TRANSPORT_COLOR, border: productionBaseColor.border } : productionBaseColor;
              const breakdown = isTransport ? [] : productionBreakdown(operation);
              return `
                <button class="gantt-bar${isTransport ? ' gantt-bar-transport' : ''}${isHistorical ? ' gantt-bar-historical' : ''}${isExisting ? ' gantt-bar-existing' : ''}${shouldShowText ? '' : ' gantt-bar-compact'}" type="button" data-operation-id="${escapeAttr(operation.operationId || operation.materialId)}" style="${segmentStyle({ ...segment, visualStart: item.visualStart }, dayStart, dayEnd, zoom.hourHeight)} ${laneStyle(item.lane, item.laneCount)} ${eventColorStyle(eventColor, breakdown, colorForProduction)}" data-tooltip="${escapeAttr(tooltipText(operation))}">
                  ${shouldShowText && isTransport ? `
                    <strong>Transporte</strong>
                    <span>${operation.materialName || '-'}</span>
                    <span>${operation.originLocationName || '-'} -&gt; ${operation.destinationLocationName || '-'}</span>
                    <small>${formatHours(operation.transportHours)}h | ${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
                  ` : shouldShowText ? `
                    ${isExisting ? '<em class="gantt-status-pill">Ja planejado</em>' : ''}
                    <strong>${operation.materialName}</strong>
                    <span>${quantity || '-'}</span>
                    ${showTeamDetails ? `<span>${operation.machineName || '-'} | ${operation.peopleCount ?? '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>` : ''}
                    ${breakdown.length > 1 ? `<small>${breakdown.map(item => `${escapeAttr(item.productionTitle || `P${Number(item.productionIndex || 0) + 1}`)}: ${formatQty(item.quantity)}`).join(' | ')}</small>` : ''}
                    <small>${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
                  ` : `<span class="gantt-compact-label">${escapeAttr(shortLabel)}</span>`}
                </button>
              `;
            }).join('');
            return `
              <div class="agenda-day-column${blockedDay ? ' non-working-day' : ''}" data-date="${date}">
                ${hourMarks.map(minutes => `
                  <span class="agenda-hour-line" style="--time-top: calc(var(--calendar-top-pad) + ${((minutes - dayStart) / 60) * zoom.hourHeight}px)"></span>
                `).join('')}
                ${lunchBands.map(band => `<span class="gantt-lunch-band" style="${band.style}">Pausa ${escapeAttr(band.label.replace(/^Turno\s*/i, 'T'))}</span>`).join('')}
                ${dayOperations}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    updateSelectionStatus();
  }

  wrapper.addEventListener('focusout', event => {
    if (event.target.closest('.gantt-bar')) hideTooltip();
  });
  let draggingOperationId = null;
  const autoScrollState = {
    pointerX: 0,
    pointerY: 0,
    frame: null
  };
  const autoScrollEdgeSize = 82;
  const autoScrollMaxSpeed = 22;
  const autoScrollBoard = () => wrapper.querySelector('.gantt-board');
  const stopAutoScroll = () => {
    if (autoScrollState.frame) window.cancelAnimationFrame(autoScrollState.frame);
    autoScrollState.frame = null;
  };
  const autoScrollVelocity = (pointer, start, end) => {
    if (pointer < start || pointer > end) return 0;
    const leftDistance = pointer - start;
    const rightDistance = end - pointer;
    if (leftDistance < autoScrollEdgeSize) {
      return -Math.round(((autoScrollEdgeSize - leftDistance) / autoScrollEdgeSize) * autoScrollMaxSpeed);
    }
    if (rightDistance < autoScrollEdgeSize) {
      return Math.round(((autoScrollEdgeSize - rightDistance) / autoScrollEdgeSize) * autoScrollMaxSpeed);
    }
    return 0;
  };
  const runAutoScroll = () => {
    autoScrollState.frame = null;
    const board = autoScrollBoard();
    if (!board || (!draggingOperationId && !pointerDrag?.active)) return;
    const rect = board.getBoundingClientRect();
    const deltaX = autoScrollVelocity(autoScrollState.pointerX, rect.left, rect.right);
    const deltaY = autoScrollVelocity(autoScrollState.pointerY, rect.top, rect.bottom);
    if (!deltaX && !deltaY) return;
    board.scrollLeft = Math.max(0, Math.min(board.scrollWidth - board.clientWidth, board.scrollLeft + deltaX));
    board.scrollTop = Math.max(0, Math.min(board.scrollHeight - board.clientHeight, board.scrollTop + deltaY));
    autoScrollState.frame = window.requestAnimationFrame(runAutoScroll);
  };
  const updateAutoScroll = event => {
    const board = autoScrollBoard();
    if (!board) return;
    autoScrollState.pointerX = event.clientX;
    autoScrollState.pointerY = event.clientY;
    const rect = board.getBoundingClientRect();
    const nearHorizontal = event.clientX >= rect.left && event.clientX <= rect.right
      && (event.clientX - rect.left < autoScrollEdgeSize || rect.right - event.clientX < autoScrollEdgeSize);
    const nearVertical = event.clientY >= rect.top && event.clientY <= rect.bottom
      && (event.clientY - rect.top < autoScrollEdgeSize || rect.bottom - event.clientY < autoScrollEdgeSize);
    if (nearHorizontal || nearVertical) {
      if (!autoScrollState.frame) runAutoScroll();
    } else {
      stopAutoScroll();
    }
  };
  wrapper.addEventListener('dragstart', event => {
    if (event.target.closest('[data-operation-selector]')) {
      event.preventDefault();
      return;
    }
    const bar = event.target.closest('.machine-production-card[data-drag-operation-id]');
    if (!bar) return;
    const operation = operations.find(item => operationDragId(item) === String(bar.dataset.dragOperationId));
    if (!canDragOperation(operation)) {
      event.preventDefault();
      return;
    }
    hideTooltip();
    draggingOperationId = operationDragId(operation);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggingOperationId);
    bar.classList.add('is-dragging');
    wrapper.classList.add('is-calendar-dragging');
  });
  wrapper.addEventListener('dragend', event => {
    stopAutoScroll();
    draggingOperationId = null;
    event.target.closest('.machine-production-card')?.classList.remove('is-dragging');
    wrapper.classList.remove('is-calendar-dragging');
    clearPointerDropTargets();
  });
  wrapper.addEventListener('dragover', event => {
    if (draggingOperationId) updateAutoScroll(event);
    const cell = event.target.closest('.machine-day-cell[data-date]');
    if (!cell) return;
    const operationId = draggingOperationId || event.dataTransfer.getData('text/plain');
    const operation = operations.find(item => operationDragId(item) === operationId);
    if (!canDragOperation(operation)) return;
    event.preventDefault();
    const compatible = operationCompatibleWithMachine(operation, cell.closest('.machine-row')?.dataset.machine);
    event.dataTransfer.dropEffect = compatible ? 'move' : 'none';
    wrapper.querySelectorAll('.machine-day-cell.is-drop-target, .machine-day-cell.is-drop-invalid').forEach(target => {
      if (target !== cell) target.classList.remove('is-drop-target', 'is-drop-invalid');
    });
    cell.classList.toggle('is-drop-target', compatible);
    cell.classList.toggle('is-drop-invalid', !compatible);
  });
  wrapper.addEventListener('dragleave', event => {
    const cell = event.target.closest('.machine-day-cell[data-date]');
    if (!cell || cell.contains(event.relatedTarget)) return;
    cell.classList.remove('is-drop-target', 'is-drop-invalid');
  });
  document.addEventListener('dragover', event => {
    if (!draggingOperationId) return;
    updateAutoScroll(event);
  });
  wrapper.addEventListener('drop', event => {
    stopAutoScroll();
    const cell = event.target.closest('.machine-day-cell[data-date]');
    if (!cell) return;
    const operationId = draggingOperationId || event.dataTransfer.getData('text/plain');
    const operation = operations.find(item => operationDragId(item) === operationId);
    if (!canDragOperation(operation)) return;
    event.preventDefault();
    draggingOperationId = null;
    cell.classList.remove('is-drop-target', 'is-drop-invalid', 'is-click-move-target', 'is-click-move-invalid');
    suppressCardClick = true;
    dispatchOperationDrop(operation, cell, 'drag');
  });
  let pointerDrag = null;
  let suppressCardClick = false;
  const clearPointerDropTargets = () => {
    wrapper.querySelectorAll('.machine-day-cell.is-drop-target, .machine-day-cell.is-drop-invalid, .machine-day-cell.is-click-move-target, .machine-day-cell.is-click-move-invalid').forEach(cell => {
      cell.classList.remove('is-drop-target', 'is-drop-invalid', 'is-click-move-target', 'is-click-move-invalid');
    });
  };
  const updateSelectedMoveTarget = cell => {
    wrapper.querySelectorAll('.machine-day-cell.is-click-move-target, .machine-day-cell.is-click-move-invalid').forEach(target => {
      if (target !== cell) target.classList.remove('is-click-move-target', 'is-click-move-invalid');
    });
    if (!cell || draggingOperationId || pointerDrag?.active) return;
    const operation = selectedOperation();
    if (!operation) return;
    const occupied = Boolean(cell.querySelector('.machine-production-card'));
    const compatible = operationCompatibleWithMachine(operation, cell.closest('.machine-row')?.dataset.machine);
    const blocked = Boolean(nonWorkingInfo(cell.dataset.date));
    cell.classList.toggle('is-click-move-target', !occupied && compatible && !blocked);
    cell.classList.toggle('is-click-move-invalid', occupied || !compatible || blocked);
  };
  const finishPointerDrag = event => {
    if (!pointerDrag) return;
    const { operation, card, active } = pointerDrag;
    const cell = active ? document.elementFromPoint(event.clientX, event.clientY)?.closest('.machine-day-cell[data-date]') : null;
    pointerDrag = null;
    stopAutoScroll();
    card.classList.remove('is-dragging');
    wrapper.classList.remove('is-calendar-dragging');
    clearPointerDropTargets();
    if (!active || !cell || !wrapper.contains(cell)) return;
    suppressCardClick = true;
    dispatchOperationDrop(operation, cell, 'drag');
  };
  wrapper.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    if (event.target.closest('[data-operation-selector]')) return;
    const card = event.target.closest('.machine-production-card[data-drag-operation-id]');
    if (!card) return;
    const operation = operations.find(item => operationDragId(item) === String(card.dataset.dragOperationId));
    if (!canDragOperation(operation)) return;
    pointerDrag = {
      operation,
      card,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
  });
  document.addEventListener('pointermove', event => {
    if (!pointerDrag) return;
    if (!pointerDrag.active && Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) < 8) return;
    pointerDrag.active = true;
    updateAutoScroll(event);
    pointerDrag.card.classList.add('is-dragging');
    wrapper.classList.add('is-calendar-dragging');
    clearPointerDropTargets();
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.machine-day-cell[data-date]');
    if (!cell || !wrapper.contains(cell)) return;
    const compatible = operationCompatibleWithMachine(pointerDrag.operation, cell.closest('.machine-row')?.dataset.machine);
    cell.classList.toggle('is-drop-target', compatible);
    cell.classList.toggle('is-drop-invalid', !compatible);
  });
  document.addEventListener('pointerup', finishPointerDrag);
  document.addEventListener('pointercancel', event => {
    stopAutoScroll();
    finishPointerDrag(event);
  });
  wrapper.addEventListener('mouseover', event => {
    const cell = event.target.closest('.machine-day-cell[data-date]');
    if (!cell || !wrapper.contains(cell)) return;
    updateSelectedMoveTarget(cell);
  });
  wrapper.addEventListener('mouseout', event => {
    const cell = event.target.closest('.machine-day-cell[data-date]');
    if (!cell || cell.contains(event.relatedTarget)) return;
    cell.classList.remove('is-click-move-target', 'is-click-move-invalid');
  });
  wrapper.addEventListener('keydown', event => {
    const selector = event.target.closest('[data-operation-selector]');
    if (!selector || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const operation = operations.find(item => operationDragId(item) === String(selector.dataset.operationSelectorId));
    if (!operation) return;
    const selected = selectedOperationId === operationDragId(operation);
    setSelectedOperation(selected ? null : operation, selector.closest('.machine-day-cell[data-date]')?.dataset.date || null);
  });
  wrapper.addEventListener('click', event => {
    if (suppressCardClick) {
      suppressCardClick = false;
      event.preventDefault();
      return;
    }
    const clearSelection = event.target.closest('[data-clear-selection]');
    if (clearSelection) {
      event.preventDefault();
      setSelectedOperation(null);
      return;
    }
    const selector = event.target.closest('[data-operation-selector]');
    if (selector) {
      event.preventDefault();
      const operation = operations.find(item => operationDragId(item) === String(selector.dataset.operationSelectorId));
      if (!operation) return;
      const selected = selectedOperationId === operationDragId(operation);
      setSelectedOperation(selected ? null : operation, selector.closest('.machine-day-cell[data-date]')?.dataset.date || null);
      return;
    }
    const bar = event.target.closest('.gantt-bar');
    const selectedForMove = selectedOperation();
    const selectedMoveCell = event.target.closest('.machine-day-cell[data-date]');
    if (selectedForMove && selectedMoveCell) {
      const clickedOperationId = bar?.dataset.dragOperationId || null;
      const isSelectedCardBody = clickedOperationId && clickedOperationId === operationDragId(selectedForMove);
      if (!isSelectedCardBody && selectedMoveCell.querySelector('.machine-production-card')) {
        event.preventDefault();
        window.alert('Este destino j\u00e1 possui uma produ\u00e7\u00e3o. Unifica\u00e7\u00e3o e substitui\u00e7\u00e3o ser\u00e3o implementadas nas pr\u00f3ximas etapas.');
        return;
      }
    }
    if (!bar) {
      const cell = event.target.closest('.machine-day-cell[data-date]');
      const operation = selectedForMove;
      if (cell && operation) {
        event.preventDefault();
        if (cell.querySelector('.machine-production-card')) {
          window.alert('Este destino j\u00e1 possui uma produ\u00e7\u00e3o. Unifica\u00e7\u00e3o e substitui\u00e7\u00e3o ser\u00e3o implementadas nas pr\u00f3ximas etapas.');
          return;
        }
        const moved = dispatchOperationDrop(operation, cell, 'click_move');
        if (moved) setSelectedOperation(null);
        return;
      }
      const dayTarget = event.target.closest('[data-date]');
      const dateHeader = event.target.closest('.gantt-date[data-date]');
      const date = dayTarget?.dataset.date || dateHeader?.dataset.date;
      if (date && typeof config.onDayClick === 'function') {
        config.onDayClick(date);
        return;
      }
      if (!dateHeader || !editableTeamCapacity) return;
      if (disablePastEditing && date < minEditableDate) return;
      showCapacityModal(wrapper, date, shifts);
      return;
    }
    const operation = operations.find(item => String(item.operationId || item.materialId) === String(bar.dataset.operationId));
    if (operation && typeof config.onOperationClick === 'function') {
      config.onOperationClick(operationWithSplitParent(operation, operations));
      return;
    }
    if (!showProductionDetails || operation?.operationType === 'transport' || isExistingScheduleBlocker(operation)) return;
    if (readOnly || (disablePastEditing && isHistoricalOperation(operation, minEditableDate))) return;
    if (operation) showOperationModal(wrapper, operationWithSplitParent(operation, operations), operationEventColor(operation));
  });

  wrapper.querySelector('[data-zoom-out]')?.addEventListener('click', () => setZoom(zoomIndex - 1));
  wrapper.querySelector('[data-zoom-in]')?.addEventListener('click', () => setZoom(zoomIndex + 1));
  wrapper.querySelectorAll('[data-calendar-view]').forEach(button => {
    button.addEventListener('click', () => setViewMode(button.dataset.calendarView));
  });
  const normalZoomIndex = () => 0;
  const fullscreenZoomIndex = () => Math.min(2, zoomLevels.length - 1);
  let zoomBeforeFullscreen = zoomIndex;
  let fullscreenPortal = null;
  const bridgedCalendarEvents = [
    'calendar-team-capacity-change',
    'operation-card-drop',
    'operation-date-change',
    'operation-config-change'
  ];
  const bridgeCalendarEvent = event => {
    if (!fullscreenPortal?.placeholder || event.__calendarPortalBridge) return;
    const bridgedEvent = new CustomEvent(event.type, {
      bubbles: true,
      cancelable: event.cancelable,
      detail: event.detail
    });
    Object.defineProperty(bridgedEvent, '__calendarPortalBridge', { value: true });
    fullscreenPortal.placeholder.dispatchEvent(bridgedEvent);
  };
  bridgedCalendarEvents.forEach(eventName => {
    wrapper.addEventListener(eventName, bridgeCalendarEvent);
  });
  const mountFullscreenPortal = () => {
    if (fullscreenPortal) return;
    const parent = wrapper.parentNode;
    if (!parent) return;
    const placeholder = document.createElement('span');
    placeholder.className = 'calendar-fullscreen-placeholder';
    placeholder.hidden = true;
    fullscreenPortal = {
      parent,
      nextSibling: wrapper.nextSibling,
      placeholder
    };
    parent.insertBefore(placeholder, wrapper);
    document.body.appendChild(wrapper);
  };
  const restoreFullscreenPortal = () => {
    if (!fullscreenPortal) return;
    const { parent, nextSibling, placeholder } = fullscreenPortal;
    const reference = nextSibling && nextSibling.parentNode === parent ? nextSibling : placeholder;
    const replacement = parent.isConnected
      ? [...parent.children].find(child => child !== placeholder && child !== wrapper && child.classList?.contains('calendar-gantt'))
      : null;
    if (replacement) {
      wrapper.remove();
    } else if (parent.isConnected) {
      parent.insertBefore(wrapper, reference);
    }
    placeholder.remove();
    fullscreenPortal = null;
  };
  const enterFullscreen = () => {
    if (wrapper.classList.contains('is-calendar-fullscreen')) return;
    zoomBeforeFullscreen = zoomIndex;
    mountFullscreenPortal();
    wrapper.classList.add('is-calendar-fullscreen');
    document.body.classList.add('calendar-fullscreen-open');
    wrapper.querySelector('[data-fullscreen]')?.setAttribute('aria-expanded', 'true');
    wrapper.querySelector('[data-fullscreen-close]')?.removeAttribute('hidden');
    setZoom(fullscreenZoomIndex());
  };
  const exitFullscreen = () => {
    if (!wrapper.classList.contains('is-calendar-fullscreen')) return;
    wrapper.classList.remove('is-calendar-fullscreen');
    document.body.classList.remove('calendar-fullscreen-open');
    wrapper.querySelector('[data-fullscreen]')?.setAttribute('aria-expanded', 'false');
    wrapper.querySelector('[data-fullscreen-close]')?.setAttribute('hidden', '');
    restoreFullscreenPortal();
    setZoom(zoomBeforeFullscreen ?? normalZoomIndex());
  };
  wrapper.querySelector('[data-fullscreen]')?.setAttribute('aria-expanded', 'false');
  wrapper.querySelector('[data-fullscreen-close]')?.setAttribute('hidden', '');
  wrapper.querySelector('[data-fullscreen]')?.addEventListener('click', enterFullscreen);
  wrapper.querySelector('[data-fullscreen-close]')?.addEventListener('click', () => {
    exitFullscreen();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !wrapper.classList.contains('is-calendar-fullscreen')) return;
    exitFullscreen();
  });

  setViewMode(viewMode);
  setZoom(zoomIndex);
  focusFirstOperation(wrapper, dates, operations);

  return wrapper;
}
