import { clearToken } from './api.js';

export function Topbar() {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div class="brand">
      <img src="/assets/logo-acofer.png" alt="Aço-Fer" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'" />
      <span class="logo-fallback">Aço-Fer</span>
      <strong>Planejamento Aço-Fer</strong>
    </div>
    <div class="topbar-actions"></div>
  `;

  const logout = document.createElement('button');
  logout.className = 'ghost-button';
  logout.textContent = 'Sair';
  logout.addEventListener('click', () => {
    clearToken();
    window.dispatchEvent(new CustomEvent('planejamento:navigate'));
  });
  topbar.querySelector('.topbar-actions').appendChild(logout);
  return topbar;
}
