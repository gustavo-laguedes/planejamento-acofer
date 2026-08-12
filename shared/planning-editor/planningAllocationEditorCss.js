export function ensurePlanningAllocationEditorCss() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-production-calendar-css="true"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../production-calendar/production-calendar.css', import.meta.url).href;
  link.dataset.productionCalendarCss = 'true';
  document.head.appendChild(link);
}
