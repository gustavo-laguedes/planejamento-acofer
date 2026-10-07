import { api } from './api.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

function PasswordModal(user) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop user-password-backdrop';
  backdrop.innerHTML = `<div class="modal user-password-modal" role="dialog" aria-modal="true" aria-labelledby="user-password-title"><div class="modal-header"><div><h2 id="user-password-title">Definir senha</h2><p class="modal-subtitle">${escapeHtml(user.name)} · ${escapeHtml(user.email)}</p></div><button class="secondary-button" type="button" data-password-close>Fechar</button></div><form class="user-password-form"><label>Nova senha<input name="password" type="password" minlength="8" autocomplete="new-password" required /></label><label>Confirmar nova senha<input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required /></label><p class="form-error" hidden></p><div class="form-actions"><button class="secondary-button" type="button" data-password-cancel>Cancelar</button><button class="primary-button" type="submit">Salvar nova senha</button></div></form></div>`;
  const form = backdrop.querySelector('form');
  const error = backdrop.querySelector('.form-error');
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', event => { if (event.target === backdrop || event.target.matches('[data-password-close], [data-password-cancel]')) close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    error.hidden = true;
    if (data.password !== data.confirmPassword) { error.textContent = 'As senhas não conferem.'; error.hidden = false; return; }
    submit.disabled = true;
    try { await api(`/auth/users/${user.id}/password`, { method: 'PATCH', body: data }); close(); window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `Senha de ${user.name} atualizada no Clerk.` })); } catch (err) { error.textContent = err.message; error.hidden = false; } finally { submit.disabled = false; }
  });
  return backdrop;
}

export function UserManagementModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal wide-modal user-management-modal" role="dialog" aria-modal="true" aria-labelledby="user-management-title"><div class="modal-header"><div><h2 id="user-management-title">Gest&atilde;o de Usu&aacute;rios</h2><p class="modal-subtitle">Convites Clerk e perfis internos do sistema.</p></div><button class="secondary-button" type="button" data-close>Fechar</button></div><form class="grid-form user-form"><label>Nome<input name="name" required /></label><label>E-mail<input name="email" type="email" required /></label><label>Fun&ccedil;&atilde;o<select name="role" required></select></label><label>Status<select name="status" required></select></label><div class="form-actions"><button class="primary-button" type="submit">Enviar convite</button><p class="form-error" hidden></p></div></form><div class="table-wrap user-table-wrap"><table class="data-table user-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Fun&ccedil;&atilde;o</th><th>Status</th><th>Convite</th><th>A&ccedil;&otilde;es</th></tr></thead><tbody></tbody></table></div></div>`;
  const form = backdrop.querySelector('form');
  const roleSelect = form.elements.role;
  const statusSelect = form.elements.status;
  const error = backdrop.querySelector('.form-error');
  let roles = []; let statuses = []; let users = [];
  const close = () => backdrop.remove();
  const optionList = (values, selected) => values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  function renderRows() {
    backdrop.querySelector('tbody').innerHTML = users.map(user => `<tr data-id="${user.id}"><td><input name="name" value="${escapeHtml(user.name)}" ${user.isInitialSuperAdmin ? 'data-locked="true"' : ''} /></td><td>${escapeHtml(user.email)}</td><td><select name="role" ${user.isInitialSuperAdmin ? 'disabled data-locked="true"' : ''}>${optionList(roles, user.role)}</select></td><td><select name="status" ${user.isInitialSuperAdmin ? 'disabled data-locked="true"' : ''}>${optionList(statuses, user.status)}</select></td><td>${user.invitedAt ? new Date(user.invitedAt).toLocaleDateString('pt-BR') : '-'}</td><td class="user-actions"><button class="secondary-button" type="button" data-save>Salvar</button><button class="secondary-button" type="button" data-password>Definir senha</button><button class="danger-button" type="button" data-delete ${user.isInitialSuperAdmin ? 'disabled' : ''}>Remover</button></td></tr>`).join('');
  }
  async function loadUsers() { const payload = await api('/auth/users'); roles = payload.roles; statuses = payload.statuses; users = payload.users; roleSelect.innerHTML = optionList(roles, 'Visualizador'); statusSelect.innerHTML = optionList(statuses, 'Ativo'); renderRows(); }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const submit = form.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(form).entries()); error.hidden = true; submit.disabled = true;
    try { await api('/auth/users', { method: 'POST', body: data }); form.reset(); statusSelect.value = 'Ativo'; await loadUsers(); window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Convite enviado pelo Clerk.' })); } catch (err) { error.textContent = err.message; error.hidden = false; } finally { submit.disabled = false; }
  });
  backdrop.addEventListener('click', async event => {
    if (event.target === backdrop || event.target.matches('[data-close]')) { close(); return; }
    const row = event.target.closest('tr[data-id]'); if (!row) return;
    const user = users.find(item => String(item.id) === String(row.dataset.id));
    if (event.target.matches('[data-save]')) {
      event.target.disabled = true;
      try { await api(`/auth/users/${row.dataset.id}`, { method: 'PATCH', body: { name: row.querySelector('[name="name"]').value, role: row.querySelector('[name="role"]').value, status: row.querySelector('[name="status"]').value } }); await loadUsers(); window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Usuário atualizado no sistema e no Clerk.' })); } catch (err) { window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: err.message })); } finally { event.target.disabled = false; }
      return;
    }
    if (event.target.matches('[data-password]') && user) { document.body.appendChild(PasswordModal(user)); return; }
    if (event.target.matches('[data-delete]')) {
      if (!confirm('Remover este usuário do sistema e do Clerk?')) return;
      event.target.disabled = true;
      try { await api(`/auth/users/${row.dataset.id}`, { method: 'DELETE' }); await loadUsers(); window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Usuário removido do sistema e do Clerk.' })); } catch (err) { window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: err.message })); } finally { event.target.disabled = false; }
    }
  });
  loadUsers().catch(err => { error.textContent = err.message; error.hidden = false; });
  return backdrop;
}
