import { api } from './api.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

export function UserProfileModal(user = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop user-profile-backdrop';
  backdrop.innerHTML = `<div class="modal user-profile-modal" role="dialog" aria-modal="true" aria-labelledby="user-profile-title"><div class="modal-header"><div><h2 id="user-profile-title">Meu usuário</h2><p class="modal-subtitle">Perfil e credenciais de acesso.</p></div><button class="secondary-button" type="button" data-profile-close>Fechar</button></div><form class="user-profile-form"><div class="user-profile-grid"><label>Nome<input name="name" value="${escapeHtml(user.name || '')}" required /></label><label>E-mail<input value="${escapeHtml(user.email || '')}" disabled /></label><label>Função<input value="${escapeHtml(user.role || '')}" disabled /></label></div><div class="user-profile-password-section"><div><strong>Alterar senha</strong><p>Deixe os campos em branco para manter a senha atual.</p></div><div class="user-profile-password-grid"><label>Nova senha<input name="password" type="password" minlength="8" autocomplete="new-password" /></label><label>Confirmar nova senha<input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" /></label></div></div><p class="form-error" hidden></p><div class="form-actions user-profile-actions"><button class="secondary-button" type="button" data-profile-cancel>Cancelar</button><button class="primary-button" type="submit">Salvar alterações</button></div></form></div>`;
  const form = backdrop.querySelector('form');
  const error = backdrop.querySelector('.form-error');
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', event => { if (event.target === backdrop || event.target.matches('[data-profile-close], [data-profile-cancel]')) close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    error.hidden = true;
    if ((data.password || data.confirmPassword) && data.password !== data.confirmPassword) { error.textContent = 'As senhas não conferem.'; error.hidden = false; return; }
    submit.disabled = true;
    try { await api('/auth/profile', { method: 'PATCH', body: data }); window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Perfil atualizado.' })); close(); window.setTimeout(() => window.location.reload(), 250); } catch (err) { error.textContent = err.message; error.hidden = false; } finally { submit.disabled = false; }
  });
  return backdrop;
}
