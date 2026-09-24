import { projectPlanningStockByDay } from '../../services/planningStockProjection.service.js';

const PLANNING_STOCK_CRITICAL_DAYS =
  15;

const PLANNING_STOCK_ATTENTION_DAYS =
  20;

export function getPlanningStockProjectionDay(projection, selectedDate) {
  const date = String(selectedDate || '').slice(0, 10);
  const day = (projection?.days || []).find(item => String(item?.date) === date) || null;
  return day ? {
    ...day,
    alerts: (projection?.alerts || []).filter(alert => String(alert?.date) === date)
  } : null;
}

function planningStockPcpStatus(
  item,
  {
    idealDays = null
  } = {}
) {
  const closingStock =
    Number(
      item?.closingStock
    );

  const coverageDays =
    Number(
      item?.coverageDays
    );

  if (
    closingStock <= 0
    ||
    item?.status === 'NEGATIVE'
    ||
    (
      Number.isFinite(
        coverageDays
      )
      &&
      coverageDays <= 0
    )
  ) {
    return {
      key: 'zeroed',
      label: 'Zerado',
      className: 'zeroed'
    };
  }

  if (
    Number.isFinite(
      coverageDays
    )
    &&
    coverageDays
      <= PLANNING_STOCK_CRITICAL_DAYS
  ) {
    return {
      key: 'critical',
      label: 'Crítico',
      className: 'critical'
    };
  }

  if (
    Number.isFinite(
      coverageDays
    )
    &&
    coverageDays
      <= PLANNING_STOCK_ATTENTION_DAYS
  ) {
    return {
      key: 'attention',
      label: 'Atenção',
      className: 'attention'
    };
  }

  if (
    Number.isFinite(
      coverageDays
    )
    &&
    Number.isFinite(
      Number(idealDays)
    )
    &&
    coverageDays
      < Number(idealDays)
  ) {
    return {
      key: 'below-target',
      label: 'Abaixo da meta',
      className: 'below-target'
    };
  }

  if (
    !Number.isFinite(
      coverageDays
    )
  ) {
    return {
      key: 'unknown',
      label: 'Sem estimativa',
      className: 'unknown'
    };
  }

  return {
    key: 'ok',
    label: 'OK',
    className: 'ok'
  };
}

export function buildPlanningStockModalModel(projection, selectedDate, materialCatalog = [], {
  minimumDays = null,
  idealDays = null
} = {}) {
  const day = getPlanningStockProjectionDay(projection, selectedDate);
  if (!day) return null;
  const catalogById = new Map((Array.isArray(materialCatalog) ? materialCatalog : [])
    .map(material => [String(material?.id ?? material?.materialId ?? ''), material]));
  const permitsSales = item => {
    const material = catalogById.get(String(item?.materialId ?? '')) || {};
    const value = material.permits_sales ?? material.permitsSales;
    // Contrato legado do cadastro: somente false bloqueia venda; ausente/nulo mantém o default comercial.
    return value !== false;
  };
  const firstDayByMaterial = new Map((projection?.days?.[0]?.materials || [])
    .map(item => [String(item.materialId), item]));
  const cumulativeConsumption = new Map();
  (projection?.days || []).filter(item => String(item.date) <= String(day.date)).forEach(item => {
    item.materials.forEach(material => {
      const id = String(material.materialId);
      cumulativeConsumption.set(id, Number(cumulativeConsumption.get(id) || 0) + Number(material.productionConsumption || 0));
    });
  });
  const withPresentationValues = item => ({
    ...item,
    currentStock: firstDayByMaterial.get(String(item.materialId))?.openingStock ?? item.openingStock,
    cumulativeProductionConsumption: cumulativeConsumption.get(String(item.materialId)) || 0
  });
  const salesMaterials = day.materials.filter(permitsSales).map(item => {
    const presented = withPresentationValues(item);
    return {
      ...presented,
      pcpStatus: planningStockPcpStatus(presented, { minimumDays, idealDays })
    };
  });
  const productionMaterials = day.materials.filter(item => !permitsSales(item)).map(withPresentationValues);
  const salesIds = new Set(salesMaterials.map(item => String(item.materialId)));
  return {
    ...day,
    salesMaterials,
    productionMaterials,
    salesAlerts: day.alerts.filter(alert => salesIds.has(String(alert.materialId))),
    salesSummary: {
  materialCount:
    salesMaterials.length,

  negativeCount:
    salesMaterials
      .filter(
        item =>
          item.status === 'NEGATIVE'
      )
      .length,

  zeroedCount:
    salesMaterials
      .filter(
        item =>
          item.pcpStatus?.key
          === 'zeroed'
      )
      .length,

  criticalCount:
    salesMaterials
      .filter(
        item =>
          item.pcpStatus?.key
          === 'critical'
      )
      .length,

  attentionCount:
    salesMaterials
      .filter(
        item =>
          item.pcpStatus?.key
          === 'attention'
      )
      .length,

  warningCount:
    salesMaterials
      .filter(
        item =>
          item.status === 'WARNING'
      )
      .length,

  productionAlertCount:
    0,

  belowTargetCount:
    salesMaterials
      .filter(
        item =>
          item.pcpStatus?.key
          === 'below-target'
      )
      .length,

  okCount:
    salesMaterials
      .filter(
        item =>
          item.pcpStatus?.key
          === 'ok'
      )
      .length
}
  };
}

export function buildPlanningStockCalendarAlert(
  projection,
  selectedDate,
  materialCatalog = [],
  options = {}
) {
  const day =
    buildPlanningStockModalModel(
      projection,
      selectedDate,
      materialCatalog,
      options
    );

  if (!day) {
    return null;
  }

  const catalogById =
    new Map(
      (
        Array.isArray(
          materialCatalog
        )
          ? materialCatalog
          : []
      ).map(
        material => [
          String(
            material?.id
            ?? material?.materialId
            ?? ''
          ),
          material
        ]
      )
    );

  const groups =
    (
      day.salesMaterials || []
    ).reduce(
      (
        result,
        item
      ) => {
        const status =
          item.pcpStatus?.key;

        const target =
          status === 'zeroed'
            ? result.zeroed
            : status === 'critical'
              ? result.critical
              : status === 'attention'
                ? result.attention
                : status === 'below-target'
                  ? result.belowTarget
                  : null;

        if (!target) {
          return result;
        }

        target.count += 1;

        const catalogMaterial =
          catalogById.get(
            String(
              item?.materialId
              ?? ''
            )
          ) || {};

        const materialName =
          String(
            item?.materialName
            ?? item?.name
            ?? catalogMaterial?.name
            ?? catalogMaterial?.material_name
            ?? item?.materialId
            ?? ''
          ).trim();

        if (
          materialName
          &&
          !target.materials.includes(
            materialName
          )
        ) {
          target.materials.push(
            materialName
          );
        }

        return result;
      },
      {
        zeroed: {
          count: 0,
          materials: []
        },

        critical: {
          count: 0,
          materials: []
        },

        attention: {
          count: 0,
          materials: []
        },

        belowTarget: {
          count: 0,
          materials: []
        }
      }
    );

  const items = [
    {
      key: 'zeroed',
      label: 'Zerado',
      count:
        groups.zeroed.count,
      materials:
        groups.zeroed.materials
    },

    {
      key: 'critical',
      label: 'Crítico',
      count:
        groups.critical.count,
      materials:
        groups.critical.materials
    },

    {
      key: 'attention',
      label: 'Atenção',
      count:
        groups.attention.count,
      materials:
        groups.attention.materials
    },

    {
      key: 'below-target',
      label: 'Abaixo da meta',
      count:
        groups.belowTarget.count,
      materials:
        groups.belowTarget.materials
    }
  ].filter(
    item =>
      item.count > 0
  );

  const count =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum + item.count,
      0
    );

  return count > 0
    ? {
        count,

        zeroedCount:
          groups.zeroed.count,

        criticalCount:
          groups.critical.count,

        attentionCount:
          groups.attention.count,

        productionAlertCount:
          0,

        belowTargetCount:
          groups.belowTarget.count,

        items
      }
    : null;
}

export function buildPlanningStockProjection({
  currentSimulation = null,
  snapshot = {},
  validationStock = [],
  materials = [],
  manualScheduleDraft = null,
  warningCoverageDays = null
} = {}) {
  if (!currentSimulation) return null;
  return projectPlanningStockByDay({
    stockContext: currentSimulation.stockContext || { stock: validationStock || [], materials },
    scheduleTree: currentSimulation.tree || currentSimulation.scheduleTree || currentSimulation.schedule_tree,
    operations: currentSimulation.operations || [],
    allocations: manualScheduleDraft?.allocations?.length ? manualScheduleDraft.allocations : snapshot.allocations,
    calendarDays: snapshot.days,
    productions: currentSimulation.summary?.productions || [],
    demandContext: currentSimulation.demandContext || {},
    policies: { warningCoverageDays }
  });
}
