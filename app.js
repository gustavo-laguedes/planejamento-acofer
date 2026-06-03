import { getToken } from './shared/api.js';
import { LoginPage } from './pages/LoginPage.js';
import { AppShell } from './pages/AppShell.js';

const root = document.getElementById('app');

export function render() {
  root.innerHTML = '';
  root.appendChild(getToken() ? AppShell() : LoginPage());
}

window.addEventListener('planejamento:navigate', render);
render();
