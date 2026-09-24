import {
  buildGanttApsWindow,
  civilDayNumber,
  ganttApsProductionIdentity,
  GANTT_APS_DEFAULT_PIXELS_PER_HOUR,
  orderGanttApsResources,
  orderGanttApsTasks,
  taskGeometry,
  taskMinuteRange
} from './ganttAps.geometry.js';
import {
  getProductionCalendarAllocationColor
} from '../../planning-presentation/productionDisplayColor.js';

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
    task?.nominalDailyCapacity,
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
  if (
  task?.scheduleType === 'transport'
  ||
  task?.transportId
) {
  const quantity =
    formatNumber(
      task?.quantity
    );

  const total =
    formatNumber(
      task?.transportTotalQuantity
      ??
      task?.totalQuantity
      ??
      task?.requiredQuantity
      ??
      task?.quantity
    );

  const unit =
    String(
      task?.unit
      || ''
    );

  return `${
    quantity
  } / ${
    total
  } ${
    unit
  }`.trim();
}
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

function dayTeamLabel(day = {}) {
  const team = day.team || {};
  if (team.peakPeople === undefined && team.availablePeople === undefined) return 'Equipe: -';
  return `Equipe: ${formatNumber(team.peakPeople, 0)} / ${formatNumber(team.availablePeople, 0)}`;
}

function dayProductivityLabel(day = {}) {
  const productivity = day.productivity || {};
  if (productivity.percent === undefined && productivity.productivePeople === undefined) return 'Prod.: -';
  return `Prod.: ${formatNumber(productivity.productivePeople)} / ${formatNumber(productivity.availablePeople)} (${formatPercent(productivity.percent)})`;
}

/*
 * Resumo textual dos alertas de estoque do dia.
 *
 * Essa função é usada:
 * - no tooltip do cabeçalho;
 * - no painel lateral do dia;
 * - no resumo das bolinhas de estoque.
 */
function dayStockAlertLabel(
  day = {}
) {
  const alert =
    day?.stockAlert || {};

  const items = [
    [
      'Zerado',
      Number(
        alert.zeroedCount || 0
      )
    ],

    [
      'Crítico',
      Number(
        alert.criticalCount || 0
      )
    ],

    [
      'Atenção',
      Number(
        alert.attentionCount || 0
      )
    ],

    [
      'Abaixo da meta',
      Number(
        alert.belowTargetCount || 0
      )
    ]
  ].filter(
    (
      [
        ,
        count
      ]
    ) =>
      Number.isFinite(count)
      &&
      count > 0
  );

  if (!items.length) {
    return 'Estoque: OK';
  }

  return `Estoque: ${
    items
      .map(
        (
          [
            label,
            count
          ]
        ) =>
          `${label} ${formatNumber(
            count,
            0
          )}`
      )
      .join(' · ')
  }`;
}


function dayHasCapacityWarning(
  day = {}
) {
  const peakPeople =
    Number(
      day?.team?.peakPeople
    );

  const availablePeople =
    Number(
      day?.team?.availablePeople
    );

  const productivityPercent =
    Number(
      day?.productivity?.percent
    );

  return (
    (
      Number.isFinite(
        peakPeople
      )
      &&
      Number.isFinite(
        availablePeople
      )
      &&
      peakPeople
        > availablePeople
    )
    ||
    (
      Number.isFinite(
        productivityPercent
      )
      &&
      productivityPercent > 100
    )
  );
}

function buildDayStockSummary(
  day = {}
) {
  const alert =
    day?.stockAlert || {};

  const summary =
    element(
      'span',
      'gantt-aps__day-stock-summary'
    );

  const items = [
    [
      'zeroed',
      Number(
        alert.zeroedCount || 0
      ),
      'Zerado'
    ],

    [
      'critical',
      Number(
        alert.criticalCount || 0
      ),
      'Crítico'
    ],

    [
      'attention',
      Number(
        alert.attentionCount || 0
      ),
      'Atenção'
    ],

    [
      'below-target',
      Number(
        alert.belowTargetCount || 0
      ),
      'Abaixo da meta'
    ]
  ].filter(
    (
      [
        ,
        count
      ]
    ) =>
      Number.isFinite(count)
      &&
      count > 0
  );

  summary.setAttribute(
    'aria-label',
    dayStockAlertLabel(day)
  );

  summary.title =
    dayStockAlertLabel(day);

  if (!items.length) {
    summary.append(
      element(
        'span',
        'gantt-aps__day-stock-ok',
        'Est. OK'
      )
    );

    return summary;
  }

  items.forEach(
    (
      [
        key,
        count,
        label
      ]
    ) => {
      const item =
        element(
          'span',
          `gantt-aps__day-stock-item gantt-aps__day-stock-item--${key}`
        );

      item.title =
        `${label}: ${formatNumber(
          count,
          0
        )}`;

      item.append(
        element(
          'span',
          'gantt-aps__day-stock-dot'
        ),

        element(
          'strong',
          '',
          formatNumber(
            count,
            0
          )
        )
      );

      summary.append(
        item
      );
    }
  );

  return summary;
}

function dayStatusLabel(day = {}) {
  if (day.isManuallyEnabled === true) return 'Liberado manualmente';
  if (isNonWorkingDay(day)) return 'Dia nao util';
  return 'Dia util';
}

function dayPanelTitle(day = {}) {
  return [
    formatDate(day.date),
    dayStatusLabel(day),
    dayTeamLabel(day),
    dayProductivityLabel(day),
    dayStockAlertLabel(day)
  ].filter(Boolean).join(' | ');
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

function ganttApsVisualBarGeometry(geometry, window, pixelsPerHour, dayWidth, capacityPercent) {
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
  const visualLeft = (startDay - window.startDay) * dayWidth;
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

function ganttApsTransportVisualBarGeometry(
  task = {},
  window = {},
  dayWidth = 0
) {
  const startDay =
    civilDayNumber(
      task?.start?.date
      ?? task?.date
    );

  const endDay =
    civilDayNumber(
      task?.end?.date
      ?? task?.endDate
      ?? task?.start?.date
      ?? task?.date
    );


  if (
    startDay === null
    ||
    endDay === null
    ||
    window?.startDay == null
    ||
    window?.endDay == null
  ) {
    return null;
  }


  /*
   * Para o transporte, o horário
   * 23:58 -> 23:59 existe somente
   * para a REGRA DE ESTOQUE.
   *
   * Visualmente o Gantt trabalha
   * pelas DATAS do transporte.
   */
  const firstDay =
    Math.max(
      startDay,
      window.startDay
    );


  const actualLastDay =
    Math.max(
      endDay,
      startDay
    );


  const lastDay =
    Math.min(
      actualLastDay,
      window.endDay
    );


  if (
    lastDay < firstDay
  ) {
    return null;
  }


  const left =
    (
      firstDay
      - window.startDay
    )
    * dayWidth;


  /*
   * Mesmo dia:
   *
   * 23 -> 23
   * = 1 coluna inteira.
   *
   * Dias diferentes:
   *
   * 23 -> 24
   * = 2 colunas.
   */
  const width =
    (
      lastDay
      - firstDay
      + 1
    )
    * dayWidth;


  const insetGeometry =
    ganttApsApplyBarHorizontalInset(
      left,
      width
    );


  return {
    left:
      insetGeometry.left,

    width:
      insetGeometry.width,

    clipped:
      firstDay !== startDay
      ||
      lastDay !== actualLastDay
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

function buildInspectPanel(
  task,
  machineName
) {
  const panel =
    element(
      'aside',
      'gantt-aps__inspect'
    );

  panel.style.setProperty(
    '--gantt-aps-production-background',
    ganttApsProductionBackground(
      task
    )
  );

  panel.setAttribute(
    'aria-live',
    'polite'
  );

  const heading =
    element(
      'h3',
      '',
      productionColumnLabel(
        task
      )
    );

  const close =
    element(
      'button',
      'gantt-aps__inspect-close',
      '×'
    );

  close.type =
    'button';

  close.dataset.action =
    'close-inspect';

  close.setAttribute(
    'aria-label',
    'Fechar inspeção'
  );

  const header =
    element(
      'div',
      'gantt-aps__inspect-header'
    );

  header.append(
    heading,
    close
  );

  panel.append(
    header
  );

  const productions =
    associatedProductionsLabel(
      task
    );

  const fields = [
    ...(
      productions
        ? [
            [
              'Produções',
              productions
            ]
          ]
        : []
    ),

    [
      'Etapa',
      stageLabel(task)
    ],

    [
      'Material',
      materialLabel(task)
    ],

    [
      'Máquina',
      machineName
    ],

    [
      'Quantidade / Capacidade',
      quantityCapacityLabel(
        task
      )
    ],

    [
      'Pessoas',
      formatNumber(
        task.peopleCount,
        0
      )
    ],

    [
      'Início',
      formatDate(
        task.start?.date
      )
    ],

    [
      'Término',
      formatDate(
        task.end?.date
      )
    ],

    [
      'Duração',
      formatMinutes(
        task.durationMinutes
      )
    ],

    [
      'Capacidade utilizada',
      formatPercent(
        task.capacityPercent
      )
    ],

    [
      'Posição intradiária',
      `${formatPercent(
        task.startCapacityPercent
      )} → ${formatPercent(
        task.endCapacityPercent
      )}`
    ],

    [
      'Allocation ID',
      task.id
    ]
  ];

  const list =
    element(
      'dl',
      'gantt-aps__inspect-fields'
    );

  fields.forEach(
    (
      [
        label,
        value
      ]
    ) => {
      list.append(
        element(
          'dt',
          '',
          label
        ),

        element(
          'dd',
          '',
          value || '—'
        )
      );
    }
  );

  panel.append(
    list
  );

  return panel;
}

function buildDayDetailsPanel(day, { canEditDaySettings = false } = {}) {
  const panel = element('aside', 'gantt-aps__day-details');
  panel.dataset.date = String(day?.date || '');
  panel.setAttribute('aria-live', 'polite');
  const heading = element('h3', '', formatDate(day?.date));
  const close = element('button', 'gantt-aps__inspect-close', 'x');
  close.type = 'button';
  close.dataset.action = 'close-day-details';
  close.setAttribute('aria-label', 'Fechar detalhe do dia');
  const header = element('div', 'gantt-aps__inspect-header');
  header.append(heading, close);
  panel.append(header);

  const fields = [
    ['Status', dayStatusLabel(day)],
    ['Equipe', dayTeamLabel(day).replace(/^Equipe:\s*/, '')],
    ['Produtividade', dayProductivityLabel(day).replace(/^Prod\.\:\s*/, '')],
    ['Estoque', dayStockAlertLabel(day).replace(/^Estoque:\s*/, '')]
  ];
  const list = element('dl', 'gantt-aps__inspect-fields');
  fields.forEach(([label, value]) => {
    list.append(element('dt', '', label), element('dd', '', value || '-'));
  });
  panel.append(list);

  if (
  day?.stockAlert?.count > 0
  &&
  Array.isArray(
    day.stockAlert.items
  )
) {
  const alerts =
    element(
      'div',
      'gantt-aps__day-alerts'
    );

  day.stockAlert.items.forEach(
    item => {
      const key =
        String(
          item?.key
          || 'alert'
        )
          .replace(
            /[^a-z0-9-]/gi,
            '-'
          )
          .toLowerCase();

      const group =
        element(
          'section',
          `gantt-aps__day-alert-group gantt-aps__day-alert-group--${key}`
        );

      const groupHeader =
        element(
          'div',
          'gantt-aps__day-alert-group-header'
        );

      groupHeader.append(
        element(
          'span',
          'gantt-aps__day-alert-dot'
        ),

        element(
          'strong',
          '',
          item.label
          || item.key
          || 'Alerta'
        ),

        element(
          'span',
          'gantt-aps__day-alert-count',
          formatNumber(
            item.count,
            0
          )
        )
      );

      group.append(
        groupHeader
      );

      const materials =
        Array.isArray(
          item?.materials
        )
          ? item.materials.filter(
              Boolean
            )
          : [];

      if (
        materials.length
      ) {
        const materialList =
          element(
            'ul',
            'gantt-aps__day-alert-materials'
          );

        materials.forEach(
          materialName => {
            materialList.append(
              element(
                'li',
                '',
                materialName
              )
            );
          }
        );

        group.append(
          materialList
        );
      }

      alerts.append(
        group
      );
    }
  );

  panel.append(
    alerts
  );
}

  const actions = element('div', 'gantt-aps__inspect-actions');
  const stock = element('button', 'gantt-aps__inspect-close', 'Estoque');
  stock.type = 'button';
  stock.dataset.action = 'open-day-stock';
  stock.dataset.date = String(day?.date || '');
  actions.append(stock);
  if (canEditDaySettings && (isNonWorkingDay(day) || day?.isManuallyEnabled === true)) {
    const toggle = element('button', 'gantt-aps__inspect-close', day?.isManuallyEnabled === true ? 'Voltar ao padrao' : 'Liberar dia');
    toggle.type = 'button';
    toggle.dataset.action = 'toggle-manual-work-date';
    toggle.dataset.date = String(day?.date || '');
    toggle.dataset.enabled = String(day?.isManuallyEnabled !== true);
    actions.append(toggle);
  }
  panel.append(actions);

  if (canEditDaySettings && Array.isArray(day?.team?.shifts) && day.team.shifts.length) {
    const form = element('div', 'gantt-aps__day-team-form');
    day.team.shifts.forEach(shift => {
      const label = element('label', '', `${shift.label || shift.shiftId || 'Turno'} `);
      const input = element('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.required = true;
      input.value = String(Number.isFinite(Number(shift.availablePeople)) ? Number(shift.availablePeople) : 0);
      input.dataset.shiftId = String(shift.shiftId || '');
      label.append(input);
      form.append(label);
    });
    const restore = element('button', 'gantt-aps__inspect-close', 'Restaurar padrão');
    restore.type = 'button';
    restore.dataset.action = 'restore-daily-team';
    restore.dataset.date = String(day?.date || '');
    form.append(restore);
    const save = element('button', 'gantt-aps__inspect-close', 'Salvar equipe');
    save.type = 'button';
    save.dataset.action = 'save-daily-team';
    save.dataset.date = String(day?.date || '');
    form.append(save);
    panel.append(form);
  }
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

export function createGanttApsRenderer({
  onRequestMove,
  onRequestUnallocate,
  onRequestEdit,
  onRequestSplit,
  onRequestTransportAllocation,
  onRequestOpenDay,
  onRequestToggleManualWorkDate,
  onRequestEditDailyTeam,
  onRequestExpandHorizon,
  onRequestDiscardAllChanges,
  onRequestOptimizeUtilization,
  onRequestUndoManualChange,
  onRequestRedoManualChange,
  onRequestPlanningMaterialDrop
} = {}) {
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
  let renderedResourceKey = null;
  let dragState = null;
  let planningMaterialDragState = null;
  const collapsedResources = new Set();
  let collapsedResourcesInitialKey = null;

  const clearFocusTimer = () => {
    if (focusTimer === null) return;
    globalThis.clearTimeout?.(focusTimer);
    focusTimer = null;
  };

  const removeEffects = () => {
    clearFocusTimer();
    planningMaterialDragState = null;
    if (fullscreenListener) {
      document.removeEventListener?.('fullscreenchange', fullscreenListener);
      fullscreenListener = null;
    }
    root?.removeEventListener?.('click', onClick);
    root?.removeEventListener?.('pointerdown', onPointerDown);
    root?.removeEventListener?.('pointermove', onPointerMove);
    root?.removeEventListener?.('pointerup', onPointerUp);
    root?.removeEventListener?.('pointercancel', onPointerCancel);
    root?.removeEventListener?.('dragover', onPlanningMaterialDragOver);
    root?.removeEventListener?.('drop', onPlanningMaterialDrop);
    root?.removeEventListener?.('dragleave', onPlanningMaterialDragLeave);
    root?.removeEventListener?.('gantt-aps:planning-material-start', onPlanningMaterialDragStart);
    root?.removeEventListener?.('gantt-aps:planning-material-end', onPlanningMaterialDragEnd);
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
    root.dataset.manualEdit = String(nextModel.capabilities?.manualMove === true && typeof onRequestEdit === 'function');
    root.dataset.manualSplit = String(nextModel.capabilities?.manualMove === true && typeof onRequestSplit === 'function');
    root.dataset.manualTransport = String(nextModel.capabilities?.manualMove === true && typeof onRequestTransportAllocation === 'function');
    root.dataset.daySettings = String(nextModel.capabilities?.daySettings === true);
    root.dataset.manualDiscard = String(nextModel.capabilities?.manualMove === true && typeof onRequestDiscardAllChanges === 'function');
    root.dataset.optimizeUtilization = 'false';
    root.dataset.manualUndo = String(nextModel.capabilities?.manualMove === true && typeof onRequestUndoManualChange === 'function');
    root.dataset.manualRedo = String(nextModel.capabilities?.manualMove === true && typeof onRequestRedoManualChange === 'function');
    root.setAttribute('aria-label', 'Gantt APS');
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
    root.addEventListener('dragover', onPlanningMaterialDragOver);
    root.addEventListener('drop', onPlanningMaterialDrop);
    root.addEventListener('dragleave', onPlanningMaterialDragLeave);
    root.addEventListener('gantt-aps:planning-material-start', onPlanningMaterialDragStart);
    root.addEventListener('gantt-aps:planning-material-end', onPlanningMaterialDragEnd);
    const stylesheet = element('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./gantt-aps.css', import.meta.url).href;
    root.append(stylesheet);

    const toolbar = element('div', 'gantt-aps__toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Controles de visualização do Gantt');
    const titleGroup = element('div', 'gantt-aps__title');
    titleGroup.append(
      element('strong', '', 'Gantt APS')
    );
    const controls = element('div', 'gantt-aps__controls');
    if (nextModel.capabilities?.manualMove === true && typeof onRequestUndoManualChange === 'function') {
      const undo = element('button', 'gantt-aps__history-action', 'Desfazer');
      undo.type = 'button';
      undo.dataset.action = 'undo-manual-change';
      undo.disabled = nextModel.metadata?.visualState?.canUndoManualChange !== true;
      undo.setAttribute('aria-label', 'Desfazer ultima alteracao manual');
      undo.title = 'Desfazer ultima alteracao manual';
      controls.append(undo);
    }
    if (nextModel.capabilities?.manualMove === true && typeof onRequestRedoManualChange === 'function') {
      const redo = element('button', 'gantt-aps__history-action', 'Refazer');
      redo.type = 'button';
      redo.dataset.action = 'redo-manual-change';
      redo.disabled = nextModel.metadata?.visualState?.canRedoManualChange !== true;
      redo.setAttribute('aria-label', 'Refazer alteracao manual');
      redo.title = 'Refazer alteracao manual';
      controls.append(redo);
    }
    if (nextModel.capabilities?.manualMove === true && typeof onRequestDiscardAllChanges === 'function') {
      const discard = element('button', 'gantt-aps__discard', 'Descartar alterações');
      discard.type = 'button';
      discard.dataset.action = 'discard-all-changes';
      discard.disabled = nextModel.metadata?.visualState?.hasManualChanges !== true;
      discard.setAttribute('aria-label', 'Descartar todas as alterações manuais');
      discard.title = 'Remover todas as edições manuais e restaurar a simulação automática';
      controls.append(discard);
    }
    [7, 15, 30].forEach(dayCount => {
      const expand = element('button', 'gantt-aps__horizon-action', `+${dayCount}d`);
      expand.type = 'button';
      expand.dataset.action = 'expand-horizon';
      expand.dataset.days = String(dayCount);
      expand.setAttribute('aria-label', `Exibir mais ${dayCount} dias`);
      expand.title = `Exibir mais ${dayCount} dias`;
      controls.append(expand);
    });
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

    const tasks = Array.isArray(nextModel.tasks) ? nextModel.tasks : [];
const resources = orderGanttApsResources(nextModel);

const normalizeResourceName = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[\s-]+/g, '');

const extractResourceByName =
  normalizedName => {

    const index =
      resources.findIndex(
        resource => [
          resource?.name,
          resource?.machineName,
          resource?.machine_name,
          resource?.id,
          resource?.machineId,
          resource?.machine_id
        ].some(
          value =>
            normalizeResourceName(value)
            === normalizedName
        )
      );

    if (index < 0) {
      return null;
    }

    const [resource] =
      resources.splice(
        index,
        1
      );

    return resource;
  };


const trefila =
  extractResourceByName(
    'trefila'
  )
  || {
    id: 'Trefila',
    name: 'Trefila',
    order: -2
  };


const transporte =
  extractResourceByName(
    'transporte'
  )
  || {
    id: 'Transporte',
    name: 'Transporte',
    order: -1
  };


resources.unshift(
  {
    ...transporte,
    id:
      transporte.id
      || 'Transporte',
    name:
      'Transporte'
  }
);


resources.unshift(
  {
    ...trefila,
    id:
      trefila.id
      || 'Trefila',
    name:
      'Trefila'
  }
);

const resourceKey = resources.map(resource => String(resource.id)).join('\u0000');
    if (renderedResourceKey !== null && renderedResourceKey !== resourceKey) {
      scrollTop = 0;
    }
    renderedResourceKey = resourceKey;
    if (
  nextModel.metadata?.visualState
    ?.groupsCollapsedByDefault === true
  &&
  collapsedResourcesInitialKey
    !== resourceKey
) {
  collapsedResources.clear();

  resources.forEach(
    resource =>
      collapsedResources.add(
        String(resource.id)
      )
  );

  collapsedResourcesInitialKey =
    resourceKey;

} else if (
  nextModel.metadata?.visualState
    ?.groupsCollapsedByDefault !== true
) {
  collapsedResourcesInitialKey =
    null;
}


/*
 * Máquinas que possuem produção alocada
 * devem permanecer abertas.
 *
 * Máquinas sem produção continuam
 * recolhidas.
 */
const resourcesWithAllocatedProduction =
  new Set(
    tasks
      .map(
        task =>
          String(
            task?.resourceId ?? ''
          )
      )
      .filter(Boolean)
  );


resourcesWithAllocatedProduction.forEach(
  resourceId => {
    collapsedResources.delete(
      resourceId
    );
  }
);
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
    ['M\u00c1QUINA', 'Produção', 'Material', 'Quantidade / Capacidade', 'Pessoas', 'Capacidade utilizada']
      .forEach((label, index) => {
        const cell = element('div', 'gantt-aps__cell', label);
        cell.setAttribute('role', 'columnheader');
        if (index === 5) {
          cell.classList.add('gantt-aps__cell--capacity-used');
          cell.textContent = '';
          cell.append(
            element('span', '', 'CAPACIDADE'),
            element('span', '', 'UTILIZADA')
          );
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
      dayHeader.dataset.action = 'open-day-details';
      dayHeader.tabIndex = 0;
      dayHeader.setAttribute('role', 'button');
      dayHeader.title = dayPanelTitle(day);
      dayHeader.setAttribute('aria-label', dayPanelTitle(day));
      const titleLine =
  element(
    'span',
    'gantt-aps__day-title-line'
  );

titleLine.append(
  element(
    'strong',
    '',
    presentation.dateLabel
  )
);

if (
  dayHasCapacityWarning(
    day
  )
) {
  const warning =
    element(
      'span',
      'gantt-aps__capacity-warning',
      '!'
    );

  warning.title =
    'Equipe acima do disponível ou produtividade acima de 100%';

  warning.setAttribute(
    'aria-label',
    warning.title
  );

  titleLine.append(
    warning
  );
}

dayHeader.append(
  titleLine,

  element(
    'span',
    '',
    presentation.secondaryLabel
  )
);

const metrics =
  element(
    'span',
    'gantt-aps__day-metrics'
  );

metrics.append(
  element(
    'span',
    'gantt-aps__day-team',
    dayTeamLabel(
      day
    ).replace(
      /^Equipe:\s*/,
      'Eq. '
    )
  ),

  element(
    'span',
    'gantt-aps__day-productivity',
    dayProductivityLabel(
      day
    ).replace(
      /^Prod\.\:\s*/,
      'Prod. '
    )
  ),

  buildDayStockSummary(
    day
  )
);

dayHeader.append(
  metrics
);
      timelineHeader.append(dayHeader);
    });
    header.append(tableHeader, timelineHeader);
    viewport.append(header);

    rowPages[rowPage].forEach(segment => {
      const { resource, continuation } = segment;
      const resourceId = String(resource.id);
      const totalResourceTasks = tasks.filter(task => String(task.resourceId ?? '') === resourceId).length;
      const groupRow =
  element(
    'div',
    'gantt-aps__row gantt-aps__row--group'
  );

groupRow.dataset.resourceId =
  resourceId;

const isTransportResource =
  normalizeResourceName(
    resource?.name
    || resource?.machineName
    || resource?.machine_name
    || resourceId
  )
  === 'transporte';

if (isTransportResource) {
  groupRow.dataset.transportResource =
    'true';
}
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
        element(
  'span',
  '',
  isTransportResource

    ? (
        totalResourceTasks
          ? `${totalResourceTasks} transporte(s)`
          : 'Sem transporte'
      )

    : (
        totalResourceTasks
          ? `${totalResourceTasks} alocação(ões)`
          : 'Sem produção'
      )
)
      );
      groupTable.append(toggle);
      const groupTimeline = element('div', 'gantt-aps__timeline gantt-aps__group-timeline');
      groupTimeline.dataset.resourceId = resourceId;
      window.days.forEach((day, dayIndex) => {
        const dropCell = element('span', 'gantt-aps__drop-cell');
        dropCell.dataset.date = day.date;
        dropCell.dataset.resourceId = resourceId;
        dropCell.style.left = `${dayIndex * dayWidth}px`;
        dropCell.style.width = `${dayWidth}px`;
        groupTimeline.append(dropCell);
      });
      groupRow.append(groupTable, groupTimeline);
      viewport.append(groupRow);

      if (collapsedResources.has(resourceId)) return;
            buildGanttApsProductionTotalBlocks(segment.tasks).forEach(totalRow => {
        const { task } = totalRow;


        /*
         * Precisamos saber se é transporte
         * ANTES de calcular a geometria visual.
         */
        const isTransportAllocation =
          task?.scheduleType === 'transport'
          ||
          Boolean(
            task?.transportId
          );


        /*
         * A geometria REAL continua existindo.
         *
         * Ela continua usando 23:58 -> 23:59
         * e serve para todas as regras normais.
         */
        const geometry =
          taskGeometry(
            task,
            window,
            pixelsPerHour
          );


        if (!geometry) {
          return;
        }


        /*
         * TRANSPORTE:
         * visual baseado nas DATAS.
         *
         * PRODUÇÃO:
         * continua exatamente como antes,
         * baseada em hora/capacidade.
         */
        const visualBar =
          isTransportAllocation

            ? ganttApsTransportVisualBarGeometry(
                task,
                window,
                dayWidth
              )

            : ganttApsVisualBarGeometry(
                geometry,
                window,
                pixelsPerHour,
                dayWidth,
                task.capacityPercent
              );


        if (!visualBar) {
          return;
        }


        const row =
  element(
    'div',
    'gantt-aps__row gantt-aps__row--allocation'
  );

row.dataset.allocationId =
  String(task.id);

row.dataset.resourceId =
  resourceId;


if (isTransportAllocation) {
  row.dataset.transportAllocation =
    'true';
}
        row.setAttribute('role', 'row');
        row.setAttribute('aria-level', '2');
        const table = element('div', 'gantt-aps__table gantt-aps__allocation-table');
        const values = [
          '',
          productionColumnLabel(task),
          materialLabel(task),
          quantityCapacityLabel(task),
          formatPeople(task.peopleCount),
          formatPercent(task.capacityPercent)
        ];
        values.forEach((value, index) => {
          const cell = element('div', `gantt-aps__cell gantt-aps__cell--${index + 1}`, index === 1 ? undefined : value);
          cell.setAttribute('role', 'gridcell');
          cell.title = value;
          if (index === 2 || index === 3) cell.setAttribute('aria-label', value);
          if (index === 1) {
            const productions = ganttApsProductionVisuals(task);
            cell.dataset.productionCount = String(Math.max(1, productions.length));
            cell.style.setProperty('--gantt-aps-production-background', ganttApsProductionBackground(task));
            cell.append(element('span', 'gantt-aps__production-label', value));
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
        const canDragTask =
  nextModel.capabilities?.manualMove === true
  &&
  (
    task.persistable !== false
    ||
    task?.scheduleType === 'transport'
    ||
    Boolean(task?.transportId)
  );

bar.dataset.draggable =
  String(canDragTask);
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
    root
      ?.querySelectorAll?.(
        '.gantt-aps__drop-cell[data-drag-target], .gantt-aps__drop-cell[data-drag-invalid]'
      )
      .forEach(cell => {
        delete cell.dataset.dragTarget;
        delete cell.dataset.dragInvalid;
      });

    root
      ?.querySelectorAll?.(
        '.gantt-aps__bar[data-dragging="true"]'
      )
      .forEach(bar => {
        delete bar.dataset.dragging;
      });

    /*
     * Limpa o destaque visual da área
     * "Materiais a programar".
     */
    document
      .querySelectorAll?.(
        '[data-planning-unallocation-target="true"][data-gantt-unallocation-active]'
      )
      .forEach(target => {
        delete target.dataset
          .ganttUnallocationActive;

        target.style.removeProperty(
          'outline'
        );

        target.style.removeProperty(
          'outline-offset'
        );

        target.style.removeProperty(
          'box-shadow'
        );
      });
  };

  const clearPlanningMaterialDragPresentation = () => {
    root?.querySelectorAll?.('.gantt-aps__drop-cell[data-planning-material-compatible], .gantt-aps__drop-cell[data-planning-material-invalid], .gantt-aps__drop-cell[data-planning-material-target], .gantt-aps__row[data-planning-material-compatible], .gantt-aps__row[data-planning-material-invalid]')
      .forEach(node => {
        delete node.dataset.planningMaterialCompatible;
        delete node.dataset.planningMaterialInvalid;
        delete node.dataset.planningMaterialTarget;
      });
    if (root) delete root.dataset.planningMaterialDrag;
  };

  const rowDestinationFromEvent = (event, fallbackRow = null) => {
    const pointed = document.elementFromPoint?.(event.clientX, event.clientY) || event.target;
    const row = pointed?.closest?.('.gantt-aps__row--allocation')
      || pointed?.closest?.('.gantt-aps__row--group')
      || fallbackRow;
    const resourceId = String(row?.dataset?.resourceId ?? '');
    const lane = row?.querySelector?.('.gantt-aps__lane')
      || row?.querySelector?.('.gantt-aps__group-timeline');
    const window = buildGanttApsWindow(model);
    if (!resourceId || !lane || !window.days.length) return { valid: false, resourceId, date: null };
    const rect = lane.getBoundingClientRect?.() || { left: 0 };
    const viewport = root?.querySelector?.('.gantt-aps__viewport');
    const offsetX = Number(event.clientX || 0) - Number(rect.left || 0) + Number(viewport?.scrollLeft || 0);
    const dayIndex = Math.floor(offsetX / (24 * pixelsPerHour));
    const day = window.days[dayIndex];
    if (!day?.date) return { valid: false, resourceId, date: null };
    return { valid: true, resourceId, date: day.date };
  };

    const unallocationTargetFromEvent =
    event => {
      if (
        typeof onRequestUnallocate
        !== 'function'
      ) {
        return null;
      }

      /*
       * Mesmo com pointer capture,
       * elementFromPoint informa o elemento
       * visual que está realmente sob o mouse.
       */
      const pointed =
        document.elementFromPoint?.(
          event.clientX,
          event.clientY
        )
        || event.target;

      return pointed
        ?.closest?.(
          '[data-planning-unallocation-target="true"]'
        )
        || null;
    };


  const dragDestinationFromEvent =
    event => {
      if (!dragState) {
        return null;
      }

      /*
       * Primeiro testamos o destino externo:
       * Materiais a programar.
       */
      const unallocationTarget =
        unallocationTargetFromEvent(
          event
        );

      if (unallocationTarget) {
        return {
          valid: true,

          kind:
            'unallocate',

          target:
            unallocationTarget,

          resourceId:
            dragState.resourceId,

          date:
            null
        };
      }

      /*
 * Transporte manual pode voltar para
 * "Materiais a programar", mas NÃO
 * pode ser movimentado como produção.
 */
if (
  dragState?.task?.scheduleType === 'transport'
  ||
  dragState?.task?.transportId
) {
  return {
    valid: false,

    kind:
      'move',

    resourceId:
      dragState.resourceId,

    date:
      null
  };
}


/*
 * Não está nos cards:
 * continua sendo o MOVE normal.
 */
const destination =
  rowDestinationFromEvent(
    event,
    dragState.row
  );

      const resourceId =
        String(
          destination?.resourceId
          ?? ''
        );

      if (
        resourceId
        !== dragState.resourceId
      ) {
        return {
          valid: false,

          kind:
            'move',

          resourceId,

          date:
            null
        };
      }

      return {
        ...destination,

        kind:
          'move'
      };
    };

    const updateDragPresentation =
    destination => {
      clearDragPresentation();

      dragState
        ?.bar
        ?.setAttribute?.(
          'data-dragging',
          'true'
        );

      /*
       * Estamos sobre
       * "Materiais a programar".
       */
      if (
        destination?.kind
          === 'unallocate'
        && destination?.target
      ) {
        destination.target.dataset
          .ganttUnallocationActive =
            'true';

        destination.target.style.outline =
          '2px dashed var(--primary-color, #2563eb)';

        destination.target.style
          .outlineOffset =
            '4px';

        destination.target.style
          .boxShadow =
            '0 0 0 4px rgba(37, 99, 235, 0.08)';

        return;
      }

      /*
       * Daqui para baixo é o MOVE
       * tradicional dentro do Gantt.
       */
      if (
        !destination?.date
        && destination?.valid !== false
      ) {
        return;
      }

      if (
        destination?.valid === false
      ) {
        dragState
          ?.row
          ?.querySelectorAll?.(
            '.gantt-aps__drop-cell'
          )
          .forEach(cell => {
            cell.dataset.dragInvalid =
              'true';
          });

        return;
      }

      const selector =
        `.gantt-aps__drop-cell[data-resource-id="${
          String(
            destination.resourceId
          ).replaceAll('"', '\\"')
        }"][data-date="${
          String(
            destination.date
          ).replaceAll('"', '\\"')
        }"]`;

      root
        ?.querySelector?.(
          selector
        )
        ?.setAttribute(
          'data-drag-target',
          'true'
        );
    };

   const finishDrag = (
    event,
    { cancelled = false } = {}
  ) => {
    if (!dragState) {
      return;
    }

    const state =
      dragState;

    const destination =
      !cancelled
        ? dragDestinationFromEvent(
            event
          )
        : null;

    clearDragPresentation();

    dragState =
      null;

    state.bar
      ?.releasePointerCapture?.(
        state.pointerId
      );

    if (
      cancelled
      || !destination?.valid
    ) {
      return;
    }

    /*
     * NOVO:
     *
     * Gantt → Materiais a programar
     */
    if (
      destination.kind
        === 'unallocate'
      && typeof onRequestUnallocate
        === 'function'
    ) {
      onRequestUnallocate({
        allocationId:
          state.task.id,

        task:
          state.task,

        source:
          'gantt-drag'
      });

      return;
    }

    /*
     * EXISTENTE:
     *
     * Gantt → outro dia
     */
    if (
      destination.date
      && destination.date
        !== state.sourceDate
      && typeof onRequestMove
        === 'function'
    ) {
      onRequestMove(
        taskMoveIntent(
          state.task,
          destination.date,
          state.resourceId
        )
      );
    }
  };

    const onPointerDown = event => {
    if (
      model?.capabilities
        ?.manualMove !== true

      || (
        typeof onRequestMove
          !== 'function'

        && typeof onRequestUnallocate
          !== 'function'
      )
    ) {
      return;
    }
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

  const planningMaterialDestinationFromEvent = event => {
    if (!planningMaterialDragState) return null;
    const destination = rowDestinationFromEvent(event);
    const compatible = planningMaterialDragState.compatibleMachineIds.has(String(destination?.resourceId ?? ''));
    return {
      ...destination,
      valid: destination?.valid === true && compatible,
      compatible
    };
  };

  const updatePlanningMaterialDragPresentation = destination => {
    clearPlanningMaterialDragPresentation();
    if (!planningMaterialDragState || !root) return;
    root.dataset.planningMaterialDrag = 'true';
    root.querySelectorAll?.('.gantt-aps__row[data-resource-id]').forEach(row => {
      const compatible = planningMaterialDragState.compatibleMachineIds.has(String(row.dataset.resourceId ?? ''));
      row.dataset[compatible ? 'planningMaterialCompatible' : 'planningMaterialInvalid'] = 'true';
    });
    root.querySelectorAll?.('.gantt-aps__drop-cell[data-resource-id]').forEach(cell => {
      const compatible = planningMaterialDragState.compatibleMachineIds.has(String(cell.dataset.resourceId ?? ''));
      cell.dataset[compatible ? 'planningMaterialCompatible' : 'planningMaterialInvalid'] = 'true';
    });
    if (!destination?.date) return;
    const selector = `.gantt-aps__drop-cell[data-resource-id="${String(destination.resourceId).replaceAll('"', '\\"')}"][data-date="${String(destination.date).replaceAll('"', '\\"')}"]`;
    const targetCell = root.querySelector?.(selector);
    if (targetCell) {
      targetCell.dataset.planningMaterialTarget = destination.valid ? 'true' : 'invalid';
    }
  };

  const onPlanningMaterialDragStart = event => {
    const compatibleMachineIds = new Set((event.detail?.compatibleMachineIds || []).map(String));
    planningMaterialDragState = {
      material: event.detail?.material || null,
      compatibleMachineIds
    };
    updatePlanningMaterialDragPresentation(null);
  };

  const onPlanningMaterialDragEnd = () => {
    planningMaterialDragState = null;
    clearPlanningMaterialDragPresentation();
  };

  const onPlanningMaterialDragOver = event => {
    if (!planningMaterialDragState) return;
    const destination = planningMaterialDestinationFromEvent(event);
    updatePlanningMaterialDragPresentation(destination);
    if (event.dataTransfer) event.dataTransfer.dropEffect = destination?.valid ? 'copy' : 'none';
    if (destination?.valid) event.preventDefault?.();
  };

  const onPlanningMaterialDrop = event => {
    if (!planningMaterialDragState) return;
    const state = planningMaterialDragState;
    const destination = planningMaterialDestinationFromEvent(event);
    event.preventDefault?.();
    planningMaterialDragState = null;
    clearPlanningMaterialDragPresentation();
    if (!destination?.valid || !destination.date || typeof onRequestPlanningMaterialDrop !== 'function') return;
    const resource = (model?.resources || []).find(item => String(item.id) === String(destination.resourceId));
    onRequestPlanningMaterialDrop({
      type: 'PLANNING_MATERIAL_DROP_PREVIEW',
      material: state.material,
      to: {
        date: destination.date,
        machineId: destination.resourceId,
        machineName: resource?.name || destination.resourceId
      },
      source: 'materials-to-schedule-drag'
    });
  };

  const onPlanningMaterialDragLeave = event => {
    if (!planningMaterialDragState || event.target !== root) return;
    updatePlanningMaterialDragPresentation(null);
  };

  const inspect = allocationId => {
    if (!root) return false;
    const task = getTaskById(model, allocationId);
    if (!task) return false;
    const resource = (model.resources || []).find(item => String(item.id) === String(task.resourceId));
    root.querySelector?.('.gantt-aps__inspect')?.remove();
    root.querySelector
  ?.('.gantt-aps__day-details')
  ?.remove();
    root.querySelectorAll?.('.gantt-aps__bar').forEach(bar => {
      bar.dataset.selected = String(bar.dataset.allocationId === String(task.id));
    });
    selectedAllocationId = String(task.id);
    const canEdit = model?.capabilities?.manualMove === true
      && task.persistable !== false
      && typeof onRequestEdit === 'function';
    const canSplit = model?.capabilities?.manualMove === true
      && task.persistable !== false
      && typeof onRequestSplit === 'function';
    const canTransport = model?.capabilities?.manualMove === true
      && task.persistable !== false
      && typeof onRequestTransportAllocation === 'function';
        const panel =
      buildInspectPanel(
        task,
        resource?.name
        || task.machineName
        || task.resourceId
        || '—'
      );

    root.append(
      panel
    );

    requestAnimationFrame(
      () => {
        panel.scrollIntoView?.({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    );

    return true;
  };

  const openDayDetails = date => {
    const day = (model?.calendar?.days || []).find(item => String(item.date) === String(date));
    if (!day) return false;
    root?.querySelector?.('.gantt-aps__day-details')?.remove();
    root
  ?.querySelector
  ?.('.gantt-aps__inspect')
  ?.remove();
        const panel =
      buildDayDetailsPanel(
        day,
        {
          canEditDaySettings:
            model?.capabilities
              ?.daySettings === true
        }
      );

    root?.append(
      panel
    );

    requestAnimationFrame(
      () => {
        panel.scrollIntoView?.({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    );

    return true;
  };

  const onClick = event => {
    const actionNode = event.target?.closest?.('[data-action]');
    const action = actionNode?.dataset?.action;
    if (action === 'close-inspect') {
      root?.querySelector?.('.gantt-aps__inspect')?.remove();
      return;
    }
    if (action === 'close-day-details') {
      root?.querySelector?.('.gantt-aps__day-details')?.remove();
      return;
    }
    if (action === 'open-day-details') {
      openDayDetails(actionNode?.dataset?.date);
      return;
    }
    if (action === 'open-day-stock') {
      if (typeof onRequestOpenDay === 'function') onRequestOpenDay(actionNode?.dataset?.date);
      return;
    }
    if (action === 'toggle-manual-work-date') {
      if (
        model?.capabilities?.daySettings !== true
        || typeof onRequestToggleManualWorkDate !== 'function'
      ) return;
      onRequestToggleManualWorkDate({
        date: actionNode?.dataset?.date,
        enabled: actionNode?.dataset?.enabled === 'true'
      });
      return;
    }
    if (action === 'restore-daily-team') {
      if (
        model?.capabilities?.daySettings !== true
        || typeof onRequestEditDailyTeam !== 'function'
      ) return;
      const day = (Array.isArray(model?.calendar?.days) ? model.calendar.days : [])
        .find(item => String(item?.date || '') === String(actionNode?.dataset?.date || ''));
      if (!Array.isArray(day?.team?.shifts) || !day.team.shifts.length) return;
      const overrides = {};
      day.team.shifts.forEach(shift => {
        overrides[String(shift.shiftId || '')] = null;
      });
      onRequestEditDailyTeam({
        date: actionNode?.dataset?.date,
        overrides,
        restore: true,
        invalid: false
      });
      return;
    }
    if (action === 'save-daily-team') {
      if (
        model?.capabilities?.daySettings !== true
        || typeof onRequestEditDailyTeam !== 'function'
      ) return;
      const panel = actionNode?.closest?.('.gantt-aps__day-details');
      const overrides = {};
      let invalid = false;
      panel?.querySelectorAll?.('input[data-shift-id]').forEach(input => {
        const raw = String(input.value ?? '').trim();
        const value = Number(raw);
        if (
          !raw
          || !input.checkValidity?.()
          || !Number.isInteger(value)
          || value < 0
        ) {
          invalid = true;
        }
        overrides[input.dataset.shiftId] = value;
      });
      onRequestEditDailyTeam({
        date: actionNode?.dataset?.date,
        overrides: invalid ? null : overrides,
        invalid
      });
      return;
    }
    if (action === 'edit-allocation' || action === 'split-allocation' || action === 'transport-allocation') {
      const task = getTaskById(model, actionNode?.dataset?.allocationId);
      if (
        !task
        || task.persistable === false
        || model?.capabilities?.manualMove !== true
      ) return;
      if (action === 'edit-allocation' && typeof onRequestEdit === 'function') {
        onRequestEdit(task);
      }
      if (action === 'split-allocation' && typeof onRequestSplit === 'function') {
        onRequestSplit(task);
      }
      if (action === 'transport-allocation' && typeof onRequestTransportAllocation === 'function') {
        onRequestTransportAllocation(task);
      }
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
    if (action === 'expand-horizon') {
      if (typeof onRequestExpandHorizon === 'function') {
        onRequestExpandHorizon({ days: Number(actionNode?.dataset?.days) });
      }
      return;
    }
    if (action === 'optimize-utilization') {
      if (
        actionNode?.disabled
        || model?.capabilities?.manualMove !== true
        || typeof onRequestOptimizeUtilization !== 'function'
      ) return;
      onRequestOptimizeUtilization();
      return;
    }
    if (action === 'discard-all-changes') {
      if (
        actionNode?.disabled
        || model?.capabilities?.manualMove !== true
        || model?.metadata?.visualState?.hasManualChanges !== true
        || typeof onRequestDiscardAllChanges !== 'function'
      ) return;
      onRequestDiscardAllChanges();
      return;
    }
    if (action === 'undo-manual-change') {
      if (
        actionNode?.disabled
        || model?.capabilities?.manualMove !== true
        || model?.metadata?.visualState?.canUndoManualChange !== true
        || typeof onRequestUndoManualChange !== 'function'
      ) return;
      onRequestUndoManualChange();
      return;
    }
    if (action === 'redo-manual-change') {
      if (
        actionNode?.disabled
        || model?.capabilities?.manualMove !== true
        || model?.metadata?.visualState?.canRedoManualChange !== true
        || typeof onRequestRedoManualChange !== 'function'
      ) return;
      onRequestRedoManualChange();
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

    focusAllocation(allocationId, {
  inspectPanel = true,
  scrollToAllocation = true
} = {}) {
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

if (inspectPanel && !inspect(allocationId)) return false;

if (!scrollToAllocation) return true;

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
      renderedResourceKey = null;
      collapsedResources.clear();
      collapsedResourcesInitialKey = null;
    }
  };
}
