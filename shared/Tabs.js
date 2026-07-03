export const TABS = [
  { id: 'planning', label: 'Planejamento' },
  { id: 'analysis', label: 'Análise' },
  { id: 'commercialCalendar', label: 'Comercial' },
  { id: 'tracking', label: 'Produtividade / Acompanhamento' },
  { id: 'dashboardReports', label: 'Dashboard / Relatórios' },
  { id: 'stock', label: 'Estoque' },
  { id: 'production', label: 'Produção' },
  { id: 'history', label: 'CSV / Inventário' },
  { id: 'registrations', label: 'Cadastros' },
  { id: 'productivity', label: 'Matriz de Produtividade' },
  { id: 'audit', label: 'Log' }
];

export function Tabs(activeTab, onChange, tabs = TABS) {
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = tab.id === activeTab ? 'tab active' : 'tab';
    button.textContent = tab.label;
    button.addEventListener('click', () => onChange(tab.id));
    nav.appendChild(button);
  });
  return nav;
}
