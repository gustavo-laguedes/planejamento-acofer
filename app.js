import { isSignedIn, signOut } from './shared/clerkAuth.js';
import { me } from './shared/api.js';
import { LoginPage } from './pages/LoginPage.js';
import { AppShell } from './pages/AppShell.js';

const root = document.getElementById('app');
const INITIAL_AUTH_TIMEOUT_MS = 7000;
let renderRun = 0;
let sessionValidationTimer = null;

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export async function render() {
  const currentRun = ++renderRun;
  if (sessionValidationTimer) {
    clearInterval(sessionValidationTimer);
    sessionValidationTimer = null;
  }
  root.innerHTML = '';
  const loading = document.createElement('main');
  loading.className = 'initial-loading';
  loading.innerHTML = `
    <section class="initial-loading-panel" aria-live="polite" aria-busy="true">
      <div class="initial-loading-logo">
        <img src="/assets/logo-acofer.png" alt="A&ccedil;o-Fer" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'" />
        <strong>Planejamento A&ccedil;o-Fer</strong>
      </div>
      <div class="industrial-loader" aria-hidden="true">
        <span class="metal-bar"></span>
        <span class="cut-line"></span>
        <span class="spark spark-a"></span>
        <span class="spark spark-b"></span>
      </div>
      <p>Preparando produ&ccedil;&atilde;o...</p>
    </section>
  `;
  root.appendChild(loading);

  try {
    const signedIn = await withTimeout(
      isSignedIn(),
      INITIAL_AUTH_TIMEOUT_MS,
      'Nao foi possivel confirmar sua sessao. Faca login novamente.'
    );
    if (currentRun !== renderRun) return;

    if (signedIn) {
      await withTimeout(
        me(),
        INITIAL_AUTH_TIMEOUT_MS,
        'Nao foi possivel carregar sua sessao. Faca login novamente.'
      );
      if (currentRun !== renderRun) return;
    }

    root.innerHTML = '';
    root.appendChild(signedIn ? AppShell() : LoginPage());
    if (signedIn) {
      sessionValidationTimer = setInterval(() => {
        me().catch(() => {});
      }, 30000);
    }
  } catch (error) {
    if (currentRun !== renderRun) return;
    root.innerHTML = '';
    root.appendChild(LoginPage(error.message));
    signOut().catch(() => {});
  }
}

window.addEventListener('planejamento:navigate', render);
render();
