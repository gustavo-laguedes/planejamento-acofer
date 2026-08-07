function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function normalizeProductivityIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeMachineIdentity(value) {
  return normalizeProductivityIdentity(value).replace(/[\s-]+/g, '');
}

function values(source, fields) {
  return fields.flatMap(field => {
    const value = source?.[field];
    return Array.isArray(value) ? value : [value];
  }).map(normalizeProductivityIdentity).filter(Boolean);
}

function originalValues(source, fields) {
  return fields.flatMap(field => {
    const value = source?.[field];
    return Array.isArray(value) ? value : [value];
  }).filter(value => value !== null && value !== undefined && String(value).trim() !== '');
}

function materialIds(source) {
  return values(source, ['id', 'materialId', 'material_id']);
}

function primaryMaterialCodes(source) {
  return values(source, ['code', 'materialCode', 'material_code']);
}

function relatedMaterialCodes(source) {
  return values(source, ['codes', 'materialCodes', 'material_codes']);
}

function materialNames(source) {
  return values(source, ['name', 'materialName', 'material_name']);
}

export function productivityMachineKeys(source = {}) {
  const row = source?.row || source;
  return [...new Set([
    ...values(source, ['machineId', 'machine_id', 'machineName', 'machine_name', 'id', 'name']).map(normalizeMachineIdentity),
    ...values(row, ['machineId', 'machine_id', 'machineName', 'machine_name']).map(normalizeMachineIdentity)
  ])];
}

export function productivityRowPriority(source = {}) {
  const row = source?.row || source;
  const priority = Number(row.machine_priority ?? row.machinePriority ?? source.machinePriority ?? 1);
  return Number.isFinite(priority) && priority > 0 ? Math.floor(priority) : 1;
}

export function isValidProductivityRow(row = {}, { unit = '' } = {}) {
  const outputQty = Number(row.output_qty ?? row.outputQty);
  const timeSeconds = Number(row.time_seconds ?? row.timeSeconds ?? Number(row.time_minutes ?? row.timeMinutes) * 60);
  const peopleCount = Number(row.people_count ?? row.peopleCount);
  const expectedUnit = normalizeProductivityIdentity(unit).replace(/\s+/g, '');
  const rowUnit = normalizeProductivityIdentity(row.output_unit ?? row.outputUnit).replace(/\s+/g, '');
  return row.active !== false
    && (!expectedUnit || !rowUnit || expectedUnit === rowUnit)
    && outputQty > 0
    && timeSeconds > 0
    && Number.isInteger(peopleCount)
    && peopleCount >= 0
    && productivityMachineKeys(row).length > 0;
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some(value => rightSet.has(value));
}

function rowsForLocatedMaterial(rows, seedRows, material, reference) {
  const ids = [...new Set([...materialIds(material), ...materialIds(reference), ...seedRows.flatMap(materialIds)])];
  const codes = [...new Set([
    ...primaryMaterialCodes(material), ...primaryMaterialCodes(reference),
    ...relatedMaterialCodes(material), ...relatedMaterialCodes(reference),
    ...seedRows.flatMap(row => [...primaryMaterialCodes(row), ...relatedMaterialCodes(row)])
  ])];
  return rows.filter(row => (
    (ids.length > 0 && intersects(materialIds(row), ids))
    || (codes.length > 0 && intersects([...primaryMaterialCodes(row), ...relatedMaterialCodes(row)], codes))
  ));
}

export function resolveProductivityMaterial({ reference = {}, materials = [] } = {}) {
  const activeMaterials = (materials || []).filter(material => material?.active !== false);
  const referenceIds = materialIds(reference);
  const byId = activeMaterials.find(material => intersects(materialIds(material), referenceIds));
  if (byId) return byId;

  const referencePrimaryCodes = primaryMaterialCodes(reference);
  const byPrimaryCode = activeMaterials.find(material => intersects(
    [...primaryMaterialCodes(material), ...relatedMaterialCodes(material)],
    referencePrimaryCodes
  ));
  if (byPrimaryCode) return byPrimaryCode;

  const referenceCodes = relatedMaterialCodes(reference);
  const byRelatedCode = activeMaterials.find(material => intersects(
    [...primaryMaterialCodes(material), ...relatedMaterialCodes(material)],
    referenceCodes
  ));
  if (byRelatedCode) return byRelatedCode;

  const referenceName = materialNames(reference)[0];
  return activeMaterials.find(material => materialNames(material).includes(referenceName)) || null;
}

export function resolveMaterialProductivityLines({ material = {}, reference = {}, productivityMatrix = [], unit = '' } = {}) {
  const rows = (productivityMatrix || []).filter(row => isValidProductivityRow(row, { unit }));
  const ids = [...new Set([...materialIds(material), ...materialIds(reference)])];
  const idRows = ids.length ? rows.filter(row => intersects(materialIds(row), ids)) : [];
  const exactRowMatches = row => {
    const codes = [...new Set([
      ...primaryMaterialCodes(material), ...primaryMaterialCodes(reference),
      ...relatedMaterialCodes(material), ...relatedMaterialCodes(reference)
    ])];
    const names = [...new Set([...materialNames(material), ...materialNames(reference)])];
    const rowCodes = [...primaryMaterialCodes(row), ...relatedMaterialCodes(row)];
    const rowNames = materialNames(row);
    return (codes.length > 0 && intersects(rowCodes, codes))
      || (names.length > 0 && intersects(rowNames, names));
  };
  const rowHasExplicitMaterialIdentity = row => {
    return [...primaryMaterialCodes(row), ...relatedMaterialCodes(row), ...materialNames(row)].length > 0;
  };

  const primaryCodes = [...new Set([...primaryMaterialCodes(material), ...primaryMaterialCodes(reference)])];
  const primaryRows = primaryCodes.length
    ? rows.filter(row => intersects(primaryMaterialCodes(row), primaryCodes))
    : [];
  if (idRows.length) {
    const exactIdRows = idRows.filter(row => exactRowMatches(row) || !rowHasExplicitMaterialIdentity(row));
    if (exactIdRows.length) return clone(exactIdRows);
    if (primaryRows.length) return clone(rowsForLocatedMaterial(rows, primaryRows, material, reference).filter(exactRowMatches));
  }
  if (idRows.length && !primaryRows.length) return clone(idRows);
  if (primaryRows.length) return clone(rowsForLocatedMaterial(rows, primaryRows, material, reference));

  const explicitCodes = [...new Set([...relatedMaterialCodes(reference), ...primaryMaterialCodes(reference)])];
  const explicitRows = explicitCodes.length
    ? rows.filter(row => intersects([...primaryMaterialCodes(row), ...relatedMaterialCodes(row)], explicitCodes))
    : [];
  if (explicitRows.length) return clone(rowsForLocatedMaterial(rows, explicitRows, material, reference));

  const registeredCodes = [...new Set([...primaryMaterialCodes(material), ...relatedMaterialCodes(material)])];
  const relatedRows = registeredCodes.length
    ? rows.filter(row => intersects([...primaryMaterialCodes(row), ...relatedMaterialCodes(row)], registeredCodes))
    : [];
  if (relatedRows.length) return clone(rowsForLocatedMaterial(rows, relatedRows, material, reference));

  const names = [...new Set([...materialNames(material), ...materialNames(reference)])];
  return clone(rows.filter(row => intersects(materialNames(row), names)));
}

export function resolveProductivityConfiguration({ productivityRows = [], configurations = [], machine = {}, machineId, machineName, peopleCount, productivityLineId } = {}) {
  const candidates = configurations.length ? configurations : productivityRows;
  const requestedMachine = {
    ...machine,
    machineId: machineId ?? machine.machineId,
    machineName: machineName ?? machine.machineName
  };
  const requestedKeys = productivityMachineKeys(requestedMachine);
  return [...candidates]
    .filter(candidate => productivityLineId === null || productivityLineId === undefined || productivityLineId === ''
      || String((candidate?.row || candidate).id ?? candidate.productivityLineId ?? '') === String(productivityLineId))
    .filter(candidate => Number((candidate?.row || candidate).people_count ?? (candidate?.row || candidate).peopleCount ?? candidate.peopleCount) === Number(peopleCount))
    .filter(candidate => intersects(productivityMachineKeys(candidate), requestedKeys))
    .sort((left, right) => (
      productivityRowPriority(left) - productivityRowPriority(right)
      || Number((right?.row || right).output_qty ?? (right?.row || right).outputQty ?? 0)
        - Number((left?.row || left).output_qty ?? (left?.row || left).outputQty ?? 0)
    ))[0] || null;
}

export function resolveCanonicalProductivityConfiguration({
  material = {}, reference = {}, productivityMatrix = [], productivityRows = [], configurations = [],
  machines = [], machine = {}, machineId, machineName, peopleCount, productivityLineId, unit = ''
} = {}) {
  const rows = productivityRows.length
    ? productivityRows
    : resolveMaterialProductivityLines({ material, reference, productivityMatrix, unit });
  const match = resolveProductivityConfiguration({
    productivityRows: rows, configurations, machine, machineId, machineName,
    peopleCount: Number(peopleCount), productivityLineId
  });
  if (!match) return null;
  const row = match?.row || match;
  const rowKeys = productivityMachineKeys(match);
  const registeredMachine = (machines || []).find(candidate => productivityMachineKeys(candidate).some(key => rowKeys.includes(key))) || {};
  const codes = [...new Set([
    ...originalValues(material, ['code', 'materialCode', 'material_code', 'codes', 'materialCodes', 'material_codes']),
    ...originalValues(reference, ['code', 'materialCode', 'material_code', 'codes', 'materialCodes', 'material_codes']),
    ...originalValues(row, ['material_code', 'materialCode', 'material_codes', 'materialCodes'])
  ].map(String).filter(Boolean))];
  const canonicalMachineId = registeredMachine.machineId ?? registeredMachine.id
    ?? match.machineId ?? row.machine_id ?? row.machineId ?? machineId ?? machine.machineId ?? row.machine_name ?? row.machineName;
  const canonicalMachineName = registeredMachine.machineName ?? registeredMachine.name
    ?? match.machineName ?? row.machine_name ?? row.machineName ?? machineName ?? machine.machineName ?? canonicalMachineId;
  return {
    materialId: String(originalValues(material, ['id', 'materialId', 'material_id'])[0]
      ?? originalValues(reference, ['id', 'materialId', 'material_id'])[0]
      ?? originalValues(row, ['material_id', 'materialId'])[0] ?? ''),
    materialCode: String(originalValues(material, ['code', 'materialCode', 'material_code'])[0]
      ?? originalValues(reference, ['code', 'materialCode', 'material_code'])[0]
      ?? codes[0] ?? ''),
    materialCodes: codes,
    materialName: String(originalValues(material, ['name', 'materialName', 'material_name'])[0]
      ?? originalValues(reference, ['name', 'materialName', 'material_name'])[0]
      ?? originalValues(row, ['material_name', 'materialName'])[0] ?? ''),
    machineId: String(canonicalMachineId ?? ''),
    machineName: String(canonicalMachineName ?? ''),
    people: Number(row.people_count ?? row.peopleCount ?? peopleCount),
    quantityPerDay: Number(row.output_qty ?? row.outputQty),
    unit: String(row.output_unit ?? row.outputUnit ?? unit ?? ''),
    priority: productivityRowPriority(row),
    productivityLineId: String(row.id ?? match.productivityLineId ?? ''),
    row: clone(row)
  };
}

export function summarizeProductivityMatrix({ materials = [], productivityMatrix = [] } = {}) {
  const validRows = (productivityMatrix || []).filter(row => isValidProductivityRow(row));
  const assigned = new Set();
  const summaries = [];

  for (const material of materials || []) {
    const lines = resolveMaterialProductivityLines({ material, productivityMatrix: validRows });
    if (!lines.length) continue;
    lines.forEach(line => assigned.add(productivityRowIdentity(line)));
    summaries.push(productivitySummary(material, lines));
  }

  const legacyGroups = new Map();
  validRows.forEach((row, index) => {
    if (assigned.has(productivityRowIdentity(row))) return;
    const key = primaryMaterialCodes(row)[0] || relatedMaterialCodes(row)[0] || materialNames(row)[0] || String(row.id || index);
    if (!legacyGroups.has(key)) legacyGroups.set(key, []);
    legacyGroups.get(key).push(row);
  });
  legacyGroups.forEach(lines => summaries.push(productivitySummary(null, lines)));
  return summaries.sort((left, right) => left.material_name.localeCompare(right.material_name));
}

function productivityRowIdentity(row = {}) {
  if (row.id !== null && row.id !== undefined && row.id !== '') return `id:${row.id}`;
  return JSON.stringify([
    materialIds(row), primaryMaterialCodes(row), relatedMaterialCodes(row), materialNames(row),
    productivityMachineKeys(row), Number(row.people_count ?? row.peopleCount),
    Number(row.output_qty ?? row.outputQty), Number(row.time_seconds ?? row.timeSeconds)
  ]);
}

function productivitySummary(material, lines) {
  const ordered = [...lines].sort((left, right) => (
    productivityRowPriority(left) - productivityRowPriority(right)
    || String(left.machine_name ?? left.machineName ?? '').localeCompare(String(right.machine_name ?? right.machineName ?? ''))
  ));
  const machines = [...new Set(ordered.map(row => String(row.machine_name ?? row.machineName ?? '').trim()).filter(Boolean))];
  const first = ordered[0] || {};
  return {
    material_key: String(material?.id ?? first.material_id ?? first.materialId ?? first.material_name ?? first.materialName ?? first.id),
    material_name: String(material?.name ?? first.material_name ?? first.materialName ?? ''),
    material_codes: clone(material?.codes || first.material_codes || first.materialCodes || []),
    output_unit: String(material?.primary_unit ?? material?.primaryUnit ?? first.output_unit ?? first.outputUnit ?? 'un'),
    machines,
    line_count: ordered.length,
    active_count: ordered.length,
    max_output_qty: Math.max(...ordered.map(row => Number(row.output_qty ?? row.outputQty) || 0))
  };
}
