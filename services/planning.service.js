function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00`);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function codeForPlan(materialCode, quantity, date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const stamp = `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}${pad(date.getHours())}${pad(date.getMinutes())}`;
  const code = String(materialCode || 'SEM-CODIGO').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `${stamp}${code}${toNumber(quantity)}`;
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

function resolveMatrix(material, matrixRows, requestedMachine, requestedPeople) {
  const options = machineOptions(material, matrixRows);
  return options.find(row =>
    (!requestedMachine || row.machine_name === requestedMachine)
    && (!requestedPeople || Number(row.people_count) === Number(requestedPeople))
  ) || options[0] || null;
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

function buildRequirementTree({ material, quantity, materialsById, inputsByMaterialId, stockRows, inventoryRows, productionRows, matrixRows, requestedMachine, requestedPeople }, stack = []) {
  const stockQty = stockForMaterial(material, stockRows, inventoryRows, productionRows);
  const produceQty = Math.max(toNumber(quantity) - stockQty, 0);
  const matrix = resolveMatrix(material, matrixRows, requestedMachine, requestedPeople);
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
    children: []
  };

  if (produceQty <= 0 || material.is_initial_raw_material === true || stack.includes(String(material.id))) {
    return node;
  }

  const inputs = inputsByMaterialId.get(String(material.id)) || [];
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
      matrixRows
    }, [...stack, String(material.id)]);
  }).filter(Boolean);
  return node;
}

function flattenOperations(tree, operations = []) {
  for (const child of tree.children || []) flattenOperations(child, operations);
  if (tree.produceQty > 0 && !tree.isInitialRawMaterial) operations.push(tree);
  return operations;
}

function scheduleOperations(operations, matrixRows, { dateMode, selectedDate, hoursPerDay }) {
  const dailyMinutes = Math.max(toNumber(hoursPerDay || 8) * 60, 1);
  const scheduled = [];
  const forward = dateMode !== 'end';
  let cursor = selectedDate;
  const source = forward ? operations : [...operations].reverse();

  for (const operation of source) {
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
    const timeMinutes = toNumber(matrix.time_seconds || toNumber(matrix.time_minutes) * 60) / 60;
    const minutesPerUnit = timeMinutes / Math.max(toNumber(matrix.output_qty), 1);
    const totalMinutes = Math.ceil(operation.produceQty * minutesPerUnit);
    const daysNeeded = Math.max(Math.ceil(totalMinutes / dailyMinutes), 1);
    const startDate = forward ? cursor : addDays(cursor, -(daysNeeded - 1));
    const endDate = forward ? addDays(cursor, daysNeeded - 1) : cursor;
    scheduled.push({
      ...operation,
      machineName: matrix.machine_name,
      peopleCount: Number(matrix.people_count),
      totalMinutes,
      daysNeeded,
      startDate,
      endDate
    });
    cursor = forward ? addDays(endDate, 1) : addDays(startDate, -1);
  }

  return forward ? scheduled : scheduled.reverse();
}

function buildDays(operations, plannedUnit) {
  return operations.flatMap(operation => {
    const qtyPerDay = operation.produceQty / operation.daysNeeded;
    return Array.from({ length: operation.daysNeeded }, (_, index) => ({
      planned_date: addDays(operation.startDate, index),
      material_name: operation.materialName,
      material_code: operation.materialCode,
      machine_name: operation.machineName,
      people_count: operation.peopleCount,
      planned_qty: Number(qtyPerDay.toFixed(3)),
      planned_unit: plannedUnit || operation.unit || 'un'
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
    requestedPeople: payload.peopleCount
  });
  const operations = scheduleOperations(flattenOperations(tree), context.matrixRows, {
    dateMode: payload.dateMode,
    selectedDate: payload.selectedDate || payload.startDate,
    hoursPerDay: payload.hoursPerDay
  });
  const days = buildDays(operations, material.primary_unit);
  const startDate = operations.length ? operations[0].startDate : payload.selectedDate || payload.startDate;
  const endDate = operations.length ? operations[operations.length - 1].endDate : payload.selectedDate || payload.startDate;

  return {
    code: codeForPlan(materialCode(material), payload.plannedQty),
    summary: {
      materialId: material.id,
      materialName: material.name,
      materialCode: materialCode(material),
      plannedQty: toNumber(payload.plannedQty),
      plannedUnit: material.primary_unit,
      machineName: operations[0]?.machineName || payload.machineName || null,
      peopleCount: operations[0]?.peopleCount || Number(payload.peopleCount || 0) || null,
      dateMode: payload.dateMode || 'start',
      startDate,
      endDate,
      daysNeeded: days.length,
      hasPastStart: new Date(`${startDate}T00:00:00`) < new Date(`${dateKey(new Date())}T00:00:00`)
    },
    tree,
    operations,
    days
  };
}
