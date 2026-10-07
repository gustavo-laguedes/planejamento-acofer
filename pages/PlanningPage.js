import { api } from '../shared/api.js';
import { getCurrentUser } from '../shared/api.js';
import {
  buildProductionCalendarDayPresentation,
  buildProductionCalendarDayProductivity,
  addProductionCalendarDays,
  extendProductionCalendarDayRange
} from '../shared/production-calendar/productionCalendar.utils.js';
import { PlanningAllocationEditor } from '../shared/planning-editor/PlanningAllocationEditor.js';
import { ensurePlanningAllocationEditorCss } from '../shared/planning-editor/planningAllocationEditorCss.js';
import {
  adaptPlanningResultToScheduleSnapshot as adaptPlanningResultToProductionCalendar
} from '../shared/planning-schedule/planningScheduleAdapter.js';
import {
  fillPlanningScheduleDayRange as fillProductionCalendarDayRange
} from '../shared/planning-schedule/planningScheduleDay.js';
import {
  getProductionDisplayColor,
  getProductionDisplayFallbackColor,
  getProductionDisplayTheme,
  PRODUCTION_DISPLAY_PALETTE
} from '../shared/planning-presentation/productionDisplayColor.js';
import {
  buildPlanningScheduleViewModel,
  createGanttApsRenderer,
  createPlanningScheduleRendererHost
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
  buildLoadedPlanningManualScheduleState,
  savePlanningManualSchedule
} from '../shared/planning-controller/planningPersistenceController.js';
import {
  runPlanningManualMoveController
} from '../shared/planning-controller/planningManualMoveController.js';
import { runPlanningAllocationEditorController } from '../shared/planning-controller/planningAllocationEditorController.js';
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
import {
  businessDaysInclusive
} from '../services/workingDays.service.js';
import { createOperationOverlay, setInternalError, setInternalLoading } from '../shared/InternalLoading.js';
import { canAccess } from '../shared/rbac.js';
import { SummaryCards } from '../shared/SummaryCard.js';
import { PlanningStatusPill } from '../shared/StatusPill.js';
import {
  buildManualScheduleAllocationParts,
  buildManualScheduleUnallocationPlan,
  calculateProductivityDailyCapacity,
  createManualScheduleAllocation,
    createManualScheduleDraft,
  createManualScheduleTransport,
  normalizeManualSchedulePlannedReceipt,
  moveDraftAllocation
} from '../services/manualScheduleDraft.service.js';
import {
  applyManualScheduleTransaction,
  isManualScheduleValidationCompatible,
  MANUAL_SCHEDULE_VALIDATION_VERSION
} from '../services/manualScheduleTransaction.service.js';
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
  resolveMaterialProductivityLines,
  productivityMachineKeys,
  resolveProductivityConfiguration,
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

import {
  evaluatePlanningStockLimits
} from '../services/planningStockLimitGuard.service.js';

ensurePlanningAllocationEditorCss();

export {
  buildPlanningStockCalendarAlert,
  buildPlanningStockModalModel,
  getPlanningStockProjectionDay
} from '../shared/planning-controller/planningStockProjectionController.js';
const DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';
const RUNTIME_DRAFT_KEY = 'planejamento_acofer_planning_runtime_v1';
const STOCK_MINIMUM_DAYS_KEY = 'acofer.stock.minimumDays';
const PCP_IDEAL_DAYS_KEY = 'acofer.analysis.pcpIdealDays';
const DEFAULT_TEAM_AVAILABLE = 6;
const DEFAULT_MATRIX_TEAM_AVAILABLE = 2;
const DEFAULT_FEITAL_TEAM_AVAILABLE = 5;
const MANUAL_PLANNING_MODE = 'manual-foundation/v1';
const PLANNING_DEFAULT_LOCATION_ID = '__default__';
const MANUAL_PLANNING_REQUIRED_MACHINES = Object.freeze([
  {
    machineId: 'Trefila',
    machineName: 'Trefila',
    order: -2
  },
  {
    machineId: 'Transporte',
    machineName: 'Transporte',
    order: -1,
    logicalResource: true
  }
]);

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
  const fallback = 45;

  const value =
    String(
      localStorage.getItem(
        PCP_IDEAL_DAYS_KEY
      ) || ''
    ).trim();

  if (
    !/^\d+$/.test(value)
  ) {
    return fallback;
  }

  const days =
    Number(value);

  return Number.isInteger(days)
    &&
    days > 20
      ? days
      : fallback;
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

export function resolvePlanningDateRangeSelection(startDateValue, endDateValue, clickedDateValue) {
  const clickedDate = String(clickedDateValue || '').slice(0, 10);
  const currentStart = String(startDateValue || '').slice(0, 10);
  const currentEnd = String(endDateValue || '').slice(0, 10);
  if (!isValidDateOnly(clickedDate)) return {
    startDate: isValidDateOnly(currentStart) ? currentStart : '',
    endDate: isValidDateOnly(currentEnd) ? currentEnd : ''
  };
  if (!isValidDateOnly(currentStart)) return { startDate: clickedDate, endDate: '' };
  const hasRange = isValidDateOnly(currentEnd) && currentEnd >= currentStart;
  if (hasRange) {
    if (clickedDate === currentStart) return { startDate: currentEnd, endDate: '' };
    if (clickedDate === currentEnd) return { startDate: currentStart, endDate: '' };
    return { startDate: clickedDate, endDate: '' };
  }
  if (clickedDate === currentStart) return { startDate: currentStart, endDate: '' };
  return clickedDate < currentStart
    ? { startDate: clickedDate, endDate: currentStart }
    : { startDate: currentStart, endDate: clickedDate };
}

export function buildPlanningDateRangeDays(startDateValue, endDateValue = null) {
  let startDate = String(startDateValue || '').slice(0, 10);
  let endDate = String(endDateValue || startDateValue || '').slice(0, 10);
  if (!isValidDateOnly(startDate)) return [];
  if (!isValidDateOnly(endDate)) endDate = startDate;
  if (endDate < startDate) [startDate, endDate] = [endDate, startDate];
  const days = [];
  for (let date = startDate, guard = 0; date <= endDate && guard < 732; date = addProductionCalendarDays(date, 1), guard += 1) {
    const holiday = holidayForDate(date);
    const parsedDate = parseDateOnly(date);
    days.push({
      date,
      planned_date: date,
      label: formatDateOnly(date),
      weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)),
      isWorkingDay: !isWeekendDate(parsedDate) && !holiday,
      holiday: holiday || null
    });
  }
  return days;
}

function renderPlanningInlineCalendar(selectedStartDateValue, selectedEndDateValue = '', calendarMonthValue = '') {
  const selectedStartKey = isValidDateOnly(selectedStartDateValue)
    ? String(selectedStartDateValue).slice(0, 10)
    : today();
  const selectedEndKey = isValidDateOnly(selectedEndDateValue)
    && String(selectedEndDateValue).slice(0, 10) >= selectedStartKey
    ? String(selectedEndDateValue).slice(0, 10)
    : '';
  const monthKey = isValidDateOnly(calendarMonthValue)
    ? String(calendarMonthValue).slice(0, 10)
    : selectedStartKey;
  const selectedDate = parseDateOnly(monthKey);
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  const leadingDays = monthStart.getDay();
  const totalCells = Math.ceil((leadingDays + monthEnd.getDate()) / 7) * 7;
  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
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
    const hasRange = Boolean(selectedEndKey);
    const isRangeStart = dateKey === selectedStartKey;
    const isRangeEnd = hasRange && dateKey === selectedEndKey;
    const isInRange = hasRange && dateKey >= selectedStartKey && dateKey <= selectedEndKey;
    const isSingleSelected = !hasRange && isRangeStart;
    const dayClasses = [
      'planning-calendar-day',
      isWeekendDate(cellDate) ? 'is-weekend' : '',
      holiday ? 'is-holiday' : '',
      isInRange ? 'is-in-range' : '',
      isRangeStart && hasRange ? 'is-range-start' : '',
      isRangeEnd ? 'is-range-end' : '',
      isSingleSelected ? 'is-selected' : ''
    ].filter(Boolean).join(' ');
    const title = holiday?.name || (isWeekendDate(cellDate) ? 'Fim de semana' : `Selecionar ${formatDateOnly(dateKey)}`);
    return `
      <button class="${dayClasses}" type="button" data-planning-date="${dateKey}" aria-pressed="${isRangeStart || isRangeEnd}" title="${escapeHtml(title)}">
        <span>${dayNumber}</span>
      </button>
    `;
  });
  return `
    <input name="planningStartDate" type="hidden" value="${escapeHtml(selectedStartKey)}" required />
    <input name="planningEndDate" type="hidden" value="${escapeHtml(selectedEndKey)}" />
    <div class="planning-inline-calendar" aria-label="Calend&aacute;rio do per&iacute;odo do planejamento">
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
      <div class="planning-calendar-range-summary">
        <span>Per&iacute;odo selecionado</span>
        <strong>${selectedEndKey ? `${formatDateOnly(selectedStartKey)} at&eacute; ${formatDateOnly(selectedEndKey)}` : formatDateOnly(selectedStartKey)}</strong>
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

function normalizedPlanningMaterialName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function isPlanningCoilMaterial(material) {
  return normalizedPlanningMaterialName(material?.materialName || material?.material_name || material?.name).includes('bobina');
}

function isPlanningWireRodMaterial(material) {
  return normalizedPlanningMaterialName(material?.materialName || material?.material_name || material?.name).includes('fio maquina');
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
    matrixTeamAvailable: DEFAULT_MATRIX_TEAM_AVAILABLE,
    feitalTeamAvailable: DEFAULT_FEITAL_TEAM_AVAILABLE,
    teamAvailable: DEFAULT_MATRIX_TEAM_AVAILABLE + DEFAULT_FEITAL_TEAM_AVAILABLE
  };
}

function normalizeShiftTimes(shifts = []) {
  let cursor = timeToMinutes('07:00');
  return shifts.map((shift, index) => {
    const legacyTotal = defaultTeamAvailableForShift(shift.teamAvailable, index);
    const rawMatrix = Number(shift.matrixTeamAvailable);
    const matrixTeamAvailable = Number.isInteger(rawMatrix) && rawMatrix >= 0
      ? rawMatrix
      : DEFAULT_MATRIX_TEAM_AVAILABLE;
    const rawFeital = Number(shift.feitalTeamAvailable);
    const feitalTeamAvailable = Number.isInteger(rawFeital) && rawFeital >= 0
      ? rawFeital
      : Math.max(legacyTotal - matrixTeamAvailable, 0);
    const teamAvailable = matrixTeamAvailable + feitalTeamAvailable;
    const dailyMinutes = productiveMinutes(shift.hoursPerDay, index === 0 ? 8.8 : 6);
    const start = index === 0 ? timeToMinutes(shift.shiftStartTime || '07:00') : cursor;
    const normalized = {
      ...shift,
      matrixTeamAvailable,
      feitalTeamAvailable,
      teamAvailable,
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
  const hasConfiguredValue = value !== null && value !== undefined && value !== '';
  const available = Number(hasConfiguredValue ? value : DEFAULT_TEAM_AVAILABLE);
  if (!Number.isFinite(available)) return DEFAULT_TEAM_AVAILABLE;
  return Math.max(available, 0);
}

function numericQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function wholePlanningQuantity(value) {
  const quantity = numericQuantity(value);
  if (!(quantity > 0)) return 0;

  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quantity)) * 8;
  return Math.ceil(quantity - tolerance);
}

export function buildManualPlanningInitialDays(startDate, totalDays = 7) {
  const date = String(startDate || '').slice(0, 10);
  if (!isValidDateOnly(date)) return [];
  return Array.from({ length: Math.max(1, Number(totalDays) || 7) }, (_, index) => {
    const current = addProductionCalendarDays(date, index);
    const holiday = holidayForDate(current);
    return {
      date: current,
      planned_date: current,
      label: formatDateOnly(current),
      weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(`${current}T00:00:00Z`)),
      isWorkingDay: !isWeekendDate(parseDateOnly(current)) && !holiday,
      holiday: holiday || null
    };
  });
}

export function buildManualPlanningSchedulingResult(result = {}) {
  const summary = result?.summary || {};
  const startDate = summary.planningStartDate || summary.selectedDate || result?.planningStartDate || result?.selectedDate;
  const manualPlanningLocalStockSnapshot = result?.manualPlanningLocalStockSnapshot || buildPlanningLocalInitialStockSnapshot(result);
  return {
    ...result,
    manualPlanningMode: MANUAL_PLANNING_MODE,
    manualPlanningLocalStockSnapshot,
    calendarOperations: [],
    days: buildManualPlanningInitialDays(startDate, 7)
  };
}

export function buildPlanningProductivityMachineOptions(matrixRows = []) {
  const rows = Array.isArray(matrixRows) ? matrixRows : [];
  return rows
    .filter(row => row?.active !== false)
    .map((row, index) => {
      const machineId = row?.machine_id ?? row?.machineId ?? row?.machine_name ?? row?.machineName;
      const machineName = row?.machine_name ?? row?.machineName ?? row?.machine_id ?? row?.machineId;
      if (!machineId && !machineName) return null;
      return {
        machineId: String(machineId ?? machineName),
        machineName: String(machineName ?? machineId),
        order: Number.isFinite(Number(row?.machine_priority ?? row?.machinePriority))
          ? Number(row?.machine_priority ?? row?.machinePriority)
          : index
      };
    })
    .filter(Boolean);
}

function planningProductionNumber(
  production = {},
  fallbackIndex = 0
) {
  const number =
    Number(
      production?.productionNumber
    );

  return (
    Number.isInteger(number)
    &&
    number > 0
  )
    ? number
    : fallbackIndex + 1;
}


function productionTitleForManualCard(production = {}, fallbackIndex = 0) {
  const title = production.materialName || production.productionMaterialName || production.title || production.productionTitle || '';
  const material = production.materialName || production.productionMaterialName || '';
  const quantity = numericQuantity(production.plannedQty);
  const unit = production.plannedUnit || production.unit || '';
  const titleKey = normalizeText(title).toLocaleLowerCase('pt-BR');
  const materialKey = normalizeText(material).toLocaleLowerCase('pt-BR');
  const parts = [
    `Produção #${planningProductionNumber(production, fallbackIndex)}`,
    title,
    materialKey && titleKey && materialKey !== titleKey ? material : '',
    quantity > 0 ? `${formatPtBrDecimal(quantity)} ${unit}`.trim() : ''
  ].filter(Boolean);
  return parts.join(' • ');
}

function planningMaterialVisualRank(material = {}) {
  const name = normalizeText(material.materialName).toLocaleLowerCase('pt-BR');
  if (name.includes('bobina')) return 0;
  if (name.includes('longitudinal')) return 1;
  if (name.includes('transversal')) return 2;
  return 3;
}

function comparePlanningMaterialCards(left, right) {
  return (
    planningMaterialVisualRank(left) - planningMaterialVisualRank(right)
    || Number(left.sequence ?? left.productionOrder ?? Number.MAX_SAFE_INTEGER)
      - Number(right.sequence ?? right.productionOrder ?? Number.MAX_SAFE_INTEGER)
    || String(left.materialName).localeCompare(String(right.materialName), 'pt-BR', { numeric: true })
    || String(left.operationId).localeCompare(String(right.operationId), 'pt-BR', { numeric: true })
  );
}

function orderPlanningMaterialsByProductionSequence(materials = []) {
  const pending = new Map(materials.map(material => [String(material.operationId), material]));
  const emitted = new Set();
  const ordered = [];
  const emitReady = material => {
    emitted.add(String(material.operationId));
    ordered.push(material);
    pending.delete(String(material.operationId));
  };

  while (pending.size) {
    const ready = [...pending.values()]
      .filter(material => (material.dependencyOperationIds || [])
        .every(operationId => emitted.has(String(operationId)) || !pending.has(String(operationId))))
      .sort(comparePlanningMaterialCards);
    if (!ready.length) {
      [...pending.values()].sort(comparePlanningMaterialCards).forEach(emitReady);
      break;
    }
    ready.forEach(emitReady);
  }

  return ordered;
}

function planningMaterialOperationKey(value = {}) {
  return String(value.operationId || value.parentOperationId || value.calendarParentOperationId || value.materialId || '');
}

function planningMaterialDependencyKey(value = {}) {
  return String(value.parentOperationId || value.consumerParentOperationId || value.targetParentOperationId || value.operationId || value.id || '')
    .replace(/:day-\d+$/i, '');
}

function planningMaterialId(value = {}) {
  return String(
    value?.materialId
    ?? value?.material_id
    ?? value?.id
    ?? ''
  ).trim();
}

function planningExplicitLocationId(value = {}) {
  const nestedLocation =
    value?.location
    && typeof value.location === 'object'
      ? value.location
      : {};

  return String(
    value?.locationId
    ?? value?.location_id
    ?? value?.localId
    ?? value?.local_id
    ?? value?.sourceLocation
    ?? value?.sourceLocationId
    ?? value?.originLocationId
    ?? value?.targetLocation
    ?? value?.targetLocationId
    ?? value?.destinationLocationId
    ?? (
      typeof value?.location === 'object'
        ? undefined
        : value?.location
    )
    ?? nestedLocation?.locationId
    ?? nestedLocation?.location_id
    ?? nestedLocation?.id
    ?? ''
  ).trim();
}


function planningMachineLocationId(machine = {}) {
  const nestedLocation =
    machine?.location
    && typeof machine.location === 'object'
      ? machine.location
      : {};

  return String(
    machine?.locationId
    ?? machine?.location_id
    ?? machine?.localId
    ?? machine?.local_id
    ?? machine?.branchId
    ?? machine?.branch_id
    ?? machine?.plantId
    ?? machine?.plant_id
    ?? machine?.siteId
    ?? machine?.site_id
    ?? (
      typeof machine?.location === 'object'
        ? undefined
        : machine?.location
    )
    ?? nestedLocation?.locationId
    ?? nestedLocation?.location_id
    ?? nestedLocation?.id
    ?? ''
  ).trim();
}


function planningMachineIdentityKeys(value = {}) {
  return [
    value?.machineId,
    value?.machine_id,
    value?.machineName,
    value?.machine_name,
    value?.id,
    value?.name
  ]
    .map(item =>
      normalizeText(item)
        .replace(/[\s-]+/g, '')
    )
    .filter(Boolean);
}


function planningMachineForAllocation(
  allocation = {},
  machines = []
) {
  const allocationKeys =
    new Set(
      planningMachineIdentityKeys(
        allocation
      )
    );

  if (!allocationKeys.size) {
    return null;
  }

  return (
    Array.isArray(machines)
      ? machines
      : []
  ).find(machine => (
    planningMachineIdentityKeys(machine)
      .some(key =>
        allocationKeys.has(key)
      )
  )) || null;
}


function planningAllocationLocationId(
  allocation = {},
  machines = []
) {
  const explicit =
    planningExplicitLocationId(
      allocation
    );

  if (explicit) {
    return explicit;
  }

  return (
    planningMachineLocationId(
      planningMachineForAllocation(
        allocation,
        machines
      )
    )
    || PLANNING_DEFAULT_LOCATION_ID
  );
}


function planningLocalStockKey(
  materialId,
  locationId = PLANNING_DEFAULT_LOCATION_ID
) {
  return `${
    String(materialId || '')
  }\u0000${
    String(
      locationId
      || PLANNING_DEFAULT_LOCATION_ID
    )
  }`;
}


function planningLocalStockEntry(
  map,
  materialId,
  locationId = PLANNING_DEFAULT_LOCATION_ID,
  seed = {}
) {
  const key =
    planningLocalStockKey(
      materialId,
      locationId
    );

  const current =
    map.get(key)
    || {
      materialId:
        String(materialId || ''),

      locationId:
        String(
          locationId
          || PLANNING_DEFAULT_LOCATION_ID
        ),

      materialCode:
        String(
          seed?.materialCode
          || seed?.material_code
          || seed?.code
          || ''
        ),

      materialName:
        String(
          seed?.materialName
          || seed?.material_name
          || seed?.name
          || materialId
          || ''
        ),

      unit:
        String(
          seed?.unit
          || seed?.primaryUnit
          || seed?.primary_unit
          || ''
        ),

      quantity:
        0
    };

  map.set(
    key,
    current
  );

  return current;
}

function planningLocalStockQuantity(
  map,
  materialId,
  locationId = PLANNING_DEFAULT_LOCATION_ID
) {
  return numericQuantity(
    map
      ?.get?.(
        planningLocalStockKey(
          materialId,
          locationId
        )
      )
      ?.quantity
  );
}


function planningMaterialAvailableQuantity({
  availability,
  materialId,
  targetLocationIds = []
} = {}) {
  const normalizedMaterialId =
    String(materialId || '').trim();

  if (!normalizedMaterialId) {
    return 0;
  }

  const normalizedTargetLocations =
    [
      ...new Set(
        (
          Array.isArray(targetLocationIds)
            ? targetLocationIds
            : []
        )
          .map(value =>
            String(value || '').trim()
          )
          .filter(Boolean)
      )
    ];

  /*
   * Sem local resolvido, preserva o fallback
   * agregado legado.
   *
   * Quando sabemos o local produtivo, a regra
   * passa a ser obrigatoriamente:
   *
   * material + local
   */
  if (!normalizedTargetLocations.length) {
    return numericQuantity(
      availability
        ?.availableByMaterial
        ?.get(normalizedMaterialId)
        ?.quantity
    );
  }

  const shared =
    planningLocalStockQuantity(
      availability
        ?.availableByMaterialLocation,

      normalizedMaterialId,

      PLANNING_DEFAULT_LOCATION_ID
    );

  /*
   * Não soma locais diferentes.
   *
   * Se uma operação puder ser executada em
   * mais de um local, usa o melhor saldo de
   * um único local.
   */
  return Math.max(
    ...normalizedTargetLocations
      .map(locationId => (
        planningLocalStockQuantity(
          availability
            ?.availableByMaterialLocation,

          normalizedMaterialId,

          locationId
        )

        + (
          locationId
            === PLANNING_DEFAULT_LOCATION_ID
            ? 0
            : shared
        )
      )),

    0
  );
}

function addPlanningLocalStockQuantity(map, item = {}) {
  const materialId = planningMaterialId(item);
  const quantity = Math.max(numericQuantity(item.stockUsedQty ?? item.quantity ?? item.openingStock), 0);
  if (!materialId || !(quantity > 0)) return;
  const current = map.get(materialId) || {
    materialId,
    materialCode: String(item.materialCode || item.material_code || item.code || ''),
    materialName: String(item.materialName || item.material_name || item.name || materialId),
    unit: String(item.unit || item.primaryUnit || item.primary_unit || ''),
    quantity: 0
  };
  current.quantity = Number((current.quantity + quantity).toFixed(6));
  map.set(materialId, current);
}

function collectPlanningTreeStockNodes(tree, callback) {
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    callback(node);
    (Array.isArray(node.children) ? node.children : []).forEach(visit);
  };
  if (Array.isArray(tree)) tree.forEach(visit);
  else visit(tree);
}

export function buildPlanningLocalInitialStockSnapshot(
  result = {}
) {
  const byProductionMaterialLocation =
    new Map();

  const byMaterialLocation =
    new Map();

  const tree =
    result?.tree
    || result?.scheduleTree
    || result?.schedule_tree;

  /*
   * Continua valendo a regra antiga:
   *
   * dentro da mesma produção/material usamos
   * o maior stockUsedQty para evitar duplicação
   * da árvore recursiva.
   *
   * Agora o LOCAL também faz parte da chave.
   */
  collectPlanningTreeStockNodes(
    tree,
    node => {
      const materialId =
        planningMaterialId(node);

      const quantity =
        Math.max(
          numericQuantity(
            node?.stockUsedQty
          ),
          0
        );

      if (
        !materialId
        || !(quantity > 0)
      ) {
        return;
      }

      const productionIndex =
        String(
          node?.productionIndex
          ?? ''
        );

      const explicitLocationId =
        planningExplicitLocationId(
          node
        );

      const locationKey =
        explicitLocationId
        || PLANNING_DEFAULT_LOCATION_ID;

      const key =
        `${productionIndex}|${materialId}|${locationKey}`;

      const current =
        byProductionMaterialLocation.get(
          key
        );

      if (
        !current
        || quantity > current.quantity
      ) {
        byProductionMaterialLocation.set(
          key,
          {
            materialId,

            ...(explicitLocationId
              ? {
                  locationId:
                    explicitLocationId
                }
              : {}),

            materialCode:
              String(
                node?.materialCode
                || node?.material_code
                || ''
              ),

            materialName:
              String(
                node?.materialName
                || node?.material_name
                || materialId
              ),

            unit:
              String(
                node?.unit
                || ''
              ),

            quantity
          }
        );
      }
    }
  );

  /*
   * Soma as produções diferentes,
   * preservando o local.
   */
  byProductionMaterialLocation
    .forEach(item => {
      const locationId =
        planningExplicitLocationId(
          item
        )
        || PLANNING_DEFAULT_LOCATION_ID;

      const current =
        planningLocalStockEntry(
          byMaterialLocation,
          item.materialId,
          locationId,
          item
        );

      current.quantity =
        Number(
          (
            numericQuantity(
              current.quantity
            )
            + numericQuantity(
              item.quantity
            )
          ).toFixed(6)
        );
    });

  /*
   * Fallback para snapshots/testes
   * sem árvore detalhada.
   */
  if (!byMaterialLocation.size) {
    (
      Array.isArray(result?.operations)
        ? result.operations
        : []
    ).forEach(operation => {
      const materialId =
        planningMaterialId(
          operation
        );

      const quantity =
        Math.max(
          numericQuantity(
            operation?.stockUsedQty
            ?? operation?.quantity
            ?? operation?.openingStock
          ),
          0
        );

      if (
        !materialId
        || !(quantity > 0)
      ) {
        return;
      }

      const explicitLocationId =
        planningExplicitLocationId(
          operation
        );

      const locationId =
        explicitLocationId
        || PLANNING_DEFAULT_LOCATION_ID;

      const current =
        planningLocalStockEntry(
          byMaterialLocation,
          materialId,
          locationId,
          operation
        );

      current.quantity =
        Number(
          (
            numericQuantity(
              current.quantity
            )
            + quantity
          ).toFixed(6)
        );
    });
  }

  /*
   * Mantemos também a visão agregada antiga,
   * para não quebrar consumidores legados.
   */
  const byMaterial =
    new Map();

  byMaterialLocation
    .forEach(item => {
      const current =
        byMaterial.get(
          item.materialId
        )
        || {
          materialId:
            item.materialId,

          materialCode:
            item.materialCode,

          materialName:
            item.materialName,

          unit:
            item.unit,

          quantity:
            0
        };

      current.quantity =
        Number(
          (
            numericQuantity(
              current.quantity
            )
            + numericQuantity(
              item.quantity
            )
          ).toFixed(6)
        );

      byMaterial.set(
        item.materialId,
        current
      );
    });

  /*
   * Se o snapshot original ainda não sabe
   * o local, NÃO gravamos locationId.
   *
   * Isso mantém o comportamento legado
   * do estoque físico congelado enquanto
   * o módulo Estoque ainda não foi revisto.
   */
  const stock =
    [...byMaterialLocation.values()]
      .map(item => ({
        materialId:
          item.materialId,

        ...(
          item.locationId
          && item.locationId
            !== PLANNING_DEFAULT_LOCATION_ID
            ? {
                locationId:
                  item.locationId
              }
            : {}
        ),

        materialCode:
          item.materialCode,

        materialName:
          item.materialName,

        unit:
          item.unit,

        quantity:
          item.quantity
      }));

  return {
    source:
      'simulation.stockUsedQty',

    stock,

    byMaterial:
      Object.fromEntries(
        [...byMaterial.entries()]
          .map(
            ([key, item]) => [
              key,
              { ...item }
            ]
          )
      ),

    byMaterialLocation:
      Object.fromEntries(
        [...byMaterialLocation.entries()]
          .map(
            ([key, item]) => [
              key,
              { ...item }
            ]
          )
      )
  };
}

function planningMaterialRequirementsByConsumer(
  operations = [],
  tree = null
) {
  const byConsumer = new Map();

  /*
   * Primeiro usamos as dependências explícitas
   * das operações, quando elas existirem.
   */
  (Array.isArray(operations) ? operations : [])
    .forEach(operation => {

      const sourceRequirements = (
        Array.isArray(
          operation.dependencyRequirements
        )
          ? operation.dependencyRequirements
          : []
      )
        .map(requirement => ({
          ...requirement,

          materialId:
            planningMaterialId(
              requirement
            ),

          requiredQuantity:
            numericQuantity(
              requirement?.requiredQuantity
              ?? requirement?.requiredQty
              ?? requirement?.quantity
            ),

          unit:
            String(
              requirement?.unit
              || operation.unit
              || ''
            )
        }))
        .filter(requirement => (
          requirement.materialId
          &&
          requirement.requiredQuantity > 0
        ));


      const breakdown =
        Array.isArray(
          operation.productionBreakdown
        )
        &&
        operation.productionBreakdown.length

          ? operation.productionBreakdown

          : [operation];


      const breakdownTotal =
        breakdown.reduce(
          (sum, part) =>
            sum
            +
            planningMaterialOperationQuantity(
              operation,
              part
            ),
          0
        );


      breakdown.forEach(part => {

        const consumerId =
          String(
            part?.operationId
            ||
            planningMaterialDependencyKey(
              operation
            )
          );


        if (
          !consumerId
          ||
          !sourceRequirements.length
        ) {
          return;
        }


        const partQuantity =
          planningMaterialOperationQuantity(
            operation,
            part
          );


        const ratio =
          breakdownTotal > 0
            ? partQuantity / breakdownTotal
            : 1;


        const rows =
          sourceRequirements
            .map(
              (requirement, index) => {

                const productionIndex =
                  part?.productionIndex
                  ??
                  operation?.productionIndex
                  ??
                  0;


                const producerOperationId =
                  `${productionIndex}:${requirement.materialId}`;


                return {
                  dependencyId:
                    String(
                      requirement?.dependencyId
                      ||
                      requirement?.id
                      ||
                      `dependency:${consumerId}:${index + 1}`
                    ),

                  producerParentOperationId:
                    producerOperationId,

                  operationId:
                    producerOperationId,

                  consumerParentOperationId:
                    consumerId,

                  materialId:
                    requirement.materialId,

                  requiredQuantity:
                    Number(
                      (
                        requirement.requiredQuantity
                        *
                        ratio
                      ).toFixed(6)
                    ),

                  unit:
                    requirement.unit
                };
              }
            )
            .filter(
              requirement =>
                requirement.requiredQuantity > 0
            );


        if (rows.length) {
          byConsumer.set(
            consumerId,
            rows
          );
        }
      });
    });


  /*
   * FALLBACK:
   *
   * Quando o predecessor foi totalmente
   * atendido por estoque, algumas operações
   * não vêm com dependencyRequirements.
   *
   * A árvore continua sabendo que:
   *
   * Longitudinal
   *     ↓ precisa
   * CA60 Bobina
   *
   * Então recuperamos essa relação daqui.
   *
   * Só usamos a árvore quando a operação
   * ainda não possui dependência explícita.
   */
  const visitTree =
    node => {

      if (
        !node
        ||
        typeof node !== 'object'
      ) {
        return;
      }


      const productionIndex =
        Number(
          node?.productionIndex
          ?? 0
        );


      const consumerMaterialId =
        planningMaterialId(
          node
        );


      const consumerId =
        String(
          node?.operationId

          ||

          (
            consumerMaterialId
              ? `${productionIndex}:${consumerMaterialId}`
              : ''
          )
        );


      const children =
        Array.isArray(
          node.children
        )
          ? node.children
          : [];


      if (
        consumerId
        &&
        children.length
      ) {

        const rows =
          children
            .map(
              (child, index) => {

                const materialId =
                  planningMaterialId(
                    child
                  );


                const requiredQuantity =
                  numericQuantity(
                    child?.requiredQuantity
                    ??
                    child?.requiredQty
                    ??
                    child?.quantity
                    ??
                    child?.produceQty
                    ??
                    child?.stockUsedQty
                  );


                if (
                  !materialId
                  ||
                  !(requiredQuantity > 0)
                ) {
                  return null;
                }


                const childProductionIndex =
                  Number(
                    child?.productionIndex
                    ??
                    productionIndex
                  );


                const producerOperationId =
                  String(
                    child?.operationId
                    ||
                    `${childProductionIndex}:${materialId}`
                  );


                return {
                  dependencyId:
                    `tree-dependency:${consumerId}:${index + 1}`,

                  producerParentOperationId:
                    producerOperationId,

                  operationId:
                    producerOperationId,

                  consumerParentOperationId:
                    consumerId,

                  materialId,

                  requiredQuantity:
                    Number(
                      requiredQuantity
                        .toFixed(6)
                    ),

                  unit:
                    String(
                      child?.unit
                      ||
                      node?.unit
                      ||
                      ''
                    )
                };
              }
            )
            .filter(Boolean);


        const existingRows =
          byConsumer.get(
            consumerId
          )
          || [];


        const existingMaterialIds =
          new Set(
            existingRows
              .map(requirement =>
                String(
                  requirement?.materialId
                  || ''
                ).trim()
              )
              .filter(Boolean)
          );


        const missingRows =
          rows.filter(requirement => {
            const materialId =
              String(
                requirement?.materialId
                || ''
              ).trim();

            if (
              !materialId
              || existingMaterialIds.has(
                materialId
              )
            ) {
              return false;
            }

            existingMaterialIds.add(
              materialId
            );

            return true;
          });


        if (missingRows.length) {
          byConsumer.set(
            consumerId,
            [
              ...existingRows,
              ...missingRows
            ]
          );
        }
      }


      children.forEach(
        visitTree
      );
    };


  if (Array.isArray(tree)) {

    tree.forEach(
      visitTree
    );

  } else {

    visitTree(
      tree
    );
  }


  return byConsumer;
}

function planningMaterialOperationQuantities(operations = []) {
  const byConsumer = new Map();

  (Array.isArray(operations) ? operations : []).forEach(operation => {
    const breakdown =
      Array.isArray(operation.productionBreakdown)
      && operation.productionBreakdown.length
        ? operation.productionBreakdown
        : [operation];

    breakdown.forEach(part => {
      const key = String(
        part?.operationId || planningMaterialDependencyKey(operation)
      );

      const quantity =
        planningMaterialOperationQuantity(operation, part);

      if (key && quantity > 0) {
        byConsumer.set(key, quantity);
      }
    });
  });

  return byConsumer;
}

function buildPlanningLocalStockAvailability({
  result = {},
  allocations = [],
  transports = [],
  plannedReceipts = [],
  machines = [],
  asOfDate = null
} = {}) {
  const operations =
    Array.isArray(result?.operations)
      ? result.operations
      : [];

  const initialSnapshot =
    result
      ?.manualPlanningLocalStockSnapshot
    || buildPlanningLocalInitialStockSnapshot(
      result
    );

  /*
   * CHAVE NOVA:
   *
   * materialId + local
   */
  const availableByMaterialLocation =
    new Map();

  (
    Array.isArray(
      initialSnapshot.stock
    )
      ? initialSnapshot.stock
      : []
  ).forEach(item => {
    const materialId =
      planningMaterialId(item);

    const quantity =
      Math.max(
        numericQuantity(
          item?.quantity
        ),
        0
      );

    if (
      !materialId
      || !(quantity > 0)
    ) {
      return;
    }

    /*
     * Estoque físico antigo sem local
     * permanece em __default__.
     */
    const locationId =
      planningExplicitLocationId(
        item
      )
      || PLANNING_DEFAULT_LOCATION_ID;

    const current =
      planningLocalStockEntry(
        availableByMaterialLocation,
        materialId,
        locationId,
        item
      );

    current.quantity =
      Number(
        (
          numericQuantity(
            current.quantity
          )
          + quantity
        ).toFixed(6)
      );
  });

  const requirementsByConsumer =
  planningMaterialRequirementsByConsumer(
    operations,

    result?.tree
    || result?.scheduleTree
    || result?.schedule_tree
  );

  const operationQuantityByConsumer =
    planningMaterialOperationQuantities(
      operations
    );

  const normalizedAsOfDate =
    isValidDateOnly(asOfDate)
      ? String(
          asOfDate
        ).slice(0, 10)
      : null;

  const sourceAllocations =
    Array.isArray(allocations)
      ? allocations
      : [];

    const sourceTransports =
    Array.isArray(transports)
      ? transports
      : [];

  const sourcePlannedReceipts =
    Array.isArray(plannedReceipts)
      ? plannedReceipts
      : [];

  /*
   * Vamos processar tudo cronologicamente:
   *
   * 10 = produção disponível
   * 20 = saída do transporte
   * 21 = chegada/liberação
   * 30 = consumo/reserva
   *
   * Assim:
   *
   * Bobina produzida 10/09
   * → disponível 11/09
   *
   * Transporte começa 11/09
   * → pode pegar essa Bobina
   *
   * Longitudinal começa 11/09
   * → já enxerga a Bobina transportada.
   */
    const events = [];

  /*
   * Produção feita no próprio dia pode ser
   * usada por um transporte programado para
   * esse mesmo dia.
   *
   * Essa quantidade NÃO vira saldo normal
   * para as outras produções no mesmo dia.
   *
   * É uma exceção exclusiva do transporte,
   * considerando que ele pode ocorrer após
   * o expediente.
   */
  const sameDayProductionByTransportKey =
    new Map();

  const sameDayProductionUsedByTransport =
    new Map();

    sourceAllocations
    .forEach(allocation => {
      const allocationDate =
        String(
          allocation?.date
          || ''
        ).slice(0, 10);

      const hasAllocationDate =
        isValidDateOnly(
          allocationDate
        );

      /*
       * Uma allocation sem data ainda deve
       * reservar seus materiais.
       *
       * Isso é importante tanto para drafts
       * legados quanto para o modelo puro
       * dos cards.
       *
       * Porém ela NÃO pode gerar produção
       * disponível em D+1 sem possuir uma
       * data válida.
       */
      const materialId =
        planningMaterialId(
          allocation
        );

      const quantity =
        numericQuantity(
          allocation?.quantity
        );

           if (
        hasAllocationDate
        && materialId
        && quantity > 0
      ) {
        const productionLocationId =
          planningAllocationLocationId(
            allocation,
            machines
          );

        /*
         * Pool especial que só o transporte
         * pode usar no próprio dia.
         */
        const transportProductionKey =
          `${allocationDate}\u0000${materialId}\u0000${productionLocationId}`;

        sameDayProductionByTransportKey.set(
          transportProductionKey,
          Number(
            (
              numericQuantity(
                sameDayProductionByTransportKey.get(
                  transportProductionKey
                )
              )
              + quantity
            ).toFixed(6)
          )
        );

        /*
         * Para o estoque normal continua D+1.
         */
        events.push({
          type:
            'PRODUCTION_AVAILABLE',

          date:
            addProductionCalendarDays(
              allocationDate,
              1
            ),

          /*
           * Guardamos o dia em que realmente
           * foi produzido para não contar de
           * novo em D+1 caso tenha sido
           * transportado no próprio dia.
           */
          productionDate:
            allocationDate,

          priority:
            10,

          materialId,

          locationId:
            productionLocationId,

          quantity,

          seed:
            allocation
        });
      }

      /*
       * Reserva/consumo dos predecessores
       * desta allocation.
       */
      const components =
        Array.isArray(
          allocation?.components
        )
        && allocation.components.length
          ? allocation.components
          : [{
              parentOperationId:
                planningMaterialDependencyKey(
                  allocation
                ),

              quantity:
                allocation?.quantity
            }];

      components.forEach(
        component => {
          const parentId =
            planningMaterialDependencyKey(
              component
            )
            || planningMaterialDependencyKey(
              allocation
            );

          const parentTotal =
            numericQuantity(
              operationQuantityByConsumer
                .get(
                  parentId
                )
            );

          const componentQty =
            numericQuantity(
              component?.quantity
            );

          if (
            !parentId
            || !(parentTotal > 0)
            || !(componentQty > 0)
          ) {
            return;
          }

          (
            requirementsByConsumer
              .get(parentId)
            || []
          ).forEach(
            requirement => {
              const reservedQuantity =
                requirement.requiredQuantity
                * (
                  componentQty
                  / parentTotal
                );

              if (
                !(reservedQuantity > 0)
              ) {
                return;
              }

              events.push({
                type:
                  'CONSUMPTION',

                                date:
                  hasAllocationDate
                    ? allocationDate
                    : (
                        normalizedAsOfDate
                        || '0000-01-01'
                      ),

                priority:
                  30,

                materialId:
                  requirement.materialId,

                /*
                 * Consome no local da máquina
                 * que está produzindo.
                 */
                locationId:
                  planningAllocationLocationId(
                    allocation,
                    machines
                  ),

                quantity:
                  reservedQuantity,

                seed:
                  requirement
              });
            }
          );
        }
      );
    });

  /*
   * TRANSPORTES
   */
  sourceTransports
    .forEach(
      (transport, index) => {
        const startDate =
          String(
            transport?.startDate
            ?? transport?.date
            ?? ''
          ).slice(0, 10);

        const endDate =
          String(
            transport?.endDate
            ?? startDate
          ).slice(0, 10);

                /*
         * O material transportado só entra
         * no saldo do DESTINO a partir da
         * DATA FINAL do transporte.
         */
        const arrivalDate =
          endDate;

        const materialId =
          planningMaterialId(
            transport
          );

        const quantity =
          numericQuantity(
            transport?.quantity
          );

        const sourceLocation =
          String(
            transport?.sourceLocation
            ?? transport?.sourceLocationId
            ?? transport?.originLocationId
            ?? ''
          ).trim();

        const targetLocation =
          String(
            transport?.targetLocation
            ?? transport?.targetLocationId
            ?? transport
              ?.destinationLocationId
            ?? ''
          ).trim();

        const transportKey =
          String(
            transport?.transportId
            ?? transport?.id
            ?? `transport-${index + 1}`
          );

        if (
          !isValidDateOnly(startDate)
          || !isValidDateOnly(
            arrivalDate
          )
          || !materialId
          || !(quantity > 0)
          || !sourceLocation
          || !targetLocation
        ) {
          return;
        }

        /*
         * A mercadoria sempre sai da origem
         * na data inicial.
         */
        events.push({
          type:
            'TRANSPORT_DISPATCH',

          date:
            startDate,

          priority:
            20,

          transportKey,

          materialId,

          sourceLocation,

          targetLocation,

          quantity,

          seed:
            transport
        });

        /*
         * availabilityMode=start:
         * chegada lógica no mesmo dia.
         *
         * availabilityMode=end:
         * chegada no final.
         */
        events.push({
          type:
            'TRANSPORT_ARRIVAL',

          date:
            arrivalDate,

          priority:
            21,

          transportKey,

          materialId,

          sourceLocation,

          targetLocation,

          quantity,

          seed:
            transport
        });
      }
    );

   /*
   * ENTRADAS PREVISTAS
   *
   * A compra chega em arrivalDate,
   * mas só entra como saldo utilizável
   * no dia seguinte.
   */
  sourcePlannedReceipts
    .forEach(
      (receipt, index) => {
        const normalized =
          normalizeManualSchedulePlannedReceipt(
            receipt,
            index
          );

        if (
          !normalized.materialId
          || !normalized.locationId
          || !(normalized.quantity > 0)
          || !isValidDateOnly(
            normalized.availableDate
          )
        ) {
          return;
        }

                events.push({
          type:
            'PLANNED_RECEIPT',

          date:
            normalized.availableDate,

          priority:
            5,

          materialId:
            normalized.materialId,

          locationId:
            normalized.locationId,

          quantity:
            normalized.quantity,

          seed:
            normalized
        });
      }
    );


  const dispatchedByTransport =
    new Map();


  events
    .filter(event => (
      !normalizedAsOfDate
      || event.date
        <= normalizedAsOfDate
    ))

            .sort(
      (left, right) => (
        left.date.localeCompare(
          right.date
        )

        || left.priority
          - right.priority

        || String(
          left.materialId
        ).localeCompare(
          String(
            right.materialId
          )
        )
      )
    )

    .forEach(event => {
            /*
       * PRODUÇÃO D → disponível D+1 para
       * produção normal.
       *
       * Porém, se uma parte dessa produção
       * já saiu num transporte no próprio
       * dia D, ela NÃO pode reaparecer aqui.
       */
      if (
        event.type
        === 'PRODUCTION_AVAILABLE'
      ) {
        const current =
          planningLocalStockEntry(
            availableByMaterialLocation,
            event.materialId,
            event.locationId,
            event.seed
          );

        const transportProductionKey =
          `${String(
            event.productionDate || ''
          )}\u0000${event.materialId}\u0000${event.locationId}`;

        const alreadyTransportedSameDay =
          Math.max(
            numericQuantity(
              sameDayProductionUsedByTransport.get(
                transportProductionKey
              )
            ),
            0
          );

        const transportedFromThisEvent =
          Math.min(
            event.quantity,
            alreadyTransportedSameDay
          );

        const quantityToRelease =
          Math.max(
            event.quantity
            - transportedFromThisEvent,
            0
          );

        /*
         * Vamos consumindo o valor transportado
         * conforme cada allocation produtiva
         * chega no D+1.
         */
        if (
          transportedFromThisEvent > 0
        ) {
          sameDayProductionUsedByTransport.set(
            transportProductionKey,
            Number(
              (
                alreadyTransportedSameDay
                - transportedFromThisEvent
              ).toFixed(6)
            )
          );
        }

        current.quantity =
          Number(
            (
              numericQuantity(
                current.quantity
              )
              + quantityToRelease
            ).toFixed(6)
          );

        return;
      }


      /*
       * Entrada prevista de compra continua
       * entrando normalmente na data disponível.
       */
      if (
        event.type
        === 'PLANNED_RECEIPT'
      ) {
        const current =
          planningLocalStockEntry(
            availableByMaterialLocation,
            event.materialId,
            event.locationId,
            event.seed
          );

        current.quantity =
          Number(
            (
              numericQuantity(
                current.quantity
              )
              + event.quantity
            ).toFixed(6)
          );

        return;
      }

      /*
       * TRANSPORTE:
       * retira da origem.
       *
       * Se por algum motivo o draft estiver
       * inconsistente, nunca inventamos saldo.
       */
            if (
        event.type
        === 'TRANSPORT_DISPATCH'
      ) {
        const source =
          planningLocalStockEntry(
            availableByMaterialLocation,
            event.materialId,
            event.sourceLocation,
            event.seed
          );

        /*
         * Primeiro usamos aquilo que já
         * existia fisicamente na origem.
         */
        const physicalAvailable =
          Math.max(
            numericQuantity(
              source.quantity
            ),
            0
          );

        const physicalMovable =
          Math.min(
            physicalAvailable,
            event.quantity
          );


        /*
         * Depois podemos complementar com
         * aquilo que foi produzido no próprio
         * dia na mesma origem.
         */
        const transportProductionKey =
          `${event.date}\u0000${event.materialId}\u0000${event.sourceLocation}`;

        const producedSameDay =
          Math.max(
            numericQuantity(
              sameDayProductionByTransportKey.get(
                transportProductionKey
              )
            ),
            0
          );

        const alreadyUsedSameDay =
          Math.max(
            numericQuantity(
              sameDayProductionUsedByTransport.get(
                transportProductionKey
              )
            ),
            0
          );

        const producedSameDayAvailable =
          Math.max(
            producedSameDay
            - alreadyUsedSameDay,
            0
          );

        const sameDayMovable =
          Math.min(
            Math.max(
              event.quantity
              - physicalMovable,
              0
            ),
            producedSameDayAvailable
          );

        const movable =
          Number(
            (
              physicalMovable
              + sameDayMovable
            ).toFixed(6)
          );


        if (
          sameDayMovable > 0
        ) {
          sameDayProductionUsedByTransport.set(
            transportProductionKey,
            Number(
              (
                alreadyUsedSameDay
                + sameDayMovable
              ).toFixed(6)
            )
          );
        }


        dispatchedByTransport.set(
          event.transportKey,
          movable
        );


        if (!(movable > 0)) {
          return;
        }


        /*
         * Aqui descontamos somente o estoque
         * que já existia fisicamente.
         *
         * A parte produzida no próprio dia será
         * abatida do PRODUCTION_AVAILABLE de D+1
         * pela regra que colocamos acima.
         */
        source.quantity =
          Number(
            Math.max(
              physicalAvailable
              - physicalMovable,
              0
            ).toFixed(6)
          );

        return;
      }

      /*
       * TRANSPORTE:
       * disponibiliza no destino.
       */
      if (
        event.type
        === 'TRANSPORT_ARRIVAL'
      ) {
        const movable =
          numericQuantity(
            dispatchedByTransport
              .get(
                event.transportKey
              )
          );

        if (!(movable > 0)) {
          return;
        }

        const target =
          planningLocalStockEntry(
            availableByMaterialLocation,
            event.materialId,
            event.targetLocation,
            event.seed
          );

        target.quantity =
          Number(
            (
              numericQuantity(
                target.quantity
              )
              + movable
            ).toFixed(6)
          );

        return;
      }

      /*
       * SUCCESSORES CONSOMEM
       * NO LOCAL DA PRÓPRIA MÁQUINA.
       */
      if (
        event.type
        === 'CONSUMPTION'
      ) {
        const current =
          planningLocalStockEntry(
            availableByMaterialLocation,
            event.materialId,
            event.locationId,
            event.seed
          );

        current.quantity =
          Number(
            Math.max(
              numericQuantity(
                current.quantity
              )
              - event.quantity,
              0
            ).toFixed(6)
          );
      }
    });

    /*
   * Para PROGRAMAR TRANSPORTE numa data,
   * consideramos:
   *
   * estoque realmente existente
   * +
   * produção do próprio dia ainda não usada
   * por outro transporte.
   *
   * Essa visão é EXCLUSIVA do transporte.
   */
  const transportAvailableByMaterialLocation =
    new Map();


  availableByMaterialLocation
    .forEach(item => {
      const cloned =
        planningLocalStockEntry(
          transportAvailableByMaterialLocation,
          item.materialId,
          item.locationId,
          item
        );

      cloned.quantity =
        numericQuantity(
          item.quantity
        );
    });


  /*
   * Quando existe asOfDate, acrescentamos a
   * produção daquela própria data ao saldo
   * transportável.
   */
  if (
    normalizedAsOfDate
  ) {
    sameDayProductionByTransportKey
      .forEach(
        (
          producedQuantity,
          key
        ) => {
          const [
            productionDate,
            materialId,
            locationId
          ] =
            key.split(
              '\u0000'
            );

          if (
            productionDate
            !== normalizedAsOfDate
          ) {
            return;
          }

          const alreadyUsed =
            Math.max(
              numericQuantity(
                sameDayProductionUsedByTransport.get(
                  key
                )
              ),
              0
            );

          const stillTransportable =
            Math.max(
              numericQuantity(
                producedQuantity
              )
              - alreadyUsed,
              0
            );

          if (
            !(stillTransportable > 0)
          ) {
            return;
          }

          const current =
            planningLocalStockEntry(
              transportAvailableByMaterialLocation,
              materialId,
              locationId
            );

          current.quantity =
            Number(
              (
                numericQuantity(
                  current.quantity
                )
                + stillTransportable
              ).toFixed(6)
            );
        }
      );
  }


  /*
   * Mantemos a visão agregada antiga
   * apenas por compatibilidade interna.
   *
   * O Permitido novo usa a visão
   * material + local.
   */
  const availableByMaterial =
    new Map();

  availableByMaterialLocation
    .forEach(item => {
      const current =
        availableByMaterial.get(
          item.materialId
        )
        || {
          materialId:
            item.materialId,

          materialCode:
            item.materialCode,

          materialName:
            item.materialName,

          unit:
            item.unit,

          quantity:
            0
        };

      current.quantity =
        Number(
          (
            numericQuantity(
              current.quantity
            )
            + numericQuantity(
              item.quantity
            )
          ).toFixed(6)
        );

      availableByMaterial.set(
        item.materialId,
        current
      );
    });

  return {
    initialSnapshot,

    availableByMaterial,

        availableByMaterialLocation,

    transportAvailableByMaterialLocation,

    requirementsByConsumer,

    operationQuantityByConsumer
  };
}

function buildManualPlanningValidationOperations(
  result = {},
  allocations = [],
  machines = []
) {
  const operations =
    Array.isArray(result?.operations)
      ? result.operations
      : [];

  const sourceAllocations =
    Array.isArray(allocations)
      ? allocations
      : [];

    const requirementsByConsumer =
  planningMaterialRequirementsByConsumer(
    operations,

    result?.tree
    || result?.scheduleTree
    || result?.schedule_tree
  );

  /*
   * Local real das allocations já existentes.
   *
   * Ex.:
   *
   * 0:BOB  → MATRIZ
   * 0:LONG → FEITAL
   */
  const locationsByOperation =
    new Map();

  const addOperationLocation = (
    operationId,
    allocation
  ) => {
    const key =
      String(
        operationId
        ?? ''
      ).replace(
        /:day-\d+$/i,
        ''
      );

    if (!key) {
      return;
    }

    const locationId =
      planningAllocationLocationId(
        allocation,
        machines
      );

    if (
      !locationId
      || locationId
        === PLANNING_DEFAULT_LOCATION_ID
    ) {
      return;
    }

    if (
      !locationsByOperation.has(
        key
      )
    ) {
      locationsByOperation.set(
        key,
        new Set()
      );
    }

    locationsByOperation
      .get(key)
      .add(
        locationId
      );
  };

  sourceAllocations
    .forEach(allocation => {
      const components =
        Array.isArray(
          allocation?.components
        )
        && allocation.components.length
          ? allocation.components
          : null;

      if (components) {
        components.forEach(
          component => {
            addOperationLocation(
              component?.parentOperationId
              || allocation?.operationId
              || allocation?.parentOperationId,

              allocation
            );
          }
        );

        return;
      }

      addOperationLocation(
        allocation?.operationId
        || allocation?.parentOperationId
        || allocation
          ?.calendarParentOperationId,

        allocation
      );
    });

  const singleOperationLocation =
    operationId => {
      const values =
        [
          ...(
            locationsByOperation.get(
              String(
                operationId
                || ''
              ).replace(
                /:day-\d+$/i,
                ''
              )
            )
            || []
          )
        ];

      return values.length === 1
        ? values[0]
        : '';
    };

  /*
   * Quantidade realmente programada de cada card/operação.
   *
   * A dependência original representa o consumo da operação
   * inteira. No planejamento manual precisamos validar somente
   * a fração que já virou allocation.
   */
  const allocatedQuantityByOperation =
    new Map();

  const addAllocatedQuantity = (
    operationId,
    quantity
  ) => {
    const key = String(operationId ?? '')
      .replace(/:day-\d+$/i, '');

    const value = numericQuantity(quantity);

    if (!key || !(value > 0)) return;

    allocatedQuantityByOperation.set(
      key,
      Number(
        (
          numericQuantity(
            allocatedQuantityByOperation.get(key)
          )
          + value
        ).toFixed(6)
      )
    );
  };

  sourceAllocations.forEach(allocation => {
    const components =
      Array.isArray(allocation?.components)
      && allocation.components.length
        ? allocation.components
        : null;

    if (components) {
      components.forEach(component => {
        addAllocatedQuantity(
          component?.parentOperationId
          || allocation?.operationId
          || allocation?.parentOperationId,
          component?.quantity
        );
      });

      return;
    }

    addAllocatedQuantity(
      allocation?.operationId
      || allocation?.parentOperationId
      || allocation?.calendarParentOperationId,
      allocation?.quantity
    );
  });

  return operations.flatMap(operation => {
    if (
      operation?.operationType
      === 'transport'
    ) {
      return [{ ...operation }];
    }

    const breakdown =
      Array.isArray(
        operation.productionBreakdown
      )
      && operation.productionBreakdown.length
        ? operation.productionBreakdown
        : [operation];

    return breakdown.map(part => {
      const operationId =
        String(
          part?.operationId
          || planningMaterialDependencyKey(
            operation
          )
        );

      const requirements =
        requirementsByConsumer.get(
          operationId
        )
        || [];

      const quantity =
        planningMaterialOperationQuantity(
          operation,
          part
        );

      /*
       * Ex.:
       * operação total = 40.000
       * já programado = 8.490
       *
       * ratio = 8.490 / 40.000
       */
            const allocatedQuantity =
        Math.max(
          numericQuantity(
            allocatedQuantityByOperation.get(
              operationId
            )
          ),
          0
        );

      /*
       * Uma operação pode receber demanda
       * compartilhada de outra produção.
       *
       * Portanto este ratio pode passar de 1.
       *
       * Assim qualquer produção EXTRA continua
       * exigindo proporcionalmente seus insumos.
       */
      const allocatedRatio =
        quantity > 0
          ? Math.max(
              allocatedQuantity / quantity,
              0
            )
          : 0;

      const validateDependencies =
        allocatedQuantity > 0
        && requirements.length > 0;

      return {
        ...operation,
        ...part,

        operationId,

        parentOperationId:
          operationId,

        calendarParentOperationId:
          operationId,

        groupedOperationIds:
          [operationId],

        productionBreakdown:
          [{
            ...part,
            operationId,
            quantity
          }],

        productionId:
          String(
            part?.productionKey
            || part?.productionId
            || operation?.productionKey
            || operation?.productionId
            || ''
          ),

        productionIndex:
          Number(
            part?.productionIndex
            ?? operation?.productionIndex
            ?? 0
          ),

        materialId:
          String(
            part?.materialId
            ?? operation?.materialId
            ?? ''
          ),

        materialName:
          String(
            part?.materialName
            ?? operation?.materialName
            ?? ''
          ),

        materialCode:
          String(
            part?.materialCode
            ?? operation?.materialCode
            ?? ''
          ),

        produceQty:
          quantity,

        quantity,

        unit:
          String(
            part?.unit
            || operation?.unit
            || ''
          ),

        dependencyOperationIds:
          validateDependencies
            ? requirements.map(
                requirement =>
                  requirement
                    .producerParentOperationId
              )
            : [],

        dependencyRequirements:
          validateDependencies
            ? requirements
                .map(requirement => {
                  /*
                   * ESTE É O PONTO PRINCIPAL:
                   *
                   * requirement.requiredQuantity
                   * é o consumo da operação inteira.
                   *
                   * Para o draft manual mandamos somente
                   * o consumo referente ao que já foi
                   * efetivamente programado.
                   */
                  const requiredQuantity =
                    Number(
                      (
                        numericQuantity(
                          requirement.requiredQuantity
                        )
                        * allocatedRatio
                      ).toFixed(6)
                    );

                  return {
                    operationId:
                      requirement
                        .producerParentOperationId,

                    producerParentOperationId:
                      requirement
                        .producerParentOperationId,

                    materialId:
                      requirement.materialId,

                    requiredQty:
                      requiredQuantity,

                                      requiredQuantity,

                    unit:
                      requirement.unit,

                    /*
                     * Bobina:
                     * produtor = Matriz
                     *
                     * Long/Trans:
                     * consumidor = Feital
                     */
                    sourceLocation:
                      singleOperationLocation(
                        requirement
                          .producerParentOperationId
                      ),

                    targetLocation:
                      singleOperationLocation(
                        operationId
                      )
                  };
                })
                .filter(requirement =>
                  requirement.requiredQuantity > 0
                )
            : []
      };
    });
  });
}

function planningMaterialOperationQuantity(operation = {}, part = {}) {
  return wholePlanningQuantity(part.quantity ?? part.produceQty ?? operation.produceQty ?? operation.quantity);
}

function planningMaterialPermittedQuantity({
  operation = {},
  part = {},
  remainingQty = 0,
  availability,
  targetLocationIds = []
} = {}) {
  const remaining =
    wholePlanningQuantity(
      remainingQty
    );

  if (!(remaining > 0)) {
    return 0;
  }

  const operationId =
    String(
      part.operationId
      || operation.operationId
      || ''
    );

  const requirements =
    availability
      ?.requirementsByConsumer
      ?.get(operationId)
    || [];

  const dependencyOperationIds =
    Array.isArray(
      operation.dependencyOperationIds
    )
      ? operation
          .dependencyOperationIds
          .filter(Boolean)
      : [];

  if (!requirements.length) {
    return dependencyOperationIds.length
      ? 0
      : remaining;
  }

  const baseQuantity =
    planningMaterialOperationQuantity(
      operation,
      part
    );

  if (!(baseQuantity > 0)) {
    return 0;
  }

  const limits =
    requirements
      .map(requirement => {
        /*
         * IMPORTANTE:
         *
         * Todas as produções que consomem
         * o mesmo material no mesmo local
         * consultam exatamente este mesmo saldo.
         */
        const available =
          planningMaterialAvailableQuantity({
            availability,

            materialId:
              requirement.materialId,

            targetLocationIds
          });

        const usagePerUnit =
          requirement.requiredQuantity
          / baseQuantity;

        return usagePerUnit > 0
          ? available / usagePerUnit
          : remaining;
      })
      .filter(
        Number.isFinite
      );

  if (!limits.length) {
    return 0;
  }

  return Math.min(
    remaining,

    Math.floor(
      Math.max(
        Math.min(
          ...limits
        ),
        0
      )
    )
  );
}

function planningSharedDemandMaterialKey(
  material = {}
) {
  const materialId =
    String(
      material?.materialId
      || ''
    ).trim();

  const locationIds =
    [
      ...new Set(
        (
          Array.isArray(
            material?.consumerLocationIds
          )
            ? material.consumerLocationIds
            : []
        )
          .map(value =>
            String(value || '').trim()
          )
          .filter(Boolean)
      )
    ].sort();

  return `${materialId}\u0000${locationIds.join(',')}`;
}


function applyPlanningSharedDemandCoverage(
  productions = [],
  {
    ignoreStock = false
  } = {}
) {
  const groups =
    Array.isArray(productions)
      ? productions
      : [];

  const openProductionIds =
    new Set();

  const sharedDebtByKey =
    new Map();


  /*
   * Primeiro normaliza os valores ORIGINAIS.
   */
  groups.forEach(group => {

    group.materials.forEach(material => {

      material.baseRequiredQty =
        numericQuantity(
          material.baseRequiredQty
          ?? material.requiredQty
        );

      material.rawScheduledQty =
        numericQuantity(
          material.rawScheduledQty
          ?? material.scheduledQty
        );

      material.rawRemainingQty =
        Math.max(
          material.baseRequiredQty
          -
          material.rawScheduledQty,
          0
        );

      material.sharedStockCoveredQty = 0;

      material.sharedDemandQty = 0;

      material.attendedBySharedStock = false;
    });


    /*
     * Descobre o produto FINAL da produção.
     *
     * Um card terminal é aquele que nenhum
     * outro card da mesma produção utiliza
     * como predecessor.
     */
    const dependencyIds =
      new Set(
        group.materials
          .flatMap(material => (
            Array.isArray(
              material?.dependencyOperationIds
            )
              ? material.dependencyOperationIds
              : []
          ))
          .map(String)
      );


    const terminalMaterials =
      group.materials.filter(material => (
        !dependencyIds.has(
          String(material.operationId)
        )
      ));


    const productionCompleted =
      terminalMaterials.length > 0
      &&
      terminalMaterials.every(material => (
        numericQuantity(
          material.rawRemainingQty
        ) <= 0
      ));


    if (!productionCompleted) {

      openProductionIds.add(
        String(group.productionId)
      );
    }


    const byOperationId =
      new Map(
        group.materials.map(material => [
          String(material.operationId),
          material
        ])
      );


    /*
     * Se a MALHA FINAL terminou, mas algum
     * predecessor direto dela não foi produzido,
     * então aquela quantidade veio do saldo
     * compartilhado.
     *
     * Ex.:
     *
     * Q-61 = 300 / 300
     * Trans Q-61 = 0 / 6.000
     *
     * Logo:
     * 6.000 Trans foram atendidos pelo saldo.
     */
    terminalMaterials
      .filter(material => (
        numericQuantity(
          material.rawRemainingQty
        ) <= 0
      ))
      .forEach(finalMaterial => {

        (
          Array.isArray(
            finalMaterial
              ?.dependencyOperationIds
          )
            ? finalMaterial
                .dependencyOperationIds
            : []
        ).forEach(
          dependencyOperationId => {

            const dependencyMaterial =
              byOperationId.get(
                String(
                  dependencyOperationId
                )
              );


            if (
              !dependencyMaterial
              ||
              dependencyMaterial
                .attendedBySharedStock
            ) {
              return;
            }


            const coveredBySharedStock =
              Math.max(
                numericQuantity(
                  dependencyMaterial
                    .rawRemainingQty
                ),
                0
              );


            if (!(coveredBySharedStock > 0)) {
              return;
            }


            dependencyMaterial
              .attendedBySharedStock = true;

            dependencyMaterial
              .sharedStockCoveredQty =
                Number(
                  coveredBySharedStock
                    .toFixed(6)
                );


            const key =
              planningSharedDemandMaterialKey(
                dependencyMaterial
              );


            const currentDebt =
              numericQuantity(
                sharedDebtByKey.get(key)
              );


            sharedDebtByKey.set(
              key,
              Number(
                (
                  currentDebt
                  +
                  coveredBySharedStock
                ).toFixed(6)
              )
            );
          }
        );
      });
  });


  /*
   * Agora joga a quantidade consumida do saldo
   * compartilhado para uma produção que AINDA
   * esteja aberta e use:
   *
   * MESMO MATERIAL + MESMO LOCAL.
   *
   * Se houver várias produções abertas,
   * usamos primeiro a de menor productionIndex.
   */
  sharedDebtByKey.forEach(
    (sharedDemandQty, key) => {

      const candidates =
        groups
          .filter(group => (
            openProductionIds.has(
              String(group.productionId)
            )
          ))
          .flatMap(group =>
            group.materials.map(
              material => ({
                group,
                material
              })
            )
          )
          .filter(({ material }) => (
            !material.attendedBySharedStock
            &&
            planningSharedDemandMaterialKey(
              material
            ) === key
          ))
          .sort((left, right) => (
            Number(
              left.group.productionIndex
              ?? Number.MAX_SAFE_INTEGER
            )
            -
            Number(
              right.group.productionIndex
              ?? Number.MAX_SAFE_INTEGER
            )

            ||

            Number(
              left.material.sequence
              ?? Number.MAX_SAFE_INTEGER
            )
            -
            Number(
              right.material.sequence
              ?? Number.MAX_SAFE_INTEGER
            )
          ));


      const target =
        candidates[0]?.material;


      if (!target) {
        return;
      }


      target.sharedDemandQty =
        Number(
          (
            numericQuantity(
              target.sharedDemandQty
            )
            +
            sharedDemandQty
          ).toFixed(6)
        );
    }
  );


  /*
   * Finalmente recalculamos os cards.
   */
  groups.forEach(group => {

    group.materials.forEach(material => {

      const baseRequiredQty =
        numericQuantity(
          material.baseRequiredQty
        );

      const scheduledQty =
        numericQuantity(
          material.rawScheduledQty
        );


      /*
       * Produção já encerrada utilizando
       * material do saldo compartilhado.
       */
      if (
        material.attendedBySharedStock
      ) {

        material.requiredQty =
          baseRequiredQty;

        material.scheduledQty =
          scheduledQty;

        material.remainingQty = 0;

        material.permittedQty = 0;

        material.blocked = false;

        material.partial = false;

        material.ready = false;

        material.completed = true;

        material.status =
          'completed-shared-stock';

        return;
      }


      /*
       * Produção ainda aberta que recebeu
       * a necessidade de reposição.
       */
      const effectiveRequiredQty =
        Number(
          (
            baseRequiredQty
            +
            numericQuantity(
              material.sharedDemandQty
            )
          ).toFixed(6)
        );


      const remainingQty =
        Math.max(
          effectiveRequiredQty
          -
          scheduledQty,
          0
        );


      const permittedQty =
        ignoreStock

          ? remainingQty

          : Math.min(
              remainingQty,

              Math.max(
                numericQuantity(
                  material
                    .stockPermittedCapacity
                ),
                0
              )
            );


      const status =
        remainingQty <= 0
          ? 'completed'

          : permittedQty <= 0
            ? 'blocked'

            : permittedQty < remainingQty
              ? 'partial'

              : 'ready';


      material.requiredQty =
        effectiveRequiredQty;

      material.scheduledQty =
        scheduledQty;

      material.remainingQty =
        remainingQty;

      material.permittedQty =
        permittedQty;

      material.blocked =
        status === 'blocked';

      material.partial =
        status === 'partial';

      material.ready =
        status === 'ready';

      material.completed =
        status === 'completed';

      material.status =
        status;
    });
  });


  return groups;
}

export function buildPlanningMaterialsToScheduleModel(
  result = {},
  {
    allocations = [],
    transports = [],
    plannedReceipts = [],
    machines = [],
    asOfDate = null,
    resolveConsumerLocationIds = null,
    ignoreStock = false
  } = {}
) {
  const scheduledByOperation = new Map();
  (Array.isArray(allocations) ? allocations : []).forEach(allocation => {
    const key = planningMaterialOperationKey(allocation);
    if (!key) return;
    scheduledByOperation.set(key, Number((Number(scheduledByOperation.get(key) || 0) + numericQuantity(allocation.quantity)).toFixed(6)));
  });
  const operations = (Array.isArray(result?.operations) ? result.operations : [])
    .filter(operation => operation?.operationType !== 'transport')
    .filter(operation => numericQuantity(operation?.produceQty) > 0 || numericQuantity(operation?.quantity) > 0);
  const summaryProductions = Array.isArray(result?.summary?.productions) ? result.summary.productions : [];
  const productions = new Map(summaryProductions.map((production, index) => [
    String(production.productionKey || `production-${production.productionIndex ?? index}`),
    {
      productionId: String(production.productionKey || `production-${production.productionIndex ?? index}`),
      productionIndex: Number(production.productionIndex ?? index),
      productionNumber: Number(production.productionNumber ?? production.productionIndex + 1),
      title: productionTitleForManualCard(production, index),
      color: production.color || null,
      materials: []
    }
  ]));
  const ensureProduction = (source = {}, fallbackIndex = 0) => {
    const productionIndex = Number(source.productionIndex ?? fallbackIndex);
    const productionId = String(source.productionKey || source.productionId || `production-${productionIndex}`);
    if (!productions.has(productionId)) {
      productions.set(productionId, {
      productionId,
      productionIndex,
      productionNumber:
        Number(
          source.productionNumber
          ?? productionIndex + 1
        ),
        title: productionTitleForManualCard(source, productionIndex),
        color: source.productionColor || source.color || null,
        materials: []
      });
    }
    return productions.get(productionId);
  };
   const localStockAvailability =
    buildPlanningLocalStockAvailability({
    result,
    allocations,
    transports,
    plannedReceipts,
    machines,
    asOfDate
  });
  operations.forEach(operation => {
    const breakdown = Array.isArray(operation.productionBreakdown) && operation.productionBreakdown.length
      ? operation.productionBreakdown
      : [operation];
    breakdown.forEach(part => {
      const requiredQty = planningMaterialOperationQuantity(operation, part);
      if (!(requiredQty > 0)) return;
      const operationId = String(part.operationId || operation.operationId || `${part.productionIndex ?? operation.productionIndex}:${operation.materialId}`);
           const rawScheduledQty =
        wholePlanningQuantity(
          scheduledByOperation.get(
            operationId
          )
          || 0
        );

      const scheduledQty =
        rawScheduledQty;

      const remainingQty =
        Math.max(
          0,
          requiredQty - scheduledQty
        );
      const dependencyOperationIds = Array.isArray(operation.dependencyOperationIds)
        ? operation.dependencyOperationIds.filter(Boolean).map(String)
        : [];
            const consumerLocationIds =
        typeof resolveConsumerLocationIds
          === 'function'

          ? resolveConsumerLocationIds({
              operationId,

              materialId:
                String(
                  part.materialId
                  || operation.materialId
                  || ''
                ),

              materialCode:
                String(
                  part.materialCode
                  || operation.materialCode
                  || part.material_code
                  || operation.material_code
                  || ''
                ),

              materialName:
                part.materialName
                || operation.materialName
                || '',

              unit:
                part.unit
                || operation.unit
                || '',

              productionId:
                String(
                  part.productionKey
                  || part.productionId
                  || operation.productionKey
                  || operation.productionId
                  || ''
                ),

              productionIndex:
                Number(
                  part.productionIndex
                  ?? operation.productionIndex
                  ?? 0
                )
            })

          : [];

            const productiveRequirements =
        localStockAvailability
          .requirementsByConsumer
          .get(operationId)
        || [];

            const resolvedDependencyOperationIds =
        [
          ...new Set([
            ...dependencyOperationIds,

            ...productiveRequirements
              .map(requirement =>
                String(
                  requirement
                    ?.producerParentOperationId
                  ||
                  requirement
                    ?.operationId
                  ||
                  ''
                )
              )
              .filter(Boolean)
          ])
        ];


      /*
       * Calcula primeiro quanto o estoque
       * permitiria produzir sem limitar pelo
       * restante ORIGINAL do card.
       *
       * Depois a demanda compartilhada pode
       * crescer sem perder esse limite físico.
       */
      const stockPermittedCapacity =
        ignoreStock

          ? Number.MAX_SAFE_INTEGER

          : planningMaterialPermittedQuantity({
              operation: {
                ...operation,
                operationId
              },

              part: {
                ...part,
                operationId
              },

              remainingQty:
                Number.MAX_SAFE_INTEGER,

              availability:
                localStockAvailability,

              targetLocationIds:
                consumerLocationIds
            });


      const permittedQty =
        ignoreStock

          ? remainingQty

          : Math.min(
              remainingQty,
              stockPermittedCapacity
            );


      /*
       * Guarda também o saldo que originou
       * o Permitido.
       *
       * Isso serve para mostrarmos na tela:
       *
       * CA60 3,4 Bobina / FEITAL
       * disponível: 500 kg
       *
       * IMPORTANTE:
       * não existe saldo por Produção #1 ou #2.
       */
      const inputBalanceByKey =
        new Map();


      if (!ignoreStock) {

        productiveRequirements
          .forEach(requirement => {

            const materialId =
              String(
                requirement?.materialId
                || ''
              ).trim();


            if (!materialId) {
              return;
            }


            const locationIds =
              [
                ...new Set(
                  (
                    Array.isArray(
                      consumerLocationIds
                    )
                      ? consumerLocationIds
                      : []
                  )
                    .map(value =>
                      String(value || '').trim()
                    )
                    .filter(Boolean)
                )
              ].sort();


            const key =
              `${materialId}\u0000${locationIds.join(',')}`;


            const current =
              inputBalanceByKey.get(key)
              || {
                materialId,

                locationIds,

                unit:
                  String(
                    requirement?.unit
                    || ''
                  ),

                requiredQty:
                  0,

                availableQty:
                  planningMaterialAvailableQuantity({
                    availability:
                      localStockAvailability,

                    materialId,

                    targetLocationIds:
                      locationIds
                  })
              };


            current.requiredQty =
              Number(
                (
                  numericQuantity(
                    current.requiredQty
                  )
                  +
                  numericQuantity(
                    requirement?.requiredQuantity
                  )
                ).toFixed(6)
              );


            inputBalanceByKey.set(
              key,
              current
            );
          });
      }


      const inputBalances =
        [...inputBalanceByKey.values()];


      const hasProductiveDependencies =
        productiveRequirements.length > 0;

      const status = remainingQty <= 0
        ? 'completed'
        : permittedQty <= 0
          ? 'blocked'
          : permittedQty < remainingQty
            ? 'partial'
            : 'ready';
      ensureProduction(part, operation.productionIndex).materials.push({
        operationId,
        materialId: String(part.materialId || operation.materialId || ''),
        materialCode: String(part.materialCode || operation.materialCode || part.material_code || operation.material_code || ''),
        materialName: part.materialName || operation.materialName || '',
                baseRequiredQty:
          requiredQty,

        rawScheduledQty,

        requiredQty,
        scheduledQty,
        remainingQty,
        permittedQty,

        stockPermittedCapacity,

        showPermitted:
          hasProductiveDependencies,

        inputBalances,

        consumerLocationIds:
          Array.isArray(
            consumerLocationIds
          )
            ? [...consumerLocationIds]
            : [],

        unit:
          part.unit
          || operation.unit
          || '',
        blocked: status === 'blocked',
        partial: status === 'partial',
        ready: status === 'ready',
        completed: remainingQty <= 0,
                status,

        dependencyOperationIds:
          resolvedDependencyOperationIds,

        sequence: part.sequence ?? part.productionOrder ?? operation.sequence ?? operation.productionOrder ?? null
      });
    });
  });
    const adjustedProductions =
    applyPlanningSharedDemandCoverage(
      [...productions.values()]
        .filter(
          production =>
            production.materials.length
        ),

      {
        ignoreStock
      }
    );


  /*
   * Materiais intermediários 100% atendidos por estoque
   * não existem mais em result.operations, porque não há
   * produção a programar. Mesmo assim eles continuam sendo
   * etapas reais da cadeia e precisam permanecer visíveis.
   *
   * Eles entram apenas como cards informativos concluídos:
   * não podem ser arrastados e não criam produção artificial.
   */
  const augmentedProductions =
    adjustedProductions.map(production => ({
      ...production,
      materials: [...(production.materials || [])]
    }));

  const existingOperationIds =
    new Set(
      augmentedProductions
        .flatMap(production => production.materials || [])
        .map(material => String(material?.operationId || ''))
        .filter(Boolean)
    );

  const stockCoveredByOperationId =
    new Map();

  const visitStockCoveredNode =
    node => {
      if (!node || typeof node !== 'object') return;

      const materialId =
        planningMaterialId(node);

      const productionIndex =
        Number(node?.productionIndex ?? 0);

      const operationId =
        materialId
          ? String(
              node?.operationId
              || `${productionIndex}:${materialId}`
            )
          : '';

      const requiredQty =
        numericQuantity(
          node?.requiredQty
          ?? node?.requiredQuantity
          ?? node?.quantity
        );

      const stockUsedQty =
        numericQuantity(node?.stockUsedQty);

      const produceQty =
        numericQuantity(node?.produceQty);

      if (
        operationId
        && requiredQty > 0
        && stockUsedQty > 0
        && produceQty <= 0
        && node?.isInitialRawMaterial !== true
      ) {
        const current =
          stockCoveredByOperationId.get(operationId);

        if (
          !current
          || requiredQty > current.requiredQty
        ) {
          stockCoveredByOperationId.set(
            operationId,
            {
              node,
              operationId,
              materialId,
              productionIndex,
              requiredQty,
              stockUsedQty
            }
          );
        }
      }

      (Array.isArray(node.children) ? node.children : [])
        .forEach(visitStockCoveredNode);
    };

  const tree =
    result?.tree
    || result?.scheduleTree
    || result?.schedule_tree
    || null;

  if (Array.isArray(tree)) {
    tree.forEach(visitStockCoveredNode);
  } else {
    visitStockCoveredNode(tree);
  }

  stockCoveredByOperationId.forEach(item => {
    if (existingOperationIds.has(item.operationId)) return;

    const node = item.node;

    const productionId =
      String(
        node?.productionKey
        || node?.productionId
        || `production-${item.productionIndex}`
      );

    let production =
      augmentedProductions.find(group => (
        String(group.productionId) === productionId
      ));

    if (!production) {
      const sourceProduction =
        ensureProduction(
          node,
          item.productionIndex
        );

      production = {
        ...sourceProduction,
        materials: []
      };

      augmentedProductions.push(
        production
      );
    }

    /*
     * O próprio material atendido por estoque também deve
     * poder aparecer no cabeçalho de saldos compartilhados.
     *
     * Pegamos o saldo físico por local já calculado pelo
     * mesmo modelo usado pelo painel.
     */
    const inputBalances =
      ignoreStock
        ? []
        : [
            ...(
              localStockAvailability
                .availableByMaterialLocation
                ?.values?.()
              || []
            )
          ]
            .filter(balance => (
              String(
                balance?.materialId
                || ''
              )
              ===
              String(item.materialId)

              &&

              numericQuantity(
                balance?.quantity
              ) > 0
            ))
            .map(balance => ({
              materialId:
                String(item.materialId),

              locationIds: [
                String(
                  balance.locationId
                  || PLANNING_DEFAULT_LOCATION_ID
                )
              ],

              unit:
                String(
                  node?.unit
                  || balance?.unit
                  || ''
                ),

              requiredQty:
                item.requiredQty,

              availableQty:
                numericQuantity(
                  balance.quantity
                )
            }));

    production.materials.push({
      operationId:
        item.operationId,

      materialId:
        String(item.materialId),

      materialCode:
        String(
          node?.materialCode
          || node?.material_code
          || ''
        ),

      materialName:
        String(
          node?.materialName
          || node?.material_name
          || item.materialId
        ),

      baseRequiredQty:
        item.requiredQty,

      rawScheduledQty:
        0,

      requiredQty:
        item.requiredQty,

      scheduledQty:
        0,

      remainingQty:
        0,

      permittedQty:
        0,

      stockPermittedCapacity:
        0,

      stockUsedQty:
        item.stockUsedQty,

      stockCoveredOnly:
        true,

      showPermitted:
        false,

      inputBalances,

      consumerLocationIds:
        [],

      unit:
        String(
          node?.unit
          || ''
        ),

      blocked:
        false,

      partial:
        false,

      ready:
        false,

      completed:
        true,

      status:
        'completed-stock',

      dependencyOperationIds:
        [],

      sequence:
        node?.sequence
        ?? node?.productionOrder
        ?? null
    });

    existingOperationIds.add(
      item.operationId
    );
  });


  return augmentedProductions
    .map(production => ({
      ...production,

      materials:
        orderPlanningMaterialsByProductionSequence(
          production.materials
        )
    }))
    .sort((left, right) =>
      left.productionIndex
      - right.productionIndex

      ||

      left.title.localeCompare(
        right.title,
        'pt-BR'
      )
    );
}

function emptyProduction(index = 0) {
  return {
    id: `production-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title:
      `Produ&ccedil;&atilde;o ${index + 1}`,
    productionNumber:
      null,
    color:
      null,
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

  return [
    `--production-card-stripes: linear-gradient(180deg, ${colorStops.map(stop => stop.solid).join(', ')})`,
    `--production-card-segments: linear-gradient(180deg, ${colorStops.map(stop => stop.soft).join(', ')})`
  ].join('; ');
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
  planningMode: 'real',

  planningStartDate:
    start,
    planningEndDate: '',
    planningCalendarMonth: start,
    shifts: [defaultShift(0)],
    productions: [emptyProduction(0)],
    stockOnlyMaterials: [],
        stockOnlyMaterialChoices: [],
    skipProductionMaterials: [],
    plannedReceipts: [],
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
        skipProductionMaterials:
      Array.isArray(
        draft.skipProductionMaterials
      )
        ? draft.skipProductionMaterials
        : [],

    plannedReceipts:
      Array.isArray(
        draft.plannedReceipts
      )
        ? draft.plannedReceipts
            .map(
              normalizeManualSchedulePlannedReceipt
            )
        : [],

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
  normalized.planningStartDate = isValidDateOnly(normalized.planningStartDate)
    ? String(normalized.planningStartDate).slice(0, 10)
    : today();
  normalized.planningEndDate = isValidDateOnly(normalized.planningEndDate)
    && String(normalized.planningEndDate).slice(0, 10) >= normalized.planningStartDate
    ? String(normalized.planningEndDate).slice(0, 10)
    : '';
  normalized.planningCalendarMonth = isValidDateOnly(normalized.planningCalendarMonth)
    ? String(normalized.planningCalendarMonth).slice(0, 10)
    : normalized.planningStartDate;
   normalized.planningMode = 'real';
  normalized.productions = normalized.productions.map(production => ({ ...production, transports: [] }));
  normalized.shifts = normalizeShiftTimes(normalized.shifts.map((shift, index) => {
    const legacyTotal = defaultTeamAvailableForShift(shift.teamAvailable, index);
    const suppliedMatrix = Number(shift.matrixTeamAvailable);
    const matrixTeamAvailable = Number.isInteger(suppliedMatrix) && suppliedMatrix >= 0
      ? suppliedMatrix
      : DEFAULT_MATRIX_TEAM_AVAILABLE;
    const suppliedFeital = Number(shift.feitalTeamAvailable);
    const feitalTeamAvailable = Number.isInteger(suppliedFeital) && suppliedFeital >= 0
      ? suppliedFeital
      : Math.max(legacyTotal - matrixTeamAvailable, 0);
    return {
      ...defaultShift(index, shift.shiftStartTime),
      ...shift,
      id: shift.id || `shift-${index}-${Date.now()}`,
      label: `Turno ${index + 1}`,
      pauseLabel: 'Horas de pausa',
      pauseHours: '0',
      matrixTeamAvailable,
      feitalTeamAvailable,
      teamAvailable: matrixTeamAvailable + feitalTeamAvailable
    };
  }));
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

function loadPlanningRuntimeDraft() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUNTIME_DRAFT_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || !parsed.lastPayload || typeof parsed.lastPayload !== 'object') return null;
    return {
      lastPayload: parsed.lastPayload,
      manualScheduleDraft: parsed.manualScheduleDraft && typeof parsed.manualScheduleDraft === 'object' ? parsed.manualScheduleDraft : null,
      hasPendingSimulationChanges: Boolean(parsed.hasPendingSimulationChanges)
    };
  } catch {
    return null;
  }
}

function compactManualScheduleDraftForLocalSave(source) {
  if (!source || typeof source !== 'object') return null;
  return {
    draftId: source.draftId ?? null,
    planningId: source.planningId ?? null,
    baseSimulationId: source.baseSimulationId ?? null,
    allocations: Array.isArray(source.allocations) ? source.allocations : [],
    transports: Array.isArray(source.transports) ? source.transports : [],
    plannedReceipts: Array.isArray(source.plannedReceipts) ? source.plannedReceipts : [],
    manualWorkDates: Array.isArray(source.manualWorkDates) ? source.manualWorkDates : [],
    dailyTeamOverrides: source.dailyTeamOverrides && typeof source.dailyTeamOverrides === 'object' ? source.dailyTeamOverrides : {},
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
    dirty: Boolean(source.dirty),
    lastManualAction: source.lastManualAction ?? null
  };
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
timezone,
ignoreStock = false
} = {}) {
  const operations = Array.isArray(simulation?.operations) ? simulation.operations : [];
  const normalizedStock = stock === undefined ? stockFromSchedule(simulation) : stock;
  const normalizedStockMinimums = stockMinimums === undefined ? stockMinimumsFromMaterials(materials) : stockMinimums;
 const result = {
  operations,
  materials,
  machines,
  productivityMatrix,

  skipStockValidation:
    ignoreStock === true,

  dependencies:
    dependencies === undefined
      ? []
      : dependencies,

  transports:
    transports === undefined
      ? transportsFromOperations(
          operations
        )
      : transports,

  shifts,
  dailyTeamOverrides,
  manualWorkDates,
  setupMinutes,
  minimumStartRatio,
  dependencyCompletionBufferMinutes,
  holidays,

  timezone:
    timezone
    ||
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone
};


if (!ignoreStock) {

  result.stock =
    normalizedStock;

  result.stockMinimums =
    normalizedStockMinimums;

  result.stockLocations =
    normalizeManualScheduleStockLocations({
      stock:
        normalizedStock,

      stockMinimums:
        normalizedStockMinimums,

      stockLocations
    });
}


return result;
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

    <div class="planning-page-title-row">

           <h1>
        Planejamento
      </h1>

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
  const localRuntimeDraft = loadPlanningRuntimeDraft();
  let lastPayload = draft.lastPayload || localRuntimeDraft?.lastPayload || null;
  let currentSimulation = draft.currentSimulation || null;
  let currentAutomaticBaseline = normalizeAutomaticSimulationBaseline(draft.automaticBaseline);
  let currentPlanningStockProjection = null;
  let stockOverviewCache = null;
  let currentPlanningStockAlerts = new Map();

  /*
   * Alertas teóricos utilizados somente
   * pelo modo "Visualizar calendário".
   */
  let currentPlanningRangeStockAlerts =
    new Map();

  /*
   * Indica que o Gantt atualmente está
   * exibindo apenas uma visualização
   * de período, sem nova simulação.
   */
  let planningRangePreviewActive =
    false;

  let planningStockAlertRequestId = 0;
  let productionCalendarMoveInProgress = false;
  let productionCalendarMoveRunner = null;
  let productionCalendarVisualState = {};
  let productionCalendarExclusiveView = null;
  let planningScheduleRendererHost = null;
  let manualScheduleDraft = draft.manualScheduleDraft || localRuntimeDraft?.manualScheduleDraft || null;
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
  let hasPendingSimulationChanges = Boolean(localRuntimeDraft?.hasPendingSimulationChanges);
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

  async function restorePlanningRuntimeFromLocalSave(form) {
    if (currentSimulation || !lastPayload || !manualScheduleDraft) return false;
    try {
      const pendingBeforeRestore = Boolean(localRuntimeDraft?.hasPendingSimulationChanges);
      let result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
      if (!Array.isArray(result?.operations) || !result.operations.length) return false;
      if (draft.planningMode === 'real') {
        try {
          stockOverviewCache = null;
          const currentStockRows = await loadStockOverviewRows();
          result = {
            ...result,
            manualPlanningLocalStockSnapshot: manualPlanningLocalStockSnapshotFromOverviewRows(currentStockRows)
          };
        } catch (error) {
          console.warn('Nao foi possivel atualizar o estoque por local ao restaurar o pre-save do planejamento.', error);
        }
      }
      renderSimulation(result, form, {
        restoreManualDraft: true,
        captureAutomaticBaseline: true,
        manualFoundation: true
      });
      hasPendingSimulationChanges = pendingBeforeRestore;
      if (pendingBeforeRestore) {
        const notice = target.querySelector('.unsimulated-notice');
        if (notice) {
          notice.hidden = false;
          notice.textContent = 'Existem alterações ainda não simuladas. Clique em Simular para atualizar o planejamento.';
        }
      }
      saveDraftNow();
      return true;
    } catch (error) {
      console.warn('Nao foi possivel restaurar automaticamente o pre-save local do planejamento.', error);
      return false;
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

    pageTitle.textContent =
      `Planejamento / ${tab.label}`;

    const pills =
      page.querySelector(
        '[data-planning-mode-pills]'
      );

    if (pills) {
      pills.hidden =
        activeTab !== 'simulation';
    }
  }

  function saveDraftNow() {
    draft.lastPayload = lastPayload;
    draft.currentSimulation = currentSimulation;
    draft.manualScheduleDraft = manualScheduleDraft;
    draft.automaticBaseline = currentAutomaticBaseline
      ? cloneAutomaticBaselineValue(currentAutomaticBaseline)
      : null;
    const persistedDraft = {
      ...draft,
      lastPayload: null,
      currentSimulation: null,
      manualScheduleDraft: null,
      automaticBaseline: null
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(persistedDraft));
    } catch (error) {
      const quotaExceeded = error?.name === 'QuotaExceededError'
        || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || error?.code === 22
        || error?.code === 1014;
      if (quotaExceeded) {
        console.warn('O rascunho local não pôde ser persistido porque o limite do localStorage foi atingido.', error);
        return;
      }
      throw error;
    }

    if (lastPayload && typeof lastPayload === 'object' && manualScheduleDraft && typeof manualScheduleDraft === 'object') {
      const runtimeDraft = {
        version: 1,
        lastPayload,
        manualScheduleDraft: compactManualScheduleDraftForLocalSave(manualScheduleDraft),
        hasPendingSimulationChanges: Boolean(hasPendingSimulationChanges)
      };
      try {
        localStorage.setItem(RUNTIME_DRAFT_KEY, JSON.stringify(runtimeDraft));
      } catch (error) {
        const quotaExceeded = error?.name === 'QuotaExceededError'
          || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
          || error?.code === 22
          || error?.code === 1014;
        if (quotaExceeded) {
          console.warn('O pré-save local do calendário manual excedeu o limite do localStorage.', error);
          return;
        }
        throw error;
      }
    } else {
      localStorage.removeItem(RUNTIME_DRAFT_KEY);
    }
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

  async function ensurePlanningProductionNumbers() {
    const missingNumbers = draft.productions.some(production => {
      const number = Number(production?.productionNumber);
      return !(Number.isInteger(number) && number > 0);
    });

    if (!missingNumbers) return;

    const sequence = await api('/planning/plans/next-production-number');
    let nextNumber = Math.max(Number(sequence?.nextProductionNumber || 1), 1);

    draft.productions.forEach((production, index) => {
      const currentNumber = Number(production?.productionNumber);
      if (Number.isInteger(currentNumber) && currentNumber > 0) {
        nextNumber = Math.max(nextNumber, currentNumber + 1);
        return;
      }

      const oldDefaultColor = automaticProductionColor(index);
      production.productionNumber = nextNumber;
      if (!isHexColor(production.color) || String(production.color).toUpperCase() === String(oldDefaultColor).toUpperCase()) {
        production.color = automaticProductionColor(nextNumber - 1);
      }
      production.title = `Produ&ccedil;&atilde;o ${nextNumber}`;
      nextNumber += 1;
    });

    saveDraftNow();
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
        productions: [{
          ...production,
          productionNumber: planningProductionNumber(production, index)
        }],
        materials,
        findMaterialById,
        isHexColor,
        getAutomaticProductionColor: automaticProductionColor,
        productionIndexOffset: index
      })[0];
    });
  }

  function payload() {
  return {
    ...buildPlanningSimulationPayload({
      draft,
      materials,
      findMaterialById,

      shifts:
        buildShiftPayload(
          normalizeShiftTimes(
            draft.shifts
          ),
          {
            getDefaultTeamAvailable:
              defaultTeamAvailableForShift
          }
        ),

      setupHours:
        parsePtBrDecimal(
          draft.setupHours,
          0
        ),

      productions:
        productionPayload(),

      stockOnlyMaterials:
        stockOnlyMaterialsForPayload(),

      manualWorkDates:
        manualScheduleDraft
          ?.manualWorkDates
        ||
        draft.manualWorkDates
        ||
        lastPayload
          ?.manualWorkDates
        ||
        []
    }),

        planningMode: 'real'
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
            operationSplits:
        JSON.parse(
          JSON.stringify(
            draft.operationSplits || []
          )
        ),

      dailyTeamOverrides:
        JSON.parse(
          JSON.stringify(
            draft.dailyTeamOverrides || {}
          )
        ),

      manualWorkDates:
        JSON.parse(
          JSON.stringify(
            draft.manualWorkDates || []
          )
        ),

      plannedReceipts:
        JSON.parse(
          JSON.stringify(
            draft.plannedReceipts || []
          )
        ),

      manualScheduleDraft: manualScheduleDraft ? JSON.parse(JSON.stringify(manualScheduleDraft)) : null,
      lastPayload: lastPayload ? JSON.parse(JSON.stringify(lastPayload)) : null,
      currentSimulation: currentSimulation ? JSON.parse(JSON.stringify(currentSimulation)) : null,
      hasPendingSimulationChanges: Boolean(hasPendingSimulationChanges)
    };
  }

  function restoreDraftPlanningState(snapshot) {
    draft.operationOverrides = snapshot.operationOverrides;
    draft.operationSplits = snapshot.operationSplits;
        draft.dailyTeamOverrides =
      snapshot.dailyTeamOverrides;

    draft.manualWorkDates =
      snapshot.manualWorkDates;

    draft.plannedReceipts =
      snapshot.plannedReceipts
      || [];

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
    if (draft.planningEndDate && (!isValidDateOnly(draft.planningEndDate) || draft.planningEndDate < draft.planningStartDate)) {
      toast('A data final deve ser maior ou igual à data inicial do planejamento.');
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
    const desiredDateAfterRange = draft.planningEndDate
      ? draft.productions.find(production => production.desiredDate && production.desiredDate > draft.planningEndDate)
      : null;
    if (desiredDateAfterRange) {
      toast('A data desejada deve estar dentro do período selecionado no calendário.');
      return false;
    }
    const invalidShift = draft.shifts.find(shift => {
      const matrix = Number(shift.matrixTeamAvailable);
      const feital = Number(shift.feitalTeamAvailable);
      return !(parsePtBrDecimal(shift.hoursPerDay, 0) > 0)
        || !Number.isInteger(matrix) || matrix < 0
        || !Number.isInteger(feital) || feital < 0
        || !(matrix + feital > 0);
    });
    if (invalidShift) {
      toast('Informe equipes inteiras maiores ou iguais a zero para Matriz e Feital. O total do turno deve ser maior que zero.');
      return false;
    }
    if (String(draft.setupHours || '').trim() && parsePtBrDecimal(draft.setupHours, -1) < 0) {
      toast('Informe o tempo de setup com valor maior ou igual a zero.');
      return false;
    }
    return true;
  }

  function renderShift(shift, index) {
    const matrixTeamAvailable = Math.max(Number(shift.matrixTeamAvailable ?? DEFAULT_MATRIX_TEAM_AVAILABLE) || 0, 0);
    const feitalTeamAvailable = Math.max(Number(shift.feitalTeamAvailable ?? DEFAULT_FEITAL_TEAM_AVAILABLE) || 0, 0);
    const totalTeamAvailable = matrixTeamAvailable + feitalTeamAvailable;
    return `
      <article class="planning-subcard shift-card" data-shift-id="${shift.id}">
        <div class="planning-subcard-header">
          <h3>Turno ${index + 1}</h3>
          ${index > 0 ? '<button class="planning-icon-danger remove-shift" type="button" aria-label="Excluir turno" title="Excluir turno">-</button>' : ''}
        </div>
        <div class="grid-form planning-shift-fields">
          <label>Horas/dia<input name="hoursPerDay" type="text" inputmode="decimal" value="${escapeHtml(shift.hoursPerDay)}" /></label>
          <label>Equipe Matriz<input name="matrixTeamAvailable" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(matrixTeamAvailable)}" required /></label>
          <label>Equipe Feital<input name="feitalTeamAvailable" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(feitalTeamAvailable)}" required /></label>
        </div>
        <p class="shift-team-total" data-shift-team-total style="margin: 8px 0 0; font-size: 12px;"><strong>Equipe total:</strong> ${escapeHtml(totalTeamAvailable)}</p>
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
    const productionNumber = planningProductionNumber(production, index);
    hydrateProductionDefaults(production);
    const material = findMaterialById(materials, production.materialId);
    const rows = selectMatchingMatrixRows(matrix, material, { getPriority: matrixPriority, getSecondsPerUnit: matrixSecondsPerUnit });
    const selectedColor = isHexColor(production.color) ? production.color : automaticProductionColor(productionNumber - 1);
    const themeStyle = productionThemeStyle(index, selectedColor);
    const sourceBadge = production.source === 'Assistente PCP' ? '<span class="production-source-badge">Origem: Assistente PCP</span>' : '';
    const sourceWarning = importedProductionWarning(production, material, rows);
    return `
      <article class="planning-subcard production-block production-block-compact" data-production-id="${production.id}" style="${themeStyle}">
        <div class="production-compact-topline"><div class="production-compact-identity"><button class="production-drag-handle" type="button" draggable="true" data-production-drag-handle aria-label="Reordenar Produ&ccedil;&atilde;o ${productionNumber}" title="Arrastar para priorizar"></button><button class="production-gradient-key production-color-trigger" type="button" data-color-trigger aria-label="Alterar cor da Produ&ccedil;&atilde;o ${productionNumber}" title="Alterar cor" style="${themeStyle}"></button><strong class="production-compact-number">#${productionNumber}</strong></div>${draft.productions.length > 1 ? '<button class="planning-icon-danger remove-production" type="button" aria-label="Excluir produ&ccedil;&atilde;o" title="Excluir produ&ccedil;&atilde;o">-</button>' : ''}</div>
        <div class="production-compact-fields"><label class="production-compact-material-field"><span>Material</span><div class="material-autocomplete"><input name="materialSearch" type="search" autocomplete="off" placeholder="Digite para pesquisar" value="${escapeHtml(production.materialSearch || materialLabel(material))}" required /><div class="material-suggestions" hidden></div></div><input name="materialId" type="hidden" value="${escapeHtml(production.materialId)}" /></label><label class="production-compact-qty-field"><span>Quantidade</span><div class="production-compact-qty-input"><input name="plannedQty" type="number" min="0" step="0.001" value="${escapeHtml(production.plannedQty)}" required /><span>${escapeHtml(material?.primary_unit || production.unit || '')}</span></div></label></div>
        ${sourceBadge || sourceWarning ? `
          <div class="production-source-row">
            ${sourceBadge}
            ${sourceWarning ? `<span class="production-source-warning">${escapeHtml(sourceWarning)}</span>` : ''}
          </div>
        ` : ''}
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

  function planningCurrentStockPeriod(
  context = {}
) {

  const starts = [];
  const ends = [];


  for (
    const row
    of context.rows || []
  ) {

    for (
      const detail
      of row.details || []
    ) {

      if (
        detail.type !== 'sales'
      ) {
        continue;
      }


      const start =
        String(
          detail.periodStart
          || ''
        ).slice(0, 10);


      const end =
        String(
          detail.periodEnd
          || ''
        ).slice(0, 10);


      if (
        isValidDateOnly(start)
      ) {
        starts.push(start);
      }


      if (
        isValidDateOnly(end)
      ) {
        ends.push(end);
      }
    }
  }


  const lastStart =
    String(
      context
        .lastImport
        ?.period_start
      || ''
    ).slice(0, 10);


  const lastEnd =
    String(
      context
        .lastImport
        ?.period_end
      || ''
    ).slice(0, 10);


  if (
    isValidDateOnly(
      lastStart
    )
  ) {
    starts.push(lastStart);
  }


  if (
    isValidDateOnly(
      lastEnd
    )
  ) {
    ends.push(lastEnd);
  }


  if (
    !starts.length
    ||
    !ends.length
  ) {
    return null;
  }


  return {
    start:
      starts.sort()[0],

    end:
      ends
        .sort()
        .at(-1)
  };
}


function planningStockRowsFromCurrent(
  context = {}
) {

  const rows =
    Array.isArray(
      context.rows
    )
      ? context.rows
      : [];


  const period =
    planningCurrentStockPeriod(
      context
    );


  const businessDays =
    period

      ? businessDaysInclusive(
          period.start,
          period.end
        )

      : 0;


  const grouped =
    new Map();


  for (
    const row
    of rows
  ) {

    const materialId =
      String(
        row.materialId || ''
      );


    if (!materialId) {
      continue;
    }


    if (
      !grouped.has(
        materialId
      )
    ) {

      grouped.set(
        materialId,
        {
          material: {
            id:
              row.materialId,

            name:
              row.materialName
              || '-',

            permitsSales:
              row.permitsSales
              !== false,

            primary_unit:
              row.unit || ''
          },

          codes:
            Array.isArray(
              row.materialCodes
            )
              ? row.materialCodes
              : [],

                   totalLocationsQty:
            0,

          totalPlanningAvailableQty:
            0,

          totalProductionReserveQty:
            0,

          salesPeriodQty:
            0,

          /*
           * Mantém também o saldo físico
           * separado por local.
           *
           * A visão agregada continua existindo
           * para os consumidores antigos.
           */
          stockByLocation:
            []
        }
      );
    }


        const item =
      grouped.get(
        materialId
      );


    const currentQty =
      Number(
        row.currentQty
        ?? row.current_qty
        ?? 0
      );

    const productionReserveQty =
      Number(
        row.movementTotals
          ?.productionReserveQty
        ??
        row.production_reserve_qty
        ??
        0
      );

    /*
     * O planejamento parte do saldo físico.
     *
     * currentQty já é o saldo físico atual.
     * productionReserveQty pertence à visão
     * projetada e NÃO deve ser descontado
     * novamente aqui.
     */
    const planningAvailableQty =
      Math.max(
        Number.isFinite(currentQty)
          ? currentQty
          : 0,
        0
      );

    item.stockByLocation.push({
      locationId:
        String(
          row.locationId
          ?? row.location_id
          ?? ''
        ),

      locationCode:
        String(
          row.locationCode
          ?? row.location_code
          ?? ''
        ),

      locationName:
        String(
          row.locationName
          ?? row.location_name
          ?? ''
        ),

      currentQty:
        Number.isFinite(currentQty)
          ? currentQty
          : 0,

      productionReserveQty:
        Number.isFinite(productionReserveQty)
          ? productionReserveQty
          : 0,

      planningAvailableQty,

      unit:
        String(
          row.unit
          || ''
        )
    });


    item.totalLocationsQty +=
      Number.isFinite(currentQty)
        ? currentQty
        : 0;

    item.totalProductionReserveQty +=
      Number.isFinite(productionReserveQty)
        ? productionReserveQty
        : 0;

    item.totalPlanningAvailableQty +=
      planningAvailableQty;


    item.salesPeriodQty +=
      Number(
        row.movementTotals
          ?.salesQty
        || 0
      );


    if (
      row.permitsSales
      === false
    ) {
      item.material
        .permitsSales =
          false;
    }
  }


  return [
    ...grouped.values()
  ].map(
    row => {

      const permitsSales =
        row.material
          .permitsSales
        !== false;


      const salesPerDayQty =
        permitsSales
        &&
        businessDays > 0
        &&
        row.salesPeriodQty > 0

          ? row.salesPeriodQty
            /
            businessDays

          : null;


      return {
        ...row,

        salesPerDayQty,

        salesBlocked:
          !permitsSales,

        salesNotEstimated:
          permitsSales
          &&
          !(salesPerDayQty > 0)
      };
    }
  );
}


async function loadStockOverviewRows() {

  if (stockOverviewCache) {
    return stockOverviewCache;
  }


  const current =
    await api(
      '/stock/current'
    );


  stockOverviewCache =
    planningStockRowsFromCurrent(
      current
    );


  return stockOverviewCache;
}

  function stockOverviewByMaterialId(rows = []) {
    return new Map(rows.map(row => [String(row.material?.id ?? row.materialId ?? row.id ?? ''), row]));
  }

    function manualScheduleStockFromOverviewRows(rows = []) {
    return (Array.isArray(rows) ? rows : [])
      .flatMap(row => {
        const materialId =
          String(
            row.material?.id
            ?? row.materialId
            ?? row.material_id
            ?? row.id
            ?? ''
          );

        const defaultUnit =
          String(
            row.material?.primary_unit
            ?? row.material?.primaryUnit
            ?? row.unit
            ?? ''
          );

        const locationRows =
          Array.isArray(row.stockByLocation)
            ? row.stockByLocation
            : [];

        if (locationRows.length) {
          return locationRows
            .map(location => {
              const currentQty =
                Number(
                  location.currentQty
                  ?? location.current_qty
                  ?? location.quantity
                  ?? 0
                );

              /*
               * Calendário manual também parte
               * do saldo físico atual.
               *
               * Não descontar reserva projetada.
               */
              const quantity =
                Math.max(
                  Number.isFinite(currentQty)
                    ? currentQty
                    : 0,
                  0
                );

              return {
                materialId,

                locationId:
                  String(
                    location.locationId
                    ?? location.location_id
                    ?? ''
                  ),

                locationCode:
                  String(
                    location.locationCode
                    ?? location.location_code
                    ?? ''
                  ),

                locationName:
                  String(
                    location.locationName
                    ?? location.location_name
                    ?? ''
                  ),

                     quantity:
                  Number.isFinite(quantity)
                    ? quantity
                    : 0,

                unit:
                  String(
                    location.unit
                    || defaultUnit
                  )
              };
            })
            .filter(item => (
              item.materialId
              && item.locationId
            ));
        }

        /*
         * Fallback para snapshots antigos
         * ainda agregados por material.
         */
        const physicalQty =
          Number(
            row.totalLocationsQty
            ?? row.total_locations_qty
            ?? row.quantity
            ?? 0
          );

        const quantity =
          Math.max(
            Number.isFinite(physicalQty)
              ? physicalQty
              : 0,
            0
          );

        return [{
          materialId,

               quantity:
            Number.isFinite(quantity)
              ? quantity
              : 0,

          unit:
            defaultUnit
        }];
      })
      .filter(item => item.materialId);
  }


  function manualPlanningLocalStockSnapshotFromOverviewRows(
    rows = []
  ) {
    return {
      source:
        'stock.current',

      stock:
        manualScheduleStockFromOverviewRows(
          rows
        )
    };
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
                     requiredQty:
  Number(
    parent.produceQty
    ??
    parent.requiredQty
    ??
    0
  ),

stockLimitRecoveryQty:
  Math.max(
    Number(
      parent.stockLimitRecoveryQty
      || 0
    ),
    0
  ),

            unit:
              parent.unit
              || '',

            machineName:
              parent.machineName
              || '',

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
                const plannedReceiptKeys =
      new Set(
        (
          Array.isArray(
            draft.plannedReceipts
          )
            ? draft.plannedReceipts
            : []
        )
          .flatMap(receipt => [
            String(
              receipt
                ?.sourceShortageKey
              || ''
            ),

            ...(
              Array.isArray(
                receipt
                  ?.sourceShortageKeys
              )
                ? receipt
                    .sourceShortageKeys
                    .map(String)
                : []
            )
          ])
          .filter(Boolean)
      );

    return [...groups.values()]
      .filter(
        group =>
          group.shortages.length
      )
      .filter(group => (
        !plannedReceiptKeys.has(
          String(group.key)
        )
      ));
  }

  function wireRodModelOptionsForNode(node = {}) {
    const material = findMaterialById(materials, node.materialId);
    const nodeOptions = Array.isArray(node.productionModelOptions) && node.productionModelOptions.length
      ? node.productionModelOptions
      : productionModelsFor(material).map(model => ({
          modelName: model.modelName || model.name,
          inputs: model.inputs || model.inputMaterials || []
        }));
    return nodeOptions.map(option => {
      const wireRodInput = (option.inputs || option.inputMaterials || []).find(input => (
        isPlanningWireRodMaterial(input)
      ));
      const modelName = String(option.modelName || option.name || '').trim();
      if (!wireRodInput || !modelName) return null;
      const wireRodName = wireRodInput.materialName || wireRodInput.material_name || wireRodInput.name || '';
      return {
        modelName,
        wireRodName,
        label: wireRodName && wireRodName !== modelName
          ? `${wireRodName} — ${modelName}`
          : (wireRodName || modelName)
      };
    }).filter(Boolean);
  }

  function collectMandatoryWireRodChoices(result) {
    const groups = new Map();
    function visit(node, parent = null) {
      if (!node || typeof node !== 'object') return;
      const materialId = Number(node.materialId);
      const productionIndex = Number(node.productionIndex);
      const needsProduction = Number(node.produceQty || 0) > 0;
      if (
        parent
        && isPlanningCoilMaterial(node)
        && needsProduction
        && !node.isInitialRawMaterial
        && Number.isFinite(materialId)
        && Number.isFinite(productionIndex)
      ) {
        const key = String(materialId);
        const existingOverride = draft.operationOverrides?.[`${productionIndex}:${materialId}`];
        const selectedModelName = String(
          existingOverride?.productionModelName || node.productionModelName || ''
        ).trim();
        const options = wireRodModelOptionsForNode(node);
        if (!groups.has(key)) {
          groups.set(key, {
            materialId,
            materialName: node.materialName || findMaterialById(materials, materialId)?.name || '',
            materialCode: node.materialCode || '',
            productionIndexes: [],
            productions: [],
            options: [],
            selectedModelName: ''
          });
        }
        const group = groups.get(key);
        if (!group.productionIndexes.includes(productionIndex)) {
          group.productionIndexes.push(productionIndex);
          group.productions.push({
            productionIndex,
            productionTitle: node.productionTitle || `Produção ${productionIndex + 1}`
          });
        }
        options.forEach(option => {
          if (!group.options.some(current => current.modelName === option.modelName)) {
            group.options.push(option);
          }
        });
        if (!group.selectedModelName && options.some(option => option.modelName === selectedModelName)) {
          group.selectedModelName = selectedModelName;
        }
      }
      (node.children || []).forEach(child => visit(child, node));
    }
    productionFlowTrees(result).forEach(root => visit(root));
    return [...groups.values()].map(group => ({
      ...group,
      productionIndexes: group.productionIndexes.sort((left, right) => left - right),
      productions: group.productions.sort((left, right) => left.productionIndex - right.productionIndex),
      selectedModelName: group.selectedModelName || group.options[0]?.modelName || ''
    }));
  }

  function applyMandatoryWireRodChoices(selections = []) {
    draft.operationOverrides = draft.operationOverrides && typeof draft.operationOverrides === 'object'
      ? draft.operationOverrides
      : {};
    selections.forEach(selection => {
      const materialId = Number(selection.materialId);
      if (!Number.isFinite(materialId) || !selection.productionModelName) return;
      (selection.productionIndexes || []).forEach(productionIndex => {
        const key = `${Number(productionIndex)}:${materialId}`;
        draft.operationOverrides[key] = {
          ...(draft.operationOverrides[key] || {}),
          productionModelName: selection.productionModelName
        };
      });
    });
  }

  async function requestMandatoryWireRodChoices(result) {
    const groups = collectMandatoryWireRodChoices(result);
    if (!groups.length) return { action: 'none' };
    page.querySelector('.mandatory-wire-rod-modal')?.remove();
    const hasInvalidGroup = groups.some(group => !group.options.length);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop mandatory-wire-rod-modal';
    backdrop.innerHTML = `
      <div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="mandatory-wire-rod-title">
        <div class="modal-header">
          <div>
            <h2 id="mandatory-wire-rod-title">Escolha o Fio Máquina</h2>
            <p class="modal-subtitle">Selecione o insumo que será utilizado para produzir cada Bobina.</p>
          </div>
        </div>
        <form class="mandatory-wire-rod-form">
          <div class="planning-shortage-list">
            ${groups.map(group => `
              <article class="planning-shortage-card" data-wire-rod-group="${escapeHtml(String(group.materialId))}">
                <div class="planning-shortage-card-header">
                  <div>
                    <strong>${escapeHtml(group.materialName || group.materialCode || 'Bobina')}</strong>
                    ${group.materialCode ? `<span>${escapeHtml(group.materialCode)}</span>` : ''}
                  </div>
                </div>
                <p>${escapeHtml(`${group.productions.length > 1 ? 'Produções' : 'Produção'}: ${group.productions.map(item => {
                  const number = `Produção ${item.productionIndex + 1}`;
                  return item.productionTitle && item.productionTitle !== number
                    ? `${number} — ${item.productionTitle}`
                    : number;
                }).join(', ')}`)}</p>
                ${group.options.length ? `
                  <label>
                    Fio Máquina
                    <select data-wire-rod-choice="${escapeHtml(String(group.materialId))}" required>
                      ${group.options.map(option => `<option value="${escapeHtml(option.modelName)}" ${option.modelName === group.selectedModelName ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                    </select>
                  </label>
                ` : `
                  <p class="form-error">Esta Bobina precisa ser produzida, mas não possui um modelo produtivo com Fio Máquina cadastrado.</p>
                `}
              </article>
            `).join('')}
          </div>
          <div class="form-actions modal-actions">
            <button class="secondary-button" type="button" data-wire-rod-cancel>Cancelar</button>
            <button class="primary-button" type="submit" ${hasInvalidGroup ? 'disabled aria-disabled="true"' : ''}>Continuar simulação</button>
          </div>
        </form>
      </div>
    `;
    return new Promise(resolve => {
      const close = value => {
        backdrop.remove();
        resolve(value);
      };
      backdrop.addEventListener('click', event => {
        if (event.target.closest('[data-wire-rod-cancel]') || event.target === backdrop) {
          close({ action: 'cancel' });
        }
      });
      backdrop.querySelector('form')?.addEventListener('submit', event => {
        event.preventDefault();
        if (hasInvalidGroup) return;
        const selections = groups.map(group => ({
          materialId: group.materialId,
          productionIndexes: group.productionIndexes,
          productionModelName: backdrop.querySelector(`[data-wire-rod-choice="${group.materialId}"]`)?.value || ''
        }));
        if (selections.some(selection => !selection.productionModelName)) return;
        close({ action: 'apply', selections });
      });
      backdrop.addEventListener('keydown', event => {
        if (event.key === 'Escape') close({ action: 'cancel' });
      });
      page.appendChild(backdrop);
      backdrop.querySelector('[data-wire-rod-choice], [data-wire-rod-cancel]')?.focus();
    });
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

    function planningShortageReceiptLocation(
    group = {}
  ) {
    const machine =
      planningMachineForAllocation(
        {
          machineName:
            group?.machineName
        },
        registeredMachines
      );

    const machineLocationId =
      planningMachineLocationId(
        machine || {}
      );

    if (machineLocationId) {
      return {
        locationId:
          machineLocationId,

        locationName:
          planningLocationLabel(
            machineLocationId
          )
      };
    }

    const matriz =
      (locations || [])
        .find(location => (
          normalizeText(
            location?.name
            ?? location?.locationName
            ?? location?.location_name
            ?? ''
          ).includes(
            'matriz'
          )
        ));

    const fallback =
      matriz
      || (locations || [])[0]
      || {};

    const locationId =
      String(
        fallback?.id
        ?? fallback?.locationId
        ?? fallback?.location_id
        ?? ''
      ).trim();

    return {
      locationId,

      locationName:
        String(
          fallback?.name
          ?? fallback?.locationName
          ?? fallback?.location_name
          ?? locationId
        )
    };
  }


    function shortageReceiptMaterialOptions(
    group,
    option = null
  ) {
    const modelOptions =
      Array.isArray(
        group?.productionModelOptions
      )
        ? group.productionModelOptions
        : [];


    const candidates =
      modelOptions.length

        ? modelOptions.flatMap(
            model =>
              (
                Array.isArray(model?.inputs)
                  ? model.inputs
                  : []
              ).map(input => ({
                input,

                productionModelName:
                  String(
                    model?.modelName
                    || ''
                  )
              }))
          )

        : shortageInputsForGroup(
            group,
            option
          ).map(input => ({
            input,

            productionModelName:
              String(
                option?.modelName
                || group?.productionModelName
                || ''
              )
          }));


    const byMaterial =
      new Map();


    candidates.forEach(candidate => {
      const input =
        candidate.input
        || {};

      const materialId =
        String(
          input.materialId
          || ''
        );

      if (!materialId) {
        return;
      }

      const catalogMaterial =
        findMaterialById(
          materials,
          materialId
        )
        || {};


      if (!byMaterial.has(materialId)) {
        byMaterial.set(
          materialId,
          {
            materialId,

            materialName:
              String(
                input.materialName
                || catalogMaterial?.name
                || materialId
              ),

            materialCode:
              String(
                catalogMaterial?.code
                ?? catalogMaterial?.materialCode
                ?? catalogMaterial?.material_code
                ?? ''
              ),

            unit:
              String(
                catalogMaterial?.primary_unit
                ?? catalogMaterial?.primaryUnit
                ?? input.unit
                ?? 'kg'
              ),

            productionModelName:
              candidate.productionModelName
          }
        );
      }
    });


    return [
      ...byMaterial.values()
    ];
  }

   function readShortageSelections(root, groups = []) {
    return new Map(
      groups.map(group => {
        const selector =
          window.CSS?.escape
            ? window.CSS.escape(group.key)
            : group.key;

        const card =
          root?.querySelector?.(
            `[data-shortage-key="${selector}"]`
          );

        return [
          String(group.key),

          {
            action:
              card
                ?.querySelector(
                  '.planning-shortage-actions input:checked'
                )
                ?.value
              || 'keep',

            productionModelName:
              card
                ?.querySelector(
                  '.planning-shortage-model select'
                )
                ?.value
              || group.productionModelName
              || '',

            targetProductionQty:
              Number(
                card
                  ?.querySelector(
                    '[name^="production-quantity-"]'
                  )
                  ?.value
                || 0
              )
          }
        ];
      })
    );
  }

    function shortageBaseProductionQuantity(
    group = {}
  ) {
    const production =
      draft.productions?.[
        Number(
          group.productionIndex || 0
        )
      ] || {};

    return Number(
      production.plannedQty
      || 0
    );
  }

  function shortageFinalProductionUnit(
    group = {}
  ) {
    const production =
      draft.productions?.[
        Number(
          group.productionIndex || 0
        )
      ] || {};

    const material =
      findMaterialById(
        materials,
        production.materialId
      ) || {};

    return String(
      material.primary_unit
      ?? material.primaryUnit
      ?? production.plannedUnit
      ?? production.unit
      ?? group.unit
      ?? ''
    );
  }

  function shortageEffectiveRequiredQuantity(
    group = {},
    selection = {}
  ) {
    const baseRequired =
      Number(
        group.requiredQty || 0
      );

    const baseProductionQty =
      shortageBaseProductionQuantity(
        group
      );

    const requestedProductionQty =
      Number(
        selection.targetProductionQty
        || 0
      );

    if (
      selection.action !== 'quantity'
      || !(requestedProductionQty > 0)
      || !(baseProductionQty > 0)
    ) {
      return baseRequired;
    }

    const recoveryQty =
  Math.max(
    Number(
      group.stockLimitRecoveryQty
      || 0
    ),
    0
  );


const normalRequiredQty =
  Math.max(
    baseRequired
    -
    recoveryQty,
    0
  );


return Number(
  (
    (
      normalRequiredQty
      *
      requestedProductionQty
      /
      baseProductionQty
    )
    +
    recoveryQty
  ).toFixed(6)
);
  }

  function shortageGlobalReceiptMaterialOptions(
    groups = []
  ) {
    const byMaterial =
      new Map();

    groups.forEach(group => {
      shortageReceiptMaterialOptions(
        group
      ).forEach(item => {
        const materialId =
          String(
            item.materialId || ''
          );

        if (
          materialId
          && !byMaterial.has(
            materialId
          )
        ) {
          byMaterial.set(
            materialId,
            item
          );
        }
      });
    });

    return [
      ...byMaterial.values()
    ].sort(
      (left, right) =>
        String(
          left.materialName || ''
        ).localeCompare(
          String(
            right.materialName || ''
          ),
          'pt-BR',
          {
            numeric: true
          }
        )
    );
  }

  function readGlobalShortageReceipts(
    root
  ) {
    return [
      ...(
        root?.querySelectorAll?.(
          '.planning-global-receipt-row'
        ) || []
      )
    ].map(row => ({
      id:
        String(
          row.dataset.receiptId
          || ''
        ),

      materialId:
        String(
          row
            .querySelector(
              '[name="global-receipt-material"]'
            )
            ?.value
          || ''
        ),

      quantity:
        Number(
          row
            .querySelector(
              '[name="global-receipt-quantity"]'
            )
            ?.value
          || 0
        ),

      arrivalDate:
        String(
          row
            .querySelector(
              '[name="global-receipt-arrival"]'
            )
            ?.value
          || ''
        ).slice(
          0,
          10
        ),

      locationId:
        String(
          row
            .querySelector(
              '[name="global-receipt-location"]'
            )
            ?.value
          || ''
        )
    }));
  }

  function initialGlobalShortageReceipts(
    groups = [],
    stockRowsByMaterial = new Map()
  ) {
    const previews =
      buildProductionShortageCascade(
        groups,
        stockRowsByMaterial,
        new Map(),
        []
      );

    const shortageByMaterial =
      new Map();

    groups.forEach(group => {
      const rows =
        previews.get(
          String(group.key)
        ) || [];

      rows.forEach(row => {
        const materialId =
          String(
            row.materialId || ''
          );

        if (!materialId) {
          return;
        }

        const shortageQty =
          Math.max(
            Number(
              row.shortageQty || 0
            ),
            0
          );

        const current =
          shortageByMaterial.get(
            materialId
          )
          || {
            materialId,

            materialName:
              row.materialName
              || materialId,

            unit:
              row.unit
              || 'kg',

            quantity:
              0,

            group
          };

        /*
         * O saldo vai ficando acumulado
         * entre Produção 1, 2, 3...
         *
         * Portanto usamos o maior déficit
         * acumulado daquele Fio Máquina.
         */
        current.quantity =
          Math.max(
            current.quantity,
            shortageQty
          );

        shortageByMaterial.set(
          materialId,
          current
        );
      });
    });

    const defaultArrivalDate =
      addDays(
        draft.planningStartDate
        || today(),
        1
      );

    return [
      ...shortageByMaterial.values()
    ]
      .filter(
        item =>
          item.quantity > 0
      )
      .map(
        (
          item,
          index
        ) => {
          const location =
            planningShortageReceiptLocation(
              item.group
            );

          return {
            id:
              `shortage-global-receipt-${Date.now()}-${index}`,

            materialId:
              item.materialId,

            quantity:
              Math.max(
                Math.ceil(
                  item.quantity
                ),
                1
              ),

            arrivalDate:
              defaultArrivalDate,

            locationId:
              location.locationId,

            unit:
              item.unit
          };
        }
      );
  }

  function renderGlobalShortageReceiptRows(
    receipts = [],
    groups = []
  ) {
    const materialOptions =
      shortageGlobalReceiptMaterialOptions(
        groups
      );

    return receipts
      .map(
        (
          receipt,
          index
        ) => {
          const material =
            materialOptions.find(
              item =>
                String(
                  item.materialId
                ) ===
                String(
                  receipt.materialId
                )
            )
            || materialOptions[0]
            || null;

          const arrivalDate =
            isValidDateOnly(
              receipt.arrivalDate
            )
              ? receipt.arrivalDate
              : addDays(
                  draft.planningStartDate
                  || today(),
                  1
                );

          const availableDate =
            addDays(
              arrivalDate,
              1
            );

          const selectedLocationId =
            String(
              receipt.locationId
              || planningShortageReceiptLocation(
                groups[0] || {}
              ).locationId
              || ''
            );

          return `
            <div
              class="planning-global-receipt-row"
              data-receipt-id="${escapeHtml(
                receipt.id
                || `shortage-global-receipt-${Date.now()}-${index}`
              )}"
            >

              <label>
                Insumo previsto

                <select
                  name="global-receipt-material"
                >
                  ${
                    materialOptions
                      .map(
                        item => `
                          <option
                            value="${escapeHtml(
                              item.materialId
                            )}"
                            data-unit="${escapeHtml(
                              item.unit || ''
                            )}"
                            ${
                              String(
                                item.materialId
                              ) ===
                              String(
                                material?.materialId
                                || ''
                              )
                                ? 'selected'
                                : ''
                            }
                          >
                            ${escapeHtml(
                              item.materialName
                            )}
                          </option>
                        `
                      )
                      .join('')

                    ||

                    '<option value="">Sem insumo cadastrado</option>'
                  }
                </select>
              </label>

              <label>
                Quantidade prevista

                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  name="global-receipt-quantity"
                  value="${escapeHtml(
                    String(
                      receipt.quantity
                      || ''
                    )
                  )}"
                />
              </label>

              <label>
                Data estimada de chegada

                <input
                  type="date"
                  name="global-receipt-arrival"
                  value="${escapeHtml(
                    arrivalDate
                  )}"
                />
              </label>

              <label>
                Local de entrada

                <select
                  name="global-receipt-location"
                >
                  ${locationOptions(
                    selectedLocationId
                  )}
                </select>
              </label>

              <div
                class="planning-global-receipt-availability"
              >

                <span>
                  Disponível para produção
                </span>

                <strong
                  data-global-receipt-available-date
                >
                  ${escapeHtml(
                    formatDateOnly(
                      availableDate
                    )
                  )}
                </strong>

                <small
                  data-global-receipt-unit
                >
                  ${escapeHtml(
                    material?.unit
                    || ''
                  )}
                </small>

              </div>

              <button
                class="planning-global-receipt-remove"
                type="button"
                data-remove-global-receipt
                aria-label="Remover entrada prevista"
                title="Remover entrada prevista"
              >
                ×
              </button>

            </div>
          `;
        }
      )
      .join('');
  }

    function buildProductionShortageCascade(
    groups = [],
    stockRowsByMaterial = new Map(),
    selections = new Map(),
    plannedReceipts = []
  ) {
    const balances =
      new Map();

    const previewByKey =
      new Map();

    const receiptTotalsByMaterial =
      new Map();

    (
      Array.isArray(
        plannedReceipts
      )
        ? plannedReceipts
        : []
    ).forEach(receipt => {
      const materialId =
        String(
          receipt?.materialId || ''
        );

      const quantity =
        Number(
          receipt?.quantity || 0
        );

      if (
        !materialId
        || !(quantity > 0)
      ) {
        return;
      }

      receiptTotalsByMaterial.set(
        materialId,

        Number(
          (
            Number(
              receiptTotalsByMaterial.get(
                materialId
              ) || 0
            )
            +
            quantity
          ).toFixed(6)
        )
      );
    });

    [
      ...groups
    ]
      .sort(
        (
          left,
          right
        ) =>
          Number(
            left.productionIndex
          )
          -
          Number(
            right.productionIndex
          )
      )
      .forEach(group => {
        const selection =
          selections.get(
            String(group.key)
          )
          || {};

        if (
          selection.action ===
          'skip'
        ) {
          previewByKey.set(
            String(group.key),
            []
          );

          return;
        }

        const option =
          selectedShortageOption(
            group,
            selection
              .productionModelName
          );

        /*
         * Se o usuário marcou
         * PRODUZIR OUTRA QUANTIDADE,
         * reduz/aumenta toda a cadeia.
         */
        const effectiveRequiredQty =
          shortageEffectiveRequiredQuantity(
            group,
            selection
          );

        const rows =
          shortageInputsForGroup(
            group,
            option
          ).map(input => {
            const materialKey =
              String(
                input.materialId
              );

            /*
             * SALDO GLOBAL:
             *
             * estoque físico
             * +
             * todas as chegadas previstas
             * daquele insumo.
             */
            const initialAvailable =
              stockQuantityForMaterial(
                stockRowsByMaterial,
                materialKey
              )
              +
              Number(
                receiptTotalsByMaterial.get(
                  materialKey
                ) || 0
              );

            /*
             * Produção 2 recebe o saldo
             * restante da Produção 1.
             */
            const availableBefore =
              balances.has(
                materialKey
              )
                ? Number(
                    balances.get(
                      materialKey
                    ) || 0
                  )
                : initialAvailable;

            const requiredQty =
              Number(
                (
                  Number(
                    effectiveRequiredQty
                    || 0
                  )
                  *
                  Number(
                    input.qtyPerOutput
                    || 0
                  )
                ).toFixed(3)
              );

            const availableAfter =
              Number(
                (
                  availableBefore
                  -
                  requiredQty
                ).toFixed(3)
              );

            balances.set(
              materialKey,
              availableAfter
            );

            return {
              materialId:
                input.materialId,

              materialName:
                input.materialName
                || '',

              unit:
                input.unit
                || group.unit
                || '',

              requiredQty,

              availableBefore,

              availableAfter,

              shortageQty:
                Math.max(
                  -availableAfter,
                  0
                )
            };
          });

        previewByKey.set(
          String(group.key),
          rows
        );
      });

    return previewByKey;
  }

    function renderProductionShortageDecisionRows(
    groups = [],
    stockRowsByMaterial = new Map(),
    previewRowsByKey = null,
    plannedReceipts = []
  ) {
    const previews =
      previewRowsByKey
      ||
      buildProductionShortageCascade(
        groups,
        stockRowsByMaterial,
        new Map(),
        plannedReceipts
      );

    return groups
      .map(group => {
        const finalMaterialLabel =
          [
            group.finalMaterialName,

            group.finalMaterialCode
              ? `(${group.finalMaterialCode})`
              : ''
          ]
            .filter(Boolean)
            .join(' ');

        const showFinalMaterial =
          finalMaterialLabel
          &&
          String(
            group.finalMaterialName
            || group.finalMaterialCode
            || ''
          ) !==
          String(
            group.materialName
            || group.materialCode
            || ''
          );

        const currentModelName =
          String(
            group.productionModelName
            ||
            group.productionModelOptions
              ?.[0]
              ?.modelName
            ||
            ''
          );

        const selectedOption =
          selectedShortageOption(
            group,
            currentModelName
          );

        const options =
          (
            group.productionModelOptions
            || []
          )
            .map(
              option => `
                <option
                  value="${escapeHtml(
                    option.modelName
                  )}"
                  ${
                    String(
                      option.modelName
                    ) ===
                    String(
                      selectedOption
                        ?.modelName
                      || ''
                    )
                      ? 'selected'
                      : ''
                  }
                >
                  ${escapeHtml(
                    option.modelName
                  )}
                </option>
              `
            )
            .join('');

        const previewRows =
          previews.get(
            String(group.key)
          ) || [];

        const totalShortageQty =
          previewRows.reduce(
            (
              sum,
              item
            ) =>
              sum
              +
              Number(
                item.shortageQty || 0
              ),
            0
          );

        const isCovered =
          previewRows.length > 0
          &&
          totalShortageQty
          <= 0.000001;

        const baseProductionQty =
          shortageBaseProductionQuantity(
            group
          );

        const finalProductionUnit =
          shortageFinalProductionUnit(
            group
          );

        return `
          <article
            class="planning-shortage-card"
            data-shortage-key="${escapeHtml(
              group.key
            )}"
            data-production-index="${escapeHtml(
              group.productionIndex
            )}"
            data-material-id="${escapeHtml(
              group.materialId
            )}"
          >

            <header
              class="planning-shortage-card-header"
            >

              <div>

                <strong>
                  ${escapeHtml(
                    group.productionTitle
                  )}
                  -
                  ${escapeHtml(
                    group.materialName
                  )}
                </strong>

                ${
                  showFinalMaterial
                    ? `
                      <em>
                        Produção final:
                        ${escapeHtml(
                          finalMaterialLabel
                        )}
                      </em>
                    `
                    : ''
                }

                <span>
                  ${escapeHtml(
                    group.materialCode
                    || ''
                  )}
                </span>

              </div>

              <span
                class="planning-shortage-badge ${
                  isCovered
                    ? 'is-ok'
                    : ''
                }"
              >
                ${
                  isCovered
                    ? 'OK'
                    : `${escapeHtml(
                        formatPtBrDecimal(
                          totalShortageQty
                        )
                      )} em falta`
                }
              </span>

            </header>

            <div
              class="planning-shortage-current"
            >
              ${renderProductionShortageModelPreview(
                group,
                selectedOption,
                stockRowsByMaterial,
                previewRows
              )}
            </div>

            <div
              class="planning-shortage-actions"
            >

              <label>

                <input
                  type="radio"
                  name="shortage-action-${escapeHtml(
                    group.key
                  )}"
                  value="keep"
                  checked
                />

                <span>
                  Prosseguir
                  <strong>
                    Manter como está
                  </strong>
                </span>

              </label>

              <label>

                <input
                  type="radio"
                  name="shortage-action-${escapeHtml(
                    group.key
                  )}"
                  value="model"
                  ${
                    options
                      ? ''
                      : 'disabled'
                  }
                />

                <span>
                  Trocar modelo
                  <strong>
                    Usar outro insumo
                  </strong>
                </span>

              </label>

              <label>

                <input
                  type="radio"
                  name="shortage-action-${escapeHtml(
                    group.key
                  )}"
                  value="quantity"
                />

                <span>
                  Produzir outra quantidade
                  <strong>
                    Alterar esta produção
                  </strong>
                </span>

              </label>

              <label>

                <input
                  type="radio"
                  name="shortage-action-${escapeHtml(
                    group.key
                  )}"
                  value="skip"
                />

                <span>
                  Não produzir
                  <strong>
                    Cortar esta cadeia
                  </strong>
                </span>

              </label>

            </div>

            <div
              class="planning-shortage-quantity"
            >

              <label>
                Nova quantidade da produção final

                <div>

                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    name="production-quantity-${escapeHtml(
                      group.key
                    )}"
                    value="${escapeHtml(
                      String(
                        baseProductionQty
                        || ''
                      )
                    )}"
                  />

                  <span>
                    ${escapeHtml(
                      finalProductionUnit
                    )}
                  </span>

                </div>

              </label>

              <small>
                Ao alterar, toda a necessidade desta cadeia é recalculada automaticamente.
              </small>

            </div>

            <label
              class="planning-shortage-model"
            >
              Modelo de produção

              <select
                name="model-${escapeHtml(
                  group.key
                )}"
                ${
                  options
                    ? ''
                    : 'disabled'
                }
              >
                ${
                  options
                  ||
                  '<option value="">Sem alternativa cadastrada</option>'
                }
              </select>

            </label>

          </article>
        `;
      })
      .join('');
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
        let globalReceipts =
      initialGlobalShortageReceipts(
        groups,
        stockRowsByMaterial
      );

    const initialPreviews =
      buildProductionShortageCascade(
        groups,
        stockRowsByMaterial,
        new Map(),
        globalReceipts
      );

    backdrop.innerHTML = `
      <div class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="production-shortage-title">
        <div class="modal-header">
          <div>
            <h2 id="production-shortage-title">Materiais sem saldo para produzir</h2>
            <p class="modal-subtitle">Revise os modelos antes de levar o planejamento para o calendário.</p>
          </div>
        </div>
               <form class="production-shortage-form">

          <section
            class="planning-global-receipts"
          >

            <div
              class="planning-global-receipts-head"
            >

              <div>

                <strong>
                  Prever chegada
                </strong>

                <span>
                  Compra estimada / entrada geral da simulação
                </span>

              </div>

              <button
                class="secondary-button"
                type="button"
                data-add-global-receipt
              >
                + Adicionar chegada
              </button>

            </div>

            <div
              class="planning-global-receipts-list"
            >
              ${renderGlobalShortageReceiptRows(
                globalReceipts,
                groups
              )}
            </div>

          </section>

          <div
            class="planning-shortage-list"
          >
            ${renderProductionShortageDecisionRows(
              groups,
              stockRowsByMaterial,
              initialPreviews,
              globalReceipts
            )}
          </div>
          <p class="form-error" hidden></p>
          <div class="form-actions modal-actions">
            <button class="secondary-button" type="button" data-shortage-cancel>Cancelar simulação</button>
            <button class="primary-button" type="submit">Aplicar decisões</button>
          </div>
        </form>
      </div>
    `;
    return new Promise(resolve => {

  const originalPlannedQtyByIndex =
    new Map(
      groups.map(group => [
        String(group.productionIndex),
        String(
          shortageBaseProductionQuantity(group)
          || ''
        )
      ])
    );

  const syncShortageProductionCards =
    (selections = new Map()) => {
      groups.forEach(group => {
        const productionIndex =
          Number(group.productionIndex);

        const production =
          draft.productions?.[
            productionIndex
          ];

        if (!production) {
          return;
        }

        const selection =
          selections.get(
            String(group.key)
          )
          || {};

        const originalQty =
          String(
            originalPlannedQtyByIndex.get(
              String(productionIndex)
            )
            || production.plannedQty
            || ''
          );

        const nextQty =
          selection.action === 'quantity'
          &&
          Number.isFinite(
            Number(
              selection.targetProductionQty
            )
          )
          &&
          Number(
            selection.targetProductionQty
          ) > 0
            ? String(
                Number(
                  Number(
                    selection.targetProductionQty
                  ).toFixed(6)
                )
              )
            : originalQty;

        const productionId =
          String(
            production.id || ''
          );

        const escapedProductionId =
          window.CSS?.escape
            ? window.CSS.escape(
                productionId
              )
            : productionId;

        const productionCard =
          page.querySelector(
            `.productions-target [data-production-id="${escapedProductionId}"]`
          );

        const qtyInput =
          productionCard?.querySelector(
            'input[name="plannedQty"]'
          );

        if (qtyInput) {
          qtyInput.value = nextQty;
        }
      });
    };

  const close = value => {
    if (value?.action !== 'apply') {
      syncShortageProductionCards(
        new Map()
      );
    }

    backdrop.remove();
    resolve(value);
  };

    const refreshCascadePreview = () => {
    const selections =
      readShortageSelections(
        backdrop,
        groups
      );

    syncShortageProductionCards(
      selections
    );

    globalReceipts =
      readGlobalShortageReceipts(
        backdrop
      );

    const previews =
      buildProductionShortageCascade(
        groups,
        stockRowsByMaterial,
        selections,
        globalReceipts
      );

        groups.forEach(group => {
          const selector =
            window.CSS?.escape
              ? window.CSS.escape(
                  group.key
                )
              : group.key;

          const card =
            backdrop.querySelector(
              `[data-shortage-key="${selector}"]`
            );

          if (!card) {
            return;
          }

          const selection =
            selections.get(
              String(group.key)
            )
            || {};

          const selectedOption =
            selectedShortageOption(
              group,
              selection.productionModelName
            );

          const previewRows =
            previews.get(
              String(group.key)
            )
            || [];

          const preview =
            card.querySelector(
              '.planning-shortage-current'
            );

          if (preview) {
            preview.innerHTML =
              renderProductionShortageModelPreview(
                group,
                selectedOption,
                stockRowsByMaterial,
                previewRows
              );
          }

          const badge =
            card.querySelector(
              '.planning-shortage-badge'
            );

          if (badge) {
            const totalShortageQty =
              previewRows.reduce(
                (sum, item) =>
                  sum
                  + Number(
                      item.shortageQty
                      || 0
                    ),
                0
              );

                        const isCovered =
              previewRows.length > 0
              &&
              totalShortageQty
              <= 0.000001;

            badge.classList.toggle(
              'is-ok',
              isCovered
            );

            badge.textContent =
              isCovered
                ? 'OK'
                : `${formatPtBrDecimal(
                    totalShortageQty
                  )} em falta`;
          }


          /*
           * Se trocar o modelo:
           *
           * Fio Máquina 6,5
           *        ↓
           * Fio Máquina 5,5
           *
           * atualizamos também o insumo
           * da entrada prevista.
           */
          const receiptSelect =
            card.querySelector(
              '[name^="receipt-material-"]'
            );

          if (receiptSelect) {
            const previousValue =
              receiptSelect.value;

            const receiptMaterials =
              shortageReceiptMaterialOptions(
                group,
                selectedOption
              );

            receiptSelect.innerHTML =
              receiptMaterials.length

                ? receiptMaterials
                    .map(item => `
                      <option
                        value="${escapeHtml(item.materialId)}"
                        data-unit="${escapeHtml(item.unit)}"
                      >
                        ${escapeHtml(item.materialName)}
                      </option>
                    `)
                    .join('')

                : '<option value="">Sem insumo cadastrado</option>';


            if (
              receiptMaterials.some(
                item =>
                  String(item.materialId)
                  === String(previousValue)
              )
            ) {
              receiptSelect.value =
                previousValue;
            }


            const selectedReceiptMaterial =
              receiptMaterials.find(
                item =>
                  String(item.materialId)
                  === String(
                    receiptSelect.value
                  )
              )
              || receiptMaterials[0]
              || null;


            const availabilityMeta =
              card.querySelector(
                '.planning-shortage-receipt-availability small'
              );


            if (availabilityMeta) {
              const receiptLocation =
                planningShortageReceiptLocation(
                  group
                );

              availabilityMeta.textContent =
                [
                  receiptLocation.locationName
                  || 'Local não definido',

                  selectedReceiptMaterial?.unit
                  || ''
                ]
                  .filter(Boolean)
                  .join(' · ');
            }
          }
        });
      };

            const renderGlobalReceipts =
        () => {
          const target =
            backdrop.querySelector(
              '.planning-global-receipts-list'
            );

          if (!target) {
            return;
          }

          target.innerHTML =
            renderGlobalShortageReceiptRows(
              globalReceipts,
              groups
            );

          refreshCascadePreview();
        };

      backdrop
        .querySelector(
          '[data-add-global-receipt]'
        )
        ?.addEventListener(
          'click',
          () => {
            globalReceipts =
              readGlobalShortageReceipts(
                backdrop
              );

            const materialOptions =
              shortageGlobalReceiptMaterialOptions(
                groups
              );

            const firstMaterial =
              materialOptions[0]
              || null;

            const defaultLocation =
              planningShortageReceiptLocation(
                groups[0] || {}
              );

            globalReceipts.push({
              id:
                `shortage-global-receipt-${Date.now()}-${globalReceipts.length}`,

              materialId:
                firstMaterial
                  ?.materialId
                || '',

              quantity:
                '',

              arrivalDate:
                addDays(
                  draft.planningStartDate
                  || today(),
                  1
                ),

              locationId:
                defaultLocation
                  .locationId
            });

            renderGlobalReceipts();
          }
        );

      backdrop.addEventListener(
        'click',
        event => {
          const removeButton =
            event.target.closest(
              '[data-remove-global-receipt]'
            );

          if (!removeButton) {
            return;
          }

          const row =
            removeButton.closest(
              '.planning-global-receipt-row'
            );

          globalReceipts =
            readGlobalShortageReceipts(
              backdrop
            ).filter(
              receipt =>
                String(
                  receipt.id
                ) !==
                String(
                  row?.dataset
                    .receiptId
                  || ''
                )
            );

          renderGlobalReceipts();
        }
      );

      backdrop.addEventListener(
        'input',
        event => {
          if (
            event.target.matches(
              '[name="global-receipt-quantity"], [name^="production-quantity-"]'
            )
          ) {
            refreshCascadePreview();
          }
        }
      );

      backdrop.querySelector('[data-shortage-cancel]').addEventListener('click', () => close({ action: 'cancel' }));
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close({ action: 'cancel' });
      });
            backdrop.addEventListener(
        'change',
        event => {

          /*
           * CHEGADA GLOBAL:
           * TROCOU A DATA DE CHEGADA
           */
          if (
            event.target.matches(
              '[name="global-receipt-arrival"]'
            )
          ) {
            const row =
              event.target.closest(
                '.planning-global-receipt-row'
              );

            const target =
              row?.querySelector(
                '[data-global-receipt-available-date]'
              );

            const arrivalDate =
              String(
                event.target.value
                || ''
              ).slice(
                0,
                10
              );

            if (
              target
              &&
              isValidDateOnly(
                arrivalDate
              )
            ) {
              target.textContent =
                formatDateOnly(
                  addDays(
                    arrivalDate,
                    1
                  )
                );
            }

            refreshCascadePreview();

            return;
          }


          /*
           * CHEGADA GLOBAL:
           * TROCOU O FIO MÁQUINA / INSUMO
           */
          if (
            event.target.matches(
              '[name="global-receipt-material"]'
            )
          ) {
            const row =
              event.target.closest(
                '.planning-global-receipt-row'
              );

            const unit =
              event.target
                .selectedOptions?.[0]
                ?.dataset?.unit
              || '';

            const unitTarget =
              row?.querySelector(
                '[data-global-receipt-unit]'
              );

            if (unitTarget) {
              unitTarget.textContent =
                unit;
            }

            refreshCascadePreview();

            return;
          }


          /*
           * CHEGADA GLOBAL:
           * TROCOU O LOCAL DE ENTRADA
           */
          if (
            event.target.matches(
              '[name="global-receipt-location"]'
            )
          ) {
            refreshCascadePreview();

            return;
          }


          /*
           * TROCOU O MODELO DE PRODUÇÃO
           */
          if (
            event.target.matches(
              '.planning-shortage-model select'
            )
          ) {
            const card =
              event.target.closest(
                '.planning-shortage-card'
              );

            const selectedAction =
              card
                ?.querySelector(
                  '.planning-shortage-actions input:checked'
                )
                ?.value;

            /*
             * Se estiver em "Prever chegada",
             * continua em Prever chegada.
             *
             * Só troca automaticamente para
             * "Trocar modelo" nos outros casos.
             */
                        if (
              selectedAction
              !== 'quantity'
            ) {
              card
                ?.querySelector(
                  '.planning-shortage-actions input[value="model"]'
                )
                ?.click();
            }

            refreshCascadePreview();

            return;
          }


          /*
           * TROCOU A DATA DE CHEGADA
           *
           * Atualiza D+1 na hora.
           */
          if (
            event.target.matches(
              '[name^="receipt-arrival-"]'
            )
          ) {
            const card =
              event.target.closest(
                '.planning-shortage-card'
              );

            const availableTarget =
              card?.querySelector(
                '[data-receipt-available-date]'
              );

            const arrivalDate =
              String(
                event.target.value
                || ''
              ).slice(0, 10);

            if (
              availableTarget
              &&
              isValidDateOnly(
                arrivalDate
              )
            ) {
              availableTarget.textContent =
                formatDateOnly(
                  addDays(
                    arrivalDate,
                    1
                  )
                );
            }

            return;
          }


          /*
           * TROCOU O INSUMO PREVISTO
           */
          if (
            event.target.matches(
              '[name^="receipt-material-"]'
            )
          ) {
            const card =
              event.target.closest(
                '.planning-shortage-card'
              );

            const unit =
              event.target
                .selectedOptions?.[0]
                ?.dataset
                ?.unit
              || '';

            const groupKey =
              card?.dataset
                ?.shortageKey
              || '';

            const group =
              groups.find(item => (
                String(item.key)
                === String(groupKey)
              ));

            const location =
              planningShortageReceiptLocation(
                group || {}
              );

            const availabilityMeta =
              card?.querySelector(
                '.planning-shortage-receipt-availability small'
              );

            if (availabilityMeta) {
              availabilityMeta.textContent =
                [
                  location.locationName
                  || 'Local não definido',

                  unit
                ]
                  .filter(Boolean)
                  .join(' · ');
            }

            return;
          }


          /*
           * TROCOU:
           *
           * Prosseguir
           * Trocar modelo
           * Prever chegada
           * Não produzir
           */
          if (
            event.target.matches(
              '.planning-shortage-actions input'
            )
          ) {
            refreshCascadePreview();
          }
        }
      );
            backdrop
        .querySelector(
          '.production-shortage-form'
        )
        .addEventListener(
          'submit',
          event => {

            event.preventDefault();


            const formError =
              backdrop.querySelector(
                '.form-error'
              );


            if (formError) {
              formError.hidden = true;
              formError.textContent = '';
            }


                        let invalidMessage =
              '';

            const decisions =
              groups.map(group => {
                const selector =
                  window.CSS?.escape
                    ? window.CSS.escape(
                        group.key
                      )
                    : group.key;

                const card =
                  backdrop.querySelector(
                    `[data-shortage-key="${selector}"]`
                  );

                const action =
                  card
                    ?.querySelector(
                      '.planning-shortage-actions input:checked'
                    )
                    ?.value
                  || 'keep';

                const productionModelName =
                  card
                    ?.querySelector(
                      '.planning-shortage-model select'
                    )
                    ?.value
                  || '';

                const targetProductionQty =
                  Number(
                    card
                      ?.querySelector(
                        '[name^="production-quantity-"]'
                      )
                      ?.value
                    || 0
                  );

                if (
                  action ===
                    'quantity'
                  &&
                  !invalidMessage
                  &&
                  !(
                    Number.isFinite(
                      targetProductionQty
                    )
                    &&
                    targetProductionQty
                    > 0
                  )
                ) {
                  invalidMessage =
                    'Informe uma nova quantidade de produção maior que zero.';
                }

                return {
                  ...group,

                  action,

                  productionModelName,

                  targetProductionQty
                };
              });

            globalReceipts =
              readGlobalShortageReceipts(
                backdrop
              );

            globalReceipts.forEach(
              receipt => {
                if (
                  invalidMessage
                ) {
                  return;
                }

                if (
                  !receipt.materialId
                ) {
                  invalidMessage =
                    'Selecione o insumo de todas as chegadas previstas.';

                } else if (
                  !Number.isFinite(
                    receipt.quantity
                  )
                  ||
                  !(receipt.quantity > 0)
                ) {
                  invalidMessage =
                    'Informe uma quantidade maior que zero em todas as chegadas previstas.';

                } else if (
                  !isValidDateOnly(
                    receipt.arrivalDate
                  )
                ) {
                  invalidMessage =
                    'Informe uma data estimada de chegada válida em todas as entradas.';

                } else if (
                  !receipt.locationId
                ) {
                  invalidMessage =
                    'Selecione o local de entrada de todas as chegadas previstas.';
                }
              }
            );

            if (
              invalidMessage
            ) {
              if (formError) {
                formError.textContent =
                  invalidMessage;

                formError.hidden =
                  false;
              }

              return;
            }

            const selections =
              new Map(
                decisions.map(
                  decision => [
                    String(
                      decision.key
                    ),

                    {
                      action:
                        decision.action,

                      productionModelName:
                        decision
                          .productionModelName,

                      targetProductionQty:
                        decision
                          .targetProductionQty
                    }
                  ]
                )
              );

            const finalPreviews =
              buildProductionShortageCascade(
                groups,
                stockRowsByMaterial,
                selections,
                globalReceipts
              );

            /*
             * Quais cards foram efetivamente
             * atendidos pelas chegadas globais?
             */
            const coveredShortageKeys =
              groups
                .filter(group => {
                  const rows =
                    finalPreviews.get(
                      String(group.key)
                    ) || [];

                  return (
                    rows.length > 0
                    &&
                    rows.every(
                      row =>
                        Number(
                          row.shortageQty
                          || 0
                        )
                        <= 0.000001
                    )
                  );
                })
                .map(
                  group =>
                    String(
                      group.key
                    )
                );

            close({
              action:
                'apply',

              decisions,

              plannedReceipts:
                globalReceipts.map(
                  receipt => ({
                    ...receipt,

                    sourceShortageKeys:
                      coveredShortageKeys
                  })
                )
            });
          }
        );
      page.appendChild(backdrop);
      backdrop.querySelector('input, button, select')?.focus();
    });
  }

  function unresolvedTheoreticalMaterialChoiceGroups(
  result
) {
  return collectProductionShortageDecisions(
    result
  )
    .filter(group => (
      Array.isArray(
        group.productionModelOptions
      )

      &&

      group.productionModelOptions.length > 1
    ))
    .filter(group => {

      const selectedModelName =
        String(
          draft.operationOverrides
            ?.[group.key]
            ?.productionModelName
          || ''
        ).trim();


      if (!selectedModelName) {
        return true;
      }


      return !group.productionModelOptions
        .some(option =>
          String(option.modelName)
          === selectedModelName
        );
    });
}


async function requestTheoreticalMaterialChoices(
  result
) {

  const groups =
    unresolvedTheoreticalMaterialChoiceGroups(
      result
    );


  if (!groups.length) {
    return {
      action: 'none'
    };
  }


  page
    .querySelector(
      '.theoretical-material-choice-modal'
    )
    ?.remove();


  const backdrop =
    document.createElement(
      'div'
    );


  backdrop.className =
    'modal-backdrop theoretical-material-choice-modal';


  backdrop.innerHTML = `
    <div
      class="modal wide-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theoretical-material-choice-title"
    >

      <div class="modal-header">

        <div>

          <h2 id="theoretical-material-choice-title">
            Escolha das mat&eacute;rias-primas
          </h2>

          <p class="modal-subtitle">
            Como esta &eacute; uma simula&ccedil;&atilde;o te&oacute;rica,
            escolha qual mat&eacute;ria-prima ser&aacute; usada em cada etapa.
          </p>

        </div>

      </div>


      <form class="theoretical-material-choice-form">

        <div class="theoretical-material-choice-list">

          ${groups.map(group => {

            const options =
              group.productionModelOptions
              || [];


            return `
              <article
                class="theoretical-material-choice-card"
                data-theoretical-choice-key="${escapeHtml(
                  group.key
                )}"
              >

                <div class="theoretical-material-choice-heading">

                  <strong>
                    ${escapeHtml(
                      group.materialName
                      || ''
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      `${formatPtBrDecimal(
                        group.requiredQty
                      )} ${group.unit || ''}`
                    )}
                  </span>

                </div>


                <label>
                  Mat&eacute;ria-prima / modelo

                  <select
                    name="model-${escapeHtml(
                      group.key
                    )}"
                  >

                    ${options.map(option => {

                      const inputs =
                        (
                          option.inputs
                          || []
                        )
                          .map(input => {

                            const material =
                              findMaterialById(
                                materials,
                                input.materialId
                              );


                            const quantity =
                              Number(
                                group.requiredQty
                                || 0
                              )
                              *
                              Number(
                                input.qtyPerOutput
                                || 0
                              );


                            return `${
                              input.materialName
                              || ''
                            } - ${
                              formatPtBrDecimal(
                                quantity
                              )
                            } ${
                              material
                                ?.primary_unit
                              || ''
                            }`;

                          })
                          .join(' + ');


                      return `
                        <option
                          value="${escapeHtml(
                            option.modelName
                          )}"
                        >
                          ${escapeHtml(
                            option.modelName
                          )}
                          ${
                            inputs
                              ? ` - ${escapeHtml(
                                  inputs
                                )}`
                              : ''
                          }
                        </option>
                      `;

                    }).join('')}

                  </select>

                </label>

              </article>
            `;

          }).join('')}

        </div>


        <div class="form-actions modal-actions">

          <button
            class="secondary-button"
            type="button"
            data-theoretical-choice-cancel
          >
            Cancelar simula&ccedil;&atilde;o
          </button>


          <button
            class="primary-button"
            type="submit"
          >
            Confirmar mat&eacute;rias-primas
          </button>

        </div>

      </form>

    </div>
  `;


  return new Promise(resolve => {

    const close =
      value => {
        backdrop.remove();

        resolve(value);
      };


    backdrop
      .querySelector(
        '[data-theoretical-choice-cancel]'
      )
      .addEventListener(
        'click',
        () =>
          close({
            action:
              'cancel'
          })
      );


    backdrop.addEventListener(
      'click',
      event => {

        if (
          event.target
          === backdrop
        ) {
          close({
            action:
              'cancel'
          });
        }
      }
    );


    backdrop
      .querySelector(
        '.theoretical-material-choice-form'
      )
      .addEventListener(
        'submit',
        event => {

          event.preventDefault();


          const decisions =
            groups.map(group => {

              const selector =
                window.CSS?.escape
                  ? window.CSS.escape(
                      group.key
                    )
                  : group.key;


              const card =
                backdrop.querySelector(
                  `[data-theoretical-choice-key="${selector}"]`
                );


              const productionModelName =
                card
                  ?.querySelector(
                    'select'
                  )
                  ?.value
                || '';


              return {
                ...group,

                action:
                  'model',

                productionModelName
              };
            });


          close({
            action:
              'apply',

            decisions
          });
        }
      );


    page.appendChild(
      backdrop
    );


    backdrop
      .querySelector(
        'select'
      )
      ?.focus();

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

        function applyProductionShortageDecisions(
    decisions = [],
    globalReceipts = []
  ) {
    let changed = false;


    draft.operationOverrides =
      draft.operationOverrides
      &&
      typeof draft.operationOverrides
        === 'object'

        ? draft.operationOverrides

        : {};


    draft.skipProductionMaterials =
      Array.isArray(
        draft.skipProductionMaterials
      )

        ? draft.skipProductionMaterials

        : [];


    draft.plannedReceipts =
      Array.isArray(
        draft.plannedReceipts
      )

        ? draft.plannedReceipts

        : [];


    decisions.forEach(decision => {

      const productionIndex =
        Number(
          decision.productionIndex
          || 0
        );


      const materialId =
        Number(
          decision.materialId
        );


      if (
        !Number.isFinite(
          materialId
        )
      ) {
        return;
      }


      const key =
        stockOnlyKey(
          productionIndex,
          materialId
        );


      const sourceShortageKey =
        String(
          decision.key
          || key
        );


      /*
       * Remove previsão anterior
       * daquela mesma falta.
       */
      const removeExistingReceipt = () => {

        const before =
          draft.plannedReceipts.length;


        draft.plannedReceipts =
          draft.plannedReceipts
            .filter(receipt => (
              String(
                receipt?.sourceShortageKey
                || ''
              )
              !==
              sourceShortageKey
            ));


        if (
          draft.plannedReceipts.length
          !== before
        ) {
          changed = true;
        }
      };


      /*
       * TROCAR MODELO
       */
      if (
        decision.action === 'model'
        &&
        decision.productionModelName
      ) {

        removeExistingReceipt();


        draft.operationOverrides[key] = {
          ...(
            draft.operationOverrides[key]
            || {}
          ),

          productionModelName:
            decision.productionModelName
        };


        draft.skipProductionMaterials =
          draft.skipProductionMaterials
            .filter(item => (
              !(
                Number(
                  item.productionIndex
                )
                === productionIndex

                &&

                Number(
                  item.materialId
                )
                === materialId
              )
            ));


        changed = true;

              /*
       * PRODUZIR OUTRA QUANTIDADE
       */
      } else if (
        decision.action ===
          'quantity'
      ) {
        removeExistingReceipt();

        const targetProductionQty =
          Number(
            decision
              .targetProductionQty
            || 0
          );

        const production =
          draft.productions?.[
            productionIndex
          ];

        if (
          production
          &&
          Number.isFinite(
            targetProductionQty
          )
          &&
          targetProductionQty > 0
        ) {
          production.plannedQty =
            String(
              Number(
                targetProductionQty
                  .toFixed(6)
              )
            );

          if (
            decision
              .productionModelName
          ) {
            draft.operationOverrides[
              key
            ] = {
              ...(
                draft
                  .operationOverrides[
                  key
                ]
                || {}
              ),

              productionModelName:
                decision
                  .productionModelName
            };
          }

          draft.skipProductionMaterials =
            draft
              .skipProductionMaterials
              .filter(
                item => (
                  !(
                    Number(
                      item
                        .productionIndex
                    ) ===
                    productionIndex
                    &&
                    Number(
                      item.materialId
                    ) ===
                    materialId
                  )
                )
              );

          changed =
            true;
        }


      /*
       * PREVER CHEGADA
       */
      } else if (
        decision.action === 'receipt'
      ) {

        if (
          decision.productionModelName
        ) {
          draft.operationOverrides[key] = {
            ...(
              draft.operationOverrides[key]
              || {}
            ),

            productionModelName:
              decision.productionModelName
          };
        }


        draft.skipProductionMaterials =
          draft.skipProductionMaterials
            .filter(item => (
              !(
                Number(
                  item.productionIndex
                )
                === productionIndex

                &&

                Number(
                  item.materialId
                )
                === materialId
              )
            ));


        const receiptMaterial =
          findMaterialById(
            materials,
            decision.plannedReceiptMaterialId
          )
          || {};


        const receiptLocation =
          planningShortageReceiptLocation(
            decision
          );


        const arrivalDate =
          String(
            decision.plannedReceiptArrivalDate
            || ''
          ).slice(0, 10);


        const plannedReceipt =
          normalizeManualSchedulePlannedReceipt({

            receiptId:
              `planned-receipt:${sourceShortageKey}`,

            receiptType:
              'planned-purchase',

            sourceShortageKey,

            productionModelName:
              decision.productionModelName
              || '',


            materialId:
              String(
                decision.plannedReceiptMaterialId
                || ''
              ),


            materialCode:
              String(
                receiptMaterial?.code
                ??
                receiptMaterial?.materialCode
                ??
                receiptMaterial?.material_code
                ??
                ''
              ),


            materialName:
              String(
                receiptMaterial?.name
                ??
                receiptMaterial?.materialName
                ??
                receiptMaterial?.material_name
                ??
                decision.plannedReceiptMaterialId
                ??
                ''
              ),


            locationId:
              receiptLocation.locationId,


            locationName:
              receiptLocation.locationName,


            quantity:
              Number(
                decision.plannedReceiptQuantity
                || 0
              ),


            unit:
              String(
                receiptMaterial?.primary_unit
                ??
                receiptMaterial?.primaryUnit
                ??
                'kg'
              ),


            arrivalDate,


            availableDate:
              isValidDateOnly(
                arrivalDate
              )

                ? addDays(
                    arrivalDate,
                    1
                  )

                : ''
          });


        /*
         * Uma previsão por falta.
         *
         * Se repetir a decisão,
         * substitui a antiga.
         */
        draft.plannedReceipts = [
          ...draft.plannedReceipts
            .filter(receipt => (
              String(
                receipt?.sourceShortageKey
                || ''
              )
              !== sourceShortageKey
            )),

          plannedReceipt
        ];


        changed = true;


      /*
       * NÃO PRODUZIR
       */
      } else if (
        decision.action === 'skip'
      ) {

        removeExistingReceipt();


        draft.skipProductionMaterials =
          draft.skipProductionMaterials
            .filter(item => (
              !(
                Number(
                  item.productionIndex
                )
                === productionIndex

                &&

                Number(
                  item.materialId
                )
                === materialId
              )
            ));


        draft.skipProductionMaterials.push({
          productionIndex,
          materialId
        });


        changed = true;
      }
    });

        (
      Array.isArray(
        globalReceipts
      )
        ? globalReceipts
        : []
    ).forEach(
      (
        receipt,
        index
      ) => {
        const materialId =
          String(
            receipt?.materialId
            || ''
          );

        const quantity =
          Number(
            receipt?.quantity
            || 0
          );

        const arrivalDate =
          String(
            receipt?.arrivalDate
            || ''
          ).slice(
            0,
            10
          );

        const locationId =
          String(
            receipt?.locationId
            || ''
          );

        if (
          !materialId
          ||
          !(quantity > 0)
          ||
          !isValidDateOnly(
            arrivalDate
          )
          ||
          !locationId
        ) {
          return;
        }

        const material =
          findMaterialById(
            materials,
            materialId
          ) || {};

        const location =
          (
            locations || []
          ).find(
            item =>
              String(
                item?.id
                ??
                item?.locationId
                ??
                item?.location_id
                ??
                ''
              )
              ===
              locationId
          ) || {};

        const plannedReceipt =
          normalizeManualSchedulePlannedReceipt({
            receiptId:
              `planned-receipt-global:${Date.now()}:${index}`,

            receiptType:
              'planned-purchase',

            receiptScope:
              'global-shortage',

            sourceShortageKeys:
              Array.isArray(
                receipt
                  ?.sourceShortageKeys
              )
                ? receipt
                    .sourceShortageKeys
                    .map(String)
                : [],

            materialId,

            materialCode:
              String(
                material?.code
                ??
                material?.materialCode
                ??
                material
                  ?.material_code
                ??
                ''
              ),

            materialName:
              String(
                material?.name
                ??
                material?.materialName
                ??
                material
                  ?.material_name
                ??
                materialId
              ),

            locationId,

            locationName:
              String(
                location?.name
                ??
                location?.locationName
                ??
                location
                  ?.location_name
                ??
                locationId
              ),

            quantity,

            unit:
              String(
                material
                  ?.primary_unit
                ??
                material
                  ?.primaryUnit
                ??
                'kg'
              ),

            arrivalDate,

            availableDate:
              addDays(
                arrivalDate,
                1
              )
          });

        draft.plannedReceipts = [
          ...draft.plannedReceipts,

          plannedReceipt
        ];

        changed =
          true;
      }
    );
    

    if (changed) {
      saveDraftNow();
    }


    return changed;
  }

  function planningStockLimitProductionMeta(
  productionIndex
) {

  const production =
    draft.productions?.[
      Number(
        productionIndex
      )
    ]
    || {};


  const material =
    findMaterialById(
      materials,
      production.materialId
    )
    || {};


  return {

    productionIndex:
      Number(
        productionIndex
      ),

    materialId:
      String(
        production.materialId
        ??
        material.id
        ??
        ''
      ),

    materialName:
      String(
        material.name
        ??
        production.materialName
        ??
        `Produção ${
          Number(
            productionIndex
          )
          +
          1
        }`
      ),

    unit:
      String(
        material.primary_unit
        ??
        material.primaryUnit
        ??
        production.plannedUnit
        ??
        production.unit
        ??
        ''
      ),

    plannedQty:
      Number(
        production.plannedQty
        ||
        0
      )

  };
}


function planningStockLimitAssessment(
  result
) {

  return evaluatePlanningStockLimits({

    simulation:
      result,

    materials,

    plannedReceipts:
      draft.plannedReceipts
      || [],

        productions:
      draft.productions
      || [],

    operationOverrides:
      draft.operationOverrides
      || {}

  });

}


function requestPlanningStockLimitDecision(
  result
) {

  const assessment =
    planningStockLimitAssessment(
      result
    );


  if (
    !assessment
      .violations
      .length
  ) {

    return Promise.resolve({
      action:
        'none',

      assessment
    });

  }


  page
    .querySelector(
      '.planning-stock-limit-modal'
    )
    ?.remove();


  const backdrop =
    document.createElement(
      'div'
    );


  backdrop.className =
    'modal-backdrop planning-stock-limit-modal';


  const recoveryByViolationId =
    new Map(
      (
        assessment
          .recoverySuggestions
        || []
      )
        .map(
          suggestion => [
            String(
              suggestion.violationId
            ),
            suggestion
          ]
        )
    );


  const productionRows =
    assessment
      .suggestions
      .map(
        suggestion => {

          const production =
            planningStockLimitProductionMeta(
              suggestion.productionIndex
            );


          const suggestedQty =
            Number(
              suggestion.suggestedQty
            );


          const displayedQty =
            Number.isFinite(
              suggestedQty
            )
              ? suggestedQty
              : production.plannedQty;


          return `
            <article
              class="planning-stock-limit-adjustment-card"
            >

              <div
                class="planning-stock-limit-adjustment-copy"
              >

                <span>
                  AJUSTAR PRODUÇÃO SOLICITADA
                </span>

                <strong>
                  ${escapeHtml(
                    production.materialName
                  )}
                </strong>

                <small>
                  Quantidade original:
                  ${formatPtBrDecimal(
                    production.plannedQty
                  )}
                  ${escapeHtml(
                    production.unit
                  )}
                </small>

              </div>


              <label
                class="planning-stock-limit-adjustment-input"
              >

                <span>
                  Quantidade sugerida
                </span>

                <div>

                  <input
                    type="number"
                    min="0"
                    max="${escapeHtml(
                      String(
                        production.plannedQty
                      )
                    )}"
                    step="0.001"
                    value="${escapeHtml(
                      String(
                        displayedQty
                      )
                    )}"
                    data-stock-limit-production-index="${escapeHtml(
                      String(
                        production.productionIndex
                      )
                    )}"
                    data-stock-limit-current-qty="${escapeHtml(
                      String(
                        production.plannedQty
                      )
                    )}"
                  />

                  <b>
                    ${escapeHtml(
                      production.unit
                    )}
                  </b>

                </div>

              </label>

            </article>
          `;

        }
      )
      .join('');


  const recoveryRows =
    (
      assessment
        .recoverySuggestions
      || []
    )
      .map(
        suggestion => {

          if (
            suggestion.canProduce
            !==
            true
          ) {

            return `
              <article
                class="planning-stock-limit-recovery-card unavailable"
              >

                <div
                  class="planning-stock-limit-adjustment-copy"
                >

                  <span>
                    RECUPERAÇÃO DO ESTOQUE MÍNIMO
                  </span>

                  <strong>
                    ${escapeHtml(
                      suggestion.materialName
                    )}
                  </strong>

                  <small>
                    Este material é matéria-prima inicial e não possui uma etapa produtiva anterior para recomposição automática. Resolva a reposição de estoque ou use “Prosseguir mesmo assim”.
                  </small>

                </div>

              </article>
            `;
          }


          return `
            <article
              class="planning-stock-limit-recovery-card"
            >

              <div
                class="planning-stock-limit-adjustment-copy"
              >

                <span>
                  RECUPERAÇÃO DO ESTOQUE MÍNIMO
                </span>

                <strong>
                  ${escapeHtml(
                    suggestion.materialName
                  )}
                </strong>

                                <small>
                  A simulação já prevê produzir
                  ${formatPtBrDecimal(
                    suggestion.plannedProductionQty
                  )}
                  ${escapeHtml(
                    suggestion.unit
                  )}
                  deste material.

                  Para atender o consumo de
                  ${formatPtBrDecimal(
                    suggestion.consumptionQuantity
                  )}
                  ${escapeHtml(
                    suggestion.unit
                  )}
                  e ainda terminar com o mínimo de
                  ${formatPtBrDecimal(
                    suggestion.limitQuantity
                  )}
                  ${escapeHtml(
                    suggestion.unit
                  )},
                  é necessária a produção adicional abaixo.
                </small>

              </div>


                            <div
                class="planning-stock-limit-recovery-numbers"
              >

                <div
                  class="planning-stock-limit-recovery-number"
                >

                  <span>
                    Produção já prevista
                  </span>

                  <strong>
                    ${formatPtBrDecimal(
                      suggestion.plannedProductionQty
                    )}
                    ${escapeHtml(
                      suggestion.unit
                    )}
                  </strong>

                </div>


                <label
                  class="planning-stock-limit-adjustment-input"
                >

                  <span>
                    Produção adicional sugerida
                  </span>

                  <div>

                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value="${escapeHtml(
                        String(
                          suggestion.suggestedQty
                        )
                      )}"
                      data-stock-limit-recovery-production-index="${escapeHtml(
                        String(
                          suggestion.productionIndex
                        )
                      )}"
                      data-stock-limit-recovery-material-id="${escapeHtml(
                        String(
                          suggestion.materialId
                        )
                      )}"
                      data-stock-limit-recovery-planned-production="${escapeHtml(
                        String(
                          suggestion.plannedProductionQty
                        )
                      )}"
                    />

                    <b>
                      ${escapeHtml(
                        suggestion.unit
                      )}
                    </b>

                  </div>

                </label>


                <div
                  class="planning-stock-limit-recovery-number total"
                >

                  <span>
                    Produção total após ajuste
                  </span>

                  <strong
                    data-stock-limit-recovery-total
                  >
                    ${formatPtBrDecimal(
                      suggestion.totalProductionQty
                    )}
                    ${escapeHtml(
                      suggestion.unit
                    )}
                  </strong>

                </div>

              </div>

            </article>
          `;

        }
      )
      .join('');


  const violationRows =
    assessment
      .violations
      .map(
        violation => {

          const isMinimum =
            violation.kind
            ===
            'minimum';


          const isRecovery =
            violation.scenario
            ===
            'minimum_recovery';


                    const relatedProductions =
            violation
              .productionIndexes
              .map(
                index =>
                  planningStockLimitProductionMeta(
                    index
                  )
              )
              .filter(
                production =>
                  production
                  &&
                  production.materialName
              );


          const productionLabels =
            relatedProductions
              .map(
                production =>
                  `${
                    production.materialName
                  } — ${
                    formatPtBrDecimal(
                      production.plannedQty
                    )
                  } ${
                    production.unit
                  }`
                    .trim()
              );


          const originalStatus =
            isMinimum

              ? `Ficará ${formatPtBrDecimal(
                  violation.differenceQuantity
                )} ${escapeHtml(
                  violation.unit
                )} abaixo do estoque mínimo.`

              : `Ficará ${formatPtBrDecimal(
                  violation.differenceQuantity
                )} ${escapeHtml(
                  violation.unit
                )} acima do estoque máximo.`;


          return `
            <article
              class="planning-stock-limit-violation ${
                isMinimum
                  ? 'minimum'
                  : 'maximum'
              } ${
                isRecovery
                  ? 'recovery'
                  : ''
              }"
              data-stock-limit-violation-id="${escapeHtml(
                String(
                  violation.id
                )
              )}"
            >

              <div
                class="planning-stock-limit-violation-head"
              >

                <div>

                  <span>
                    ${
                      isRecovery
                        ? 'RECUPERAÇÃO DO ESTOQUE MÍNIMO'
                        : isMinimum
                          ? 'ESTOQUE MÍNIMO'
                          : 'ESTOQUE MÁXIMO'
                    }
                  </span>

                  <strong>
                    ${escapeHtml(
                      violation.materialName
                    )}
                  </strong>

                </div>


                <b>
                  ${
                                        isRecovery
                      ? (
                          violation.startedBelowMinimum
                            ? 'Já abaixo do mínimo'
                            : 'Mínimo será consumido'
                        )
                      : isMinimum
                        ? 'Mínimo será rompido'
                        : 'Máximo será ultrapassado'
                  }
                </b>

              </div>


              <div
                class="planning-stock-limit-values"
              >

                <div>
                  <span>
                    ${
                      isRecovery
                        ? 'Estoque inicial'
                        : 'Estoque antes do movimento'
                    }
                  </span>

                  <strong>
                    ${formatPtBrDecimal(
                      isRecovery
                        ? violation.initialStock
                        : violation.balanceBefore
                    )}
                    ${escapeHtml(
                      violation.unit
                    )}
                  </strong>
                </div>


                <div>
                  <span>
                    ${
                      isMinimum
                        ? 'Limite mínimo'
                        : 'Limite máximo'
                    }
                  </span>

                  <strong>
                    ${formatPtBrDecimal(
                      violation.limitQuantity
                    )}
                    ${escapeHtml(
                      violation.unit
                    )}
                  </strong>
                </div>


                <div>
                  <span>
                                        ${
                      isMinimum

                        ? 'Consumo total previsto'

                        : 'Produção prevista'
                    }
                  </span>

                  <strong
                    data-stock-limit-preview-movement
                  >
                    ${formatPtBrDecimal(
                      Math.abs(
                        Number(
                          violation.movementQuantity
                        )
                      )
                    )}
                    ${escapeHtml(
                      violation.unit
                    )}
                  </strong>
                </div>


                <div>
                                   <span>
                    ${
                      isRecovery

                        ? 'Estoque final sem recomposição'

                        : 'Estoque após esta produção'
                    }
                  </span>

                                    <strong
                    ${
                      isRecovery
                        ? ''
                        : 'data-stock-limit-preview-final'
                    }
                  >
                    ${formatPtBrDecimal(
                      isRecovery

                        ? (
                            recoveryByViolationId
                              .get(
                                String(
                                  violation.id
                                )
                              )
                              ?.projectedWithoutRecovery
                            ??
                            violation.projectedQuantity
                          )

                        : violation.projectedQuantity
                    )}
                    ${escapeHtml(
                      violation.unit
                    )}
                  </strong>
                </div>

              </div>


                            ${
                isRecovery
                &&
                (
                  Number(
                    violation.limitQuantity
                  )
                  -
                  Number(
                    violation.initialStock
                  )
                )
                >
                0.000001

                  ? `
                    <div
                      class="planning-stock-limit-existing-deficit"
                    >
                      Déficit já existente:
                      <strong>
                        ${formatPtBrDecimal(
                          Math.max(
                            Number(
                              violation.limitQuantity
                            )
                            -
                            Number(
                              violation.initialStock
                            ),
                            0
                          )
                        )}
                        ${escapeHtml(
                          violation.unit
                        )}
                      </strong>
                    </div>
                  `

                  : ''
              }


                            ${
                productionLabels.length

                  ? `
                    <div
                      class="planning-stock-limit-related-production"
                    >

                      <span>
                        Produção solicitada
                      </span>

                      <strong>
                                                ${productionLabels
                          .map(
                            label =>
                              escapeHtml(
                                label
                              )
                          )
                          .join(
                            '<br>'
                          )}
                      </strong>

                    </div>
                  `

                  : ''
              }


              <div
                class="planning-stock-limit-live-preview danger"
                data-stock-limit-preview-status
              >
                ${originalStatus}
              </div>


              <small
                class="planning-stock-limit-preview-note"
              >
                A prévia abaixo é proporcional. Ao clicar em Recalcular, o planejador executa novamente toda a árvore, máquinas, tempos e consumos.
              </small>

            </article>
          `;

        }
      )
      .join('');


    const originalPlanRows =
    assessment
      .violations
      .map(
        violation => {

          /*
           * Para mínimo mostramos o impacto do
           * planejamento COMPLETO.
           */
          if (
            violation.kind
            ===
            'minimum'
          ) {

            return `
              <div
                class="planning-stock-limit-original-minimum"
              >

                <span>
                  ${escapeHtml(
                    violation.materialName
                  )}
                </span>

                <strong>
                  Consumo total:
                  ${formatPtBrDecimal(
                    violation
                      .totalConsumptionQuantity
                    ??
                    Math.abs(
                      Number(
                        violation.movementQuantity
                      )
                    )
                  )}
                  ${escapeHtml(
                    violation.unit
                  )}
                                    · estoque final:
                  ${formatPtBrDecimal(
                    recoveryByViolationId
                      .get(
                        String(
                          violation.id
                        )
                      )
                      ?.projectedWithoutRecovery
                    ??
                    violation.projectedQuantity
                  )}
                  ${escapeHtml(
                    violation.unit
                  )}
                  · mínimo:
                  ${formatPtBrDecimal(
                    violation.limitQuantity
                  )}
                  ${escapeHtml(
                    violation.unit
                  )}
                </strong>

              </div>
            `;

          }


          /*
           * Máximo continua mostrando a violação
           * cronológica daquele momento.
           */
          return `
            <div>

              <span>
                ${escapeHtml(
                  violation.materialName
                )}
              </span>

              <strong>
                ${formatPtBrDecimal(
                  violation.projectedQuantity
                )}
                ${escapeHtml(
                  violation.unit
                )}
                · máximo
                ${formatPtBrDecimal(
                  violation.limitQuantity
                )}
                ${escapeHtml(
                  violation.unit
                )}
              </strong>

            </div>
          `;

        }
      )
      .join('');


  backdrop.innerHTML = `
    <div
      class="modal planning-stock-limit-dialog"
      role="dialog"
      aria-modal="true"
    >

      <div
        class="modal-header"
      >

        <div>

          <h2>
            Limites de estoque da simulação
          </h2>

          <p
            class="modal-subtitle"
          >
            A simulação encontrou materiais da cadeia produtiva que ultrapassam os limites configurados.
          </p>

        </div>

      </div>


      <form
        class="planning-stock-limit-form"
      >

        <div
          class="planning-stock-limit-violations"
        >
          ${violationRows}
        </div>


        ${
          productionRows

            ? `
              <section
                class="planning-stock-limit-suggestions"
              >

                <div>

                  <h3>
                    Ajustar produção solicitada
                  </h3>

                  <p>
                    Para materiais que ainda estavam dentro do mínimo, a sugestão reduz somente a quantidade necessária para chegar ao limite. O campo continua editável.
                  </p>

                </div>


                <div
                  class="planning-stock-limit-production-list"
                >
                  ${productionRows}
                </div>

              </section>
            `

            : ''
        }


        ${
          recoveryRows

            ? `
              <section
                class="planning-stock-limit-recovery-section"
              >

                <div>

                  <h3>
                    Recuperar estoque mínimo
                  </h3>

                  <p>
                    Estes materiais já começaram a simulação abaixo do mínimo. A produção adicional é aplicada dentro da árvore da produção relacionada, antes do consumo que exige a recomposição.
                  </p>

                </div>


                <div
                  class="planning-stock-limit-recovery-list"
                >
                  ${recoveryRows}
                </div>

              </section>
            `

            : ''
        }


        <section
          class="planning-stock-limit-original-plan"
        >

          <div
            class="planning-stock-limit-original-copy"
          >

            <span>
              PROSSEGUIR COM O PLANEJAMENTO ORIGINAL
            </span>

            <strong>
              Manter exatamente as quantidades simuladas
            </strong>

            <p>
              Ao escolher esta opção, nenhuma sugestão acima será aplicada. O planejamento seguirá conscientemente com os saldos projetados abaixo.
            </p>

          </div>


          <div
            class="planning-stock-limit-original-values"
          >
            ${originalPlanRows}
          </div>


          <button
            class="secondary-button planning-stock-limit-override"
            type="button"
            data-stock-limit-override
          >
            Prosseguir mesmo assim
          </button>

        </section>


        <p
          class="form-error"
          data-stock-limit-error
          hidden
        ></p>


        <div
          class="form-actions modal-actions planning-stock-limit-actions"
        >

          <button
            class="secondary-button"
            type="button"
            data-stock-limit-cancel
          >
            Cancelar simulação
          </button>


          ${
            productionRows
            ||
            (
              assessment
                .recoverySuggestions
              || []
            )
              .some(
                suggestion =>
                  suggestion.canProduce
                  ===
                  true
              )

              ? `
                <button
                  class="primary-button"
                  type="submit"
                >
                  Recalcular com estas quantidades
                </button>
              `

              : ''
          }

        </div>

      </form>

    </div>
  `;


  return new Promise(
    resolve => {

      const form =
        backdrop.querySelector(
          '.planning-stock-limit-form'
        );


      const error =
        backdrop.querySelector(
          '[data-stock-limit-error]'
        );


      const close =
        value => {

          backdrop.remove();

          resolve(
            value
          );
        };


      const productionRatio =
        productionIndex => {

          const production =
            planningStockLimitProductionMeta(
              productionIndex
            );


          const input =
            backdrop.querySelector(
              `[data-stock-limit-production-index="${Number(productionIndex)}"]`
            );


          const quantity =
            Number(
              input?.value
            );


          if (
            !input
            ||
            !Number.isFinite(
              quantity
            )
            ||
            !(production.plannedQty > 0)
          ) {
            return 1;
          }


          return Math.max(
            quantity
            /
            production.plannedQty,
            0
          );
        };


      const updatePreviews =
        () => {

          assessment
            .violations
            .forEach(
              violation => {

                const card =
                  backdrop.querySelector(
                    `[data-stock-limit-violation-id="${CSS.escape(
                      String(
                        violation.id
                      )
                    )}"]`
                  );


                if (!card) {
                  return;
                }


                const movementTarget =
                  card.querySelector(
                    '[data-stock-limit-preview-movement]'
                  );


                const finalTarget =
                  card.querySelector(
                    '[data-stock-limit-preview-final]'
                  );


                const statusTarget =
                  card.querySelector(
                    '[data-stock-limit-preview-status]'
                  );


                let previewMovement =
                  Number(
                    violation.movementQuantity
                  );


                let previewFinal =
                  Number(
                    violation.projectedQuantity
                  );


                /*
                 * Recuperação:
                 *
                 * saldo sem recomposição
                 * +
                 * quantidade digitada.
                 */
                if (
                  violation.scenario
                  ===
                  'minimum_recovery'
                ) {

                  const suggestion =
                    recoveryByViolationId.get(
                      String(
                        violation.id
                      )
                    );


                  const input =
                    suggestion?.canProduce

                      ? backdrop.querySelector(
                          `[data-stock-limit-recovery-production-index="${Number(suggestion.productionIndex)}"][data-stock-limit-recovery-material-id="${CSS.escape(
                            String(
                              suggestion.materialId
                            )
                          )}"]`
                        )

                      : null;


                                    const recoveryQty =
                    Number(
                      input?.value
                    );


                  if (
                    suggestion
                    &&
                    input
                    &&
                    Number.isFinite(
                      recoveryQty
                    )
                  ) {

                    /*
                     * Preview do saldo:
                     *
                     * saldo que existiria sem a
                     * recomposição
                     * +
                     * adicional digitado.
                     */
                    previewFinal =
                      Number(
                        suggestion.projectedWithoutRecovery
                      )
                      +
                      recoveryQty;


                    /*
                     * Preview da produção física total:
                     *
                     * produção normal já prevista
                     * +
                     * adicional digitado.
                     */
                    const plannedProductionQty =
                      Number(
                        input.dataset
                          .stockLimitRecoveryPlannedProduction
                      )
                      ||
                      0;


                    const totalProductionTarget =
                      input
                        .closest(
                          '.planning-stock-limit-recovery-card'
                        )
                        ?.querySelector(
                          '[data-stock-limit-recovery-total]'
                        );


                    if (
                      totalProductionTarget
                    ) {

                      totalProductionTarget.textContent =
                        `${formatPtBrDecimal(
                          plannedProductionQty
                          +
                          recoveryQty
                        )} ${suggestion.unit}`;

                    }

                  }

                /*
                 * Mínimo saudável/máximo:
                 * preview proporcional.
                 *
                 * A simulação completa será
                 * executada depois.
                 */
                } else {

                  const ratios =
                    (
                      violation
                        .productionIndexes
                      || []
                    )
                      .map(
                        productionRatio
                      )
                      .filter(
                        value =>
                          Number.isFinite(
                            value
                          )
                      );


                  const ratio =
                    ratios.length

                      ? Math.min(
                          ...ratios
                        )

                      : 1;


                  previewMovement =
                    Number(
                      violation.movementQuantity
                    )
                    *
                    ratio;


                  previewFinal =
                    Number(
                      violation.balanceBefore
                    )
                    +
                    previewMovement;
                }


                if (
                  movementTarget
                ) {

                  movementTarget.textContent =
                    `${formatPtBrDecimal(
                      Math.abs(
                        previewMovement
                      )
                    )} ${violation.unit}`;
                }


                if (
                  finalTarget
                ) {

                  finalTarget.textContent =
                    `${formatPtBrDecimal(
                      previewFinal
                    )} ${violation.unit}`;
                }


                const limit =
                  Number(
                    violation.limitQuantity
                  );


                const difference =
                  previewFinal
                  -
                  limit;


                const respectsLimit =
                  violation.kind
                  ===
                  'minimum'

                    ? difference
                      >=
                      -0.000001

                    : difference
                      <=
                      0.000001;


                card.classList.toggle(
                  'preview-ok',
                  respectsLimit
                );


                card.classList.toggle(
                  'preview-danger',
                  !respectsLimit
                );


                if (
                  !statusTarget
                ) {
                  return;
                }


                statusTarget.classList.toggle(
                  'ok',
                  respectsLimit
                );


                statusTarget.classList.toggle(
                  'danger',
                  !respectsLimit
                );


                if (
                  violation.kind
                  ===
                  'minimum'
                ) {

                  statusTarget.textContent =
                    respectsLimit

                      ? difference
                        >
                        0.000001

                          ? `Prévia: ${formatPtBrDecimal(
                              difference
                            )} ${violation.unit} acima do mínimo.`

                          : 'Prévia: limite mínimo atingido exatamente.'

                      : `Prévia: ainda ficará ${formatPtBrDecimal(
                          Math.abs(
                            difference
                          )
                        )} ${violation.unit} abaixo do mínimo.`;

                } else {

                  statusTarget.textContent =
                    respectsLimit

                      ? Math.abs(
                          difference
                        )
                        >
                        0.000001

                          ? `Prévia: ${formatPtBrDecimal(
                              Math.abs(
                                difference
                              )
                            )} ${violation.unit} abaixo do máximo.`

                          : 'Prévia: limite máximo atingido exatamente.'

                      : `Prévia: ainda ficará ${formatPtBrDecimal(
                          difference
                        )} ${violation.unit} acima do máximo.`;
                }
              }
            );
        };


      backdrop
        .querySelectorAll(
          '[data-stock-limit-production-index], [data-stock-limit-recovery-material-id]'
        )
        .forEach(
          input =>
            input.addEventListener(
              'input',
              updatePreviews
            )
        );


      backdrop
        .querySelector(
          '[data-stock-limit-cancel]'
        )
        ?.addEventListener(
          'click',
          () =>
            close({
              action:
                'cancel',

              assessment
            })
        );


      backdrop
        .querySelector(
          '[data-stock-limit-override]'
        )
        ?.addEventListener(
          'click',
          () =>
            close({
              action:
                'override',

              assessment
            })
        );


      backdrop.addEventListener(
        'click',
        event => {

          if (
            event.target
            ===
            backdrop
          ) {

            close({
              action:
                'cancel',

              assessment
            });
          }
        }
      );


      form?.addEventListener(
        'submit',
        event => {

          event.preventDefault();


          const quantities =
            [];


          const recoveries =
            [];


          let invalidMessage =
            '';


          backdrop
            .querySelectorAll(
              '[data-stock-limit-production-index]'
            )
            .forEach(
              input => {

                if (
                  invalidMessage
                ) {
                  return;
                }


                const productionIndex =
                  Number(
                    input.dataset
                      .stockLimitProductionIndex
                  );


                const currentQty =
                  Number(
                    input.dataset
                      .stockLimitCurrentQty
                  );


                const quantity =
                  Number(
                    input.value
                  );


                if (
                  !Number.isFinite(
                    quantity
                  )
                  ||
                  !(quantity > 0)
                ) {

                  invalidMessage =
                    'Informe uma quantidade de produção maior que zero.';

                  return;
                }


                if (
                  Number.isFinite(
                    currentQty
                  )
                  &&
                  quantity
                    >
                    currentQty
                    +
                    0.000001
                ) {

                  invalidMessage =
                    'A quantidade ajustada não pode ser maior que a quantidade originalmente solicitada.';

                  return;
                }


                quantities.push({
                  productionIndex,
                  quantity
                });
              }
            );


          backdrop
            .querySelectorAll(
              '[data-stock-limit-recovery-material-id]'
            )
            .forEach(
              input => {

                if (
                  invalidMessage
                ) {
                  return;
                }


                const productionIndex =
                  Number(
                    input.dataset
                      .stockLimitRecoveryProductionIndex
                  );


                const materialId =
                  String(
                    input.dataset
                      .stockLimitRecoveryMaterialId
                    ||
                    ''
                  );


                const quantity =
                  Number(
                    input.value
                  );


                if (
                  !Number.isInteger(
                    productionIndex
                  )
                  ||
                  !materialId
                  ||
                  !Number.isFinite(
                    quantity
                  )
                  ||
                  !(quantity > 0)
                ) {

                  invalidMessage =
                    'Informe uma produção adicional maior que zero para recuperar o estoque mínimo.';

                  return;
                }


                recoveries.push({
                  productionIndex,
                  materialId,
                  quantity
                });
              }
            );


          if (
            invalidMessage
          ) {

            error.textContent =
              invalidMessage;

            error.hidden =
              false;

            return;
          }


          close({
            action:
              'apply',

            assessment,

            quantities,

            recoveries
          });
        }
      );


      page.appendChild(
        backdrop
      );


      updatePreviews();


      backdrop
        .querySelector(
          '[data-stock-limit-production-index], [data-stock-limit-recovery-material-id]'
        )
        ?.focus();
    }
  );
}

function applyPlanningStockLimitQuantities(
  quantities = []
) {

  let changed =
    false;


  for (
    const item
    of quantities
  ) {

    const productionIndex =
      Number(
        item
          ?.productionIndex
      );


    const quantity =
      Number(
        item
          ?.quantity
      );


    const production =
      draft.productions?.[
        productionIndex
      ];


    if (
      !production
      ||
      !Number.isFinite(
        quantity
      )
      ||
      !(quantity > 0)
    ) {
      continue;
    }


    const currentQty =
      Number(
        production
          .plannedQty
        ||
        0
      );


    if (
      Math.abs(
        currentQty
        -
        quantity
      )
      <=
      0.000001
    ) {
      continue;
    }


    production.plannedQty =
      String(
        Number(
          quantity
            .toFixed(6)
        )
      );


    changed =
      true;
  }


  if (
    changed
  ) {
    saveDraftNow();
  }


  return changed;
}

function applyPlanningStockLimitRecoveries(
  recoveries = []
) {

  let changed =
    false;


  draft.operationOverrides =
    draft.operationOverrides
    &&
    typeof draft.operationOverrides
    ===
    'object'

      ? draft.operationOverrides
      : {};


  for (
    const item
    of recoveries
  ) {

    const productionIndex =
      Number(
        item?.productionIndex
      );


    const materialId =
      String(
        item?.materialId
        ??
        ''
      )
        .trim();


    const quantity =
      Number(
        item?.quantity
      );


    if (
      !Number.isInteger(
        productionIndex
      )
      ||
      productionIndex < 0
      ||
      !materialId
      ||
      !Number.isFinite(
        quantity
      )
      ||
      !(quantity > 0)
    ) {
      continue;
    }


    const key =
      `${productionIndex}:${materialId}`;


    const current =
      draft.operationOverrides[
        key
      ]
      &&
      typeof draft.operationOverrides[
        key
      ]
      ===
      'object'

        ? draft.operationOverrides[
            key
          ]

        : {};


    const currentQty =
      Number(
        current
          .stockLimitRecoveryQty
        ||
        0
      );


    if (
      Math.abs(
        currentQty
        -
        quantity
      )
      <=
      0.000001
    ) {
      continue;
    }


    /*
     * Usamos operationOverrides porque ele já
     * pertence à produção/material corretos e
     * já viaja no payload da simulação.
     */
    draft.operationOverrides[
      key
    ] = {
      ...current,

      stockLimitRecoveryQty:
        Number(
          quantity
            .toFixed(6)
        )
    };


    changed =
      true;
  }


  if (
    changed
  ) {
    saveDraftNow();
  }


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
      draft.operationOverrides =
  Object.fromEntries(
    Object.entries(
      draft.operationOverrides
      || {}
    )
      .filter(
        ([key]) =>
          !String(key)
            .startsWith(
              `${Number(
                productionIndex
              )}:`
            )
      )
  );
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
    hasPendingSimulationChanges = true;
    clearTimeout(recalculationTimer);
    clearTimeout(autosaveTimer);
    queueAutosave();
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

  function planningLocationLabel(locationId) {
  const normalizedId =
    String(locationId || '').trim();

  if (!normalizedId) {
    return '-';
  }

  const location =
    (locations || []).find(item => (
      String(
        item?.id
        ?? item?.locationId
        ?? item?.location_id
        ?? ''
      ).trim() === normalizedId
    ));

  return String(
    location?.name
    ?? location?.locationName
    ?? location?.location_name
    ?? normalizedId
  );
}


function buildPlanningTransportCardsModel(
  result = {},
  groups = []
) {
  const allocations =
    manualScheduleDraft?.allocations
    || [];

  const transports =
    manualScheduleDraft?.transports
    || [];

  const machines =
    productionCalendarMachines(
      result
    );

    const availability =
    buildPlanningLocalStockAvailability({
      result,

      allocations,

      transports,

      plannedReceipts:
        manualScheduleDraft?.plannedReceipts
        || draft.plannedReceipts
        || [],

      machines
    });


  /*
   * Saldo ainda disponível em cada
   * material + local para transporte.
   */
  const remainingSource =
    new Map();


  availability
    .availableByMaterialLocation
    .forEach(item => {

      const materialId =
        String(
          item?.materialId
          || ''
        ).trim();

      const locationId =
        String(
          item?.locationId
          || ''
        ).trim();

      const quantity =
        Math.max(
          Number(
            item?.quantity
            || 0
          ),
          0
        );


      if (
        !materialId
        || !locationId
        || locationId
          === PLANNING_DEFAULT_LOCATION_ID
        || !(quantity > 0)
      ) {
        return;
      }


      remainingSource.set(
        planningLocalStockKey(
          materialId,
          locationId
        ),
        quantity
      );
    });


  const cards = [];


  /*
   * Respeita a prioridade das produções.
   *
   * Isso também impede o mesmo saldo físico
   * de aparecer disponível em dois cards
   * de transporte diferentes.
   */
  [...groups]
    .sort(
      (left, right) =>
        Number(
          left.productionIndex
          || 0
        )
        -
        Number(
          right.productionIndex
          || 0
        )
    )
    .forEach(group => {

      /*
       * Agrupa a necessidade por:
       *
       * material necessário + local destino
       */
      const demandByRoute =
        new Map();


      (
        group.materials
        || []
      ).forEach(consumer => {

        if (
          consumer.completed
          ||
          !(
            Number(
              consumer.remainingQty
              || 0
            ) > 0
          )
        ) {
          return;
        }


        const targetLocations =
          planningMaterialConsumerLocationIds(
            consumer
          );


        /*
         * Se a etapa puder rodar fisicamente
         * em mais de um local, ainda não
         * sabemos qual transporte sugerir.
         *
         * Só criamos o card quando o destino
         * físico é inequívoco.
         */
        if (
          targetLocations.length
          !== 1
        ) {
          return;
        }


        const targetLocation =
          String(
            targetLocations[0]
          );


        const requirements =
          availability
            .requirementsByConsumer
            .get(
              String(
                consumer.operationId
              )
            )
          || [];


        const consumerRatio =
          Number(
            consumer.requiredQty
            || 0
          ) > 0

            ? Math.min(
                Math.max(
                  Number(
                    consumer.remainingQty
                    || 0
                  )
                  /
                  Number(
                    consumer.requiredQty
                    || 0
                  ),
                  0
                ),
                1
              )

            : 0;


        requirements.forEach(
          requirement => {

            const materialId =
              String(
                requirement?.materialId
                || ''
              ).trim();


            const requiredQuantity =
              Number(
                requirement
                  ?.requiredQuantity
                || 0
              )
              *
              consumerRatio;


            if (
              !materialId
              ||
              !(
                requiredQuantity
                > 0
              )
            ) {
              return;
            }


            const key =
              `${
                materialId
              }\u0000${
                targetLocation
              }`;


            const current =
              demandByRoute.get(key)
              || {
                materialId,

                targetLocation,

                requiredQuantity:
                  0,

                consumerParentOperationIds:
                  new Set(),

                unit:
                  String(
                    requirement?.unit
                    || consumer.unit
                    || ''
                  )
              };


            current.requiredQuantity +=
              requiredQuantity;


            current
              .consumerParentOperationIds
              .add(
                String(
                  consumer.operationId
                )
              );


            demandByRoute.set(
              key,
              current
            );
          }
        );
      });


      demandByRoute.forEach(
        demand => {

          /*
           * Quanto já existe no destino?
           */
          const destinationAvailable =
            planningLocalStockQuantity(
              availability
                .availableByMaterialLocation,

              demand.materialId,

              demand.targetLocation
            );


          let missingAtDestination =
            Math.max(
              Number(
                demand.requiredQuantity
                || 0
              )
              -
              destinationAvailable,
              0
            );


          if (
            !(
              missingAtDestination
              > 0
            )
          ) {
            return;
          }


          const producerMaterial =
            (
              group.materials
              || []
            ).find(material => (
              String(
                material?.materialId
                || ''
              )
              ===
              demand.materialId
            ));


          const catalogMaterial =
            findMaterialById(
              materials,
              demand.materialId
            )
            || {};


          /*
           * Procura o mesmo material
           * disponível em outro local.
           */
                    let sources =
            [
              ...remainingSource.entries()
            ]
              .map(
                ([key, quantity]) => {

                  const [
                    materialId,
                    locationId
                  ] =
                    key.split(
                      '\u0000'
                    );


                  return {
                    key,
                    materialId,
                    locationId,
                    quantity,
                    awaitingSourceStock:
                      false
                  };
                }
              )
              .filter(source => (
                source.materialId
                  === demand.materialId

                &&

                source.locationId
                  !== demand.targetLocation

                &&

                Number(
                  source.quantity
                  || 0
                ) > 0
              ));


          if (!sources.length) {
            const producerLocations =
              [
                ...new Set(
                  (
                    Array.isArray(
                      producerMaterial
                        ?.consumerLocationIds
                    )
                      ? producerMaterial
                          .consumerLocationIds
                      : []
                  )
                    .map(value =>
                      String(
                        value || ''
                      ).trim()
                    )
                    .filter(Boolean)
                )
              ];

            if (
              producerLocations.length === 1
              &&
              producerLocations[0]
                !== demand.targetLocation
            ) {
              const sourceLocation =
                producerLocations[0];

              sources = [{
                key:
                  planningLocalStockKey(
                    demand.materialId,
                    sourceLocation
                  ),

                materialId:
                  demand.materialId,

                locationId:
                  sourceLocation,

                quantity:
                  0,

                awaitingSourceStock:
                  true
              }];
            }
          }


          for (
            const source
            of sources
          ) {
            if (
              !(
                missingAtDestination
                > 0
              )
            ) {
              break;
            }


                        const sourceAvailableQuantity =
              Math.max(
                Number(
                  source.quantity
                  || 0
                ),
                0
              );


            const availableQuantity =
              Math.min(
                sourceAvailableQuantity,
                missingAtDestination
              );


                        const awaitingSourceStock =
              source.awaitingSourceStock === true
              &&
              !(availableQuantity > 0);


            if (
              !(availableQuantity > 0)
              &&
              !awaitingSourceStock
            ) {
              continue;
            }

            const transportKey =
              [
                'transport',
                group.productionIndex,
                demand.materialId,
                source.locationId,
                demand.targetLocation
              ].join(':');


            cards.push({
              scheduleType:
                'transport',

              transportKey,

              productionId:
                group.productionId,

              productionIndex:
                group.productionIndex,

              productionTitle:
                group.title,

              productionColor:
                group.color,

              materialId:
                demand.materialId,

              materialCode:
                String(
                  catalogMaterial?.code
                  || producerMaterial
                    ?.materialCode
                  || ''
                ),

              materialName:
                String(
                  catalogMaterial?.name
                  || producerMaterial
                    ?.materialName
                  || demand.materialId
                ),

                            /*
               * A unidade do transporte pertence
               * ao MATERIAL TRANSPORTADO.
               *
               * Não pode herdar a unidade do
               * consumidor Longitudinal/Transversal.
               *
               * CA60 3,4 Bobina = kg.
               */
              unit:
                String(
                  producerMaterial?.unit
                  || catalogMaterial?.primary_unit
                  || catalogMaterial?.primaryUnit
                  || demand.unit
                  || ''
                ),

              sourceLocation:
                source.locationId,

              sourceLocationName:
                planningLocationLabel(
                  source.locationId
                ),

              targetLocation:
                demand.targetLocation,

              targetLocationName:
                planningLocationLabel(
                  demand.targetLocation
                ),

                            /*
               * availableQty / suggestedQty:
               * quanto a cadeia precisa receber agora.
               *
               * sourceAvailableQty:
               * saldo físico inteiro ainda disponível
               * na origem.
               */
              availableQty:
                Number(
                  availableQuantity
                    .toFixed(6)
                ),

              suggestedQty:
                Number(
                  availableQuantity
                    .toFixed(6)
                ),

                            sourceAvailableQty:
                Number(
                  sourceAvailableQuantity
                    .toFixed(6)
                ),

              awaitingSourceStock,

              requiredQty:
                Number(
                  missingAtDestination
                    .toFixed(6)
                ),

              producerParentOperationIds:
                producerMaterial
                  ?.operationId

                  ? [
                      String(
                        producerMaterial
                          .operationId
                      )
                    ]

                  : [
                      `${
                        Number(
                          group
                            .productionIndex
                          || 0
                        )
                      }:${
                        demand.materialId
                      }`
                    ],

              consumerParentOperationIds:
                [
                  ...demand
                    .consumerParentOperationIds
                ]
            });


            remainingSource.set(
              source.key,

              Number(
                (
                  Number(
                    source.quantity
                    || 0
                  )
                  -
                  availableQuantity
                ).toFixed(6)
              )
            );


            missingAtDestination =
              Number(
                (
                  missingAtDestination
                  -
                  availableQuantity
                ).toFixed(6)
              );
          }
        }
      );
    });


  return cards;
}

function planningTransportRouteKey(
  value = {}
) {
  return [
    Number(
      value?.productionIndex
      || 0
    ),

    String(
      value?.materialId
      || ''
    ),

    String(
      value?.sourceLocation
      || value?.sourceLocationId
      || ''
    ),

    String(
      value?.targetLocation
      || value?.targetLocationId
      || ''
    )
  ].join('|');
}


function withScheduledPlanningTransportProgress(
  cards = []
) {
  const pendingCards =
    Array.isArray(cards)
      ? cards
      : [];

  const scheduledByRoute =
    new Map();


  (
    manualScheduleDraft?.transports
    || []
  ).forEach(transport => {

    const routeKey =
      planningTransportRouteKey(
        transport
      );

    const current =
      scheduledByRoute.get(
        routeKey
      )
      || {
        quantity:
          0,

        transports:
          []
      };


    current.quantity +=
      Math.max(
        Number(
          transport?.quantity
          || 0
        ),
        0
      );


    current.transports.push(
      transport
    );


    scheduledByRoute.set(
      routeKey,
      current
    );
  });


  const result =
    pendingCards.map(card => {

      const routeKey =
        planningTransportRouteKey(
          card
        );

      const scheduled =
        scheduledByRoute.get(
          routeKey
        );

      const scheduledQty =
        Number(
          scheduled?.quantity
          || 0
        );

      /*
       * requiredQty neste ponto representa
       * aquilo que AINDA falta transportar.
       *
       * Portanto:
       *
       * total = já programado + restante.
       */
      const remainingQty =
        Math.max(
          Number(
            card?.requiredQty
            || 0
          ),
          0
        );

           const totalQty =
        planningTransportDisplayTargetQuantity(
          scheduledQty
          +
          remainingQty
        );


      scheduledByRoute.delete(
        routeKey
      );


      return {
        ...card,

        scheduledQty:
          Number(
            scheduledQty.toFixed(6)
          ),

        remainingQty:
          Number(
            remainingQty.toFixed(6)
          ),

        totalQty
      };
    });


  /*
   * Se o transporte foi totalmente
   * programado, ele deixa de aparecer
   * no modelo "pendente".
   *
   * Nós o recolocamos aqui apenas para
   * apresentação do status TOTAL.
   */
  scheduledByRoute.forEach(
    scheduled => {

      const first =
        scheduled.transports[0];

      if (!first) {
        return;
      }


      const scheduledQty =
        Number(
          scheduled.quantity
          || 0
        );


      const declaredTotal =
        Number(
          first?.totalQuantity
          ??
          first?.requiredQuantity
          ??
          scheduledQty
        );


            const totalQty =
        Number.isFinite(
          declaredTotal
        )
        && declaredTotal > 0

          ? declaredTotal

          : scheduledQty;


      const remainingQty =
        Math.max(
          totalQty
          -
          scheduledQty,
          0
        );


      result.push({
        scheduleType:
          'transport',

        transportKey:
          String(
            first?.transportKey
            || [
              'transport',
              first?.productionIndex
              || 0,
              first?.materialId
              || '',
              first?.sourceLocation
              || '',
              first?.targetLocation
              || ''
            ].join(':')
          ),

        productionId:
          first?.productionId,

        productionIndex:
          Number(
            first?.productionIndex
            || 0
          ),

        productionTitle:
          first?.productionTitle,

        productionColor:
          first?.productionColor,

        materialId:
          String(
            first?.materialId
            || ''
          ),

        materialCode:
          String(
            first?.materialCode
            || ''
          ),

        materialName:
          String(
            first?.materialName
            || first?.materialCode
            || first?.materialId
            || ''
          ),

        unit:
          String(
            first?.unit
            || ''
          ),

        sourceLocation:
          String(
            first?.sourceLocation
            || ''
          ),

        sourceLocationName:
          String(
            first?.sourceLocationName
            || planningLocationLabel(
              first?.sourceLocation
            )
          ),

        targetLocation:
          String(
            first?.targetLocation
            || ''
          ),

        targetLocationName:
          String(
            first?.targetLocationName
            || planningLocationLabel(
              first?.targetLocation
            )
          ),

        availableQty:
          0,

        scheduledQty:
          Number(
            scheduledQty.toFixed(6)
          ),

        remainingQty:
          Number(
            remainingQty.toFixed(6)
          ),

        totalQty:
          Number(
            totalQty.toFixed(6)
          ),

        producerParentOperationIds:
          first?.producerParentOperationIds
          || [],

        consumerParentOperationIds:
          first?.consumerParentOperationIds
          || []
      });
    }
  );


  return result;
}


function planningTransportCardByKey(
  transportKey
) {
  if (!currentSimulation) {
    return null;
  }


  const groups =
    buildPlanningMaterialsToScheduleModel(
      currentSimulation,
      {
        allocations:
          manualScheduleDraft
            ?.allocations
          || [],

                transports:
          manualScheduleDraft
            ?.transports
          || [],

        plannedReceipts:
          manualScheduleDraft
            ?.plannedReceipts
          || draft.plannedReceipts
          || [],

        machines:
          productionCalendarMachines(
            currentSimulation
          ),

        resolveConsumerLocationIds:
          material =>
            planningMaterialConsumerLocationIds(
              material
            ),

        ignoreStock:
          draft.planningMode
          === 'theoretical'
      }
    );


  return withScheduledPlanningTransportProgress(
  buildPlanningTransportCardsModel(
    currentSimulation,
    groups
  )
).find(
    card =>
      String(
        card.transportKey
      )
      ===
      String(
        transportKey
      )
  )
  || null;
}


function planningProgramMaterialQuantityHtml(
  material = {},
  quantity = 0
) {
  const catalogMaterial =
    findMaterialById(
      materials,
      material?.materialId
    )
    || {};

  const primaryUnit =
    String(
      material?.unit
      || catalogMaterial?.primary_unit
      || ''
    ).trim();

  const secondaryUnit =
    String(
      catalogMaterial?.secondary_unit
      || ''
    ).trim();

  const factor =
    Number(
      catalogMaterial
        ?.primary_to_secondary_factor
    );

  const primaryText =
    `${formatPtBrDecimal(quantity)} ${primaryUnit}`
      .trim();

  /*
   * Bobina:
   * kg / kg não faz sentido mostrar duas vezes.
   */
  if (
    !secondaryUnit
    || !primaryUnit
    || secondaryUnit === primaryUnit
    || !Number.isFinite(factor)
    || !(factor > 0)
  ) {
    return escapeHtml(
      primaryText
    );
  }

  const secondaryQuantity =
    numericQuantity(quantity)
    *
    factor;

  return `
    ${escapeHtml(primaryText)}

    <span class="planning-material-secondary-qty">
      /
      ${escapeHtml(
        `${formatPtBrDecimal(
          secondaryQuantity
        )} ${secondaryUnit}`
      )}
    </span>
  `;
}

function planningSharedInputBalancesForGroup(
  materialsToSchedule = []
) {
  const balances =
    new Map();


  (
    Array.isArray(
      materialsToSchedule
    )
      ? materialsToSchedule
      : []
  ).forEach(material => {

    (
      Array.isArray(
        material?.inputBalances
      )
        ? material.inputBalances
        : []
    ).forEach(balance => {

      const materialId =
        String(
          balance?.materialId
          || ''
        ).trim();


      if (!materialId) {
        return;
      }


      const locationIds =
        (
          Array.isArray(
            balance?.locationIds
          )
            ? balance.locationIds
            : []
        )
          .map(value =>
            String(value || '').trim()
          )
          .filter(Boolean)
          .sort();


      const key =
        `${materialId}\u0000${locationIds.join(',')}`;


      /*
       * Se Longitudinal e Transversal usam
       * a mesma Bobina / FEITAL, ela aparece
       * UMA vez nesta produção.
       */
      if (!balances.has(key)) {

        balances.set(
          key,
          {
            ...balance,

            materialId,

            locationIds
          }
        );
      }
    });
  });


  return [...balances.values()]
    .sort((left, right) => {

      const leftMaterial =
        findMaterialById(
          materials,
          left.materialId
        )
        || {};

      const rightMaterial =
        findMaterialById(
          materials,
          right.materialId
        )
        || {};


      return (
        planningMaterialVisualRank({
          materialName:
            leftMaterial?.name
            || left.materialId
        })

        -

        planningMaterialVisualRank({
          materialName:
            rightMaterial?.name
            || right.materialId
        })

        ||

        String(
          leftMaterial?.name
          || left.materialId
        ).localeCompare(
          String(
            rightMaterial?.name
            || right.materialId
          ),

          'pt-BR',

          {
            numeric: true
          }
        )
      );
    });
}


function planningBalancesStripHtml(
  balances = [],
  {
    title = 'Saldos compartilhados'
  } = {}
) {
  const normalizedBalances =
    (
      Array.isArray(balances)
        ? balances
        : []
    ).filter(balance => (
      balance
      &&
      String(
        balance?.materialId
        || ''
      ).trim()
    ));


  if (!normalizedBalances.length) {
    return '';
  }


  return `
    <div class="planning-shared-stock-strip">

      <span class="planning-shared-stock-strip-title">
        ${escapeHtml(title)}
      </span>

      <div class="planning-shared-stock-strip-items">

        ${normalizedBalances.map(balance => {

          const catalogMaterial =
            findMaterialById(
              materials,
              balance.materialId
            )
            || {};


          const materialName =
            String(
              catalogMaterial?.name
              || balance.materialId
            );


          const locationIds =
            (
              Array.isArray(
                balance?.locationIds
              )
                ? balance.locationIds
                : []
            )
              .map(value =>
                String(value || '').trim()
              )
              .filter(Boolean);


          const locationLabel =
            locationIds.length

              ? locationIds
                  .map(
                    planningLocationLabel
                  )
                  .join(' / ')

              : 'Todos os locais';


          return `
            <div class="planning-shared-stock-strip-item">

              <span>

                ${escapeHtml(
                  materialName
                )}

                <small>
                  ${escapeHtml(
                    locationLabel
                  )}
                </small>

              </span>

              <strong>
                ${planningProgramMaterialQuantityHtml(
                  {
                    materialId:
                      balance.materialId,

                    unit:
                      String(
                        catalogMaterial?.primary_unit
                        || catalogMaterial?.primaryUnit
                        || balance.unit
                        || ''
                      ).trim()
                  },

                  balance.availableQty
                )}
              </strong>

            </div>
          `;

        }).join('')}

      </div>

    </div>
  `;
}


function planningSharedInputBalancesHtml(
  materialsToSchedule = [],
  {
    title = 'Saldos compartilhados',
    locationIds = []
  } = {}
) {
  const normalizedLocationIds =
    (
      Array.isArray(locationIds)
        ? locationIds
        : []
    )
      .map(value =>
        String(value || '').trim()
      )
      .filter(Boolean);


  const balances =
    planningSharedInputBalancesForGroup(
      materialsToSchedule
    )
      .filter(balance => {

        if (
          !normalizedLocationIds.length
        ) {
          return true;
        }


        const balanceLocationIds =
          (
            Array.isArray(
              balance?.locationIds
            )
              ? balance.locationIds
              : []
          )
            .map(value =>
              String(value || '').trim()
            )
            .filter(Boolean);


        return balanceLocationIds.some(
          locationId =>
            normalizedLocationIds.includes(
              locationId
            )
        );
      });


  return planningBalancesStripHtml(
    balances,
    {
      title
    }
  );
}


function planningTransportSourceBalancesHtml(
  transportCards = [],
  result = currentSimulation || {}
) {
  const normalizedCards =
    Array.isArray(transportCards)
      ? transportCards
      : [];


  if (!normalizedCards.length) {
    return '';
  }


  const availability =
    buildPlanningLocalStockAvailability({
      result,

      allocations:
        manualScheduleDraft?.allocations
        || [],

            transports:
        manualScheduleDraft?.transports
        || [],

      plannedReceipts:
        manualScheduleDraft?.plannedReceipts
        || draft.plannedReceipts
        || [],

      machines:
        productionCalendarMachines(
          result
        )
    });


  const balancesMap =
    new Map();


  normalizedCards.forEach(card => {

    const materialId =
      String(
        card?.materialId
        || ''
      ).trim();

    const sourceLocation =
      String(
        card?.sourceLocation
        || card?.sourceLocationId
        || ''
      ).trim();


    if (
      !materialId
      || !sourceLocation
    ) {
      return;
    }


    const key =
      `${materialId}\u0000${sourceLocation}`;


    if (balancesMap.has(key)) {
      return;
    }


    balancesMap.set(
      key,
      {
        materialId,

        unit:
          String(
            card?.unit
            || ''
          ).trim(),

        availableQty:
          planningLocalStockQuantity(
            availability.availableByMaterialLocation,
            materialId,
            sourceLocation
          ),

        locationIds:
          [sourceLocation]
      }
    );
  });


  const balances =
    [...balancesMap.values()]
      .filter(
        balance =>
          Number(
            balance?.availableQty
            || 0
          ) > 0
      );


  return planningBalancesStripHtml(
    balances,
    {
      title:
        'Saldo disponível na origem'
    }
  );
}


function planningStructuredFlowSectorHeaderHtml(
  {
    materialsToSchedule = [],
    transportCards = [],
    result = currentSimulation || {}
  } = {}
) {
  const normalizedTransportCards =
    Array.isArray(transportCards)
      ? transportCards
      : [];


  if (!normalizedTransportCards.length) {
    return planningSharedInputBalancesHtml(
      materialsToSchedule
    );
  }


  const sourceLocationNames =
    [
      ...new Set(
        normalizedTransportCards
          .map(card =>
            String(
              card?.sourceLocationName
              || ''
            ).trim()
          )
          .filter(Boolean)
      )
    ];


  const targetLocationNames =
    [
      ...new Set(
        normalizedTransportCards
          .map(card =>
            String(
              card?.targetLocationName
              || ''
            ).trim()
          )
          .filter(Boolean)
      )
    ];


  const targetLocationIds =
    [
      ...new Set(
        normalizedTransportCards
          .map(card =>
            String(
              card?.targetLocation
              || card?.targetLocationId
              || ''
            ).trim()
          )
          .filter(Boolean)
      )
    ];


  const sourceTitle =
    sourceLocationNames.join(' / ')
    || 'Origem';


  const targetTitle =
    targetLocationNames.join(' / ')
    || 'Destino';


  const sourceBalancesHtml =
    planningTransportSourceBalancesHtml(
      normalizedTransportCards,
      result
    );


  const targetBalancesHtml =
    planningSharedInputBalancesHtml(
      materialsToSchedule,
      {
        title:
          'Saldo compartilhado',
        locationIds:
          targetLocationIds
      }
    )
    ||
    planningSharedInputBalancesHtml(
      materialsToSchedule,
      {
        title:
          'Saldo compartilhado'
      }
    );


  return `
    <div class="planning-flow-sectors">

      <div class="planning-flow-sector planning-flow-sector--source">

        <div class="planning-flow-sector-head">
          <span class="planning-flow-sector-label">
            ${escapeHtml(sourceTitle)}
          </span>
          <small class="planning-flow-sector-subtitle">
            estoque na origem
          </small>
        </div>

        ${
          sourceBalancesHtml
          ||
          `
            <div class="planning-flow-sector-empty">
              Nenhum saldo disponível na origem.
            </div>
          `
        }

      </div>

  

      <div class="planning-flow-sector planning-flow-sector--target">

        <div class="planning-flow-sector-head">
          <span class="planning-flow-sector-label">
            ${escapeHtml(targetTitle)}
          </span>
          <small class="planning-flow-sector-subtitle">
            saldo compartilhado de consumo
          </small>
        </div>

        ${targetBalancesHtml}

      </div>

    </div>
  `;
}

function planningProgramMaterialCardHtml(
  material = {}
) {
  const cardClass =
    material.completed
      ? 'is-completed'
      : material.partial
        ? 'is-partial'
        : material.blocked
          ? 'is-blocked'
          : 'is-ready';

  const canDrag =
    !material.blocked
    &&
    !material.completed;

  return `
    <article
      class="
        planning-material-program-card
        ${cardClass}
      "
      data-operation-id="${escapeHtml(
        material.operationId
      )}"
      data-material-id="${escapeHtml(
        material.materialId
      )}"
      draggable="${canDrag ? 'true' : 'false'}"
    >

           <div class="planning-material-program-card-title">

        <strong>
          ${escapeHtml(material.materialName)}
        </strong>

        <div class="planning-material-program-card-actions">

                    ${
            material.attendedBySharedStock
              ? `
                <span
                  class="
                    planning-material-program-card-pill
                    is-shared-stock
                  "
                >
                  ATENDIDO POR SALDO
                </span>
              `

              : material.partial
                ? `
                  <span class="planning-material-program-card-pill">
                    PARCIAL
                  </span>
                `

                : ''
          }


          ${
            numericQuantity(
              material.sharedDemandQty
            ) > 0
              ? `
                <span
                  class="
                    planning-material-program-card-pill
                    is-shared-demand
                  "
                >
                  +${formatPtBrInteger(
                    material.sharedDemandQty
                  )} COMPARTILHADO
                </span>
              `
              : ''
          }

          ${
            canDrag
              ? `
                <label
                  class="planning-gantt-select-control"
                  title="Selecionar para programar no Gantt"
                >
                  <input
                    type="checkbox"
                    data-planning-gantt-select
                    aria-label="Selecionar ${escapeHtml(material.materialName)} para programar no Gantt"
                    draggable="false"
                  />
                </label>
              `
              : ''
          }

        </div>

      </div>

      <dl>

        <div>
          <dt>Necess&aacute;rio</dt>
          <dd>
                        ${planningProgramMaterialQuantityHtml(
              material,
              material.requiredQty
            )}
          </dd>
        </div>

        <div>
          <dt>Programado</dt>
          <dd>
                        ${planningProgramMaterialQuantityHtml(
              material,
              material.scheduledQty
            )}
          </dd>
        </div>

                ${
          material.attendedBySharedStock
            ? `
              <div>
                <dt>Atendido por saldo</dt>
                <dd>
                  ${planningProgramMaterialQuantityHtml(
                    material,
                    material.sharedStockCoveredQty
                  )}
                </dd>
              </div>
            `

            : material.showPermitted
              ? `
                <div>
                  <dt>Permitido</dt>
                  <dd>
                    ${planningProgramMaterialQuantityHtml(
                      material,
                      material.permittedQty
                    )}
                  </dd>
                </div>
              `

              : ''
        }

        <div>
          <dt>Restante</dt>
          <dd>
                       ${planningProgramMaterialQuantityHtml(
              material,
              material.remainingQty
            )}
          </dd>
        </div>

      </dl>

    </article>
  `;
}

function planningTransportDisplayTargetQuantity(
  value
) {
  const quantity =
    Math.max(
      Number(value || 0),
      0
    );

  if (!(quantity > 0)) {
    return 0;
  }

  return Math.ceil(
    quantity - 0.000001
  );
}

function parsePlanningTransportQuantity(
  value,
  fallback = NaN
) {
  const rawValue =
    String(value ?? '').trim();

  if (!rawValue) {
    return fallback;
  }

  /*
   * Padrão pt-BR:
   *
   * 1.646     -> 1646
   * 1.852     -> 1852
   * 1.850,5   -> 1850.5
   * 1850,5    -> 1850.5
   *
   * Também aceita:
   *
   * 1850.5    -> 1850.5
   */
  if (rawValue.includes(',')) {
    const normalizedValue =
      rawValue
        .replace(/\./g, '')
        .replace(',', '.');

    const number =
      Number(normalizedValue);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  if (/^\d{1,3}(?:\.\d{3})+$/.test(rawValue)) {
    const number =
      Number(
        rawValue.replace(/\./g, '')
      );

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  const number =
    Number(rawValue);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function planningTransportProgramCardHtml(
  transport = {}
) {
  const scheduledQty =
    Math.max(
      Number(
        transport?.scheduledQty
        || 0
      ),
      0
    );

  const totalQty =
    Math.max(
      Number(
        transport?.totalQty
        ??
        transport?.requiredQty
        ??
        transport?.availableQty
        ??
        0
      ),
      0
    );

    const displayTargetQty =
    planningTransportDisplayTargetQuantity(
      totalQty
    );


  /*
   * Antes de existir um transporte programado,
   * o card precisa refletir o que realmente
   * existe AGORA na origem.
   *
   * Exemplo:
   *
   * necessidade total = 3.340 kg
   * saldo MATRIZ      = 1.852 kg
   *
   * A TRANSPORTAR     = 1.852 kg
   *
   * Depois que a Bobina for produzida e
   * o saldo da MATRIZ subir para 3.340 kg:
   *
   * A TRANSPORTAR     = 3.340 kg
   *
   * Também preservamos a regra anterior:
   *
   * necessidade = 1.645,192 kg
   * saldo origem = 1.852 kg
   *
   * A TRANSPORTAR = 1.646 kg
   */
  const sourceAvailableQty =
    Math.max(
      Number(
        transport?.sourceAvailableQty
        ?? transport?.availableQty
        ?? 0
      ),
      0
    );


  const displayAvailableQty =
    Math.min(
      displayTargetQty,
      sourceAvailableQty
    );


  const remainingQty =
    Math.max(
      Number(
        transport?.remainingQty
        ??
        (
          totalQty
          -
          scheduledQty
        )
      ),
      0
    );

  const isTotal =
    scheduledQty > 0
    &&
    remainingQty <= 0.000001;

   const isPartial =
    scheduledQty > 0
    &&
    !isTotal;

  const awaitingSourceStock =
    transport?.awaitingSourceStock === true
    &&
    scheduledQty <= 0
    &&
    sourceAvailableQty <= 0
    &&
    totalQty > 0;

  const canDrag =
    !isTotal
    &&
    Number(
      transport?.availableQty
      || 0
    ) > 0;

   const statusLabel =
    isTotal
      ? 'TOTAL'
      : isPartial
        ? 'PARCIAL'
        : awaitingSourceStock
          ? 'AGUARDANDO SALDO'
          : 'LOGÍSTICA';


  return `
    <article
      class="
        planning-material-program-card
        planning-transport-program-card
        ${
          isTotal
            ? 'is-completed'
            : isPartial
              ? 'is-partial'
              : 'is-ready'
        }
      "
      data-transport-key="${escapeHtml(
        transport.transportKey
      )}"
      draggable="${
        canDrag
          ? 'true'
          : 'false'
      }"
           title="${
        canDrag
          ? 'Arraste para a linha Transporte do Gantt'
          : awaitingSourceStock
            ? 'Aguardando saldo do material na origem'
            : 'Transporte totalmente programado'
      }"
    >

           <div class="planning-transport-program-card-head">

        <strong>
          Transporte
        </strong>

        <div class="planning-transport-program-card-actions">

          <span>
            ${statusLabel}
          </span>

          ${
            canDrag
              ? `
                <label
                  class="planning-gantt-select-control"
                  title="Selecionar transporte para programar no Gantt"
                >
                  <input
                    type="checkbox"
                    data-planning-gantt-select
                    aria-label="Selecionar transporte de ${escapeHtml(transport.materialName)} para programar no Gantt"
                    draggable="false"
                  />
                </label>
              `
              : ''
          }

        </div>

      </div>

      <div class="planning-transport-program-material">
        ${escapeHtml(
          transport.materialName
        )}
      </div>

      <div class="planning-transport-program-route">

        <b>
          ${escapeHtml(
            transport.sourceLocationName
          )}
        </b>

        <span aria-hidden="true">
          &rarr;
        </span>

        <b>
          ${escapeHtml(
            transport.targetLocationName
          )}
        </b>

      </div>

                  <div class="planning-transport-program-qty">

        <small>
          ${
                        scheduledQty > 0
              ? 'Programado / total'
              : awaitingSourceStock
                ? 'Necessidade logística'
                : 'A transportar'
          }
        </small>

                <strong>
          ${
            scheduledQty > 0
              ? `
                ${formatPtBrDecimal(
                  scheduledQty
                )}
                /
                ${formatPtBrInteger(
                  displayTargetQty
                )}
              `
                            : awaitingSourceStock
                ? `
                  ${formatPtBrInteger(
                    displayTargetQty
                  )}
                `
                : `
                  ${formatPtBrDecimal(
                    displayAvailableQty
                  )}
                `
          }

          ${escapeHtml(
            transport.unit
          )}
        </strong>

      </div>

    </article>
  `;
}


function planningProgramMaterialNameKey(
  material = {}
) {
  return normalizeText(
    material?.materialName
    || ''
  )
    .toLocaleLowerCase('pt-BR');
}


function applyPlanningTransportPermittedQuantities(
  result = {},
  groups = [],
  transportCards = [],
  {
    asOfDate = null,
    targetMachineId = null
  } = {}
) {
  if (!Array.isArray(groups) || !groups.length) {
    return groups;
  }

  const availability =
    buildPlanningLocalStockAvailability({
      result,

      allocations:
        manualScheduleDraft?.allocations
        || [],

      transports:
        manualScheduleDraft?.transports
        || [],

      machines:
        productionCalendarMachines(
          result
        ),

      asOfDate
    });


  /*
   * REGRA:
   *
   * Longitudinal e Transversal consomem
   * a mesma Bobina no mesmo local.
   *
   * Portanto o saldo do Feital não pode
   * ser entregue inteiro para os dois.
   *
   * Também não podemos redistribuir o saldo
   * usando o "restante" depois de cada allocation,
   * pois isso gerava:
   *
   * 5.368 -> 1.074 -> 282 -> ...
   *
   * A divisão abaixo é ESTÁVEL:
   *
   * saldo disponível para a rota
   *        ↓
   * dividido proporcionalmente pela
   * necessidade ORIGINAL Long + Trans
   *        ↓
   * cada operação recebe uma cota fixa
   *        ↓
   * o que já foi produzido é descontado
   * da própria cota.
   */
  groups.forEach(group => {

    const groupMaterials =
      Array.isArray(group?.materials)
        ? group.materials
        : [];


    const groupTransportCards =
      (
        Array.isArray(transportCards)
          ? transportCards
          : []
      ).filter(card => (
        Number(
          card?.productionIndex
          || 0
        )
        ===
        Number(
          group?.productionIndex
          || 0
        )
      ));


    /*
     * Se não existe etapa logística nesta produção,
     * não aplicamos essa trava especial.
     */
    if (!groupTransportCards.length) {
      return;
    }


    /*
     * Rota:
     *
     * material + destino
     *
     * Exemplo:
     *
     * CA60 3,4 Bobina + FEITAL
     */
    const routes =
      new Map();


    groupTransportCards.forEach(card => {

      const materialId =
        String(
          card?.materialId
          || ''
        ).trim();


      const targetLocation =
        String(
          card?.targetLocation
          || card?.targetLocationId
          || ''
        ).trim();


      if (
        !materialId
        || !targetLocation
      ) {
        return;
      }


      const key =
        planningLocalStockKey(
          materialId,
          targetLocation
        );


      const route =
        routes.get(key)
        || {
          key,

          materialId,

          targetLocation,

          consumerIds:
            new Set(),

          members:
            [],

          /*
           * Necessidade ORIGINAL total
           * Long + Trans.
           */
          originalDemand:
            0,

          /*
           * Quanto dessa Bobina já foi
           * efetivamente consumido pelas
           * allocations.
           */
          consumedDemand:
            0
        };


      (
        Array.isArray(
          card?.consumerParentOperationIds
        )
          ? card.consumerParentOperationIds
          : []
      ).forEach(operationId => {

        const id =
          String(
            operationId
            || ''
          ).trim();


        if (id) {
          route
            .consumerIds
            .add(id);
        }
      });


      routes.set(
        key,
        route
      );
    });


    /*
     * Descobre quanto cada operação
     * ORIGINALMENTE precisa da Bobina.
     */
    routes.forEach(route => {

      groupMaterials.forEach(material => {

        const operationId =
          String(
            material?.operationId
            || ''
          );


        if (
          !operationId
          ||
          !route
            .consumerIds
            .has(operationId)
        ) {
          return;
        }


        const requirements =
          availability
            .requirementsByConsumer
            .get(operationId)
          || [];


        /*
         * Pode existir mais de um requirement
         * do mesmo material. Somamos.
         */
        const requirementQuantity =
          requirements
            .filter(requirement => (
              String(
                requirement?.materialId
                || ''
              )
              ===
              route.materialId
            ))

            .reduce(
              (
                sum,
                requirement
              ) =>
                sum
                +
                Math.max(
                  Number(
                    requirement
                      ?.requiredQuantity
                    || 0
                  ),
                  0
                ),

              0
            );


        const baseQuantity =
          Math.max(
            Number(
              material?.requiredQty
              || 0
            ),
            0
          );


        if (
          !(requirementQuantity > 0)
          ||
          !(baseQuantity > 0)
        ) {
          return;
        }


        /*
         * Quanto dessa operação já foi
         * efetivamente colocado no Gantt.
         */
        const scheduledQuantity =
          Math.min(
            Math.max(
              Number(
                material?.scheduledQty
                || 0
              ),
              0
            ),

            baseQuantity
          );


        const usagePerUnit =
          requirementQuantity
          /
          baseQuantity;


        /*
         * Consumo correspondente ao que já
         * foi produzido.
         */
        const consumedQuantity =
          requirementQuantity
          *
          (
            scheduledQuantity
            /
            baseQuantity
          );


        route.originalDemand +=
          requirementQuantity;


        route.consumedDemand +=
          consumedQuantity;


        route.members.push({
          material,

          requirementQuantity,

          baseQuantity,

          usagePerUnit,

          consumedQuantity
        });
      });
    });


    /*
     * Agora calcula UMA cobertura por rota.
     */
    routes.forEach(route => {

      if (
        !(route.originalDemand > 0)
        ||
        !route.members.length
      ) {
        return;
      }


      /*
       * Quanto de Bobina existe AGORA
       * no destino.
       *
       * Antes do transporte:
       * somente estoque que já está no Feital.
       *
       * Depois do transporte:
       * inclui a Bobina transportada.
       *
       * Depois da produção:
       * as allocations já descontaram consumo.
       */
      const availableNow =
        Math.max(
          planningLocalStockQuantity(
            availability
              .availableByMaterialLocation,

            route.materialId,

            route.targetLocation
          ),

          0
        );


      /*
             /*
            /*
       * availableNow já é o saldo físico ATUAL
       * deste material no destino.
       *
       * As allocations já tiveram seu consumo
       * descontado por buildPlanningLocalStockAvailability().
       *
       * Portanto NÃO descontamos consumo novamente.
       *
       * Para o "Permitido" dos cards calculamos
       * qual percentual da necessidade ORIGINAL
       * conjunta da rota ainda é coberto pelo
       * saldo físico atual.
       *
       * Exemplo conceitual:
       *
       * Bobina necessária Long + Trans = 100%
       * Bobina disponível no Feital    = 86%
       *
       * Long e Trans mostram 86% de suas
       * necessidades originais como Permitido.
       *
       * Se uma allocation consumir Bobina,
       * availableNow diminui e os DOIS cards
       * são recalculados pelo mesmo saldo.
       */
      const coverageRatio =
        route.originalDemand > 0

          ? Math.min(
              Math.max(
                availableNow
                /
                route.originalDemand,

                0
              ),

              1
            )

          : 0;


      route.members.forEach(member => {

        const remainingQty =
          Math.max(
            Number(
              member
                .material
                ?.remainingQty
              || 0
            ),

            0
          );


        if (!(remainingQty > 0)) {
          member.material.permittedQty =
            0;

          member.material.blocked =
            false;

          member.material.partial =
            false;

          member.material.ready =
            false;

          member.material.status =
            'completed';

          return;
        }

                /*
         * Cada operação recebe a mesma cobertura
         * percentual da necessidade ORIGINAL.
         *
         * IMPORTANTE:
         *
         * não fazemos:
         *
         *   - member.consumedQuantity
         *
         * porque esse consumo já saiu de
         * availableNow no ledger físico.
         */
        const coveredMaterialQuantity =
          member.requirementQuantity
          *
          coverageRatio;


        const routePermittedQty =
          member.usagePerUnit > 0

            ? Math.floor(
                Math.max(
                  coveredMaterialQuantity
                  /
                  member.usagePerUnit,

                  0
                )
              )

            : 0;


        /*
         * Ainda respeita qualquer limite
         * mais restritivo vindo do cálculo
         * normal do planejamento.
         */
        const basePermittedQty =
          Math.max(
            Number(
              member
                .material
                ?.permittedQty
              ??
              remainingQty
            ),

            0
          );


        const permittedQty =
          Math.min(
            remainingQty,

            basePermittedQty,

            routePermittedQty
          );


        member.material.permittedQty =
          permittedQty;


        member.material.blocked =
          remainingQty > 0
          &&
          permittedQty <= 0;


        member.material.partial =
          permittedQty > 0
          &&
          permittedQty
            < remainingQty;


        member.material.ready =
          remainingQty > 0
          &&
          permittedQty
            >= remainingQty;


        member.material.status =
          member.material.completed
            ? 'completed'

            : member.material.blocked
              ? 'blocked'

              : member.material.partial
                ? 'partial'

                : 'ready';
      });
    });
  });


  return groups;
}

function planningPlannedReceiptsHtml(
  plannedReceipts = []
) {
  const receipts =
    (
      Array.isArray(plannedReceipts)
        ? plannedReceipts
        : []
    )
      .map(
        normalizeManualSchedulePlannedReceipt
      )
      .filter(receipt => (
        receipt.materialId
        &&
        receipt.locationId
        &&
        receipt.quantity > 0
        &&
        isValidDateOnly(
          receipt.arrivalDate
        )
        &&
        isValidDateOnly(
          receipt.availableDate
        )
      ))
      .sort((left, right) => (
        left.availableDate.localeCompare(
          right.availableDate
        )

        ||

        String(
          left.materialName
          || left.materialId
        ).localeCompare(
          String(
            right.materialName
            || right.materialId
          ),
          'pt-BR',
          {
            numeric: true
          }
        )
      ));


  if (!receipts.length) {
    return '';
  }


  return `
    <section class="planning-planned-receipts">

      <div class="planning-planned-receipts-head">

        <div>
          <h3>
            Entradas previstas
          </h3>

          <p>
            Compras estimadas que entram no saldo do planejamento na data de disponibilidade.
          </p>
        </div>

        <span>
          ${formatPtBrInteger(receipts.length)}
          ${receipts.length === 1 ? 'entrada' : 'entradas'}
        </span>

      </div>


      <div class="planning-planned-receipts-list">

        ${receipts.map(receipt => `
          <article class="planning-planned-receipt-card">

            <div class="planning-planned-receipt-material">

              <strong>
                ${escapeHtml(
                  receipt.materialName
                  || receipt.materialId
                )}
              </strong>

              <small>
                ${escapeHtml(
                  receipt.locationName
                  || planningLocationLabel(
                    receipt.locationId
                  )
                )}
              </small>

            </div>


            <div>

              <span>
                Quantidade prevista
              </span>

              <strong>
                ${formatPtBrDecimal(
                  receipt.quantity
                )}
                ${escapeHtml(
                  receipt.unit
                  || ''
                )}
              </strong>

            </div>


            <div>

              <span>
                Chegada estimada
              </span>

              <strong>
                ${escapeHtml(
                  formatDateOnly(
                    receipt.arrivalDate
                  )
                )}
              </strong>

            </div>


            <div>

              <span>
                Disponível para produção
              </span>

              <strong>
                ${escapeHtml(
                  formatDateOnly(
                    receipt.availableDate
                  )
                )}
              </strong>

            </div>

          </article>
        `).join('')}

      </div>

    </section>
  `;
}


/*
 * Normaliza IDs das operações para a montagem
 * visual do fluxo.
 */
function planningProgramFlowOperationId(
  value
) {
  return String(
    value ?? ''
  )
    .replace(
      /:day-\d+$/i,
      ''
    )
    .trim();
}


/*
 * Seta simples entre duas etapas produtivas.
 */
function planningProgramPlainConnectorHtml() {
  return `
    <div
      class="
        planning-program-connector
        planning-program-connector--plain
      "
      aria-hidden="true"
    >
      <span
        class="planning-program-connector-line"
      ></span>

      <span
        class="planning-program-connector-arrow"
      ></span>
    </div>
  `;
}


/*
 * Transporte posicionado DENTRO do fluxo,
 * igual ao layout que já usamos na malha.
 */
function planningProgramTransportConnectorHtml(
  transportCards = []
) {
  const cards =
    Array.isArray(
      transportCards
    )
      ? transportCards.filter(Boolean)
      : [];


  if (!cards.length) {
    return '';
  }


  return `
    <div
      class="
        planning-program-connector
        planning-program-connector--transport
        has-transport
      "
    >
      <span
        class="planning-program-connector-line"
        aria-hidden="true"
      ></span>

      <div
        class="planning-program-transport-stack"
      >
        ${cards
          .map(
            planningTransportProgramCardHtml
          )
          .join('')}
      </div>

      <span
        class="planning-program-connector-arrow"
        aria-hidden="true"
      ></span>
    </div>
  `;
}


/*
 * =========================================================
 * FLUXO LINEAR GENÉRICO
 * =========================================================
 *
 * Serve para qualquer produção que não seja o caso
 * ramificado Longitudinal / Transversal.
 *
 * Exemplos:
 *
 * Bobina -> Transporte -> Reto
 *
 * Bobina -> Transporte -> Vareta
 *
 * Etapa A -> Etapa B -> Etapa C
 *
 * ou simplesmente:
 *
 * Bobina
 */
function planningLinearProgramFlowHtml({
  materials = [],
  transportCards = []
} = {}) {

  const orderedMaterials =
    orderPlanningMaterialsByProductionSequence(
      Array.isArray(materials)
        ? [...materials]
        : []
    );


  if (!orderedMaterials.length) {
    return '';
  }


  const normalizedOperationIds =
    orderedMaterials.map(
      material =>
        planningProgramFlowOperationId(
          material?.operationId
        )
    );


  /*
   * Transportes que devem aparecer depois
   * de determinada etapa produtiva.
   */
  const transportsAfterIndex =
    new Map();


  /*
   * Caso exista transporte cujo produtor não
   * apareça como card produtivo, ele pode entrar
   * antes da primeira etapa.
   */
  const leadingTransports =
    [];


  const addTransportAfter =
    (
      index,
      card
    ) => {

      const current =
        transportsAfterIndex.get(
          index
        )
        || [];


      current.push(
        card
      );


      transportsAfterIndex.set(
        index,
        current
      );

    };


  (
    Array.isArray(transportCards)
      ? transportCards
      : []
  ).forEach(
    card => {

      const producerIds =
        new Set(
          (
            Array.isArray(
              card?.producerParentOperationIds
            )
              ? card.producerParentOperationIds
              : []
          )
            .map(
              planningProgramFlowOperationId
            )
            .filter(Boolean)
        );


      const consumerIds =
        new Set(
          (
            Array.isArray(
              card?.consumerParentOperationIds
            )
              ? card.consumerParentOperationIds
              : []
          )
            .map(
              planningProgramFlowOperationId
            )
            .filter(Boolean)
        );


      /*
       * Primeiro tentamos colocar o transporte
       * imediatamente depois da operação que
       * PRODUZIU o material.
       */
      let producerIndex =
        normalizedOperationIds
          .findIndex(
            operationId =>
              operationId
              &&
              producerIds.has(
                operationId
              )
          );


      /*
       * Se o produtor não estiver visível,
       * tentamos descobrir pelo consumidor.
       *
       * Transporte fica imediatamente antes
       * do primeiro consumidor.
       */
      if (
        producerIndex < 0
        &&
        consumerIds.size
      ) {

        const consumerIndex =
          normalizedOperationIds
            .findIndex(
              operationId =>
                operationId
                &&
                consumerIds.has(
                  operationId
                )
            );


        if (consumerIndex > 0) {

          producerIndex =
            consumerIndex - 1;

        } else if (consumerIndex === 0) {

          leadingTransports.push(
            card
          );

          return;

        }

      }


      /*
       * Fallback seguro para cadeias simples.
       */
      if (producerIndex < 0) {

        if (
          orderedMaterials.length
          ===
          1
        ) {

          leadingTransports.push(
            card
          );

          return;

        }


        producerIndex =
          Math.max(
            orderedMaterials.length
            - 2,
            0
          );

      }


      /*
       * Nunca coloca transporte visualmente
       * depois do produto final.
       */
      producerIndex =
        Math.min(
          producerIndex,
          orderedMaterials.length
          - 2
        );


      addTransportAfter(
        producerIndex,
        card
      );

    }
  );


  const html =
    [];


  /*
   * Transporte que eventualmente antecede
   * a primeira operação visível.
   */
  if (leadingTransports.length) {

    html.push(
      planningProgramTransportConnectorHtml(
        leadingTransports
      )
    );

  }


  orderedMaterials.forEach(
    (
      material,
      index
    ) => {

      const isFinal =
        index
        ===
        orderedMaterials.length
        - 1;


      /*
       * Toda etapa intermediária usa o visual
       * compacto da "produção anterior".
       *
       * A última usa o card de produto final.
       */
      html.push(`
        <div
          class="
            planning-program-stage
            planning-program-stage--linear
            ${
              isFinal
                ? 'planning-program-stage--final'
                : 'planning-program-stage--source'
            }
          "
        >
          ${planningProgramMaterialCardHtml(
            material
          )}
        </div>
      `);


      if (isFinal) {
        return;
      }


      const transportStage =
        transportsAfterIndex.get(
          index
        )
        || [];


      /*
       * Havendo transporte:
       *
       * etapa -> TRANSPORTE -> próxima etapa
       *
       * Sem transporte:
       *
       * etapa -> próxima etapa
       */
      html.push(
        transportStage.length

          ? planningProgramTransportConnectorHtml(
              transportStage
            )

          : planningProgramPlainConnectorHtml()
      );

    }
  );


  return html.join('');
}


  function planningProgramMaterialAggregateKey(material = {}) {
    return [material?.materialId || '', material?.unit || '', material?.productionModelName || ''].join('|');
  }

  function planningConsolidatedProgramMaterial(members = []) {
    const items = members.filter(Boolean);
    if (!items.length) return null;
    const sum = key => items.reduce((total, item) => total + Math.max(Number(item?.[key] || 0), 0), 0);
    const productions = [...new Map(items.map(item => [Number(item.productionIndex || 0), {
      index: Number(item.productionIndex || 0), number: Number(item.productionNumber ?? item.productionIndex + 1), title: item.productionTitle || `Produção #${Number(item.productionNumber ?? item.productionIndex + 1)}`, color: item.productionColor
    }])).values()].sort((a, b) => a.index - b.index);
    const remainingQty = sum('remainingQty');
    const permittedQty = sum('permittedQty');
    const scheduledQty = sum('scheduledQty');
    const partial = remainingQty > 0 && (scheduledQty > 0 || (permittedQty > 0 && permittedQty < remainingQty));
    return {
      ...items[0], isConsolidatedProgramMaterial: true, members: items,
      operationIds: [...new Set(items.map(item => String(item.operationId || '')).filter(Boolean))], productions,
      requiredQty: sum('requiredQty'), scheduledQty, permittedQty, remainingQty,
      sharedDemandQty: sum('sharedDemandQty'), sharedStockCoveredQty: sum('sharedStockCoveredQty'),
      showPermitted: items.some(item => item.showPermitted), completed: items.every(item => item.completed),
      blocked: remainingQty > 0 && permittedQty <= 0, partial,
      ready: remainingQty > 0 && permittedQty > 0 && !partial
    };
  }

  function buildPlanningConsolidatedProgramMaterials(groups = []) {
    const grouped = new Map();
    groups.forEach(group => (group.materials || []).forEach(material => {
      const member = { ...material, productionId: group.productionId, productionIndex: group.productionIndex, productionNumber: group.productionNumber ?? group.productionIndex + 1, productionTitle: group.title, productionColor: group.color };
      const key = planningProgramMaterialAggregateKey(member);
      const members = grouped.get(key) || [];
      members.push(member);
      grouped.set(key, members);
    }));
    return [...grouped.entries()].map(([key, members]) => ({ key: `material:${key}`, material: planningConsolidatedProgramMaterial(members) }));
  }

  function planningSharedTransportRouteKey(value = {}) {
    return [value.materialId || '', value.sourceLocation || value.sourceLocationId || '', value.targetLocation || value.targetLocationId || '', value.unit || ''].join('|');
  }

  function buildPlanningConsolidatedTransportCards(result, groups) {
    const routes = new Map();

    buildPlanningTransportCardsModel(result, groups).forEach(card => {
      const key = planningSharedTransportRouteKey(card);
      const productionIndex = Number(card.productionIndex || 0);

      const route = routes.get(key) || {
        ...card,
        transportKey: `shared-transport:${key}`,
        isConsolidatedTransport: true,
        productions: [],
        producerParentOperationIds: [],
        consumerParentOperationIds: [],
        flowLinks: [],
        requiredQty: 0,
        sourceAvailableQty: 0
      };

      route.requiredQty += Math.max(Number(card.requiredQty || 0), 0);
      route.sourceAvailableQty = Math.max(
        route.sourceAvailableQty,
        Number(card.sourceAvailableQty || 0)
      );

      route.productions.push({
        productionId: card.productionId,
        index: productionIndex,
        number: Number(card.productionNumber ?? productionIndex + 1),
        title: card.productionTitle,
        color: card.productionColor
      });

      route.producerParentOperationIds.push(...(card.producerParentOperationIds || []));
      route.consumerParentOperationIds.push(...(card.consumerParentOperationIds || []));

      route.flowLinks.push({
        productionIndex,
        color: card.productionColor,
        producerParentOperationIds: [
          ...(card.producerParentOperationIds || [])
        ],
        consumerParentOperationIds: [
          ...(card.consumerParentOperationIds || [])
        ]
      });

      routes.set(key, route);
    });

    (manualScheduleDraft?.transports || []).forEach(saved => {
      const key = planningSharedTransportRouteKey(saved);

      if (!routes.has(key)) {
        routes.set(key, {
          ...saved,
          scheduleType: 'transport',
          transportKey: `shared-transport:${key}`,
          isConsolidatedTransport: true,
          productions: [],
          producerParentOperationIds: [],
          consumerParentOperationIds: [],
          flowLinks: [],
          requiredQty: 0,
          sourceAvailableQty: 0
        });
      }

      const route = routes.get(key);

      (Array.isArray(saved.productions) ? saved.productions : [])
        .forEach(item => route.productions.push(item));

      [...new Set((saved.producerParentOperationIds || []).map(String))]
        .forEach(id => route.producerParentOperationIds.push(id));

      [...new Set((saved.consumerParentOperationIds || []).map(String))]
        .forEach(id => route.consumerParentOperationIds.push(id));

      (Array.isArray(saved.flowLinks) ? saved.flowLinks : [])
        .forEach(link => route.flowLinks.push(link));

      route.scheduledQty =
        Math.max(Number(route.scheduledQty || 0), 0)
        + Math.max(Number(saved.quantity || 0), 0);

      route.declaredTotalQty = Math.max(
        Number(route.declaredTotalQty || 0),
        Number(
          saved.totalQuantity
          ?? saved.requiredQuantity
          ?? 0
        )
      );
    });

    const normalizedRoutes = [...routes.values()].map(route => {
      route.productions = [
        ...new Map(
          route.productions.map(item => [item.index, item])
        ).values()
      ].sort((a, b) => a.index - b.index);

      route.producerParentOperationIds = [
        ...new Set(
          route.producerParentOperationIds.map(String)
        )
      ];

      route.consumerParentOperationIds = [
        ...new Set(
          route.consumerParentOperationIds.map(String)
        )
      ];

      const flowLinks = new Map();

      (route.flowLinks || []).forEach(link => {
        const productionIndex =
          Number(link.productionIndex || 0);

        const color =
          String(link.color || '');

        const linkKey =
          `${productionIndex}|${color}`;

        const current =
          flowLinks.get(linkKey)
          || {
            productionIndex,
            color: link.color,
            producerParentOperationIds: [],
            consumerParentOperationIds: []
          };

        current.producerParentOperationIds.push(
          ...(link.producerParentOperationIds || [])
        );

        current.consumerParentOperationIds.push(
          ...(link.consumerParentOperationIds || [])
        );

        flowLinks.set(linkKey, current);
      });

      route.flowLinks = [...flowLinks.values()].map(link => ({
        ...link,

        producerParentOperationIds: [
          ...new Set(
            link.producerParentOperationIds.map(String)
          )
        ],

        consumerParentOperationIds: [
          ...new Set(
            link.consumerParentOperationIds.map(String)
          )
        ]
      }));

      route.scheduledQty =
        Math.max(
          Number(route.scheduledQty || 0),
          0
        );

      const logisticalRemainingQty = Math.max(Number(route.requiredQty || 0), 0);
      const sourceAvailableQty = Math.max(Number(route.sourceAvailableQty || 0), 0);

      route.totalQty = Math.max(
        Number(route.declaredTotalQty || 0),
        route.scheduledQty + logisticalRemainingQty,
        route.scheduledQty + sourceAvailableQty
      );
      route.remainingQty = Math.max(route.totalQty - route.scheduledQty, 0);
      route.availableQty = Math.min(route.remainingQty, sourceAvailableQty);
      route.suggestedQty = route.availableQty;
      route.logisticalRemainingQty = logisticalRemainingQty;

      return route;
    });

    return normalizedRoutes.sort((left, right) => {
      const productionOrder = route => {
        const indexes = (Array.isArray(route?.productions) ? route.productions : [])
          .map(item => Number(item?.index))
          .filter(Number.isFinite);
        return indexes.length ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER;
      };
      const leftProductionOrder = productionOrder(left);
      const rightProductionOrder = productionOrder(right);
      if (leftProductionOrder !== rightProductionOrder) {
        return leftProductionOrder - rightProductionOrder;
      }
      const materialComparison = String(left?.materialName || left?.materialId || '')
        .localeCompare(
          String(right?.materialName || right?.materialId || ''),
          'pt-BR',
          { numeric: true, sensitivity: 'base' }
        );
      if (materialComparison) return materialComparison;
      return String(left?.transportKey || '').localeCompare(
        String(right?.transportKey || ''),
        'pt-BR',
        { numeric: true, sensitivity: 'base' }
      );
    });
  }

  function buildPlanningConsolidatedProgramFlowModel(result) {
    const groups = buildPlanningMaterialsToScheduleModel(result, {
      allocations: manualScheduleDraft?.allocations || [],
      transports: manualScheduleDraft?.transports || [],
      plannedReceipts: manualScheduleDraft?.plannedReceipts || draft.plannedReceipts || [],
      machines: productionCalendarMachines(result),
      resolveConsumerLocationIds: material => planningMaterialConsumerLocationIds(material),
      ignoreStock: draft.planningMode === 'theoretical'
    });
    const materialNodes = buildPlanningConsolidatedProgramMaterials(groups);
    const transportCards = buildPlanningConsolidatedTransportCards(result, groups);
    const operationToNode = new Map();

    materialNodes.forEach(node => {
      node.material.operationIds.forEach(id => {
        operationToNode.set(String(id), node.key);
      });
    });

    const edges = [];
    const edgeKeys = new Set();
    const edgeKey = (from, to, productionIndex) => `${from}|${to}|${productionIndex}`;
    const addEdge = (from, to, productionIndex, color) => {
      if (!from || !to || from === to) return;
      const normalizedProductionIndex = Number(productionIndex || 0);
      const key = edgeKey(from, to, normalizedProductionIndex);
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ from, to, productionIndex: normalizedProductionIndex, color });
    };
    const removeEdge = (from, to, productionIndex) => {
      const normalizedProductionIndex = Number(productionIndex || 0);
      for (let index = edges.length - 1; index >= 0; index -= 1) {
        const edge = edges[index];
        if (edge.from === from && edge.to === to && Number(edge.productionIndex || 0) === normalizedProductionIndex) {
          edgeKeys.delete(edgeKey(edge.from, edge.to, edge.productionIndex));
          edges.splice(index, 1);
        }
      }
    };

    materialNodes.forEach(node => {
      node.material.members.forEach(member => {
        (member.dependencyOperationIds || []).forEach(id => {
          addEdge(
            operationToNode.get(String(id)),
            node.key,
            member.productionIndex,
            member.productionColor
          );
        });
      });
    });

    transportCards.forEach(card => {
      const transportKey = card.transportKey;
      const links = Array.isArray(card.flowLinks) ? card.flowLinks : [];

      links.forEach(link => {
        const productionIndex = Number(link.productionIndex || 0);
        const color = link.color;
        const producerNodeKeys = [...new Set((link.producerParentOperationIds || [])
          .map(id => operationToNode.get(String(id)))
          .filter(Boolean))];
        const consumerNodeKeys = [...new Set((link.consumerParentOperationIds || [])
          .map(id => operationToNode.get(String(id)))
          .filter(Boolean))];

        producerNodeKeys.forEach(producerNodeKey => {
          consumerNodeKeys.forEach(consumerNodeKey => {
            removeEdge(producerNodeKey, consumerNodeKey, productionIndex);
          });
          addEdge(producerNodeKey, transportKey, productionIndex, color);
        });

        consumerNodeKeys.forEach(consumerNodeKey => {
          addEdge(transportKey, consumerNodeKey, productionIndex, color);
        });
      });
    });

    const nodes = [
      ...materialNodes,
      ...transportCards.map(card => ({ key: card.transportKey, transport: card }))
    ];
    const levels = new Map(nodes.map(node => [node.key, 0]));

    for (let pass = 0; pass < nodes.length; pass += 1) {
      edges.forEach(edge => {
        levels.set(edge.to, Math.max(levels.get(edge.to) || 0, (levels.get(edge.from) || 0) + 1));
      });
    }

    /*
     * Um material 100% atendido por estoque continua sendo
     * predecessor real do produto final, mas não depende do
     * transporte recém-programado.
     *
     * Por isso ele pode receber nível menor no grafo mesmo
     * pertencendo visualmente à mesma etapa dos demais
     * intermediários.
     *
     * Alinhamos somente a COLUNA visual com os outros
     * predecessores do mesmo consumidor e da mesma produção.
     */
    materialNodes
      .filter(node => (node.material?.members || [])
        .some(member => member?.stockCoveredOnly === true))
      .forEach(node => {
        const outgoing =
          edges.filter(edge =>
            edge.from === node.key
          );

        outgoing.forEach(edge => {
          const siblingLevels =
            edges
              .filter(candidate => (
                candidate.to === edge.to
                &&
                candidate.from !== node.key
                &&
                Number(candidate.productionIndex || 0)
                  === Number(edge.productionIndex || 0)
              ))
              .map(candidate =>
                levels.get(candidate.from) || 0
              );

          if (!siblingLevels.length) {
            return;
          }

          levels.set(
            node.key,
            Math.max(
              levels.get(node.key) || 0,
              ...siblingLevels
            )
          );
        });
      });

    return { groups, materialNodes, transportCards, nodes, edges, levels };
  }

  function planningConsolidatedProductionBadgesHtml(productions = []) {
    const normalizedProductions = [...new Map((Array.isArray(productions) ? productions : [])
      .map(item => [Number(item?.index || 0), item])).values()]
      .sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0));
    if (!normalizedProductions.length) return '';
    return `<div class="planning-consolidated-production-badges" aria-label="Produções relacionadas">${normalizedProductions.map(item => {
      const index = Number(item?.index || 0);
      const number = Number(item?.number ?? index + 1);
      const theme = productionTheme(index, item?.color);
      return `<span class="planning-consolidated-production-badge" style="--planning-production-badge-color: ${escapeHtml(theme.border)};" title="${escapeHtml(item?.title || `Produção #${number}`)}">#${number}</span>`;
    }).join('')}</div>`;
  }

  function planningConsolidatedMaterialAvailability(
    material = {}
  ) {

    if (material.stockCoveredOnly === true) {
      return {
        state: 'completed',
        className:
          'is-availability-completed',
        label:
          'ATENDIDO POR ESTOQUE'
      };
    }

    const remainingQty =
      Math.max(
        Number(
          material.remainingQty
          || 0
        ),
        0
      );


    const permittedQty =
      Math.max(
        Number(
          material.permittedQty
          || 0
        ),
        0
      );


    /*
     * Evita estado visual incorreto causado
     * apenas por resíduo decimal.
     */
    const tolerance =
      0.0005;


    if (
      material.completed === true
      ||
      remainingQty <= tolerance
    ) {
      return {
        state: 'completed',
        className:
          'is-availability-completed',
        label:
          'CONCLUÍDO'
      };
    }


    if (
      permittedQty <= tolerance
    ) {
      return {
        state: 'blocked',
        className:
          'is-availability-blocked',
        label:
          'AGUARDANDO MATERIAL'
      };
    }


    if (
      permittedQty
      + tolerance
      <
      remainingQty
    ) {
      return {
        state: 'partial',
        className:
          'is-availability-partial',
        label:
          'DISPONÍVEL PARCIALMENTE'
      };
    }


    return {
      state: 'ready',
      className:
        'is-availability-ready',
      label:
        ''
    };
  }


  function planningConsolidatedProgramMaterialCardHtml(
    material = {}
  ) {

    const canDrag =
      !material.blocked
      &&
      !material.completed;


    /*
     * A classe antiga continua existindo porque
     * ela participa da mecânica atual de drag/drop.
     *
     * A NOVA classe de disponibilidade serve
     * exclusivamente para apresentação visual.
     */
    const legacyCardClass =
      material.completed
        ? 'is-completed'
        : material.partial
          ? 'is-partial'
          : material.blocked
            ? 'is-blocked'
            : 'is-ready';


    const availability =
      planningConsolidatedMaterialAvailability(
        material
      );


    return `
      <article
        class="
          planning-material-program-card
          planning-consolidated-program-card
          ${legacyCardClass}
          ${availability.className}
        "
        data-flow-node-key="${escapeHtml(
          `material:${
            planningProgramMaterialAggregateKey(
              material
            )
          }`
        )}"
        data-operation-id="${escapeHtml(
          material.operationIds?.[0]
          ||
          material.operationId
          ||
          ''
        )}"
        data-operation-ids="${escapeHtml(
          (
            material.operationIds
            || []
          ).join(',')
        )}"
        data-material-id="${escapeHtml(
          material.materialId
        )}"
        data-flow-production-indexes="${escapeHtml(
          (
            material.productions
            || []
          )
            .map(
              item =>
                item.index
            )
            .join(',')
        )}"
        draggable="${canDrag}"
      >

        <div
          class="
            planning-consolidated-card-head
          "
        >

          <div
            class="
              planning-consolidated-title-line
            "
          >

            <strong>
              ${escapeHtml(
                material.materialName
              )}
            </strong>


            ${planningConsolidatedProductionBadgesHtml(
              material.productions
            )}

          </div>


          ${
            canDrag
              ? `
                <label
                  class="
                    planning-gantt-select-control
                    planning-consolidated-card-check
                  "
                >
                  <input
                    type="checkbox"
                    data-planning-gantt-select
                    draggable="false"
                  >
                </label>
              `
              : ''
          }

        </div>


        <dl
          class="
            planning-consolidated-card-metrics
          "
        >

          <div>

            <dt>
              Necessário
            </dt>

            <dd>
              ${planningProgramMaterialQuantityHtml(
                material,
                material.requiredQty
              )}
            </dd>

          </div>


          <div>

            <dt>
              Programado
            </dt>

            <dd>
              ${planningProgramMaterialQuantityHtml(
                material,
                material.scheduledQty
              )}
            </dd>

          </div>


          ${
            material.showPermitted
              ? `
                <div>

                  <dt>
                    Permitido
                  </dt>

                  <dd>
                    ${planningProgramMaterialQuantityHtml(
                      material,
                      material.permittedQty
                    )}
                  </dd>

                </div>
              `
              : ''
          }


          <div>

            <dt>
              Restante
            </dt>

            <dd>
              ${planningProgramMaterialQuantityHtml(
                material,
                material.remainingQty
              )}
            </dd>

          </div>

        </dl>


        ${
          availability.label
            ? `
              <div
                class="
                  planning-consolidated-availability
                  planning-consolidated-availability--${availability.state}
                "
              >
                <span>
                  ${escapeHtml(
                    availability.label
                  )}
                </span>
              </div>
            `
            : ''
        }

      </article>
    `;
  }

  function planningConsolidatedTransportAvailability(transport = {}) {
    const scheduledQty = Math.max(Number(transport.scheduledQty || 0), 0);
    const remainingQty = Math.max(Number(transport.remainingQty || 0), 0);
    const availableQty = Math.max(Number(transport.availableQty || 0), 0);
    const tolerance = 0.0005;

    if (remainingQty <= tolerance) return { state: 'completed', label: 'CONCLUÍDO' };
    if (scheduledQty > tolerance) return { state: 'partial', label: 'PARCIALMENTE ALOCADO' };
    if (availableQty <= tolerance) return { state: 'blocked', label: 'AGUARDANDO SALDO' };
    return { state: 'ready', label: '' };
  }

  function planningConsolidatedTransportProgramCardHtml(transport = {}) {
    const totalQty = Math.max(Number(transport.totalQty || 0), 0);
    const scheduledQty = Math.max(Number(transport.scheduledQty || 0), 0);
    const progress = totalQty > 0
      ? Math.min(100, Math.max(0, (scheduledQty / totalQty) * 100))
      : 0;
    const canDrag = transport.remainingQty > 0 && transport.availableQty > 0;
    const availability = planningConsolidatedTransportAvailability(transport);

    return `
      <article
        class="planning-material-program-card planning-transport-program-card planning-consolidated-transport-card ${transport.remainingQty <= 0 ? 'is-completed' : scheduledQty > 0 ? 'is-partial' : 'is-ready'}"
        data-flow-node-key="${escapeHtml(transport.transportKey)}"
        data-transport-key="${escapeHtml(transport.transportKey)}"
        data-flow-production-indexes="${escapeHtml((transport.productions || []).map(item => item.index).join(','))}"
        draggable="${canDrag}"
      >
        <div class="planning-consolidated-card-head">
          <div class="planning-consolidated-title-line">
            <strong>Transporte</strong>
            ${planningConsolidatedProductionBadgesHtml(transport.productions)}
          </div>

          ${canDrag ? `
            <label class="planning-gantt-select-control planning-consolidated-card-check">
              <input type="checkbox" data-planning-gantt-select draggable="false">
            </label>
          ` : ''}
        </div>

        <div class="planning-transport-program-material">
          ${escapeHtml(transport.materialName)}
        </div>

        <div class="planning-transport-program-route">
          <b>${escapeHtml(transport.sourceLocationName || transport.sourceLocation)}</b>
          <span>&rarr;</span>
          <b>${escapeHtml(transport.targetLocationName || transport.targetLocation)}</b>
        </div>

        <div class="planning-transport-program-qty">
          <small>${transport.remainingQty <= 0 ? 'TOTAL' : scheduledQty > 0 ? 'PARCIAL' : transport.availableQty > 0 ? 'LOGÍSTICA' : 'AGUARDANDO SALDO'}</small>
          <strong>${formatPtBrDecimal(scheduledQty)} / ${formatPtBrDecimal(totalQty)} ${escapeHtml(transport.unit)}</strong>
        </div>

        <div class="planning-consolidated-transport-progress">
          <span style="--transport-progress: ${progress}%;"></span>
        </div>

        ${
          availability.label
            ? `
              <div
                class="
                  planning-consolidated-availability
                  planning-consolidated-availability--${availability.state}
                "
              >
                <span>${escapeHtml(availability.label)}</span>
              </div>
            `
            : ''
        }
      </article>
    `;
  }

  function planningLocationIdByIdentity(identity) {
    const expected = normalizeText(identity);

    if (!expected) return '';

    const location = (locations || []).find(item => (
      [item?.code, item?.name]
        .map(normalizeText)
        .includes(expected)
    ));

    return String(
      location?.id
      ?? location?.locationId
      ?? location?.location_id
      ?? ''
    ).trim();
  }

  function planningRelevantLocationBalancesHtml(
    materialsToSchedule = [],
    result = currentSimulation || {},
    { locationId = '', title = 'Saldo disponível' } = {}
  ) {
    const normalizedLocationId = String(locationId || '').trim();
    if (!normalizedLocationId) return '';

    const relevantMaterialIds = new Set(
      planningSharedInputBalancesForGroup(materialsToSchedule)
        .map(balance => String(balance?.materialId || '').trim())
        .filter(Boolean)
    );
    if (!relevantMaterialIds.size) return '';

    const availability = buildPlanningLocalStockAvailability({
      result,
      allocations: manualScheduleDraft?.allocations || [],
      transports: manualScheduleDraft?.transports || [],
      plannedReceipts: manualScheduleDraft?.plannedReceipts || draft.plannedReceipts || [],
      machines: productionCalendarMachines(result)
    });

    const balances = [...relevantMaterialIds]
      .map(materialId => {
        const availableQty = planningLocalStockQuantity(
          availability.availableByMaterialLocation,
          materialId,
          normalizedLocationId
        );
        const catalogMaterial = findMaterialById(materials, materialId) || {};
        return {
          materialId,
          unit: String(catalogMaterial?.primary_unit || catalogMaterial?.primaryUnit || '').trim(),
          availableQty,
          locationIds: [normalizedLocationId]
        };
      })
      .filter(balance => numericQuantity(balance.availableQty) > 0);

    return planningBalancesStripHtml(balances, { title });
  }

  function planningGlobalProgramStockHeaderHtml(groups, transportCards, result) {
    const materialsToSchedule = groups.flatMap(group => group.materials || []);
    const cards = Array.isArray(transportCards) ? transportCards : [];
    const matrizLocationId = planningLocationIdByIdentity('matriz');
    const feitalLocationId = planningLocationIdByIdentity('feital');
    const sourceBalancesHtml = planningRelevantLocationBalancesHtml(
      materialsToSchedule,
      result,
      { locationId: matrizLocationId, title: 'Saldo disponível na origem' }
    ) || planningTransportSourceBalancesHtml(cards, result);
    const targetBalancesHtml = (
      feitalLocationId
        ? planningSharedInputBalancesHtml(materialsToSchedule, { title: 'Saldo compartilhado', locationIds: [feitalLocationId] })
        : ''
    ) || planningSharedInputBalancesHtml(materialsToSchedule, { title: 'Saldo compartilhado' });
    return `<div class="planning-flow-sectors"><div class="planning-flow-sector planning-flow-sector--source"><div class="planning-flow-sector-head"><span class="planning-flow-sector-label">MATRIZ</span><small class="planning-flow-sector-subtitle">estoque na origem</small></div>${sourceBalancesHtml || '<div class="planning-flow-sector-empty">Nenhum saldo disponível na origem.</div>'}</div><div class="planning-flow-sector planning-flow-sector--target"><div class="planning-flow-sector-head"><span class="planning-flow-sector-label">FEITAL</span><small class="planning-flow-sector-subtitle">saldo compartilhado de consumo</small></div>${targetBalancesHtml || '<div class="planning-flow-sector-empty">Nenhum saldo compartilhado disponível.</div>'}</div></div>`;
  }

  function renderPlanningConsolidatedProgramFlow(result) {
    const model = buildPlanningConsolidatedProgramFlowModel(result);
    const byLevel = new Map();

    model.nodes.forEach(node => {
      const level = model.levels.get(node.key) || 0;
      const nodes = byLevel.get(level) || [];
      nodes.push(node);
      byLevel.set(level, nodes);
    });

    const columns = [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, nodes]) => `
        <div class="production-flow-column planning-program-consolidated-column" data-flow-level="${level}">
          ${nodes.map(node => `
            <div class="planning-program-consolidated-node" data-flow-node-key="${escapeHtml(node.key)}">
              ${node.material
                ? planningConsolidatedProgramMaterialCardHtml(node.material)
                : planningConsolidatedTransportProgramCardHtml(node.transport)}
            </div>
          `).join('')}
        </div>
      `)
      .join('');

    return `
      <div class="production-flow-graph planning-program-consolidated-graph" data-flow-graph>
        <svg class="production-flow-svg" aria-hidden="true"></svg>
        ${columns}
        <span hidden data-flow-edges>${escapeHtml(JSON.stringify(model.edges))}</span>
      </div>
    `;
  }

   function renderPlanningMaterialsToScheduleLegacy(result) {
  const groups =
    buildPlanningMaterialsToScheduleModel(
      result,
      {
        allocations:
          manualScheduleDraft?.allocations
          || [],

                transports:
          manualScheduleDraft?.transports
          || [],

        plannedReceipts:
          manualScheduleDraft?.plannedReceipts
          || draft.plannedReceipts
          || [],

        machines:
          productionCalendarMachines(
            result
          ),

        resolveConsumerLocationIds:
          material =>
            planningMaterialConsumerLocationIds(
              material
            ),

        ignoreStock:
          draft.planningMode
          === 'theoretical'
      }
       );


  const plannedReceiptsHtml =
    planningPlannedReceiptsHtml(
      manualScheduleDraft?.plannedReceipts
      || draft.plannedReceipts
      || []
    );


  if (!groups.length) {
    return `
      <p class="muted-text">
        Nenhum material pendente de produ&ccedil;&atilde;o.
      </p>

      ${plannedReceiptsHtml}
    `;
  }


            const transportCards =
  withScheduledPlanningTransportProgress(
    buildPlanningTransportCardsModel(
      result,
      groups
    )
  );


    const groupsHtml =
    groups
      .map(group => {

      const groupTransportCards =
        transportCards.filter(
          card =>
            Number(card.productionIndex)
            ===
            Number(group.productionIndex)
        );


      const groupMaterials =
        Array.isArray(group.materials)
          ? group.materials
          : [];


      /*
       * Longitudinal e Transversal
       * ficam empilhados.
       */
      const branchMaterials =
        groupMaterials
          .filter(material => {

            const key =
              planningProgramMaterialNameKey(
                material
              );

            return (
              key.includes('longitudinal')
              ||
              key.includes('transversal')
            );
          })
          .sort(
            comparePlanningMaterialCards
          );


      /*
       * Produto final = material escolhido
       * na Produção #N.
       */
      const finalMaterialId =
        String(
          draft.productions
            ?.[Number(group.productionIndex)]
            ?.materialId
          || ''
        );


      const finalMaterial =
        (
          finalMaterialId
            ? groupMaterials.find(
                material =>
                  String(
                    material?.materialId
                    || ''
                  )
                  === finalMaterialId
              )
            : null
        )
        ||
        (
          branchMaterials.length
            ? groupMaterials
                .filter(
                  material =>
                    !branchMaterials.includes(
                      material
                    )
                )
                .at(-1)
            : null
        );


      /*
       * Tudo antes do Long/Trans.
       * No nosso caso normalmente é a Bobina.
       *
       * Se a Bobina veio de estoque,
       * esta lista fica vazia.
       */
      const sourceMaterials =
        branchMaterials.length
          ? groupMaterials.filter(
              material =>
                !branchMaterials.includes(
                  material
                )
                &&
                material !== finalMaterial
            )
          : [];


      const hasStructuredFlow =
        branchMaterials.length > 0
        &&
        Boolean(finalMaterial);


            /*
       * Qualquer cadeia que não seja o fluxo ramificado
       * Longitudinal / Transversal usa agora o MESMO
       * padrão visual estruturado.
       *
       * Exemplos:
       *
       * Bobina -> Transporte -> Reto
       * Bobina -> Transporte -> Vareta
       * Bobina
       * Vareta
       * Etapa A -> Etapa B -> Produto
       *
       * Não existe mais o layout antigo de cards
       * esticados em 100% da tela.
       */
      if (!hasStructuredFlow) {

        const hasTransportStage =
          groupTransportCards.length > 0;


        return `
          <section
            class="
              planning-materials-program-group
              planning-materials-program-group--flow
            "
            style="${productionThemeStyle(
              group.productionIndex,
              group.color
            )}"
          >

            <h3>
              ${escapeHtml(group.title)}
            </h3>


            ${
              /*
               * Se existir transporte, usamos exatamente
               * o mesmo cabeçalho MATRIZ / FEITAL
               * utilizado no fluxo da malha.
               */
              hasTransportStage

                ? planningStructuredFlowSectorHeaderHtml(
                    {
                      materialsToSchedule:
                        groupMaterials,

                      transportCards:
                        groupTransportCards,

                      result
                    }
                  )

                : planningSharedInputBalancesHtml(
                    groupMaterials
                  )
            }


            <div
              class="
                planning-materials-program-flow
                planning-materials-program-flow--linear

                ${
                  hasTransportStage
                    ? 'has-transport-stage'
                    : 'without-transport-stage'
                }
              "
            >

              ${planningLinearProgramFlowHtml({
                materials:
                  groupMaterials,

                transportCards:
                  groupTransportCards
              })}

            </div>

          </section>
        `;
      }


      const hasSourceStage =
        sourceMaterials.length > 0;

        const hasTransportStage =
  groupTransportCards.length > 0;


      return `
        <section
          class="
            planning-materials-program-group
            planning-materials-program-group--flow
          "
          style="${productionThemeStyle(
            group.productionIndex,
            group.color
          )}"
        >

                    <h3>
            ${escapeHtml(group.title)}
          </h3>

                    ${
            hasTransportStage

              ? planningStructuredFlowSectorHeaderHtml(
                  {
                    materialsToSchedule:
                      groupMaterials,

                    transportCards:
                      groupTransportCards,

                    result
                  }
                )

              : planningSharedInputBalancesHtml(
                  groupMaterials
                )
          }


          <div
  class="
    planning-materials-program-flow

    ${
      hasSourceStage
        ? 'has-source-stage'
        : 'without-source-stage'
    }

    ${
      hasTransportStage
        ? 'has-transport-stage'
        : 'without-transport-stage'
    }
  "
>

            ${
  hasSourceStage
    ? `
      <div
        class="
          planning-program-stage
          planning-program-stage--source
        "
      >

        ${sourceMaterials
          .map(
            planningProgramMaterialCardHtml
          )
          .join('')}

      </div>
    `
    : ''
}


${
  hasTransportStage

    ? `
      <div
        class="
          planning-program-connector
          planning-program-connector--transport
          has-transport
        "
      >

        <span
          class="planning-program-connector-line"
          aria-hidden="true"
        ></span>

        <div class="planning-program-transport-stack">

          ${groupTransportCards
            .map(
              planningTransportProgramCardHtml
            )
            .join('')}

        </div>

        <span
          class="planning-program-connector-arrow"
          aria-hidden="true"
        ></span>

      </div>
    `

    : (
        hasSourceStage

          ? `
            <div
              class="
                planning-program-connector
                planning-program-connector--plain
              "
              aria-hidden="true"
            >
              <span
                class="planning-program-connector-line"
              ></span>

              <span
                class="planning-program-connector-arrow"
              ></span>
            </div>
          `

          : ''
      )
}

                          <!-- LONGITUDINAL / TRANSVERSAL -->
            <div
              class="
                planning-program-stage
                planning-program-stage--parallel
              "
            >

              ${branchMaterials
                .map(
                  planningProgramMaterialCardHtml
                )
                .join('')}

            </div>


            <!-- SETA PARA PRODUTO FINAL -->
            <div
              class="
                planning-program-connector
                planning-program-connector--plain
              "
              aria-hidden="true"
            >

              <span
                class="planning-program-connector-line"
              ></span>

              <span
                class="planning-program-connector-arrow"
              ></span>

            </div>


            <!-- EQ45 / PRODUTO FINAL -->
            <div
              class="
                planning-program-stage
                planning-program-stage--final
              "
            >

              ${planningProgramMaterialCardHtml(
                finalMaterial
              )}

            </div>

          </div>

        </section>
      `;
          })
      .join('');


  return `
    ${groupsHtml}

    ${plannedReceiptsHtml}
  `;
}

  function renderPlanningMaterialsToSchedule(result) {
    const model = buildPlanningConsolidatedProgramFlowModel(result);
    const plannedReceiptsHtml = planningPlannedReceiptsHtml(manualScheduleDraft?.plannedReceipts || draft.plannedReceipts || []);
    if (!model.materialNodes.length) return `<p class="muted-text">Nenhum material pendente de produ&ccedil;&atilde;o.</p>${plannedReceiptsHtml}`;
    return `${planningGlobalProgramStockHeaderHtml(model.groups, model.transportCards, result)}${renderPlanningConsolidatedProgramFlow(result)}${plannedReceiptsHtml}`;
  }

  function planningMaterialToScheduleByOperationId(
    operationId,
    {
      asOfDate = null,
      targetMachineId = null
    } = {}
  ) {
    const groups =
      buildPlanningMaterialsToScheduleModel(
        currentSimulation || {},
        {
          allocations:
            manualScheduleDraft
              ?.allocations
            || [],

                    transports:
            manualScheduleDraft
              ?.transports
            || [],

          plannedReceipts:
            manualScheduleDraft
              ?.plannedReceipts
            || draft.plannedReceipts
            || [],

          machines:
            productionCalendarMachines(
              currentSimulation || {}
            ),

          asOfDate,

                    resolveConsumerLocationIds:
            material =>
              planningMaterialConsumerLocationIds(
                material,
                {
                  targetMachineId
                }
              ),

          ignoreStock:
            draft.planningMode
            === 'theoretical'
        }
            );


                const transportCards =
      withScheduledPlanningTransportProgress(
        buildPlanningTransportCardsModel(
          currentSimulation || {},
          groups
        )
      );


    return groups.flatMap(group => group.materials.map(material => ({
      ...material,
      productionId: group.productionId,
      productionIndex: group.productionIndex,
      productionTitle: group.title,
      productionColor: group.color
    }))).find(material => String(material.operationId) === String(operationId)) || null;
  }

  function planningMaterialToScheduleByOperationIds(operationIds = [], options = {}) {
    const ids = new Set((Array.isArray(operationIds) ? operationIds : String(operationIds || '').split(',')).map(id => String(id || '').trim()).filter(Boolean));
    if (!ids.size) return null;
    const groups = buildPlanningMaterialsToScheduleModel(currentSimulation || {}, { allocations: manualScheduleDraft?.allocations || [], transports: manualScheduleDraft?.transports || [], plannedReceipts: manualScheduleDraft?.plannedReceipts || draft.plannedReceipts || [], machines: productionCalendarMachines(currentSimulation || {}), asOfDate: options.asOfDate || null, resolveConsumerLocationIds: material => planningMaterialConsumerLocationIds(material, { targetMachineId: options.targetMachineId || null }), ignoreStock: draft.planningMode === 'theoretical' });
    const members = groups.flatMap(group => (group.materials || []).map(material => ({ ...material, productionId: group.productionId, productionIndex: group.productionIndex, productionTitle: group.title, productionColor: group.color }))).filter(material => ids.has(String(material.operationId)));
    return planningConsolidatedProgramMaterial(members);
  }

  function planningConsolidatedTransportCardByKey(sharedTransportKey) {
    return buildPlanningConsolidatedProgramFlowModel(currentSimulation || {}).transportCards.find(card => card.transportKey === sharedTransportKey) || null;
  }

      function planningMaterialStrictProductivityRows(material = {}) {
    const normalizeIdentity = value =>
      normalizeText(value)
        .toLocaleLowerCase('pt-BR')
        .trim();

    const primaryCodesFor = source => [
      source?.code,
      source?.materialCode,
      source?.material_code
    ]
      .map(normalizeIdentity)
      .filter(Boolean);

    const directMaterialId = String(
      material?.materialId
      ?? material?.material_id
      ?? material?.id
      ?? ''
    ).trim();

    const materialName = normalizeIdentity(
      material?.materialName
      || material?.material_name
      || material?.name
    );

    const directPrimaryCodes = new Set(
      primaryCodesFor(material)
    );

    /*
     * MATRIZ ESTRITA:
     *
     * 1. ID exato do material do card.
     * 2. Nome exato.
     * 3. Código PRIMÁRIO como fallback.
     *
     * NÃO usamos codes/materialCodes relacionados,
     * porque eles podem representar materiais da cadeia
     * e trazer máquinas de etapas sucessoras.
     */
    const catalogMaterial =
      (materials || []).find(candidate => (
        directMaterialId
        && String(
          candidate?.id
          ?? candidate?.materialId
          ?? candidate?.material_id
          ?? ''
        ).trim() === directMaterialId
      ))

      || (materials || []).find(candidate => (
        materialName
        && normalizeIdentity(
          candidate?.name
          || candidate?.materialName
          || candidate?.material_name
        ) === materialName
      ))

      || (materials || []).find(candidate => (
        primaryCodesFor(candidate)
          .some(code =>
            directPrimaryCodes.has(code)
          )
      ))

      || null;

    const exactIds = new Set([
      directMaterialId,
      catalogMaterial?.id,
      catalogMaterial?.materialId,
      catalogMaterial?.material_id
    ]
      .map(value => String(value ?? '').trim())
      .filter(Boolean));

    const primaryCodes = new Set([
      ...primaryCodesFor(material),
      ...primaryCodesFor(catalogMaterial)
    ]);

    const exactName = normalizeIdentity(
      catalogMaterial?.name
      || catalogMaterial?.materialName
      || catalogMaterial?.material_name
      || material?.materialName
      || material?.material_name
      || material?.name
    );

    const unitKey = normalizeIdentity(
      material?.unit
      || material?.plannedUnit
    ).replace(/\s+/g, '');

    const activeRows =
      (Array.isArray(matrix) ? matrix : [])
        .filter(row => {
          if (row?.active === false) return false;

          const rowUnit = normalizeIdentity(
            row?.output_unit
            ?? row?.outputUnit
          ).replace(/\s+/g, '');

          return (
            !unitKey
            || !rowUnit
            || rowUnit === unitKey
          );
        });

    /*
     * Primeiro: ID EXATO.
     */
    const byId = activeRows.filter(row => {
      const rowId = String(
        row?.material_id
        ?? row?.materialId
        ?? ''
      ).trim();

      return (
        rowId
        && exactIds.has(rowId)
      );
    });

    if (byId.length) return byId;

    /*
     * Segundo: código PRIMÁRIO exato.
     * Não olha material_codes/codes relacionados.
     */
    const byPrimaryCode =
      activeRows.filter(row =>
        primaryCodesFor(row)
          .some(code =>
            primaryCodes.has(code)
          )
      );

    if (byPrimaryCode.length) {
      return byPrimaryCode;
    }

    /*
     * Último fallback: nome EXATO.
     */
    return activeRows.filter(row => (
      exactName
      && normalizeIdentity(
        row?.material_name
        ?? row?.materialName
      ) === exactName
    ));
  }

     function planningMatrixMachineKeys(
    source = {},
    { allowGeneric = false } = {}
  ) {
    const values = [
      source?.machineId,
      source?.machine_id,
      source?.machineName,
      source?.machine_name,

      ...(allowGeneric
        ? [
            source?.id,
            source?.name
          ]
        : [])
    ];

    return [...new Set(
      values
        .map(value =>
          normalizeText(value)
            .replace(/[\s-]+/g, '')
        )
        .filter(Boolean)
    )];
  }

  function compatiblePlanningMachinesForMaterial(
    material = {}
  ) {
    const snapshot =
      currentProductionCalendarSnapshot();

    const rows =
      planningMaterialStrictProductivityRows(
        material
      );

    /*
     * IMPORTANTE:
     * para uma linha da Matriz usamos SOMENTE
     * machine_id / machine_name.
     *
     * Não usamos o "id" genérico da linha.
     */
    const rowMachineKeys =
      new Set(
        rows.flatMap(row =>
          planningMatrixMachineKeys(row)
        )
      );

    return (snapshot?.machines || [])
      .filter(machine =>
        planningMatrixMachineKeys(
          machine,
          { allowGeneric: true }
        )
          .some(key =>
            rowMachineKeys.has(key)
          )
      );
  }

    function planningResolvedMachineLocationId(
    machine = {}
  ) {
    const direct =
      planningMachineLocationId(
        machine
      );

    if (direct) {
      return direct;
    }

    /*
     * Se o adapter do Gantt tiver removido
     * dados extras da máquina, voltamos
     * ao cadastro original de /machines.
     */
    const machineKeys =
      new Set(
        planningMatrixMachineKeys(
          machine,
          {
            allowGeneric: true
          }
        )
      );

    const registered =
      (
        registeredMachines || []
      ).find(candidate => (
        planningMatrixMachineKeys(
          candidate,
          {
            allowGeneric: true
          }
        )
          .some(key =>
            machineKeys.has(key)
          )
      ));

    return planningMachineLocationId(
      registered
    );
  }


  function planningMaterialConsumerLocationIds(
    material = {},
    {
      targetMachineId = null
    } = {}
  ) {
    /*
     * Modal de drop:
     * sabemos exatamente a máquina.
     */
    const candidates =
      targetMachineId

        ? productionCalendarMachines(
            currentSimulation || {}
          ).filter(machine => {
            const machineKeys =
              planningMatrixMachineKeys(
                machine,
                {
                  allowGeneric: true
                }
              );

            const targetKeys =
              planningMatrixMachineKeys(
                {
                  machineId:
                    targetMachineId
                },
                {
                  allowGeneric: true
                }
              );

            return machineKeys
              .some(key =>
                targetKeys.includes(key)
              );
          })

        /*
         * Card geral:
         * olha todas as máquinas estritamente
         * compatíveis da Matriz.
         */
        : compatiblePlanningMachinesForMaterial(
            material
          );

    return [
      ...new Set(
        candidates
          .map(
            planningResolvedMachineLocationId
          )
          .filter(Boolean)
      )
    ];
  }

  function planningMaterialProductivityConfigurations(
    material = {},
    machine = {}
  ) {
    const rows =
      planningMaterialStrictProductivityRows(
        material
      );

    const machineKeys =
      planningMatrixMachineKeys(
        machine,
        { allowGeneric: true }
      );

    const machineRows =
      rows.filter(row =>
        planningMatrixMachineKeys(row)
          .some(key =>
            machineKeys.includes(key)
          )
      );

    const byPeople = new Map();

    machineRows.forEach(row => {
      const people =
        Number(
          row.people_count
          ?? row.peopleCount
        );

      if (
        !Number.isInteger(people)
        || people < 1
      ) {
        return;
      }

      const current =
        byPeople.get(people);

      const priority =
        Number(
          row.machine_priority
          ?? row.machinePriority
          ?? Number.MAX_SAFE_INTEGER
        );

      const currentPriority =
        Number(
          current?.machine_priority
          ?? current?.machinePriority
          ?? Number.MAX_SAFE_INTEGER
        );

      const output =
        Number(
          row.output_qty
          ?? row.outputQty
          ?? 0
        );

      const currentOutput =
        Number(
          current?.output_qty
          ?? current?.outputQty
          ?? 0
        );

      if (
        !current
        || priority < currentPriority
        || (
          priority === currentPriority
          && output > currentOutput
        )
      ) {
        byPeople.set(
          people,
          row
        );
      }
    });

    return [...byPeople.entries()]
      .map(([people, row]) => {
        const config =
          resolveProductivityConfiguration({
            productivityRows: machineRows,
            machine,
            peopleCount: people,

            productivityLineId:
              row.id
              ?? row.productivityLineId
              ?? row.productivity_line_id
              ?? null
          })
          || row;

        const capacity =
          calculateProductivityDailyCapacity(
            config,
            planningDraftDailyMinutes()
              || undefined
          );

        return {
          people,
          row: config,

          capacityMax:
            Number(
              capacity.capacityPerDay
              || 0
            ),

          priority:
            Number(
              config.machine_priority
              ?? config.machinePriority
              ?? Number.MAX_SAFE_INTEGER
            )
        };
      })

      .filter(config =>
        config.capacityMax > 0
      )

      .sort(
        (left, right) =>
          left.priority
            - right.priority

          || right.capacityMax
            - left.capacityMax

          || right.people
            - left.people
      );
  }

  function refreshPlanningMaterialsToSchedule() {
    const materialsTarget = target.querySelector('.planning-materials-program-target');
    if (!materialsTarget || !currentSimulation) return;
    renderProductionFlowDom(materialsTarget, renderPlanningMaterialsToSchedule(currentSimulation), {
      root: page,
      requestAnimationFrame,
      productionTheme
    });
    bindPlanningMaterialsToScheduleDrag(materialsTarget);
  }

    function planningMachineDayCapacityUsage({
    date,
    machineId,
    excludeAllocationId = null
  } = {}) {
    const targetDate =
      String(date || '').slice(0, 10);

    const targetMachine =
      String(machineId || '');

    return (
      Array.isArray(
        manualScheduleDraft?.allocations
      )
        ? manualScheduleDraft.allocations
        : []
    )
      .filter(allocation => (
        String(
          allocation?.date || ''
        ).slice(0, 10) === targetDate

        && String(
          allocation?.machineId || ''
        ) === targetMachine

        && (
          !excludeAllocationId
          || String(
            allocation?.allocationId || ''
          ) !== String(excludeAllocationId)
        )
      ))
      .reduce(
        (sum, allocation) =>
          sum
          + Math.max(
            Number(
              allocation?.capacityPercent || 0
            ),
            0
          ),
        0
      );
  }

  function planningCapacityPercentForQuantity(
  quantity,
  capacityMax
) {
  const safeQuantity =
    Number(quantity);

  const safeCapacityMax =
    Number(capacityMax);

  if (
    !(safeQuantity > 0)
    || !(safeCapacityMax > 0)
  ) {
    return 0;
  }

  const rawPercent =
    (
      safeQuantity
      / safeCapacityMax
    ) * 100;

  /*
   * Quantidade -> percentual:
   * arredonda para CIMA em 2 casas.
   *
   * Assim nunca registramos menos capacidade
   * do que a quantidade realmente produzida.
   */
  return Number(
    (
      Math.ceil(
        rawPercent * 100
        - 0.000000001
      ) / 100
    ).toFixed(2)
  );
}


function planningMaterialAllocationNumbers(
  config,
  percent,
  material = {},
  explicitQuantity = null
) {
  const capacityMax =
    Number(
      config?.capacityMax
      || 0
    );

  const safePercent =
    Number(percent);

  /*
   * Percentual -> quantidade:
   * SEMPRE para baixo.
   *
   * 8.490 * 63,23%
   * = 5.368,227
   * = 5.368 unidades
   */
  const calculatedQuantity =
    Number.isFinite(safePercent)
    && capacityMax > 0

      ? Math.floor(
          (capacityMax * safePercent) / 100
          + Number.EPSILON
            * Math.max(1, capacityMax)
            * 8
        )

      : 0;

  const explicit =
    explicitQuantity === null
    || explicitQuantity === undefined
    || explicitQuantity === ''

      ? null

      : Number(
          explicitQuantity
        );

  const quantity =
    explicit !== null
    && Number.isFinite(explicit)

      ? Number(
          explicit.toFixed(6)
        )

      : calculatedQuantity;

  const remaining =
    Number(
      material?.remainingQty
      || 0
    );

  const permitted =
    Math.max(
      0,
      Number(
        material?.permittedQty
        ?? remaining
      )
    );

  const allowed =
    Math.min(
      remaining,
      permitted
    );

  const dailyMinutes =
    planningDraftDailyMinutes()
    || 0;

  const totalMinutes =
    Number.isFinite(safePercent)
    && dailyMinutes > 0

      ? Math.round(
          (
            dailyMinutes
            * safePercent
          ) / 100
        )

      : 0;

  return {
    capacityMax,
    quantity,
    remaining,
    permitted,
    allowed,
    totalMinutes,

    extraPercent:
      Math.max(
        0,
        safePercent - 100
      ),

    extraQty:
      Math.max(
        0,
        Number(
          (
            quantity
            - capacityMax
          ).toFixed(6)
        )
      ),

    extraMinutes:
      Math.max(
        0,
        totalMinutes
        - dailyMinutes
      ),

    overCapacity:
      safePercent > 100,

    exceedsRemaining:
      remaining > 0
      &&
      quantity
        > remaining + 0.000001,

    exceedsPermitted:
      permitted >= 0
      &&
      quantity
        > allowed + 0.000001
  };
}

  function openPlanningMaterialAllocationModal({ material, to } = {}) {
    const dateScopedMaterial =
    material?.isConsolidatedProgramMaterial === true || material?.operationIds?.length > 1
      ? planningMaterialToScheduleByOperationIds(
        material.operationIds,
        {
          asOfDate:
            to?.date,

          targetMachineId:
            to?.machineId
        }
      )
      : planningMaterialToScheduleByOperationId(
    material?.operationId,
    {
      asOfDate:
        to?.date,

      targetMachineId:
        to?.machineId
    }
  );

if (dateScopedMaterial) {
  material = dateScopedMaterial;
}

if (
  material?.showPermitted
  && !(Number(material?.permittedQty || 0) > 0)
) {
  toast(
    new Error(
      'Não há material disponível para produzir nesta data.'
    )
  );

  return Promise.resolve(null);
}
    const snapshot = currentProductionCalendarSnapshot();
    const machine = snapshot?.machines?.find(item => String(item.machineId) === String(to?.machineId)) || {
      machineId: to?.machineId,
      machineName: to?.machineName || to?.machineId
    };
    const configs = planningMaterialProductivityConfigurations(material, machine);
    if (!configs.length) {
      toast(new Error('Nenhuma configuração real da Matriz foi encontrada para este material e máquina.'));
      return Promise.resolve(null);
    }

        const usedCapacityPercent =
      planningMachineDayCapacityUsage({
        date: to?.date,
        machineId: machine.machineId
      });

    const availableCapacityPercent =
      Math.max(
        0,
        100 - usedCapacityPercent
      );

    if (
      !(availableCapacityPercent > 0.000001)
    ) {
      toast(
        new Error(
          'Esta máquina já está com 100% da capacidade utilizada nesta data.'
        )
      );

      return Promise.resolve(null);
    }

    const initialConfig = configs[0];
    const allowedQty = Math.min(
      Number(material?.remainingQty || 0),
      Math.max(0, Number(material?.permittedQty ?? material?.remainingQty ?? 0))
    );
        const maxQuantityByDayCapacity =
  initialConfig.capacityMax > 0

    ? Math.floor(
        (
          initialConfig.capacityMax
          * availableCapacityPercent
        ) / 100
        + Number.EPSILON
          * Math.max(
              1,
              initialConfig.capacityMax
            )
          * 8
      )

    : 0;


const initialQuantity =
  Math.min(
    allowedQty,
    maxQuantityByDayCapacity
  );


const initialPercent =
  planningCapacityPercentForQuantity(
    initialQuantity,
    initialConfig.capacityMax
  );
    page.querySelector('.planning-material-allocation-modal')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop planning-material-allocation-modal';
    backdrop.innerHTML = `
      <div class="modal planning-material-allocation-dialog" role="dialog" aria-modal="true" aria-labelledby="planning-material-allocation-title">
        <div class="modal-header">
          <div>
            <h3 id="planning-material-allocation-title">Programar material</h3>
            <p class="modal-subtitle">${escapeHtml(material?.materialName || 'Material')} | ${escapeHtml(machine.machineName || machine.machineId || '')} | ${escapeHtml(formatDateOnly(to?.date))}</p>
          </div>
          <button class="link-button" type="button" data-manual-allocation-cancel>Fechar</button>
        </div>
        <form class="planning-material-allocation-form">
          <div class="planning-material-allocation-summary">
            <span>Restante: <strong>${formatPtBrDecimal(material?.remainingQty || 0)} ${escapeHtml(material?.unit || '')}</strong></span>
            <span>Permitido: <strong>${formatPtBrDecimal(allowedQty)} ${escapeHtml(material?.unit || '')}</strong></span>
            <span data-allocation-capacity-summary></span>
          </div>
          <label class="field">
            <span>Pessoas</span>
            <select name="peopleCount" ${configs.length === 1 ? 'disabled' : ''}>
              ${configs.map(config => `<option value="${config.people}">${config.people}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Capacidade do dia (%)</span>
            <input name="capacityPercent" type="number" min="0.01" max="${availableCapacityPercent.toFixed(2)}" step="0.01" inputmode="decimal" value="${initialPercent.toFixed(2)}">
          </label>
              <label class="field">
  <span>
    Quantidade a produzir (${escapeHtml(material?.unit || '')})
  </span>

  <input
    name="quantity"
    type="number"
    min="0.000001"
    max="${Math.max(allowedQty, 0)}"
    step="any"
    inputmode="decimal"
    value="${initialQuantity}"
  >
</label>
          <div class="planning-material-allocation-result" data-allocation-result></div>
          <div class="planning-material-allocation-alert" data-allocation-alert hidden></div>
          <p class="form-error" data-allocation-error hidden></p>
          <div class="form-actions modal-actions">
            <button class="secondary-button" type="button" data-manual-allocation-cancel>Cancelar</button>
            <button class="primary-button" type="submit" data-manual-allocation-confirm>Confirmar</button>
          </div>
        </form>
      </div>
    `;
    return new Promise(resolve => {
      const form = backdrop.querySelector('.planning-material-allocation-form');
      const peopleInput =
  form.elements.peopleCount;

const percentInput =
  form.elements.capacityPercent;

const quantityInput =
  form.elements.quantity;
      const result = backdrop.querySelector('[data-allocation-result]');
      const alert = backdrop.querySelector('[data-allocation-alert]');
      const error = backdrop.querySelector('[data-allocation-error]');
      const confirmButton = backdrop.querySelector('[data-manual-allocation-confirm]');
      const capacitySummary = backdrop.querySelector('[data-allocation-capacity-summary]');
      const configByPeople = new Map(configs.map(config => [String(config.people), config]));
      const currentConfig = () => configByPeople.get(String(peopleInput.value)) || configs[0];
      const readPercent = () =>
  parsePtBrDecimal(
    percentInput.value
  );

const readQuantity = () =>
  parsePtBrDecimal(
    quantityInput.value
  );
      const close = value => {
        backdrop.remove();
        resolve(value);
      };
      const renderPreview = (
  explicitQuantity = null
) => {
  const config =
    currentConfig();

  const percent =
    readPercent();

  const numbers =
    planningMaterialAllocationNumbers(
      config,
      percent,
      material,
      explicitQuantity
    );
                capacitySummary.textContent =
          `Capacidade máxima: ${formatPtBrDecimal(
            numbers.capacityMax
          )} ${material?.unit || ''}`;


        const catalogMaterial =
          findMaterialById(
            materials,
            material?.materialId
          )
          || {};


        const primaryUnit =
          String(
            material?.unit
            || catalogMaterial?.primary_unit
            || ''
          ).trim();


        const secondaryUnit =
          String(
            catalogMaterial?.secondary_unit
            || ''
          ).trim();


        const secondaryFactor =
          Number(
            catalogMaterial
              ?.primary_to_secondary_factor
          );


        const hasSecondaryQuantity =
          Boolean(primaryUnit)
          &&
          Boolean(secondaryUnit)
          &&
          primaryUnit !== secondaryUnit
          &&
          Number.isFinite(
            secondaryFactor
          )
          &&
          secondaryFactor > 0;


        const primaryResultText =
          `${formatPtBrDecimal(
            numbers.quantity
          )} ${primaryUnit}`
          +
          ` / `
          +
          `${formatPtBrDecimal(
            numbers.capacityMax
          )} ${primaryUnit}`;


        const secondaryResultText =
          hasSecondaryQuantity

            ? (
                `${formatPtBrDecimal(
                  numbers.quantity
                  *
                  secondaryFactor
                )} ${secondaryUnit}`

                +

                ` / `

                +

                `${formatPtBrDecimal(
                  numbers.capacityMax
                  *
                  secondaryFactor
                )} ${secondaryUnit}`
              )

            : '';


        result.innerHTML = `
          <strong
            class="
              planning-material-allocation-result-primary
            "
          >
            ${escapeHtml(
              primaryResultText
            )}
          </strong>

          ${
            secondaryResultText
              ? `
                <small
                  class="
                    planning-material-allocation-result-secondary
                  "
                >
                  ${escapeHtml(
                    secondaryResultText
                  )}
                </small>
              `
              : ''
          }
        `;
        
                const exceedsDayCapacity =
          Number.isFinite(percent)
          && percent
            > availableCapacityPercent
              + 0.000001;

                const validationMessage =
          exceedsDayCapacity
            ? `A máquina possui somente ${formatPtBrDecimal(availableCapacityPercent)}% de capacidade disponível nesta data.`

            : numbers.exceedsPermitted
              ? 'Quantidade superior ao permitido pelos materiais disponíveis.'

              : numbers.exceedsRemaining
                ? 'Quantidade superior ao restante a programar.'

                : '';
        error.hidden = !validationMessage;
        error.textContent = validationMessage;
        percentInput.classList.toggle('is-invalid', Boolean(validationMessage));
        confirmButton.disabled = !(percent > 0) || Boolean(validationMessage);
        alert.hidden = !numbers.overCapacity;
        alert.innerHTML = numbers.overCapacity ? `
          <strong>Esta programação excede a capacidade normal do dia.</strong>
          <span>Excedente: ${formatPtBrDecimal(numbers.extraPercent)}% | ${formatPtBrDecimal(numbers.extraQty)} ${escapeHtml(material?.unit || '')}</span>
          <span>Tempo equivalente: ${escapeHtml(formatDuration(numbers.totalMinutes))} | excedente ${escapeHtml(formatDuration(numbers.extraMinutes))}</span>
        ` : '';
      };
      const syncQuantityFromPercent = () => {
  const numbers =
    planningMaterialAllocationNumbers(
      currentConfig(),
      readPercent(),
      material
    );

  quantityInput.value =
    String(
      numbers.quantity
    );

  renderPreview(
    numbers.quantity
  );
};


const syncPercentFromQuantity = () => {
  const config =
    currentConfig();

  const quantity =
    readQuantity();

  const percent =
    planningCapacityPercentForQuantity(
      quantity,
      config.capacityMax
    );

  percentInput.value =
    percent > 0
      ? percent.toFixed(2)
      : '';

  renderPreview(
    quantity
  );
};


peopleInput.value =
  String(initialConfig.people);

quantityInput.value =
  String(initialQuantity);

renderPreview(
  initialQuantity
);


peopleInput.addEventListener(
  'change',
  syncQuantityFromPercent
);

percentInput.addEventListener(
  'input',
  syncQuantityFromPercent
);

quantityInput.addEventListener(
  'input',
  syncPercentFromQuantity
);
      backdrop.querySelectorAll('[data-manual-allocation-cancel]').forEach(button => {
        button.addEventListener('click', () => close(null));
      });
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close(null);
      });
      backdrop.addEventListener('keydown', event => {
        if (event.key === 'Escape') close(null);
      });
            form.addEventListener('submit', event => {
        event.preventDefault();

       const config =
  currentConfig();

const percent =
  readPercent();

const quantity =
  readQuantity();

const numbers =
  planningMaterialAllocationNumbers(
    config,
    percent,
    material,
    quantity
  );

        const exceedsDayCapacity =
          Number.isFinite(percent)
          && percent
            > availableCapacityPercent
              + 0.000001;

        if (
  !(percent > 0)
  || !(quantity > 0)
  || exceedsDayCapacity
  || numbers.exceedsRemaining
  || numbers.exceedsPermitted
) {
  renderPreview(
    quantity
  );

  return;
}

        close({
          material,
          machine,
          date: to?.date,
          peopleCount: config.people,
          productivityLineId:
            config.row?.id
            ?? config.row?.productivityLineId
            ?? null,
          capacityPercent: percent,
          quantity: numbers.quantity,
          capacityMax: numbers.capacityMax
        });
      });
      page.appendChild(backdrop);
      percentInput.focus();
      percentInput.select?.();
    });
  }



    function planningTransportSourceAvailableQuantityAtDate(
    material = {},
    date = null
  ) {
    const normalizedDate =
      isValidDateOnly(date)
        ? String(date).slice(0, 10)
        : null;

    if (!normalizedDate) {
      return 0;
    }

    const availability =
      buildPlanningLocalStockAvailability({
        result:
          currentSimulation || {},

        allocations:
          manualScheduleDraft?.allocations
          || [],

        transports:
          manualScheduleDraft?.transports
          || [],

        plannedReceipts:
          manualScheduleDraft?.plannedReceipts
          || draft.plannedReceipts
          || [],

        machines:
          productionCalendarMachines(
            currentSimulation || {}
          ),

        asOfDate:
          normalizedDate
      });

    return Math.max(
      planningLocalStockQuantity(
        availability
          .transportAvailableByMaterialLocation,

        material?.materialId,

        material?.sourceLocation
      ),
      0
    );
  }


  function openPlanningTransportAllocationModal({
  material = {},
  to = {}
} = {}) {
    const startDate =
    isValidDateOnly(to?.date)
      ? String(to.date).slice(0, 10)
      : today();

  const suggestedQuantityRaw =
    Math.max(
      Number(
        material?.suggestedQty
        ?? material?.availableQty
        ?? 0
      ),
      0
    );

  const suggestedQuantity =
    planningTransportDisplayTargetQuantity(
      suggestedQuantityRaw
    );

    let maximumQuantity =
    planningTransportSourceAvailableQuantityAtDate(
      material,
      startDate
    );

  const initialQuantity =
    Math.min(
      suggestedQuantity > 0
        ? suggestedQuantity
        : maximumQuantity,
      maximumQuantity
    );

  page
    .querySelector(
      '.planning-transport-allocation-modal'
    )
    ?.remove();

  const backdrop =
    document.createElement('div');

  backdrop.className =
    'modal-backdrop planning-transport-allocation-modal';

  backdrop.innerHTML = `
    <div
      class="modal planning-transport-allocation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planning-transport-allocation-title"
    >
      <div class="modal-header">
        <div>
          <h3 id="planning-transport-allocation-title">
            Programar transporte
          </h3>

          <p class="modal-subtitle">
            ${escapeHtml(material.materialName || 'Material')}
            &middot;
            ${escapeHtml(
              material.sourceLocationName
              || material.sourceLocation
              || ''
            )}
            &rarr;
            ${escapeHtml(
              material.targetLocationName
              || material.targetLocation
              || ''
            )}
          </p>
        </div>

        <button
          class="link-button"
          type="button"
          data-transport-allocation-cancel
        >
          Fechar
        </button>
      </div>

      <form class="planning-transport-allocation-form">

        <div class="planning-transport-allocation-summary">

          <div>
            <span>Origem</span>
            <strong>
              ${escapeHtml(
                material.sourceLocationName
                || material.sourceLocation
                || '-'
              )}
            </strong>
          </div>

          <div>
            <span>Destino</span>
            <strong>
              ${escapeHtml(
                material.targetLocationName
                || material.targetLocation
                || '-'
              )}
            </strong>
          </div>

                                       <div>
            <span>Saldo na origem</span>

            <strong data-transport-source-balance>
              ${formatPtBrDecimal(maximumQuantity)}
              ${escapeHtml(material.unit || '')}
            </strong>
          </div>

          <div>
            <span>Disponível para transporte</span>
            <strong>
              ${formatPtBrDecimal(suggestedQuantity)}
              ${escapeHtml(material.unit || '')}
            </strong>
          </div>

        </div>

        <label class="field">
          <span>Quantidade</span>

          <input
            name="quantity"
            type="text"
            inputmode="decimal"
                        value="${escapeHtml(
              String(initialQuantity)
            )}"
            autocomplete="off"
            required
          />
        </label>

        <div class="planning-transport-allocation-dates">

          <label class="field">
            <span>Data inicial</span>

            <input
              name="startDate"
              type="date"
              value="${escapeHtml(startDate)}"
              required
            />
          </label>

          <label class="field">
            <span>Data final</span>

            <input
              name="endDate"
              type="date"
              value="${escapeHtml(startDate)}"
              required
            />
          </label>

        </div>

        <p
          class="form-error"
          data-transport-allocation-error
          hidden
        ></p>

        <div class="form-actions modal-actions">

          <button
            class="secondary-button"
            type="button"
            data-transport-allocation-cancel
          >
            Cancelar
          </button>

          <button
            class="primary-button"
            type="submit"
          >
            Programar transporte
          </button>

        </div>

      </form>
    </div>
  `;

  return new Promise(resolve => {
    const form =
      backdrop.querySelector(
        '.planning-transport-allocation-form'
      );

    const quantityInput =
      form.elements.quantity;

    const startInput =
      form.elements.startDate;

    const endInput =
      form.elements.endDate;

        const error =
      backdrop.querySelector(
        '[data-transport-allocation-error]'
      );


    const sourceBalanceTarget =
      backdrop.querySelector(
        '[data-transport-source-balance]'
      );


    const refreshTransportSourceBalance =
      () => {

        const selectedDate =
          String(
            startInput.value
            || ''
          ).slice(0, 10);


        maximumQuantity =
          planningTransportSourceAvailableQuantityAtDate(
            material,
            selectedDate
          );


        if (sourceBalanceTarget) {
          sourceBalanceTarget.innerHTML =
            `${
              formatPtBrDecimal(
                maximumQuantity
              )
            } ${
              escapeHtml(
                material.unit || ''
              )
            }`;
        }


        const currentQuantity =
          parsePlanningTransportQuantity(
            quantityInput.value,
            NaN
          );


        /*
         * Se mudou para uma data com menos
         * saldo, não deixa o campo continuar
         * acima do máximo daquela data.
         */
        if (
          !Number.isFinite(
            currentQuantity
          )
          ||
          currentQuantity
            > maximumQuantity
        ) {
          quantityInput.value =
            String(
              Math.min(
                suggestedQuantity > 0
                  ? suggestedQuantity
                  : maximumQuantity,

                maximumQuantity
              )
            );
        }
      };


    const close =
      value => {
        backdrop.remove();
        resolve(value);
      };

    const showError =
      message => {
        error.textContent =
          String(message || '');

        error.hidden =
          !message;
      };

    backdrop
      .querySelectorAll(
        '[data-transport-allocation-cancel]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => close(null)
        );
      });

    backdrop.addEventListener(
      'click',
      event => {
        if (event.target === backdrop) {
          close(null);
        }
      }
    );

    backdrop.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Escape') {
          close(null);
        }
      }
    );

       startInput.addEventListener(
      'change',
      () => {

        if (
          isValidDateOnly(
            startInput.value
          )
          &&
          (
            !isValidDateOnly(
              endInput.value
            )
            ||
            endInput.value
              < startInput.value
          )
        ) {
          endInput.value =
            startInput.value;
        }


        refreshTransportSourceBalance();
      }
    );

    form.addEventListener(
      'submit',
      event => {
        event.preventDefault();

                const quantity =
          parsePlanningTransportQuantity(
            quantityInput.value,
            NaN
          );

        const startDateValue =
          String(
            startInput.value
            || ''
          ).slice(0, 10);

        const endDateValue =
          String(
            endInput.value
            || ''
          ).slice(0, 10);

        if (
          !Number.isFinite(quantity)
          ||
          !(quantity > 0)
        ) {
          showError(
            'Informe uma quantidade válida para o transporte.'
          );
          return;
        }

        if (
          quantity
          > maximumQuantity
            + 0.000001
        ) {
          showError(
            'A quantidade é maior que o saldo disponível para transporte.'
          );
          return;
        }

        if (
          !isValidDateOnly(
            startDateValue
          )
          ||
          !isValidDateOnly(
            endDateValue
          )
        ) {
          showError(
            'Informe datas válidas para o transporte.'
          );
          return;
        }

        if (
          endDateValue
          < startDateValue
        ) {
          showError(
            'A data final não pode ser anterior à data inicial.'
          );
          return;
        }

        close({
          quantity,
          startDate:
            startDateValue,
          endDate:
            endDateValue
        });
      }
    );

    page.appendChild(
      backdrop
    );

    quantityInput.focus();
    quantityInput.select?.();
  });
}

  function createPlanningConsolidatedAllocationCandidate(baseDraft, configuration, snapshot, timestamp) {
    const material = configuration.material;
    const allocate = (draftValue, member, quantity, capacityPercent) => createManualScheduleAllocation(draftValue, { material: member, date: configuration.date, machineId: configuration.machine.machineId, peopleCount: configuration.peopleCount, capacityPercent, quantity, machines: snapshot.machines, matrixRows: planningMaterialStrictProductivityRows(member), days: snapshot.days, dailyMinutes: planningDraftDailyMinutes(), now: timestamp });
    if (!material?.isConsolidatedProgramMaterial || (material.members || []).length <= 1) return allocate(baseDraft, material, configuration.quantity, configuration.capacityPercent);
    let candidateDraft = baseDraft; let remaining = Number(configuration.quantity || 0);
    [...material.members].sort((a, b) => Number(a.productionIndex || 0) - Number(b.productionIndex || 0) || Number(a.sequence || 0) - Number(b.sequence || 0)).forEach(member => {
      const current = planningMaterialToScheduleByOperationId(member.operationId, { asOfDate: configuration.date, targetMachineId: configuration.machine.machineId });
      const allowed = Math.max(0, current?.showPermitted ? Math.min(Number(current.remainingQty || 0), Number(current.permittedQty || 0)) : Number(current?.remainingQty || 0));
      const quantity = Math.min(remaining, allowed);
      if (!(quantity > 0)) return;
      candidateDraft = allocate(candidateDraft, current, quantity, Number(configuration.capacityPercent || 0) * (quantity / Number(configuration.quantity || 1)));
      remaining -= quantity;
    });
    if (remaining > 0.000001) throw new Error('Não foi possível distribuir toda a quantidade entre as produções compartilhadas.');
    return candidateDraft;
  }

  async function handlePlanningMaterialDropPreview({ material, to } = {}) {
    if (
  material?.scheduleType
  === 'transport'
) {
  if (!manualScheduleDraft) {
    toast(
      new Error(
        'Rascunho manual indisponível para programar transporte.'
      )
    );

    return;
  }

  const configuration =
    await openPlanningTransportAllocationModal({
      material,
      to
    });

  if (!configuration) {
    return;
  }

  const previousManualState =
    cloneDraftPlanningState();

  try {
    setOperationLoading(
      true,
      'Programando transporte...'
    );

    const snapshot =
      currentProductionCalendarSnapshot();

    const candidateDraft =
      createManualScheduleTransport(
        manualScheduleDraft,
        {
          transport: {
            scheduleType:
              'transport',

            materialId:
              material.materialId,

            materialCode:
              material.materialCode,

            materialName:
              material.materialName,

                        quantity:
  configuration.quantity,

/*
 * Guarda o total originalmente necessário.
 * Usado para:
 *
 * transportado / total
 *
 * e para os estados PARCIAL / TOTAL.
 *
 * No transporte, a referência visual deve
 * ser arredondada para cima.
 */
totalQuantity:
  planningTransportDisplayTargetQuantity(
    Math.max(
      Number(material?.totalQty ?? material?.requiredQty ?? material?.availableQty ?? 0),
      Number(configuration.quantity || 0)
    )
  ),

requiredQuantity:
  planningTransportDisplayTargetQuantity(
    Math.max(
      Number(material?.totalQty ?? material?.requiredQty ?? material?.availableQty ?? 0),
      Number(configuration.quantity || 0)
    )
  ),

transportKey:
  String(
    material?.transportKey
    || ''
  ),

unit:
  material.unit,

            sourceLocation:
              material.sourceLocation,

            sourceLocationName:
              material.sourceLocationName,

            targetLocation:
              material.targetLocation,

            targetLocationName:
              material.targetLocationName,

                        startDate:
              configuration.startDate,

            /*
             * O transporte pode usar a produção
             * realizada no próprio dia.
             *
             * Por isso consideramos a saída
             * no fim da data inicial.
             */
            startTime:
              '23:58',

            endDate:
              configuration.endDate,

            /*
             * Se terminar no mesmo dia:
             *   23:58 -> 23:59
             *
             * Se terminar em outro dia:
             *   chega no começo da data final.
             */
            endTime:
              configuration.endDate
                > configuration.startDate
                  ? '00:00'
                  : '23:59',

                        /*
             * Regra operacional do planejamento:
             * transporte programado no dia D
             * já libera o material no DESTINO
             * desde o início do próprio dia D.
             *
             * A saída física da origem continua
             * sendo validada no fim do dia, então
             * o transporte ainda pode usar produção
             * concluída no próprio dia.
             */
            availabilityMode:
              'day-start',

            productionId:
              material.productions?.[0]?.productionId
              ?? material.productionId,

            productionIndex:
              material.productions?.[0]?.index
              ?? material.productionIndex,

            productionTitle:
              material.productions?.[0]?.title
              ?? material.productionTitle,

            productionColor:
              material.productions?.[0]?.color
              ?? material.productionColor,

            productions:
              (Array.isArray(material?.productions) ? material.productions : []).map(item => ({
                productionId: item?.productionId || null,
                index: Number(item?.index ?? 0),
                title: item?.title || '',
                color: item?.color || null
              })),

            flowLinks:
              (Array.isArray(material?.flowLinks) ? material.flowLinks : []).map(link => ({
                productionIndex: Number(link?.productionIndex ?? 0),
                color: link?.color || null,
                producerParentOperationIds: [...(Array.isArray(link?.producerParentOperationIds) ? link.producerParentOperationIds : [])],
                consumerParentOperationIds: [...(Array.isArray(link?.consumerParentOperationIds) ? link.consumerParentOperationIds : [])]
              })),

            producerParentOperationIds:
              material.producerParentOperationIds
              || [],

            consumerParentOperationIds:
              material.consumerParentOperationIds
              || []
          },

                      availableQuantity:
            planningTransportSourceAvailableQuantityAtDate(
              material,
              configuration.startDate
            ),

          machines:
            snapshot?.machines
            || []
        }
      );

    manualScheduleDraft =
      candidateDraft;

    draft.manualScheduleDraft =
      manualScheduleDraft;

    recordAcceptedManualState(
      previousManualState
    );

    saveDraftNow();

    refreshPlanningMaterialsToSchedule();
    refreshTimelineOnly();

    toast(
      'Transporte programado no Gantt.'
    );

  } catch (error) {
    restoreDraftPlanningState(
      previousManualState
    );

    refreshPlanningMaterialsToSchedule();
    refreshTimelineOnly();

    toast(error);

  } finally {
    setOperationLoading(
      false
    );
  }

  return;
}
    if (!manualScheduleDraft) {
      toast(new Error('Rascunho manual indisponível para criar allocation.'));
      return;
    }
    const configuration = await openPlanningMaterialAllocationModal({ material, to });
    if (!configuration) return;
    const configuredMaterial =
  configuration.material || material;

const allowedQty = Math.min(
  Number(configuredMaterial?.remainingQty || 0),
  Math.max(
    0,
    Number(
      configuredMaterial?.permittedQty
      ?? configuredMaterial?.remainingQty
      ?? 0
    )
  )
);
    if (configuration.quantity > allowedQty + 0.000001) {
      toast(new Error('Quantidade superior ao permitido pelos materiais disponíveis.'));
      refreshPlanningMaterialsToSchedule();
      return;
    }
    const previousManualState = cloneDraftPlanningState();
    const timestamp = new Date().toISOString();
    try {
      setOperationLoading(true, 'Criando allocation manual...');
      const snapshot = currentProductionCalendarSnapshot();
      const candidateDraft = createPlanningConsolidatedAllocationCandidate(manualScheduleDraft, configuration, snapshot, timestamp);
      const validationTransaction = applyManualScheduleTransaction({
        currentDraft: candidateDraft,
        intent: { type: 'VALIDATE_DRAFT' },
        draftContext: { validatedAt: timestamp },
        validationContext:
    currentManualScheduleValidationContext(
    snapshot,
    {
      allocations:
        candidateDraft.allocations,

      transports:
        candidateDraft.transports
        || []
    }
  )
      });
            if (!validationTransaction.accepted) {
        const blockingMessage =
          validationTransaction
            .blockingIssues?.[0]?.message

          || validationTransaction
            .validation?.errors?.[0]?.message

          || 'A allocation não passou pela validação do calendário.';

        throw new Error(blockingMessage);
      }

      manualScheduleDraft =
        validationTransaction.draft;
      const createdAllocationId = manualScheduleDraft?.lastManualAction?.allocationId;
      draft.manualScheduleDraft = manualScheduleDraft;
      recordAcceptedManualState(previousManualState);
      saveDraftNow();
      refreshTimelineOnly();
      if (createdAllocationId) {
  planningScheduleRendererHost?.focusAllocation?.(createdAllocationId, {
    inspectPanel: false,
    scrollToAllocation: false
  });
}
      toast('Allocation manual criada no rascunho.');
    } catch (error) {
      restoreDraftPlanningState(previousManualState);
      refreshTimelineOnly();
      toast(error);
    } finally {
      setOperationLoading(false);
    }
  }

  function bindPlanningMaterialsToScheduleDrag(targetElement) {
    if (!targetElement) return;
    targetElement.querySelectorAll('.planning-material-program-card.is-ready, .planning-material-program-card.is-partial').forEach(card => {
      card.draggable = true;
    });
    targetElement.querySelectorAll('.planning-material-program-card.is-blocked, .planning-material-program-card.is-completed').forEach(card => {
      card.draggable = false;
    });
  }

  function dispatchPlanningMaterialDragToGantt(type, detail = {}) {
    const calendar = planningScheduleRendererHost?.getRootElement?.()
      || target.querySelector('.gantt-aps');
    calendar?.dispatchEvent?.(new CustomEvent(`gantt-aps:planning-material-${type}`, {
      detail,
      bubbles: false
    }));
  }

  function timelineOperations(result) {
    return buildTimelineOperations(result);
  }

  function productionCalendarMachines(result) {
    const matrixMachines = buildPlanningProductivityMachineOptions(matrix);
    return selectProductionCalendarMachines({
      ...result,
      machineOptions: [
        ...(Array.isArray(result?.machineOptions) ? result.machineOptions : []),
        ...MANUAL_PLANNING_REQUIRED_MACHINES,
        ...matrixMachines
      ]
    }, registeredMachines);
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

  function currentProductionCalendarSnapshot() {
    if (!currentSimulation) return buildProductionCalendarSnapshot({ days: [], operations: [], calendarOperations: [] });
    return buildProductionCalendarSnapshot(currentSimulation, { stockAlerts: currentPlanningStockAlerts });
  }

  function currentManualScheduleValidationContext(snapshot = currentProductionCalendarSnapshot(), options = {}) {
    const summary = currentSimulation?.summary || {};

const manualMode =
  currentSimulation?.manualPlanningMode
  === MANUAL_PLANNING_MODE;

const validationSimulation = manualMode
  ? {
      ...currentSimulation,
           operations:
  buildManualPlanningValidationOperations(
    currentSimulation,

    options.allocations
      ?? manualScheduleDraft?.allocations
      ?? [],

    registeredMachines
  )    }
  : currentSimulation;

const localStock = manualMode
  ? (
      currentSimulation
        ?.manualPlanningLocalStockSnapshot
        ?.stock
      || []
    )
  : currentSimulation?.stock;

return buildManualScheduleValidationContext({
  simulation: validationSimulation,
      materials,
      machines: snapshot?.machines || [],
      productivityMatrix: matrix,
      stock: options.stock ?? localStock,
      stockMinimums: currentSimulation?.stockMinimums,
      stockLocations: Array.isArray(currentSimulation?.stockLocations) && currentSimulation.stockLocations.length
        ? currentSimulation.stockLocations
        : locations,
      dependencies:
  (
    manualMode
    || draft.planningMode === 'theoretical'
  )
    ? []
    : currentSimulation?.dependencies,
            transports:
        manualMode
          ? (
              options.transports
              ?? manualScheduleDraft?.transports
              ?? []
            )
          : currentSimulation?.transports,
      shifts: Array.isArray(summary.shifts) && summary.shifts.length ? summary.shifts : draft.shifts,
      dailyTeamOverrides: manualScheduleDraft?.dailyTeamOverrides ?? draft.dailyTeamOverrides ?? summary.dailyTeamOverrides ?? {},
      manualWorkDates: manualScheduleDraft?.manualWorkDates ?? summary.manualWorkDates ?? lastPayload?.manualWorkDates ?? [],
      setupMinutes: Number(summary.setupHours ?? lastPayload?.setupHours ?? 0) * 60,
      minimumStartRatio: 1,
      dependencyCompletionBufferMinutes: Number(currentSimulation?.dependencyCompletionBufferMinutes ?? 60),
      holidays: currentSimulation?.holidays || [],
      timezone: currentSimulation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      ignoreStock:
  draft.planningMode
  === 'theoretical'
    });
  }

    async function currentManualScheduleValidationContextWithFreshStock(
    snapshot = currentProductionCalendarSnapshot()
  ) {
    if (
      draft.planningMode
      === 'theoretical'
    ) {
      return currentManualScheduleValidationContext(
        snapshot
      );
    }

    if (
      currentSimulation?.manualPlanningMode
      === MANUAL_PLANNING_MODE
    ) {
      return currentManualScheduleValidationContext(
        snapshot
      );
    }

    try {
      const stockRows =
        await loadStockOverviewRows();

      const stock =
        manualScheduleStockFromOverviewRows(
          stockRows
        );

      if (stock.length) {
        return currentManualScheduleValidationContext(
          snapshot,
          { stock }
        );
      }
    } catch (error) {
      console.warn(
        'Nao foi possivel carregar estoque atualizado para validacao manual.',
        error
      );
    }

    return currentManualScheduleValidationContext(
      snapshot
    );
  }

   function analyzePlanningManualUnallocation(
    allocationId
  ) {
    if (!manualScheduleDraft) {
      throw new Error(
        'Rascunho manual indisponível para desalocação.'
      );
    }

    if (!currentSimulation) {
      throw new Error(
        'Simulação atual indisponível para desalocação.'
      );
    }

    const snapshot =
      currentProductionCalendarSnapshot();

    const timestamp =
      new Date().toISOString();

    return buildManualScheduleUnallocationPlan(
      manualScheduleDraft,
      {
        allocationId,

        operations:
          currentSimulation?.operations
          || [],

        machines:
          snapshot?.machines
          || [],

        now:
          timestamp,

        validateCandidate:
          candidateDraft => (
            applyManualScheduleTransaction({
              currentDraft:
                candidateDraft,

              intent: {
                type:
                  'VALIDATE_DRAFT'
              },

              draftContext: {
                validatedAt:
                  timestamp
              },

              validationContext:
               currentManualScheduleValidationContext(
  snapshot,
  {
    allocations:
      candidateDraft
        ?.allocations
      || [],

    transports:
      candidateDraft
        ?.transports
      || []
  }
)
            })
          )
      }
    );
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
      dailyTeamOverrides: {},
      preserveAllocationRows: true
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
    const confirmed = confirm('Descartar alterações manuais do calendário? Todos os arrastos, divisões, junções, alterações de equipe, liberações de dias e demais edições manuais serão removidos. O calendário voltará ao resultado original da simulação.');
    if (!confirmed) return;
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
   const allocation = (snapshot?.allocations || []).find(
  item =>
    String(item?.allocationId)
    ===
    String(intent.allocationId)
) || null;

if (!allocation) {
  throw new Error(
    'Este bloco foi atualizado pelo recalculo. Atualize a selecao e tente novamente.'
  );
}

if (
  isHistoricalPlanningAllocation(
    allocation
  )
) {
  throw new Error(
    `O planejamento ${
      allocation.planningCode
      ||
      ''
    } já foi lançado e está disponível somente para consulta.`.trim()
  );
}

const parentOperationId =
  productionCalendarParentOperationId(
    allocation
  );
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

    async function handleProductionCalendarUnallocationRequest(payload = {}) {
    const allocationId = String(
      payload?.allocationId
      || payload?.id
      || ''
    ).trim();

    if (!allocationId) {
      toast(
        new Error(
          'Allocation não informada para desalocação.'
        )
      );
      return;
    }

    const historicalAllocation =
  currentProductionCalendarSnapshot()
    ?.allocations
    ?.find(
      item =>
        String(
          item?.allocationId
          ||
          ''
        )
        ===
        allocationId
    );

if (
  isHistoricalPlanningAllocation(
    historicalAllocation
  )
) {
  toast(
    new Error(
      `O planejamento ${
        historicalAllocation.planningCode
        ||
        ''
      } já foi lançado e não pode ser alterado neste calendário.`.trim()
    )
  );

  return;
}

    if (
  !canWritePlanning
  || !manualScheduleDraft
  || !currentSimulation
) {
  toast(
    new Error(
      'Planejamento manual indisponível para desalocação.'
    )
  );
  return;
}


const transportId =
  String(
    payload?.task?.transportId
    ||
    (
      allocationId.startsWith(
        'readonly:transport:'
      )

        ? allocationId.slice(
            'readonly:transport:'.length
          )

        : ''
    )
  ).trim();


if (transportId) {
  const transports =
    Array.isArray(
      manualScheduleDraft?.transports
    )
      ? manualScheduleDraft.transports
      : [];


  const exists =
    transports.some(transport => (
      String(
        transport?.transportId
        || transport?.id
        || ''
      )
      === transportId
    ));


  if (!exists) {
    toast(
      new Error(
        'Este transporte já foi atualizado. Recarregue o planejamento e tente novamente.'
      )
    );

    return;
  }


  const previousManualState =
    cloneDraftPlanningState();


  manualScheduleDraft = {
    ...manualScheduleDraft,

    transports:
      transports.filter(transport => (
        String(
          transport?.transportId
          || transport?.id
          || ''
        )
        !== transportId
      )),

    updatedAt:
      new Date().toISOString(),

    dirty:
      true,

    lastManualAction: {
      type:
        'REMOVE_MANUAL_TRANSPORT',

      transportId
    }
  };


  draft.manualScheduleDraft =
    manualScheduleDraft;


  productionCalendarVisualState = {
    ...productionCalendarVisualState,

    selectedAllocationId:
      null
  };


  recordAcceptedManualState(
    previousManualState
  );


  saveDraftNow();

  refreshTimelineOnly();


  toast(
    'Transporte devolvido para Materiais a programar.'
  );


  return;
}


try {
      /*
       * Esta função é o cérebro que fizemos
       * no MANUAL-04A.
       *
       * Ela NÃO altera o draft real.
       * Só devolve o plano final da retirada.
       */
      const plan =
        analyzePlanningManualUnallocation(
          allocationId
        );

      if (
        !plan?.accepted
        || !plan?.draft
      ) {
        const issue =
          plan?.blockingIssues?.[0]
          || plan
            ?.validationResult
            ?.blockingIssues?.[0]
          || plan
            ?.validationResult
            ?.validation
            ?.errors?.[0];

        throw new Error(
          issue?.message
          || 'Não foi possível desalocar esta produção sem deixar o planejamento inconsistente.'
        );
      }

      const sourceAllocation =
        plan.sourceAllocation || {};

      const cascadeAllocations =
        Array.isArray(
          plan.cascadeAllocations
        )
          ? plan.cascadeAllocations
          : [];

      /*
       * Se a retirada afetar sucessores,
       * NÃO alteramos nada ainda.
       *
       * Primeiro mostramos o modal.
       */
      if (cascadeAllocations.length) {
        const sourceLabel =
          String(
            sourceAllocation.materialName
            || sourceAllocation.materialCode
            || sourceAllocation.materialId
            || 'Produção selecionada'
          );

        const sourceQuantity =
          Number(
            sourceAllocation.quantity
            || 0
          );

        const sourceUnit =
          String(
            sourceAllocation.unit
            || ''
          );

        const sourceDate =
          String(
            sourceAllocation.date
            || ''
          ).slice(0, 10);

        const cascadeHtml =
          cascadeAllocations
            .map(allocation => {
              const materialName =
                String(
                  allocation?.materialName
                  || allocation?.materialCode
                  || allocation?.materialId
                  || 'Material'
                );

              const machineName =
                String(
                  allocation?.machineName
                  || allocation?.machineId
                  || ''
                );

              const date =
                String(
                  allocation?.date
                  || ''
                ).slice(0, 10);

              const quantity =
                Number(
                  allocation?.quantity
                  || 0
                );

              const unit =
                String(
                  allocation?.unit
                  || ''
                );

              return `
                <li>
                  <strong>${escapeHtml(materialName)}</strong>
                  <span>
                    ${escapeHtml(
                      `${formatPtBrDecimal(quantity)} ${unit}`.trim()
                    )}
                  </span>
                  <span>
                    ${escapeHtml(
                      machineName
                      || 'Máquina não informada'
                    )}
                  </span>
                  <span>
                    ${escapeHtml(
                      isValidDateOnly(date)
                        ? formatDateOnly(date)
                        : date
                    )}
                  </span>
                </li>
              `;
            })
            .join('');

        const choice =
          await openProductionCalendarChoiceModal({
            title:
              'Desalocar produção e sucessoras',

            bodyHtml: `
              <p>
                Ao desalocar
                <strong>
                  ${escapeHtml(sourceLabel)}
                </strong>

                ${
                  sourceQuantity > 0
                    ? `(${escapeHtml(
                        `${formatPtBrDecimal(sourceQuantity)} ${sourceUnit}`.trim()
                      )})`
                    : ''
                }

                ${
                  isValidDateOnly(sourceDate)
                    ? `de ${escapeHtml(
                        formatDateOnly(sourceDate)
                      )}`
                    : ''
                },

                as programações abaixo também deixarão de ter material suficiente
                e voltarão para "Materiais a programar".
              </p>

              <ul class="manual-draft-choice-list">
                ${cascadeHtml}
              </ul>

              <p>
                <strong>
                  Esta ação será aplicada de uma só vez.
                </strong>
              </p>
            `,

            actions: [
              {
                value:
                  'cancel',

                label:
                  'Cancelar',

                className:
                  'secondary-button'
              },

              {
                value:
                  'confirm',

                label:
                  'Desalocar todas',

                className:
                  'primary-button'
              }
            ]
          });

        /*
         * CANCELAR:
         * nenhum estado foi modificado.
         */
        if (choice !== 'confirm') {
          return;
        }
      }

      /*
       * Só chegamos aqui se:
       *
       * 1. não havia cascata
       *
       * OU
       *
       * 2. o usuário confirmou o modal.
       */

      const previousManualState =
        cloneDraftPlanningState();

      /*
       * Uma única troca atômica do draft.
       */
      manualScheduleDraft =
        plan.draft;

      draft.manualScheduleDraft =
        manualScheduleDraft;

      /*
       * A barra que acabou de desaparecer
       * não deve continuar selecionada.
       */
      productionCalendarVisualState = {
        ...productionCalendarVisualState,

        selectedAllocationId:
          null
      };

      /*
       * Uma única entrada no histórico.
       *
       * Portanto:
       *
       * Desfazer
       * = restaura origem + toda a cascata.
       */
      recordAcceptedManualState(
        previousManualState
      );

      saveDraftNow();

      /*
       * Isso redesenha:
       *
       * Gantt
       * +
       * Materiais a programar
       * +
       * Programado
       * +
       * Restante
       * +
       * Permitido
       */
      refreshTimelineOnly();

      if (cascadeAllocations.length) {
        toast(
          `${
            plan.removedAllocationIds.length
          } programação(ões) devolvida(s) para Materiais a programar.`
        );
      } else {
        toast(
          'Produção devolvida para Materiais a programar.'
        );
      }
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

  function acceptProductionCalendarEditorTransaction(transaction, previousManualState, { resetSelection = false, message = '' } = {}) {
    manualScheduleDraft = transaction.draft;
    draft.manualScheduleDraft = manualScheduleDraft;
    if (resetSelection) productionCalendarVisualState = { ...productionCalendarVisualState, selectedAllocationId: null };
    recordAcceptedManualState(previousManualState); saveDraftNow(); refreshTimelineOnly();
    if (message) toast(message);
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
        const result = await runPlanningAllocationEditorController({
          currentDraft: manualScheduleDraft,
          editRequest: {
            mode: 'edit',
            allocation: current,
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
          decisions: { capacityDecision: 'override' },
          onAccepted: transaction => acceptProductionCalendarEditorTransaction(transaction, previousManualState, { message: 'Configuracao atualizada com capacidade extraordinaria.' })
        });
        if (!result.accepted) return {
          accepted: false,
          message: result.transaction?.blockingIssues?.[0]?.message || 'A capacidade extraordinaria nao pode ser aplicada.'
        };
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
    const result = await runPlanningAllocationEditorController({
      currentDraft: manualScheduleDraft,
      editRequest: {
        mode,
        allocation: current,
        relativePercents,
        partEdits,
        machineId,
        peopleCount,
        quantity: quantityChanged ? requestedQuantity : undefined,
        date,
        startTime
      },
      draftContext: {
        now: timestamp,
        validatedAt: timestamp,
        machines: currentProductionCalendarSnapshot().machines,
        matrixRows: Array.isArray(productivityRows) ? productivityRows : matrix,
        dailyMinutes: planningDraftDailyMinutes({ requireConfiguredShifts: true })
      },
      validationContext: await currentManualScheduleValidationContextWithFreshStock(),
      decisions: { capacityDecision },
      onAccepted: transaction => acceptProductionCalendarEditorTransaction(transaction, previousManualState, { resetSelection: true, message: isSplit ? 'Allocation dividida proporcionalmente.' : 'Allocation atualizada sem alterar as partes irmãs.' })
    });
    if (!result.accepted) return {
      accepted: false,
      message: result.message || 'As alterações não passaram pela validação localizada.'
    };
    return { accepted: true };
  }

  function openProductionCalendarAllocationEditor(allocation, { startSplit = false } = {}) {
    const snapshot = currentProductionCalendarSnapshot();
    const allocationId = allocation?.allocationId ?? allocation?.id;
    const current = (manualScheduleDraft?.allocations || []).find(item => String(item.allocationId) === String(allocationId))
      || (snapshot?.allocations || []).find(item => String(item.allocationId) === String(allocationId))
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
    PlanningAllocationEditor({
      allocation: editorAllocation,
      machines,
      readOnly:
  !canWritePlanning
  ||
  isHistoricalPlanningAllocation(
    editorAllocation
  ),

startSplit:
  isHistoricalPlanningAllocation(
    editorAllocation
  )
    ? false
    : startSplit,
      emptyMessage: machines.length ? '' : 'Nenhuma máquina compatível foi encontrada na Matriz para este material.',
      getDistributionPreview: (previewAllocation, percents, options) => buildManualScheduleAllocationParts(previewAllocation, percents, options),
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
  if (
    isHistoricalPlanningAllocation(
      allocation
    )
  ) {
    toast(
      new Error(
        `O planejamento ${
          allocation?.planningCode
          ||
          ''
        } já foi lançado e o transporte está disponível somente para consulta.`.trim()
      )
    );

    return;
  }

  const snapshot =
    currentProductionCalendarSnapshot();    const current = (manualScheduleDraft?.allocations || [])
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
    const requestedCapacity = null;
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
    const [
  overviewRows,
  plannedBalance
] =
  await Promise.all([

    loadStockOverviewRows(),

    api(
      '/planning/analysis/planned-balance'
    )
      .catch(
        () => ({
          rows: []
        })
      )
  ]);
    const plannedByMaterial = new Map((plannedBalance.rows || []).map(row => [String(row.material_id ?? row.materialId ?? ''), row]));
    const existingMaterialIds = new Set((draft.productions || []).map(production => String(production.materialId || '')));
    return (overviewRows || [])
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
          renderSimulation(expandedBest.result, currentForm || { elements: {} }, { captureAutomaticBaseline: true, manualFoundation: true });
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

  function manualScheduleTransportCalendarAllocations(
  transports = []
) {
  return (
    Array.isArray(transports)
      ? transports
      : []
  )
    .map((transport, index) => {
      const startDate =
        String(
          transport?.startDate
          ?? transport?.date
          ?? ''
        ).slice(0, 10);

      const endDate =
        String(
          transport?.endDate
          ?? startDate
        ).slice(0, 10);

      const quantity =
        Number(
          transport?.quantity
          || 0
        );

      if (
        !isValidDateOnly(startDate)
        ||
        !isValidDateOnly(endDate)
        ||
        !(quantity > 0)
      ) {
        return null;
      }

      const transportId =
        String(
          transport?.transportId
          || transport?.id
          || `transport-${index + 1}`
        );

      const sourceName =
        String(
          transport?.sourceLocationName
          || planningLocationLabel(
            transport?.sourceLocation
          )
          || transport?.sourceLocation
          || ''
        );

      const targetName =
        String(
          transport?.targetLocationName
          || planningLocationLabel(
            transport?.targetLocation
          )
          || transport?.targetLocation
          || ''
        );

      return {
        ...transport,

        /*
         * readonly:
         * não deixa o renderer tratar
         * transporte como allocation de máquina.
         */
        allocationId:
          `readonly:transport:${transportId}`,

        operationId:
          `transport:${transportId}`,

        parentOperationId:
          `transport:${transportId}`,

        calendarParentOperationId:
          `transport:${transportId}`,

        machineId:
          'Transporte',

        machineName:
          'Transporte',

        date:
          startDate,

        startDate,

        startTime:
          String(
            transport?.startTime
            || '00:00'
          ).slice(0, 5),

        endDate,

        endTime:
          String(
            transport?.endTime
            || '23:59'
          ).slice(0, 5),

        quantity,

        unit:
          String(
            transport?.unit
            || ''
          ),

        durationMinutes:
          Number(
            transport?.durationMinutes
            || 0
          ),

        capacityPercent:
          null,

        peopleCount:
          null,

        scheduleType:
  'transport',

transportId,

transportTotalQuantity:
  planningTransportDisplayTargetQuantity(
    transport?.totalQuantity
    ??
    transport?.requiredQuantity
    ??
    transport?.quantity
    ??
    0
  ),

        productionTitle:
          'Transporte',

        productionColor:
  String(
    transport?.productionColor
    || '#2563eb'
  ),

        productionStageLabel:
          'Logística',

        presentation: {
          ...(transport?.presentation || {}),

          productionTitle:
            'Transporte',

          productionColor:
  String(
    transport?.productionColor
    || '#2563eb'
  ),

          stageLabel:
            'Logística',

          materialName:
            String(
              transport?.materialName
              || transport?.materialCode
              || transport?.materialId
              || ''
            ),

          materialCode:
            String(
              transport?.materialCode
              || ''
            ),

          routeLabel:
            `${sourceName} → ${targetName}`,

          sourceLocationName:
            sourceName,

          targetLocationName:
            targetName
        }
      };
    })
    .filter(Boolean);
}

function isHistoricalPlanningAllocation(allocation = {}) {
  return allocation?.historicalPlanning === true
    ||
    allocation?._existingScheduleBlocker === true
    ||
    allocation?.source === 'persisted-planning';
}

function existingPlanningCalendarAllocations(result = {}) {
  const schedules =
    Array.isArray(
      result?.summary?.existingSchedules
    )
      ? result.summary.existingSchedules
      : [];

  return schedules.flatMap(
    (
      schedule,
      scheduleIndex
    ) => {
      const planningId =
        String(
          schedule?.planningId
          ||
          `plan-${scheduleIndex + 1}`
        );

      const planningCode =
        String(
          schedule?.planningCode
          ||
          schedule?.planningId
          ||
          'Planejamento lançado'
        );

      const prefix =
        `existing:${planningId}:`;

      const allocations =
        (
          Array.isArray(
            schedule?.allocations
          )
            ? schedule.allocations
            : []
        )
          .map(
            (
              allocation,
              index
            ) => {
              const originalAllocationId =
                String(
                  allocation?.allocationId
                  ??
                  allocation?.id
                  ??
                  index + 1
                );

              const originalParentId =
                String(
                  allocation?.parentOperationId
                  ||
                  allocation?.calendarParentOperationId
                  ||
                  allocation?.operationId
                  ||
                  originalAllocationId
                )
                  .replace(
                    /:day-\d+$/i,
                    ''
                  );

              const productionTitle =
                String(
                  allocation?.productionTitle
                  ||
                  'Produção'
                );

              return {
                ...allocation,

                allocationId:
                  `${prefix}allocation:${originalAllocationId}`,

                operationId:
                  `${prefix}operation:${originalParentId}`,

                parentOperationId:
                  `${prefix}operation:${originalParentId}`,

                calendarParentOperationId:
                  `${prefix}operation:${originalParentId}`,

                productionTitle:
                  `${planningCode} • ${productionTitle}`,

                planningId,

                planningCode,

                historicalPlanning:
                  true,

                _existingScheduleBlocker:
                  true,

                readOnly:
                  true,

                locked:
                  true,

                pinned:
                  true,

                source:
                  'persisted-planning',

                presentation: {
                  ...(
                    allocation?.presentation
                    ||
                    {}
                  ),

                  productionTitle:
                    `${planningCode} • ${productionTitle}`,

                  planningCode,

                  historicalPlanning:
                    true
                }
              };
            }
          );

      const transports =
        manualScheduleTransportCalendarAllocations(
          Array.isArray(
            schedule?.transports
          )
            ? schedule.transports
            : []
        )
          .map(
            (
              transport,
              index
            ) => {
              const originalTransportId =
                String(
                  transport?.transportId
                  ||
                  index + 1
                );

              return {
                ...transport,

                allocationId:
                  `${prefix}transport:${originalTransportId}`,

                operationId:
                  `${prefix}transport:${originalTransportId}`,

                parentOperationId:
                  `${prefix}transport:${originalTransportId}`,

                calendarParentOperationId:
                  `${prefix}transport:${originalTransportId}`,

                transportId:
                  `${prefix}${originalTransportId}`,

                productionTitle:
                  `${planningCode} • Transporte`,

                planningId,

                planningCode,

                historicalPlanning:
                  true,

                _existingScheduleBlocker:
                  true,

                readOnly:
                  true,

                locked:
                  true,

                pinned:
                  true,

                source:
                  'persisted-planning',

                presentation: {
                  ...(
                    transport?.presentation
                    ||
                    {}
                  ),

                  productionTitle:
                    `${planningCode} • Transporte`,

                  planningCode,

                  historicalPlanning:
                    true
                }
              };
            }
          );

      return [
        ...allocations,
        ...transports
      ];
    }
  );
}

    function buildProductionCalendarSnapshot(
    result,
    options = {}
  ) {
    const manualFoundation =
      result?.manualPlanningMode
      === MANUAL_PLANNING_MODE;

    /*
     * Guardamos as máquinas completas antes
     * do adapter, porque o cadastro possui
     * o local físico.
     */
    const rawCalendarMachines =
      productionCalendarMachines(
        result
      );

    const adapted =
      adaptPlanningResultToProductionCalendar({
      planningId: productionCalendarPlanningId(result),
      calendarOperations: manualFoundation ? [] : (Array.isArray(result?.calendarOperations) ? result.calendarOperations : []),
      operations: Array.isArray(result?.operations) ? result.operations : [],
      tree: result?.tree || result?.scheduleTree || result?.schedule_tree || null,
      days: Array.isArray(result?.days) ? result.days : [],
            machines:
        rawCalendarMachines,
      status: result?.summary?.status || result?.status,
      diagnostics: result?.diagnostics || null
    });

         /*
     * Recolocamos o local físico caso
     * o adapter tenha descartado campos
     * extras do cadastro.
     */
    const adaptedMachinesWithLocations =
      (adapted.machines || [])
        .map(machine => {
          const machineKeys =
            new Set(
              planningMachineIdentityKeys(
                machine
              )
            );

          const raw =
            rawCalendarMachines
              .find(candidate => (
                planningMachineIdentityKeys(
                  candidate
                )
                  .some(key =>
                    machineKeys.has(key)
                  )
              ));

          const locationId =
            planningMachineLocationId(
              raw
            )
            || planningMachineLocationId(
              machine
            );

          return {
            ...(raw || {}),

            ...machine,

            ...(locationId
              ? {
                  locationId
                }
              : {})
          };
        }); 

    const activeManualDraft =
  !options.ignoreManualDraft
  && manualScheduleDraft
    ? manualScheduleDraft
    : null;

const allocations =
  activeManualDraft
    ? activeManualDraft.allocations
    : (
        manualFoundation
          ? []
          : adapted.allocations
      );

const transportCalendarAllocations =
  manualScheduleTransportCalendarAllocations(
    activeManualDraft?.transports
    || []
  );

const historicalCalendarAllocations =
  existingPlanningCalendarAllocations(
    result
  );

const requestedVisibleStartDate =
  isValidDateOnly(productionCalendarVisualState.visibleStartDate)
    ? productionCalendarVisualState.visibleStartDate
    : isValidDateOnly(result?.summary?.planningStartDate)
      ? result.summary.planningStartDate
      : isValidDateOnly(draft.planningStartDate)
        ? draft.planningStartDate
        : null;

const visibleHistoricalCalendarAllocations =
  requestedVisibleStartDate
    ? historicalCalendarAllocations.filter(allocation => {
      const allocationEndDate = String(allocation?.endDate || allocation?.date || '').slice(0, 10);
      return !isValidDateOnly(allocationEndDate) || allocationEndDate >= requestedVisibleStartDate;
    })
    : historicalCalendarAllocations;

const unfilteredBaseDays =
  daysWithDraftAllocations(
    adapted.days,
    [
      ...visibleHistoricalCalendarAllocations,
      ...allocations,
      ...transportCalendarAllocations
    ]
  );

const baseDays =
  requestedVisibleStartDate
    ? unfilteredBaseDays.filter(day => String(day?.date || '').slice(0, 10) >= requestedVisibleStartDate)
    : unfilteredBaseDays;
    const validationSnapshot = buildProductionCalendarValidationSnapshot(activeManualDraft?.validation, allocations, baseDays);
    const validationDaysByDate = new Map((validationSnapshot?.days || [])
      .map(day => [String(day?.date || ''), day]));
    const summary = result?.summary || {};
    const shifts = Array.isArray(summary.shifts) && summary.shifts.length ? summary.shifts : draft.shifts;
    const manualWorkDates = activeManualDraft?.manualWorkDates ?? summary.manualWorkDates ?? result?.manualWorkDates ?? [];
    const dailyTeamOverrides = activeManualDraft?.dailyTeamOverrides ?? draft.dailyTeamOverrides ?? summary.dailyTeamOverrides ?? {};
    /*
     * A linha PROD já considera tanto allocations persistidas
     * quanto allocations do draft atual.
     *
     * A apresentação de equipe precisa enxergar exatamente o
     * mesmo conjunto produtivo.
     *
     * Não podemos reutilizar activeManualDraft.validation aqui
     * quando existem allocations históricas, pois a
     * resourceProjection dessa validation foi calculada somente
     * com o draft atual e faria o resolver ignorar as allocations
     * persistidas.
     */
    const historicalProductiveAllocations =
      visibleHistoricalCalendarAllocations.filter(
        allocation =>
          allocation?.scheduleType !== 'transport'
      );

    const resourceAllocations = [
      ...historicalProductiveAllocations,
      ...allocations
    ];

    const resourceByDate =
      resolveManualScheduleResourceByDate({
        /*
         * Para a APRESENTAÇÃO do calendário recalculamos a
         * projeção quando existem allocations históricas.
         *
         * Isso não modifica a validation persistida nem a
         * validação transacional do planejamento.
         */
        validation:
          historicalProductiveAllocations.length
            ? null
            : activeManualDraft?.validation,

        allocations:
          resourceAllocations,

      shifts,
      dailyTeamOverrides,
      manualWorkDates,
      holidays:
        result?.holidays
      });
const productionLimitDate = [
  ...visibleHistoricalCalendarAllocations,
  ...(validationSnapshot?.allocations || allocations),
  ...transportCalendarAllocations
]
  .map(allocation =>
    String(
      allocation?.endDate
      || allocation?.date
      || ''
    )
  )
  .filter(isValidDateOnly)
  .sort()
  .at(-1) || null;

    const filledBaseDays = fillProductionCalendarDayRange(baseDays);

const baseEndDate = filledBaseDays.at(-1)?.date || null;

const requestedVisibleEndDate = isValidDateOnly(productionCalendarVisualState.visibleEndDate)
  ? productionCalendarVisualState.visibleEndDate
  : null;

const visibleEndDate = [
  baseEndDate,
  requestedVisibleEndDate,
  productionLimitDate
]
  .filter(isValidDateOnly)
  .sort()
  .at(-1) || null;
      
    const configuredHolidayDates = new Set((Array.isArray(result?.holidays) ? result.holidays : [])
      .map(holiday => String(holiday?.date ?? holiday ?? '').slice(0, 10))
      .filter(isValidDateOnly));
    const calendarDays = extendProductionCalendarDayRange(
      filledBaseDays.map(day => ({
        ...day,
        ...(validationDaysByDate.get(String(day.date || '')) || {})
      })),
      visibleEndDate
    ).map(day => configuredHolidayDates.has(day.date)
      ? { ...day, isWorkingDay: false, holiday: day.holiday || { date: day.date } }
      : day);
    const snapshotAllocations =
  withManualTransportPresentation(
    validationSnapshot?.allocations
    || allocations,
    manualScheduleDraft
  );

const ganttAllocations = [
  ...visibleHistoricalCalendarAllocations,
  ...snapshotAllocations,
  ...transportCalendarAllocations
];

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
      productivity:
  buildProductionCalendarDayProductivity({
    day,

    allocations: [
      ...visibleHistoricalCalendarAllocations.filter(
        allocation =>
          allocation?.scheduleType
          !==
          'transport'
      ),

      ...snapshotAllocations
    ]
  }),
      stockAlert:
        options.previewStockAlerts
        instanceof Map

          ? (
              options.previewStockAlerts
                .get(
                  day.date
                )
              ||
              null
            )

          : buildPlanningStockCalendarAlert(
              currentPlanningStockProjection,
              day.date,
              materials,
              planningStockProjectionThresholdOptions()
            )
    }));
    const snapshot = {
      days: presentedDays,
            machines:
        adaptedMachinesWithLocations,

      allocations:
  ganttAllocations,
      validation: validationSnapshot?.validation || null,
      permissions: {
        readOnly: options.readOnly === true,
        canEditDaySettings: canWritePlanning && options.readOnly !== true,
        canEditAllocations: canWritePlanning && options.readOnly !== true
      },
      errors: adapted.errors,
      warnings: [],
      visualState: {
        ...productionCalendarVisualState,
        groupsCollapsedByDefault: manualFoundation || productionCalendarVisualState.groupsCollapsedByDefault === true,
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

  function expandProductionCalendarHorizon({ days } = {}) {
    const dayCount = Number(days);
    if (!Number.isInteger(dayCount) || dayCount <= 0 || !currentSimulation) return;
    const snapshot = buildProductionCalendarSnapshot(currentSimulation);
    const currentEndDate = isValidDateOnly(productionCalendarVisualState.visibleEndDate)
      ? productionCalendarVisualState.visibleEndDate
      : snapshot?.days?.at(-1)?.date;
    if (!isValidDateOnly(currentEndDate)) return;
    productionCalendarVisualState = {
      ...productionCalendarVisualState,
      visibleEndDate: addProductionCalendarDays(currentEndDate, dayCount)
    };
    refreshTimelineOnly();
  }

  function renderProductionCalendar(targetElement, result, options = {}) {
    const reopenExclusiveView = Boolean(productionCalendarExclusiveView);
    if (reopenExclusiveView) closeProductionCalendarExclusiveView({ restoreCalendar: false });

    const snapshot = buildProductionCalendarSnapshot(result, options);
    const model = buildPlanningScheduleViewModel(snapshot);
    if (!planningScheduleRendererHost || planningScheduleRendererHost.container !== targetElement) {
      planningScheduleRendererHost?.destroy();
      planningScheduleRendererHost = createPlanningScheduleRendererHost({
        factories: {
          'gantt-aps': () => createGanttApsRenderer({
            onRequestMove: handleProductionCalendarMoveRequest,
              onRequestUnallocate:
    handleProductionCalendarUnallocationRequest,
            onRequestEdit: allocation => openProductionCalendarAllocationEditor(allocation),
            onRequestSplit: allocation => openProductionCalendarAllocationEditor(allocation, { startSplit: true }),
            onRequestTransportAllocation: allocation => openProductionCalendarTransportModal(allocation),
            onRequestOpenDay: date => openPlanningStockProjectionModal(date),
            onRequestToggleManualWorkDate: payload => handleProductionCalendarManualWorkDate(payload),
            onRequestEditDailyTeam: payload => handleProductionCalendarDailyTeam(payload),
            onRequestExpandHorizon: payload => expandProductionCalendarHorizon(payload),
            onRequestDiscardAllChanges: () => discardAllProductionCalendarChanges(),
            onRequestOptimizeUtilization: () => handleProductionCalendarUtilizationOptimization(),
            onRequestUndoManualChange: () => undoLastProductionCalendarChange(),
            onRequestRedoManualChange: () => redoProductionCalendarChange(),
            onRequestPlanningMaterialDrop: handlePlanningMaterialDropPreview
          })
        },
        onLifecycleError: ({ error, rendererId, phase }) => {
          console.warn(`Falha no renderer ${rendererId} durante ${phase}.`, error);
        }
      });
      planningScheduleRendererHost.mount(targetElement, model, {
        renderer: 'gantt-aps'
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

  function planningStockProjectionFromApiResponse(
    response = {}
  ) {

    const date =
      String(
        response?.date || ''
      ).slice(
        0,
        10
      );


    if (
      !isValidDateOnly(
        date
      )
    ) {
      return null;
    }


    const catalogById =
      new Map(
        (
          Array.isArray(
            materials
          )
            ? materials
            : []
        ).map(
          material => [
            String(
              material?.id
              ??
              material?.materialId
              ??
              ''
            ),

            material
          ]
        )
      );


    const dayMaterials =
      (
        Array.isArray(
          response?.rows
        )
          ? response.rows
          : []
      )
        .filter(
          row =>
            row?.estimated_stock
              !== null
            &&
            row?.estimated_stock
              !== undefined
        )
        .map(
          row => {

            const materialId =
              String(
                row?.material_id
                ??
                ''
              );


            const catalogMaterial =
              catalogById.get(
                materialId
              )
              ||
              {};


            const currentStock =
              Number(
                row?.current_stock
              );


            const closingStock =
              Number(
                row?.estimated_stock
              );


            const salesPerDay =
              Number(
                row?.sales_per_day
              );


            const productionIn =
              Number(
                row?.production_qty
              );


            const hasSalesPerDay =
              Number.isFinite(
                salesPerDay
              )
              &&
              salesPerDay > 0;


            const coverageDays =
              hasSalesPerDay
              &&
              Number.isFinite(
                closingStock
              )

                ? (
                    closingStock
                    /
                    salesPerDay
                  )

                : null;


            return {

              materialId,

              materialCode:
                Array.isArray(
                  row?.material_codes
                )

                &&
                row.material_codes.length

                  ? String(
                      row.material_codes[0]
                    )

                  : '',

              materialName:
                String(
                  row?.material_name
                  ||
                  catalogMaterial?.name
                  ||
                  materialId
                ),

              unit:
                String(
                  catalogMaterial?.primary_unit
                  ??
                  catalogMaterial?.primaryUnit
                  ??
                  catalogMaterial?.unit
                  ??
                  ''
                ),

              openingStock:
                Number.isFinite(
                  currentStock
                )
                  ? currentStock
                  : 0,

              productionIn:
                Number.isFinite(
                  productionIn
                )
                  ? productionIn
                  : 0,

              externalIn:
                0,

              productionConsumption:
                0,

              demandOut:
                hasSalesPerDay
                  ? salesPerDay
                  : 0,

              otherOut:
                0,

              closingStock:
                Number.isFinite(
                  closingStock
                )
                  ? closingStock
                  : 0,

              averageDailyDemand:
                hasSalesPerDay
                  ? salesPerDay
                  : null,

              coverageDays,

              minimumStock:
                null,

              status:
                Number.isFinite(
                  closingStock
                )
                &&
                closingStock <= 0

                  ? 'NEGATIVE'

                  : 'OK',

              alerts:
                [],

              movements:
                []
            };

          }
        );


    return {

      days: [
        {
          date,

          materials:
            dayMaterials,

          summary:
            {}
        }
      ],

      materials:
        dayMaterials.map(
          item => ({
            materialId:
              item.materialId,

            materialCode:
              item.materialCode,

            materialName:
              item.materialName,

            unit:
              item.unit,

            minimumStock:
              null,

            averageDailyDemand:
              item.averageDailyDemand
          })
        ),

      alerts:
        [],

      diagnostics:
        []
    };

  }


  async function openPlanningStockProjectionModal(
    selectedDate
  ) {

    let projection =
      currentPlanningStockProjection;


    let day =
      buildPlanningStockModalModel(
        projection,
        selectedDate,
        materials,
        planningStockProjectionThresholdOptions()
      );


    /*
     * No modo "Visualizar calendário"
     * não existe uma simulação corrente.
     *
     * Por isso buscamos a projeção
     * teórica somente do dia clicado.
     */
    if (
      !day
      &&
      planningRangePreviewActive
    ) {

      try {

        const response =
          await api(
            `/planning/analysis/stock-projection?date=${
              encodeURIComponent(
                String(
                  selectedDate || ''
                ).slice(
                  0,
                  10
                )
              )
            }`
          );


        projection =
          planningStockProjectionFromApiResponse(
            response
          );


        day =
          buildPlanningStockModalModel(
            projection,
            selectedDate,
            materials,
            planningStockProjectionThresholdOptions()
          );

      } catch (
        error
      ) {

        toast(
          error
        );

        return;

      }

    }


    if (
      !day
    ) {

      toast(
        new Error(
          'A projeção de estoque desta data não está disponível.'
        )
      );

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

  <article>
    <span>Materiais</span>
    <strong>
      ${day.salesSummary.materialCount}
    </strong>
  </article>

  <article
    class="planning-stock-summary-card zeroed"
  >
    <span>Zerados</span>
    <strong>
      ${day.salesSummary.zeroedCount}
    </strong>
  </article>

  <article
    class="planning-stock-summary-card critical"
  >
    <span>Críticos</span>
    <strong>
      ${day.salesSummary.criticalCount}
    </strong>
  </article>

  <article
    class="planning-stock-summary-card attention"
  >
    <span>Atenção</span>
    <strong>
      ${day.salesSummary.attentionCount}
    </strong>
  </article>

  <article
    class="planning-stock-summary-card below-target"
  >
    <span>Abaixo da meta</span>
    <strong>
      ${day.salesSummary.belowTargetCount}
    </strong>
  </article>

  <article
    class="planning-stock-summary-card ok"
  >
    <span>OK</span>
    <strong>
      ${day.salesSummary.okCount}
    </strong>
  </article>

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

  if (!currentSimulation) {
    return;
  }


  if (
    draft.planningMode
    === 'theoretical'
  ) {

    currentPlanningStockProjection =
      null;

    return;
  }
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
    if (
  draft.planningMode
  === 'theoretical'
) {

  currentPlanningStockAlerts =
    new Map();

  return;
}
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

  function renderSimulation(result, form, { restoreManualDraft = false, captureAutomaticBaseline = false, manualFoundation = result?.manualPlanningMode === MANUAL_PLANNING_MODE } = {}) {
    const coloredResult = manualFoundation
      ? buildManualPlanningSchedulingResult(withProductionColors(result))
      : withProductionColors(result);
    currentSimulation = coloredResult;
    planningRangePreviewActive =
      false;

    currentPlanningRangeStockAlerts =
      new Map();
    productionCalendarVisualState = {
      ...productionCalendarVisualState,
      visibleStartDate: isValidDateOnly(draft.planningStartDate) ? draft.planningStartDate : null,
      visibleEndDate: isValidDateOnly(draft.planningEndDate) ? draft.planningEndDate : null
    };
    const automaticSnapshot = buildProductionCalendarSnapshot(coloredResult, { ignoreManualDraft: true });
    if (captureAutomaticBaseline) {
      currentAutomaticBaseline = createAutomaticSimulationBaseline({
        simulation: coloredResult,
        allocations: automaticSnapshot.allocations
      });
      draft.automaticBaseline = cloneAutomaticBaselineValue(currentAutomaticBaseline);
    }
       const restoredDraft =
      restoreManualDraft
      &&
      manualScheduleDraft
      &&
      (
        manualScheduleDraft?.allocations?.length
        || manualScheduleDraft?.transports?.length
        || manualScheduleDraft?.plannedReceipts?.length
        || manualScheduleDraft?.manualWorkDates?.length
        || Object.keys(manualScheduleDraft?.dailyTeamOverrides || {}).length
      )

        ? {
            ...JSON.parse(
              JSON.stringify(
                manualScheduleDraft
              )
            ),

            plannedReceipts:
              JSON.parse(
                JSON.stringify(
                  draft.plannedReceipts
                  ||
                  manualScheduleDraft
                    ?.plannedReceipts
                  ||
                  []
                )
              )
          }

        : null;
    const candidateDraft = restoredDraft || createManualScheduleDraft({
        planningId: productionCalendarPlanningId(coloredResult),
        baseSimulationId: coloredResult?.code || lastPayload?.planningCode || Date.now(),
                allocations:
          manualFoundation
            ? []
            : automaticSnapshot.allocations,

        plannedReceipts:
          draft.plannedReceipts
          || [],

        machines:
          automaticSnapshot.machines,

        manualWorkDates:
          coloredResult?.summary?.manualWorkDates
          ||
          coloredResult?.manualWorkDates
          ||
          lastPayload?.manualWorkDates
          ||
          [],
        dailyTeamOverrides: draft.dailyTeamOverrides || coloredResult?.summary?.dailyTeamOverrides || {},
        preserveAllocationRows: true
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
        draft.currentSimulation =
      coloredResult;

    draft.lastPayload =
      lastPayload;

    draft.manualScheduleDraft =
      manualScheduleDraft;


    draft.plannedReceipts =
      JSON.parse(
        JSON.stringify(
          manualScheduleDraft
            ?.plannedReceipts
          ||
          draft.plannedReceipts
          ||
          []
        )
      );


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
    const materialsTarget = target.querySelector('.planning-materials-program-target');
    const notice = target.querySelector('.unsimulated-notice');
    const materialsPanel = target.querySelector('.planning-materials-program-panel');
    const previewNotice = target.querySelector('.planning-range-preview-notice');
    const oldSummaryPanel = target.querySelector('.final-summary-panel');
    if (oldSummaryPanel) oldSummaryPanel.hidden = true;
    currentPlanningStockAlerts = new Map();
    refreshPlanningStockProjection();
    renderProductionCalendar(timelineTarget, coloredResult, { stockAlerts: currentPlanningStockAlerts });
    schedulePlanningStockAlerts(coloredResult);
    if (materialsTarget) {
      renderProductionFlowDom(materialsTarget, renderPlanningMaterialsToSchedule(coloredResult), {
        root: page,
        requestAnimationFrame,
        productionTheme
      });
      bindPlanningMaterialsToScheduleDrag(materialsTarget);
    }
    if (materialsPanel) materialsPanel.hidden = false;
    if (notice) notice.hidden = true;
    if (previewNotice) previewNotice.hidden = true;
    target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', true);
    resultsTarget.hidden = false;
    const saveButton =
  target.querySelector(
    '[name="save"]'
  );


if (saveButton) {

  const theoretical =
    draft.planningMode
    === 'theoretical';


  saveButton.disabled =
    !canWritePlanning
    ||
    theoretical;


  saveButton.title =
    theoretical

      ? 'O salvamento de cenários teóricos será habilitado na próxima etapa.'

      : '';
}

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
    refreshPlanningMaterialsToSchedule();
  }

  function markPlanningInconsistent() {
    hasPendingSimulationChanges = true;
    const notice = target.querySelector('.unsimulated-notice');
    if (notice) notice.hidden = false;
    target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', false);
  }

  function restoreSimulation(form) {
  if (!currentSimulation) return;

  const wasPending =
    hasPendingSimulationChanges;

  renderSimulation(
    currentSimulation,
    form,
    {
      restoreManualDraft: true
    }
  );

  hasPendingSimulationChanges =
    wasPending;

  const allProductionsReady =
    draft.productions.every(
      production => (
        findMaterialById(
          materials,
          production.materialId
        )
        &&
        Number(
          production.plannedQty
        ) > 0
      )
    );

  const showPendingNotice =
    hasPendingSimulationChanges
    &&
    allProductionsReady;

  const notice =
    target.querySelector(
      '.unsimulated-notice'
    );

  if (notice) {
    notice.hidden =
      !showPendingNotice;
  }

  target
    .querySelector(
      '.recalculate-planning'
    )
    ?.toggleAttribute(
      'hidden',
      !showPendingNotice
    );
}

  function summaryCards(result, planningCode) {
    const firstOperation = result.operations[0];
    const lastOperation = result.operations[result.operations.length - 1];
    const period = operationPeriod(result.operations, result.summary.planningStartDate || draft.planningStartDate, result.summary.planningEndDate || draft.planningEndDate);
    const productions = result.summary.productions || [];
        const manualTransports =
      Array.isArray(
        manualScheduleDraft?.transports
      )
        ? manualScheduleDraft.transports
        : [];


    const transports =
      manualTransports.length
      ||
      manualTransportConstraints(
        manualScheduleDraft
      ).length;
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
        const savedResult = await savePlanningManualSchedule({
          draft,
          lastPayload,
          manualScheduleDraft,
          currentSimulation,
          stockShortages,
          requestStockAuthorization,
          persistCreate: ({ body }) => api('/planning/plans', { method: 'POST', body }),
          persistUpdate: ({ planningId, body }) => api(`/planning/plans/${planningId}/manual-schedule`, { method: 'PUT', body })
        });
        if (!savedResult.accepted) {
          button.disabled = false;
          return;
        }
        const saved = savedResult.saved;
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(RUNTIME_DRAFT_KEY);
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
  return planTreeRoots(tree).map(
    (
      node,
      index
    ) => ({
      productionIndex:
        Number(
          node.productionIndex
          ??
          index
        ),

      title:
        node.productionTitle
        ||
        `Produção ${
          Number(
            node.productionIndex
            ??
            index
          ) + 1
        }`,

      materialId:
        String(
          node.materialId
          ??
          ''
        ),

      materialName:
        node.materialName,

      materialCode:
        node.materialCode,

      plannedQty:
        node.requiredQty,

      unit:
        node.unit,

      machineName:
        node.machineName,

      peopleCount:
        node.peopleCount,

      productionModelName:
        node.productionModelName
    })
  );
}

function detailManualScheduleDraft(detail = {}) {
  const draft =
    detail?.manualScheduleDraft;

  return draft
    &&
    typeof draft === 'object'

      ? draft

      : null;
}

function detailLinkedProductions(item = {}) {
  const memberships =
    Array.isArray(
      item?.productionMemberships
    )
      ? item.productionMemberships
      : [];

  if (
    memberships.length
  ) {
    return memberships
      .map(
        membership =>
          String(
            membership?.productionTitle
            ||
            membership?.title
            ||
            `Produção ${
              Number(
                membership?.productionIndex
                ??
                0
              ) + 1
            }`
          )
      )
      .filter(Boolean);
  }

  return [
    item?.productionTitle
  ].filter(Boolean);
}

function operationsForDetail(detail) {
  const manualDraft =
    detailManualScheduleDraft(
      detail
    );

  const allocations =
    Array.isArray(
      manualDraft?.allocations
    )
      ? manualDraft.allocations
      : [];

  const transports =
    Array.isArray(
      manualDraft?.transports
    )
      ? manualDraft.transports
      : [];

  /*
   * Planejamento antigo sem calendário
   * manual persistido.
   */
  if (
    !allocations.length
    &&
    !transports.length
  ) {
    return normalizeJsonArray(
      detail.operations
    ).map(
      (
        operation,
        index
      ) => ({
        ...operation,

        sequence:
          index + 1,

        routeLabel:
          '',

        linkedProductions:
          Array.isArray(
            operation.productionItems
          )
          &&
          operation.productionItems.length

            ? operation.productionItems.map(
                item =>
                  `${
                    item.productionTitle
                    ||
                    `Produção ${
                      Number(
                        item.productionIndex
                        ||
                        0
                      ) + 1
                    }`
                  }: ${
                    formatPtBrDecimal(
                      item.quantity
                    )
                  } ${
                    item.unit
                    ||
                    operation.unit
                    ||
                    ''
                  }`.trim()
              )

            : [
                operation.productionTitle
              ].filter(Boolean)
      })
    );
  }

  /*
   * O que realmente foi colocado no Gantt.
   */
  const productionRows =
    allocations.map(
      (
        allocation,
        index
      ) => ({
        ...allocation,

        _detailOrder:
          index,

        operationType:
          'production',

        materialName:
          allocation?.materialName
          ??
          allocation?.material_name
          ??
          '',

        materialCode:
          allocation?.materialCode
          ??
          allocation?.material_code
          ??
          '',

        produceQty:
          Number(
            allocation?.quantity
            ??
            allocation?.produceQty
            ??
            0
          ),

        unit:
          allocation?.unit
          ||
          '',

        machineName:
          allocation?.machineName
          ??
          allocation?.machine_name
          ??
          allocation?.machineId
          ??
          '',

        peopleCount:
          allocation?.peopleCount
          ??
          allocation?.people_count
          ??
          '',

        startDate:
          String(
            allocation?.date
            ??
            allocation?.startDate
            ??
            ''
          ).slice(
            0,
            10
          ),

        startTime:
          String(
            allocation?.startTime
            ??
            ''
          ).slice(
            0,
            5
          ),

        endDate:
          String(
            allocation?.endDate
            ??
            allocation?.date
            ??
            allocation?.startDate
            ??
            ''
          ).slice(
            0,
            10
          ),

        endTime:
          String(
            allocation?.endTime
            ??
            ''
          ).slice(
            0,
            5
          ),

        totalMinutes:
          Number(
            allocation?.durationMinutes
            ??
            allocation?.duration
            ??
            0
          ),

        routeLabel:
          '',

        linkedProductions:
          detailLinkedProductions(
            allocation
          )
      })
    );

  const transportRows =
    transports.map(
      (
        transport,
        index
      ) => {
        const sourceName =
          String(
            transport?.sourceLocationName
            ||
            planningLocationLabel(
              transport?.sourceLocation
            )
            ||
            transport?.sourceLocation
            ||
            ''
          );

        const targetName =
          String(
            transport?.targetLocationName
            ||
            planningLocationLabel(
              transport?.targetLocation
            )
            ||
            transport?.targetLocation
            ||
            ''
          );

        return {
          ...transport,

          _detailOrder:
            productionRows.length
            +
            index,

          operationType:
            'transport',

          materialName:
            transport?.materialName
            ??
            transport?.material_name
            ??
            '',

          materialCode:
            transport?.materialCode
            ??
            transport?.material_code
            ??
            '',

          produceQty:
            Number(
              transport?.quantity
              ??
              transport?.requiredQuantity
              ??
              0
            ),

          unit:
            transport?.unit
            ||
            '',

          machineName:
            'Transporte',

          peopleCount:
            '',

          startDate:
            String(
              transport?.startDate
              ??
              transport?.date
              ??
              ''
            ).slice(
              0,
              10
            ),

          startTime:
            String(
              transport?.startTime
              ??
              ''
            ).slice(
              0,
              5
            ),

          endDate:
            String(
              transport?.endDate
              ??
              transport?.startDate
              ??
              transport?.date
              ??
              ''
            ).slice(
              0,
              10
            ),

          endTime:
            String(
              transport?.endTime
              ??
              ''
            ).slice(
              0,
              5
            ),

          totalMinutes:
            Number(
              transport?.durationMinutes
              ??
              0
            ),

          routeLabel:
            [
              sourceName,
              targetName
            ]
              .filter(Boolean)
              .join(
                ' → '
              ),

          linkedProductions:
            detailLinkedProductions(
              transport
            )
        };
      }
    );

  return [
    ...productionRows,
    ...transportRows
  ]
    .sort(
      (
        left,
        right
      ) => (
        `${
          left.startDate
          ||
          '9999-12-31'
        }T${
          left.startTime
          ||
          '99:99'
        }`
          .localeCompare(
            `${
              right.startDate
              ||
              '9999-12-31'
            }T${
              right.startTime
              ||
              '99:99'
            }`
          )

        ||

        Number(
          left._detailOrder
          ||
          0
        )
        -
        Number(
          right._detailOrder
          ||
          0
        )
      )
    )
    .map(
      (
        operation,
        index
      ) => ({
        ...operation,

        sequence:
          index + 1
      })
    );
}

function productionRowsForDetail(
  detail,
  tree
) {
  const metaProductions =
    Array.isArray(
      detail?.summary?.productions
    )
    &&
    detail.summary.productions.length

      ? detail.summary.productions.map(
          (
            production,
            index
          ) => ({
            productionIndex:
              Number(
                production?.productionIndex
                ??
                index
              ),

            title:
              production?.title
              ||
              `Produção ${
                Number(
                  production?.productionIndex
                  ??
                  index
                ) + 1
              }`,

            materialId:
              String(
                production?.materialId
                ??
                ''
              ),

            materialName:
              production?.materialName
              ||
              '',

            materialCode:
              production?.materialCode
              ||
              '',

            plannedQty:
              production?.plannedQty,

            unit:
              production?.plannedUnit
              ||
              production?.unit
              ||
              '',

            machineName:
              production?.machineName
              ||
              '',

            peopleCount:
              production?.peopleCount
              ??
              '',

            productionModelName:
              production?.productionModelName
              ||
              ''
          })
        )

      : productionRowsFromTree(
          tree
        );

  const allocations =
    Array.isArray(
      detailManualScheduleDraft(
        detail
      )?.allocations
    )

      ? detailManualScheduleDraft(
          detail
        ).allocations

      : [];

  return metaProductions.map(
    (
      production,
      index
    ) => {
      const productionIndex =
        Number(
          production.productionIndex
          ??
          index
        );

      const finalAllocations =
        allocations.filter(
          allocation => {
            const sameProduction =
              Number(
                allocation?.productionIndex
                ??
                0
              )
              ===
              productionIndex;

            if (
              !sameProduction
            ) {
              return false;
            }

            if (
              production.materialId
            ) {
              return String(
                allocation?.materialId
                ??
                ''
              )
              ===
              String(
                production.materialId
              );
            }

            return normalizeText(
              allocation?.materialName
            )
            ===
            normalizeText(
              production.materialName
            );
          }
        );

      const machines =
        [
          ...new Set(
            finalAllocations
              .map(
                allocation =>
                  String(
                    allocation?.machineName
                    ??
                    allocation?.machineId
                    ??
                    ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ];

      const models =
        [
          ...new Set(
            finalAllocations
              .map(
                allocation =>
                  String(
                    allocation?.productionModelName
                    ||
                    ''
                  ).trim()
              )
              .filter(Boolean)
          )
        ];

      const people =
        finalAllocations
          .map(
            allocation =>
              Number(
                allocation?.peopleCount
                ??
                allocation?.people_count
              )
          )
          .filter(
            Number.isFinite
          );

      return {
        ...production,

        machineName:
          machines.length
            ? machines.join(
                ' + '
              )
            : production.machineName,

        peopleCount:
          people.length
            ? Math.max(
                ...people
              )
            : production.peopleCount,

        productionModelName:
          models.length
            ? models.join(
                ' + '
              )
            : production.productionModelName
      };
    }
  );
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
  page
    .querySelector(
      '.planning-detail-modal'
    )
    ?.remove();

  const plan =
    detail.plan
    ||
    {};

  const canceled =
    isCanceledStatus(
      plan.status
    );

  const tree =
    normalizeJsonObject(
      detail.tree
      ||
      plan.schedule_tree
    );

  const operations =
    operationsForDetail(
      detail
    );

  const productions =
    productionRowsForDetail(
      detail,
      tree
    );

  const transports =
    operations.filter(
      operation =>
        operation.operationType
        ===
        'transport'
    );

  const productionOperations =
    operations.filter(
      operation =>
        operation.operationType
        !==
        'transport'
    );

  const machines =
    [
      ...new Set(
        productionOperations
          .map(
            operation =>
              String(
                operation.machineName
                ||
                ''
              ).trim()
          )
          .filter(Boolean)
      )
    ];

  const period =
    operationPeriod(
      operations,
      plan.start_date,
      plan.end_date
    );

  const alerts =
    planAlerts(
      tree,
      operations
    );

  const backdrop =
    document.createElement(
      'div'
    );

  backdrop.className =
    `modal-backdrop planning-detail-modal${
      canceled
        ? ' is-canceled-planning'
        : ''
    }`;

  backdrop.innerHTML = `
    <div
      class="modal wide-modal planning-detail-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="planning-detail-title"
    >
      ${
        canceled
          ? `
            <div
              class="planning-canceled-watermark"
              aria-hidden="true"
            >
              CANCELADO
            </div>
          `
          : ''
      }

      <div class="modal-header">
        <div>
          <h2 id="planning-detail-title">
            Planejamento ${escapeHtml(
              plan.code
              ||
              plan.id
            )}
          </h2>

          <p class="modal-subtitle">
            Programação efetivamente lançada
            •
            ${escapeHtml(
              period.label
            )}
            •
            ${escapeHtml(
              formatStatus(
                plan.status
              )
            )}
          </p>
        </div>

        <button
          class="link-button close-modal"
          type="button"
        >
          Fechar
        </button>
      </div>

      <section
        class="planning-detail-section detail-summary-strip"
      >
        <article>
          <span>
            Código
          </span>

          <strong>
            ${escapeHtml(
              plan.code
              ||
              plan.id
            )}
          </strong>
        </article>

        <article>
          <span>
            Período realizado no calendário
          </span>

          <strong>
            ${escapeHtml(
              period.label
            )}
          </strong>
        </article>

        <article>
          <span>
            Status
          </span>

          <strong>
            ${planningStatusPill(
              plan.status
            )}
          </strong>
        </article>

        <article>
          <span>
            Alocações de produção
          </span>

          <strong>
            ${productionOperations.length}
          </strong>
        </article>

        <article>
          <span>
            Transportes
          </span>

          <strong>
            ${transports.length}
          </strong>
        </article>

        <article>
          <span>
            Máquinas utilizadas
          </span>

          <strong>
            ${escapeHtml(
              machines.join(
                ', '
              )
              ||
              '-'
            )}
          </strong>
        </article>
      </section>

      <section class="planning-detail-section">
        <h3>
          Produções lançadas
        </h3>

        <p class="muted-text">
          Abaixo estão as quantidades finais solicitadas
          e os recursos em que elas foram realmente
          programadas.
        </p>

        ${renderDetailTable(
          [
            {
              label:
                'Produção',

              render:
                row =>
                  escapeHtml(
                    row.title
                  )
            },

            {
              label:
                'Material final',

              render:
                row =>
                  `${
                    escapeHtml(
                      row.materialName
                      ||
                      ''
                    )
                  }<br><span class="muted-text">${
                    escapeHtml(
                      row.materialCode
                      ||
                      ''
                    )
                  }</span>`
            },

            {
              label:
                'Quantidade',

              render:
                row =>
                  escapeHtml(
                    `${
                      formatPtBrDecimal(
                        row.plannedQty
                      )
                    } ${
                      row.unit
                      ||
                      ''
                    }`.trim()
                  )
            },

            {
              label:
                'Máquinas programadas',

              render:
                row =>
                  escapeHtml(
                    row.machineName
                    ||
                    '-'
                  )
            },

            {
              label:
                'Pessoas (máx.)',

              render:
                row =>
                  escapeHtml(
                    String(
                      row.peopleCount
                      ??
                      '-'
                    )
                  )
            },

            {
              label:
                'Modelo',

              render:
                row =>
                  escapeHtml(
                    row.productionModelName
                    ||
                    '-'
                  )
            }
          ],

          productions
        )}
      </section>

      <section
        class="planning-detail-section planning-detail-shifts"
      >
        <h3>
          Resumo de recursos
        </h3>

        <div class="planning-detail-inline">
          <p>
            <strong>
              Jornada:
            </strong>

            ${escapeHtml(
              formatHourDuration(
                plan.hours_per_day
              )
            )}
          </p>

          <p>
            <strong>
              Máquinas:
            </strong>

            ${escapeHtml(
              machines.join(
                ', '
              )
              ||
              '-'
            )}
          </p>

          <p>
            <strong>
              Logística:
            </strong>

            ${transports.length}
            transporte(s)
          </p>
        </div>
      </section>

      ${
        transports.length
          ? `
            <section class="planning-detail-section">
              <h3>
                Transportes programados
              </h3>

              ${renderDetailTable(
                [
                  {
                    label:
                      'Material',

                    render:
                      row =>
                        `${
                          escapeHtml(
                            row.materialName
                            ||
                            ''
                          )
                        }<br><span class="muted-text">${
                          escapeHtml(
                            row.materialCode
                            ||
                            ''
                          )
                        }</span>`
                  },

                  {
                    label:
                      'Rota',

                    render:
                      row =>
                        escapeHtml(
                          row.routeLabel
                          ||
                          '-'
                        )
                  },

                  {
                    label:
                      'Quantidade',

                    render:
                      row =>
                        escapeHtml(
                          `${
                            formatPtBrDecimal(
                              row.produceQty
                            )
                          } ${
                            row.unit
                            ||
                            ''
                          }`.trim()
                        )
                  },

                  {
                    label:
                      'Saída',

                    render:
                      row =>
                        escapeHtml(
                          `${
                            formatDateOnly(
                              row.startDate
                            )
                          } ${
                            row.startTime
                            ||
                            ''
                          }`.trim()
                        )
                  },

                  {
                    label:
                      'Chegada',

                    render:
                      row =>
                        escapeHtml(
                          `${
                            formatDateOnly(
                              row.endDate
                            )
                          } ${
                            row.endTime
                            ||
                            ''
                          }`.trim()
                        )
                  },

                  {
                    label:
                      'Duração',

                    render:
                      row =>
                        escapeHtml(
                          formatDuration(
                            row.totalMinutes
                          )
                        )
                  }
                ],

                transports
              )}
            </section>
          `
          : ''
      }

      <section class="planning-detail-section">
        <h3>
          Cronograma lançado
        </h3>

        <p class="muted-text">
          Este cronograma usa as alocações e transportes
          persistidos no calendário manual, não a sugestão
          automática original.
        </p>

        ${renderDetailTable(
          [
            {
              label:
                '#',

              render:
                row =>
                  row.sequence
            },

            {
              label:
                'Material',

              render:
                row =>
                  `${
                    escapeHtml(
                      row.materialName
                      ||
                      ''
                    )
                  }${
                    row.materialCode
                      ? `<br><span class="muted-text">${
                          escapeHtml(
                            row.materialCode
                          )
                        }</span>`
                      : ''
                  }`
            },

            {
              label:
                'Tipo',

              render:
                row =>
                  row.operationType
                  ===
                  'transport'

                    ? 'Transporte'

                    : 'Produção'
            },

            {
              label:
                'Quantidade',

              render:
                row =>
                  escapeHtml(
                    `${
                      formatPtBrDecimal(
                        row.produceQty
                      )
                    } ${
                      row.unit
                      ||
                      ''
                    }`.trim()
                  )
            },

            {
              label:
                'Máquina / rota',

              render:
                row =>
                  escapeHtml(
                    row.operationType
                    ===
                    'transport'

                      ? (
                          row.routeLabel
                          ||
                          'Transporte'
                        )

                      : (
                          row.machineName
                          ||
                          '-'
                        )
                  )
            },

            {
              label:
                'Pessoas',

              render:
                row =>
                  escapeHtml(
                    row.operationType
                    ===
                    'transport'

                      ? '-'

                      : String(
                          row.peopleCount
                          ??
                          '-'
                        )
                  )
            },

            {
              label:
                'Início',

              render:
                row =>
                  escapeHtml(
                    `${
                      formatDateOnly(
                        row.startDate
                      )
                    } ${
                      row.startTime
                      ||
                      ''
                    }`.trim()
                  )
            },

            {
              label:
                'Fim',

              render:
                row =>
                  escapeHtml(
                    `${
                      formatDateOnly(
                        row.endDate
                      )
                    } ${
                      row.endTime
                      ||
                      ''
                    }`.trim()
                  )
            },

            {
              label:
                'Duração',

              render:
                row =>
                  escapeHtml(
                    formatDuration(
                      row.totalMinutes
                    )
                  )
            },

            {
              label:
                'Produção vinculada',

              render:
                row =>
                  escapeHtml(
                    row
                      .linkedProductions
                      .join(
                        ' | '
                      )
                    ||
                    '-'
                  )
            }
          ],

          operations
        )}
      </section>

      <section class="planning-detail-section">
        <h3>
          Fluxo produtivo
        </h3>

        <p class="muted-text">
          O fluxo abaixo representa a cadeia de materiais.
          O cronograma acima representa onde e quando cada
          etapa foi efetivamente lançada.
        </p>

        ${renderPlanFlowDetail(
          tree
        )}
      </section>

      <section class="planning-detail-section">
        <h3>
          Alertas e observações
        </h3>

        ${
          alerts.length
            ? `
              <ul class="planning-alert-list">
                ${
                  alerts
                    .map(
                      alert =>
                        `<li>${
                          escapeHtml(
                            alert
                          )
                        }</li>`
                    )
                    .join('')
                }
              </ul>
            `
            : `
              <p class="muted-text">
                Sem alertas registrados.
              </p>
            `
        }
      </section>
    </div>
  `;

  backdrop.addEventListener(
    'click',
    event => {
      if (
        event.target
        ===
        backdrop
        ||
        event.target.classList.contains(
          'close-modal'
        )
      ) {
        backdrop.remove();
      }
    }
  );

  page.appendChild(
    backdrop
  );

  scheduleProductionFlowConnectors(
    page,
    {
      requestAnimationFrame,
      productionTheme
    }
  );

  setTimeout(
    () =>
      drawProductionFlowConnectors(
        page,
        {
          productionTheme
        }
      ),
    80
  );
}

  async function reopenSavedPlan(detail) {
    const loaded = buildLoadedPlanningManualScheduleState(detail, {
      normalizeDraft,
      defaultShift
    });
    const { persisted } = loaded;
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(RUNTIME_DRAFT_KEY);
    draft = loaded.draft;
    lastPayload = loaded.lastPayload;
    currentSimulation = loaded.currentSimulation;
    const automaticSnapshot = buildProductionCalendarSnapshot(currentSimulation, { ignoreManualDraft: true });
    currentAutomaticBaseline = createAutomaticSimulationBaseline({
      simulation: currentSimulation,
      allocations: automaticSnapshot.allocations
    });
    manualScheduleDraft = loaded.manualScheduleDraft;
        draft.lastPayload =
      lastPayload;

    draft.currentSimulation =
      currentSimulation;

    draft.manualScheduleDraft =
      manualScheduleDraft;


    draft.plannedReceipts =
      JSON.parse(
        JSON.stringify(
          manualScheduleDraft
            ?.plannedReceipts
          ||
          draft.plannedReceipts
          ||
          []
        )
      );


    draft.automaticBaseline =
      cloneAutomaticBaselineValue(
        currentAutomaticBaseline
      );
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
    await Promise.all([
      loadLookups(),
      ensurePlanningProductionNumbers()
    ]);
    target.innerHTML = `
      <div class="planning-builder-panel">
        <form class="planning-form">
          <div class="planning-builder-layout">

            <article class="planning-subcard planning-date-card">
              <div class="planning-subcard-header">
                <h2>Data inicial do planejamento</h2>
                <button class="secondary-button view-planning-range" type="button">Visualizar calendário</button>
              </div>
              ${renderPlanningInlineCalendar(draft.planningStartDate, draft.planningEndDate, draft.planningCalendarMonth)}
            </article>

            <article class="planning-subcard planning-turns-card">
              <div class="planning-subcard-header">
                <h2>Turnos</h2>
                <button class="secondary-button add-shift" type="button">+ Turno</button>
              </div>
              <div class="planning-shifts-layout"><div class="shifts-target">${draft.shifts.map(renderShift).join('')}</div><div class="shift-summary-target">${renderShiftSummary()}</div></div>
            </article>

            <article class="planning-subcard planning-productions-shell">
              <div class="planning-subcard-header planning-productions-header">
                <h2>Produ&ccedil;&otilde;es</h2>
                <div class="planning-header-actions">
                  <button class="secondary-button clear-planning planning-clear-button" type="button">Limpar planejamento</button>
                  <button class="secondary-button add-production" type="button">+ Adicionar produ&ccedil;&atilde;o</button>
                  <button class="primary-button" name="simulate" type="submit">Simular</button>
                </div>
              </div>
              <div class="productions-target">${draft.productions.map(renderProduction).join('')}</div>
            </article>

          </div>
        </form>
      </div>
      <div class="planning-results" hidden>
        <div
  class="panel planning-materials-program-panel"
  data-planning-unallocation-target="true"
>
          <div class="section-heading">
            <h2>Materiais a programar</h2>
          </div>
          <div class="planning-materials-program-target"></div>
        </div>
        <div class="panel calendar-panel">
          <div class="section-heading">
            <h2>Calend&aacute;rio de produ&ccedil;&atilde;o</h2>
            <div class="calendar-panel-actions">
              <button class="secondary-button recalculate-planning" type="button" hidden>Recalcular</button>
              ${canWritePlanning ? '<button class="secondary-button" name="save" type="button" disabled>Salvar planejamento</button>' : ''}
            </div>
          </div>
          <p class="unsimulated-notice" hidden>Planejamento inconsistente. Clique em Recalcular.</p>
          <p class="planning-range-preview-notice" hidden></p>
          <div class="timeline-target"></div>
        </div>
      </div>
    `;

    const form = target.querySelector('form');
    const shiftsTarget = target.querySelector('.shifts-target');
    const productionsTarget = target.querySelector('.productions-target');
    const modePillsTarget =
  page.querySelector(
    '[data-planning-mode-pills]'
  );


renderPlanningModePills();
    renderProductionCalendar(
      target.querySelector('.timeline-target'),
      { days: [], operations: [], calendarOperations: [] }
    );

    const restoredLocalRuntime =
      await restorePlanningRuntimeFromLocalSave(form);

    if (!restoredLocalRuntime) {
      restoreSimulation(form);
    }

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
      const materialsTarget = target.querySelector('.planning-materials-program-target');
      if (materialsTarget) materialsTarget.innerHTML = '';
      renderProductionCalendar(target.querySelector('.timeline-target'), { days: [], operations: [], calendarOperations: [] });
      saveDraftNow();
    }

        const materialsTarget =
      target.querySelector(
        '.planning-materials-program-target'
      );

    const timelineTarget =
      target.querySelector(
        '.timeline-target'
      );


    let planningProgramSelection =
      null;


    function planningProgramSelectionForCard(
      card
    ) {
      if (!card) {
        return null;
      }


      /*
       * TRANSPORTE
       */
      const transportCard =
        card.classList.contains(
          'planning-transport-program-card'
        )
          ? card
          : null;


      if (transportCard) {

        const transport =
          planningConsolidatedTransportCardByKey(
            transportCard
              .dataset
              .transportKey
          );


        if (!transport) {
          return null;
        }


        return {
          material:
            transport,

          compatibleMachineIds: [
            'Transporte'
          ],

          compatibleMachines: [
            {
              machineId:
                'Transporte',

              machineName:
                'Transporte'
            }
          ]
        };
      }


      /*
       * MATERIAL PRODUTIVO NORMAL
       */
      if (
        card.classList.contains(
          'is-blocked'
        )

        ||

        card.classList.contains(
          'is-completed'
        )
      ) {
        return null;
      }


      const operationIds = String(card.dataset.operationIds || '').split(',').map(value => value.trim()).filter(Boolean);
      const material = operationIds.length
        ? planningMaterialToScheduleByOperationIds(operationIds)
        : planningMaterialToScheduleByOperationId(card.dataset.operationId);


      if (
        !material
        || material.blocked
        || material.completed
      ) {
        return null;
      }


      const compatibleMachines = material.isConsolidatedProgramMaterial
        ? (material.members || []).map(member => compatiblePlanningMachinesForMaterial(member)).reduce((shared, machines) => shared.filter(machine => machines.some(candidate => String(candidate.machineId) === String(machine.machineId))))
        : compatiblePlanningMachinesForMaterial(material);


      return {
        material,

        compatibleMachineIds:
          compatibleMachines.map(
            machine =>
              String(
                machine.machineId
              )
          ),

        compatibleMachines
      };
    }


    function clearPlanningProgramSelection() {

      planningProgramSelection =
        null;


      materialsTarget
        ?.querySelectorAll?.(
          '[data-planning-gantt-select]'
        )
        .forEach(input => {
          input.checked = false;
        });


      materialsTarget
        ?.querySelectorAll?.(
          '[data-selected-for-gantt="true"]'
        )
        .forEach(card => {
          delete card
            .dataset
            .selectedForGantt;
        });


      const calendar =
        planningScheduleRendererHost
          ?.getRootElement?.()

        ||

        target.querySelector(
          '.gantt-aps'
        );


      calendar?.removeAttribute?.(
        'data-planning-material-click-mode'
      );


      /*
       * Usa o mesmo encerramento usado
       * pelo drag tradicional.
       */
      dispatchPlanningMaterialDragToGantt(
        'end'
      );
    }


    function selectPlanningProgramCard(
      card
    ) {
      const selection =
        planningProgramSelectionForCard(
          card
        );


      if (!selection) {
        return false;
      }


      /*
       * Só pode existir UM card selecionado.
       */
      clearPlanningProgramSelection();


      planningProgramSelection =
        selection;


      card.dataset.selectedForGantt =
        'true';


      const checkbox =
        card.querySelector(
          '[data-planning-gantt-select]'
        );


      if (checkbox) {
        checkbox.checked = true;
      }


      /*
       * ESTE É O MESMO EVENTO DO DRAG.
       *
       * Portanto o Gantt continua decidindo:
       *
       * verde  = máquina compatível
       * vermelho = máquina incompatível
       */
      dispatchPlanningMaterialDragToGantt(
        'start',
        selection
      );


      const calendar =
        planningScheduleRendererHost
          ?.getRootElement?.()

        ||

        target.querySelector(
          '.gantt-aps'
        );


      /*
       * Só serve para habilitar clique
       * nas células enquanto há um card
       * selecionado.
       */
      calendar?.setAttribute?.(
        'data-planning-material-click-mode',
        'true'
      );


      return true;
    }


    /*
     * CHECKBOX DO CARD
     */
    materialsTarget?.addEventListener(
      'change',
      event => {

        const checkbox =
          event.target?.closest?.(
            '[data-planning-gantt-select]'
          );


        if (!checkbox) {
          return;
        }


        const card =
          checkbox.closest(
            '.planning-material-program-card'
          );


        /*
         * Desmarcou o mesmo card.
         */
        if (!checkbox.checked) {

          if (
            card
              ?.dataset
              ?.selectedForGantt
            === 'true'
          ) {
            clearPlanningProgramSelection();
          }

          return;
        }


        if (
          !selectPlanningProgramCard(
            card
          )
        ) {
          checkbox.checked = false;
        }
      }
    );


    /*
     * CLIQUE NO GANTT DEPOIS
     * QUE UM CARD FOI SELECIONADO.
     */
    timelineTarget?.addEventListener(
      'click',
      async event => {

        if (!planningProgramSelection) {
          return;
        }


        const cell =
          event.target?.closest?.(
            '.gantt-aps__drop-cell[data-date][data-resource-id]'
          );


        /*
         * Clique em cabeçalho, nome da máquina,
         * barra existente etc.
         */
        if (!cell) {
          return;
        }


        event.preventDefault?.();
        event.stopPropagation?.();


        const machineId =
          String(
            cell.dataset.resourceId
            || ''
          );


        const date =
          String(
            cell.dataset.date
            || ''
          ).slice(
            0,
            10
          );


        const isCompatible =
          planningProgramSelection
            .compatibleMachineIds
            .map(String)
            .includes(
              machineId
            );


        if (
          !isCompatible
          || !isValidDateOnly(date)
        ) {

          toast(
            new Error(
              'Este material não pode ser programado nesta máquina.'
            )
          );

          return;
        }


        const machine =
          planningProgramSelection
            .compatibleMachines
            .find(item => (
              String(
                item?.machineId
                || ''
              )
              ===
              machineId
            ));


        /*
         * Guardamos antes de limpar,
         * pois é o material que será
         * enviado para o mesmo modal
         * usado no drag.
         */
        const material =
          planningProgramSelection.material;


        clearPlanningProgramSelection();


        await handlePlanningMaterialDropPreview({
          material,

          to: {
            date,

            machineId,

            machineName:
              machine?.machineName
              || machineId
          }
        });
      }
    );


    materialsTarget?.addEventListener(
  'dragstart',
  event => {

    /*
     * Se o usuário resolver arrastar,
     * sai do modo checkbox e continua
     * funcionando como antes.
     */
    clearPlanningProgramSelection();

    {
    const card =
      event.target?.closest?.(
        '.planning-material-program-card'
      );

    const selection =
      planningProgramSelectionForCard(
        card
      );

    if (!selection) {
      event.preventDefault?.();
      return;
    }

    card.dataset.dragging =
      'true';

    event.dataTransfer?.setData?.(
      'text/plain',
      selection.material.materialName
      || selection.material.operationId
      || 'Transporte'
    );

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed =
        'copy';
    }

    dispatchPlanningMaterialDragToGantt(
      'start',
      selection
    );

    return;
    }

    /*
     * TRANSPORTE
     */
    const transportCard =
      event.target?.closest?.(
        '.planning-transport-program-card'
      );


    if (transportCard) {

      const transport =
        planningTransportCardByKey(
          transportCard
            .dataset
            .transportKey
        );


      if (!transport) {
        event.preventDefault?.();
        return;
      }


      transportCard.dataset.dragging =
        'true';


      event.dataTransfer?.setData?.(
        'text/plain',

        `Transporte - ${
          transport.materialName
        }`
      );


      if (
        event.dataTransfer
      ) {
        event.dataTransfer.effectAllowed =
          'copy';
      }


      /*
       * ÚNICO destino permitido:
       * resource lógico Transporte.
       */
      dispatchPlanningMaterialDragToGantt(
        'start',
        {
          material:
            transport,

          compatibleMachineIds: [
            'Transporte'
          ],

          compatibleMachines: [
            {
              machineId:
                'Transporte',

              machineName:
                'Transporte'
            }
          ]
        }
      );


      return;
    }


    /*
     * PRODUÇÃO NORMAL
     */
    const card =
      event.target?.closest?.(
        '.planning-material-program-card'
      );


    if (
      !card

      ||

      card.classList.contains(
        'is-blocked'
      )

      ||

      card.classList.contains(
        'is-completed'
      )
    ) {
      event.preventDefault?.();
      return;
    }


    const material =
      planningMaterialToScheduleByOperationId(
        card.dataset.operationId
      );


    if (
      !material
      || material.blocked
    ) {
      event.preventDefault?.();
      return;
    }


    const compatibleMachines =
      compatiblePlanningMachinesForMaterial(
        material
      );


    card.dataset.dragging =
      'true';


    event.dataTransfer?.setData?.(
      'text/plain',

      material.materialName
      || material.operationId
    );


    if (
      event.dataTransfer
    ) {
      event.dataTransfer.effectAllowed =
        'copy';
    }


    dispatchPlanningMaterialDragToGantt(
      'start',
      {
        material,

        compatibleMachineIds:
          compatibleMachines.map(
            machine =>
              String(
                machine.machineId
              )
          ),

        compatibleMachines
      }
    );
  }
);
    materialsTarget?.addEventListener('dragend', event => {
      event.target?.closest?.('.planning-material-program-card')?.removeAttribute?.('data-dragging');
      dispatchPlanningMaterialDragToGantt('end');
    });

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

    function renderPlanningModePills() {

  if (!modePillsTarget) {
    return;
  }


  modePillsTarget.innerHTML = `
    <button
      type="button"
      class="planning-mode-pill ${
        draft.planningMode
        !== 'theoretical'
          ? 'is-active'
          : ''
      }"
      data-planning-mode="real"
    >
      Real
    </button>

    <button
      type="button"
      class="planning-mode-pill ${
        draft.planningMode
        === 'theoretical'
          ? 'is-active'
          : ''
      }"
      data-planning-mode="theoretical"
      title="Ignora estoque e calcula toda a cadeia produtiva."
    >
      Te&oacute;rico
    </button>
  `;


  modePillsTarget
    .querySelectorAll(
      '[data-planning-mode]'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const nextMode =
            button.dataset
              .planningMode
            === 'theoretical'

              ? 'theoretical'

              : 'real';


          if (
            draft.planningMode
            === nextMode
          ) {
            return;
          }


          draft.planningMode =
            nextMode;


          /*
           * A simulação anterior pertence
           * ao outro modo.
           */
          closeCalendarAfterProductionPriorityChange();


          saveDraftNow();


          renderPlanningModePills();


          /*
           * A alteração fica pendente.
           * O usuário precisa clicar em Simular
           * para aplicar o novo modo.
           */
          queueSimulationRefresh({
            immediate: true
          });
        }
      );

    });
}

    function queueSimulationRefresh(
  {
    immediate = false
  } = {}
) {
  clearTimeout(
    recalculationTimer
  );
  void immediate;
  hasPendingSimulationChanges = true;

  const ready = draft.productions.every(production => (
    findMaterialById(materials, production.materialId)
    && Number(production.plannedQty) > 0
  ));
  const notice = target.querySelector('.unsimulated-notice');
  if (notice) {
    notice.hidden = !ready;
    if (ready) {
      notice.textContent = 'Existem alterações ainda não simuladas. Clique em Simular para atualizar o planejamento.';
    }
  }
  target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', true);
  queueAutosave();
}

    function updateDraftFromGeneral() {
      draft.planningStartDate =
        form.elements.planningStartDate.value;
      draft.planningEndDate =
        form.elements.planningEndDate?.value || '';

      draft.setupHours =
        form.elements.setupHours?.value || '';

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
        if (material) {

  rerenderProductionsBuilder();

  queueSimulationRefresh();
}
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
            queueSimulationRefresh();
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
        queueSimulationRefresh();
      });
      page.appendChild(backdrop);
      dialog.querySelector('input, select, button')?.focus();
    }

    form.elements.planningStartDate.addEventListener('input', updateDraftFromGeneral);
    form.elements.planningEndDate?.addEventListener('input', updateDraftFromGeneral);
    form.elements.setupHours?.addEventListener('input', () => {
      updateDraftFromGeneral();
      queueSimulationRefresh();
    });

    async function viewPlanningRange() {
      updateDraftFromGeneral();
      const startDate = String(draft.planningStartDate || '').slice(0, 10);
      const endDate = isValidDateOnly(draft.planningEndDate)
        ? String(draft.planningEndDate).slice(0, 10)
        : startDate;
      if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate) || endDate < startDate) {
        toast(new Error('Selecione um período válido no calendário.'));
        return;
      }
      const thresholdOptions =
        planningStockProjectionThresholdOptions();


      const minimumDays =
        Number(
          thresholdOptions
            .minimumDays
        ) > 0

          ? Number(
              thresholdOptions
                .minimumDays
            )

          : 15;


      const idealDays =
        Number(
          thresholdOptions
            .idealDays
        ) > 20

          ? Number(
              thresholdOptions
                .idealDays
            )

          : 45;


      /*
       * Fazemos as duas consultas em paralelo:
       *
       * 1. calendário / planejamentos salvos;
       * 2. projeção teórica do estoque para
       *    cada dia do range.
       */
      const [
        calendarData,
        stockAlertData
      ] =
        await Promise.all([

          api(
            `/planning/calendar?startDate=${
              encodeURIComponent(
                startDate
              )
            }&endDate=${
              encodeURIComponent(
                endDate
              )
            }`
          ),

          api(
            `/planning/analysis/stock-alerts?start=${
              encodeURIComponent(
                startDate
              )
            }&end=${
              encodeURIComponent(
                endDate
              )
            }&minimumDays=${
              encodeURIComponent(
                minimumDays
              )
            }&criticalDays=15&attentionDays=20&idealDays=${
              encodeURIComponent(
                idealDays
              )
            }`
          )

        ]);


      currentPlanningRangeStockAlerts =
        new Map(
          Object.entries(
            stockAlertData?.alerts
            ||
            {}
          )
        );


      /*
       * Entramos oficialmente no modo
       * de visualização teórica.
       */
      planningRangePreviewActive =
        true;


      /*
       * Evita reutilizar uma projeção
       * pertencente a uma simulação antiga.
       *
       * Ao clicar em um dia, a projeção
       * detalhada será carregada daquele dia.
       */
      currentPlanningStockProjection =
        null;
      const previewResult = {
        code: 'planning-range-preview',
        summary: {
          status: 'preview',
          planningStartDate: startDate,
          planningEndDate: endDate,
          selectedDate: startDate,
          shifts: normalizeShiftTimes(draft.shifts),
          manualWorkDates: [],
          dailyTeamOverrides: {},
          existingSchedules: Array.isArray(calendarData?.existingSchedules) ? calendarData.existingSchedules : []
        },
        days: buildPlanningDateRangeDays(startDate, endDate),
        operations: [],
        calendarOperations: [],
        holidays: Array.isArray(calendarData?.holidays) ? calendarData.holidays : [],
        machineOptions: buildPlanningProductivityMachineOptions(matrix),
        rangePreview: true
      };
      productionCalendarVisualState = {
        ...productionCalendarVisualState,
        visibleStartDate: startDate,
        visibleEndDate: endDate,
        selectedAllocationId: null
      };
      currentPlanningStockAlerts = new Map();
      const resultsTarget = target.querySelector('.planning-results');
      const timelineTarget = target.querySelector('.timeline-target');
      const materialsPanel = target.querySelector('.planning-materials-program-panel');
      const previewNotice = target.querySelector('.planning-range-preview-notice');
      const saveButton = target.querySelector('[name="save"]');
      if (materialsPanel) materialsPanel.hidden = true;
      target.querySelector('.planning-flow-shell')?.toggleAttribute('hidden', true);
      target.querySelector('.recalculate-planning')?.toggleAttribute('hidden', true);
      if (previewNotice) {
        previewNotice.hidden = false;
        previewNotice.textContent = startDate === endDate
          ? `Visualização do calendário em ${formatDateOnly(startDate)}. Nenhuma produção nova foi simulada.`
          : `Visualização do calendário de ${formatDateOnly(startDate)} até ${formatDateOnly(endDate)}. Nenhuma produção nova foi simulada.`;
      }
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.title = 'A visualização do período não cria um planejamento para salvar.';
      }
      renderProductionCalendar(
        timelineTarget,
        previewResult,
        {
          ignoreManualDraft:
            true,

          readOnly:
            true,

          stockAlerts:
            true,

          previewStockAlerts:
            currentPlanningRangeStockAlerts
        }
      );
      if (resultsTarget) resultsTarget.hidden = false;
    }

    target.querySelector('.view-planning-range')?.addEventListener('click', () => {
      withOperationLoading('Carregando calendário...', viewPlanningRange).catch(toast);
    });

    target.querySelector('.planning-date-card')?.addEventListener('click', event => {
      const monthButton = event.target.closest('[data-calendar-month]');
      const dayButton = event.target.closest('[data-planning-date]');
      if (monthButton?.dataset.calendarMonth) {
        draft.planningCalendarMonth = monthButton.dataset.calendarMonth;
        saveDraftNow();
        rerenderBuilder();
        return;
      }
      const clickedDate = dayButton?.dataset.planningDate;
      if (!clickedDate) return;
      const nextRange = resolvePlanningDateRangeSelection(
        draft.planningStartDate,
        draft.planningEndDate,
        clickedDate
      );
      draft.planningStartDate = nextRange.startDate;
      draft.planningEndDate = nextRange.endDate;
      draft.planningCalendarMonth = `${clickedDate.slice(0, 7)}-01`;
      hasPendingSimulationChanges = true;
      closeCalendarAfterProductionPriorityChange();
      rerenderBuilder();
    });

    shiftsTarget.addEventListener('input', event => {
      const card = event.target.closest('[data-shift-id]');
      if (!card) return;
      const shift = draft.shifts.find(item => item.id === card.dataset.shiftId);
      if (!shift || !event.target.name) return;
      shift[event.target.name] = event.target.value;
      if (event.target.name === 'matrixTeamAvailable' || event.target.name === 'feitalTeamAvailable') {
        const matrix = Math.max(Number(shift.matrixTeamAvailable) || 0, 0);
        const feital = Math.max(Number(shift.feitalTeamAvailable) || 0, 0);
        shift.teamAvailable = matrix + feital;
        const totalTarget = card.querySelector('[data-shift-team-total]');
        if (totalTarget) totalTarget.innerHTML = `<strong>Equipe total:</strong> ${escapeHtml(matrix + feital)}`;
      }
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
          renderSimulation(currentSimulation, form, { restoreManualDraft: true });
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
      const previousNumber = planningProductionNumber(
        previousProduction || {},
        Math.max(draft.productions.length - 1, 0)
      );
      const production = emptyProduction(draft.productions.length);
      production.productionNumber = draft.productions.length ? previousNumber + 1 : 1;
      production.title = `Produ&ccedil;&atilde;o ${production.productionNumber}`;
      production.color = automaticProductionColor(production.productionNumber - 1);
      draft.productions.push(production);
      hasPendingSimulationChanges = true;
      rerenderBuilder();
    });

    target.querySelector('.clear-planning').addEventListener('click', () => {
      if (!confirm('Limpar o planejamento atual e apagar o rascunho local?')) return;
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(RUNTIME_DRAFT_KEY);
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
      const previousPayload =
  lastPayload
    ? JSON.parse(
        JSON.stringify(
          lastPayload
        )
      )
    : null;


const preservedManualDraft =
  manualScheduleDraft?.dirty

    ? JSON.parse(
        JSON.stringify(
          manualScheduleDraft
        )
      )

    : null;


const preservedDailyTeamOverrides =
  JSON.parse(
    JSON.stringify(
      manualScheduleDraft
        ?.dailyTeamOverrides

      ||

      draft.dailyTeamOverrides

      ||

      {}
    )
  );


const preservedManualWorkDates = [
  ...(
    manualScheduleDraft
      ?.manualWorkDates

    ||

    draft.manualWorkDates

    ||

    lastPayload
      ?.manualWorkDates

    ||

    []
  )
];


draft.dailyTeamOverrides =
  preservedDailyTeamOverrides;


draft.manualWorkDates =
  preservedManualWorkDates;


updateDraftFromGeneral();


if (!validateDraft(form)) {
  return null;
}


/*
 * =========================================================
 * LIMITE DE ESTOQUE - NOVA SIMULAÇÃO
 * =========================================================
 *
 * stockLimitRecoveryQty é uma decisão tomada dentro de uma
 * simulação anterior.
 *
 * Ela NÃO pode sobreviver quando o usuário aperta
 * "Simular" novamente, porque senão o Guard entende:
 *
 * recuperação necessária = 6.000
 * recuperação já aplicada = 6.000
 *
 * e deixa de abrir o modal.
 *
 * IMPORTANTE:
 * removemos SOMENTE stockLimitRecoveryQty.
 *
 * Outros overrides continuam intactos:
 * - máquina;
 * - pessoas;
 * - modelo produtivo;
 * - data;
 * - etc.
 *
 * As recalculações internas feitas depois que o usuário
 * aceita o modal NÃO passam novamente por simulateCurrent(),
 * então a recuperação escolhida continua funcionando
 * normalmente naquele ciclo.
 */
draft.operationOverrides =
  draft.operationOverrides
  &&
  typeof draft.operationOverrides
  ===
  'object'

    ? draft.operationOverrides
    : {};


Object
  .entries(
    draft.operationOverrides
  )
  .forEach(
    ([
      key,
      override
    ]) => {

      if (
        !override
        ||
        typeof override
        !==
        'object'

        ||

        !Object.prototype.hasOwnProperty.call(
          override,
          'stockLimitRecoveryQty'
        )
      ) {
        return;
      }


      const {
        stockLimitRecoveryQty,
        ...remainingOverride
      } =
        override;


      /*
       * Se havia outras configurações nesse override,
       * preservamos normalmente.
       */
      if (
        Object.keys(
          remainingOverride
        ).length
      ) {

        draft.operationOverrides[
          key
        ] =
          remainingOverride;

      } else {

        /*
         * Se o objeto servia exclusivamente para
         * stockLimitRecoveryQty, removemos a chave.
         */
        delete draft.operationOverrides[
          key
        ];

      }

    }
  );


saveDraftNow();


const nextPayload =
  payload();

const previousProductions =
  Array.isArray(
    previousPayload
      ?.productions
  )
    ? previousPayload.productions
    : [];


const nextProductions =
  Array.isArray(
    nextPayload
      ?.productions
  )
    ? nextPayload.productions
    : [];


const productionSignature =
  production =>
    JSON.stringify({
      materialId:
        String(
          production
            ?.materialId
          ?? ''
        ),

      plannedQty:
        Number(
          production
            ?.plannedQty
          || 0
        ),

      plannedUnit:
        String(
          production
            ?.plannedUnit
          || ''
        ),

      machineName:
        String(
          production
            ?.machineName
          || ''
        ),

      peopleCount:
        Number(
          production
            ?.peopleCount
          || 0
        ),

      productionModelName:
        String(
          production
            ?.productionModelName
          || ''
        )
    });


const samePlanningBase =
  Boolean(
    previousPayload
  )

  &&

  String(
    previousPayload
      ?.planningMode
    || 'real'
  )
  ===
  String(
    nextPayload
      ?.planningMode
    || 'real'
  )

  &&

  String(
    previousPayload
      ?.planningStartDate
    || ''
  )
  ===
  String(
    nextPayload
      ?.planningStartDate
    || ''
  )

  &&

  Number(
    previousPayload
      ?.setupHours
    || 0
  )
  ===
  Number(
    nextPayload
      ?.setupHours
    || 0
  )

  &&

  JSON.stringify(
    previousPayload
      ?.shifts
    || []
  )
  ===
  JSON.stringify(
    nextPayload
      ?.shifts
    || []
  );


const sharedProductionCount =
  Math.min(
    previousProductions.length,
    nextProductions.length
  );

const canPreserveManualSchedule =
  Boolean(
    preservedManualDraft
  )

  &&

  samePlanningBase

  &&

  previousProductions
    .slice(
      0,
      sharedProductionCount
    )
    .every(
    (production, index) =>
      productionSignature(
        production
      )
      ===
      productionSignature(
        nextProductions[
          index
        ]
      )
  );


if (
  manualScheduleDraft?.dirty
  &&
  !canPreserveManualSchedule
) {

  const discard =
    confirm(
      'Existem alteracoes manuais no calendario. Recalcular automaticamente descartara essas alteracoes.'
    );


  if (!discard) {
    return null;
  }


  manualScheduleDraft =
    null;


  draft.manualScheduleDraft =
    null;

} else if (
  canPreserveManualSchedule
) {

  const preservedForNextPlanning =
    nextProductions.length < previousProductions.length
      ? {
          ...preservedManualDraft,
          allocations: (preservedManualDraft.allocations || []).filter(allocation => {
            const productionIndex = Number(allocation?.productionIndex);
            return !Number.isInteger(productionIndex) || productionIndex < nextProductions.length;
          }),
          transports: (preservedManualDraft.transports || []).filter(transport => {
            const productionIndex = Number(transport?.productionIndex);
            return !Number.isInteger(productionIndex) || productionIndex < nextProductions.length;
          }),
          validation: null,
          dirty: true
        }
      : preservedManualDraft;

  manualScheduleDraft =
    preservedForNextPlanning;


  draft.manualScheduleDraft =
    preservedForNextPlanning;
}


lastPayload =
  nextPayload;


draft.lastPayload =
  lastPayload;


let result =
  applySkippedProductionCascade(
    await simulatePlanningRequest(
      lastPayload
    )
  );
      if (syncStockOnlyMaterialsFromSimulation(result)) {
        lastPayload = payload();
        draft.lastPayload = lastPayload;
        result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
      }
      if (captureAutomaticBaseline) {
        const wireRodDecision = await requestMandatoryWireRodChoices(result);
        if (wireRodDecision.action === 'cancel') {
          return null;
        }
        if (wireRodDecision.action === 'apply') {
          applyMandatoryWireRodChoices(wireRodDecision.selections);
          saveDraftNow();
          lastPayload = payload();
          draft.lastPayload = lastPayload;
          result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
          if (syncStockOnlyMaterialsFromSimulation(result)) {
            lastPayload = payload();
            draft.lastPayload = lastPayload;
            result = applySkippedProductionCascade(await simulatePlanningRequest(lastPayload));
          }
        }
      }
         if (
  draft.planningMode
  === 'theoretical'
) {

  for (
    let modelAttempt = 0;
    modelAttempt < 5;
    modelAttempt += 1
  ) {

    const theoreticalDecision =
      await requestTheoreticalMaterialChoices(
        result
      );


    if (
      theoreticalDecision.action
      === 'cancel'
    ) {
      return null;
    }


    if (
      theoreticalDecision.action
      !== 'apply'
    ) {
      break;
    }


    const changed =
      applyProductionShortageDecisions(
        theoreticalDecision.decisions
      );


    if (!changed) {
      break;
    }


    rerenderProductionsBuilder();


    lastPayload =
      payload();


    draft.lastPayload =
      lastPayload;


    result =
      applySkippedProductionCascade(
        await simulatePlanningRequest(
          lastPayload
        )
      );
  }

} else {

  for (
    let shortageAttempt = 0;
    shortageAttempt < 3;
    shortageAttempt += 1
  ) {

    const shortageDecision =
      await requestProductionShortageDecisions(
        result
      );


    if (
      shortageDecision.action
      === 'cancel'
    ) {
      return null;
    }


    if (
      shortageDecision.action
      !== 'apply'
    ) {
      break;
    }


        const shortageChanged =
      applyProductionShortageDecisions(
        shortageDecision.decisions,
        shortageDecision.plannedReceipts
      );


    if (!shortageChanged) {
      break;
    }


    rerenderProductionsBuilder();


    lastPayload =
      payload();


    draft.lastPayload =
      lastPayload;


    result =
      applySkippedProductionCascade(
        await simulatePlanningRequest(
          lastPayload
        )
      );
  }

  /*
 * Depois de resolver falta de matéria-prima,
 * verificamos mínimo/máximo dos materiais.
 */
if (
  draft.planningMode
  ===
  'real'
) {

  for (
    let stockLimitAttempt = 0;
    stockLimitAttempt < 5;
    stockLimitAttempt += 1
  ) {

    const stockLimitDecision =
      await requestPlanningStockLimitDecision(
        result
      );


    /*
     * Nenhum limite foi violado.
     */
    if (
      stockLimitDecision.action
      ===
      'none'
    ) {
      break;
    }


    /*
     * Usuário decidiu cancelar tudo.
     */
    if (
      stockLimitDecision.action
      ===
      'cancel'
    ) {
      return null;
    }


    /*
     * Usuário sabe do risco
     * e quer continuar mesmo assim.
     */
    if (
      stockLimitDecision.action
      ===
      'override'
    ) {
      break;
    }


    /*
     * Usuário aceitou a sugestão
     * ou informou outra quantidade.
     */
    if (
      stockLimitDecision.action
      !==
      'apply'
    ) {
      break;
    }


        const quantitiesChanged =
      applyPlanningStockLimitQuantities(
        stockLimitDecision.quantities
        || []
      );


    const recoveriesChanged =
      applyPlanningStockLimitRecoveries(
        stockLimitDecision.recoveries
        || []
      );


    const changed =
      quantitiesChanged
      ||
      recoveriesChanged;


    if (
      !changed
    ) {
      break;
    }


    /*
     * Atualiza os cards lá em cima.
     */
    rerenderProductionsBuilder();


    /*
     * Simula tudo novamente.
     *
     * Isso é importante:
     * não confiamos apenas na conta sugerida.
     * O planejador inteiro confirma
     * se a nova quantidade realmente funciona.
     */
    lastPayload =
      payload();


    draft.lastPayload =
      lastPayload;


       result =
      applySkippedProductionCascade(

        await simulatePlanningRequest(
          lastPayload
        )

      );


    /*
     * A recuperação do mínimo pode aumentar a produção
     * de um intermediário e, com isso, aumentar também
     * a necessidade da matéria-prima anterior.
     *
     * Exemplo:
     *
     * Bobina normal      10.825,056
     * + recuperação       6.000,000
     * = Bobina total     16.825,056
     *
     * Portanto precisamos resolver eventual shortage
     * NOVAMENTE antes de avaliar o mínimo outra vez.
     */
    if (
      recoveriesChanged
      &&
      draft.planningMode
      ===
      'real'
    ) {

      for (
        let recoveryShortageAttempt = 0;
        recoveryShortageAttempt < 3;
        recoveryShortageAttempt += 1
      ) {

        const recoveryShortageDecision =
          await requestProductionShortageDecisions(
            result
          );


        if (
          recoveryShortageDecision.action
          ===
          'cancel'
        ) {
          return null;
        }


        /*
         * Nenhum novo shortage para resolver,
         * ou usuário decidiu prosseguir.
         */
        if (
          recoveryShortageDecision.action
          !==
          'apply'
        ) {
          break;
        }


        const recoveryShortageChanged =
          applyProductionShortageDecisions(
            recoveryShortageDecision.decisions,
            recoveryShortageDecision.plannedReceipts
          );


        if (
          !recoveryShortageChanged
        ) {
          break;
        }


        rerenderProductionsBuilder();


        lastPayload =
          payload();


        draft.lastPayload =
          lastPayload;


        result =
          applySkippedProductionCascade(
            await simulatePlanningRequest(
              lastPayload
            )
          );

      }

    }


  }

}
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

      /*
       * REAL:
       * a simulação decide se precisa produzir
       * olhando o saldo agregado.
       *
       * O planejamento manual precisa de outra
       * informação: ONDE esse saldo está.
       *
       * Portanto congelamos no resultado o
       * snapshot atual material + local.
       */
      if (
        draft.planningMode
        === 'real'
      ) {
        try {
          /*
           * Não reaproveita estoque antigo de
           * outra simulação da mesma tela.
           */
          stockOverviewCache =
            null;

          const currentStockRows =
            await loadStockOverviewRows();

          result = {
            ...result,

            manualPlanningLocalStockSnapshot:
              manualPlanningLocalStockSnapshotFromOverviewRows(
                currentStockRows
              )
          };

        } catch (error) {
          console.warn(
            'Nao foi possivel carregar o estoque por local para o transporte manual.',
            error
          );
        }
      }

      renderSimulation(
  result,
  form,
  {
    captureAutomaticBaseline,

    manualFoundation:
      true,

    restoreManualDraft:
      canPreserveManualSchedule
  }
);
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
        PlanningAllocationEditor({
          allocation: editorAllocation,
          machines: orderedMachines,
          allowSplit: false,
          lockPosition: true,
          emptyMessage: 'Nenhuma configuração compatível foi encontrada na Matriz para este material no destino.',
          getDistributionPreview: (previewAllocation, percents, options) => buildManualScheduleAllocationParts(previewAllocation, percents, options),
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
        productionCalendarMoveInProgress = true;
        setOperationLoading(true, 'Validando movimentação...');
        const validationContext = await currentManualScheduleValidationContextWithFreshStock(calendarSnapshot);
        const draftContext = {
          now: transactionTimestamp,
          validatedAt: transactionTimestamp,
          machines: calendarSnapshot.machines,
          matrixRows: moveConfiguration.productivityRows || matrix,
          days: calendarSnapshot.days,
          dailyMinutes: planningDraftDailyMinutes()
        };
        const installAcceptedMove = (transaction, { operation } = {}) => {
          const acceptedAllocationId = operation?.move?.allocation?.allocationId || move.allocation.allocationId;
          manualScheduleDraft = transaction.draft;
          draft.manualScheduleDraft = manualScheduleDraft;
          recordAcceptedManualState(previousManualState);
          saveDraftNow();
          refreshTimelineOnly();
          if (String(previousVisualState.selectedAllocationId || '') === String(acceptedAllocationId || '')) {
            productionCalendarVisualState = {
              ...productionCalendarVisualState,
              selectedAllocationId: null
            };
          }
          toast(transaction.warnings.length
            ? `Produção movimentada com ${transaction.warnings.length} alerta(s).`
            : 'Produção movimentada no rascunho manual.');
        };

        await runPlanningManualMoveController({
          currentDraft: manualScheduleDraft,
          intent,
          move,
          moveConfiguration,
          calendarSnapshot,
          validationContext,
          draftContext,
          onAccepted: installAcceptedMove,
          onStockUnavailable: ({ allocation, date, analysis }) => openManualStockUnavailableModal({
            allocation,
            date,
            analysis
          }),
          onBeforePartialChoice: () => setOperationLoading(false),
          onStockPartialChoice: ({ allocation, date, analysis, getDateOptions }) => openManualStockPartialMoveModal({
            allocation,
            date,
            analysis,
            getDateOptions
          })
        });
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
        let simulation =
          currentSimulation;

        if (
          manualScheduleDraft?.allocations?.length
          && currentSimulation
        ) {
          const snapshot =
            buildProductionCalendarSnapshot(
              currentSimulation,
              {
                ignoreManualDraft: true
              }
            );

          const validationTransaction =
            applyManualScheduleTransaction({
              currentDraft:
                manualScheduleDraft,

              intent: {
                type:
                  'VALIDATE_DRAFT'
              },

              draftContext: {
                validatedAt:
                  new Date()
                    .toISOString()
              },

              validationContext:
                currentManualScheduleValidationContext(
                  snapshot
                )
            });

          manualScheduleDraft =
            validationTransaction.draft;

          draft.manualScheduleDraft =
            manualScheduleDraft;

          if (
            !validationTransaction.accepted
          ) {
            throw new Error(
              validationTransaction
                .blockingIssues?.[0]
                ?.message
              ||
              'O calendário manual possui erros bloqueantes.'
            );
          }

          refreshTimelineOnly();
        } else {
          simulation =
            await withOperationLoading(
              'Recalculando produção...',
              simulateCurrent
            );
        }

        if (!simulation) {
          return;
        }

        draft.planningCode =
          draft.planningCode
          ||
          generatePlanningCode(
            draft.productions.length
          );

        lastPayload =
          normalizePlanningPayload(
            lastPayload
            ||
            payload(),

            draft.planningCode
          );

        saveDraftNow();

        openFinalSummaryModal(
          currentSimulation,
          draft.planningCode
        );

        window.dispatchEvent(
          new CustomEvent(
            'planejamento:toast',
            {
              detail:
                `Resumo do planejamento ${draft.planningCode} pronto para lançamento.`
            }
          )
        );
      } catch (error) {
        toast(error);
      }
    });

    const shouldAutoSimulateFromPcp =
      sessionStorage.getItem(
        'planejamento_pcp_auto_simulate'
      ) === '1';

    if (
      shouldAutoSimulateFromPcp
    ) {
      sessionStorage.removeItem(
        'planejamento_pcp_auto_simulate'
      );

      try {
        await withOperationLoading(
          'Simulando planejamento...',
          simulateCurrent
        );
      } catch (error) {
        toast(error);
      }
    }
  }

  async function renderHistoryTab() {
  target.innerHTML = `
    <div class="panel planning-history-panel">
      <div class="section-heading">
        <h2>
          Hist&oacute;rico de Planejamentos
        </h2>

        <button
          class="secondary-button refresh-history"
          type="button"
        >
          Atualizar
        </button>
      </div>

      <div
        class="planning-history-target"
      ></div>
    </div>
  `;

  const historyTarget =
    target.querySelector(
      '.planning-history-target'
    );

  async function loadHistory() {
    const rows =
      await api(
        '/planning/plans'
      );

    historyTarget.innerHTML =
      '';

    historyTarget.appendChild(
      DataTable({
        columns: [
          {
            label:
              'Planejamento',

            render:
              row => `
                <strong>
                  ${
                    escapeHtml(
                      row.code
                      ||
                      String(
                        row.id
                      )
                    )
                  }
                </strong>

                <br>

                <span class="muted-text">
                  ${
                    escapeHtml(
                      row.material_name
                      ||
                      ''
                    )
                  }
                </span>
              `,

            sortValue:
              row =>
                row.code
                ||
                row.id
          },

          {
            label:
              'Per&iacute;odo',

            render:
              row =>
                row.period_label
                ||
                operationPeriod(
                  row.operations,
                  row.start_date,
                  row.end_date
                ).label,

            sortValue:
              row =>
                row.period_start_date
                ||
                row.start_date
                ||
                ''
          },

          {
            label:
              'Produ&ccedil;&otilde;es',

            render:
              row => {
                const children =
                  Array.isArray(
                    row.schedule_tree
                      ?.children
                  )
                    ? row.schedule_tree.children
                    : [];

                const match =
                  String(
                    row.material_name
                    ||
                    ''
                  )
                    .match(
                      /^(\d+)\s+produ/i
                    );

                return children.length
                  &&
                  isPlanningRootName(
                    row.schedule_tree
                      ?.materialName
                  )

                    ? children.length

                    : Number(
                        match?.[1]
                        ||
                        1
                      );
              }
          },

          {
            label:
              'M&aacute;quinas utilizadas',

            render:
              row =>
                escapeHtml(
                  (
                    row.schedule_summary
                      ?.machineNames
                    ||
                    []
                  ).join(
                    ', '
                  )
                  ||
                  '-'
                ),

            sortValue:
              row =>
                (
                  row.schedule_summary
                    ?.machineNames
                  ||
                  []
                ).join(
                  '|'
                )
          },

          {
            label:
              'Programa&ccedil;&atilde;o lan&ccedil;ada',

            render:
              row => {
                const allocations =
                  Number(
                    row.schedule_summary
                      ?.allocationCount
                    ||
                    0
                  );

                const transports =
                  Number(
                    row.schedule_summary
                      ?.transportCount
                    ||
                    0
                  );

                return `
                  <strong>
                    ${allocations}
                  </strong>
                  aloca&ccedil;&atilde;o(&otilde;es)

                  <br>

                  <span class="muted-text">
                    ${transports} transporte(s)
                  </span>
                `;
              },

            sortValue:
              row =>
                Number(
                  row.schedule_summary
                    ?.operationCount
                  ||
                  0
                )
          },

          {
            label:
              'Status',

            render:
              row =>
                planningStatusPill(
                  row.status
                ),

            sortValue:
              row =>
                formatStatus(
                  row.status
                )
          },

          {
            label:
              'A&ccedil;&otilde;es',

            render:
              row => `
                <div class="history-actions">
                  <button
                    class="small-action-button"
                    data-view="${row.id}"
                    type="button"
                  >
                    Visualizar
                  </button>

                  <button
                    class="small-action-button"
                    data-pdf="${row.id}"
                    type="button"
                  >
                    Gerar PDF
                  </button>

                  ${
                    canWritePlanning
                    &&
                    !isCanceledStatus(
                      row.status
                    )

                      ? `
                        <button
                          class="small-action-button danger"
                          data-cancel="${row.id}"
                          type="button"
                        >
                          Cancelar
                        </button>
                      `

                      : ''
                  }

                                       ${
                    canWritePlanning

                      ? `
                        <button
                          class="small-action-button danger planning-delete-button"
                          data-delete="${row.id}"
                          data-delete-code="${escapeHtml(
                            row.code
                            ||
                            String(row.id)
                          )}"
                          type="button"
                          title="Excluir definitivamente"
                          aria-label="Excluir definitivamente o planejamento ${escapeHtml(
                            row.code
                            ||
                            String(row.id)
                          )}"
                        >
                          🗑
                        </button>
                      `

                      : ''
                  } 
                </div>
              `
          }
        ],

        rows,

        rowClass:
          row =>
            isCanceledStatus(
              row.status
            )
              ? 'planning-canceled-row'
              : ''
      })
    );
  }

  async function downloadPdf(id) {
    const blob =
      await api(
        `/planning/plans/${id}/pdf`
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        'a'
      );

    link.href =
      url;

    link.download =
      `planejamento-${id}.pdf`;

    link.click();

    URL.revokeObjectURL(
      url
    );
  }

  async function cancelPlan(id) {
    if (
      !confirm(
        'Confirma o cancelamento deste planejamento?'
      )
    ) {
      return;
    }

    await api(
      `/planning/plans/${id}/cancel`,
      {
        method:
          'POST',

        body: {
          reason:
            'Cancelado pelo usuário'
        }
      }
    );

    await loadHistory();
  }

    async function deletePlan(
    id,
    code
  ) {
    const planLabel =
      String(
        code
        ||
        id
        ||
        ''
      );


    if (
      !confirm(
        `Excluir DEFINITIVAMENTE o planejamento ${planLabel}?\n\n`
        +
        'Essa ação vai remover o planejamento e sua programação salva do banco de dados.\n\n'
        +
        'Essa operação não pode ser desfeita.'
      )
    ) {
      return;
    }


    await api(
      `/planning/plans/${id}`,
      {
        method:
          'DELETE'
      }
    );


    toast(
      `Planejamento ${planLabel} excluído definitivamente.`
    );


    await loadHistory();
  }

  async function viewPlan(id) {
    const detail =
      await api(
        `/planning/plans/${id}`
      );

    openPlanDetailModal(
      detail
    );
  }

  target
    .querySelector(
      '.refresh-history'
    )
    .addEventListener(
      'click',
      () =>
        loadHistory()
          .catch(
            toast
          )
    );

  historyTarget.addEventListener(
    'click',
    async event => {
            if (
        event.target.dataset.delete
      ) {
        return deletePlan(
          event.target.dataset.delete,
          event.target.dataset.deleteCode
        );
      }
      if (
        event.target.dataset.pdf
      ) {
        return downloadPdf(
          event.target.dataset.pdf
        );
      }

      if (
        event.target.dataset.cancel
      ) {
        return cancelPlan(
          event.target.dataset.cancel
        );
      }

      if (
        event.target.dataset.view
      ) {
        return viewPlan(
          event.target.dataset.view
        );
      }
    }
  );

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
