import { UserManagementModal } from './UserManagementModal.js';
import { resetPlanningBrowserCache } from './browserCacheReset.js';
import { canAccess } from './rbac.js';

const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
const ICONS = {
  dashboard: icon('<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="10" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="18" width="6" height="2" rx="1"/>'), calendar: icon('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7 3v4m10-4v4M3.5 9h17M7.5 13h2m3 0h2m3 0h.5M7.5 17h2m3 0h2"/>'), analysis: icon('<path d="M4 19.5h16M6.5 16v-4m5 4V7m5 9v-7"/><path d="m5 9 5-4 4 3 5-5"/>'), planning: icon('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'), stock: icon('<path d="m12 3.5 8 4.2-8 4.2-8-4.2 8-4.2Z"/><path d="m4 12 8 4.2 8-4.2M4 16.2l8 4.2 8-4.2"/>'), production: icon('<path d="M4 20V9l5 3V8l5 3V6l6 4v10H4Z"/><path d="M8 16h2m3 0h2m3 0h2"/>'), movements: icon('<path d="M5 7h13m0 0-3-3m3 3-3 3M19 17H6m0 0 3 3m-3-3 3-3"/>'), registrations: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'), audit: icon('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>'), users: icon('<circle cx="9" cy="8" r="3.5"/><path d="M3.5 20v-1.5c0-3 2-5 5.5-5s5.5 2 5.5 5V20M16 6.5a3 3 0 0 1 0 5.8M16.5 14c2.6.4 4 2 4 4.5V20"/>'), cache: icon('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.2 8A7.5 7.5 0 0 0 5.3 6.4L4 9m1.8 7A7.5 7.5 0 0 0 18.7 17.6L20 15"/>')
};
const SUB_ICONS = {
  graphs: icon('<path d="M4 19h16M6 16V9m6 7V5m6 11v-4"/><path d="M5 8l5-3 4 3 5-5"/>'),
  reports: icon('<path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h5M8 12h8M8 16h8"/>'),
  assistant: icon('<path d="M12 3a7 7 0 0 0-4.6 12.3L7 20l4-2h1a7 7 0 1 0 0-14Z"/><path d="M9 10h6M9 13h4"/>'), tracking: icon('<path d="M4 19h16M6 16V9m6 7V5m6 11v-4"/><path d="M5 8l5-3 4 3 5-5"/>'), calculations: icon('<path d="M5 4h14v16H5V4Z"/><path d="M8 8h8M8 12h2m3 0h3M8 16h2m3 0h3"/>'), simulation: icon('<path d="m8 5 10 7-10 7V5Z"/>'), history: icon('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l3 2"/>'), csv: icon('<path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h5M8 12h8M8 16h8"/>'), inventory: icon('<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="M4 7v10l8 4 8-4V7M8 13h8"/>'), transports: icon('<path d="M3 7h11v9H3V7Zm11 3h4l3 3v3h-7v-6Z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'), purchase: icon('<path d="M4 5h2l2 10h9l2-7H7"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>'), locations: icon('<path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>'), machines: icon('<path d="M4 20V9l5 3V8l5 3V6l6 4v10H4Z"/><path d="M8 16h2m3 0h2m3 0h2"/>'), materials: icon('<path d="m12 3 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 15l8 4 8-4"/>'), productivity: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 15v-3m4 3V8m4 7v-5"/>')
};
export const TABS = [
  { id: 'dashboardReports', label: 'Dashboard', icon: 'dashboard', storageKey: 'planejamento_dashboard_tab', defaultSubtab: 'graphs', items: [{ id: 'graphs', label: 'Gráficos' }, { id: 'reports', label: 'Relatórios' }] }, { id: 'calendar', label: 'Calendário', icon: 'calendar' },
  { id: 'analysis', label: 'Análise', icon: 'analysis', storageKey: 'planejamento_analysis_tab', defaultSubtab: 'assistant', items: [{ id: 'assistant', label: 'Assistente PCP' }, { id: 'tracking', label: 'Produtividade', targetTab: 'tracking' }, { id: 'calculations', label: 'Cálculos' }] }, { id: 'tracking', label: 'Produtividade', hiddenFromSidebar: true, parentTabId: 'analysis' },
  { id: 'planning', label: 'Planejamento', icon: 'planning', storageKey: 'planejamento_planning_tab', defaultSubtab: 'simulation', items: [{ id: 'simulation', label: 'Simulação' }, { id: 'history', label: 'Histórico de Planejamentos' }] }, { id: 'stock', label: 'Estoque', icon: 'stock' }, { id: 'production', label: 'Produção', icon: 'production' },
  { id: 'history', label: 'Movimentações', icon: 'movements', storageKey: 'planejamento_launches_tab', defaultSubtab: 'csv', items: [{ id: 'csv', label: 'Importação CSV' }, { id: 'inventory', label: 'Inventário' }, { id: 'transports', label: 'Transportes' }, { id: 'purchase', label: 'Compra' }] },
  { id: 'registrations', label: 'Cadastros', icon: 'registrations', storageKey: 'planejamento_registration_tab', defaultSubtab: 'locations', items: [{ id: 'locations', label: 'Locais' }, { id: 'machines', label: 'Máquinas' }, { id: 'materialTypes', label: 'Tipos de Material' }, { id: 'materials', label: 'Materiais' }, { id: 'norms', label: 'Normas' }, { id: 'productivity', label: 'Matriz de Produtividade', targetTab: 'productivity' }] }, { id: 'productivity', label: 'Matriz de Produtividade', hiddenFromSidebar: true, parentTabId: 'registrations' }, { id: 'audit', label: 'Log', icon: 'audit', bottom: true }
];
let LINE_VERSION = 'V051026.1037';
const LINE_THEME_STORAGE_KEY = 'line_visual_theme';

async function loadLineVersion() {
  try {
    const response = await fetch(
      '/api/version',
      { cache: 'no-store' }
    );

    if (!response.ok) return;

    const data = await response.json();
    const version = String(
      data?.version || ''
    ).trim();

    if (!/^V\d{6}\.\d{4}$/.test(version)) {
      return;
    }

    LINE_VERSION = version;

    document
      .querySelectorAll(
        '.sidebar-system-version, .line-system-modal-version'
      )
      .forEach(element => {
        element.textContent = LINE_VERSION;
      });
  } catch {
    // Mantém a última versão disponível caso o endpoint esteja indisponível.
  }
}

const LINE_THEME_SUN_ICON = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>');
const LINE_THEME_MOON_ICON = icon('<path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>');

function currentLineTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyLineTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(LINE_THEME_STORAGE_KEY, nextTheme);
  return nextTheme;
}

function updateLineThemeButton(button) {
  const dark = currentLineTheme() === 'dark';

  button.innerHTML = `
    <span class="line-theme-toggle-icon">
      ${dark ? LINE_THEME_SUN_ICON : LINE_THEME_MOON_ICON}
    </span>
    <span>${dark ? 'Usar modo claro' : 'Usar modo escuro'}</span>
  `;

  button.setAttribute(
    'aria-label',
    dark ? 'Alterar para modo claro' : 'Alterar para modo escuro'
  );
}

function LineSystemModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop line-system-modal-backdrop';

  backdrop.innerHTML = `
    <section class="modal line-system-modal" role="dialog" aria-modal="true" aria-label="Sobre o LINE">
      <div class="line-system-modal-header">
        <button class="line-system-modal-close" type="button" data-line-close aria-label="Fechar">×</button>
      </div>

      <img class="line-system-modal-logo" src="/assets/logo-line-white-full.png" alt="LINE" />

      <span class="line-system-modal-version">${LINE_VERSION}</span>

      <button class="line-theme-toggle" type="button" data-line-theme-toggle></button>

      <div class="line-system-powered">
        <span>Powered by Catrion</span>

        <div class="line-system-powered-logo">
          <img src="/assets/logo-catrion.png" alt="Catrion" />
        </div>
      </div>
    </section>
  `;

  const closeButton = backdrop.querySelector('[data-line-close]');
  const themeButton = backdrop.querySelector('[data-line-theme-toggle]');

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
  };

  const onKeydown = event => {
    if (event.key === 'Escape') close();
  };

  updateLineThemeButton(themeButton);

  themeButton.addEventListener('click', () => {
    const nextTheme = currentLineTheme() === 'dark' ? 'light' : 'dark';
    applyLineTheme(nextTheme);
    updateLineThemeButton(themeButton);
  });

  closeButton.addEventListener('click', close);

  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close();
  });

  document.addEventListener('keydown', onKeydown);

  return backdrop;
}

function hrefFor(tabId) { const url = new URL(window.location.href); url.searchParams.set('tab', tabId); return url.pathname + url.search + url.hash; }
function nativeLink(event) { return event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey; }
function navButton(item, activeTab, onChange, tabs, flyoutHost = null) {
  const active = item.id === activeTab || tabs.find(tab => tab.id === activeTab)?.parentTabId === item.id; const wrapper = document.createElement('div'); wrapper.className = `sidebar-nav-item${active ? ' active' : ''}${item.items?.length ? ' has-flyout' : ''}`;
  const link = document.createElement('a'); link.className = 'sidebar-nav-link'; link.href = hrefFor(item.id); link.innerHTML = `<span class="sidebar-nav-icon">${ICONS[item.icon] || ''}</span><span class="sidebar-nav-label">${item.label}</span>`; link.addEventListener('click', event => { if (nativeLink(event)) return; event.preventDefault(); if (item.storageKey && item.defaultSubtab) sessionStorage.setItem(item.storageKey, item.defaultSubtab); onChange(item.id); }); wrapper.appendChild(link);
  if (!item.items?.length && flyoutHost) wrapper.addEventListener('mouseenter', () => flyoutHost.querySelectorAll('.sidebar-flyout').forEach(candidate => { candidate.hidden = true; }));
  if (item.items?.length && flyoutHost) {
    const flyout = document.createElement('div'); flyout.className = 'sidebar-flyout'; flyout.hidden = true; const stored = item.storageKey ? sessionStorage.getItem(item.storageKey) : null;
    item.items.forEach(child => { const button = document.createElement('button'); const target = child.targetTab || item.id; const selected = child.targetTab ? child.targetTab === activeTab : item.id === activeTab && child.id === (stored || item.defaultSubtab); button.type = 'button'; button.className = `sidebar-flyout-button${selected ? ' active' : ''}`; button.innerHTML = `<span class="sidebar-flyout-icon">${SUB_ICONS[child.id] || ICONS[item.icon] || ''}</span><span class="sidebar-flyout-label">${child.label}</span>`; button.addEventListener('click', event => { event.stopPropagation(); if (!child.targetTab && item.storageKey) sessionStorage.setItem(item.storageKey, child.id); flyout.hidden = true; onChange(target); }); flyout.appendChild(button); }); flyoutHost.appendChild(flyout);
    let closeTimer = null; const hideOtherFlyouts = () => flyoutHost.querySelectorAll('.sidebar-flyout').forEach(candidate => { if (candidate !== flyout) candidate.hidden = true; }); const open = () => { clearTimeout(closeTimer); hideOtherFlyouts(); const rect = wrapper.getBoundingClientRect(); flyout.style.left = `${Math.round(rect.right + 8)}px`; flyout.style.top = `${Math.round(rect.top)}px`; flyout.hidden = false; }; const closeSoon = () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => { flyout.hidden = true; }, 45); };
    wrapper.addEventListener('mouseenter', open); wrapper.addEventListener('mouseleave', closeSoon); wrapper.addEventListener('focusin', open); wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget) && !flyout.contains(event.relatedTarget)) closeSoon(); }); flyout.addEventListener('mouseenter', () => clearTimeout(closeTimer)); flyout.addEventListener('mouseleave', closeSoon);
  }
  return wrapper;
}
export function Sidebar(activeTab, onChange, tabs = TABS, user = null) {
  const aside = document.createElement('aside');
  aside.className = 'app-sidebar';
  aside.innerHTML = `
    <div class="sidebar-brand" aria-label="Aço-Fer">
      <img src="/assets/logo-acofer.png" alt="Aço-Fer" />
    </div>
    <nav class="sidebar-navigation"></nav>
    <div class="sidebar-bottom"></div>
    <div class="sidebar-flyout-layer"></div>
  `;

  const navigation = aside.querySelector('.sidebar-navigation');
  const bottom = aside.querySelector('.sidebar-bottom');
  const host = aside.querySelector('.sidebar-flyout-layer');

  tabs
    .filter(item => !item.hiddenFromSidebar && !item.bottom)
    .forEach(item => navigation.appendChild(navButton(item, activeTab, onChange, tabs, host)));

  if (canAccess(user, 'users:manage')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-utility-button';
    button.innerHTML = `<span class="sidebar-nav-icon">${ICONS.users}</span><span>Usuários</span>`;
    button.addEventListener('click', () => document.body.appendChild(UserManagementModal()));
    bottom.appendChild(button);
  }

  const audit = tabs.find(item => item.id === 'audit' && item.bottom);
  if (audit) bottom.appendChild(navButton(audit, activeTab, onChange, tabs, host));

  const cache = document.createElement('button');
  cache.type = 'button';
  cache.className = 'sidebar-utility-button';
  cache.innerHTML = `<span class="sidebar-nav-icon">${ICONS.cache}</span><span>Limpar cache</span>`;
  cache.addEventListener('click', resetPlanningBrowserCache);
  bottom.appendChild(cache);

  const signature = document.createElement('button');
  signature.type = 'button';
  signature.className = 'sidebar-system-signature';
  signature.setAttribute('aria-label', 'Sobre o LINE e alterar visual');
  signature.innerHTML = `
    <img class="sidebar-system-logo" src="/assets/logo-line-sidebar.png" alt="LINE" />
    <span class="sidebar-system-version">${LINE_VERSION}</span>
  `;
  signature.addEventListener('click', () => {
    const modal = LineSystemModal();
    document.body.appendChild(modal);
    loadLineVersion();
  });
  bottom.appendChild(signature);
  loadLineVersion();

  return aside;
}
