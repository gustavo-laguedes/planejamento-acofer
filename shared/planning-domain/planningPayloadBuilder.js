export function buildProductionPayload({
  productions,
  materials,
  findMaterialById,
  isHexColor,
  getAutomaticProductionColor,
  productionIndexOffset = 0
}) {
  return productions.map((production, index) => {
    const productionIndex = productionIndexOffset + index;
    const material = findMaterialById(materials, production.materialId);
    return {
      materialId: Number(production.materialId),

      productionNumber:
        Number.isInteger(
          Number(
            production.productionNumber
          )
        )
        &&
        Number(
          production.productionNumber
        ) > 0

          ? Number(
              production.productionNumber
            )

          : productionIndex + 1,

      color: isHexColor(production.color) ? production.color : getAutomaticProductionColor(productionIndex),
      materialCode: material?.codes?.[0] || '',
      plannedQty: Number(production.plannedQty),
      plannedUnit: material?.primary_unit || 'un',
      machineName: production.machineName,
      peopleCount: Number(production.peopleCount),
      desiredDate: production.desiredDate || null,
      productionModelName:
  production.productionModelName,

transports:
  Array.isArray(
    production.transports
  )
    ? production.transports.map(
        item => ({
          ...item
        })
      )
    : []
    };
  });
}

function stockOnlyKey(productionIndex, materialId) {
  return `${Number(productionIndex || 0)}:${Number(materialId)}`;
}

export function buildStockOnlyMaterialsForPayload({ stockOnlyMaterials, productions }) {
  const finalProducts = new Set(productions.map((production, index) =>
    stockOnlyKey(index, production.materialId)
  ));
  return (stockOnlyMaterials || []).filter(item =>
    !finalProducts.has(stockOnlyKey(item.productionIndex, item.materialId))
  );
}

export function buildShiftPayload(shifts, { getDefaultTeamAvailable }) {
  return shifts.map((shift, index) => {
    const legacyTotal = getDefaultTeamAvailable(shift.teamAvailable, index);
    const suppliedMatrix = Number(shift.matrixTeamAvailable);
    const matrixTeamAvailable = Number.isInteger(suppliedMatrix) && suppliedMatrix >= 0
      ? suppliedMatrix
      : 1;
    const suppliedFeital = Number(shift.feitalTeamAvailable);
    const feitalTeamAvailable = Number.isInteger(suppliedFeital) && suppliedFeital >= 0
      ? suppliedFeital
      : Math.max(legacyTotal - matrixTeamAvailable, 0);
    return {
      label: shift.label,
      hoursPerDay: String(shift.hoursPerDay || '').trim() || '8,48',
      shiftStartTime: shift.shiftStartTime,
      pauseLabel: shift.pauseLabel,
      pauseHours: '0',
      shiftEndTime: shift.shiftEndTime,
      matrixTeamAvailable,
      feitalTeamAvailable,
      teamAvailable: matrixTeamAvailable + feitalTeamAvailable
    };
  });
}

export function buildPlanningSimulationPayload({
  draft,
  materials,
  findMaterialById,
  shifts,
  setupHours,
  productions,
  stockOnlyMaterials,
  manualWorkDates
}) {
  const firstProduction = draft.productions[0] || {};
  const firstMaterial = findMaterialById(materials, firstProduction.materialId);
  return {
    dateMode: 'start',
    selectedDate: draft.planningStartDate,
    startDate: draft.planningStartDate,
    planningStartDate: draft.planningStartDate,
    materialId: Number(firstProduction.materialId),
    materialCode: firstMaterial?.codes?.[0] || '',
    plannedQty: Number(firstProduction.plannedQty),
    plannedUnit: firstMaterial?.primary_unit || 'un',
    machineName: firstProduction.machineName,
    peopleCount: Number(firstProduction.peopleCount),
    productionModelName: firstProduction.productionModelName,
    shifts,
    setupHours,
    productions,
    stockOnlyMaterials,
    stockOnlyMaterialChoices: draft.stockOnlyMaterialChoices || [],
    skipProductionMaterials: draft.skipProductionMaterials || [],
    operationOverrides: draft.operationOverrides || {},
    operationSplits: draft.operationSplits || [],
    dailyTeamOverrides: draft.dailyTeamOverrides || {},
    manualWorkDates,
    planningCode: draft.planningCode || null
  };
}

export function buildNormalizedPlanningPayload({
  sourcePayload,
  planningCode,
  draftPlanningStartDate,
  operations,
  getOperationPeriod
}) {
  const planningStartDate = sourcePayload.planningStartDate || sourcePayload.startDate || sourcePayload.selectedDate || draftPlanningStartDate;
  const planningEndDate = getOperationPeriod(operations, planningStartDate, sourcePayload.planningEndDate || sourcePayload.endDate).endDate;
  return {
    ...sourcePayload,
    selectedDate: planningStartDate,
    startDate: planningStartDate,
    endDate: planningEndDate,
    planningStartDate,
    planningEndDate,
    planningCode
  };
}
