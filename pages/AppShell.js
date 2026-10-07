import { AppHeader } from '../shared/Topbar.js';
import { Sidebar, TABS } from '../shared/Tabs.js';
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
import { getCurrentUser } from '../shared/api.js';
import { internalLoadingHtml } from '../shared/InternalLoading.js';
import { defaultTabForUser, visibleTabsForUser } from '../shared/rbac.js';

const pages = { dashboardReports: DashboardReportsPage, calendar: () => AnalysisPage({ mode: 'calendar' }), analysis: AnalysisPage, tracking: TrackingPage, planning: PlanningPage, stock: StockPage, production: ProductionPage, history: ImportHistoryPage, registrations: RegistrationsPage, productivity: ProductivityMatrixPage, audit: AuditLogPage };
const labels = { dashboardReports: 'Dashboard', calendar: 'Calendário', tracking: 'Análise / Produtividade', productivity: 'Cadastros / Matriz de Produtividade', stock: 'Estoque', production: 'Produção', audit: 'Log' };
function storedLabel(key, items, fallback) { const id = sessionStorage.getItem(key) || fallback; return items.find(item => item.id === id)?.label || items[0]?.label || ''; }
function breadcrumbFor(tab) {
  if (tab === 'dashboardReports') return `Dashboard / ${storedLabel('planejamento_dashboard_tab', [{ id: 'graphs', label: 'Gráficos' }, { id: 'reports', label: 'Relatórios' }], 'graphs')}`;
  if (labels[tab]) return labels[tab];
  if (tab === 'analysis') return `Análise / ${storedLabel('planejamento_analysis_tab', [{ id: 'assistant', label: 'Assistente PCP' }, { id: 'calculations', label: 'Cálculos' }], 'assistant')}`;
  if (tab === 'planning') return `Planejamento / ${storedLabel('planejamento_planning_tab', [{ id: 'simulation', label: 'Simulação' }, { id: 'history', label: 'Histórico de Planejamentos' }], 'simulation')}`;
  if (tab === 'history') return `Movimentações / ${storedLabel('planejamento_launches_tab', [{ id: 'csv', label: 'Importação CSV' }, { id: 'inventory', label: 'Inventário' }, { id: 'transports', label: 'Transportes' }, { id: 'purchase', label: 'Compra' }], 'csv')}`;
  if (tab === 'registrations') return `Cadastros / ${storedLabel('planejamento_registration_tab', [{ id: 'locations', label: 'Locais' }, { id: 'machines', label: 'Máquinas' }, { id: 'materialTypes', label: 'Tipos de Material' }, { id: 'materials', label: 'Materiais' }, { id: 'norms', label: 'Normas' }], 'locations')}`;
  return '';
}
export function AppShell() {
  const user = getCurrentUser(); const tabs = visibleTabsForUser(user, TABS); const defaultTab = defaultTabForUser(user, TABS); const requested = new URLSearchParams(window.location.search).get('tab');
  let activeTab = tabs.some(tab => tab.id === requested) ? requested : sessionStorage.getItem('planejamento_active_tab') || defaultTab;
  if (!tabs.some(tab => tab.id === activeTab)) activeTab = defaultTab;
  let pendingProductionLaunchId = null;
  const shell = document.createElement('div'); shell.className = 'app-shell';
  const workspace = document.createElement('div'); workspace.className = 'app-workspace';
  const main = document.createElement('main'); main.className = 'page app-content';
  const header = AppHeader(breadcrumbFor(activeTab));
  const pageMount = document.createElement('div'); pageMount.className = 'app-page-content';
  main.append(header, pageMount);
  const footer = InstitutionalFooter(); const toast = document.createElement('div'); toast.className = 'toast'; toast.hidden = true;
  function syncUrl(tab) { const url = new URL(window.location.href); if (url.searchParams.get('tab') === tab) return; url.searchParams.set('tab', tab); window.history.replaceState(null, '', url.pathname + url.search + url.hash); }
  function refreshNavigation() { shell.querySelector('.app-sidebar')?.replaceWith(Sidebar(activeTab, changeActiveTab, tabs, user)); const title = shell.querySelector('.app-header-title'); if (title) title.textContent = breadcrumbFor(activeTab); }
  function changeActiveTab(tab) { activeTab = tab; syncUrl(tab); renderPage(); }
  function renderPage() {
    if (!activeTab || !pages[activeTab] || !tabs.some(tab => tab.id === activeTab)) { pageMount.innerHTML = '<div class="empty-state">Nenhuma área disponível para este perfil.</div>'; return; }
    syncUrl(activeTab); sessionStorage.setItem('planejamento_active_tab', activeTab); refreshNavigation(); pageMount.innerHTML = internalLoadingHtml('Carregando página...');
    requestAnimationFrame(() => { pageMount.innerHTML = ''; const options = activeTab === 'production' && pendingProductionLaunchId ? { openLaunchId: pendingProductionLaunchId } : {}; pendingProductionLaunchId = null; pageMount.appendChild(pages[activeTab](options)); });
  }
  shell.appendChild(Sidebar(activeTab, changeActiveTab, tabs, user)); workspace.append(main, footer); shell.append(workspace, toast);
  window.addEventListener('planejamento:toast', event => { toast.textContent = event.detail; toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 3200); });
  window.addEventListener('planejamento:open-production-launch', event => { pendingProductionLaunchId = event.detail?.id || null; activeTab = 'production'; renderPage(); });
  renderPage(); return shell;
}
