import { api } from '../shared/api.js';
import { getCurrentUser } from '../shared/api.js';
import { CalendarTimeline } from '../shared/CalendarTimeline.js';
import {
  ProductionCalendar,
  ProductionCalendarEditor,
  adaptPlanningResultToProductionCalendar,
  buildProductionCalendarDayPresentation,
  buildProductionCalendarDayProductivity,
  extendProductionCalendarDayRange,
  fillProductionCalendarDayRange,
  getProductionDisplayColor,
  getProductionDisplayFallbackColor,
  getProductionDisplayTheme,
  PRODUCTION_DISPLAY_PALETTE
} from '../shared/production-calendar/index.js';
import {
  buildPlanningScheduleViewModel,
  createGanttApsRenderer,
  createPlanningScheduleRendererHost,
  createProductionCalendarV2Renderer
} from '../shared/planning-schedule-view/index.js';
import {
  escapeHtml,
  formatDateOnly,
  formatPeriod,
  formatPtBrDecimal,
  formatPtBrInteger,
  normalizeJsonArray,
  normalizeJsonObject,
  normalizeText,
  parsePtBrDecimal
} from '../shared/planning-presentation/planningFormatters.js';
import {
  formatDuration,
  formatHourDuration,
  minutesToTime,
  timeToMinutes
} from '../shared/planning-presentation/planningTimeFormatters.js';
import {
  renderFlowGraph as renderPlanningFlowGraph,
  renderFlowNodeCard as renderPlanningFlowNodeCard,
  renderFlowTree
} from '../shared/planning-presentation/planningFlowView.js';
import {
  drawProductionFlowConnectors,
  renderProductionFlowDom,
  scheduleProductionFlowConnectors
} from '../shared/planning-presentation/planningFlowDom.js';
import {
  bindPlanningFlowEvents
} from '../shared/planning-presentation/planningFlowEvents.js';
import {
  createPlanningHistoryController
} from '../shared/planning-controller/planningHistoryController.js';
import {
  buildPlanningStockCalendarAlert,
  buildPlanningStockModalModel,
  buildPlanningStockProjection
} from '../shared/planning-controller/planningStockProjectionController.js';
import {
  manualTransportConstraints,
  manualTransportForAllocation,
  savePlanningManualTransport,
  transportArrivalDateFromHours,
  transportHoursForArrivalDate,
  withManualTransportPresentation
} from '../shared/planning-controller/planningTransportController.js';
import {
  addCalendarMonths,
  dateOnlyFromDate,
  isValidDateOnly,
  isWeekendDate,
  parseDateOnly
} from '../shared/planning-date/planningCivilDate.js';
import {
  findMaterialById,
  materialMatchesSearch,
  selectMatchingMatrixRows,
  selectProductionMaterialOptions
} from '../shared/planning-domain/planningLookups.js';
import {
  buildNormalizedPlanningPayload,
  buildPlanningSimulationPayload,
  buildProductionPayload,
  buildShiftPayload,
  buildStockOnlyMaterialsForPayload
} from '../shared/planning-domain/planningPayloadBuilder.js';
import {
  buildFlowNodeKey,
  buildPlanningFlowGraph,
  resolveFlowNodeModelName,
  selectProductionFlowTrees
} from '../shared/planning-domain/planningFlowModel.js';
import {
  buildProductionCalendarValidationSnapshot as buildProductionCalendarValidationSnapshotModel,
  buildTimelineOperations,
  mergeDraftAllocationDays,
  resolveProductionCalendarPlanningId,
  selectProductionCalendarMachines
} from '../shared/planning-domain/planningScheduleSnapshot.js';
import { DataTable } from '../shared/DataTable.js';
import { holidayForDate } from '../shared/holidays.js';
import { createOperationOverlay, setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';
import { SummaryCards } from '../shared/SummaryCard.js';
import { PlanningStatusPill } from '../shared/StatusPill.js';
import {
  createManualScheduleDraft,
  moveDraftAllocation
} from '../services/manualScheduleDraft.service.js';
import {
  applyManualScheduleTransaction,
  isManualScheduleValidationCompatible,
  MANUAL_SCHEDULE_VALIDATION_VERSION
} from '../services/manualScheduleTransaction.service.js';
import { normalizePersistedManualScheduleDraft } from '../services/manualSchedulePersistence.service.js';
import { presentManualScheduleValidation } from '../services/manualScheduleDiagnosticPresenter.service.js';
import { resolveManualScheduleResourceByDate } from '../services/manualScheduleResourceValidation.service.js';
import {
  buildPlanningOperationResourcePreview,
  buildPlanningProductionConfigurationEditCommand,
  getPlanningOperationResourceOptions,
  reoptimizePlanningFuture,
  selectPlanningEditorProductivityRows
} from '../services/planningReoptimization.service.js';
import {
  productivityMachineKeys,
  resolveProductivityMaterial
} from '../services/productivityMatrixResolution.service.js';
import {
  cloneAutomaticBaselineValue,
  createAutomaticSimulationBaseline,
  hasManualChangesAgainstAutomaticBaseline,
  LEGACY_AUTOMATIC_BASELINE_MESSAGE,
  normalizeAutomaticSimulationBaseline,
  persistAutomaticBaselineDiscard,
  restoreAutomaticSimulationBaseline
} from '../services/automaticSimulationBaseline.service.js';
export {
  buildPlanningStockCalendarAlert,
  buildPlanningStockModalModel,
  getPlanningStockProjectionDay
} from '../shared/planning-controller/planningStockProjectionController.js';
const USE_PRODUCTION_CALENDAR_V2 = true;
const DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';
const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';
const PCP_IDEAL_DAYS_KEY = 'acofer.analysis.pcpIdealDays';
const DEFAULT_TEAM_AVAILABLE = 6;

export function shouldUsePlanningStockBalance(choice, stockQuantity) {
  return Number(stockQuantity || 0) > 0 && choice?.useStock !== false;
}

export function planningFlowNodeStockBalanceChecked({ node = {}, checked = false, canUseStock = false } = {}) {
  return node.isFinalProduct !== true
    && canUseStock === true
    && (checked === true || node.forceStockOnly === true || Number(node.stockUsedQty || 0) > 0);
}

function splitPlanningFlowDatasetValue(value) {
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function planningFlowDatasetFromNode(node = {}) {
  return node?.dataset && typeof node.dataset === 'object' ? node.dataset : node;
}

function planningFlowAllocationProductionMatches(allocation = {}, productionIndexes = new Set(), productionIds = new Set()) {
  if (!productionIndexes.size && !productionIds.size) return true;
  const directIndex = Number(allocation.productionIndex);
  if (Number.isFinite(directIndex) && productionIndexes.has(directIndex)) return true;
  const directId = String(allocation.productionId ?? allocation.productionKey ?? '').trim();
  if (directId && productionIds.has(directId)) return true;
  return (Array.isArray(allocation.productionMemberships) ? allocation.productionMemberships : []).some(membership => {
    const membershipIndex = Number(membership?.productionIndex);
    const membershipId = String(membership?.productionId ?? membership?.productionKey ?? '').trim();
    return (Number.isFinite(membershipIndex) && productionIndexes.has(membershipIndex))
      || (membershipId && productionIds.has(membershipId));
  });
}

function planningFlowAllocationIdentifiers(allocation = {}) {
  return [
    allocation.operationId,
    allocation.parentOperationId,
    allocation.calendarParentOperationId,
    allocation.splitParentOperationId
  ].map(value => String(value ?? '').trim()).filter(Boolean);
}

function planningFlowAllocationStartKey(allocation = {}) {
  return `${String(allocation.date ?? allocation.startDate ?? '').slice(0, 10)}T${String(allocation.startTime ?? '99:99').slice(0, 5)}`;
}

function planningFlowAllocationCompleted(allocation = {}) {
  const status = normalizeText(allocation.status || allocation.productionStatus || allocation.state);
  return ['concluido', 'concluida', 'realizado', 'realizada', 'completed', 'complete', 'done', 'finished'].includes(status);
}

function comparePlanningFlowAllocations(left = {}, right = {}) {
  const leftCompleted = planningFlowAllocationCompleted(left);
  const rightCompleted = planningFlowAllocationCompleted(right);
  const leftSplitOrder = Number(left.splitPartOrder ?? left.split?.splitPartOrder ?? left.splitOrder ?? left.split?.splitOrder);
  const rightSplitOrder = Number(right.splitPartOrder ?? right.split?.splitPartOrder ?? right.splitOrder ?? right.split?.splitOrder);
  return (
    (leftCompleted === rightCompleted ? 0 : leftCompleted ? 1 : -1)
    || planningFlowAllocationStartKey(left).localeCompare(planningFlowAllocationStartKey(right), 'pt-BR', { numeric: true })
    || (Number.isFinite(leftSplitOrder) ? leftSplitOrder : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(rightSplitOrder) ? rightSplitOrder : Number.MAX_SAFE_INTEGER)
    || String(left.allocationId ?? left.id ?? '').localeCompare(String(right.allocationId ?? right.id ?? ''), 'pt-BR', { numeric: true })
  );
}

export function resolvePlanningFlowAllocation(node = {}, allocations = []) {
  const dataset = planningFlowDatasetFromNode(node);
  const directAllocationId = String(dataset.flowAllocationId ?? dataset.allocationId ?? '').trim();
  if (directAllocationId) {
    const direct = (Array.isArray(allocations) ? allocations : [])
      .find(allocation => String(allocation?.allocationId ?? allocation?.id ?? '') === directAllocationId);
    return direct || { allocationId: directAllocationId };
  }

  const operationIds = new Set([
    ...splitPlanningFlowDatasetValue(dataset.flowOperationIds),
    ...splitPlanningFlowDatasetValue(dataset.flowOperationId),
    ...splitPlanningFlowDatasetValue(dataset.flowParentOperationIds),
    ...splitPlanningFlowDatasetValue(dataset.flowParentOperationId)
  ]);
  const productionIndexes = new Set(splitPlanningFlowDatasetValue(dataset.flowProductionIndexes)
    .map(value => Number(value))
    .filter(Number.isFinite));
  const productionIds = new Set([
    ...splitPlanningFlowDatasetValue(dataset.flowProductionIds),
    ...splitPlanningFlowDatasetValue(dataset.flowProductionId)
  ]);
  const materialId = String(dataset.flowMaterialId ?? dataset.materialId ?? '').trim();
  const source = Array.isArray(allocations) ? allocations : [];
  const candidates = source.filter(allocation => {
    const allocationId = String(allocation?.allocationId ?? allocation?.id ?? '').trim();
    if (!allocationId) return false;
    const productionMatches = planningFlowAllocationProductionMatches(allocation, productionIndexes, productionIds);
    if (operationIds.size) {
      return productionMatches && planningFlowAllocationIdentifiers(allocation).some(id => operationIds.has(id));
    }
    return materialId
      && String(allocation?.materialId ?? '').trim() === materialId
      && productionMatches;
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) return [...candidates].sort(comparePlanningFlowAllocations)[0];
  return null;
}

export function focusPlanningFlowAllocation({ node, allocations, rendererHost } = {}) {
  const allocation = resolvePlanningFlowAllocation(node, allocations);
  if (!allocation?.allocationId) return false;
  try {
    return rendererHost?.focusAllocation?.(allocation.allocationId) === true;
  } catch (error) {
    console.warn('Nao foi possivel focar allocation do fluxo produtivo.', error);
    return false;
  }
}

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

function readStockMinimumDays() {
  const value = String(localStorage.getItem(STOCK_MINIMUM_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : null;
}

function readPcpIdealDays(minimumDays) {
  const fallback = Math.round(Number(minimumDays || 0) * 1.5);
  const value = String(localStorage.getItem(PCP_IDEAL_DAYS_KEY) || '').trim();
  if (!/^\d+$/.test(value)) return fallback;
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? days : fallback;
}

function planningStockProjectionThresholdOptions() {
  const minimumDays = readStockMinimumDays();
  return {
    minimumDays,
    idealDays: minimumDays ? readPcpIdealDays(minimumDays) : null
  };
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

function normalizeOperationParentId(value = {}) {
  return String(value.parentOperationId ?? value.calendarParentOperationId ?? value.splitParentOperationId ?? value.operationId ?? value.id ?? '')
    .replace(/:day-\d+$/i, '');
}

function manualStockMaterialId(value = {}) {
  return String(value.materialId ?? value.material_id ?? value.id ?? '').trim();
}

function manualStockMaterialUnit(value = {}) {
  return String(value.unit ?? value.primaryUnit ?? value.primary_unit ?? '').trim();
}

function manualStockMaterialCatalog(materials = [], operations = [], stock = []) {
  const catalog = new Map();
  const add = item => {
    const materialId = manualStockMaterialId(item);
    if (!materialId) return;
    const current = catalog.get(materialId) || { materialId };
    catalog.set(materialId, {
      ...current,
      materialId,
      materialCode: String(item.materialCode ?? item.material_code ?? item.code ?? item.codes?.[0] ?? current.materialCode ?? ''),
      materialName: String(item.materialName ?? item.material_name ?? item.name ?? current.materialName ?? ''),
      unit: manualStockMaterialUnit(item) || current.unit || ''
    });
  };
  [...(materials || []), ...(operations || []), ...(stock || [])].forEach(add);
  return catalog;
}

function manualStockDependenciesForAllocation({ allocation = {}, operations = [], dependencies = [] } = {}) {
  const parentByOperationId = new Map();
  (operations || []).forEach(operation => {
    const parentId = normalizeOperationParentId(operation);
    [operation?.operationId, operation?.id, parentId].map(value => String(value ?? '').replace(/:day-\d+$/i, '')).filter(Boolean)
      .forEach(id => parentByOperationId.set(id, parentId));
  });
  const resolveParent = value => {
    const id = String(value ?? '').replace(/:day-\d+$/i, '');
    return parentByOperationId.get(id) || id;
  };
  const consumerParentId = normalizeOperationParentId(allocation);
  const explicit = Array.isArray(dependencies) && dependencies.length
    ? dependencies.map((dependency, index) => ({
        dependencyId: String(dependency?.dependencyId ?? dependency?.id ?? `dependency-${index + 1}`),
        consumerParentOperationId: resolveParent(dependency?.consumerParentOperationId ?? dependency?.targetParentOperationId ?? dependency?.parentOperationId ?? dependency?.consumerOperationId ?? dependency?.targetOperationId),
        materialId: manualStockMaterialId(dependency),
        requiredQuantity: Number(dependency?.requiredQuantity ?? dependency?.requiredQty ?? dependency?.quantity),
        unit: manualStockMaterialUnit(dependency)
      }))
    : (operations || []).flatMap(consumer => {
        const parentId = normalizeOperationParentId(consumer);
        return (Array.isArray(consumer?.dependencyRequirements) ? consumer.dependencyRequirements : []).map((requirement, index) => ({
          dependencyId: `dependency:${parentId}:${index + 1}`,
          consumerParentOperationId: parentId,
          materialId: manualStockMaterialId(requirement),
          requiredQuantity: Number(requirement?.requiredQuantity ?? requirement?.requiredQty ?? requirement?.quantity),
          unit: manualStockMaterialUnit(requirement)
        }));
      });
  return explicit.filter(dependency => (
    dependency.consumerParentOperationId === consumerParentId
    && dependency.materialId
    && dependency.requiredQuantity > 0
  ));
}

function manualStockAllocationShare(allocation = {}, allocations = []) {
  const parentId = normalizeOperationParentId(allocation);
  const peers = (Array.isArray(allocations) ? allocations : []).filter(item => normalizeOperationParentId(item) === parentId);
  const total = peers.reduce((sum, item) => sum + Math.max(Number(item?.quantity || 0), 0), 0);
  const quantity = Math.max(Number(allocation?.quantity || 0), 0);
  return total > 0 ? quantity / total : 1;
}

function manualStockAvailableByMaterial(analysis = {}) {
  const result = new Map();
  const add = (materialId, value) => {
    if (!materialId || !Number.isFinite(Number(value))) return;
    const current = result.get(materialId);
    result.set(materialId, current === undefined ? Number(value) : Math.max(current, Number(value)));
  };
  (analysis?.stockIssues || []).forEach(issue => {
    const materialIds = Array.isArray(issue?.materialIds) && issue.materialIds.length
      ? issue.materialIds
      : [issue?.materialId ?? issue?.details?.materialId];
    materialIds.map(String).filter(Boolean).forEach(materialId => {
      add(materialId, issue?.availableQuantity ?? issue?.details?.availableQuantity ?? issue?.balanceBefore);
    });
  });
  Object.entries(analysis?.validation?.stockProjection?.byMaterial || {}).forEach(([materialId, material]) => {
    Object.values(material?.locations || {}).forEach(location => {
      add(materialId, location?.minimumBalance);
    });
  });
  return result;
}

export function buildManualStockMoveModalModel({
  allocation = {},
  destinationDate,
  analysis = {},
  operations = [],
  dependencies = [],
  materials = [],
  stock = [],
  allocations = []
} = {}) {
  const originalQuantity = Math.floor(Math.max(Number(allocation?.quantity || 0), 0));
  const sourceDate = String(allocation?.date || '').slice(0, 10);
  const targetDate = String(destinationDate || '').slice(0, 10);
  const unit = String(allocation?.unit || '');
  const productionIndex = Number(allocation?.productionIndex);
  const productionTitle = String(allocation?.productionTitle || '').trim()
    || (Number.isFinite(productionIndex) ? `Produção ${productionIndex + 1}` : 'Produção');
  const catalog = manualStockMaterialCatalog(materials, operations, stock);
  const dependencyRows = manualStockDependenciesForAllocation({ allocation, operations, dependencies });
  const share = manualStockAllocationShare(allocation, allocations);
  const availableByMaterial = manualStockAvailableByMaterial(analysis);
  const components = dependencyRows.map(dependency => {
    const metadata = catalog.get(dependency.materialId) || {};
    const requiredQuantity = Math.max(Number(dependency.requiredQuantity || 0) * share, 0);
    const availableQuantity = Math.max(Number(availableByMaterial.get(dependency.materialId) ?? 0), 0);
    const deficitQuantity = Math.max(requiredQuantity - availableQuantity, 0);
    const usagePerUnit = Number(allocation?.quantity || 0) > 0 ? requiredQuantity / Number(allocation.quantity) : 0;
    const possibleQuantity = usagePerUnit > 0 ? availableQuantity / usagePerUnit : originalQuantity;
    return {
      materialId: dependency.materialId,
      materialName: metadata.materialName || dependency.materialName || dependency.materialId,
      materialCode: metadata.materialCode || '',
      unit: dependency.unit || metadata.unit || '',
      requiredQuantity,
      availableQuantity,
      deficitQuantity,
      usagePerUnit,
      possibleQuantity
    };
  });
  const limitFromComponents = components.length
    ? Math.min(...components.map(component => component.possibleQuantity).filter(Number.isFinite))
    : Number(analysis?.maxQuantity || 0);
  const rawMaxQuantity = Math.min(
    originalQuantity,
    Number.isFinite(limitFromComponents) ? limitFromComponents : Number(analysis?.maxQuantity || 0)
  );
  const maxQuantity = Math.floor(Math.max(rawMaxQuantity, 0));
  const remainingQuantity = Math.max(originalQuantity - maxQuantity, 0);
  return {
    productionTitle,
    materialName: String(allocation?.materialName || allocation?.materialCode || allocation?.materialId || 'Material'),
    sourceDate,
    destinationDate: targetDate,
    originalQuantity,
    maxQuantity,
    remainingQuantity,
    unit,
    components
  };
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

function planningInlineHolidayForDate(dateKeyValue) {
  const holiday = holidayForDate(dateKeyValue);
  if (!holiday) return null;
  if (/carnaval/i.test(String(holiday.name || ''))) return null;
  return holiday;
}

function renderPlanningInlineCalendar(selectedDateValue) {
  const selectedDate = parseDateOnly(selectedDateValue);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  const leadingDays = monthStart.getDay();
  const totalCells = Math.ceil((leadingDays + monthEnd.getDate()) / 7) * 7;
  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const selectedKey = dateOnlyFromDate(selectedDate);
  const previousMonth = dateOnlyFromDate(addCalendarMonths(monthStart, -1));
  const nextMonth = dateOnlyFromDate(addCalendarMonths(monthStart, 1));
  const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const cells = Array.from({ length: totalCells }, (_, cellIndex) => {
    const dayNumber = cellIndex - leadingDays + 1;
    if (dayNumber < 1 || dayNumber > monthEnd.getDate()) {
      return '<span class="planning-calendar-empty" aria-hidden="true"></span>';
    }
    const cellDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber);
    const dateKey = dateOnlyFromDate(cellDate);
    const holiday = planningInlineHolidayForDate(dateKey);
    const dayClasses = [
      'planning-calendar-day',
      isWeekendDate(cellDate) ? 'is-weekend' : '',
      holiday ? 'is-holiday' : '',
      dateKey === selectedKey ? 'is-selected' : ''
    ].filter(Boolean).join(' ');
    const title = holiday?.name || (isWeekendDate(cellDate) ? 'Fim de semana' : `Selecionar ${formatDateOnly(dateKey)}`);
    return `
      <button class="${dayClasses}" type="button" data-planning-date="${dateKey}" aria-pressed="${dateKey === selectedKey}" title="${escapeHtml(title)}">
        ${dayNumber}
      </button>
    `;
  });
  return `
    <input name="planningStartDate" type="hidden" value="${escapeHtml(selectedKey)}" required />
    <div class="planning-inline-calendar" aria-label="Calend&aacute;rio da data inicial">
      <div class="planning-calendar-header">
        <button class="planning-calendar-nav" type="button" data-calendar-month="${previousMonth}" aria-label="M&ecirc;s anterior">&lt;</button>
        <strong>${escapeHtml(monthLabel)}</strong>
        <button class="planning-calendar-nav" type="button" data-calendar-month="${nextMonth}" aria-label="Pr&oacute;ximo m&ecirc;s">&gt;</button>
      </div>
      <div class="planning-calendar-weekdays">
        ${weekdays.map(day => `<span>${day}</span>`).join('')}
      </div>
      <div class="planning-calendar-grid">
        ${cells.join('')}
      </div>
    </div>
  `;
}

function materialLabel(material) {
  return material?.name || '';
}

function productionModelsFor(material) {
  return Array.isArray(material?.production_models) ? material.production_models.filter(model => (model.inputMaterials || []).length) : [];
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
  return getProductionDisplayFallbackColor({ productionIndex: index });
}

function nextProductionColor(previousColor = null, index = 0) {
  const fallbackColor = automaticProductionColor(index);
  const normalizedPrevious = isHexColor(previousColor) ? String(previousColor).toUpperCase() : null;
  const paletteStart = PRODUCTION_DISPLAY_PALETTE.indexOf(fallbackColor);
  const startIndex = paletteStart >= 0 ? paletteStart : index % PRODUCTION_DISPLAY_PALETTE.length;
  for (let offset = 0; offset < PRODUCTION_DISPLAY_PALETTE.length; offset += 1) {
    const color = PRODUCTION_DISPLAY_PALETTE[(startIndex + offset) % PRODUCTION_DISPLAY_PALETTE.length];
    if (color !== normalizedPrevious) return color;
  }
  return fallbackColor;
}

function productionTheme(index = 0, color = null) {
  const canonicalColor = isHexColor(color)
    ? String(color).toUpperCase()
    : getProductionDisplayFallbackColor({ productionIndex: index });
  const displayTheme = getProductionDisplayTheme(canonicalColor, { productionIndex: index });
  return {
    start: displayTheme.base,
    end: displayTheme.base,
    soft: displayTheme.soft,
    border: displayTheme.border,
    text: displayTheme.text,
    card: displayTheme.card
  };
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

function productionCardSegmentStyle(productions = []) {
  const items = productions.length ? productions : [{ index: 0 }];
  const step = 100 / items.length;
  const colorStops = items.map((item, index) => {
    const theme = productionTheme(Number(item.index || 0), item.color);
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return {
      solid: `${theme.border} ${start}% ${end}%`,
      soft: `${theme.card || theme.soft} ${start}% ${end}%`
    };
  });
  return `--production-card-stripes: linear-gradient(180deg, ${colorStops.map(stop => stop.solid).join(', ')}); background: linear-gradient(180deg, ${colorStops.map(stop => stop.soft).join(', ')});`;
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
    skipProductionMaterials: [],
    operationOverrides: {},
    operationSplits: [],
    dailyTeamOverrides: {},
    manualWorkDates: [],
    setupHours: '',
    lastPayload: null,
    currentSimulation: null,
    manualScheduleDraft: null,
    automaticBaseline: null
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
    skipProductionMaterials: Array.isArray(draft.skipProductionMaterials) ? draft.skipProductionMaterials : [],
    operationOverrides: draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {},
    operationSplits: Array.isArray(draft.operationSplits) ? draft.operationSplits : [],
    dailyTeamOverrides: draft.dailyTeamOverrides && typeof draft.dailyTeamOverrides === 'object' ? draft.dailyTeamOverrides : {},
    manualWorkDates: [...new Set((Array.isArray(draft.manualWorkDates) ? draft.manualWorkDates : []).map(String).filter(Boolean))].sort(),
    setupHours: draft.setupHours ?? '',
    lastPayload: draft.lastPayload && typeof draft.lastPayload === 'object' ? draft.lastPayload : null,
    currentSimulation: draft.currentSimulation && typeof draft.currentSimulation === 'object' ? draft.currentSimulation : null,
    manualScheduleDraft: draft.manualScheduleDraft && typeof draft.manualScheduleDraft === 'object' ? draft.manualScheduleDraft : null,
    automaticBaseline: normalizeAutomaticSimulationBaseline(draft.automaticBaseline)
  };
  normalized.productions = normalized.productions.map(production => ({ ...production, transports: [] }));
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

function manualScheduleStockLocationId(value) {
  if (typeof value === 'string') return value.trim();
  return String(value?.locationId ?? value?.location_id ?? value?.id ?? '').trim();
}

export function normalizeManualScheduleStockLocations({
  stock = [],
  stockMinimums = [],
  stockLocations = []
} = {}) {
  const normalized = [];
  const seen = new Set();
  const addLocation = value => {
    const locationId = manualScheduleStockLocationId(value);
    if (!locationId || seen.has(locationId)) return;
    seen.add(locationId);
    normalized.push(value && typeof value === 'object'
      ? { ...value, locationId }
      : { locationId });
  };

  (Array.isArray(stockLocations) ? stockLocations : []).forEach(addLocation);
  const hasAggregatedStock = [
    ...(Array.isArray(stock) ? stock : []),
    ...(Array.isArray(stockMinimums) ? stockMinimums : [])
  ].some(item => !String(item?.locationId ?? item?.location_id ?? '').trim());
  if (hasAggregatedStock) addLocation({ locationId: '__default__' });

  return normalized;
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
  minimumStartRatio = 1,
  dependencyCompletionBufferMinutes = 60,
  holidays = [],
  timezone
} = {}) {
  const operations = Array.isArray(simulation?.operations) ? simulation.operations : [];
  const normalizedStock = stock === undefined ? stockFromSchedule(simulation) : stock;
  const normalizedStockMinimums = stockMinimums === undefined ? stockMinimumsFromMaterials(materials) : stockMinimums;
  return {
    operations,
    materials,
    machines,
    productivityMatrix,
    stock: normalizedStock,
    stockMinimums: normalizedStockMinimums,
    stockLocations: normalizeManualScheduleStockLocations({
      stock: normalizedStock,
      stockMinimums: normalizedStockMinimums,
      stockLocations
    }),
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

export function buildProductionCalendarValidationSnapshot(validation, allocations = [], days = []) {
  return buildProductionCalendarValidationSnapshotModel(validation, allocations, days, {
    validationVersion: MANUAL_SCHEDULE_VALIDATION_VERSION,
    presentValidation: presentManualScheduleValidation
  });
}

function planningDaysWithAllocations(days = [], allocations = []) {
  const byDate = new Map();
  (Array.isArray(days) ? days : []).forEach(day => {
    const date = String(day?.date ?? day?.planned_date ?? day ?? '').slice(0, 10);
    if (isValidDateOnly(date) && !byDate.has(date)) byDate.set(date, typeof day === 'object' ? { ...day, date } : { date });
  });
  (Array.isArray(allocations) ? allocations : []).forEach(allocation => {
    const date = String(allocation?.date || '').slice(0, 10);
    if (isValidDateOnly(date) && !byDate.has(date)) byDate.set(date, { date });
  });
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function applyAcceptedPlanningReoptimization({ currentSimulation, currentDraft, recalculated, transaction } = {}) {
  if (!transaction?.accepted || !transaction?.draft || !Array.isArray(transaction.draft.allocations)) {
    throw Object.assign(new Error('O candidato reotimizado completo não está disponível.'), { code: 'INCOMPLETE_REOPTIMIZATION_CANDIDATE' });
  }
  const cutoffDate = String(recalculated?.cutoffSnapshot?.cutoff?.date || transaction.draft?.frozenThrough?.date || '');
  const previousAllocations = Array.isArray(currentDraft?.allocations) ? currentDraft.allocations : [];
  const nextAllocations = transaction.draft.allocations;
  const previousFuture = cutoffDate ? previousAllocations.filter(allocation => String(allocation?.date || '') >= cutoffDate) : previousAllocations;
  const nextFuture = cutoffDate ? nextAllocations.filter(allocation => String(allocation?.date || '') >= cutoffDate) : nextAllocations;
  if (previousFuture.length > 0 && nextFuture.length === 0) {
    throw Object.assign(new Error('A reotimização aceita removeu todo o trabalho futuro.'), { code: 'ACCEPTED_REOPTIMIZATION_LOST_FUTURE_WORK' });
  }
  const manualScheduleDraft = JSON.parse(JSON.stringify(transaction.draft));
  const dailyTeamOverrides = JSON.parse(JSON.stringify(manualScheduleDraft.dailyTeamOverrides || {}));
  const manualWorkDates = [...new Set((manualScheduleDraft.manualWorkDates || []).map(String))].sort();
  return {
    manualScheduleDraft,
    dailyTeamOverrides,
    manualWorkDates,
    currentSimulation: {
      ...currentSimulation,
      operations: Array.isArray(recalculated?.operations) ? recalculated.operations : currentSimulation?.operations || [],
      calendarOperations: [],
      days: planningDaysWithAllocations(currentSimulation?.days, nextAllocations),
      tree: currentSimulation?.tree || currentSimulation?.scheduleTree || null,
      summary: {
        ...(currentSimulation?.summary || {}),
        dailyTeamOverrides,
        manualWorkDates
      }
    }
  };
}

export function createProductionCalendarExclusivePage(calendar, { onClose } = {}) {
  if (!calendar?.parentNode) return null;
  const placeholder = document.createComment('production-calendar-exclusive-placeholder');
  calendar.parentNode.insertBefore(placeholder, calendar);
  const element = document.createElement('section');
  element.className = 'production-calendar-exclusive-page';
  element.setAttribute('aria-label', 'Calend\u00e1rio de Produ\u00e7\u00e3o em tela cheia');
  element.innerHTML = `
    <header class="production-calendar-exclusive-header">
      <h1>Calend\u00e1rio de Produ\u00e7\u00e3o</h1>
      <button class="secondary-button" type="button" data-close-calendar-exclusive>Voltar ao planejamento</button>
    </header>
    <div class="production-calendar-exclusive-content"></div>
  `;
  const content = element.querySelector('.production-calendar-exclusive-content');
  content.appendChild(calendar);
  document.body.appendChild(element);
  document.body.classList.add('production-calendar-exclusive-open');
  let closed = false;
  const close = ({ restoreCalendar = true } = {}) => {
    if (closed) return;
    closed = true;
    if (restoreCalendar && placeholder.isConnected) placeholder.replaceWith(calendar);
    else {
      calendar.__productionCalendarDestroy?.();
      placeholder.remove();
    }
    element.remove();
    document.body.classList.remove('production-calendar-exclusive-open');
    onClose?.();
  };
  element.querySelector('[data-close-calendar-exclusive]').addEventListener('click', () => close());
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  element.querySelector('[data-close-calendar-exclusive]').focus();
  return { element, content, placeholder, close };
}

export function PlanningPage() {
  const canWritePlanning = canAccess(getCurrentUser(), 'planning:write');
  const page = document.createElement('section');
  page.className = 'stack planning-page';
  page.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Planejamento / Simula&ccedil;&atilde;o</h1>
        </div>
      </div>
      <div class="planning-target"></div>
    `;

  const pageTitle = page.querySelector('.page-header h1');
  const target = page.querySelector('.planning-target');
  let activeTab = sessionStorage.getItem('planejamento_planning_tab') || 'simulation';
  let materials = [];
  let matrix = [];
  let locations = [];
  let registeredMachines = [];
  let draft = loadDraft();
  let lastPayload = draft.lastPayload || null;
  let currentSimulation = draft.currentSimulation || null;
  let currentAutomaticBaseline = normalizeAutomaticSimulationBaseline(draft.automaticBaseline);
  let currentPlanningStockProjection = null;
  let stockOverviewCache = null;
  let currentPlanningStockAlerts = new Map();
  let planningStockAlertRequestId = 0;
  let productionCalendarMoveInProgress = false;
  let productionCalendarMoveRunner = null;
  let productionCalendarVisualState = {};
  let productionCalendarExclusiveView = null;
  let planningScheduleRendererHost = null;
  let manualScheduleDraft = draft.manualScheduleDraft || null;
  const manualScheduleHistory = createPlanningHistoryController({
    captureSnapshot: cloneDraftPlanningState,
    restoreSnapshot: restoreDraftPlanningState,
    onBeforeRestore: () => {
      productionCalendarVisualState = {
        ...productionCalendarVisualState,
        selectedAllocationId: null
      };
    },
    onAfterRestore: () => {
      const flowsTarget = target.querySelector('.production-flows-target');
      if (flowsTarget && currentSimulation) {
        renderProductionFlowDom(flowsTarget, renderProductionFlows(currentSimulation), {
          root: page,
          requestAnimationFrame,
          productionTheme
        });
      }
    }
  });
  let hasPendingSimulationChanges = false;
  let autosaveTimer = null;
  let recalculationTimer = null;
  let operationLoadingCount = 0;
  let operationOverlay = null;

  function toast(error) {
    window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message || error }));
  }

  function isLocalDevelopment() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location?.hostname);
  }

  function renderManualScheduleRejection(calendar, presentation) {
    calendar?.querySelector('.production-calendar-rejection-details')?.remove();
    if (!calendar || !presentation?.issues?.length) return;
    if (isLocalDevelopment()) {
      console.warn('Diagnósticos técnicos do movimento manual recusado:', presentation.issues.map(item => ({
        code: item.code,
        technicalDetails: item.technicalDetails
      })));
    }
    const section = document.createElement('section');
    section.className = 'production-calendar-validation-details production-calendar-rejection-details';
    const group = (title, items, className) => items.length ? `
      <div class="production-calendar-diagnostic-group ${className}">
        <h4>${escapeHtml(title)}</h4>
        <ol>${items.map(item => `
          <li>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.message)}</p>
            ${(item.details || []).map(detail => `<small>${escapeHtml(detail)}</small>`).join('')}
          </li>
        `).join('')}</ol>
      </div>
    ` : '';
    const technical = isLocalDevelopment() ? `
      <details class="production-calendar-technical-details">
        <summary>Detalhes técnicos (${presentation.technicalIssueCount})</summary>
        <pre>${escapeHtml(JSON.stringify(presentation.issues.map(item => ({ code: item.code, technicalDetails: item.technicalDetails })), null, 2))}</pre>
      </details>
    ` : '';
    section.innerHTML = `
      <h3>Movimento recusado</h3>
      ${group('Erros', presentation.errors || [], 'has-errors')}
      ${group('Avisos', presentation.warnings || [], 'has-warnings')}
      ${technical}
    `;
    calendar.appendChild(section);
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

  async function simulatePlanningRequest(body, { timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
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
    return buildNormalizedPlanningPayload({
      sourcePayload,
      planningCode,
      draftPlanningStartDate: draft.planningStartDate,
      operations: currentSimulation?.operations,
      getOperationPeriod: operationPeriod
    });
  }

  function updatePageTitle() {
    const tab = planningTabs.find(item => item.id === activeTab) || planningTabs[0];
    pageTitle.textContent = `Planejamento / ${tab.label}`;
  }

  function saveDraftNow() {
    draft.lastPayload = lastPayload;
    draft.currentSimulation = currentSimulation;
    draft.automaticBaseline = currentAutomaticBaseline
      ? cloneAutomaticBaselineValue(currentAutomaticBaseline)
      : null;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function queueAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveDraftNow, 80);
  }

  function planningDraftDailyMinutes({ requireConfiguredShifts = false } = {}) {
    const configuredShifts = Array.isArray(draft?.shifts) ? draft.shifts : [];
    if (requireConfiguredShifts && !configuredShifts.length) return null;
    const shifts = configuredShifts.length ? configuredShifts : [defaultShift(0)];
    const dailyMinutes = shifts.reduce((sum, shift, index) => (
      sum + productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6)
    ), 0);
    return Number.isFinite(dailyMinutes) && dailyMinutes > 0 ? dailyMinutes : null;
  }

  function hydrateProductionDefaults(production) {
    const material = findMaterialById(materials, production.materialId);
    if (!material) return;
    const models = productionModelsFor(material);
    if (!production.productionModelName && models[0]) production.productionModelName = models[0].name;
    const rows = selectMatchingMatrixRows(matrix, material, { getPriority: matrixPriority, getSecondsPerUnit: matrixSecondsPerUnit });
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    if (!production.machineName && machines[0]) production.machineName = machines[0];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(value => value !== null && value !== undefined && value !== ''))];
    if ((production.peopleCount === null || production.peopleCount === undefined || production.peopleCount === '') && people.length) production.peopleCount = String(people[0]);
  }

  async function loadLookups() {
    [materials, matrix, locations, registeredMachines] = await Promise.all([
      api('/materials'),
      api('/productivity'),
      api('/locations'),
      api('/machines')
    ]);
    registeredMachines = registeredMachines.filter(machine => machine?.active !== false);
  }

  function locationOptions(selectedId) {
    return locations.map(location => `
      <option value="${location.id}" ${String(location.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(location.name)}</option>
    `).join('');
  }

  function productionPayload() {
    return draft.productions.map((production, index) => {
      hydrateProductionDefaults(production);
      return buildProductionPayload({
        productions: [production],
        materials,
        findMaterialById,
        isHexColor,
        getAutomaticProductionColor: automaticProductionColor,
        productionIndexOffset: index
      })[0];
    });
  }

  function payload() {
    return buildPlanningSimulationPayload({
      draft,
      materials,
      findMaterialById,
      shifts: buildShiftPayload(normalizeShiftTimes(draft.shifts), {
        getDefaultTeamAvailable: defaultTeamAvailableForShift
      }),
      setupHours: parsePtBrDecimal(draft.setupHours, 0),
      productions: productionPayload(),
      stockOnlyMaterials: stockOnlyMaterialsForPayload(),
      manualWorkDates: manualScheduleDraft?.manualWorkDates || draft.manualWorkDates || lastPayload?.manualWorkDates || []
    });
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
        manualWorkDates: manualScheduleDraft?.manualWorkDates || draft.manualWorkDates || result.summary?.manualWorkDates || [],
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
      dailyTeamOverrides: JSON.parse(JSON.stringify(draft.dailyTeamOverrides || {})),
      manualWorkDates: JSON.parse(JSON.stringify(draft.manualWorkDates || [])),
      manualScheduleDraft: manualScheduleDraft ? JSON.parse(JSON.stringify(manualScheduleDraft)) : null,
      lastPayload: lastPayload ? JSON.parse(JSON.stringify(lastPayload)) : null,
      currentSimulation: currentSimulation ? JSON.parse(JSON.stringify(currentSimulation)) : null,
      hasPendingSimulationChanges: Boolean(hasPendingSimulationChanges)
    };
  }

  function restoreDraftPlanningState(snapshot) {
    draft.operationOverrides = snapshot.operationOverrides;
    draft.operationSplits = snapshot.operationSplits;
    draft.dailyTeamOverrides = snapshot.dailyTeamOverrides;
    draft.manualWorkDates = snapshot.manualWorkDates;
    manualScheduleDraft = snapshot.manualScheduleDraft || null;
    lastPayload = snapshot.lastPayload;
    currentSimulation = snapshot.currentSimulation;
    hasPendingSimulationChanges = Boolean(snapshot.hasPendingSimulationChanges);
    draft.lastPayload = lastPayload;
    draft.currentSimulation = currentSimulation;
    draft.manualScheduleDraft = manualScheduleDraft;
    saveDraftNow();
    refreshTimelineOnly();
  }

  function recordAcceptedManualState(previousState) {
    manualScheduleHistory.record(previousState);
  }

  function undoLastProductionCalendarChange() {
    manualScheduleHistory.undo();
  }

  function redoProductionCalendarChange() {
    manualScheduleHistory.redo();
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
      if (node.isInitialRawMaterial && requiredQty > 0 && stockQty < requiredQty) {
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
    const invalidProduction = draft.productions.find(production => !findMaterialById(materials, production.materialId) || !(Number(production.plannedQty) > 0));
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
    return true;
  }

  function renderShift(shift, index) {
    return `
      <article class="planning-subcard shift-card" data-shift-id="${shift.id}">
        <div class="planning-subcard-header">
          <h3>Turno ${index + 1}</h3>
          ${index > 0 ? '<button class="planning-icon-danger remove-shift" type="button" aria-label="Excluir turno" title="Excluir turno">-</button>' : ''}
        </div>
        <div class="grid-form planning-shift-fields">
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
    const material = findMaterialById(materials, production.materialId);
    const rows = selectMatchingMatrixRows(matrix, material, { getPriority: matrixPriority, getSecondsPerUnit: matrixSecondsPerUnit });
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(value => value !== null && value !== undefined && value !== ''))];
    const models = productionModelsFor(material);
    const selectedColor = isHexColor(production.color) ? production.color : automaticProductionColor(index);
    const themeStyle = productionThemeStyle(index, selectedColor);
    const sourceBadge = production.source === 'Assistente PCP'
      ? '<span class="production-source-badge">Origem: Assistente PCP</span>'
      : '';
    const sourceWarning = importedProductionWarning(production, material, rows);
    return `
      <article class="planning-subcard production-block" data-production-id="${production.id}" style="${themeStyle}">
        <div class="planning-subcard-header">
          <h3 class="production-title"><button class="production-drag-handle" type="button" draggable="true" data-production-drag-handle aria-label="Reordenar Produ&ccedil;&atilde;o ${index + 1}" title="Arrastar para priorizar"></button><button class="production-gradient-key production-color-trigger" type="button" data-color-trigger aria-label="Alterar cor da Produ&ccedil;&atilde;o ${index + 1}" title="Alterar cor" style="${themeStyle}"></button>#${index + 1}</h3>
          ${draft.productions.length > 1 ? '<button class="planning-icon-danger remove-production" type="button" aria-label="Excluir produ&ccedil;&atilde;o" title="Excluir produ&ccedil;&atilde;o">-</button>' : ''}
        </div>
        ${sourceBadge || sourceWarning ? `
          <div class="production-source-row">
            ${sourceBadge}
            ${sourceWarning ? `<span class="production-source-warning">${escapeHtml(sourceWarning)}</span>` : ''}
          </div>
        ` : ''}
        <div class="grid-form production-card-fields">
          <label>Material
            <div class="material-autocomplete">
              <input name="materialSearch" type="search" autocomplete="off" placeholder="Digite para pesquisar" value="${escapeHtml(production.materialSearch || materialLabel(material))}" required />
              <div class="material-suggestions" hidden></div>
            </div>
            <input name="materialId" type="hidden" value="${escapeHtml(production.materialId)}" />
          </label>
          <div class="readonly-field">
            <span>Unidade</span>
            <div class="material-unit readonly-chip-list">${chips([material?.primary_unit], '-')}</div>
          </div>
          <label>Quantidade<input name="plannedQty" type="number" step="0.001" value="${escapeHtml(production.plannedQty)}" required /></label>
        </div>
      </article>
    `;
  }

  function renderProductionDetailsFields(production, index) {
    hydrateProductionDefaults(production);
    const material = findMaterialById(materials, production.materialId);
    const rows = selectMatchingMatrixRows(matrix, material, { getPriority: matrixPriority, getSecondsPerUnit: matrixSecondsPerUnit });
    const machines = [...new Set(rows.map(row => row.machine_name).filter(Boolean))];
    const people = [...new Set(rows
      .filter(row => !production.machineName || row.machine_name === production.machineName)
      .map(row => row.people_count)
      .filter(value => value !== null && value !== undefined && value !== ''))];
    const models = productionModelsFor(material);
    return `
      <div class="grid-form production-details-grid">
        <label>Material
          <div class="material-autocomplete">
            <input name="materialSearch" type="search" autocomplete="off" placeholder="Digite para pesquisar" value="${escapeHtml(production.materialSearch || materialLabel(material))}" required />
            <div class="material-suggestions" hidden></div>
          </div>
          <input name="materialId" type="hidden" value="${escapeHtml(production.materialId)}" />
        </label>
        <div class="readonly-field">
          <span>Unidade</span>
          <div class="material-unit readonly-chip-list">${chips([material?.primary_unit])}</div>
        </div>
        <label>Quantidade<input name="plannedQty" type="number" step="0.001" value="${escapeHtml(production.plannedQty)}" required /></label>
        <div class="readonly-field production-detail-wide">
          <span>C&oacute;digo</span>
          <div class="material-codes readonly-chip-list">${chips(material?.codes || [], 'Sem c&oacute;digos')}</div>
        </div>
        <label>Modelo de produ&ccedil;&atilde;o
          <select name="productionModelName" ${!material || models.length <= 1 ? 'disabled data-locked="true"' : ''}>
            ${models.length
              ? models.map(model => `<option value="${escapeHtml(model.name)}" ${String(model.name) === String(production.productionModelName) ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('')
              : '<option value="">Sem modelo</option>'}
          </select>
        </label>
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
    `;
  }

  function stockOnlyKey(productionIndex, materialId) {
    return `${Number(productionIndex || 0)}:${Number(materialId)}`;
  }

  function stockOnlyMaterialsForPayload() {
    return buildStockOnlyMaterialsForPayload({
      stockOnlyMaterials: draft.stockOnlyMaterials,
      productions: draft.productions
    });
  }

  function skipProductionChecked(productionIndex, materialId) {
    return (draft.skipProductionMaterials || []).some(item =>
      Number(item.productionIndex) === Number(productionIndex)
      && String(item.materialId) === String(materialId)
    );
  }

  async function loadStockOverviewRows() {
    if (stockOverviewCache) return stockOverviewCache;
    const overview = await api('/stock/materials-overview');
    stockOverviewCache = Array.isArray(overview?.rows) ? overview.rows : [];
    return stockOverviewCache;
  }

  function stockOverviewByMaterialId(rows = []) {
    return new Map(rows.map(row => [String(row.material?.id ?? row.materialId ?? row.id ?? ''), row]));
  }

  function manualScheduleStockFromOverviewRows(rows = []) {
    return (Array.isArray(rows) ? rows : [])
      .map(row => {
        const materialId = String(row.material?.id ?? row.materialId ?? row.material_id ?? row.id ?? '');
        const quantity = Number(row.totalLocationsQty ?? row.total_locations_qty ?? row.quantity ?? 0);
        return {
          materialId,
          quantity: Number.isFinite(quantity) ? quantity : 0,
          unit: String(row.material?.primary_unit ?? row.material?.primaryUnit ?? row.unit ?? '')
        };
      })
      .filter(item => item.materialId);
  }

  function collectProductionShortageDecisions(result) {
    const groups = new Map();
    function visit(node, parent = null, root = null) {
      if (!node || typeof node !== 'object') return;
      const productionRoot = root || node;
      const requiredQty = Number(node.requiredQty || 0);
      const stockQty = Number(node.stockQty || 0);
      if (node.isInitialRawMaterial && requiredQty > stockQty && parent?.materialId) {
        const productionIndex = Number(parent.productionIndex || node.productionIndex || 0);
        const materialId = Number(parent.materialId);
        if (!Number.isFinite(materialId) || skipProductionChecked(productionIndex, materialId)) return;
        const key = stockOnlyKey(productionIndex, materialId);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            productionIndex,
            productionTitle: parent.productionTitle || `Produção ${productionIndex + 1}`,
            materialId,
            materialName: parent.materialName || '',
            materialCode: parent.materialCode || '',
            finalMaterialName: productionRoot.materialName || '',
            finalMaterialCode: productionRoot.materialCode || '',
            requiredQty: Number(parent.requiredQty || parent.produceQty || 0),
            unit: parent.unit || '',
            productionModelName: parent.productionModelName || '',
            productionModelOptions: parent.productionModelOptions || [],
            shortages: []
          });
        }
        groups.get(key).shortages.push({
          materialId: node.materialId,
          materialName: node.materialName || '',
          materialCode: node.materialCode || '',
          requiredQty,
          stockQty,
          shortageQty: Math.max(requiredQty - stockQty, 0),
          unit: node.unit || ''
        });
      }
      (node.children || []).forEach(child => visit(child, node, productionRoot));
    }
    productionFlowTrees(result).forEach(root => visit(root, null, root));
    return [...groups.values()].filter(group => group.shortages.length);
  }

  function stockQuantityForMaterial(stockRowsByMaterial = new Map(), materialId) {
    const stockRow = stockRowsByMaterial.get(String(materialId)) || {};
    return Number(stockRow.totalLocationsQty ?? stockRow.quantity ?? 0) || 0;
  }

  function selectedShortageOption(group, productionModelName = '') {
    const requested = String(productionModelName || group.productionModelName || group.productionModelOptions?.[0]?.modelName || '');
    return (group.productionModelOptions || []).find(option => String(option.modelName) === requested)
      || group.productionModelOptions?.[0]
      || null;
  }

  function shortageInputsForGroup(group, option = null) {
    return Array.isArray(option?.inputs) && option.inputs.length
      ? option.inputs
      : group.shortages.map(item => ({
          materialId: item.materialId,
          materialName: item.materialName,
          qtyPerOutput: group.requiredQty > 0 ? Number(item.requiredQty || 0) / group.requiredQty : 0,
          unit: item.unit || group.unit || ''
        }));
  }

  function readShortageSelections(root, groups = []) {
    return new Map(groups.map(group => {
      const selector = window.CSS?.escape ? window.CSS.escape(group.key) : group.key;
      const card = root?.querySelector?.(`[data-shortage-key="${selector}"]`);
      return [String(group.key), {
        action: card?.querySelector('.planning-shortage-actions input:checked')?.value || 'keep',
        productionModelName: card?.querySelector('.planning-shortage-model select')?.value || group.productionModelName || ''
      }];
    }));
  }

  function buildProductionShortageCascade(groups = [], stockRowsByMaterial = new Map(), selections = new Map()) {
    const balances = new Map();
    const previewByKey = new Map();
    [...groups].sort((left, right) => Number(left.productionIndex) - Number(right.productionIndex)).forEach(group => {
      const selection = selections.get(String(group.key)) || {};
      if (selection.action === 'skip') {
        previewByKey.set(String(group.key), []);
        return;
      }
      const option = selectedShortageOption(group, selection.productionModelName);
      const rows = shortageInputsForGroup(group, option).map(input => {
        const materialKey = String(input.materialId);
        const availableBefore = balances.has(materialKey)
          ? Number(balances.get(materialKey) || 0)
          : stockQuantityForMaterial(stockRowsByMaterial, materialKey);
        const requiredQty = Number((Number(group.requiredQty || 0) * Number(input.qtyPerOutput || 0)).toFixed(3));
        const availableAfter = Number((availableBefore - requiredQty).toFixed(3));
        balances.set(materialKey, availableAfter);
        return {
          materialId: input.materialId,
          materialName: input.materialName || '',
          unit: input.unit || group.unit || '',
          requiredQty,
          availableBefore,
          availableAfter,
          shortageQty: Math.max(requiredQty - availableBefore, 0)
        };
      });
      previewByKey.set(String(group.key), rows);
    });
    return previewByKey;
  }

  function renderProductionShortageDecisionRows(groups = [], stockRowsByMaterial = new Map(), previewRowsByKey = null) {
    const previews = previewRowsByKey || buildProductionShortageCascade(groups, stockRowsByMaterial);
    return groups.map(group => {
      const finalMaterialLabel = [group.finalMaterialName, group.finalMaterialCode ? `(${group.finalMaterialCode})` : '']
        .filter(Boolean)
        .join(' ');
      const showFinalMaterial = finalMaterialLabel
        && String(group.finalMaterialName || group.finalMaterialCode || '') !== String(group.materialName || group.materialCode || '');
      const currentModelName = String(group.productionModelName || group.productionModelOptions?.[0]?.modelName || '');
      const selectedOption = selectedShortageOption(group, currentModelName);
      const options = (group.productionModelOptions || []).map(option => {
        return `<option value="${escapeHtml(option.modelName)}" ${String(option.modelName) === String(selectedOption?.modelName || '') ? 'selected' : ''}>${escapeHtml(option.modelName)}</option>`;
      }).join('');
      const previewRows = previews.get(String(group.key)) || [];
      const totalShortageQty = previewRows.length
        ? previewRows.reduce((sum, item) => sum + Number(item.shortageQty || 0), 0)
        : group.shortages.reduce((sum, item) => sum + Number(item.shortageQty || 0), 0);
      return `
        <article class="planning-shortage-card" data-shortage-key="${escapeHtml(group.key)}" data-production-index="${escapeHtml(group.productionIndex)}" data-material-id="${escapeHtml(group.materialId)}">
          <header class="planning-shortage-card-header">
            <div>
              <strong>${escapeHtml(group.productionTitle)} - ${escapeHtml(group.materialName)}</strong>
              ${showFinalMaterial ? `<em>Produ&ccedil;&atilde;o final: ${escapeHtml(finalMaterialLabel)}</em>` : ''}
              <span>${escapeHtml(group.materialCode || '')}</span>
            </div>
            <span class="planning-shortage-badge">${escapeHtml(formatPtBrDecimal(totalShortageQty))} em falta</span>
          </header>
          <div class="planning-shortage-current">
            ${renderProductionShortageModelPreview(group, selectedOption, stockRowsByMaterial, previewRows)}
          </div>
          <div class="planning-shortage-actions">
            <label><input type="radio" name="shortage-action-${escapeHtml(group.key)}" value="keep" checked /><span>Prosseguir<strong>Manter como está</strong></span></label>
            <label><input type="radio" name="shortage-action-${escapeHtml(group.key)}" value="model" ${options ? '' : 'disabled'} /><span>Trocar modelo<strong>Usar outro insumo</strong></span></label>
            <label><input type="radio" name="shortage-action-${escapeHtml(group.key)}" value="skip" /><span>Não produzir<strong>Cortar esta cadeia</strong></span></label>
          </div>
          <label class="planning-shortage-model">Modelo de produção
            <select name="model-${escapeHtml(group.key)}" ${options ? '' : 'disabled'}>${options || '<option value="">Sem alternativa cadastrada</option>'}</select>
          </label>
        </article>
      `;
    }).join('');
  }

  function renderProductionShortageModelPreview(group, option = null, stockRowsByMaterial = new Map(), previewRows = null) {
    const rows = Array.isArray(previewRows) && previewRows.length
      ? previewRows
      : shortageInputsForGroup(group, option).map(input => {
          const stockQty = stockQuantityForMaterial(stockRowsByMaterial, input.materialId);
          const requiredQty = Number((Number(group.requiredQty || 0) * Number(input.qtyPerOutput || 0)).toFixed(3));
          const availableAfter = Number((stockQty - requiredQty).toFixed(3));
          return {
            materialName: input.materialName || '',
            unit: input.unit || group.unit || '',
            requiredQty,
            availableBefore: stockQty,
            availableAfter,
            shortageQty: Math.max(requiredQty - stockQty, 0)
          };
        });
    return `
      <div class="planning-shortage-model-preview">
        ${rows.map(row => {
          return `
            <article class="${row.shortageQty > 0 ? 'is-short' : 'is-ok'}">
              <span>${escapeHtml(row.materialName || '')}</span>
              <dl>
                <div><dt>Vai usar</dt><dd>${escapeHtml(formatPtBrDecimal(row.requiredQty))} ${escapeHtml(row.unit || '')}</dd></div>
                <div><dt>Disponivel</dt><dd>${escapeHtml(formatPtBrDecimal(row.availableBefore))} ${escapeHtml(row.unit || '')}</dd></div>
                <div><dt>Depois</dt><dd>${escapeHtml(formatPtBrDecimal(row.availableAfter))} ${escapeHtml(row.unit || '')}</dd></div>
                <div><dt>Falta</dt><dd>${escapeHtml(formatPtBrDecimal(row.shortageQty))} ${escapeHtml(row.unit || '')}</dd></div>
              </dl>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  async function requestProductionShortageDecisions(result) {
    const groups = collectProductionShortageDecisions(result);
    if (!groups.length) return { action: 'none' };
    const stockRows = await loadStockOverviewRows();
    const stockRowsByMaterial = stockOverviewByMaterialId(stockRows);
    page.querySelector('.production-shortage-modal')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop production-shortage-modal';
    const initialPreviews = buildProductionShortageCascade(groups, stockRowsByMaterial);
    backdrop.innerHTML = `
      <div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="production-shortage-title">
        <div class="modal-header">
          <div>
            <h2 id="production-shortage-title">Materiais sem saldo para produzir</h2>
            <p class="modal-subtitle">Revise os modelos antes de levar o planejamento para o calendário.</p>
          </div>
        </div>
        <form class="production-shortage-form">
          <div class="planning-shortage-list">${renderProductionShortageDecisionRows(groups, stockRowsByMaterial, initialPreviews)}</div>
          <p class="form-error" hidden></p>
          <div class="form-actions modal-actions">
            <button class="secondary-button" type="button" data-shortage-cancel>Cancelar simulação</button>
            <button class="primary-button" type="submit">Aplicar decisões</button>
          </div>
        </form>
      </div>
    `;
    return new Promise(resolve => {
      const close = value => {
        backdrop.remove();
        resolve(value);
      };
      const refreshCascadePreview = () => {
        const selections = readShortageSelections(backdrop, groups);
        const previews = buildProductionShortageCascade(groups, stockRowsByMaterial, selections);
        groups.forEach(group => {
          const selector = window.CSS?.escape ? window.CSS.escape(group.key) : group.key;
          const card = backdrop.querySelector(`[data-shortage-key="${selector}"]`);
          if (!card) return;
          const selection = selections.get(String(group.key)) || {};
          const selectedOption = selectedShortageOption(group, selection.productionModelName);
          const previewRows = previews.get(String(group.key)) || [];
          const preview = card.querySelector('.planning-shortage-current');
          if (preview) preview.innerHTML = renderProductionShortageModelPreview(group, selectedOption, stockRowsByMaterial, previewRows);
          const badge = card.querySelector('.planning-shortage-badge');
          if (badge) {
            const totalShortageQty = previewRows.reduce((sum, item) => sum + Number(item.shortageQty || 0), 0);
            badge.textContent = `${formatPtBrDecimal(totalShortageQty)} em falta`;
          }
        });
      };
      backdrop.querySelector('[data-shortage-cancel]').addEventListener('click', () => close({ action: 'cancel' }));
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close({ action: 'cancel' });
      });
      backdrop.addEventListener('change', event => {
        if (event.target.matches('.planning-shortage-model select')) {
          event.target.closest('.planning-shortage-card')?.querySelector('.planning-shortage-actions input[value="model"]')?.click();
          refreshCascadePreview();
          return;
        }
        if (event.target.matches('.planning-shortage-actions input')) refreshCascadePreview();
      });
      backdrop.querySelector('.production-shortage-form').addEventListener('submit', event => {
        event.preventDefault();
        const decisions = groups.map(group => {
          const card = backdrop.querySelector(`[data-shortage-key="${window.CSS?.escape ? window.CSS.escape(group.key) : group.key}"]`);
          const action = card?.querySelector('.planning-shortage-actions input:checked')?.value || 'keep';
          const productionModelName = card?.querySelector('.planning-shortage-model select')?.value || '';
          return { ...group, action, productionModelName };
        });
        close({ action: 'apply', decisions });
      });
      page.appendChild(backdrop);
      backdrop.querySelector('input, button, select')?.focus();
    });
  }

  function requestEmptyProductionSimulationNotice() {
    page.querySelector('.empty-production-simulation-modal')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop empty-production-simulation-modal';
    backdrop.innerHTML = `
      <div class="modal planning-empty-production-modal" role="dialog" aria-modal="true" aria-labelledby="empty-production-title">
        <div class="modal-header">
          <div>
            <h2 id="empty-production-title">Nenhuma produção está sendo simulada</h2>
            <p class="modal-subtitle">A decisão aplicada removeu toda a cadeia produtiva deste planejamento.</p>
          </div>
        </div>
        <div class="form-actions modal-actions">
          <button class="primary-button" type="button" data-empty-production-close>Fechar</button>
        </div>
      </div>
    `;
    return new Promise(resolve => {
      const close = () => {
        backdrop.remove();
        resolve();
      };
      backdrop.querySelector('[data-empty-production-close]').addEventListener('click', close);
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close();
      });
      page.appendChild(backdrop);
      backdrop.querySelector('[data-empty-production-close]')?.focus();
    });
  }

  function applyProductionShortageDecisions(decisions = []) {
    let changed = false;
    const productionIndexesToRemove = new Set();
    draft.operationOverrides = draft.operationOverrides && typeof draft.operationOverrides === 'object' ? draft.operationOverrides : {};
    draft.skipProductionMaterials = Array.isArray(draft.skipProductionMaterials) ? draft.skipProductionMaterials : [];
    decisions.forEach(decision => {
      const productionIndex = Number(decision.productionIndex || 0);
      const materialId = Number(decision.materialId);
      if (!Number.isFinite(materialId)) return;
      const key = stockOnlyKey(productionIndex, materialId);
      if (decision.action === 'model' && decision.productionModelName) {
        draft.operationOverrides[key] = {
          ...(draft.operationOverrides[key] || {}),
          productionModelName: decision.productionModelName
        };
        draft.skipProductionMaterials = draft.skipProductionMaterials.filter(item =>
          !(Number(item.productionIndex) === productionIndex && Number(item.materialId) === materialId)
        );
        changed = true;
      } else if (decision.action === 'skip') {
        productionIndexesToRemove.add(productionIndex);
        changed = true;
      }
    });
    [...productionIndexesToRemove]
      .filter(index => Number.isInteger(index) && index >= 0 && index < draft.productions.length)
      .sort((left, right) => right - left)
      .forEach(index => {
        draft.productions.splice(index, 1);
        removeProductionScopedState(index);
      });
    if (changed) saveDraftNow();
    return changed;
  }

  function applySkippedProductionCascade(result) {
    const skipped = new Set((draft.skipProductionMaterials || [])
      .map(item => stockOnlyKey(item.productionIndex, item.materialId)));
    if (!skipped.size || !result?.tree) return result;

    const blockedOperationIds = new Set();
    const blockedMaterialKeys = new Set();
    function visit(node) {
      if (!node || typeof node !== 'object') return { blocked: false, node: null };
      const productionIndex = Number(node.productionIndex || 0);
      const key = stockOnlyKey(productionIndex, node.materialId);
      const ownSkipped = skipped.has(key);
      const childResults = (node.children || []).map(visit);
      const childBlocked = childResults.some(item => item.blocked);
      const blocked = ownSkipped || childBlocked;
      if (blocked) {
        blockedOperationIds.add(`${productionIndex}:${node.materialId}`);
        blockedMaterialKeys.add(key);
        return { blocked: true, node: null };
      }
      return {
        blocked: false,
        node: {
          ...node,
          children: childResults.map(item => item.node).filter(Boolean)
        }
      };
    }

    const roots = productionFlowTrees(result);
    const keptRoots = roots.map(visit).map(item => item.node).filter(Boolean);
    const operations = (result.operations || []).filter(operation => {
      const productionIndex = Number(operation.productionIndex || 0);
      const operationId = String(operation.operationId || `${productionIndex}:${operation.materialId}`);
      return !blockedOperationIds.has(operationId) && !blockedMaterialKeys.has(stockOnlyKey(productionIndex, operation.materialId));
    });
    const operationIds = new Set(operations.map(operation => String(operation.operationId || `${Number(operation.productionIndex || 0)}:${operation.materialId}`)));
    const calendarOperations = (result.calendarOperations || []).filter(operation => {
      const productionIndex = Number(operation.productionIndex || 0);
      const operationId = String(operation.operationId || operation.parentOperationId || operation.calendarParentOperationId || `${productionIndex}:${operation.materialId}`);
      return operationIds.has(operationId) || (!blockedOperationIds.has(operationId) && !blockedMaterialKeys.has(stockOnlyKey(productionIndex, operation.materialId)));
    });
    const days = (result.days || []).filter(day => {
      const productionIndex = Number(day.productionIndex || 0);
      return !blockedMaterialKeys.has(stockOnlyKey(productionIndex, day.material_id ?? day.materialId));
    });
    const tree = Array.isArray(result.tree?.children) && isPlanningRootName(result.tree.materialName)
      ? { ...result.tree, children: keptRoots }
      : keptRoots[0] || null;
    return { ...result, tree, operations, calendarOperations, days };
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
    return selectProductionFlowTrees(result, { isPlanningRootName });
  }

  function stockOnlyMaterialsFromSimulation(result) {
    const nextByKey = new Map();
    function visit(node, isFinalProduct = false) {
      if (!node || typeof node !== 'object') return;
      if (!isFinalProduct && !node.isInitialRawMaterial && hasStockAvailable(node)) {
        const productionIndex = Number(node.productionIndex || 0);
        const materialId = Number(node.materialId);
        const manualChoice = stockOnlyChoice(productionIndex, materialId);
        const shouldUseStock = shouldUsePlanningStockBalance(manualChoice, node.stockQty);
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

  function flowNodeModelName(node) {
    return resolveFlowNodeModelName(node, {
      operationOverrides: draft.operationOverrides,
      productions: draft.productions
    });
  }

  function flowNodeKey(node) {
    return buildFlowNodeKey(node, {
      operationOverrides: draft.operationOverrides,
      productions: draft.productions
    });
  }

  function buildFlowGraph(roots) {
    return buildPlanningFlowGraph(roots, {
      isPlanningRootName,
      operationOverrides: draft.operationOverrides,
      productions: draft.productions
    });
  }

  function clearProductionMaterialDecisions(productionIndex) {
    draft.stockOnlyMaterials = (draft.stockOnlyMaterials || [])
      .filter(item => Number(item.productionIndex) !== Number(productionIndex));
    draft.stockOnlyMaterialChoices = (draft.stockOnlyMaterialChoices || [])
      .filter(item => Number(item.productionIndex) !== Number(productionIndex));
    draft.skipProductionMaterials = (draft.skipProductionMaterials || [])
      .filter(item => Number(item.productionIndex) !== Number(productionIndex));
    draft.operationSplits = (draft.operationSplits || [])
      .filter(item => Number(item.productionIndex || 0) !== Number(productionIndex));
  }

  function removeProductionScopedState(removedIndex) {
    if (removedIndex < 0) return;
    const activeMaterialIds = new Set();
    draft.productions.forEach(production => {
      selectProductionMaterialOptions(materials, production).forEach(material => activeMaterialIds.add(String(material.id)));
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
    draft.skipProductionMaterials = (draft.skipProductionMaterials || [])
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

  function planningFlowViewOptions(options = {}) {
    return {
      ...options,
      buildFlowGraph,
      consolidatedStockOnlyChecked,
      flowNodeKey,
      hasStockAvailable,
      planningFlowNodeStockBalanceChecked,
      productionCardSegmentStyle,
      productionSegmentStyle,
      productionThemeStyle,
      renderNodeCard: renderPlanningFlowNodeCard
    };
  }

  function renderFlowGraph(trees, options = {}) {
    return renderPlanningFlowGraph(trees, planningFlowViewOptions(options));
  }

  function renderProductionFlows(result) {
    const trees = result.tree?.children?.length && isPlanningRootName(result.tree.materialName)
      ? result.tree.children
      : result.tree ? [result.tree] : [];
    const summary = result.summary.productions || [];
    const legendItems = (summary.length ? summary : trees.map((tree, index) => ({
      title: tree.productionTitle || `Produ&ccedil;&atilde;o ${index + 1}`,
      materialName: tree.materialName,
      plannedQty: tree.requiredQty,
      plannedUnit: tree.unit,
      productionIndex: tree.productionIndex,
      color: tree.productionColor
    }))).map((production, index) => {
      const productionIndex = Number(production.productionIndex ?? index);
      const color = production.color || draft.productions[productionIndex]?.color;
      const quantity = Number(production.plannedQty || 0);
      return `
        <div class="production-flow-legend-item" role="listitem" style="${productionThemeStyle(productionIndex, color)}">
          <span class="production-flow-legend-marker" aria-hidden="true"></span>
          <span>${escapeHtml(production.title || `Produ&ccedil;&atilde;o ${productionIndex + 1}`)} &middot; ${escapeHtml(production.materialName || '')}${quantity > 0 ? ` &middot; ${formatPtBrDecimal(quantity)} ${escapeHtml(production.plannedUnit || '')}` : ''}</span>
        </div>
      `;
    }).join('');
    return `
      <div class="production-flow-legend" role="list" aria-label="Produ&ccedil;&otilde;es do fluxo">
        ${legendItems}
      </div>
      <article class="production-flow-card consolidated-flow-card" data-flow-production="consolidated" style="${productionThemeStyle(0, draft.productions[0]?.color)}">
        ${renderFlowGraph(trees)}
      </article>
    `;
  }

  function timelineOperations(result) {
    return buildTimelineOperations(result);
  }

  function productionCalendarMachines(result) {
    return selectProductionCalendarMachines(result, registeredMachines);
  }

  function productionCalendarPlanningId(result) {
    return resolveProductionCalendarPlanningId(result, {
      draftPlanningCode: draft.planningCode,
      lastPayloadPlanningCode: lastPayload?.planningCode
    });
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

  function currentProductionCalendarSnapshot() {
    if (!currentSimulation) return buildProductionCalendarSnapshot({ days: [], operations: [], calendarOperations: [] });
    return buildProductionCalendarSnapshot(currentSimulation, { stockAlerts: currentPlanningStockAlerts });
  }

  function currentManualScheduleValidationContext(snapshot = currentProductionCalendarSnapshot(), options = {}) {
    const summary = currentSimulation?.summary || {};
    return buildManualScheduleValidationContext({
      simulation: currentSimulation,
      materials,
      machines: snapshot?.machines || [],
      productivityMatrix: matrix,
      stock: options.stock ?? currentSimulation?.stock,
      stockMinimums: currentSimulation?.stockMinimums,
      stockLocations: Array.isArray(currentSimulation?.stockLocations) && currentSimulation.stockLocations.length
        ? currentSimulation.stockLocations
        : locations,
      dependencies: currentSimulation?.dependencies,
      transports: currentSimulation?.transports,
      shifts: Array.isArray(summary.shifts) && summary.shifts.length ? summary.shifts : draft.shifts,
      dailyTeamOverrides: manualScheduleDraft?.dailyTeamOverrides ?? draft.dailyTeamOverrides ?? summary.dailyTeamOverrides ?? {},
      manualWorkDates: manualScheduleDraft?.manualWorkDates ?? summary.manualWorkDates ?? lastPayload?.manualWorkDates ?? [],
      setupMinutes: Number(summary.setupHours ?? lastPayload?.setupHours ?? 0) * 60,
      minimumStartRatio: 1,
      dependencyCompletionBufferMinutes: Number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60),
      holidays: currentSimulation?.holidays || [],
      timezone: currentSimulation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  async function currentManualScheduleValidationContextWithFreshStock(snapshot = currentProductionCalendarSnapshot()) {
    try {
      const stockRows = await loadStockOverviewRows();
      const stock = manualScheduleStockFromOverviewRows(stockRows);
      if (stock.length) return currentManualScheduleValidationContext(snapshot, { stock });
    } catch (error) {
      console.warn('Nao foi possivel carregar estoque atualizado para validacao manual.', error);
    }
    return currentManualScheduleValidationContext(snapshot);
  }

  function prepareCleanSimulationDiscard(simulation, allocations, baseSimulationId, mode = 'automatic-baseline') {
    const adapted = adaptPlanningResultToProductionCalendar({
      planningId: productionCalendarPlanningId(simulation),
      calendarOperations: Array.isArray(simulation.calendarOperations) ? simulation.calendarOperations : [],
      operations: Array.isArray(simulation.operations) ? simulation.operations : [],
      tree: simulation.tree || simulation.scheduleTree || simulation.schedule_tree || null,
      days: Array.isArray(simulation.days) ? simulation.days : [],
      machines: productionCalendarMachines(simulation),
      status: simulation.summary?.status || simulation.status
    });
    const candidateDraft = createManualScheduleDraft({
      planningId: productionCalendarPlanningId(simulation),
      baseSimulationId: simulation?.code || lastPayload?.planningCode || baseSimulationId,
      allocations,
      machines: adapted.machines,
      manualWorkDates: [],
      dailyTeamOverrides: {}
    });
    const previousDiagnostics = manualScheduleDraft?.validation || {
      valid: true,
      errors: [],
      warnings: [],
      summary: { errorCount: 0, warningCount: 0 }
    };
    candidateDraft.validation = previousDiagnostics;
    const validationTransaction = applyManualScheduleTransaction({
      currentDraft: candidateDraft,
      intent: {
        type: 'SET_DAILY_TEAM_OVERRIDES',
        date: '',
        overrides: {},
        candidateDraft,
        previousDiagnostics
      },
      draftContext: { validatedAt: new Date().toISOString() },
      validationContext: buildManualScheduleValidationContext({
        simulation,
        materials,
        machines: adapted.machines,
        productivityMatrix: matrix,
        stock: simulation.stock,
        stockMinimums: simulation.stockMinimums,
        stockLocations: Array.isArray(simulation.stockLocations) && simulation.stockLocations.length
          ? simulation.stockLocations
          : locations,
        dependencies: simulation.dependencies,
        transports: simulation.transports,
        shifts: Array.isArray(simulation.summary?.shifts) && simulation.summary.shifts.length
          ? simulation.summary.shifts
          : draft.shifts,
        dailyTeamOverrides: {},
        manualWorkDates: [],
        setupMinutes: Number(simulation.summary?.setupHours ?? lastPayload?.setupHours ?? 0) * 60,
        minimumStartRatio: 1,
        dependencyCompletionBufferMinutes: Number(simulation.dependencyCompletionBufferMinutes ?? 60),
        holidays: simulation.holidays || [],
        timezone: simulation.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    });
    if (!validationTransaction.accepted) {
      throw new Error(validationTransaction.blockingIssues?.[0]?.message || 'A baseline automática não pôde ser validada para restauração.');
    }
    return {
      simulation,
      manualScheduleDraft: validationTransaction.draft,
      automaticBaseline: createAutomaticSimulationBaseline({ simulation, allocations }),
      mode
    };
  }

  function prepareAutomaticBaselineDiscard() {
    const restored = restoreAutomaticSimulationBaseline(currentAutomaticBaseline);
    return prepareCleanSimulationDiscard(restored.simulation, restored.allocations, restored.hash, 'automatic-baseline');
  }

  function prepareCurrentSimulationManualDiscard() {
    if (!currentSimulation || !manualScheduleDraft) {
      throw new Error('A simulação atual não está disponível para restauração.');
    }
    const adapted = adaptPlanningResultToProductionCalendar({
      planningId: productionCalendarPlanningId(currentSimulation),
      calendarOperations: Array.isArray(currentSimulation.calendarOperations) ? currentSimulation.calendarOperations : [],
      operations: Array.isArray(currentSimulation.operations) ? currentSimulation.operations : [],
      tree: currentSimulation.tree || currentSimulation.scheduleTree || currentSimulation.schedule_tree || null,
      days: Array.isArray(currentSimulation.days) ? currentSimulation.days : [],
      machines: productionCalendarMachines(currentSimulation),
      status: currentSimulation.summary?.status || currentSimulation.status
    });
    const automaticAllocations = (adapted.allocations || []).length
      ? adapted.allocations
      : (manualScheduleDraft.allocations || []).filter(allocation => allocation.source !== 'manual');
    return prepareCleanSimulationDiscard(
      currentSimulation,
      automaticAllocations,
      currentSimulation?.code || lastPayload?.planningCode || currentAutomaticBaseline?.hash,
      'current-simulation'
    );
  }

  async function discardAllProductionCalendarChanges() {
    if (!currentAutomaticBaseline) {
      toast(new Error(LEGACY_AUTOMATIC_BASELINE_MESSAGE));
      return;
    }
    let prepared;
    try {
      prepared = prepareAutomaticBaselineDiscard();
    } catch (error) {
      try {
        prepared = prepareCurrentSimulationManualDiscard();
      } catch (fallbackError) {
        toast(new Error(`Não foi possível preparar a restauração da simulação atual. ${fallbackError?.message || error?.message || ''}`.trim()));
        return;
      }
    }
    const savedPlanningId = draft.savedPlanningId;
    const expectedRevision = Number(draft.savedPlanningRevision || 0);
    const nextDraft = normalizeDraft({
      ...draft,
      operationOverrides: {},
      operationSplits: [],
      dailyTeamOverrides: {},
      manualWorkDates: [],
      lastPayload: lastPayload ? {
        ...lastPayload,
        operationOverrides: {},
        operationSplits: [],
        dailyTeamOverrides: {},
        manualWorkDates: []
      } : null,
      currentSimulation: prepared.simulation,
      manualScheduleDraft: prepared.manualScheduleDraft,
      automaticBaseline: cloneAutomaticBaselineValue(prepared.automaticBaseline || currentAutomaticBaseline),
      savedPlanningRevision: savedPlanningId ? expectedRevision + 1 : expectedRevision
    });
    try {
      await persistAutomaticBaselineDiscard({
        storage: localStorage,
        storageKey: DRAFT_KEY,
        nextDraft,
        persistRemote: savedPlanningId
          ? () => prepared.mode === 'current-simulation'
            ? api(`/planning/plans/${savedPlanningId}/manual-schedule`, {
                method: 'PUT',
                body: {
                  expectedRevision,
                  manualScheduleDraft: prepared.manualScheduleDraft,
                  manualScheduleValidation: prepared.manualScheduleDraft?.validation || null,
                  settings: {
                    manualWorkDates: [],
                    dailyTeamOverrides: {}
                  }
                }
              })
            : api(`/planning/plans/${savedPlanningId}/manual-schedule`, {
                method: 'DELETE',
                body: { expectedRevision }
              })
          : null
      });
    } catch (error) {
      toast(new Error(`Não foi possível descartar as alterações. O calendário anterior foi preservado. ${error?.message || ''}`.trim()));
      return;
    }
    draft = nextDraft;
    currentAutomaticBaseline = cloneAutomaticBaselineValue(prepared.automaticBaseline || currentAutomaticBaseline);
    currentSimulation = cloneAutomaticBaselineValue(prepared.simulation);
    manualScheduleDraft = cloneAutomaticBaselineValue(prepared.manualScheduleDraft);
    lastPayload = draft.lastPayload;
    productionCalendarVisualState = {};
    hasPendingSimulationChanges = false;
    manualScheduleHistory.resetFromCurrent();
    currentPlanningStockAlerts = new Map();
    refreshTimelineOnly();
    const flowsTarget = target.querySelector('.production-flows-target');
    if (flowsTarget) {
      renderProductionFlowDom(flowsTarget, renderProductionFlows(currentSimulation), {
        root: page,
        requestAnimationFrame,
        productionTheme
      });
    }
    toast('Todas as alterações manuais foram descartadas.');
  }

  function findProductionCalendarMachine(snapshot, machineId) {
    return (snapshot?.machines || []).find(machine => String(machine?.machineId) === String(machineId)) || null;
  }

  function validateProductionCalendarMoveIntent(intent, snapshot) {
    if (!intent || intent.type !== 'MOVE_ALLOCATION') return null;
    if (productionCalendarMoveInProgress) throw new Error('Aguarde o replanejamento atual terminar.');

    const destinationKind = intent.destination?.kind;
    if (!['empty', 'occupied', 'reorder'].includes(destinationKind)) throw new Error('Destino invalido para movimentacao.');
    if (!isValidDateOnly(intent.to?.date)) throw new Error('Destino sem data valida.');
    if (!intent.to?.machineId) throw new Error('Destino sem maquina.');
    const allocation = (snapshot?.allocations || []).find(item => String(item?.allocationId) === String(intent.allocationId)) || null;
    if (!allocation) throw new Error('Este bloco foi atualizado pelo recalculo. Atualize a selecao e tente novamente.');

    const parentOperationId = productionCalendarParentOperationId(allocation);
    if (!parentOperationId) throw new Error('Operacao pai inexistente.');

    if (destinationKind !== 'reorder' && String(allocation.date || '') === String(intent.to.date) && String(allocation.machineId || '') === String(intent.to.machineId)) {
      throw new Error('Destino igual a origem.');
    }

    if (intent.source === 'gantt-drag' && String(allocation.machineId || '') !== String(intent.to.machineId || '')) {
      throw new Error('O Gantt APS nesta etapa permite arrastar apenas dentro da mesma maquina.');
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

  function dailyTeamOverridesCandidate(date, overrides) {
    const next = JSON.parse(JSON.stringify(manualScheduleDraft?.dailyTeamOverrides || {}));
    const dateOverrides = { ...(next[date] || {}) };
    Object.entries(overrides || {}).forEach(([shiftId, value]) => {
      if (value === null || value === undefined || value === '') delete dateOverrides[shiftId];
      else dateOverrides[shiftId] = Number(value);
    });
    if (Object.keys(dateOverrides).length) next[date] = dateOverrides;
    else delete next[date];
    return next;
  }

  function reoptimizeProductionCalendarConstraints({
    date, time = '00:00', dailyTeamOverrides, manualWorkDates, operationResourceEdits, scopeParentOperationIds, productivityMatrix = matrix, dailyMinutes, acceptedDraft = manualScheduleDraft, policies
  }) {
    const validationContext = currentManualScheduleValidationContext();
    return reoptimizePlanningFuture({
      baseline: {
        ...validationContext,
        operations: currentSimulation?.operations || validationContext.operations || [],
        dailyMinutes
      },
      acceptedDraft,
      cutoff: { date, time },
      constraintChanges: { dailyTeamOverrides, manualWorkDates, operationResourceEdits, scopeParentOperationIds, now: new Date().toISOString() },
      productivityMatrix,
      calendar: {
        shifts: validationContext.shifts,
        dailyTeamOverrides,
        manualWorkDates,
        holidays: validationContext.holidays
      },
      stockContext: {
        stock: validationContext.stock,
        stockMinimums: validationContext.stockMinimums,
        stockLocations: validationContext.stockLocations
      },
      policies
    });
  }

  function buildManualMoveCandidateDraft({ intent, move, calendarSnapshot, decisions, now }) {
    return moveDraftAllocation(manualScheduleDraft, {
      allocationId: move.allocation.allocationId,
      targetDate: intent.to.date,
      targetMachineId: move.machine.machineId,
      peopleCount: intent.peopleCount,
      moveMode: intent.moveMode || null,
      machines: calendarSnapshot.machines,
      matrixRows: matrix,
      days: calendarSnapshot.days,
      dailyMinutes: planningDraftDailyMinutes(),
      now,
      ...(decisions || {})
    });
  }

  async function reoptimizeManualMoveCandidate({ candidateDraft, intent, move, validationContext, transactionTimestamp }) {
    const targetDate = String(intent?.to?.date || '').slice(0, 10);
    const sourceDate = String(intent?.from?.date || move?.allocation?.date || '').slice(0, 10);
    const cutoffDate = [sourceDate, targetDate].filter(isValidDateOnly).sort()[0] || targetDate;
    const recalculated = reoptimizePlanningFuture({
      baseline: {
        ...validationContext,
        operations: currentSimulation?.operations || validationContext.operations || [],
        dailyMinutes: planningDraftDailyMinutes()
      },
      acceptedDraft: candidateDraft,
      cutoff: { date: cutoffDate, time: '00:00' },
      constraintChanges: {
        dailyTeamOverrides: candidateDraft.dailyTeamOverrides || manualScheduleDraft?.dailyTeamOverrides || {},
        manualWorkDates: candidateDraft.manualWorkDates || manualScheduleDraft?.manualWorkDates || [],
        now: transactionTimestamp
      },
      productivityMatrix: matrix,
      calendar: {
        shifts: validationContext.shifts,
        dailyTeamOverrides: candidateDraft.dailyTeamOverrides || manualScheduleDraft?.dailyTeamOverrides || {},
        manualWorkDates: candidateDraft.manualWorkDates || manualScheduleDraft?.manualWorkDates || [],
        holidays: validationContext.holidays
      },
      stockContext: {
        stock: validationContext.stock,
        stockMinimums: validationContext.stockMinimums,
        stockLocations: validationContext.stockLocations,
        stockProjection: candidateDraft.validation?.stockProjection || manualScheduleDraft?.validation?.stockProjection
      }
    });
    if (!recalculated.accepted) {
      const validation = recalculated.diagnostics || { errors: recalculated.blockingRegressions || [] };
      const presentation = presentManualScheduleValidation(validation, {
        ...validationContext,
        allocations: recalculated.allocations || candidateDraft.allocations,
        locations
      });
      const error = new Error(presentation.primaryIssue?.message || recalculated.blockingRegressions?.[0]?.message || 'Não foi possível reotimizar o calendário após o movimento.');
      error.validation = validation;
      error.diagnosticPresentation = presentation;
      throw error;
    }
    const transaction = applyManualScheduleTransaction({
      currentDraft: manualScheduleDraft,
      intent: {
        type: 'SET_DAILY_TEAM_OVERRIDES',
        date: cutoffDate,
        overrides: candidateDraft.dailyTeamOverrides?.[cutoffDate] || {},
        cutoffDate,
        cutoffSnapshot: recalculated.cutoffSnapshot,
        previousDiagnostics: recalculated.previousDiagnostics,
        diagnosticDelta: recalculated.diagnosticDelta,
        candidateAllocations: recalculated.allocations,
        candidateDraft: recalculated.manualScheduleDraft
      },
      draftContext: { validatedAt: transactionTimestamp },
      validationContext
    });
    return { recalculated, transaction };
  }

  function currentPlanningReoptimizationCutoff() {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`
    };
  }

  function openProductionCalendarChoiceModal({ title, bodyHtml, actions }) {
    document.querySelector('.production-calendar-choice-modal')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop production-calendar-choice-modal';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="production-calendar-choice-title">
        <div class="modal-header">
          <h3 id="production-calendar-choice-title">${escapeHtml(title)}</h3>
          <button class="link-button" type="button" data-production-calendar-choice="cancel">Cancelar</button>
        </div>
        <div class="manual-draft-choice-body">${bodyHtml}</div>
        <div class="form-actions modal-actions">
          ${actions.map(action => `<button class="${escapeHtml(action.className || 'secondary-button')}" type="button" data-production-calendar-choice="${escapeHtml(action.value)}">${escapeHtml(action.label)}</button>`).join('')}
        </div>
      </div>
    `;
    return new Promise(resolve => {
      const close = value => {
        backdrop.remove();
        resolve(value);
      };
      backdrop.addEventListener('click', event => {
        const button = event.target.closest('[data-production-calendar-choice]');
        if (button) close(button.dataset.productionCalendarChoice || 'cancel');
        else if (event.target === backdrop) close('cancel');
      });
      backdrop.addEventListener('keydown', event => {
        if (event.key === 'Escape') close('cancel');
      });
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-production-calendar-choice]')?.focus();
    });
  }

  async function confirmProductionCalendarCapacityDecision(error) {
    const capacity = Number(error?.proposedAllocation?.capacityPercent || 0);
    const choice = await openProductionCalendarChoiceModal({
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

  async function handleProductionCalendarAllocationSave({ mode, allocation, relativePercents, partEdits, machineId, peopleCount, quantity, date, startTime, productivityRows } = {}) {
    if (!canWritePlanning || !manualScheduleDraft || !allocation) return { accepted: false };
    const current = manualScheduleDraft.allocations.find(item => String(item.allocationId) === String(allocation.allocationId));
    if (!current) return { accepted: false, message: 'Este bloco foi atualizado. Feche o modal e tente novamente.' };
    const isSplit = mode === 'split';
    const requestedQuantity = Number(quantity);
    const quantityChanged = !isSplit && Number.isFinite(requestedQuantity)
      && Math.abs(requestedQuantity - Number(current.quantity || 0)) > 0.000001;
    const resourceChanged = !isSplit && (
      String(current.machineId) !== String(machineId)
      || Number(current.peopleCount) !== Number(peopleCount)
    );
    if (!isSplit && String(current.machineId) === String(machineId)
      && Number(current.peopleCount) === Number(peopleCount)
      && String(current.date) === String(date)
      && String(current.startTime) === String(startTime)
      && !quantityChanged) return { accepted: true };

    if (resourceChanged) {
      const snapshot = currentProductionCalendarSnapshot();
      const material = resolveProductivityMaterial({ reference: current, materials });
      const rows = Array.isArray(productivityRows) && productivityRows.length
        ? productivityRows
        : selectPlanningEditorProductivityRows({ material: material || current, productivityMatrix: matrix });
      const resourceOptions = getPlanningOperationResourceOptions({
        productivityRows: rows,
        machines: snapshot?.machines || [],
        material: material || current
      });
      const machine = resourceOptions.find(option => String(option.machineId) === String(machineId));
      const preview = machine ? buildPlanningOperationResourcePreview({
        allocation: current,
        machine,
        peopleCount,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      }) : null;
      const command = preview ? buildPlanningProductionConfigurationEditCommand({
        allocation: current,
        parentOperationId: productionCalendarParentOperationId(current),
        machine,
        peopleCount,
        productivityConfiguration: preview.productivityConfiguration,
        cutoff: { date: current.date, time: current.startTime }
      }) : null;
      if (!command) return { accepted: false, message: 'A configuração selecionada não existe na Matriz de Produtividade.' };

      const previewQuantity = quantityChanged ? requestedQuantity : Number(current.quantity);
      const previewUsage = previewQuantity > 0 && Number(preview.capacityPerDay) > 0
        ? (previewQuantity / Number(preview.capacityPerDay)) * 100
        : 0;
      const capacityDecision = previewUsage > 100
        ? await confirmProductionCalendarCapacityDecision({ proposedAllocation: { capacityPercent: previewUsage } })
        : 'split';
      if (capacityDecision === 'cancel') return { accepted: false, message: '' };
      if (capacityDecision === 'override') {
        const previousManualState = cloneDraftPlanningState();
        const timestamp = new Date().toISOString();
        const transaction = applyManualScheduleTransaction({
          currentDraft: manualScheduleDraft,
          intent: {
            type: 'EDIT_ALLOCATION',
            allocationId: current.allocationId,
            machineId,
            peopleCount,
            quantity: quantityChanged ? requestedQuantity : undefined,
            date: current.date,
            startTime: current.startTime
          },
          draftContext: {
            now: timestamp,
            validatedAt: timestamp,
            machines: snapshot?.machines || [],
            matrixRows: rows,
            dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
          },
          validationContext: await currentManualScheduleValidationContextWithFreshStock(snapshot),
          decisions: { capacityDecision: 'override' }
        });
        if (!transaction.accepted) return {
          accepted: false,
          message: transaction.blockingIssues?.[0]?.message || 'A capacidade extraordinaria nao pode ser aplicada.'
        };
        manualScheduleDraft = transaction.draft;
        draft.manualScheduleDraft = manualScheduleDraft;
        recordAcceptedManualState(previousManualState);
        saveDraftNow();
        refreshTimelineOnly();
        toast('Configuracao atualizada com capacidade extraordinaria.');
        return { accepted: true };
      }

      const recalculated = reoptimizeProductionCalendarConstraints({
        date: command.cutoff.date,
        time: command.cutoff.time,
        dailyTeamOverrides: manualScheduleDraft.dailyTeamOverrides || {},
        manualWorkDates: manualScheduleDraft.manualWorkDates || [],
        operationResourceEdits: [command],
        productivityMatrix: matrix,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      });
      if (!recalculated.accepted) return {
        accepted: false,
        message: recalculated.blockingRegressions?.[0]?.message
          || recalculated.diagnostics?.errors?.[0]?.message
          || 'Não foi possível recalcular esta produção e as etapas seguintes.'
      };
      const transaction = applyManualScheduleTransaction({
        currentDraft: manualScheduleDraft,
        intent: {
          ...command,
          cutoffDate: command.cutoff.date,
          cutoffSnapshot: recalculated.cutoffSnapshot,
          previousDiagnostics: recalculated.previousDiagnostics,
          diagnosticDelta: recalculated.diagnosticDelta,
          candidateAllocations: recalculated.allocations,
          candidateDraft: recalculated.manualScheduleDraft
        },
        draftContext: { validatedAt: new Date().toISOString() },
        validationContext: await currentManualScheduleValidationContextWithFreshStock()
      });
      if (!transaction.accepted) return {
        accepted: false,
        message: transaction.blockingIssues?.[0]?.message || 'A configuração não pôde ser aplicada ao calendário.'
      };
      acceptRecalculatedCalendar({ recalculated, transaction });
      toast('Configuração atualizada e produções seguintes recalculadas.');
      return { accepted: true };
    }

    const previousManualState = cloneDraftPlanningState();
    const timestamp = new Date().toISOString();
    let capacityDecision = 'split';
    if (!isSplit && quantityChanged) {
      const snapshot = currentProductionCalendarSnapshot();
      const material = resolveProductivityMaterial({ reference: current, materials });
      const rows = Array.isArray(productivityRows) && productivityRows.length
        ? productivityRows
        : selectPlanningEditorProductivityRows({ material: material || current, productivityMatrix: matrix });
      const resourceOptions = getPlanningOperationResourceOptions({
        productivityRows: rows,
        machines: snapshot?.machines || [],
        material: material || current
      });
      const machine = resourceOptions.find(option => String(option.machineId) === String(machineId));
      const preview = machine ? buildPlanningOperationResourcePreview({
        allocation: { ...current, quantity: requestedQuantity },
        machine,
        peopleCount,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      }) : null;
      const previewUsage = requestedQuantity > 0 && Number(preview?.capacityPerDay) > 0
        ? (requestedQuantity / Number(preview.capacityPerDay)) * 100
        : 0;
      capacityDecision = previewUsage > 100
        ? await confirmProductionCalendarCapacityDecision({ proposedAllocation: { capacityPercent: previewUsage } })
        : 'split';
      if (capacityDecision === 'cancel') return { accepted: false, message: '' };
    }
    const transaction = applyManualScheduleTransaction({
      currentDraft: manualScheduleDraft,
      intent: isSplit ? {
        type: 'SPLIT_ALLOCATION', allocationId: current.allocationId, relativePercents, partEdits
      } : {
        type: 'EDIT_ALLOCATION', allocationId: current.allocationId, machineId, peopleCount, quantity: quantityChanged ? requestedQuantity : undefined, date, startTime
      },
      draftContext: {
        now: timestamp,
        validatedAt: timestamp,
        machines: currentProductionCalendarSnapshot().machines,
        matrixRows: Array.isArray(productivityRows) ? productivityRows : matrix,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      },
      validationContext: await currentManualScheduleValidationContextWithFreshStock(),
      decisions: { capacityDecision }
    });
    if (!transaction.accepted) return {
      accepted: false,
      message: transaction.blockingIssues?.[0]?.message || 'As alterações não passaram pela validação localizada.'
    };
    manualScheduleDraft = transaction.draft;
    draft.manualScheduleDraft = manualScheduleDraft;
    productionCalendarVisualState = { ...productionCalendarVisualState, selectedAllocationId: null };
    recordAcceptedManualState(previousManualState);
    saveDraftNow();
    refreshTimelineOnly();
    toast(isSplit ? 'Allocation dividida proporcionalmente.' : 'Allocation atualizada sem alterar as partes irmãs.');
    return { accepted: true };
  }

  function openProductionCalendarAllocationEditor(allocation, { startSplit = false } = {}) {
    const snapshot = currentProductionCalendarSnapshot();
    const current = (manualScheduleDraft?.allocations || []).find(item => String(item.allocationId) === String(allocation?.allocationId))
      || (snapshot?.allocations || []).find(item => String(item.allocationId) === String(allocation?.allocationId))
      || allocation;
    const editorAllocation = { ...allocation, ...current };
    const material = resolveProductivityMaterial({ reference: editorAllocation, materials });
    const productivityRows = selectPlanningEditorProductivityRows({
      material: material || editorAllocation,
      productivityMatrix: matrix
    });
    const machines = getPlanningOperationResourceOptions({
      productivityRows,
      machines: snapshot?.machines || [],
      material: material || editorAllocation
    });
    ProductionCalendarEditor({
      allocation: editorAllocation,
      machines,
      readOnly: !canWritePlanning,
      startSplit,
      emptyMessage: machines.length ? '' : 'Nenhuma máquina compatível foi encontrada na Matriz para este material.',
      getPreview: ({ allocation: previewAllocation = editorAllocation, quantity, machine, peopleCount, date, startTime }) => buildPlanningOperationResourcePreview({
        allocation: { ...previewAllocation, quantity: quantity ?? previewAllocation.quantity, date: date || previewAllocation.date, startTime: startTime || previewAllocation.startTime },
        machine,
        peopleCount,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      }),
      onSave: payload => handleProductionCalendarAllocationSave({ ...payload, productivityRows })
    });
  }

  function acceptRecalculatedCalendar({ recalculated, transaction }) {
    const previousManualState = cloneDraftPlanningState();
    const acceptedState = applyAcceptedPlanningReoptimization({
      currentSimulation,
      currentDraft: manualScheduleDraft,
      recalculated,
      transaction
    });
    manualScheduleDraft = acceptedState.manualScheduleDraft;
    draft.manualScheduleDraft = manualScheduleDraft;
    draft.dailyTeamOverrides = acceptedState.dailyTeamOverrides;
    draft.manualWorkDates = acceptedState.manualWorkDates;
    currentSimulation = acceptedState.currentSimulation;
    draft.currentSimulation = currentSimulation;
    recordAcceptedManualState(previousManualState);
    saveDraftNow();
    refreshTimelineOnly();
    return { accepted: true };
  }

  function productionCalendarReoptimizationErrorMessage(error) {
    if (!error) return '';
    const details = error.details || {};
    const compatibleMachines = [...new Set((details.availableConfigurations || [])
      .map(item => item.machineName || item.machineId)
      .filter(Boolean))];
    if (error.code === 'PINNED_ALLOCATION_BECAME_INFEASIBLE') {
      const machine = details.machineName || details.machineId || 'maquina fixada';
      const available = compatibleMachines.length ? ` Disponiveis na matriz: ${compatibleMachines.join(', ')}.` : '';
      return `${error.message} A operacao esta fixada em ${machine}.${available}`;
    }
    return error.message || '';
  }

  async function handleProductionCalendarTransportSave(allocation, arrivalDate, hours = null) {
    return savePlanningManualTransport({
      canWritePlanning,
      manualScheduleDraft,
      currentSimulation,
      allocation,
      arrivalDate,
      hours,
      withOperationLoading,
      reoptimizeProductionCalendarConstraints,
      applyManualScheduleTransaction,
      currentManualScheduleValidationContextWithFreshStock,
      acceptRecalculatedCalendar,
      toast,
      productionCalendarReoptimizationErrorMessage
    });
  }

  function openProductionCalendarTransportModal(allocation) {
    const snapshot = currentProductionCalendarSnapshot();
    const current = (manualScheduleDraft?.allocations || [])
      .find(item => String(item.allocationId) === String(allocation?.allocationId))
      || (snapshot?.allocations || []).find(item => String(item.allocationId) === String(allocation?.allocationId))
      || allocation;
    const transport = manualTransportForAllocation(current, manualScheduleDraft);
    const initialArrivalDate = transport?.arrivalDate || '';
    const initialHours = transport?.hours || (initialArrivalDate ? transportHoursForArrivalDate(current, initialArrivalDate) : '');
    page.querySelector('.production-transport-modal')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop production-transport-modal';
    backdrop.innerHTML = `
      <div class="modal production-transport-dialog" role="dialog" aria-modal="true" aria-labelledby="production-transport-title">
        <div class="modal-header">
          <div>
            <h3 id="production-transport-title">Transporte do material</h3>
            <p class="modal-subtitle">${escapeHtml(current.materialName || 'Material')}</p>
          </div>
          <button class="link-button close-production-transport" type="button">Cancelar</button>
        </div>
        <form class="production-transport-form">
          <div class="production-transport-fields">
            <label>Tempo estimado (horas)
              <input name="hours" type="text" inputmode="decimal" placeholder="24" value="${escapeHtml(initialHours)}" />
            </label>
            <label>Chegada estimada
              <input name="arrivalDate" type="date" min="${escapeHtml(current.date || '')}" value="${escapeHtml(initialArrivalDate)}" required />
            </label>
          </div>
          <p class="muted-text">A proxima etapa desta cadeia sera remanejada para iniciar a partir da chegada estimada.</p>
          <p class="production-transport-error" role="alert" hidden></p>
          <div class="form-actions modal-actions">
            ${transport ? '<button class="danger-button remove-production-transport" type="button">Excluir transporte</button>' : ''}
            <button class="secondary-button close-production-transport" type="button">Cancelar</button>
            <button class="primary-button" type="submit">Salvar transporte</button>
          </div>
        </form>
      </div>
    `;
    const close = () => backdrop.remove();
    const showError = message => {
      const error = backdrop.querySelector('.production-transport-error');
      error.textContent = message;
      error.hidden = !message;
    };
    backdrop.querySelectorAll('.close-production-transport').forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    const hoursInput = backdrop.querySelector('input[name="hours"]');
    const arrivalInput = backdrop.querySelector('input[name="arrivalDate"]');
    hoursInput?.addEventListener('input', () => {
      const nextDate = transportArrivalDateFromHours(current, hoursInput.value);
      if (nextDate && arrivalInput) arrivalInput.value = nextDate;
    });
    arrivalInput?.addEventListener('input', () => {
      if (hoursInput) hoursInput.value = transportHoursForArrivalDate(current, arrivalInput.value);
    });
    backdrop.querySelector('.remove-production-transport')?.addEventListener('click', async () => {
      const result = await handleProductionCalendarTransportSave(current, null);
      if (result.accepted) close();
      else showError(result.message || 'Nao foi possivel excluir o transporte.');
    });
    backdrop.querySelector('form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const arrivalDate = formData.get('arrivalDate');
      const hours = formData.get('hours');
      const result = await handleProductionCalendarTransportSave(current, arrivalDate, hours);
      if (result.accepted) close();
      else showError(result.message || 'Nao foi possivel salvar o transporte.');
    });
    page.appendChild(backdrop);
    backdrop.querySelector('input[name="hours"]')?.focus();
  }

  async function handleProductionCalendarManualWorkDate({ date, enabled } = {}) {
    if (!canWritePlanning || !manualScheduleDraft || !isValidDateOnly(date)) return { accepted: false };
    try {
      return await withOperationLoading('Recalculando calendário...', async () => {
        const manualWorkDates = new Set((manualScheduleDraft.manualWorkDates || []).map(String));
        if (enabled) manualWorkDates.add(date);
        else manualWorkDates.delete(date);
        const recalculated = reoptimizeProductionCalendarConstraints({
          date,
          dailyTeamOverrides: manualScheduleDraft.dailyTeamOverrides || {},
          manualWorkDates: [...manualWorkDates].sort()
        });
        if (!recalculated.accepted) {
          toast(recalculated.blockingRegressions?.[0]?.message || recalculated.diagnostics?.errors?.[0]?.message || 'Não foi possível reotimizar o calendário.');
          return { accepted: false };
        }
        const transaction = applyManualScheduleTransaction({
          currentDraft: manualScheduleDraft,
          intent: {
            type: 'SET_MANUAL_WORK_DATE', date, enabled,
            cutoffDate: date,
            cutoffSnapshot: recalculated.cutoffSnapshot,
            previousDiagnostics: recalculated.previousDiagnostics,
            diagnosticDelta: recalculated.diagnosticDelta,
            candidateAllocations: recalculated.allocations,
            candidateDraft: recalculated.manualScheduleDraft
          },
          draftContext: { validatedAt: new Date().toISOString() },
          validationContext: await currentManualScheduleValidationContextWithFreshStock()
        });
        if (!transaction.accepted) {
          const calendarIssue = transaction.blockingIssues?.find(issue => issue.code === 'NON_WORKING_DATE_NOT_RELEASED');
          toast(calendarIssue?.message || 'Não foi possível recalcular o calendário com esta liberação.');
          return { accepted: false };
        }
        return acceptRecalculatedCalendar({ recalculated, transaction });
      });
    } catch (error) {
      toast(`Não foi possível reorganizar a produção de ${formatDateOnly(date)} após alterar a liberação do dia.`);
      return { accepted: false };
    }
  }

  async function handleProductionCalendarDailyTeam({ date, overrides, invalid } = {}) {
    if (!canWritePlanning || !manualScheduleDraft || !isValidDateOnly(date)) return { accepted: false };
    if (invalid || !overrides || Object.values(overrides).some(value => value !== null && (!Number.isInteger(Number(value)) || Number(value) < 0))) {
      toast('Informe capacidades inteiras maiores ou iguais a zero.');
      return { accepted: false };
    }
    const nextOverrides = dailyTeamOverridesCandidate(date, overrides);
    const requestedCapacity = Object.values(nextOverrides[date] || {}).map(Number).filter(Number.isFinite).sort((left, right) => left - right)[0];
    try {
      return await withOperationLoading('Recalculando equipe do dia...', async () => {
        const recalculated = reoptimizeProductionCalendarConstraints({
          date,
          dailyTeamOverrides: nextOverrides,
          manualWorkDates: manualScheduleDraft.manualWorkDates || []
        });
        if (!recalculated.accepted) {
          toast(recalculated.blockingRegressions?.[0]?.message || recalculated.diagnostics?.errors?.[0]?.message || `Não foi possível reorganizar a produção de ${formatDateOnly(date)}.`);
          return { accepted: false };
        }
        const transaction = applyManualScheduleTransaction({
          currentDraft: manualScheduleDraft,
          intent: {
            type: 'SET_DAILY_TEAM_OVERRIDES',
            date,
            overrides,
            cutoffDate: date,
            cutoffSnapshot: recalculated.cutoffSnapshot,
            previousDiagnostics: recalculated.previousDiagnostics,
            diagnosticDelta: recalculated.diagnosticDelta,
            candidateAllocations: recalculated.allocations,
            candidateDraft: recalculated.manualScheduleDraft
          },
          draftContext: { validatedAt: new Date().toISOString() },
          validationContext: await currentManualScheduleValidationContextWithFreshStock()
        });
        if (!transaction.accepted) {
          toast(`Não foi possível reorganizar a produção de ${formatDateOnly(date)} para a equipe informada.`);
          return { accepted: false };
        }
        return acceptRecalculatedCalendar({ recalculated, transaction });
      });
    } catch (error) {
      const capacityText = Number.isFinite(requestedCapacity) ? ` de ${requestedCapacity} pessoas` : '';
      toast(`Não foi possível reorganizar a produção de ${formatDateOnly(date)} para uma equipe${capacityText} com as produtividades cadastradas.`);
      return { accepted: false };
    }
  }

  function firstProductionCalendarAllocationCursor() {
    return (manualScheduleDraft?.allocations || [])
      .map(allocation => ({
        date: String(allocation?.date || '').slice(0, 10),
        time: String(allocation?.startTime || '00:00').slice(0, 5)
      }))
      .filter(item => isValidDateOnly(item.date))
      .sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.time).localeCompare(String(right.time)))[0] || null;
  }

  function productionCalendarTimeMinutes(value = '00:00') {
    const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number);
    return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  }

  function productionCalendarOptimizationMetrics(allocations = []) {
    const sorted = (allocations || [])
      .filter(allocation => isValidDateOnly(String(allocation?.date || '').slice(0, 10)))
      .sort((left, right) => (
        String(left.endDate || left.date || '').localeCompare(String(right.endDate || right.date || ''))
        || productionCalendarTimeMinutes(left.endTime || left.startTime) - productionCalendarTimeMinutes(right.endTime || right.startTime)
      ));
    const last = sorted.at(-1) || null;
    return {
      endDate: String(last?.endDate || last?.date || ''),
      endMinutes: productionCalendarTimeMinutes(last?.endTime || last?.startTime || '00:00'),
      averageCapacity: sorted.length
        ? sorted.reduce((sum, item) => sum + Number(item.capacityPercent || 0), 0) / sorted.length
        : 0,
      averagePeople: sorted.length
        ? sorted.reduce((sum, item) => sum + Number(item.peopleCount || 0), 0) / sorted.length
        : 0,
      allocationCount: sorted.length
    };
  }

  function compareProductionCalendarOptimization(left, right) {
    return String(left.metrics.endDate || '').localeCompare(String(right.metrics.endDate || ''))
      || Number(left.metrics.endMinutes || 0) - Number(right.metrics.endMinutes || 0)
      || Number(right.metrics.averagePeople || 0) - Number(left.metrics.averagePeople || 0)
      || Number(right.metrics.averageCapacity || 0) - Number(left.metrics.averageCapacity || 0)
      || Number(left.metrics.allocationCount || 0) - Number(right.metrics.allocationCount || 0);
  }

  function planningMaterialKeys(source = {}) {
    return [
      source.id,
      source.materialId,
      source.material_id,
      source.name,
      source.materialName,
      source.material_name,
      source.code,
      source.materialCode,
      source.material_code,
      ...(Array.isArray(source.codes) ? source.codes : []),
      ...(Array.isArray(source.materialCodes) ? source.materialCodes : [])
    ].map(value => String(value || '').trim().toLocaleLowerCase('pt-BR')).filter(Boolean);
  }

  function planningProductivityMatchesMaterial(row = {}, material = {}, stockRow = {}) {
    const materialKeys = new Set([...planningMaterialKeys(material), ...planningMaterialKeys(stockRow), ...planningMaterialKeys(stockRow.material)]);
    return planningMaterialKeys(row).some(key => materialKeys.has(key));
  }

  function bestPlanningPcpProductivity(stockRow = {}) {
    const material = findMaterialById(materials, stockRow.material?.id || stockRow.materialId);
    return (matrix || [])
      .filter(row => row.active !== false && planningProductivityMatchesMaterial(row, material || {}, stockRow))
      .sort((left, right) => Number(right.output_qty ?? right.outputQty ?? 0) - Number(left.output_qty ?? left.outputQty ?? 0))[0] || null;
  }

  function planningPcpDurationDays(row = {}) {
    const salesPerDay = Number(row.salesPerDayQty);
    const qty = Number(row.totalLocationsQty);
    if (!Number.isFinite(salesPerDay) || salesPerDay <= 0) return null;
    return Number.isFinite(qty) ? qty / salesPerDay : null;
  }

  function pcpDraftProductionFromStockRow(row = {}, index = 0) {
    const material = findMaterialById(materials, row.material?.id || row.materialId);
    const productivity = row.productivity || bestPlanningPcpProductivity(row) || {};
    const targetQty = Math.ceil(Number(row.targetQty || 0));
    return {
      id: `pcp-auto-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      materialId: String(material?.id || row.material?.id || ''),
      materialSearch: material?.name || row.material?.name || '',
      productionModelName: '',
      plannedQty: targetQty > 0 ? targetQty : '',
      machineName: productivity.machine_name || productivity.machineName || '',
      peopleCount: productivity.people_count !== null && productivity.people_count !== undefined
        ? String(productivity.people_count)
        : String(productivity.peopleCount ?? ''),
      desiredDate: '',
      transports: [],
      source: 'Simular aproveitamento PCP',
      sourceKey: row.key || String(material?.id || row.material?.id || ''),
      sourceObservation: 'Incluído automaticamente para aproveitar capacidade ociosa.'
    };
  }

  async function loadPlanningPcpAutoCandidates(limit = 4) {
    const minimumDays = readStockMinimumDays();
    const idealDays = minimumDays ? readPcpIdealDays(minimumDays) : null;
    if (!minimumDays || !idealDays) return [];
    const [overview, plannedBalance] = await Promise.all([
      api('/stock/materials-overview'),
      api('/planning/analysis/planned-balance').catch(() => ({ rows: [] }))
    ]);
    const plannedByMaterial = new Map((plannedBalance.rows || []).map(row => [String(row.material_id ?? row.materialId ?? ''), row]));
    const existingMaterialIds = new Set((draft.productions || []).map(production => String(production.materialId || '')));
    return (overview.rows || [])
      .filter(row => row.salesBlocked !== true && row.material?.permitsSales !== false)
      .map(row => {
        const materialId = String(row.material?.id || '');
        const durationDays = planningPcpDurationDays(row);
        const salesPerDay = Number(row.salesPerDayQty);
        const plannedRemainingQty = Number(plannedByMaterial.get(materialId)?.remaining_qty ?? plannedByMaterial.get(materialId)?.remainingQty ?? 0);
        const targetQty = Number.isFinite(durationDays) && Number.isFinite(salesPerDay) && salesPerDay > 0
          ? Math.max((idealDays - durationDays) * salesPerDay - Math.max(plannedRemainingQty, 0), 0)
          : 0;
        const productivity = bestPlanningPcpProductivity(row);
        return {
          ...row,
          key: materialId || row.material?.name || '',
          durationDays,
          targetQty,
          productivity,
          pcpPriorityScore: (
            (durationDays !== null && durationDays <= minimumDays * 0.5 ? 100000 : 0)
            + (durationDays !== null && durationDays <= minimumDays * 1.2 ? 50000 : 0)
            + Math.max(idealDays - (durationDays ?? idealDays), 0) * 100
            + Number(row.salesPerDayQty || 0)
          )
        };
      })
      .filter(row => !existingMaterialIds.has(String(row.material?.id || '')))
      .filter(row => Number(row.targetQty) > 0 && row.productivity)
      .sort((left, right) => Number(right.pcpPriorityScore || 0) - Number(left.pcpPriorityScore || 0))
      .slice(0, limit)
      .map(pcpDraftProductionFromStockRow);
  }

  async function simulatePlanningWithProductions(productions) {
    const previousProductions = JSON.parse(JSON.stringify(draft.productions || []));
    const previousManualDraft = manualScheduleDraft ? JSON.parse(JSON.stringify(manualScheduleDraft)) : null;
    try {
      draft.productions = productions;
      manualScheduleDraft = null;
      const body = payload();
      const result = applySkippedProductionCascade(await simulatePlanningRequest(body, { timeoutMs: 120000 }));
      return { result, body };
    } finally {
      draft.productions = previousProductions;
      manualScheduleDraft = previousManualDraft;
    }
  }

  async function handleProductionCalendarUtilizationOptimization() {
    if (!canWritePlanning || !manualScheduleDraft) return { accepted: false };
    const firstCursor = firstProductionCalendarAllocationCursor();
    if (!firstCursor) {
      toast('Não há produção simulada para otimizar.');
      return { accepted: false };
    }
    try {
      return await withOperationLoading('Simulando melhor aproveitamento...', async () => {
        const baseRequest = {
          date: firstCursor.date,
          time: firstCursor.time || '00:00',
          dailyTeamOverrides: manualScheduleDraft.dailyTeamOverrides || {},
          manualWorkDates: manualScheduleDraft.manualWorkDates || [],
          dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
        };
        const attempts = [
          { label: 'agenda atual', recalculated: null, metrics: productionCalendarOptimizationMetrics(manualScheduleDraft.allocations || []) },
          { label: 'menor término', recalculated: reoptimizeProductionCalendarConstraints({ ...baseRequest, policies: { mode: 'fastest' } }) },
          { label: 'aproveitamento', recalculated: reoptimizeProductionCalendarConstraints({ ...baseRequest, policies: { mode: 'utilization' } }) },
          { label: 'reotimização padrão', recalculated: reoptimizeProductionCalendarConstraints(baseRequest) }
        ].map(attempt => attempt.recalculated
          ? { ...attempt, metrics: productionCalendarOptimizationMetrics(attempt.recalculated.allocations || []) }
          : attempt);
        const acceptedAttempts = attempts.filter(attempt => !attempt.recalculated || attempt.recalculated.accepted);
        const best = acceptedAttempts.sort(compareProductionCalendarOptimization)[0] || null;
        const pcpCandidates = await loadPlanningPcpAutoCandidates(4);
        const baseProductions = JSON.parse(JSON.stringify(draft.productions || []));
        const expandedAttempts = [];
        for (let count = 1; count <= pcpCandidates.length; count += 1) {
          try {
            const productions = [...baseProductions, ...pcpCandidates.slice(0, count)];
            const simulated = await simulatePlanningWithProductions(productions);
            const snapshot = adaptPlanningResultToProductionCalendar({
              planningId: productionCalendarPlanningId(simulated.result),
              calendarOperations: Array.isArray(simulated.result?.calendarOperations) ? simulated.result.calendarOperations : [],
              operations: Array.isArray(simulated.result?.operations) ? simulated.result.operations : [],
              tree: simulated.result?.tree || simulated.result?.scheduleTree || simulated.result?.schedule_tree || null,
              days: Array.isArray(simulated.result?.days) ? simulated.result.days : [],
              machines: productionCalendarMachines(simulated.result),
              status: simulated.result?.summary?.status || simulated.result?.status
            });
            expandedAttempts.push({
              pcpCount: count,
              productions,
              body: simulated.body,
              result: simulated.result,
              metrics: productionCalendarOptimizationMetrics(snapshot.allocations || [])
            });
          } catch (error) {
            console.warn('Candidato PCP descartado na simulação por aproveitamento.', error);
          }
        }
        const currentMetrics = productionCalendarOptimizationMetrics(manualScheduleDraft.allocations || []);
        const expandedBest = expandedAttempts
          .filter(attempt => (
            Number(attempt.metrics.averagePeople || 0) > Number(currentMetrics.averagePeople || 0) + 0.01
            || Number(attempt.metrics.averageCapacity || 0) > Number(currentMetrics.averageCapacity || 0) + 0.5
          ))
          .sort((left, right) => (
            Number(right.pcpCount || 0) - Number(left.pcpCount || 0)
            || Number(right.metrics.averagePeople || 0) - Number(left.metrics.averagePeople || 0)
            || Number(right.metrics.averageCapacity || 0) - Number(left.metrics.averageCapacity || 0)
          ))[0] || null;
        if (expandedBest) {
          const currentForm = target.querySelector('.planning-form');
          draft.productions = expandedBest.productions;
          lastPayload = expandedBest.body;
          draft.lastPayload = lastPayload;
          manualScheduleDraft = null;
          draft.manualScheduleDraft = null;
          renderSimulation(expandedBest.result, currentForm || { elements: {} }, { captureAutomaticBaseline: true });
          toast(`Simulação expandida aplicada com ${expandedBest.pcpCount} material(is) do Assistente PCP.`);
          return { accepted: true };
        }
        if (!best?.recalculated) {
          toast(pcpCandidates.length
            ? 'A agenda atual é a melhor para terminar cedo e nenhum candidato PCP melhorou o aproveitamento com validação.'
            : 'A agenda atual já é a melhor entre os cenários testados, e não encontrei candidatos PCP prontos para incluir.');
          return { accepted: false };
        }
        const recalculated = best.recalculated;
        if (!recalculated.accepted) {
          toast(recalculated.blockingRegressions?.[0]?.message || recalculated.diagnostics?.errors?.[0]?.message || 'Não foi possível otimizar o aproveitamento.');
          return { accepted: false };
        }
        const transaction = applyManualScheduleTransaction({
          currentDraft: manualScheduleDraft,
          intent: {
            type: 'SET_DAILY_TEAM_OVERRIDES',
            date: firstCursor.date,
            overrides: manualScheduleDraft.dailyTeamOverrides?.[firstCursor.date] || {},
            cutoffDate: firstCursor.date,
            cutoffSnapshot: recalculated.cutoffSnapshot,
            previousDiagnostics: recalculated.previousDiagnostics,
            diagnosticDelta: recalculated.diagnosticDelta,
            candidateAllocations: recalculated.allocations,
            candidateDraft: recalculated.manualScheduleDraft
          },
          draftContext: { validatedAt: new Date().toISOString() },
          validationContext: await currentManualScheduleValidationContextWithFreshStock()
        });
        if (!transaction.accepted) {
          toast(transaction.blockingIssues?.[0]?.message || 'A otimização não pôde ser aplicada ao calendário.');
          return { accepted: false };
        }
        acceptRecalculatedCalendar({ recalculated, transaction });
        toast(`Simulação aplicada pelo critério: ${best.label}.`);
        return { accepted: true };
      });
    } catch (error) {
      toast(error?.message || 'Não foi possível simular com base no aproveitamento.');
      return { accepted: false };
    }
  }

  function daysWithDraftAllocations(days = [], allocations = []) {
    return mergeDraftAllocationDays(days, allocations, { isValidDateOnly, formatDateOnly });
  }

  function buildProductionCalendarSnapshot(result, options = {}) {
    const adapted = adaptPlanningResultToProductionCalendar({
      planningId: productionCalendarPlanningId(result),
      calendarOperations: Array.isArray(result?.calendarOperations) ? result.calendarOperations : [],
      operations: Array.isArray(result?.operations) ? result.operations : [],
      tree: result?.tree || result?.scheduleTree || result?.schedule_tree || null,
      days: Array.isArray(result?.days) ? result.days : [],
      machines: productionCalendarMachines(result),
      status: result?.summary?.status || result?.status
    });
    const activeManualDraft = !options.ignoreManualDraft && manualScheduleDraft
      ? manualScheduleDraft
      : null;
    const allocations = activeManualDraft ? activeManualDraft.allocations : adapted.allocations;
    const baseDays = daysWithDraftAllocations(adapted.days, allocations);
    const validationSnapshot = buildProductionCalendarValidationSnapshot(activeManualDraft?.validation, allocations, baseDays);
    const summary = result?.summary || {};
    const shifts = Array.isArray(summary.shifts) && summary.shifts.length ? summary.shifts : draft.shifts;
    const manualWorkDates = activeManualDraft?.manualWorkDates ?? summary.manualWorkDates ?? result?.manualWorkDates ?? [];
    const dailyTeamOverrides = activeManualDraft?.dailyTeamOverrides ?? draft.dailyTeamOverrides ?? summary.dailyTeamOverrides ?? {};
    const resourceByDate = resolveManualScheduleResourceByDate({
      validation: activeManualDraft?.validation,
      allocations,
      shifts,
      dailyTeamOverrides,
      manualWorkDates,
      holidays: result?.holidays
    });
    const productionLimitDate = (validationSnapshot?.allocations || allocations)
      .map(allocation => String(allocation?.date || ''))
      .filter(isValidDateOnly)
      .sort()
      .at(-1) || null;
    const requestedVisibleEndDate = isValidDateOnly(productionCalendarVisualState.visibleEndDate)
      ? productionCalendarVisualState.visibleEndDate
      : null;
    const visibleEndDate = requestedVisibleEndDate && requestedVisibleEndDate >= String(productionLimitDate || '')
      ? requestedVisibleEndDate
      : productionLimitDate;
    const configuredHolidayDates = new Set((Array.isArray(result?.holidays) ? result.holidays : [])
      .map(holiday => String(holiday?.date ?? holiday ?? '').slice(0, 10))
      .filter(isValidDateOnly));
    const calendarDays = extendProductionCalendarDayRange(
      fillProductionCalendarDayRange(validationSnapshot?.days || baseDays),
      visibleEndDate
    ).map(day => configuredHolidayDates.has(day.date)
      ? { ...day, isWorkingDay: false, holiday: day.holiday || { date: day.date } }
      : day);
    const snapshotAllocations = withManualTransportPresentation(validationSnapshot?.allocations || allocations, manualScheduleDraft);
    const presentedDays = calendarDays.map(day => ({
      ...day,
      ...buildProductionCalendarDayPresentation({
        day,
        resource: resourceByDate[day.date] || {},
        shifts,
        manualWorkDates,
        dailyTeamOverrides,
        extraordinaryCapacity: Boolean(day.extraordinaryCapacity)
      })
    })).map(day => ({
      ...day,
      productivity: buildProductionCalendarDayProductivity({ day, allocations: snapshotAllocations }),
      stockAlert: buildPlanningStockCalendarAlert(currentPlanningStockProjection, day.date, materials, planningStockProjectionThresholdOptions())
    }));
    const snapshot = {
      days: presentedDays,
      machines: adapted.machines,
      allocations: snapshotAllocations,
      validation: validationSnapshot?.validation || null,
      permissions: { readOnly: true, canEditDaySettings: canWritePlanning, canEditAllocations: canWritePlanning },
      errors: adapted.errors,
      warnings: [],
      visualState: {
        ...productionCalendarVisualState,
        hasManualChanges: canWritePlanning && hasManualChangesAgainstAutomaticBaseline({
          baseline: currentAutomaticBaseline,
          manualScheduleDraft,
          planningDraft: draft
        }),
        canUndoManualChange: canWritePlanning && manualScheduleHistory.canUndo(),
        canRedoManualChange: canWritePlanning && manualScheduleHistory.canRedo(),
        stockAlerts: Boolean(options.stockAlerts)
      }
    };
    logProductionCalendarAdapterErrors(adapted.errors);
    return snapshot;
  }

  function closeProductionCalendarExclusiveView({ restoreCalendar = true } = {}) {
    productionCalendarExclusiveView?.close({ restoreCalendar });
  }

  function openProductionCalendarExclusiveView(calendar) {
    if (!calendar || productionCalendarExclusiveView) return;
    productionCalendarExclusiveView = createProductionCalendarExclusivePage(calendar, {
      onClose: () => { productionCalendarExclusiveView = null; }
    });
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
      onOpenDay: day => openPlanningStockProjectionModal(day?.date),
      onOpenFullscreen: openProductionCalendarExclusiveView,
      onHorizonChange: () => refreshTimelineOnly(),
      onDiscardAllChanges: discardAllProductionCalendarChanges,
      onOptimizeUtilization: snapshot?.permissions?.canEditAllocations ? handleProductionCalendarUtilizationOptimization : undefined,
      onUndoManualChange: undoLastProductionCalendarChange,
      onRedoManualChange: redoProductionCalendarChange,
      onEditAllocation: allocation => openProductionCalendarAllocationEditor(allocation),
      onTransportAllocation: allocation => openProductionCalendarTransportModal(allocation),
      onSplitAllocation: allocation => openProductionCalendarAllocationEditor(allocation, { startSplit: true }),
      onToggleManualWorkDate: snapshot?.permissions?.canEditDaySettings ? handleProductionCalendarManualWorkDate : undefined,
      onSaveDailyTeam: snapshot?.permissions?.canEditDaySettings ? handleProductionCalendarDailyTeam : undefined,
      onVisualStateChange: nextVisualState => {
        productionCalendarVisualState = {
          ...productionCalendarVisualState,
          ...(nextVisualState || {})
        };
      }
    });
    targetElement.appendChild(calendar);
    renderProductionCalendarWarning(calendar, Array.isArray(snapshot?.errors) ? snapshot.errors.length : 0);
    const presentation = snapshot?.validation?.presentation;
    if (presentation?.issues?.length) {
      const details = document.createElement('details');
      details.className = 'production-calendar-validation-details';
      const group = (label, items) => items.length
        ? `<li><strong>${escapeHtml(label)}</strong><ul>${items.map(item => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.message)}</li>`).join('')}</ul></li>`
        : '';
      details.innerHTML = `
        <summary>Diagnósticos do calendário (${presentation.issues.length})</summary>
        <ul>
          ${group('Erros', presentation.errors || [])}
          ${group('Avisos', presentation.warnings || [])}
        </ul>
      `;
      calendar.appendChild(details);
    }
    return calendar;
  }

  function renderProductionCalendar(targetElement, result, options = {}) {
    const reopenExclusiveView = Boolean(productionCalendarExclusiveView);
    if (reopenExclusiveView) closeProductionCalendarExclusiveView({ restoreCalendar: false });
    if (!USE_PRODUCTION_CALENDAR_V2) {
      planningScheduleRendererHost?.destroy();
      planningScheduleRendererHost = null;
      targetElement.innerHTML = '';
      targetElement.appendChild(CalendarTimeline(result.days, timelineOperations(result), {
        mode: 'planning',
        ...(result.summary || {}),
        stockAlerts: options.stockAlerts || currentPlanningStockAlerts
      }));
      return;
    }

    const snapshot = buildProductionCalendarSnapshot(result, options);
    const model = buildPlanningScheduleViewModel(snapshot);
    if (!planningScheduleRendererHost || planningScheduleRendererHost.container !== targetElement) {
      planningScheduleRendererHost?.destroy();
      planningScheduleRendererHost = createPlanningScheduleRendererHost({
        factories: {
          'production-calendar-v2': () => createProductionCalendarV2Renderer({
            renderSnapshot: renderProductionCalendarSnapshot
          }),
          'gantt-aps': () => createGanttApsRenderer({
            onRequestMove: handleProductionCalendarMoveRequest
          })
        },
        onLifecycleError: ({ error, rendererId, phase }) => {
          console.warn(`Falha no renderer ${rendererId} durante ${phase}; aplicando rollback para o Calendário V2.`, error);
        }
      });
      planningScheduleRendererHost.mount(targetElement, model, {
        renderer: globalThis.PLANNING_SCHEDULE_RENDERER || 'auto'
      });
    } else {
      planningScheduleRendererHost.update(model);
    }
    const calendar = planningScheduleRendererHost.getRootElement();
    if (reopenExclusiveView) openProductionCalendarExclusiveView(calendar);
  }

  function planningStockStatusLabel(status) {
    return ({ NEGATIVE: 'Negativo', CRITICAL: 'Crítico', WARNING: 'Atenção', OK: 'OK', NO_DEMAND: 'Sem demanda' })[status] || status;
  }

  function openPlanningStockProjectionModal(selectedDate) {
    const day = buildPlanningStockModalModel(currentPlanningStockProjection, selectedDate, materials, planningStockProjectionThresholdOptions());
    if (!day) {
      toast(new Error('A projeção de estoque desta data não está disponível.'));
      return;
    }
    page.querySelector('.planning-stock-projection-modal')?.remove();
    const salesRows = day.salesMaterials || [];
    const productionRows = day.productionMaterials || [];
    const salesColumns = [
      { label: 'Material', sortValue: item => item.materialName, render: item => escapeHtml(item.materialName) },
      { label: 'Unidade', key: 'unit', render: item => escapeHtml(item.unit) },
      { label: 'Estoque hoje', sortValue: item => item.currentStock, render: item => formatPtBrDecimal(item.currentStock) },
      { label: 'Entradas por produção', sortValue: item => item.productionIn, render: item => formatPtBrDecimal(item.productionIn) },
      { label: 'Vendas/dia', sortValue: item => item.demandOut, render: item => formatPtBrDecimal(item.demandOut) },
      { label: 'Estoque final estimado', sortValue: item => item.closingStock, render: item => `<strong>${formatPtBrDecimal(item.closingStock)}</strong>` },
      { label: 'Cobertura', sortValue: item => item.coverageDays, render: item => item.coverageDays === null ? '—' : `${formatPtBrDecimal(item.coverageDays)} dias` },
      { label: 'Situação', sortValue: item => item.pcpStatus?.key || item.status, render: item => `<span class="pcp-status-pill ${escapeHtml(item.pcpStatus?.className || 'planned')}">${escapeHtml(item.pcpStatus?.label || planningStockStatusLabel(item.status))}</span>` }
    ];
    const productionColumns = [
      { label: 'Material', sortValue: item => item.materialName, render: item => escapeHtml(item.materialName) },
      { label: 'Unidade', key: 'unit', render: item => escapeHtml(item.unit) },
      { label: 'Estoque hoje', sortValue: item => item.currentStock, render: item => formatPtBrDecimal(item.currentStock) },
      { label: 'Consumo produtivo', sortValue: item => item.cumulativeProductionConsumption, render: item => formatPtBrDecimal(item.cumulativeProductionConsumption) },
      { label: 'Estoque final estimado', sortValue: item => item.closingStock, render: item => `<strong>${formatPtBrDecimal(item.closingStock)}</strong>` }
    ];
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop planning-stock-projection-modal';
    backdrop.dataset.selectedDate = String(selectedDate || '');
    backdrop.tabIndex = -1;
    backdrop.innerHTML = `
      <div class="modal wide-modal planning-stock-projection-dialog" role="dialog" aria-modal="true" aria-labelledby="planning-stock-projection-title">
        <div class="modal-header planning-stock-modal-header">
          <h2 id="planning-stock-projection-title">Estoque projetado — ${escapeHtml(formatDateOnly(day.date))}</h2>
          <button class="link-button close-planning-stock-modal" type="button" aria-label="Fechar estoque projetado">×</button>
        </div>
        <div class="planning-stock-modal-body">
          <div class="planning-stock-summary">
            <article><span>Materiais</span><strong>${day.salesSummary.materialCount}</strong></article>
            <article><span>Críticos</span><strong>${day.salesSummary.criticalCount}</strong></article>
            <article><span>Alerta produção</span><strong>${day.salesSummary.productionAlertCount}</strong></article>
            <article><span>Abaixo da meta</span><strong>${day.salesSummary.belowTargetCount}</strong></article>
          </div>
          <div class="planning-stock-groups">
            <section class="planning-stock-group planning-stock-sales-group">
              <h3>Estoque de venda</h3>
              <div class="planning-stock-sales-table-target"></div>
            </section>
            <section class="planning-stock-group planning-stock-production-group">
              <h3>Estoque de produção</h3>
              <div class="planning-stock-production-table-target"></div>
            </section>
          </div>
          <details class="planning-stock-alerts" ${day.salesAlerts.length ? 'open' : ''}><summary>Alertas do estoque de venda (${day.salesAlerts.length})</summary>
            ${day.salesAlerts.length ? `<ul>${day.salesAlerts.map(item => `<li class="severity-${escapeHtml(item.severity)}"><strong>${escapeHtml(item.code)}</strong>${item.time ? ` · ${escapeHtml(item.time)}` : ''} · ${escapeHtml(item.message)}</li>`).join('')}</ul>` : '<p class="muted-text">Sem alertas.</p>'}
          </details>
        </div>
        <div class="form-actions planning-stock-modal-actions"><button class="secondary-button close-planning-stock-modal" type="button">Fechar</button></div>
      </div>`;
    const salesTable = DataTable({ columns: salesColumns, rows: salesRows, emptyText: 'Nenhum material de venda disponível para esta data.' });
    salesTable.classList.add('planning-stock-modal-table-scroll');
    salesTable.querySelector('table')?.classList.add('planning-stock-table', 'planning-stock-sales-table');
    backdrop.querySelector('.planning-stock-sales-table-target')?.appendChild(salesTable);
    const productionTable = DataTable({ columns: productionColumns, rows: productionRows, emptyText: 'Nenhum material de produção disponível para esta data.' });
    productionTable.classList.add('planning-stock-modal-table-scroll');
    productionTable.querySelector('table')?.classList.add('planning-stock-table', 'planning-stock-production-table');
    backdrop.querySelector('.planning-stock-production-table-target')?.appendChild(productionTable);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('.close-planning-stock-modal').forEach(button => button.addEventListener('click', close));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    page.appendChild(backdrop);
    backdrop.querySelector('.close-planning-stock-modal')?.focus();
  }

  function refreshPlanningStockProjection() {
    if (!currentSimulation) return;
    const snapshot = currentProductionCalendarSnapshot();
    const validationContext = currentManualScheduleValidationContext(snapshot);
    currentPlanningStockProjection = buildPlanningStockProjection({
      currentSimulation,
      snapshot,
      validationStock: validationContext.stock || [],
      materials,
      manualScheduleDraft,
      warningCoverageDays: readStockMinimumDays()
    });
    const openStockModal = page.querySelector('.planning-stock-projection-modal');
    if (openStockModal?.dataset.selectedDate) openPlanningStockProjectionModal(openStockModal.dataset.selectedDate);
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

  function renderSimulation(result, form, { restoreManualDraft = false, captureAutomaticBaseline = false } = {}) {
    const coloredResult = withProductionColors(result);
    currentSimulation = coloredResult;
    const automaticSnapshot = buildProductionCalendarSnapshot(coloredResult, { ignoreManualDraft: true });
    if (captureAutomaticBaseline) {
      currentAutomaticBaseline = createAutomaticSimulationBaseline({
        simulation: result,
        allocations: automaticSnapshot.allocations
      });
      draft.automaticBaseline = cloneAutomaticBaselineValue(currentAutomaticBaseline);
    }
    const restoredDraft = restoreManualDraft && manualScheduleDraft?.allocations?.length
      ? JSON.parse(JSON.stringify(manualScheduleDraft))
      : null;
    const candidateDraft = restoredDraft || createManualScheduleDraft({
        planningId: productionCalendarPlanningId(coloredResult),
        baseSimulationId: coloredResult?.code || lastPayload?.planningCode || Date.now(),
        allocations: automaticSnapshot.allocations,
        machines: automaticSnapshot.machines,
        manualWorkDates: coloredResult?.summary?.manualWorkDates || coloredResult?.manualWorkDates || lastPayload?.manualWorkDates || [],
        dailyTeamOverrides: draft.dailyTeamOverrides || coloredResult?.summary?.dailyTeamOverrides || {}
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
    draft.automaticBaseline = currentAutomaticBaseline
      ? cloneAutomaticBaselineValue(currentAutomaticBaseline)
      : null;
    draft.dailyTeamOverrides = JSON.parse(JSON.stringify(manualScheduleDraft?.dailyTeamOverrides || draft.dailyTeamOverrides || {}));
    draft.manualWorkDates = [...(manualScheduleDraft?.manualWorkDates || draft.manualWorkDates || [])];
    if (captureAutomaticBaseline || !manualScheduleHistory.getHistory().present) {
      manualScheduleHistory.resetFromCurrent();
    }
    saveDraftNow();
    hasPendingSimulationChanges = false;
    const resultsTarget = target.querySelector('.planning-results');
    const timelineTarget = target.querySelector('.timeline-target');
    const flowsTarget = target.querySelector('.production-flows-target');
    const notice = target.querySelector('.unsimulated-notice');
    const oldSummaryPanel = target.querySelector('.final-summary-panel');
    if (oldSummaryPanel) oldSummaryPanel.hidden = true;
    currentPlanningStockAlerts = new Map();
    refreshPlanningStockProjection();
    renderProductionCalendar(timelineTarget, coloredResult, { stockAlerts: currentPlanningStockAlerts });
    schedulePlanningStockAlerts(coloredResult);
    renderProductionFlowDom(flowsTarget, renderProductionFlows(coloredResult), {
      root: page,
      requestAnimationFrame,
      productionTheme
    });
    if (notice) notice.hidden = true;
    target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', true);
    target.querySelector('.planning-flow-shell')?.toggleAttribute('hidden', false);
    resultsTarget.hidden = false;
    const saveButton = target.querySelector('[name="save"]');
    if (saveButton) saveButton.disabled = !canWritePlanning;
  }

  function refreshTimelineOnly() {
    if (!currentSimulation) return;
    const timelineTarget = target.querySelector('.timeline-target');
    if (!timelineTarget) return;
    currentSimulation.summary = {
      ...(currentSimulation.summary || {}),
      dailyTeamOverrides: draft.dailyTeamOverrides || {},
      manualWorkDates: manualScheduleDraft?.manualWorkDates || draft.manualWorkDates || []
    };
    draft.manualScheduleDraft = manualScheduleDraft;
    refreshPlanningStockProjection();
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
    const transports = manualTransportConstraints(manualScheduleDraft).length;
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
        let body = {
          ...(lastPayload || {}),
          manualScheduleDraft,
          manualScheduleValidation: manualScheduleDraft?.validation || null,
          setupMinutes: Number(draft.setupHours || 0) * 60,
          minimumStartRatio: 1,
          dependencyCompletionBufferMinutes: Number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60),
          shifts: draft.shifts || [],
          settings: {
            manualWorkDates: manualScheduleDraft?.manualWorkDates || [],
            dailyTeamOverrides: manualScheduleDraft?.dailyTeamOverrides || {},
            setupMinutes: Number(draft.setupHours || 0) * 60,
            minimumStartRatio: 1,
            dependencyCompletionBufferMinutes: Number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60)
          }
        };
        if (stockShortages.length) {
          const authorization = await requestStockAuthorization(stockShortages);
          if (!authorization) {
            button.disabled = false;
            return;
          }
          body = { ...body, stockAuthorization: authorization };
        }
        const saved = draft.savedPlanningId
          ? await api(`/planning/plans/${draft.savedPlanningId}/manual-schedule`, {
              method: 'PUT',
              body: {
                manualScheduleDraft,
                manualScheduleValidation: manualScheduleDraft?.validation || null,
                expectedRevision: Number(draft.savedPlanningRevision || 0),
                shifts: draft.shifts || [],
                settings: {
                  manualWorkDates: manualScheduleDraft?.manualWorkDates || currentSimulation?.manualWorkDates || [],
                  dailyTeamOverrides: manualScheduleDraft?.dailyTeamOverrides || draft.dailyTeamOverrides || {},
                  setupMinutes: Number(draft.setupHours || 0) * 60,
                  minimumStartRatio: 1,
                  dependencyCompletionBufferMinutes: Number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60)
                }
              }
            })
          : await api('/planning/plans', { method: 'POST', body });
        localStorage.removeItem(DRAFT_KEY);
        draft = defaultDraft();
        lastPayload = null;
    currentSimulation = null;
    currentAutomaticBaseline = null;
    manualScheduleDraft = null;
        manualScheduleHistory.reset();
        backdrop.remove();
        window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Calendário manual do planejamento ${saved.plan.code || saved.plan.id} salvo.` }));
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
    scheduleProductionFlowConnectors(page, { requestAnimationFrame, productionTheme });
    setTimeout(() => drawProductionFlowConnectors(page, { productionTheme }), 80);
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
    scheduleProductionFlowConnectors(page, { requestAnimationFrame, productionTheme });
    setTimeout(() => drawProductionFlowConnectors(page, { productionTheme }), 80);
  }

  async function reopenSavedPlan(detail) {
    const plan = detail.plan || {};
    const persisted = normalizePersistedManualScheduleDraft(detail.manualScheduleDraft ?? plan.manual_schedule_draft);
    if (persisted.status === 'incompatible' || persisted.status === 'invalid') throw new Error(persisted.diagnostics[0]);
    localStorage.removeItem(DRAFT_KEY);
    draft = normalizeDraft({
      planningStartDate: detail.summary?.planningStartDate || plan.start_date,
      shifts: detail.summary?.shifts || [defaultShift(0)],
      dailyTeamOverrides: persisted.draft?.dailyTeamOverrides || detail.summary?.dailyTeamOverrides || {},
      manualWorkDates: persisted.draft?.manualWorkDates || detail.summary?.manualWorkDates || [],
      setupHours: Number(detail.summary?.setupHours || 0),
      savedPlanningId: String(plan.id),
      savedPlanningRevision: Number(plan.manual_schedule_revision || 0),
      planningCode: plan.code || String(plan.id)
    });
    lastPayload = {
      planningCode: plan.code || String(plan.id),
      planningStartDate: detail.summary?.planningStartDate || plan.start_date,
      planningEndDate: detail.summary?.planningEndDate || plan.end_date,
      manualWorkDates: persisted.draft?.manualWorkDates || detail.summary?.manualWorkDates || []
    };
    currentSimulation = {
      id: plan.id,
      planningId: plan.id,
      code: plan.code,
      tree: detail.tree || plan.schedule_tree,
      operations: detail.operations || plan.operations || [],
      calendarOperations: detail.automaticCalendarOperations || [],
      days: detail.automaticDays || [],
      stockContext: detail.stockContext || null,
      demandContext: detail.demandContext || null,
      summary: {
        ...(detail.summary || {}),
        planningId: plan.id,
        planningStartDate: detail.summary?.planningStartDate || plan.start_date,
        planningEndDate: detail.summary?.planningEndDate || plan.end_date,
        status: plan.status
      }
    };
    const automaticSnapshot = buildProductionCalendarSnapshot(currentSimulation, { ignoreManualDraft: true });
    currentAutomaticBaseline = createAutomaticSimulationBaseline({
      simulation: currentSimulation,
      allocations: automaticSnapshot.allocations
    });
    manualScheduleDraft = persisted.draft;
    draft.lastPayload = lastPayload;
    draft.currentSimulation = currentSimulation;
    draft.manualScheduleDraft = manualScheduleDraft;
    draft.automaticBaseline = cloneAutomaticBaselineValue(currentAutomaticBaseline);
    manualScheduleHistory.resetFromCurrent();
    saveDraftNow();
    activeTab = 'simulation';
    sessionStorage.setItem('planejamento_planning_tab', activeTab);
    await render();
    const blocking = manualScheduleDraft?.validation?.errors?.filter(issue => issue.blocking !== false) || [];
    if (blocking.length) {
      markPlanningInconsistent();
      const presentation = presentManualScheduleValidation(manualScheduleDraft.validation, {
        allocations: manualScheduleDraft.allocations,
        materials,
        machines: currentProductionCalendarSnapshot()?.machines || [],
        operations: currentSimulation?.operations || [],
        locations
      });
      toast(new Error(presentation.primaryIssue?.message || 'O calendário salvo foi aberto com inconsistências.'));
    }
  }

  async function renderSimulationTab() {
    await loadLookups();
    target.innerHTML = `
      <div class="planning-builder-panel">
        <form class="planning-form">
          <div class="planning-builder-layout">
            <article class="planning-subcard planning-date-card">
              <div class="planning-subcard-header">
                <h2>Data inicial do planejamento</h2>
              </div>
              ${renderPlanningInlineCalendar(draft.planningStartDate)}
            </article>

            <article class="planning-subcard planning-productions-shell">
              <div class="planning-subcard-header">
                <h2>Produ&ccedil;&otilde;es</h2>
                <div class="planning-header-actions">
                  <button class="secondary-button clear-planning planning-clear-button" type="button">Limpar planejamento</button>
                  <button class="primary-button" name="simulate" type="submit">Simular</button>
                  <button class="secondary-button add-production" type="button">+ Adicionar produ&ccedil;&atilde;o</button>
                </div>
              </div>
              <div class="productions-target">${draft.productions.map(renderProduction).join('')}</div>
            </article>

            <article class="planning-subcard planning-turns-card">
              <div class="planning-subcard-header">
                <h2>Turnos</h2>
                <button class="secondary-button add-shift" type="button">+ Adicionar turno</button>
              </div>
              <div class="planning-shifts-layout">
                <div class="shifts-target">${draft.shifts.map(renderShift).join('')}</div>
                <div class="shift-summary-target">${renderShiftSummary()}</div>
              </div>
            </article>

            <div class="panel production-flows-panel planning-flow-shell" hidden>
              <div class="section-heading">
                <h2>Fluxo produtivo por produ&ccedil;&atilde;o</h2>
              </div>
              <div class="production-flows-target"></div>
            </div>
          </div>
        </form>
      </div>
      <div class="planning-results" hidden>
        <div class="panel calendar-panel">
          <div class="section-heading">
            <h2>Calend&aacute;rio de produ&ccedil;&atilde;o</h2>
            <div class="calendar-panel-actions">
              <button class="secondary-button recalculate-planning" type="button" hidden>Recalcular</button>
              ${canWritePlanning ? '<button class="secondary-button" name="save" type="button" disabled>Salvar planejamento</button>' : ''}
            </div>
          </div>
          <p class="unsimulated-notice" hidden>Planejamento inconsistente. Clique em Recalcular.</p>
          <div class="timeline-target"></div>
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

    function closeCalendarAfterProductionPriorityChange() {
      currentSimulation = null;
      currentAutomaticBaseline = null;
      manualScheduleDraft = null;
      manualScheduleHistory.reset();
      lastPayload = null;
      currentPlanningStockAlerts = new Map();
      hasPendingSimulationChanges = false;
      draft.currentSimulation = null;
      draft.automaticBaseline = null;
      draft.manualScheduleDraft = null;
      draft.lastPayload = null;
      draft.stockOnlyMaterials = [];
      draft.stockOnlyMaterialChoices = [];
      draft.skipProductionMaterials = [];
      draft.operationOverrides = {};
      draft.operationSplits = [];
      clearTimeout(recalculationTimer);
      const resultsTarget = target.querySelector('.planning-results');
      if (resultsTarget) resultsTarget.hidden = true;
      target.querySelector('.planning-flow-shell')?.toggleAttribute('hidden', true);
      const flowsTarget = target.querySelector('.production-flows-target');
      if (flowsTarget) flowsTarget.innerHTML = '';
      renderProductionCalendar(target.querySelector('.timeline-target'), { days: [], operations: [], calendarOperations: [] });
      saveDraftNow();
    }

    function moveProductionPriority(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return false;
      const productions = [...draft.productions];
      if (fromIndex >= productions.length || toIndex >= productions.length) return false;
      const [moved] = productions.splice(fromIndex, 1);
      productions.splice(toIndex, 0, moved);
      draft.productions = productions;
      closeCalendarAfterProductionPriorityChange();
      rerenderProductionsBuilder();
      toast('Prioridade alterada. Simule novamente para recalcular o calendário.');
      return true;
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
          ${PRODUCTION_DISPLAY_PALETTE.map(color => `
            <button class="production-color-option${color === selectedColor ? ' is-selected' : ''}" type="button" data-production-color="${color}" style="--swatch-color: ${getProductionDisplayColor(color, { productionIndex: draft.productions.indexOf(production) })}" aria-label="Usar cor ${color}" aria-selected="${color === selectedColor}"></button>
          `).join('')}
        </div>
      `;
      card.querySelector('.planning-subcard-header').appendChild(popover);
    }

    function queueSimulationRefresh() {
      if (!currentSimulation) return;
      if (!draft.productions.every(production => findMaterialById(materials, production.materialId) && Number(production.plannedQty) > 0)) {
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

    function handleProductionInput(event, scope = productionsTarget) {
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
        renderMaterialSuggestions(event.target.closest('.material-autocomplete') || scope, production);
        if (material) rerenderProductionsBuilder();
      }
      queueAutosave();
      if (event.target.name !== 'materialSearch') queueSimulationRefresh();
    }

    function handleProductionChange(event) {
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
    }

    function openProductionDetailsModal(productionId) {
      const production = draft.productions.find(item => item.id === productionId);
      if (!production) return;
      const index = draft.productions.indexOf(production);
      page.querySelector('.production-details-modal')?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop production-details-modal';
      backdrop.innerHTML = `
        <div class="modal production-details-dialog" role="dialog" aria-modal="true" aria-labelledby="production-details-title" data-production-id="${escapeHtml(production.id)}" style="${productionThemeStyle(index, isHexColor(production.color) ? production.color : automaticProductionColor(index))}">
          <div class="modal-header">
            <div class="production-details-heading">
              <span class="production-gradient-key production-details-color" aria-hidden="true"></span>
              <h2 id="production-details-title">Produ&ccedil;&atilde;o #${index + 1}</h2>
              <p class="modal-subtitle">Detalhes da configura&ccedil;&atilde;o</p>
            </div>
            <button class="secondary-button close-production-details" type="button">Fechar</button>
          </div>
          <div class="production-details-target">${renderProductionDetailsFields(production, index)}</div>
        </div>
      `;
      const dialog = backdrop.querySelector('[data-production-id]');
      const close = () => {
        backdrop.remove();
        rerenderProductionsBuilder();
      };
      backdrop.querySelector('.close-production-details').addEventListener('click', close);
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close();
      });
      dialog.addEventListener('input', event => {
        const current = draft.productions.find(item => item.id === production.id);
        if (!current || !event.target.name) return;
        current[event.target.name] = event.target.value;
        if (event.target.name === 'materialSearch') {
          const previousMaterialId = current.materialId;
          const searchValue = event.target.value.trim().toLowerCase();
          const material = materials.find(item =>
            materialLabel(item).toLowerCase() === searchValue
            || (item.codes || []).some(code => String(code).toLowerCase() === searchValue)
          );
          current.materialId = material?.id || '';
          if (material) {
            current.materialSearch = materialLabel(material);
            event.target.value = current.materialSearch;
          }
          if (String(previousMaterialId || '') !== String(current.materialId || '')) {
            clearProductionMaterialDecisions(draft.productions.indexOf(current));
          }
          current.productionModelName = '';
          current.machineName = '';
          current.peopleCount = '';
          current.transports = [];
          renderMaterialSuggestions(event.target.closest('.material-autocomplete') || dialog, current);
          if (material) {
            backdrop.querySelector('.production-details-target').innerHTML = renderProductionDetailsFields(current, draft.productions.indexOf(current));
          }
        } else {
          queueSimulationRefresh();
        }
        queueAutosave();
        rerenderProductionsBuilder();
      });
      dialog.addEventListener('change', event => {
        const current = draft.productions.find(item => item.id === production.id);
        if (!current || !event.target.name) return;
        current[event.target.name] = event.target.value;
        if (event.target.name === 'machineName') current.peopleCount = '';
        saveDraftNow();
        queueSimulationRefresh();
        rerenderProductionsBuilder();
        backdrop.querySelector('.production-details-target').innerHTML = renderProductionDetailsFields(current, draft.productions.indexOf(current));
      });
      dialog.addEventListener('focusin', event => {
        if (event.target.name !== 'materialSearch') return;
        renderMaterialSuggestions(event.target.closest('.material-autocomplete') || dialog, production);
      });
      dialog.addEventListener('focusout', event => {
        if (event.target.name !== 'materialSearch') return;
        setTimeout(() => {
          const suggestionsTarget = dialog.querySelector('.material-suggestions');
          if (suggestionsTarget) suggestionsTarget.hidden = true;
        }, 120);
      });
      dialog.addEventListener('mousedown', event => {
        const button = event.target.closest('[data-material-id]');
        if (!button) return;
        event.preventDefault();
        const previousMaterialId = production.materialId;
        const material = findMaterialById(materials, button.dataset.materialId);
        production.materialId = material?.id || '';
        if (String(previousMaterialId || '') !== String(production.materialId || '')) {
          clearProductionMaterialDecisions(index);
        }
        production.materialSearch = materialLabel(material);
        const input = dialog.querySelector('input[name="materialSearch"]');
        if (input) input.value = production.materialSearch;
        production.productionModelName = '';
        production.machineName = '';
        production.peopleCount = '';
        production.transports = [];
        hasPendingSimulationChanges = true;
        saveDraftNow();
        backdrop.querySelector('.production-details-target').innerHTML = renderProductionDetailsFields(production, index);
        rerenderProductionsBuilder();
      });
      page.appendChild(backdrop);
      dialog.querySelector('input, select, button')?.focus();
    }

    form.elements.planningStartDate.addEventListener('input', updateDraftFromGeneral);
    form.elements.setupHours?.addEventListener('input', () => {
      updateDraftFromGeneral();
      queueSimulationRefresh();
    });

    target.querySelector('.planning-date-card')?.addEventListener('click', event => {
      const monthButton = event.target.closest('[data-calendar-month]');
      const dayButton = event.target.closest('[data-planning-date]');
      const nextDate = dayButton?.dataset.planningDate || monthButton?.dataset.calendarMonth;
      if (!nextDate) return;
      draft.planningStartDate = nextDate;
      hasPendingSimulationChanges = true;
      rerenderBuilder();
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

    productionsTarget.addEventListener('input', event => handleProductionInput(event));

    productionsTarget.addEventListener('change', event => handleProductionChange(event));

    function renderMaterialSuggestions(scope, production) {
      const suggestionsTarget = scope?.querySelector('.material-suggestions');
      if (!suggestionsTarget) return;
      const searchValue = String(production.materialSearch || '').trim().toLowerCase();
      if (!searchValue) {
        suggestionsTarget.hidden = true;
        suggestionsTarget.innerHTML = '';
        return;
      }
      const matches = materials.filter(material => materialMatchesSearch(material, searchValue)).slice(0, 12);
      suggestionsTarget.innerHTML = matches.length
        ? matches.map(material => `
            <button type="button" data-material-id="${material.id}">
              <strong>${escapeHtml(materialLabel(material))}</strong>
            </button>
          `).join('')
        : '<div class="material-suggestion-empty">Nenhum material encontrado.</div>';
      suggestionsTarget.hidden = false;
      positionMaterialSuggestions(suggestionsTarget);
    }

    function positionMaterialSuggestions(suggestionsTarget) {
      const input = suggestionsTarget.closest('.material-autocomplete')?.querySelector('input[name="materialSearch"]');
      if (!input || suggestionsTarget.hidden) return;
      const rect = input.getBoundingClientRect();
      const gap = 4;
      suggestionsTarget.style.left = `${Math.round(rect.left)}px`;
      suggestionsTarget.style.width = `${Math.round(rect.width)}px`;
      suggestionsTarget.style.top = `${Math.round(rect.bottom + gap)}px`;
    }

    productionsTarget.addEventListener('focusin', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card || event.target.name !== 'materialSearch') return;
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      renderMaterialSuggestions(event.target.closest('.material-autocomplete'), production);
    });

    productionsTarget.addEventListener('scroll', () => {
      productionsTarget.querySelectorAll('.material-suggestions:not([hidden])')
        .forEach(positionMaterialSuggestions);
    });

    productionsTarget.addEventListener('focusout', event => {
      if (event.target.name !== 'materialSearch') return;
      const card = event.target.closest('[data-production-id]');
      setTimeout(() => {
        const suggestionsTarget = card?.querySelector('.material-autocomplete:focus-within .material-suggestions')
          || event.target.closest('.material-autocomplete')?.querySelector('.material-suggestions');
        if (suggestionsTarget) suggestionsTarget.hidden = true;
      }, 120);
    });

    productionsTarget.addEventListener('mousedown', event => {
      const button = event.target.closest('[data-material-id]');
      const card = event.target.closest('[data-production-id]');
      if (!button || !card) return;
      event.preventDefault();
      const production = draft.productions.find(item => item.id === card.dataset.productionId);
      const material = findMaterialById(materials, button.dataset.materialId);
      const previousMaterialId = production.materialId;
      production.materialId = material?.id || '';
      if (String(previousMaterialId || '') !== String(production.materialId || '')) {
        clearProductionMaterialDecisions(draft.productions.indexOf(production));
      }
      production.materialSearch = materialLabel(material);
      const input = card.querySelector('input[name="materialSearch"]');
      if (input) input.value = production.materialSearch;
      production.productionModelName = '';
      production.machineName = '';
      production.peopleCount = '';
      production.transports = [];
      hasPendingSimulationChanges = true;
      saveDraftNow();
      rerenderProductionsBuilder();
      queueSimulationRefresh();
    });

    productionsTarget.addEventListener('dragstart', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card || !event.target.closest('[data-production-drag-handle]')) {
        event.preventDefault();
        return;
      }
      const index = draft.productions.findIndex(item => item.id === card.dataset.productionId);
      if (index < 0) {
        event.preventDefault();
        return;
      }
      card.classList.add('is-priority-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });

    productionsTarget.addEventListener('dragover', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      productionsTarget.querySelectorAll('.production-block.is-priority-drop-target')
        .forEach(item => item.classList.remove('is-priority-drop-target'));
      card.classList.add('is-priority-drop-target');
    });

    productionsTarget.addEventListener('dragleave', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card || card.contains(event.relatedTarget)) return;
      card.classList.remove('is-priority-drop-target');
    });

    productionsTarget.addEventListener('drop', event => {
      const card = event.target.closest('[data-production-id]');
      if (!card) return;
      event.preventDefault();
      const fromIndex = Number(event.dataTransfer.getData('text/plain'));
      const toIndex = draft.productions.findIndex(item => item.id === card.dataset.productionId);
      productionsTarget.querySelectorAll('.production-block.is-priority-drop-target, .production-block.is-priority-dragging')
        .forEach(item => item.classList.remove('is-priority-drop-target', 'is-priority-dragging'));
      moveProductionPriority(fromIndex, toIndex);
    });

    productionsTarget.addEventListener('dragend', () => {
      productionsTarget.querySelectorAll('.production-block.is-priority-drop-target, .production-block.is-priority-dragging')
        .forEach(item => item.classList.remove('is-priority-drop-target', 'is-priority-dragging'));
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
      if (event.target.classList.contains('remove-production')) {
        const removedIndex = draft.productions.findIndex(item => item.id === card.dataset.productionId);
        draft.productions = draft.productions.filter(item => item.id !== card.dataset.productionId);
        removeProductionScopedState(removedIndex);
        rerenderBuilder();
        return;
      }
      if (event.target.closest('button, input, select, textarea, .material-suggestions')) return;
      openProductionDetailsModal(card.dataset.productionId);
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
      currentAutomaticBaseline = null;
      manualScheduleDraft = null;
      manualScheduleHistory.reset();
      draft.lastPayload = null;
      draft.currentSimulation = null;
      draft.manualScheduleDraft = null;
      rerenderBuilder();
    });

    async function simulateCurrent({ captureAutomaticBaseline = true } = {}) {
      const preservedDailyTeamOverrides = JSON.parse(JSON.stringify(manualScheduleDraft?.dailyTeamOverrides || draft.dailyTeamOverrides || {}));
      const preservedManualWorkDates = [...(manualScheduleDraft?.manualWorkDates || draft.manualWorkDates || lastPayload?.manualWorkDates || [])];
      if (manualScheduleDraft?.dirty) {
        const discard = confirm('Existem alteracoes manuais no calendario. Recalcular automaticamente descartara essas alteracoes.');
        if (!discard) return null;
        manualScheduleDraft = null;
        draft.manualScheduleDraft = null;
      }
      draft.dailyTeamOverrides = preservedDailyTeamOverrides;
      draft.manualWorkDates = preservedManualWorkDates;
      updateDraftFromGeneral();
      if (!validateDraft(form)) return null;
      lastPayload = payload();
      draft.lastPayload = lastPayload;
      let result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
      if (syncStockOnlyMaterialsFromSimulation(result)) {
        lastPayload = payload();
        draft.lastPayload = lastPayload;
        result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
      }
      for (let shortageAttempt = 0; shortageAttempt < 3; shortageAttempt += 1) {
        const shortageDecision = await requestProductionShortageDecisions(result);
        if (shortageDecision.action === 'cancel') return null;
        if (shortageDecision.action !== 'apply') break;
        const shortageChanged = applyProductionShortageDecisions(shortageDecision.decisions);
        if (!shortageChanged) break;
        rerenderProductionsBuilder();
        lastPayload = payload();
        draft.lastPayload = lastPayload;
        result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
      }
      if (!Array.isArray(result?.operations) || !result.operations.length) {
        await requestEmptyProductionSimulationNotice();
        currentSimulation = null;
        manualScheduleDraft = null;
        draft.currentSimulation = null;
        draft.manualScheduleDraft = null;
        saveDraftNow();
        return null;
      }
      renderSimulation(result, form, { captureAutomaticBaseline });
      return result;
    }

    async function applyAcceptedManualSimulation(label, previousState) {
      const result = await withOperationLoading(label, () => simulateCurrent({ captureAutomaticBaseline: false }));
      if (!result) {
        restoreDraftPlanningState(previousState);
        return null;
      }
      recordAcceptedManualState(previousState);
      refreshTimelineOnly();
      return result;
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

    async function confirmManualCapacityDecision(error, { allowSplit = true } = {}) {
      const capacity = Number(error?.proposedAllocation?.capacityPercent || 0);
      const choice = await openManualDraftChoiceModal({
        title: 'Capacidade do dia excedida',
        bodyHtml: `
          <p>Capacidade final prevista: <strong>${Number.isFinite(capacity) ? `${capacity.toFixed(2)}%` : '-'}</strong>.</p>
          <p>${allowSplit ? 'Escolha como tratar o excedente.' : 'Confirme se deseja continuar acima da capacidade maxima do dia.'}</p>
        `,
        actions: [
          { value: 'cancel', label: 'Cancelar', className: 'secondary-button' },
          ...(allowSplit ? [{ value: 'split', label: 'Preencher o dia e reagendar excedente', className: 'secondary-button' }] : []),
          { value: 'override', label: 'Permitir capacidade extraordinaria', className: 'primary-button' }
        ]
      });
      return ['split', 'override'].includes(choice) ? choice : 'cancel';
    }

    async function chooseManualDraftOccupiedMoveMode(intent, move, calendarSnapshot) {
      if (!['occupied', 'reorder'].includes(intent?.destination?.kind)) return null;
      const occupiedIds = new Set((intent.destination.occupiedAllocationIds || []).map(String));
      const occupants = (calendarSnapshot?.allocations || [])
        .filter(allocation => occupiedIds.has(String(allocation.allocationId)));
      const firstOccupant = occupants[0] || {};
      const moved = move?.allocation || {};
      const destinationDate = formatDateOnly(intent?.to?.date || firstOccupant.date);
      const destinationMachine = move?.machine?.machineName || firstOccupant.machineName || 'a máquina selecionada';
      const movedLabel = moved.materialName || moved.materialCode || 'a produção selecionada';
      const occupantLabel = occupants.length > 1
        ? `${occupants.length} produções`
        : (firstOccupant.materialName || firstOccupant.materialCode || 'a produção programada');
      const movedCapacity = Number(moved.capacityPercent || 0);
      const occupiedCapacity = occupants.reduce((sum, allocation) => sum + Number(allocation.capacityPercent || 0), 0);
      const combinedCapacity = movedCapacity + occupiedCapacity;
      if (intent?.destination?.kind === 'reorder') {
        const choice = await openManualDraftChoiceModal({
          title: 'Mudar ordem no quadrante?',
          bodyHtml: `
            <p>Você está colocando <strong>${escapeHtml(movedLabel)}</strong> antes de <strong>${escapeHtml(occupantLabel)}</strong> em <strong>${escapeHtml(destinationDate || 'a data selecionada')}</strong>, na máquina <strong>${escapeHtml(destinationMachine)}</strong>.</p>
            <p>O sistema vai recalcular os horários dentro do mesmo quadrante e validar estoque, dependências e equipe.</p>
          `,
          actions: [
            { value: 'cancel', label: 'Cancelar', className: 'secondary-button' },
            { value: 'reorder_before', label: 'Mudar ordem', className: 'primary-button' }
          ]
        });
        return choice === 'reorder_before' ? 'reorder_before' : 'cancel';
      }
      const choice = await openManualDraftChoiceModal({
        title: 'O que fazer neste quadrante?',
        bodyHtml: `
          <p>Você está movendo <strong>${escapeHtml(movedLabel)}</strong> para <strong>${escapeHtml(destinationDate || 'a data selecionada')}</strong>, na máquina <strong>${escapeHtml(destinationMachine)}</strong>.</p>
          <p>Esse quadrante já contém <strong>${escapeHtml(occupantLabel)}</strong>. Capacidade somada prevista: <strong>${Number.isFinite(combinedCapacity) ? `${combinedCapacity.toFixed(2)}%` : '-'}</strong>.</p>
        `,
        actions: [
          { value: 'cancel', label: 'Cancelar', className: 'secondary-button' },
          { value: 'replace', label: 'Substituir', className: 'secondary-button' },
          { value: 'complete_day', label: 'Completar dia', className: 'primary-button' }
        ]
      });
      return ['replace', 'complete_day'].includes(choice) ? choice : 'cancel';
    }

    function suggestedManualMovePeopleCount({ allocation, machine, getPreview }) {
      const peopleCounts = Array.isArray(machine?.peopleCounts) ? machine.peopleCounts : [];
      if (!peopleCounts.length) return allocation?.peopleCount || 1;
      const quantity = Number(allocation?.quantity || 0);
      const scored = peopleCounts.map(peopleCount => {
        const preview = getPreview({ allocation, quantity, machine, peopleCount, date: allocation.date, startTime: allocation.startTime });
        const capacity = Number(preview?.capacityPerDay || 0);
        const usage = quantity > 0 && capacity > 0 ? (quantity / capacity) * 100 : Number.POSITIVE_INFINITY;
        return {
          peopleCount,
          usage,
          score: usage <= 100 ? 1000 + usage : 100 - usage
        };
      }).sort((left, right) => right.score - left.score || left.peopleCount - right.peopleCount);
      return scored[0]?.peopleCount || peopleCounts[0] || allocation?.peopleCount || 1;
    }

    function sameProductivityMachine(left = {}, right = {}) {
      const rightKeys = new Set(productivityMachineKeys(right));
      return productivityMachineKeys(left).some(key => rightKeys.has(key));
    }

    async function confirmManualMoveConfiguration(intent, move, calendarSnapshot) {
      const current = (manualScheduleDraft?.allocations || [])
        .find(item => String(item.allocationId) === String(move?.allocation?.allocationId))
        || move?.allocation;
      if (!current) return null;
      const targetDate = String(intent?.to?.date || current.date || '').slice(0, 10);
      const targetMachineId = String(move?.machine?.machineId || intent?.to?.machineId || current.machineId || '');
      const targetMachineName = String(move?.machine?.machineName || current.machineName || targetMachineId);
      const material = resolveProductivityMaterial({ reference: current, materials });
      const productivityRows = selectPlanningEditorProductivityRows({
        material: material || current,
        productivityMatrix: matrix
      });
      const machines = getPlanningOperationResourceOptions({
        productivityRows,
        machines: calendarSnapshot?.machines || [],
        material: material || current
      });
      const targetMachineReference = { ...(move?.machine || {}), machineId: targetMachineId, machineName: targetMachineName };
      const targetMachine = machines.find(option => sameProductivityMachine(option, targetMachineReference))
        || null;
      const orderedMachines = targetMachine ? [targetMachine] : [];
      const getPreview = ({ allocation: previewAllocation, quantity, machine, peopleCount, date, startTime }) => buildPlanningOperationResourcePreview({
        allocation: {
          ...previewAllocation,
          quantity: quantity ?? previewAllocation.quantity,
          date: date || previewAllocation.date,
          startTime: startTime || previewAllocation.startTime
        },
        machine,
        peopleCount,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      });
      const editorAllocation = {
        ...current,
        date: targetDate || current.date,
        machineId: targetMachine?.machineId || targetMachineId,
        machineName: targetMachine?.machineName || targetMachineName,
        peopleCount: targetMachine
          ? suggestedManualMovePeopleCount({
              allocation: { ...current, date: targetDate || current.date },
              machine: targetMachine,
              getPreview
            })
          : current.peopleCount,
        source: 'manual',
        pinned: true
      };
      return await new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        ProductionCalendarEditor({
          allocation: editorAllocation,
          machines: orderedMachines,
          allowSplit: false,
          lockPosition: true,
          emptyMessage: 'Nenhuma configuração compatível foi encontrada na Matriz para este material no destino.',
          getPreview,
          onClose: () => finish(null),
          onSave: payload => {
            if (payload?.mode !== 'edit') return { accepted: false, message: 'Confirme apenas a configuração deste movimento.' };
            finish({
              machineId: payload.machineId,
              machineName: orderedMachines.find(option => String(option.machineId) === String(payload.machineId))?.machineName || payload.machineId,
              peopleCount: payload.peopleCount,
              date: payload.date,
              startTime: payload.startTime,
              productivityRows
            });
            return { accepted: true };
          }
        });
      });
    }

    function manualStockMoveIssueRows(components = [], fallbackQuantity = 0, unit = '') {
      const rows = Array.isArray(components) && components.length ? components : [];
      if (!rows.length) {
        return `<tr><td>Componentes</td><td>${formatPtBrInteger(fallbackQuantity)} ${escapeHtml(unit)}</td><td>--</td><td>--</td></tr>`;
      }
      return rows.map(component => `
        <tr>
          <td>${escapeHtml(component.materialName || component.materialCode || component.materialId || 'Material')}</td>
          <td>${formatPtBrInteger(component.requiredQuantity)} ${escapeHtml(component.unit || '')}</td>
          <td>${formatPtBrInteger(component.availableQuantity)} ${escapeHtml(component.unit || '')}</td>
          <td>${formatPtBrInteger(component.deficitQuantity)} ${escapeHtml(component.unit || '')}</td>
        </tr>
      `).join('');
    }

    function manualStockModalModel(allocation, date, analysis) {
      return buildManualStockMoveModalModel({
        allocation,
        destinationDate: date,
        analysis,
        operations: currentSimulation?.operations || [],
        dependencies: currentSimulation?.dependencies || [],
        materials,
        stock: currentManualScheduleValidationContext(currentProductionCalendarSnapshot()).stock || [],
        allocations: manualScheduleDraft?.allocations || currentProductionCalendarSnapshot()?.allocations || []
      });
    }

    function openManualStockUnavailableModal({ allocation, date, analysis }) {
      const model = manualStockModalModel(allocation, date, analysis);
      page.querySelector('.manual-stock-unavailable-modal')?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop manual-stock-unavailable-modal';
      backdrop.innerHTML = `
        <div class="modal manual-stock-partial-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-stock-unavailable-title">
          <div class="modal-header manual-stock-partial-header">
            <h3 id="manual-stock-unavailable-title">Movimento cancelado por estoque</h3>
          </div>
          <div class="manual-stock-partial-body">
            <section class="manual-stock-section">
              <h4>Resumo da movimentação</h4>
              <p>Não é possível mover <strong>${escapeHtml(model.productionTitle)}</strong> para <strong>${escapeHtml(formatDateOnly(model.destinationDate) || model.destinationDate)}</strong>.</p>
              <p>Data de origem: <strong>${escapeHtml(formatDateOnly(model.sourceDate) || model.sourceDate || '--')}</strong>. Data de destino: <strong>${escapeHtml(formatDateOnly(model.destinationDate) || model.destinationDate || '--')}</strong>.</p>
              <p>Quantidade original: <strong>${formatPtBrInteger(model.originalQuantity)} ${escapeHtml(model.unit)}</strong>. Quantidade máxima possível nesta data: <strong>0 ${escapeHtml(model.unit)}</strong>.</p>
            </section>
            <section class="manual-stock-section">
              <h4>Análise dos componentes</h4>
              <div class="planning-stock-modal-table-scroll">
                <table class="data-table manual-stock-components-table"><thead><tr><th>Componente</th><th>Consumo necessário</th><th>Saldo disponível</th><th>Falta</th></tr></thead><tbody>${manualStockMoveIssueRows(model.components, model.originalQuantity, model.unit)}</tbody></table>
              </div>
            </section>
          </div>
          <div class="form-actions modal-actions manual-stock-partial-actions">
            <button class="primary-button" type="button" data-stock-unavailable-close>Fechar</button>
          </div>
        </div>
      `;
      return new Promise(resolve => {
        const close = () => {
          backdrop.remove();
          resolve('close');
        };
        backdrop.addEventListener('click', event => {
          if (event.target.closest('[data-stock-unavailable-close]') || event.target === backdrop) close();
        });
        backdrop.addEventListener('keydown', event => {
          if (event.key === 'Escape') close();
        });
        page.appendChild(backdrop);
        backdrop.querySelector('[data-stock-unavailable-close]')?.focus();
      });
    }

    function renderManualStockRemainderDates(options = [], selectedDate = '') {
      if (!options.length) return '<p class="muted-text">Nenhuma data viável foi encontrada no horizonte atual.</p>';
      return options.map(option => `
        <button class="manual-stock-remainder-date-option" type="button" data-stock-partial-date="${escapeHtml(option.date)}" ${option.viable ? '' : 'disabled'} title="${escapeHtml(option.viable ? 'Data viável' : (option.reason || 'Data inviável'))}" aria-pressed="${String(selectedDate === option.date)}">
          ${option.viable ? '<span class="manual-stock-remainder-date-dot" aria-hidden="true"></span>' : '<span class="manual-stock-remainder-date-dot is-disabled" aria-hidden="true"></span>'}
          <span>${escapeHtml(formatDateOnly(option.date) || option.date)}</span>
          ${option.viable ? '' : `<small>${escapeHtml(option.reason || 'Inviável')}</small>`}
        </button>
      `).join('');
    }

    function openManualStockPartialMoveModal({ allocation, date, analysis, getDateOptions }) {
      page.querySelector('.manual-stock-partial-move-modal')?.remove();
      const model = manualStockModalModel(allocation, date, analysis);
      const maxQuantity = model.maxQuantity;
      const originalQuantity = model.originalQuantity;
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop manual-stock-partial-move-modal';
      backdrop.innerHTML = `
        <div class="modal manual-stock-partial-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-stock-partial-title">
          <div class="modal-header manual-stock-partial-header">
            <h3 id="manual-stock-partial-title">Estoque parcial na data escolhida</h3>
          </div>
          <div class="manual-stock-partial-body">
            <section class="manual-stock-section manual-stock-summary">
              <h4>Resumo da movimentação</h4>
              <dl>
                <div><dt>Produção</dt><dd>${escapeHtml(model.productionTitle)}</dd></div>
                <div><dt>Material produzido</dt><dd>${escapeHtml(model.materialName)}</dd></div>
                <div><dt>Data de origem</dt><dd>${escapeHtml(formatDateOnly(model.sourceDate) || model.sourceDate || '--')}</dd></div>
                <div><dt>Data de destino</dt><dd>${escapeHtml(formatDateOnly(model.destinationDate) || model.destinationDate || '--')}</dd></div>
                <div><dt>Quantidade original</dt><dd>${formatPtBrInteger(model.originalQuantity)} ${escapeHtml(model.unit)}</dd></div>
                <div><dt>Quantidade máxima possível</dt><dd>${formatPtBrInteger(model.maxQuantity)} ${escapeHtml(model.unit)}</dd></div>
              </dl>
            </section>
            <section class="manual-stock-section">
              <h4>Análise dos componentes</h4>
              <div class="planning-stock-modal-table-scroll">
                <table class="data-table manual-stock-components-table"><thead><tr><th>Componente</th><th>Consumo necessário</th><th>Saldo disponível</th><th>Falta</th></tr></thead><tbody>${manualStockMoveIssueRows(model.components, model.originalQuantity, model.unit)}</tbody></table>
              </div>
            </section>
            <section class="manual-stock-section manual-stock-choice-section">
              <h4>Escolha da quantidade</h4>
              <label class="manual-stock-choice">
                <input type="radio" name="manual-stock-partial-mode" value="max" checked>
                <span><strong>Produzir máximo sugerido</strong><small>${formatPtBrInteger(model.maxQuantity)} ${escapeHtml(model.unit)} agora; restante de <span data-stock-partial-remainder-inline>${formatPtBrInteger(model.remainingQuantity)} ${escapeHtml(model.unit)}</span>.</small></span>
              </label>
              <label class="manual-stock-choice">
                <input type="radio" name="manual-stock-partial-mode" value="manual">
                <span><strong>Produzir quantidade informada</strong><small>Informe uma quantidade inteira entre 1 e ${formatPtBrInteger(model.maxQuantity)} ${escapeHtml(model.unit)}.</small></span>
              </label>
              <label class="field manual-stock-quantity-field" hidden>
                <span>Quantidade a produzir no destino</span>
                <input type="number" min="1" max="${escapeHtml(String(maxQuantity))}" step="1" inputmode="numeric" pattern="\\d*" value="${escapeHtml(String(maxQuantity))}" data-stock-partial-quantity>
              </label>
              <p>Quantidade restante: <strong data-stock-partial-remainder>${formatPtBrInteger(model.remainingQuantity)} ${escapeHtml(model.unit)}</strong>.</p>
            </section>
            <section class="manual-stock-section manual-stock-remainder-section" data-stock-partial-remainder-section ${model.remainingQuantity > 0 ? '' : 'hidden'}>
              <h4>Data do restante</h4>
              <p class="muted-text">Somente datas viáveis ficam habilitadas.</p>
              <div class="manual-stock-remainder-dates" data-stock-partial-date-options></div>
            </section>
            <p class="form-error" data-stock-partial-error hidden></p>
          </div>
          <div class="form-actions modal-actions manual-stock-partial-actions">
            <button class="secondary-button" type="button" data-stock-partial-action="cancel">Cancelar</button>
            <button class="primary-button" type="button" data-stock-partial-action="save" disabled>Salvar produção</button>
          </div>
        </div>
      `;
      return new Promise(resolve => {
        let selectedMode = 'max';
        let selectedRemainderDate = '';
        let currentDateOptions = [];
        const close = value => {
          backdrop.remove();
          resolve(value);
        };
        const input = () => backdrop.querySelector('[data-stock-partial-quantity]');
        const error = () => backdrop.querySelector('[data-stock-partial-error]');
        const saveButton = () => backdrop.querySelector('[data-stock-partial-action="save"]');
        const selectedQuantity = () => {
          if (selectedMode === 'max') return maxQuantity;
          const rawValue = String(input()?.value || '').trim();
          if (!/^\d+$/.test(rawValue)) return NaN;
          return Number(rawValue);
        };
        const selectedRemaining = () => Math.max(originalQuantity - (Number.isFinite(selectedQuantity()) ? selectedQuantity() : 0), 0);
        const setError = message => {
          const element = error();
          if (!element) return;
          element.hidden = !message;
          element.textContent = message || '';
        };
        const renderDates = () => {
          const target = backdrop.querySelector('[data-stock-partial-date-options]');
          if (target) target.innerHTML = renderManualStockRemainderDates(currentDateOptions, selectedRemainderDate);
        };
        const validate = () => {
          const quantity = selectedQuantity();
          const remaining = selectedRemaining();
          let message = '';
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
            message = 'Informe uma quantidade inteira entre 1 e o máximo disponível.';
          } else if (remaining > 0 && !currentDateOptions.some(option => option.viable && option.date === selectedRemainderDate)) {
            message = 'Escolha uma data viável para o restante.';
          }
          setError(message);
          saveButton()?.toggleAttribute('disabled', Boolean(message));
          return !message;
        };
        const updateRemainder = async () => {
          const quantity = selectedQuantity();
          const remaining = selectedRemaining();
          const target = backdrop.querySelector('[data-stock-partial-remainder]');
          const inline = backdrop.querySelector('[data-stock-partial-remainder-inline]');
          const text = `${formatPtBrInteger(remaining)} ${model.unit}`.trim();
          if (target) target.textContent = text;
          if (inline) inline.textContent = text;
          backdrop.querySelector('[data-stock-partial-remainder-section]')?.toggleAttribute('hidden', !(remaining > 0));
          selectedRemainderDate = '';
          currentDateOptions = remaining > 0 && typeof getDateOptions === 'function'
            ? await getDateOptions(Number.isFinite(quantity) ? quantity : 0)
            : [];
          renderDates();
          validate();
        };
        backdrop.querySelectorAll('input[name="manual-stock-partial-mode"]').forEach(radio => {
          radio.addEventListener('change', async event => {
            selectedMode = event.target.value === 'manual' ? 'manual' : 'max';
            backdrop.querySelector('.manual-stock-quantity-field')?.toggleAttribute('hidden', selectedMode !== 'manual');
            await updateRemainder();
            if (selectedMode === 'manual') input()?.focus();
          });
        });
        input()?.addEventListener('input', async () => {
          const element = input();
          if (element) element.value = String(element.value || '').replace(/\D+/g, '').slice(0, 12);
          await updateRemainder();
        });
        backdrop.addEventListener('click', async event => {
          const dateButton = event.target.closest('[data-stock-partial-date]');
          if (dateButton && !dateButton.disabled) {
            selectedRemainderDate = dateButton.dataset.stockPartialDate;
            renderDates();
            validate();
            return;
          }
          const button = event.target.closest('[data-stock-partial-action]');
          if (!button) {
            if (event.target === backdrop) close(null);
            return;
          }
          const action = button.dataset.stockPartialAction;
          if (action === 'cancel') return close(null);
          if (action !== 'save' || !validate()) return;
          close({
            quantity: selectedQuantity(),
            remainderQuantity: selectedRemaining(),
            remainderDate: selectedRemaining() > 0 ? selectedRemainderDate : null
          });
        });
        backdrop.addEventListener('keydown', event => {
          if (event.key === 'Escape') close(null);
        });
        page.appendChild(backdrop);
        updateRemainder();
        backdrop.querySelector('input[name="manual-stock-partial-mode"]')?.focus();
      });
    }

    function openManualRemainderDateModal({ dates = [], allocation, quantity }) {
      page.querySelector('.manual-stock-remainder-date-modal')?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop manual-stock-remainder-date-modal';
      const options = dates.map(item => (typeof item === 'string' ? { date: item, viable: true } : item));
      const dateButtons = options.length
        ? options.map(option => `
            <button class="secondary-button manual-stock-remainder-date-option" type="button" data-remainder-date="${escapeHtml(option.date)}" ${option.viable ? '' : 'disabled'} title="${escapeHtml(option.viable ? 'Data viável' : (option.reason || 'Data inviável'))}">
              ${option.viable ? '<span class="manual-stock-remainder-date-dot" aria-hidden="true"></span>' : '<span class="manual-stock-remainder-date-dot is-disabled" aria-hidden="true"></span>'}
              <span>${escapeHtml(formatDateOnly(option.date) || option.date)}</span>
              ${option.viable ? '' : `<small>${escapeHtml(option.reason || 'Inviável')}</small>`}
            </button>
          `).join('')
        : '<p>Nenhuma data viável foi encontrada no horizonte atual.</p>';
      backdrop.innerHTML = `
        <div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="manual-stock-remainder-date-title">
          <div class="modal-header">
            <h3 id="manual-stock-remainder-date-title">Escolher data do restante</h3>
            <button class="link-button" type="button" data-remainder-cancel>Cancelar</button>
          </div>
          <div class="manual-draft-choice-body">
            <p>Restante de <strong>${formatPtBrDecimal(quantity)} ${escapeHtml(allocation?.unit || '')}</strong>. Somente datas com estoque suficiente estão habilitadas.</p>
            <div class="form-grid">${dateButtons}</div>
          </div>
          <div class="form-actions modal-actions">
            <button class="secondary-button" type="button" data-remainder-cancel>Cancelar</button>
          </div>
        </div>
      `;
      return new Promise(resolve => {
        const close = value => {
          backdrop.remove();
          resolve(value);
        };
        backdrop.addEventListener('click', event => {
          const dateButton = event.target.closest('[data-remainder-date]');
          if (dateButton && !dateButton.disabled) return close(dateButton.dataset.remainderDate);
          if (event.target.closest('[data-remainder-cancel]') || event.target === backdrop) close(null);
        });
        backdrop.addEventListener('keydown', event => {
          if (event.key === 'Escape') close(null);
        });
        page.appendChild(backdrop);
        backdrop.querySelector('[data-remainder-date], [data-remainder-cancel]')?.focus();
      });
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
        const proposed = error.proposedAllocation || {};
        const source = error.sourceAllocation || {};
        const insertedLabel = proposed.materialName || proposed.materialCode || source.materialName || source.materialCode || 'a produção selecionada';
        const occupantLabel = occupant.materialName || occupant.materialCode || 'a produção programada';
        const sourceDate = formatDateOnly(source.date);
        const destinationDate = formatDateOnly(proposed.date || occupant.date);
        const destinationMachine = proposed.machineName || occupant.machineName || 'a máquina selecionada';
        const choice = await openManualDraftChoiceModal({
          title: 'Substituir produção programada',
          bodyHtml: `
            <p>Será inserida <strong>${escapeHtml(insertedLabel)}</strong>${sourceDate ? `, movida de <strong>${escapeHtml(sourceDate)}</strong>` : ''}.</p>
            <p>O destino em <strong>${escapeHtml(destinationDate || 'data selecionada')}</strong>, na máquina <strong>${escapeHtml(destinationMachine)}</strong>, contém <strong>${escapeHtml(occupantLabel)}</strong>.</p>
            <p>A produção ocupante será reagendada para o próximo período válido, preservando os movimentos manuais anteriores.</p>
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
      try {
        if (!manualScheduleDraft) throw new Error('Rascunho manual indisponivel para movimentacao.');
        const previousManualState = cloneDraftPlanningState();
        const calendarSnapshot = currentProductionCalendarSnapshot();
        const ganttIndependentMove = intent?.source === 'gantt-drag';
        const moveConfiguration = ganttIndependentMove
          ? {
              machineId: move.machine.machineId,
              machineName: move.machine.machineName,
              date: intent?.to?.date,
              peopleCount: move.allocation.peopleCount,
              productivityRows: matrix
            }
          : await confirmManualMoveConfiguration(intent, move, calendarSnapshot);
        if (!moveConfiguration) return;
        intent = {
          ...intent,
          to: {
            ...(intent.to || {}),
            date: moveConfiguration.date || intent?.to?.date,
            machineId: moveConfiguration.machineId || intent?.to?.machineId
          },
          peopleCount: moveConfiguration.peopleCount
        };
        move = {
          ...move,
          machine: {
            ...(move.machine || {}),
            machineId: moveConfiguration.machineId || move?.machine?.machineId,
            machineName: moveConfiguration.machineName || move?.machine?.machineName
          }
        };
        productionCalendarMoveInProgress = true;
        setOperationLoading(true, 'Validando movimentação...');
        const validationContext = await currentManualScheduleValidationContextWithFreshStock(calendarSnapshot);
        const baseMoveIntent = {
          type: 'MOVE_ALLOCATION',
          allocationId: move.allocation.allocationId,
          targetDate: intent.to.date,
          targetMachineId: move.machine.machineId,
          peopleCount: moveConfiguration.peopleCount,
          source: intent.source,
          manualMovePolicy: 'stock_only_independent'
        };
        const draftContext = {
          now: transactionTimestamp,
          validatedAt: transactionTimestamp,
          machines: calendarSnapshot.machines,
          matrixRows: moveConfiguration.productivityRows || matrix,
          days: calendarSnapshot.days,
          dailyMinutes: planningDraftDailyMinutes()
        };
        const runStockMove = extraIntent => applyManualScheduleTransaction({
          currentDraft: manualScheduleDraft,
          intent: { ...baseMoveIntent, ...(extraIntent || {}) },
          draftContext,
          validationContext
        });
        const installAcceptedMove = transaction => {
          manualScheduleDraft = transaction.draft;
          draft.manualScheduleDraft = manualScheduleDraft;
          recordAcceptedManualState(previousManualState);
          saveDraftNow();
          refreshTimelineOnly();
          if (String(previousVisualState.selectedAllocationId || '') === String(move.allocation.allocationId || '')) {
            productionCalendarVisualState = {
              ...productionCalendarVisualState,
              selectedAllocationId: null
            };
          }
          toast(transaction.warnings.length
            ? `Produção movimentada com ${transaction.warnings.length} alerta(s).`
            : 'Produção movimentada no rascunho manual.');
        };

        const fullTransaction = runStockMove();
        if (fullTransaction.accepted) {
          installAcceptedMove(fullTransaction);
          return;
        }
        const analysis = {
          ...(fullTransaction.validation?.manualMoveStockAnalysis || {
            stockIssues: fullTransaction.blockingIssues || [],
            maxQuantity: 0
          }),
          validation: fullTransaction.validation
        };
        const maxQuantity = Number(analysis.maxQuantity || 0);
        if (!(maxQuantity > 0)) {
          await openManualStockUnavailableModal({
            allocation: move.allocation,
            date: intent.to.date,
            analysis
          });
          return;
        }
        setOperationLoading(false);
        const horizonDates = (calendarSnapshot.days || [])
          .map(day => String(day?.date || '').slice(0, 10))
          .filter(date => isValidDateOnly(date) && date !== String(intent.to.date).slice(0, 10));
        const dateTransactionsByQuantity = new Map();
        const dateOptionsForQuantity = quantity => {
          const acceptedQuantity = Math.floor(Math.max(Number(quantity || 0), 0));
          if (dateTransactionsByQuantity.has(acceptedQuantity)) return dateTransactionsByQuantity.get(acceptedQuantity);
          const options = [];
          const transactions = new Map();
          for (const date of horizonDates) {
            const transaction = runStockMove({ quantity: acceptedQuantity, remainderDate: date });
            if (transaction.accepted) {
              transactions.set(date, transaction);
              options.push({ date, viable: true });
            } else {
              options.push({
                date,
                viable: false,
                reason: transaction.blockingIssues?.[0]?.message || transaction.validation?.errors?.[0]?.message || 'Sem estoque suficiente para o restante.'
              });
            }
          }
          const result = { options, transactions };
          dateTransactionsByQuantity.set(acceptedQuantity, result);
          return result;
        };
        const partialChoice = await openManualStockPartialMoveModal({
          allocation: move.allocation,
          date: intent.to.date,
          analysis,
          getDateOptions: async quantity => dateOptionsForQuantity(quantity).options
        });
        const acceptedQuantity = Math.floor(Number(partialChoice?.quantity || 0));
        if (!(acceptedQuantity > 0)) return;
        const remainderQuantity = Math.max(Math.floor(Number(move.allocation.quantity || 0)) - acceptedQuantity, 0);
        if (!(remainderQuantity > 0)) {
          const partialTransaction = runStockMove({ quantity: acceptedQuantity });
          if (!partialTransaction.accepted) throw new Error(partialTransaction.blockingIssues?.[0]?.message || 'Movimento recusado por estoque.');
          installAcceptedMove(partialTransaction);
          return;
        }
        const remainderDate = partialChoice?.remainderDate;
        if (!remainderDate) return;
        const cachedDates = dateOptionsForQuantity(acceptedQuantity);
        const splitTransaction = cachedDates.transactions.get(remainderDate)
          || runStockMove({ quantity: acceptedQuantity, remainderDate });
        if (!splitTransaction.accepted) throw new Error(splitTransaction.blockingIssues?.[0]?.message || 'A data escolhida nao possui estoque suficiente para o restante.');
        installAcceptedMove(splitTransaction);
      } catch (error) {
        productionCalendarVisualState = previousVisualState;
        const calendar = target.querySelector('.production-calendar-container');
        const presentation = error?.diagnosticPresentation || (error?.validation
          ? presentManualScheduleValidation(error.validation, {
              allocations: manualScheduleDraft?.allocations || [],
              materials,
              machines: currentProductionCalendarSnapshot()?.machines || [],
              operations: currentSimulation?.operations || [],
              locations
            })
          : null);
        renderManualScheduleRejection(calendar, presentation);
        throw error;
      } finally {
        productionCalendarMoveInProgress = false;
        setOperationLoading(false);
      }
    };
    function openFlowNodeDetailsModal(node) {
      const indexes = String(node?.dataset.flowProductionIndexes || '')
        .split(',')
        .map(value => Number(value))
        .filter(Number.isFinite);
      const productionItems = indexes.length ? indexes : [0];
      page.querySelector('.flow-node-details-modal')?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop flow-node-details-modal';
      backdrop.innerHTML = `
        <div class="modal flow-node-details-dialog" role="dialog" aria-modal="true" aria-labelledby="flow-node-details-title">
          <div class="modal-header">
            <div>
              <h2 id="flow-node-details-title">${escapeHtml(node?.dataset.flowMaterialName || 'Material')}</h2>
              <p class="modal-subtitle">${escapeHtml(node?.dataset.flowStatus || '')}</p>
            </div>
            <button class="secondary-button close-flow-node-details" type="button">Fechar</button>
          </div>
          <div class="flow-node-production-list">
            ${productionItems.map(index => `
              <span class="production-flow-legend-item" style="${productionThemeStyle(index, draft.productions[index]?.color)}">
                <span class="production-flow-legend-marker" aria-hidden="true"></span>
                Produ&ccedil;&atilde;o ${index + 1}
              </span>
            `).join('')}
          </div>
          <div class="flow-node-detail-grid">
            <article><span>Necess&aacute;rio</span><strong>${escapeHtml(node?.dataset.flowRequired || '0')} ${escapeHtml(node?.dataset.flowUnit || '')}</strong></article>
            <article><span>Saldo</span><strong>${escapeHtml(node?.dataset.flowStock || '0')} ${escapeHtml(node?.dataset.flowUnit || '')}</strong></article>
            <article><span>A produzir</span><strong>${escapeHtml(node?.dataset.flowProduce || '0')} ${escapeHtml(node?.dataset.flowUnit || '')}</strong></article>
          </div>
        </div>
      `;
      const close = () => backdrop.remove();
      backdrop.querySelector('.close-flow-node-details').addEventListener('click', close);
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close();
      });
      page.appendChild(backdrop);
      backdrop.querySelector('button')?.focus();
    }

    function focusFlowNodeInSchedule(flowNode) {
      try {
        return focusPlanningFlowAllocation({
          node: flowNode,
          allocations: currentProductionCalendarSnapshot()?.allocations,
          rendererHost: planningScheduleRendererHost
        });
      } catch (error) {
        console.warn('Nao foi possivel focar allocation do fluxo produtivo.', error);
        return false;
      }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        await withOperationLoading('Simulando planejamento...', simulateCurrent);
      } catch (error) {
        toast(error);
      }
    });

    bindPlanningFlowEvents({
      root: target,
      onActivateNode: ({ node: flowNode }) => {
        openFlowNodeDetailsModal(flowNode);
        focusFlowNodeInSchedule(flowNode);
      }
    });

    target.addEventListener('change', async event => {
      if (!event.target.matches('[data-stock-only]')) return;
      const checkbox = event.target;
      const requestedChecked = checkbox.checked;
      const snapshot = cloneDraftPlanningState();
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
        checkbox.disabled = true;
        const result = await applyAcceptedManualSimulation('Recalculando produção...', snapshot);
        if (!result) checkbox.checked = !requestedChecked;
      } catch (error) {
        restoreDraftPlanningState(snapshot);
        checkbox.checked = !requestedChecked;
        saveDraftNow();
        toast(error);
      } finally {
        if (checkbox.isConnected) checkbox.disabled = false;
      }
    });

    target.addEventListener('operation-card-drop', async event => {
      const detail = event.detail || {};
      const snapshot = cloneDraftPlanningState();
      try {
        applyDropPlanningChange(detail);
        await applyAcceptedManualSimulation('Replanejando produção...', snapshot);
      } catch (error) {
        restoreDraftPlanningState(snapshot);
        toast(error);
      }
    });

    target.addEventListener('operation-date-change', async event => {
      const snapshot = cloneDraftPlanningState();
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
        await applyAcceptedManualSimulation('Organizando produção...', snapshot);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-config-change', async event => {
      const snapshot = cloneDraftPlanningState();
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
        await applyAcceptedManualSimulation('Aplicando alteração...', snapshot);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-split-change', async event => {
      const snapshot = cloneDraftPlanningState();
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
        await applyAcceptedManualSimulation('Recalculando produção...', snapshot);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('operation-split-remove', async event => {
      const snapshot = cloneDraftPlanningState();
      const operationId = String(event.detail.operationId || event.detail.materialId || '');
      if (!operationId) return;
      draft.operationSplits = (draft.operationSplits || [])
        .filter(split => String(split.operationId) !== operationId);
      saveDraftNow();
      try {
        await applyAcceptedManualSimulation('Atualizando fluxo produtivo...', snapshot);
      } catch (error) {
        toast(error);
      }
    });

    target.addEventListener('calendar-team-capacity-change', async event => {
      const date = event.detail?.date;
      const overrides = event.detail?.overrides;
      if (!date || !overrides || typeof overrides !== 'object') return;
      const snapshot = cloneDraftPlanningState();
      draft.dailyTeamOverrides = draft.dailyTeamOverrides && typeof draft.dailyTeamOverrides === 'object' ? draft.dailyTeamOverrides : {};
      draft.dailyTeamOverrides[date] = {
        ...(draft.dailyTeamOverrides[date] || {}),
        ...overrides
      };
      saveDraftNow();
      try {
        await applyAcceptedManualSimulation('Recalculando produção...', snapshot);
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

    target.querySelector('[name="save"]')?.addEventListener('click', async () => {
      if (!canWritePlanning) return;
      try {
        let simulation = currentSimulation;
        if (manualScheduleDraft?.allocations?.length && currentSimulation) {
          const snapshot = buildProductionCalendarSnapshot(currentSimulation, { ignoreManualDraft: true });
          const validationTransaction = applyManualScheduleTransaction({
            currentDraft: manualScheduleDraft,
            intent: { type: 'VALIDATE_DRAFT' },
            draftContext: { validatedAt: new Date().toISOString() },
            validationContext: currentManualScheduleValidationContext(snapshot)
          });
          manualScheduleDraft = validationTransaction.draft;
          draft.manualScheduleDraft = manualScheduleDraft;
          if (!validationTransaction.accepted) {
            throw new Error(validationTransaction.blockingIssues?.[0]?.message || 'O calendário manual possui erros bloqueantes.');
          }
          refreshTimelineOnly();
        } else {
          simulation = await withOperationLoading('Recalculando produção...', simulateCurrent);
        }
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
              ${!isCanceledStatus(row.status) ? `<button class="small-action-button" data-open="${row.id}" type="button">Abrir calendário</button>` : ''}
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

    async function openPlan(id) {
      const detail = await api(`/planning/plans/${id}`);
      await reopenSavedPlan(detail);
    }

    target.querySelector('.refresh-history').addEventListener('click', () => loadHistory().catch(toast));
    historyTarget.addEventListener('click', async event => {
      if (event.target.dataset.pdf) return downloadPdf(event.target.dataset.pdf);
      if (event.target.dataset.cancel) return cancelPlan(event.target.dataset.cancel);
      if (event.target.dataset.open) return openPlan(event.target.dataset.open);
      if (event.target.dataset.view) return viewPlan(event.target.dataset.view);
    });
    await loadHistory();
  }

  async function render() {
    updatePageTitle();
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
