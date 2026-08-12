function ensureProductionCalendarCss() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-production-calendar-css="true"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./production-calendar.css', import.meta.url).href;
  link.dataset.productionCalendarCss = 'true';
  document.head.appendChild(link);
}

ensureProductionCalendarCss();

export {
  getProductionDisplayColor,
  getProductionDisplayFallbackColor,
  getProductionDisplayTheme,
  mixProductionDisplayColor,
  PRODUCTION_DISPLAY_PALETTE
} from '../planning-presentation/productionDisplayColor.js';
export { ProductionCalendarEditor } from './ProductionCalendarEditor.js';
export { ProductionCalendarSplitEditor, resolveProductionCalendarSplitPreview } from './ProductionCalendarSplitEditor.js';
export {
  buildProductionCalendarDayPresentation,
  buildProductionCalendarDayProductivity,
  addProductionCalendarDays,
  createProductionCalendarGridRows,
  extendProductionCalendarDayRange,
  fillProductionCalendarDayRange,
  formatProductionCalendarCompactNumber,
  formatProductionCalendarDate,
  formatProductionCalendarDuration,
  formatProductionCalendarPercent,
  formatProductionCalendarQuantity,
  getProductionCalendarWeekday,
  getProductionCalendarProductionLimitDate,
  groupAllocationsByMachineAndDate,
  isProductionCalendarNonWorkingDay,
  normalizeProductionCalendarDay
} from './productionCalendar.utils.js';
export {
  adaptPlanningResultToProductionCalendar
} from './productionCalendar.adapter.js';
