import {
  resolveMaterialDailySales,
  resolveMaterialTotalLocalStock
} from './materialStockMetrics.service.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const EPSILON = 1e-9;

export const PLANNING_STOCK_PROJECTION_POLICY = Object.freeze({
  quantityPrecision: 6,
  warningMinimumMultiplier: 1.25,
  criticalCoverageDays: null,
  warningCoverageDays: null,
  productionWithoutTime: '23:59:59',
  consumptionWithoutTime: '00:00:00'
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rounded(value, precision) {
  const result = Number(number(value).toFixed(precision));
  return Object.is(result, -0) ? 0 : result;
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizedText(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort();
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function validDate(value) {
  return DATE_PATTERN.test(text(value).slice(0, 10));
}

function validTime(value) {
  return TIME_PATTERN.test(text(value));
}

function dayRange(start, end) {
  if (!validDate(start) || !validDate(end) || start > end) return [];
  const result = [];
  for (let date = start; date <= end;) {
    result.push(date);
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    date = next.toISOString().slice(0, 10);
  }
  return result;
}

function materialId(value) {
  return text(value?.materialId ?? value?.material_id ?? value?.id);
}

function materialUnit(value) {
  return text(value?.unit ?? value?.primaryUnit ?? value?.primary_unit);
}

function materialMetadata(source = []) {
  const result = new Map();
  for (const item of source) {
    const id = materialId(item);
    if (!id) continue;
    const current = result.get(id) || { materialId: id };
    result.set(id, {
      ...current,
      ...item,
      materialId: id,
      materialCode: text(item.materialCode ?? item.material_code ?? item.code ?? item.codes?.[0] ?? current.materialCode),
      materialName: text(item.materialName ?? item.material_name ?? item.name ?? current.materialName) || `Material ${id}`,
      unit: materialUnit(item) || current.unit || '',
      minimumStock: Number.isFinite(Number(item.minimumStock ?? item.minimum_stock ?? item.minimumQuantity ?? item.minimum_quantity))
        ? Number(item.minimumStock ?? item.minimum_stock ?? item.minimumQuantity ?? item.minimum_quantity)
        : current.minimumStock ?? null
    });
  }
  return result;
}

export function buildPlanningOpeningStock({
  materials = [],
  locations = [],
  stockRows = [],
  correctionRows = []
} = {}) {

  const usesCurrentStock =
    (stockRows || [])
      .some(
        row =>
          row &&
          (
            'currentQty' in row
            ||
            'current_qty' in row
          )
      );

  /*
   * FORMATO NOVO
   */
  if (usesCurrentStock) {
    const totals =
      new Map();

    for (
      const row
      of stockRows || []
    ) {
      const id =
        materialId(row);

      if (!id) {
        continue;
      }

      totals.set(
        id,

        number(
          totals.get(id)
        )
        +
        number(
          row.currentQty ??
          row.current_qty
        )
      );
    }

    return materials.map(
      material => {

        const id =
          materialId(material);

        return {
          materialId:
            id,

          materialCode:
            text(
              material.codes?.[0] ??
              material.materialCode
            ),

          materialName:
            text(
              material.name ??
              material.materialName
            )
            ||
            `Material ${id}`,

          unit:
            materialUnit(material),

          quantity:
            rounded(
              totals.get(id),
              PLANNING_STOCK_PROJECTION_POLICY
                .quantityPrecision
            ),

          hasInitialStock:
            true,

          permitsSales:
            material.permits_sales
            !== false,

          minimumStock:
            Number.isFinite(
              Number(
                material.minimum_quantity ??
                material.minimumQuantity
              )
            )
              ? Number(
                  material.minimum_quantity ??
                  material.minimumQuantity
                )
              : null
        };
      }
    );
  }

  /*
   * FALLBACK ANTIGO
   */
  const correctionsByMaterial =
    new Map();

  correctionRows.forEach(
    row =>
      correctionsByMaterial.set(
        materialId(row),
        [row]
      )
  );

  return materials.map(
    material => {

      const id =
        materialId(material);

      const resolved =
        resolveMaterialTotalLocalStock({
          material,
          locations,
          stockRows,

          correctionRows:
            correctionsByMaterial
              .get(id)
            || []
        });

      return {
        materialId:
          id,

        materialCode:
          text(
            material.codes?.[0] ??
            material.materialCode
          ),

        materialName:
          text(
            material.name ??
            material.materialName
          )
          ||
          `Material ${id}`,

        unit:
          materialUnit(material),

        quantity:
          resolved.totalLocationsQty,

        hasInitialStock:
          true,

        permitsSales:
          material.permits_sales
          !== false,

        minimumStock:
          Number.isFinite(
            Number(
              material.minimum_quantity ??
              material.minimumQuantity
            )
          )
            ? Number(
                material.minimum_quantity ??
                material.minimumQuantity
              )
            : null
      };
    }
  );
}


export function buildPlanningDemandContext({
  materials = [],
  stockRows = [],
  businessDays = 0
} = {}) {

  const usesCurrentStock =
    (stockRows || [])
      .some(
        row =>
          row &&
          (
            'currentQty' in row
            ||
            'current_qty' in row
          )
      );

  /*
   * VENDAS DO ESTOQUE NOVO
   */
  if (usesCurrentStock) {

    const salesByMaterial =
      new Map();

    for (
      const row
      of stockRows || []
    ) {

      const id =
        materialId(row);

      if (!id) {
        continue;
      }

      const salesQty =
        number(
          row.movementTotals
            ?.salesQty
          ??
          row.salesQty
          ??
          row.sales_qty
        );

      salesByMaterial.set(
        id,

        number(
          salesByMaterial.get(id)
        )
        +
        salesQty
      );
    }

    return {
      source:
        'stock.current.salesPerDayQty',

      materials:
        materials.map(
          material => {

            const id =
              materialId(material);

            const permitsSales =
              material.permits_sales
              !== false;

            const averageDailyDemand =
              permitsSales &&
              businessDays > 0
                ? number(
                    salesByMaterial
                      .get(id)
                  )
                  /
                  businessDays
                : null;

            return {
              materialId:
                id,

              permitsSales,

              averageDailyDemand:
                averageDailyDemand > 0
                  ? averageDailyDemand
                  : null
            };
          }
        )
    };
  }

  /*
   * FALLBACK ANTIGO
   */
  return {
    source:
      'stock.materials-overview.salesPerDayQty',

    materials:
      materials.map(
        material => {

          const resolved =
            resolveMaterialDailySales({
              material,
              stockRows,
              businessDays
            });

          return {
            materialId:
              materialId(material),

            permitsSales:
              material.permits_sales
              !== false,

            averageDailyDemand:
              resolved.salesPerDayQty
          };
        }
      )
  };
}

function parentOperationId(value = {}) {
  return text(value.parentOperationId ?? value.calendarParentOperationId ?? value.splitParentOperationId ?? value.operationId)
    .replace(/:day-\d+$/i, '');
}

function treeRoots(tree) {
  if (!tree) return [];
  const children = Array.isArray(tree.children) ? tree.children : [];
  return !materialId(tree) && children.length ? children : [tree];
}

function treeRequirements(tree) {
  const requirements = new Map();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    const consumerMaterialId = materialId(node);
    const productionIndex = number(node.productionIndex, 0);
    const consumerId = text(node.operationId) || `${productionIndex}:${consumerMaterialId}`;
    for (const child of Array.isArray(node.children) ? node.children : []) {
      const inputId = materialId(child);
      const requiredQuantity = number(child.requiredQty ?? child.requiredQuantity);
      if (consumerMaterialId && inputId && requiredQuantity > 0) {
        const key = `${consumerId}\u0000${inputId}`;
        const current = requirements.get(key) || {
          consumerParentOperationId: consumerId,
          consumerMaterialId,
          materialId: inputId,
          requiredQuantity: 0,
          unit: materialUnit(child)
        };
        current.requiredQuantity += requiredQuantity;
        requirements.set(key, current);
      }
      visit(child);
    }
  };
  treeRoots(tree).forEach(visit);
  return requirements;
}

function operationRequirements(operations = []) {
  const result = new Map();
  for (const operation of operations) {
    const consumerParentOperationId = parentOperationId(operation);
    for (const requirement of Array.isArray(operation?.dependencyRequirements) ? operation.dependencyRequirements : []) {
      const inputId = materialId(requirement);
      const requiredQuantity = number(requirement.requiredQuantity ?? requirement.requiredQty ?? requirement.quantity);
      if (!consumerParentOperationId || !inputId || !(requiredQuantity > 0)) continue;
      const key = `${consumerParentOperationId}\u0000${inputId}`;
      result.set(key, {
        consumerParentOperationId,
        consumerMaterialId: materialId(operation),
        materialId: inputId,
        requiredQuantity,
        unit: materialUnit(requirement)
      });
    }
  }
  return result;
}

function operationRequirementAliases(
  operations = []
) {
  const aliases =
    new Map();

  for (
    const operation
    of operations
  ) {
    const canonicalId =
      parentOperationId(
        operation
      );

    if (!canonicalId) {
      continue;
    }

    [
      operation?.operationId,
      operation?.parentOperationId,
      operation?.calendarParentOperationId,
      operation?.splitParentOperationId,

      ...(
        Array.isArray(
          operation?.groupedOperationIds
        )
          ? operation.groupedOperationIds
          : []
      ),

      ...(
        Array.isArray(
          operation?.productionBreakdown
        )

          ? operation
              .productionBreakdown
              .map(
                item =>
                  item?.operationId
              )

          : []
      )
    ]
      .forEach(
        value => {
          const alias =
            parentOperationId({
              operationId:
                value
            });

          if (alias) {
            aliases.set(
              alias,
              canonicalId
            );
          }
        }
      );
  }

  return aliases;
}


function remapTreeRequirements(
  requirements,
  operations
) {
  const aliases =
    operationRequirementAliases(
      operations
    );

  const remapped =
    new Map();

  for (
    const requirement
    of requirements.values()
  ) {
    const consumerParentOperationId =
      aliases.get(
        requirement
          .consumerParentOperationId
      )
      ||
      requirement
        .consumerParentOperationId;

    const key =
      `${consumerParentOperationId}\u0000${requirement.materialId}`;

    const current =
      remapped.get(key)
      || {
        ...requirement,

        consumerParentOperationId,

        requiredQuantity:
          0
      };

    current.requiredQuantity +=
      number(
        requirement.requiredQuantity
      );

    remapped.set(
      key,
      current
    );
  }

  return remapped;
}


function mergeRequirements(
  scheduleTree,
  operations
) {
  const fromTree =
    remapTreeRequirements(
      treeRequirements(
        scheduleTree
      ),
      operations
    );

  const fromOperations =
    operationRequirements(
      operations
    );

  /*
   * A árvore inclui também materiais atendidos
   * somente por estoque.
   *
   * As operações sobrescrevem arestas equivalentes
   * com a quantidade normalizada pelo scheduler.
   */
  for (
    const [
      key,
      requirement
    ]
    of fromOperations
  ) {
    fromTree.set(
      key,
      requirement
    );
  }

  return [
    ...fromTree.values()
  ];
}

function normalizeAllocations(allocations = []) {
  const byId = new Map();
  allocations.forEach((allocation, index) => {
    const id = text(allocation?.allocationId ?? allocation?.id) || `legacy-allocation-${index + 1}`;
    if (byId.has(id)) return;
    const quantity = number(allocation?.quantity ?? allocation?.produceQty);
    const parentId = parentOperationId(allocation);
    const rawComponents = Array.isArray(allocation?.components) && allocation.components.length
      ? allocation.components
      : [{ parentOperationId: parentId, materialId: materialId(allocation), quantity }];
    byId.set(id, {
      ...allocation,
      allocationId: id,
      parentOperationId: parentId,
      materialId: materialId(allocation),
      date: text(allocation?.date ?? allocation?.startDate).slice(0, 10),
      startTime: text(allocation?.startTime),
      endTime: text(allocation?.endTime),
      quantity,
      unit: materialUnit(allocation),
      components: rawComponents.map(component => ({
        ...component,
        parentOperationId: parentOperationId(component) || parentId,
        materialId: materialId(component) || materialId(allocation),
        quantity: number(component?.quantity ?? component?.produceQty),
        unit: materialUnit(component) || materialUnit(allocation)
      })).filter(component => component.quantity > 0)
    });
  });
  return [...byId.values()].filter(allocation => validDate(allocation.date) && allocation.quantity > 0);
}

function makeMovement({ type, allocation, materialId: id, quantity, time, unit, relatedOperationIds = [] }, precision) {
  const signedQuantity = ['PRODUCTION_CONSUMPTION', 'DEMAND_OUT', 'OTHER_OUT'].includes(type) ? -Math.abs(quantity) : Math.abs(quantity);
  return {
    movementId: `planning-stock-movement:${stableHash(JSON.stringify([type, allocation?.allocationId, id, allocation?.date, time, signedQuantity, relatedOperationIds]))}`,
    type,
    date: allocation?.date,
    time,
    materialId: id,
    unit: unit || '',
    quantity: rounded(signedQuantity, precision),
    relatedAllocationIds: allocation && allocation.synthetic !== true ? [allocation.allocationId] : [],
    relatedOperationIds: unique(relatedOperationIds)
  };
}

function alertFor(code, severity, material, movement, values = {}) {
  const signature = JSON.stringify([code, movement?.date || values.date, movement?.time || values.time, material.materialId, movement?.movementId || '']);
  return {
    alertId: `planning-stock-alert:${stableHash(signature)}`,
    code,
    severity,
    date: movement?.date || values.date || null,
    time: movement?.time || values.time || null,
    materialId: material.materialId,
    materialName: material.materialName,
    message: values.message || code,
    openingStock: values.openingStock ?? null,
    movementQuantity: movement?.quantity ?? null,
    closingStock: values.closingStock ?? null,
    relatedOperationIds: movement?.relatedOperationIds || [],
    relatedAllocationIds: movement?.relatedAllocationIds || []
  };
}

function materialStatus({ closingStock, minimumStock, averageDailyDemand, coverageDays, policies }) {
  if (closingStock < -EPSILON) return 'NEGATIVE';
  if (Number.isFinite(minimumStock) && closingStock <= minimumStock + EPSILON) return 'CRITICAL';
  if (Number.isFinite(policies.criticalCoverageDays) && Number.isFinite(coverageDays) && coverageDays <= policies.criticalCoverageDays) return 'CRITICAL';
  if (Number.isFinite(minimumStock) && closingStock <= minimumStock * policies.warningMinimumMultiplier + EPSILON) return 'WARNING';
  if (Number.isFinite(policies.warningCoverageDays) && Number.isFinite(coverageDays) && coverageDays <= policies.warningCoverageDays) return 'WARNING';
  if (!(averageDailyDemand > 0)) return 'NO_DEMAND';
  return 'OK';
}

export function projectPlanningStockByDay({
  stockContext = {}, scheduleTree = null, operations = [], allocations = [], calendarDays = [],
  productions = [], demandContext = {}, policies: policyOverrides = {}
} = {}) {
  const policies = { ...PLANNING_STOCK_PROJECTION_POLICY, ...(policyOverrides || {}) };
  const precision = Number.isInteger(Number(policies.quantityPrecision)) ? Number(policies.quantityPrecision) : 6;
  const acceptedAllocations = normalizeAllocations(allocations);
  const stock = Array.isArray(stockContext) ? stockContext : (stockContext.stock || stockContext.materials || []);
  const metadata = materialMetadata([
    ...acceptedAllocations,
    ...operations,
    ...productions,
    ...(Array.isArray(demandContext.materials) ? demandContext.materials : []),
    ...(Array.isArray(stockContext.materials) ? stockContext.materials : []),
    ...stock
  ]);
  const openingByMaterial = new Map();
  const hasInitialByMaterial = new Map();
  for (const item of stock) {
    const id = materialId(item);
    if (!id) continue;
    openingByMaterial.set(id, number(openingByMaterial.get(id)) + number(item.quantity ?? item.openingStock));
    hasInitialByMaterial.set(id, item.hasInitialStock !== false);
  }
  const demandByMaterial = new Map((Array.isArray(demandContext.materials) ? demandContext.materials : [])
    .map(item => [materialId(item), {
      averageDailyDemand: Number.isFinite(Number(item.averageDailyDemand ?? item.salesPerDay)) ? Number(item.averageDailyDemand ?? item.salesPerDay) : null,
      permitsSales: item.permitsSales !== false && item.permits_sales !== false
    }]));
  const requirements = mergeRequirements(scheduleTree, operations);
  const requirementsByConsumer = new Map();
  for (const requirement of requirements) {
    if (!requirementsByConsumer.has(requirement.consumerParentOperationId)) requirementsByConsumer.set(requirement.consumerParentOperationId, []);
    requirementsByConsumer.get(requirement.consumerParentOperationId).push(requirement);
    if (!metadata.has(requirement.materialId)) metadata.set(requirement.materialId, { materialId: requirement.materialId, materialName: `Material ${requirement.materialId}`, materialCode: '', unit: requirement.unit || '', minimumStock: null });
  }

  const totalComponentByParent = new Map();
  acceptedAllocations.forEach(allocation => allocation.components.forEach(component => {
    totalComponentByParent.set(component.parentOperationId, number(totalComponentByParent.get(component.parentOperationId)) + component.quantity);
  }));

  const movements = [];
  for (const allocation of acceptedAllocations) {
    const productionTime = validTime(allocation.endTime) ? allocation.endTime : policies.productionWithoutTime;
    movements.push(makeMovement({
      type: 'PRODUCTION_IN', allocation, materialId: allocation.materialId, quantity: allocation.quantity,
      time: productionTime, unit: allocation.unit, relatedOperationIds: allocation.components.map(item => item.parentOperationId)
    }, precision));
    for (const component of allocation.components) {
      const parentTotal = number(totalComponentByParent.get(component.parentOperationId));
      if (!(parentTotal > 0)) continue;
      for (const requirement of requirementsByConsumer.get(component.parentOperationId) || []) {
        const consumptionQuantity = requirement.requiredQuantity * (component.quantity / parentTotal);
        movements.push(makeMovement({
          type: 'PRODUCTION_CONSUMPTION', allocation, materialId: requirement.materialId, quantity: consumptionQuantity,
          time: validTime(allocation.startTime) ? allocation.startTime : policies.consumptionWithoutTime,
          unit: requirement.unit, relatedOperationIds: [component.parentOperationId]
        }, precision));
      }
    }
  }

  const externalMovements = [
    ...(Array.isArray(stockContext.movements) ? stockContext.movements : []),
    ...(Array.isArray(demandContext.movements) ? demandContext.movements : [])
  ];
  externalMovements.forEach((item, index) => {
    const date = text(item.date).slice(0, 10);
    const id = materialId(item);
    if (!validDate(date) || !id || !Number.isFinite(Number(item.quantity))) return;
    const direction = text(item.direction).toLowerCase();
    const rawType = text(item.type).toUpperCase();
    const type = rawType || (direction === 'in' ? 'EXTERNAL_IN' : 'OTHER_OUT');
    movements.push(makeMovement({
      type, allocation: { allocationId: text(item.movementId) || `external-${index + 1}`, date }, materialId: id,
      quantity: number(item.quantity), time: validTime(item.time) ? item.time : (direction === 'in' ? policies.productionWithoutTime : policies.consumptionWithoutTime),
      unit: materialUnit(item), relatedOperationIds: item.relatedOperationIds || []
    }, precision));
  });

  const explicitDates = calendarDays.map(day => text(day?.date ?? day).slice(0, 10)).filter(validDate);
  const movementDates = movements.map(item => item.date).filter(validDate);
  const allDates = [...explicitDates, ...movementDates].sort();
  const dates = allDates.length ? dayRange(allDates[0], allDates.at(-1)) : [];
  for (const date of dates) {
    for (const [id, demand] of demandByMaterial) {
      if (!demand.permitsSales || !(demand.averageDailyDemand > 0)) continue;
      movements.push(makeMovement({
        type: 'DEMAND_OUT',
        allocation: { allocationId: `daily-sales:${id}:${date}`, date, synthetic: true },
        materialId: id,
        quantity: demand.averageDailyDemand,
        time: policies.consumptionWithoutTime,
        unit: metadata.get(id)?.unit || '',
        relatedOperationIds: []
      }, precision));
    }
  }
  const movementsByDayMaterial = new Map();
  for (const movement of movements) {
    const key = `${movement.date}\u0000${movement.materialId}`;
    if (!movementsByDayMaterial.has(key)) movementsByDayMaterial.set(key, []);
    movementsByDayMaterial.get(key).push(movement);
  }
  movementsByDayMaterial.forEach(items => items.sort((left, right) => left.time.localeCompare(right.time) || left.movementId.localeCompare(right.movementId)));

  const alerts = [];
  const diagnostics = [];
  const balances = new Map([...metadata.keys()].map(id => [id, number(openingByMaterial.get(id))]));
  for (const material of metadata.values()) {
    if (!hasInitialByMaterial.get(material.materialId)) {
      const alert = alertFor('MISSING_INITIAL_STOCK', 'warning', material, null, { date: dates[0] || null, message: `Material ${material.materialName} sem saldo inicial confiável; projeção iniciada em zero.` });
      alerts.push(alert);
      diagnostics.push({ diagnosticId: alert.alertId, ...alert });
    }
    if (number(openingByMaterial.get(material.materialId)) < 0) {
      alerts.push(alertFor('NEGATIVE_INITIAL_STOCK', 'error', material, null, {
        date: dates[0] || null, openingStock: openingByMaterial.get(material.materialId), closingStock: openingByMaterial.get(material.materialId),
        message: `Estoque inicial negativo de ${material.materialName}.`
      }));
    }
  }

  const ruptured = new Set();
  const minimumAlerted = new Set();
  const days = dates.map(date => {
    const dayMaterials = [...metadata.values()].map(material => {
      const id = material.materialId;
      const openingStock = number(balances.get(id));
      const dayMovements = movementsByDayMaterial.get(`${date}\u0000${id}`) || [];
      let balance = openingStock;
      for (const movement of dayMovements) {
        const movementUnit = normalizedText(movement.unit);
        const expectedUnit = normalizedText(material.unit);
        if (movementUnit && expectedUnit && movementUnit !== expectedUnit) {
          const alert = alertFor('INCOMPATIBLE_UNIT', 'error', material, movement, { openingStock, closingStock: balance, message: `Unidade ${movement.unit} incompatível com ${material.unit} para ${material.materialName}.` });
          alerts.push(alert);
          diagnostics.push({ diagnosticId: alert.alertId, ...alert });
          continue;
        }
        balance += movement.quantity;
        movement.balanceAfter = rounded(balance, precision);
        if (balance < -EPSILON && !ruptured.has(id)) {
          ruptured.add(id);
          alerts.push(alertFor('PROJECTED_STOCK_NEGATIVE', 'error', material, movement, { openingStock, closingStock: balance, message: `Primeira ruptura projetada de ${material.materialName}.` }));
        }
      }
      const closingStock = rounded(balance, precision);
      balances.set(id, closingStock);
      const averageDailyDemand = demandByMaterial.get(id)?.averageDailyDemand ?? null;
      const coverageDays = averageDailyDemand > 0 ? rounded(Math.max(closingStock, 0) / averageDailyDemand, precision) : null;
      const minimumStock = material.minimumStock !== null && material.minimumStock !== undefined && Number.isFinite(Number(material.minimumStock))
        ? Number(material.minimumStock)
        : null;
      const status = materialStatus({ closingStock, minimumStock, averageDailyDemand, coverageDays, policies });
      if (Number.isFinite(minimumStock) && closingStock <= minimumStock + EPSILON && closingStock >= -EPSILON && !minimumAlerted.has(id)) {
        minimumAlerted.add(id);
        alerts.push(alertFor('MINIMUM_STOCK_REACHED', 'warning', material, dayMovements.at(-1), { date, openingStock, closingStock, message: `${material.materialName} atingiu o estoque mínimo.` }));
      }
      return {
        materialId: id, materialCode: material.materialCode || '', materialName: material.materialName, unit: material.unit || '',
        openingStock: rounded(openingStock, precision),
        productionIn: rounded(dayMovements.filter(item => item.type === 'PRODUCTION_IN').reduce((sum, item) => sum + item.quantity, 0), precision),
        externalIn: rounded(dayMovements.filter(item => ['EXTERNAL_IN', 'TRANSPORT_ARRIVAL'].includes(item.type)).reduce((sum, item) => sum + item.quantity, 0), precision),
        productionConsumption: rounded(Math.abs(dayMovements.filter(item => item.type === 'PRODUCTION_CONSUMPTION').reduce((sum, item) => sum + item.quantity, 0)), precision),
        demandOut: rounded(Math.abs(dayMovements.filter(item => item.type === 'DEMAND_OUT').reduce((sum, item) => sum + item.quantity, 0)), precision),
        otherOut: rounded(Math.abs(dayMovements.filter(item => ['OTHER_OUT', 'TRANSPORT_DISPATCH'].includes(item.type)).reduce((sum, item) => sum + item.quantity, 0)), precision),
        closingStock, averageDailyDemand, coverageDays, minimumStock, status,
        alerts: alerts.filter(alert => alert.date === date && alert.materialId === id),
        movements: dayMovements
      };
    });
    return {
      date,
      materials: dayMaterials,
      summary: {
        criticalCount: dayMaterials.filter(item => item.status === 'CRITICAL').length,
        warningCount: dayMaterials.filter(item => item.status === 'WARNING').length,
        negativeCount: dayMaterials.filter(item => item.status === 'NEGATIVE').length
      }
    };
  });

  return {
    days,
    materials: [...metadata.values()].map(material => ({
      materialId: material.materialId, materialCode: material.materialCode || '', materialName: material.materialName,
      unit: material.unit || '', minimumStock: material.minimumStock ?? null, averageDailyDemand: demandByMaterial.get(material.materialId)?.averageDailyDemand ?? null
    })).sort((left, right) => left.materialName.localeCompare(right.materialName)),
    alerts: alerts.sort((left, right) => `${left.date || ''}T${left.time || ''}`.localeCompare(`${right.date || ''}T${right.time || ''}`)),
    diagnostics,
    generatedFrom: {
      scheduleSource: allocations.length ? 'manualScheduleDraft.allocations' : 'legacy allocations',
      allocationCount: acceptedAllocations.length,
      stockSource: stockContext.source || 'provided stock context',
      demandSource: demandContext.source || null,
      temporalPolicy: {
        production: 'allocation endTime; end of day when time is unavailable',
        consumption: 'allocation startTime; start of day when time is unavailable'
      }
    }
  };
}
