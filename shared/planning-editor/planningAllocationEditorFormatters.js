export function formatPlanningAllocationQuantity(quantity, unit = '') {
  const value = Number(quantity);
  const suffix = unit ? ` ${unit}` : '';
  if (!Number.isFinite(value)) return `--${suffix}`;
  const integerUnit = String(unit || '').trim().toLowerCase() === 'un';
  const displayValue = integerUnit ? Math.round(value) : value;

  const formatted = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: integerUnit ? 0 : 3
  }).format(displayValue);

  return `${formatted}${suffix}`;
}

export function formatPlanningAllocationPercent(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value)) return '--';

  return `${new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2
  }).format(value)}%`;
}

export function formatPlanningAllocationDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return '--';

  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  if (hours <= 0) return `${remainingMinutes}min`;
  if (remainingMinutes <= 0) return `${hours}h`;
  return `${hours}h${remainingMinutes}min`;
}
