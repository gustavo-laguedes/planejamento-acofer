import { getSessionToken } from './clerkAuth.js';
import { apiUrl } from './config.js';
import { getBrowserSessionId, rememberSessionToken } from './browserSession.js';

let currentUser = null;

export async function api(path, options = {}) {
  const {
    authWait = true,
    redirectOnAuthError = true,
    ...fetchOptions
  } = options;
  const headers = new Headers(fetchOptions.headers || {});
  const token = await getSessionToken({ wait: authWait });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    rememberSessionToken(token);
  }
  headers.set('X-App-Session-Id', getBrowserSessionId());
  if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    ...fetchOptions,
    headers,
    body: fetchOptions.body instanceof FormData ? fetchOptions.body : fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined
  });

  if (!response.ok) {
    if (response.status === 401) {
      currentUser = null;
      window.PlanejamentoCurrentUser = null;
      if (redirectOnAuthError) window.dispatchEvent(new CustomEvent('planejamento:navigate'));
      throw new Error('Sess\u00e3o expirada. Fa\u00e7a login novamente.');
    }
    const payload = await response.json().catch(() => ({ error: 'Falha na requisição.' }));
    throw new Error(payload.error || 'Falha na requisição.');
  }

  if (response.headers.get('content-type')?.includes('application/pdf')) {
    return response.blob();
  }

  return response.status === 204 ? null : response.json();
}

export async function me() {
  const payload = await api('/auth/me', { redirectOnAuthError: false });
  currentUser = payload.user;
  window.PlanejamentoCurrentUser = currentUser;
  return payload;
}

export function getCurrentUser() {
  return currentUser || window.PlanejamentoCurrentUser || null;
}
