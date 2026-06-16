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
  const pauseMinutes = Math.max(toOperationalHours(shift.pauseHours ?? shift.lunchHours ?? 0), 0) * 60;
  const fallbackDailyMinutes = Math.max(toOperationalHours(shift.hoursPerDay || 8), 1 / 60) * 60;
  let end = parseTime(shift.shiftEndTime, minutesToTime(start + fallbackDailyMinutes + pauseMinutes));
  if (end <= start) end += 24 * 60;
  return Math.max((end - start - pauseMinutes) / 60, 1 / 60);
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
  const timeSeconds = toNumber(row.time_seconds || toNumber(row.time_minutes) * 60);
  return timeSeconds / Math.max(toNumber(row.output_qty), 1);
}

function resolveMatrix(material, matrixRows, requestedMachine, requestedPeople) {
  const options = machineOptions(material, matrixRows);
  if (requestedMachine || requestedPeople) {
    const requested = options.find(row =>
      (!requestedMachine || row.machine_name === requestedMachine)
      && (!requestedPeople || Number(row.people_count) === Number(requestedPeople))
    );
    if (requested) return requested;
  }
  return options.sort((left, right) => matrixSecondsPerUnit(left) - matrixSecondsPerUnit(right))[0] || null;
}

function productivityOptions(material, matrixRows) {
  return machineOptions(material, matrixRows)
    .map(row => ({
      machineName: row.machine_name,
      peopleCount: Number(row.people_count),
      outputQty: toNumber(row.output_qty),
      outputUnit: row.output_unit || material.primary_unit || 'un',
      timeSeconds: toNumber(row.time_seconds || toNumber(row.time_minutes) * 60),
      secondsPerUnit: matrixSecondsPerUnit(row)
    }))
    .sort((left, right) => left.secondsPerUnit - right.secondsPerUnit);
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

function stockForMaterial(material, stockRows, inventoryRows, productionRows) {
  const codes = new Set((material.codes || []).map(code => String(code).trim().toLowerCase()));
  const nasajon = stockRows.reduce((sum, row) => {
    const productCode = String(row.product_code || '').toLowerCase();
    const oldProductCode = String(row.old_product_code || '').toLowerCase();
    return codes.has(productCode) || codes.has(oldProductCode) ? sum + toNumber(row.fiscal_balance_unit) : sum;
  }, 0);
  const inventory = inventoryRows
    .filter(row => String(row.material_id) === String(material.id))
    .reduce((sum, row) => sum + toNumber(row.adjustment_qty), 0);
  const produced = productionRows
    .filter(row => String(row.material_id) === String(material.id))
    .reduce((sum, row) => sum + toNumber(row.quantity), 0);
  return (inventory > 0 ? inventory : nasajon) + produced;
}

function makeStockLedger(context) {
  const balances = new Map();
  return {
    available(material) {
      const key = String(material.id);
      if (!balances.has(key)) {
        balances.set(key, stockForMaterial(material, context.stockRows, context.inventoryRows, context.productionRows));
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
  const matrix = resolveMatrix(material, context.matrixRows, override?.machineName || requestedMachine, override?.peopleCount || requestedPeople);
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
    machineName: matrix?.machine_name || null,
    peopleCount: matrix?.people_count || null,
    productivityOptions: productivityOptions(material, context.matrixRows),
    productionOrder,
    children: []
  };
}

function buildRequirementTree({ material, quantity, materialsById, inputsByMaterialId, matrixRows, requestedMachine, requestedPeople, operationOverrides = {}, states, productionIndex = 0, productionTitle = '' }, stack = []) {
  const state = states?.get(String(material.id)) || {};
  const stockQty = toNumber(state.stockAvailable);
  const produceQty = toNumber(state.produceQty);
  const operationScopedMaterial = { ...material, operationId: `${productionIndex}:${material.id}`, productionIndex };
  const override = overrideForMaterial(operationOverrides, operationScopedMaterial, productionIndex);
  const matrix = resolveMatrix(material, matrixRows, override?.machineName || requestedMachine, override?.peopleCount || requestedPeople);
  const node = {
    productionIndex,
    productionKey: `production-${productionIndex}`,
    productionTitle,
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
    machineName: matrix?.machine_name || null,
    peopleCount: matrix?.people_count || null,
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
      productionTitle
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

function buildAggregatedOperations({ material, quantity, context, requestedMachine, requestedPeople, operationOverrides = {}, stockLedger = makeStockLedger(context), productionIndex = 0, productionTitle = '', forcedStockOnly = new Set() }) {
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
        forceStockOnly: false
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
    const useStockBalance = forcedStockOnly.has(stockOnlyKey(productionIndex, currentMaterial.id));
    const stockQty = stockLedger.available(currentMaterial);
    const stockUsedQty = useStockBalance ? Math.min(stockQty, toNumber(state.requiredQty)) : 0;
    const produceQty = Math.max(toNumber(state.requiredQty) - stockUsedQty, 0);
    state.stockAvailable = stockQty;
    state.stockUsedQty = stockUsedQty;
    state.produceQty = produceQty;
    state.forceStockOnly = useStockBalance;
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

  const operations = [...states.values()]
    .filter(state => state.material.is_initial_raw_material !== true)
    .map(state => {
      const rank = operationRank(state.material, context, operationOverrides, [], productionIndex);
      return operationForMaterial(
        state.material,
        state,
        rank,
        context,
        requestedMachine,
        requestedPeople,
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
    const dependencyMaterialIds = selectedInputs(scopedMaterial, context.inputsByMaterialId, operationOverrides, productionIndex)
      .map(input => String(input.input_material_id))
      .filter(inputMaterialId => operationMaterialIds.has(inputMaterialId));
    return {
      ...operation,
      operationId: `${productionIndex}:${operation.materialId}`,
      productionIndex,
      productionKey: `production-${productionIndex}`,
      productionTitle,
      dependencyMaterialIds: [...new Set(dependencyMaterialIds)],
      dependencyOperationIds: [...new Set(dependencyMaterialIds.map(materialId => `${productionIndex}:${materialId}`))],
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
        successorOperationIds: []
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
  }
  const result = [...grouped.values()]
    .filter(operation => operation.operationType === 'transport' || operation.produceQty > 0)
    .sort((left, right) => toNumber(left.productionOrder) - toNumber(right.productionOrder));
  const operationIds = new Set(result.map(operation => String(operation.operationId || operation.materialId)));
  const remapIds = ids => [...new Set((ids || [])
    .map(id => operationIdToGroupId.get(String(id)) || String(id))
    .filter(Boolean))];
  return result.map(operation => ({
    ...operation,
    dependencyOperationIds: remapIds(operation.dependencyOperationIds)
      .filter(operationId => operationIds.has(String(operationId)) && String(operationId) !== String(operation.operationId)),
    successorOperationIds: remapIds(operation.successorOperationIds)
      .filter(operationId => operationIds.has(String(operationId)) && String(operationId) !== String(operation.operationId)),
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
      peopleCount: Number(part.peopleCount || operation.peopleCount || 0),
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
  const pauseMinutes = Math.max(toOperationalHours(shift.pauseHours ?? shift.lunchHours ?? 0), 0) * 60;
  const dailyMinutes = Math.max(toOperationalHours(shift.hoursPerDay || 8), 1 / 60) * 60;
  const calculatedEnd = shiftStart + dailyMinutes + pauseMinutes;
  let shiftEnd = parseTime(shift.shiftEndTime, minutesToTime(calculatedEnd));
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
  shiftEnd = Math.max(shiftEnd, shiftStart + 1);
  const pauseStart = shift.pauseStartTime
    ? parseTime(shift.pauseStartTime, minutesToTime(shiftStart + Math.floor((shiftEnd - shiftStart - pauseMinutes) / 2)))
    : index === 0 ? 12 * 60 : shiftStart + Math.max(Math.floor((shiftEnd - shiftStart - pauseMinutes) / 2), 0);
  const pauseEnd = pauseStart + pauseMinutes;
  const pauseOverlap = Math.max(Math.min(shiftEnd, pauseEnd) - Math.max(shiftStart, pauseStart), 0);
  const availableMinutes = Math.max(shiftEnd - shiftStart - pauseOverlap, 1);
  return {
    shiftStart,
    shiftEnd,
    lunchStart: pauseStart,
    lunchEnd: pauseEnd,
    dailyMinutes: Math.min(dailyMinutes, availableMinutes),
    label: shift.label || `Turno ${index + 1}`,
    teamAvailable: Math.max(toNumber(shift.teamAvailable || 0), 0)
  };
}

function calendarFromPayload({ shifts, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours }) {
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
  return { shifts: normalizedShifts, shiftStart, shiftEnd, dailyMinutes };
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
  for (let guard = 0; guard < 370; guard += 1) {
    const windows = workWindowsForDate(date, calendar);
    for (const window of windows) {
      if (minutes <= window.start) return { date, minutes: window.start };
      if (minutes < window.end) return { date, minutes };
    }
    date = addDays(date, 1);
    minutes = 0;
  }
  return cursor;
}

function previousWorkEnd(cursor, calendar) {
  let date = cursor.date;
  let minutes = cursor.minutes;
  for (let guard = 0; guard < 370; guard += 1) {
    const windows = workWindowsForDate(date, calendar);
    for (const window of [...windows].reverse()) {
      if (minutes >= window.end) return { date, minutes: window.end };
      if (minutes > window.start) return { date, minutes };
    }
    date = addDays(date, -1);
    minutes = 24 * 60;
  }
  return cursor;
}

function windowForCursor(cursor, calendar) {
  return workWindowsForDate(cursor.date, calendar)
    .find(window => cursor.minutes >= window.start && cursor.minutes < window.end);
}

function scheduleForward(cursor, durationMinutes, calendar) {
  const start = nextWorkStart(cursor, calendar);
  let current = { ...start };
  let remaining = durationMinutes;
  while (remaining > 0) {
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
  while (remaining > 0) {
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

function scheduleOperations(operations, matrixRows, { dateMode, selectedDate, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours, shifts, operationOverrides = {}, operationSplits = [] }) {
  const calendar = calendarFromPayload({ shifts, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours });
  const { shiftStart, shiftEnd } = calendar;
  const scheduled = [];
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
    const matrix = resolveMatrix(
      { name: operation.materialName, codes: operation.materialCode ? [operation.materialCode] : [] },
      matrixRows,
      operation.machineName,
      operation.peopleCount
    );
    if (!matrix) {
      const error = new Error(`Nenhuma produtividade ativa encontrada para ${operation.materialName}.`);
      error.status = 404;
      throw error;
    }
    const timeSeconds = toNumber(matrix.time_seconds || toNumber(matrix.time_minutes) * 60);
    const timeMinutes = timeSeconds / 60;
    const minutesPerUnit = timeMinutes / Math.max(toNumber(matrix.output_qty), 1);
    const totalMinutes = Math.ceil(operation.produceQty * minutesPerUnit);
    return {
      ...operation,
      machineName: matrix.machine_name,
      peopleCount: Number(matrix.people_count),
      outputQty: toNumber(matrix.output_qty),
      outputUnit: matrix.output_unit || operation.unit || 'un',
      timeSeconds,
      minutesPerUnit,
      totalMinutes
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
  const byMachine = new Map();
  const scheduledByMaterialId = new Map();

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
      const dependencyEnd = maxCursor(...((operation.dependencyOperationIds?.length ? operation.dependencyOperationIds : operation.dependencyMaterialIds) || [])
        .map(operationId => scheduledByMaterialId.get(String(operationId)))
        .filter(Boolean)
        .map(item => ({ date: item.endDate, minutes: parseTime(item.endTime, minutesToTime(shiftStart)) })));
      const machineCursor = operation.operationType === 'transport' ? startCursor : byMachine.get(operation.machineName || '') || startCursor;
      const override = overrideForMaterial(operationOverrides, operation);
      const operationCursor = operation.startDate ? { date: operation.startDate, minutes: parseTime(operation.startTime, minutesToTime(shiftStart)) } : null;
      const overrideCursor = overrideStartCursor(override, startCursor.date, shiftStart) || operationCursor;
      const cursor = maxCursor(overrideCursor || startCursor, dependencyEnd, machineCursor);
      const operationCalendar = withForcedWorkDate(calendar, overrideCursor?.date || operationCursor?.date);
      const slot = scheduleForward(cursor, operation.totalMinutes, operationCalendar);
      const item = scheduledItem(operation, slot, operationCalendar);
      scheduledByMaterialId.set(String(operation.operationId || operation.materialId), item);
      if (operation.operationType !== 'transport') byMachine.set(operation.machineName || '', slot.end);
      scheduled.push(item);
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
      const machineCursor = operation.operationType === 'transport' ? endCursor : reverseMachine.get(operation.machineName || '') || endCursor;
      const cursor = minCursor(endCursor, successorStart, machineCursor);
      const slot = scheduleBackward(cursor, operation.totalMinutes, calendar);
      const item = scheduledItem(operation, slot);
      scheduledByMaterialId.set(String(operation.operationId || operation.materialId), item);
      if (operation.operationType !== 'transport') reverseMachine.set(operation.machineName || '', slot.start);
      scheduled.push(item);
    }
  }

  if (dateMode === 'end' && !hasManualStart) {
    scheduleBackwardGraph({ date: selectedDate, minutes: shiftEnd });
  } else {
    scheduleForwardGraph({ date: selectedDate, minutes: shiftStart });
  }

  return scheduled.sort((left, right) =>
    compareCursor(
      { date: left.startDate, minutes: parseTime(left.startTime, minutesToTime(shiftStart)) },
      { date: right.startDate, minutes: parseTime(right.startTime, minutesToTime(shiftStart)) }
    )
    || toNumber(left.productionOrder) - toNumber(right.productionOrder)
  );
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
    forcedStockOnly: stockOnlySet(payload)
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
    operationOverrides,
    operationSplits: payload.operationSplits
  });
  const days = buildDays(operations, material.primary_unit);
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
      peopleCount: finalOperation?.peopleCount || Number(payload.peopleCount || 0) || null,
      dateMode: payload.dateMode || 'start',
      selectedDate: payload.selectedDate || payload.startDate,
      hoursPerDay,
      shiftStartTime: payload.shiftStartTime || '07:12',
      shiftEndTime: payload.shiftEndTime || '16:00',
      lunchHours: toOperationalHours(payload.lunchHours || 0),
      startDate,
      endDate,
      daysNeeded: uniqueDaysNeeded,
      hasPastStart: (payload.dateMode || 'start') === 'end' && new Date(`${startDate}T00:00:00`) < new Date(`${dateKey(new Date())}T00:00:00`)
    },
    tree,
    operations,
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
      productionIndex: index
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
        peopleCount: Number(part.peopleCount || production.peopleCount || 0),
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
      forcedStockOnly
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
      productionTitle
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
    operationOverrides,
    operationSplits: expanded.operationSplits
  });
  const firstMaterial = productions[0].material;
  const days = buildDays(operations, firstMaterial.primary_unit);
  const shifts = Array.isArray(payload.shifts) && payload.shifts.length
    ? payload.shifts
    : [{ hoursPerDay: payload.hoursPerDay, shiftStartTime: payload.shiftStartTime, shiftEndTime: payload.shiftEndTime, pauseHours: payload.lunchHours }];
  const hoursPerDay = shifts.reduce((sum, shift) => sum + shiftAvailableHours(shift), 0) || Math.max(toOperationalHours(payload.hoursPerDay || 8), 1 / 60);
  const selectedDate = payload.planningStartDate || payload.selectedDate || payload.startDate;
  const startDate = operations.length ? operations[0].startDate : selectedDate;
  const endDate = operations.length ? operations[operations.length - 1].endDate : payload.planningEndDate || selectedDate;
  const finalOperation = operations[operations.length - 1];
  const uniqueDaysNeeded = new Set(days.map(day => day.planned_date)).size;
  const plannedQty = productions.reduce((sum, production) => sum + production.plannedQty, 0);

  return {
    code: payload.planningCode || codeForPlan(new Date(), productions.length),
    summary: {
      materialId: firstMaterial.id,
      materialName: productions.length === 1 ? firstMaterial.name : `${productions.length} produções`,
      materialCode: productions.length === 1 ? materialCode(firstMaterial) : '',
      plannedQty,
      plannedUnit: productions.length === 1 ? firstMaterial.primary_unit : 'itens',
      machineName: finalOperation?.machineName || null,
      peopleCount: finalOperation?.peopleCount ? Number(finalOperation.peopleCount) : null,
      dateMode: 'start',
      selectedDate,
      hoursPerDay,
      shiftStartTime: shifts[0]?.shiftStartTime || '07:00',
      shiftEndTime: shifts.at(-1)?.shiftEndTime || '17:00',
      lunchHours: shifts.reduce((sum, shift) => sum + toOperationalHours(shift.pauseHours ?? shift.lunchHours ?? 0), 0),
      planningStartDate: payload.planningStartDate || selectedDate,
      planningEndDate: payload.planningEndDate || endDate,
      shifts,
      productions: productions.map(production => ({
        productionIndex: production.productionIndex,
        productionKey: `production-${production.productionIndex}`,
        title: production.productionTitle || `Produção ${production.productionIndex + 1}`,
        materialId: production.material.id,
        materialName: production.material.name,
        materialCode: materialCode(production.material),
        plannedQty: production.plannedQty,
        plannedUnit: production.material.primary_unit,
        machineName: production.machineName || null,
        peopleCount: Number(production.peopleCount || 0) || null,
        desiredDate: production.desiredDate || null,
        productionModelName: production.productionModelName || null
      })),
      startDate,
      endDate,
      daysNeeded: uniqueDaysNeeded,
      hasPastStart: false
    },
    tree,
    operations,
    days
  };
}
