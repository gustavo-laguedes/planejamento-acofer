export function Modal({ title, content, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button class="icon-button modal-close" title="Fechar" aria-label="Fechar">×</button>
      <h2>${title}</h2>
      <div class="modal-content"></div>
    </div>
  `;
  overlay.querySelector('.modal-content').appendChild(content);
  overlay.querySelector('.modal-close').addEventListener('click', () => {
    overlay.remove();
    onClose?.();
  });
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      overlay.remove();
      onClose?.();
    }
  });
  return overlay;
}
