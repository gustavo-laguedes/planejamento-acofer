import {
  buildGanttApsWindow,
  ganttApsProductionIdentity,
  GANTT_APS_DEFAULT_PIXELS_PER_HOUR,
  orderGanttApsResources,
  orderGanttApsTasks,
  taskGeometry,
  taskMinuteRange
} from './ganttAps.geometry.js';
import {
  getProductionCalendarAllocationColor
} from '../../production-calendar/ProductionCalendarCard.js';

const ZOOM_LEVELS = [3, 4, 6, 8, 12];
export const GANTT_APS_ROWS_PER_PAGE = 60;
export const GANTT_APS_UNPLACED_TASKS_PER_PAGE = 24;
// Compatibilidade temporária com consumidores da primeira entrega da APS-002.
export const GANTT_APS_RESOURCES_PER_PAGE = GANTT_APS_ROWS_PER_PAGE;
export const GANTT_APS_TASKS_PER_RESOURCE_PAGE = GANTT_APS_ROWS_PER_PAGE;
const GANTT_APS_BAR_HORIZONTAL_INSET = 3;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '—');
}

export function ganttApsDayHeaderPresentation(day = {}, dayWidth = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day.date || ''));
  const fullDate = formatDate(day.date);
  const width = Number(dayWidth);
  const mode = width <= 96 ? 'compact' : 'full';
  const dateLabel = match
    ? `${match[3]}/${match[2]}/${match[1].slice(-2)}`
    : fullDate;
  const weekdayNames = [
    'domingo',
    'segunda',
    'terça',
    'quarta',
    'quinta',
    'sexta',
    'sábado'
  ];
  const weekday = match
    ? weekdayNames[new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )).getUTCDay()]
    : String(day.weekday || '').trim();
  const holiday = typeof day.holiday === 'string'
    ? day.holiday.trim()
    : day.holiday ? 'Feriado' : '';
  const secondaryLabel = weekday;
  const fullLabel = [
    fullDate,
    weekday,
    holiday && holiday !== weekday ? holiday : ''
  ].filter(Boolean).join(' · ');
  return { mode, dateLabel, secondaryLabel, fullLabel };
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(number)
    : '—';
}

function decimalParts(value) {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  const exponent = Number(match[4] || 0);
  let amount = BigInt(`${match[1] || ''}${match[2]}${match[3] || ''}`);
  let scale = (match[3] || '').length - exponent;
  if (scale < 0) {
    amount *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { amount, scale };
}

function sumDecimalValues(values = []) {
  const parts = values.map(decimalParts).filter(Boolean);
  if (!parts.length) return null;
  const scale = Math.max(...parts.map(item => item.scale));
  const amount = parts.reduce((sum, item) => (
    sum + (item.amount * (10n ** BigInt(scale - item.scale)))
  ), 0n);
  const negative = amount < 0n;
  const digits = String(negative ? -amount : amount).padStart(scale + 1, '0');
  if (!scale) return `${negative ? '-' : ''}${digits}`;
  const integer = digits.slice(0, -scale) || '0';
  const decimal = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${decimal ? `.${decimal}` : ''}`;
}

function formatDecimalNumber(value, maximumFractionDigits = 2) {
  return decimalParts(value)
    ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(String(value))
    : '—';
}

function normalizedUnit(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function quantityLabel(task) {
  if (task?.quantitySource === 'legacy-unresolved') return 'Não atribuída';
  const quantity = formatNumber(task?.quantity);
  return quantity === '—' ? quantity : `${quantity} ${task?.unit || ''}`.trim();
}

function dailyCapacityValue(task) {
  const candidates = [
    task?.maxDailyCapacity,
    task?.capacityMaxPerDay,
    task?.dailyMaxCapacity,
    task?.maxCapacityPerDay
  ];
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function quantityCapacityLabel(task) {
  const quantity = quantityLabel(task);
  if (quantity === '—' || quantity === 'Não atribuída') return quantity;
  const capacity = dailyCapacityValue(task);
  if (capacity === null) return quantity;
  return `${quantity} / ${formatNumber(capacity)} ${task?.unit || ''}`.trim();
}

export function buildGanttApsProductionTotalBlocks(tasks = []) {
  const rows = [];
  let offset = 0;
  while (offset < tasks.length) {
    const first = tasks[offset];
    const identity = ganttApsProductionIdentity(first);
    const resourceId = String(first?.resourceId ?? '');
    const unitKey = normalizedUnit(first?.unit);
    let end = offset + 1;
    while (
      end < tasks.length
      && String(tasks[end]?.resourceId ?? '') === resourceId
      && ganttApsProductionIdentity(tasks[end]) === identity
      && normalizedUnit(tasks[end]?.unit) === unitKey
    ) end += 1;
    const blockTasks = tasks.slice(offset, end);
    const total = sumDecimalValues(blockTasks.map(task => task?.quantity));
    blockTasks.forEach((task, index) => rows.push({
      task,
      blockStart: index === 0,
      rowSpan: blockTasks.length,
      total,
      unit: String(first?.unit || '').trim(),
      identity
    }));
    offset = end;
  }
  return rows;
}

function formatMinutes(value) {
  if (value === null || value === undefined || value === '') return '—';
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours}h${rest ? ` ${rest}min` : ''}` : `${rest}min`;
}

function productionLabel(task) {
  if (
    task?.productionIndex === null
    || task?.productionIndex === undefined
    || task?.productionIndex === ''
  ) return presented(task, 'productionTitle') || task?.productionId || 'Produção';
  const index = Number(task?.productionIndex);
  if (Number.isFinite(index)) return `Produção ${index + 1}`;
  return presented(task, 'productionTitle') || task?.productionId || 'Produção';
}

function productionNumbers(task) {
  return [...new Set(ganttApsProductionVisuals(task)
    .map(production => production.productionIndex)
    .filter(Number.isFinite)
    .map(index => index + 1))];
}

function productionColumnLabel(task) {
  const numbers = productionNumbers(task);
  if (!numbers.length) return productionLabel(task);
  return `Produção ${numbers.join(' / ')}`;
}

function associatedProductionsLabel(task) {
  const numbers = productionNumbers(task);
  return numbers.length > 1 ? numbers.join(' / ') : null;
}

function taskLabel(task, machineName) {
  const startDate = task.start?.date ?? task.date;
  const endDate = task.end?.date ?? task.endDate ?? startDate;
  return [
    productionColumnLabel(task),
    materialLabel(task),
    machineName,
    `${formatDate(startDate)} ${task.start?.time || task.startTime || '—'}`,
    `${formatDate(endDate)} ${task.end?.time || task.endTime || '—'}`,
    quantityLabel(task)
  ].join(', ');
}

function formatPercent(value) {
  const formatted = formatNumber(value);
  return formatted === '—' ? formatted : `${formatted}%`;
}

function formatPeople(value) {
  const formatted = formatNumber(value, 0);
  return formatted === '—' ? formatted : `${formatted} pessoa(s)`;
}

function pageSlice(items, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(0, Math.min(Number(page) || 0, pageCount - 1));
  return {
    items: items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    page: safePage,
    pageCount,
    total: items.length
  };
}

function presented(task, key, ...aliases) {
  const presentation = task?.presentation || {};
  const candidates = [presentation[key], task?.[key], ...aliases.map(alias => presentation[alias] ?? task?.[alias])];
  return candidates.find(value => value !== null && value !== undefined && value !== '') ?? null;
}

function stageLabel(task) {
  return presented(task, 'stageLabel', 'productionStageLabel')
    || (presented(task, 'stage', 'productionStage') != null
      ? `Etapa ${presented(task, 'stage', 'productionStage')}`
      : '—');
}

function materialLabel(task) {
  return presented(task, 'materialName', 'materialCode') || 'Material não informado';
}

function taskFitsWindow(task, window) {
  const range = taskMinuteRange(task);
  if (!range || window?.startDay == null || window?.endDay == null) return false;
  return range.end > window.startDay * 1440 && range.start < (window.endDay + 1) * 1440;
}

function ganttApsVisualCapacityPercent(value) {
  if (value == null || value === '') return null;
  const parsed = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

function ganttApsApplyBarHorizontalInset(left, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  if (safeWidth <= 0) return { left, width: 0 };
  const inset = Math.min(GANTT_APS_BAR_HORIZONTAL_INSET, Math.max(0, (safeWidth - 1) / 2));
  return {
    left: left + inset,
    width: Math.max(1, safeWidth - (2 * inset))
  };
}

function ganttApsVisualBarGeometry(geometry, window, pixelsPerHour, dayWidth, capacityPercent, startCapacityPercent = 0) {
  const rangeStart = window.startDay * 1440;
  const rangeEnd = (window.endDay + 1) * 1440;
  const clippedStart = Math.max(geometry.start, rangeStart);
  const clippedEnd = Math.min(geometry.end, rangeEnd);
  const clippedLeft = (clippedStart - rangeStart) * pixelsPerHour / 60;
  const clippedWidth = Math.max(3, (clippedEnd - clippedStart) * pixelsPerHour / 60);
  const durationMinutes = geometry.end - geometry.start;

  if (durationMinutes > 1440) {
    const insetGeometry = ganttApsApplyBarHorizontalInset(clippedLeft, clippedWidth);
    return {
      left: insetGeometry.left,
      width: insetGeometry.width,
      clipped: clippedStart !== geometry.start || clippedEnd !== geometry.end
    };
  }

  const visualCapacityPercent = ganttApsVisualCapacityPercent(capacityPercent);
  if (visualCapacityPercent == null) {
    const insetGeometry = ganttApsApplyBarHorizontalInset(clippedLeft, clippedWidth);
    return {
      left: insetGeometry.left,
      width: insetGeometry.width,
      clipped: clippedStart !== geometry.start || clippedEnd !== geometry.end
    };
  }

  const startDay = Math.floor(geometry.start / 1440);
  const startOffsetPercent = ganttApsVisualCapacityPercent(startCapacityPercent) ?? 0;
  const visualLeft = ((startDay - window.startDay) * dayWidth) + (dayWidth * startOffsetPercent / 100);
  const visibleTimelineWidth = (window.endDay - window.startDay + 1) * dayWidth;
  if (visualLeft < 0 || visualLeft >= visibleTimelineWidth) {
    const insetGeometry = ganttApsApplyBarHorizontalInset(clippedLeft, clippedWidth);
    return {
      left: insetGeometry.left,
      width: insetGeometry.width,
      clipped: true
    };
  }

  const insetGeometry = ganttApsApplyBarHorizontalInset(
    visualLeft,
    dayWidth * visualCapacityPercent / 100
  );
  return {
    left: insetGeometry.left,
    width: insetGeometry.width,
    clipped: clippedStart !== geometry.start || clippedEnd !== geometry.end
  };
}

function pagedResourceSegments(resources, tasks, window, rowBudget = GANTT_APS_ROWS_PER_PAGE) {
  const pages = [];
  let page = [];
  let used = 0;
  const pushPage = () => {
    if (page.length) pages.push(page);
    page = [];
    used = 0;
  };
  resources.forEach(resource => {
    const resourceTasks = orderGanttApsTasks(tasks.filter(task => (
      String(task.resourceId ?? '') === String(resource.id)
      && taskFitsWindow(task, window)
    )));
    if (!resourceTasks.length) {
      if (used >= rowBudget || page.length >= rowBudget) pushPage();
      page.push({ resource, tasks: [], continuation: false });
      return;
    }
    let offset = 0;
    while (offset < resourceTasks.length) {
      if (used >= rowBudget) pushPage();
      const count = Math.min(rowBudget - used, resourceTasks.length - offset);
      page.push({
        resource,
        tasks: resourceTasks.slice(offset, offset + count),
        continuation: offset > 0
      });
      offset += count;
      used += count;
      if (used >= rowBudget && offset < resourceTasks.length) pushPage();
    }
  });
  pushPage();
  return pages.length ? pages : [[]];
}

function appendPager(parent, { actionPrefix, page, pageCount, label }) {
  if (pageCount <= 1) return;
  const pager = element('div', 'gantt-aps__pager');
  const previous = element('button', '', '‹');
  previous.type = 'button';
  previous.dataset.action = `${actionPrefix}-previous`;
  previous.disabled = page <= 0;
  previous.setAttribute('aria-label', `${label}: página anterior`);
  const status = element('span', '', `${page + 1}/${pageCount}`);
  const next = element('button', '', '›');
  next.type = 'button';
  next.dataset.action = `${actionPrefix}-next`;
  next.disabled = page >= pageCount - 1;
  next.setAttribute('aria-label', `${label}: próxima página`);
  pager.append(previous, status, next);
  parent.append(pager);
}

function productionVisualIdentity(production, fallbackIndex) {
  if (production?.productionId !== null && production?.productionId !== undefined && production.productionId !== '') {
    return `production:${String(production.productionId)}`;
  }
  if (
    production?.productionIndex !== null
    && production?.productionIndex !== undefined
    && production.productionIndex !== ''
  ) return `production-index:${String(production.productionIndex)}`;
  return `visual:${String(production?.productionTitle || fallbackIndex)}`;
}

export function ganttApsProductionVisuals(task = {}) {
  const memberships = task?.presentation?.productionMemberships ?? task?.productionMemberships;
  const candidates = [
    {
      productionId: task?.productionId,
      productionIndex: task?.productionIndex,
      productionTitle: presented(task, 'productionTitle'),
      productionColor: presented(task, 'productionColor')
    },
    ...(Array.isArray(memberships) ? memberships : [])
  ]
    .map((production, sourceOrder) => ({ ...production, sourceOrder }))
    .sort((left, right) => {
      const leftIndex = Number(left.productionIndex);
      const rightIndex = Number(right.productionIndex);
      const leftHasIndex = left.productionIndex !== null
        && left.productionIndex !== undefined
        && left.productionIndex !== ''
        && Number.isFinite(leftIndex);
      const rightHasIndex = right.productionIndex !== null
        && right.productionIndex !== undefined
        && right.productionIndex !== ''
        && Number.isFinite(rightIndex);
      return (
        (leftHasIndex && rightHasIndex ? leftIndex - rightIndex : leftHasIndex ? -1 : rightHasIndex ? 1 : 0)
        || left.sourceOrder - right.sourceOrder
      );
    });
  const identities = new Set();
  return candidates.reduce((result, production) => {
    const identity = productionVisualIdentity(production, production.sourceOrder);
    if (identities.has(identity)) return result;
    identities.add(identity);
    const colorInput = {
      ...task,
      productionId: production.productionId,
      productionIndex: production.productionIndex,
      productionColor: production.productionColor
    };
    const resolved = getProductionCalendarAllocationColor(colorInput);
    result.push({
      identity,
      productionId: production.productionId ?? null,
      productionIndex: production.productionIndex !== null
        && production.productionIndex !== undefined
        && production.productionIndex !== ''
        && Number.isFinite(Number(production.productionIndex))
        ? Number(production.productionIndex)
        : null,
      color: resolved.accent
    });
    return result;
  }, []);
}

export function ganttApsProductionBackground(task = {}) {
  const productions = ganttApsProductionVisuals(task);
  const safeProductions = productions.length
    ? productions
    : [{ identity: `allocation:${String(task?.id ?? '')}`, color: '#2563eb' }];
  if (safeProductions.length === 1) return safeProductions[0].color;
  const step = 100 / safeProductions.length;
  const stops = safeProductions.flatMap((production, index) => {
    const start = Number((index * step).toFixed(4));
    const end = Number(((index + 1) * step).toFixed(4));
    return [`${production.color} ${start}%`, `${production.color} ${end}%`];
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function isNonWorkingDay(day) {
  if (day?.isWorkingDay === true || day?.isManuallyEnabled === true) return false;
  if (day?.isWorkingDay === false || day?.isNonWorkingDay === true || day?.holiday) return true;
  const dayNumber = Number(day?.dayNumber);
  const weekDay = Number.isFinite(dayNumber)
    ? new Date(dayNumber * 86400000).getUTCDay()
    : null;
  return weekDay === 0 || weekDay === 6;
}

function buildInspectPanel(task, machineName) {
  const panel = element('aside', 'gantt-aps__inspect');
  panel.style.setProperty('--gantt-aps-production-background', ganttApsProductionBackground(task));
  panel.setAttribute('aria-live', 'polite');
  const heading = element('h3', '', productionColumnLabel(task));
  const close = element('button', 'gantt-aps__inspect-close', '×');
  close.type = 'button';
  close.dataset.action = 'close-inspect';
  close.setAttribute('aria-label', 'Fechar inspeção');
  const header = element('div', 'gantt-aps__inspect-header');
  header.append(heading, close);
  panel.append(header);

  const productions = associatedProductionsLabel(task);
  const fields = [
    ...(productions ? [['Produções', productions]] : []),
    ['Etapa', stageLabel(task)],
    ['Material', materialLabel(task)],
    ['Máquina', machineName],
    ['Quantidade / Capacidade', quantityCapacityLabel(task)],
    ['Pessoas', formatNumber(task.peopleCount, 0)],
    ['Início', `${formatDate(task.start?.date)} ${task.start?.time || '—'}`],
    ['Término', `${formatDate(task.end?.date)} ${task.end?.time || '—'}`],
    ['Duração', formatMinutes(task.durationMinutes)],
    ['Capacidade utilizada', formatPercent(task.capacityPercent)],
    ['Posicao intradiaria', `${formatPercent(task.startCapacityPercent)} -> ${formatPercent(task.endCapacityPercent)}`],
    ['Allocation ID', task.id]
  ];
  const list = element('dl', 'gantt-aps__inspect-fields');
  fields.forEach(([label, value]) => {
    list.append(element('dt', '', label), element('dd', '', value || '—'));
  });
  panel.append(list);
  return panel;
}

function getTaskById(model, id) {
  return (Array.isArray(model?.tasks) ? model.tasks : [])
    .find(task => String(task.id) === String(id)) || null;
}

function taskMoveIntent(task, targetDate, resourceId) {
  return {
    type: 'MOVE_ALLOCATION',
    allocationId: task.id,
    operationId: task.operationId,
    calendarParentOperationId: task.calendarParentOperationId,
    parentOperationId: task.parentOperationId,
    productionId: task.productionId,
    productionIndex: task.productionIndex,
    from: {
      date: task.start?.date ?? task.date ?? null,
      machineId: task.resourceId == null ? null : String(task.resourceId)
    },
    to: {
      date: targetDate,
      machineId: resourceId == null ? null : String(resourceId)
    },
    source: 'gantt-drag',
    destination: {
      kind: 'empty',
      occupiedAllocationIds: []
    }
  };
}

export function createGanttApsRenderer({ onRequestMove } = {}) {
  let container = null;
  let root = null;
  let model = null;
  let pixelsPerHour = GANTT_APS_DEFAULT_PIXELS_PER_HOUR;
  let scrollLeft = 0;
  let scrollTop = 0;
  let selectedAllocationId = null;
  let focusTimer = null;
  let fullscreenListener = null;
  let rowPage = 0;
  let unplacedPage = 0;
  let dragState = null;
  const collapsedResources = new Set();

  const clearFocusTimer = () => {
    if (focusTimer === null) return;
    globalThis.clearTimeout?.(focusTimer);
    focusTimer = null;
  };

  const removeEffects = () => {
    clearFocusTimer();
    if (fullscreenListener) {
      document.removeEventListener?.('fullscreenchange', fullscreenListener);
      fullscreenListener = null;
    }
    root?.removeEventListener?.('click', onClick);
    root?.removeEventListener?.('pointerdown', onPointerDown);
    root?.removeEventListener?.('pointermove', onPointerMove);
    root?.removeEventListener?.('pointerup', onPointerUp);
    root?.removeEventListener?.('pointercancel', onPointerCancel);
    root?.remove?.();
    root = null;
  };

  const render = nextModel => {
    if (!container) throw new Error('Container do Gantt APS é obrigatório.');
    if (nextModel?.contractVersion !== 'planning-schedule-view/v1') {
      throw new Error('Contrato incompatível com o renderer Gantt APS.');
    }
    if (nextModel?.capabilities?.mutate !== false || nextModel?.capabilities?.inspect !== true) {
      throw new Error('Gantt APS exige contrato readonly com inspeção habilitada.');
    }

    const previousViewport = root?.querySelector?.('.gantt-aps__viewport');
    if (previousViewport) {
      scrollLeft = Number(previousViewport.scrollLeft || 0);
      scrollTop = Number(previousViewport.scrollTop || 0);
    }
    removeEffects();
    model = nextModel;
    selectedAllocationId = nextModel.metadata?.visualState?.selectedAllocationId
      ?? selectedAllocationId;

    root = element('section', 'gantt-aps');
    root.dataset.renderer = 'gantt-aps';
    root.dataset.readonly = 'true';
    root.dataset.manualMove = String(nextModel.capabilities?.manualMove === true && typeof onRequestMove === 'function');
    root.setAttribute('aria-label', 'Gantt APS');
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
    const stylesheet = element('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./gantt-aps.css', import.meta.url).href;
    root.append(stylesheet);

    const toolbar = element('div', 'gantt-aps__toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Controles de visualização do Gantt');
    const titleGroup = element('div', 'gantt-aps__title');
    titleGroup.append(
      element('strong', '', 'Gantt APS'),
      element('span', '', 'Somente leitura · agrupado por máquina')
    );
    const controls = element('div', 'gantt-aps__controls');
    const zoomOut = element('button', '', '−');
    zoomOut.type = 'button';
    zoomOut.dataset.action = 'zoom-out';
    zoomOut.setAttribute('aria-label', 'Reduzir zoom');
    const zoomLabel = element('output', 'gantt-aps__zoom', `${pixelsPerHour}px/h`);
    zoomLabel.dataset.role = 'zoom-label';
    const zoomIn = element('button', '', '+');
    zoomIn.type = 'button';
    zoomIn.dataset.action = 'zoom-in';
    zoomIn.setAttribute('aria-label', 'Aumentar zoom');
    const fullscreen = element('button', '', 'Tela cheia');
    fullscreen.type = 'button';
    fullscreen.dataset.action = 'fullscreen';
    controls.append(zoomOut, zoomLabel, zoomIn, fullscreen);
    toolbar.append(titleGroup, controls);
    root.append(toolbar);

    const metadataErrors = Array.isArray(nextModel.metadata?.errors)
      ? nextModel.metadata.errors
      : [];
    if (metadataErrors.length) {
      const errorSummary = element(
        'div',
        'gantt-aps__error',
        `${metadataErrors.length} inconsistência(s) recebida(s) no snapshot. Dados válidos continuam visíveis.`
      );
      errorSummary.setAttribute('role', 'status');
      root.append(errorSummary);
    }

    const tasks = Array.isArray(nextModel.tasks) ? nextModel.tasks : [];
    const resources = orderGanttApsResources(nextModel);
    if (!resources.length && !tasks.length) {
      const empty = element('div', 'gantt-aps__empty');
      empty.setAttribute('role', 'status');
      empty.append(
        element('strong', '', 'Nenhuma programação para exibir'),
        element('span', '', 'O snapshot aceito não contém máquinas nem alocações.')
      );
      root.append(empty);
      container.replaceChildren(root);
      return root;
    }

    const window = buildGanttApsWindow(nextModel);
    if (!window.days.length) {
      const empty = element('div', 'gantt-aps__empty');
      empty.setAttribute('role', 'status');
      empty.append(
        element('strong', '', 'Datas insuficientes para montar a timeline'),
        element('span', '', `${tasks.length} alocação(ões) preservada(s) no contrato.`)
      );
      if (tasks.length) {
        const unplacedPageData = pageSlice(
          tasks,
          unplacedPage,
          GANTT_APS_UNPLACED_TASKS_PER_PAGE
        );
        unplacedPage = unplacedPageData.page;
        const unplaced = element('div', 'gantt-aps__unplaced');
        unplacedPageData.items.forEach(task => {
          const button = element(
            'button',
            'gantt-aps__unplaced-task',
            `${productionLabel(task)} · ${materialLabel(task) || task.id}`
          );
          button.type = 'button';
          button.dataset.allocationId = String(task.id);
          button.setAttribute('aria-label', `Inspecionar alocação sem data válida: ${task.id}`);
          unplaced.append(button);
        });
        empty.append(unplaced);
        appendPager(empty, {
          actionPrefix: 'unplaced-page',
          page: unplacedPageData.page,
          pageCount: unplacedPageData.pageCount,
          label: 'Alocações sem geometria'
        });
      }
      root.append(empty);
      container.replaceChildren(root);
      return root;
    }

    const unplacedTasks = tasks.filter(task => !taskFitsWindow(task, window));
    const rowPages = pagedResourceSegments(resources, tasks, window);
    rowPage = Math.max(0, Math.min(rowPage, rowPages.length - 1));
    appendPager(controls, {
      actionPrefix: 'row-page',
      page: rowPage,
      pageCount: rowPages.length,
      label: 'Linhas do Gantt'
    });

    const timelineWidth = window.totalDays * 24 * pixelsPerHour;
    const dayWidth = 24 * pixelsPerHour;
    root.style.setProperty('--gantt-aps-timeline-width', `${timelineWidth}px`);
    root.style.setProperty('--gantt-aps-day-width', `${dayWidth}px`);
    root.style.setProperty('--gantt-aps-period-width', `${dayWidth / 4}px`);

    const viewport = element('div', 'gantt-aps__viewport');
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Tabela de máquinas e timeline do planejamento');
    viewport.setAttribute('role', 'treegrid');
    const header = element('div', 'gantt-aps__row gantt-aps__row--header');
    header.setAttribute('role', 'row');
    const tableHeader = element('div', 'gantt-aps__table gantt-aps__table--header');
    ['Máquina / total', 'Produção', 'Etapa', 'Material', 'Quantidade / Capacidade', 'Pessoas', 'Capacidade utilizada']
      .forEach((label, index) => {
        const cell = element('div', 'gantt-aps__cell', label);
        cell.setAttribute('role', 'columnheader');
        if (index === 6) {
          cell.innerHTML = '<span>CAPACIDADE</span><span>UTILIZADA</span>';
          cell.setAttribute('aria-label', 'Capacidade utilizada');
        }
        tableHeader.append(cell);
      });
      const timelineHeader = element('div', 'gantt-aps__timeline gantt-aps__timeline--header');
    window.days.forEach(day => {
      const dayHeader = element('div', 'gantt-aps__day-header');
      const presentation = ganttApsDayHeaderPresentation(day, dayWidth);
      dayHeader.dataset.date = day.date;
      dayHeader.dataset.labelMode = presentation.mode;
      dayHeader.title = presentation.fullLabel;
      dayHeader.setAttribute('aria-label', presentation.fullLabel);
      if (isNonWorkingDay(day)) dayHeader.dataset.nonWorking = 'true';
      if (day.isManuallyEnabled === true) dayHeader.dataset.manualWorkDate = 'true';
      dayHeader.append(
        element('strong', '', presentation.dateLabel),
        element('span', '', presentation.secondaryLabel)
      );
      timelineHeader.append(dayHeader);
    });
    header.append(tableHeader, timelineHeader);
    viewport.append(header);

    rowPages[rowPage].forEach(segment => {
      const { resource, continuation } = segment;
      const resourceId = String(resource.id);
      const totalResourceTasks = tasks.filter(task => String(task.resourceId ?? '') === resourceId).length;
      const groupRow = element('div', 'gantt-aps__row gantt-aps__row--group');
      groupRow.dataset.resourceId = resourceId;
      groupRow.setAttribute('role', 'row');
      groupRow.setAttribute('aria-level', '1');
      const groupTable = element('div', 'gantt-aps__table gantt-aps__group');
      const toggle = element('button', 'gantt-aps__group-toggle');
      toggle.type = 'button';
      toggle.dataset.action = 'toggle-group';
      toggle.dataset.resourceId = resourceId;
      toggle.setAttribute('aria-expanded', String(!collapsedResources.has(resourceId)));
      toggle.append(
        element('span', 'gantt-aps__chevron', collapsedResources.has(resourceId) ? '›' : '⌄'),
        element('strong', '', `${resource.name || resource.id}${continuation ? ' (continuação)' : ''}`),
        element('span', '', totalResourceTasks ? `${totalResourceTasks} alocação(ões)` : 'Sem produção')
      );
      groupTable.append(toggle);
      const groupTimeline = element('div', 'gantt-aps__timeline gantt-aps__group-timeline');
      groupRow.append(groupTable, groupTimeline);
      viewport.append(groupRow);

      if (collapsedResources.has(resourceId)) return;
      buildGanttApsProductionTotalBlocks(segment.tasks).forEach(totalRow => {
        const { task } = totalRow;
        const geometry = taskGeometry(task, window, pixelsPerHour);
        if (!geometry) return;
        const visualBar = ganttApsVisualBarGeometry(geometry, window, pixelsPerHour, dayWidth, task.capacityPercent, task.startCapacityPercent);
        const row = element('div', 'gantt-aps__row gantt-aps__row--allocation');
        row.dataset.allocationId = String(task.id);
        row.dataset.resourceId = resourceId;
        row.setAttribute('role', 'row');
        row.setAttribute('aria-level', '2');
        const table = element('div', 'gantt-aps__table gantt-aps__allocation-table');
        const totalLabel = totalRow.total === null
          ? '—'
          : `${formatDecimalNumber(totalRow.total)} ${totalRow.unit}`.trim();
        const values = [
          totalRow.blockStart ? totalLabel : '',
          productionColumnLabel(task),
          stageLabel(task),
          materialLabel(task),
          quantityCapacityLabel(task),
          formatPeople(task.peopleCount),
          formatPercent(task.capacityPercent)
        ];
        values.forEach((value, index) => {
          const cell = element('div', `gantt-aps__cell gantt-aps__cell--${index + 1}`, index === 1 ? undefined : value);
          cell.setAttribute('role', 'gridcell');
          cell.title = value;
          if (index === 3 || index === 4) cell.setAttribute('aria-label', value);
          if (index === 1) {
            const productions = ganttApsProductionVisuals(task);
            cell.dataset.productionCount = String(Math.max(1, productions.length));
            cell.style.setProperty('--gantt-aps-production-background', ganttApsProductionBackground(task));
            cell.append(element('span', 'gantt-aps__production-label', value));
          }
          if (index === 0) {
            cell.dataset.productionTotal = totalRow.blockStart ? 'start' : 'continuation';
            cell.dataset.productionIdentity = totalRow.identity;
            if (totalRow.blockStart) {
              cell.textContent = '';
              cell.style.setProperty('--gantt-aps-production-total-rows', String(totalRow.rowSpan));
              cell.append(element('span', 'gantt-aps__production-total', totalLabel));
              table.dataset.productionTotalStart = 'true';
            }
          }
          table.append(cell);
        });
        const timeline = element('div', 'gantt-aps__timeline gantt-aps__lane');
        timeline.dataset.resourceId = resourceId;
        window.days.forEach((day, dayIndex) => {
          const dropCell = element('span', 'gantt-aps__drop-cell');
          dropCell.dataset.date = day.date;
          dropCell.dataset.resourceId = resourceId;
          dropCell.style.left = `${dayIndex * dayWidth}px`;
          dropCell.style.width = `${dayWidth}px`;
          timeline.append(dropCell);
          const nonWorking = isNonWorkingDay(day);
          if (!nonWorking && day.isManuallyEnabled !== true) return;
          const band = element('span', 'gantt-aps__day-band');
          band.dataset.date = day.date;
          band.style.left = `${dayIndex * 24 * pixelsPerHour}px`;
          if (nonWorking) band.dataset.nonWorking = 'true';
          if (day.isManuallyEnabled === true) band.dataset.manualWorkDate = 'true';
          timeline.append(band);
        });
        const bar = element('button', 'gantt-aps__bar');
        bar.type = 'button';
        bar.dataset.allocationId = String(task.id);
        bar.dataset.persistable = String(task.persistable !== false);
        bar.dataset.draggable = String(nextModel.capabilities?.manualMove === true && task.persistable !== false);
        bar.dataset.selected = String(String(task.id) === String(selectedAllocationId));
        bar.dataset.labelDetail = visualBar.width >= 132 ? 'full' : visualBar.width >= 58 ? 'production' : 'none';
        if (visualBar.clipped) bar.dataset.clipped = 'true';
        bar.style.left = `${visualBar.left}px`;
        bar.style.width = `${visualBar.width}px`;
        const productionVisuals = ganttApsProductionVisuals(task);
        bar.dataset.productionCount = String(Math.max(1, productionVisuals.length));
        bar.style.setProperty('--gantt-aps-bar-color', productionVisuals[0]?.color || '#2563eb');
        bar.style.setProperty('--gantt-aps-production-background', ganttApsProductionBackground(task));
        bar.setAttribute('aria-label', taskLabel(task, resource.name || resource.id));
        bar.title = taskLabel(task, resource.name || resource.id);
        const main = element('span', 'gantt-aps__bar-main');
        main.append(
          element('strong', '', productionColumnLabel(task)),
          element('span', '', materialLabel(task))
        );
        bar.append(main);
        timeline.append(bar);
        row.append(table, timeline);
        viewport.append(row);
      });
    });

    if (window.truncated) {
      const notice = element('p', 'gantt-aps__window-notice', `Janela visual limitada a ${window.totalDays} dias.`);
      notice.setAttribute('role', 'status');
      root.append(notice);
    }
    root.append(viewport);
    if (unplacedTasks.length) {
      const unplacedPageData = pageSlice(
        unplacedTasks,
        unplacedPage,
        GANTT_APS_UNPLACED_TASKS_PER_PAGE
      );
      unplacedPage = unplacedPageData.page;
      const section = element('section', 'gantt-aps__unplaced-section');
      section.append(
        element('strong', '', `Alocações fora da janela ou sem geometria (${unplacedTasks.length})`),
        element('span', '', 'Dados preservados para inspeção; nenhuma posição temporal foi inferida ou ocultada.')
      );
      const unplaced = element('div', 'gantt-aps__unplaced');
      unplacedPageData.items.forEach(task => {
        const button = element(
          'button',
          'gantt-aps__unplaced-task',
          `${productionLabel(task)} · ${materialLabel(task) || task.id}`
        );
        button.type = 'button';
        button.dataset.allocationId = String(task.id);
        button.setAttribute('aria-label', `Inspecionar alocação sem geometria: ${task.id}`);
        unplaced.append(button);
      });
      section.append(unplaced);
      appendPager(section, {
        actionPrefix: 'unplaced-page',
        page: unplacedPageData.page,
        pageCount: unplacedPageData.pageCount,
        label: 'Alocações sem geometria'
      });
      root.append(section);
    }
    container.replaceChildren(root);
    viewport.scrollLeft = scrollLeft;
    viewport.scrollTop = scrollTop;

    fullscreenListener = () => {
      root?.classList.toggle('is-fullscreen', document.fullscreenElement === root);
    };
    document.addEventListener?.('fullscreenchange', fullscreenListener);
    return root;
  };

  const clearDragPresentation = () => {
    root?.querySelectorAll?.('.gantt-aps__drop-cell[data-drag-target], .gantt-aps__drop-cell[data-drag-invalid]')
      .forEach(cell => {
        delete cell.dataset.dragTarget;
        delete cell.dataset.dragInvalid;
      });
    root?.querySelectorAll?.('.gantt-aps__bar[data-dragging="true"]')
      .forEach(bar => { delete bar.dataset.dragging; });
  };

  const dragDestinationFromEvent = event => {
    if (!dragState) return null;
    const pointed = document.elementFromPoint?.(event.clientX, event.clientY) || event.target;
    const row = pointed?.closest?.('.gantt-aps__row--allocation') || dragState.row;
    const resourceId = String(row?.dataset?.resourceId ?? '');
    if (resourceId !== dragState.resourceId) {
      return { valid: false, resourceId, date: null };
    }
    const lane = row?.querySelector?.('.gantt-aps__lane') || dragState.lane;
    const rect = lane?.getBoundingClientRect?.() || { left: 0 };
    const viewport = root?.querySelector?.('.gantt-aps__viewport');
    const offsetX = Number(event.clientX || 0) - Number(rect.left || 0) + Number(viewport?.scrollLeft || 0);
    const dayIndex = Math.floor(offsetX / dragState.dayWidth);
    const day = dragState.window.days[dayIndex];
    if (!day?.date) return { valid: false, resourceId, date: null };
    return { valid: true, resourceId, date: day.date };
  };

  const updateDragPresentation = destination => {
    clearDragPresentation();
    dragState?.bar?.setAttribute?.('data-dragging', 'true');
    if (!destination?.date && destination?.valid !== false) return;
    if (destination?.valid === false) {
      dragState?.row?.querySelectorAll?.('.gantt-aps__drop-cell')
        .forEach(cell => { cell.dataset.dragInvalid = 'true'; });
      return;
    }
    const selector = `.gantt-aps__drop-cell[data-resource-id="${String(destination.resourceId).replaceAll('"', '\\"')}"][data-date="${String(destination.date).replaceAll('"', '\\"')}"]`;
    root?.querySelector?.(selector)?.setAttribute('data-drag-target', 'true');
  };

  const finishDrag = (event, { cancelled = false } = {}) => {
    if (!dragState) return;
    const state = dragState;
    const destination = !cancelled ? dragDestinationFromEvent(event) : null;
    clearDragPresentation();
    dragState = null;
    state.bar?.releasePointerCapture?.(state.pointerId);
    if (
      !cancelled
      && destination?.valid
      && destination.date
      && destination.date !== state.sourceDate
      && typeof onRequestMove === 'function'
    ) {
      onRequestMove(taskMoveIntent(state.task, destination.date, state.resourceId));
    }
  };

  const onPointerDown = event => {
    if (model?.capabilities?.manualMove !== true || typeof onRequestMove !== 'function') return;
    if (event.button !== undefined && event.button !== 0) return;
    const bar = event.target?.closest?.('.gantt-aps__bar');
    if (!bar || bar.dataset.draggable !== 'true') return;
    const task = getTaskById(model, bar.dataset.allocationId);
    if (!task) return;
    const row = bar.closest('.gantt-aps__row--allocation');
    const lane = row?.querySelector?.('.gantt-aps__lane');
    const window = buildGanttApsWindow(model);
    if (!row || !lane || !window.days.length) return;
    dragState = {
      task,
      bar,
      row,
      lane,
      window,
      dayWidth: 24 * pixelsPerHour,
      pointerId: event.pointerId,
      resourceId: String(task.resourceId ?? ''),
      sourceDate: task.start?.date ?? task.date ?? null
    };
    bar.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
    updateDragPresentation(dragDestinationFromEvent(event));
  };

  const onPointerMove = event => {
    if (!dragState) return;
    event.preventDefault?.();
    updateDragPresentation(dragDestinationFromEvent(event));
  };

  const onPointerUp = event => {
    finishDrag(event);
  };

  const onPointerCancel = event => {
    finishDrag(event, { cancelled: true });
  };

  const inspect = allocationId => {
    if (!root) return false;
    const task = getTaskById(model, allocationId);
    if (!task) return false;
    const resource = (model.resources || []).find(item => String(item.id) === String(task.resourceId));
    root.querySelector?.('.gantt-aps__inspect')?.remove();
    root.querySelectorAll?.('.gantt-aps__bar').forEach(bar => {
      bar.dataset.selected = String(bar.dataset.allocationId === String(task.id));
    });
    selectedAllocationId = String(task.id);
    root.append(buildInspectPanel(task, resource?.name || task.machineName || task.resourceId || '—'));
    return true;
  };

  const onClick = event => {
    const actionNode = event.target?.closest?.('[data-action]');
    const action = actionNode?.dataset?.action;
    if (action === 'close-inspect') {
      root?.querySelector?.('.gantt-aps__inspect')?.remove();
      return;
    }
    if (action === 'zoom-in' || action === 'zoom-out') {
      const current = ZOOM_LEVELS.reduce((best, value, index) => (
        Math.abs(value - pixelsPerHour) < Math.abs(ZOOM_LEVELS[best] - pixelsPerHour) ? index : best
      ), 0);
      const next = action === 'zoom-in'
        ? Math.min(ZOOM_LEVELS.length - 1, current + 1)
        : Math.max(0, current - 1);
      pixelsPerHour = ZOOM_LEVELS[next];
      render(model);
      return;
    }
    if (action === 'row-page-previous' || action === 'row-page-next') {
      rowPage += action.endsWith('next') ? 1 : -1;
      render(model);
      return;
    }
    if (action === 'unplaced-page-previous' || action === 'unplaced-page-next') {
      unplacedPage += action.endsWith('next') ? 1 : -1;
      render(model);
      return;
    }
    if (action === 'toggle-group') {
      const resourceId = String(actionNode.dataset.resourceId ?? '');
      if (collapsedResources.has(resourceId)) collapsedResources.delete(resourceId);
      else collapsedResources.add(resourceId);
      render(model);
      return;
    }
    if (action === 'fullscreen') {
      if (document.fullscreenElement === root) document.exitFullscreen?.();
      else root?.requestFullscreen?.();
      return;
    }
    const bar = event.target?.closest?.('[data-allocation-id]');
    if (bar) inspect(bar.dataset.allocationId);
  };

  return {
    mount(nextContainer, nextModel) {
      if (!nextContainer) throw new Error('Container do Gantt APS é obrigatório.');
      container = nextContainer;
      return render(nextModel);
    },

    update(nextModel) {
      return render(nextModel);
    },

    focusAllocation(allocationId) {
      clearFocusTimer();
      const task = getTaskById(model, allocationId);
      if (!task) return false;
      const resources = orderGanttApsResources(model);
      const window = buildGanttApsWindow(model);
      if (taskFitsWindow(task, window)) {
        const pages = pagedResourceSegments(resources, model.tasks || [], window);
        const pageIndex = pages.findIndex(page => page.some(segment => (
          segment.tasks.some(item => String(item.id) === String(task.id))
        )));
        rowPage = Math.max(0, pageIndex);
        collapsedResources.delete(String(task.resourceId ?? ''));
      } else {
        const unplacedTasks = (model.tasks || []).filter(item => !taskFitsWindow(item, window));
        const taskIndex = unplacedTasks.findIndex(item => String(item.id) === String(task.id));
        unplacedPage = Math.max(0, Math.floor(taskIndex / GANTT_APS_UNPLACED_TASKS_PER_PAGE));
      }
      render(model);
      if (!inspect(allocationId)) return false;
      const candidates = [...(root?.querySelectorAll?.('[data-allocation-id]') || [])];
      const target = candidates.find(item => (
        item.dataset.allocationId === String(allocationId)
        && String(item.className || '').split(/\s+/).includes('gantt-aps__bar')
      )) || candidates.find(item => item.dataset.allocationId === String(allocationId));
      if (!target) return false;
      target.classList.add('is-flow-focused');
      target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      target.focus?.({ preventScroll: true });
      focusTimer = globalThis.setTimeout?.(() => {
        target.classList.remove('is-flow-focused');
        focusTimer = null;
      }, 2200) ?? null;
      return true;
    },

    getViewportState() {
      const viewport = root?.querySelector?.('.gantt-aps__viewport');
      const window = buildGanttApsWindow(model);
      return {
        zoom: pixelsPerHour,
        scrollLeft: Number(viewport?.scrollLeft || 0),
        scrollTop: Number(viewport?.scrollTop || 0),
        horizon: window.days.at(-1)?.date || null,
        selectedAllocationId
      };
    },

    getRootElement() {
      return root;
    },

    destroy() {
      root?.removeEventListener?.('click', onClick);
      removeEffects();
      container = null;
      model = null;
      selectedAllocationId = null;
      scrollLeft = 0;
      scrollTop = 0;
      rowPage = 0;
      unplacedPage = 0;
      collapsedResources.clear();
    }
  };
}
