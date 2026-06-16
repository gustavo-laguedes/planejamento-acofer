export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  PCP: 'PCP',
  GERENTE: 'Gerente',
  DIRETOR: 'Diretor',
  OPERADOR: 'Operador',
  VISUALIZADOR: 'Visualizador'
};

export const TAB_PERMISSIONS = {
  planning: 'planning:read',
  tracking: 'productivity:read',
  stock: 'stock:read',
  history: 'launches:read',
  registrations: 'registrations:read',
  productivity: 'matrix:read',
  audit: 'log:read'
};

export const DEFAULT_TAB_BY_ROLE = {
  [ROLES.OPERADOR]: 'history'
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
  'productivity:read'
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
    'log:read'
  ],
  [ROLES.OPERADOR]: [
    'launches:read',
    'launches:write'
  ],
  [ROLES.VISUALIZADOR]: [
    'planning:read',
    'stock:read',
    'registrations:read',
    'matrix:read',
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
  return canAccess(user, TAB_PERMISSIONS[tabId]);
}

export function visibleTabsForUser(user, tabs) {
  return tabs.filter(tab => canAccessTab(user, tab.id));
}

export function defaultTabForUser(user, tabs) {
  const visibleTabs = visibleTabsForUser(user, tabs);
  const preferred = DEFAULT_TAB_BY_ROLE[normalizeRole(user?.role)];
  return visibleTabs.find(tab => tab.id === preferred)?.id || visibleTabs[0]?.id || null;
}

export function isReadOnlyUser(user) {
  return normalizeRole(user?.role) === ROLES.VISUALIZADOR;
}
