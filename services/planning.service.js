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
  if (operation.materialId) return String(operation.materialId);
  return [
    String(operation.materialName || '').trim().toLowerCase(),
    operation.materialCode || '',
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
  const selectedModelId = override?.productionModelMaterialId ? String(override.productionModelMaterialId) : null;
  return selectedModelId
    ? allInputs.filter(input => String(input.input_material_id) === selectedModelId)
    : allInputs;
}

function productionModelOptions(material, inputsByMaterialId, materialsById) {
  return (inputsByMaterialId.get(String(material.id)) || []).map(input => {
    const inputMaterial = materialsById.get(String(input.input_material_id));
    return inputMaterial ? {
      materialId: inputMaterial.id,
      materialName: inputMaterial.name,
      qtyPerOutput: toNumber(input.qty_per_output || 1)
    } : null;
  }).filter(Boolean);
}

function operationForMaterial(material, requiredQty, productionOrder, context, requestedMachine, requestedPeople, operationOverrides = {}) {
  const stockQty = stockForMaterial(material, context.stockRows, context.inventoryRows, context.productionRows);
  const produceQty = Math.max(toNumber(requiredQty) - stockQty, 0);
  const override = overrideForMaterial(operationOverrides, material);
  const matrix = resolveMatrix(material, context.matrixRows, override?.machineName || requestedMachine, override?.peopleCount || requestedPeople);
  const inputs = selectedInputs(material, context.inputsByMaterialId, operationOverrides);
  const modelOptions = productionModelOptions(material, context.inputsByMaterialId, context.materialsById);
  const productionModelMaterialId = inputs[0]?.input_material_id || null;
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
    productionModelMaterialId,
    productionModelName: productionModelMaterialId
      ? context.materialsById.get(String(productionModelMaterialId))?.name || null
      : null,
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
  node.productionModelMaterialId = inputs[0]?.input_material_id || null;
  node.productionModelName = node.productionModelMaterialId
    ? materialsById.get(String(node.productionModelMaterialId))?.name || null
    : null;
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
  if (tree.produceQty > 0) {
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

  return [...states.values()]
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
}

function groupOperations(operations) {
  const grouped = new Map();
  for (const operation of operations) {
    const key = normalizedMaterialKey(operation);
    if (!grouped.has(key)) {
      grouped.set(key, { ...operation, requiredQty: 0, produceQty: 0 });
    }
    const current = grouped.get(key);
    current.requiredQty = Number((toNumber(current.requiredQty) + toNumber(operation.requiredQty)).toFixed(3));
    current.productionOrder = Math.min(toNumber(current.productionOrder), toNumber(operation.productionOrder));
    current.stockQty = Number(Math.max(toNumber(current.stockQty), toNumber(operation.stockQty)).toFixed(3));
  }
  return [...grouped.values()]
    .map(operation => ({
      ...operation,
      produceQty: Number(Math.max(toNumber(operation.requiredQty) - toNumber(operation.stockQty), 0).toFixed(3))
    }))
    .filter(operation => operation.produceQty > 0)
    .sort((left, right) => toNumber(left.productionOrder) - toNumber(right.productionOrder));
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

function nextWorkStart(cursor, shiftStart, shiftEnd) {
  if (cursor.minutes < shiftStart) return { date: cursor.date, minutes: shiftStart };
  if (cursor.minutes >= shiftEnd) return { date: addDays(cursor.date, 1), minutes: shiftStart };
  return cursor;
}

function previousWorkEnd(cursor, shiftStart, shiftEnd) {
  if (cursor.minutes > shiftEnd) return { date: cursor.date, minutes: shiftEnd };
  if (cursor.minutes <= shiftStart) return { date: addDays(cursor.date, -1), minutes: shiftEnd };
  return cursor;
}

function scheduleForward(cursor, durationMinutes, shiftStart, shiftEnd) {
  const start = nextWorkStart(cursor, shiftStart, shiftEnd);
  let current = { ...start };
  let remaining = durationMinutes;
  while (remaining > 0) {
    current = nextWorkStart(current, shiftStart, shiftEnd);
    const available = shiftEnd - current.minutes;
    const used = Math.min(remaining, available);
    current = { date: current.date, minutes: current.minutes + used };
    remaining -= used;
    if (remaining > 0) current = { date: addDays(current.date, 1), minutes: shiftStart };
  }
  return { start, end: current };
}

function scheduleBackward(cursor, durationMinutes, shiftStart, shiftEnd) {
  const end = previousWorkEnd(cursor, shiftStart, shiftEnd);
  let current = { ...end };
  let remaining = durationMinutes;
  while (remaining > 0) {
    current = previousWorkEnd(current, shiftStart, shiftEnd);
    const available = current.minutes - shiftStart;
    const used = Math.min(remaining, available);
    current = { date: current.date, minutes: current.minutes - used };
    remaining -= used;
    if (remaining > 0) current = { date: addDays(current.date, -1), minutes: shiftEnd };
  }
  return { start: current, end };
}

function segmentsForOperation(operation, shiftStart, shiftEnd) {
  const segments = [];
  let cursor = { date: operation.startDate, minutes: parseTime(operation.startTime, '07:12') };
  const end = { date: operation.endDate, minutes: parseTime(operation.endTime, '16:00') };
  while (compareCursor(cursor, end) < 0) {
    cursor = nextWorkStart(cursor, shiftStart, shiftEnd);
    if (compareCursor(cursor, end) >= 0) break;
    const segmentEndMinutes = cursor.date === end.date ? Math.min(end.minutes, shiftEnd) : shiftEnd;
    const minutes = Math.max(segmentEndMinutes - cursor.minutes, 0);
    if (minutes > 0) {
      segments.push({
        date: cursor.date,
        startTime: minutesToTime(cursor.minutes),
        endTime: minutesToTime(segmentEndMinutes),
        minutes
      });
    }
    cursor = { date: addDays(cursor.date, 1), minutes: shiftStart };
  }
  return segments;
}

function scheduleOperations(operations, matrixRows, { dateMode, selectedDate, hoursPerDay, shiftStartTime, shiftEndTime, lunchHours, operationOverrides = {} }) {
  const shiftStart = parseTime(shiftStartTime, '07:12');
  const requestedShiftEnd = Math.max(parseTime(shiftEndTime, '16:00'), shiftStart + 1);
  const lunchMinutes = Math.max(toOperationalHours(lunchHours || 0), 0) * 60;
  const shiftAvailableMinutes = Math.max(requestedShiftEnd - shiftStart - lunchMinutes, 1);
  const dailyMinutes = Math.min(Math.max(toOperationalHours(hoursPerDay || 8), 1 / 60) * 60, shiftAvailableMinutes);
  const shiftEnd = Math.min(requestedShiftEnd, shiftStart + dailyMinutes);
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

  if (dateMode === 'end') {
    let cursor = { date: selectedDate, minutes: shiftEnd };
    for (const operation of [...source].reverse()) {
      const item = enrich(operation);
      const slot = scheduleBackward(cursor, item.totalMinutes, shiftStart, shiftEnd);
      scheduled.unshift({
        ...item,
        daysNeeded: eachSegmentDayCount(slot.start.date, slot.end.date),
        startDate: slot.start.date,
        startTime: minutesToTime(slot.start.minutes),
        endDate: slot.end.date,
        endTime: minutesToTime(slot.end.minutes),
        segments: segmentsForOperation({ startDate: slot.start.date, startTime: minutesToTime(slot.start.minutes), endDate: slot.end.date, endTime: minutesToTime(slot.end.minutes) }, shiftStart, shiftEnd)
      });
      cursor = slot.start;
    }
  } else {
    let cursor = { date: selectedDate, minutes: shiftStart };
    for (const operation of source) {
      const override = overrideForMaterial(operationOverrides, operation);
      const overrideCursor = splitDateTime(override?.startDate, cursor.date, shiftStart);
      if (override?.startDate && (!scheduled.length || compareCursor(overrideCursor, cursor) > 0)) cursor = overrideCursor;
      const item = enrich(operation);
      const slot = scheduleForward(cursor, item.totalMinutes, shiftStart, shiftEnd);
      scheduled.push({
        ...item,
        daysNeeded: eachSegmentDayCount(slot.start.date, slot.end.date),
        startDate: slot.start.date,
        startTime: minutesToTime(slot.start.minutes),
        endDate: slot.end.date,
        endTime: minutesToTime(slot.end.minutes),
        segments: segmentsForOperation({ startDate: slot.start.date, startTime: minutesToTime(slot.start.minutes), endDate: slot.end.date, endTime: minutesToTime(slot.end.minutes) }, shiftStart, shiftEnd)
      });
      cursor = slot.end;
    }
  }

  return scheduled;
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
    operationOverrides: payload.operationOverrides || {}
  });
  const aggregatedOperations = buildAggregatedOperations({
    material,
    quantity: payload.plannedQty,
    context,
    requestedMachine: payload.machineName,
    requestedPeople: payload.peopleCount,
    operationOverrides: payload.operationOverrides || {}
  });
  const operations = scheduleOperations(aggregatedOperations, context.matrixRows, {
    dateMode: payload.dateMode,
    selectedDate: payload.selectedDate || payload.startDate,
    hoursPerDay: payload.hoursPerDay,
    shiftStartTime: payload.shiftStartTime,
    shiftEndTime: payload.shiftEndTime,
    lunchHours: payload.lunchHours,
    operationOverrides: payload.operationOverrides || {}
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
