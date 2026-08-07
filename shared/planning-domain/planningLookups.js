function defaultMatrixSecondsPerUnit(row) {
  const seconds = Number(row?.seconds_per_unit);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const unitsPerHour = Number(row?.units_per_hour);
  return Number.isFinite(unitsPerHour) && unitsPerHour > 0 ? 3600 / unitsPerHour : Number.MAX_SAFE_INTEGER;
}

function defaultMatrixPriority(row) {
  const priority = Number(row?.priority);
  return Number.isFinite(priority) ? priority : 999;
}

function productionModelsForMaterial(material) {
  return Array.isArray(material?.production_models) ? material.production_models.filter(model => (model.inputMaterials || []).length) : [];
}

export function findMaterialById(materials, id) {
  return materials.find(material => String(material.id) === String(id));
}

export function selectMatchingMatrixRows(matrix, material, {
  getPriority = defaultMatrixPriority,
  getSecondsPerUnit = defaultMatrixSecondsPerUnit
} = {}) {
  const codes = new Set((material?.codes || []).map(code => String(code).toLowerCase()));
  return matrix
    .filter(row => row.active !== false)
    .filter(row => row.material_name === material?.name || (row.material_codes || []).some(code => codes.has(String(code).toLowerCase())))
    .sort((left, right) =>
      getPriority(left) - getPriority(right)
      || getSecondsPerUnit(left) - getSecondsPerUnit(right)
    );
}

export function selectProductionMaterialOptions(materials, production) {
  const root = findMaterialById(materials, production.materialId);
  if (!root) return [];
  const seen = new Set();
  const result = [];

  function visit(material) {
    if (!material || seen.has(String(material.id))) return;
    seen.add(String(material.id));
    result.push(material);
    const models = productionModelsForMaterial(material);
    const selectedModel = models.find(model =>
      String(model.name) === String(material.id === root.id ? production.productionModelName : '')
    ) || models[0];
    (selectedModel?.inputMaterials || []).forEach(input => visit(findMaterialById(materials, input.materialId || input.id)));
  }

  visit(root);
  return result;
}

export function materialMatchesSearch(material, searchValue) {
  const haystack = [
    material.name,
    ...(material.codes || [])
  ].map(value => String(value || '').toLowerCase());
  return haystack.some(value => value.includes(searchValue));
}
