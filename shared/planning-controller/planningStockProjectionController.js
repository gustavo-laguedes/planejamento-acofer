import { projectPlanningStockByDay } from '../../services/planningStockProjection.service.js';

export function getPlanningStockProjectionDay(projection, selectedDate) {
  const date = String(selectedDate || '').slice(0, 10);
  const day = (projection?.days || []).find(item => String(item?.date) === date) || null;
  return day ? {
    ...day,
    alerts: (projection?.alerts || []).filter(alert => String(alert?.date) === date)
  } : null;
}

function planningStockPcpStatus(item, { minimumDays = null, idealDays = null } = {}) {
  const closingStock = Number(item?.closingStock);
  const coverageDays = Number(item?.coverageDays);
  if (closingStock < 0 || item?.status === 'NEGATIVE' || item?.status === 'CRITICAL' || (minimumDays && Number.isFinite(coverageDays) && coverageDays <= minimumDays * 0.5)) {
    return { key: 'critical', label: 'Crítico', className: 'critical' };
  }
  if (minimumDays && Number.isFinite(coverageDays) && coverageDays <= minimumDays * 1.2) {
    return { key: 'production-alert', label: 'Alerta de produção', className: 'production-alert' };
  }
  if (Number.isFinite(coverageDays) && Number.isFinite(Number(idealDays)) && coverageDays < Number(idealDays)) {
    return { key: 'below-target', label: 'Abaixo da meta', className: 'below-target' };
  }
  return { key: 'ok', label: 'OK', className: 'planned' };
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
      materialCount: salesMaterials.length,
      negativeCount: salesMaterials.filter(item => item.status === 'NEGATIVE').length,
      criticalCount: salesMaterials.filter(item => item.pcpStatus?.key === 'critical').length,
      warningCount: salesMaterials.filter(item => item.status === 'WARNING').length,
      productionAlertCount: salesMaterials.filter(item => item.pcpStatus?.key === 'production-alert').length,
      belowTargetCount: salesMaterials.filter(item => item.pcpStatus?.key === 'below-target').length
    }
  };
}

export function buildPlanningStockCalendarAlert(projection, selectedDate, materialCatalog = [], options = {}) {
  const day = buildPlanningStockModalModel(projection, selectedDate, materialCatalog, options);
  if (!day) return null;
  const groups = (day.salesMaterials || []).reduce((counts, item) => {
    if (item.pcpStatus?.key === 'critical') {
      counts.critical += 1;
    } else if (item.pcpStatus?.key === 'production-alert') {
      counts.productionAlert += 1;
    } else if (item.pcpStatus?.key === 'below-target') {
      counts.belowTarget += 1;
    }
    return counts;
  }, { critical: 0, productionAlert: 0, belowTarget: 0 });
  const items = [
    { key: 'critical', label: 'Crítico', count: groups.critical },
    { key: 'production-alert', label: 'Alerta de produção', count: groups.productionAlert },
    { key: 'below-target', label: 'Abaixo da meta', count: groups.belowTarget }
  ].filter(item => item.count > 0);
  const count = items.reduce((sum, item) => sum + item.count, 0);
  return count > 0 ? {
    count,
    criticalCount: groups.critical,
    productionAlertCount: groups.productionAlert,
    belowTargetCount: groups.belowTarget,
    items
  } : null;
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
