export const TABS = [
  { id: 'planning', label: 'Planejamento' },
  { id: 'analysis', label: 'An\u00e1lise' },
  { id: 'commercialCalendar', label: 'Comercial' },
  { id: 'tracking', label: 'Produtividade / Acompanhamento' },
  { id: 'dashboardReports', label: 'Dashboard / Relat\u00f3rios' },
  { id: 'stock', label: 'Estoque' },
  { id: 'production', label: 'Produ\u00e7\u00e3o' },
  { id: 'history', label: 'Lan\u00e7amentos' },
  { id: 'registrations', label: 'Cadastros' },
  { id: 'productivity', label: 'Matriz de Produtividade' },
  { id: 'audit', label: 'Log' },
  { id: 'restricted', label: 'Restrito' }
];

const SUBTABS = {
  planning: {
    storageKey: 'planejamento_planning_tab',
    items: [
      { id: 'simulation', label: 'Simula\u00e7\u00e3o' },
      { id: 'history', label: 'Hist\u00f3rico de Planejamentos' }
    ]
  },
  analysis: {
  storageKey: 'planejamento_analysis_tab',
  items: [
    { id: 'assistant', label: 'Assistente PCP' },
    { id: 'calendar', label: 'Calend\u00e1rio' },
    { id: 'calculations', label: 'C\u00e1lculos' }
  ]
},
  history: {
    storageKey: 'planejamento_launches_tab',
    items: [
      { id: 'csv', label: 'Importa\u00e7\u00e3o CSV' },
      { id: 'inventory', label: 'Invent\u00e1rio' },
      { id: 'transports', label: 'Transportes' },
      { id: 'purchase', label: 'Compra' }
    ]
  },
  registrations: {
    storageKey: 'planejamento_registration_tab',
    items: [
      { id: 'locations', label: 'Locais' },
      { id: 'machines', label: 'M\u00e1quinas' },
      { id: 'materials', label: 'Materiais' }
    ]
  },
  restricted: {
    storageKey: 'planejamento_restricted_tab',
    items: [
      { id: 'oldStock', label: 'Estoque antigo' }
    ]
  }
};

export function Tabs(activeTab, onChange, tabs = TABS) {
  const nav = document.createElement('nav');
  nav.className = 'tabs';

  function tabHref(tabId) {
    const url =
      new URL(
        window.location.href
      );

    url.searchParams.set(
      'tab',
      tabId
    );

    return (
      url.pathname
      + url.search
      + url.hash
    );
  }

  function shouldUseNativeLink(event) {
    return (
      event.button !== 0
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || event.altKey
    );
  }

  tabs.forEach(tab => {
    const item =
      document.createElement(
        'div'
      );

    item.className =
      'tab-item';

    const link =
      document.createElement(
        'a'
      );

    link.className =
      tab.id === activeTab
        ? 'tab active'
        : 'tab';

    link.href =
      tabHref(
        tab.id
      );

    link.textContent =
      tab.label;

    link.addEventListener(
      'click',
      event => {
        if (
          shouldUseNativeLink(
            event
          )
        ) {
          return;
        }

        event.preventDefault();

        onChange(
          tab.id
        );
      }
    );

    item.appendChild(
      link
    );

    const submenu =
      SUBTABS[
        tab.id
      ];

    if (
      submenu?.items?.length
    ) {
      const subnav =
        document.createElement(
          'div'
        );

      subnav.className =
        'tab-submenu';

      const syncSubmenu =
        () => {
          const activeSubtab =
            sessionStorage.getItem(
              submenu.storageKey
            )
            || submenu.items[0].id;

          subnav
            .querySelectorAll(
              '.tab-submenu-button'
            )
            .forEach(
              subButton => {
                subButton
                  .classList
                  .toggle(
                    'active',
                    subButton.dataset.subtab
                      === activeSubtab
                  );
              }
            );
        };

      item.addEventListener(
        'pointerenter',
        () => {
          syncSubmenu();

          nav.classList.add(
            'tabs-submenu-open'
          );
        }
      );

      item.addEventListener(
        'pointerleave',
        () =>
          nav.classList.remove(
            'tabs-submenu-open'
          )
      );

      item.addEventListener(
        'focusin',
        () => {
          syncSubmenu();

          nav.classList.add(
            'tabs-submenu-open'
          );
        }
      );

      item.addEventListener(
        'focusout',
        event => {
          if (
            !item.contains(
              event.relatedTarget
            )
          ) {
            nav.classList.remove(
              'tabs-submenu-open'
            );
          }
        }
      );

      submenu.items.forEach(
        subtab => {
          const subButton =
            document.createElement(
              'button'
            );

          subButton.className =
            'tab-submenu-button';

          subButton.dataset.subtab =
            subtab.id;

          subButton.type =
            'button';

          subButton.textContent =
            subtab.label;

          subButton.addEventListener(
            'click',
            event => {
              event.stopPropagation();

              sessionStorage.setItem(
                submenu.storageKey,
                subtab.id
              );

              syncSubmenu();

              onChange(
                tab.id
              );
            }
          );

          subnav.appendChild(
            subButton
          );
        }
      );

      syncSubmenu();

      item.appendChild(
        subnav
      );
    }

    nav.appendChild(
      item
    );
  });

  return nav;
}
