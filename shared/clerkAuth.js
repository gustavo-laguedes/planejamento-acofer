import { apiUrl } from './config.js';

let clerkPromise;
let configPromise;
let pendingEmailCodeSignIn = null;

const AUTH_DEBUG_PREFIX = '[auth]';
const CLERK_LOAD_TIMEOUT_MS = 8000;
const SIGN_IN_TIMEOUT_MS = 12000;
const SET_ACTIVE_TIMEOUT_MS = 5000;
const SESSION_TOKEN_WAIT_MS = 5000;
const SESSION_TOKEN_CHECK_MS = 2500;
const SESSION_TOKEN_RETRY_MS = 300;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function authLog(message, details) { console.info(`${AUTH_DEBUG_PREFIX} ${message}`, details ?? ''); }
function inviteLog(message, details) { console.info(`[invite] ${message}`, details ?? ''); }
function inviteError(message, details) { console.error(`[invite] ${message}`, details); }
function friendlyAuthError(error, fallback) { return error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error?.message || fallback; }
function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function loadAuthConfig() {
  if (!configPromise) {
    configPromise = withTimeout(fetch(apiUrl('/auth/config')), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao carregar configuracao de autenticacao.')
      .then(response => { if (!response.ok) throw new Error('Falha ao carregar configuracao do Clerk.'); return response.json(); })
      .catch(error => { configPromise = null; throw error; });
  }
  return configPromise;
}
function injectClerkScript(publishableKey) {
  const existing = document.querySelector('script[data-clerk-script="true"]');
  if (existing) return withTimeout(new Promise((resolve, reject) => {
    if (window.Clerk) return resolve();
    existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true });
  }), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao carregar o Clerk.');
  return withTimeout(new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true; script.crossOrigin = 'anonymous'; script.dataset.clerkScript = 'true'; script.dataset.clerkPublishableKey = publishableKey;
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.addEventListener('load', resolve, { once: true }); script.addEventListener('error', () => reject(new Error('Nao foi possivel carregar o Clerk.')), { once: true });
    document.head.appendChild(script);
  }), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao carregar o Clerk.');
}

export async function getClerk() {
  if (!clerkPromise) {
    clerkPromise = (async () => {
      const config = await loadAuthConfig();
      if (!config.publishableKey) throw new Error('CLERK_PUBLISHABLE_KEY nao configurada.');
      await injectClerkScript(config.publishableKey);
      const ClerkApi = window.Clerk;
      const clerk = typeof ClerkApi === 'function' ? new ClerkApi(config.publishableKey) : ClerkApi;
      await withTimeout(clerk.load({ publishableKey: config.publishableKey }), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao inicializar o Clerk.');
      return clerk;
    })().catch(error => { clerkPromise = null; throw error; });
  }
  return clerkPromise;
}
export async function getSessionToken(options = {}) {
  const clerk = await getClerk(); const timeoutMs = options.timeoutMs ?? (options.wait ? SESSION_TOKEN_WAIT_MS : SESSION_TOKEN_CHECK_MS); const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try { const token = clerk.session ? await withTimeout(clerk.session.getToken(), Math.min(SESSION_TOKEN_CHECK_MS, timeoutMs - (Date.now() - startedAt)), 'Tempo esgotado ao obter token da sessao.') : null; if (token) return token; } catch (error) { if (!options.wait) return null; }
    if (!options.wait) return null; await delay(SESSION_TOKEN_RETRY_MS);
  }
  return null;
}
export async function isSignedIn() { return Boolean(await getSessionToken()); }
function normalizeSignInResult(result, fallback) { return result?.signIn || result?.createdSignIn || result?.resource || result || fallback || null; }
async function activateCompletedSignIn(clerk, signIn) {
  const sessionId = signIn?.createdSessionId || signIn?.created_session_id;
  if (!sessionId) throw new Error('Login concluido, mas o Clerk nao retornou uma sessao. Tente novamente.');
  await withTimeout(clerk.setActive({ session: sessionId }), SET_ACTIVE_TIMEOUT_MS, 'Tempo esgotado ao ativar a sessao.');
  if (!await getSessionToken({ wait: true })) throw new Error('Sessao criada, mas nao foi possivel obter o token. Tente entrar novamente.');
  pendingEmailCodeSignIn = null; authLog('login com token disponivel'); return signIn;
}
function emailCodeSecondFactor(signIn) { return (signIn?.supportedSecondFactors || signIn?.supported_second_factors || []).find(factor => factor?.strategy === 'email_code') || null; }
async function prepareEmailCodeSecondFactor(clerk, signIn, factor) {
  if (typeof signIn?.mfa?.sendEmailCode === 'function') { const result = await signIn.mfa.sendEmailCode(); if (result?.error) throw result.error; return result; }
  const prepare = typeof signIn?.prepareSecondFactor === 'function' ? params => signIn.prepareSecondFactor(params) : typeof clerk.client?.signIn?.prepareSecondFactor === 'function' ? params => clerk.client.signIn.prepareSecondFactor(params) : null;
  if (!prepare) throw new Error('O Clerk solicitou verificacao por e-mail, mas o metodo de envio do codigo nao esta disponivel.');
  const emailAddressId = factor?.emailAddressId || factor?.email_address_id;
  if (!emailAddressId) throw new Error('O Clerk solicitou verificacao por e-mail, mas nao informou o endereco de destino.');
  const result = await prepare({ strategy: 'email_code', emailAddressId }); if (result?.error) throw result.error; return result;
}
export async function signInWithPassword(identifier, password) {
  const clerk = await getClerk(); let signIn;
  try { signIn = await withTimeout(clerk.client.signIn.create({ identifier, password }), SIGN_IN_TIMEOUT_MS, 'Tempo esgotado ao tentar entrar. Tente novamente.'); } catch (error) { throw new Error(friendlyAuthError(error, 'Nao foi possivel entrar. Verifique usuario e senha.')); }
  signIn = normalizeSignInResult(signIn, clerk.client?.signIn);
  if (signIn?.status === 'complete') { await activateCompletedSignIn(clerk, signIn); return { status: 'complete' }; }
  if (signIn?.status === 'needs_client_trust' || signIn?.status === 'needs_second_factor') {
    const factor = emailCodeSecondFactor(signIn);
    if (!factor) throw new Error('Esta conta exige uma verificacao adicional, mas nao ha verificacao por e-mail disponivel para ela.');
    try { await withTimeout(prepareEmailCodeSecondFactor(clerk, signIn, factor), SIGN_IN_TIMEOUT_MS, 'Tempo esgotado ao enviar o codigo de verificacao.'); } catch (error) { throw new Error(friendlyAuthError(error, 'Nao foi possivel enviar o codigo de verificacao.')); }
    pendingEmailCodeSignIn = signIn; return { status: 'needs_email_code' };
  }
  throw new Error(`Nao foi possivel concluir o login. Status do Clerk: ${signIn?.status || 'desconhecido'}.`);
}
export async function verifySignInEmailCode(code) {
  const clerk = await getClerk(); const normalizedCode = String(code || '').trim();
  if (!normalizedCode) throw new Error('Informe o codigo de verificacao recebido por e-mail.');
  const signIn = pendingEmailCodeSignIn || clerk.client?.signIn;
  if (!signIn) throw new Error('Nao existe uma tentativa de login aguardando verificacao. Volte e entre novamente.');
  let result;
  try {
    if (typeof signIn?.mfa?.verifyEmailCode === 'function') result = await withTimeout(signIn.mfa.verifyEmailCode({ code: normalizedCode }), SIGN_IN_TIMEOUT_MS, 'Tempo esgotado ao validar o codigo de verificacao.');
    else { const attempt = typeof signIn?.attemptSecondFactor === 'function' ? params => signIn.attemptSecondFactor(params) : typeof clerk.client?.signIn?.attemptSecondFactor === 'function' ? params => clerk.client.signIn.attemptSecondFactor(params) : null; if (!attempt) throw new Error('O metodo de validacao do codigo do Clerk nao esta disponivel.'); result = await withTimeout(attempt({ strategy: 'email_code', code: normalizedCode }), SIGN_IN_TIMEOUT_MS, 'Tempo esgotado ao validar o codigo de verificacao.'); }
    if (result?.error) throw result.error;
  } catch (error) { throw new Error(friendlyAuthError(error, 'Codigo de verificacao invalido ou expirado.')); }
  const completedSignIn = normalizeSignInResult(result, signIn);
  if (completedSignIn?.status !== 'complete') throw new Error(`A verificacao ainda nao foi concluida. Status do Clerk: ${completedSignIn?.status || 'desconhecido'}.`);
  return activateCompletedSignIn(clerk, completedSignIn);
}
function normalizeSignUpResult(result, fallback) { return result?.signUp || result?.createdSignUp || result?.resource || result || fallback || null; }
export async function acceptInvitationWithPassword(ticket, password) {
  const clerk = await getClerk(); const signUpApi = clerk.client?.signUp || clerk.signUp;
  if (!signUpApi) throw new Error('Fluxo de cadastro do Clerk indisponivel.');
  let signUp;
  try {
    signUp = normalizeSignUpResult(await withTimeout(typeof signUpApi.ticket === 'function' ? signUpApi.ticket({ ticket }) : signUpApi.create({ strategy: 'ticket', ticket }), SIGN_IN_TIMEOUT_MS, 'Tempo esgotado ao aceitar convite.'), signUpApi);
    const update = typeof signUp?.update === 'function' ? params => signUp.update(params) : typeof signUpApi.update === 'function' ? params => signUpApi.update(params) : null;
    if (signUp?.status !== 'complete' && update) signUp = normalizeSignUpResult(await withTimeout(update({ password }), SIGN_IN_TIMEOUT_MS, 'Tempo esgotado ao definir senha.'), signUp);
  } catch (error) { inviteError('erro bruto do Clerk ao aceitar convite', error); throw new Error(friendlyAuthError(error, 'Nao foi possivel aceitar o convite. Verifique o link recebido.')); }
  const sessionId = signUp?.createdSessionId || signUp?.created_session_id;
  if (signUp?.status !== 'complete' || !sessionId) throw new Error('Nao foi possivel concluir o convite no Clerk. Verifique se a senha atende aos requisitos e tente novamente.');
  await withTimeout(clerk.setActive({ session: sessionId }), SET_ACTIVE_TIMEOUT_MS, 'Tempo esgotado ao ativar a sessao.');
  if (!await getSessionToken({ wait: true })) throw new Error('Senha criada, mas nao foi possivel obter a sessao. Tente entrar novamente.');
  inviteLog('convite concluido'); return signUp;
}
export async function requestPasswordReset(identifier) { const clerk = await getClerk(); return clerk.client.signIn.create({ strategy: 'reset_password_email_code', identifier }); }
export async function signOut() { const clerk = await getClerk(); pendingEmailCodeSignIn = null; await withTimeout(clerk.signOut(), CLERK_LOAD_TIMEOUT_MS, 'Tempo esgotado ao sair.'); }
