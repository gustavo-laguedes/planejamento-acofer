import { api } from '../shared/api.js';
import { setInternalError, setInternalLoading } from '../shared/InternalLoading.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value, digits = 1) {
  return toNumber(value).toLocaleString('pt-BR', {
    maximumFractionDigits: digits
  });
}

function formatKg(value) {
  return `${formatNumber(value, 1)} kg`;
}

function formatPercent(value) {
  return `${formatNumber(value, 1)}%`;
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function formatDate(value) {
  const key = dateKey(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return '-';
  }

  const [year, month, day] = key.split('-');

  return `${day}/${month}/${year}`;
}

function todaySaoPaulo() {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [
        part.type,
        part.value
      ])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function isCanceled(value) {
  return [
    'canceled',
    'cancelled',
    'cancelado',
    'cancelada'
  ].includes(normalizeText(value));
}

function emptyChart(text = 'Sem dados no período.') {
  return `
    <div class="dashboard-v2-empty">
      ${escapeHtml(text)}
    </div>
  `;
}

function aggregateTrackingByDay(rows = []) {
  const grouped = new Map();

  rows
    .filter(row => !isCanceled(row.status))
    .forEach(row => {
      const key = dateKey(
        row.planned_date ||
        row.production_date
      );

      if (!key) {
        return;
      }

      if (!grouped.has(key)) {
        grouped.set(
          key,
          {
            date: key,
            planned: 0,
            actual: 0
          }
        );
      }

      const item = grouped.get(key);

      item.planned += toNumber(
        row.planned_qty
      );

      item.actual += toNumber(
        row.actual_qty
      );
    });

  return [...grouped.values()]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date)
    );
}

function productionBars(rows = []) {
  const items = rows.slice(-14);

  if (!items.length) {
    return emptyChart();
  }

  const max = Math.max(
    ...items.map(
      item =>
        toNumber(item.realWeightKg)
    ),
    1
  );

  return `
    <div class="dashboard-v2-column-chart">

      ${
        items.map(item => {
          const value = toNumber(
            item.realWeightKg
          );

          const height = Math.max(
            (value / max) * 100,
            value > 0 ? 4 : 0
          );

          return `
            <div
              class="dashboard-v2-column-item"
              data-dashboard-detail="production"
              data-dashboard-key="${escapeHtml(item.date)}"
              role="button"
              tabindex="0"
              title="${escapeHtml(
                `${formatDate(item.date)} · ${formatKg(value)} · ${formatNumber(item.productionCount, 0)} produção(ões)`
              )}"
            >

              <div class="dashboard-v2-column-track">
                <i style="height:${height}%"></i>
              </div>

              <span>
                ${escapeHtml(
                  formatDate(item.date).slice(0, 5)
                )}
              </span>

            </div>
          `;
        }).join('')
      }

    </div>
  `;
}

function plannedActualBars(rows = []) {
  const items =
    aggregateTrackingByDay(rows)
      .slice(-14);

  if (!items.length) {
    return emptyChart(
      'Sem dados de planejamento no período.'
    );
  }

  const max = Math.max(
    ...items.flatMap(
      item => [
        item.planned,
        item.actual
      ]
    ),
    1
  );

  return `
    <div class="dashboard-v2-comparison-chart">

      ${
        items.map(item => {
          const planned = Math.max(
            (item.planned / max) * 100,
            item.planned > 0 ? 3 : 0
          );

          const actual = Math.max(
            (item.actual / max) * 100,
            item.actual > 0 ? 3 : 0
          );

          const adherence =
            item.planned > 0
              ? (item.actual / item.planned) * 100
              : 0;

          return `
            <div
              class="dashboard-v2-comparison-item"
              data-dashboard-detail="planned"
              data-dashboard-key="${escapeHtml(item.date)}"
              role="button"
              tabindex="0"
              title="${escapeHtml(
                `${formatDate(item.date)} · Planejado ${formatNumber(item.planned)} · Realizado ${formatNumber(item.actual)} · Aderência ${formatPercent(adherence)}`
              )}"
            >

              <div class="dashboard-v2-comparison-bars">

                <i
                  class="is-planned"
                  style="height:${planned}%"
                ></i>

                <i
                  class="is-actual"
                  style="height:${actual}%"
                ></i>

              </div>

              <span>
                ${escapeHtml(
                  formatDate(item.date).slice(0, 5)
                )}
              </span>

            </div>
          `;
        }).join('')
      }

      <div class="dashboard-v2-chart-legend">

        <span>
          <i class="is-planned"></i>
          Planejado
        </span>

        <span>
          <i class="is-actual"></i>
          Realizado
        </span>

      </div>

    </div>
  `;
}

function horizontalBars(
  rows = [],
  options = {}
) {
  const items =
    rows.slice(
      0,
      options.limit || 6
    );

  if (!items.length) {
    return emptyChart();
  }

  const valueOf =
    options.value ||
    (
      item =>
        toNumber(item.value)
    );

  const labelOf =
    options.label ||
    (
      item =>
        item.label || '-'
    );

  const metaOf =
    options.meta ||
    (() => '');

  const formatter =
    options.format ||
    (
      value =>
        formatNumber(value)
    );

  const detailType =
    String(
      options.detailType || ''
    ).trim();

  const detailKeyOf =
    options.detailKey ||
    (() => '');

  const max = Math.max(
    ...items.map(valueOf),
    1
  );

  return `
    <div class="dashboard-v2-bars">

      ${
        items.map(item => {
          const value =
            valueOf(item);

          const width = Math.max(
            (value / max) * 100,
            value > 0 ? 3 : 0
          );

          const detailAttributes =
            detailType
              ? `
                data-dashboard-detail="${escapeHtml(detailType)}"
                data-dashboard-key="${escapeHtml(detailKeyOf(item))}"
                role="button"
                tabindex="0"
              `
              : '';

          return `
            <div
              class="dashboard-v2-bar-row"
              ${detailAttributes}
              title="${escapeHtml(
                `${labelOf(item)} · ${metaOf(item)} · ${formatter(value)}`
              )}"
            >

              <div class="dashboard-v2-bar-copy">

                <strong>
                  ${escapeHtml(labelOf(item))}
                </strong>

                <small>
                  ${escapeHtml(metaOf(item))}
                </small>

              </div>

              <div class="dashboard-v2-bar-track">
                <i style="width:${width}%"></i>
              </div>

              <em>
                ${escapeHtml(formatter(value))}
              </em>

            </div>
          `;
        }).join('')
      }

    </div>
  `;
}


function qualityDonut(summary = {}) {
  const evaluated = toNumber(
    summary.evaluatedProductions
  );

  if (!evaluated) {
    return emptyChart(
      'Nenhuma produção avaliável pela norma no período.'
    );
  }

  const compliance = Math.max(
    0,
    Math.min(
      toNumber(
        summary.compliancePercent
      ),
      100
    )
  );

  return `
    <div
      class="dashboard-v2-donut-wrap"
      data-dashboard-detail="quality"
      role="button"
      tabindex="0"
    >

      <div
        class="dashboard-v2-donut"
        style="--dashboard-donut-value:${compliance}%"
      >

        <div>

          <strong>
            ${escapeHtml(
              formatPercent(compliance)
            )}
          </strong>

          <span>
            conforme
          </span>

        </div>

      </div>

      <div class="dashboard-v2-donut-legend">

        <span>
          <i class="is-ok"></i>

          ${formatNumber(
            summary.compliantProductions,
            0
          )} dentro
        </span>

        <span>
          <i class="is-bad"></i>

          ${formatNumber(
            summary.nonCompliantProductions,
            0
          )} fora
        </span>

        ${
          toNumber(
            summary.fallbackHistoricalProductions
          ) > 0

            ? `
              <small>
                ${formatNumber(
                  summary.fallbackHistoricalProductions,
                  0
                )} histórica(s) calculada(s) em leitura
              </small>
            `

            : ''
        }

      </div>

    </div>
  `;
}

function meshComparison(mesh = {}) {
  const rows =
    mesh.byMaterial || [];

  if (!rows.length) {
    return emptyChart(
      'Sem Malhas com peso real no período.'
    );
  }

  return `
    <div class="dashboard-v2-mesh-list">

      ${
        rows
          .slice(0, 5)
          .map(row => {
            const real = toNumber(
              row.realWeightKg
            );

            const theoretical = toNumber(
              row.theoreticalWeightKg
            );

            const max = Math.max(
              real,
              theoretical,
              1
            );

            return `
              <div
                class="dashboard-v2-mesh-item"
                data-dashboard-detail="mesh"
                data-dashboard-key="${escapeHtml(row.materialId || row.materialName || '')}"
                role="button"
                tabindex="0"
                title="${escapeHtml(
                  `${row.materialName || '-'} · Teórico ${formatKg(theoretical)} · Real ${formatKg(real)}`
                )}"
              >

                <div class="dashboard-v2-mesh-head">

                  <strong>
                    ${escapeHtml(
                      row.materialName || '-'
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      `${formatNumber(
                        row.differencePercent,
                        1
                      )}%`
                    )}
                  </span>

                </div>

                <div class="dashboard-v2-dual-bar">
                  <i
                    class="is-theoretical"
                    style="width:${(theoretical / max) * 100}%"
                  ></i>
                </div>

                <div class="dashboard-v2-dual-bar">
                  <i
                    class="is-real"
                    style="width:${(real / max) * 100}%"
                  ></i>
                </div>

                <small>
                  Teórico ${formatKg(theoretical)}
                  ·
                  Real ${formatKg(real)}
                </small>

              </div>
            `;
          })
          .join('')
      }

    </div>
  `;
}

function qualityRangeChart(rows = []) {
  const items =
    [...rows]
      .sort(
        (a, b) =>
          Math.abs(toNumber(b.deviationPercent))
          -
          Math.abs(toNumber(a.deviationPercent))
      )
      .slice(0, 8);

  if (!items.length) {
    return emptyChart(
      'Nenhum material avaliável pela norma no período.'
    );
  }

  const statusLabel = status => ({
    compliant: 'Dentro da norma',
    below_minimum: 'Abaixo do mínimo',
    above_maximum: 'Acima do máximo',
    mixed: 'Resultado misto'
  }[status] || 'Sem classificação');

  return `
    <div class="dashboard-v4-quality-range-list">
      ${items.map(row => {
        const minimum = toNumber(row.minimumKgM);
        const nominal = toNumber(row.nominalKgM);
        const maximum = toNumber(row.maximumKgM);
        const actual = toNumber(row.actualKgM);

        const scaleMinimum =
          Math.min(
            minimum,
            nominal,
            actual
          );

        const scaleMaximum =
          Math.max(
            maximum,
            nominal,
            actual
          );

        const scale =
          Math.max(
            scaleMaximum - scaleMinimum,
            0.000001
          );

        const position =
          value =>
            Math.max(
              0,
              Math.min(
                100,
                (
                  (value - scaleMinimum)
                  /
                  scale
                )
                *
                100
              )
            );

        return `
          <div
            class="dashboard-v4-quality-range-row"
            data-dashboard-detail="qualityMaterial"
            data-dashboard-key="${escapeHtml(row.materialId || row.materialName || '')}"
            role="button"
            tabindex="0"
          >

            <div class="dashboard-v4-quality-range-head">

              <strong>
                ${escapeHtml(row.materialName || '-')}
              </strong>

              <span
                class="dashboard-v4-status is-${escapeHtml(row.status || '')}"
              >
                ${escapeHtml(statusLabel(row.status))}
              </span>

            </div>

            <div class="dashboard-v4-quality-track">

              <i
                class="is-range"
                style="--range-start:${position(minimum)}%;--range-end:${position(maximum)}%"
              ></i>

              <i
                class="is-nominal"
                style="left:${position(nominal)}%"
              ></i>

              <i
                class="is-actual"
                style="left:${position(actual)}%"
              ></i>

            </div>

            <div class="dashboard-v4-quality-values">

              <span>
                Mín. ${formatNumber(minimum, 6)} kg/m
              </span>

              <span>
                Nom. ${formatNumber(nominal, 6)} kg/m
              </span>

              <span>
                Real ${formatNumber(actual, 6)} kg/m
              </span>

              <span>
                Máx. ${formatNumber(maximum, 6)} kg/m
              </span>

            </div>

          </div>
        `;
      }).join('')}
    </div>
  `;
}


function qualityDeviationChart(rows = []) {
  const items =
    [...rows]
      .sort(
        (a, b) =>
          Math.abs(toNumber(b.deviationPercent))
          -
          Math.abs(toNumber(a.deviationPercent))
      );

  return horizontalBars(
    items,
    {
      value:
        row =>
          Math.abs(
            toNumber(row.deviationPercent)
          ),

      label:
        row =>
          row.materialName || '-',

      meta:
        row =>
          `Real ${formatNumber(row.actualKgM, 6)} kg/m · nominal ${formatNumber(row.nominalKgM, 6)} kg/m`,

      detailType:
        'qualityMaterial',

      detailKey:
        row =>
          String(
            row.materialId ||
            row.materialName ||
            ''
          ),

      format:
        value =>
          `${formatNumber(value, 2)}%`,

      limit:
        6
    }
  );
}


function plannedMaterialChart(rows = []) {
  const grouped =
    new Map();

  rows.forEach(row => {
    const key =
      String(
        row.material_name ||
        row.material_code ||
        '-'
      );

    if (!grouped.has(key)) {
      grouped.set(
        key,
        {
          materialName:
            row.material_name ||
            row.material_code ||
            '-',

          planned: 0,
          actual: 0
        }
      );
    }

    const item =
      grouped.get(key);

    item.planned +=
      toNumber(row.planned_qty);

    item.actual +=
      toNumber(row.actual_qty);
  });

  const items =
    [...grouped.values()]
      .sort(
        (a, b) =>
          b.planned - a.planned
      )
      .slice(0, 8);

  if (!items.length) {
    return emptyChart(
      'Sem materiais planejados no período.'
    );
  }

  const max =
    Math.max(
      ...items.flatMap(
        item => [
          item.planned,
          item.actual
        ]
      ),
      1
    );

  return `
    <div class="dashboard-v4-material-plan-list">

      ${items.map(item => `

        <div class="dashboard-v4-material-plan-row">

          <div class="dashboard-v4-material-plan-head">

            <strong>
              ${escapeHtml(item.materialName)}
            </strong>

            <span>
              ${escapeHtml(
                formatPercent(
                  item.planned > 0
                    ? (
                        item.actual
                        /
                        item.planned
                      )
                      *
                      100
                    : 0
                )
              )}
            </span>

          </div>

          <div class="dashboard-v4-plan-line">

            <span>
              Planejado
            </span>

            <div>
              <i
                class="is-planned"
                style="width:${(item.planned / max) * 100}%"
              ></i>
            </div>

            <em>
              ${escapeHtml(formatNumber(item.planned))}
            </em>

          </div>

          <div class="dashboard-v4-plan-line">

            <span>
              Realizado
            </span>

            <div>
              <i
                class="is-actual"
                style="width:${(item.actual / max) * 100}%"
              ></i>
            </div>

            <em>
              ${escapeHtml(formatNumber(item.actual))}
            </em>

          </div>

        </div>
      `).join('')}

    </div>
  `;
}


function planAdherenceChart(plans = []) {
  const items =
    [...plans]
      .sort(
        (a, b) =>
          toNumber(b.planned_qty)
          -
          toNumber(a.planned_qty)
      );

  return horizontalBars(
    items,
    {
      value:
        row =>
          toNumber(row.percent_done),

      label:
        row =>
          row.planning_code ||
          `Plano ${row.plan_id || '-'}`,

      meta:
        row =>
          `${formatNumber(row.actual_qty)} realizado de ${formatNumber(row.planned_qty)} · ${row.status || '-'}`,

      detailType:
        'plan',

      detailKey:
        row =>
          String(
            row.planning_code ||
            row.plan_id ||
            ''
          ),

      format:
        formatPercent,

      limit:
        8
    }
  );
}


function unplannedByMaterialChart(rows = []) {
  const grouped =
    new Map();

  rows.forEach(row => {
    const key =
      String(
        row.material_name ||
        row.material_code ||
        '-'
      );

    if (!grouped.has(key)) {
      grouped.set(
        key,
        {
          materialName:
            row.material_name ||
            row.material_code ||
            '-',

          quantity: 0,

          unit:
            row.actual_unit || ''
        }
      );
    }

    grouped.get(key).quantity +=
      toNumber(row.actual_qty);
  });

  const items =
    [...grouped.values()]
      .sort(
        (a, b) =>
          b.quantity - a.quantity
      );

  return horizontalBars(
    items,
    {
      value:
        row =>
          row.quantity,

      label:
        row =>
          row.materialName,

      meta:
        row =>
          row.unit || '',

      detailType:
        'unplannedMaterial',

      detailKey:
        row =>
          row.materialName,

      format:
        value =>
          formatNumber(value),

      limit:
        8
    }
  );
}



function reportCatalog() {
  const reports = [
    { id: 'executive-summary', title: 'Resumo executivo', description: 'Indicadores e visão consolidada do período.' },
    { id: 'production', title: 'Produção', description: 'Produções, máquinas, pessoas, quantidade e peso.' },
    { id: 'quality-nbr', title: 'Aderência à NBR', description: 'Conformidade, desvios e materiais avaliados.' },
    { id: 'planned-vs-actual', title: 'Planejado x Realizado', description: 'Aderência dos planos e diferenças do período.' },
    { id: 'unplanned', title: 'Não planejadas', description: 'Produções realizadas fora do planejamento.' },
    { id: 'production-calendar', title: 'Calendário de produções', description: 'Agenda consolidada das produções do período.' },
    { id: 'purchases-certificates', title: 'Compras e certificados', description: 'Compras, fornecedores, lotes e certificados.' },
    { id: 'transports', title: 'Transportes', description: 'Movimentações entre unidades e volumes transportados.' },
    { id: 'stock-inventories', title: 'Estoque e inventários', description: 'Saldos, inventários e movimentações relevantes.' },
    { id: 'traceability', title: 'Rastreabilidade', description: 'Consumo e origem de matéria-prima por produção.' },
    { id: 'meshes', title: 'Malhas', description: 'Peso real comparado ao peso teórico cadastrado.' },
    { id: 'cancellations', title: 'Cancelamentos', description: 'Planejamentos e movimentações canceladas.' }
  ];

  return `
    <div class="dashboard-v2-reports-intro">

      <span class="dashboard-v2-eyebrow">
        Central de relatórios
      </span>

      <h2>
        Relatórios executivos
      </h2>

      <p>
        Escolha um relatório, defina o período e prepare a exportação em Excel ou PDF.
      </p>

    </div>

    <div class="dashboard-v2-report-grid">

      ${
        reports.map(
          report => `
            <article
              class="dashboard-v2-report-card"
              data-report-id="${escapeHtml(report.id)}"
              data-report-title="${escapeHtml(report.title)}"
              data-report-description="${escapeHtml(report.description)}"
              role="button"
              tabindex="0"
            >

              <span class="dashboard-v2-report-icon">
                ↗
              </span>

              <strong>
                ${escapeHtml(report.title)}
              </strong>

              <p>
                ${escapeHtml(report.description)}
              </p>

              <small>
                Configurar relatório
              </small>

            </article>
          `
        ).join('')
      }

    </div>
  `;
}

export function DashboardReportsPage() {
  const page =
    document.createElement(
      'section'
    );

  page.className =
    'stack dashboard-page dashboard-v2-page';

  const dashboardTab =
    sessionStorage.getItem(
      'planejamento_dashboard_tab'
    ) || 'graphs';

  if (dashboardTab === 'reports') {
    const reportsToday = todaySaoPaulo();
    let reportPeriodMode = 'today';
    let selectedReport = null;
    const enabledReports = new Set([
      'executive-summary',
      'production',
      'quality-nbr',
      'planned-vs-actual',
      'unplanned',
      'production-calendar',
      'purchases-certificates',
      'transports',
      'stock-inventories',
      'traceability',
      'meshes',
      'cancellations'
    ]);

    page.innerHTML = `
      <section class="dashboard-v2-reports-shell">
        ${reportCatalog()}
      </section>

      <div class="dashboard-v5-report-backdrop" data-report-modal-backdrop hidden>
        <section class="dashboard-v5-report-modal" data-report-modal role="dialog" aria-modal="true" aria-labelledby="dashboard-v5-report-title">
          <header class="dashboard-v5-report-modal-header">
            <div>
              <span class="dashboard-v2-eyebrow">Relatório</span>
              <h2 id="dashboard-v5-report-title" data-report-modal-title></h2>
              <p data-report-modal-description></p>
            </div>
            <button type="button" class="dashboard-v5-report-close" data-report-modal-close aria-label="Fechar">×</button>
          </header>
          <div class="dashboard-v5-report-modal-body">
            <div class="dashboard-v5-report-section">
              <span class="dashboard-v5-report-label">Período</span>
              <div class="dashboard-v5-report-period-tabs" role="group" aria-label="Período do relatório">
                <button type="button" class="is-active" data-report-period="today">Hoje</button>
                <button type="button" data-report-period="day">Dia</button>
                <button type="button" data-report-period="range">Período</button>
              </div>
              <div class="dashboard-v5-report-date-fields">
                <label data-report-day-field hidden><span>Data</span><input type="date" name="reportDay" value="${reportsToday}" /></label>
                <label data-report-start-field hidden><span>Data inicial</span><input type="date" name="reportStartDate" value="${reportsToday}" /></label>
                <label data-report-end-field hidden><span>Data final</span><input type="date" name="reportEndDate" value="${reportsToday}" /></label>
              </div>
            </div>
            <div class="dashboard-v5-report-section">
              <span class="dashboard-v5-report-label">Formato</span>
              <div class="dashboard-v5-report-format-grid">
                <label><input type="radio" name="reportFormat" value="xlsx" checked /><span><strong>Excel</strong><small>Dados tabulares para análise.</small></span></label>
                <label><input type="radio" name="reportFormat" value="pdf" /><span><strong>PDF</strong><small>Apresentação executiva do período.</small></span></label>
              </div>
            </div>
            <div class="dashboard-v5-report-selection" data-report-selection></div>
            <div class="dashboard-v5-report-error" data-report-error hidden></div>
          </div>
          <footer class="dashboard-v5-report-modal-footer">
            <button type="button" class="btn secondary" data-report-cancel>Cancelar</button>
            <button type="button" class="btn primary" data-report-generate disabled>Gerar relatório</button>
          </footer>
        </section>
      </div>
    `;

    const backdrop = page.querySelector('[data-report-modal-backdrop]');
    const modalTitle = page.querySelector('[data-report-modal-title]');
    const modalDescription = page.querySelector('[data-report-modal-description]');
    const selection = page.querySelector('[data-report-selection]');
    const dayField = page.querySelector('[data-report-day-field]');
    const startField = page.querySelector('[data-report-start-field]');
    const endField = page.querySelector('[data-report-end-field]');
    const dayInput = page.querySelector('[name="reportDay"]');
    const startInput = page.querySelector('[name="reportStartDate"]');
    const endInput = page.querySelector('[name="reportEndDate"]');
    const generateButton = page.querySelector('[data-report-generate]');
    const reportError = page.querySelector('[data-report-error]');

    function reportDates() {
      if (reportPeriodMode === 'today') return { startDate: reportsToday, endDate: reportsToday };
      if (reportPeriodMode === 'day') {
        const value = dayInput.value || reportsToday;
        return { startDate: value, endDate: value };
      }
      return { startDate: startInput.value || reportsToday, endDate: endInput.value || reportsToday };
    }

    function updateReportSelection() {
      dayField.hidden = reportPeriodMode !== 'day';
      startField.hidden = reportPeriodMode !== 'range';
      endField.hidden = reportPeriodMode !== 'range';
      page.querySelectorAll('[data-report-period]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.reportPeriod === reportPeriodMode);
      });
      const dates = reportDates();
      const format = page.querySelector('[name="reportFormat"]:checked')?.value || 'xlsx';
      const available = enabledReports.has(selectedReport);
      generateButton.disabled = !available;
      generateButton.title = available ? '' : 'Este relatório será habilitado em uma próxima etapa.';
      selection.innerHTML = available
        ? `<strong>${format === 'pdf' ? 'PDF' : 'Excel'}</strong> · ${escapeHtml(formatDate(dates.startDate))} até ${escapeHtml(formatDate(dates.endDate))}`
        : '<strong>Em preparação</strong> · A exportação deste relatório será habilitada em uma próxima etapa.';
    }

    function openReportModal(card) {
      selectedReport = card.dataset.reportId || null;
      modalTitle.textContent = card.dataset.reportTitle || 'Relatório';
      modalDescription.textContent = card.dataset.reportDescription || '';
      reportPeriodMode = 'today';
      reportError.hidden = true;
      reportError.textContent = '';
      generateButton.textContent = 'Gerar relatório';
      updateReportSelection();
      backdrop.hidden = false;
      requestAnimationFrame(() => backdrop.classList.add('is-open'));
    }

    function reportFilename(reportId, dates, format) {
      const names = { 'executive-summary': 'resumo-executivo', production: 'producao', 'quality-nbr': 'aderencia-nbr', 'planned-vs-actual': 'planejado-x-realizado', unplanned: 'nao-planejadas', 'production-calendar': 'calendario-producoes', 'purchases-certificates': 'compras-certificados', transports: 'transportes', 'stock-inventories': 'estoque-inventarios', traceability: 'rastreabilidade', meshes: 'malhas', cancellations: 'cancelamentos' };
      return `${names[reportId] || 'relatorio'}-${dates.startDate}-a-${dates.endDate}.${format}`;
    }

    function downloadReportBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function generateReport() {
      if (!selectedReport || !enabledReports.has(selectedReport)) return;
      const dates = reportDates();
      if (!dates.startDate || !dates.endDate) {
        reportError.textContent = 'Informe as datas do relatório.';
        reportError.hidden = false;
        return;
      }
      if (dates.startDate > dates.endDate) {
        reportError.textContent = 'A data inicial não pode ser posterior à data final.';
        reportError.hidden = false;
        return;
      }
      const format = page.querySelector('[name="reportFormat"]:checked')?.value || 'xlsx';
      reportError.hidden = true;
      reportError.textContent = '';
      generateButton.disabled = true;
      generateButton.textContent = 'Gerando...';
      try {
        const query = new URLSearchParams({ startDate: dates.startDate, endDate: dates.endDate, format });
        const blob = await api(`/dashboard/reports/${encodeURIComponent(selectedReport)}?${query.toString()}`);
        if (!(blob instanceof Blob)) throw new Error('O servidor não retornou um arquivo válido.');
        downloadReportBlob(blob, reportFilename(selectedReport, dates, format));
        closeReportModal();
      } catch (error) {
        reportError.textContent = error?.message || 'Não foi possível gerar o relatório.';
        reportError.hidden = false;
      } finally {
        generateButton.textContent = 'Gerar relatório';
        generateButton.disabled = !enabledReports.has(selectedReport);
      }
    }

    function closeReportModal() {
      backdrop.classList.remove('is-open');
      selectedReport = null;
      window.setTimeout(() => {
        if (!backdrop.classList.contains('is-open')) backdrop.hidden = true;
      }, 180);
    }

    page.addEventListener('click', event => {
      const card = event.target.closest('[data-report-id]');
      if (card) { openReportModal(card); return; }
      const periodButton = event.target.closest('[data-report-period]');
      if (periodButton) { reportPeriodMode = periodButton.dataset.reportPeriod; updateReportSelection(); return; }
      if (event.target.closest('[data-report-generate]')) { void generateReport(); return; }
      if (event.target.closest('[data-report-modal-close], [data-report-cancel]')) { closeReportModal(); return; }
      if (event.target === backdrop) closeReportModal();
    });

    page.addEventListener('keydown', event => {
      const card = event.target.closest?.('[data-report-id]');
      if (card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); openReportModal(card); return;
      }
      if (event.key === 'Escape') { closeReportModal(); return; }
      if (event.key === 'Enter' && event.target === generateButton && !generateButton.disabled) {
        event.preventDefault();
        void generateReport();
      }
    });

    page.querySelectorAll('[name="reportFormat"], [name="reportDay"], [name="reportStartDate"], [name="reportEndDate"]').forEach(control => {
      control.addEventListener('change', updateReportSelection);
    });

    updateReportSelection();
    void selectedReport;

    return page;
  }

  const today =
    todaySaoPaulo();

  let periodMode =
    'today';

  let startDate =
    today;

  let endDate =
    today;

  page.innerHTML = `

    <section class="dashboard-v2-hero">

      <div>

        <span class="dashboard-v2-eyebrow">
          Visão executiva
        </span>

        <h1>
          Painel do período
        </h1>

        <p>
          Produção, qualidade e movimentações em uma única leitura.
        </p>

      </div>

      <div class="dashboard-v2-period-card">

        <div
          class="dashboard-v2-period-tabs"
          role="group"
          aria-label="Período do Dashboard"
        >

          <button
            class="is-active"
            type="button"
            data-period-mode="today"
          >
            Hoje
          </button>

          <button
            type="button"
            data-period-mode="day"
          >
            Dia
          </button>

          <button
            type="button"
            data-period-mode="range"
          >
            Período
          </button>

        </div>

        <div class="dashboard-v2-date-fields">

          <label
            data-single-date
            hidden
          >

            <span>
              Data
            </span>

            <input
              type="date"
              name="dashboardDay"
              value="${today}"
            />

          </label>

          <label
            data-start-date
            hidden
          >

            <span>
              Data inicial
            </span>

            <input
              type="date"
              name="dashboardStartDate"
              value="${today}"
            />

          </label>

          <label
            data-end-date
            hidden
          >

            <span>
              Data final
            </span>

            <input
              type="date"
              name="dashboardEndDate"
              value="${today}"
            />

          </label>

        </div>

        <div
          class="dashboard-v2-period-caption"
          data-period-caption
        >
          Hoje · ${formatDate(today)}
        </div>

      </div>

    </section>

    <section
      class="dashboard-v2-kpis"
      data-dashboard-kpis
    ></section>

    <section
      class="dashboard-v2-grid"
      data-dashboard-grid
    ></section>

    <div
      class="dashboard-v3-drawer-backdrop"
      data-dashboard-drawer-backdrop
      hidden
    >

      <aside
        class="dashboard-v3-drawer"
        data-dashboard-drawer
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-v3-drawer-title"
      >

        <header class="dashboard-v3-drawer-header">

          <div>

            <span class="dashboard-v2-eyebrow">
              Detalhamento
            </span>

            <h2
              id="dashboard-v3-drawer-title"
              data-dashboard-drawer-title
            ></h2>

            <p
              data-dashboard-drawer-subtitle
            ></p>

          </div>

          <button
            type="button"
            class="dashboard-v3-drawer-close"
            data-dashboard-drawer-close
            aria-label="Fechar detalhamento"
          >
            ×
          </button>

        </header>

        <div
          class="dashboard-v3-drawer-summary"
          data-dashboard-drawer-summary
        ></div>

        <div
          class="dashboard-v3-drawer-body"
          data-dashboard-drawer-body
        ></div>

      </aside>

    </div>
  `;

  const kpisTarget =
    page.querySelector(
      '[data-dashboard-kpis]'
    );

  const gridTarget =
    page.querySelector(
      '[data-dashboard-grid]'
    );
  const drawerBackdrop = page.querySelector('[data-dashboard-drawer-backdrop]');
  const drawerTitle = page.querySelector('[data-dashboard-drawer-title]');
  const drawerSubtitle = page.querySelector('[data-dashboard-drawer-subtitle]');
  const drawerSummary = page.querySelector('[data-dashboard-drawer-summary]');
  const drawerBody = page.querySelector('[data-dashboard-drawer-body]');
  const drawerClose = page.querySelector('[data-dashboard-drawer-close]');
  let latestExecutive = null;
  let latestTracking = null;

  const caption =
    page.querySelector(
      '[data-period-caption]'
    );

  const dayField =
    page.querySelector(
      '[data-single-date]'
    );

  const startField =
    page.querySelector(
      '[data-start-date]'
    );

  const endField =
    page.querySelector(
      '[data-end-date]'
    );

  const dayInput =
    page.querySelector(
      '[name="dashboardDay"]'
    );

  const startInput =
    page.querySelector(
      '[name="dashboardStartDate"]'
    );

  const endInput =
    page.querySelector(
      '[name="dashboardEndDate"]'
    );

  function updatePeriodUi() {
    page
      .querySelectorAll(
        '[data-period-mode]'
      )
      .forEach(button => {
        button.classList.toggle(
          'is-active',
          button.dataset.periodMode
            === periodMode
        );
      });

    dayField.hidden =
      periodMode !== 'day';

    startField.hidden =
      periodMode !== 'range';

    endField.hidden =
      periodMode !== 'range';

    if (periodMode === 'today') {
      startDate = today;
      endDate = today;

      caption.textContent =
        `Hoje · ${formatDate(today)}`;

      return;
    }

    if (periodMode === 'day') {
      startDate =
        dayInput.value || today;

      endDate =
        startDate;

      caption.textContent =
        `Dia · ${formatDate(startDate)}`;

      return;
    }

    startDate =
      startInput.value || today;

    endDate =
      endInput.value || startDate;

    if (endDate < startDate) {
      endDate =
        startDate;

      endInput.value =
        endDate;
    }

    caption.textContent =
      `${formatDate(startDate)} → ${formatDate(endDate)}`;
  }

  function openDashboardDrawer(title, rows) { drawerTitle.textContent = title; drawerSubtitle.textContent = 'Período selecionado'; drawerSummary.innerHTML = `<div class="dashboard-v3-summary-item"><span>Registros</span><strong>${escapeHtml(formatNumber(rows.length, 0))}</strong></div>`; drawerBody.innerHTML = rows.length ? `<div class="dashboard-v3-table-wrap"><table class="dashboard-v3-table"><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="dashboard-v3-empty">Nenhum registro encontrado para esta seleção.</div>'; drawerBackdrop.hidden = false; requestAnimationFrame(() => drawerBackdrop.classList.add('is-open')); }
  function closeDashboardDrawer() { drawerBackdrop.classList.remove('is-open'); setTimeout(() => { if (!drawerBackdrop.classList.contains('is-open')) drawerBackdrop.hidden = true; }, 180); }
  function buildDashboardDetail(type, key) {
    const ex =
      latestExecutive || {};

    const tr =
      latestTracking || {};

    if (
      type === 'production' ||
      type === 'machine' ||
      type === 'material'
    ) {
      const items =
        (ex.production?.details || [])
          .filter(item => {
            if (!key) return true;

            if (type === 'machine') {
              return item.machineName === key;
            }

            if (type === 'material') {
              return (
                String(item.materialId || '') === key ||
                item.materialName === key ||
                item.materialCode === key
              );
            }

            return item.date === key;
          });

      return [
        type === 'machine' && key
          ? `Produção · ${key}`
          : type === 'material' && key
            ? 'Produções do material'
            : 'Produções realizadas',
        items.map(item => [
          formatDate(item.date),
          item.materialName,
          item.machineName,
          `${formatNumber(item.quantity)} ${item.unit || ''}`,
          item.realWeightKg === null
            ? '-'
            : formatKg(item.realWeightKg),
          formatNumber(item.people, 0)
        ])
      ];
    }

    if (
      type === 'quality' ||
      type === 'qualityMaterial'
    ) {
      const items =
        (ex.quality?.details || [])
          .filter(item => {
            if (
              type !== 'qualityMaterial' ||
              !key
            ) {
              return true;
            }

            return (
              String(item.materialId || '') === key ||
              item.materialName === key ||
              item.materialCode === key
            );
          });

      return [
        type === 'qualityMaterial' && key
          ? 'Aderência à NBR · material'
          : 'Aderência à NBR',
        items.map(item => [
          formatDate(item.date),
          item.materialName,
          item.machineName,
          item.normName,
          `${formatNumber(item.minimumKgM, 6)}–${formatNumber(item.maximumKgM, 6)} kg/m`,
          `${formatNumber(item.actualKgM, 6)} kg/m`,
          `${formatNumber(item.deviationPercent, 2)}%`,
          item.status
        ])
      ];
    }

    if (type === 'mesh') {
      return [
        'Malhas · peso real x teórico',
        (ex.mesh?.details || [])
          .filter(
            item =>
              !key ||
              String(item.materialId) === key ||
              item.materialName === key
          )
          .map(item => [
            formatDate(item.date),
            item.materialName,
            item.machineName,
            formatKg(item.theoreticalWeightKg),
            formatKg(item.realWeightKg)
          ])
      ];
    }

    if (type === 'purchases') {
      return [
        'Compras no período',
        (ex.purchases?.details || [])
          .filter(
            item =>
              !key ||
              item.supplier === key
          )
          .map(item => [
            formatDate(item.date),
            item.supplier,
            formatKg(item.weightKg)
          ])
      ];
    }

    if (type === 'transports') {
      return [
        'Transportes no período',
        (ex.transports?.details || [])
          .filter(
            item =>
              !key ||
              item.route === key
          )
          .map(item => [
            formatDate(item.date),
            item.route,
            item.materialName,
            formatKg(item.equivalentKg)
          ])
      ];
    }

    if (type === 'plan') {
      const plan =
        (tr.plans || [])
          .find(
            item =>
              String(
                item.planning_code ||
                item.plan_id ||
                ''
              ) === key
          );

      if (!plan) {
        return [
          'Plano de produção',
          []
        ];
      }

      return [
        `Plano · ${plan.planning_code || plan.plan_id || '-'}`,
        (plan.materials || [])
          .map(item => [
            item.material_name || '-',
            formatNumber(item.planned_qty),
            formatNumber(item.actual_qty),
            formatPercent(item.percent_done),
            item.status || '-'
          ])
      ];
    }

    if (type === 'unplannedMaterial') {
      const items =
        (tr.unplanned || [])
          .filter(
            item =>
              !isCanceled(item.status) &&
              (
                !key ||
                item.material_name === key ||
                item.material_code === key
              )
          );

      return [
        'Produções não planejadas · material',
        items.map(item => [
          formatDate(item.production_date),
          item.material_name || '-',
          formatNumber(item.actual_qty),
          item.actual_unit || '',
          item.status || '-'
        ])
      ];
    }

    const items =
      (
        type === 'unplanned'
          ? tr.unplanned
          : tr.rows
      || []
      )
        .filter(
          item =>
            !isCanceled(item.status) &&
            (
              !key ||
              dateKey(
                item.planned_date ||
                item.production_date
              ) === key
            )
        );

    return [
      type === 'unplanned'
        ? 'Produções não planejadas'
        : 'Planejado x Realizado',
      items.map(item => [
        formatDate(
          item.planned_date ||
          item.production_date
        ),
        item.material_name || '-',
        formatNumber(item.planned_qty),
        formatNumber(item.actual_qty),
        item.status || '-'
      ])
    ];
  }



  function renderKpis(
    executive,
    tracking
  ) {
    const quality =
      executive?.quality?.summary || {};

    const production =
      executive?.production?.summary || {};

    const rows =
      (tracking?.rows || [])
        .filter(
          row =>
            !isCanceled(row.status)
        );

    const unplanned =
      (tracking?.unplanned || [])
        .filter(
          row =>
            !isCanceled(row.status)
        );

    const plannedTotal =
      rows.reduce(
        (sum, row) =>
          sum +
          toNumber(row.planned_qty),
        0
      );

    const actualTotal =
      rows.reduce(
        (sum, row) =>
          sum +
          toNumber(row.actual_qty),
        0
      );

    const adherence =
      plannedTotal > 0
        ? (actualTotal / plannedTotal) * 100
        : 0;

    kpisTarget.innerHTML = `

      <article class="dashboard-v2-kpi">

        <span>
          Peso real produzido
        </span>

        <strong>
          ${escapeHtml(
            formatKg(
              production.realWeightKg
            )
          )}
        </strong>

        <small>
          ${formatNumber(
            production.productionCount,
            0
          )} produção(ões)
        </small>

      </article>

      <article class="dashboard-v2-kpi">

        <span>
          Aderência planejada
        </span>

        <strong>
          ${escapeHtml(
            formatPercent(adherence)
          )}
        </strong>

        <small>
          ${formatNumber(
            actualTotal
          )} realizado
        </small>

      </article>

      <article class="dashboard-v2-kpi">

        <span>
          Conformidade NBR
        </span>

        <strong>
          ${escapeHtml(
            formatPercent(
              quality.compliancePercent
            )
          )}
        </strong>

        <small>
          ${formatNumber(
            quality.evaluatedProductions,
            0
          )} produção(ões) avaliadas
        </small>

      </article>

      <article class="dashboard-v2-kpi">

        <span>
          Não planejadas
        </span>

        <strong>
          ${formatNumber(
            unplanned.length,
            0
          )}
        </strong>

        <small>
          produção(ões) no período
        </small>

      </article>
    `;
  }

  function renderGrid(
    executive,
    tracking
  ) {
    const production =
      executive?.production || {};

    const quality =
      executive?.quality || {};

    const purchases =
      executive?.purchases || {};

    const transports =
      executive?.transports || {};

    const mesh =
      executive?.mesh || {};

    const rows =
      (tracking?.rows || [])
        .filter(
          row =>
            !isCanceled(row.status)
        );

    const plans =
      (tracking?.plans || [])
        .filter(
          plan =>
            !isCanceled(plan.status)
        );

    const unplanned =
      (tracking?.unplanned || [])
        .filter(
          row =>
            !isCanceled(row.status)
        );

    gridTarget.innerHTML = `

      <article
        class="dashboard-v2-card dashboard-v2-card-wide"
      >

        <header>

          <div>
            <span>
              Produção
            </span>

            <h2>
              Peso real produzido por dia
            </h2>
          </div>

          <strong>
            ${formatKg(
              production
                ?.summary
                ?.realWeightKg
            )}
          </strong>

        </header>

        ${productionBars(
          production.daily || []
        )}

      </article>

      <article class="dashboard-v2-card">

        <header>

          <div>

            <span>
              Qualidade
            </span>

            <h2>
              Conformidade NBR
            </h2>

          </div>

        </header>

        ${qualityDonut(
          quality.summary || {}
        )}

      </article>

      <article
        class="dashboard-v2-card dashboard-v2-card-wide"
      >

        <header>

          <div>

            <span>
              Planejamento
            </span>

            <h2>
              Planejado x Realizado
            </h2>

          </div>

        </header>

        ${plannedActualBars(rows)}

      </article>

      <article class="dashboard-v2-card">

        <header>

          <div>

            <span>
              Produção
            </span>

            <h2>
              Máquinas com maior peso
            </h2>

          </div>

        </header>

        ${
          horizontalBars(
            production.byMachine || [],
            {
              value:
                row =>
                  toNumber(
                    row.realWeightKg ||
                    row.equivalentKg
                  ),

              label:
                row =>
                  row.machineName ||
                  'Sem máquina',

              meta:
                row =>
                  `${formatNumber(
                    row.productionCount,
                    0
                  )} produção(ões) · média ${formatNumber(
                    row.averagePeople,
                    1
                  )} pessoa(s)`,

              detailType:
                'machine',

              detailKey:
                row =>
                  row.machineName ||
                  'Sem máquina',

              format:
                formatKg
            }
          )
        }

      </article>

      <article
        class="dashboard-v2-card dashboard-v2-card-wide"
      >

        <header>

          <div>

            <span>
              Qualidade
            </span>

            <h2>
              Malhas · peso real x teórico
            </h2>

          </div>

          <strong>
            ${
              mesh
                ?.summary
                ?.evaluatedProductions

                ? `${formatNumber(
                    mesh.summary.differencePercent,
                    1
                  )}%`

                : '-'
            }
          </strong>

        </header>

        ${meshComparison(mesh)}

      </article>

      <article class="dashboard-v2-card">

        <header>

          <div>

            <span>
              Compras
            </span>

            <h2>
              Principais fornecedores
            </h2>

          </div>

          <strong>
            ${formatKg(
              purchases
                ?.summary
                ?.totalWeightKg
            )}
          </strong>

        </header>

        ${
          horizontalBars(
            purchases.bySupplier || [],
            {
              value:
                row =>
                  toNumber(
                    row.weightKg
                  ),

              label:
                row =>
                  row.supplier ||
                  'Sem fornecedor',

              meta:
                row =>
                  `${formatNumber(
                    row.purchaseCount,
                    0
                  )} recebimento(s)`,

              detailType:
                'purchases',

              detailKey:
                row =>
                  row.supplier ||
                  'Sem fornecedor',

              format:
                formatKg,

              limit:
                5
            }
          )
        }

      </article>

      <article class="dashboard-v2-card">

        <header>

          <div>

            <span>
              Transportes
            </span>

            <h2>
              Rotas movimentadas
            </h2>

          </div>

          <strong>
            ${formatNumber(
              transports
                ?.summary
                ?.transportCount,
              0
            )}
          </strong>

        </header>

        ${
          horizontalBars(
            transports.byRoute || [],
            {
              value:
                row =>
                  toNumber(
                    row.equivalentKg
                  ),

              label:
                row =>
                  row.route || '-',

              meta:
                row =>
                  `${formatNumber(
                    row.transportCount,
                    0
                  )} transporte(s)`,

              detailType:
                'transports',

              detailKey:
                row =>
                  row.route || '-',

              format:
                formatKg,

              limit:
                5
            }
          )
        }

      </article>

      <article
        class="dashboard-v2-card dashboard-v2-card-wide"
      >

        <header>

          <div>

            <span>
              Produção
            </span>

            <h2>
              Produção por material
            </h2>

          </div>

          <strong>
            ${formatKg(
              production
                ?.summary
                ?.realWeightKg
            )}
          </strong>

        </header>

        ${
          horizontalBars(
            production.byMaterial || [],
            {
              value:
                row =>
                  toNumber(
                    row.realWeightKg ||
                    row.equivalentKg
                  ),

              label:
                row =>
                  row.materialName ||
                  'Sem material',

              meta:
                row =>
                  `${formatNumber(
                    row.quantity
                  )} ${row.primaryUnit || ''} · ${formatNumber(
                    row.productionCount,
                    0
                  )} produção(ões)`,

              detailType:
                'material',

              detailKey:
                row =>
                  String(
                    row.materialId ||
                    row.materialName ||
                    row.materialCode ||
                    ''
                  ),

              format:
                formatKg,

              limit:
                8
            }
          )
        }

      </article>


      <article
        class="dashboard-v2-card"
      >

        <header>

          <div>

            <span>
              Planejamento
            </span>

            <h2>
              Não planejadas por material
            </h2>

          </div>

          <strong>
            ${formatNumber(
              unplanned.length,
              0
            )}
          </strong>

        </header>

        ${unplannedByMaterialChart(
          unplanned
        )}

      </article>


      <article
        class="dashboard-v2-card dashboard-v2-card-wide"
      >

        <header>

          <div>

            <span>
              Qualidade
            </span>

            <h2>
              Faixa NBR por material
            </h2>

          </div>

          <strong>
            ${formatNumber(
              quality
                ?.summary
                ?.evaluatedProductions,
              0
            )} avaliações
          </strong>

        </header>

        ${qualityRangeChart(
          quality.byMaterial || []
        )}

      </article>


      <article
        class="dashboard-v2-card"
      >

        <header>

          <div>

            <span>
              Qualidade
            </span>

            <h2>
              Maiores desvios da massa nominal
            </h2>

          </div>

        </header>

        ${qualityDeviationChart(
          quality.byMaterial || []
        )}

      </article>


      <article
        class="dashboard-v2-card dashboard-v2-card-wide"
      >

        <header>

          <div>

            <span>
              Planejamento
            </span>

            <h2>
              Planejado x realizado por material
            </h2>

          </div>

        </header>

        ${plannedMaterialChart(
          rows
        )}

      </article>


      <article
        class="dashboard-v2-card"
      >

        <header>

          <div>

            <span>
              Planejamento
            </span>

            <h2>
              Aderência por plano
            </h2>

          </div>

          <strong>
            ${formatNumber(
              plans.length,
              0
            )} plano(s)
          </strong>

        </header>

        ${planAdherenceChart(
          plans
        )}

      </article>

      <article
        class="dashboard-v2-card dashboard-v2-card-wide dashboard-v2-planning-card"
      >

        <header>

          <div>

            <span>
              Planejamento
            </span>

            <h2>
              Visão do período
            </h2>

          </div>

        </header>

        <div class="dashboard-v2-planning-strip">

          <div>

            <strong>
              ${formatNumber(
                plans.length,
                0
              )}
            </strong>

            <span>
              planos
            </span>

          </div>

          <div>

            <strong>
              ${formatNumber(
                plans.filter(
                  plan =>
                    normalizeText(
                      plan.status
                    )
                    ===
                    normalizeText(
                      'Em andamento'
                    )
                ).length,
                0
              )}
            </strong>

            <span>
              em andamento
            </span>

          </div>

          <div>

            <strong>
              ${formatNumber(
                plans.filter(
                  plan =>
                    normalizeText(
                      plan.status
                    )
                    ===
                    normalizeText(
                      'Cumprido'
                    )
                ).length,
                0
              )}
            </strong>

            <span>
              cumpridos
            </span>

          </div>

          <div>

            <strong>
              ${formatNumber(
                unplanned.length,
                0
              )}
            </strong>

            <span>
              não planejadas
            </span>

          </div>

        </div>

      </article>
    `;
  }

  async function load() {
    updatePeriodUi();

    kpisTarget.innerHTML = '';

    setInternalLoading(
      gridTarget,
      'Carregando visão executiva...'
    );

    try {
      const query =
        new URLSearchParams({
          startDate,
          endDate
        }).toString();

      const [
        executive,
        tracking
      ] =
        await Promise.all([
          api(
            `/dashboard/executive?${query}`
          ),

          api(
            `/actuals/tracking?${query}`
          )
        ]);

      latestExecutive = executive;
      latestTracking = tracking;

      renderKpis(
        executive,
        tracking
      );

      renderGrid(
        executive,
        tracking
      );

    } catch (error) {
      setInternalError(
        gridTarget,
        error.message ||
        'Não foi possível carregar o Dashboard.'
      );

      window.dispatchEvent(
        new CustomEvent(
          'planejamento:toast',
          {
            detail:
              error.message ||
              error
          }
        )
      );
    }
  }

  page
    .querySelectorAll(
      '[data-period-mode]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          periodMode =
            button.dataset.periodMode;

          updatePeriodUi();

          load();
        }
      );
    });

  dayInput.addEventListener(
    'change',
    load
  );

  startInput.addEventListener(
    'change',
    load
  );

  endInput.addEventListener(
    'change',
    load
  );

  page.addEventListener('click', event => { const trigger=event.target.closest('[data-dashboard-detail]'); if(trigger&&page.contains(trigger)){const detail=buildDashboardDetail(trigger.dataset.dashboardDetail,trigger.dataset.dashboardKey||'');if(detail)openDashboardDrawer(...detail);} });
  page.addEventListener('keydown', event => { if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-dashboard-detail]')){if(event.key===' ')event.preventDefault();event.target.closest('[data-dashboard-detail]').click();}if(event.key==='Escape')closeDashboardDrawer(); });
  drawerClose.addEventListener('click',closeDashboardDrawer); drawerBackdrop.addEventListener('click',event=>{if(event.target===drawerBackdrop)closeDashboardDrawer();});
  updatePeriodUi();

  load();

  return page;
}
