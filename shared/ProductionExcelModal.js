import { api } from './api.js';


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(
      "'",
      '&#039;'
    );
}


function formatNumber(value) {
  return Number(
    value || 0
  ).toLocaleString(
    'pt-BR',
    {
      maximumFractionDigits:
        3
    }
  );
}


function todayBrazil() {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Sao_Paulo',

        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    )
      .formatToParts(
        new Date()
      );

  const values =
    Object.fromEntries(
      parts.map(
        item => [
          item.type,
          item.value
        ]
      )
    );

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}


function toast(error) {
  window.dispatchEvent(
    new CustomEvent(
      'planejamento:toast',
      {
        detail:
          error?.message ||
          error
      }
    )
  );
}


function downloadBlob(
  blob,
  filename
) {
  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      'a'
    );

  link.href =
    url;

  link.download =
    filename;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );
}


function fileBody(file) {
  const body =
    new FormData();

  body.append(
    'file',
    file
  );

  return body;
}


function statusClass(
  statusKey
) {
  if (
    statusKey ===
    'applicable'
  ) {
    return 'is-applicable';
  }

  if (
    statusKey ===
    'changed'
  ) {
    return 'is-changed';
  }

  if (
    statusKey ===
    'already_done'
  ) {
    return 'is-neutral';
  }

  return 'is-blocked';
}


function reviewTable(
  review,
  tab
) {
  const benefit =
    tab === 'benefits';


  const headers =
    benefit
      ? [
          'Linha',
          'Data',
          'Material',
          'Lote',
          'Beneficiamento',
          'Situação',
          'Observação'
        ]
      : [
          'Linha',
          'Data',
          'Material',
          'Modelo',
          'Máquina',
          'Lote gerado',
          'Situação',
          'Observação'
        ];


  const rows =
    (
      review.rows ||
      []
    )
      .map(
        row => {

          const prefix = `
            <td>
              ${escapeHtml(
                row.rowNumber
              )}
            </td>

            <td>
              ${escapeHtml(
                row.productionDate ||
                '-'
              )}
            </td>

            <td>
              ${escapeHtml(
                row.materialName ||
                '-'
              )}
            </td>
          `;


          const middle =
            benefit
              ? `
                ${prefix}

                <td>
                  ${escapeHtml(
                    row.generatedLot ||
                    '-'
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.benefitNumber ||
                    '-'
                  )}
                </td>
              `
              : `
                ${prefix}

                <td>
                  ${escapeHtml(
                    row.productionModelName ||
                    '-'
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.machineName ||
                    '-'
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.generatedLot ||
                    '-'
                  )}
                </td>
              `;


          return `
            <tr
              class="
                production-excel-review-row
                ${statusClass(
                  row.statusKey
                )}
              "
            >
              ${middle}

              <td>
                <strong>
                  ${escapeHtml(
                    row.status ||
                    '-'
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  row.message ||
                  '-'
                )}
              </td>
            </tr>
          `;
        }
      )
      .join('');


  return `
    <div
      class="
        production-excel-review-summary
      "
    >

      <article>
        <span>
          Aplicáveis
        </span>

        <strong>
          ${formatNumber(
            review.applicableCount
          )}
        </strong>
      </article>

      <article>
        <span>
          Não aplicadas
        </span>

        <strong>
          ${formatNumber(
            review.blockedCount
          )}
        </strong>
      </article>

    </div>


    <div
      class="
        production-excel-review-wrap
      "
    >
      <table
        class="
          production-excel-review-table
        "
      >

        <thead>
          <tr>
            ${
              headers
                .map(
                  header =>
                    `<th>${escapeHtml(
                      header
                    )}</th>`
                )
                .join('')
            }
          </tr>
        </thead>

        <tbody>
          ${
            rows
            ||
            `
              <tr>
                <td
                  colspan="${headers.length}"
                  class="empty-state"
                >
                  Nenhuma linha para revisar.
                </td>
              </tr>
            `
          }
        </tbody>

      </table>
    </div>
  `;
}


export async function openProductionExcelModal(
  {
    onApplied
  } = {}
) {

  const backdrop =
    document.createElement(
      'div'
    );


  backdrop.className =
    'modal-backdrop production-excel-backdrop';


  let activeTab =
    'productions';


  const state = {
    productions: {
      file: null,
      review: null
    },

    benefits: {
      file: null,
      review: null
    }
  };


  backdrop.innerHTML = `
    <div
      class="
        modal
        production-excel-modal
      "
      role="dialog"
      aria-modal="true"
    >

      <div class="modal-header">
        <h2>
          Importar por Excel
        </h2>
      </div>


      <div
        class="
          production-excel-tabs
        "
        role="tablist"
      >

        <button
          type="button"
          data-excel-tab="productions"
        >
          Produções
        </button>

        <button
          type="button"
          data-excel-tab="benefits"
        >
          Beneficiamentos
        </button>

      </div>


      <div
        class="
          production-excel-body
        "
      ></div>

    </div>
  `;


  const body =
    backdrop.querySelector(
      '.production-excel-body'
    );


  const current =
    () =>
      state[activeTab];


  function render() {

    backdrop
      .querySelectorAll(
        '[data-excel-tab]'
      )
      .forEach(
        button => {

          const selected =
            button.dataset
              .excelTab ===
            activeTab;


          button.classList.toggle(
            'active',
            selected
          );


          button.setAttribute(
            'aria-selected',
            selected
              ? 'true'
              : 'false'
          );
        }
      );


    const item =
      current();


    const benefit =
      activeTab ===
      'benefits';


    /*
     * Depois da revisão:
     * mostra exatamente o resumo
     * APLICÁVEL / LOTE ALTERADO etc.
     */
    if (item.review) {

      body.innerHTML = `
        ${
          reviewTable(
            item.review,
            activeTab
          )
        }


        <div
          class="
            form-actions
            production-excel-actions
          "
        >

          <button
            class="
              secondary-button
              production-excel-back
            "
            type="button"
          >
            Voltar
          </button>


          <button
            class="
              primary-button
              production-excel-apply
            "
            type="button"

            ${
              item.review
                .applicableCount
                ? ''
                : 'disabled'
            }
          >

            ${
              benefit
                ? (
                    `Aplicar ${
                      item.review
                        .applicableCount
                    } beneficiamento(s)`
                  )
                : (
                    `Lançar ${
                      item.review
                        .applicableCount
                    } produção(ões)`
                  )
            }

          </button>

        </div>
      `;

      return;
    }


    body.innerHTML = `
      <button
        class="
          production-excel-download
        "
        type="button"
      >

        ${
          benefit
            ? 'Baixar pendentes de beneficiamento'
            : 'Baixar padrão de produção'
        }

      </button>


      <label
        class="
          production-excel-file-field
        "
      >

        <span>
          Arquivo preenchido
        </span>

        <input
          type="file"

          accept="
            .xlsx,
            application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
          "
        />


        ${
          item.file
            ? `
              <small>
                Selecionado:
                ${escapeHtml(
                  item.file.name
                )}
              </small>
            `
            : ''
        }

      </label>


      <p
        class="
          production-excel-help
        "
      >

        ${
          benefit
            ? (
                'Baixe os lotes pendentes, preencha apenas os beneficiamentos desejados e importe o arquivo para revisar.'
              )
            : (
                'Baixe o padrão, preencha os lançamentos e importe o arquivo para revisar antes de gravar.'
              )
        }

      </p>


      <div
        class="
          form-actions
          production-excel-actions
        "
      >

        <button
          class="
            secondary-button
            production-excel-close
          "
          type="button"
        >
          Cancelar
        </button>


        <button
          class="
            primary-button
            production-excel-review
          "
          type="button"

          ${
            item.file
              ? ''
              : 'disabled'
          }
        >

          ${
            benefit
              ? 'Salvar beneficiamentos'
              : 'Revisar produções'
          }

        </button>

      </div>
    `;
  }


  async function downloadTemplate() {
    const benefit =
      activeTab ===
      'benefits';


    const blob =
      await api(
        benefit
          ? '/actuals/excel/benefit-template'
          : '/actuals/excel/production-template'
      );


    downloadBlob(
      blob,

      benefit
        ? (
            `beneficiamentos-pendentes-${todayBrazil()}.xlsx`
          )
        : (
            `padrao-importacao-producao-${todayBrazil()}.xlsx`
          )
    );
  }


  async function reviewFile() {
    const item =
      current();


    if (!item.file) {
      return;
    }


    const benefit =
      activeTab ===
      'benefits';


    const button =
      body.querySelector(
        '.production-excel-review'
      );


    if (button) {
      button.disabled =
        true;

      button.textContent =
        'Revisando...';
    }


    try {

      item.review =
        await api(
          benefit
            ? '/actuals/excel/benefit-review'
            : '/actuals/excel/production-review',

          {
            method: 'POST',

            body:
              fileBody(
                item.file
              )
          }
        );


      render();

    } catch (error) {
      render();

      throw error;
    }
  }


  async function applyFile() {
    const item =
      current();


    if (
      !item.file ||
      !item.review
        ?.applicableCount
    ) {
      return;
    }


    const benefit =
      activeTab ===
      'benefits';


    const button =
      body.querySelector(
        '.production-excel-apply'
      );


    if (button) {
      button.disabled =
        true;

      button.textContent =
        'Aplicando...';
    }


    try {

      const result =
        await api(
          benefit
            ? '/actuals/excel/benefit-apply'
            : '/actuals/excel/production-apply',

          {
            method: 'POST',

            body:
              fileBody(
                item.file
              )
          }
        );


      window.dispatchEvent(
        new CustomEvent(
          'planejamento:toast',
          {
            detail:
              benefit
                ? (
                    `Beneficiamentos aplicados: ${formatNumber(
                      result.appliedCount
                    )}.`
                  )
                : (
                    `Produções lançadas: ${formatNumber(
                      result.appliedCount
                    )}.`
                  )
          }
        )
      );


      backdrop.remove();


      await onApplied?.();

    } catch (error) {
      render();

      throw error;
    }
  }


  backdrop.addEventListener(
    'click',
    event => {

      if (
        event.target ===
          backdrop
        ||
        event.target.closest(
          '.production-excel-close'
        )
      ) {
        backdrop.remove();

        return;
      }


      const tab =
        event.target.closest(
          '[data-excel-tab]'
        );


      if (tab) {
        activeTab =
          tab.dataset
            .excelTab;

        render();

        return;
      }


      if (
        event.target.closest(
          '.production-excel-back'
        )
      ) {
        current().review =
          null;

        render();

        return;
      }


      if (
        event.target.closest(
          '.production-excel-download'
        )
      ) {
        downloadTemplate()
          .catch(toast);

        return;
      }


      if (
        event.target.closest(
          '.production-excel-review'
        )
      ) {
        reviewFile()
          .catch(toast);

        return;
      }


      if (
        event.target.closest(
          '.production-excel-apply'
        )
      ) {
        applyFile()
          .catch(toast);
      }
    }
  );


  backdrop.addEventListener(
    'change',
    event => {

      const input =
        event.target.closest(
          '.production-excel-file-field input[type="file"]'
        );


      if (!input) {
        return;
      }


      current().file =
        input.files?.[0]
        || null;


      current().review =
        null;


      render();
    }
  );


  document.body.appendChild(
    backdrop
  );


  render();
}