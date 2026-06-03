import { clearToken } from './api.js';
import { UploadCsvButton } from './UploadCsvButton.js';

export function Topbar({ onImported }) {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div class="brand">
      <img src="/assets/logo-acofer.png" alt="Aco-Fer" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'" />
      <span class="logo-fallback">Aco-Fer</span>
      <strong>Planejamento Aco-Fer</strong>
    </div>
    <div class="topbar-actions"></div>
  `;

  topbar.querySelector('.topbar-actions').appendChild(UploadCsvButton({ onImported }));
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
