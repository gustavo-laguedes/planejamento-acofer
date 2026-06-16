import { api, getCurrentUser } from './api.js';
import { signOut } from './clerkAuth.js';
import { UserManagementModal } from './UserManagementModal.js';
import { canAccess } from './rbac.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function userBlock(user) {
  const wrapper = document.createElement('div');
  wrapper.className = 'logged-user';
  wrapper.innerHTML = `
    <strong>Ol&aacute;, ${escapeHtml(user.name)}</strong>
    <span>${escapeHtml(user.role)}</span>
  `;
  return wrapper;
}

export function Topbar() {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div class="brand">
      <img src="/assets/logo-acofer.png" alt="A&ccedil;o-Fer" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'" />
      <span class="logo-fallback">A&ccedil;o-Fer</span>
      <strong>Planejamento A&ccedil;o-Fer</strong>
    </div>
    <div class="topbar-actions"></div>
  `;

  const actions = topbar.querySelector('.topbar-actions');
  const logout = document.createElement('button');
  logout.className = 'ghost-button';
  logout.type = 'button';
  logout.textContent = 'Sair';
  logout.addEventListener('click', async () => {
    await api('/auth/events/logout', { method: 'POST' }).catch(() => {});
    await signOut();
    window.dispatchEvent(new CustomEvent('planejamento:navigate'));
  });

  const renderUser = user => {
    if (canAccess(user, 'users:manage')) {
      const usersButton = document.createElement('button');
      usersButton.className = 'ghost-button';
      usersButton.type = 'button';
      usersButton.textContent = 'Gestao de Usuarios';
      usersButton.addEventListener('click', () => {
        document.body.appendChild(UserManagementModal());
      });
      actions.appendChild(usersButton);
    }

    actions.appendChild(userBlock(user));
    actions.appendChild(logout);
  };

  const cachedUser = getCurrentUser();
  if (cachedUser) {
    renderUser(cachedUser);
  } else {
    api('/auth/me').then(({ user }) => renderUser(user)).catch(() => {
      actions.appendChild(logout);
    });
  }

  return topbar;
}
