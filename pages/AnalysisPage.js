import { api } from '../shared/api.js';
import { getCurrentUser } from '../shared/api.js';
import { CalendarTimeline, productionCalendarColor } from '../shared/CalendarTimeline.js';
import { nextSortDirection, sortTableRows } from '../shared/DataTable.js';
import { InternalTabs } from '../shared/InternalTabs.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';
import { PcpStatusPill } from '../shared/StatusPill.js';
import { holidayForDate } from '../services/workingDays.service.js';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_FORMAT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 58;
const TIME_TOP_PAD = 18;
const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';
const PCP_IDEAL_DAYS_KEY = 'acofer.analysis.pcpIdealDays';
const PCP_IDEAL_OVERRIDES_STORAGE_KEY = 'acofer.analysis.pcpIdealDaysByMaterial';
const PCP_PRIORITY_STORAGE_KEY = 'acofer.analysis.pcpPriorities';
const PLANNING_DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';
const COMMERCIAL_PINS_STORAGE_KEY = 'acofer.commercial.materialPins.v1';
const PCP_STATUS_WEIGHT = { critical: 0, attention: 1, productionAlert: 2, planned: 3, outOfRadar: 4, unknown: 5 };
const PCP_GROUP_WEIGHT = {
  criticalOpen: 0,
  criticalPartial: 1,
  attentionOpen: 2,
  attentionPartial: 3,
  productionAlertOpen: 4,
  productionAlertPartial: 5,
  planned: 6,
  other: 7
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function dateKey(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return dateKey(new Date());
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function utcDate(value) {
  return new Date(`${dateKey(value)}T00:00:00Z`);
}

function addDays(value, days) {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function addMonths(value, months) {
  const date = utcDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return dateKey(date);
}

function startOfWeek(value) {
  return addDays(value, -utcDate(value).getUTCDay());
}

function startOfCommercialWeek(value) {
  const day = utcDate(value).getUTCDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

function monthRange(value) {
  const date = utcDate(value);
  const first = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start: startOfWeek(first), end: addDays(last, 6 - utcDate(last).getUTCDay()) };
}

function viewRange(value, view) {
  if (view === 'day') return { start: value, end: value };
  if (view === 'week') {
    const start = startOfWeek(value);
    return { start, end: addDays(start, 6) };
  }
  if (view === 'year') return { start: `${value.slice(0, 4)}-01-01`, end: `${value.slice(0, 4)}-12-31` };
  return monthRange(value);
}

function commercialViewRange(value, view) {
  if (view !== 'week') return viewRange(value, view);
  const start = startOfCommercialWeek(value);
  return { start, end: addDays(start, 6) };
}

function formatDate(value) {
  return utcDate(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value) {
  return `${formatDate(value.date)} ${minutesToTime(value.minutes)}`;
}

function formatQty(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatCeilQty(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return formatQty(value);
  return Math.ceil(quantity).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatNumber(value, maximumFractionDigits = 1, minimumFractionDigits = 1) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits, minimumFractionDigits });
}

function readStockMinimumDays() {
  const value = String(localStorage.getItem(STOCK_MINIMUM_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : null;
}

function readPcpPriorities() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PCP_PRIORITY_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePcpPriorities(priorities) {
  localStorage.setItem(PCP_PRIORITY_STORAGE_KEY, JSON.stringify(priorities || {}));
}

function readPcpIdealDays(minimumDays) {
  const fallback = Math.round(Number(minimumDays || 0) * 1.5);
  const value = String(localStorage.getItem(PCP_IDEAL_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return fallback;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : fallback;
}

function writePcpIdealDays(days) {
  localStorage.setItem(PCP_IDEAL_DAYS_KEY, String(days));
}

function readCommercialPins() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMMERCIAL_PINS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(pin => pin && pin.id && pin.date) : [];
  } catch {
    return [];
  }
}

function writeCommercialPins(pins) {
  localStorage.setItem(COMMERCIAL_PINS_STORAGE_KEY, JSON.stringify(Array.isArray(pins) ? pins : []));
}

function commercialUserKey(user) {
  return String(user?.id || user?.email || user?.name || user?.role || 'usuario-local');
}

function commercialUserName(user) {
  return user?.name || user?.email || user?.username || user?.role || 'Usuário local';
}

function commercialUserColor(user) {
  const palette = ['#2F80ED', '#16A34A', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#4B5563'];
  const key = commercialUserKey(user);
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = ((hash * 31) + key.charCodeAt(index)) >>> 0;
  return palette[hash % palette.length];
}

function commercialStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase();
  const labels = {
    planned: 'Planejado',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
    in_progress: 'Em andamento',
    completed: 'Cumprido',
    exceeded: 'Excedido',
    partial: 'Parcial',
    programado: 'Planejado',
    planejado: 'Planejado',
    cancelado: 'Cancelado',
    'em andamento': 'Em andamento',
    cumprido: 'Cumprido',
    excedido: 'Excedido',
    parcial: 'Parcial'
  };
  if (labels[normalized]) return labels[normalized];
  return normalized ? 'Status não informado' : 'Não informado';
}

function createCommercialPinId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `pin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readPcpIdealOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PCP_IDEAL_OVERRIDES_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePcpIdealOverrides(overrides) {
  localStorage.setItem(PCP_IDEAL_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides || {}));
}

function currentStockDurationDays(row) {
  const salesPerDay = Number(row.salesPerDayQty);
  const balance = Number(row.totalLocationsQty);
  if (!Number.isFinite(salesPerDay) || salesPerDay <= 0 || !Number.isFinite(balance)) return null;
  return Math.max(balance, 0) / salesPerDay;
}

function roundStockDurationForDisplay(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return null;
  const integer = Math.trunc(days);
  const decimal = Math.round((days - integer) * 10);
  return integer + (decimal >= 6 ? 1 : 0);
}

function formatStockDurationForDisplay(value) {
  const displayDays = roundStockDurationForDisplay(value);
  if (displayDays === null) return 'Não estimado';
  return `${formatNumber(displayDays, 0, 0)} ${displayDays === 1 ? 'dia' : 'dias'}`;
}

function futureStockDurationDays(row, plannedRemainingQty = 0) {
  const salesPerDay = Number(row.salesPerDayQty);
  const balance = Number(row.totalLocationsQty) + Number(plannedRemainingQty || 0);
  if (!Number.isFinite(salesPerDay) || salesPerDay <= 0 || !Number.isFinite(balance)) return null;
  return Math.max(balance, 0) / salesPerDay;
}

function pcpStatusForDuration(durationDays, minimumDays) {
  if (!Number.isFinite(durationDays)) return { key: 'unknown', label: 'Sem estimativa', className: 'unknown' };
  if (durationDays <= minimumDays * 0.5) return { key: 'critical', label: 'Crítico', className: 'critical' };
  if (durationDays <= minimumDays) return { key: 'attention', label: 'Atenção', className: 'attention' };
  if (durationDays <= minimumDays * 1.2) return { key: 'productionAlert', label: 'Alerta de produção', className: 'production-alert' };
  return { key: 'outOfRadar', label: 'Fora do radar', className: 'out-of-radar' };
}

function plannedPcpStatus() {
  return { key: 'planned', label: 'Planejado', className: 'planned' };
}

function materialKey(row) {
  return String(row.material?.id || row.material?.name || (row.codes || []).join('|'));
}

function normalizeMaterialLookup(value) {
  return normalizeText(value);
}

function addPlannedBalanceKey(map, key, item) {
  const normalizedKey = normalizeMaterialLookup(key);
  if (!normalizedKey) return;
  const current = map.get(normalizedKey) || { plannedQty: 0, producedQty: 0, remainingQty: 0 };
  map.set(normalizedKey, {
    ...item,
    plannedQty: current.plannedQty + Number(item.plannedQty || 0),
    producedQty: current.producedQty + Number(item.producedQty || 0),
    remainingQty: current.remainingQty + Number(item.remainingQty || 0)
  });
}

function plannedBalanceMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const item = {
      plannedQty: Number(row.planned_qty || row.plannedQty || 0),
      producedQty: Number(row.produced_qty || row.producedQty || 0),
      remainingQty: Number(row.remaining_qty || row.remainingQty || 0),
      unit: row.unit || row.planned_unit || row.plannedUnit || ''
    };
    addPlannedBalanceKey(map, row.material_id, item);
    addPlannedBalanceKey(map, row.material_name, item);
    addPlannedBalanceKey(map, row.material_code, item);
  }
  return map;
}

function plannedBalanceForStockRow(map, row) {
  const keys = [
    row.material?.id,
    row.material?.name,
    ...(row.codes || [])
  ].map(normalizeMaterialLookup).filter(Boolean);
  for (const key of keys) {
    const item = map.get(key);
    if (!item) continue;
    return {
      plannedQty: Number(item.plannedQty || 0),
      producedQty: Number(item.producedQty || 0),
      remainingQty: Number(item.remainingQty || 0),
      unit: item.unit || ''
    };
  }
  return { plannedQty: 0, producedQty: 0, remainingQty: 0, unit: '' };
}

function productivityCodes(row) {
  if (Array.isArray(row.material_codes) && row.material_codes.length) return row.material_codes.map(String);
  return String(row.material_code || '').split(',').map(code => code.trim()).filter(Boolean);
}

function productivityMatchesMaterial(productivity, stockRow) {
  const materialName = normalizeText(stockRow.material?.name);
  const productivityName = normalizeText(productivity.material_name);
  if (materialName && productivityName && materialName === productivityName) return true;
  const stockCodes = new Set((stockRow.codes || []).map(code => normalizeText(code)));
  return productivityCodes(productivity).some(code => stockCodes.has(normalizeText(code)));
}

function productivityRate(row) {
  const outputQty = Number(row.output_qty);
  const timeSeconds = Number(row.time_seconds ?? Number(row.time_minutes || 0) * 60);
  if (!Number.isFinite(outputQty) || outputQty <= 0 || !Number.isFinite(timeSeconds) || timeSeconds <= 0) return 0;
  return outputQty / timeSeconds;
}

function bestProductivityForMaterial(matrixRows, stockRow) {
  return (matrixRows || [])
    .filter(row => row.active !== false && productivityMatchesMaterial(row, stockRow))
    .sort((left, right) => productivityRate(right) - productivityRate(left))[0] || null;
}

function pcpWorkdayMinutes(calendar) {
  const minutes = (calendar?.shifts || [])
    .reduce((sum, shift) => sum + Math.max(Number(shift.dailyMinutes || 0), 0), 0);
  return minutes > 0 ? Math.round(minutes) : 528;
}

function formatDurationFromSeconds(seconds, calendar = null) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 'Não estimado';
  const totalMinutes = Math.max(Math.round(value / 60), 0);
  const workdayMinutes = pcpWorkdayMinutes(calendar);
  const days = Math.floor(totalMinutes / workdayMinutes);
  const remainingMinutes = totalMinutes % workdayMinutes;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || (!days && !hours)) parts.push(`${String(minutes).padStart(2, '0')}min`);
  if (!days && hours && !minutes) parts.push('00min');
  return parts.join(' ');
}

function estimatedProductionSeconds(quantity, productivity) {
  const outputQty = Number(productivity?.output_qty);
  const timeSeconds = Number(productivity?.time_seconds ?? Number(productivity?.time_minutes || 0) * 60);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(outputQty) || outputQty <= 0 || !Number.isFinite(timeSeconds) || timeSeconds <= 0) return null;
  return (quantity / outputQty) * timeSeconds;
}

function canEstimatePcpProduction(row) {
  return Number.isFinite(Number(row.salesPerDayQty))
    && Number(row.salesPerDayQty) > 0
    && !!row.productivity
    && !!String(row.productivity.machine_name || '').trim()
    && Number.isFinite(Number(row.productivity.people_count))
    && Number(row.productivity.people_count) > 0
    && row.estimatedSeconds !== null;
}

function pcpObservation(row) {
  if (!Number.isFinite(Number(row.salesPerDayQty)) || Number(row.salesPerDayQty) <= 0) return 'Sem vendas/dia estimada.';
  if (row.status.key === 'planned') return 'Sugestao atual coberta por planejamento ativo.';
  if (!row.productivity) return 'Sem matriz de produtividade.';
  if (!String(row.productivity.machine_name || '').trim()) return 'Sem máquina cadastrada.';
  if (!Number.isFinite(Number(row.productivity.people_count)) || Number(row.productivity.people_count) <= 0) return 'Sem pessoas configuradas.';
  if (row.status.key === 'outOfRadar') return 'Produto fora do radar.';
  return 'Pronto para análise do PCP.';
}

function pcpSuggestionForIdealDays(row, idealDays) {
  const salesPerDay = Number(row.salesPerDayQty);
  const grossTargetQty = Number.isFinite(salesPerDay) && salesPerDay > 0 && Number.isFinite(row.durationDays)
    ? Math.max((idealDays - row.durationDays) * salesPerDay, 0)
    : null;
  const targetQty = grossTargetQty === null
    ? null
    : Math.max(grossTargetQty - Math.max(Number(row.plannedRemainingQty || 0), 0), 0);
  return {
    grossTargetQty,
    targetQty,
    estimatedSeconds: row.productivity ? estimatedProductionSeconds(targetQty, row.productivity) : null
  };
}

function idealOverrideForKey(overrides, key) {
  const value = Number(overrides?.[key]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function pcpCoverageGroup(row) {
  if (row.status.key === 'planned') return 'planned';
  const suffix = Number(row.plannedRemainingQty || 0) > 0 ? 'Partial' : 'Open';
  if (row.baseStatus?.key === 'critical') return `critical${suffix}`;
  if (row.baseStatus?.key === 'attention') return `attention${suffix}`;
  if (row.baseStatus?.key === 'productionAlert') return `productionAlert${suffix}`;
  return 'other';
}

function buildPcpRows(stockRows = [], minimumDays, matrixRows = [], priorities = {}, idealDays = minimumDays * 1.5, idealOverrides = {}, plannedBalances = new Map()) {
  return stockRows
    .filter(row => row.salesBlocked !== true)
    .map(row => {
      const key = materialKey(row);
      const durationDays = currentStockDurationDays(row);
      const baseStatus = pcpStatusForDuration(durationDays, minimumDays);
      const productivity = bestProductivityForMaterial(matrixRows, row);
      const rowIdealDays = idealOverrideForKey(idealOverrides, key) || idealDays;
      const plannedBalance = plannedBalanceForStockRow(plannedBalances, row);
      const plannedRemainingQty = Math.max(Number(plannedBalance.remainingQty || 0), 0);
      const adjustedDurationDays = futureStockDurationDays(row, plannedRemainingQty);
      const suggestion = pcpSuggestionForIdealDays({ ...row, durationDays, productivity, plannedRemainingQty }, rowIdealDays);
      const fullyPlanned = suggestion.grossTargetQty !== null
        && suggestion.grossTargetQty > 0
        && plannedRemainingQty >= suggestion.grossTargetQty;
      const status = fullyPlanned ? plannedPcpStatus() : baseStatus;
      return {
        ...row,
        key,
        durationDays,
        adjustedDurationDays,
        baseStatus,
        status,
        minimumDays,
        idealDays: rowIdealDays,
        followsGlobalIdeal: !idealOverrideForKey(idealOverrides, key),
        grossTargetQty: suggestion.grossTargetQty,
        plannedQty: plannedBalance.plannedQty,
        plannedProducedQty: plannedBalance.producedQty,
        plannedRemainingQty,
        plannedUnit: plannedBalance.unit || row.material?.primary_unit || row.productivity?.output_unit || '',
        futureStockQty: Number(row.totalLocationsQty || 0) + plannedRemainingQty,
        targetQty: suggestion.targetQty,
        productivity,
        estimatedSeconds: suggestion.estimatedSeconds,
        manualPriority: priorities[key] || ''
      };
    })
    .map(row => ({ ...row, observation: pcpObservation(row) }));
}

function recalculatePcpRowsForIdealDays(rows = [], idealDays, idealOverrides = {}) {
  return rows.map(row => {
    const override = idealOverrideForKey(idealOverrides, row.key);
    const rowIdealDays = override || idealDays;
    const suggestion = pcpSuggestionForIdealDays(row, rowIdealDays);
    const fullyPlanned = suggestion.grossTargetQty !== null
      && suggestion.grossTargetQty > 0
      && Number(row.plannedRemainingQty || 0) >= suggestion.grossTargetQty;
    return {
      ...row,
      idealDays: rowIdealDays,
      followsGlobalIdeal: !override,
      grossTargetQty: suggestion.grossTargetQty,
      status: fullyPlanned ? plannedPcpStatus() : row.baseStatus,
      targetQty: suggestion.targetQty,
      estimatedSeconds: suggestion.estimatedSeconds
    };
  });
}

function sortPcpRows(rows) {
  return [...rows].sort((left, right) => {
    const groupDiff = (PCP_GROUP_WEIGHT[pcpCoverageGroup(left)] ?? PCP_GROUP_WEIGHT.other)
      - (PCP_GROUP_WEIGHT[pcpCoverageGroup(right)] ?? PCP_GROUP_WEIGHT.other);
    if (groupDiff) return groupDiff;
    const leftPriority = Number(left.manualPriority);
    const rightPriority = Number(right.manualPriority);
    const leftHasPriority = Number.isFinite(leftPriority) && leftPriority > 0;
    const rightHasPriority = Number.isFinite(rightPriority) && rightPriority > 0;
    if (leftHasPriority || rightHasPriority) {
      if (!leftHasPriority) return 1;
      if (!rightHasPriority) return -1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    }
    return (PCP_STATUS_WEIGHT[left.status.key] - PCP_STATUS_WEIGHT[right.status.key])
      || ((left.durationDays ?? Number.POSITIVE_INFINITY) - (right.durationDays ?? Number.POSITIVE_INFINITY))
      || (Number(right.salesPerDayQty || 0) - Number(left.salesPerDayQty || 0))
      || String(left.material?.name || '').localeCompare(String(right.material?.name || ''), 'pt-BR');
  });
}

function readPlanningDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLANNING_DRAFT_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isBusinessDate(value) {
  return !isWeekend(value) && !holidayForDate(value);
}

function nextBusinessDate(value) {
  let current = dateKey(value);
  for (let guard = 0; guard < 3700; guard += 1) {
    if (isBusinessDate(current)) return current;
    current = addDays(current, 1);
  }
  return dateKey(value);
}

function addBusinessDays(value, days) {
  let current = dateKey(value);
  let remaining = Math.max(Math.floor(Number(days) || 0), 0);
  while (remaining > 0) {
    current = addDays(current, 1);
    if (isBusinessDate(current)) remaining -= 1;
  }
  return current;
}

function estimatedStockEndLabel(row) {
  const salesPerDay = Number(row.salesPerDayQty);
  const stockQty = Number(row.futureStockQty ?? row.totalLocationsQty);
  if (!Number.isFinite(stockQty)) return 'Não estimado';
  if (stockQty <= 0) return 'Hoje';
  if (!Number.isFinite(salesPerDay) || salesPerDay <= 0) return 'Não estimado';
  const businessDaysToEnd = Math.max(Math.ceil(stockQty / salesPerDay), 1);
  const firstConsumptionDate = nextBusinessDate(localDateKey());
  return formatDate(addBusinessDays(firstConsumptionDate, businessDaysToEnd - 1));
}

function parseOperationalHours(value) {
  const rawValue = String(value ?? '').trim();
  const durationValue = rawValue.match(/^(\d+),(\d{2})$/);
  if (durationValue && Number(durationValue[2]) <= 59) {
    return Number(durationValue[1]) + (Number(durationValue[2]) / 60);
  }
  const normalized = rawValue.includes(',') ? rawValue.replace(/\./g, '').replace(',', '.') : rawValue;
  const number = Number(normalized || 0);
  return Number.isFinite(number) ? number : 0;
}

function parseShiftTime(value, fallback = '07:00') {
  const [hours, minutes] = String(value || fallback).split(':').map(part => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return parseShiftTime(fallback, '07:00');
  return Math.max(0, (hours * 60) + minutes);
}

function normalizePcpShift(shift = {}, index = 0) {
  const defaultStart = index === 0 ? '07:00' : '17:00';
  const shiftStart = parseShiftTime(shift.shiftStartTime, defaultStart);
  const pauseMinutes = Math.max(parseOperationalHours(shift.pauseHours ?? shift.lunchHours ?? 0), 0) * 60;
  const dailyMinutes = Math.max(parseOperationalHours(shift.hoursPerDay || '8,48'), 1 / 60) * 60;
  const calculatedEnd = shiftStart + dailyMinutes + pauseMinutes;
  let shiftEnd = parseShiftTime(shift.shiftEndTime, minutesToTime(calculatedEnd));
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
  const pauseStart = shift.pauseStartTime
    ? parseShiftTime(shift.pauseStartTime, minutesToTime(shiftStart + Math.floor((shiftEnd - shiftStart - pauseMinutes) / 2)))
    : index === 0 ? 12 * 60 : shiftStart + Math.max(Math.floor((shiftEnd - shiftStart - pauseMinutes) / 2), 0);
  const pauseEnd = pauseStart + pauseMinutes;
  const pauseOverlap = Math.max(Math.min(shiftEnd, pauseEnd) - Math.max(shiftStart, pauseStart), 0);
  const availableMinutes = Math.max(shiftEnd - shiftStart - pauseOverlap, 1);
  return {
    shiftStart,
    shiftEnd,
    pauseStart,
    pauseEnd,
    dailyMinutes: Math.min(dailyMinutes, availableMinutes)
  };
}

function pcpProductionCalendar() {
  const draft = readPlanningDraft();
  const shifts = Array.isArray(draft.shifts) && draft.shifts.length
    ? draft.shifts
    : [{ hoursPerDay: '8,48', shiftStartTime: '07:00', pauseHours: '1,12', shiftEndTime: '16:40' }];
  return { shifts: shifts.map(normalizePcpShift) };
}

function workWindowsForPcpShift(date, shift) {
  const rawWindows = [];
  if (shift.pauseEnd <= shift.shiftStart || shift.pauseStart >= shift.shiftEnd || shift.pauseEnd <= shift.pauseStart) {
    rawWindows.push({ date, start: shift.shiftStart, end: shift.shiftEnd });
  } else {
    if (shift.shiftStart < shift.pauseStart) rawWindows.push({ date, start: shift.shiftStart, end: Math.min(shift.pauseStart, shift.shiftEnd) });
    if (shift.pauseEnd < shift.shiftEnd) rawWindows.push({ date, start: Math.max(shift.pauseEnd, shift.shiftStart), end: shift.shiftEnd });
  }

  const windows = [];
  let remaining = Math.max(shift.dailyMinutes, 1);
  for (const window of rawWindows) {
    if (remaining <= 0) break;
    const minutes = Math.max(window.end - window.start, 0);
    if (!minutes) continue;
    const used = Math.min(minutes, remaining);
    windows.push({ ...window, end: window.start + used });
    remaining -= used;
  }
  return windows;
}

function workWindowsForPcpDate(date, calendar) {
  if (!isBusinessDate(date)) return [];
  return calendar.shifts
    .flatMap(shift => workWindowsForPcpShift(date, shift))
    .sort((left, right) => left.start - right.start);
}

function nextPcpWorkStart(cursor, calendar) {
  let currentDate = cursor.date;
  let minutes = cursor.minutes;
  for (let guard = 0; guard < 3700; guard += 1) {
    const windows = workWindowsForPcpDate(currentDate, calendar);
    for (const window of windows) {
      if (minutes <= window.start) return { date: currentDate, minutes: window.start };
      if (minutes < window.end) return { date: currentDate, minutes };
    }
    currentDate = addDays(currentDate, 1);
    minutes = 0;
  }
  return cursor;
}

function pcpWindowForCursor(cursor, calendar) {
  return workWindowsForPcpDate(cursor.date, calendar)
    .find(window => cursor.minutes >= window.start && cursor.minutes < window.end);
}

function addPcpProductionMinutes(cursor, durationMinutes, calendar) {
  let current = nextPcpWorkStart(cursor, calendar);
  let remaining = Math.max(Number(durationMinutes) || 0, 0);
  while (remaining > 0) {
    current = nextPcpWorkStart(current, calendar);
    const window = pcpWindowForCursor(current, calendar);
    if (!window) {
      current = nextPcpWorkStart({ date: addDays(current.date, 1), minutes: 0 }, calendar);
      continue;
    }
    const used = Math.min(remaining, window.end - current.minutes);
    current = { date: current.date, minutes: current.minutes + used };
    remaining -= used;
  }
  return current;
}

function normalizeCursorDateTime(cursor) {
  const dayOffset = Math.floor(cursor.minutes / (24 * 60));
  const minutes = ((Math.round(cursor.minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  return { date: addDays(cursor.date, dayOffset), minutes };
}

function estimatedProductionEndLabel(row, calendar) {
  if (!canEstimatePcpProduction(row)) return 'Não estimado';
  const durationMinutes = Math.ceil(Number(row.estimatedSeconds) / 60);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 'Não estimado';
  const now = new Date();
  const start = nextPcpWorkStart({
    date: localDateKey(now),
    minutes: (now.getHours() * 60) + now.getMinutes()
  }, calendar);
  return formatDateTime(normalizeCursorDateTime(addPcpProductionMinutes(start, durationMinutes, calendar)));
}

function pcpDraftProduction(row, index) {
  const material = row.material || {};
  const suggestedQty = Number(row.targetQty);
  return {
    id: `pcp-production-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    materialId: material.id || '',
    materialSearch: material.name || '',
    productionModelName: '',
    plannedQty: Number.isFinite(suggestedQty) && suggestedQty > 0 ? Number(suggestedQty.toFixed(3)) : '',
    machineName: row.productivity?.machine_name || '',
    peopleCount: row.productivity?.people_count ? String(row.productivity.people_count) : '',
    desiredDate: '',
    transports: [],
    source: 'Assistente PCP',
    sourceKey: row.key,
    sourcePriority: row.manualPriority || '',
    sourceObservation: row.observation || ''
  };
}

function sendPcpRowsToPlanning(rows) {
  const selectedRows = rows.filter(row => Number(row.targetQty) > 0);
  if (!selectedRows.length) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Marque ao menos um material para planejar.' }));
    return;
  }
  const currentDraft = readPlanningDraft();
  localStorage.setItem(PLANNING_DRAFT_KEY, JSON.stringify({
    ...currentDraft,
    productions: selectedRows.map(pcpDraftProduction),
    stockOnlyMaterials: [],
    stockOnlyMaterialChoices: [],
    operationOverrides: {},
    operationSplits: [],
    dailyTeamOverrides: currentDraft.dailyTeamOverrides || {},
    lastPayload: null,
    currentSimulation: null
  }));
  sessionStorage.setItem('planejamento_active_tab', 'planning');
  sessionStorage.setItem('planejamento_planning_tab', 'simulation');
  window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `${selectedRows.length} produção(ões) enviadas ao rascunho do Planejamento.` }));
  window.dispatchEvent(new CustomEvent('planejamento:navigate'));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function commercialMaterialKeys(row = {}) {
  return [
    row.material_id,
    row.material?.id,
    row.material_name,
    row.material?.name,
    row.material_code,
    ...(Array.isArray(row.material_codes) ? row.material_codes : []),
    ...(Array.isArray(row.codes) ? row.codes : [])
  ].map(normalizeText).filter(Boolean);
}

function isIntermediateCommercialMaterial(row = {}) {
  const text = normalizeText([
    row.material_name,
    row.material?.name,
    row.name,
    row.material_code,
    ...(Array.isArray(row.material_codes) ? row.material_codes : []),
    ...(Array.isArray(row.codes) ? row.codes : [])
  ].join(' '));
  return /\b(bobina|bobinas|rolo|rolos|vareta|varetas|semiacabado|semiacabados)\b/.test(text);
}

function isSellableCommercialMaterial(row = {}) {
  if (row.active === false || row.material?.active === false) return false;
  if (row.permits_sales === false || row.material?.permits_sales === false) return false;
  if (row.is_initial_raw_material === true || row.material?.is_initial_raw_material === true) return false;
  return !isIntermediateCommercialMaterial(row);
}

function commercialMaterialMatchesEvent(materialKeys, event = {}) {
  if (!materialKeys.size) return true;
  return commercialMaterialKeys(event).some(key => materialKeys.has(key));
}

function isWeekend(value) {
  const day = utcDate(value).getUTCDay();
  return day === 0 || day === 6;
}

function timeMinutes(value) {
  const match = String(value || '').match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function eventStartMinutes(event) {
  return timeMinutes(event.start_time || event.startTime);
}

function eventEndMinutes(event) {
  return timeMinutes(event.end_time || event.endTime);
}

function normalizedCapacityLabel(value) {
  const label = String(value || '').trim();
  const turn = label.match(/^T(?:urno)?\s*(\d+)$/i);
  return turn ? `Turno ${Number(turn[1])}` : label;
}

function capacityLabelForEvent(event = {}) {
  return normalizedCapacityLabel(
    event.team_capacity_label
      || event.teamCapacityLabel
      || (Number.isFinite(Number(event.production_index)) ? `Turno ${Number(event.production_index) + 1}` : '')
  );
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

function criticalStockRows(rows = [], minimumDays = null) {
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

function eventPeriod(event) {
  const start = event.start_time || event.startTime;
  const end = event.end_time || event.endTime;
  if (start && end) return `${String(start).slice(0, 5)}–${String(end).slice(0, 5)}`;
  return start ? String(start).slice(0, 5) : 'Evento do dia';
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}h`;
}

function eventColorStyle(event) {
  const color = productionCalendarColor(Number(event.production_index || 0), event.production_color);
  return `--event-bg:${color.bg};--event-border:${color.border};--event-text:${color.text};`;
}

function eventColor(event) {
  return productionCalendarColor(Number(event.production_index || 0), event.production_color);
}

function eventTooltip(event) {
  return [
    event.planning_code || `Plano ${event.plan_id}`,
    event.material_name,
    `${formatQty(event.planned_qty)} ${event.planned_unit || ''}`.trim(),
    event.machine_name || 'Sem máquina',
    `${Number(event.people_count || 0)} pessoa(s)`,
    eventPeriod(event)
  ].join(' • ');
}

function isTransportEvent(event) {
  return String(event?.operation_type || event?.operationType || '').toLowerCase() === 'transport'
    || String(event?.status || '').toLowerCase() === 'transporte'
    || String(event?.machine_name || event?.machineName || '').toLowerCase() === 'transporte';
}

function titleFor(value, view, rangeForView = viewRange) {
  if (view === 'day') return formatDate(value);
  if (view === 'week') {
    const range = rangeForView(value, view);
    return `${formatDate(range.start)} a ${formatDate(range.end)}`;
  }
  if (view === 'year') return value.slice(0, 4);
  return MONTH_FORMAT.format(utcDate(value));
}

function eventsByDate(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = dateKey(event.planned_date);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }
  return grouped;
}

function dayCapacityPills(capacities = [], date = '') {
  return capacities
    .sort((left, right) => String(left.label).localeCompare(String(right.label)))
    .map(item => `<button class="analysis-team-capacity${item.overridden ? ' has-override' : ''}${item.exceeded ? ' exceeded' : ''}" type="button" data-analysis-capacity-date="${escapeHtml(date)}" data-analysis-capacity-label="${escapeHtml(item.label)}" title="${escapeHtml(`${item.label}: equipe ${item.used}/${item.available || 0}${item.overridden ? ' (excecao do dia)' : ''}${item.exceeded ? ' - capacidade excedida' : ''}`)}">${escapeHtml(item.label.replace(/^Turno\s*/i, 'T'))}: ${item.used}/${item.available || 0}</button>`)
    .join('');
}

function monthGroupingKey(event) {
  return [
    dateKey(event.planned_date),
    event.plan_id || '',
    normalizeText(event.material_code || event.material_name),
    normalizeText(event.machine_name),
    event.planned_unit || ''
  ].join('|');
}

function groupMonthEvents(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = monthGroupingKey(event);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...event, source_event_ids: [event.event_id] });
      continue;
    }
    current.planned_qty = Number(current.planned_qty || 0) + Number(event.planned_qty || 0);
    current.source_event_ids.push(event.event_id);
    const currentStart = eventStartMinutes(current);
    const nextStart = eventStartMinutes(event);
    if (nextStart !== null && (currentStart === null || nextStart < currentStart)) current.start_time = event.start_time;
    const currentEnd = eventEndMinutes(current);
    const nextEnd = eventEndMinutes(event);
    if (nextEnd !== null && (currentEnd === null || nextEnd > currentEnd)) current.end_time = event.end_time;
  }
  return [...grouped.values()];
}

function daySummaryGroupingKey(event) {
  return [
    dateKey(event.planned_date),
    event.material_id || normalizeText(event.material_code || event.material_name),
    event.machine_id || normalizeText(event.machine_name),
    event.planned_unit || '',
    event.production_color || Number(event.production_index || 0)
  ].join('|');
}

function groupDaySummaryEvents(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = daySummaryGroupingKey(event);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...event, source_event_ids: [event.event_id] });
      continue;
    }
    current.planned_qty = Number(current.planned_qty || 0) + Number(event.planned_qty || 0);
    current.source_event_ids.push(event.event_id);
    const currentStart = eventStartMinutes(current);
    const nextStart = eventStartMinutes(event);
    if (nextStart !== null && (currentStart === null || nextStart < currentStart)) current.start_time = event.start_time;
    const currentEnd = eventEndMinutes(current);
    const nextEnd = eventEndMinutes(event);
    if (nextEnd !== null && (currentEnd === null || nextEnd > currentEnd)) current.end_time = event.end_time;
    current.people_count = Math.max(Number(current.people_count || 0), Number(event.people_count || 0));
  }
  return [...grouped.values()];
}

function sortableAnalysisHeader(label, index, sortState) {
  const active = sortState.index === index && sortState.direction;
  const indicator = active ? sortState.direction === 'asc' ? '↑' : '↓' : '↕';
  return `
    <button class="sortable-header ${active ? 'active' : ''}" type="button" data-sort-index="${index}" aria-label="Ordenar por ${escapeHtml(label)}">
      <span>${escapeHtml(label)}</span>
      <span class="sort-indicator" aria-hidden="true">${indicator}</span>
    </button>
  `;
}

function pauseGroupingKey(event) {
  return [
    event.plan_id || '',
    normalizeText(event.planning_code),
    normalizeText(event.material_code || event.material_name),
    normalizeText(event.machine_name),
    event.planned_unit || '',
    Number(event.production_index || 0)
  ].join('|');
}

function pauseBandStyle(start, end) {
  const top = TIME_TOP_PAD + (start / 60) * HOUR_HEIGHT;
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 10);
  return `--pause-top:${top}px;--pause-height:${height}px;`;
}

function pauseLabelForEvent(event) {
  return `Pausa T${Number(event.production_index || 0) + 1}`;
}

function pauseBandsForDate(events) {
  const explicitBands = new Map();
  for (const event of events) {
    const start = timeMinutes(event.shift_pause_start_time);
    const end = timeMinutes(event.shift_pause_end_time);
    if (start === null || end === null || end <= start) continue;
    const key = `${event.team_capacity_label || ''}|${start}|${end}`;
    if (!explicitBands.has(key)) {
      explicitBands.set(key, {
        start,
        end,
        label: event.team_capacity_label ? `Pausa ${String(event.team_capacity_label).replace(/^Turno\s*/i, 'T')}` : pauseLabelForEvent(event)
      });
    }
  }
  if (explicitBands.size) {
    return [...explicitBands.values()].sort((left, right) => left.start - right.start || left.end - right.end);
  }
  const grouped = new Map();
  for (const event of events) {
    const start = eventStartMinutes(event);
    const end = eventEndMinutes(event);
    if (start === null || end === null || end <= start) continue;
    const key = pauseGroupingKey(event);
    if (!grouped.has(key)) grouped.set(key, { label: pauseLabelForEvent(event), parts: [] });
    grouped.get(key).parts.push({ start, end });
  }
  const bands = [];
  for (const group of grouped.values()) {
    const parts = group.parts;
    parts.sort((left, right) => left.start - right.start || left.end - right.end);
    for (let index = 1; index < parts.length; index += 1) {
      const previous = parts[index - 1];
      const current = parts[index];
      if (current.start > previous.end) bands.push({ start: previous.end, end: current.start, label: group.label });
    }
  }
  return bands.sort((left, right) => left.start - right.start || left.end - right.end);
}

function eventLaneKey(event) {
  return [
    event.plan_id || '',
    event.production_color || Number(event.production_index || 0),
    normalizeText(event.material_code || event.material_name),
    normalizeText(event.machine_name),
    event.planned_unit || ''
  ].join('|');
}

function splitTimedItemByPauses(item, pauseBands = []) {
  const relevantPauses = pauseBands
    .filter(band => band.end > item.start && band.start < item.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  if (!relevantPauses.length) return [{ ...item, visualStart: item.start, visualEnd: item.end }];
  const pieces = [];
  let cursor = item.start;
  for (const pause of relevantPauses) {
    if (pause.start > cursor) pieces.push({ ...item, visualStart: cursor, visualEnd: Math.min(pause.start, item.end) });
    cursor = Math.max(cursor, pause.end);
  }
  if (cursor < item.end) pieces.push({ ...item, visualStart: cursor, visualEnd: item.end });
  return pieces.filter(piece => piece.visualEnd > piece.visualStart);
}

function yearDayColorStyle(events = []) {
  if (!events.length) return '';
  const colors = [];
  const seen = new Set();
  for (const event of events) {
    const color = eventColor(event);
    const key = `${color.bg}|${color.border}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(color);
  }
  if (!colors.length) return '';
  if (colors.length === 1) {
    return `--year-day-bg:${colors[0].bg};--year-day-bg-image:linear-gradient(${colors[0].bg}, ${colors[0].bg});--year-day-border:${colors[0].border};--year-day-text:${colors[0].text || 'var(--petroleum-dark)'};`;
  }
  const step = 100 / colors.length;
  const stops = colors.map((color, index) => {
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return `${color.bg} ${start}% ${end}%`;
  }).join(', ');
  return `--year-day-bg:linear-gradient(90deg, ${stops});--year-day-bg-image:linear-gradient(90deg, ${stops});--year-day-border:${colors[0].border};--year-day-text:var(--petroleum-dark);`;
}

function eventButton(event, extraClass = '', positioningStyle = '', options = {}) {
  const commercial = options.commercial === true;
  return `
    <button class="analysis-event ${extraClass}" type="button" data-event-id="${escapeHtml(event.event_id)}"
      title="${escapeHtml(eventTooltip(event))}" style="${eventColorStyle(event)}${positioningStyle}">
      <strong>${escapeHtml(event.planning_code || `Plano ${event.plan_id}`)} <em>${escapeHtml(eventPeriod(event))}</em></strong>
      <span>${escapeHtml(event.material_name)} · ${formatQty(event.planned_qty)} ${escapeHtml(event.planned_unit || '')}</span>
      <small>${commercial ? escapeHtml(commercialStatusLabel(event.status)) : `${escapeHtml(event.machine_name || 'Sem máquina')} · ${Number(event.people_count || 0)} pessoa(s)`}</small>
    </button>
  `;
}

function commercialPinButton(pin, extraClass = '') {
  const title = `${pin.material || 'Material'} - ${formatQty(pin.quantidade)}${pin.observacao ? ` - ${pin.observacao}` : ''}`;
  return `
    <button class="commercial-pin ${extraClass}" type="button" data-commercial-pin="${escapeHtml(pin.id)}" title="${escapeHtml(title)}" style="--pin-color:${escapeHtml(pin.cor || '#2F80ED')}">
      <span></span><strong>${escapeHtml(pin.material || 'Material')}</strong><em>${formatQty(pin.quantidade)}</em>
    </button>
  `;
}

function commercialPinSummary(pins = []) {
  if (!pins.length) return '';
  const visible = pins.slice(0, 3).map(pin => commercialPinButton(pin, 'compact')).join('');
  const remaining = pins.length > 3 ? `<button class="commercial-pin-count" type="button" data-day-summary="${escapeHtml(pins[0].date)}">+${pins.length - 3}</button>` : '';
  return `<div class="commercial-pin-list">${visible}${remaining}</div>`;
}

function closeableModal(content, extraClass = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal ${extraClass}" role="dialog" aria-modal="true">${content}</section>`;
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  return { backdrop, close };
}

function openEventDetail(event, onEdit = null) {
  const commercial = event.commercialMode === true;
  const editable = !commercial && typeof onEdit === 'function' && dateKey(event.planned_date) >= dateKey(new Date());
  const { backdrop, close } = closeableModal(`
    <div class="modal-header">
      <div><h2>${escapeHtml(event.planning_code || `Plano ${event.plan_id}`)}</h2><p class="modal-subtitle">Produção programada</p></div>
      <button class="ghost-button" type="button" data-close>Fechar</button>
    </div>
    <div class="analysis-event-detail">
      <span>Material<strong>${escapeHtml(event.material_name)}</strong></span>
      <span>Data<strong>${formatDate(event.planned_date)}</strong></span>
      <span>Quantidade<strong>${formatQty(event.planned_qty)} ${escapeHtml(event.planned_unit || '')}</strong></span>
      ${commercial ? '' : `<span>Máquina<strong>${escapeHtml(event.machine_name || 'Não informada')}</strong></span>
      <span>Pessoas<strong>${Number(event.people_count || 0)}</strong></span>`}
      <span>Status<strong>${escapeHtml(commercial ? commercialStatusLabel(event.status) : event.status || 'Não informado')}</strong></span>
      <span>Horário/período<strong>${escapeHtml(eventPeriod(event))}</strong></span>
    </div>
    <div class="modal-actions">
      ${editable ? '<button class="primary-button" type="button" data-edit-planning>Editar cronograma</button>' : ''}
      <button class="secondary-button" type="button" data-close>Fechar</button>
    </div>
  `, 'analysis-event-modal');
  backdrop.querySelector('[data-edit-planning]')?.addEventListener('click', () => {
    close();
    onEdit(event);
  });
}

function timedLayout(events, startHour, pauseBands = []) {
  const sorted = events
    .map((event, index) => ({
      event,
      index,
      laneKey: eventLaneKey(event),
      start: eventStartMinutes(event),
      end: Math.max(eventEndMinutes(event) ?? eventStartMinutes(event) + 60, eventStartMinutes(event) + 20)
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const active = [];
  const lanesByKey = new Map();
  let laneCount = 0;
  for (const item of sorted) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= item.start) active.splice(index, 1);
    }
    if (lanesByKey.has(item.laneKey) && !active.some(activeItem => activeItem.lane === lanesByKey.get(item.laneKey))) {
      item.lane = lanesByKey.get(item.laneKey);
    } else {
      const usedLanes = new Set(active.map(activeItem => activeItem.lane));
      item.lane = 0;
      while (usedLanes.has(item.lane)) item.lane += 1;
      if (!lanesByKey.has(item.laneKey)) lanesByKey.set(item.laneKey, item.lane);
    }
    laneCount = Math.max(laneCount, item.lane + 1);
    active.push(item);
  }
  const width = 100 / Math.max(laneCount, 1);
  return sorted.flatMap(item => splitTimedItemByPauses(item, pauseBands).map(piece => {
    const top = TIME_TOP_PAD + ((piece.visualStart - startHour * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max(((piece.visualEnd - piece.visualStart) / 60) * HOUR_HEIGHT, 26);
    const visualEvent = {
      ...piece.event,
      start_time: minutesToTime(piece.visualStart),
      end_time: minutesToTime(piece.visualEnd)
    };
    return {
      event: visualEvent,
      originalEvent: piece.event,
      style: `--event-top:${top}px;--event-height:${height}px;--event-left:calc(${piece.lane * width}% + 4px);--event-width:calc(${width}% - 8px);`
    };
  }));
}

export function AnalysisPage(options = {}) {
  const mode = options.mode || 'analysis';
  const commercialMode = mode === 'commercial';
  const canEditPlanning = !commercialMode && canAccess(getCurrentUser(), 'planning:write');
  const availableViews = ['day', 'week', 'month', 'year'];
  const page = document.createElement('section');
  page.className = `stack analysis-page${commercialMode ? ' commercial-calendar-page' : ''}`;
  page.innerHTML = `
    <div class="page-header"><div><h1>Análise</h1><p>Consulta diária, mensal e anual da produção programada.</p></div></div>
    ${commercialMode ? '' : '<div class="analysis-tabs"></div>'}
    <div class="panel analysis-panel">
      <div class="analysis-calendar-toolbar">
        <div class="analysis-navigation">
          <button class="secondary-button" type="button" data-nav="today">Hoje</button>
          <button class="secondary-button" type="button" data-nav="previous" aria-label="Anterior">‹</button>
          <button class="secondary-button" type="button" data-nav="next" aria-label="Próximo">›</button>
          <strong class="analysis-calendar-title"></strong>
        </div>
        <div class="analysis-calendar-actions">
          <div class="calendar-view-toggle">
            ${['day', 'week', 'month', 'year'].map(item => `<button class="secondary-button" type="button" data-view="${item}">${({ day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano' })[item]}</button>`).join('')}
          </div>
          ${commercialMode ? '' : '<button class="secondary-button analysis-fullscreen-button" type="button" data-fullscreen>Tela cheia</button>'}
        </div>
      </div>
      <div class="analysis-calendar-target"></div>
    </div>
  `;

  if (commercialMode) {
    page.querySelector('h1').textContent = 'Comercial';
    page.querySelector('.page-header p').textContent = 'Consulta de produção final programada para vendas.';
    page.querySelector('.analysis-tabs')?.remove();
    page.querySelectorAll('[data-view]').forEach(button => {
      if (!availableViews.includes(button.dataset.view)) button.remove();
    });
  }
  const assistantPanel = document.createElement('div');
  assistantPanel.className = 'panel analysis-assistant-panel';
  assistantPanel.innerHTML = '<div class="analysis-assistant-target"></div>';
  if (!commercialMode) page.appendChild(assistantPanel);
  let activeInternalTab = commercialMode ? 'calendar' : 'assistant';
  page.querySelector('.analysis-tabs')?.appendChild(InternalTabs([
    { id: 'assistant', label: 'Assistente PCP' },
    { id: 'calendar', label: 'Calendário' }
  ], activeInternalTab, tab => {
    activeInternalTab = tab;
    renderInternalTab();
  }));
  const panel = page.querySelector('.analysis-panel');
  const target = page.querySelector('.analysis-calendar-target');
  const assistantTarget = page.querySelector('.analysis-assistant-target');
  const title = page.querySelector('.analysis-calendar-title');
  const fullscreenButton = page.querySelector('[data-fullscreen]');
  let cursor = dateKey(new Date());
  let view = sessionStorage.getItem(commercialMode ? 'planejamento_commercial_calendar_view' : 'planejamento_analysis_view') || 'month';
  if (!availableViews.includes(view)) view = 'month';
  const viewStorageKey = commercialMode ? 'planejamento_commercial_calendar_view' : 'planejamento_analysis_view';
  let currentEvents = [];
  let currentCapacityDays = [];
  let currentHolidays = [];
  let currentStockAlerts = new Map();
  let currentPcpRows = [];
  let currentCommercialMaterials = [];
  let currentCommercialPins = readCommercialPins();
  let stockAlertLoadId = 0;
  let latestStockImportKey = 'unknown';
  const stockAlertsCache = new Map();

  function holidayFor(date) {
    return currentHolidays.find(holiday => holiday.date === date) || null;
  }

  function capacityItemsForDate(date) {
    const capacities = new Map();
    const include = item => {
      const label = normalizedCapacityLabel(item.team_capacity_label || item.teamCapacityLabel);
      if (!label || item.team_capacity_available == null) return;
      const current = capacities.get(label) || {
        label,
        used: 0,
        available: 0,
        overridden: false,
        planIds: new Set(),
        points: []
      };
      current.available = Math.max(current.available, Number(item.team_capacity_available || 0));
      current.overridden = Boolean(current.overridden || item.team_capacity_overridden);
      if (item.plan_id) current.planIds.add(item.plan_id);
      capacities.set(label, current);
    };
    currentCapacityDays.filter(item => dateKey(item.date) === date).forEach(include);
    currentEvents.filter(item => dateKey(item.planned_date) === date).forEach(item => {
      const eventLabel = capacityLabelForEvent(item);
      include({ ...item, team_capacity_label: eventLabel });
      const capacity = capacities.get(eventLabel);
      if (!capacity || isTransportEvent(item)) return;
      const people = Number(item.people_count || 0);
      if (!(people > 0)) return;
      const start = eventStartMinutes(item) ?? 0;
      const end = Math.max(eventEndMinutes(item) ?? start + 24 * 60, start + 1);
      capacity.points.push({ minute: start, delta: people });
      capacity.points.push({ minute: end, delta: -people });
    });
    return [...capacities.values()].map(item => {
      const points = item.points.sort((left, right) => left.minute - right.minute || left.delta - right.delta);
      let current = 0;
      let used = 0;
      points.forEach(point => {
        current += point.delta;
        used = Math.max(used, current);
      });
      return {
        ...item,
        used,
        exceeded: item.available > 0 && used > item.available,
        planIds: [...item.planIds],
        points: undefined
      };
    });
  }

  function hasProductionEventsForDate(date) {
    return currentEvents.some(item => dateKey(item.planned_date) === date);
  }

  function renderCapacityPillsForDate(date, extraClass = '') {
    if (commercialMode || !hasProductionEventsForDate(date)) return '';
    const capacityPills = dayCapacityPills(capacityItemsForDate(date), date);
    return capacityPills ? `<div class="analysis-team-capacity-list${extraClass ? ` ${extraClass}` : ''}">${capacityPills}</div>` : '';
  }

  function stockAlertForDate(date) {
    if (commercialMode) return null;
    return currentStockAlerts.get(date) || null;
  }

  function stockAlertTitle(alert) {
    if (!alert) return '';
    const count = Number(alert.criticalCount ?? alert.count ?? 0);
    return `${count} materiais abaixo do estoque mínimo`;
  }

  function stockAlertIcon(date, extraClass = '') {
    const alert = stockAlertForDate(date);
    if (!alert) return '';
    const titleText = stockAlertTitle(alert);
    return `<span class="analysis-stock-alert${extraClass ? ` ${extraClass}` : ''}" title="${escapeHtml(titleText)}" aria-label="${escapeHtml(titleText)}">!</span>`;
  }

  function commercialPinsForDate(date) {
    return currentCommercialPins.filter(pin => pin.date === date);
  }

  function stockAlertsCacheKey(range, minimumDays, importKey = latestStockImportKey) {
    return [range.start, range.end, minimumDays || 0, importKey || 'unknown'].join('|');
  }

  function stockAlertsMap(alerts = {}) {
    return new Map(Object.entries(alerts).map(([date, alert]) => [date, {
      ...alert,
      criticalCount: Number(alert.criticalCount ?? alert.count ?? 0)
    }]));
  }

  function stockImportCacheKey(latestImport) {
    if (!latestImport) return 'none';
    return String(latestImport.id || latestImport.created_at || 'none');
  }

  async function loadStockAlerts(range) {
    const minimumDays = readStockMinimumDays();
    if (commercialMode || !minimumDays) return new Map();
    const cacheKey = stockAlertsCacheKey(range, minimumDays);
    if (stockAlertsCache.has(cacheKey)) return stockAlertsCache.get(cacheKey);
    const result = await api(`/planning/analysis/stock-alerts?start=${range.start}&end=${range.end}&minimumDays=${encodeURIComponent(minimumDays)}`);
    const alerts = stockAlertsMap(result.alerts || {});
    const responseImportKey = stockImportCacheKey(result.latestImport);
    latestStockImportKey = responseImportKey;
    stockAlertsCache.set(cacheKey, alerts);
    stockAlertsCache.set(stockAlertsCacheKey(range, minimumDays, responseImportKey), alerts);
    return alerts;
  }

  function currentCommercialUser() {
    const user = getCurrentUser() || {};
    return {
      id: commercialUserKey(user),
      name: commercialUserName(user),
      email: user.email || user.emailAddress || '',
      color: commercialUserColor(user)
    };
  }

  function saveCommercialPins(nextPins) {
    currentCommercialPins = nextPins;
    writeCommercialPins(nextPins);
    renderCalendar();
  }

  function materialOptionsHtml(selectedId = '') {
    return currentCommercialMaterials.map(row => `
      <option value="${escapeHtml(row.material_id)}" ${String(row.material_id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(row.material_name)}</option>
    `).join('');
  }

  function openCommercialRequestModal(date, pin = null) {
    const user = currentCommercialUser();
    const ownPin = !pin || String(pin.usuario_id) === String(user.id);
    if (pin && !ownPin) {
      openCommercialPinDetail(pin);
      return;
    }
    const selectedMaterialId = pin?.material_id || currentCommercialMaterials[0]?.material_id || '';
    const { backdrop, close } = closeableModal(`
      <div class="modal-header">
        <div><h2>${pin ? 'Solicitação comercial' : 'Solicitar material'}</h2><p class="modal-subtitle">${formatDate(date)}</p></div>
        <button class="ghost-button" type="button" data-close>Fechar</button>
      </div>
      <form class="commercial-request-form">
        <div class="grid-form">
          <label>Material
            <select name="materialId" required>${materialOptionsHtml(selectedMaterialId)}</select>
          </label>
          <label>Quantidade
            <input name="quantity" type="number" min="0.001" step="0.001" value="${escapeHtml(pin?.quantidade || '')}" required />
          </label>
          <label class="wide-field">Observação
            <textarea name="observation" rows="5">${escapeHtml(pin?.observacao || '')}</textarea>
          </label>
        </div>
        <div class="modal-actions">
          ${pin ? '<button class="danger-button" type="button" data-delete-pin>Excluir</button>' : ''}
          <button class="secondary-button" type="button" data-close>Cancelar</button>
          <button class="primary-button" type="submit">Salvar</button>
        </div>
      </form>
    `, 'commercial-request-modal');
    backdrop.querySelector('.commercial-request-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const material = currentCommercialMaterials.find(row => String(row.material_id) === String(form.elements.materialId.value));
      const quantity = Number(form.elements.quantity.value);
      if (!material || !(quantity > 0)) return;
      const nextPin = {
        id: pin?.id || createCommercialPinId(),
        data: date,
        date,
        material: material.material_name,
        material_id: material.material_id,
        quantidade: quantity,
        observacao: form.elements.observation.value.trim(),
        usuario_id: user.id,
        usuario_nome: user.name,
        usuario_email: user.email,
        cor: pin?.cor || user.color
      };
      const others = currentCommercialPins.filter(item => item.id !== nextPin.id);
      saveCommercialPins([...others, nextPin].sort((left, right) => left.date.localeCompare(right.date) || left.material.localeCompare(right.material)));
      close();
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Solicitação comercial salva.' }));
    });
    backdrop.querySelector('[data-delete-pin]')?.addEventListener('click', () => {
      saveCommercialPins(currentCommercialPins.filter(item => item.id !== pin.id));
      close();
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Solicitação comercial excluída.' }));
    });
  }

  function openCommercialPinDetail(pin) {
    const user = currentCommercialUser();
    const ownPin = String(pin.usuario_id) === String(user.id);
    const { backdrop, close } = closeableModal(`
      <div class="modal-header">
        <div><h2>Solicitação comercial</h2><p class="modal-subtitle">${formatDate(pin.date)}</p></div>
        <button class="ghost-button" type="button" data-close>Fechar</button>
      </div>
      <div class="analysis-event-detail">
        <span>Material<strong>${escapeHtml(pin.material)}</strong></span>
        <span>Quantidade<strong>${formatQty(pin.quantidade)}</strong></span>
        <span>Usuário<strong>${escapeHtml(pin.usuario_nome || pin.usuario_email || 'Não informado')}</strong></span>
        <span>Observação<strong>${escapeHtml(pin.observacao || 'Sem observação')}</strong></span>
      </div>
      <div class="modal-actions">
        ${ownPin ? '<button class="primary-button" type="button" data-edit-pin>Editar</button><button class="danger-button" type="button" data-delete-pin>Excluir</button>' : ''}
        <button class="secondary-button" type="button" data-close>Fechar</button>
      </div>
    `, 'analysis-event-modal');
    backdrop.querySelector('[data-edit-pin]')?.addEventListener('click', () => {
      close();
      openCommercialRequestModal(pin.date, pin);
    });
    backdrop.querySelector('[data-delete-pin]')?.addEventListener('click', () => {
      saveCommercialPins(currentCommercialPins.filter(item => item.id !== pin.id));
      close();
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Solicitação comercial excluída.' }));
    });
  }

  function renderInternalTab() {
    panel.hidden = activeInternalTab !== 'calendar';
    if (assistantPanel) assistantPanel.hidden = activeInternalTab !== 'assistant';
    if (activeInternalTab === 'assistant') loadPcpAssistant().catch(error => {
      if (assistantTarget) setInternalError(assistantTarget, error.message || 'Não foi possível carregar o Assistente PCP.');
    });
  }

  function renderPcpAssistant(allRows, minimumDays) {
    const rows = sortPcpRows(allRows.filter(row => row.status.key !== 'outOfRadar'));
    const recommendationRows = rows.filter(row => Number(row.targetQty) > 0).slice(0, 5);
    const counts = allRows.reduce((total, row) => {
      total[row.status.key] = (total[row.status.key] || 0) + 1;
      return total;
    }, {});
    const idealDays = readPcpIdealDays(minimumDays);
    const productionCalendar = pcpProductionCalendar();
    assistantTarget.innerHTML = `
      <div class="pcp-assistant">
        <div class="pcp-summary-grid">
          <article class="pcp-summary-card critical"><span>Críticos</span><strong>${counts.critical || 0}</strong></article>
          <article class="pcp-summary-card attention"><span>Atenção</span><strong>${counts.attention || 0}</strong></article>
          <article class="pcp-summary-card production-alert"><span>Alerta de produção</span><strong>${counts.productionAlert || 0}</strong></article>
          <article class="pcp-summary-card target">
            <label for="pcp-ideal-days">Meta ideal (dias)</label>
            <input id="pcp-ideal-days" class="pcp-ideal-days-input" type="number" min="1" step="1" value="${escapeHtml(idealDays)}" data-pcp-ideal-days />
          </article>
        </div>
        <section class="pcp-rules-strip">
          <span>Estoque mínimo: <strong>${formatNumber(minimumDays, 0, 0)} dias úteis</strong></span>
          <span>Faixa de alerta: <strong>${formatNumber(minimumDays * 0.5, 0, 0)} a ${formatNumber(minimumDays * 1.2, 0, 0)} dias</strong></span>
          <span>Meta ideal: <strong>${formatNumber(idealDays, 0, 0)} dias úteis</strong></span>
        </section>
        <section class="pcp-recommendation">
          <div class="pcp-recommendation-header">
            <h3>Ordem recomendada</h3>
            <p>Sequência sugerida pela prioridade manual, status, duração e venda/dia.</p>
          </div>
          <div class="pcp-recommendation-cards">
            ${recommendationRows.map((row, index) => {
              const canEstimate = canEstimatePcpProduction(row);
              const stockEndLabel = estimatedStockEndLabel(row);
              const productionEndLabel = estimatedProductionEndLabel(row, productionCalendar);
              return `
                <article class="pcp-recommendation-card pcp-row-${escapeHtml(row.status.className)}" data-pcp-recommendation="${escapeHtml(row.key)}">
                  <div class="pcp-recommendation-card-top">
                    <span class="pcp-position">#${index + 1}</span>
                    ${PcpStatusPill(row.status)}
                  </div>
                  <strong>${escapeHtml(row.material?.name || '')}</strong>
                  <dl>
                    <div><dt>Duração atual</dt><dd>${formatStockDurationForDisplay(row.durationDays)}</dd></div>
                    <div><dt>Duração ajust.</dt><dd>${Number.isFinite(row.adjustedDurationDays) ? `${formatNumber(row.adjustedDurationDays)} dias` : 'Não estimado'}</dd></div>
                    <div><dt>Máquina</dt><dd>${canEstimate ? escapeHtml(row.productivity.machine_name) : 'Não estimada'}</dd></div>
                    <div><dt>Falta</dt><dd>${row.targetQty === null ? 'Não estimado' : `${formatCeilQty(row.targetQty)} ${escapeHtml(row.productivity?.output_unit || row.plannedUnit || '')}`.trim()}</dd></div>
                    <div><dt>Tempo</dt><dd>${canEstimate ? formatDurationFromSeconds(row.estimatedSeconds, productionCalendar) : 'Não estimado'}</dd></div>
                    <div><dt>Fim est.</dt><dd>${escapeHtml(stockEndLabel)}</dd></div>
                    <div><dt>Fim prod.</dt><dd>${escapeHtml(productionEndLabel)}</dd></div>
                  </dl>
                </article>
              `;
            }).join('') || '<div class="empty-state">Nenhum material no radar.</div>'}
          </div>
          <div class="pcp-recommendation-actions">
            <button class="secondary-button pcp-follow-suggestion" type="button">Seguir sugestão</button>
            <button class="primary-button pcp-plan-sequence" type="button">Planejar sequência</button>
          </div>
        </section>
        <div class="analysis-stock-table-wrap pcp-table-wrap">
          <table class="analysis-stock-table pcp-priority-table">
            <thead>
              <tr>
                <th>Produzir</th>
                <th>Prioridade manual</th>
                <th>Material</th>
                <th>Duração atual</th>
                <th>Status</th>
                <th>Venda/dia</th>
                <th>Estoque atual</th>
                <th>Fim estoque</th>
                <th>Meta ideal</th>
                <th>J&aacute; planejado</th>
                <th>Falta planejar</th>
                <th>Tempo estimado</th>
                <th>Fim prod.</th>
                <th>Máquina sugerida</th>
                <th>Pessoas</th>
              </tr>
            </thead>
            <tbody>${rows.length ? rows.map(row => {
              const canEstimate = canEstimatePcpProduction(row);
              const stockEndLabel = estimatedStockEndLabel(row);
              const productionEndLabel = estimatedProductionEndLabel(row, productionCalendar);
              return `
                <tr class="pcp-row-${escapeHtml(row.status.className)}">
                  <td><input class="pcp-produce-checkbox" type="checkbox" data-pcp-produce="${escapeHtml(row.key)}" aria-label="Produzir ${escapeHtml(row.material?.name || '')}" /></td>
                  <td><input class="pcp-priority-input" type="number" min="1" step="1" value="${escapeHtml(row.manualPriority)}" data-pcp-priority="${escapeHtml(row.key)}" aria-label="Prioridade manual de ${escapeHtml(row.material?.name || '')}" /></td>
                  <td><strong>${escapeHtml(row.material?.name || '')}</strong><small>${escapeHtml((row.codes || []).join(', '))}</small></td>
                  <td><strong>${formatStockDurationForDisplay(row.durationDays)}</strong>${Number.isFinite(row.adjustedDurationDays) && Number(row.plannedRemainingQty) > 0 ? `<small>Ajust.: ${formatNumber(row.adjustedDurationDays)} dias</small>` : ''}</td>
                  <td>${PcpStatusPill(row.status)}</td>
                  <td>${Number.isFinite(Number(row.salesPerDayQty)) && Number(row.salesPerDayQty) > 0 ? formatQty(row.salesPerDayQty) : 'Não estimado'}</td>
                  <td>${formatQty(row.totalLocationsQty)}</td>
                  <td class="pcp-date-cell">${escapeHtml(stockEndLabel)}</td>
                  <td>
                    <label class="pcp-row-ideal-control">
                      <input class="pcp-row-ideal-input" type="number" min="1" step="1" value="${escapeHtml(row.idealDays)}" data-pcp-row-ideal="${escapeHtml(row.key)}" aria-label="Meta ideal de ${escapeHtml(row.material?.name || '')}" />
                      <span>dias</span>
                    </label>
                  </td>
                  <td><strong>${formatQty(row.plannedRemainingQty)} ${escapeHtml(row.plannedUnit || row.productivity?.output_unit || '')}</strong></td>
                  <td><strong>${row.targetQty === null ? 'Não estimado' : `${formatCeilQty(row.targetQty)} ${escapeHtml(row.productivity?.output_unit || row.plannedUnit || '')}`.trim()}</strong></td>
                  <td>${canEstimate ? formatDurationFromSeconds(row.estimatedSeconds, productionCalendar) : 'Não estimado'}</td>
                  <td class="pcp-date-cell">${escapeHtml(productionEndLabel)}</td>
                  <td>${canEstimate ? escapeHtml(row.productivity.machine_name) : 'Não estimada'}</td>
                  <td>${canEstimate ? Number(row.productivity.people_count) : '-'}</td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="15"><span class="muted-text">Nenhum material dentro da faixa de ação do PCP.</span></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function loadPcpAssistant() {
    if (!assistantTarget) return;
    setInternalLoading(assistantTarget, 'Carregando Assistente PCP...');
    const minimumDays = readStockMinimumDays();
    if (!minimumDays) {
      assistantTarget.innerHTML = '<div class="empty-state">Configure o estoque mínimo em dias na tela Estoque para visualizar o Assistente PCP.</div>';
      return;
    }
    const [overview, matrixRows, plannedBalance] = await Promise.all([
      api('/stock/materials-overview'),
      api('/productivity'),
      api('/planning/analysis/planned-balance')
    ]);
    const priorities = readPcpPriorities();
    const idealDays = readPcpIdealDays(minimumDays);
    const idealOverrides = readPcpIdealOverrides();
    currentPcpRows = buildPcpRows(overview.rows || [], minimumDays, matrixRows || [], priorities, idealDays, idealOverrides, plannedBalanceMap(plannedBalance.rows || []));
    renderPcpAssistant(currentPcpRows, minimumDays);
  }

  function selectedPcpRowsFromTable() {
    const byKey = new Map(currentPcpRows.map(row => [row.key, row]));
    return [...assistantTarget.querySelectorAll('[data-pcp-produce]:checked')]
      .map(input => byKey.get(input.dataset.pcpProduce))
      .filter(Boolean);
  }

  function restorePcpSelection(selectedKeys) {
    const keys = new Set(selectedKeys || []);
    assistantTarget.querySelectorAll('[data-pcp-produce]').forEach(input => {
      input.checked = keys.has(input.dataset.pcpProduce);
    });
  }

  function applyPcpGlobalIdealDaysInput(input) {
    const value = Number(String(input.value || '').trim());
    if (!Number.isInteger(value) || value <= 0) return;
    const selectedKeys = selectedPcpRowsFromTable().map(row => row.key);
    writePcpIdealDays(value);
    writePcpIdealOverrides({});
    currentPcpRows = recalculatePcpRowsForIdealDays(currentPcpRows, value, {});
    const minimumDays = readStockMinimumDays();
    if (minimumDays) {
      renderPcpAssistant(currentPcpRows, minimumDays);
      restorePcpSelection(selectedKeys);
    }
  }

  function applyPcpRowIdealDaysInput(input) {
    const selectedKeys = selectedPcpRowsFromTable().map(row => row.key);
    const globalIdealDays = readPcpIdealDays(readStockMinimumDays());
    const overrides = readPcpIdealOverrides();
    const value = String(input.value || '').trim();
    if (value === '') {
      delete overrides[input.dataset.pcpRowIdeal];
    } else if (/^\d+$/.test(value) && Number(value) > 0) {
      overrides[input.dataset.pcpRowIdeal] = Number(value);
    } else {
      return;
    }
    writePcpIdealOverrides(overrides);
    currentPcpRows = recalculatePcpRowsForIdealDays(currentPcpRows, globalIdealDays, overrides);
    const minimumDays = readStockMinimumDays();
    if (minimumDays) {
      renderPcpAssistant(currentPcpRows, minimumDays);
      restorePcpSelection(selectedKeys);
    }
  }

  async function openPlanningTimeline(eventRow) {
    if (!canEditPlanning || !eventRow?.plan_id) return;
    const { backdrop } = closeableModal(`
      <div class="modal-header">
        <div><h2>${escapeHtml(eventRow.planning_code || `Plano ${eventRow.plan_id}`)}</h2><p class="modal-subtitle">Cronograma do planejamento</p></div>
        <button class="ghost-button" type="button" data-close>Fechar</button>
      </div>
      <div class="analysis-planning-timeline"></div>
    `, 'wide-modal analysis-planning-modal');
    const timelineTarget = backdrop.querySelector('.analysis-planning-timeline');

    async function loadTimeline() {
      setInternalLoading(timelineTarget, 'Carregando cronograma...');
      const detail = await api(`/planning/plans/${eventRow.plan_id}`);
      const summary = {
        mode: 'analysis',
        ...(detail.summary || {}),
        planningStartDate: detail.summary?.planningStartDate || detail.plan?.start_date,
        planningEndDate: detail.summary?.planningEndDate || detail.plan?.end_date,
        readOnly: false,
        disablePastEditing: true,
        minEditableDate: dateKey(new Date())
      };
      timelineTarget.innerHTML = '';
      timelineTarget.appendChild(CalendarTimeline(detail.days || [], detail.operations || [], summary));
    }

    async function applyChange(body) {
      await api(`/planning/plans/${eventRow.plan_id}/reschedule`, { method: 'POST', body });
      await loadTimeline();
      await load();
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Cronograma atualizado.' }));
    }

    timelineTarget.addEventListener('operation-date-change', event => {
      applyChange(event.detail).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
    });
    timelineTarget.addEventListener('operation-config-change', event => {
      const changes = Array.isArray(event.detail?.changes) ? event.detail.changes : [event.detail];
      changes.reduce((promise, change) => promise.then(() => applyChange(change)), Promise.resolve())
        .catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
    });
    timelineTarget.addEventListener('calendar-team-capacity-change', event => {
      applyChange({
        capacityDate: event.detail?.date,
        capacityOverrides: event.detail?.overrides,
        recalculateFromDate: event.detail?.date
      }).catch(error => window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message })));
    });

    loadTimeline().catch(error => setInternalError(timelineTarget, error.message || 'Não foi possível carregar o cronograma.'));
  }

  function openAnalysisCapacityModal(date, selectedLabel = '') {
    if (!canEditPlanning) return;
    if (date < localDateKey(new Date())) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Dias anteriores a hoje são somente leitura.' }));
      return;
    }
    const sorted = capacityItemsForDate(date);
    if (!sorted.length) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Nenhum turno disponível para editar neste dia.' }));
      return;
    }
    const { backdrop, close } = closeableModal(`
      <div class="modal-header">
        <div><h2>Equipe disponível</h2><p class="modal-subtitle">${formatDate(date)}</p></div>
        <button class="ghost-button" type="button" data-close>Fechar</button>
      </div>
      <form class="analysis-capacity-form">
        <div class="grid-form">
          ${sorted.map(item => `
            <label>${escapeHtml(item.label)}
              <input name="${escapeHtml(item.label)}" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(item.available)}" ${item.label === selectedLabel ? 'autofocus' : ''} required />
            </label>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="secondary-button" type="button" data-close>Cancelar</button>
          <button class="primary-button" type="submit">Salvar</button>
        </div>
      </form>
    `, 'analysis-capacity-modal');
    backdrop.querySelector('form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const overrides = {};
      for (const item of sorted) {
        const input = event.currentTarget.elements.namedItem(item.label);
        const amount = Number(String(input?.value || '').replace(',', '.'));
        if (!Number.isInteger(amount) || amount <= 0) {
          window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Informe a equipe disponível do turno.' }));
          return;
        }
        overrides[item.label] = Math.floor(amount);
      }
      const planIds = [...new Set(sorted.flatMap(item => item.planIds || []).filter(Boolean))];
      if (!planIds.length) {
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Nenhum planejamento disponÒ­vel para atualizar neste dia.' }));
        return;
      }
      const submitButton = event.currentTarget.querySelector('[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Recalculando...';
      }
      try {
        setInternalLoading(target, 'Recalculando...');
        await Promise.all(planIds.map(planId => api(`/planning/plans/${planId}/reschedule`, {
          method: 'POST',
          body: {
            capacityDate: date,
            capacityOverrides: overrides,
            recalculateFromDate: date
          }
        })));
        close();
        await load();
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Equipe disponível atualizada.' }));
      } catch (error) {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Salvar';
        }
        renderCalendar();
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || 'Não foi possível atualizar a equipe.' }));
      }
    });
  }

  async function openDaySummary(date) {
    const events = currentEvents.filter(event => dateKey(event.planned_date) === date);
    const summaryEvents = groupDaySummaryEvents(events);
    const holiday = holidayFor(date);
    const { backdrop, close } = closeableModal(`
      <div class="modal-header">
        <div>
          <h2>${formatDate(date)}</h2>
          <p class="modal-subtitle">${events.length} evento(s)${holiday ? ` · ${escapeHtml(holiday.name)}` : ''}</p>
        </div>
        <button class="ghost-button" type="button" data-close>Fechar</button>
      </div>
      ${holiday ? `<div class="analysis-day-holiday"><strong>Feriado</strong><span>${escapeHtml(holiday.name)}</span></div>` : ''}
      ${renderCapacityPillsForDate(date, 'analysis-day-modal-capacity')}
      <section class="analysis-day-summary-section">
        <h3>${commercialMode ? 'Produções finais programadas' : 'Produções programadas'}</h3>
        <div class="analysis-summary-events">
          ${summaryEvents.length ? summaryEvents.map(event => `
            <button type="button" data-summary-event="${escapeHtml(event.source_event_ids?.[0] || event.event_id)}" style="${eventColorStyle(event)}">
              <strong>${escapeHtml(event.material_name)}</strong>
              <span>${formatQty(event.planned_qty)} ${escapeHtml(event.planned_unit || '')}</span>
              <small>${commercialMode ? escapeHtml(commercialStatusLabel(event.status)) : `${escapeHtml(event.machine_name || 'Sem máquina')} · ${Number(event.people_count || 0)} pessoa(s)`}</small>
            </button>`).join('') : '<p class="muted-text">Nenhuma produção programada para esta data.</p>'}
        </div>
      </section>
      ${commercialMode ? `
      <section class="analysis-day-summary-section">
        <div class="commercial-section-heading">
          <h3>Solicitações comerciais</h3>
          <button class="primary-button" type="button" data-commercial-request="${escapeHtml(date)}">Solicitar material</button>
        </div>
        <div class="commercial-day-pins">
          ${commercialPinsForDate(date).length ? commercialPinsForDate(date).map(pin => commercialPinButton(pin)).join('') : '<p class="muted-text">Nenhuma solicitação comercial para esta data.</p>'}
        </div>
      </section>` : ''}
      <section class="analysis-day-summary-section">
        <h3>Estoque estimado</h3>
        <div class="analysis-stock-projection" aria-live="polite"><p class="muted-text">Calculando projeção...</p></div>
      </section>
      <div class="modal-actions">
        <button class="secondary-button" type="button" data-close>Fechar</button>
      </div>
    `, 'analysis-day-modal');

    backdrop.querySelectorAll('[data-summary-event]').forEach(button => button.addEventListener('click', () => {
      const selected = currentEvents.find(event => String(event.event_id) === button.dataset.summaryEvent);
      if (selected) openEventDetail({ ...selected, commercialMode }, canEditPlanning ? openPlanningTimeline : null);
    }));
    backdrop.addEventListener('click', event => {
      const requestButton = event.target.closest('[data-commercial-request]');
      if (requestButton) {
        openCommercialRequestModal(requestButton.dataset.commercialRequest);
        return;
      }
      const pinButton = event.target.closest('[data-commercial-pin]');
      if (pinButton) {
        const pin = currentCommercialPins.find(item => item.id === pinButton.dataset.commercialPin);
        if (pin) openCommercialPinDetail(pin);
        return;
      }
      const capacityButton = event.target.closest('[data-analysis-capacity-date]');
      if (!capacityButton) return;
      event.preventDefault();
      event.stopPropagation();
      openAnalysisCapacityModal(capacityButton.dataset.analysisCapacityDate, capacityButton.dataset.analysisCapacityLabel || '');
    });

    const projectionTarget = backdrop.querySelector('.analysis-stock-projection');
    const stockColumns = [
      { label: 'Material', sortValue: row => row.material_name || '' },
      { label: 'Estoque estimado', sortValue: row => row.estimated_stock ?? Number.POSITIVE_INFINITY },
      { label: 'Vendas/dia estimado', sortValue: row => stockProjectionSalesPerDay(row) ?? Number.POSITIVE_INFINITY },
      { label: 'Duração estoque estimado', sortValue: row => stockProjectionDurationDays(row) ?? Number.POSITIVE_INFINITY }
    ];
    let stockSortState = { index: null, direction: null };
    function renderStockProjection(rows) {
      projectionTarget.innerHTML = rows?.length ? `
        <div class="analysis-stock-table-wrap">
          <table class="analysis-stock-table">
            <thead><tr>${stockColumns.map((column, index) => `<th>${sortableAnalysisHeader(column.label, index, stockSortState)}</th>`).join('')}</tr></thead>
            <tbody>${sortTableRows(rows, stockColumns, stockSortState).map(row => `
              <tr>
                <td><strong>${escapeHtml(row.material_name)}</strong><small>${escapeHtml((row.material_codes || []).join(', '))}</small></td>
                <td><strong>${row.current_stock === null ? 'Sem estoque atual' : row.estimated_stock === null ? 'Não estimado' : formatQty(row.estimated_stock)}</strong></td>
                <td>${stockProjectionSalesPerDay(row) ? formatQty(stockProjectionSalesPerDay(row)) : 'Não estimado'}</td>
                <td><strong>${Number.isFinite(stockProjectionDurationDays(row)) ? `${formatNumber(stockProjectionDurationDays(row), 1, 1)} dias` : 'Não estimado'}</strong></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>` : '<p class="muted-text">Nenhum material relevante para projetar nesta data.</p>';
    }
    try {
      const result = await api(`/planning/analysis/stock-projection?date=${date}`);
      if (!backdrop.isConnected) return;
      renderStockProjection(result.rows || []);
      projectionTarget.addEventListener('click', event => {
        const button = event.target.closest('.sortable-header');
        if (!button) return;
        const index = Number(button.dataset.sortIndex);
        const currentDirection = stockSortState.index === index ? stockSortState.direction : null;
        stockSortState = { index, direction: nextSortDirection(currentDirection) };
        if (!stockSortState.direction) stockSortState.index = null;
        renderStockProjection(result.rows || []);
      });
    } catch (error) {
      if (backdrop.isConnected) projectionTarget.innerHTML = `<p class="inline-error">${escapeHtml(error.message || 'Não foi possível calcular o estoque estimado.')}</p>`;
    }
  }

  function renderMonth() {
    const range = monthRange(cursor);
    const grouped = eventsByDate(groupMonthEvents(currentEvents));
    const days = [];
    for (let date = range.start; date <= range.end; date = addDays(date, 1)) days.push(date);
    const cursorMonth = cursor.slice(0, 7);
    target.innerHTML = `
      <div class="analysis-month-grid">
        ${WEEKDAYS.map(day => `<div class="analysis-weekday">${day}</div>`).join('')}
        ${days.map(date => {
          const holiday = holidayFor(date);
          return `<article class="analysis-day-cell${date.slice(0, 7) === cursorMonth ? '' : ' outside-month'}${holiday ? ' holiday' : ''}${isWeekend(date) ? ' weekend' : ''}" data-day-summary="${date}" title="${holiday ? escapeHtml(holiday.name) : 'Abrir resumo do dia'}">
            <header><button type="button" data-day-summary="${date}">${Number(date.slice(8, 10))}</button>${stockAlertIcon(date)}${renderCapacityPillsForDate(date)}${holiday ? `<span class="analysis-holiday-label" title="${escapeHtml(holiday.name)}">${escapeHtml(holiday.name)}</span>` : ''}</header>
            ${commercialMode ? commercialPinSummary(commercialPinsForDate(date)) : ''}
            <div class="analysis-day-events">${(grouped.get(date) || []).map(event => eventButton(event, '', '', { commercial: commercialMode })).join('')}</div>
          </article>`;
        }).join('')}
      </div>`;
  }

  function commercialTimelineOperation(event) {
    return {
      ...event,
      operationId: event.event_id,
      materialId: event.material_id || event.material_code || event.material_name,
      materialName: event.material_name,
      startDate: dateKey(event.planned_date),
      endDate: dateKey(event.planned_date),
      startTime: event.start_time || '08:00',
      endTime: event.end_time || event.start_time || '17:00',
      produceQty: event.planned_qty,
      unit: event.planned_unit,
      machineName: event.machine_name,
      peopleCount: event.people_count,
      productionIndex: event.production_index || 0,
      productionColor: event.production_color,
      operationType: event.operation_type
    };
  }

  function renderTimeGrid() {
    const range = commercialMode ? commercialViewRange(cursor, view) : viewRange(cursor, view);
    const grouped = eventsByDate(currentEvents);
    const days = [];
    for (let date = range.start; date <= range.end; date = addDays(date, 1)) days.push(date);
    if (commercialMode) {
      target.innerHTML = `
        <div class="commercial-timeline-target"></div>
      `;
      const timelineTarget = target.querySelector('.commercial-timeline-target');
      timelineTarget.appendChild(CalendarTimeline(days, currentEvents.map(commercialTimelineOperation), {
        mode: 'commercial',
        planningStartDate: range.start,
        planningEndDate: range.end,
        startDate: range.start,
        endDate: range.end,
        readOnly: true,
        showTeamCapacity: false,
        showTeamDetails: false,
        onDayClick: openDaySummary,
        onOperationClick: operation => {
          const selected = currentEvents.find(item => String(item.event_id) === String(operation.operationId));
          if (selected) openEventDetail({ ...selected, commercialMode }, null);
        }
      }));
      return;
    }
    const startHour = DAY_START_HOUR;
    const endHour = DAY_END_HOUR;
    const hourCount = Math.max(endHour - startHour, 1);
    const dayEvents = new Map(days.map(date => {
      const events = grouped.get(date) || [];
      return [date, {
        allDay: events.filter(event => eventStartMinutes(event) === null),
        timed: events.filter(event => eventStartMinutes(event) !== null)
      }];
    }));
    const hasAllDayEvents = [...dayEvents.values()].some(item => item.allDay.length);
    target.innerHTML = `
      <div class="analysis-time-calendar${hasAllDayEvents ? '' : ' without-all-day'}" style="--analysis-days:${days.length};--analysis-hours:${hourCount};--analysis-min-width:${86 + days.length * (view === 'day' ? 390 : 170)}px;--analysis-body-height:${TIME_TOP_PAD + hourCount * HOUR_HEIGHT}px;--analysis-hour-height:${HOUR_HEIGHT}px;--analysis-top-pad:${TIME_TOP_PAD}px;--analysis-day-width:${view === 'day' ? 390 : 170}px">
        <div class="analysis-time-corner">Horário</div>
        <div class="analysis-time-day-headers">
          ${days.map(date => {
            const holiday = holidayFor(date);
            return `<header class="${isWeekend(date) ? 'weekend' : ''}${holiday ? ' holiday' : ''}" data-day-summary="${date}" title="${holiday ? escapeHtml(holiday.name) : 'Abrir resumo do dia'}">
              <strong>${WEEKDAYS[utcDate(date).getUTCDay()]}</strong>
              <span>${formatDate(date)}</span>
              ${stockAlertIcon(date)}
              ${renderCapacityPillsForDate(date)}
              ${commercialMode ? commercialPinSummary(commercialPinsForDate(date)) : ''}
              ${holiday ? `<small title="${escapeHtml(holiday.name)}">${escapeHtml(holiday.name)}</small>` : ''}
            </header>`;
          }).join('')}
        </div>
        ${hasAllDayEvents ? `
          <div class="analysis-all-day-label">Eventos do dia</div>
          <div class="analysis-all-day-row">
            ${days.map(date => `<div class="${isWeekend(date) ? 'weekend' : ''}${holidayFor(date) ? ' holiday' : ''}">
              ${(dayEvents.get(date)?.allDay || []).map(event => eventButton(event, 'all-day-event', '', { commercial: commercialMode })).join('') || '<span class="analysis-no-events">—</span>'}
            </div>`).join('')}
          </div>` : ''}
        <div class="analysis-hour-axis">
          ${Array.from({ length: hourCount }, (_, index) => `<span style="--hour-index:${index}">${formatHourLabel(startHour + index)}</span>`).join('')}
        </div>
        <div class="analysis-time-days">
          ${days.map(date => {
            const timedEvents = dayEvents.get(date)?.timed || [];
            const pauseBands = pauseBandsForDate(timedEvents);
            return `<div class="analysis-time-day${isWeekend(date) ? ' weekend' : ''}${holidayFor(date) ? ' holiday' : ''}" data-day-summary="${date}">
              ${Array.from({ length: hourCount }, () => '<span class="analysis-hour-line"></span>').join('')}
              ${pauseBands.map(band => `<span class="analysis-pause-band" style="${pauseBandStyle(band.start, band.end)}">${escapeHtml(band.label)}</span>`).join('')}
              ${timedLayout(timedEvents, startHour, pauseBands).map(item => eventButton(item.event, 'timed-event', item.style, { commercial: commercialMode })).join('')}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderYear() {
    const grouped = eventsByDate(currentEvents);
    const year = Number(cursor.slice(0, 4));
    target.innerHTML = `<div class="analysis-year-grid">${Array.from({ length: 12 }, (_, month) => {
      const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const blanks = utcDate(first).getUTCDay();
      return `<section class="analysis-year-month">
        <button type="button" data-open-month="${first}">${MONTH_FORMAT.format(utcDate(first)).replace(` de ${year}`, '')}</button>
        <div class="analysis-mini-weekdays">${WEEKDAYS.map(day => `<span>${day[0]}</span>`).join('')}</div>
        <div class="analysis-mini-days">${'<i></i>'.repeat(blanks)}${Array.from({ length: lastDay }, (_, index) => {
          const date = `${first.slice(0, 8)}${String(index + 1).padStart(2, '0')}`;
          const holiday = holidayFor(date);
          const events = grouped.get(date) || [];
          const pins = commercialPinsForDate(date);
          const stockAlert = stockAlertForDate(date);
          const eventCount = events.length;
          const title = [eventCount ? `${eventCount} evento(s)` : 'Sem produção', pins.length ? `${pins.length} solicitação(ões)` : '', stockAlert ? stockAlertTitle(stockAlert) : '', holiday?.name].filter(Boolean).join(' • ');
          const dayNumber = stockAlert ? `<span class="analysis-year-day-number">${index + 1}</span>` : String(index + 1);
          return `<button type="button" data-day-summary="${date}" class="${events.length ? 'has-events' : ''}${pins.length ? ' has-commercial-pins' : ''}${stockAlert ? ' has-stock-alert' : ''}${holiday ? ' holiday' : ''}${isWeekend(date) ? ' weekend' : ''}" title="${escapeHtml(title)}" style="${yearDayColorStyle(events)}">${dayNumber}${pins.length ? '<span class="commercial-mini-pin"></span>' : ''}</button>`;
        }).join('')}</div>
      </section>`;
    }).join('')}</div>`;
  }

  function renderCalendar() {
    title.textContent = titleFor(cursor, view, commercialMode ? commercialViewRange : viewRange);
    page.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('is-active', button.dataset.view === view));
    if (view === 'month') renderMonth();
    else if (view === 'year') renderYear();
    else renderTimeGrid();
  }

  async function loadCommercialMaterials(date) {
    const [projection, materials] = await Promise.all([
      api(`/planning/analysis/stock-projection?date=${date}`),
      api('/materials')
    ]);
    const sellableKeys = new Set((materials || [])
      .filter(isSellableCommercialMaterial)
      .flatMap(commercialMaterialKeys));
    currentCommercialMaterials = (projection.rows || [])
      .filter(row => commercialMaterialKeys(row).some(key => sellableKeys.has(key)))
      .filter(isSellableCommercialMaterial)
      .map(row => ({
        material_id: row.material_id,
        material_name: row.material_name,
        material_codes: row.material_codes || []
      }));
    return currentCommercialMaterials;
  }

  async function load() {
    const range = commercialMode ? commercialViewRange(cursor, view) : viewRange(cursor, view);
    const loadId = ++stockAlertLoadId;
    setInternalLoading(target, 'Carregando calendário...');
    try {
      const [result, commercialMaterials] = await Promise.all([
        api(`/planning/calendar?startDate=${range.start}&endDate=${range.end}`),
        commercialMode ? loadCommercialMaterials(range.end) : Promise.resolve([])
      ]);
      const materialKeys = new Set((commercialMaterials || []).flatMap(commercialMaterialKeys));
      currentCommercialPins = readCommercialPins();
      currentEvents = (result.events || [])
        .filter(event => !isTransportEvent(event))
        .filter(event => !commercialMode || commercialMaterialMatchesEvent(materialKeys, event));
      currentCapacityDays = result.capacityDays || [];
      currentHolidays = result.holidays || [];
      currentStockAlerts = new Map();
      renderCalendar();
      if (!commercialMode) {
        loadStockAlerts(range)
          .then(stockAlerts => {
            if (loadId !== stockAlertLoadId) return;
            currentStockAlerts = stockAlerts;
            renderCalendar();
          })
          .catch(error => {
            if (loadId !== stockAlertLoadId) return;
            console.warn('Não foi possível carregar alertas de estoque.', error);
          });
      }
    } catch (error) {
      setInternalError(target, error.message || 'Não foi possível carregar o calendário.');
    }
  }

  page.addEventListener('click', event => {
    const pinButton = event.target.closest('[data-commercial-pin]');
    if (pinButton) {
      event.stopPropagation();
      const pin = currentCommercialPins.find(item => item.id === pinButton.dataset.commercialPin);
      if (pin) openCommercialPinDetail(pin);
      return;
    }
    const capacityButton = event.target.closest('[data-analysis-capacity-date]');
    if (capacityButton) {
      if (commercialMode) return;
      event.preventDefault();
      event.stopPropagation();
      openAnalysisCapacityModal(capacityButton.dataset.analysisCapacityDate, capacityButton.dataset.analysisCapacityLabel || '');
      return;
    }
    const selectedEventButton = event.target.closest('.analysis-event');
    if (selectedEventButton) {
      event.stopPropagation();
      const selected = currentEvents.find(item => String(item.event_id) === selectedEventButton.dataset.eventId);
      if (selected) openEventDetail({ ...selected, commercialMode }, canEditPlanning ? openPlanningTimeline : null);
      return;
    }
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      view = viewButton.dataset.view;
      sessionStorage.setItem(viewStorageKey, view);
      load();
      return;
    }
    const navigation = event.target.closest('[data-nav]')?.dataset.nav;
    if (navigation) {
      if (navigation === 'today') cursor = dateKey(new Date());
      else {
        const direction = navigation === 'previous' ? -1 : 1;
        cursor = view === 'day' ? addDays(cursor, direction)
          : view === 'week' ? addDays(cursor, direction * 7)
            : view === 'year' ? `${Number(cursor.slice(0, 4)) + direction}${cursor.slice(4)}`
              : addMonths(cursor, direction);
      }
      load();
      return;
    }
    const monthButton = event.target.closest('[data-open-month]');
    if (monthButton) {
      cursor = monthButton.dataset.openMonth;
      view = 'month';
      sessionStorage.setItem(viewStorageKey, view);
      load();
      return;
    }
    const dayButton = event.target.closest('[data-day-summary]');
    if (dayButton) openDaySummary(dayButton.dataset.daySummary);
  });

  assistantTarget?.addEventListener('click', event => {
    const followButton = event.target.closest('.pcp-follow-suggestion');
    if (followButton) {
      const byKey = new Map(currentPcpRows.map(row => [row.key, row]));
      const suggestedKeys = [...assistantTarget.querySelectorAll('[data-pcp-recommendation]')]
        .map(card => card.dataset.pcpRecommendation)
        .filter(key => {
          const row = byKey.get(key);
          return row && Number(row.targetQty) > 0 && row.status.key !== 'planned';
        });
      assistantTarget.querySelectorAll('[data-pcp-produce]').forEach(input => {
        input.checked = suggestedKeys.includes(input.dataset.pcpProduce);
      });
      return;
    }
    const sequenceButton = event.target.closest('.pcp-plan-sequence');
    if (sequenceButton) {
      sendPcpRowsToPlanning(selectedPcpRowsFromTable());
      return;
    }
  });

  assistantTarget?.addEventListener('change', event => {
    const idealDaysInput = event.target.closest('[data-pcp-ideal-days]');
    if (idealDaysInput) {
      applyPcpGlobalIdealDaysInput(idealDaysInput);
      return;
    }
    const rowIdealDaysInput = event.target.closest('[data-pcp-row-ideal]');
    if (rowIdealDaysInput) {
      applyPcpRowIdealDaysInput(rowIdealDaysInput);
      return;
    }
    const input = event.target.closest('[data-pcp-priority]');
    if (!input) return;
    const selectedKeys = selectedPcpRowsFromTable().map(row => row.key);
    const priorities = readPcpPriorities();
    const value = String(input.value || '').trim();
    if (/^\d+$/.test(value) && Number(value) > 0) priorities[input.dataset.pcpPriority] = value;
    else delete priorities[input.dataset.pcpPriority];
    writePcpPriorities(priorities);
    currentPcpRows = currentPcpRows.map(row => (
      row.key === input.dataset.pcpPriority ? { ...row, manualPriority: priorities[row.key] || '' } : row
    ));
    const minimumDays = readStockMinimumDays();
    if (minimumDays) {
      renderPcpAssistant(currentPcpRows, minimumDays);
      restorePcpSelection(selectedKeys);
    }
  });

  fullscreenButton?.addEventListener('click', () => {
    const expanded = panel.classList.toggle('is-analysis-fullscreen');
    document.body.classList.toggle('analysis-fullscreen-open', expanded);
    fullscreenButton.textContent = expanded ? 'Sair da tela cheia' : 'Tela cheia';
  });

  renderInternalTab();
  load();
  return page;
}
