import { api } from '../shared/api.js';
import { getCurrentUser } from '../shared/api.js';
import { CalendarTimeline } from '../shared/CalendarTimeline.js';
import { ProductionCalendar, adaptPlanningResultToProductionCalendar } from '../shared/production-calendar/index.js';
import { DataTable } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';
import { createOperationOverlay, setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';
import { SummaryCards } from '../shared/SummaryCard.js';
import { PlanningStatusPill } from '../shared/StatusPill.js';
import {
  createManualScheduleDraft
} from '../services/manualScheduleDraft.service.js';
import {
  applyManualScheduleTransaction,
  isManualScheduleValidationCompatible,
  MANUAL_SCHEDULE_VALIDATION_VERSION
} from '../services/manualScheduleTransaction.service.js';

const USE_PRODUCTION_CALENDAR_V2 = true;
const DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';
const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';
const PRODUCTION_THEMES = [
  { start: '#2F343B', end: '#6B7280', soft: '#F4F6F8', border: '#2F343B', text: '#1F2937', card: '#F4F6F8' },
  { start: '#376C8A', end: '#9BBBD0', soft: '#EEF6FA', border: '#4D86A6', text: '#18384A', card: '#EEF6FA' },
  { start: '#2F7D57', end: '#8FD0AA', soft: '#ECF8F1', border: '#63B485', text: '#173D2E', card: '#ECF8F1' },
  { start: '#BD6F22', end: '#F2BF71', soft: '#FFF4E4', border: '#DE9642', text: '#56320D', card: '#FFF4E4' },
  { start: '#7B5A8E', end: '#C9B2D5', soft: '#F6F0FA', border: '#A485B7', text: '#3C294B', card: '#F6F0FA' },
  { start: '#8B4A5A', end: '#D7A1AE', soft: '#FAEEF1', border: '#B87182', text: '#4A202D', card: '#FAEEF1' },
  { start: '#2F7F7A', end: '#9ACCC8', soft: '#EAF7F6', border: '#5AA9A4', text: '#163F3D', card: '#EAF7F6' },
  { start: '#A77A16', end: '#DDBB68', soft: '#FBF5E3', border: '#C29635', text: '#4F3909', card: '#FBF5E3' },
  { start: '#3F4A54', end: '#98A2AD', soft: '#F1F4F6', border: '#64717D', text: '#202A33', card: '#F1F4F6' },
  { start: '#245D68', end: '#86B2BB', soft: '#EAF4F6', border: '#4C8993', text: '#12333A', card: '#EAF4F6' },
  { start: '#6D7A3B', end: '#B9C47B', soft: '#F3F6E7', border: '#8C9B54', text: '#343B18', card: '#F3F6E7' },
  { start: '#8A5B3E', end: '#C99B7A', soft: '#F8F0EA', border: '#AA7452', text: '#432717', card: '#F8F0EA' },
  { start: '#A65F6F', end: '#DCABB5', soft: '#FBF0F2', border: '#C88392', text: '#4F2730', card: '#FBF0F2' }
];
const PRODUCTION_THEME_SEQUENCE = [1, 3, 2, 4, 7, 6, 5, 8, 10, 9, 11, 12, 0];
const PRODUCTION_COLOR_PALETTE = [
  '#4D86A6', '#DE9642', '#63B485', '#A485B7', '#C29635', '#5AA9A4',
  '#B87182', '#64717D', '#8C9B54', '#4C8993', '#AA7452', '#C88392',
  '#2F343B', '#2563EB', '#DC2626', '#16A34A', '#9333EA', '#D97706',
  '#0F766E', '#BE123C', '#475569', '#7C3AED', '#15803D', '#B45309'
];
const DEFAULT_TEAM_AVAILABLE = 6;

const planningTabs = [
  { id: 'simulation', label: 'Simulação' },
  { id: 'history', label: 'Histórico de Planejamentos' }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '';
}

function formatDateOnly(value) {
  if (!isValidDateOnly(value)) return '';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR');
}

function isValidDateOnly(value) {
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateValue;
}

function formatPeriod(startDate, endDate) {
  const start = formatDateOnly(startDate);
  const end = formatDateOnly(endDate);
  return start && end ? `${start} at\u00e9 ${end}` : 'Per\u00edodo n\u00e3o informado';
}

function operationPeriod(operations = [], fallbackStartDate = null, fallbackEndDate = null) {
  const dates = normalizeJsonArray(operations).reduce((result, operation) => {
    const startDate = isValidDateOnly(operation?.startDate) ? operation.startDate : null;
    const endDate = isValidDateOnly(operation?.endDate) ? operation.endDate : null;
    if (startDate) result.starts.push(startDate);
    if (endDate) result.ends.push(endDate);
    return result;
  }, { starts: [], ends: [] });
  const startDate = dates.starts.sort()[0] || fallbackStartDate;
  const endDate = dates.ends.sort().at(-1) || fallbackEndDate || fallbackStartDate;
  return { startDate, endDate, label: formatPeriod(startDate, endDate) };
}

function parsePtBrDecimal(value, fallback = NaN) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return fallback;
  const timeLikeValue = rawValue.match(/^(\d+),(\d{2})$/);
  if (timeLikeValue && Number(timeLikeValue[2]) <= 59) {
    return Number(timeLikeValue[1]) + (Number(timeLikeValue[2]) / 60);
  }
  const normalizedValue = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue;
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function readStockMinimumDays() {
  const value = String(localStorage.getItem(STOCK_MINIMUM_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : null;
}

function stockProjectionSalesPerDay(row = {}) {
  const value = Number(row.sales_per_day ?? row.salesPerDayQty ?? row.salesPerDay);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stockProjectionDurationDays(row = {}) {
  const salesPerDay = stockProjectionSalesPerDay(row);
  const estimatedStock = Number(row.estimated_stock ?? row.estimatedStock);
  if (!salesPerDay || !Number.isFinite(estimatedStock)) return null;
  return Math.max(estimatedStock, 0) / salesPerDay;
}

function materialLookupKeys(row = {}) {
  return [
    row.material_id,
    row.materialId,
    row.material_name,
    row.materialName,
    row.material_code,
    row.materialCode,
    ...(Array.isArray(row.material_codes) ? row.material_codes : []),
    ...(Array.isArray(row.codes) ? row.codes : [])
  ].map(normalizeText).filter(Boolean);
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

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeJsonObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function formatPtBrDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const hasDecimals = !Number.isInteger(number);
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 3
  });
}

function stockShortageKey(item = {}) {
  return [
    item.materialId ?? '',
    item.materialCode || '',
    item.materialName || item.material || '',
    item.unit || ''
  ].join('|');
}

function collectStockShortagesFromTree(tree) {
  const grouped = new Map();
  const roots = tree && typeof tree === 'object'
    ? Array.isArray(tree.children) && isPlanningRootName(tree.materialName) ? tree.children : [tree]
    : [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    const requiredQty = Number(node.requiredQty || 0);
    const stockQty = Number(node.stockQty || 0);
    if (node.isInitialRawMaterial && requiredQty > stockQty) {
      const item = {
        materialId: node.materialId ?? null,
        materialCode: node.materialCode || '',
        materialName: node.materialName || '',
        material: node.materialName || '',
        unit: node.unit || '',
        requiredQty,
        stockQty,
        shortageQty: Math.max(requiredQty - stockQty, 0)
      };
      const key = stockShortageKey(item);
      const current = grouped.get(key);
      if (current) {
        current.requiredQty = Number((current.requiredQty + item.requiredQty).toFixed(3));
        current.stockQty = Number(Math.max(current.stockQty, item.stockQty).toFixed(3));
        current.shortageQty = Number(Math.max(current.requiredQty - current.stockQty, 0).toFixed(3));
      } else {
        grouped.set(key, {
          ...item,
          requiredQty: Number(item.requiredQty.toFixed(3)),
          stockQty: Number(item.stockQty.toFixed(3)),
          shortageQty: Number(item.shortageQty.toFixed(3))
        });
      }
    }
    (node.children || []).forEach(visit);
  }
  roots.forEach(visit);
  return [...grouped.values()];
}

function stockAuthorizationFromPlan(plan = {}, tree = null, operations = []) {
  const fromTree = normalizeJsonObject(tree || plan.schedule_tree)._stockAuthorization;
  if (fromTree && typeof fromTree === 'object') return fromTree;
  return normalizeJsonArray(operations || plan.operations).find(operation => operation?._planningMeta)?._planningMeta?.stockAuthorization || null;
}

function renderStockShortageTable(shortages = []) {
  return `
    <div class="detail-table-wrap">
      <table class="detail-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Necess&aacute;rio</th>
            <th>Saldo</th>
            <th>Falta</th>
          </tr>
        </thead>
        <tbody>
          ${shortages.map(item => `
            <tr>
              <td>${escapeHtml(item.materialName || item.material || '')}</td>
              <td>${escapeHtml(`${formatPtBrDecimal(item.requiredQty)} ${item.unit || ''}`.trim())}</td>
              <td>${escapeHtml(`${formatPtBrDecimal(item.stockQty)} ${item.unit || ''}`.trim())}</td>
              <td>${escapeHtml(`${formatPtBrDecimal(item.shortageQty)} ${item.unit || ''}`.trim())}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function canAuthorizeStockShortage(user) {
  return ['Super Admin', 'Diretor', 'Gerente'].includes(String(user?.role || '').trim());
}

function formatStatus(value) {
  const labels = {
    planned: 'Planejado',
    launched: 'Lançado',
    canceled: 'Cancelado'
  };
  return labels[String(value || '').toLowerCase()] || value || 'Sem status';
}

function isCanceledStatus(value) {
  return String(value || '').toLowerCase() === 'canceled';
}

function planningStatusPill(value) {
  const canceled = isCanceledStatus(value);
  return PlanningStatusPill(formatStatus(value), { statusClass: canceled ? 'canceled' : '' });
}

function formatDuration(minutes) {
  const total = Math.max(Math.round(Number(minutes || 0)), 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${hours}h`;
}

function formatHourDuration(value) {
  const totalMinutes = Math.max(Math.round(Number(value || 0) * 60), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} h/dia`;
}

function isPlanningRootName(value) {
  return ['Plano de producao', 'Plano de produção'].includes(String(value || ''));
}

function generatePlanningCode(productionCount = 1, date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const suffix = Number(productionCount || 0) > 1 ? String(productionCount).padStart(2, '0') : '';
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}${pad(date.getHours())}${pad(date.getMinutes())}PLANO${suffix}`;
}

function matrixSecondsPerUnit(row) {
  const outputQty = Math.max(Number(row.output_qty || 1), 1);
  const timeSeconds = Number(row.time_seconds || Number(row.time_minutes || 0) * 60);
  return timeSeconds > 0 ? timeSeconds / outputQty : 1 / outputQty;
}

function matrixPriority(row) {
  const priority = Number(row?.machine_priority || 1);
  return Number.isFinite(priority) && priority > 0 ? priority : 1;
}

function chips(values = [], emptyText = 'Sem informa&ccedil;&atilde;o') {
  const items = values.filter(Boolean);
  return items.length
    ? items.map(value => `<span class="code-pill">${escapeHtml(value)}</span>`).join('')
    : `<span class="muted-text">${emptyText}</span>`;
}

function materialLabel(material) {
  return material?.name || '';
}

function productionModelsFor(material) {
  return Array.isArray(material?.production_models) ? material.production_models.filter(model => (model.inputMaterials || []).length) : [];
}

function minutesToTime(minutes) {
  const normalized = ((Math.round(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function productiveMinutes(value, fallback = 8.8) {
  return Math.max(Math.round(parsePtBrDecimal(value, fallback) * 60), 1);
}

function formatProductiveMinutes(minutes) {
  const safeMinutes = Math.max(Math.round(Number(minutes) || 0), 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return mins ? `${hours}h${String(mins).padStart(2, '0')}` : `${hours}h`;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function defaultShift(index = 0, startTime = null) {
  const shiftStartTime = startTime || (index === 0 ? '07:00' : '17:00');
  const hoursPerDay = index === 0 ? '8,48' : '6';
  const pauseHours = '0';
  const shiftEndMinutes = timeToMinutes(shiftStartTime)
    + productiveMinutes(hoursPerDay, index === 0 ? 8.8 : 6);
  return {
    id: `shift-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: `Turno ${index + 1}`,
    hoursPerDay,
    shiftStartTime,
    pauseLabel: 'Horas de pausa',
    pauseHours,
    shiftEndTime: minutesToTime(shiftEndMinutes),
    teamAvailable: DEFAULT_TEAM_AVAILABLE
  };
}

function normalizeShiftTimes(shifts = []) {
  let cursor = timeToMinutes('07:00');
  return shifts.map((shift, index) => {
    const dailyMinutes = productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6);
    const start = index === 0 ? timeToMinutes(shift.shiftStartTime || '07:00') : cursor;
    const normalized = {
      ...shift,
      label: `Turno ${index + 1}`,
      shiftStartTime: minutesToTime(start),
      pauseLabel: 'Horas de pausa',
      pauseHours: '0',
      shiftEndTime: minutesToTime(start + dailyMinutes)
    };
    cursor = start + dailyMinutes;
    return normalized;
  });
}

function defaultTeamAvailableForShift(value, index = 0) {
  const available = Number(value ?? DEFAULT_TEAM_AVAILABLE) || DEFAULT_TEAM_AVAILABLE;
  return index === 0 ? Math.max(available, DEFAULT_TEAM_AVAILABLE) : Math.max(available, 0);
}

function emptyProduction(index = 0) {
  return {
    id: `production-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `Produ&ccedil;&atilde;o ${index + 1}`,
    color: automaticProductionColor(index),
    materialId: '',
    materialSearch: '',
    productionModelName: '',
    plannedQty: '',
    machineName: '',
    peopleCount: '',
    desiredDate: '',
    transports: []
  };
}

function automaticProductionColor(index = 0) {
  const theme = productionTheme(index);
  return theme.border;
}

function nextProductionColor(previousColor = null, index = 0) {
  const fallbackColor = automaticProductionColor(index);
  const normalizedPrevious = isHexColor(previousColor) ? String(previousColor).toUpperCase() : null;
  const paletteStart = PRODUCTION_COLOR_PALETTE.indexOf(fallbackColor);
  const startIndex = paletteStart >= 0 ? paletteStart : index % PRODUCTION_COLOR_PALETTE.length;
  for (let offset = 0; offset < PRODUCTION_COLOR_PALETTE.length; offset += 1) {
    const color = PRODUCTION_COLOR_PALETTE[(startIndex + offset) % PRODUCTION_COLOR_PALETTE.length];
    if (color !== normalizedPrevious) return color;
  }
  return fallbackColor;
}

function productionTheme(index = 0, color = null) {
  if (isHexColor(color)) {
    const border = String(color).toUpperCase();
    return {
      start: border,
      end: border,
      soft: mixHex(border, '#FFFFFF', 0.9),
      border,
      text: '#1F2937',
      card: mixHex(border, '#FFFFFF', 0.92)
    };
  }
  const sequenceIndex = PRODUCTION_THEME_SEQUENCE[index % PRODUCTION_THEME_SEQUENCE.length];
  return PRODUCTION_THEMES[sequenceIndex] || PRODUCTION_THEMES[0];
}

function productionThemeStyle(index = 0, color = null) {
  const theme = productionTheme(index, color);
  return [
    `--production-start: ${theme.start}`,
    `--production-end: ${theme.end}`,
    `--production-soft: ${theme.soft}`,
    `--production-border: ${theme.border}`,
    `--production-text: ${theme.text}`,
    `--production-card: ${theme.card || theme.soft}`
  ].join('; ');
}

function productionSegmentStyle(productions = []) {
  const items = productions.length ? productions : [{ index: 0 }];
  const step = 100 / items.length;
  const stops = items.map((item, index) => {
    const theme = productionTheme(Number(item.index || 0), item.color);
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return `${theme.border} ${start}% ${end}%`;
  }).join(', ');
  return `background: linear-gradient(90deg, ${stops});`;
}

function emptyTransport() {
  return {
    id: `transport-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    materialId: '',
    originLocationId: '',
    destinationLocationId: '',
    hours: ''
  };
}

function defaultDraft() {
  const start = today();
  return {
    planningStartDate: start,
    shifts: [defaultShift(0)],
    productions: [emptyProduction(0)],
    stockOnlyMaterials: [],
    stockOnlyMaterialChoices: [],
    operationOverrides: {},
    operationSplits: [],
    dailyTeamOverrides: {},
    setupHours: '',
    lastPayload: null,
    currentSimulation: null,
    manualScheduleDraft: null
  };
}

function normalizeDraft(rawDraft) {
  const draft = rawDraft && typeof rawDraft === 'object' ? rawDraft : {};
  const normalized = {
    ...defaultDraft(),
    ...draft,
    shifts: Array.isArray(draft.shifts) && draft.shifts.length ? draft.shifts : [defaultShift(0)],
    productions: Array.isArray(draft.productions) && draft.productions.length ? draft.productions : [emptyProduction(0)],
    stockOnlyMaterials: Array.isArray(draft.stockOnlyMaterials) ? draft.stockOnlyMaterials : [],
    stockOnlyMaterialChoices: Array.isArray(draft.stockOnlyMaterialChoices) ? draft.stockOnlyMaterialChoices : [],
    operationOverrides: draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {},
    operationSplits: Array.isArray(draft.operationSplits) ? draft.operationSplits : [],
    dailyTeamOverrides: draft.dailyTeamOverrides && typeof draft.dailyTeamOverrides === 'object' ? draft.dailyTeamOverrides : {},
    setupHours: draft.setupHours ?? '',
    lastPayload: draft.lastPayload && typeof draft.lastPayload === 'object' ? draft.lastPayload : null,
    currentSimulation: draft.currentSimulation && typeof draft.currentSimulation === 'object' ? draft.currentSimulation : null,
    manualScheduleDraft: draft.manualScheduleDraft && typeof draft.manualScheduleDraft === 'object' ? draft.manualScheduleDraft : null
  };
  normalized.shifts = normalizeShiftTimes(normalized.shifts.map((shift, index) => ({
    ...defaultShift(index, shift.shiftStartTime),
    ...shift,
    id: shift.id || `shift-${index}-${Date.now()}`,
    label: `Turno ${index + 1}`,
    pauseLabel: 'Horas de pausa',
    pauseHours: '0',
    teamAvailable: defaultTeamAvailableForShift(shift.teamAvailable, index)
  })));
  normalized.productions = normalized.productions.map((production, index) => ({
    ...emptyProduction(index),
    ...production,
    id: production.id || `production-${index}-${Date.now()}`,
    title: `Produ&ccedil;&atilde;o ${index + 1}`,
    color: isHexColor(production.color) ? String(production.color).toUpperCase() : automaticProductionColor(index),
    transports: Array.isArray(production.transports)
      ? production.transports.map((transport, transportIndex) => ({
          ...emptyTransport(),
          ...transport,
          id: transport.id || `transport-${index}-${transportIndex}-${Date.now()}`
        }))
      : []
  }));
  return normalized;
}

function loadDraft() {
  try {
    return normalizeDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'));
  } catch {
    return defaultDraft();
  }
}

function collectScheduleTreeNodes(tree) {
  const nodes = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    (Array.isArray(node.children) ? node.children : []).forEach(visit);
  };
  if (Array.isArray(tree)) tree.forEach(visit);
  else visit(tree);
  return nodes;
}

function stockFromSchedule(result) {
  const byMaterial = new Map();
  collectScheduleTreeNodes(result?.tree).forEach(node => {
    const materialId = String(node?.materialId ?? node?.material_id ?? '');
    const quantity = Number(node?.stockQty);
    if (!materialId || !Number.isFinite(quantity)) return;
    const current = byMaterial.get(materialId);
    if (!current || quantity > current.quantity) {
      byMaterial.set(materialId, {
        materialId,
        quantity,
        unit: String(node?.unit || '')
      });
    }
  });
  return [...byMaterial.values()];
}

function stockMinimumsFromMaterials(sourceMaterials) {
  return (Array.isArray(sourceMaterials) ? sourceMaterials : []).flatMap(material => {
    const value = material?.minimumQuantity ?? material?.minimum_quantity ?? material?.minimumStock ?? material?.minimum_stock;
    const minimumQuantity = Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(minimumQuantity)) return [];
    return [{ materialId: String(material.id), minimumQuantity }];
  });
}

function transportsFromOperations(operations) {
  return (Array.isArray(operations) ? operations : [])
    .filter(operation => operation?.operationType === 'transport')
    .map(operation => ({
      ...operation,
      transportId: operation.transportId || operation.operationId,
      quantity: operation.quantity ?? operation.produceQty,
      durationMinutes: operation.durationMinutes ?? operation.totalMinutes,
      sourceLocation: operation.sourceLocation ?? operation.originLocationId,
      targetLocation: operation.targetLocation ?? operation.destinationLocationId
    }));
}

export function buildManualScheduleValidationContext({
  simulation,
  materials = [],
  machines = [],
  productivityMatrix = [],
  stock,
  stockMinimums,
  stockLocations,
  dependencies,
  transports,
  shifts = [],
  dailyTeamOverrides = {},
  manualWorkDates = [],
  setupMinutes = 0,
  minimumStartRatio = 0.30,
  dependencyCompletionBufferMinutes = 60,
  holidays = [],
  timezone
} = {}) {
  const operations = Array.isArray(simulation?.operations) ? simulation.operations : [];
  return {
    operations,
    materials,
    machines,
    productivityMatrix,
    stock: stock === undefined ? stockFromSchedule(simulation) : stock,
    stockMinimums: stockMinimums === undefined ? stockMinimumsFromMaterials(materials) : stockMinimums,
    stockLocations: stockLocations === undefined ? [] : stockLocations,
    dependencies: dependencies === undefined ? [] : dependencies,
    transports: transports === undefined ? transportsFromOperations(operations) : transports,
    shifts,
    dailyTeamOverrides,
    manualWorkDates,
    setupMinutes,
    minimumStartRatio,
    dependencyCompletionBufferMinutes,
    holidays,
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

function manualScheduleIssueMessages(issueIds, validation) {
  const byId = new Map([...(validation?.errors || []), ...(validation?.warnings || [])]
    .map(item => [String(item.issueId), item]));
  return (Array.isArray(issueIds) ? issueIds : []).map(issueId => byId.get(String(issueId)))
    .filter(Boolean)
    .map(item => item.message);
}

export function buildProductionCalendarValidationSnapshot(validation, allocations = [], days = []) {
  if (!validation || validation.validationVersion !== MANUAL_SCHEDULE_VALIDATION_VERSION) return null;
  const affected = validation.affectedAllocations || { byAllocationId: {}, byDate: {} };
  const dependencyByAllocation = validation.dependencyStatus?.byAllocationId || {};
  const resourceByDate = validation.resourceProjection?.byDate || {};
  const stockTimeline = validation.stockProjection?.timeline || [];
  const issuesByAllocationId = {};
  const decoratedAllocations = allocations.map(allocation => {
    const allocationId = String(allocation.allocationId);
    const allocationIssues = affected.byAllocationId?.[allocationId] || { errors: [], warnings: [] };
    const errors = manualScheduleIssueMessages(allocationIssues.errors, validation);
    const warnings = manualScheduleIssueMessages(allocationIssues.warnings, validation);
    const stockEvents = stockTimeline.filter(item => (item.allocationIds || []).map(String).includes(allocationId));
    const stockState = stockEvents.some(item => Number(item.availableBalance) < 0) ? 'shortage' : (stockEvents.length ? 'ok' : 'unknown');
    issuesByAllocationId[allocationId] = { errors, warnings };
    return {
      ...allocation,
      errors,
      warnings,
      stockState,
      dependencyState: dependencyByAllocation[allocationId]?.state || 'ok',
      hasCapacityOverride: Boolean(allocation.isCapacityOverride)
    };
  });
  const issuesByDate = {};
  const decoratedDays = days.map(day => {
    const date = String(day.date || '');
    const dateIssues = affected.byDate?.[date] || { errors: [], warnings: [] };
    const errors = manualScheduleIssueMessages(dateIssues.errors, validation);
    const warnings = manualScheduleIssueMessages(dateIssues.warnings, validation);
    const resource = resourceByDate[date] || {};
    const materialShortages = (validation.errors || [])
      .filter(item => item.date === date && item.code?.startsWith('STOCK_'))
      .flatMap(item => item.materialIds || []);
    const daily = {
      errorCount: errors.length,
      warningCount: warnings.length,
      materialShortages: [...new Set(materialShortages)],
      teamPeak: resource.peakPeople ?? null,
      teamAvailable: resource.availablePeople ?? null,
      extraordinaryCapacity: decoratedAllocations.some(allocation => allocation.date === date && allocation.hasCapacityOverride),
      errors,
      warnings
    };
    issuesByDate[date] = daily;
    return { ...day, ...daily };
  });
  return {
    allocations: decoratedAllocations,
    days: decoratedDays,
    validation: {
      valid: validation.valid,
      issuesByAllocationId,
      issuesByDate,
      stockProjection: validation.stockProjection,
      dependencyStatus: validation.dependencyStatus,
      summary: validation.summary
    }
  };
}

export function PlanningPage() {
  const canWritePlanning = canAccess(getCurrentUser(), 'planning:write');
  const page = document.createElement('section');
  page.className = 'stack planning-page';
  page.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Planejamento</h1>
          <p>Monte o plano por per&iacute;odo, com turnos e v&aacute;rias produ&ccedil;&otilde;es.</p>
        </div>
      </div>
      <div class="internal-tabs-target"></div>
      <div class="planning-target"></div>
    `;

  const tabsTarget = page.querySelector('.internal-tabs-target');
  const target = page.querySelector('.planning-target');
  let activeTab = sessionStorage.getItem('planejamento_planning_tab') || 'simulation';
  let materials = [];
  let matrix = [];
  let locations = [];
  let draft = loadDraft();
  let lastPayload = draft.lastPayload || null;
  let currentSimulation = draft.currentSimulation || null;
  let currentPlanningStockAlerts = new Map();
  let planningStockAlertRequestId = 0;
  let productionCalendarMoveInProgress = false;
  let productionCalendarMoveRunner = null;
  let productionCalendarVisualState = {};
  let manualScheduleDraft = draft.manualScheduleDraft || null;
  let hasPendingSimulationChanges = false;
  let autosaveTimer = null;
  let recalculationTimer = null;
  let operationLoadingCount = 0;
  let operationOverlay = null;

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function setOperationLoading(active, text = 'Organizando produção...') {
    const resultsTarget = target.querySelector('.planning-results:not([hidden])');
    const loadingHost = resultsTarget || target.querySelector('.planning-builder-panel') || target;
    if (!loadingHost) return;
    loadingHost.classList.add('operation-loading-host');
    if (active) {
      operationLoadingCount += 1;
      if (!operationOverlay) {
        operationOverlay = createOperationOverlay(text);
        loadingHost.appendChild(operationOverlay);
      } else {
        operationOverlay.querySelector('p').textContent = text;
      }
      return;
    }
    operationLoadingCount = Math.max(operationLoadingCount - 1, 0);
    if (operationLoadingCount === 0 && operationOverlay) {
      operationOverlay.remove();
      operationOverlay = null;
    }
  }

  async function withOperationLoading(text, action) {
    setOperationLoading(true, text);
    try {
      return await action();
    } finally {
      setOperationLoading(false);
    }
  }

  async function simulatePlanningRequest(body) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    try {
      return await api('/planning/simulate', { method: 'POST', body, signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Falha ao simular planejamento. A simulação excedeu o tempo limite. Verifique a matriz de produtividade e tente novamente.');
      }
      const message = String(error?.message || '').trim();
      if (/failed to fetch|networkerror|abort/i.test(message)) {
        throw new Error('Falha ao simular planejamento. Verifique a matriz de produtividade e tente novamente.');
      }
      throw new Error(message || 'Falha ao simular planejamento. Verifique a matriz de produtividade e tente novamente.');
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function normalizePlanningPayload(sourcePayload = payload(), planningCode = draft.planningCode) {
    const planningStartDate = sourcePayload.planningStartDate || sourcePayload.startDate || sourcePayload.selectedDate || draft.planningStartDate;
    const planningEndDate = operationPeriod(currentSimulation?.operations, planningStartDate, sourcePayload.planningEndDate || sourcePayload.endDate).endDate;
    return {
      ...sourcePayload,
      selectedDate: planningStartDate,
      startDate: planningStartDate,
      endDate: planningEndDate,
      planningStartDate,
      planningEndDate,
      planningCode
    };
  }

  function renderTabs() {
    if (!tabsTarget) return;
    tabsTarget.innerHTML = '';
    tabsTarget.appendChild(InternalTabs(planningTabs, activeTab, tab => {
      activeTab = tab;
      sessionStorage.setItem('planejamento_planning_tab', activeTab);
      render().catch(toast);
    }));
  }

  function saveDraftNow() {
    draft.lastPayload = lastPayload;
    draft.currentSimulation = currentSimulation;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function queueAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveDraftNow, 80);
  }

  function materialById(id) {
    return materials.find(material => String(material.id) === String(id));
  }

  function matchingMatrix(material) {
    const codes = new Set((material?.codes || []).map(code => String(code).toLowerCase()));
    return matrix
      .filter(row => row.active !== false)
      .filter(row => row.material_name === material?.name || (row.material_codes || []).some(code => codes.has(String(code).toLowerCase())))
      .sort((left, right) =>
        matrixPriority(left) - matrixPriority(right)
        || matrixSecondsPerUnit(left) - matrixSecondsPerUnit(right)
      );
  }

  function hydrateProductionDefaults(production) {
    const material = materialById(production.materialId);
    if (!material) return;
    const models = productionModelsFor(material);
    if (!production.productionModelName && models[0]) production.productionModelName = models[0].name;
    const rows = matchingMatrix(material);
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    if (!production.machineName && machines[0]) production.machineName = machines[0];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(value => value !== null && value !== undefined && value !== ''))];
    if ((production.peopleCount === null || production.peopleCount === undefined || production.peopleCount === '') && people.length) production.peopleCount = String(people[0]);
  }

  async function loadLookups() {
    [materials, matrix, locations] = await Promise.all([api('/materials'), api('/productivity'), api('/locations')]);
  }

  function productionMaterialOptions(production) {
    const root = materialById(production.materialId);
    if (!root) return [];
    const seen = new Set();
    const result = [];

    function visit(material) {
      if (!material || seen.has(String(material.id))) return;
      seen.add(String(material.id));
      result.push(material);
      const models = productionModelsFor(material);
      const selectedModel = models.find(model =>
        String(model.name) === String(material.id === root.id ? production.productionModelName : '')
      ) || models[0];
      (selectedModel?.inputMaterials || []).forEach(input => visit(materialById(input.materialId || input.id)));
    }

    visit(root);
    return result;
  }

  function locationOptions(selectedId) {
    return locations.map(location => `
      <option value="${location.id}" ${String(location.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(location.name)}</option>
    `).join('');
  }

  function productionPayload() {
    return draft.productions.map((production, index) => {
      hydrateProductionDefaults(production);
      const material = materialById(production.materialId);
      return {
        materialId: Number(production.materialId),
        color: isHexColor(production.color) ? production.color : automaticProductionColor(index),
        materialCode: material?.codes?.[0] || '',
        plannedQty: Number(production.plannedQty),
        plannedUnit: material?.primary_unit || 'un',
        machineName: production.machineName,
        peopleCount: Number(production.peopleCount),
        desiredDate: production.desiredDate || null,
        productionModelName: production.productionModelName,
        transports: (production.transports || []).map(transport => ({
          materialId: Number(transport.materialId),
          originLocationId: Number(transport.originLocationId),
          destinationLocationId: Number(transport.destinationLocationId),
          hours: parsePtBrDecimal(transport.hours, 0)
        })).filter(transport =>
          transport.materialId
          && transport.originLocationId
          && transport.destinationLocationId
          && transport.hours > 0
        )
      };
    });
  }

  function payload() {
    const firstProduction = draft.productions[0] || {};
    const firstMaterial = materialById(firstProduction.materialId);
    return {
      dateMode: 'start',
      selectedDate: draft.planningStartDate,
      startDate: draft.planningStartDate,
      planningStartDate: draft.planningStartDate,
      materialId: Number(firstProduction.materialId),
      materialCode: firstMaterial?.codes?.[0] || '',
      plannedQty: Number(firstProduction.plannedQty),
      plannedUnit: firstMaterial?.primary_unit || 'un',
      machineName: firstProduction.machineName,
      peopleCount: Number(firstProduction.peopleCount),
      productionModelName: firstProduction.productionModelName,
      shifts: normalizeShiftTimes(draft.shifts).map((shift, index) => ({
        label: shift.label,
        hoursPerDay: String(shift.hoursPerDay || '').trim() || '8,48',
        shiftStartTime: shift.shiftStartTime,
        pauseLabel: shift.pauseLabel,
        pauseHours: '0',
        shiftEndTime: shift.shiftEndTime,
        teamAvailable: defaultTeamAvailableForShift(shift.teamAvailable, index)
      })),
      setupHours: parsePtBrDecimal(draft.setupHours, 0),
      productions: productionPayload(),
      stockOnlyMaterials: stockOnlyMaterialsForPayload(),
      operationOverrides: draft.operationOverrides || {},
      operationSplits: draft.operationSplits || [],
      dailyTeamOverrides: draft.dailyTeamOverrides || {},
      planningCode: draft.planningCode || null
    };
  }

  function productionColorByIndex(index = 0) {
    const production = draft.productions[Number(index) || 0];
    return isHexColor(production?.color) ? String(production.color).toUpperCase() : automaticProductionColor(index);
  }

  function withProductionColors(result) {
    if (!result || typeof result !== 'object') return result;
    const colorForIndex = index => productionColorByIndex(Math.floor(Number(index) || 0));
    const colorNode = node => {
      if (!node || typeof node !== 'object') return node;
      const productionIndex = Number(node.productionIndex || 0);
      return {
        ...node,
        productionColor: isHexColor(node.productionColor) ? node.productionColor : colorForIndex(productionIndex),
        children: Array.isArray(node.children) ? node.children.map(colorNode) : []
      };
    };
    return {
      ...result,
      summary: {
        ...(result.summary || {}),
        dailyTeamOverrides: draft.dailyTeamOverrides || {},
        productions: (result.summary?.productions || []).map(production => ({
          ...production,
          color: isHexColor(production.color) ? production.color : colorForIndex(production.productionIndex)
        }))
      },
      tree: colorNode(result.tree),
      operations: (result.operations || []).map(operation => ({
        ...operation,
        productionColor: isHexColor(operation.productionColor) ? operation.productionColor : colorForIndex(operation.productionIndex),
        productionBreakdown: Array.isArray(operation.productionBreakdown)
          ? operation.productionBreakdown.map(item => ({
              ...item,
              productionColor: isHexColor(item.productionColor) ? item.productionColor : colorForIndex(item.productionIndex)
            }))
          : operation.productionBreakdown
      })),
      calendarOperations: (result.calendarOperations || []).map(operation => ({
        ...operation,
        productionColor: isHexColor(operation.productionColor) ? operation.productionColor : colorForIndex(operation.productionIndex),
        productionBreakdown: Array.isArray(operation.productionBreakdown)
          ? operation.productionBreakdown.map(item => ({
              ...item,
              productionColor: isHexColor(item.productionColor) ? item.productionColor : colorForIndex(item.productionIndex)
            }))
          : operation.productionBreakdown
      }))
    };
  }

  function operationOverrideKeys(change) {
    const keys = [];
    const operationId = String(change.operationId || '');
    const materialId = String(change.materialId || '');
    const productionIndex = Number(change.productionIndex || 0);
    const scopedKey = materialId ? `${productionIndex}:${materialId}` : '';
    [operationId, scopedKey, materialId].forEach(key => {
      if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
  }

  function cloneDraftPlanningState() {
    return {
      operationOverrides: JSON.parse(JSON.stringify(draft.operationOverrides || {})),
      operationSplits: JSON.parse(JSON.stringify(draft.operationSplits || [])),
      manualScheduleDraft: manualScheduleDraft ? JSON.parse(JSON.stringify(manualScheduleDraft)) : null,
      lastPayload: lastPayload ? JSON.parse(JSON.stringify(lastPayload)) : null,
      currentSimulation: currentSimulation ? JSON.parse(JSON.stringify(currentSimulation)) : null
    };
  }

  function restoreDraftPlanningState(snapshot) {
    draft.operationOverrides = snapshot.operationOverrides;
    draft.operationSplits = snapshot.operationSplits;
    manualScheduleDraft = snapshot.manualScheduleDraft || null;
    lastPayload = snapshot.lastPayload;
    currentSimulation = snapshot.currentSimulation;
    draft.lastPayload = lastPayload;
    draft.currentSimulation = currentSimulation;
    draft.manualScheduleDraft = manualScheduleDraft;
    saveDraftNow();
    refreshTimelineOnly();
  }

  function findSimulationOperation(detail = {}) {
    const candidates = [detail.operationId, detail.sourceOperationId]
      .filter(Boolean)
      .map(String);
    const operations = Array.isArray(currentSimulation?.operations) ? currentSimulation.operations : [];
    return operations.find(operation => {
      const operationId = String(operation.operationId || operation.materialId);
      return candidates.includes(operationId);
    }) || operations.find(operation =>
      String(operation.materialId || '') === String(detail.materialId || '')
      && Number(operation.productionIndex || 0) === Number(detail.productionIndex || 0)
    ) || null;
  }

  function treeForProductionIndex(tree, productionIndex) {
    const index = Number(productionIndex || 0);
    const roots = tree?.children?.length && isPlanningRootName(tree.materialName) ? tree.children : tree ? [tree] : [];
    return roots.find(node => Number(node.productionIndex || 0) === index) || roots[0] || null;
  }

  function hasMinimumRawMaterialForStart(tree, productionIndex) {
    const root = treeForProductionIndex(tree, productionIndex);
    let hasEnough = true;
    function visit(node) {
      if (!node || !hasEnough) return;
      const requiredQty = Number(node.requiredQty || 0);
      const stockQty = Number(node.stockQty || 0);
      if (node.isInitialRawMaterial && requiredQty > 0 && stockQty < requiredQty * 0.3) {
        hasEnough = false;
        return;
      }
      (node.children || []).forEach(visit);
    }
    visit(root);
    return hasEnough;
  }

  function matchingDropOption(operation = {}, machineName = '') {
    const options = Array.isArray(operation.productivityOptions) ? operation.productivityOptions : [];
    return options.find(option =>
      String(option.machineName || '') === String(machineName || '')
      && Number(option.peopleCount || 0) === Number(operation.peopleCount || 0)
    ) || options.find(option => String(option.machineName || '') === String(machineName || '')) || null;
  }

  function splitKeyForOperation(operation = {}, detail = {}) {
    return String(operation.splitParentOperationId || detail.operationId || operation.operationId || operation.materialId);
  }

  function stripDailyOperationSuffix(value) {
    return String(value || '').replace(/:day-\d+$/i, '');
  }

  function productionCalendarParentOperationId(allocation = {}) {
    return String(
      allocation.calendarParentOperationId
      || allocation.parentOperationId
      || stripDailyOperationSuffix(allocation.operationId)
      || ''
    );
  }

  function productionCalendarAllocationsForParent(snapshot, parentOperationId) {
    const parentKey = String(parentOperationId || '');
    if (!parentKey) return [];
    return (snapshot?.allocations || [])
      .filter(item => productionCalendarParentOperationId(item) === parentKey);
  }

  function productionCalendarAllocationLabel(allocation = {}) {
    return [
      allocation.materialName,
      allocation.materialCode,
      allocation.productionId,
      allocation.operationId
    ].find(value => String(value || '').trim()) || 'Produção';
  }

  function nextProductionCalendarDateAfter(snapshot, date) {
    const nextVisibleWorkingDay = (snapshot?.days || [])
      .map(day => day?.date)
      .filter(dayDate => isValidDateOnly(dayDate) && dayDate > date)
      .find(dayDate => {
        const day = (snapshot?.days || []).find(item => item?.date === dayDate);
        return day?.isWorkingDay !== false;
      });
    return nextVisibleWorkingDay || addDays(date, 1);
  }

  function showProductionReplacementConfirmation({ draggedAllocation, occupiedAllocation }) {
    page.querySelector('.production-replacement-modal')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop production-replacement-modal';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="production-replacement-title">
        <div class="modal-header">
          <div>
            <h3 id="production-replacement-title">Substituir produção programada</h3>
          </div>
          <button class="link-button cancel-replacement" type="button">Cancelar</button>
        </div>
        <p>Este período já possui ${escapeHtml(productionCalendarAllocationLabel(occupiedAllocation))}.</p>
        <p>Ao inserir ${escapeHtml(productionCalendarAllocationLabel(draggedAllocation))} neste local:</p>
        <ul>
          <li>a produção existente será reagendada;</li>
          <li>o planejamento será recalculado;</li>
          <li>outras datas poderão ser afetadas.</li>
        </ul>
        <div class="form-actions modal-actions">
          <button class="secondary-button cancel-replacement" type="button">Cancelar</button>
          <button class="primary-button confirm-replacement" type="button">Substituir e recalcular</button>
        </div>
      </div>
    `;
    return new Promise(resolve => {
      const close = confirmed => {
        backdrop.remove();
        resolve(Boolean(confirmed));
      };
      backdrop.querySelectorAll('.cancel-replacement').forEach(button => {
        button.addEventListener('click', () => close(false));
      });
      backdrop.querySelector('.confirm-replacement')?.addEventListener('click', () => close(true));
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close(false);
      });
      backdrop.addEventListener('keydown', event => {
        if (event.key === 'Escape') close(false);
      });
      page.appendChild(backdrop);
      backdrop.querySelector('.confirm-replacement')?.focus();
    });
  }

  function applyDropPlanningChange(detail = {}) {
    const operation = findSimulationOperation(detail);
    if (!operation && !detail.materialId) throw new Error('Segmento inexistente.');
    const baseOperation = operation || detail;
    const option = matchingDropOption(baseOperation, detail.machineName);
    const machineName = option?.machineName || detail.machineName || baseOperation.machineName;
    const peopleCount = Number(option?.peopleCount ?? detail.peopleCount ?? baseOperation.peopleCount ?? 0);
    const override = {
      startDate: detail.startDate,
      startTime: detail.startTime || baseOperation.startTime || '07:00',
      machineName,
      peopleCount,
      productionModelName: detail.productionModelName || baseOperation.productionModelName || null
    };
    draft.operationOverrides = draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {};
    operationOverrideKeys({
      operationId: splitKeyForOperation(baseOperation, detail),
      materialId: detail.materialId || baseOperation.materialId,
      productionIndex: detail.productionIndex ?? baseOperation.productionIndex
    }).forEach(key => {
      draft.operationOverrides[key] = {
        ...(draft.operationOverrides[key] || {}),
        ...override
      };
    });
  }

  function validateDraft(form) {
    if (!draft.planningStartDate) {
      form.reportValidity();
      return false;
    }
    const invalidProduction = draft.productions.find(production => !materialById(production.materialId) || !(Number(production.plannedQty) > 0));
    if (invalidProduction) {
      toast('Selecione material e quantidade maior que zero em todas as produções.');
      return false;
    }
    const invalidDesiredDate = draft.productions.find(production =>
      production.desiredDate
      && production.desiredDate < draft.planningStartDate
    );
    if (invalidDesiredDate) {
      toast('A data desejada deve ser maior ou igual à data inicial do planejamento.');
      return false;
    }
    const invalidShift = draft.shifts.find(shift =>
      !(parsePtBrDecimal(shift.hoursPerDay, 0) > 0)
      || !(Number(shift.teamAvailable) > 0)
    );
    if (invalidShift) {
      toast(!(Number(invalidShift.teamAvailable) > 0)
        ? 'Informe a equipe disponível do turno.'
        : 'Revise os horários e pausas dos turnos.');
      return false;
    }
    if (String(draft.setupHours || '').trim() && parsePtBrDecimal(draft.setupHours, -1) < 0) {
      toast('Informe o tempo de setup com valor maior ou igual a zero.');
      return false;
    }
    const invalidTransport = draft.productions.some(production => {
      const activeTransports = (production.transports || []).filter(transport =>
        transport.materialId
        || transport.originLocationId
        || transport.destinationLocationId
        || String(transport.hours || '').trim()
      );
      return activeTransports.some(transport =>
        !materialById(transport.materialId)
        || !locations.some(location => String(location.id) === String(transport.originLocationId))
        || !locations.some(location => String(location.id) === String(transport.destinationLocationId))
        || !(parsePtBrDecimal(transport.hours, 0) > 0)
      );
    });
    if (invalidTransport) {
      toast('Revise material, origem, destino e tempo dos transportes.');
      return false;
    }
    return true;
  }

  function materialMatches(material, searchValue) {
    const haystack = [
      material.name,
      ...(material.codes || [])
    ].map(value => String(value || '').toLowerCase());
    return haystack.some(value => value.includes(searchValue));
  }

  function renderShift(shift, index) {
    return `
      <article class="planning-subcard shift-card" data-shift-id="${shift.id}">
        <div class="planning-subcard-header">
          <h3>Turno ${index + 1}</h3>
          ${index > 0 ? '<button class="link-button danger remove-shift" type="button">Excluir turno</button>' : ''}
        </div>
        <div class="grid-form planning-inner-grid">
          <label>Horas/dia<input name="hoursPerDay" type="text" inputmode="decimal" value="${escapeHtml(shift.hoursPerDay)}" /></label>
          <label>Equipe dispon&iacute;vel<input name="teamAvailable" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(shift.teamAvailable)}" required /></label>
        </div>
      </article>
    `;
  }

  function renderShiftSummary() {
    const rows = normalizeShiftTimes(draft.shifts).map((shift, index) => {
      const minutes = productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6);
      return `<p><strong>Turno ${index + 1}:</strong> ${formatProductiveMinutes(minutes)}</p>`;
    });
    const totalMinutes = normalizeShiftTimes(draft.shifts)
      .reduce((sum, shift, index) => sum + productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6), 0);
    return `
      <aside class="shift-productive-summary" aria-label="Resumo de horas produtivas">
        ${rows.join('')}
        <p class="shift-productive-total"><strong>Total produtivo di&aacute;rio:</strong> ${formatProductiveMinutes(totalMinutes)}</p>
      </aside>
    `;
  }

  function renderSetupField() {
    return `
      <div class="grid-form planning-inner-grid planning-compact-field-grid planning-setup-grid">
        <label>Tempo de setup por troca de material (horas)
          <input name="setupHours" type="text" inputmode="decimal" placeholder="1,5" value="${escapeHtml(draft.setupHours)}" />
        </label>
      </div>
    `;
  }

  function importedProductionWarning(production, material, rows) {
    if (production.source !== 'Assistente PCP') return '';
    if (!material) return 'Material importado não encontrado nos cadastros.';
    if (!(Number(production.plannedQty) > 0)) return 'Quantidade sugerida não estimada.';
    if (!rows.length) return 'Sem matriz de produtividade.';
    if (production.machineName && !rows.some(row => String(row.machine_name) === String(production.machineName))) return 'Máquina sugerida indisponível para este material.';
    if (production.peopleCount !== null && production.peopleCount !== undefined && production.peopleCount !== '' && !rows.some(row => String(row.people_count) === String(production.peopleCount))) return 'Pessoas sugeridas indisponíveis para este material.';
    if (production.sourceObservation && !/pronto para/i.test(String(production.sourceObservation))) return production.sourceObservation;
    return '';
  }

  function renderProduction(production, index) {
    hydrateProductionDefaults(production);
    const material = materialById(production.materialId);
    const rows = matchingMatrix(material);
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(value => value !== null && value !== undefined && value !== ''))];
    const models = productionModelsFor(material);
    const transportMaterials = productionMaterialOptions(production);
    const selectedColor = isHexColor(production.color) ? production.color : automaticProductionColor(index);
    const themeStyle = productionThemeStyle(index, selectedColor);
    const sourceBadge = production.source === 'Assistente PCP'
      ? '<span class="production-source-badge">Origem: Assistente PCP</span>'
      : '';
    const sourceWarning = importedProductionWarning(production, material, rows);
    const transportRows = (production.transports || []).map((transport, transportIndex) => `
      <article class="transport-row" data-transport-id="${transport.id}">
        <label>Material transportado
          <select name="materialId">
            <option value="">Selecione</option>
            ${transportMaterials.map(item => `<option value="${item.id}" ${String(item.id) === String(transport.materialId) ? 'selected' : ''}>${escapeHtml(materialLabel(item))}</option>`).join('')}
          </select>
        </label>
        <label>Origem
          <select name="originLocationId">
            <option value="">Selecione</option>
            ${locationOptions(transport.originLocationId)}
          </select>
        </label>
        <label>Destino
          <select name="destinationLocationId">
            <option value="">Selecione</option>
            ${locationOptions(transport.destinationLocationId)}
          </select>
        </label>
        <label>Tempo de transporte (horas)
          <input name="hours" type="text" inputmode="decimal" placeholder="4" value="${escapeHtml(transport.hours)}" />
        </label>
        <button class="link-button danger remove-transport" type="button">Remover</button>
      </article>
    `).join('');
    return `
      <article class="planning-subcard production-block" data-production-id="${production.id}" style="${themeStyle}">
        <div class="planning-subcard-header">
          <h3 class="production-title"><button class="production-gradient-key production-color-trigger" type="button" data-color-trigger aria-label="Alterar cor da Produ&ccedil;&atilde;o ${index + 1}" title="Alterar cor" style="${themeStyle}"></button>Produ&ccedil;&atilde;o ${index + 1}</h3>
          ${draft.productions.length > 1 ? '<button class="link-button danger remove-production" type="button">Excluir produ&ccedil;&atilde;o</button>' : ''}
        </div>
        ${sourceBadge || sourceWarning ? `
          <div class="production-source-row">
            ${sourceBadge}
            ${sourceWarning ? `<span class="production-source-warning">${escapeHtml(sourceWarning)}</span>` : ''}
          </div>
        ` : ''}
        <div class="grid-form planning-inner-grid">
          <label>Material
            <div class="material-autocomplete">
              <input name="materialSearch" type="search" autocomplete="off" placeholder="Digite para pesquisar" value="${escapeHtml(production.materialSearch || materialLabel(material))}" required />
              <div class="material-suggestions" hidden></div>
            </div>
            <input name="materialId" type="hidden" value="${escapeHtml(production.materialId)}" />
          </label>
          <div class="readonly-field">
            <span>C&oacute;digo</span>
            <div class="material-codes readonly-chip-list">${chips(material?.codes || [], 'Sem c&oacute;digos')}</div>
          </div>
          <div class="readonly-field">
            <span>Unidade</span>
            <div class="material-unit readonly-chip-list">${chips([material?.primary_unit])}</div>
          </div>
          <label>Modelo de produ&ccedil;&atilde;o
            <select name="productionModelName" ${!material || models.length <= 1 ? 'disabled data-locked="true"' : ''}>
              ${models.length
                ? models.map(model => `<option value="${escapeHtml(model.name)}" ${String(model.name) === String(production.productionModelName) ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('')
                : '<option value="">Sem modelo</option>'}
            </select>
          </label>
          <label>Quantidade<input name="plannedQty" type="number" step="0.001" value="${escapeHtml(production.plannedQty)}" required /></label>
          <label>M&aacute;quina
            <select name="machineName" ${!material || machines.length <= 1 ? 'disabled data-locked="true"' : ''}>
              ${machines.length
                ? machines.map(machine => `<option value="${escapeHtml(machine)}" ${String(machine) === String(production.machineName) ? 'selected' : ''}>${escapeHtml(machine)}</option>`).join('')
                : '<option value="">Selecione um material</option>'}
            </select>
          </label>
          <label>Pessoas
            <select name="peopleCount" ${!material || people.length <= 1 ? 'disabled data-locked="true"' : ''}>
              ${people.length
                ? people.map(value => `<option value="${value}" ${String(value) === String(production.peopleCount) ? 'selected' : ''}>${value}</option>`).join('')
                : '<option value="">Selecione um material</option>'}
            </select>
          </label>
          <label>Data desejada
            <input name="desiredDate" type="date" min="${escapeHtml(draft.planningStartDate)}" value="${escapeHtml(production.desiredDate)}" />
          </label>
        </div>
        <section class="transport-section">
          <div class="planning-subcard-header">
            <h3>Transportes</h3>
            <button class="secondary-button add-transport" type="button">+ Adicionar transporte</button>
          </div>
          <div class="transport-list">
            ${transportRows || '<div class="empty-state compact">Nenhum transporte cadastrado.</div>'}
          </div>
        </section>
      </article>
    `;
  }

  function stockOnlyKey(productionIndex, materialId) {
    return `${Number(productionIndex || 0)}:${Number(materialId)}`;
  }

  function stockOnlyMaterialsForPayload() {
    const finalProducts = new Set(draft.productions.map((production, index) =>
      stockOnlyKey(index, production.materialId)
    ));
    return (draft.stockOnlyMaterials || []).filter(item =>
      !finalProducts.has(stockOnlyKey(item.productionIndex, item.materialId))
    );
  }

  function stockOnlyChecked(productionIndex, materialId) {
    return (draft.stockOnlyMaterials || []).some(item =>
      Number(item.productionIndex) === Number(productionIndex)
      && String(item.materialId) === String(materialId)
    );
  }

  function stockOnlyChoice(productionIndex, materialId) {
    return (draft.stockOnlyMaterialChoices || []).find(item =>
      Number(item.productionIndex) === Number(productionIndex)
      && String(item.materialId) === String(materialId)
    ) || null;
  }

  function setStockOnlyChoice(productionIndexes, materialId, useStock) {
    const indexSet = new Set(productionIndexes.map(value => Number(value)));
    draft.stockOnlyMaterialChoices = (draft.stockOnlyMaterialChoices || []).filter(item =>
      !(indexSet.has(Number(item.productionIndex)) && Number(item.materialId) === Number(materialId))
    );
    productionIndexes.forEach(productionIndex => {
      draft.stockOnlyMaterialChoices.push({
        productionIndex,
        materialId,
        useStock: useStock === true
      });
    });
  }

  function hasStockAvailable(node) {
    return Number(node?.stockQty || 0) > 0;
  }

  function consolidatedStockOnlyChecked(productions, materialId) {
    return productions.length > 0 && productions.every(production => stockOnlyChecked(production.index, materialId));
  }

  function productionFlowTrees(result) {
    return result?.tree?.children?.length && isPlanningRootName(result.tree.materialName)
      ? result.tree.children
      : result?.tree ? [result.tree] : [];
  }

  function stockOnlyNodeKey(node) {
    return stockOnlyKey(Number(node?.productionIndex || 0), node?.materialId);
  }

  function stockOnlyMaterialsFromSimulation(result) {
    const nextByKey = new Map();
    function visit(node, isFinalProduct = false) {
      if (!node || typeof node !== 'object') return;
      if (!isFinalProduct && !node.isInitialRawMaterial && hasStockAvailable(node)) {
        const productionIndex = Number(node.productionIndex || 0);
        const materialId = Number(node.materialId);
        const manualChoice = stockOnlyChoice(productionIndex, materialId);
        const shouldUseStock = manualChoice ? manualChoice.useStock === true : true;
        if (shouldUseStock && Number.isFinite(materialId)) {
          nextByKey.set(`${productionIndex}:${materialId}`, { productionIndex, materialId });
        }
      }
      (node.children || []).forEach(child => visit(child, false));
    }
    productionFlowTrees(result).forEach(root => visit(root, true));
    return [...nextByKey.values()];
  }

  function normalizeStockOnlyMaterials(items = []) {
    return [...new Set(items.map(item => `${Number(item.productionIndex || 0)}:${Number(item.materialId)}`))]
      .filter(key => !key.endsWith(':NaN'))
      .sort();
  }

  function syncStockOnlyMaterialsFromSimulation(result) {
    const next = stockOnlyMaterialsFromSimulation(result);
    const currentKeys = normalizeStockOnlyMaterials(draft.stockOnlyMaterials || []);
    const nextKeys = normalizeStockOnlyMaterials(next);
    const changed = currentKeys.length !== nextKeys.length || currentKeys.some((key, index) => key !== nextKeys[index]);
    if (changed) draft.stockOnlyMaterials = next;
    return changed;
  }

  function flowNodeKey(node) {
    return String(node.materialId ?? node.materialCode ?? node.materialName);
  }

  function normalizedFlowQuantities(node) {
    const stockUsedQty = Number(node.stockUsedQty || 0);
    const produceQty = Number(node.produceQty || 0);
    const requiredQty = Math.max(Number(node.requiredQty || 0), stockUsedQty + produceQty);
    return {
      requiredQty,
      stockUsedQty: Math.min(stockUsedQty, requiredQty),
      produceQty: Math.min(produceQty, requiredQty)
    };
  }

  function mergeFlowNode(targetNode, sourceNode) {
    const productionKey = String(sourceNode.productionKey || `production-${Number(sourceNode.productionIndex || 0)}`);
    const sourceQuantities = normalizedFlowQuantities(sourceNode);
    if (!targetNode.productionKeys.has(productionKey)) {
      targetNode.requiredQty = Number(targetNode.requiredQty || 0) + sourceQuantities.requiredQty;
      targetNode.stockUsedQty = Number(targetNode.stockUsedQty || 0) + sourceQuantities.stockUsedQty;
      targetNode.produceQty = Number(targetNode.produceQty || 0) + sourceQuantities.produceQty;
    } else {
      targetNode.requiredQty = Math.max(Number(targetNode.requiredQty || 0), sourceQuantities.requiredQty);
      targetNode.stockUsedQty = Math.max(Number(targetNode.stockUsedQty || 0), sourceQuantities.stockUsedQty);
      targetNode.produceQty = Math.max(Number(targetNode.produceQty || 0), sourceQuantities.produceQty);
    }
    targetNode.stockQty = Math.max(Number(targetNode.stockQty || 0), Number(sourceNode.stockQty || 0));
    targetNode.forceStockOnly = targetNode.forceStockOnly || sourceNode.forceStockOnly;
    targetNode.isInitialRawMaterial = targetNode.isInitialRawMaterial || sourceNode.isInitialRawMaterial;
    targetNode.productionKeys.add(productionKey);
    if (!targetNode.productions.some(item => item.key === productionKey)) {
      targetNode.productions.push({
        key: productionKey,
        index: Number(sourceNode.productionIndex || 0),
        title: sourceNode.productionTitle || `Produ&ccedil;&atilde;o ${Number(sourceNode.productionIndex || 0) + 1}`,
        color: sourceNode.productionColor
      });
      targetNode.productions.sort((left, right) => Number(left.index || 0) - Number(right.index || 0));
    }
  }

  function buildFlowGraph(roots) {
    const rootNodes = Array.isArray(roots) ? roots.filter(Boolean) : [roots].filter(Boolean);
    const finalProductKeys = new Set(rootNodes.map(stockOnlyNodeKey));
    const nodes = new Map();
    const incoming = new Map();
    const outgoing = new Map();

    function ensureNode(node) {
      const key = flowNodeKey(node);
      if (!nodes.has(key)) {
        const productionKey = String(node.productionKey || `production-${Number(node.productionIndex || 0)}`);
        const quantities = normalizedFlowQuantities(node);
        nodes.set(key, {
          ...node,
          ...quantities,
          flowKey: key,
          flowOrder: nodes.size,
          isFinalProduct: finalProductKeys.has(stockOnlyNodeKey(node)),
          children: [],
          productionKeys: new Set([productionKey]),
          productions: [{
            key: productionKey,
            index: Number(node.productionIndex || 0),
            title: node.productionTitle || `Produ&ccedil;&atilde;o ${Number(node.productionIndex || 0) + 1}`,
            color: node.productionColor
          }]
        });
        incoming.set(key, new Set());
        outgoing.set(key, new Set());
      } else {
        const targetNode = nodes.get(key);
        mergeFlowNode(targetNode, node);
        targetNode.isFinalProduct = targetNode.isFinalProduct || finalProductKeys.has(stockOnlyNodeKey(node));
      }
      return key;
    }

    function visit(node, parentKey = null, stack = []) {
      if (!node) return;
      const key = ensureNode(node);
      if (parentKey && parentKey !== key) {
        incoming.get(parentKey).add(key);
        outgoing.get(key).add(parentKey);
      }
      if (stack.includes(key)) return;
      (node.children || []).forEach(child => visit(child, key, [...stack, key]));
    }

    rootNodes.forEach(root => visit(root));
    const levels = new Map();
    const sourceKeys = [...nodes.keys()].filter(key => !(incoming.get(key)?.size));

    function assignLevel(key, level, stack = []) {
      if (stack.includes(key)) return;
      levels.set(key, Math.max(levels.get(key) ?? 0, level));
      for (const childKey of outgoing.get(key) || []) {
        assignLevel(childKey, level + 1, [...stack, key]);
      }
    }

    sourceKeys.forEach(key => assignLevel(key, 0));
    const columns = [];
    for (const [key, node] of nodes.entries()) {
      const level = levels.get(key) ?? 0;
      if (!columns[level]) columns[level] = [];
      columns[level].push(node);
    }
    columns.forEach(column => column.sort((left, right) => Number(left.flowOrder || 0) - Number(right.flowOrder || 0)));
    const edges = [];
    for (const [from, children] of outgoing.entries()) {
      for (const to of children) edges.push({ from, to });
    }
    const plainColumns = columns.map(column => column.map(node => {
      const { productionKeys, ...plainNode } = node;
      return plainNode;
    }));
    return { columns: plainColumns, edges };
  }

  function clearProductionMaterialDecisions(productionIndex) {
    draft.stockOnlyMaterials = (draft.stockOnlyMaterials || [])
      .filter(item => Number(item.productionIndex) !== Number(productionIndex));
    draft.stockOnlyMaterialChoices = (draft.stockOnlyMaterialChoices || [])
      .filter(item => Number(item.productionIndex) !== Number(productionIndex));
    draft.operationSplits = (draft.operationSplits || [])
      .filter(item => Number(item.productionIndex || 0) !== Number(productionIndex));
  }

  function removeProductionScopedState(removedIndex) {
    if (removedIndex < 0) return;
    const activeMaterialIds = new Set();
    draft.productions.forEach(production => {
      productionMaterialOptions(production).forEach(material => activeMaterialIds.add(String(material.id)));
    });
    const reindex = item => {
      const currentIndex = Number(item.productionIndex || 0);
      return currentIndex > removedIndex ? { ...item, productionIndex: currentIndex - 1 } : item;
    };
    draft.stockOnlyMaterials = (draft.stockOnlyMaterials || [])
      .filter(item => Number(item.productionIndex || 0) !== removedIndex)
      .map(reindex);
    draft.stockOnlyMaterialChoices = (draft.stockOnlyMaterialChoices || [])
      .filter(item => Number(item.productionIndex || 0) !== removedIndex)
      .map(reindex);
    draft.operationSplits = (draft.operationSplits || [])
      .filter(item => Number(item.productionIndex || 0) !== removedIndex)
      .map(reindex);
    draft.operationOverrides = Object.fromEntries(Object.entries(draft.operationOverrides || {})
      .filter(([key]) => !key.startsWith(`${removedIndex}:`))
      .filter(([key]) => key.includes(':') || activeMaterialIds.has(String(key)))
      .map(([key, value]) => {
        const match = key.match(/^(\d+):(.*)$/);
        if (!match || Number(match[1]) <= removedIndex) return [key, value];
        return [`${Number(match[1]) - 1}:${match[2]}`, value];
      }));
    currentSimulation = null;
    manualScheduleDraft = null;
    lastPayload = null;
    draft.manualScheduleDraft = null;
    hasPendingSimulationChanges = false;
    clearTimeout(recalculationTimer);
    clearTimeout(autosaveTimer);
  }

  function flowNodeStatus(node, checked, produceQty, stockUsedQty, stockQty, requiredQty) {
    if (node.isInitialRawMaterial) {
      if (stockQty >= requiredQty) return { label: 'Estoque suficiente', className: 'stock-ok' };
      return { label: stockQty > 0 ? 'Estoque insuficiente' : 'Comprar / mat&eacute;ria-prima inicial', className: 'raw-warning' };
    }
    if (checked && produceQty <= 0) return { label: 'Estoque atende', className: 'stock-ok' };
    if (checked && stockUsedQty > 0) return { label: 'Utilizando saldo', className: 'using-stock' };
    if (produceQty > 0) return { label: checked ? 'Precisa produzir' : 'Produ&ccedil;&atilde;o cheia', className: checked ? 'needs-production' : 'full-production' };
    return { label: 'Estoque atende', className: 'stock-ok' };
  }

  function nodeUsesStockBalance(node) {
    if (!node || node.isInitialRawMaterial || node.isFinalProduct === true) return false;
    const requiredQty = Number(node.requiredQty || 0);
    const produceQty = Number(node.produceQty || 0);
    const stockUsedQty = Number(node.stockUsedQty || 0);
    return stockUsedQty > 0 || (requiredQty > 0 && produceQty <= 0);
  }

  function renderStockBalanceInfo(node) {
    return nodeUsesStockBalance(node)
      ? '<span class="stock-only-info">✓ Utilizando saldo</span>'
      : '';
  }

  function renderFlowNodeCard(node, options = {}) {
    const productions = Array.isArray(node.productions) && node.productions.length
      ? node.productions
      : [{ index: Number(node.productionIndex || 0), title: node.productionTitle || `Produ&ccedil;&atilde;o ${Number(node.productionIndex || 0) + 1}`, color: node.productionColor }];
    const productionIndex = Number(productions[0]?.index || node.productionIndex || 0);
    const checked = consolidatedStockOnlyChecked(productions, node.materialId);
    const stockQty = Number(node.stockQty || 0);
    const isFinalProduct = node.isFinalProduct === true;
    const canUseStock = !isFinalProduct && hasStockAvailable(node);
    const effectiveChecked = !isFinalProduct && checked && canUseStock;
    const requiredQty = Number(node.requiredQty || 0);
    const produceQty = Number(node.produceQty || 0);
    const stockUsedQty = Number(node.stockUsedQty || 0);
    const status = flowNodeStatus(node, effectiveChecked, produceQty, stockUsedQty, stockQty, requiredQty);
    const rawMaterialWarning = node.isInitialRawMaterial && stockQty < requiredQty;
    return `
        <div class="production-flow-node${produceQty > 0 ? ' needs-production' : ' stock-covered'}${rawMaterialWarning ? ' raw-material-warning' : ''}" role="button" tabindex="0" data-flow-node-key="${escapeHtml(node.flowKey || flowNodeKey(node))}" data-flow-material-id="${escapeHtml(node.materialId || '')}" data-flow-production-indexes="${escapeHtml(productions.map(production => Number(production.index || 0)).join(','))}" style="${productionThemeStyle(productionIndex, productions[0]?.color || node.productionColor)}">
          <div class="production-flow-node-header">
            <div>
              <strong>${escapeHtml(node.materialName)}</strong>
              <span>${escapeHtml(node.materialCode || '')}</span>
            </div>
            <span class="production-flow-status ${status.className}">${status.label}</span>
          </div>
          <div class="production-flow-production-markers" style="${escapeHtml(productionSegmentStyle(productions))}" title="${escapeHtml(productions.map(item => item.title || `Produ&ccedil;&atilde;o ${Number(item.index || 0) + 1}`).join(' | '))}" aria-hidden="true"></div>
          <div class="production-flow-metrics">
            <span>Necess&aacute;rio: <strong>${formatPtBrDecimal(node.requiredQty)} ${escapeHtml(node.unit || '')}</strong></span>
            <span>Saldo: <strong>${formatPtBrDecimal(node.stockQty)} ${escapeHtml(node.unit || '')}</strong></span>
            ${node.isInitialRawMaterial
              ? '<span>Origem: <strong>Compra / base</strong></span>'
              : `<span>A produzir: <strong>${formatPtBrDecimal(node.produceQty)} ${escapeHtml(node.unit || '')}</strong></span>`}
          </div>
          ${options.readOnlyStockToggle ? renderStockBalanceInfo(node) : node.isInitialRawMaterial || isFinalProduct ? '' : `<label class="stock-only-toggle"${canUseStock ? '' : ' title="Sem saldo disponível"'}>
            <input type="checkbox" data-stock-only data-production-indexes="${escapeHtml(productions.map(production => Number(production.index || 0)).join(','))}" data-material-id="${node.materialId}" ${effectiveChecked ? 'checked' : ''} ${canUseStock ? '' : 'disabled'} />
            <span>Utilizar saldo</span>
          </label>`}
        </div>
    `;
  }

  function renderFlowGraph(trees, options = {}) {
    const graph = buildFlowGraph(trees);
    return `
      <div class="production-flow-graph" data-flow-graph>
        <svg class="production-flow-svg" aria-hidden="true"></svg>
        ${graph.columns.map((column, index) => `
          <div class="production-flow-column" data-flow-level="${index}">
            ${column.map(node => renderFlowNodeCard(node, options)).join('')}
          </div>
        `).join('')}
        <span hidden data-flow-edges>${escapeHtml(JSON.stringify(graph.edges))}</span>
      </div>
    `;
  }

  function drawProductionFlowConnectors() {
    page.querySelectorAll('[data-flow-graph]').forEach(graph => {
      const svg = graph.querySelector('.production-flow-svg');
      const edgeScript = graph.querySelector('[data-flow-edges]');
      if (!svg || !edgeScript) return;
      let edges = [];
      try {
        edges = JSON.parse(edgeScript.textContent || '[]');
      } catch {
        edges = [];
      }
      const nodeMap = new Map([...graph.querySelectorAll('[data-flow-node-key]')]
        .map(node => [node.dataset.flowNodeKey, node]));
      const rect = graph.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${Math.max(rect.width, 1)} ${Math.max(rect.height, 1)}`);
      const paths = edges.map(edge => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return '';
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const startX = fromRect.right - rect.left;
        const startY = fromRect.top - rect.top + (fromRect.height / 2);
        const endX = toRect.left - rect.left;
        const endY = toRect.top - rect.top + (toRect.height / 2);
        const middleX = startX + Math.max(32, (endX - startX) / 2);
        return `<path class="production-flow-connector" marker-end="url(#production-flow-arrow)" d="M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}" />`;
      }).join('');
      svg.innerHTML = `
        <defs>
          <marker id="production-flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path class="production-flow-arrow" d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
        </defs>
        ${paths}
      `;
    });
  }

  function renderProductionFlows(result) {
    const trees = result.tree?.children?.length && isPlanningRootName(result.tree.materialName)
      ? result.tree.children
      : result.tree ? [result.tree] : [];
    const summary = result.summary.productions || [];
    const title = summary.length > 1
      ? summary.map((production, index) => `${production.title || `Produ&ccedil;&atilde;o ${index + 1}`}${production.plannedQty ? ` ${formatPtBrDecimal(production.plannedQty)} ${production.plannedUnit || ''}` : ''}`.trim()).join(' | ')
      : (summary[0]?.title || trees[0]?.productionTitle || 'Fluxo produtivo');
    return `
      <article class="production-flow-card consolidated-flow-card" data-flow-production="consolidated" style="${productionThemeStyle(0, draft.productions[0]?.color)}">
        <div class="planning-subcard-header">
          <h3 class="production-title"><span class="production-gradient-key" aria-hidden="true"></span>${escapeHtml(title)}</h3>
        </div>
        ${renderFlowGraph(trees)}
      </article>
    `;
  }

  function timelineOperations(result) {
    const current = Array.isArray(result?.calendarOperations)
      ? result.calendarOperations
      : Array.isArray(result?.operations) ? result.operations : [];
    const existing = Array.isArray(result?.summary?.existingOperations)
      ? result.summary.existingOperations.map(operation => ({
          ...operation,
          _existingScheduleBlocker: true
        }))
      : [];
    return [...existing, ...current];
  }

  function productionCalendarMachines(result) {
    const machineSources = [
      result?.machines,
      result?.summary?.machines,
      result?.machineOptions,
      result?.summary?.machineOptions
    ];
    return machineSources.find(source => Array.isArray(source) && source.length) || [];
  }

  function productionCalendarPlanningId(result) {
    return result?.planningId
      || result?.planning_id
      || result?.id
      || result?.summary?.planningId
      || result?.summary?.planning_id
      || draft.planningCode
      || lastPayload?.planningCode
      || null;
  }

  function logProductionCalendarAdapterErrors(errors) {
    const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (isDevelopment && errors.length) {
      console.warn('ProductionCalendar V2 ignorou alocações inválidas.', errors);
    }
  }

  function renderProductionCalendarWarning(calendar, errorCount) {
    if (!errorCount) return;
    const warning = document.createElement('p');
    warning.className = 'muted-text production-calendar-adapter-warning';
    warning.textContent = `Algumas alocações inválidas não foram exibidas. (${errorCount})`;
    const toolbar = calendar.querySelector('.production-calendar-toolbar');
    if (toolbar) {
      toolbar.insertAdjacentElement('afterend', warning);
    } else {
      calendar.prepend(warning);
    }
  }

  function noopProductionCalendarDetails() {
    // Pendência: conectar ao fluxo de detalhes quando houver callback simples compartilhado com o calendário atual.
  }

  function currentProductionCalendarSnapshot() {
    if (!currentSimulation) return buildProductionCalendarSnapshot({ days: [], operations: [], calendarOperations: [] });
    return buildProductionCalendarSnapshot(currentSimulation, { stockAlerts: currentPlanningStockAlerts });
  }

  function currentManualScheduleValidationContext(snapshot = currentProductionCalendarSnapshot()) {
    const summary = currentSimulation?.summary || {};
    return buildManualScheduleValidationContext({
      simulation: currentSimulation,
      materials,
      machines: snapshot?.machines || [],
      productivityMatrix: matrix,
      stock: currentSimulation?.stock,
      stockMinimums: currentSimulation?.stockMinimums,
      stockLocations: currentSimulation?.stockLocations || locations,
      dependencies: currentSimulation?.dependencies,
      transports: currentSimulation?.transports,
      shifts: Array.isArray(summary.shifts) && summary.shifts.length ? summary.shifts : draft.shifts,
      dailyTeamOverrides: draft.dailyTeamOverrides || summary.dailyTeamOverrides || {},
      manualWorkDates: summary.manualWorkDates || lastPayload?.manualWorkDates || [],
      setupMinutes: Number(summary.setupHours ?? lastPayload?.setupHours ?? 0) * 60,
      minimumStartRatio: Number(currentSimulation?.minimumStartRatio ?? 0.30),
      dependencyCompletionBufferMinutes: Number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60),
      holidays: currentSimulation?.holidays || [],
      timezone: currentSimulation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  function findProductionCalendarMachine(snapshot, machineId) {
    return (snapshot?.machines || []).find(machine => String(machine?.machineId) === String(machineId)) || null;
  }

  function validateProductionCalendarMoveIntent(intent, snapshot) {
    if (!intent || intent.type !== 'MOVE_ALLOCATION') return null;
    if (productionCalendarMoveInProgress) throw new Error('Aguarde o replanejamento atual terminar.');

    const destinationKind = intent.destination?.kind;
    if (!['empty', 'occupied'].includes(destinationKind)) throw new Error('Destino invalido para movimentacao.');
    if (!isValidDateOnly(intent.to?.date)) throw new Error('Destino sem data valida.');
    if (!intent.to?.machineId) throw new Error('Destino sem maquina.');
    const allocation = (snapshot?.allocations || []).find(item => String(item?.allocationId) === String(intent.allocationId)) || null;
    if (!allocation) throw new Error('Este bloco foi atualizado pelo recalculo. Atualize a selecao e tente novamente.');

    const parentOperationId = productionCalendarParentOperationId(allocation);
    if (!parentOperationId) throw new Error('Operacao pai inexistente.');

    if (String(allocation.date || '') === String(intent.to.date) && String(allocation.machineId || '') === String(intent.to.machineId)) {
      throw new Error('Destino igual a origem.');
    }

    const machine = findProductionCalendarMachine(snapshot, intent.to.machineId);
    if (!machine?.machineId || !machine?.machineName) throw new Error('Maquina de destino inexistente.');

    const parentAllocations = productionCalendarAllocationsForParent(snapshot, parentOperationId);
    if (!parentAllocations.length) throw new Error('Este bloco foi atualizado pelo recalculo. Atualize a selecao e tente novamente.');

    return { mode: 'move', allocation, parentOperationId, machine };
  }
  async function handleProductionCalendarMoveRequest(intent) {
    if (!intent || intent.type !== 'MOVE_ALLOCATION') return;
    if (typeof productionCalendarMoveRunner !== 'function') {
      toast('Simulação indisponível para movimentação.');
      return;
    }
    const snapshot = currentProductionCalendarSnapshot();
    try {
      const move = validateProductionCalendarMoveIntent(intent, snapshot);
      if (!move) return;
      await productionCalendarMoveRunner(intent, move);
    } catch (error) {
      toast(error);
    }
  }

  function daysWithDraftAllocations(days = [], allocations = []) {
    const byDate = new Map((Array.isArray(days) ? days : []).map(day => [String(day.date || ''), day]));
    (Array.isArray(allocations) ? allocations : []).forEach(allocation => {
      const date = String(allocation?.date || '');
      if (isValidDateOnly(date) && !byDate.has(date)) {
        byDate.set(date, { date, label: formatDateOnly(date), weekday: '' });
      }
    });
    return [...byDate.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  }

  function buildProductionCalendarSnapshot(result, options = {}) {
    const adapted = adaptPlanningResultToProductionCalendar({
      planningId: productionCalendarPlanningId(result),
      calendarOperations: Array.isArray(result?.calendarOperations) ? result.calendarOperations : [],
      operations: Array.isArray(result?.operations) ? result.operations : [],
      days: Array.isArray(result?.days) ? result.days : [],
      machines: productionCalendarMachines(result),
      status: result?.summary?.status || result?.status
    });
    const activeManualDraft = !options.ignoreManualDraft && manualScheduleDraft?.allocations?.length
      ? manualScheduleDraft
      : null;
    const allocations = activeManualDraft ? activeManualDraft.allocations : adapted.allocations;
    const baseDays = daysWithDraftAllocations(adapted.days, allocations);
    const validationSnapshot = buildProductionCalendarValidationSnapshot(activeManualDraft?.validation, allocations, baseDays);
    const snapshot = {
      days: validationSnapshot?.days || baseDays,
      machines: adapted.machines,
      allocations: validationSnapshot?.allocations || allocations,
      validation: validationSnapshot?.validation || null,
      permissions: { readOnly: true },
      errors: adapted.errors,
      warnings: [],
      visualState: {
        ...productionCalendarVisualState,
        stockAlerts: Boolean(options.stockAlerts)
      }
    };
    logProductionCalendarAdapterErrors(adapted.errors);
    return snapshot;
  }

  function renderProductionCalendarSnapshot(targetElement, snapshot) {
    targetElement.innerHTML = '';
    const calendar = ProductionCalendar({
      days: Array.isArray(snapshot?.days) ? snapshot.days : [],
      machines: Array.isArray(snapshot?.machines) ? snapshot.machines : [],
      allocations: Array.isArray(snapshot?.allocations) ? snapshot.allocations : [],
      validation: snapshot?.validation || null,
      permissions: snapshot?.permissions || { readOnly: true },
      visualState: snapshot?.visualState || {},
      onOpenDetails: noopProductionCalendarDetails,
      onRequestMove: handleProductionCalendarMoveRequest,
      onVisualStateChange: nextVisualState => {
        productionCalendarVisualState = {
          ...productionCalendarVisualState,
          ...(nextVisualState || {})
        };
      }
    });
    targetElement.appendChild(calendar);
    renderProductionCalendarWarning(calendar, Array.isArray(snapshot?.errors) ? snapshot.errors.length : 0);
    const issues = [
      ...(manualScheduleDraft?.validation?.errors || []),
      ...(manualScheduleDraft?.validation?.warnings || [])
    ];
    if (issues.length) {
      const details = document.createElement('details');
      details.className = 'production-calendar-validation-details';
      details.innerHTML = `<summary>Detalhes da validação (${issues.length})</summary><ul>${issues.map(item => `<li>${escapeHtml(item.message)}</li>`).join('')}</ul>`;
      calendar.appendChild(details);
    }
  }

  function renderProductionCalendar(targetElement, result, options = {}) {
    targetElement.innerHTML = '';
    if (!USE_PRODUCTION_CALENDAR_V2) {
      targetElement.appendChild(CalendarTimeline(result.days, timelineOperations(result), {
        mode: 'planning',
        ...(result.summary || {}),
        stockAlerts: options.stockAlerts || currentPlanningStockAlerts
      }));
      return;
    }

    renderProductionCalendarSnapshot(targetElement, buildProductionCalendarSnapshot(result, options));
  }

  function simulatedProductionByDate(result) {
    const productionByDate = new Map();
    timelineOperations(result)
      .filter(operation => operation.operationType !== 'transport' && operation._existingScheduleBlocker !== true)
      .forEach(operation => {
        const date = String(operation.startDate || '').slice(0, 10);
        if (!isValidDateOnly(date)) return;
        const quantity = Number(operation.produceQty || 0);
        if (!(quantity > 0)) return;
        materialLookupKeys(operation).forEach(key => {
          const mapKey = `${date}|${key}`;
          productionByDate.set(mapKey, Number((Number(productionByDate.get(mapKey) || 0) + quantity).toFixed(6)));
        });
      });
    return productionByDate;
  }

  function simulatedProductionQtyThrough(productionByDate, targetDate, materialKey) {
    let total = 0;
    for (const [entryKey, quantity] of productionByDate.entries()) {
      const [date, key] = entryKey.split('|');
      if (key === materialKey && date <= targetDate) total += Number(quantity || 0);
    }
    return total;
  }

  function projectedRowsWithSimulation(rows = [], date, productionByDate) {
    return rows.map(row => {
      const producedQty = materialLookupKeys(row).reduce((sum, key) => (
        Math.max(sum, simulatedProductionQtyThrough(productionByDate, date, key))
      ), 0);
      if (!(producedQty > 0)) return row;
      const estimatedStock = Number(row.estimated_stock);
      return {
        ...row,
        estimated_stock: Number.isFinite(estimatedStock) ? estimatedStock + producedQty : estimatedStock
      };
    });
  }

  function criticalPlanningStockRows(rows = [], minimumDays = null) {
    if (!Number.isFinite(Number(minimumDays)) || Number(minimumDays) <= 0) return [];
    return rows.filter(row => {
      const estimatedStock = Number(row.estimated_stock ?? row.estimatedStock);
      const salesPerDay = stockProjectionSalesPerDay(row);
      if (salesPerDay) {
        const durationDays = stockProjectionDurationDays(row);
        return Number.isFinite(durationDays) && durationDays <= Number(minimumDays);
      }
      return Number.isFinite(estimatedStock) && estimatedStock <= 0;
    });
  }

  async function loadPlanningStockAlerts(result) {
    const minimumDays = readStockMinimumDays();
    if (!minimumDays) return new Map();
    const days = [...new Set((Array.isArray(result?.days) ? result.days : [])
      .map(date => String(date || '').slice(0, 10))
      .filter(isValidDateOnly))];
    if (!days.length) return new Map();
    const productionByDate = simulatedProductionByDate(result);
    const entries = await Promise.all(days.map(async date => {
      const projection = await api(`/planning/analysis/stock-projection?date=${date}`);
      const criticalRows = criticalPlanningStockRows(projectedRowsWithSimulation(projection.rows || [], date, productionByDate), minimumDays);
      return criticalRows.length ? [date, { criticalCount: criticalRows.length, materials: criticalRows }] : null;
    }));
    return new Map(entries.filter(Boolean));
  }

  function schedulePlanningStockAlerts(result) {
    const requestId = ++planningStockAlertRequestId;
    currentPlanningStockAlerts = new Map();
    loadPlanningStockAlerts(result)
      .then(alerts => {
        if (requestId !== planningStockAlertRequestId) return;
        currentPlanningStockAlerts = alerts;
        if (currentSimulation === result) refreshTimelineOnly();
      })
      .catch(error => {
        if (requestId !== planningStockAlertRequestId) return;
        console.warn('Não foi possível carregar alertas de estoque do planejamento.', error);
      });
  }

  function renderSimulation(result, form, { restoreManualDraft = false } = {}) {
    const coloredResult = withProductionColors(result);
    currentSimulation = coloredResult;
    const automaticSnapshot = buildProductionCalendarSnapshot(coloredResult, { ignoreManualDraft: true });
    const restoredDraft = restoreManualDraft && manualScheduleDraft?.allocations?.length
      ? JSON.parse(JSON.stringify(manualScheduleDraft))
      : null;
    const candidateDraft = restoredDraft || createManualScheduleDraft({
        planningId: productionCalendarPlanningId(coloredResult),
        baseSimulationId: coloredResult?.code || lastPayload?.planningCode || Date.now(),
        allocations: automaticSnapshot.allocations,
        machines: automaticSnapshot.machines
      });
    if (isManualScheduleValidationCompatible(restoredDraft)) {
      manualScheduleDraft = restoredDraft;
    } else {
      const validatedAt = new Date().toISOString();
      const validationTransaction = applyManualScheduleTransaction({
        currentDraft: candidateDraft,
        intent: { type: 'VALIDATE_DRAFT' },
        draftContext: { validatedAt },
        validationContext: currentManualScheduleValidationContext(automaticSnapshot)
      });
      manualScheduleDraft = validationTransaction.accepted
        ? validationTransaction.draft
        : { ...candidateDraft, validation: validationTransaction.validation };
    }
    draft.currentSimulation = coloredResult;
    draft.lastPayload = lastPayload;
    draft.manualScheduleDraft = manualScheduleDraft;
    saveDraftNow();
    hasPendingSimulationChanges = false;
    const resultsTarget = target.querySelector('.planning-results');
    const timelineTarget = target.querySelector('.timeline-target');
    const flowsTarget = target.querySelector('.production-flows-target');
    const notice = target.querySelector('.unsimulated-notice');
    const oldSummaryPanel = target.querySelector('.final-summary-panel');
    if (oldSummaryPanel) oldSummaryPanel.hidden = true;
    currentPlanningStockAlerts = new Map();
    renderProductionCalendar(timelineTarget, coloredResult, { stockAlerts: currentPlanningStockAlerts });
    schedulePlanningStockAlerts(coloredResult);
    flowsTarget.innerHTML = renderProductionFlows(coloredResult);
    requestAnimationFrame(drawProductionFlowConnectors);
    if (notice) notice.hidden = true;
    target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', true);
    resultsTarget.hidden = false;
    if (form.elements.save) form.elements.save.disabled = !canWritePlanning;
  }

  function refreshTimelineOnly() {
    if (!currentSimulation) return;
    const timelineTarget = target.querySelector('.timeline-target');
    if (!timelineTarget) return;
    currentSimulation.summary = {
      ...(currentSimulation.summary || {}),
      dailyTeamOverrides: draft.dailyTeamOverrides || {}
    };
    draft.manualScheduleDraft = manualScheduleDraft;
    renderProductionCalendar(timelineTarget, currentSimulation, { stockAlerts: currentPlanningStockAlerts });
  }

  function markPlanningInconsistent() {
    hasPendingSimulationChanges = true;
    const notice = target.querySelector('.unsimulated-notice');
    if (notice) notice.hidden = false;
    target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', false);
  }

  function restoreSimulation(form) {
    if (!currentSimulation) return;
    const wasPending = hasPendingSimulationChanges;
    renderSimulation(currentSimulation, form, { restoreManualDraft: true });
    hasPendingSimulationChanges = wasPending;
    const notice = target.querySelector('.unsimulated-notice');
    if (notice) notice.hidden = !hasPendingSimulationChanges;
    target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', !hasPendingSimulationChanges);
  }

  function summaryCards(result, planningCode) {
    const firstOperation = result.operations[0];
    const lastOperation = result.operations[result.operations.length - 1];
    const period = operationPeriod(result.operations, result.summary.planningStartDate || draft.planningStartDate, result.summary.planningEndDate || draft.planningEndDate);
    const productions = result.summary.productions || [];
    const transports = draft.productions.reduce((sum, production) => sum + (production.transports || []).length, 0);
    const alerts = [];
    if (!isValidDateOnly(draft.planningStartDate)) alerts.push('Período do planejamento inválido.');
    if (!result.operations.length) alerts.push('Nenhuma operacao produtiva foi gerada.');
    const rawMaterialWarnings = result.operations.filter(operation => operation.isInitialRawMaterial && Number(operation.stockQty || 0) < Number(operation.requiredQty || 0));
    if (rawMaterialWarnings.length) alerts.push('Existem materias-primas iniciais com estoque insuficiente.');
    return [
      ['C&oacute;digo previsto', planningCode],
      ['Per&iacute;odo planejado', period.label],
      ['Produ&ccedil;&otilde;es inclu&iacute;das', productions.length || draft.productions.length],
      ['Materiais finais', productions.map(production => production.materialName).join(', ') || result.summary.materialName],
      ['Quantidades', productions.map(production => `${formatPtBrDecimal(production.plannedQty)} ${production.plannedUnit || ''}`.trim()).join(' | ') || `${formatPtBrDecimal(result.summary.plannedQty)} ${result.summary.plannedUnit || ''}`.trim()],
      ['Turnos', draft.shifts.length],
      ['Transportes', transports],
      ['Total de opera&ccedil;&otilde;es', result.operations.length],
      ['In&iacute;cio/fim estimado', `${formatDateOnly(result.summary.startDate)} ${firstOperation?.startTime || ''} at\u00e9 ${formatDateOnly(result.summary.endDate)} ${lastOperation?.endTime || ''}`],
      ['Observa&ccedil;&otilde;es / alertas', alerts.join(' ') || 'Sem alertas.']
    ];
  }

  function openFinalSummaryModal(result, planningCode) {
    page.querySelector('.planning-summary-modal')?.remove();
    const cards = summaryCards(result, planningCode);
    const stockShortages = collectStockShortagesFromTree(result.tree);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop planning-summary-modal';
    backdrop.innerHTML = `
      <div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="planning-summary-title">
        <div class="modal-header">
          <h2 id="planning-summary-title">Resumo do planejamento</h2>
          <button class="link-button close-modal" type="button">Fechar</button>
        </div>
        <div class="final-summary-grid summary-grid compact-summary">
          ${SummaryCards(cards.map(([label, value]) => ({ labelHtml: label, value, className: 'compact' })))}
        </div>
        <div class="form-actions modal-actions">
          <button class="secondary-button close-modal" type="button">Voltar/Editar</button>
          <button class="primary-button launch-planning" type="button">Lan&ccedil;ar planejamento</button>
        </div>
      </div>
    `;
    function requestStockAuthorization(shortages) {
      return new Promise(resolve => {
        page.querySelector('.stock-authorization-modal')?.remove();
        const authBackdrop = document.createElement('div');
        authBackdrop.className = 'modal-backdrop stock-authorization-modal';
        authBackdrop.innerHTML = `
          <div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="stock-authorization-title">
            <div class="modal-header">
              <div>
                <h2 id="stock-authorization-title">ATEN&Ccedil;&Atilde;O: Estoque insuficiente</h2>
                <p class="modal-subtitle">Existem materiais sem saldo suficiente para atender ao planejamento.</p>
              </div>
            </div>
            <form class="stock-authorization-form">
              ${renderStockShortageTable(shortages)}
              <p class="warning-text">Este planejamento possui materiais sem estoque suficiente. Somente usu&aacute;rios autorizados podem confirmar este planejamento.</p>
              <label class="checkbox-label"><input name="confirmed" type="checkbox" required /> Confirmo que desejo autorizar este planejamento com estoque insuficiente.</label>
              <p class="form-error" hidden></p>
              <div class="form-actions modal-actions">
                <button class="secondary-button cancel-stock-authorization" type="button">Cancelar</button>
                <button class="primary-button" type="submit">Autorizar e salvar</button>
              </div>
            </form>
          </div>
        `;
        function close(value = null) {
          authBackdrop.remove();
          resolve(value);
        }
        authBackdrop.querySelector('.cancel-stock-authorization').addEventListener('click', () => close(null));
        authBackdrop.addEventListener('click', event => {
          if (event.target === authBackdrop) close(null);
        });
        authBackdrop.querySelector('.stock-authorization-form').addEventListener('submit', event => {
          event.preventDefault();
          const user = getCurrentUser();
          const error = authBackdrop.querySelector('.form-error');
          if (!canAuthorizeStockShortage(user)) {
            error.textContent = 'Você não possui permissão para autorizar planejamentos com estoque insuficiente.';
            error.hidden = false;
            return;
          }
          if (!event.currentTarget.elements.confirmed.checked) {
            error.textContent = 'Confirme a autorização para prosseguir.';
            error.hidden = false;
            return;
          }
          close({
            confirmed: true,
            method: 'clerk_authenticated_confirmation',
            shortages
          });
        });
        page.appendChild(authBackdrop);
        authBackdrop.querySelector('input[name="confirmed"]')?.focus();
      });
    }

    async function launchPlanning(button) {
      button.disabled = true;
      try {
        let body = lastPayload;
        if (stockShortages.length) {
          const authorization = await requestStockAuthorization(stockShortages);
          if (!authorization) {
            button.disabled = false;
            return;
          }
          body = { ...lastPayload, stockAuthorization: authorization };
        }
        const saved = await api('/planning/plans', { method: 'POST', body });
        localStorage.removeItem(DRAFT_KEY);
        draft = defaultDraft();
        lastPayload = null;
        currentSimulation = null;
        manualScheduleDraft = null;
        backdrop.remove();
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Planejamento ${saved.plan.code || saved.plan.id} lancado.` }));
        activeTab = 'history';
        sessionStorage.setItem('planejamento_planning_tab', activeTab);
        await render();
      } catch (error) {
        button.disabled = false;
        toast(error);
      }
    }

    backdrop.querySelector('.launch-planning').addEventListener('click', event => {
      launchPlanning(event.currentTarget).catch(toast);
    });
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) {
        backdrop.remove();
      }
    });
    page.appendChild(backdrop);
    requestAnimationFrame(drawProductionFlowConnectors);
    setTimeout(drawProductionFlowConnectors, 80);
  }

  function planTreeRoots(tree) {
    if (!tree || typeof tree !== 'object') return [];
    return Array.isArray(tree.children) && isPlanningRootName(tree.materialName) ? tree.children : [tree];
  }

  function productionRowsFromTree(tree) {
    return planTreeRoots(tree).map((node, index) => ({
      title: node.productionTitle || `Produção ${Number(node.productionIndex ?? index) + 1}`,
      materialName: node.materialName,
      materialCode: node.materialCode,
      plannedQty: node.requiredQty,
      unit: node.unit,
      machineName: node.machineName,
      peopleCount: node.peopleCount,
      productionModelName: node.productionModelName
    }));
  }

  function operationsForDetail(detail) {
    return normalizeJsonArray(detail.operations).map((operation, index) => ({
      ...operation,
      sequence: index + 1,
      linkedProductions: Array.isArray(operation.productionItems) && operation.productionItems.length
        ? operation.productionItems.map(item => `${item.productionTitle || `Produção ${Number(item.productionIndex || 0) + 1}`}: ${formatPtBrDecimal(item.quantity)} ${item.unit || operation.unit || ''}`.trim())
        : [operation.productionTitle].filter(Boolean)
    }));
  }

  function planAlerts(tree, operations = []) {
    const alerts = [];
    const authorization = stockAuthorizationFromPlan({ schedule_tree: tree, operations }, tree, operations);
    const authorizedShortages = Array.isArray(authorization?.materials) ? authorization.materials : [];
    if (authorizedShortages.length) {
      alerts.push('Planejamento salvo mediante autorização por estoque insuficiente.');
      authorizedShortages.forEach(item => {
        alerts.push(`${item.materialName || item.material || ''}: necessário ${formatPtBrDecimal(item.requiredQty)} ${item.unit || ''}, saldo ${formatPtBrDecimal(item.stockQty)} ${item.unit || ''}, falta ${formatPtBrDecimal(item.shortageQty)} ${item.unit || ''}.`);
      });
      return [...new Set(alerts)];
    }
    function visit(node) {
      if (!node) return;
      if (node.isInitialRawMaterial && Number(node.stockQty || 0) < Number(node.requiredQty || 0)) {
        alerts.push(`Estoque insuficiente: ${node.materialName} precisa ${formatPtBrDecimal(node.requiredQty)} ${node.unit || ''} e possui ${formatPtBrDecimal(node.stockQty)}.`);
      }
      (node.children || []).forEach(visit);
    }
    planTreeRoots(tree).forEach(visit);
    operations.forEach(operation => {
      if (Number(operation.teamAvailable || 0) && Number(operation.peopleCount || 0) > Number(operation.teamAvailable || 0)) {
        alerts.push(`Equipe excedida em ${operation.materialName}: ${operation.peopleCount} pessoas para ${operation.teamAvailable} disponíveis.`);
      }
    });
    return [...new Set(alerts)];
  }

  function renderDetailTable(headers, rows, emptyText = 'Sem registros.') {
    return `
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead><tr>${headers.map(header => `<th>${header.label}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.length ? rows.map(row => `
              <tr>${headers.map(header => `<td>${header.render ? header.render(row) : escapeHtml(row[header.key] ?? '')}</td>`).join('')}</tr>
            `).join('') : `<tr><td colspan="${headers.length}"><span class="muted-text">${emptyText}</span></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderFlowTree(node, level = 0) {
    if (!node) return '';
    const status = node.isInitialRawMaterial
      ? Number(node.stockQty || 0) >= Number(node.requiredQty || 0) ? 'Matéria-prima inicial com saldo' : 'Matéria-prima inicial / comprar'
      : Number(node.produceQty || 0) > 0 ? 'Produzir' : 'Usar saldo';
    return `
      <li>
        <div class="flow-tree-row" style="--flow-level: ${level}">
          <strong>${escapeHtml(node.materialName || '')}</strong>
          <span>Necessario ${formatPtBrDecimal(node.requiredQty)} ${escapeHtml(node.unit || '')}</span>
          <span>Saldo ${formatPtBrDecimal(node.stockQty)} ${escapeHtml(node.unit || '')}</span>
          <span>A produzir ${formatPtBrDecimal(node.produceQty)} ${escapeHtml(node.unit || '')}</span>
          <em>${escapeHtml(status)}</em>
        </div>
        ${(node.children || []).length ? `<ul>${node.children.map(child => renderFlowTree(child, level + 1)).join('')}</ul>` : ''}
      </li>
    `;
  }

  function renderPlanFlowDetail(tree) {
    const roots = planTreeRoots(tree);
    return roots.length
      ? renderFlowGraph(roots, { readOnlyStockToggle: true })
      : '<p class="muted-text">Fluxo produtivo não registrado.</p>';
  }

  function openPlanDetailModal(detail) {
    page.querySelector('.planning-detail-modal')?.remove();
    const plan = detail.plan || {};
    const canceled = isCanceledStatus(plan.status);
    const tree = normalizeJsonObject(detail.tree || plan.schedule_tree);
    const operations = operationsForDetail(detail);
    const productions = productionRowsFromTree(tree);
    const transports = operations.filter(operation => operation.operationType === 'transport');
    const firstOperation = operations[0];
    const lastOperation = operations[operations.length - 1];
    const period = operationPeriod(operations, plan.start_date, plan.end_date);
    const alerts = planAlerts(tree, operations);
    const backdrop = document.createElement('div');
    backdrop.className = `modal-backdrop planning-detail-modal${canceled ? ' is-canceled-planning' : ''}`;
    backdrop.innerHTML = `
      <div class="modal wide-modal planning-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="planning-detail-title">
        ${canceled ? '<div class="planning-canceled-watermark" aria-hidden="true">CANCELADO</div>' : ''}
        <div class="modal-header">
          <div>
            <h2 id="planning-detail-title">Planejamento ${escapeHtml(plan.code || plan.id)}</h2>
            <p class="modal-subtitle">${escapeHtml(period.label)} | ${escapeHtml(formatStatus(plan.status))}</p>
          </div>
          <button class="link-button close-modal" type="button">Fechar</button>
        </div>

        <section class="planning-detail-section detail-summary-strip">
          <article><span>Código</span><strong>${escapeHtml(plan.code || plan.id)}</strong></article>
          <article><span>Período planejado</span><strong>${escapeHtml(period.label)}</strong></article>
          <article><span>Status</span><strong>${planningStatusPill(plan.status)}</strong></article>
          <article><span>Operações</span><strong>${operations.length}</strong></article>
          <article><span>Início/fim estimado</span><strong>${escapeHtml(`${formatDateOnly(firstOperation?.startDate)} ${firstOperation?.startTime || ''} até ${formatDateOnly(lastOperation?.endDate)} ${lastOperation?.endTime || ''}`.trim())}</strong></article>
        </section>

        <section class="planning-detail-section">
          <h3>Produções incluídas</h3>
          ${renderDetailTable([
            { label: 'Produção', render: row => escapeHtml(row.title) },
            { label: 'Material final', render: row => `${escapeHtml(row.materialName || '')}<br><span class="muted-text">${escapeHtml(row.materialCode || '')}</span>` },
            { label: 'Quantidade', render: row => escapeHtml(`${formatPtBrDecimal(row.plannedQty)} ${row.unit || ''}`.trim()) },
            { label: 'Máquina', key: 'machineName' },
            { label: 'Pessoas', key: 'peopleCount' },
            { label: 'Modelo', key: 'productionModelName' }
          ], productions)}
        </section>

        <section class="planning-detail-section planning-detail-shifts">
          <h3>Turnos e transportes</h3>
          <div class="planning-detail-inline">
            <p>${escapeHtml(formatHourDuration(plan.hours_per_day))}</p>
            <p class="muted-text">${transports.length} transporte(s) no calendário.</p>
          </div>
        </section>

        <section class="planning-detail-section">
          <h3>Cronograma operacional</h3>
          ${renderDetailTable([
            { label: '#', render: row => row.sequence },
            { label: 'Material', render: row => escapeHtml(row.materialName || '') },
            { label: 'Tipo', render: row => row.operationType === 'transport' ? 'Transporte' : 'Produção' },
            { label: 'Quantidade', render: row => escapeHtml(`${formatPtBrDecimal(row.produceQty)} ${row.unit || ''}`.trim()) },
            { label: 'Máquina', key: 'machineName' },
            { label: 'Pessoas', key: 'peopleCount' },
            { label: 'Início', render: row => escapeHtml(`${formatDateOnly(row.startDate)} ${row.startTime || ''}`.trim()) },
            { label: 'Fim', render: row => escapeHtml(`${formatDateOnly(row.endDate)} ${row.endTime || ''}`.trim()) },
            { label: 'Duração', render: row => escapeHtml(formatDuration(row.totalMinutes)) },
            { label: 'Produções vinculadas', render: row => escapeHtml(row.linkedProductions.join(' | ') || '-') }
          ], operations)}
        </section>

        <section class="planning-detail-section">
          <h3>Fluxo produtivo</h3>
          ${renderPlanFlowDetail(tree)}
        </section>

        <section class="planning-detail-section">
          <h3>Alertas e observações</h3>
          ${alerts.length ? `<ul class="planning-alert-list">${alerts.map(alert => `<li>${escapeHtml(alert)}</li>`).join('')}</ul>` : '<p class="muted-text">Sem alertas registrados.</p>'}
        </section>
      </div>
    `;
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop || event.target.classList.contains('close-modal')) backdrop.remove();
    });
    page.appendChild(backdrop);
    requestAnimationFrame(drawProductionFlowConnectors);
    setTimeout(drawProductionFlowConnectors, 80);
  }

  async function renderSimulationTab() {
    await loadLookups();
    target.innerHTML = `
      <div class="panel planning-builder-panel">
        <form class="planning-form">
          <div class="section-heading">
            <h2>Range do planejamento</h2>
            <button class="secondary-button clear-planning" type="button">Limpar planejamento</button>
          </div>
          <div class="grid-form planning-inner-grid planning-compact-field-grid">
            <label>Data inicial do planejamento<input name="planningStartDate" type="date" value="${escapeHtml(draft.planningStartDate)}" required /></label>
          </div>

          <div class="section-heading planning-section-heading">
            <h2>Turnos</h2>
            <button class="secondary-button add-shift" type="button">+ Adicionar turno</button>
          </div>
          <div class="planning-shifts-layout">
            <div class="shifts-target">${draft.shifts.map(renderShift).join('')}</div>
            <div class="shift-summary-target">${renderShiftSummary()}</div>
          </div>
          ${renderSetupField()}

          <div class="section-heading planning-section-heading">
            <h2>Produ&ccedil;&otilde;es</h2>
            <button class="secondary-button add-production" type="button">+ Adicionar produ&ccedil;&atilde;o</button>
          </div>
          <div class="productions-target">${draft.productions.map(renderProduction).join('')}</div>

          <div class="form-actions">
            <button class="primary-button" name="simulate" type="submit">Simular</button>
            ${canWritePlanning ? '<button class="secondary-button" name="save" type="button" disabled>Salvar planejamento</button>' : ''}
          </div>
        </form>
      </div>
      <div class="planning-results" hidden>
        <div class="panel calendar-panel">
          <div class="section-heading">
            <h2>Calend&aacute;rio de produ&ccedil;&atilde;o</h2>
            <button class="secondary-button recalculate-planning" type="button" hidden>Recalcular</button>
          </div>
          <p class="unsimulated-notice" hidden>Planejamento inconsistente. Clique em Recalcular.</p>
          <div class="timeline-target"></div>
        </div>
        <div class="panel production-flows-panel">
          <div class="section-heading">
            <h2>Fluxo produtivo por produ&ccedil;&atilde;o</h2>
          </div>
          <div class="production-flows-target"></div>
        </div>
      </div>
    `;

    const form = target.querySelector('form');
    const shiftsTarget = target.querySelector('.shifts-target');
    const productionsTarget = target.querySelector('.productions-target');
    renderProductionCalendar(target.querySelector('.timeline-target'), { days: [], operations: [], calendarOperations: [] });
    restoreSimulation(form);

    function rerenderBuilder() {
      saveDraftNow();
      renderSimulationTab().catch(toast);
    }

    function rerenderProductionsBuilder() {
      saveDraftNow();
      productionsTarget.innerHTML = draft.productions.map(renderProduction).join('');
    }

    function closeColorPalette() {
      productionsTarget.querySelector('.production-color-popover')?.remove();
    }

    function openColorPalette(card, production) {
      closeColorPalette();
      const selectedColor = isHexColor(production.color) ? String(production.color).toUpperCase() : automaticProductionColor(draft.productions.indexOf(production));
      const popover = document.createElement('div');
      popover.className = 'production-color-popover';
      popover.innerHTML = `
        <div class="production-color-grid" role="listbox" aria-label="Cores da produ&ccedil;&atilde;o">
          ${PRODUCTION_COLOR_PALETTE.map(color => `
            <button class="production-color-option${color === selectedColor ? ' is-selected' : ''}" type="button" data-production-color="${color}" style="--swatch-color: ${color}" aria-label="Usar cor ${color}" aria-selected="${color === selectedColor}"></button>
          `).join('')}
        </div>
      `;
      card.querySelector('.planning-subcard-header').appendChild(popover);
    }

    function queueSimulationRefresh() {
      if (!currentSimulation) return;
      if (!draft.productions.every(production => materialById(production.materialId) && Number(production.plannedQty) > 0)) {
        hasPendingSimulationChanges = true;
        const notice = target.querySelector('.unsimulated-notice');
        if (notice) notice.hidden = false;
        return;
      }
      clearTimeout(recalculationTimer);
      recalculationTimer = setTimeout(() => withOperationLoading('Organizando produção...', simulateCurrent).catch(toast), 250);
    }

    function updateDraftFromGeneral() {
      draft.planningStartDate = form.elements.planningStartDate.value;
      draft.setupHours = form.elements.setupHours?.value || '';
      queueAutosave();
    }

    form.elements.planningStartDate.addEventListener('input', updateDraftFromGeneral);
    form.elements.setupHours?.addEventListener('input', () => {
      updateDraftFromGeneral();
      queueSimulationRefresh();
    });

    shiftsTarget.addEventListener('input', event => {
      const card = event.target.closest('[data-shift-id]');
      if (!card) return;
      const shift = draft.shifts.find(item => item.id === card.dataset.shiftId);
      if (!shift || !event.target.name) return;
      shift[event.target.name] = event.target.value;
      draft.shifts = normalizeShiftTimes(draft.shifts);
      const summaryTarget = target.querySelector('.shift-summary-target');
      if (summaryTarget) summaryTarget.innerHTML = renderShiftSummary();
      queueAutosave();
      queueSimulationRefresh();
    });

    shiftsTarget.addEventListener('click', event => {
      const card = event.target.closest('[data-shift-id]');
      if (!card || !event.target.classList.contains('remove-shift')) return;
      draft.shifts = normalizeShiftTimes(draft.shifts.filter(shift => shift.id !== card.dataset.shiftId));
      rerenderBuilder();
    });

    productionsTarget.addEventListener('input', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production || !event.target.name) return;
      const transportRow = event.target.closest('[data-transport-id]');
      if (transportRow) {
        const transport = (production.transports || []).find(item => item.id === transportRow.dataset.transportId);
        if (!transport) return;
        transport[event.target.name] = event.target.value;
        queueAutosave();
        queueSimulationRefresh();
        return;
      }
      production[event.target.name] = event.target.value;
      if (event.target.name === 'materialSearch') {
        const previousMaterialId = production.materialId;
        const searchValue = event.target.value.trim().toLowerCase();
        const material = materials.find(item =>
          materialLabel(item).toLowerCase() === searchValue
          || (item.codes || []).some(code => String(code).toLowerCase() === searchValue)
        );
        production.materialId = material?.id || '';
        if (material) {
          production.materialSearch = materialLabel(material);
          event.target.value = production.materialSearch;
        }
        if (String(previousMaterialId || '') !== String(production.materialId || '')) {
          clearProductionMaterialDecisions(draft.productions.indexOf(production));
        }
        production.productionModelName = '';
        production.machineName = '';
        production.peopleCount = '';
        production.transports = [];
        renderMaterialSuggestions(card, production);
        if (material) rerenderBuilder();
      }
      queueAutosave();
      if (event.target.name !== 'materialSearch') queueSimulationRefresh();
    });

    productionsTarget.addEventListener('change', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production || !event.target.name) return;
      const transportRow = event.target.closest('[data-transport-id]');
      if (transportRow) {
        const transport = (production.transports || []).find(item => item.id === transportRow.dataset.transportId);
        if (!transport) return;
        transport[event.target.name] = event.target.value;
        saveDraftNow();
        queueSimulationRefresh();
        return;
      }
      production[event.target.name] = event.target.value;
      if (event.target.name === 'machineName') production.peopleCount = '';
      queueSimulationRefresh();
      rerenderBuilder();
    });

    function renderMaterialSuggestions(card, production) {
      const suggestionsTarget = card.querySelector('.material-suggestions');
      const searchValue = String(production.materialSearch || '').trim().toLowerCase();
      if (!searchValue) {
        suggestionsTarget.hidden = true;
        suggestionsTarget.innerHTML = '';
        return;
      }
      const matches = materials.filter(material => materialMatches(material, searchValue)).slice(0, 12);
      suggestionsTarget.innerHTML = matches.length
        ? matches.map(material => `
            <button type="button" data-material-id="${material.id}">
              <strong>${escapeHtml(materialLabel(material))}</strong>
              <span>${escapeHtml((material.codes || []).join(' | '))}</span>
            </button>
          `).join('')
        : '<div class="material-suggestion-empty">Nenhum material encontrado.</div>';
      suggestionsTarget.hidden = false;
    }

    productionsTarget.addEventListener('focusin', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card || event.target.name !== 'materialSearch') return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      renderMaterialSuggestions(card, production);
    });

    productionsTarget.addEventListener('focusout', event => {
      if (event.target.name !== 'materialSearch') return;
      const card = event.target.closest('[data-production-id]');
      setTimeout(() => {
        const suggestionsTarget = card?.querySelector('.material-suggestions');
        if (suggestionsTarget) suggestionsTarget.hidden = true;
      }, 120);
    });

    productionsTarget.addEventListener('mousedown', event => {
      const button = event.target.closest('[data-material-id]');
      const card = event.target.closest('[data-production-id]');
      if (!button || !card) return;
      event.preventDefault();
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      const material = materialById(button.dataset.materialId);
      const previousMaterialId = production.materialId;
      production.materialId = material?.id || '';
      if (String(previousMaterialId || '') !== String(production.materialId || '')) {
        clearProductionMaterialDecisions(draft.productions.indexOf(production));
      }
      production.materialSearch = materialLabel(material);
      production.productionModelName = '';
      production.machineName = '';
      production.peopleCount = '';
      production.transports = [];
      hasPendingSimulationChanges = true;
      rerenderBuilder();
    });

    productionsTarget.addEventListener('click', event => {
      if (!event.target.closest('.production-color-popover') && !event.target.closest('[data-color-trigger]')) {
        closeColorPalette();
      }
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      if (!production) return;
      if (event.target.closest('[data-color-trigger]')) {
        event.stopPropagation();
        if (card.querySelector('.production-color-popover')) closeColorPalette();
        else openColorPalette(card, production);
        return;
      }
      const colorButton = event.target.closest('[data-production-color]');
      if (colorButton) {
        production.color = colorButton.dataset.productionColor;
        saveDraftNow();
        closeColorPalette();
        if (currentSimulation) {
          renderSimulation(currentSimulation, form);
        } else {
          rerenderProductionsBuilder();
        }
        return;
      }
      if (event.target.classList.contains('add-transport')) {
        production.transports = [...(production.transports || []), emptyTransport()];
        rerenderProductionsBuilder();
        queueSimulationRefresh();
        return;
      }
      if (event.target.classList.contains('remove-transport')) {
        const row = event.target.closest('[data-transport-id]');
        production.transports = (production.transports || []).filter(transport => transport.id !== row?.dataset.transportId);
        rerenderProductionsBuilder();
        queueSimulationRefresh();
        return;
      }
      if (!event.target.classList.contains('remove-production')) return;
      const removedIndex = draft.productions.findIndex(item => item.id === card.dataset.productionId);
      draft.productions = draft.productions.filter(item => item.id !== card.dataset.productionId);
      removeProductionScopedState(removedIndex);
      rerenderBuilder();
    });

    document.addEventListener('click', event => {
      if (!productionsTarget.contains(event.target)) closeColorPalette();
    });

    target.querySelector('.add-shift').addEventListener('click', () => {
      const previous = draft.shifts.at(-1);
      draft.shifts.push(defaultShift(draft.shifts.length, previous?.shiftEndTime || '17:00'));
      draft.shifts = normalizeShiftTimes(draft.shifts);
      hasPendingSimulationChanges = true;
      rerenderBuilder();
    });

    target.querySelector('.add-production').addEventListener('click', () => {
      const previousProduction = draft.productions.at(-1);
      const production = emptyProduction(draft.productions.length);
      production.color = nextProductionColor(previousProduction?.color, draft.productions.length);
      draft.productions.push(production);
      hasPendingSimulationChanges = true;
      rerenderBuilder();
    });

    target.querySelector('.clear-planning').addEventListener('click', () => {
      if (!confirm('Limpar o planejamento atual e apagar o rascunho local?')) return;
      localStorage.removeItem(DRAFT_KEY);
      draft = defaultDraft();
      lastPayload = null;
      currentSimulation = null;
      manualScheduleDraft = null;
      draft.lastPayload = null;
      draft.currentSimulation = null;
      draft.manualScheduleDraft = null;
      rerenderBuilder();
    });

    async function simulateCurrent() {
      if (manualScheduleDraft?.dirty) {
        const discard = confirm('Existem alteracoes manuais no calendario. Recalcular automaticamente descartara essas alteracoes.');
        if (!discard) return null;
        manualScheduleDraft = null;
        draft.manualScheduleDraft = null;
      }
      updateDraftFromGeneral();
      if (!validateDraft(form)) return null;
      lastPayload = payload();
      draft.lastPayload = lastPayload;
      let result = await simulatePlanningRequest(lastPayload);
      if (syncStockOnlyMaterialsFromSimulation(result)) {
        lastPayload = payload();
        draft.lastPayload = lastPayload;
        result = await simulatePlanningRequest(lastPayload);
      }
      renderSimulation(result, form);
      return result;
    }

    function manualDraftDailyMinutes() {
      const shifts = Array.isArray(draft.shifts) && draft.shifts.length ? draft.shifts : [defaultShift(0)];
      return shifts.reduce((sum, shift, index) => (
        sum + productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6)
      ), 0);
    }

    function openManualDraftChoiceModal({ title, bodyHtml, actions }) {
      page.querySelector('.manual-draft-choice-modal')?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop manual-draft-choice-modal';
      backdrop.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="manual-draft-choice-title">
          <div class="modal-header">
            <h3 id="manual-draft-choice-title">${escapeHtml(title)}</h3>
            <button class="link-button" type="button" data-manual-draft-choice="cancel">Cancelar</button>
          </div>
          <div class="manual-draft-choice-body">${bodyHtml}</div>
          <div class="form-actions modal-actions">
            ${actions.map(action => `<button class="${escapeHtml(action.className || 'secondary-button')}" type="button" data-manual-draft-choice="${escapeHtml(action.value)}">${escapeHtml(action.label)}</button>`).join('')}
          </div>
        </div>
      `;
      return new Promise(resolve => {
        const close = value => {
          backdrop.remove();
          resolve(value);
        };
        backdrop.addEventListener('click', event => {
          const button = event.target.closest('[data-manual-draft-choice]');
          if (button) close(button.dataset.manualDraftChoice || 'cancel');
          else if (event.target === backdrop) close('cancel');
        });
        backdrop.addEventListener('keydown', event => {
          if (event.key === 'Escape') close('cancel');
        });
        page.appendChild(backdrop);
        backdrop.querySelector('[data-manual-draft-choice]')?.focus();
      });
    }

    async function confirmManualCapacityDecision(error) {
      const capacity = Number(error?.proposedAllocation?.capacityPercent || 0);
      const choice = await openManualDraftChoiceModal({
        title: 'Capacidade do dia excedida',
        bodyHtml: `
          <p>Capacidade final prevista: <strong>${Number.isFinite(capacity) ? `${capacity.toFixed(2)}%` : '-'}</strong>.</p>
          <p>Escolha como tratar o excedente.</p>
        `,
        actions: [
          { value: 'cancel', label: 'Cancelar', className: 'secondary-button' },
          { value: 'split', label: 'Preencher o dia e reagendar excedente', className: 'secondary-button' },
          { value: 'override', label: 'Permitir capacidade extraordinaria', className: 'primary-button' }
        ]
      });
      return ['split', 'override'].includes(choice) ? choice : 'cancel';
    }

    async function confirmManualDraftMove(error) {
      if (error?.code === 'CONFIRM_MERGE') {
        const choice = await openManualDraftChoiceModal({
          title: 'Unificar producoes',
          bodyHtml: '<p>As quantidades, componentes e operacoes pai serao preservados em um unico card.</p>',
          actions: [
            { value: 'cancel', label: 'Cancelar', className: 'secondary-button' },
            { value: 'confirm', label: 'Unificar producoes', className: 'primary-button' }
          ]
        });
        return choice === 'confirm';
      }
      if (error?.code === 'CONFIRM_REPLACE') {
        const occupant = error.occupyingAllocation || {};
        const choice = await openManualDraftChoiceModal({
          title: 'Substituir producao programada',
          bodyHtml: `
            <p>Este periodo ja possui <strong>${escapeHtml(occupant.materialName || occupant.materialId || 'outra producao')}</strong>.</p>
            <p>Ao inserir a producao movida, a existente sera reagendada e os movimentos manuais anteriores serao preservados.</p>
          `,
          actions: [
            { value: 'cancel', label: 'Cancelar', className: 'secondary-button' },
            { value: 'confirm', label: 'Substituir e reagendar', className: 'primary-button' }
          ]
        });
        return choice === 'confirm';
      }
      return false;
    }

    productionCalendarMoveRunner = async (intent, move) => {
      const previousVisualState = { ...productionCalendarVisualState };
      const transactionTimestamp = new Date().toISOString();
      productionCalendarMoveInProgress = true;
      setOperationLoading(true, 'Validando movimentação...');
      try {
        if (!manualScheduleDraft) throw new Error('Rascunho manual indisponivel para movimentacao.');
        const calendarSnapshot = currentProductionCalendarSnapshot();
        const validationContext = currentManualScheduleValidationContext(calendarSnapshot);
        const decisions = {};
        const transact = () => applyManualScheduleTransaction({
          currentDraft: manualScheduleDraft,
          intent: {
            ...intent,
            allocationId: move.allocation.allocationId,
            targetDate: intent.to.date,
            targetMachineId: move.machine.machineId
          },
          draftContext: {
            machines: calendarSnapshot.machines,
            productivityMatrix: matrix,
            days: calendarSnapshot.days,
            dailyMinutes: manualDraftDailyMinutes(),
            now: transactionTimestamp,
            validatedAt: transactionTimestamp
          },
          validationContext,
          decisions
        });
        let transaction = transact();
        while (transaction.decisionRequired) {
          const decision = transaction.decisionContext || {};
          if (decision.code === 'CONFIRM_MERGE') {
            if (!await confirmManualDraftMove(decision)) return;
            decisions.confirmMerge = true;
          } else if (decision.code === 'CONFIRM_REPLACE') {
            if (!await confirmManualDraftMove(decision)) return;
            decisions.confirmReplace = true;
          } else if (decision.code === 'CAPACITY_EXCEEDED') {
            decisions.capacityDecision = await confirmManualCapacityDecision(decision);
            if (decisions.capacityDecision === 'cancel') return;
          } else {
            break;
          }
          transaction = transact();
        }
        if (!transaction.accepted) {
          productionCalendarVisualState = previousVisualState;
          const firstIssue = transaction.blockingIssues[0];
          const error = new Error(firstIssue?.message || 'Movimento recusado pela validação cronológica.');
          error.validation = transaction.validation;
          throw error;
        }
        manualScheduleDraft = transaction.draft;
        draft.manualScheduleDraft = manualScheduleDraft;
        saveDraftNow();
        if (String(previousVisualState.selectedAllocationId || '') === String(move.allocation.allocationId || '')) {
          productionCalendarVisualState = {
            ...productionCalendarVisualState,
            selectedAllocationId: null
          };
        }
        refreshTimelineOnly();
        toast(transaction.warnings.length
          ? `Produção movimentada com ${transaction.warnings.length} alerta(s).`
          : 'Produção movimentada no rascunho manual.');
      } catch (error) {
        productionCalendarVisualState = previousVisualState;
        const issues = [...(error?.validation?.errors || []), ...(error?.validation?.warnings || [])];
        const calendar = target.querySelector('.production-calendar-container');
        calendar?.querySelector('.production-calendar-rejection-details')?.remove();
        if (calendar && issues.length) {
          const details = document.createElement('details');
          details.className = 'production-calendar-validation-details production-calendar-rejection-details';
          details.innerHTML = `<summary>Detalhes do movimento recusado (${issues.length})</summary><ul>${issues.map(item => `<li>${escapeHtml(item.message)}</li>`).join('')}</ul>`;
          calendar.appendChild(details);
        }
        throw error;
      } finally {
        productionCalendarMoveInProgress = false;
        setOperationLoading(false);
      }
    };
    function focusCalendarCardFromFlow(node) {
      const materialId = String(node?.dataset.flowMaterialId || '');
      if (!materialId) return;
      const safeSelectorValue = value => (window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replaceAll('"', '\\"'));
      const productionIndexes = String(node.dataset.flowProductionIndexes || '')
        .split(',')
        .map(value => String(Number(value)))
        .filter(value => value !== 'NaN');
      const selector = productionIndexes.length
        ? productionIndexes.map(index => `.machine-production-card[data-material-id="${safeSelectorValue(materialId)}"][data-production-index="${safeSelectorValue(index)}"]`).join(',')
        : `.machine-production-card[data-material-id="${safeSelectorValue(materialId)}"]`;
      const card = target.querySelector(`.timeline-target ${selector}`)
        || target.querySelector(`.timeline-target .machine-production-card[data-material-id="${safeSelectorValue(materialId)}"]`);
      if (!card) {
        toast('Card correspondente não encontrado no calendário.');
        return;
      }
      target.querySelectorAll('.machine-production-card.is-flow-focused').forEach(item => item.classList.remove('is-flow-focused'));
      card.classList.add('is-flow-focused');
      const board = card.closest('.gantt-board');
      if (board) {
        const boardRect = board.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        board.scrollTo({
          left: Math.max(0, board.scrollLeft + cardRect.left - boardRect.left - (board.clientWidth / 2) + (cardRect.width / 2)),
          top: Math.max(0, board.scrollTop + cardRect.top - boardRect.top - (board.clientHeight / 2) + (cardRect.height / 2)),
          behavior: 'smooth'
        });
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      card.focus({ preventScroll: true });
      window.setTimeout(() => card.classList.remove('is-flow-focused'), 2200);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await withOperationLoading('Simulando planejamento...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('click', event => {
      if (event.target.closest('[data-stock-only], .stock-only-toggle')) return;
      const flowNode = event.target.closest('.production-flow-node[data-flow-material-id]');
      if (!flowNode) return;
      focusCalendarCardFromFlow(flowNode);
    });

    target.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const flowNode = event.target.closest('.production-flow-node[data-flow-material-id]');
      if (!flowNode) return;
      event.preventDefault();
      focusCalendarCardFromFlow(flowNode);
    });

    target.addEventListener('change', async event => {
      if (!event.target.matches('[data-stock-only]')) return;
      const materialId = Number(event.target.dataset.materialId);
      const productionIndexes = String(event.target.dataset.productionIndexes || event.target.dataset.productionIndex || '0')
        .split(',')
        .map(value => Number(value))
        .filter(value => Number.isFinite(value));
      const indexSet = new Set(productionIndexes);
      draft.stockOnlyMaterials = (draft.stockOnlyMaterials || []).filter(item =>
        !(indexSet.has(Number(item.productionIndex)) && Number(item.materialId) === materialId)
      );
      setStockOnlyChoice(productionIndexes, materialId, event.target.checked);
      if (event.target.checked) {
        productionIndexes.forEach(productionIndex => draft.stockOnlyMaterials.push({ productionIndex, materialId }));
      }
      saveDraftNow();
      try {
        await withOperationLoading('Recalculando produção...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-card-drop', async event => {
      const detail = event.detail || {};
      const snapshot = cloneDraftPlanningState();
      try {
        applyDropPlanningChange(detail);
        await withOperationLoading('Replanejando produção...', simulateCurrent);
      } catch (error) {
        restoreDraftPlanningState(snapshot);
        toast(error);
      }
    });

    target.addEventListener('operation-date-change', async event => {
      const key = String(event.detail.operationId || event.detail.materialId);
      draft.operationOverrides = draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {};
      draft.operationOverrides[key] = {
        ...(draft.operationOverrides[key] || {}),
        startDate: event.detail.startDate,
        startTime: event.detail.startTime
      };
      if (!key.includes(':')) {
        draft.operationOverrides[String(event.detail.materialId)] = {
          ...(draft.operationOverrides[String(event.detail.materialId)] || {}),
          startDate: event.detail.startDate,
          startTime: event.detail.startTime
        };
      }
      saveDraftNow();
      try {
        await withOperationLoading('Organizando produção...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-config-change', async event => {
      const changes = Array.isArray(event.detail.changes) ? event.detail.changes : [event.detail];
      draft.operationOverrides = draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {};
      changes.forEach(change => {
        const override = {
          machineName: change.machineName,
          peopleCount: change.peopleCount,
          productionModelName: change.productionModelName
        };
        operationOverrideKeys(change).forEach(key => {
          draft.operationOverrides[key] = {
            ...(draft.operationOverrides[key] || {}),
            ...override
          };
        });
      });
      saveDraftNow();
      try {
        await withOperationLoading('Aplicando alteração...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-split-change', async event => {
      const splits = Array.isArray(event.detail.splits) ? event.detail.splits : [event.detail];
      draft.operationSplits = Array.isArray(draft.operationSplits) ? draft.operationSplits : [];
      const operationIds = new Set(splits.map(split => String(split.operationId || split.materialId)));
      draft.operationSplits = (draft.operationSplits || []).filter(split => !operationIds.has(String(split.operationId)));
      splits.forEach(split => {
        draft.operationSplits.push({
          operationId: String(split.operationId || split.materialId),
          materialId: split.materialId,
          productionIndex: split.productionIndex,
          parts: split.parts
        });
      });
      saveDraftNow();
      try {
        await withOperationLoading('Recalculando produção...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-split-remove', async event => {
      const operationId = String(event.detail.operationId || event.detail.materialId || '');
      if (!operationId) return;
      draft.operationSplits = (draft.operationSplits || [])
        .filter(split => String(split.operationId) !== operationId);
      saveDraftNow();
      try {
        await withOperationLoading('Atualizando fluxo produtivo...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('calendar-team-capacity-change', async event => {
      const date = event.detail?.date;
      const overrides = event.detail?.overrides;
      if (!date || !overrides || typeof overrides !== 'object') return;
      draft.dailyTeamOverrides = draft.dailyTeamOverrides && typeof draft.dailyTeamOverrides === 'object' ? draft.dailyTeamOverrides : {};
      draft.dailyTeamOverrides[date] = {
        ...(draft.dailyTeamOverrides[date] || {}),
        ...overrides
      };
      saveDraftNow();
      try {
        await withOperationLoading('Recalculando produção...', simulateCurrent);
      } catch (error) {
        refreshTimelineOnly();
        markPlanningInconsistent();
        toast(error);
      }
    });

    target.querySelector('.recalculate-planning')?.addEventListener('click', async () => {
      try {
        await withOperationLoading('Recalculando produção...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    form.elements.save?.addEventListener('click', async () => {
      if (!canWritePlanning) return;
      try {
        const simulation = await withOperationLoading('Recalculando produção...', simulateCurrent);
        if (!simulation) return;
        draft.planningCode = draft.planningCode || generatePlanningCode(draft.productions.length);
        lastPayload = normalizePlanningPayload(lastPayload || payload(), draft.planningCode);
        saveDraftNow();
        openFinalSummaryModal(currentSimulation, draft.planningCode);
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Resumo do planejamento ${draft.planningCode} pronto para lançamento.` }));
      } catch (error) {
        toast(error);
      }
    });
  }

  async function renderHistoryTab() {
    target.innerHTML = `
      <div class="panel planning-history-panel">
        <div class="section-heading">
          <h2>Hist&oacute;rico de Planejamentos</h2>
          <button class="secondary-button refresh-history" type="button">Atualizar</button>
        </div>
        <div class="planning-history-target"></div>
      </div>
    `;
    const historyTarget = target.querySelector('.planning-history-target');

    async function loadHistory() {
      const rows = await api('/planning/plans');
      historyTarget.innerHTML = '';
      historyTarget.appendChild(DataTable({
        columns: [
          { label: 'C&oacute;digo do planejamento', key: 'code' },
          { label: 'Per&iacute;odo', render: row => row.period_label || operationPeriod(row.operations, row.start_date, row.end_date).label, sortValue: row => row.period_start_date || row.start_date || '' },
          { label: 'Produ&ccedil;&otilde;es', render: row => {
            const children = Array.isArray(row.schedule_tree?.children) ? row.schedule_tree.children : [];
            const match = String(row.material_name || '').match(/^(\d+)\s+produ/i);
            return children.length && isPlanningRootName(row.schedule_tree?.materialName) ? children.length : Number(match?.[1] || 1);
          } },
          { label: 'Status', render: row => planningStatusPill(row.status), sortValue: row => formatStatus(row.status) },
          { label: 'A&ccedil;&otilde;es', render: row => `
            <div class="history-actions">
              <button class="small-action-button" data-view="${row.id}" type="button">Visualizar</button>
              <button class="small-action-button" data-pdf="${row.id}" type="button">Gerar PDF</button>
              ${canWritePlanning && !isCanceledStatus(row.status) ? `<button class="small-action-button danger" data-cancel="${row.id}" type="button">Cancelar</button>` : ''}
            </div>
          ` }
        ],
        rows,
        rowClass: row => isCanceledStatus(row.status) ? 'planning-canceled-row' : ''
      }));
    }

    async function downloadPdf(id) {
      const blob = await api(`/planning/plans/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `planejamento-${id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    }

    async function cancelPlan(id) {
      if (!confirm('Confirma o cancelamento deste planejamento?')) return;
      await api(`/planning/plans/${id}/cancel`, { method: 'POST', body: { reason: 'Cancelado pelo usuário' } });
      await loadHistory();
    }

    async function viewPlan(id) {
      const detail = await api(`/planning/plans/${id}`);
      openPlanDetailModal(detail);
    }

    target.querySelector('.refresh-history').addEventListener('click', () => loadHistory().catch(toast));
    historyTarget.addEventListener('click', async event => {
      if (event.target.dataset.pdf) return downloadPdf(event.target.dataset.pdf);
      if (event.target.dataset.cancel) return cancelPlan(event.target.dataset.cancel);
      if (event.target.dataset.view) return viewPlan(event.target.dataset.view);
    });
    await loadHistory();
  }

  async function render() {
    renderTabs();
    setInternalLoading(target, activeTab === 'history' ? 'Carregando historico...' : 'Carregando planejamento...');
    try {
      if (activeTab === 'history') return await renderHistoryTab();
      return await renderSimulationTab();
    } catch (error) {
      setInternalError(target, error.message || 'Não foi possível carregar o planejamento.');
      throw error;
    }
  }

  render().catch(toast);
  return page;
}
