import { api, getCurrentUser } from './api.js';
import { signOut } from './clerkAuth.js';
import { UserManagementModal } from './UserManagementModal.js';
import { ROLES, canAccess, normalizeRole } from './rbac.js';
import { clearBrowserSession } from './browserSession.js';
import { resetPlanningBrowserCache } from './browserCacheReset.js';

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

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
}

function canViewNotifications(user) {
  return [ROLES.SUPER_ADMIN, ROLES.DIRETOR, ROLES.GERENTE, ROLES.PCP].includes(normalizeRole(user?.role));
}

function notificationStatusLabel(item) {
  const status = String(item?.status || '').trim();
  const normalizedStatus = status.toLocaleLowerCase('pt-BR');
  if (item?.pending || normalizedStatus.includes('solicit')) return 'Cancelamento solicitado';
  if (/n.{0,8}o aprovado/.test(normalizedStatus) || normalizedStatus.includes('nao aprovado')) {
    return 'Cancelamento n&atilde;o aprovado';
  }
  if (normalizedStatus.includes('aprovado')) return 'Cancelamento aprovado';
  return escapeHtml(status || 'Cancelamento solicitado');
}

function notificationMaterialLabel(item) {
  return item.material_code || item.material_name || 'Material';
}

function notificationItemHtml(item, options = {}) {
  const tag = options.clickable ? 'button' : 'article';
  const typeAttribute = options.clickable ? ' type="button"' : '';
  const productionIdAttribute = options.clickable
    ? ` data-production-id="${escapeHtml(item.production_id || item.id)}"`
    : '';
  const status = notificationStatusLabel(item);
  const decisionHtml = !item.pending
    ? `
      <span>Decis&atilde;o tomada: ${status}</span>
      <span>Decidido por: ${escapeHtml(item.decided_by || '-')}</span>
      <span>Decidido em: ${escapeHtml(formatDateTime(item.decided_at))}</span>
    `
    : '';

  return `
    <${tag} class="notification-item${item.pending ? ' is-pending' : ' is-resolved'}"${typeAttribute}${productionIdAttribute}>
      <em>${status}</em>
      <strong>Material: ${escapeHtml(notificationMaterialLabel(item))}</strong>
      <span>Data da produ&ccedil;&atilde;o: ${escapeHtml(formatDate(item.production_date))}</span>
      <span>Solicitante: ${escapeHtml(item.requested_by || '-')}</span>
      <span>Motivo: ${escapeHtml(item.reason || '-')}</span>
      <span>Solicitada em: ${escapeHtml(formatDateTime(item.requested_at))}</span>
      ${decisionHtml}
    </${tag}>
  `;
}

function notificationBell() {
  const wrapper = document.createElement('div');
  wrapper.className = 'topbar-notifications';
  wrapper.innerHTML = `
    <button class="ghost-button notification-bell-button" type="button" aria-label="Notificações" aria-expanded="false">
      <span class="notification-bell-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg></span>
      <span class="notification-badge" hidden>0</span>
    </button>
    <div class="notification-dropdown" hidden>
      <div class="notification-dropdown-header">
        <strong>Notificações</strong>
        <button class="notification-history-button" type="button">Ver todas</button>
      </div>
      <div class="notification-list"><span class="muted-text">Carregando...</span></div>
    </div>
  `;
  const button = wrapper.querySelector('.notification-bell-button');
  const dropdown = wrapper.querySelector('.notification-dropdown');
  const list = wrapper.querySelector('.notification-list');
  const badge = wrapper.querySelector('.notification-badge');
  const historyButton = wrapper.querySelector('.notification-history-button');
  let notifications = [];

  async function loadNotifications() {
    notifications = await api('/actuals/notifications/cancellation-requests').catch(() => []);
    const pendingNotifications = notifications.filter(item => item.pending || item.read === false);
    badge.hidden = pendingNotifications.length === 0;
    badge.textContent = String(pendingNotifications.length);
    list.innerHTML = pendingNotifications.length
      ? pendingNotifications.map(item => notificationItemHtml({ ...item, pending: true }, { clickable: true })).join('')
      : '<span class="muted-text">Nenhuma notifica&ccedil;&atilde;o pendente.</span>';
    return notifications;
  }

  async function openNotificationHistory() {
    const history = await loadNotifications();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop notification-history-backdrop';
    backdrop.innerHTML = `
      <div class="modal wide-modal notification-history-modal" role="dialog" aria-modal="true" aria-labelledby="notification-history-title">
        <div class="modal-header">
          <h2 id="notification-history-title">Hist&oacute;rico de notifica&ccedil;&otilde;es</h2>
          <button class="secondary-button notification-history-close" type="button">Fechar</button>
        </div>
        <div class="notification-history-list">
          ${history.length
            ? history.map(item => notificationItemHtml(item)).join('')
            : '<span class="muted-text">Nenhuma notifica&ccedil;&atilde;o encontrada.</span>'}
        </div>
      </div>
    `;
    const close = () => backdrop.remove();
    backdrop.querySelector('.notification-history-close').addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    document.body.appendChild(backdrop);
  }

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const expanded = dropdown.hidden;
    dropdown.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    if (expanded) await loadNotifications();
  });
  document.addEventListener('click', event => {
    if (wrapper.contains(event.target)) return;
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  });
  list.addEventListener('click', event => {
    const item = event.target.closest('[data-production-id]');
    if (!item) return;
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new CustomEvent('planejamento:open-production-launch', {
      detail: { id: item.dataset.productionId }
    }));
  });
  historyButton.addEventListener('click', async event => {
    event.stopPropagation();
    dropdown.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    await openNotificationHistory();
  });
  window.addEventListener('planejamento:refresh-notifications', loadNotifications);
  loadNotifications();
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
    await api('/auth/session/close', { method: 'POST' }).catch(() => {});
    clearBrowserSession();
    await signOut();
    window.location.reload();
  });

  const renderUser = user => {
    if (canAccess(user, 'users:manage')) {
      const usersButton = document.createElement('button');
      usersButton.className = 'ghost-button';
      usersButton.type = 'button';
      usersButton.textContent = 'Gestão de Usuários';
      usersButton.addEventListener('click', () => {
        document.body.appendChild(UserManagementModal());
      });
      actions.appendChild(usersButton);
    }

    if (canViewNotifications(user)) {
      actions.appendChild(notificationBell());
    }

    actions.appendChild(userBlock(user));
    actions.appendChild(logout);

    const cacheButton = document.createElement('button');
    cacheButton.className = 'ghost-button topbar-cache-reset';
    cacheButton.type = 'button';
    cacheButton.textContent = 'Limpar cache';
    cacheButton.addEventListener('click', resetPlanningBrowserCache);
    actions.appendChild(cacheButton);
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

function userInitials(user = {}) {
  const parts = String(user?.name || 'Usuário').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || 'US').toUpperCase();
}

function userMenu(user) {
  const wrapper = document.createElement('div');
  wrapper.className = 'app-user-menu';
  wrapper.innerHTML = `<button class="app-user-trigger" type="button" aria-expanded="false"><span class="app-user-avatar">${escapeHtml(userInitials(user))}</span><span class="app-user-copy"><strong>${escapeHtml(user?.name || 'Usuário')}</strong><span>${escapeHtml(user?.role || '')}</span></span><span class="app-user-chevron" aria-hidden="true">⌄</span></button><div class="app-user-dropdown" hidden><button type="button" data-user-logout><span class="app-logout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></svg></span><span>Sair</span></button></div>`;
  const trigger = wrapper.querySelector('.app-user-trigger'); const dropdown = wrapper.querySelector('.app-user-dropdown');
  trigger.addEventListener('click', event => { event.stopPropagation(); const expanded = dropdown.hidden; dropdown.hidden = !expanded; trigger.setAttribute('aria-expanded', String(expanded)); });
  document.addEventListener('click', event => { if (wrapper.contains(event.target)) return; dropdown.hidden = true; trigger.setAttribute('aria-expanded', 'false'); });
  wrapper.querySelector('[data-user-logout]').addEventListener('click', async () => { await api('/auth/events/logout', { method: 'POST' }).catch(() => {}); await api('/auth/session/close', { method: 'POST' }).catch(() => {}); clearBrowserSession(); await signOut(); window.location.reload(); });
  return wrapper;
}

export function AppHeader(title = '') {
  const header = document.createElement('header'); header.className = 'app-header';
  header.innerHTML = `<div class="app-header-path"><h1 class="app-header-title">${escapeHtml(title)}</h1></div><div class="app-header-actions"></div>`;
  const actions = header.querySelector('.app-header-actions');
  const renderUser = user => { if (canViewNotifications(user)) actions.appendChild(notificationBell()); actions.appendChild(userMenu(user)); };
  const user = getCurrentUser(); if (user) renderUser(user); else api('/auth/me').then(({ user: currentUser }) => renderUser(currentUser)).catch(() => {});
  return header;
}
