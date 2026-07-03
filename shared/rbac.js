export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  DIRETOR: 'Diretor',
  GERENTE: 'Gerente',
  PCP: 'PCP',
  OPERADOR: 'Operador',
  COMERCIAL: 'Comercial',
  VISUALIZADOR: 'Visualizador'
};

export const TAB_PERMISSIONS = {
  planning: 'planning:read',
  analysis: 'planning:read',
  commercialCalendar: 'commercial:calendar',
  tracking: 'productivity:read',
  stock: 'stock:read',
  production: 'launches:read',
  history: 'launches:read',
  dashboardReports: 'productivity:read',
  registrations: 'registrations:read',
  productivity: 'matrix:read',
  audit: 'log:read'
};

export const DEFAULT_TAB_BY_ROLE = {
  [ROLES.OPERADOR]: 'production',
  [ROLES.COMERCIAL]: 'commercialCalendar',
  [ROLES.VISUALIZADOR]: 'dashboardReports'
};

const OPERATIONAL_TABS = [
  'planning',
  'analysis',
  'commercialCalendar',
  'tracking',
  'dashboardReports',
  'stock',
  'production',
  'history',
  'registrations',
  'productivity'
];

export const ROLE_TABS = {
  [ROLES.SUPER_ADMIN]: [
    ...OPERATIONAL_TABS,
    'audit'
  ],
  [ROLES.DIRETOR]: [
    ...OPERATIONAL_TABS,
    'audit'
  ],
  [ROLES.GERENTE]: OPERATIONAL_TABS,
  [ROLES.PCP]: OPERATIONAL_TABS,
  [ROLES.COMERCIAL]: ['commercialCalendar'],
  [ROLES.OPERADOR]: ['production'],
  [ROLES.VISUALIZADOR]: ['dashboardReports']
};

const OPERATIONAL_PERMISSIONS = [
  'planning:read',
  'planning:write',
  'stock:read',
  'stock:write',
  'registrations:read',
  'registrations:write',
  'matrix:read',
  'matrix:write',
  'launches:read',
  'launches:write',
  'imports:write',
  'inventory:read',
  'inventory:write',
  'productivity:read',
  'commercial:calendar'
];

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: [
    ...OPERATIONAL_PERMISSIONS,
    'users:manage',
    'log:read'
  ],
  [ROLES.PCP]: OPERATIONAL_PERMISSIONS,
  [ROLES.GERENTE]: OPERATIONAL_PERMISSIONS,
  [ROLES.DIRETOR]: [
    ...OPERATIONAL_PERMISSIONS,
    'users:manage',
    'log:read'
  ],
  [ROLES.OPERADOR]: [
    'launches:read',
    'launches:write'
  ],
  [ROLES.COMERCIAL]: [
    'planning:read',
    'registrations:read',
    'commercial:calendar'
  ],
  [ROLES.VISUALIZADOR]: [
    'planning:read',
    'stock:read',
    'registrations:read',
    'matrix:read',
    'launches:read',
    'productivity:read'
  ]
};

export function normalizeRole(role) {
  return String(role || '').trim();
}

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

export function canAccess(user, permission) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : permissionsForRole(user?.role);
  return permissions.includes(permission);
}

export function canAccessTab(user, tabId) {
  return (ROLE_TABS[normalizeRole(user?.role)] || []).includes(tabId);
}

export function visibleTabsForUser(user, tabs) {
  return tabs.filter(tab => canAccessTab(user, tab.id));
}

export function defaultTabForUser(user, tabs) {
  const visibleTabs = visibleTabsForUser(user, tabs);
  const preferred = DEFAULT_TAB_BY_ROLE[normalizeRole(user?.role)];
  return visibleTabs.find(tab => tab.id === preferred)?.id || visibleTabs[0]?.id || null;
}

export function hasRestrictedNavigation(user) {
  return [ROLES.COMERCIAL, ROLES.OPERADOR, ROLES.VISUALIZADOR].includes(normalizeRole(user?.role));
}

export function isReadOnlyUser(user) {
  return normalizeRole(user?.role) === ROLES.VISUALIZADOR;
}
