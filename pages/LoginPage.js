import { acceptInvitationWithPassword, requestPasswordReset, signInWithPassword, verifySignInEmailCode } from '../shared/clerkAuth.js';
import { api, me } from '../shared/api.js';

export function LoginPage(initialError = '') {
  const invitationTicket = new URLSearchParams(window.location.search).get('__clerk_ticket') || '';
  const page = document.createElement('main');
  page.className = 'login-page';
  page.innerHTML = `
    <div class="login-shell"><div class="login-panel">
      <section class="login-panel-brand" aria-label="Marcas do sistema"><div class="login-panel-brand-row"><img class="login-panel-brand-line" src="/assets/logo-line-black-full.png" alt="LINE" /><img class="login-panel-brand-acofer" src="/assets/logo-acofer.png" alt="Aço-Fer" /></div></section>
      <form class="login-form-panel ${invitationTicket ? 'invitation-form' : ''}">
        <div class="login-heading"><h1>${invitationTicket ? 'Criar senha' : 'Acesso ao sistema'}</h1><span>LINE • AÇO-FER</span></div>
        ${invitationTicket ? `
          <label>Nova senha<input type="password" name="password" autocomplete="new-password" minlength="8" required autofocus /></label>
          <label>Confirmar senha<input type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required /></label>
          <div id="clerk-captcha"></div><button class="primary-button full" type="submit">Criar senha</button>
        ` : `
          <div data-login-credentials>
            <label>Usu&aacute;rio ou E-mail<input type="text" name="identifier" autocomplete="username" required autofocus /></label>
            <label>Senha<input type="password" name="password" autocomplete="current-password" required /></label>
            <button class="primary-button full" type="submit">Entrar</button>
            <button class="link-button login-reset-link" type="button" data-action="password-reset">Esqueci minha senha</button>
          </div>
          <div data-login-verification hidden>
            <p>Enviamos um c&oacute;digo de verifica&ccedil;&atilde;o para o e-mail cadastrado.</p>
            <label>C&oacute;digo de verifica&ccedil;&atilde;o<input type="text" name="verificationCode" inputmode="numeric" autocomplete="one-time-code" /></label>
            <button class="primary-button full" type="submit">Validar c&oacute;digo</button>
            <button class="link-button login-reset-link" type="button" data-action="back-to-login">Voltar</button>
          </div>
        `}
        <p class="form-success" hidden></p><p class="form-error" ${initialError ? '' : 'hidden'}>${initialError}</p>
      </form>
      <div class="login-panel-footer"><span>Powered by Catrion</span><img src="/assets/logo-catrion.png" alt="Catrion" loading="lazy" /></div>
    </div></div>`;

  let awaitingEmailCode = false;
  function showEmailCodeStep() {
    const credentials = page.querySelector('[data-login-credentials]'); const verification = page.querySelector('[data-login-verification]'); const codeInput = page.querySelector('[name="verificationCode"]');
    awaitingEmailCode = true; credentials.hidden = true; verification.hidden = false; codeInput.required = true; codeInput.focus();
  }
  function showPasswordStep() {
    const credentials = page.querySelector('[data-login-credentials]'); const verification = page.querySelector('[data-login-verification]'); const codeInput = page.querySelector('[name="verificationCode"]');
    awaitingEmailCode = false; verification.hidden = true; credentials.hidden = false; codeInput.required = false; codeInput.value = ''; page.querySelector('[name="password"]')?.focus();
  }
  async function finishLogin() {
    await api('/auth/session/activate', { method: 'POST', redirectOnAuthError: false }); await me();
    sessionStorage.removeItem('planejamento_active_tab'); sessionStorage.setItem('planejamento_active_tab', 'dashboardReports');
    const loginUrl = new URL(window.location.href); loginUrl.searchParams.set('tab', 'dashboardReports'); window.history.replaceState(null, '', loginUrl.pathname + loginUrl.search + loginUrl.hash);
    await api('/auth/events/login', { method: 'POST' }).catch(() => {}); window.dispatchEvent(new CustomEvent('planejamento:navigate'));
  }
  page.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const error = page.querySelector('.form-error'); const submit = event.submitter || page.querySelector('button[type="submit"]'); const form = new FormData(event.currentTarget);
    error.hidden = true; submit.disabled = true; submit.textContent = invitationTicket ? 'Criando senha...' : awaitingEmailCode ? 'Validando...' : 'Entrando...';
    try {
      if (invitationTicket) {
        const password = String(form.get('password') || ''); const confirmPassword = String(form.get('confirmPassword') || '');
        if (password !== confirmPassword) throw new Error('As senhas informadas nao conferem.');
        await acceptInvitationWithPassword(invitationTicket, password); window.history.replaceState({}, document.title, window.location.pathname); await finishLogin(); return;
      }
      if (awaitingEmailCode) { await verifySignInEmailCode(String(form.get('verificationCode') || '').trim()); await finishLogin(); return; }
      const result = await signInWithPassword(String(form.get('identifier') || '').trim(), String(form.get('password') || ''));
      if (result?.status === 'needs_email_code') { showEmailCodeStep(); return; }
      await finishLogin();
    } catch (err) { error.textContent = err.message || 'Nao foi possivel entrar. Tente novamente.'; error.hidden = false; } finally {
      submit.disabled = false;
      if (submit.isConnected) submit.textContent = invitationTicket ? 'Criar senha' : awaitingEmailCode ? 'Validar código' : 'Entrar';
    }
  });
  page.querySelector('[data-action="back-to-login"]')?.addEventListener('click', () => { page.querySelector('.form-error').hidden = true; page.querySelector('.form-success').hidden = true; showPasswordStep(); });
  page.querySelector('[data-action="password-reset"]')?.addEventListener('click', async () => {
    const error = page.querySelector('.form-error'); const success = page.querySelector('.form-success'); const identifierInput = page.querySelector('[name="identifier"]'); const resetButton = page.querySelector('[data-action="password-reset"]'); const identifier = String(identifierInput.value || '').trim();
    error.hidden = true; success.hidden = true;
    if (!identifier) { error.textContent = 'Informe seu usuario ou e-mail para recuperar a senha.'; error.hidden = false; identifierInput.focus(); return; }
    resetButton.disabled = true;
    try { await requestPasswordReset(identifier); success.textContent = 'Se a conta existir no Clerk, o e-mail de recuperacao sera enviado.'; success.hidden = false; } catch (err) { error.textContent = err.message; error.hidden = false; } finally { resetButton.disabled = false; }
  });
  return page;
}
