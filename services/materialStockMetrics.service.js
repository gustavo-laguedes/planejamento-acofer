function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function materialCodes(material = {}) {
  return new Set((Array.isArray(material.codes) ? material.codes : [])
    .map(normalizeText)
    .filter(Boolean));
}

export function matchesMaterialStockRow(material, row) {
  const codes = materialCodes(material);
  return codes.has(normalizeText(row?.product_code)) || codes.has(normalizeText(row?.old_product_code));
}

export function resolveMaterialTotalLocalStock({ material = {}, locations = [], stockRows = [], correctionRows = [] } = {}) {
  const locationNames = new Set((Array.isArray(locations) ? locations : [])
    .flatMap(location => [location?.code, location?.name])
    .map(normalizeText)
    .filter(Boolean));
  const locationStock = (Array.isArray(stockRows) ? stockRows : []).reduce((sum, row) => {
    if (!matchesMaterialStockRow(material, row) || !locationNames.has(normalizeText(row?.establishment))) return sum;
    return sum + toNumber(row?.fiscal_balance_unit) + toNumber(row?.error_balance_unit);
  }, 0);
  const correctionQty = toNumber((Array.isArray(correctionRows) ? correctionRows : [])[0]?.correction_qty);
  return { totalLocationsQty: locationStock + correctionQty, correctionQty };
}

export function resolveMaterialDailySales({ material = {}, stockRows = [], businessDays = 0 } = {}) {
  const salesPeriodQty = (Array.isArray(stockRows) ? stockRows : []).reduce((sum, row) => (
    matchesMaterialStockRow(material, row) ? sum + toNumber(row?.sales_unit) : sum
  ), 0);
  if (material.permits_sales === false) {
    return { salesPeriodQty, salesPerDayQty: null, blocked: true, notEstimated: false };
  }
  const days = Number(businessDays || 0);
  if (!(days > 0)) return { salesPeriodQty, salesPerDayQty: null, blocked: false, notEstimated: true };
  const salesPerDayQty = Math.max(salesPeriodQty / days, 0);
  return { salesPeriodQty, salesPerDayQty, blocked: false, notEstimated: salesPerDayQty <= 0 };
}

export function resolveMaterialStockMetrics(input = {}) {
  const stock = resolveMaterialTotalLocalStock(input);
  const sales = resolveMaterialDailySales(input);
  return {
    ...stock,
    ...sales,
    stockDurationDays: sales.salesPerDayQty > 0 ? stock.totalLocationsQty / sales.salesPerDayQty : null
  };
}
