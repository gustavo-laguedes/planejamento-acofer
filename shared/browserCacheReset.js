const PLANNING_DRAFT_KEY = 'planejamento_acofer_planning_draft_v2';

export async function resetPlanningBrowserCache() {
  const clearDraft = confirm('Limpar tambem o rascunho local do planejamento? Isso remove alteracoes manuais salvas neste navegador.');
  try {
    if (clearDraft) localStorage.removeItem(PLANNING_DRAFT_KEY);
    sessionStorage.clear();
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set('_refresh', String(Date.now()));
    window.location.replace(url.toString());
  }
}
