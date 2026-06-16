import { getSessionToken } from './clerkAuth.js';

let currentUser = null;

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = await getSessionToken({ wait: true });

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('planejamento:navigate'));
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
  const payload = await api('/auth/me');
  currentUser = payload.user;
  window.PlanejamentoCurrentUser = currentUser;
  return payload;
}

export function getCurrentUser() {
  return currentUser || window.PlanejamentoCurrentUser || null;
}
