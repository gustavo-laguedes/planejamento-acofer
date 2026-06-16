import { requestPasswordReset, signInWithPassword } from '../shared/clerkAuth.js';
import { api, me } from '../shared/api.js';

export function LoginPage(initialError = '') {
  const page = document.createElement('main');
  page.className = 'login-page';
  page.innerHTML = `
    <div class="login-shell">
      <div class="login-logo">
        <img src="/assets/logo-acofer.png" alt="A&ccedil;o-Fer" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'" />
        <span class="logo-fallback large">A&ccedil;o-Fer</span>
      </div>
      <form class="login-card">
        <div class="login-heading">
          <h1>Acesso ao sistema</h1>
          <span>Planejamento A&ccedil;o-Fer</span>
        </div>
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
        <p class="form-success" hidden></p>
        <p class="form-error" ${initialError ? '' : 'hidden'}>${initialError}</p>
      </form>
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
      await signInWithPassword(
        String(form.get('identifier') || '').trim(),
        String(form.get('password') || '')
      );
      await me();
      await api('/auth/events/login', { method: 'POST' }).catch(() => {});
      window.dispatchEvent(new CustomEvent('planejamento:navigate'));
    } catch (err) {
      error.textContent = err.message || 'Nao foi possivel entrar. Tente novamente.';
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  });

  page.querySelector('[data-action="password-reset"]').addEventListener('click', async () => {
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
