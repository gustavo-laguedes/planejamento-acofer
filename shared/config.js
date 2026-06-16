function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export function apiBasePath() {
  if (isLocalhost()) return '/api';

  const configuredBaseUrl = stripTrailingSlash(window.APP_CONFIG?.API_BASE_URL);
  return configuredBaseUrl ? `${configuredBaseUrl}/api` : '/api';
}

export function apiUrl(path) {
  return `${apiBasePath()}${path}`;
}
