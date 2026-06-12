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

const LOCAL_HOLIDAYS = [
  { date: '2026-01-01', name: 'Confraternizacao Universal', type: 'nacional' },
  { date: '2026-02-17', name: 'Carnaval', type: 'nacional' },
  { date: '2026-04-03', name: 'Sexta-feira Santa', type: 'nacional' },
  { date: '2026-04-21', name: 'Tiradentes', type: 'nacional' },
  { date: '2026-05-01', name: 'Dia do Trabalho', type: 'nacional' },
  { date: '2026-06-04', name: 'Corpus Christi', type: 'nacional' },
  { date: '2026-09-07', name: 'Independencia do Brasil', type: 'nacional' },
  { date: '2026-10-12', name: 'Nossa Senhora Aparecida', type: 'nacional' },
  { date: '2026-11-02', name: 'Finados', type: 'nacional' },
  { date: '2026-11-15', name: 'Proclamacao da Republica', type: 'nacional' },
  { date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciencia Negra', type: 'nacional' },
  { date: '2026-12-25', name: 'Natal', type: 'nacional' },
  { date: '2026-07-10', name: 'Aniversario de Pindamonhangaba', type: 'municipal' }
];

function holidayForDate(date) {
  return LOCAL_HOLIDAYS.find(holiday => holiday.date === date) || null;
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
    { bg: '#d8eef7', border: '#1f78a8', text: '#123942' },
    { bg: '#e4f4fb', border: '#4b97bd', text: '#123942' },
    { bg: '#eef9fd', border: '#72b4d0', text: '#123942' },
    { bg: '#f6fcff', border: '#9bcfe2', text: '#123942' }
  ],
  [
    { bg: '#fff2bf', border: '#d79a16', text: '#56320d' },
    { bg: '#fff7d7', border: '#e4b544', text: '#56320d' },
    { bg: '#fffbe8', border: '#eccb73', text: '#56320d' },
    { bg: '#fffdf3', border: '#f1d895', text: '#56320d' }
  ],
  [
    { bg: '#dff3e8', border: '#2f8a5d', text: '#173d2e' },
    { bg: '#e9f8ef', border: '#5aa67a', text: '#173d2e' },
    { bg: '#f2fbf6', border: '#83bf9a', text: '#173d2e' },
    { bg: '#f8fefa', border: '#a8d5b8', text: '#173d2e' }
  ],
  [
    { bg: '#e7ebfb', border: '#5269b0', text: '#26376f' },
    { bg: '#f0f3ff', border: '#7488cc', text: '#26376f' },
    { bg: '#f6f8ff', border: '#96a5de', text: '#26376f' },
    { bg: '#fbfcff', border: '#b7c1eb', text: '#26376f' }
  ],
  [
    { bg: '#fbe5ef', border: '#9a4f74', text: '#552345' },
    { bg: '#fff0f6', border: '#b96f94', text: '#552345' },
    { bg: '#fff7fa', border: '#cf90ae', text: '#552345' },
    { bg: '#fffafd', border: '#e0b3c8', text: '#552345' }
  ]
];

const TRANSPORT_COLOR = { bg: '#f3f5f7', border: '#c6ced6', text: '#3d4752' };
const SEQUENTIAL_EVENT_VISUAL_GAP_MINUTES = 1;
const CALENDAR_VIEW_STORAGE_KEY = 'planejamento_calendar_view';
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
    return sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) || 'time';
  } catch {
    return 'time';
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
  return `--event-left: calc(${left}% + 4px); --event-width: calc(${width}% - 8px); --event-top: calc(${lane * laneHeight}% + 5px); --event-height: calc(${laneHeight}% - 10px);`;
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

function eventColorStyle(color, breakdown, colorForProduction) {
  const items = stableProductionBreakdown(breakdown);
  if (items.length <= 1) return colorStyle(color);
  const step = 100 / items.length;
  const bgStops = items.map((item, index) => {
    const productionColor = colorForProduction(stableProductionKey(item));
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return `${productionColor.bg} ${start}% ${end}%`;
  }).join(', ');
  const firstColor = colorForProduction(stableProductionKey(items[0]));
  return `--event-bg: linear-gradient(90deg, ${bgStops}); --event-border: ${firstColor.border}; --event-text: ${firstColor.text};`;
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
    current.peopleCount = current.peopleCount || item.peopleCount || operation.peopleCount;
    current.productionModelName = current.productionModelName || item.productionModelName || operation.productionModelName;
    current.productivityOptions = current.productivityOptions?.length ? current.productivityOptions : item.productivityOptions || operation.productivityOptions || [];
    current.productionModelOptions = current.productionModelOptions?.length ? current.productionModelOptions : item.productionModelOptions || operation.productionModelOptions || [];
    current.quantity = Number((Number(current.quantity || 0) + Number(item.quantity || 0)).toFixed(3));
  });
  return stableProductionBreakdown([...grouped.values()]);
}

function productivitySummary(operation, breakdown = productionBreakdown(operation)) {
  const items = breakdown.length ? breakdown : [operation];
  const labels = [...new Set(items.map(item => {
    const outputQty = item.outputQty ?? operation.outputQty;
    const outputUnit = item.outputUnit ?? operation.outputUnit;
    const timeSeconds = item.timeSeconds ?? operation.timeSeconds;
    if (outputQty && timeSeconds) return `${formatQty(outputQty)} ${outputUnit || ''} em ${formatQty(timeSeconds)}s`.trim();
    const machineName = item.machineName || operation.machineName || '-';
    const peopleCount = item.peopleCount || operation.peopleCount || '-';
    return `${machineName} | ${peopleCount} pessoa${Number(peopleCount) === 1 ? '' : 's'}`;
  }).filter(Boolean))];
  return labels.join(' | ');
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
  const source = Array.isArray(config.shifts) && config.shifts.length ? config.shifts : [{
    label: 'Turno 1',
    shiftStartTime: config.shiftStartTime || '07:00',
    shiftEndTime: config.shiftEndTime || '17:00',
    pauseHours: config.lunchHours || 0,
    teamAvailable: 0
  }];
  return source.map((shift, index) => {
    const shiftStart = parseTime(shift.shiftStartTime, index === 0 ? '07:00' : '17:00');
    let shiftEnd = parseTime(shift.shiftEndTime, minutesToTime(shiftStart + 60));
    if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
    const pauseMinutes = parseLunchMinutes(shift.pauseHours ?? shift.lunchHours ?? 0);
    const lunchStart = shift.pauseStartTime
      ? parseTime(shift.pauseStartTime, minutesToTime(shiftStart + Math.floor((shiftEnd - shiftStart - pauseMinutes) / 2)))
      : index === 0 ? 12 * 60 : shiftStart + Math.max(Math.floor((shiftEnd - shiftStart - pauseMinutes) / 2), 0);
    return {
      label: shift.label || `Turno ${index + 1}`,
      shiftStart,
      shiftEnd,
      lunchStart,
      lunchEnd: lunchStart + pauseMinutes,
      teamAvailable: Math.max(Number(shift.teamAvailable || 0), 0)
    };
  });
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
    const available = shift.teamAvailable;
    return {
      label: shift.label,
      used,
      available,
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
  const capacityText = capacityTooltip(capacity);
  const title = [blockedDay?.name, capacityText].filter(Boolean).join('\n');
  return `
    <div class="gantt-date${capacity.some(item => item.exceeded) ? ' team-exceeded' : ''}${blockedDay ? ' non-working-day' : ''}" data-date="${date}" title="${escapeAttr(title)}">
      <strong>${formatDateLabel(date)}</strong>
      <span>${formatDate(date)}</span>
      <div class="team-capacity-list">
        ${capacity.map(item => `
          <small class="team-capacity${item.exceeded ? ' exceeded' : ''}" title="${escapeAttr(item.exceeded ? `Equipe excedida: ${item.used} pessoas usadas simultaneamente, ${item.available || 0} disponiveis.` : `${item.label}: Equipe ${item.used}/${item.available || 0}`)}">
            ${escapeAttr(item.label.replace(/^Turno\s*/i, 'T'))}: ${item.used}/${item.available || 0}${item.exceeded ? ' !' : ''}
          </small>
        `).join('')}
      </div>
    </div>
  `;
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
    eachDate(startDate, endDate).forEach(date => {
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
    peopleCount: item.peopleCount || operation.peopleCount
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
    backdrop.classList.add('modal-backdrop-floating');
    modal.classList.add('is-floating');
    modal.classList.add('is-dragging');
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.top}px`;
    modal.style.transform = 'none';
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
    if (startDrag(event)) handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', moveDrag);
  const stopPointerDrag = event => {
    stopDrag();
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', stopPointerDrag);
  handle.addEventListener('pointercancel', stopPointerDrag);
  handle.addEventListener('mousedown', event => {
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
  if (operation.operationType === 'transport') {
    return [
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

function splitRowTemplate(index, part, operation, machineOptions) {
  const models = modelOptions(operation);
  const selectedValue = optionValue({
    machineName: part.machineName || operation.machineName,
    peopleCount: part.peopleCount || operation.peopleCount
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
      ${index > 1 ? '<button class="link-button danger remove-split" type="button">Remover</button>' : ''}
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
  if (Math.abs(sum - total) > 0.001 || parts.some(part => !(part.quantity > 0) || !part.startDate || !part.startTime || !part.machineName || !part.peopleCount)) {
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

function showOperationModal(wrapper, operation) {
  const machineOptions = operation.productivityOptions || [];
  const models = modelOptions(operation);
  const selectedModel = operation.productionModelName || models[0]?.modelName || '';
  const startTime = operationStartTime(operation);
  const endTime = operationEndTime(operation);
  const breakdown = productionBreakdown(operation);
  const isSharedOperation = breakdown.length > 1;
  const productivityLabel = productivitySummary(operation, breakdown);
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
    <div class="modal operation-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>${operation.materialName}</h2>
        <button class="link-button close-modal" type="button">Fechar</button>
      </div>
      <form class="operation-modal-form">
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
          <article class="split-hide-when-active"><span>Produtividade</span><strong>${escapeAttr(productivityLabel)}</strong></article>
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
            <button class="secondary-button divide-production" type="button">Dividir produ&ccedil;&atilde;o</button>
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
    });
  });
  backdrop.querySelectorAll('[name="productionMachine"], [name="productionPeople"]').forEach(select => {
    select.addEventListener('change', () => {
      const row = select.closest('.operation-production-row');
      row.querySelector('[name="productionMachine"]').value = select.value;
      row.querySelector('[name="productionPeople"]').value = select.value;
    });
  });
  const splitsTarget = backdrop.querySelector('.operation-splits-target');
  const addSplitButton = backdrop.querySelector('.add-split');
  const renderSplits = (target, parts, scopeOperation, scopeMachineOptions, addButton = null) => {
    backdrop.querySelector('.operation-modal')?.classList.add('is-split-mode');
    target.innerHTML = parts.map((part, index) => splitRowTemplate(index, part, scopeOperation, scopeMachineOptions)).join('');
    if (addButton) addButton.hidden = false;
    target.closest('.operation-production-row, .operation-split-section')?.querySelector('.split-warning')?.toggleAttribute('hidden', true);
  };
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
  wrapper.appendChild(backdrop);
}

export function CalendarTimeline(days = [], operations = [], config = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'calendar-gantt';
  const zoomLevels = [
    { dayWidth: 170, hourHeight: 58, machineRowHeight: 76 },
    { dayWidth: 210, hourHeight: 72, machineRowHeight: 88 },
    { dayWidth: 260, hourHeight: 88, machineRowHeight: 104 },
    { dayWidth: 320, hourHeight: 108, machineRowHeight: 122 },
    { dayWidth: 390, hourHeight: 132, machineRowHeight: 144 }
  ];
  const topPad = 18;
  let zoomIndex = 0;
  let viewMode = savedCalendarView();

  if (!operations.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calend&aacute;rio.</div>';
    return wrapper;
  }

  const knownDates = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean).sort();
  const calendarStartDate = addDays(knownDates[0], -15);
  const calendarEndDate = addDays(knownDates[knownDates.length - 1], 15);
  const dates = eachDate(calendarStartDate, calendarEndDate);
  const stageIndexes = new Map();
  operations
    .filter(operation => operation.operationType !== 'transport')
    .slice()
    .sort((left, right) =>
      Number(left.productionOrder || 0) - Number(right.productionOrder || 0)
      || String(left.materialName || '').localeCompare(String(right.materialName || ''))
    )
    .forEach(operation => {
      const productionKey = String(operation.productionKey || (operation.productionIndex ?? operation.materialId) || operation.materialName || '');
      const operationKey = String(operation.operationId || operation.materialId || operation.materialName || '');
      const key = `${productionKey}:${operationKey}`;
      if (!stageIndexes.has(key)) {
        const currentCount = [...stageIndexes.keys()].filter(item => item.startsWith(`${productionKey}:`)).length;
        stageIndexes.set(key, currentCount);
      }
    });
  const shifts = normalizeShiftConfig(config);
  const colorForProduction = productionKey => {
    const productionColorIndex = stableProductionIndex({ productionKey });
    return PRODUCTION_STAGE_COLORS[productionColorIndex % PRODUCTION_STAGE_COLORS.length][0];
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
      <div class="calendar-view-toggle" role="group" aria-label="Visualiza&ccedil;&atilde;o do calend&aacute;rio">
        <button class="secondary-button is-active" type="button" data-calendar-view="time">Por tempo</button>
        <button class="secondary-button" type="button" data-calendar-view="machines">Por m&aacute;quinas</button>
      </div>
      <button class="secondary-button" type="button" data-zoom-out aria-label="Diminuir zoom">-</button>
      <button class="secondary-button" type="button" data-zoom-in aria-label="Aumentar zoom">+</button>
      <button class="secondary-button fullscreen-button" type="button" data-fullscreen aria-label="Tela cheia">Tela cheia</button>
      <button class="secondary-button fullscreen-close" type="button" data-fullscreen-close aria-label="Sair da tela cheia">X</button>
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

  function setViewMode(nextMode) {
    viewMode = nextMode === 'machines' ? 'machines' : 'time';
    saveCalendarView(viewMode);
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
    const breakdown = isTransport ? [] : productionBreakdown(operation);
    const shortLabel = isTransport ? 'TR' : `${operation.peopleCount || '-'}p`;
    return `
      <button class="gantt-bar${isTransport ? ' gantt-bar-transport' : ''}${shouldShowText ? '' : ' gantt-bar-compact'}" type="button" data-operation-id="${escapeAttr(operation.operationId || operation.materialId)}" style="${style} ${colorStyleText}" data-tooltip="${escapeAttr(tooltipText(operation))}">
        ${shouldShowText && isTransport ? `
          <strong>Transporte</strong>
          <span>${operation.materialName || '-'}</span>
          <span>${operation.originLocationName || '-'} -&gt; ${operation.destinationLocationName || '-'}</span>
          <small>${formatHours(operation.transportHours)}h | ${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
        ` : shouldShowText ? `
          <strong>${operation.materialName}</strong>
          <span>${quantity || '-'}</span>
          <span>${operation.machineName || '-'} | ${operation.peopleCount || '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>
          ${breakdown.length > 1 ? `<small>${breakdown.map(part => `${escapeAttr(part.productionTitle || `P${Number(part.productionIndex || 0) + 1}`)}: ${formatQty(part.quantity)}`).join(' | ')}</small>` : ''}
          <small>${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
        ` : `<span class="gantt-compact-label">${escapeAttr(shortLabel)}</span>`}
      </button>
    `;
  }

  function operationEventColor(operation) {
    const isTransport = operation.operationType === 'transport';
    const productionKey = String(operation.productionKey || (operation.productionIndex ?? operation.materialId) || operation.materialName || '');
    const productionColorIndex = stableProductionIndex(operation);
    const palette = PRODUCTION_STAGE_COLORS[productionColorIndex % PRODUCTION_STAGE_COLORS.length];
    const stageKey = `${productionKey}:${operation.operationId || operation.materialId || operation.materialName || ''}`;
    const productionBaseColor = palette[0];
    return isTransport ? { ...TRANSPORT_COLOR, border: productionBaseColor.border } : palette[(stageIndexes.get(stageKey) || 0) % palette.length];
  }

  function renderMachineBoard() {
    const zoom = zoomLevels[zoomIndex];
    const totalMinutes = dayEnd - dayStart;
    const bodyHeight = MACHINE_CALENDAR_ORDER.length * zoom.machineRowHeight;
    const lunchBreaks = shifts
      .filter(shift => shift.lunchEnd > shift.lunchStart && shift.lunchEnd > dayStart && shift.lunchStart < dayEnd)
      .map(shift => ({
        label: shift.label,
        lunchStart: shift.lunchStart,
        lunchEnd: shift.lunchEnd,
        left: (clampMinutes(shift.lunchStart, dayStart, dayEnd) / totalMinutes) * 100,
        width: ((clampMinutes(shift.lunchEnd, dayStart, dayEnd) - clampMinutes(shift.lunchStart, dayStart, dayEnd)) / totalMinutes) * 100
      }))
      .filter(shift => shift.width > 0);
    const board = wrapper.querySelector('.gantt-board');
    board.style.setProperty('--calendar-days', String(dates.length));
    board.style.setProperty('--calendar-day-width', `${zoom.dayWidth}px`);
    board.style.setProperty('--machine-row-height', `${zoom.machineRowHeight}px`);
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
            return renderCapacityHeader(date, operations, dates, shifts, blockedDay);
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
                const daySegments = operations
                  .filter(operation => operation.operationType !== 'transport')
                  .filter(operation => operationMachineNames(operation).some(name => normalizeMachineName(name) === normalizeMachineName(machine)))
                  .flatMap(operation => {
                    const segments = operationDaySegments(operation, dates, dayStart, dayEnd, lunchBreaks).get(date) || [];
                    return segments.map(segment => ({ operation, segment }));
                  });
                const dayOperations = arrangeParallelSegments(daySegments).map(item => {
                  const { operation, segment } = item;
                  const { start, end } = segmentMinutes(segment, dayStart, dayEnd);
                  const shouldShowText = ((end - start) / totalMinutes) * zoom.dayWidth >= 78 || zoom.machineRowHeight >= 118;
                  const eventColor = operationEventColor(operation);
                  const breakdown = productionBreakdown(operation);
                  const style = machineSegmentStyle({ ...segment, visualStart: item.visualStart }, dayStart, dayEnd, item.lane, item.laneCount);
                  return renderOperationButton(operation, segment, item, style, shouldShowText, eventColorStyle(eventColor, breakdown, colorForProduction));
                }).join('');
                return `
                  <div class="machine-day-cell${blockedDay ? ' non-working-day' : ''}" data-date="${date}">
                    ${lunchBreaks.map(band => `<span class="machine-lunch-band" style="--lunch-left: ${band.left}%; --lunch-width: ${band.width}%;">Pausa ${escapeAttr(band.label.replace(/^Turno\s*/i, 'T'))}</span>`).join('')}
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
            return renderCapacityHeader(date, operations, dates, shifts, blockedDay);
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
              const lunchBreaks = shifts.map(shift => ({ lunchStart: shift.lunchStart, lunchEnd: shift.lunchEnd }));
              const segments = operationDaySegments(operation, dates, dayStart, dayEnd, lunchBreaks).get(date) || [];
              return segments.map(segment => ({ operation, segment }));
            });
            const dayOperations = arrangeParallelSegments(daySegments).map(item => {
              const { operation, segment } = item;
              const startTime = operationStartTime(operation);
              const endTime = operationEndTime(operation);
              const quantity = `${formatQty(operation.produceQty)} ${operation.unit || ''}`.trim();
              const isTransport = operation.operationType === 'transport';
              const productionKey = String(operation.productionKey || (operation.productionIndex ?? operation.materialId) || operation.materialName || '');
              const { start, end } = segmentMinutes(segment, dayStart, dayEnd);
              const shouldShowText = segment.visualIndex === 0 && ((end - start) / 60) * zoom.hourHeight >= 62;
              const shortLabel = isTransport ? 'TR' : `${operation.peopleCount || '-'}p`;
              const productionColorIndex = stableProductionIndex(operation);
              const palette = PRODUCTION_STAGE_COLORS[productionColorIndex % PRODUCTION_STAGE_COLORS.length];
              const stageKey = `${productionKey}:${operation.operationId || operation.materialId || operation.materialName || ''}`;
              const productionBaseColor = palette[0];
              const eventColor = isTransport ? { ...TRANSPORT_COLOR, border: productionBaseColor.border } : palette[(stageIndexes.get(stageKey) || 0) % palette.length];
              const breakdown = isTransport ? [] : productionBreakdown(operation);
              return `
                <button class="gantt-bar${isTransport ? ' gantt-bar-transport' : ''}${shouldShowText ? '' : ' gantt-bar-compact'}" type="button" data-operation-id="${escapeAttr(operation.operationId || operation.materialId)}" style="${segmentStyle({ ...segment, visualStart: item.visualStart }, dayStart, dayEnd, zoom.hourHeight)} ${laneStyle(item.lane, item.laneCount)} ${eventColorStyle(eventColor, breakdown, colorForProduction)}" data-tooltip="${escapeAttr(tooltipText(operation))}">
                  ${shouldShowText && isTransport ? `
                    <strong>Transporte</strong>
                    <span>${operation.materialName || '-'}</span>
                    <span>${operation.originLocationName || '-'} -&gt; ${operation.destinationLocationName || '-'}</span>
                    <small>${formatHours(operation.transportHours)}h | ${formatDate(operation.startDate)} ${startTime} at&eacute; ${formatDate(operation.endDate)} ${endTime}</small>
                  ` : shouldShowText ? `
                    <strong>${operation.materialName}</strong>
                    <span>${quantity || '-'}</span>
                    <span>${operation.machineName || '-'} | ${operation.peopleCount || '-'} pessoa${Number(operation.peopleCount) === 1 ? '' : 's'}</span>
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
    const operation = operations.find(item => String(item.operationId || item.materialId) === String(bar.dataset.operationId));
    if (operation?.operationType === 'transport') return;
    if (operation) showOperationModal(wrapper, operation);
  });

  wrapper.querySelector('[data-zoom-out]')?.addEventListener('click', () => setZoom(zoomIndex - 1));
  wrapper.querySelector('[data-zoom-in]')?.addEventListener('click', () => setZoom(zoomIndex + 1));
  wrapper.querySelectorAll('[data-calendar-view]').forEach(button => {
    button.addEventListener('click', () => setViewMode(button.dataset.calendarView));
  });
  wrapper.querySelector('[data-fullscreen]')?.addEventListener('click', () => {
    wrapper.classList.add('is-calendar-fullscreen');
    document.body.classList.add('calendar-fullscreen-open');
    renderBoard();
  });
  wrapper.querySelector('[data-fullscreen-close]')?.addEventListener('click', () => {
    wrapper.classList.remove('is-calendar-fullscreen');
    document.body.classList.remove('calendar-fullscreen-open');
    renderBoard();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !wrapper.classList.contains('is-calendar-fullscreen')) return;
    wrapper.classList.remove('is-calendar-fullscreen');
    document.body.classList.remove('calendar-fullscreen-open');
    renderBoard();
  });

  setViewMode(viewMode);
  setZoom(zoomIndex);
  focusFirstOperation(wrapper, dates, operations);

  return wrapper;
}
