import { Topbar } from '../shared/Topbar.js';
import { Tabs, TABS } from '../shared/Tabs.js';
import { InstitutionalFooter } from '../shared/InstitutionalFooter.js';
import { PlanningPage } from './PlanningPage.js';
import { RegistrationsPage } from './RegistrationsPage.js';
import { ProductivityMatrixPage } from './ProductivityMatrixPage.js';
import { StockPage } from './StockPage.js';
import { ImportHistoryPage } from './ImportHistoryPage.js';
import { ProductionPage } from './ProductionPage.js';
import { TrackingPage } from './TrackingPage.js';
import { DashboardReportsPage } from './DashboardReportsPage.js';
import { AuditLogPage } from './AuditLogPage.js';
import { AnalysisPage } from './AnalysisPage.js';
import { CommercialCalendarPage } from './CommercialCalendarPage.js';
import { getCurrentUser } from '../shared/api.js';
import { internalLoadingHtml } from '../shared/InternalLoading.js';
import { defaultTabForUser, hasRestrictedNavigation, visibleTabsForUser } from '../shared/rbac.js';

const pages = {
  planning: PlanningPage,
  analysis: AnalysisPage,
  commercialCalendar: CommercialCalendarPage,
  registrations: RegistrationsPage,
  productivity: ProductivityMatrixPage,
  stock: StockPage,
  production: ProductionPage,
  history: ImportHistoryPage,
  tracking: TrackingPage,
  dashboardReports: DashboardReportsPage,
  audit: AuditLogPage
};

export function AppShell() {
  const user = getCurrentUser();
  const tabs = visibleTabsForUser(user, TABS);
  const defaultTab = defaultTabForUser(user, TABS);
  const isRestricted = hasRestrictedNavigation(user);
  let activeTab = isRestricted ? defaultTab : sessionStorage.getItem('planejamento_active_tab') || defaultTab;
  if (!tabs.some(tab => tab.id === activeTab)) activeTab = defaultTab;
  let pendingProductionLaunchId = null;
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
    if (!isRestricted) {
      shell.querySelector('.tabs')?.replaceWith(Tabs(activeTab, tab => {
        activeTab = tab;
        renderPage();
      }, tabs));
    }
    main.innerHTML = internalLoadingHtml('Carregando pagina...');
    requestAnimationFrame(() => {
      main.innerHTML = '';
      const pageOptions = activeTab === 'production' && pendingProductionLaunchId
        ? { openLaunchId: pendingProductionLaunchId }
        : {};
      pendingProductionLaunchId = null;
      main.appendChild(pages[activeTab](pageOptions));
    });
  }

  shell.appendChild(Topbar());
  if (!isRestricted) {
    shell.appendChild(Tabs(activeTab, tab => {
      activeTab = tab;
      renderPage();
    }, tabs));
  }
  shell.appendChild(main);
  shell.appendChild(InstitutionalFooter());
  shell.appendChild(toast);

  window.addEventListener('planejamento:toast', event => {
    toast.textContent = event.detail;
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  });

  window.addEventListener('planejamento:open-production-launch', event => {
    pendingProductionLaunchId = event.detail?.id || null;
    activeTab = 'production';
    renderPage();
  });

  renderPage();
  return shell;
}
