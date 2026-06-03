export function InternalTabs(tabs, activeTab, onChange) {
  const nav = document.createElement('nav');
  nav.className = 'internal-tabs';
  tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = tab.id === activeTab ? 'internal-tab active' : 'internal-tab';
    button.type = 'button';
    button.textContent = tab.label;
    button.addEventListener('click', () => onChange(tab.id));
    nav.appendChild(button);
  });
  return nav;
}
