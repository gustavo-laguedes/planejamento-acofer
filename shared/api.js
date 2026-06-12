const TOKEN_KEY = 'planejamento_acofer_session';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();

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
    if (response.status === 401 && path !== '/auth/login') {
      clearToken();
      window.dispatchEvent(new CustomEvent('planejamento:navigate'));
      throw new Error('Sess\u00e3o expirada. Fa\u00e7a login novamente.');
    }
    const payload = await response.json().catch(() => ({ error: 'Falha na requisicao.' }));
    throw new Error(payload.error || 'Falha na requisicao.');
  }

  if (response.headers.get('content-type')?.includes('application/pdf')) {
    return response.blob();
  }

  return response.status === 204 ? null : response.json();
}

export async function login(password) {
  const payload = await api('/auth/login', { method: 'POST', body: { password } });
  setToken(payload.token);
  return payload;
}
