import { login } from '../api.js';

export function LoginPage() {
  const page = document.createElement('main');
  page.className = 'login-page';
  page.innerHTML = `
    <form class="login-card">
      <div class="login-logo">
        <img src="/assets/logo-acofer.png" alt="Aco-Fer" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'" />
        <span class="logo-fallback large">Aco-Fer</span>
      </div>
      <h1>Planejamento Aco-Fer</h1>
      <label>
        Senha
        <input type="password" name="password" autocomplete="current-password" required autofocus />
      </label>
      <button class="primary-button full" type="submit">Entrar</button>
      <p class="form-error" hidden></p>
    </form>
  `;

  page.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const error = page.querySelector('.form-error');
    error.hidden = true;
    try {
      await login(new FormData(event.currentTarget).get('password'));
      window.dispatchEvent(new CustomEvent('planejamento:navigate'));
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  return page;
}
