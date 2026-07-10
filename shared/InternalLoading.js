export function internalLoadingHtml(text = 'Carregando dados...') {
  return `
    <div class="internal-loading" role="status" aria-live="polite">
      <div class="simple-loading-bar" aria-hidden="true">
        <span></span>
      </div>
      <p>${text}</p>
    </div>
  `;
}

export function setInternalLoading(target, text = 'Carregando dados...') {
  if (!target) return;
  target.innerHTML = internalLoadingHtml(text);
}

export function setInternalError(target, message = 'Nao foi possivel carregar os dados. Tente novamente em instantes.') {
  if (!target) return;
  target.innerHTML = `<div class="empty-state error-state">${message}</div>`;
}

export function createOperationOverlay(text = 'Organizando produção...') {
  const overlay = document.createElement('div');
  overlay.className = 'operation-loading-overlay';
  overlay.innerHTML = internalLoadingHtml(text);
  return overlay;
}
