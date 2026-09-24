import { api } from './api.js';

export function UploadCsvButton({ onImported }) {
  const wrapper = document.createElement('div');
  const button = document.createElement('button');

  button.className = 'primary-button';
  button.type = 'button';
  button.textContent = 'Importar CSV';

  function openImportModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Importar CSV</h2>
          <button class="link-button close-modal" type="button">Fechar</button>
        </div>

        <form class="stack csv-import-form">

          <div
            class="csv-import-dates"
            style="
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px;
            "
          >
            <label>
              Data inicial
              <input
                name="periodStart"
                type="date"
                required
              />
            </label>

            <label>
              Data final
              <input
                name="periodEnd"
                type="date"
                required
              />
            </label>
          </div>

          <label class="wide-field">
            Arquivo CSV
            <input
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
            />
          </label>

      <div
  class="form-error csv-import-period-warning"
  hidden
></div>

          <div class="form-actions">
            <button
              class="secondary-button close-modal"
              type="button"
            >
              Cancelar
            </button>

            <button
              class="primary-button submit-import"
              type="submit"
            >
              Importar CSV
            </button>
          </div>
        </form>
      </div>
    `;

    const form =
  backdrop.querySelector('.csv-import-form');

const submitButton =
  backdrop.querySelector('.submit-import');

const periodWarning =
  backdrop.querySelector(
    '.csv-import-period-warning'
  );

    function close() {
      backdrop.remove();
    }

    backdrop.addEventListener('click', event => {
      if (
        event.target === backdrop ||
        event.target.classList.contains('close-modal')
      ) {
        close();
      }
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();

      const periodStart = form.elements.periodStart.value;
      const periodEnd = form.elements.periodEnd.value;
      const file = form.elements.file.files?.[0];

      if (!periodStart || !periodEnd) {
        window.dispatchEvent(
          new CustomEvent('planejamento:toast', {
            detail: 'Informe a data inicial e a data final.'
          })
        );
        return;
      }

      if (periodStart > periodEnd) {
        window.dispatchEvent(
          new CustomEvent('planejamento:toast', {
            detail: 'A data inicial não pode ser posterior à data final.'
          })
        );
        return;
      }

      if (!file) {
        window.dispatchEvent(
          new CustomEvent('planejamento:toast', {
            detail: 'Selecione o arquivo CSV.'
          })
        );
        return;
      }

      const originalText = submitButton.textContent;

      periodWarning.hidden = true;
periodWarning.textContent = '';

      submitButton.disabled = true;
      submitButton.textContent = 'Importando...';

      try {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('periodStart', periodStart);
        formData.append('periodEnd', periodEnd);

        const result = await api('/imports/csv', {
          method: 'POST',
          body: formData
        });

        window.dispatchEvent(
          new CustomEvent('planejamento:toast', {
            detail: `CSV importado: ${result.totalRows} linhas.`
          })
        );

        close();

        await onImported?.();
      } catch (error) {
  if (error.status === 409) {
    periodWarning.textContent =
      error.message;

    periodWarning.hidden = false;
  } else {
    window.dispatchEvent(
      new CustomEvent('planejamento:toast', {
        detail: error.message
      })
    );
  }

  submitButton.disabled = false;
  submitButton.textContent = originalText;
}
    });

    document.body.appendChild(backdrop);
  }

  button.addEventListener('click', openImportModal);

  wrapper.appendChild(button);

  return wrapper;
}