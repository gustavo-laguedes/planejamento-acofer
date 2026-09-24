import { Topbar } from '../shared/Topbar.js';
import { Tabs, TABS } from '../shared/Tabs.js';
import { InstitutionalFooter } from '../shared/InstitutionalFooter.js';
import { PlanningPage } from './PlanningPage.js';
import { RegistrationsPage } from './RegistrationsPage.js';
import { ProductivityMatrixPage } from './ProductivityMatrixPage.js';
import { StockPage } from './StockPage.js';
import { RestrictedStockPage } from './RestrictedStockPage.js';
import { ImportHistoryPage } from './ImportHistoryPage.js';
import { ProductionPage } from './ProductionPage.js';
import { TrackingPage } from './TrackingPage.js';
import { DashboardReportsPage } from './DashboardReportsPage.js';
import { AuditLogPage } from './AuditLogPage.js';
import { AnalysisPage } from './AnalysisPage.js';
import { CommercialCalendarPage } from './CommercialCalendarPage.js';
import { getCurrentUser } from '../shared/api.js';
import { internalLoadingHtml } from '../shared/InternalLoading.js';
import { canAccessRestrictedArea, defaultTabForUser, hasRestrictedNavigation, visibleTabsForUser } from '../shared/rbac.js';

const pages = {
  planning: PlanningPage,
  analysis: AnalysisPage,
  commercialCalendar: CommercialCalendarPage,
  registrations: RegistrationsPage,
  productivity: ProductivityMatrixPage,
  stock: StockPage,
  restricted: RestrictedStockPage,
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
    const requestedTab =
    new URLSearchParams(
      window.location.search
    ).get('tab');

  let activeTab =
    isRestricted
      ? defaultTab
      : (
          tabs.some(
            tab =>
              tab.id === requestedTab
          )
            ? requestedTab
            : (
                sessionStorage.getItem(
                  'planejamento_active_tab'
                )
                || defaultTab
              )
        );

  if (
    !tabs.some(
      tab =>
        tab.id === activeTab
    )
  ) {
    activeTab =
      defaultTab;
  }
  let pendingProductionLaunchId = null;
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  const main = document.createElement('main');
  main.className = 'page';
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.hidden = true;

    function syncActiveTabUrl(
    tabId
  ) {
    if (!tabId) {
      return;
    }

    const url =
      new URL(
        window.location.href
      );

    if (
      url.searchParams.get(
        'tab'
      ) === tabId
    ) {
      return;
    }

    url.searchParams.set(
      'tab',
      tabId
    );

    window.history.replaceState(
      null,
      '',
      url.pathname
      + url.search
      + url.hash
    );
  }

  function changeActiveTab(
    tabId
  ) {
    activeTab =
      tabId;

    syncActiveTabUrl(
      activeTab
    );

    renderPage();
  }

  function renderPage() {
    if (activeTab === 'restricted' && !canAccessRestrictedArea(user)) {
      main.innerHTML = '<div class="empty-state">Acesso restrito ao Super Admin.</div>';
      return;
    }
    if (!activeTab || !pages[activeTab]) {
      main.innerHTML = '<div class="empty-state">Nenhuma area disponivel para este perfil.</div>';
      return;
    }

        syncActiveTabUrl(
      activeTab
    );

    sessionStorage.setItem('planejamento_active_tab', activeTab);
    if (!isRestricted) {
            shell
        .querySelector(
          '.tabs'
        )
        ?.replaceWith(
          Tabs(
            activeTab,
            changeActiveTab,
            tabs
          )
        );
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
        shell.appendChild(
      Tabs(
        activeTab,
        changeActiveTab,
        tabs
      )
    );
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
