import { acceptInvitationWithPassword, requestPasswordReset, signInWithPassword } from '../shared/clerkAuth.js';
import { api, me } from '../shared/api.js';

export function LoginPage(initialError = '') {
  const invitationTicket = new URLSearchParams(window.location.search).get('__clerk_ticket') || '';
  const page = document.createElement('main');
  page.className = 'login-page';
  page.innerHTML = `
    <div class="login-shell">
      <div class="login-panel">
        <section class="login-panel-brand" aria-label="Marcas do sistema">
          <div class="login-panel-brand-row">
<img class="login-panel-brand-line" src="/assets/logo-line-black-full.png" alt="LINE" />
            <img class="login-panel-brand-acofer" src="/assets/logo-acofer.png" alt="Aço-Fer" />
          </div>
        </section>

        <form class="login-form-panel ${invitationTicket ? 'invitation-form' : ''}">
        <div class="login-heading">
          <h1>${invitationTicket ? 'Criar senha' : 'Acesso ao sistema'}</h1>
          <span>LINE • AÇO-FER</span>
        </div>
        ${invitationTicket ? `
          <label>
            Nova senha
            <input type="password" name="password" autocomplete="new-password" minlength="8" required autofocus />
          </label>
          <label>
            Confirmar senha
            <input type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required />
          </label>
          <div id="clerk-captcha"></div>
          <button class="primary-button full" type="submit">Criar senha</button>
        ` : `
          <label>
            Usu&aacute;rio ou E-mail
            <input type="text" name="identifier" autocomplete="username" required autofocus />
          </label>
          <label>
            Senha
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <button class="primary-button full" type="submit">Entrar</button>
          <button class="link-button login-reset-link" type="button" data-action="password-reset">Esqueci minha senha</button>
        `}
        <p class="form-success" hidden></p>
        <p class="form-error" ${initialError ? '' : 'hidden'}>${initialError}</p>
      </form>

        <div class="login-panel-footer">
          <span>Powered by Catrion</span>
          <img src="/assets/logo-catrion.png" alt="Catrion" loading="lazy" />
        </div>
      </div>
    </div>
  `;

  page.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const error = page.querySelector('.form-error');
    const submit = page.querySelector('button[type="submit"]');
    const form = new FormData(event.currentTarget);

    error.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Entrando...';

    try {
      if (invitationTicket) {
        const password = String(form.get('password') || '');
        const confirmPassword = String(form.get('confirmPassword') || '');
        if (password !== confirmPassword) {
          throw new Error('As senhas informadas nao conferem.');
        }
        submit.textContent = 'Criando senha...';
        await acceptInvitationWithPassword(invitationTicket, password);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        await signInWithPassword(
          String(form.get('identifier') || '').trim(),
          String(form.get('password') || '')
        );
      }
      await api('/auth/session/activate', { method: 'POST', redirectOnAuthError: false });
      await me();
      sessionStorage.removeItem('planejamento_active_tab');
      sessionStorage.setItem('planejamento_active_tab', 'dashboardReports');

      const loginUrl = new URL(window.location.href);
      loginUrl.searchParams.set('tab', 'dashboardReports');
      window.history.replaceState(
        null,
        '',
        loginUrl.pathname + loginUrl.search + loginUrl.hash
      );
      await api('/auth/events/login', { method: 'POST' }).catch(() => {});
      window.dispatchEvent(new CustomEvent('planejamento:navigate'));
    } catch (err) {
      error.textContent = err.message || 'Nao foi possivel entrar. Tente novamente.';
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = invitationTicket ? 'Criar senha' : 'Entrar';
    }
  });

  page.querySelector('[data-action="password-reset"]')?.addEventListener('click', async () => {
    const error = page.querySelector('.form-error');
    const success = page.querySelector('.form-success');
    const identifierInput = page.querySelector('[name="identifier"]');
    const resetButton = page.querySelector('[data-action="password-reset"]');
    const identifier = String(identifierInput.value || '').trim();

    error.hidden = true;
    success.hidden = true;

    if (!identifier) {
      error.textContent = 'Informe seu usuario ou e-mail para recuperar a senha.';
      error.hidden = false;
      identifierInput.focus();
      return;
    }

    resetButton.disabled = true;
    try {
      await requestPasswordReset(identifier);
      success.textContent = 'Se a conta existir no Clerk, o e-mail de recuperacao sera enviado.';
      success.hidden = false;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      resetButton.disabled = false;
    }
  });

  return page;
}
