import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildGanttApsWindow,
  civilDayNumber,
  GANTT_APS_MAX_VISIBLE_DAYS,
  orderGanttApsTasks,
  orderGanttApsResources,
  stackGanttApsTasks,
  taskGeometry,
  taskMinuteRange,
  timeMinutes
} from '../shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js';
import {
  buildGanttApsProductionTotalBlocks,
  createGanttApsRenderer,
  ganttApsDayHeaderPresentation,
  ganttApsProductionBackground,
  ganttApsProductionVisuals,
  GANTT_APS_ROWS_PER_PAGE,
  GANTT_APS_RESOURCES_PER_PAGE,
  GANTT_APS_TASKS_PER_RESOURCE_PAGE,
  GANTT_APS_UNPLACED_TASKS_PER_PAGE
} from '../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js';

assert.equal(civilDayNumber('2026-07-24') + 1, civilDayNumber('2026-07-25'));
assert.equal(civilDayNumber('2026-02-29'), null);
assert.equal(timeMinutes('23:30'), 1410);
assert.equal(timeMinutes('25:00'), null);

const overnight = {
  id: 'allocation:night:1',
  resourceId: 'machine-1',
  start: { date: '2026-07-24', time: '22:00' },
  end: { date: '2026-07-25', time: '02:00' },
  durationMinutes: 240
};
assert.deepEqual(taskMinuteRange(overnight), {
  start: (civilDayNumber('2026-07-24') * 1440) + 1320,
  end: (civilDayNumber('2026-07-25') * 1440) + 120,
  durationMinutes: 240
});

const model = {
  calendar: {
    days: [
      { date: '2026-07-24', isWorkingDay: true },
      { date: '2026-07-25', isWorkingDay: false }
    ]
  },
  resources: [
    { id: 'machine-2', name: 'Máquina 2', order: 2 },
    { id: 'machine-1', name: 'Máquina 1', order: 1 },
    { id: 'machine-empty', name: 'Máquina vazia', order: 3 }
  ],
  tasks: [
    overnight,
    {
      id: 'readonly:special:id[]',
      resourceId: 'machine-1',
      start: { date: '2026-07-24', time: '23:00' },
      end: { date: '2026-07-25', time: '01:00' }
    }
  ]
};
const before = structuredClone(model);
const orderedResources = orderGanttApsResources(model);
assert.deepEqual(
  orderedResources.map(resource => resource.id),
  ['machine-1', 'machine-2', 'machine-empty'],
  'ordem canônica e máquinas vazias devem ser preservadas'
);
const canonicalMachineResources = [
  { id: 'focus8-id', name: 'Focus-8', order: 1 },
  { id: 'mt100-id', name: 'MT-100', order: 2 },
  { id: 'ec60-id', name: 'EC-60', order: 3 },
  { id: 'empty-aco8-id', name: 'Aço-8', order: 4 },
  { id: 'trefila-id', name: 'Trefila', order: 5 },
  { id: 'mt150-id', name: 'MT-150', order: 6 },
  { id: 'ec125-id', name: 'EC-125', order: 7 },
  { id: 'mt200-id', name: 'MT-200', order: 8 }
];
const canonicallyOrderedResources = orderGanttApsResources({
  resources: canonicalMachineResources,
  tasks: canonicalMachineResources
    .filter(resource => resource.id !== 'empty-aco8-id')
    .map(resource => ({ id: `allocation:${resource.id}`, resourceId: resource.id }))
});
assert.deepEqual(
  canonicallyOrderedResources.map(resource => resource.name),
  ['Trefila', 'EC-125', 'EC-60', 'Aço-8', 'Focus-8', 'MT-200', 'MT-150', 'MT-100'],
  'Gantt APS deve reutilizar exatamente a ordem canônica do Calendário V2'
);
assert.deepEqual(
  canonicallyOrderedResources.map(resource => resource.id),
  ['trefila-id', 'ec125-id', 'ec60-id', 'empty-aco8-id', 'focus8-id', 'mt200-id', 'mt150-id', 'mt100-id'],
  'ordenação deve preservar IDs e a máquina vazia'
);
const window = buildGanttApsWindow(model);
assert.equal(window.days.length, 2);
assert.equal(window.days[1].date, '2026-07-25');
const geometry = taskGeometry(overnight, window, 60);
assert.equal(geometry.left, 22 * 60);
assert.equal(geometry.width, 4 * 60);
assert.deepEqual(model, before, 'geometria readonly não pode alterar o view model');

const stacked = stackGanttApsTasks(model.tasks);
assert.equal(stacked.length, model.tasks.length);
assert.equal(stacked[0].track, 0);
assert.equal(stacked[1].track, 1, 'barras sobrepostas devem ocupar trilhas distintas');
assert.equal(stacked[1].task.id, 'readonly:special:id[]', 'ID canônico deve ser preservado');
assert.deepEqual(
  orderGanttApsTasks([
    { id: 'b', sequence: 2, start: { date: '2026-07-24', time: '08:00' }, end: { date: '2026-07-24', time: '09:00' } },
    { id: 'a', sequence: 1, start: { date: '2026-07-24', time: '08:00' }, end: { date: '2026-07-24', time: '09:00' } }
  ]).map(task => task.id),
  ['a', 'b'],
  'ordenação deve usar início civil, sequence e allocationId'
);
assert.deepEqual(
  orderGanttApsTasks([
    { id: 'missing-null', sequence: null, start: { date: '2026-07-24', time: '08:00' }, end: { date: '2026-07-24', time: '09:00' } },
    { id: 'missing-empty', sequence: '', start: { date: '2026-07-24', time: '08:00' }, end: { date: '2026-07-24', time: '09:00' } },
    { id: 'sequenced', sequence: 1, start: { date: '2026-07-24', time: '08:00' }, end: { date: '2026-07-24', time: '09:00' } }
  ]).map(task => task.id),
  ['sequenced', 'missing-empty', 'missing-null'],
  'sequence ausente não pode virar zero'
);

const productionTotalTasks = orderGanttApsTasks([
  {
    id: 'split:p1:2',
    resourceId: 'machine-total',
    productionId: 'production-1',
    productionIndex: 0,
    sequence: 2,
    quantity: 489.04,
    unit: 'kg',
    split: { splitRootAllocationId: 'split:p1', splitPartId: '2' },
    start: { date: '2026-07-24', time: '09:00' },
    end: { date: '2026-07-24', time: '10:00' }
  },
  {
    id: 'readonly:p3:[special]',
    resourceId: 'machine-total',
    productionId: 'production-3',
    productionIndex: 2,
    productionColor: '#333333',
    productionMemberships: [
      { productionId: 'production-1', productionIndex: 0, productionTitle: 'Produção 1', productionColor: '#111111' },
      { productionId: 'production-3', productionIndex: 2, productionTitle: 'Produção 3', productionColor: '#333333' }
    ],
    quantity: 2178,
    unit: 'un',
    start: { date: '2026-07-24', time: '11:00' },
    end: { date: '2026-07-24', time: '12:00' }
  },
  {
    id: 'allocation:p2',
    resourceId: 'machine-total',
    productionId: 'production-2',
    productionIndex: 1,
    quantity: 940,
    unit: 'kg',
    productionMemberships: [
      { productionId: 'production-2', productionIndex: 1, productionTitle: 'Produção 2' },
      { productionId: 'production-3', productionIndex: 2, productionTitle: 'Produção 3' },
      { productionId: 'production-4', productionIndex: 3, productionTitle: 'Produção 4' }
    ],
    start: { date: '2026-07-24', time: '10:00' },
    end: { date: '2026-07-24', time: '11:00' }
  },
  {
    id: 'split:p1:1',
    resourceId: 'machine-total',
    productionId: 'production-1',
    productionIndex: 0,
    productionColor: '#111111',
    productionMemberships: [
      { productionId: 'production-1', productionIndex: 0, productionTitle: 'Produção 1', productionColor: '#111111' },
      { productionId: 'production-3', productionIndex: 2, productionTitle: 'Produção 3', productionColor: '#333333' }
    ],
    sequence: 1,
    quantity: 7000,
    unit: 'kg',
    materialName: '4,2 Transversal - 2m',
    split: { splitRootAllocationId: 'split:p1', splitPartId: '1' },
    start: { date: '2026-07-24', time: '08:00' },
    end: { date: '2026-07-24', time: '09:00' },
    capacityPercent: 100
  },
  {
    id: 'allocation:p3:second',
    resourceId: 'machine-total',
    productionId: 'production-3',
    productionIndex: 2,
    quantity: 932.25,
    unit: 'un',
    start: { date: '2026-07-24', time: '12:00' },
    end: { date: '2026-07-24', time: '13:00' }
  },
  {
    id: 'allocation:p1:unit',
    resourceId: 'machine-total',
    productionId: 'production-1',
    productionIndex: 0,
    quantity: 3,
    unit: 'un',
    start: { date: '2026-07-24', time: '10:00' },
    end: { date: '2026-07-24', time: '11:00' }
  },
  {
    id: 'split:p4:1',
    resourceId: 'machine-total',
    productionId: 'production-4',
    productionIndex: 3,
    sequence: 1,
    quantity: 0.1,
    unit: 'kg',
    split: { splitRootAllocationId: 'split:p4', splitPartId: '1' },
    start: { date: '2026-07-24', time: '13:00' },
    end: { date: '2026-07-24', time: '14:00' }
  },
  {
    id: 'split:p4:2',
    resourceId: 'machine-total',
    productionId: 'production-4',
    productionIndex: 3,
    sequence: 2,
    quantity: 0.2,
    unit: 'kg',
    split: { splitRootAllocationId: 'split:p4', splitPartId: '2' },
    start: { date: '2026-07-24', time: '14:00' },
    end: { date: '2026-07-24', time: '15:00' }
  },
  {
    id: 'allocation:p4:3',
    resourceId: 'machine-total',
    productionId: 'production-4',
    productionIndex: 3,
    sequence: 3,
    quantity: 0.3,
    unit: 'kg',
    start: { date: '2026-07-24', time: '15:00' },
    end: { date: '2026-07-24', time: '16:00' }
  }
]);
assert.deepEqual(
  productionTotalTasks.map(task => task.id),
  [
    'split:p1:1',
    'split:p1:2',
    'allocation:p1:unit',
    'allocation:p2',
    'readonly:p3:[special]',
    'allocation:p3:second',
    'split:p4:1',
    'split:p4:2',
    'allocation:p4:3'
  ],
  'ordenação deve priorizar produção canônica e manter cronologia dentro dela'
);
const productionTotalRows = buildGanttApsProductionTotalBlocks(productionTotalTasks);
const productionTotalStarts = productionTotalRows.filter(row => row.blockStart);
assert.deepEqual(
  productionTotalStarts.map(row => [row.identity, row.total, row.unit, row.rowSpan]),
  [
    ['production:production-1', '7489.04', 'kg', 2],
    ['production:production-1', '3', 'un', 1],
    ['production:production-2', '940', 'kg', 1],
    ['production:production-3', '3110.25', 'un', 2],
    ['production:production-4', '0.6', 'kg', 3]
  ],
  'totais devem respeitar produção principal, unidade, precisão e splits'
);
assert.equal(
  productionTotalRows.filter(row => row.identity === 'production:production-2').length,
  1,
  'memberships associados não podem fundir ou duplicar a allocation da produção principal'
);
assert.equal(
  productionTotalRows.filter(row => row.identity === 'production:production-3').length,
  2,
  'produção associada deve manter suas próprias allocations'
);

const singleProductionTask = {
  id: 'single',
  productionId: 'production-single',
  productionIndex: 0,
  productionColor: '#2563eb'
};
const singleProductionVisuals = ganttApsProductionVisuals(singleProductionTask);
assert.equal(singleProductionVisuals.length, 1);
assert.equal(
  ganttApsProductionBackground(singleProductionTask),
  singleProductionVisuals[0].color,
  'uma producao deve preencher a superficie com uma unica cor integral'
);

const associatedVisualTask = {
  id: 'associated',
  productionId: 'production-1',
  productionIndex: 0,
  productionColor: '#d9eef7',
  productionMemberships: [
    { productionId: 'production-1', productionIndex: 0, productionColor: '#d9eef7' },
    { productionId: 'production-3', productionIndex: 2, productionColor: '#ddf4e7' },
    { productionId: 'production-3', productionIndex: 2, productionColor: '#ddf4e7' },
    { productionId: 'production-5', productionIndex: 4 }
  ]
};
const associatedVisuals = ganttApsProductionVisuals(associatedVisualTask);
assert.deepEqual(
  associatedVisuals.map(production => production.productionIndex),
  [0, 2, 4],
  'producoes associadas devem ser ordenadas pelos indices exibidos e deduplicadas'
);
const associatedBackground = ganttApsProductionBackground(associatedVisualTask);
assert.match(associatedBackground, /^linear-gradient\(90deg,/);
assert.match(associatedBackground, /33\.3333%/);
assert.match(associatedBackground, /66\.6667%/);
assert.equal(
  associatedVisuals.every(production => Boolean(production.color)),
  true,
  'cor ausente deve receber fallback canonico seguro'
);
assert.equal(
  associatedVisuals.some(production => production.color === '#d9eef7' || production.color === '#ddf4e7'),
  false,
  'cores lavadas do snapshot devem ser normalizadas somente para apresentacao'
);

assert.deepEqual(
  ganttApsDayHeaderPresentation({ date: '2026-07-24', weekday: 'sex.' }, 144),
  {
    mode: 'full',
    dateLabel: '24/07/26',
    secondaryLabel: 'sexta',
    fullLabel: '24/07/2026 · sexta'
  }
);
for (const pixelsPerHour of [3, 4, 6, 8, 12]) {
  const presentation = ganttApsDayHeaderPresentation(
    { date: '2026-07-24', weekday: 'sex.' },
    pixelsPerHour * 24
  );
  assert.equal(presentation.dateLabel, '24/07/26');
  assert.equal(presentation.secondaryLabel, 'sexta');
  assert.equal(presentation.mode, pixelsPerHour <= 4 ? 'compact' : 'full');
}
assert.deepEqual(
  Array.from({ length: 7 }, (_item, dayOffset) => (
    ganttApsDayHeaderPresentation({
      date: `2026-07-${String(26 + dayOffset).padStart(2, '0')}`
    }, 72).secondaryLabel
  )),
  ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
);
assert.deepEqual(
  ganttApsDayHeaderPresentation({
    date: '2026-07-24',
    weekday: 'sex.',
    holiday: 'Feriado municipal'
  }, 72),
  {
    mode: 'compact',
    dateLabel: '24/07/26',
    secondaryLabel: 'sexta',
    fullLabel: '24/07/2026 · sexta · Feriado municipal'
  },
  'tooltip acessivel deve preservar a data e o feriado completos no zoom minimo'
);

const longWindow = buildGanttApsWindow({
  calendar: { days: [{ date: '2026-01-01' }, { date: '2027-12-31' }] },
  tasks: []
});
assert.equal(longWindow.days.length, GANTT_APS_MAX_VISIBLE_DAYS);
assert.equal(longWindow.truncated, true);

const rendererSource = readFileSync(
  new URL('../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js', import.meta.url),
  'utf8'
);
const geometrySource = readFileSync(
  new URL('../shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js', import.meta.url),
  'utf8'
);
const viewModelSource = readFileSync(
  new URL('../shared/planning-schedule-view/planningScheduleViewModel.js', import.meta.url),
  'utf8'
);
const indexSource = readFileSync(
  new URL('../shared/planning-schedule-view/index.js', import.meta.url),
  'utf8'
);
const cssSource = readFileSync(
  new URL('../shared/planning-schedule-view/gantt-aps/gantt-aps.css', import.meta.url),
  'utf8'
);
const pageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
assert.doesNotMatch(rendererSource, /\bfetch\s*\(|\bapi\s*\(|XMLHttpRequest/);
assert.doesNotMatch(rendererSource, /onEditAllocation|onSplitAllocation|dragstart/);
assert.match(rendererSource, /createGanttApsRenderer\(\{\s*onRequestMove,\s*onRequestEdit,\s*onRequestSplit\s*\}\s*=\s*\{\}\)/);
assert.match(rendererSource, /source:\s*'gantt-drag'/);
assert.match(rendererSource, /type:\s*'MOVE_ALLOCATION'/);
assert.match(rendererSource, /capabilities\?\.manualMove\s*===\s*true/);
assert.match(rendererSource, /onRequestEdit\(task\)/);
assert.match(rendererSource, /onRequestSplit\(task\)/);
assert.doesNotMatch(rendererSource, /runPlanningAllocationEditorController|applyManualScheduleTransaction|simulateCurrent|buildPlan/);
assert.doesNotMatch(rendererSource, /stackGanttApsTasks/, 'renderer 1:1 não deve empilhar allocations');
assert.doesNotMatch(geometrySource, /projectGanttApsVisualTasks|visualRowId/);
assert.doesNotMatch(rendererSource, /Produções associadas|membershipBackground/);
assert.match(
  viewModelSource,
  /productionMemberships:\s*cloneValue/,
  'memberships podem permanecer disponíveis internamente no read model'
);
assert.match(
  geometrySource,
  /import\s*\{\s*comparePlanningMachineOrder\s*\}\s*from\s*['"]\.\.\/\.\.\/planning-schedule\/planningMachineOrder\.js['"]/,
  'Gantt APS deve consumir o comparador canonico neutro de maquinas'
);
assert.doesNotMatch(
  geometrySource,
  /production-calendar\/productionCalendar\.utils\.js/,
  'Gantt APS nao deve importar helpers de maquina do pacote visual V2'
);
assert.doesNotMatch(
  geometrySource,
  /\[\s*['"]trefila['"]\s*,\s*['"]ec125['"]\s*,\s*['"]ec60['"]/i,
  'Gantt APS não pode duplicar a lista canônica de máquinas'
);
assert.match(rendererSource, /planning-schedule-view\/v1/);
assert.match(rendererSource, /capabilities\?\.mutate\s*!==\s*false/);
assert.match(rendererSource, /dataset\.allocationId\s*=\s*String\(task\.id\)/);
assert.match(indexSource, /createGanttApsRenderer/);
assert.match(
  pageSource,
  /'gantt-aps':\s*\(\)\s*=>\s*createGanttApsRenderer\(\{\s*onRequestMove:\s*handleProductionCalendarMoveRequest,\s*onRequestEdit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation\),\s*onRequestSplit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation,\s*\{\s*startSplit:\s*true\s*\}\)/,
  'PlanningPage deve conectar o Gantt APS aos callbacks neutros de movimento, edicao e split'
);
assert.doesNotMatch(
  pageSource,
  /const\s+calendar\s*=\s*ProductionCalendar\(\{[\s\S]{0,3000}onRequestMove:\s*handleProductionCalendarMoveRequest/,
  'Calendario V2 continua sem receber callback de movimento manual'
);
assert.match(pageSource, /globalThis\.PLANNING_SCHEDULE_RENDERER\s*\|\|\s*'auto'/);
assert.match(cssSource, /\.gantt-aps__row--allocation\s*\{[\s\S]*height:\s*40px/);
assert.match(cssSource, /\.gantt-aps__row--group\s*\{[\s\S]*height:\s*30px/);
assert.match(cssSource, /\.gantt-aps__bar\s*\{[\s\S]*box-sizing:\s*border-box/);
assert.match(cssSource, /\.gantt-aps__bar\s*\{[\s\S]*box-shadow:\s*none/);
assert.match(cssSource, /\.gantt-aps__bar\s*\{[\s\S]*height:\s*28px/);
const viewportCss = [...cssSource.matchAll(/\.gantt-aps__viewport\s*\{([^}]*)\}/g)]
  .map(match => match[1])
  .find(rule => /overflow-x:\s*auto/.test(rule)) || '';
assert.match(viewportCss, /overflow-x:\s*auto/);
assert.match(viewportCss, /overflow-y:\s*clip/);
assert.doesNotMatch(viewportCss, /max-height|(?:^|[;\s])height\s*:|min\([^)]*vh/);
assert.match(
  cssSource,
  /\.gantt-aps__production-total\s*\{[\s\S]*height:\s*calc\(var\(--gantt-aps-production-total-rows\)\s*\*\s*40px\)/,
  'total visual deve ocupar exatamente a altura das allocation rows do bloco'
);
const productionLabelCss = cssSource.match(/\.gantt-aps__production-label\s*\{([^}]*)\}/)?.[1] || '';
const barMainCss = cssSource.match(/\.gantt-aps__bar-main\s*\{([^}]*)\}/)?.[1] || '';
assert.match(productionLabelCss, /color:\s*#fff/);
assert.match(productionLabelCss, /text-shadow:\s*0 1px 2px/);
assert.doesNotMatch(productionLabelCss, /background|border(?:-radius)?|padding:\s*[1-9]/);
assert.match(barMainCss, /display:\s*none/, 'labels dentro das barras devem ficar visualmente ocultos');
assert.doesNotMatch(barMainCss, /background|border(?:-radius)?/);
assert.match(
  cssSource,
  /\.gantt-aps__day-header\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/,
  'cabecalho deve conter seu label dentro da largura real do dia'
);
assert.match(
  cssSource,
  /\.gantt-aps__lane::before,\s*[\r\n]+\.gantt-aps__group-timeline::before\s*\{[\s\S]*calc\(var\(--gantt-aps-period-width\)\s*-\s*1px\)[\s\S]*rgba\(148,\s*163,\s*184,\s*\.38\)[\s\S]*mask-image:\s*repeating-linear-gradient\([\s\S]*z-index:\s*1/,
  'subdivisoes internas devem ser pontilhadas e calculadas como um quarto da largura real do dia'
);
assert.match(
  cssSource,
  /\.gantt-aps__lane::after,\s*[\r\n]+\.gantt-aps__group-timeline::after\s*\{[\s\S]*background-image:\s*repeating-linear-gradient\([\s\S]*rgba\(100,\s*116,\s*139,\s*\.52\)[\s\S]*var\(--gantt-aps-day-width\)[\s\S]*z-index:\s*2/,
  'linhas de allocation e grupos devem compartilhar overlay diário calculado pela largura real do dia'
);
assert.match(
  cssSource,
  /\.gantt-aps__day-band\[data-non-working="true"\]\s*\{[\s\S]*repeating-linear-gradient/,
  'hachura de dias nao uteis deve continuar declarada nos day bands'
);
assert.match(
  cssSource,
  /\.gantt-aps__bar\s*\{[\s\S]*padding:\s*2px 0[\s\S]*z-index:\s*3/,
  'barras devem permanecer acima do overlay de grade sem alterar left/width'
);
assert.match(cssSource, /\.gantt-aps__drop-cell\[data-drag-target="true"\]/);
assert.match(cssSource, /\.gantt-aps__drop-cell\[data-drag-invalid="true"\]/);
assert.match(cssSource, /\.gantt-aps__bar\[data-dragging="true"\]/);
assert.match(
  rendererSource,
  /const\s+GANTT_APS_BAR_HORIZONTAL_INSET\s*=\s*3[\s\S]*function\s+ganttApsApplyBarHorizontalInset[\s\S]*Math\.max\(1,\s*safeWidth\s*-\s*\(2\s*\*\s*inset\)\)[\s\S]*function\s+ganttApsVisualBarGeometry[\s\S]*startOffsetPercent[\s\S]*dayWidth\s*\*\s*startOffsetPercent\s*\/\s*100[\s\S]*ganttApsApplyBarHorizontalInset\(\s*visualLeft,\s*dayWidth\s*\*\s*visualCapacityPercent\s*\/\s*100\s*\)/,
  'geometria visual deve preencher a célula diária sem alterar taskGeometry'
);
assert.match(cssSource, /--gantt-aps-table-width:\s*782px/);
assert.match(
  cssSource,
  /--gantt-aps-table-columns:\s*116px 92px 68px 160px 154px 76px 116px/,
  'Quantidade / Capacidade e Capacidade utilizada devem caber sem ampliar excessivamente a tabela fixa'
);
assert.match(rendererSource, /function\s+dailyCapacityValue[\s\S]*task\?\.maxDailyCapacity[\s\S]*task\?\.capacityMaxPerDay/);
assert.match(rendererSource, /function\s+quantityCapacityLabel[\s\S]*return `\$\{quantity\} \/ \$\{formatNumber\(capacity\)\} \$\{task\?\.unit \|\| ''\}`\.trim\(\)/);
assert.match(
  cssSource,
  /\.gantt-aps__cell\s*\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/,
  'material longo deve permanecer em uma linha e usar ellipsis sem aumentar a row'
);
assert.match(
  cssSource,
  /\.gantt-aps__table--header \.gantt-aps__cell\s*\{[^}]*white-space:\s*pre-line/,
  'cabecalho deve respeitar quebra explicita sem mudar ellipsis das rows'
);

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  values() {
    return new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean));
  }

  add(...values) {
    this.owner.className = [...new Set([...this.values(), ...values])].join(' ');
  }

  remove(...values) {
    const removed = new Set(values);
    this.owner.className = [...this.values()].filter(value => !removed.has(value)).join(' ');
  }

  toggle(value, force) {
    const has = this.values().has(value);
    const next = force === undefined ? !has : Boolean(force);
    if (next) this.add(value);
    else this.remove(value);
    return next;
  }
}

function dataKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function matchesSelector(node, selector) {
  if (String(selector).includes(',')) {
    return String(selector).split(',').some(part => matchesSelector(node, part.trim()));
  }
  const classMatches = [...selector.matchAll(/\.([a-z0-9_-]+)/gi)].map(match => match[1]);
  if (classMatches.some(className => !node.classList.values().has(className))) return false;
  const attributeMatches = [...selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
  for (const [, attribute, expected] of attributeMatches) {
    const value = attribute.startsWith('data-')
      ? node.dataset[dataKey(attribute)]
      : node.attributes.get(attribute);
    if (value === undefined) return false;
    if (expected !== undefined && String(value) !== expected) return false;
  }
  const tag = selector.match(/^[a-z][a-z0-9-]*/i)?.[0];
  return !tag || node.tagName === tag.toUpperCase();
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, String(value))
    };
    this._textContent = '';
    this.scrollLeft = 0;
    this.scrollTop = 0;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }

  append(...nodes) {
    nodes.forEach(node => {
      if (!node) return;
      node.parentNode?.removeChild?.(node);
      node.parentNode = this;
      this.children.push(node);
    });
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }

  removeChild(node) {
    this.children = this.children.filter(child => child !== node);
    node.parentNode = null;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (String(name).startsWith('data-')) {
      this.dataset[dataKey(String(name))] = String(value);
    }
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = node => {
      node.children.forEach(child => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  click() {
    let current = this;
    const event = { target: this };
    while (current) {
      current.listeners.get('click')?.forEach(listener => listener(event));
      current = current.parentNode;
    }
  }

  scrollIntoView() {
    this.scrolledIntoView = true;
  }

  focus() {
    this.focused = true;
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    let current = this;
    while (current) {
      event.currentTarget = current;
      current.listeners.get(event.type)?.forEach(listener => listener(event));
      current = event.bubbles === false ? null : current.parentNode;
    }
    return true;
  }

  setPointerCapture(pointerId) {
    this.capturedPointerId = pointerId;
  }

  releasePointerCapture(pointerId) {
    if (this.capturedPointerId === pointerId) delete this.capturedPointerId;
  }

  getBoundingClientRect() {
    return {
      left: Number(this.rect?.left || 0),
      top: Number(this.rect?.top || 0),
      width: Number(this.rect?.width || 0),
      height: Number(this.rect?.height || 0),
      right: Number(this.rect?.left || 0) + Number(this.rect?.width || 0),
      bottom: Number(this.rect?.top || 0) + Number(this.rect?.height || 0)
    };
  }

  requestFullscreen() {
    fakeDocument.fullscreenElement = this;
    fakeDocument.dispatch('fullscreenchange');
    return Promise.resolve();
  }
}

const fakeDocument = {
  fullscreenElement: null,
  listeners: new Map(),
  pointedElement: null,
  createElement: tagName => new FakeElement(tagName),
  elementFromPoint() {
    return this.pointedElement;
  },
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  },
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  },
  dispatch(type) {
    this.listeners.get(type)?.forEach(listener => listener());
  },
  exitFullscreen() {
    this.fullscreenElement = null;
    this.dispatch('fullscreenchange');
    return Promise.resolve();
  }
};

const previousDocument = globalThis.document;
const previousSetTimeout = globalThis.setTimeout;
const previousClearTimeout = globalThis.clearTimeout;
const timers = new Map();
const clearedTimers = [];
let nextTimerId = 1;
globalThis.document = fakeDocument;
globalThis.setTimeout = callback => {
  const id = nextTimerId++;
  timers.set(id, callback);
  return id;
};
globalThis.clearTimeout = id => {
  clearedTimers.push(id);
  timers.delete(id);
};

try {
  {
    const gridModel = {
      contractVersion: 'planning-schedule-view/v1',
      capabilities: { inspect: true, mutate: false },
      calendar: {
        days: [
          { date: '2026-07-28', isWorkingDay: true },
          { date: '2026-07-29', isWorkingDay: true },
          { date: '2026-07-30', isWorkingDay: false, holiday: 'Feriado municipal' },
          { date: '2026-07-31', isWorkingDay: true }
        ]
      },
      resources: [
        { id: 'machine-with-production', name: 'Trefila', order: 1 },
        { id: 'machine-empty', name: 'EC-60', order: 2 }
      ],
      tasks: [
        {
          id: 'allocation:grid:1',
          resourceId: 'machine-with-production',
          productionIndex: 1,
          productionMemberships: [{ productionId: 'p1' }, { productionId: 'p2' }],
          materialName: 'Material com barra',
          start: { date: '2026-07-29', time: '08:00' },
          end: { date: '2026-07-29', time: '10:00' },
          quantity: 266.48,
          unit: 'un',
          maxDailyCapacity: 700,
          capacityPercent: 64.09,
          startCapacityPercent: 35,
          endCapacityPercent: 99.09
        },
        {
          id: 'allocation:grid:2',
          resourceId: 'machine-with-production',
          productionIndex: 2,
          materialName: 'Material em outro dia',
          start: { date: '2026-07-31', time: '13:00' },
          end: { date: '2026-07-31', time: '14:00' },
          quantity: 4486.33,
          unit: 'kg',
          maxDailyCapacity: 7000,
          capacityPercent: 25
        },
        {
          id: 'allocation:grid:night',
          resourceId: 'machine-with-production',
          productionIndex: 3,
          materialName: 'Turno noturno',
          start: { date: '2026-07-28', time: '22:00' },
          endDate: '2026-07-29',
          endTime: '02:00',
          quantity: 700,
          unit: 'un',
          maxDailyCapacity: 700,
          capacityPercent: 100
        },
        {
          id: 'allocation:grid:overcapacity',
          resourceId: 'machine-with-production',
          productionIndex: 5,
          materialName: 'Capacidade acima de 100',
          start: { date: '2026-07-28', time: '08:00' },
          end: { date: '2026-07-28', time: '09:00' },
          quantity: 50,
          unit: 'un',
          maxDailyCapacity: 40,
          capacityPercent: 125
        },
        {
          id: 'allocation:grid:zero',
          resourceId: 'machine-with-production',
          productionIndex: 6,
          materialName: 'Capacidade zero',
          start: { date: '2026-07-30', time: '08:00' },
          end: { date: '2026-07-30', time: '09:00' },
          quantity: 60,
          unit: 'un',
          maxDailyCapacity: 700,
          capacityPercent: 0
        },
        {
          id: 'allocation:grid:tiny',
          resourceId: 'machine-with-production',
          productionIndex: 8,
          materialName: 'Capacidade muito pequena',
          start: { date: '2026-07-31', time: '08:00' },
          end: { date: '2026-07-31', time: '09:00' },
          quantity: 33.52,
          unit: 'un',
          maxDailyCapacity: 700,
          capacityPercent: 4.79
        },
        {
          id: 'allocation:grid:invalid-capacity',
          resourceId: 'machine-with-production',
          productionIndex: 7,
          materialName: 'Capacidade invalida',
          start: { date: '2026-07-30', time: '03:00' },
          end: { date: '2026-07-30', time: '05:00' },
          quantity: 70,
          unit: 'un',
          capacityPercent: 'valor-invalido'
        },
        {
          id: 'allocation:grid:multi-day',
          resourceId: 'machine-with-production',
          productionIndex: 4,
          materialName: 'Multidiária preservada',
          start: { date: '2026-07-29', time: '08:00' },
          end: { date: '2026-07-31', time: '10:00' },
          quantity: 40
        }
      ],
      metadata: { visualState: {} }
    };
    for (const [pixelsPerHour, zoomClicks] of [
      [3, ['zoom-out', 'zoom-out']],
      [4, ['zoom-out']],
      [6, []],
      [8, ['zoom-in']],
      [12, ['zoom-in', 'zoom-in']]
    ]) {
      const gridContainer = new FakeElement('div');
      const gridRenderer = createGanttApsRenderer();
      gridRenderer.mount(gridContainer, gridModel);
      zoomClicks.forEach(action => gridRenderer.getRootElement().querySelector(`[data-action="${action}"]`).click());
      const gridRoot = gridRenderer.getRootElement();
      assert.equal(
        gridRoot.style.values.get('--gantt-aps-day-width'),
        `${pixelsPerHour * 24}px`,
        `largura diária deve acompanhar ${pixelsPerHour}px/h`
      );
      assert.equal(
        gridRoot.style.values.get('--gantt-aps-period-width'),
        `${pixelsPerHour * 6}px`,
        `subdivisão visual deve acompanhar ${pixelsPerHour}px/h como um quarto do dia`
      );
      assert.equal(
        gridRoot.style.values.get('--gantt-aps-timeline-width'),
        `${pixelsPerHour * 24 * gridModel.calendar.days.length}px`,
        `timeline deve preservar a largura total no zoom ${pixelsPerHour}px/h`
      );
      assert.equal(
        gridRoot.querySelectorAll('.gantt-aps__day-header').length,
        gridModel.calendar.days.length,
        'cabecalho deve manter uma célula por dia'
      );
      assert.deepEqual(
        gridRoot.querySelector('.gantt-aps__table--header').querySelectorAll('.gantt-aps__cell').map(cell => cell.textContent),
        ['Máquina / total', 'Produção', 'Etapa', 'Material', 'Quantidade / Capacidade', 'Pessoas', 'Capacidade utilizada'],
        'cabecalho deve apresentar Quantidade / Capacidade e Capacidade utilizada'
      );
      assert.equal(
        gridRoot.querySelector('.gantt-aps__table--header').querySelectorAll('.gantt-aps__cell')[6].attributes.get('aria-label'),
        'Capacidade utilizada',
        'cabecalho quebrado deve preservar texto completo acessivel'
      );
      assert.equal(
        gridRoot.querySelectorAll('.gantt-aps__row--group').length,
        2,
        'máquina com e sem produção devem manter linha de grupo'
      );
      assert.equal(
        gridRoot.querySelectorAll('.gantt-aps__group-timeline').length,
        2,
        'cada linha de grupo deve ter área temporal que recebe o overlay diário'
      );
      assert.ok(
        gridRoot.querySelectorAll('.gantt-aps__row--group')
          .find(row => row.dataset.resourceId === 'machine-empty')
          .querySelector('.gantt-aps__group-timeline'),
        'máquina sem produção deve preservar a área temporal sem criar allocation falsa'
      );
      assert.equal(
        gridRoot.querySelectorAll('.gantt-aps__row--allocation').length,
        gridModel.tasks.length,
        'máquina vazia não deve criar allocation row falsa'
      );
      const dayWidth = pixelsPerHour * 24;
      const barsById = new Map(gridRoot.querySelectorAll('.gantt-aps__bar')
        .map(bar => [bar.dataset.allocationId, bar]));
      const rowsById = new Map(gridRoot.querySelectorAll('.gantt-aps__row--allocation')
        .map(row => [row.dataset.allocationId, row]));
      const firstDayBar = barsById.get('allocation:grid:night');
      const secondDayBar = barsById.get('allocation:grid:1');
      const fourthDayBar = barsById.get('allocation:grid:2');
      const overcapacityBar = barsById.get('allocation:grid:overcapacity');
      const zeroCapacityBar = barsById.get('allocation:grid:zero');
      const tinyCapacityBar = barsById.get('allocation:grid:tiny');
      const invalidCapacityBar = barsById.get('allocation:grid:invalid-capacity');
      const multiDayBar = barsById.get('allocation:grid:multi-day');
      const insetBar = (left, width) => {
        const inset = width > 0 ? Math.min(3, Math.max(0, (width - 1) / 2)) : 0;
        return { left: left + inset, width: width > 0 ? Math.max(1, width - (2 * inset)) : 0 };
      };
      const assertPxClose = (actual, expected, message) => {
        assert.ok(
          Math.abs(Number.parseFloat(actual) - expected) < 0.000001,
          `${message}: esperado ${expected}px, recebido ${actual}`
        );
      };
      const firstDayGeometry = insetBar(0, dayWidth);
      const secondDayGeometry = insetBar(dayWidth + (dayWidth * 0.35), dayWidth * 0.6409);
      const fourthDayGeometry = insetBar(dayWidth * 3, dayWidth * 0.25);
      const overcapacityGeometry = insetBar(0, dayWidth);
      const tinyCapacityGeometry = insetBar(dayWidth * 3, dayWidth * 0.0479);
      const invalidCapacityGeometry = insetBar((48 + 3) * pixelsPerHour, 2 * pixelsPerHour);
      const multiDayGeometry = insetBar((24 + 8) * pixelsPerHour, 50 * pixelsPerHour);
      assertPxClose(firstDayBar.style.left, firstDayGeometry.left, 'capacityPercent 100 deve manter inset esquerdo');
      assertPxClose(firstDayBar.style.width, firstDayGeometry.width, 'capacityPercent 100 deve manter respiro dos dois lados');
      assertPxClose(secondDayBar.style.left, secondDayGeometry.left, 'capacityPercent 64.09 deve respeitar offset intradiario readonly');
      assertPxClose(secondDayBar.style.width, secondDayGeometry.width, 'capacityPercent 64.09 deve preservar proporcao com respiro');
      assert.equal(rowsById.get('allocation:grid:1').querySelector('.gantt-aps__cell--5').textContent, '266,48 un / 700 un');
      assert.equal(rowsById.get('allocation:grid:1').querySelector('.gantt-aps__cell--5').title, '266,48 un / 700 un');
      assert.equal(rowsById.get('allocation:grid:1').querySelector('.gantt-aps__cell--5').attributes.get('aria-label'), '266,48 un / 700 un');
      assert.equal(rowsById.get('allocation:grid:1').querySelector('.gantt-aps__cell--7').textContent, '64,09%');
      assert.match(
        secondDayBar.style.values.get('--gantt-aps-production-background'),
        /^linear-gradient\(90deg,/,
        'barra com mÃºltiplas produÃ§Ãµes deve preservar divisÃ£o cromÃ¡tica'
      );
      assert.equal(secondDayBar.attributes.get('aria-label').includes('Material com barra'), true);
      assert.equal(secondDayBar.title.includes('Material com barra'), true);
      assert.equal(rowsById.get('allocation:grid:night').querySelector('.gantt-aps__cell--5').textContent, '700 un / 700 un');
      assert.equal(rowsById.get('allocation:grid:2').querySelector('.gantt-aps__cell--5').textContent, '4.486,33 kg / 7.000 kg');
      assert.equal(rowsById.get('allocation:grid:invalid-capacity').querySelector('.gantt-aps__cell--5').textContent, '70 un');
      assertPxClose(fourthDayBar.style.left, fourthDayGeometry.left, 'capacityPercent 25 deve manter inset esquerdo');
      assertPxClose(fourthDayBar.style.width, fourthDayGeometry.width, 'capacityPercent 25 deve preservar proporcao com respiro');
      assertPxClose(overcapacityBar.style.left, overcapacityGeometry.left, 'capacityPercent acima de 100 deve limitar e manter inset');
      assertPxClose(overcapacityBar.style.width, overcapacityGeometry.width, 'capacityPercent acima de 100 deve limitar a celula com respiro');
      assert.equal(zeroCapacityBar.style.left, `${dayWidth * 2}px`);
      assert.equal(zeroCapacityBar.style.width, '0px');
      assertPxClose(tinyCapacityBar.style.left, tinyCapacityGeometry.left, 'barra positiva muito pequena deve reduzir dinamicamente o inset');
      assertPxClose(tinyCapacityBar.style.width, tinyCapacityGeometry.width, 'barra positiva muito pequena deve permanecer visivel');
      assert.ok(Number.parseFloat(tinyCapacityBar.style.width) > 0, 'barra positiva muito pequena nao pode desaparecer pelo respiro');
      assertPxClose(invalidCapacityBar.style.left, invalidCapacityGeometry.left, 'capacityPercent invalido deve usar fallback temporal com inset');
      assertPxClose(invalidCapacityBar.style.width, invalidCapacityGeometry.width, 'capacityPercent invalido deve usar largura temporal com respiro');
      assertPxClose(multiDayBar.style.left, multiDayGeometry.left, 'multidiaria deve preservar geometria temporal com inset visual');
      assertPxClose(multiDayBar.style.width, multiDayGeometry.width, 'multidiaria deve preservar largura temporal com respiro');
      assert.equal(
        gridRoot.querySelector('.gantt-aps__lane').querySelectorAll('[data-non-working="true"]').length,
        1,
        'hachura de feriado deve coexistir com a grade da lane'
      );
      gridRenderer.destroy();
      assert.equal(gridContainer.children.length, 0, 'destroy deve limpar renderer de grade');
    }
  }

  {
    const moveRequests = [];
    const editRequests = [];
    const splitRequests = [];
    const dragModel = {
      contractVersion: 'planning-schedule-view/v1',
      capabilities: { inspect: true, mutate: false, manualMove: true },
      calendar: {
        days: [
          { date: '2026-07-28', isWorkingDay: true },
          { date: '2026-07-29', isWorkingDay: true },
          { date: '2026-07-30', isWorkingDay: true },
          { date: '2026-07-31', isWorkingDay: true }
        ]
      },
      resources: [{ id: 'machine-drag', name: 'Trefila', order: 1 }],
      tasks: [{
        id: 'allocation:drag:1',
        operationId: 'operation-drag-1',
        calendarParentOperationId: 'calendar-parent-drag-1',
        parentOperationId: 'parent-drag-1',
        productionId: 'production-drag-1',
        productionIndex: 2,
        resourceId: 'machine-drag',
        materialName: 'Material arrastavel',
        start: { date: '2026-07-29', time: '08:00' },
        end: { date: '2026-07-29', time: '10:00' },
        quantity: 10,
        unit: 'kg',
        capacityPercent: 100,
        persistable: true
      }],
      metadata: { visualState: {} }
    };
    const dragContainer = new FakeElement('div');
    const dragRenderer = createGanttApsRenderer({
      onRequestMove: intent => moveRequests.push(intent),
      onRequestEdit: allocation => editRequests.push(allocation),
      onRequestSplit: allocation => splitRequests.push(allocation)
    });
    dragRenderer.mount(dragContainer, dragModel);
    const dragRoot = dragRenderer.getRootElement();
    assert.equal(dragRoot.dataset.manualMove, 'true');
    assert.equal(dragRoot.dataset.manualEdit, 'true');
    assert.equal(dragRoot.dataset.manualSplit, 'true');
    const dragBar = dragRoot.querySelector('.gantt-aps__bar');
    dragBar.click();
    const editAction = dragRoot.querySelector('[data-action="edit-allocation"]');
    const splitAction = dragRoot.querySelector('[data-action="split-allocation"]');
    assert.ok(editAction, 'Gantt editavel deve expor acao explicita de edicao');
    assert.ok(splitAction, 'Gantt editavel deve expor acao explicita de split');
    editAction.dispatchEvent({
      type: 'pointerdown',
      button: 0,
      pointerId: 6,
      clientX: 10,
      clientY: 10
    });
    assert.equal(dragBar.dataset.dragging, undefined, 'acao de edicao nao pode iniciar drag');
    assert.equal(dragBar.capturedPointerId, undefined, 'acao de edicao nao pode capturar ponteiro da barra');
    editAction.click();
    splitAction.click();
    assert.equal(editRequests.length, 1, 'acao editar deve chamar callback uma unica vez');
    assert.equal(splitRequests.length, 1, 'acao split deve chamar callback uma unica vez');
    assert.equal(editRequests[0].id, 'allocation:drag:1');
    assert.equal(splitRequests[0].id, 'allocation:drag:1');
    assert.equal(moveRequests.length, 0, 'acoes de editar/split nao podem emitir movimento');
    const dragRow = dragRoot.querySelector('.gantt-aps__row--allocation');
    const dragLane = dragRow.querySelector('.gantt-aps__lane');
    dragLane.rect = { left: 0, top: 0, width: 576, height: 40 };
    const targetDropCell = dragRoot.querySelector('.gantt-aps__drop-cell[data-date="2026-07-31"]');
    fakeDocument.pointedElement = targetDropCell;
    dragBar.dispatchEvent({
      type: 'pointerdown',
      button: 0,
      pointerId: 7,
      clientX: 72,
      clientY: 10,
      preventDefault() {
        this.defaultPrevented = true;
      }
    });
    assert.equal(dragBar.dataset.dragging, 'true', 'barra persistivel deve entrar em estado visual de drag');
    dragRoot.dispatchEvent({
      type: 'pointermove',
      pointerId: 7,
      clientX: (24 * 6 * 3) + 1,
      clientY: 10,
      preventDefault() {
        this.defaultPrevented = true;
      }
    });
    assert.equal(targetDropCell.dataset.dragTarget, 'true', 'destino na mesma maquina deve ficar destacado');
    dragRoot.dispatchEvent({
      type: 'pointerup',
      pointerId: 7,
      clientX: (24 * 6 * 3) + 1,
      clientY: 10
    });
    assert.equal(moveRequests.length, 1);
    assert.deepEqual(moveRequests[0], {
      type: 'MOVE_ALLOCATION',
      allocationId: 'allocation:drag:1',
      operationId: 'operation-drag-1',
      calendarParentOperationId: 'calendar-parent-drag-1',
      parentOperationId: 'parent-drag-1',
      productionId: 'production-drag-1',
      productionIndex: 2,
      from: {
        date: '2026-07-29',
        machineId: 'machine-drag'
      },
      to: {
        date: '2026-07-31',
        machineId: 'machine-drag'
      },
      source: 'gantt-drag',
      destination: {
        kind: 'empty',
        occupiedAllocationIds: []
      }
    });
    assert.equal(dragBar.dataset.dragging, undefined, 'estado visual de drag deve ser limpo ao soltar');
    assert.equal(targetDropCell.dataset.dragTarget, undefined, 'destaque de destino deve ser limpo ao soltar');

    const readonlyRenderer = createGanttApsRenderer({ onRequestMove: intent => moveRequests.push(intent) });
    const readonlyContainer = new FakeElement('div');
    readonlyRenderer.mount(readonlyContainer, {
      ...dragModel,
      capabilities: { inspect: true, mutate: false, manualMove: false }
    });
    const readonlyRoot = readonlyRenderer.getRootElement();
    assert.equal(readonlyRoot.dataset.manualMove, 'false');
    assert.equal(readonlyRoot.dataset.manualEdit, 'false');
    assert.equal(readonlyRoot.dataset.manualSplit, 'false');
    readonlyRoot.querySelector('.gantt-aps__bar').click();
    assert.equal(readonlyRoot.querySelector('[data-action="edit-allocation"]'), null);
    assert.equal(readonlyRoot.querySelector('[data-action="split-allocation"]'), null);
    readonlyRoot.querySelector('.gantt-aps__bar').dispatchEvent({
      type: 'pointerdown',
      button: 0,
      pointerId: 8,
      clientX: 72,
      clientY: 10
    });
    readonlyRoot.dispatchEvent({
      type: 'pointerup',
      pointerId: 8,
      clientX: (24 * 6 * 3) + 1,
      clientY: 10
    });
    assert.equal(moveRequests.length, 1, 'capability manualMove=false nao pode emitir movimento');
    dragRenderer.destroy();
    readonlyRenderer.destroy();
    fakeDocument.pointedElement = null;
  }

  {
    const totalContainer = new FakeElement('div');
    const totalRenderer = createGanttApsRenderer();
    totalRenderer.mount(totalContainer, {
      contractVersion: 'planning-schedule-view/v1',
      capabilities: { inspect: true, mutate: false },
      calendar: {
        days: [{
          date: '2026-07-24',
          isWorkingDay: false,
          weekday: 'sex.',
          holiday: 'Feriado municipal'
        }]
      },
      resources: [{ id: 'machine-total', name: 'Aço-8', order: 0 }],
      tasks: productionTotalTasks,
      metadata: { visualState: {} }
    });
    const totalRoot = totalRenderer.getRootElement();
    let dayHeader = totalRoot.querySelector('[data-date="2026-07-24"]');
    assert.equal(dayHeader.dataset.labelMode, 'full');
    assert.equal(dayHeader.children[0].textContent, '24/07/26');
    assert.equal(dayHeader.children[1].textContent, 'sexta');
    assert.equal(dayHeader.attributes.get('aria-label'), '24/07/2026 · sexta · Feriado municipal');
    assert.equal(dayHeader.dataset.nonWorking, 'true', 'feriado deve preservar a hachura de dia nao util');
    const totalCells = totalRoot.querySelectorAll('[data-production-total="start"]');
    assert.equal(totalCells.length, 5, 'cada bloco de produção/unidade deve apresentar um único total');
    assert.deepEqual(
      totalCells.map(cell => cell.textContent),
      ['7.489,04 kg', '3 un', '940 kg', '3.110,25 un', '0,6 kg'],
      'totais devem usar formatação pt-BR sem arredondar parcelas antes da soma'
    );
    assert.equal(
      totalCells[0].style.values.get('--gantt-aps-production-total-rows'),
      '2',
      'mesclagem visual deve cobrir a altura das duas allocation rows'
    );
    assert.equal(
      totalCells[4].style.values.get('--gantt-aps-production-total-rows'),
      '3',
      'mesclagem visual deve cobrir três ou mais allocation rows sem repetir o total'
    );
    assert.equal(
      totalRoot.querySelectorAll('[data-production-total="continuation"]').length,
      4,
      'rows seguintes do bloco não podem repetir o total'
    );
    assert.equal(
      totalRoot.querySelectorAll('.gantt-aps__row--allocation').length,
      productionTotalTasks.length,
      'uma allocation canônica deve continuar gerando uma row'
    );
    assert.equal(
      totalRoot.querySelectorAll('.gantt-aps__bar').length,
      productionTotalTasks.length,
      'uma allocation canônica deve continuar gerando uma barra'
    );
    assert.equal(
      totalRoot.querySelector('.gantt-aps__table--header').textContent.includes('Máquina / total'),
      true,
      'primeira coluna deve comunicar máquina e total sem ampliar a tabela'
    );
    const production1Row = totalRoot.querySelectorAll('.gantt-aps__row--allocation')
      .find(row => row.dataset.allocationId === 'split:p1:1');
    const production1Bar = totalRoot.querySelectorAll('.gantt-aps__bar')
      .find(bar => bar.dataset.allocationId === 'split:p1:1');
    const production1Cell = production1Row.querySelector('.gantt-aps__cell--2');
    const production1MaterialCell = production1Row.querySelector('.gantt-aps__cell--4');
    assert.equal(production1Cell.textContent, 'Produção 1 / 3');
    assert.equal(production1Cell.dataset.productionCount, '2');
    assert.match(production1Cell.style.values.get('--gantt-aps-production-background'), /^linear-gradient\(90deg,/);
    assert.equal(production1MaterialCell.textContent, '4,2 Transversal - 2m');
    assert.equal(production1MaterialCell.title, '4,2 Transversal - 2m');
    assert.equal(production1MaterialCell.attributes.get('aria-label'), '4,2 Transversal - 2m');
    assert.equal(production1Bar.querySelector('strong').textContent, 'Produção 1 / 3');
    assert.equal(production1Bar.attributes.get('aria-label').includes('Produção 1 / 3'), true);
    assert.equal(production1Bar.dataset.productionCount, '2');
    assert.equal(production1Bar.style.values.get('left'), undefined);
    assert.equal(production1Bar.style.left, '3px');
    assert.equal(production1Bar.style.width, '138px');
    assert.equal(
      production1Bar.style.values.get('--gantt-aps-production-background'),
      production1Cell.style.values.get('--gantt-aps-production-background'),
      'barra e célula devem reutilizar a mesma divisão cromática'
    );
    production1Bar.click();
    let inspector = totalRoot.querySelector('.gantt-aps__inspect');
    assert.equal(inspector.querySelector('h3').textContent, 'Produção 1 / 3');
    assert.equal(
      inspector.style.values.get('--gantt-aps-production-background'),
      production1Cell.style.values.get('--gantt-aps-production-background')
    );
    assert.equal(inspector.textContent.includes('Produções1 / 3'), true);
    assert.equal(inspector.textContent.includes('Produções associadas'), false);
    assert.equal(inspector.textContent.includes('Etapa'), true);

    const production3Bar = totalRoot.querySelectorAll('.gantt-aps__bar')
      .find(bar => bar.dataset.allocationId === 'readonly:p3:[special]');
    assert.equal(production3Bar.querySelector('strong').textContent, 'Produção 1 / 3');
    assert.equal(production3Bar.dataset.productionCount, '2');
    production3Bar.click();
    inspector = totalRoot.querySelector('.gantt-aps__inspect');
    assert.equal(inspector.querySelector('h3').textContent, 'Produção 1 / 3');
    assert.equal(inspector.textContent.includes('Produções1 / 3'), true);
    assert.equal(inspector.textContent.includes('Produções associadas'), false);
    const production2Row = totalRoot.querySelectorAll('.gantt-aps__row--allocation')
      .find(row => row.dataset.allocationId === 'allocation:p2');
    assert.equal(production2Row.querySelector('.gantt-aps__cell--2').textContent, 'Produção 2 / 3 / 4');
    assert.equal(production2Row.querySelector('.gantt-aps__cell--2').dataset.productionCount, '3');
    const singleColorRow = totalRoot.querySelectorAll('.gantt-aps__row--allocation')
      .find(row => row.dataset.allocationId === 'split:p1:2');
    assert.equal(singleColorRow.querySelector('.gantt-aps__cell--2').dataset.productionCount, '1');
    assert.doesNotMatch(
      singleColorRow.querySelector('.gantt-aps__cell--2').style.values.get('--gantt-aps-production-background'),
      /^linear-gradient/
    );
    totalRenderer.getRootElement().querySelector('[data-action="zoom-out"]').click();
    dayHeader = totalRenderer.getRootElement().querySelector('[data-date="2026-07-24"]');
    assert.equal(dayHeader.dataset.labelMode, 'compact');
    assert.equal(dayHeader.children[0].textContent, '24/07/26');
    assert.equal(dayHeader.children[1].textContent, 'sexta');
    totalRenderer.getRootElement().querySelector('[data-action="zoom-out"]').click();
    dayHeader = totalRenderer.getRootElement().querySelector('[data-date="2026-07-24"]');
    assert.equal(dayHeader.dataset.labelMode, 'compact');
    assert.equal(dayHeader.children[0].textContent, '24/07/26');
    assert.equal(dayHeader.children[1].textContent, 'sexta');
    assert.equal(dayHeader.attributes.get('aria-label'), '24/07/2026 · sexta · Feriado municipal');
    assert.equal(dayHeader.dataset.nonWorking, 'true');
    totalRenderer.destroy();
    assert.equal(totalContainer.children.length, 0, 'destroy deve remover o renderer com totais');
  }

  const resources = Array.from({ length: 4 }, (_item, index) => ({
    id: `machine-${index}`,
    name: `Máquina ${index}`,
    order: index
  }));
  const tasks = resources.flatMap((resource, resourceIndex) => (
    Array.from({ length: resourceIndex === 0 ? GANTT_APS_ROWS_PER_PAGE + 6 : 2 }, (_item, taskIndex) => ({
      id: resourceIndex === 0 && taskIndex === 0
        ? 'readonly:special:[id]:0'
        : `allocation:${resourceIndex}:${taskIndex}`,
      persistable: resourceIndex !== 0 || taskIndex !== 0,
      resourceId: resource.id,
      productionIndex: null,
      materialName: `Material ${taskIndex}`,
      productionMemberships: resourceIndex === 0 && taskIndex === 0
        ? [{ productionId: 'p1' }, { productionId: 'p2' }]
        : [],
      split: resourceIndex === 2
        ? { splitRootAllocationId: 'split-root', splitPartId: `part-${taskIndex}` }
        : {},
      start: { date: '2026-07-24', time: `${String(7 + (taskIndex % 10)).padStart(2, '0')}:00` },
      end: resourceIndex === 0 && taskIndex === 0
        ? { date: '2026-07-24', time: '17:00' }
        : resourceIndex === 0 && taskIndex === 1
          ? { date: '2026-07-25', time: '08:00' }
          : { date: '2026-07-24', time: `${String(8 + (taskIndex % 10)).padStart(2, '0')}:00` },
      quantity: taskIndex === 0 ? null : taskIndex,
      capacityPercent: 99
    }))
  ));
  tasks.push({
    id: 'readonly:unplaced:[special]',
    persistable: false,
    resourceId: 'machine-0',
    productionIndex: null,
    materialName: 'Sem geometria',
    start: { date: null, time: null },
    end: { date: null, time: null },
    quantity: null,
    durationMinutes: null,
    capacityPercent: null,
    peopleCount: null
  });
  tasks.push({
    id: 'allocation:outside:horizon',
    persistable: true,
    resourceId: 'machine-0',
    productionIndex: 2,
    materialName: 'Fora da janela',
    start: { date: '2027-07-24', time: '07:00' },
    end: { date: '2027-07-24', time: '08:00' }
  });
  const domModel = {
    contractVersion: 'planning-schedule-view/v1',
    capabilities: { inspect: true, mutate: false },
    calendar: {
      days: [
        { date: '2026-07-24', isWorkingDay: true },
        { date: '2026-07-25', isWorkingDay: false },
        { date: '2026-07-26', isWorkingDay: true, isManuallyEnabled: true }
      ]
    },
    resources,
    tasks,
    metadata: { errors: [{ code: 'snapshot.warning' }], visualState: {} }
  };
  const immutableBefore = structuredClone(domModel);
  const container = new FakeElement('div');
  const renderer = createGanttApsRenderer();
  renderer.mount(container, domModel);
  assert.equal(container.children.length, 1, 'mount deve manter um único renderer');
  let root = renderer.getRootElement();
  const allocationRows = root.querySelectorAll('.gantt-aps__row--allocation');
  const bars = root.querySelectorAll('.gantt-aps__bar');
  assert.equal(allocationRows.length, GANTT_APS_ROWS_PER_PAGE, 'orçamento global deve limitar allocation rows');
  assert.equal(bars.length, allocationRows.length, 'cada allocation row deve ter exatamente uma barra');
  assert.equal(new Set(bars.map(bar => bar.dataset.allocationId)).size, bars.length, 'uma allocation canônica deve gerar uma única barra');
  assert.equal(root.querySelectorAll('.gantt-aps__row--group').length, 1);
  assert.equal(root.querySelectorAll('[role="treegrid"]').length, 1);
  assert.equal(root.querySelector('.gantt-aps__table--header').querySelectorAll('.gantt-aps__cell').length, 7);
  assert.equal(root.querySelectorAll('.gantt-aps__unplaced-task').length, 2);
  assert.equal(root.querySelectorAll('[data-non-working="true"]').length > 0, true);
  assert.equal(root.querySelectorAll('[data-manual-work-date="true"]').length > 0, true);
  assert.equal(root.querySelectorAll('.gantt-aps__error').length, 1);
  assert.equal(root.textContent.includes('0min'), false);
  assert.equal(root.textContent.includes('0%'), false);
  assert.equal(root.textContent.includes('Produção 1'), false);

  const special = root.querySelectorAll('[data-allocation-id]')
    .find(item => item.dataset.allocationId === 'readonly:special:[id]:0');
  assert.ok(special);
  assert.equal(root.querySelectorAll('.gantt-aps__bar').every(bar => bar.dataset.labelDetail === 'full'), true);
  assert.deepEqual(
    new Set(root.querySelectorAll('.gantt-aps__bar').map(bar => bar.dataset.labelDetail)),
    new Set(['full']),
    'as três densidades de label devem derivar da largura temporal'
  );
  special.click();
  assert.equal(root.querySelectorAll('.gantt-aps__inspect').length, 1);
  assert.deepEqual(domModel, immutableBefore, 'inspeção não pode alterar o modelo');

  root.querySelector('[data-action="toggle-group"]').click();
  root = renderer.getRootElement();
  assert.equal(root.querySelectorAll('.gantt-aps__row--allocation').length, 0, 'grupo recolhido oculta apenas rows visuais');
  assert.equal(renderer.focusAllocation('readonly:special:[id]:0'), true, 'focus deve expandir o grupo');
  root = renderer.getRootElement();
  assert.equal(root.querySelectorAll('.gantt-aps__row--allocation').length > 0, true);

  assert.equal(renderer.focusAllocation('allocation:0:65'), true, 'focus deve navegar páginas de rows');
  root = renderer.getRootElement();
  assert.ok(root.querySelectorAll('[data-allocation-id]')
    .some(item => item.dataset.allocationId === 'allocation:0:65'));
  assert.equal(renderer.focusAllocation('allocation:2:0'), true);
  root = renderer.getRootElement();
  assert.equal(root.querySelectorAll('.gantt-aps__row--allocation')
    .filter(row => ['allocation:2:0', 'allocation:2:1'].includes(row.dataset.allocationId)).length, 2);
  assert.equal(renderer.focusAllocation('readonly:unplaced:[special]'), true);
  root = renderer.getRootElement();
  assert.ok(root.querySelectorAll('.gantt-aps__unplaced-task')
    .some(item => item.dataset.allocationId === 'readonly:unplaced:[special]'));
  assert.equal(renderer.focusAllocation('allocation:outside:horizon'), true);
  root = renderer.getRootElement();
  assert.ok(root.querySelectorAll('.gantt-aps__unplaced-task')
    .some(item => item.dataset.allocationId === 'allocation:outside:horizon'));
  assert.equal(timers.size, 1, 'somente o timer de foco atual pode permanecer');
  assert.equal(clearedTimers.length >= 1, true, 'foco anterior deve ser cancelado');

  renderer.update(domModel);
  assert.equal(container.children.length, 1, 'update deve substituir, não acumular renderer');
  root = renderer.getRootElement();
  root.querySelector('[data-action="fullscreen"]').click();
  assert.equal(fakeDocument.fullscreenElement, root);
  assert.equal(root.classList.values().has('is-fullscreen'), true);

  renderer.update({
    ...domModel,
    resources: [],
    tasks: [],
    calendar: { days: [] },
    metadata: { errors: [], visualState: {} }
  });
  assert.equal(renderer.getRootElement().querySelectorAll('.gantt-aps__empty').length, 1);
  assert.equal(container.children.length, 1);

  renderer.update(domModel);
  assert.equal(renderer.focusAllocation('readonly:special:[id]:0'), true);
  assert.equal(timers.size, 1);
  const clearedBeforeDestroy = clearedTimers.length;
  renderer.destroy();
  assert.equal(container.children.length, 0);
  assert.equal(timers.size, 0, 'destroy deve limpar todos os timers');
  assert.equal(clearedTimers.length, clearedBeforeDestroy + 1, 'destroy deve cancelar timer de foco ativo');
  assert.equal(fakeDocument.listeners.get('fullscreenchange')?.size || 0, 0);
} finally {
  globalThis.document = previousDocument;
  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
}

console.log('ganttApsRenderer.test.js ok');
