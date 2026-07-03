import { api, getCurrentUser } from './api.js';
import { signOut } from './clerkAuth.js';
import { UserManagementModal } from './UserManagementModal.js';
import { ROLES, canAccess, normalizeRole } from './rbac.js';
import { clearBrowserSession } from './browserSession.js';

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
      <span aria-hidden="true">🔔</span>
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
