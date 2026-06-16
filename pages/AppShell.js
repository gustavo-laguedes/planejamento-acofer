import { Topbar } from '../shared/Topbar.js';
import { Tabs, TABS } from '../shared/Tabs.js';
import { PlanningPage } from './PlanningPage.js';
import { RegistrationsPage } from './RegistrationsPage.js';
import { ProductivityMatrixPage } from './ProductivityMatrixPage.js';
import { StockPage } from './StockPage.js';
import { ImportHistoryPage } from './ImportHistoryPage.js';
import { TrackingPage } from './TrackingPage.js';
import { AuditLogPage } from './AuditLogPage.js';
import { getCurrentUser } from '../shared/api.js';
import { defaultTabForUser, visibleTabsForUser } from '../shared/rbac.js';

const pages = {
  planning: PlanningPage,
  registrations: RegistrationsPage,
  productivity: ProductivityMatrixPage,
  stock: StockPage,
  history: ImportHistoryPage,
  tracking: TrackingPage,
  audit: AuditLogPage
};

export function AppShell() {
  const user = getCurrentUser();
  const tabs = visibleTabsForUser(user, TABS);
  let activeTab = sessionStorage.getItem('planejamento_active_tab') || defaultTabForUser(user, TABS);
  if (!tabs.some(tab => tab.id === activeTab)) activeTab = defaultTabForUser(user, TABS);
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  const main = document.createElement('main');
  main.className = 'page';
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.hidden = true;

  function renderPage() {
    if (!activeTab || !pages[activeTab]) {
      main.innerHTML = '<div class="empty-state">Nenhuma area disponivel para este perfil.</div>';
      return;
    }
    sessionStorage.setItem('planejamento_active_tab', activeTab);
    shell.querySelector('.tabs')?.replaceWith(Tabs(activeTab, tab => {
      activeTab = tab;
      renderPage();
    }, tabs));
    main.innerHTML = '';
    main.appendChild(pages[activeTab]());
  }

  shell.appendChild(Topbar());
  shell.appendChild(Tabs(activeTab, tab => {
    activeTab = tab;
    renderPage();
  }, tabs));
  shell.appendChild(main);
  shell.appendChild(toast);

  window.addEventListener('planejamento:toast', event => {
    toast.textContent = event.detail;
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  });

  renderPage();
  return shell;
}
