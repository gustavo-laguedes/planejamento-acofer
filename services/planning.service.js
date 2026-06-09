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
  const normalizedValue = rawValue.includes(',')
    ? rawValue.replace(/\./g, '').replace(',', '.')
    : rawValue;
  const number = Number(normalizedValue || 0);
  return Number.isFinite(number) ? number : 0;
}

function toOperationalHours(value) {
  const rawValue = String(value ?? '').trim();
  const durationValue = rawValue.match(/^(\d+),(\d{2})$/);
  if (durationValue && Number(durationValue[2]) <= 59) {
    return Number(durationValue[1]) + (Number(durationValue[2]) / 60);
  }
  return toNumber(value);
}

function normalizedMaterialKey(operation) {
  const materialKey = operation.materialId ? String(operation.materialId) : [
    String(operation.materialName || '').trim().toLowerCase(),
    operation.materialCode || '',
    operation.unit || ''
  ].join('|');
  return [
    materialKey,
    operation.machineName || '',
    operation.productionModelName || '',
    operation.productionOrder || 0
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

function codeForPlan(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function materialCode(material) {
  return Array.isArray(material?.codes) ? material.codes[0] || null : null;
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

function overrideForMaterial(overrides = {}, material) {
  const keys = [material.id, String(material.id), material.name, materialCode(material)].filter(Boolean);
  for (const key of keys) {
    if (overrides[key]) return overrides[key];
  }
  return null;
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

function selectedInputs(material, inputsByMaterialId, operationOverrides = {}) {
  const allInputs = inputsByMaterialId.get(String(material.id)) || [];
  const override = overrideForMaterial(operationOverrides, material);
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

function operationForMaterial(material, requiredQty, productionOrder, context, requestedMachine, requestedPeople, operationOverrides = {}) {
  const stockQty = stockForMaterial(material, context.stockRows, context.inventoryRows, context.productionRows);
  const produceQty = Math.max(toNumber(requiredQty) - stockQty, 0);
  const override = overrideForMaterial(operationOverrides, material);
  const matrix = resolveMatrix(material, context.matrixRows, override?.machineName || requestedMachine, override?.peopleCount || requestedPeople);
  const inputs = selectedInputs(material, context.inputsByMaterialId, operationOverrides);
  const modelOptions = productionModelOptions(material, context.inputsByMaterialId, context.materialsById);
  const productionModelName = inputs[0]?.production_model_name || modelOptions[0]?.modelName || null;
  return {
    materialId: material.id,
    materialName: material.name,
    materialCode: materialCode(material),
    requiredQty: Number(toNumber(requiredQty).toFixed(3)),
    stockQty: Number(stockQty.toFixed(3)),
    produceQty: Number(produceQty.toFixed(3)),
    unit: material.primary_unit,
    status: produceQty <= 0 ? 'Estoque suficiente' : 'Produzir diferenÃ§a',
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

function buildRequirementTree({ material, quantity, materialsById, inputsByMaterialId, stockRows, inventoryRows, productionRows, matrixRows, requestedMachine, requestedPeople, operationOverrides = {} }, stack = []) {
  const stockQty = stockForMaterial(material, stockRows, inventoryRows, productionRows);
  const produceQty = Math.max(toNumber(quantity) - stockQty, 0);
  const override = overrideForMaterial(operationOverrides, material);
  const matrix = resolveMatrix(material, matrixRows, override?.machineName || requestedMachine, override?.peopleCount || requestedPeople);
  const node = {
    materialId: material.id,
    materialName: material.name,
    materialCode: materialCode(material),
    requiredQty: toNumber(quantity),
    stockQty: Number(stockQty.toFixed(3)),
    produceQty: Number(produceQty.toFixed(3)),
    unit: material.primary_unit,
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

  const inputs = selectedInputs(material, inputsByMaterialId, operationOverrides);
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
      stockRows,
      inventoryRows,
      productionRows,
      matrixRows,
      operationOverrides
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

function operationRank(material, context, operationOverrides = {}, stack = []) {
  if (!material || stack.includes(String(material.id))) return 0;
  const inputs = selectedInputs(material, context.inputsByMaterialId, operationOverrides)
    .map(input => context.materialsById.get(String(input.input_material_id)))
    .filter(Boolean);
  if (!inputs.length || material.is_initial_raw_material === true) return 0;
  return 1 + Math.max(...inputs.map(inputMaterial =>
    operationRank(inputMaterial, context, operationOverrides, [...stack, String(material.id)])
  ));
}

function buildAggregatedOperations({ material, quantity, context, requestedMachine, requestedPeople, operationOverrides = {} }) {
  const states = new Map();

  function stateFor(currentMaterial) {
    const key = String(currentMaterial.id);
    if (!states.has(key)) {
      states.set(key, {
        material: currentMaterial,
        requiredQty: 0,
        expandedProduceQty: 0
      });
    }
    return states.get(key);
  }

  stateFor(material).requiredQty = toNumber(quantity);

  let changed = true;
  let guard = 0;
  while (changed && guard < 200) {
    changed = false;
    guard += 1;
    for (const state of [...states.values()]) {
      const currentMaterial = state.material;
      const stockQty = stockForMaterial(currentMaterial, context.stockRows, context.inventoryRows, context.productionRows);
      const produceQty = Math.max(toNumber(state.requiredQty) - stockQty, 0);
      const deltaProduceQty = Number((produceQty - state.expandedProduceQty).toFixed(6));
      if (deltaProduceQty <= 0) continue;
      state.expandedProduceQty = produceQty;
      if (currentMaterial.is_initial_raw_material === true) continue;
      const inputs = selectedInputs(currentMaterial, context.inputsByMaterialId, operationOverrides);
      for (const input of inputs) {
        const inputMaterial = context.materialsById.get(String(input.input_material_id));
        if (!inputMaterial) continue;
        const inputState = stateFor(inputMaterial);
        inputState.requiredQty = Number((toNumber(inputState.requiredQty) + deltaProduceQty * toNumber(input.qty_per_output || 1)).toFixed(6));
        changed = true;
      }
    }
  }

  const operations = [...states.values()]
    .filter(state => state.material.is_initial_raw_material !== true)
    .map(state => {
      const rank = operationRank(state.material, context, operationOverrides);
      return operationForMaterial(
        state.material,
        state.requiredQty,
        rank,
        context,
        requestedMachine,
        requestedPeople,
        operationOverrides
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
    const dependencyMaterialIds = selectedInputs(material, context.inputsByMaterialId, operationOverrides)
      .map(input => String(input.input_material_id))
      .filter(inputMaterialId => operationMaterialIds.has(inputMaterialId));
    return {
      ...operation,
      dependencyMaterialIds: [...new Set(dependencyMaterialIds)],
      successorMaterialIds: []
    };
  });
  const byMaterialId = new Map(withDependencies.map(operation => [String(operation.materialId), operation]));
  for (const operation of withDependencies) {
    for (const dependencyMaterialId of operation.dependencyMaterialIds || []) {
      const dependency = byMaterialId.get(String(dependencyMaterialId));
      if (!dependency) continue;
      dependency.successorMaterialIds = [...new Set([...(dependency.successorMaterialIds || []), String(operation.materialId)])];
    }
  }
  return withDependencies;
}

function groupOperations(operations) {
  const grouped = new Map();
  for (const operation of operations) {
    const key = normalizedMaterialKey(operation);
    if (!grouped.has(key)) {
      grouped.set(key, { ...operation, requiredQty: 0, produceQty: 0, dependencyMaterialIds: [], successorMaterialIds: [] });
    }
    const current = grouped.get(key);
    current.requiredQty = Number((toNumber(current.requiredQty) + toNumber(operation.requiredQty)).toFixed(3));
    current.productionOrder = Math.min(toNumber(current.productionOrder), toNumber(operation.productionOrder));
    current.stockQty = Number(Math.max(toNumber(current.stockQty), toNumber(operation.stockQty)).toFixed(3));
    current.dependencyMaterialIds = [...new Set([...(current.dependencyMaterialIds || []), ...(operation.dependencyMaterialIds || []).map(String)])];
    current.successorMaterialIds = [...new Set([...(current.successorMaterialIds || []), ...(operation.successorMaterialIds || []).map(String)])];
  }
  const result = [...grouped.values()]
    .map(operation => ({
      ...operation,
      produceQty: Number(Math.max(toNumber(operation.requiredQty) - toNumber(operation.stockQty), 0).toFixed(3))
    }))
    .filter(operation => operation.produceQty > 0)
    .sort((left, right) => toNumber(left.productionOrder) - toNumber(right.productionOrder));
  const materialIds = new Set(result.map(operation => String(operation.materialId)));
  return result.map(operation => ({
    ...operation,
    dependencyMaterialIds: (operation.dependencyMaterialIds || []).filter(materialId => materialIds.has(String(materialId))),
    successorMaterialIds: (operation.successorMaterialIds || []).filter(materialId => materialIds.has(String(materialId)))
  }));
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

function workWindowsForDate(date, shiftStart, shiftEnd, lunchStart, lunchEnd, dailyMinutes) {
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

function firstWindow(date, calendar) {
  return workWindowsForDate(date, calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes)[0];
}

function nextWorkStart(cursor, calendar) {
  let date = cursor.date;
  let minutes = cursor.minutes;
  for (let guard = 0; guard < 370; guard += 1) {
    const windows = workWindowsForDate(date, calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes);
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
    const windows = workWindowsForDate(date, calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes);
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
  return workWindowsForDate(cursor.date, calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes)
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
      const next = firstWindow(addDays(current.date, 1), calendar);
      current = { date: next.date, minutes: next.start };
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
    const window = workWindowsForDate(current.date, calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes)
      .find(item => current.minutes > item.start && current.minutes <= item.end);
    if (!window) {
      const previous = workWindowsForDate(addDays(current.date, -1), calendar.shiftStart, calendar.shiftEnd, calendar.lunchStart, calendar.lunchEnd, calendar.dailyMinutes).at(-1);
      current = { date: previous.date, minutes: previous.end };
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

function scheduleOperations(operations, matrixRows, { dateMode, selectedDate, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours, operationOverrides = {} }) {
  const shiftStart = parseTime(shiftStartTime, '07:12');
  const requestedShiftEnd = Math.max(parseTime(shiftEndTime, '16:00'), shiftStart + 1);
  const lunchMinutes = Math.max(toOperationalHours(lunchHours || 0), 0) * 60;
  const lunchStart = 12 * 60;
  const lunchEnd = lunchStart + lunchMinutes;
  const lunchOverlap = Math.max(Math.min(requestedShiftEnd, lunchEnd) - Math.max(shiftStart, lunchStart), 0);
  const shiftAvailableMinutes = Math.max(requestedShiftEnd - shiftStart - lunchOverlap, 1);
  const dailyMinutes = Math.min(Math.max(toOperationalHours(hoursPerDay || 8), 1 / 60) * 60, shiftAvailableMinutes);
  const shiftEnd = requestedShiftEnd;
  const calendar = { shiftStart, shiftEnd, lunchStart, lunchEnd, dailyMinutes };
  const scheduled = [];
  const source = groupOperations(operations);

  const enrich = operation => {
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

  const scheduledItem = (item, slot) => ({
    ...item,
    daysNeeded: eachSegmentDayCount(slot.start.date, slot.end.date),
    startDate: slot.start.date,
    startTime: minutesToTime(slot.start.minutes),
    endDate: slot.end.date,
    endTime: minutesToTime(slot.end.minutes),
    segments: segmentsForOperation({ startDate: slot.start.date, startTime: minutesToTime(slot.start.minutes), endDate: slot.end.date, endTime: minutesToTime(slot.end.minutes) }, calendar)
  });

  const enriched = source.map(enrich);
  const byMaterialId = new Map(enriched.map(operation => [String(operation.materialId), operation]));
  const hasManualStart = enriched.some(operation => overrideForMaterial(operationOverrides, operation)?.startDate);
  const byMachine = new Map();
  const scheduledByMaterialId = new Map();

  const predecessorsDone = operation => (operation.dependencyMaterialIds || [])
    .every(materialId => scheduledByMaterialId.has(String(materialId)) || !byMaterialId.has(String(materialId)));
  const successorsDone = operation => (operation.successorMaterialIds || [])
    .every(materialId => scheduledByMaterialId.has(String(materialId)) || !byMaterialId.has(String(materialId)));
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
      const dependencyEnd = maxCursor(...(operation.dependencyMaterialIds || [])
        .map(materialId => scheduledByMaterialId.get(String(materialId)))
        .filter(Boolean)
        .map(item => ({ date: item.endDate, minutes: parseTime(item.endTime, minutesToTime(shiftStart)) })));
      const machineCursor = byMachine.get(operation.machineName || '') || startCursor;
      const override = overrideForMaterial(operationOverrides, operation);
      const overrideCursor = override?.startDate ? splitDateTime(override.startDate, startCursor.date, shiftStart) : null;
      const cursor = maxCursor(startCursor, dependencyEnd, machineCursor, overrideCursor);
      const slot = scheduleForward(cursor, operation.totalMinutes, calendar);
      const item = scheduledItem(operation, slot);
      scheduledByMaterialId.set(String(operation.materialId), item);
      byMachine.set(operation.machineName || '', slot.end);
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
      const successorStart = minCursor(...(operation.successorMaterialIds || [])
        .map(materialId => scheduledByMaterialId.get(String(materialId)))
        .filter(Boolean)
        .map(item => ({ date: item.startDate, minutes: parseTime(item.startTime, minutesToTime(shiftStart)) })));
      const machineCursor = reverseMachine.get(operation.machineName || '') || endCursor;
      const cursor = minCursor(endCursor, successorStart, machineCursor);
      const slot = scheduleBackward(cursor, operation.totalMinutes, calendar);
      const item = scheduledItem(operation, slot);
      scheduledByMaterialId.set(String(operation.materialId), item);
      reverseMachine.set(operation.machineName || '', slot.start);
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

export function buildPlan(payload, context) {
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

  const tree = buildRequirementTree({
    material,
    quantity: payload.plannedQty,
    materialsById: context.materialsById,
    inputsByMaterialId: context.inputsByMaterialId,
    stockRows: context.stockRows,
    inventoryRows: context.inventoryRows,
    productionRows: context.productionRows,
    matrixRows: context.matrixRows,
    requestedMachine: payload.machineName,
    requestedPeople: payload.peopleCount,
    operationOverrides
  });
  const aggregatedOperations = buildAggregatedOperations({
    material,
    quantity: payload.plannedQty,
    context,
    requestedMachine: payload.machineName,
    requestedPeople: payload.peopleCount,
    operationOverrides
  });
  const operations = scheduleOperations(aggregatedOperations, context.matrixRows, {
    dateMode: payload.dateMode,
    selectedDate: payload.selectedDate || payload.startDate,
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    lunchHours: payload.lunchHours,
    operationOverrides
  });
  const days = buildDays(operations, material.primary_unit);
  const hoursPerDay = Math.max(toOperationalHours(payload.hoursPerDay || 8), 1 / 60);
  const startDate = operations.length ? operations[0].startDate : payload.selectedDate || payload.startDate;
  const endDate = operations.length ? operations[operations.length - 1].endDate : payload.selectedDate || payload.startDate;
  const finalOperation = operations[operations.length - 1];
  const uniqueDaysNeeded = new Set(days.map(day => day.planned_date)).size;

  return {
    code: codeForPlan(),
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
