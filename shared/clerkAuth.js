import { apiUrl } from './config.js';

let clerkPromise;
let configPromise;
const AUTH_DEBUG_PREFIX = '[auth]';
const CLERK_LOAD_TIMEOUT_MS = 8000;
const SIGN_IN_TIMEOUT_MS = 12000;
const SET_ACTIVE_TIMEOUT_MS = 5000;
const SESSION_TOKEN_WAIT_MS = 5000;
const SESSION_TOKEN_CHECK_MS = 2500;
const SESSION_TOKEN_RETRY_MS = 300;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function authLog(message, details) {
  if (details === undefined) {
    console.info(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.info(`${AUTH_DEBUG_PREFIX} ${message}`, details);
}

function inviteLog(message, details) {
  if (details === undefined) {
    console.info(`[invite] ${message}`);
    return;
  }
  console.info(`[invite] ${message}`, details);
}

function inviteError(message, details) {
  console.error(`[invite] ${message}`, details);
}

function friendlyAuthError(error, fallback) {
  return error?.errors?.[0]?.longMessage
    || error?.errors?.[0]?.message
    || error?.message
    || fallback;
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function loadAuthConfig() {
  if (!configPromise) {
    authLog('carregando configuracao');
    configPromise = withTimeout(fetch(apiUrl('/auth/config')), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao carregar configuracao de autenticacao.')
      .then(response => {
        if (!response.ok) throw new Error('Falha ao carregar configuracao do Clerk.');
        return response.json();
      })
      .catch(error => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

function injectClerkScript(publishableKey) {
  const existing = document.querySelector('script[data-clerk-script="true"]');
  if (existing) {
    return withTimeout(new Promise((resolve, reject) => {
      if (window.Clerk) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    }), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao carregar o Clerk.');
  }

  authLog('injetando script do Clerk');
  return withTimeout(new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkScript = 'true';
    script.dataset.clerkPublishableKey = publishableKey;
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('Nao foi possivel carregar o Clerk.')), { once: true });
    document.head.appendChild(script);
  }), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao carregar o Clerk.');
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
      authLog('inicializando Clerk');
      await withTimeout(
        clerk.load({ publishableKey: config.publishableKey }),
        CLERK_LOAD_TIMEOUT_MS,
        'Tempo esgotado ao inicializar o Clerk.'
      );
      return clerk;
    })().catch(error => {
      clerkPromise = null;
      throw error;
    });
  }
  return clerkPromise;
}

export async function getSessionToken(options = {}) {
  const clerk = await getClerk();
  const timeoutMs = options.timeoutMs ?? (options.wait ? SESSION_TOKEN_WAIT_MS : SESSION_TOKEN_CHECK_MS);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
      const token = clerk.session
        ? await withTimeout(
          clerk.session.getToken(),
          Math.min(SESSION_TOKEN_CHECK_MS, remaining),
          'Tempo esgotado ao obter token da sessao.'
        )
        : null;
      if (token) return token;
    } catch (error) {
      authLog('falha ao obter token', friendlyAuthError(error, 'Erro desconhecido.'));
      if (!options.wait) return null;
    }

    if (!options.wait) return null;
    await delay(SESSION_TOKEN_RETRY_MS);
  }

  authLog('token indisponivel apos espera');
  return null;
}

export async function isSignedIn() {
  return Boolean(await getSessionToken());
}

export async function signInWithPassword(identifier, password) {
  const clerk = await getClerk();
  authLog('iniciando login');
  let signIn;

  try {
    signIn = await withTimeout(
      clerk.client.signIn.create({ identifier, password }),
      SIGN_IN_TIMEOUT_MS,
      'Tempo esgotado ao tentar entrar. Tente novamente.'
    );
  } catch (error) {
    throw new Error(friendlyAuthError(error, 'Nao foi possivel entrar. Verifique usuario e senha.'));
  }

  if (signIn.status !== 'complete') {
    throw new Error('Nao foi possivel concluir o login. Verifique as configuracoes da conta.');
  }

  authLog('ativando sessao Clerk');
  await withTimeout(
    clerk.setActive({ session: signIn.createdSessionId }),
    SET_ACTIVE_TIMEOUT_MS,
    'Tempo esgotado ao ativar a sessao.'
  );
  const token = await getSessionToken({ wait: true });
  if (!token) {
    throw new Error('Sessao criada, mas nao foi possivel obter o token. Tente entrar novamente.');
  }
  authLog('login com token disponivel');
  return signIn;
}

function normalizeSignUpResult(result, fallback) {
  return result?.signUp || result?.createdSignUp || result?.resource || result || fallback || null;
}

function signUpSnapshot(signUp) {
  return {
    status: signUp?.status || null,
    createdSessionId: Boolean(signUp?.createdSessionId || signUp?.created_session_id),
    missingFields: signUp?.missingFields || signUp?.missing_fields || [],
    requiredFields: signUp?.requiredFields || signUp?.required_fields || [],
    unverifiedFields: signUp?.unverifiedFields || signUp?.unverified_fields || []
  };
}

async function runSignUpStep(label, action, fallback) {
  const result = await withTimeout(
    action(),
    SIGN_IN_TIMEOUT_MS,
    `Tempo esgotado ao ${label}.`
  );
  if (result?.error) throw result.error;
  const signUp = normalizeSignUpResult(result, fallback);
  inviteLog(label, signUpSnapshot(signUp));
  return signUp;
}

export async function acceptInvitationWithPassword(ticket, password) {
  const clerk = await getClerk();
  const signUpApi = clerk.client?.signUp || clerk.signUp;
  if (!signUpApi) {
    throw new Error('Fluxo de cadastro do Clerk indisponivel.');
  }

  inviteLog('ticket presente', { present: Boolean(ticket) });
  let signUp;
  try {
    if (typeof signUpApi.ticket === 'function') {
      signUp = await runSignUpStep(
        'ticket aceito via signUp.ticket',
        () => signUpApi.ticket({ ticket }),
        signUpApi
      );
    } else if (typeof signUpApi.create === 'function') {
      signUp = await runSignUpStep(
        'ticket aceito via signUp.create',
        () => signUpApi.create({ strategy: 'ticket', ticket }),
        signUpApi
      );
    } else {
      throw new Error('Fluxo de convite do Clerk indisponivel.');
    }

    const update = typeof signUp?.update === 'function'
      ? params => signUp.update(params)
      : typeof signUpApi.update === 'function'
        ? params => signUpApi.update(params)
        : null;

    if (signUp?.status !== 'complete' && update) {
      signUp = await runSignUpStep(
        'senha definida',
        () => update({ password }),
        signUp
      );
    }
  } catch (error) {
    inviteError('erro bruto do Clerk ao aceitar convite', error);
    throw new Error(friendlyAuthError(error, 'Nao foi possivel aceitar o convite. Verifique o link recebido.'));
  }

  const sessionId = signUp?.createdSessionId || signUp?.created_session_id;
  inviteLog('status final antes de ativar sessao', signUpSnapshot(signUp));
  if (signUp?.status !== 'complete' || !sessionId) {
    inviteError('cadastro nao concluido pelo Clerk', signUpSnapshot(signUp));
    throw new Error('Nao foi possivel concluir o convite no Clerk. Verifique se a senha atende aos requisitos e tente novamente.');
  }

  inviteLog('ativando sessao', { createdSessionId: Boolean(sessionId) });
  await withTimeout(
    clerk.setActive({ session: sessionId }),
    SET_ACTIVE_TIMEOUT_MS,
    'Tempo esgotado ao ativar a sessao.'
  );

  const token = await getSessionToken({ wait: true });
  if (!token) {
    throw new Error('Senha criada, mas nao foi possivel obter a sessao. Tente entrar novamente.');
  }
  return signUp;
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
  await withTimeout(clerk.signOut(), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao sair.');
}
