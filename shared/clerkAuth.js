import { apiUrl } from './config.js';

let clerkPromise;
let configPromise;
const SESSION_TOKEN_ATTEMPTS = 10;
const SESSION_TOKEN_RETRY_MS = 150;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadAuthConfig() {
  if (!configPromise) {
    configPromise = fetch(apiUrl('/auth/config'))
      .then(response => {
        if (!response.ok) throw new Error('Falha ao carregar configuracao do Clerk.');
        return response.json();
      });
  }
  return configPromise;
}

function injectClerkScript(publishableKey) {
  const existing = document.querySelector('script[data-clerk-script="true"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.Clerk) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkScript = 'true';
    script.dataset.clerkPublishableKey = publishableKey;
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('Nao foi possivel carregar o Clerk.')), { once: true });
    document.head.appendChild(script);
  });
}

export async function getClerk() {
  if (!clerkPromise) {
    clerkPromise = (async () => {
      const config = await loadAuthConfig();
      if (!config.publishableKey) {
        throw new Error('CLERK_PUBLISHABLE_KEY nao configurada.');
      }
      await injectClerkScript(config.publishableKey);
      const ClerkApi = window.Clerk;
      const clerk = typeof ClerkApi === 'function' ? new ClerkApi(config.publishableKey) : ClerkApi;
      await clerk.load({ publishableKey: config.publishableKey });
      return clerk;
    })();
  }
  return clerkPromise;
}

export async function getSessionToken(options = {}) {
  const clerk = await getClerk();
  const attempts = options.wait ? SESSION_TOKEN_ATTEMPTS : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = clerk.session ? await clerk.session.getToken() : null;
    if (token) return token;
    if (attempt < attempts - 1) await delay(SESSION_TOKEN_RETRY_MS);
  }

  return null;
}

export async function isSignedIn() {
  return Boolean(await getSessionToken());
}

export async function signInWithPassword(identifier, password) {
  const clerk = await getClerk();
  const signIn = await clerk.client.signIn.create({ identifier, password });

  if (signIn.status !== 'complete') {
    throw new Error('Nao foi possivel concluir o login. Verifique as configuracoes da conta.');
  }

  await clerk.setActive({ session: signIn.createdSessionId });
  const token = await getSessionToken({ wait: true });
  if (!token) {
    throw new Error('Sessao Clerk criada, mas o token ainda nao esta disponivel.');
  }
  return signIn;
}

export async function requestPasswordReset(identifier) {
  const clerk = await getClerk();
  return clerk.client.signIn.create({
    strategy: 'reset_password_email_code',
    identifier
  });
}

export async function signOut() {
  const clerk = await getClerk();
  await clerk.signOut();
}
