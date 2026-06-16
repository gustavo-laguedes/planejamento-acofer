import { isSignedIn, signOut } from './shared/clerkAuth.js';
import { me } from './shared/api.js';
import { LoginPage } from './pages/LoginPage.js';
import { AppShell } from './pages/AppShell.js';

const root = document.getElementById('app');

export async function render() {
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
    const signedIn = await isSignedIn();
    if (signedIn) await me();
    root.innerHTML = '';
    root.appendChild(signedIn ? AppShell() : LoginPage());
  } catch (error) {
    await signOut().catch(() => {});
    root.innerHTML = '';
    root.appendChild(LoginPage(error.message));
  }
}

window.addEventListener('planejamento:navigate', render);
render();
