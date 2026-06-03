import { Topbar } from '../components/Topbar.js';
import { Tabs } from '../components/Tabs.js';
import { PlanningPage } from './PlanningPage.js';
import { ProductivityMatrixPage } from './ProductivityMatrixPage.js';
import { StockPage } from './StockPage.js';
import { ImportHistoryPage } from './ImportHistoryPage.js';
import { TrackingPage } from './TrackingPage.js';

const pages = {
  planning: PlanningPage,
  productivity: ProductivityMatrixPage,
  stock: StockPage,
  history: ImportHistoryPage,
  tracking: TrackingPage
};

export function AppShell() {
  let activeTab = sessionStorage.getItem('planejamento_active_tab') || 'planning';
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  const main = document.createElement('main');
  main.className = 'page';
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.hidden = true;

  function renderPage() {
    sessionStorage.setItem('planejamento_active_tab', activeTab);
    shell.querySelector('.tabs')?.replaceWith(Tabs(activeTab, tab => {
      activeTab = tab;
      renderPage();
    }));
    main.innerHTML = '';
    main.appendChild(pages[activeTab]());
  }

  shell.appendChild(Topbar({ onImported: () => activeTab === 'stock' && renderPage() }));
  shell.appendChild(Tabs(activeTab, tab => {
    activeTab = tab;
    renderPage();
  }));
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
