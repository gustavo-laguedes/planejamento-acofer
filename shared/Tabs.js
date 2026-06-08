export const TABS = [
  { id: 'planning', label: 'Planejamento' },
  { id: 'registrations', label: 'Cadastros' },
  { id: 'productivity', label: 'Matriz de Produtividade' },
  { id: 'stock', label: 'Estoque' },
  { id: 'history', label: 'Lançamentos' },
  { id: 'tracking', label: 'Produtividade / Acompanhamento' }
];

export function Tabs(activeTab, onChange) {
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  TABS.forEach(tab => {
    const button = document.createElement('button');
    button.className = tab.id === activeTab ? 'tab active' : 'tab';
    button.textContent = tab.label;
    button.addEventListener('click', () => onChange(tab.id));
    nav.appendChild(button);
  });
  return nav;
}
