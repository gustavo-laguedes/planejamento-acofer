export function ensurePlanningAllocationEditorCss() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-planning-allocation-editor-css="true"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./planning-allocation-editor.css', import.meta.url).href;
  link.dataset.planningAllocationEditorCss = 'true';
  document.head.appendChild(link);
}
