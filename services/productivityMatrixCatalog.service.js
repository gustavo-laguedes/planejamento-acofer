function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function normalizeCatalogIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function persistedMaterialId(row = {}) {
  return row.material_id ?? row.materialId ?? null;
}

function primaryMaterialCode(row = {}) {
  return normalizeCatalogIdentity(row.material_code ?? row.materialCode);
}

function persistedMaterialName(row = {}) {
  return normalizeCatalogIdentity(row.material_name ?? row.materialName);
}

function persistedMaterialCodes(row = {}) {
  const codes = Array.isArray(row.material_codes ?? row.materialCodes)
    ? (row.material_codes ?? row.materialCodes)
    : [];
  const primaryCode = row.material_code ?? row.materialCode;
  return [...new Set([primaryCode, ...codes].map(code => String(code || '').trim()).filter(Boolean))];
}

function materialCodes(material = {}) {
  return [...new Set([
    material.code,
    ...(Array.isArray(material.codes) ? material.codes : [])
  ].map(normalizeCatalogIdentity).filter(Boolean))];
}

export function catalogMaterialForProductivityRow(row = {}, materials = []) {
  const activeMaterials = (materials || []).filter(material => material?.active !== false);
  const materialId = persistedMaterialId(row);
  if (materialId !== null && materialId !== undefined && materialId !== '') {
    return activeMaterials.find(material => String(material.id) === String(materialId)) || null;
  }

  const code = primaryMaterialCode(row);
  const name = persistedMaterialName(row);
  if (code) {
    const codeMatches = activeMaterials.filter(material => materialCodes(material).includes(code));
    const exactMatches = name
      ? codeMatches.filter(material => normalizeCatalogIdentity(material.name) === name)
      : codeMatches;
    return exactMatches.length === 1 ? exactMatches[0] : null;
  }

  if (!name) return null;
  const nameMatches = activeMaterials.filter(material => normalizeCatalogIdentity(material.name) === name);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

export function productivityCatalogGroupKey(row = {}, materials = [], fallbackIndex = 0) {
  const materialId = persistedMaterialId(row);
  if (materialId !== null && materialId !== undefined && materialId !== '') {
    return `material-id:${normalizeCatalogIdentity(materialId)}`;
  }

  const code = primaryMaterialCode(row);
  const name = persistedMaterialName(row);
  if (code) return `primary-code:${code}|name:${name}`;

  const legacyCodes = persistedMaterialCodes(row).map(normalizeCatalogIdentity).sort();
  if (name && legacyCodes.length) return `legacy-codes:${legacyCodes.join('|')}|name:${name}`;

  const catalogMaterial = catalogMaterialForProductivityRow(row, materials);
  if (catalogMaterial) return `legacy-material-id:${normalizeCatalogIdentity(catalogMaterial.id)}`;

  const rowId = row.id ?? fallbackIndex;
  return `legacy-row:${normalizeCatalogIdentity(rowId)}`;
}

export function productivityRowsForCatalogGroup({ groupKey, materials = [], productivityMatrix = [] } = {}) {
  return clone((productivityMatrix || []).filter((row, index) => (
    row?.active !== false
    && productivityCatalogGroupKey(row, materials, index) === String(groupKey)
  )));
}

export function summarizeProductivityCatalog({ materials = [], productivityMatrix = [] } = {}) {
  const groups = new Map();
  (productivityMatrix || []).forEach((row, index) => {
    if (row?.active === false) return;
    const key = productivityCatalogGroupKey(row, materials, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.entries()].map(([materialKey, lines]) => {
    const ordered = [...lines].sort((left, right) => (
      Number(left.machine_priority ?? left.machinePriority ?? 0) - Number(right.machine_priority ?? right.machinePriority ?? 0)
      || String(left.machine_name ?? left.machineName ?? '').localeCompare(String(right.machine_name ?? right.machineName ?? ''))
    ));
    const first = ordered[0] || {};
    const material = catalogMaterialForProductivityRow(first, materials);
    return {
      material_key: materialKey,
      catalog_material_id: material?.id ?? null,
      material_name: String(first.material_name ?? first.materialName ?? ''),
      material_codes: persistedMaterialCodes(first),
      output_unit: String(first.output_unit ?? first.outputUnit ?? 'un'),
      machines: [...new Set(ordered.map(row => String(row.machine_name ?? row.machineName ?? '').trim()).filter(Boolean))],
      line_count: ordered.length,
      active_count: ordered.length,
      max_output_qty: Math.max(...ordered.map(row => Number(row.output_qty ?? row.outputQty) || 0))
    };
  }).sort((left, right) => left.material_name.localeCompare(right.material_name));
}
