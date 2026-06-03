import { api } from './api.js';

export function UploadCsvButton({ onImported }) {
  const wrapper = document.createElement('div');
  const input = document.createElement('input');
  const button = document.createElement('button');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.hidden = true;
  button.className = 'primary-button';
  button.textContent = 'Importar CSV';

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files?.[0]) return;
    const original = button.textContent;
    button.textContent = 'Importando...';
    button.disabled = true;
    try {
      const formData = new FormData();
      formData.append('file', input.files[0]);
      const result = await api('/imports/csv', { method: 'POST', body: formData });
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: `CSV importado: ${result.totalRows} linhas.` }));
      onImported?.();
    } catch (error) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
    } finally {
      input.value = '';
      button.textContent = original;
      button.disabled = false;
    }
  });

  wrapper.append(input, button);
  return wrapper;
}
