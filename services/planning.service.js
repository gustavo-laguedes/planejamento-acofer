import { holidayForDate } from '../shared/holidays.js';
import { buildPlanningDailyAllocations } from './planningAllocation.service.js';

function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00`);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toNumber(value) {
  const rawValue = String(value ?? '').trim();
  const dotMatches = rawValue.match(/\./g) || [];
  const normalizedValue = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : dotMatches.length > 1
      ? rawValue.replace(/\./g, '')
      : rawValue;
  const number = Number(normalizedValue || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : null;
}

const MIN_DEPENDENCY_FINISH_BUFFER_MINUTES = 60;
const DEFAULT_TEAM_AVAILABLE = 6;
const MAX_WORKDAY_SEARCH_DAYS = 370;
const MAX_SCHEDULE_ITERATIONS = 10000;
const DAILY_BATCH_STOCK_EPSILON = 0.000001;

function planningSimulationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function planningDiagnostic(code, values = {}) {
  return {
    code,
    rule: 'planning_daily_batch_stock',
    severity: 'error',
    blocking: true,
    ...values
  };
}

function isDefaultShiftLabel(label = '') {
  return /^Turno\s*1$/i.test(String(label || '').trim()) || /^T1$/i.test(String(label || '').trim());
}

function defaultTeamAvailableForShift(shift = {}, index = 0) {
  const label = shift.label || `Turno ${index + 1}`;
  const available = Math.max(toNumber(shift.teamAvailable || DEFAULT_TEAM_AVAILABLE), 0);
  return isDefaultShiftLabel(label) ? Math.max(available, DEFAULT_TEAM_AVAILABLE) : available;
}

function isWeekend(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function isNonWorkingDate(date, calendar) {
  if (calendar.forceWorkDates?.has(date)) return false;
  return isWeekend(date) || Boolean(holidayForDate(date));
}

function withForcedWorkDate(calendar, date) {
  if (!date || !isNonWorkingDate(date, calendar)) return calendar;
  return {
    ...calendar,
    forceWorkDates: new Set([...(calendar.forceWorkDates || []), date])
  };
}

function toOperationalHours(value) {
  const rawValue = String(value ?? '').trim();
  const durationValue = rawValue.match(/^(\d+),(\d{2})$/);
  if (durationValue && Number(durationValue[2]) <= 59) {
    return Number(durationValue[1]) + (Number(durationValue[2]) / 60);
  }
  return toNumber(value);
}

function shiftAvailableHours(shift = {}) {
  const start = parseTime(shift.shiftStartTime, '07:00');
  const fallbackDailyMinutes = Math.max(toOperationalHours(shift.hoursPerDay || 8), 1 / 60) * 60;
  let end = parseTime(shift.shiftEndTime, minutesToTime(start + fallbackDailyMinutes));
  if (end <= start) end += 24 * 60;
  return Math.max(Math.min(end - start, fallbackDailyMinutes) / 60, 1 / 60);
}

function normalizedMaterialKey(operation) {
  if (operation.operationType === 'transport') return operation.operationId || `transport:${operation.productionKey}:${operation.productionOrder}`;
  if (operation.splitParentOperationId) return operation.operationId;
  const materialKey = operation.materialId ? String(operation.materialId) : [
    String(operation.materialName || '').trim().toLowerCase(),
    operation.materialCode || '',
    operation.unit || ''
  ].join('|');
  return [
    materialKey,
    operation.machineName || '',
    operation.productionModelName || '',
    operation.unit || ''
  ].join('|');
}

function cleanCodePart(value) {
  return String(value || 'SEM-CODIGO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase() || 'SEM-CODIGO';
}

function formatCodeQuantity(quantity) {
  const number = toNumber(quantity);
  return Number.isInteger(number)
    ? String(number)
    : String(Number(number.toFixed(3)));
}

function codeForPlan(date = new Date(), productionCount = 1) {
  const pad = value => String(value).padStart(2, '0');
  const suffix = Number(productionCount || 0) > 1 ? String(productionCount).padStart(2, '0') : '';
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}${pad(date.getHours())}${pad(date.getMinutes())}PLANO${suffix}`;
}

function materialCode(material) {
  return Array.isArray(material?.codes) ? material.codes[0] || null : null;
}

function materialIdentifier(material) {
  return material?.operationId ?? material?.id ?? material?.materialId;
}

function materialName(material) {
  return material?.name ?? material?.materialName;
}

function materialCodeForOverride(material) {
  return materialCode(material) ?? material?.materialCode;
}

function machineOptions(material, matrixRows) {
  const codes = new Set((material.codes || []).map(code => String(code).toLowerCase()));
  return matrixRows.filter(row => {
    const rowCodes = Array.isArray(row.material_codes) ? row.material_codes : [];
    return row.material_name?.toLowerCase() === material.name.toLowerCase()
      || rowCodes.some(code => codes.has(String(code).toLowerCase()))
      || codes.has(String(row.material_code || '').toLowerCase());
  });
}

function matrixSecondsPerUnit(row) {
  const outputQty = Math.max(toNumber(row.output_qty), 1);
  const timeSeconds = toNumber(row.time_seconds || toNumber(row.time_minutes) * 60);
  return timeSeconds > 0 ? timeSeconds / outputQty : 1 / outputQty;
}

function matrixPriority(row) {
  const priority = Number(row?.machine_priority || 1);
  return Number.isFinite(priority) && priority > 0 ? priority : 1;
}

function rankMatrixRows(left, right) {
  return matrixPriority(left) - matrixPriority(right)
    || Number(right.people_count || 0) - Number(left.people_count || 0)
    || matrixSecondsPerUnit(left) - matrixSecondsPerUnit(right);
}

function materialSetupKey(operation = {}) {
  return [
    operation.materialId || '',
    String(operation.materialCode || '').trim().toLowerCase(),
    String(operation.materialName || '').trim().toLowerCase(),
    operation.productionModelName || '',
    operation.unit || ''
  ].join('|');
}

function productivityDailyCapacity(row, calendar) {
  const outputQty = toNumber(row?.output_qty);
  const dailyMinutes = Math.max(toNumber(calendar?.dailyMinutes), 1);
  const dailySeconds = dailyMinutes * 60;
  const sourceTimeSeconds = toNumber(row?.time_seconds || toNumber(row?.time_minutes) * 60);
  const usesCycleTime = sourceTimeSeconds > 0 && sourceTimeSeconds < dailySeconds;
  const capacityPerDay = outputQty > 0
    ? usesCycleTime
      ? outputQty * (dailySeconds / sourceTimeSeconds)
      : outputQty
    : 0;
  return {
    capacityPerDay,
    maxQtyPerMachineDay: capacityPerDay,
    maxQtyPerTeamDay: capacityPerDay,
    secondsPerUnit: outputQty > 0 ? dailySeconds / capacityPerDay : 0,
    sourceTimeSeconds: usesCycleTime ? sourceTimeSeconds : dailySeconds,
    sourceOutputQty: outputQty
  };
}

function resolveMatrix(material, matrixRows, requestedMachine, requestedPeople, maxPeople = null) {
  const options = machineOptions(material, matrixRows);
  const peopleLimit = Number(maxPeople || 0);
  const hasRequestedPeople = requestedPeople !== null && requestedPeople !== undefined && requestedPeople !== '';
  const fitOptions = peopleLimit > 0
    ? options.filter(row => Number(row.people_count || 0) <= peopleLimit)
    : options;
  const candidates = fitOptions.length ? fitOptions : options;
  const rankedCandidates = () => [...candidates].sort(rankMatrixRows);
  const bestAvailable = () => rankedCandidates()[0] || null;
  if (requestedMachine || hasRequestedPeople) {
    return rankedCandidates().find(row =>
      (!requestedMachine || row.machine_name === requestedMachine)
      && (!hasRequestedPeople || Number(row.people_count) === Number(requestedPeople))
    ) || null;
  }
  return bestAvailable();
}

function resolveMatrixCandidates(material, matrixRows, requestedMachine, requestedPeople, maxPeople = null) {
  const options = machineOptions(material, matrixRows);
  const peopleLimit = Number(maxPeople || 0);
  const hasRequestedPeople = requestedPeople !== null && requestedPeople !== undefined && requestedPeople !== '';
  let candidates = peopleLimit > 0
    ? options.filter(row => Number(row.people_count || 0) <= peopleLimit)
    : options;
  if (!candidates.length) candidates = options;
  if (requestedMachine || hasRequestedPeople) {
    const requested = candidates.filter(row =>
      (!requestedMachine || row.machine_name === requestedMachine)
      && (!hasRequestedPeople || Number(row.people_count) === Number(requestedPeople))
    );
    return requested.sort(rankMatrixRows);
  }
  return candidates.sort(rankMatrixRows);
}

function applyMatrixToOperation(operation, matrix, calendar) {
  const outputQty = toNumber(matrix.output_qty);
  const dailyMinutes = Math.max(toNumber(calendar?.dailyMinutes), 1);
  const dailySeconds = dailyMinutes * 60;
  const sourceTimeSeconds = toNumber(matrix.time_seconds || toNumber(matrix.time_minutes) * 60);
  const usesCycleTime = sourceTimeSeconds > 0 && sourceTimeSeconds < dailySeconds;
  const timeSeconds = usesCycleTime ? sourceTimeSeconds : dailySeconds;
  const minutesPerUnit = usesCycleTime
    ? (sourceTimeSeconds / 60) / Math.max(outputQty, 1)
    : dailyMinutes / Math.max(outputQty, 1);
  const totalMinutes = Math.ceil(operation.produceQty * minutesPerUnit);
  return {
    ...operation,
    machineName: matrix.machine_name,
    machinePriority: matrixPriority(matrix),
    peopleCount: Number(matrix.people_count),
    outputQty,
    outputUnit: matrix.output_unit || operation.unit || 'un',
    timeSeconds,
    dailyCapacity: productivityDailyCapacity(matrix, calendar),
    minutesPerUnit,
    totalMinutes
  };
}

function productivityOptions(material, matrixRows) {
  return machineOptions(material, matrixRows)
    .sort(rankMatrixRows)
    .map(row => ({
      machineName: row.machine_name,
      machinePriority: matrixPriority(row),
      peopleCount: Number(row.people_count),
      outputQty: toNumber(row.output_qty),
      outputUnit: row.output_unit || material.primary_unit || 'un',
      timeSeconds: toNumber(row.time_seconds || toNumber(row.time_minutes) * 60),
      secondsPerUnit: matrixSecondsPerUnit(row)
    }));
}

function overrideForMaterial(overrides = {}, material, productionIndex = null) {
  const id = materialIdentifier(material);
  const scopedIndex = productionIndex ?? material?.productionIndex;
  const scopedKeys = scopedIndex == null || id == null ? [] : [`${scopedIndex}:${id}`];
  const keys = [
    material?.operationId,
    ...scopedKeys,
    id,
    id == null ? null : String(id),
    material?.materialId,
    material?.id,
    materialName(material),
    materialCodeForOverride(material)
  ].filter(Boolean);
  for (const key of keys) {
    if (overrides[key]) return overrides[key];
  }
  return null;
}

function overrideStartCursor(override, fallbackDate, fallbackMinutes) {
  if (!override?.startDate) return null;
  if (String(override.startDate).includes('T')) {
    return splitDateTime(override.startDate, fallbackDate, fallbackMinutes);
  }
  return {
    date: override.startDate || fallbackDate,
    minutes: parseTime(override.startTime, minutesToTime(fallbackMinutes))
  };
}

function stockForMaterial(material, stockRows, correctionRows = []) {
  const codes = new Set((material.codes || []).map(code => String(code).trim().toLowerCase()));
  const locationsTotal = stockRows.reduce((sum, row) => {
    const productCode = String(row.product_code || '').trim().toLowerCase();
    const oldProductCode = String(row.old_product_code || '').trim().toLowerCase();
    return codes.has(productCode) || codes.has(oldProductCode)
      ? sum + toNumber(row.fiscal_balance_unit) + toNumber(row.error_balance_unit)
      : sum;
  }, 0);
  const correction = correctionRows
    .filter(row => String(row.material_id) === String(material.id))
    .reduce((sum, row) => sum + toNumber(row.correction_qty), 0);
  return locationsTotal + correction;
}

function makeStockLedger(context) {
  const balances = new Map();
  return {
    available(material) {
      const key = String(material.id);
      if (!balances.has(key)) {
        balances.set(key, stockForMaterial(material, context.stockRows, context.correctionRows));
      }
      return toNumber(balances.get(key));
    },
    consume(material, quantity) {
      const key = String(material.id);
      const available = this.available(material);
      const used = Math.min(available, Math.max(toNumber(quantity), 0));
      balances.set(key, Number((available - used).toFixed(6)));
      return used;
    }
  };
}

function stockOnlyKey(productionIndex, materialId) {
  return `${productionIndex}:${materialId}`;
}

function stockOnlySet(payload = {}) {
  const source = Array.isArray(payload.stockOnlyMaterials) ? payload.stockOnlyMaterials : [];
  return new Set(source.map(item => stockOnlyKey(item.productionIndex ?? 0, item.materialId)));
}

function skipProductionSet(payload = {}) {
  const source = Array.isArray(payload.skipProductionMaterials) ? payload.skipProductionMaterials : [];
  return new Set(source.map(item => stockOnlyKey(item.productionIndex ?? 0, item.materialId)));
}

function stockChoiceMap(payload = {}) {
  const source = Array.isArray(payload.stockOnlyMaterialChoices) ? payload.stockOnlyMaterialChoices : [];
  return new Map(source.map(item => [
    stockOnlyKey(item.productionIndex ?? 0, item.materialId),
    item?.useStock === true
  ]));
}

function selectedInputs(material, inputsByMaterialId, operationOverrides = {}, productionIndex = null) {
  const allInputs = inputsByMaterialId.get(String(material.id)) || [];
  const override = overrideForMaterial(operationOverrides, material, productionIndex);
  const selectedModelName = override?.productionModelName ? String(override.productionModelName) : null;
  if (selectedModelName) {
    return allInputs.filter(input => String(input.production_model_name || 'Modelo padrão') === selectedModelName);
  }
  const options = productionModelOptions(material, inputsByMaterialId, new Map());
  const defaultModelName = options[0]?.modelName || null;
  return defaultModelName
    ? allInputs.filter(input => String(input.production_model_name || 'Modelo padrão') === defaultModelName)
    : allInputs;
}

function productionModelOptions(material, inputsByMaterialId, materialsById) {
  const grouped = new Map();
  for (const input of inputsByMaterialId.get(String(material.id)) || []) {
    const modelName = String(input.production_model_name || 'Modelo padrão').trim() || 'Modelo padrão';
    if (!grouped.has(modelName)) grouped.set(modelName, []);
    const inputMaterial = materialsById.get(String(input.input_material_id));
    grouped.get(modelName).push({
      materialId: input.input_material_id,
      materialName: inputMaterial?.name || `Material ${input.input_material_id}`,
      qtyPerOutput: toNumber(input.qty_per_output || 1)
    });
  }
  return [...grouped.entries()].map(([modelName, inputs]) => ({
    modelName,
    inputs,
    label: `${modelName} (${inputs.map(input => input.materialName).join(' + ')})`
  }));
}

function operationForMaterial(material, state, productionOrder, context, requestedMachine, requestedPeople, operationOverrides = {}, productionIndex = null) {
  const requiredQty = toNumber(state.requiredQty);
  const stockQty = toNumber(state.stockAvailable);
  const produceQty = toNumber(state.produceQty);
  const operationScopedMaterial = productionIndex == null ? material : { ...material, operationId: `${productionIndex}:${material.id}`, productionIndex };
  const override = overrideForMaterial(operationOverrides, operationScopedMaterial, productionIndex);
  const matrix = resolveMatrix(material, context.matrixRows, override?.machineName || requestedMachine, override?.peopleCount ?? requestedPeople);
  const inputs = selectedInputs(operationScopedMaterial, context.inputsByMaterialId, operationOverrides, productionIndex);
  const modelOptions = productionModelOptions(material, context.inputsByMaterialId, context.materialsById);
  const productionModelName = inputs[0]?.production_model_name || modelOptions[0]?.modelName || null;
  return {
    materialId: material.id,
    materialName: material.name,
    materialCode: materialCode(material),
    requiredQty: Number(toNumber(requiredQty).toFixed(3)),
    stockQty: Number(stockQty.toFixed(3)),
    stockUsedQty: Number(toNumber(state.stockUsedQty).toFixed(3)),
    produceQty: Number(produceQty.toFixed(3)),
    unit: material.primary_unit,
    forceStockOnly: state.forceStockOnly === true,
    status: produceQty <= 0 ? 'Estoque suficiente' : 'Produzir diferença',
    isInitialRawMaterial: material.is_initial_raw_material === true,
    productionModelName,
    productionModelOptions: modelOptions,
    machineName: matrix?.machine_name || override?.machineName || requestedMachine || null,
    peopleCount: matrix?.people_count ?? override?.peopleCount ?? requestedPeople ?? null,
    productivityOptions: productivityOptions(material, context.matrixRows),
    productionOrder,
    children: []
  };
}

function buildRequirementTree({ material, quantity, materialsById, inputsByMaterialId, matrixRows, requestedMachine, requestedPeople, operationOverrides = {}, states, productionIndex = 0, productionTitle = '', productionColor = null }, stack = []) {
  const state = states?.get(String(material.id)) || {};
  const stockQty = toNumber(state.stockAvailable);
  const produceQty = toNumber(state.produceQty);
  const operationScopedMaterial = { ...material, operationId: `${productionIndex}:${material.id}`, productionIndex };
  const override = overrideForMaterial(operationOverrides, operationScopedMaterial, productionIndex);
  const matrix = resolveMatrix(material, matrixRows, override?.machineName || requestedMachine, override?.peopleCount ?? requestedPeople);
  const node = {
    productionIndex,
    productionKey: `production-${productionIndex}`,
    productionTitle,
    productionColor,
    materialId: material.id,
    materialName: material.name,
    materialCode: materialCode(material),
    requiredQty: toNumber(quantity),
    stockQty: Number(stockQty.toFixed(3)),
    stockUsedQty: Number(toNumber(state.stockUsedQty).toFixed(3)),
    produceQty: Number(produceQty.toFixed(3)),
    unit: material.primary_unit,
    forceStockOnly: state.forceStockOnly === true,
    status: produceQty <= 0 ? 'Estoque suficiente' : 'Produzir diferença',
    isInitialRawMaterial: material.is_initial_raw_material === true,
    machineName: matrix?.machine_name || override?.machineName || requestedMachine || null,
    peopleCount: matrix?.people_count ?? override?.peopleCount ?? requestedPeople ?? null,
    productivityOptions: productivityOptions(material, matrixRows),
    children: []
  };

  if (produceQty <= 0 || material.is_initial_raw_material === true || stack.includes(String(material.id))) {
    return node;
  }

  const inputs = selectedInputs(operationScopedMaterial, inputsByMaterialId, operationOverrides, productionIndex);
  node.productionModelName = inputs[0]?.production_model_name || productionModelOptions(material, inputsByMaterialId, materialsById)[0]?.modelName || null;
  node.productionModelOptions = productionModelOptions(material, inputsByMaterialId, materialsById);
  node.children = inputs.map(input => {
    const inputMaterial = materialsById.get(String(input.input_material_id));
    if (!inputMaterial) return null;
    return buildRequirementTree({
      material: inputMaterial,
      quantity: produceQty * toNumber(input.qty_per_output || 1),
      materialsById,
      inputsByMaterialId,
      matrixRows,
      operationOverrides,
      states,
      productionIndex,
      productionTitle,
      productionColor
    }, [...stack, String(material.id)]);
  }).filter(Boolean);
  return node;
}

function flattenOperations(tree, operations = []) {
  for (const child of tree.children || []) flattenOperations(child, operations);
  if (tree.produceQty > 0 && !tree.isInitialRawMaterial) {
    operations.push({ ...tree, productionOrder: operations.length });
  }
  return operations;
}

function operationRank(material, context, operationOverrides = {}, stack = [], productionIndex = null) {
  if (!material || stack.includes(String(material.id))) return 0;
  const operationScopedMaterial = productionIndex == null ? material : { ...material, operationId: `${productionIndex}:${material.id}`, productionIndex };
  const inputs = selectedInputs(operationScopedMaterial, context.inputsByMaterialId, operationOverrides, productionIndex)
    .map(input => context.materialsById.get(String(input.input_material_id)))
    .filter(Boolean);
  if (!inputs.length || material.is_initial_raw_material === true) return 0;
  return 1 + Math.max(...inputs.map(inputMaterial =>
    operationRank(inputMaterial, context, operationOverrides, [...stack, String(material.id)], productionIndex)
  ));
}

function buildAggregatedOperations({ material, quantity, context, requestedMachine, requestedPeople, operationOverrides = {}, stockLedger = makeStockLedger(context), productionIndex = 0, productionTitle = '', productionColor = null, forcedStockOnly = new Set(), skippedProduction = new Set(), stockChoices = new Map() }) {
  const states = new Map();
  const MAX_REQUIREMENT_EXPANSIONS = 10000;

  function stateFor(currentMaterial) {
    const key = String(currentMaterial.id);
    if (!states.has(key)) {
      states.set(key, {
        material: currentMaterial,
        requiredQty: 0,
        expandedProduceQty: 0,
        stockAvailable: 0,
        stockUsedQty: 0,
        produceQty: 0,
        forceStockOnly: false,
        skipProduction: false
      });
    }
    return states.get(key);
  }

  const queue = [{
    material,
    quantity: toNumber(quantity),
    path: [String(material.id)]
  }];
  let guard = 0;
  while (queue.length && guard < MAX_REQUIREMENT_EXPANSIONS) {
    guard += 1;
    const item = queue.shift();
    const currentMaterial = item.material;
    const state = stateFor(currentMaterial);
    state.requiredQty = Number((toNumber(state.requiredQty) + toNumber(item.quantity)).toFixed(6));
    const isFinalProduct = String(currentMaterial.id) === String(material.id);
    const productionKey = stockOnlyKey(productionIndex, currentMaterial.id);
    const skipProduction = skippedProduction.has(productionKey);
    const stockQty = stockLedger.available(currentMaterial);
    const explicitStockChoice = stockChoices.has(productionKey) ? stockChoices.get(productionKey) : null;
    const useStockBalance = !isFinalProduct
      && explicitStockChoice !== false
      && (forcedStockOnly.has(productionKey) || stockQty > 0);
    const stockUsedQty = useStockBalance || skipProduction ? Math.min(Math.max(stockQty, 0), toNumber(state.requiredQty)) : 0;
    const produceQty = skipProduction ? 0 : Math.max(toNumber(state.requiredQty) - stockUsedQty, 0);
    state.stockAvailable = stockQty;
    state.stockUsedQty = stockUsedQty;
    state.produceQty = produceQty;
    state.forceStockOnly = useStockBalance || skipProduction;
    state.skipProduction = skipProduction;
    const deltaProduceQty = Number((produceQty - state.expandedProduceQty).toFixed(6));
    if (deltaProduceQty <= 0 || currentMaterial.is_initial_raw_material === true) continue;
    state.expandedProduceQty = produceQty;
    const scopedMaterial = { ...currentMaterial, operationId: `${productionIndex}:${currentMaterial.id}`, productionIndex };
    const inputs = selectedInputs(scopedMaterial, context.inputsByMaterialId, operationOverrides, productionIndex);
    for (const input of inputs) {
      const inputMaterial = context.materialsById.get(String(input.input_material_id));
      if (!inputMaterial) continue;
      const inputMaterialId = String(inputMaterial.id);
      if (item.path.includes(inputMaterialId)) continue;
      queue.push({
        material: inputMaterial,
        quantity: Number((deltaProduceQty * toNumber(input.qty_per_output || 1)).toFixed(6)),
        path: [...item.path, inputMaterialId]
      });
    }
  }

  if (queue.length) {
    const error = new Error('A necessidade de materiais ficou grande demais. Verifique o fluxo produtivo, fatores de conversão ou ciclos entre materiais.');
    error.status = 400;
    throw error;
  }

  for (const state of states.values()) {
    if (state.forceStockOnly) stockLedger.consume(state.material, state.stockUsedQty);
  }

  const unavailableMaterialIds = new Set([...states.values()]
    .filter(state => state.skipProduction && toNumber(state.requiredQty) > toNumber(state.stockUsedQty))
    .map(state => String(state.material.id)));
  const blockedByUnavailableDependency = (currentMaterial, stack = []) => {
    const materialId = String(currentMaterial?.id ?? '');
    if (!materialId || stack.includes(materialId)) return false;
    if (unavailableMaterialIds.has(materialId)) return true;
    if (currentMaterial?.is_initial_raw_material === true) return false;
    const scopedMaterial = { ...currentMaterial, operationId: `${productionIndex}:${currentMaterial.id}`, productionIndex };
    return selectedInputs(scopedMaterial, context.inputsByMaterialId, operationOverrides, productionIndex)
      .map(input => context.materialsById.get(String(input.input_material_id)))
      .filter(Boolean)
      .some(inputMaterial => blockedByUnavailableDependency(inputMaterial, [...stack, materialId]));
  };

  const operations = [...states.values()]
    .filter(state => state.material.is_initial_raw_material !== true)
    .filter(state => !blockedByUnavailableDependency(state.material))
    .map(state => {
      const rank = operationRank(state.material, context, operationOverrides, [], productionIndex);
      const isRootMaterial = String(state.material.id) === String(material.id);
      return operationForMaterial(
        state.material,
        state,
        rank,
        context,
        isRootMaterial ? requestedMachine : null,
        isRootMaterial ? requestedPeople : null,
        operationOverrides,
        productionIndex
      );
    })
    .filter(operation => operation.produceQty > 0)
    .sort((left, right) =>
      toNumber(left.productionOrder) - toNumber(right.productionOrder)
      || String(left.materialName).localeCompare(String(right.materialName))
    )
    .map((operation, index) => ({ ...operation, productionOrder: index }));

  const operationMaterialIds = new Set(operations.map(operation => String(operation.materialId)));
  const withDependencies = operations.map(operation => {
    const material = context.materialsById.get(String(operation.materialId));
    const scopedMaterial = { ...material, operationId: `${productionIndex}:${material.id}`, productionIndex };
    const dependencyRequirements = selectedInputs(scopedMaterial, context.inputsByMaterialId, operationOverrides, productionIndex)
      .map(input => ({
        materialId: String(input.input_material_id),
        operationId: `${productionIndex}:${input.input_material_id}`,
        requiredQty: Number((toNumber(operation.produceQty || operation.requiredQty) * toNumber(input.qty_per_output || 1)).toFixed(6))
      }))
      .filter(input => operationMaterialIds.has(input.materialId) && input.requiredQty > 0);
    const dependencyMaterialIds = dependencyRequirements.map(input => String(input.materialId));
    return {
      ...operation,
      operationId: `${productionIndex}:${operation.materialId}`,
      productionIndex,
      productionKey: `production-${productionIndex}`,
      productionTitle,
      productionColor,
      dependencyMaterialIds: [...new Set(dependencyMaterialIds)],
      dependencyOperationIds: [...new Set(dependencyMaterialIds.map(materialId => `${productionIndex}:${materialId}`))],
      dependencyRequirements,
      successorMaterialIds: []
    };
  });
  const byMaterialId = new Map(withDependencies.map(operation => [String(operation.materialId), operation]));
  const byOperationId = new Map(withDependencies.map(operation => [operation.operationId, operation]));
  for (const operation of withDependencies) {
    for (const dependencyMaterialId of operation.dependencyMaterialIds || []) {
      const dependency = byMaterialId.get(String(dependencyMaterialId));
      if (!dependency) continue;
      dependency.successorMaterialIds = [...new Set([...(dependency.successorMaterialIds || []), String(operation.materialId)])];
    }
    for (const dependencyOperationId of operation.dependencyOperationIds || []) {
      const dependency = byOperationId.get(String(dependencyOperationId));
      if (!dependency) continue;
      dependency.successorOperationIds = [...new Set([...(dependency.successorOperationIds || []), operation.operationId])];
    }
  }
  return { operations: withDependencies, states };
}

function groupOperations(operations) {
  const grouped = new Map();
  const operationIdToGroupId = new Map();
  for (const operation of operations) {
    const key = normalizedMaterialKey(operation);
    if (operation.operationType === 'transport') {
      grouped.set(key, { ...operation });
      operationIdToGroupId.set(String(operation.operationId || operation.materialId), String(operation.operationId || operation.materialId));
      continue;
    }
    const groupOperationId = `group:${key}`;
    operationIdToGroupId.set(String(operation.operationId || operation.materialId), groupOperationId);
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...operation,
        operationId: groupOperationId,
        groupedOperationIds: [],
        productionBreakdown: [],
        requiredQty: 0,
        produceQty: 0,
        stockUsedQty: 0,
        dependencyMaterialIds: [],
        successorMaterialIds: [],
        dependencyOperationIds: [],
        successorOperationIds: [],
        dependencyRequirements: []
      });
    }
    const current = grouped.get(key);
    const sourceOperationId = String(operation.operationId || operation.materialId);
    current.groupedOperationIds = [...new Set([...(current.groupedOperationIds || []), sourceOperationId])];
    current.productionBreakdown.push({
      operationId: sourceOperationId,
      productionIndex: Number(operation.productionIndex || 0),
      productionKey: operation.productionKey || `production-${Number(operation.productionIndex || 0)}`,
      productionTitle: operation.productionTitle || `Produção ${Number(operation.productionIndex || 0) + 1}`,
      productionColor: operation.productionColor || null,
      materialId: operation.materialId,
      materialName: operation.materialName,
      machineName: operation.machineName,
      peopleCount: Number(operation.peopleCount || 0),
      productionModelName: operation.productionModelName || null,
      productivityOptions: operation.productivityOptions || [],
      productionModelOptions: operation.productionModelOptions || [],
      outputQty: operation.outputQty,
      outputUnit: operation.outputUnit,
      timeSeconds: operation.timeSeconds,
      quantity: Number(toNumber(operation.produceQty).toFixed(3)),
      unit: operation.unit || ''
    });
    current.requiredQty = Number((toNumber(current.requiredQty) + toNumber(operation.requiredQty)).toFixed(3));
    current.produceQty = Number((toNumber(current.produceQty) + toNumber(operation.produceQty)).toFixed(3));
    current.productionOrder = Math.min(toNumber(current.productionOrder), toNumber(operation.productionOrder));
    current.stockQty = Number(Math.max(toNumber(current.stockQty), toNumber(operation.stockQty)).toFixed(3));
    current.stockUsedQty = Number((toNumber(current.stockUsedQty) + toNumber(operation.stockUsedQty)).toFixed(3));
    current.dependencyMaterialIds = [...new Set([...(current.dependencyMaterialIds || []), ...(operation.dependencyMaterialIds || []).map(String)])];
    current.successorMaterialIds = [...new Set([...(current.successorMaterialIds || []), ...(operation.successorMaterialIds || []).map(String)])];
    current.dependencyOperationIds = [...new Set([...(current.dependencyOperationIds || []), ...(operation.dependencyOperationIds || []).map(String)])];
    current.successorOperationIds = [...new Set([...(current.successorOperationIds || []), ...(operation.successorOperationIds || []).map(String)])];
    current.dependencyRequirements = [...(current.dependencyRequirements || []), ...(operation.dependencyRequirements || [])];
  }
  const result = [...grouped.values()]
    .filter(operation => operation.operationType === 'transport' || operation.produceQty > 0)
    .sort((left, right) => toNumber(left.productionOrder) - toNumber(right.productionOrder));
  const operationIds = new Set(result.map(operation => String(operation.operationId || operation.materialId)));
  const remapIds = ids => [...new Set((ids || [])
    .map(id => operationIdToGroupId.get(String(id)) || String(id))
    .filter(Boolean))];
  const remapRequirements = requirements => {
    const groupedRequirements = new Map();
    for (const requirement of requirements || []) {
      const operationId = operationIdToGroupId.get(String(requirement.operationId || requirement.materialId)) || String(requirement.operationId || requirement.materialId || '');
      if (!operationId) continue;
      const current = groupedRequirements.get(operationId) || {
        ...requirement,
        operationId,
        requiredQty: 0
      };
      current.requiredQty = Number((toNumber(current.requiredQty) + toNumber(requirement.requiredQty)).toFixed(6));
      groupedRequirements.set(operationId, current);
    }
    return [...groupedRequirements.values()];
  };
  return result.map(operation => ({
    ...operation,
    dependencyOperationIds: remapIds(operation.dependencyOperationIds)
      .filter(operationId => operationIds.has(String(operationId)) && String(operationId) !== String(operation.operationId)),
    successorOperationIds: remapIds(operation.successorOperationIds)
      .filter(operationId => operationIds.has(String(operationId)) && String(operationId) !== String(operation.operationId)),
    dependencyRequirements: remapRequirements(operation.dependencyRequirements)
      .filter(requirement => operationIds.has(String(requirement.operationId)) && String(requirement.operationId) !== String(operation.operationId)),
    dependencyMaterialIds: [],
    successorMaterialIds: []
  }));
}

function normalizeTransportEntries(production, context) {
  const source = Array.isArray(production.transports) ? production.transports : [];
  return source.map((transport, index) => {
    const material = context.materialsById.get(String(transport.materialId));
    const origin = context.locationsById?.get(String(transport.originLocationId));
    const destination = context.locationsById?.get(String(transport.destinationLocationId));
    const hours = toOperationalHours(transport.hours);
    if (!material || !origin || !destination || !(hours > 0)) return null;
    return {
      index,
      material,
      origin,
      destination,
      hours,
      totalMinutes: Math.ceil(hours * 60)
    };
  }).filter(Boolean);
}

function applyProductionTransports(operations, production, context) {
  const transports = normalizeTransportEntries(production, context);
  if (!transports.length) return operations;
  const result = operations.map(operation => ({ ...operation }));
  const byMaterialId = new Map(result.map(operation => [String(operation.materialId), operation]));
  const byOperationId = new Map(result.map(operation => [String(operation.operationId), operation]));
  const transportsByMaterialId = new Map();
  for (const transport of transports) {
    const key = String(transport.material.id);
    if (!transportsByMaterialId.has(key)) transportsByMaterialId.set(key, []);
    transportsByMaterialId.get(key).push(transport);
  }

  transportsByMaterialId.forEach((materialTransports, materialId) => {
    const sourceOperation = byMaterialId.get(String(materialId));
    if (!sourceOperation) return;
    const originalSuccessorIds = [...new Set(sourceOperation.successorOperationIds || [])];
    const transportOperations = materialTransports
      .sort((left, right) => left.index - right.index)
      .map((transport, transportIndex) => {
        const operationId = `${production.productionIndex}:transport:${transport.index}:${transport.material.id}`;
        const transportedQty = toNumber(sourceOperation.produceQty || sourceOperation.requiredQty);
        return {
          operationType: 'transport',
          operationId,
          productionIndex: production.productionIndex,
          productionKey: `production-${production.productionIndex}`,
      productionTitle: `Produção ${production.productionIndex + 1}`,
          productionColor: production.color || null,
          productionOrder: toNumber(sourceOperation.productionOrder) + 0.5 + (transportIndex / 100),
          materialId: transport.material.id,
          materialName: transport.material.name,
          materialCode: materialCode(transport.material),
          requiredQty: transportedQty,
          stockQty: 0,
          stockUsedQty: 0,
          produceQty: transportedQty,
          unit: transport.material.primary_unit,
          status: 'Transporte',
          machineName: null,
          peopleCount: null,
          originLocationId: transport.origin.id,
          originLocationName: transport.origin.name,
          destinationLocationId: transport.destination.id,
          destinationLocationName: transport.destination.name,
          transportHours: transport.hours,
          totalMinutes: transport.totalMinutes,
          dependencyMaterialIds: [String(transport.material.id)],
          dependencyOperationIds: transportIndex === 0 ? [sourceOperation.operationId] : [],
          successorMaterialIds: [],
          successorOperationIds: []
        };
      });

    transportOperations.forEach((transportOperation, index) => {
      const nextTransport = transportOperations[index + 1];
      if (index > 0) transportOperation.dependencyOperationIds = [transportOperations[index - 1].operationId];
      transportOperation.successorOperationIds = nextTransport ? [nextTransport.operationId] : originalSuccessorIds;
      result.push(transportOperation);
      byOperationId.set(String(transportOperation.operationId), transportOperation);
    });

    sourceOperation.successorOperationIds = [transportOperations[0].operationId];
    const lastTransportId = transportOperations[transportOperations.length - 1].operationId;
    for (const successorId of originalSuccessorIds) {
      const successor = byOperationId.get(String(successorId));
      if (!successor) continue;
      successor.dependencyOperationIds = (successor.dependencyOperationIds || [])
        .map(operationId => String(operationId) === String(sourceOperation.operationId) ? lastTransportId : operationId);
      successor.dependencyRequirements = (successor.dependencyRequirements || [])
        .map(requirement => String(requirement.operationId) === String(sourceOperation.operationId)
          ? { ...requirement, operationId: lastTransportId }
          : requirement);
    }
  });

  return result;
}

function splitEntries(payload = {}) {
  return Array.isArray(payload.operationSplits) ? payload.operationSplits : [];
}

function splitMatchesOperation(split, operation) {
  if (Array.isArray(operation.groupedOperationIds) && operation.groupedOperationIds.length > 1) {
    return String(split.operationId || '') === String(operation.operationId || operation.materialId);
  }
  if (String(split.operationId || '').includes(':parte:')) {
    return String(split.operationId || '') === String(operation.operationId || operation.materialId);
  }
  return String(split.operationId || '') === String(operation.operationId || operation.materialId)
    || (
      String(split.materialId || '') === String(operation.materialId || '')
      && Number(split.productionIndex || 0) === Number(operation.productionIndex || 0)
    );
}

function applyOperationSplits(operations, payload = {}) {
  const splits = splitEntries(payload);
  if (!splits.length) return operations;
  const source = operations.map(operation => ({ ...operation }));
  const splitMap = new Map();
  const replacementIds = new Map();

  for (const operation of source) {
    if (operation.operationType === 'transport') continue;
    const split = splits.find(item => splitMatchesOperation(item, operation));
    const parts = Array.isArray(split?.parts) ? split.parts : [];
    if (!parts.length) continue;
    const total = toNumber(operation.produceQty);
    const sum = parts.reduce((amount, part) => amount + toNumber(part.quantity), 0);
    if (Math.abs(sum - total) > 0.001) {
      const error = new Error(`A soma das divisões de ${operation.materialName} deve ser ${total}.`);
      error.status = 400;
      throw error;
    }
    const parentId = String(operation.operationId || operation.materialId);
    const replacements = parts.map((part, index) => ({
      ...operation,
      operationId: `${parentId}:parte:${index + 1}`,
      splitParentOperationId: parentId,
      splitPartNumber: index + 1,
      requiredQty: toNumber(part.quantity),
      produceQty: toNumber(part.quantity),
      stockQty: 0,
      stockUsedQty: 0,
      machineName: part.machineName || operation.machineName,
      peopleCount: Number(part.peopleCount ?? operation.peopleCount ?? 0),
      startDate: part.startDate || operation.startDate,
      startTime: part.startTime || operation.startTime,
      productionModelName: part.productionModelName || operation.productionModelName,
      productionOrder: toNumber(operation.productionOrder) + (index / 100)
    }));
    splitMap.set(parentId, replacements);
    replacementIds.set(parentId, replacements.map(item => item.operationId));
  }

  if (!splitMap.size) return operations;

  function replaceIds(ids = []) {
    return ids.flatMap(id => replacementIds.get(String(id)) || [id]);
  }

  return source.flatMap(operation => {
    const parentId = String(operation.operationId || operation.materialId);
    const replacements = splitMap.get(parentId);
    if (replacements) {
      return replacements.map(part => ({
        ...part,
        dependencyOperationIds: replaceIds(part.dependencyOperationIds || []),
        successorOperationIds: replaceIds(part.successorOperationIds || [])
      }));
    }
    return [{
      ...operation,
      dependencyOperationIds: replaceIds(operation.dependencyOperationIds || []),
      successorOperationIds: replaceIds(operation.successorOperationIds || [])
    }];
  });
}

function parseTime(value, fallback) {
  const [hours, minutes] = String(value || fallback).split(':').map(part => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return parseTime(fallback, '07:12');
  return Math.max(0, hours * 60 + minutes);
}

function minutesToTime(minutes) {
  const normalized = Math.max(0, Math.round(minutes));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function splitDateTime(value, fallbackDate, fallbackMinutes) {
  if (value?.includes('T')) {
    const [date, time = ''] = value.split('T');
    return { date, minutes: parseTime(time.slice(0, 5), minutesToTime(fallbackMinutes)) };
  }
  return { date: value || fallbackDate, minutes: fallbackMinutes };
}

function compareCursor(left, right) {
  return left.date === right.date ? left.minutes - right.minutes : left.date.localeCompare(right.date);
}

function maxCursor(...cursors) {
  return cursors.filter(Boolean).reduce((latest, cursor) => (
    !latest || compareCursor(cursor, latest) > 0 ? cursor : latest
  ), null);
}

function minCursor(...cursors) {
  return cursors.filter(Boolean).reduce((earliest, cursor) => (
    !earliest || compareCursor(cursor, earliest) < 0 ? cursor : earliest
  ), null);
}

function workWindowsForShift(date, shiftStart, shiftEnd, lunchStart, lunchEnd, dailyMinutes) {
  const rawWindows = [];
  if (lunchEnd <= shiftStart || lunchStart >= shiftEnd || lunchEnd <= lunchStart) {
    rawWindows.push({ date, start: shiftStart, end: shiftEnd });
  } else {
    if (shiftStart < lunchStart) rawWindows.push({ date, start: shiftStart, end: Math.min(lunchStart, shiftEnd) });
    if (lunchEnd < shiftEnd) rawWindows.push({ date, start: Math.max(lunchEnd, shiftStart), end: shiftEnd });
  }

  const windows = [];
  let remaining = Math.max(dailyMinutes, 1);
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

function normalizeShift(shift = {}, index = 0) {
  const defaultStart = index === 0 ? '07:00' : '17:00';
  const shiftStart = parseTime(shift.shiftStartTime, defaultStart);
  const dailyMinutes = Math.max(toOperationalHours(shift.hoursPerDay || 8), 1 / 60) * 60;
  const calculatedEnd = shiftStart + dailyMinutes;
  let shiftEnd = parseTime(shift.shiftEndTime, minutesToTime(calculatedEnd));
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
  shiftEnd = Math.max(shiftEnd, shiftStart + 1);
  const availableMinutes = Math.max(shiftEnd - shiftStart, 1);
  const label = shift.label || `Turno ${index + 1}`;
  return {
    shiftId: String(shift.shiftId ?? shift.id ?? `shift-${index + 1}`),
    shiftStart,
    shiftEnd,
    lunchStart: shiftStart,
    lunchEnd: shiftStart,
    dailyMinutes: Math.min(dailyMinutes, availableMinutes),
    label,
    teamAvailable: defaultTeamAvailableForShift({ ...shift, label }, index)
  };
}

function normalizeManualWorkDates(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(item => String(item || '').slice(0, 10))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item) && (isWeekend(item) || Boolean(holidayForDate(item))))
  )].sort();
}

function calendarFromPayload({ shifts, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours, manualWorkDates = [] }) {
  const normalizedShifts = (Array.isArray(shifts) && shifts.length ? shifts : [{
    hoursPerDay,
    shiftStartTime,
    shiftEndTime,
    pauseHours: lunchHours,
    pauseStartTime: '12:00',
    label: 'Turno 1'
  }]).map(normalizeShift);
  const shiftStart = Math.min(...normalizedShifts.map(shift => shift.shiftStart));
  const shiftEnd = Math.max(...normalizedShifts.map(shift => shift.shiftEnd));
  const dailyMinutes = normalizedShifts.reduce((sum, shift) => sum + shift.dailyMinutes, 0);
  return { shifts: normalizedShifts, shiftStart, shiftEnd, dailyMinutes, forceWorkDates: new Set(normalizeManualWorkDates(manualWorkDates)) };
}

function normalizeDailyTeamOverrides(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([date, shifts]) => {
    if (!shifts || typeof shifts !== 'object' || Array.isArray(shifts)) return [date, {}];
    return [date, Object.fromEntries(Object.entries(shifts)
      .map(([label, amount]) => [label, Math.max(toNumber(amount), 0)])
      .filter(([, amount]) => Number.isFinite(amount)))];
  }));
}

function teamAvailableForShift(shift, date, dailyTeamOverrides = {}) {
  const overrides = dailyTeamOverrides?.[date] || {};
  const override = overrides[shift.shiftId]
    ?? overrides[shift.label]
    ?? overrides[String(shift.label || '').replace(/^Turno\s*/i, 'T')];
  return override == null ? shift.teamAvailable : Math.max(toNumber(override), 0);
}

function maxAvailableTeam(calendar, dailyTeamOverrides = {}) {
  const base = (calendar.shifts || []).reduce((max, shift) => Math.max(max, toNumber(shift.teamAvailable)), 0);
  return Object.values(dailyTeamOverrides || {}).reduce((max, shifts) => {
    if (!shifts || typeof shifts !== 'object') return max;
    return Math.max(max, ...Object.values(shifts).map(toNumber));
  }, base);
}

function workWindowsForDate(date, calendar) {
  if (isNonWorkingDate(date, calendar)) return [];
  if (Array.isArray(calendar.shifts)) {
    return calendar.shifts
      .flatMap(shift => workWindowsForShift(date, shift.shiftStart, shift.shiftEnd, shift.lunchStart, shift.lunchEnd, shift.dailyMinutes))
      .sort((left, right) => left.start - right.start);
  }
  return workWindowsForShift(date, calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes);
}

function firstWindow(date, calendar) {
  return workWindowsForDate(date, calendar)[0];
}

function nextWorkStart(cursor, calendar) {
  let date = cursor.date;
  let minutes = cursor.minutes;
  for (let guard = 0; guard < MAX_WORKDAY_SEARCH_DAYS; guard += 1) {
    const windows = workWindowsForDate(date, calendar);
    for (const window of windows) {
      if (minutes <= window.start) return { date, minutes: window.start };
      if (minutes < window.end) return { date, minutes };
    }
    date = addDays(date, 1);
    minutes = 0;
  }
  throw planningSimulationError('Falha ao simular planejamento. Não foi encontrada janela de trabalho disponível nos próximos dias. Verifique turnos, calendário e matriz de produtividade.');
}

function previousWorkEnd(cursor, calendar) {
  let date = cursor.date;
  let minutes = cursor.minutes;
  for (let guard = 0; guard < MAX_WORKDAY_SEARCH_DAYS; guard += 1) {
    const windows = workWindowsForDate(date, calendar);
    for (const window of [...windows].reverse()) {
      if (minutes >= window.end) return { date, minutes: window.end };
      if (minutes > window.start) return { date, minutes };
    }
    date = addDays(date, -1);
    minutes = 24 * 60;
  }
  throw planningSimulationError('Falha ao simular planejamento. Não foi encontrada janela de trabalho disponível nos dias anteriores. Verifique turnos, calendário e matriz de produtividade.');
}

function windowForCursor(cursor, calendar) {
  return workWindowsForDate(cursor.date, calendar)
    .find(window => cursor.minutes >= window.start && cursor.minutes < window.end);
}

function scheduleForward(cursor, durationMinutes, calendar) {
  const start = nextWorkStart(cursor, calendar);
  let current = { ...start };
  let remaining = durationMinutes;
  let guard = 0;
  while (remaining > 0) {
    guard += 1;
    if (guard > MAX_SCHEDULE_ITERATIONS) {
      throw planningSimulationError('Falha ao simular planejamento. O motor excedeu o limite de ciclos ao calcular a agenda. Causa provável: capacidade, turnos ou produtividade insuficientes.');
    }
    current = nextWorkStart(current, calendar);
    const window = windowForCursor(current, calendar);
    if (!window) {
      current = nextWorkStart({ date: addDays(current.date, 1), minutes: 0 }, calendar);
      continue;
    }
    const available = window.end - current.minutes;
    const used = Math.min(remaining, available);
    current = { date: current.date, minutes: current.minutes + used };
    remaining -= used;
    if (remaining > 0) current = nextWorkStart({ date: current.date, minutes: current.minutes }, calendar);
  }
  return { start, end: current };
}

function scheduleBackward(cursor, durationMinutes, calendar) {
  const end = previousWorkEnd(cursor, calendar);
  let current = { ...end };
  let remaining = durationMinutes;
  let guard = 0;
  while (remaining > 0) {
    guard += 1;
    if (guard > MAX_SCHEDULE_ITERATIONS) {
      throw planningSimulationError('Falha ao simular planejamento. O motor excedeu o limite de ciclos ao recalcular a agenda. Causa provável: capacidade, turnos ou produtividade insuficientes.');
    }
    current = previousWorkEnd(current, calendar);
    const window = workWindowsForDate(current.date, calendar)
      .find(item => current.minutes > item.start && current.minutes <= item.end);
    if (!window) {
      current = previousWorkEnd({ date: addDays(current.date, -1), minutes: 24 * 60 }, calendar);
      continue;
    }
    const available = current.minutes - window.start;
    const used = Math.min(remaining, available);
    current = { date: current.date, minutes: current.minutes - used };
    remaining -= used;
    if (remaining > 0) current = previousWorkEnd({ date: current.date, minutes: current.minutes }, calendar);
  }
  return { start: current, end };
}

function remainingWorkMinutesOnDate(cursor, calendar) {
  if (!cursor?.date) return 0;
  return workWindowsForDate(cursor.date, calendar)
    .reduce((sum, window) => {
      const start = Math.max(toNumber(cursor.minutes), window.start);
      return sum + Math.max(window.end - start, 0);
    }, 0);
}

function capacityForRemainingDay(cursor, capacity, calendar) {
  const secondsPerUnit = toNumber(capacity?.secondsPerUnit);
  if (!(secondsPerUnit > 0)) return 0;
  const minutes = remainingWorkMinutesOnDate(cursor, calendar);
  if (!(minutes > 0)) return 0;
  return Math.floor(((minutes * 60) / secondsPerUnit) * 1000000) / 1000000;
}

function segmentsForOperation(operation, calendar) {
  const segments = [];
  let cursor = { date: operation.startDate, minutes: parseTime(operation.startTime, '07:12') };
  const end = { date: operation.endDate, minutes: parseTime(operation.endTime, '16:00') };
  while (compareCursor(cursor, end) < 0) {
    cursor = nextWorkStart(cursor, calendar);
    if (compareCursor(cursor, end) >= 0) break;
    const window = windowForCursor(cursor, calendar);
    if (!window) break;
    const segmentEndMinutes = cursor.date === end.date ? Math.min(end.minutes, window.end) : window.end;
    const minutes = Math.max(segmentEndMinutes - cursor.minutes, 0);
    if (minutes > 0) {
      segments.push({
        date: cursor.date,
        startTime: minutesToTime(cursor.minutes),
        endTime: minutesToTime(segmentEndMinutes),
        minutes
      });
    }
    cursor = { date: cursor.date, minutes: segmentEndMinutes };
  }
  return segments;
}

function normalizeExistingSchedule(existingOperations, calendar, shiftStart, shiftEnd) {
  if (!Array.isArray(existingOperations)) return [];
  return existingOperations
    .filter(operation => operation && operation.operationType !== 'transport')
    .map((operation, index) => {
      const segments = Array.isArray(operation.segments) && operation.segments.length
        ? operation.segments
        : segmentsForOperation(operation, calendar);
      const machineName = String(operation.machineName || '').trim();
      const peopleCount = Number(operation.peopleCount || 0);
      if (!machineName || peopleCount < 0 || !segments.length) return null;
      return {
        ...operation,
        operationId: operation.operationId || `existing:${index}`,
        machineName,
        peopleCount,
        startDate: operation.startDate || segments[0]?.date,
        startTime: operation.startTime || segments[0]?.startTime || minutesToTime(shiftStart),
        endDate: operation.endDate || segments.at(-1)?.date,
        endTime: operation.endTime || segments.at(-1)?.endTime || minutesToTime(shiftEnd),
        segments,
        _existingScheduleBlocker: true
      };
    })
    .filter(Boolean);
}

function operationDailyCalendarCards(operation, calendar) {
  if (operation.operationType === 'transport' || operation._existingScheduleBlocker) return [operation];
  const segments = Array.isArray(operation.segments) ? operation.segments : [];
  const parentId = String(operation.calendarParentOperationId || operation.splitParentOperationId || operation.operationId || operation.materialId || '');
  if (!segments.length || !(toNumber(operation.produceQty) > 0)) {
    return [{
      ...operation,
      productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
      capacityPercent: operation.dailyCapacity?.capacityPerDay ? Number(((toNumber(operation.produceQty) / operation.dailyCapacity.capacityPerDay) * 100).toFixed(2)) : null,
      sequence: operation.productionOrder
    }];
  }
  const capacity = productivityDailyCapacity({
    output_qty: operation.outputQty,
    time_seconds: operation.timeSeconds
  }, calendar);
  if (!(capacity.capacityPerDay > 0)) return [operation];

  const byDate = new Map();
  for (const segment of segments) {
    const date = segment.date || operation.startDate;
    if (!date) continue;
    const minutes = toNumber(segment.minutes || (
      parseTime(segment.endTime, minutesToTime(calendar.shiftEnd)) - parseTime(segment.startTime, minutesToTime(calendar.shiftStart))
    ));
    if (!(minutes > 0)) continue;
    if (!byDate.has(date)) byDate.set(date, { date, segments: [], minutes: 0 });
    const entry = byDate.get(date);
    entry.segments.push(segment);
    entry.minutes += minutes;
  }
  const days = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (days.length <= 1) {
    return [{
      ...operation,
      productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
      capacityPercent: capacity.capacityPerDay ? Number(((toNumber(operation.produceQty) / capacity.capacityPerDay) * 100).toFixed(2)) : null,
      sequence: operation.productionOrder
    }];
  }

  let remainingQty = toNumber(operation.produceQty);
  return days.map((day, index) => {
    const isLast = index === days.length - 1;
    const rawQty = capacity.secondsPerUnit > 0
      ? (day.minutes * 60) / capacity.secondsPerUnit
      : remainingQty;
    const produceQty = isLast
      ? remainingQty
      : Math.min(remainingQty, Number(rawQty.toFixed(6)));
    remainingQty = Math.max(remainingQty - produceQty, 0);
    const firstSegment = day.segments[0];
    const lastSegment = day.segments[day.segments.length - 1];
    const originalQty = Math.max(toNumber(operation.produceQty), 1);
    const dailyRatio = produceQty / originalQty;
    return {
      ...operation,
      operationId: `${operation.operationId || operation.materialId}:day-${index + 1}`,
      productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
      calendarParentOperationId: operation.operationId || operation.materialId,
      calendarDayIndex: index + 1,
      calendarDayCount: days.length,
      calendarDailyCapacity: capacity,
      capacityPercent: capacity.capacityPerDay ? Number(((produceQty / capacity.capacityPerDay) * 100).toFixed(2)) : null,
      quantity: produceQty,
      duration: day.minutes,
      sequence: toNumber(operation.productionOrder) + (index / 100),
      produceQty,
      daysNeeded: 1,
      startDate: day.date,
      startTime: firstSegment.startTime,
      endDate: day.date,
      endTime: lastSegment.endTime,
      segments: day.segments.map(segment => ({ ...segment, date: day.date })),
      productionBreakdown: Array.isArray(operation.productionBreakdown)
        ? operation.productionBreakdown.map(item => ({
            ...item,
            quantity: Number((toNumber(item.quantity) * dailyRatio).toFixed(6))
          }))
        : operation.productionBreakdown
    };
  });
}

function makeDailyBatchStockLedger(context = {}, operations = []) {
  const balances = new Map();
  const futureReceipts = new Map();
  const materialsById = context.materialsById instanceof Map ? context.materialsById : new Map();
  const knownMaterialIds = new Set([
    ...materialsById.keys(),
    ...(operations || []).map(operation => String(operation?.materialId || '')).filter(Boolean)
  ]);

  function ensure(materialId) {
    const key = String(materialId || '');
    if (!key || balances.has(key)) return;
    const material = materialsById.get(key);
    balances.set(key, material ? stockForMaterial(material, context.stockRows || [], context.correctionRows || []) : 0);
  }

  knownMaterialIds.forEach(ensure);

  return {
    available(materialId, date) {
      const key = String(materialId || '');
      if (!key) return 0;
      ensure(key);
      for (const [receiptDate, entries] of [...futureReceipts.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
        if (receiptDate > date) continue;
        for (const entry of entries) {
          const entryKey = String(entry.materialId || '');
          ensure(entryKey);
          balances.set(entryKey, Number((toNumber(balances.get(entryKey)) + toNumber(entry.quantity)).toFixed(6)));
        }
        futureReceipts.delete(receiptDate);
      }
      return toNumber(balances.get(key));
    },
    consume(materialId, quantity, date) {
      const key = String(materialId || '');
      const available = this.available(key, date);
      const required = Math.max(toNumber(quantity), 0);
      balances.set(key, Number(Math.max(available - required, 0).toFixed(6)));
    },
    receiveNextDay(materialId, quantity, date) {
      const key = String(materialId || '');
      const qty = Math.max(toNumber(quantity), 0);
      if (!key || !(qty > 0)) return;
      const receiptDate = addDays(date, 1);
      const entries = futureReceipts.get(receiptDate) || [];
      entries.push({ materialId: key, quantity: qty });
      futureReceipts.set(receiptDate, entries);
    }
  };
}

function dailyBatchRequirements(operation, dailyQuantity, context = {}) {
  if (!context.materialsById || !context.inputsByMaterialId) return [];
  const material = context.materialsById.get(String(operation.materialId));
  if (!material) return [];
  const scopedMaterial = {
    ...material,
    operationId: operation.splitParentOperationId || operation.calendarParentOperationId || operation.operationId || `${operation.productionIndex || 0}:${operation.materialId}`,
    productionIndex: operation.productionIndex
  };
  const grouped = new Map();
  for (const input of selectedInputs(scopedMaterial, context.inputsByMaterialId, context.operationOverrides || {}, operation.productionIndex)) {
      const component = context.materialsById.get(String(input.input_material_id));
      const ratio = toNumber(input.qty_per_output || 1);
      const materialId = String(input.input_material_id);
      const current = grouped.get(materialId) || {
        materialId,
        materialName: component?.name || `Material ${input.input_material_id}`,
        materialCode: materialCode(component || {}),
        unit: component?.primary_unit || '',
        ratio: 0,
        requiredQty: 0
      };
      current.ratio = Number((toNumber(current.ratio) + ratio).toFixed(6));
      current.requiredQty = Number((toNumber(current.requiredQty) + (ratio * toNumber(dailyQuantity))).toFixed(6));
      grouped.set(materialId, current);
  }
  return [...grouped.values()].filter(requirement => requirement.requiredQty > 0);
}

function dailyBatchStockBlock(operation, date, dailyQuantity, ledger, context) {
  const requirements = dailyBatchRequirements(operation, dailyQuantity, context);
  for (const requirement of requirements) {
    const available = ledger.available(requirement.materialId, date);
    if (available + DAILY_BATCH_STOCK_EPSILON < requirement.requiredQty) {
      return {
        requirement,
        available
      };
    }
  }
  return null;
}

function consumeDailyBatchRequirements(operation, date, dailyQuantity, ledger, context) {
  for (const requirement of dailyBatchRequirements(operation, dailyQuantity, context)) {
    ledger.consume(requirement.materialId, requirement.requiredQty, date);
  }
}

function buildDailyBatchDiagnostic(operation, date, dailyQuantity, remainingQuantity, capacity, block) {
  const requirement = block?.requirement || {};
  return planningDiagnostic('INSUFFICIENT_STOCK_FOR_FULL_DAILY_BATCH', {
    message: `Estoque insuficiente para produzir a parcela diaria integral de ${operation.materialName || operation.materialId}.`,
    productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
    productionIndex: Number(operation.productionIndex || 0),
    operationId: operation.operationId || null,
    materialId: String(operation.materialId || ''),
    materialName: operation.materialName || '',
    materialCode: operation.materialCode || '',
    machineName: operation.machineName || null,
    peopleCount: operation.peopleCount == null ? null : Number(operation.peopleCount),
    dailyCapacity: Number(toNumber(capacity?.capacityPerDay).toFixed(6)),
    remainingQuantity: Number(toNumber(remainingQuantity).toFixed(6)),
    dailyPlannedQuantity: Number(toNumber(dailyQuantity).toFixed(6)),
    componentMaterialId: requirement.materialId || null,
    componentMaterialName: requirement.materialName || '',
    componentMaterialCode: requirement.materialCode || '',
    requiredQuantity: Number(toNumber(requirement.requiredQty).toFixed(6)),
    availableQuantity: Number(toNumber(block?.available).toFixed(6)),
    date,
    reason: 'INSUFFICIENT_STOCK_FOR_FULL_DAILY_BATCH'
  });
}

function buildDailyBatchCards(operation, calendar, { stockLedger = null, context = {}, diagnostics = [] } = {}) {
  if (!stockLedger || operation.operationType === 'transport' || operation._existingScheduleBlocker) {
    return operationDailyCalendarCards(operation, calendar);
  }
  const capacity = productivityDailyCapacity({
    output_qty: operation.outputQty,
    time_seconds: operation.timeSeconds
  }, calendar);
  if (!(capacity.capacityPerDay > 0) || !(toNumber(operation.produceQty) > 0)) {
    return operationDailyCalendarCards(operation, calendar);
  }

  const cards = [];
  let remainingQty = toNumber(operation.produceQty);
  let cursorDate = operation.startDate || operation.date || '';
  const originalQty = Math.max(toNumber(operation.produceQty), 1);
  const startTime = operation.startTime || minutesToTime(calendar.shiftStart);
  let blockedGuard = 0;

  while (remainingQty > DAILY_BATCH_STOCK_EPSILON && blockedGuard < MAX_WORKDAY_SEARCH_DAYS) {
    if (!cursorDate) break;
    const scheduleCalendar = calendar;
    const dayStart = cards.length ? { date: cursorDate, minutes: scheduleCalendar.shiftStart } : {
      date: cursorDate,
      minutes: parseTime(startTime, minutesToTime(scheduleCalendar.shiftStart))
    };
    const workStart = nextWorkStart(dayStart, scheduleCalendar);
    const remainingDayCapacity = Math.min(
      toNumber(capacity.capacityPerDay),
      capacityForRemainingDay(workStart, capacity, scheduleCalendar)
    );
    if (!(remainingDayCapacity > DAILY_BATCH_STOCK_EPSILON)) {
      cursorDate = addDays(workStart.date, 1);
      blockedGuard += 1;
      continue;
    }
    const dailyPlannedQuantity = Number(Math.min(remainingQty, remainingDayCapacity).toFixed(6));
    const block = dailyBatchStockBlock(operation, workStart.date, dailyPlannedQuantity, stockLedger, context);
    if (block) {
      diagnostics.push(buildDailyBatchDiagnostic(operation, workStart.date, dailyPlannedQuantity, remainingQty, capacity, block));
      cursorDate = addDays(workStart.date, 1);
      blockedGuard += 1;
      continue;
    }

    const durationMinutes = Math.max(Math.ceil((dailyPlannedQuantity * capacity.secondsPerUnit) / 60), 1);
    const slot = scheduleForward(workStart, durationMinutes, scheduleCalendar);
    const dailyRatio = dailyPlannedQuantity / originalQty;
    const index = cards.length;
    consumeDailyBatchRequirements(operation, workStart.date, dailyPlannedQuantity, stockLedger, context);
    stockLedger.receiveNextDay(operation.materialId, dailyPlannedQuantity, workStart.date);
    cards.push({
      ...operation,
      operationId: `${operation.operationId || operation.materialId}:day-${index + 1}`,
      productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
      calendarParentOperationId: operation.operationId || operation.materialId,
      calendarDayIndex: index + 1,
      calendarDayCount: null,
      calendarDailyCapacity: capacity,
      capacityPercent: capacity.capacityPerDay ? Number(((dailyPlannedQuantity / capacity.capacityPerDay) * 100).toFixed(2)) : null,
      maxDailyCapacity: Number(toNumber(capacity.capacityPerDay).toFixed(6)),
      quantity: dailyPlannedQuantity,
      duration: durationMinutes,
      sequence: toNumber(operation.productionOrder) + (index / 100),
      produceQty: dailyPlannedQuantity,
      daysNeeded: 1,
      startDate: slot.start.date,
      startTime: minutesToTime(slot.start.minutes),
      endDate: slot.end.date,
      endTime: minutesToTime(slot.end.minutes),
      segments: segmentsForOperation({ startDate: slot.start.date, startTime: minutesToTime(slot.start.minutes), endDate: slot.end.date, endTime: minutesToTime(slot.end.minutes) }, scheduleCalendar),
      productionBreakdown: Array.isArray(operation.productionBreakdown)
        ? operation.productionBreakdown.map(item => ({
            ...item,
            quantity: Number((toNumber(item.quantity) * dailyRatio).toFixed(6))
          }))
        : operation.productionBreakdown
    });
    remainingQty = Number(Math.max(remainingQty - dailyPlannedQuantity, 0).toFixed(6));
    cursorDate = addDays(workStart.date, 1);
    blockedGuard += 1;
  }

  if (remainingQty > DAILY_BATCH_STOCK_EPSILON) {
    diagnostics.push(planningDiagnostic('INSUFFICIENT_STOCK_FOR_FULL_DAILY_BATCH', {
      message: `Nao foi encontrada data com estoque suficiente para a parcela diaria integral de ${operation.materialName || operation.materialId}.`,
      productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
      productionIndex: Number(operation.productionIndex || 0),
      operationId: operation.operationId || null,
      materialId: String(operation.materialId || ''),
      materialName: operation.materialName || '',
      machineName: operation.machineName || null,
      peopleCount: operation.peopleCount == null ? null : Number(operation.peopleCount),
      dailyCapacity: Number(toNumber(capacity.capacityPerDay).toFixed(6)),
      remainingQuantity: Number(remainingQty.toFixed(6)),
      dailyPlannedQuantity: Number(Math.min(remainingQty, capacity.capacityPerDay).toFixed(6)),
      date: cursorDate || null,
      reason: 'INSUFFICIENT_STOCK_FOR_FULL_DAILY_BATCH'
    }));
  }

  return cards.map((card, index) => ({ ...card, calendarDayCount: cards.length, calendarDayIndex: index + 1 }));
}

function calendarOperationsForSchedule(operations, calendar, context = null) {
  if (!context) return (Array.isArray(operations) ? operations : []).flatMap(operation => operationDailyCalendarCards(operation, calendar));
  const diagnostics = [];
  const stockLedger = makeDailyBatchStockLedger(context, operations);
  const source = (Array.isArray(operations) ? operations : []).sort((left, right) => compareOperationsByStart(left, right));
  const calendarOperations = source.flatMap(operation => buildDailyBatchCards(operation, calendar, { stockLedger, context, diagnostics }));
  return { calendarOperations, diagnostics };
}

function planningCalendarOperations(operations, calendar, payload, context = null) {
  const result = calendarOperationsForSchedule(operations, calendar, context);
  const calendarOperations = Array.isArray(result) ? result : result.calendarOperations;
  const machineNames = [...new Set((Array.isArray(operations) ? operations : [])
    .map(operation => operation.machineName)
    .filter(Boolean)
    .map(String))];
  const built = buildPlanningDailyAllocations(calendarOperations, {
    planningId: payload?.planningCode || payload?.code || null,
    allocationOverrides: payload?.allocationOverrides || [],
    machines: machineNames.map(machineName => ({ machineId: machineName, machineName }))
  });
  const dailyOperations = built.operations;
  if (!Array.isArray(result)) {
    dailyOperations.diagnostics = result.diagnostics;
  }
  return dailyOperations;
}

function scheduleOperations(operations, matrixRows, { dateMode, selectedDate, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours, shifts, setupHours = 0, dailyTeamOverrides = {}, operationOverrides = {}, operationSplits = [], existingOperations = [], manualWorkDates = [] }) {
  const calendar = calendarFromPayload({ shifts, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours, manualWorkDates });
  const { shiftStart, shiftEnd } = calendar;
  const setupMinutes = Math.max(Math.ceil(toOperationalHours(setupHours) * 60), 0);
  const teamOverrides = normalizeDailyTeamOverrides(dailyTeamOverrides);
  const scheduled = normalizeExistingSchedule(existingOperations, calendar, shiftStart, shiftEnd);
  const source = applyOperationSplits(groupOperations(operations), { operationSplits });

  const enrich = operation => {
    if (operation.operationType === 'transport') {
      return {
        ...operation,
        totalMinutes: Math.max(Math.ceil(toNumber(operation.totalMinutes || toNumber(operation.transportHours) * 60)), 1),
        outputQty: 0,
        outputUnit: operation.unit || 'un',
        timeSeconds: Math.max(Math.ceil(toNumber(operation.totalMinutes || toNumber(operation.transportHours) * 60)), 1) * 60,
        minutesPerUnit: 0
      };
    }
    const override = overrideForMaterial(operationOverrides, operation);
    const requestedMachine = override?.machineName || operation.machineName || null;
    const requestedPeople = override?.peopleCount ?? operation.peopleCount ?? null;
    const materialRef = { name: operation.materialName, codes: operation.materialCode ? [operation.materialCode] : [] };
    const matrixCandidates = resolveMatrixCandidates(
      materialRef,
      matrixRows,
      requestedMachine,
      requestedPeople,
      maxAvailableTeam(calendar, teamOverrides)
    );
    const matrix = matrixCandidates[0] || resolveMatrix(
      materialRef,
      matrixRows,
      requestedMachine,
      requestedPeople,
      maxAvailableTeam(calendar, teamOverrides)
    );
    if (!matrix) {
      const hasOperationPeople = operation.peopleCount !== null && operation.peopleCount !== undefined && operation.peopleCount !== '';
      const requested = [operation.machineName, hasOperationPeople ? `${operation.peopleCount} pessoa(s)` : null].filter(Boolean).join(' / ');
      const suffix = requested ? ` para ${requested}` : '';
      const error = new Error(`Nenhuma produtividade ativa encontrada para ${operation.materialName}${suffix}. Cadastre a matriz de produtividade ou selecione uma maquina/equipe valida.`);
      error.status = 404;
      error.code = 'PRODUCTIVITY_MATRIX_CONFIGURATION_NOT_FOUND';
      error.diagnostic = planningDiagnostic('PRODUCTIVITY_MATRIX_CONFIGURATION_NOT_FOUND', {
        message: error.message,
        productionId: operation.productionKey || `production-${operation.productionIndex || 0}`,
        productionIndex: Number(operation.productionIndex || 0),
        operationId: operation.operationId || null,
        materialId: String(operation.materialId || ''),
        materialName: operation.materialName || '',
        materialCode: operation.materialCode || '',
        machineName: requestedMachine || operation.machineName || null,
        peopleCount: requestedPeople == null || requestedPeople === '' ? null : Number(requestedPeople),
        dailyCapacity: 0,
        remainingQuantity: Number(toNumber(operation.produceQty || operation.requiredQty).toFixed(6)),
        dailyPlannedQuantity: 0,
        date: null,
        reason: 'PRODUCTIVITY_MATRIX_CONFIGURATION_NOT_FOUND'
      });
      throw error;
    }
    if (!matrix.machine_name || !Number.isInteger(Number(matrix.people_count)) || Number(matrix.people_count) < 0 || !(toNumber(matrix.output_qty) > 0)) {
      const error = new Error(`Matriz de produtividade invalida para ${operation.materialName}. Informe maquina, pessoas inteiras maiores ou iguais a zero e quantidade diaria maior que zero.`);
      error.status = 400;
      throw error;
    }
    return {
      ...applyMatrixToOperation(operation, matrix, calendar),
      matrixCandidates
    };
  };

  const scheduledItem = (item, slot, scheduleCalendar = calendar) => ({
    ...item,
    daysNeeded: eachSegmentDayCount(slot.start.date, slot.end.date),
    startDate: slot.start.date,
    startTime: minutesToTime(slot.start.minutes),
    endDate: slot.end.date,
    endTime: minutesToTime(slot.end.minutes),
    forcedNonWorkingDates: [...(scheduleCalendar.forceWorkDates || [])],
    segments: segmentsForOperation({ startDate: slot.start.date, startTime: minutesToTime(slot.start.minutes), endDate: slot.end.date, endTime: minutesToTime(slot.end.minutes) }, scheduleCalendar)
  });

  const enriched = source.map(enrich);
  const byOperationId = new Map(enriched.map(operation => [String(operation.operationId || operation.materialId), operation]));
  const hasManualStart = enriched.some(operation => operation.startDate || overrideForMaterial(operationOverrides, operation)?.startDate);
  const scheduledByMaterialId = new Map();
  const dependencyReservedQtyByOperationId = new Map();

  function cursorAfterProgress(operation, ratio) {
    if (!operation || operation.operationType === 'transport') {
      return operation ? { date: operation.endDate, minutes: parseTime(operation.endTime, minutesToTime(shiftStart)) } : null;
    }
    const start = { date: operation.startDate, minutes: parseTime(operation.startTime, minutesToTime(shiftStart)) };
    const progressMinutes = Math.max(Math.ceil(toNumber(operation.totalMinutes) * ratio), 1);
    const operationCalendar = {
      ...calendar,
      forceWorkDates: new Set(operation.forcedNonWorkingDates || [])
    };
    return scheduleForward(start, progressMinutes, operationCalendar).end;
  }

  function cursorAfterAvailableQty(operation, quantity) {
    if (!operation) return null;
    if (operation.operationType === 'transport') {
      return { date: operation.endDate, minutes: parseTime(operation.endTime, minutesToTime(shiftStart)) };
    }
    const stockAvailable = Math.max(toNumber(operation.stockUsedQty), 0);
    const requiredQty = Math.max(toNumber(quantity), 0);
    if (requiredQty <= stockAvailable) {
      return { date: operation.startDate, minutes: parseTime(operation.startTime, minutesToTime(shiftStart)) };
    }
    const produceQty = Math.max(toNumber(operation.produceQty), 0);
    if (!(produceQty > 0)) {
      return { date: operation.endDate, minutes: parseTime(operation.endTime, minutesToTime(shiftStart)) };
    }
    const producedReady = cursorAfterProgress(operation, Math.min((requiredQty - stockAvailable) / produceQty, 1));
    return nextWorkStart({ date: addDays(producedReady.date, 1), minutes: 0 }, calendar);
  }

  function dependencyRequirementsFor(operation) {
    const explicitRequirements = Array.isArray(operation.dependencyRequirements) ? operation.dependencyRequirements : [];
    if (explicitRequirements.length) return explicitRequirements;
    return ((operation.dependencyOperationIds?.length ? operation.dependencyOperationIds : operation.dependencyMaterialIds) || [])
      .map(operationId => ({
        operationId,
        requiredQty: toNumber(scheduledByMaterialId.get(String(operationId))?.produceQty)
      }));
  }

  function dependencyStartQuantity(operation, requirement, dependency) {
    const totalRequiredQty = toNumber(requirement.requiredQty || dependency?.produceQty || dependency?.requiredQty);
    if (!(totalRequiredQty > 0)) return 0;
    if (operation.operationType === 'transport' || dependency?.operationType === 'transport') return totalRequiredQty;

    const consumerTotalQty = Math.max(toNumber(operation.produceQty || operation.requiredQty), 0);
    const consumerDailyQty = Math.max(toNumber(operation.dailyCapacity?.capacityPerDay), 0);
    if (!(consumerTotalQty > 0) || !(consumerDailyQty > 0)) return totalRequiredQty;

    const oneDayBatchRatio = Math.min(consumerDailyQty, consumerTotalQty) / consumerTotalQty;
    return Math.min(totalRequiredQty, totalRequiredQty * oneDayBatchRatio);
  }

  function dependencyReservationKey(requirement) {
    return String(requirement.operationId || requirement.materialId || '');
  }

  function dependencyReservedQuantity(requirement) {
    return toNumber(dependencyReservedQtyByOperationId.get(dependencyReservationKey(requirement)));
  }

  function reserveDependencies(operation) {
    for (const requirement of dependencyRequirementsFor(operation)) {
      const key = dependencyReservationKey(requirement);
      if (!key) continue;
      dependencyReservedQtyByOperationId.set(
        key,
        Number((dependencyReservedQuantity(requirement) + toNumber(requirement.requiredQty)).toFixed(6))
      );
    }
  }

  function dependencyReadyCursor(operation) {
    return maxCursor(...dependencyRequirementsFor(operation)
      .map(requirement => {
        const item = scheduledByMaterialId.get(String(requirement.operationId || requirement.materialId));
        if (!item) return null;
        const minimumQty = dependencyReservedQuantity(requirement)
          + dependencyStartQuantity(operation, requirement, item);
        return cursorAfterAvailableQty(item, minimumQty);
      })
      .filter(Boolean));
  }

  function dependencyCompleteCursor(requirement) {
    const item = scheduledByMaterialId.get(String(requirement.operationId || requirement.materialId));
    if (!item) return null;
    const requiredQty = toNumber(requirement.requiredQty || item.produceQty || item.requiredQty);
    return cursorAfterAvailableQty(item, dependencyReservedQuantity(requirement) + requiredQty);
  }

  function dependencySafeFinishCursor(operation, scheduleCalendar) {
    const requirements = dependencyRequirementsFor(operation);
    if (!requirements.length) return null;
    const dependencyDone = maxCursor(...requirements.map(dependencyCompleteCursor).filter(Boolean));
    if (!dependencyDone) return null;
    return scheduleForward(dependencyDone, MIN_DEPENDENCY_FINISH_BUFFER_MINUTES, scheduleCalendar).end;
  }

  function segmentsForSlot(slot, operation, scheduleCalendar) {
    return segmentsForOperation({
      startDate: slot.start.date,
      startTime: minutesToTime(slot.start.minutes),
      endDate: slot.end.date,
      endTime: minutesToTime(slot.end.minutes)
    }, scheduleCalendar).map(segment => ({
      operation,
      date: segment.date,
      start: parseTime(segment.startTime, minutesToTime(shiftStart)),
      end: parseTime(segment.endTime, minutesToTime(shiftEnd))
    }));
  }

  function operationSegments(operation) {
    return (operation.segments || []).map(segment => ({
      operation,
      date: segment.date,
      start: parseTime(segment.startTime, minutesToTime(shiftStart)),
      end: parseTime(segment.endTime, minutesToTime(shiftEnd))
    }));
  }

  function overlappingSegments(candidateSegment) {
    return scheduled
      .filter(operation => operation.operationType !== 'transport')
      .flatMap(operationSegments)
      .filter(segment =>
        segment.date === candidateSegment.date
        && segment.start < candidateSegment.end
        && candidateSegment.start < segment.end
      );
  }

  function shiftForSegment(segment) {
    return calendar.shifts.find(shift =>
      segment.start < shift.shiftEnd
      && segment.end > shift.shiftStart
    ) || calendar.shifts[0];
  }

  function sameShiftSegment(left, right) {
    const shift = shiftForSegment(right);
    return left.date === right.date
      && left.end > shift.shiftStart
      && left.start < shift.shiftEnd;
  }

  function setupConflict(operation, slot, scheduleCalendar) {
    if (!setupMinutes || operation.operationType === 'transport') return null;
    const machineName = String(operation.machineName || '').trim().toLowerCase();
    const currentMaterialKey = materialSetupKey(operation);
    for (const segment of segmentsForSlot(slot, operation, scheduleCalendar)) {
      const previous = scheduled
        .filter(item => item.operationType !== 'transport')
        .flatMap(operationSegments)
        .filter(item =>
          String(item.operation.machineName || '').trim().toLowerCase() === machineName
          && item.end <= segment.start
          && sameShiftSegment(item, segment)
        )
        .sort((left, right) => left.end - right.end)
        .at(-1);
      if (!previous || materialSetupKey(previous.operation) === currentMaterialKey) continue;
      const availableStart = previous.end + setupMinutes;
      if (segment.start < availableStart) {
        return {
          date: segment.date,
          minutes: availableStart
        };
      }
    }
    return null;
  }

  function machineConflict(operation, slot, scheduleCalendar) {
    if (operation.operationType === 'transport') return null;
    const machineName = String(operation.machineName || '').trim().toLowerCase();
    if (!machineName) {
      const error = new Error(`Maquina nao informada para ${operation.materialName}. Selecione uma maquina valida antes de simular.`);
      error.status = 400;
      throw error;
    }
    for (const segment of segmentsForSlot(slot, operation, scheduleCalendar)) {
      const blocking = overlappingSegments(segment)
        .filter(item => String(item.operation.machineName || '').trim().toLowerCase() === machineName)
        .sort((left, right) => left.end - right.end)
        .at(-1);
      if (blocking) {
        return {
          date: segment.date,
          minutes: Math.max(blocking.end, segment.start + 1)
        };
      }
    }
    return null;
  }

  function capacityConflict(operation, slot, scheduleCalendar) {
    if (operation.operationType === 'transport') return null;
    const people = Number(operation.peopleCount || 0);
    if (people < 0) {
      const error = new Error(`Quantidade de pessoas invalida para ${operation.materialName}. Selecione uma equipe maior ou igual a zero.`);
      error.status = 400;
      throw error;
    }
    if (people === 0) return null;
    for (const segment of segmentsForSlot(slot, operation, scheduleCalendar)) {
      const shift = shiftForSegment(segment);
      const available = teamAvailableForShift(shift, segment.date, teamOverrides);
      if (!(available > 0) || people > available) {
        return {
          date: segment.date,
          minutes: segment.end,
          used: people,
          available
        };
      }
      const overlapping = overlappingSegments(segment);
      const points = [
        { minute: segment.start, delta: people },
        { minute: segment.end, delta: -people },
        ...overlapping.flatMap(item => ([
          { minute: Math.max(item.start, segment.start), delta: Number(item.operation.peopleCount || 0) },
          { minute: Math.min(item.end, segment.end), delta: -Number(item.operation.peopleCount || 0) }
        ]))
      ].sort((left, right) => left.minute - right.minute || left.delta - right.delta);
      let used = 0;
      for (const point of points) {
        used += point.delta;
        if (used > available) {
          const blockingEnd = overlapping.reduce((latest, item) => Math.max(latest, item.end), segment.start);
          return {
            date: segment.date,
            minutes: Math.max(blockingEnd, point.minute + 1),
            used,
            available
          };
        }
      }
    }
    return null;
  }

  function dependencyFlowConflict(operation, slot, scheduleCalendar) {
    const dependencySafeFinish = dependencySafeFinishCursor(operation, scheduleCalendar);
    if (!dependencySafeFinish || compareCursor(slot.end, dependencySafeFinish) >= 0) return null;
    const latestSafeStart = scheduleBackward(dependencySafeFinish, operation.totalMinutes, scheduleCalendar).start;
    return compareCursor(latestSafeStart, slot.start) > 0 ? latestSafeStart : dependencySafeFinish;
  }

  function scheduleForwardWithCapacity(cursor, operation, scheduleCalendar) {
    let nextCursor = cursor;
    for (let guard = 0; guard < 1000; guard += 1) {
      const candidates = Array.isArray(operation.matrixCandidates) && operation.matrixCandidates.length
        ? operation.matrixCandidates
        : [null];
      const conflicts = [];
      for (const matrix of candidates) {
        const candidate = matrix ? applyMatrixToOperation(operation, matrix, scheduleCalendar) : operation;
        const candidateCursor = maxCursor(nextCursor, dependencyReadyCursor(candidate));
        const slot = scheduleForward(candidateCursor, candidate.totalMinutes, scheduleCalendar);
        const machineBlock = machineConflict(candidate, slot, scheduleCalendar);
        if (machineBlock) {
          conflicts.push(machineBlock);
          continue;
        }
        const setupBlock = setupConflict(candidate, slot, scheduleCalendar);
        if (setupBlock) {
          conflicts.push(setupBlock);
          continue;
        }
        const conflict = capacityConflict(candidate, slot, scheduleCalendar);
        if (conflict) {
          conflicts.push(conflict);
          continue;
        }
        const dependencyConflict = dependencyFlowConflict(candidate, slot, scheduleCalendar);
        if (!dependencyConflict) return { slot, operation: candidate };
        conflicts.push(dependencyConflict);
      }
      nextCursor = nextWorkStart(minCursor(...conflicts) || { date: nextCursor.date, minutes: nextCursor.minutes + 1 }, scheduleCalendar);
    }
    const error = new Error(`Nao foi possivel encaixar ${operation.materialName} respeitando a capacidade de pessoas.`);
    error.status = 400;
    throw error;
  }

  const predecessorsDone = operation => ((operation.dependencyOperationIds?.length ? operation.dependencyOperationIds : operation.dependencyMaterialIds) || [])
    .every(operationId => scheduledByMaterialId.has(String(operationId)) || !byOperationId.has(String(operationId)));
  const successorsDone = operation => ((operation.successorOperationIds?.length ? operation.successorOperationIds : operation.successorMaterialIds) || [])
    .every(operationId => scheduledByMaterialId.has(String(operationId)) || !byOperationId.has(String(operationId)));
  const topological = [...enriched].sort((left, right) =>
    toNumber(left.productionOrder) - toNumber(right.productionOrder)
    || String(left.materialName).localeCompare(String(right.materialName))
  );

  function scheduleForwardGraph(startCursor) {
    const pending = [...topological];
    let guard = 0;
    while (pending.length && guard < 1000) {
      guard += 1;
      const index = pending.findIndex(predecessorsDone);
      const operation = pending.splice(index >= 0 ? index : 0, 1)[0];
      const override = overrideForMaterial(operationOverrides, operation);
      const operationCursor = operation.startDate ? { date: operation.startDate, minutes: parseTime(operation.startTime, minutesToTime(shiftStart)) } : null;
      const overrideCursor = overrideStartCursor(override, startCursor.date, shiftStart) || operationCursor;
      const cursor = overrideCursor || startCursor;
      const operationCalendar = calendar;
      const scheduledSlot = scheduleForwardWithCapacity(cursor, operation, operationCalendar);
      const item = scheduledItem(scheduledSlot.operation, scheduledSlot.slot, operationCalendar);
      scheduledByMaterialId.set(String(operation.operationId || operation.materialId), item);
      reserveDependencies(scheduledSlot.operation);
      scheduled.push(item);
    }
    if (pending.length) {
      throw planningSimulationError('Falha ao simular planejamento. O motor excedeu o limite de ciclos ao ordenar as operações. Causa provável: dependências ou divisão de operações inconsistentes.');
    }
  }

  function scheduleBackwardGraph(endCursor) {
    const pending = [...topological].reverse();
    const reverseMachine = new Map();
    let guard = 0;
    while (pending.length && guard < 1000) {
      guard += 1;
      const index = pending.findIndex(successorsDone);
      const operation = pending.splice(index >= 0 ? index : 0, 1)[0];
      const successorStart = minCursor(...((operation.successorOperationIds?.length ? operation.successorOperationIds : operation.successorMaterialIds) || [])
        .map(operationId => scheduledByMaterialId.get(String(operationId)))
        .filter(Boolean)
        .map(item => ({ date: item.startDate, minutes: parseTime(item.startTime, minutesToTime(shiftStart)) })));
      const successorSafeDependencyEnd = minCursor(...((operation.successorOperationIds?.length ? operation.successorOperationIds : operation.successorMaterialIds) || [])
        .map(operationId => scheduledByMaterialId.get(String(operationId)))
        .filter(Boolean)
        .map(item => scheduleBackward(
          { date: item.endDate, minutes: parseTime(item.endTime, minutesToTime(shiftEnd)) },
          MIN_DEPENDENCY_FINISH_BUFFER_MINUTES,
          calendar
        ).start));
      const machineCursor = operation.operationType === 'transport' ? endCursor : reverseMachine.get(operation.machineName || '') || endCursor;
      const cursor = minCursor(endCursor, successorStart, successorSafeDependencyEnd, machineCursor);
      const slot = scheduleBackward(cursor, operation.totalMinutes, calendar);
      const item = scheduledItem(operation, slot);
      scheduledByMaterialId.set(String(operation.operationId || operation.materialId), item);
      if (operation.operationType !== 'transport') reverseMachine.set(operation.machineName || '', slot.start);
      scheduled.push(item);
    }
    if (pending.length) {
      throw planningSimulationError('Falha ao simular planejamento. O motor excedeu o limite de ciclos ao replanejar operações. Causa provável: dependências ou divisão de operações inconsistentes.');
    }
  }

  if (dateMode === 'end' && !hasManualStart) {
    scheduleBackwardGraph({ date: selectedDate, minutes: shiftEnd });
  } else {
    scheduleForwardGraph({ date: selectedDate, minutes: shiftStart });
  }

  const currentOperations = scheduled.filter(operation => !operation._existingScheduleBlocker).sort((left, right) =>
    compareCursor(
      { date: left.startDate, minutes: parseTime(left.startTime, minutesToTime(shiftStart)) },
      { date: right.startDate, minutes: parseTime(right.startTime, minutesToTime(shiftStart)) }
    )
    || toNumber(left.productionOrder) - toNumber(right.productionOrder)
  );
  currentOperations.existingScheduleBlockers = scheduled.filter(operation => operation._existingScheduleBlocker).sort((left, right) =>
    compareCursor(
      { date: left.startDate, minutes: parseTime(left.startTime, minutesToTime(shiftStart)) },
      { date: right.startDate, minutes: parseTime(right.startTime, minutesToTime(shiftStart)) }
    )
    || toNumber(left.productionOrder) - toNumber(right.productionOrder)
  );
  return currentOperations;
}

function eachSegmentDayCount(startDate, endDate) {
  let count = 1;
  let cursor = startDate;
  while (cursor < endDate) {
    cursor = addDays(cursor, 1);
    count += 1;
  }
  return count;
}

function buildDays(operations, plannedUnit) {
  return operations.flatMap(operation => {
    const totalSegmentMinutes = operation.segments.reduce((sum, segment) => sum + segment.minutes, 0) || operation.totalMinutes || 1;
    return operation.segments.map(segment => ({
      planned_date: segment.date,
      material_name: operation.materialName,
      material_code: operation.materialCode,
      machine_name: operation.machineName,
      people_count: operation.peopleCount,
      planned_qty: Number((operation.produceQty * (segment.minutes / totalSegmentMinutes)).toFixed(3)),
      planned_unit: operation.unit || plannedUnit || 'un',
      total_minutes: operation.totalMinutes,
      daily_minutes: segment.minutes,
      start_time: segment.startTime,
      end_time: segment.endTime
    }));
  });
}

export function buildStoredAutomaticPlanningSnapshot(plan = {}, operationsValue = []) {
  const operations = JSON.parse(JSON.stringify(Array.isArray(operationsValue) ? operationsValue : []));
  const meta = operations.find(operation => operation?._planningMeta)?._planningMeta || {};
  const shifts = Array.isArray(meta.shifts) ? meta.shifts : [];
  const calendar = calendarFromPayload({
    shifts,
    hoursPerDay: plan.hours_per_day,
    shiftStartTime: shifts[0]?.shiftStartTime,
    shiftEndTime: shifts.at(-1)?.shiftEndTime,
    manualWorkDates: Array.isArray(meta.manualWorkDates) ? meta.manualWorkDates : []
  });
  return {
    operations,
    calendarOperations: planningCalendarOperations(operations, calendar, {
      planningCode: plan.code || plan.id
    }),
    days: buildDays(operations, plan.planned_unit)
  };
}

function operationCursorValue(operation) {
  return {
    date: operation.startDate || operation.endDate || '9999-12-31',
    minutes: parseTime(operation.startTime || operation.endTime, '00:00')
  };
}

function compareOperationsByStart(left, right) {
  return compareCursor(operationCursorValue(left), operationCursorValue(right))
    || toNumber(left.productionOrder) - toNumber(right.productionOrder)
    || String(left.operationId || left.materialId || '').localeCompare(String(right.operationId || right.materialId || ''));
}

function operationMatchesChange(operation, change = {}) {
  const operationId = String(operation.operationId || operation.materialId || '');
  return operationId === String(change.operationId || '')
    || (
      String(operation.materialId || '') === String(change.materialId || '')
      && Number(operation.productionIndex || 0) === Number(change.productionIndex || 0)
    );
}

function fallbackShiftsForSavedPlan(plan = {}, operations = []) {
  const meta = operations.find(operation => operation?._planningMeta)?.['_planningMeta'] || {};
  if (Array.isArray(meta.shifts) && meta.shifts.length) return meta.shifts;
  const firstSegment = operations.flatMap(operation => operation.segments || [])
    .sort((left, right) => String(left.startTime || '').localeCompare(String(right.startTime || '')))[0];
  const lastSegment = operations.flatMap(operation => operation.segments || [])
    .sort((left, right) => String(right.endTime || '').localeCompare(String(left.endTime || '')))[0];
  return [{
    label: 'Turno 1',
    hoursPerDay: plan.hours_per_day || 8,
    shiftStartTime: firstSegment?.startTime || '07:00',
    pauseHours: 0,
    shiftEndTime: lastSegment?.endTime || '17:00',
    teamAvailable: DEFAULT_TEAM_AVAILABLE
  }];
}

export function rescheduleSavedPlan(plan, operationsValue, change = {}, matrixRows = []) {
  const operations = (Array.isArray(operationsValue) ? operationsValue : [])
    .map(operation => ({ ...operation, segments: Array.isArray(operation.segments) ? operation.segments : [] }))
    .sort(compareOperationsByStart);
  const requestedIndex = operations.findIndex(operation => operationMatchesChange(operation, change));
  if (requestedIndex < 0 && (change.operationId || change.materialId)) {
    const error = new Error('Operação do planejamento não encontrada.');
    error.status = 404;
    throw error;
  }
  const capacityStartDate = change.capacityDate || change.recalculateFromDate || null;
  const targetIndex = requestedIndex >= 0
    ? requestedIndex
    : capacityStartDate
      ? operations.findIndex(operation => String(operation.startDate || '') >= capacityStartDate)
      : 0;
  const meta = operations.find(operation => operation?._planningMeta)?.['_planningMeta'] || {};
  const dailyTeamOverrides = normalizeDailyTeamOverrides(change.replaceDailyTeamOverrides === true
    ? (change.dailyTeamOverrides || {})
    : {
        ...(meta.dailyTeamOverrides || {}),
        ...(change.dailyTeamOverrides || {})
      });
  const manualWorkDates = normalizeManualWorkDates(change.manualWorkDates || meta.manualWorkDates || []);
  if (change.capacityDate && change.capacityOverrides) {
    dailyTeamOverrides[change.capacityDate] = {
      ...(dailyTeamOverrides[change.capacityDate] || {}),
      ...change.capacityOverrides
    };
  }
  const targetOperation = operations[targetIndex];
  if (!targetOperation) {
    if (change.capacityDate && change.capacityOverrides && operations.length) {
      const shifts = fallbackShiftsForSavedPlan(plan, operations);
      const scheduled = operations.map((operation, index) => index === 0
        ? { ...operation, _planningMeta: { ...meta, shifts, setupHours: meta.setupHours || 0, dailyTeamOverrides, manualWorkDates } }
        : operation);
      return {
        operations: scheduled,
        calendarOperations: planningCalendarOperations(
          scheduled,
          calendarFromPayload({ shifts, manualWorkDates }),
          { planningCode: plan.code || plan.id }
        ),
        days: buildDays(scheduled, plan.planned_unit),
        summary: {
          planningStartDate: plan.start_date,
          planningEndDate: plan.end_date,
          shifts,
          dailyTeamOverrides,
          manualWorkDates,
          productions: meta.productions || []
        }
      };
    }
    const error = new Error('Operação do planejamento não encontrada.');
    error.status = 404;
    throw error;
  }

  const today = new Date().toISOString().slice(0, 10);
  const targetDate = change.startDate || change.date || capacityStartDate || targetOperation.startDate;
  if (targetOperation.startDate < today || targetDate < today) {
    const error = new Error('Produções anteriores a hoje são somente leitura.');
    error.status = 400;
    throw error;
  }

  const changedOperation = {
    ...targetOperation,
    machineName: change.machineName || targetOperation.machineName,
    peopleCount: change.peopleCount == null ? targetOperation.peopleCount : Number(change.peopleCount),
    productionModelName: change.productionModelName || targetOperation.productionModelName,
    startDate: change.startDate || capacityStartDate || targetOperation.startDate,
    startTime: change.startTime || (capacityStartDate ? null : targetOperation.startTime)
  };
  const movedBackward = !capacityStartDate && compareCursor(
    { date: changedOperation.startDate, minutes: parseTime(changedOperation.startTime, minutesToTime(calendarFromPayload({ shifts: meta.shifts || fallbackShiftsForSavedPlan(plan, operations) }).shiftStart)) },
    { date: targetOperation.startDate, minutes: parseTime(targetOperation.startTime, '00:00') }
  ) < 0;

  const source = operations.map((operation, index) => {
    if (!movedBackward && index < targetIndex) return { ...operation };
    const base = index === targetIndex ? changedOperation : { ...operation };
    return {
      ...base,
      startDate: index === targetIndex ? changedOperation.startDate : null,
      startTime: index === targetIndex ? changedOperation.startTime : null,
      endDate: null,
      endTime: null,
      segments: []
    };
  });

  const shifts = fallbackShiftsForSavedPlan(plan, operations);
  const scheduled = scheduleOperations(source, matrixRows, {
    dateMode: 'start',
    selectedDate: changedOperation.startDate,
    hoursPerDay: plan.hours_per_day || 8,
    shifts,
    setupHours: meta.setupHours || 0,
    dailyTeamOverrides,
    manualWorkDates
  }).map((operation, index) => index === 0
      ? { ...operation, _planningMeta: { shifts, setupHours: meta.setupHours || 0, dailyTeamOverrides, manualWorkDates } }
    : operation);
  const days = buildDays(scheduled, plan.planned_unit);
  return {
    operations: scheduled,
    calendarOperations: planningCalendarOperations(
      scheduled,
      calendarFromPayload({ shifts, manualWorkDates }),
      { planningCode: plan.code || plan.id }
    ),
    days,
    summary: {
      planningStartDate: plan.start_date,
      planningEndDate: plan.end_date,
      shifts,
      dailyTeamOverrides,
      manualWorkDates,
      productions: meta.productions || []
    }
  };
}

function buildSinglePlan(payload, context) {
  const material = context.material;
  if (!material) {
    const error = new Error('Material cadastrado não encontrado.');
    error.status = 404;
    throw error;
  }
  const operationOverrides = { ...(payload.operationOverrides || {}) };
  if (payload.productionModelName) {
    operationOverrides[String(material.id)] = {
      ...(operationOverrides[String(material.id)] || {}),
      productionModelName: payload.productionModelName
    };
  }

  const stockLedger = makeStockLedger(context);
  const built = buildAggregatedOperations({
    material,
    quantity: payload.plannedQty,
    context,
    requestedMachine: payload.machineName,
    requestedPeople: payload.peopleCount,
    operationOverrides,
    stockLedger,
    productionIndex: 0,
    productionTitle: 'Produção 1',
    forcedStockOnly: stockOnlySet(payload),
    skippedProduction: skipProductionSet(payload),
    stockChoices: stockChoiceMap(payload)
  });
  const production = {
    ...payload,
    productionIndex: 0,
    transports: Array.isArray(payload.transports) ? payload.transports : []
  };
  const tree = buildRequirementTree({
    material,
    quantity: payload.plannedQty,
    materialsById: context.materialsById,
    inputsByMaterialId: context.inputsByMaterialId,
    matrixRows: context.matrixRows,
    requestedMachine: payload.machineName,
    requestedPeople: payload.peopleCount,
    operationOverrides,
    states: built.states,
    productionIndex: 0,
    productionTitle: 'Produção 1'
  });
  const operations = scheduleOperations(applyProductionTransports(built.operations, production, context), context.matrixRows, {
    dateMode: payload.dateMode,
    selectedDate: payload.selectedDate || payload.startDate,
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    lunchHours: payload.lunchHours,
    shifts: payload.shifts,
    setupHours: payload.setupHours,
    dailyTeamOverrides: payload.dailyTeamOverrides,
    manualWorkDates: payload.manualWorkDates,
    operationOverrides,
    operationSplits: payload.operationSplits,
    existingOperations: context.existingOperations
  });
  const scheduleCalendar = calendarFromPayload({
    shifts: payload.shifts,
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    lunchHours: payload.lunchHours,
    manualWorkDates: payload.manualWorkDates
  });
  const manualWorkDates = normalizeManualWorkDates(payload.manualWorkDates);
  const days = buildDays(operations, material.primary_unit);
  const calendarOperations = planningCalendarOperations(operations, scheduleCalendar, payload, {
    ...context,
    operationOverrides
  });
  const diagnostics = {
    errors: calendarOperations.diagnostics || [],
    warnings: []
  };
  const hoursPerDay = shiftAvailableHours({
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    pauseHours: payload.lunchHours
  });
  const startDate = operations.length ? operations[0].startDate : payload.selectedDate || payload.startDate;
  const endDate = operations.length ? operations[operations.length - 1].endDate : payload.selectedDate || payload.startDate;
  const finalOperation = operations[operations.length - 1];
  const uniqueDaysNeeded = new Set(days.map(day => day.planned_date)).size;

  return {
    code: payload.planningCode || codeForPlan(),
    summary: {
      materialId: material.id,
      materialName: material.name,
      materialCode: materialCode(material),
      plannedQty: toNumber(payload.plannedQty),
      plannedUnit: material.primary_unit,
      machineName: finalOperation?.machineName || payload.machineName || null,
      peopleCount: finalOperation?.peopleCount ?? (payload.peopleCount == null || payload.peopleCount === '' ? null : Number(payload.peopleCount)),
      dateMode: payload.dateMode || 'start',
      selectedDate: payload.selectedDate || payload.startDate,
      hoursPerDay,
      shiftStartTime: payload.shiftStartTime || '07:12',
      shiftEndTime: payload.shiftEndTime || '16:00',
      lunchHours: 0,
      shifts: Array.isArray(payload.shifts) && payload.shifts.length ? payload.shifts : [{
        hoursPerDay: payload.hoursPerDay,
        shiftStartTime: payload.shiftStartTime,
        shiftEndTime: payload.shiftEndTime,
        pauseHours: 0
      }],
      dailyTeamOverrides: normalizeDailyTeamOverrides(payload.dailyTeamOverrides),
      manualWorkDates,
      manualConstraints: Array.isArray(payload.manualConstraints) ? payload.manualConstraints : [],
      setupHours: toOperationalHours(payload.setupHours || 0),
      startDate,
      endDate,
      daysNeeded: uniqueDaysNeeded,
      hasPastStart: (payload.dateMode || 'start') === 'end' && new Date(`${startDate}T00:00:00`) < new Date(`${dateKey(new Date())}T00:00:00`)
    },
    tree,
    operations: operations.map((operation, index) => index === 0
      ? { ...operation, _planningMeta: { shifts: Array.isArray(payload.shifts) && payload.shifts.length ? payload.shifts : [{ hoursPerDay: payload.hoursPerDay, shiftStartTime: payload.shiftStartTime, shiftEndTime: payload.shiftEndTime, pauseHours: 0 }], setupHours: toOperationalHours(payload.setupHours || 0), dailyTeamOverrides: normalizeDailyTeamOverrides(payload.dailyTeamOverrides), manualWorkDates } }
      : operation),
    calendarOperations,
    diagnostics,
    days
  };
}

function productionEntries(payload, context) {
  const source = Array.isArray(payload.productions) && payload.productions.length ? payload.productions : [payload];
  return source.map((production, index) => {
    const materialId = Number(production.materialId);
    const material = materialId ? context.materialsById.get(String(materialId)) : index === 0 ? context.material : null;
    if (!material) {
      const error = new Error(`Material da Produção ${index + 1} não encontrado.`);
      error.status = 404;
      throw error;
    }
    return {
      ...production,
      material,
      plannedQty: toNumber(production.plannedQty),
      productionIndex: index,
      color: normalizeColor(production.color)
    };
  }).filter(production => production.plannedQty > 0);
}

function rootSplitForProduction(payload, production) {
  const rootOperationId = `${production.productionIndex}:${production.material.id}`;
  return splitEntries(payload).find(split =>
    (String(split.operationId || '') === rootOperationId
      || (
        String(split.materialId || '') === String(production.material.id)
        && Number(split.productionIndex || 0) === Number(production.productionIndex || 0)
      ))
    && Array.isArray(split.parts)
    && split.parts.length
  ) || null;
}

function expandRootSplitProductions(payload, productions) {
  const rootSplitIds = new Set();
  const expanded = [];
  for (const production of productions) {
    const split = rootSplitForProduction(payload, production);
    if (!split) {
      expanded.push(production);
      continue;
    }
    const rootOperationId = `${production.productionIndex}:${production.material.id}`;
    rootSplitIds.add(String(split.operationId || rootOperationId));
    rootSplitIds.add(rootOperationId);
    split.parts.forEach((part, partIndex) => {
      expanded.push({
        ...production,
        plannedQty: toNumber(part.quantity),
        machineName: part.machineName || production.machineName,
        peopleCount: Number(part.peopleCount ?? production.peopleCount ?? 0),
        productionModelName: part.productionModelName || production.productionModelName,
        desiredDate: part.startDate || production.desiredDate || null,
        splitStartDate: part.startDate || null,
        splitStartTime: part.startTime || null,
        originalProductionIndex: production.productionIndex,
        splitPartNumber: partIndex + 1,
        splitParentOperationId: `${production.productionIndex}:${production.material.id}`,
        productionIndex: Number(`${production.productionIndex}.${String(partIndex + 1).padStart(2, '0')}`),
        productionTitle: `Producao ${production.productionIndex + 1} - Parte ${partIndex + 1}`
      });
    });
  }
  const operationSplits = splitEntries(payload)
    .filter(split => !rootSplitIds.has(String(split.operationId || '')))
    .filter(split => !rootSplitIds.has(`${Number(split.productionIndex || 0)}:${split.materialId}`));
  return { productions: expanded.filter(production => production.plannedQty > 0), operationSplits };
}

export function buildPlan(payload, context) {
  if (!Array.isArray(payload.productions) && !Array.isArray(payload.shifts) && !payload.planningStartDate && !payload.planningEndDate) {
    return buildSinglePlan(payload, context);
  }

  const sourceProductions = productionEntries(payload, context);
  const expanded = expandRootSplitProductions(payload, sourceProductions);
  const productions = expanded.productions;
  if (!productions.length) {
    const error = new Error('Informe pelo menos uma produção com quantidade maior que zero.');
    error.status = 400;
    throw error;
  }

  const operationOverrides = { ...(payload.operationOverrides || {}) };
  for (const production of productions) {
    if (!production.productionModelName) continue;
    const scopedKey = `${production.productionIndex}:${production.material.id}`;
    operationOverrides[scopedKey] = {
      ...(operationOverrides[scopedKey] || {}),
      productionModelName: operationOverrides[scopedKey]?.productionModelName || production.productionModelName
    };
    if (production.splitStartDate) {
      operationOverrides[scopedKey] = {
        ...(operationOverrides[scopedKey] || {}),
        startDate: production.splitStartDate,
        startTime: production.splitStartTime
      };
    }
    if (productions.length === 1) {
      operationOverrides[String(production.material.id)] = {
        ...(operationOverrides[String(production.material.id)] || {}),
        productionModelName: operationOverrides[String(production.material.id)]?.productionModelName || production.productionModelName
      };
    }
  }

  const stockLedger = makeStockLedger(context);
  const forcedStockOnly = stockOnlySet(payload);
  const skippedProduction = skipProductionSet(payload);
  const stockChoices = stockChoiceMap(payload);
  const builtProductions = productions.map(production => {
    const productionTitle = production.productionTitle || `Produção ${production.productionIndex + 1}`;
    const built = buildAggregatedOperations({
      material: production.material,
      quantity: production.plannedQty,
      context,
      requestedMachine: production.machineName,
      requestedPeople: production.peopleCount,
      operationOverrides,
      stockLedger,
      productionIndex: production.productionIndex,
      productionTitle,
      productionColor: production.color || null,
      forcedStockOnly,
      skippedProduction,
      stockChoices
    });
    const tree = buildRequirementTree({
      material: production.material,
      quantity: production.plannedQty,
      materialsById: context.materialsById,
      inputsByMaterialId: context.inputsByMaterialId,
      matrixRows: context.matrixRows,
      requestedMachine: production.machineName,
      requestedPeople: production.peopleCount,
      operationOverrides,
      states: built.states,
      productionIndex: production.productionIndex,
      productionTitle,
      productionColor: production.color || null
    });
    return {
      production,
      tree,
      operations: applyProductionTransports(built.operations, production, context).map(operation => ({
        ...operation,
        splitParentOperationId: production.splitParentOperationId && String(operation.materialId) === String(production.material.id)
          ? production.splitParentOperationId
          : operation.splitParentOperationId,
        splitPartNumber: production.splitParentOperationId && String(operation.materialId) === String(production.material.id)
          ? production.splitPartNumber
          : operation.splitPartNumber,
        productionOrder: operation.productionOrder + (production.productionIndex * 1000)
      }))
    };
  });
  const trees = builtProductions.map(item => item.tree);
  const tree = trees.length === 1 ? trees[0] : { materialName: 'Plano de produção', children: trees };
  const aggregatedOperations = builtProductions.flatMap(item => item.operations);
  const operations = scheduleOperations(aggregatedOperations, context.matrixRows, {
    dateMode: 'start',
    selectedDate: payload.planningStartDate || payload.selectedDate || payload.startDate,
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    lunchHours: payload.lunchHours,
    shifts: payload.shifts,
    setupHours: payload.setupHours,
    dailyTeamOverrides: payload.dailyTeamOverrides,
    manualWorkDates: payload.manualWorkDates,
    operationOverrides,
    operationSplits: expanded.operationSplits,
    existingOperations: context.existingOperations
  });
  const existingScheduleBlockers = operations.existingScheduleBlockers || [];
  const firstMaterial = productions[0].material;
  const days = buildDays(operations, firstMaterial.primary_unit);
  const shifts = Array.isArray(payload.shifts) && payload.shifts.length
    ? payload.shifts
    : [{ hoursPerDay: payload.hoursPerDay, shiftStartTime: payload.shiftStartTime, shiftEndTime: payload.shiftEndTime, pauseHours: payload.lunchHours }];
  const hoursPerDay = shifts.reduce((sum, shift) => sum + shiftAvailableHours(shift), 0) || Math.max(toOperationalHours(payload.hoursPerDay || 8), 1 / 60);
  const scheduleCalendar = calendarFromPayload({
    shifts: payload.shifts,
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    lunchHours: payload.lunchHours,
    manualWorkDates: payload.manualWorkDates
  });
  const manualWorkDates = normalizeManualWorkDates(payload.manualWorkDates);
  const selectedDate = payload.planningStartDate || payload.selectedDate || payload.startDate;
  const startDate = operations.length ? operations[0].startDate : selectedDate;
  const endDate = operations.length ? operations[operations.length - 1].endDate : payload.planningEndDate || selectedDate;
  const finalOperation = operations[operations.length - 1];
  const uniqueDaysNeeded = new Set(days.map(day => day.planned_date)).size;
  const plannedQty = productions.reduce((sum, production) => sum + production.plannedQty, 0);
  const calendarOperations = planningCalendarOperations(operations, scheduleCalendar, payload, {
    ...context,
    operationOverrides
  });
  const diagnostics = {
    errors: calendarOperations.diagnostics || [],
    warnings: []
  };

  return {
    code: payload.planningCode || codeForPlan(new Date(), productions.length),
    summary: {
      materialId: firstMaterial.id,
      materialName: productions.length === 1 ? firstMaterial.name : `${productions.length} produções`,
      materialCode: productions.length === 1 ? materialCode(firstMaterial) : '',
      plannedQty,
      plannedUnit: productions.length === 1 ? firstMaterial.primary_unit : 'itens',
      machineName: finalOperation?.machineName || null,
      peopleCount: finalOperation?.peopleCount == null ? null : Number(finalOperation.peopleCount),
      dateMode: 'start',
      selectedDate,
      hoursPerDay,
      shiftStartTime: shifts[0]?.shiftStartTime || '07:00',
      shiftEndTime: shifts.at(-1)?.shiftEndTime || '17:00',
      lunchHours: shifts.reduce((sum, shift) => sum + toOperationalHours(shift.pauseHours ?? shift.lunchHours ?? 0), 0),
      planningStartDate: payload.planningStartDate || selectedDate,
      planningEndDate: payload.planningEndDate || endDate,
      shifts,
      dailyTeamOverrides: normalizeDailyTeamOverrides(payload.dailyTeamOverrides),
      manualWorkDates,
      manualConstraints: Array.isArray(payload.manualConstraints) ? payload.manualConstraints : [],
      setupHours: toOperationalHours(payload.setupHours || 0),
      existingOperations: existingScheduleBlockers,
      productions: productions.map(production => ({
        productionIndex: production.productionIndex,
        productionKey: `production-${production.productionIndex}`,
        title: production.productionTitle || `Produção ${production.productionIndex + 1}`,
        color: production.color || null,
        materialId: production.material.id,
        materialName: production.material.name,
        materialCode: materialCode(production.material),
        plannedQty: production.plannedQty,
        plannedUnit: production.material.primary_unit,
        machineName: production.machineName || null,
        peopleCount: production.peopleCount == null || production.peopleCount === '' ? null : Number(production.peopleCount),
        desiredDate: production.desiredDate || null,
        productionModelName: production.productionModelName || null
      })),
      startDate,
      endDate,
      daysNeeded: uniqueDaysNeeded,
      hasPastStart: false
    },
    tree,
    operations: operations.map((operation, index) => index === 0
      ? { ...operation, _planningMeta: { shifts, setupHours: toOperationalHours(payload.setupHours || 0), dailyTeamOverrides: normalizeDailyTeamOverrides(payload.dailyTeamOverrides), manualWorkDates, productions: productions.map(production => ({ productionIndex: production.productionIndex, productionKey: `production-${production.productionIndex}`, title: production.productionTitle || `Produção ${production.productionIndex + 1}`, color: production.color || null, materialId: production.material.id, materialName: production.material.name, materialCode: materialCode(production.material), plannedQty: production.plannedQty, plannedUnit: production.material.primary_unit, machineName: production.machineName || null, peopleCount: production.peopleCount == null || production.peopleCount === '' ? null : Number(production.peopleCount), desiredDate: production.desiredDate || null, productionModelName: production.productionModelName || null })) } }
      : operation),
    calendarOperations,
    diagnostics,
    days
  };
}
