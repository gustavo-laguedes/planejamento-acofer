import { api } from '../shared/api.js';

import {
  findMaterialById,
  selectMatchingMatrixRows
} from '../shared/planning-domain/planningLookups.js';

import {
  setInternalError,
  setInternalLoading
} from '../shared/InternalLoading.js';


const STYLE_ID = 'analysis-calculations-style-v2';


function ensureCss() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;

  style.textContent = `
    .analysis-calculations-panel {
      padding: 18px;
      overflow: hidden;
    }

    .analysis-calculations {
      display: grid;
      gap: 16px;
    }

    .analysis-calc-card,
    .analysis-calc-hero {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 10px 24px rgba(16, 24, 40, .05);
    }

    .analysis-calc-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 18px 20px;
      background: linear-gradient(
        135deg,
        #f8fbff,
        #f5fbf8
      );
    }

    .analysis-calc-hero h2,
    .analysis-calc-section-head h3 {
      margin: 0;
      color: var(--petroleum-dark);
    }

    .analysis-calc-hero h2 {
      font-size: 22px;
    }

    .analysis-calc-hero p,
    .analysis-calc-section-head p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }

    .analysis-calc-eyebrow {
      display: block;
      margin-bottom: 4px;
      color: #2563eb;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .analysis-calc-hero-badge {
      padding: 7px 11px;
      border: 1px solid #bbf7d0;
      border-radius: 999px;
      background: #ecfdf5;
      color: #166534;
      font-size: 10px;
      font-weight: 900;
    }

    .analysis-calc-card {
      display: grid;
      gap: 16px;
      padding: 18px;
    }

    .analysis-calc-section-head > div {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .analysis-calc-section-head > div > span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 9px;
      background: var(--petroleum-dark);
      color: #fff;
      font-size: 11px;
      font-weight: 900;
    }


    /* =====================================================
       CAMPOS SUPERIORES
       ===================================================== */

    .analysis-calc-controls {
  display: grid;

  grid-template-columns:
    minmax(300px, 1.3fr)
    minmax(300px, .8fr);

  gap: 12px;
  align-items: end;
}

    .analysis-calc-controls label,
    .analysis-calc-converter-grid label,
    .analysis-calc-flow-settings label {
      display: grid;
      gap: 6px;
      min-width: 0;
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
    }

    .analysis-calc-controls input,
    .analysis-calc-converter-grid input,
    .analysis-calc-converter-grid select,
    .analysis-calc-flow-settings select {
      width: 100%;
      min-width: 0;
      min-height: 40px;
    }

    .analysis-calc-input-unit {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    auto
    38px;

  gap: 8px;

  align-items: center;
}

    .analysis-calc-input-unit > span {
      min-width: 42px;
      padding: 10px 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      color: #334155;
      font-size: 11px;
      font-weight: 900;
      text-align: center;
    }

    .analysis-calc-run-button {
  width: 40px;
  height: 40px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  padding: 0;

  border: 1px solid #c7d2e4;
  border-radius: 999px;

  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  color: #2563eb;

  cursor: pointer;

  box-shadow:
    0 6px 16px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);

  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.analysis-calc-run-button:hover {
  transform: translateY(-1px);
  border-color: #93c5fd;
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
  color: #1d4ed8;
  box-shadow:
    0 8px 18px rgba(37, 99, 235, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.analysis-calc-run-button:active {
  transform: translateY(0);
  box-shadow:
    0 3px 8px rgba(37, 99, 235, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.analysis-calc-run-button svg {
  width: 18px;
  height: 18px;
  display: block;
  stroke-linecap: round;
  stroke-linejoin: round;
}


    /* =====================================================
       CARDS DE RESUMO
       ===================================================== */

    .analysis-calc-summary {
      display: grid;
      grid-template-columns:
        repeat(
          4,
          minmax(0, 1fr)
        );
      gap: 10px;
    }

    .analysis-calc-summary article {
      display: grid;
      gap: 5px;
      min-height: 68px;
      padding: 11px 13px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #f8fafc;
    }

    .analysis-calc-summary span,
    .analysis-calc-flow-quantity span,
    .analysis-calc-flow-time span,
    .analysis-calc-converter-result > span {
      color: #64748b;
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .analysis-calc-summary strong {
      color: var(--petroleum-dark);
      font-size: 16px;
    }


    /* =====================================================
       BUSCA DE MATERIAL
       ===================================================== */

    .analysis-calc-material-search {
      position: relative;
      width: 100%;
    }

    .analysis-calc-material-search input {
      width: 100%;
    }

    .analysis-calc-material-results {
      position: absolute;
      top: calc(100% + 5px);
      left: 0;
      right: 0;

      z-index: 1000;

      max-height: 300px;
      overflow-y: auto;

      border: 1px solid #cbd5e1;
      border-radius: 10px;

      background: #fff;

      box-shadow:
        0 16px 34px
        rgba(15, 23, 42, .16);
    }

    .analysis-calc-material-results[hidden] {
      display: none;
    }

    .analysis-calc-material-option {
      width: 100%;

      display: grid;
      gap: 2px;

      padding: 10px 12px;

      border: 0;
      border-bottom: 1px solid #e2e8f0;

      background: #fff;

      color: #1e293b;

      text-align: left;

      cursor: pointer;
    }

    .analysis-calc-material-option:last-child {
      border-bottom: 0;
    }

    .analysis-calc-material-option:hover {
      background: #f1f5f9;
    }

    .analysis-calc-material-option strong {
      font-size: 12px;
      font-weight: 800;
    }

    .analysis-calc-material-option small,
    .analysis-calc-material-empty {
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
    }

    .analysis-calc-material-empty {
      padding: 12px;
    }


    /* =====================================================
       FLUXO HORIZONTAL
       ===================================================== */

    .analysis-calc-flow-shell {
      width: 100%;

      overflow-x: auto;

      padding: 16px;

      border: 1px solid #e5edf6;
      border-radius: 16px;

      background:
        linear-gradient(
          180deg,
          #fbfdff,
          #fff
        );
    }

    .analysis-calc-flow {
      display: flex;

      align-items: stretch;

      gap: 12px;

      width: max-content;
      min-width: 100%;
    }

    .analysis-calc-flow-column {
      width: 250px;
      min-width: 250px;

      display: flex;

      flex-direction: column;

      gap: 10px;
    }

    .analysis-calc-flow-column-title {
      padding: 5px 10px;

      border-radius: 999px;

      background: #f1f5f9;

      color: #64748b;

      font-size: 9px;
      font-weight: 900;

      letter-spacing: .05em;

      text-align: center;
      text-transform: uppercase;
    }

    .analysis-calc-flow-column-cards {
      flex: 1;

      display: flex;

      flex-direction: column;

      justify-content: center;

      gap: 14px;
    }

    .analysis-calc-flow-arrow {
      width: 34px;
      min-width: 34px;

      display: flex;

      align-items: center;
      justify-content: center;
    }

    .analysis-calc-flow-arrow span {
      display: inline-flex;

      align-items: center;
      justify-content: center;

      width: 28px;
      height: 28px;

      border: 1px solid #bfdbfe;
      border-radius: 999px;

      background: #eff6ff;

      color: #2563eb;

      font-size: 18px;
      font-weight: 900;
    }


    /* =====================================================
       CARDS DO FLUXO
       ===================================================== */

    .analysis-calc-flow-card {
      --calc-accent: #2563eb;
      --calc-soft: #eff6ff;
      --calc-border-soft: #bfdbfe;

      display: grid;

      gap: 10px;

      padding: 11px;

      border:
        1px solid
        var(--calc-border-soft);

      border-top:
        4px solid
        var(--calc-accent);

      border-radius: 14px;

      background:
        linear-gradient(
          145deg,
          var(--calc-soft),
          #fff 68%
        );

      box-shadow:
        0 8px 20px
        rgba(15, 23, 42, .06);
    }

    .analysis-calc-flow-card-head {
      display: flex;

      align-items: flex-start;
      justify-content: space-between;

      gap: 8px;
    }

    .analysis-calc-flow-card-head > div:first-child {
      min-width: 0;

      display: grid;

      gap: 4px;
    }

    .analysis-calc-node-stage {
      width: fit-content;

      padding: 3px 8px;

      border-radius: 999px;

      background: var(--calc-accent);

      color: #fff;

      font-size: 9px;
      font-weight: 900;
    }

    .analysis-calc-flow-card-head strong {
      color: #172033;

      font-size: 13px;

      line-height: 1.18;
    }

    .analysis-calc-flow-card-head small {
      color: #64748b;

      font-size: 8px;
    }

    .analysis-calc-flow-quantity {
      flex: 0 0 auto;

      min-width: 80px;

      display: grid;

      gap: 2px;

      padding: 6px 7px;

      border:
        1px solid
        var(--calc-border-soft);

      border-radius: 9px;

      background:
        rgba(
          255,
          255,
          255,
          .84
        );

      text-align: right;
    }

    .analysis-calc-flow-quantity strong {
      color: #172033;

      font-size: 12px;
    }

    .analysis-calc-flow-quantity small {
      color: #64748b;

      font-size: 8px;
    }

    .analysis-calc-flow-settings {
      display: grid;

      grid-template-columns:
        repeat(
          2,
          minmax(0, 1fr)
        );

      gap: 7px;
    }

    .analysis-calc-flow-settings select,
    .analysis-calc-readonly {
      width: 100%;

      min-width: 0;
      min-height: 32px;

      padding: 5px 6px;

      border: 1px solid #dbe3ec;
      border-radius: 8px;

      background:
        rgba(
          255,
          255,
          255,
          .9
        );

      color: #334155;

      font-size: 9px;
      font-weight: 800;
    }

    .analysis-calc-flow-time {
      grid-column: 1 / -1;

      display: grid;

      gap: 3px;

      padding: 7px 8px;

      border:
        1px solid
        var(--calc-border-soft);

      border-radius: 9px;

      background:
        rgba(
          255,
          255,
          255,
          .9
        );
    }

    .analysis-calc-flow-time strong {
      color: #172033;

      font-size: 14px;
    }


    /* =====================================================
       CONVERSOR
       ===================================================== */

    .analysis-calc-converter-card {
      position: relative;

      overflow: visible;

      border-top:
        4px solid #0ea5e9;

      background:
        linear-gradient(
          135deg,
          #eff8ff,
          #fff 52%,
          #ecfdf5
        );
    }

    .analysis-calc-converter-grid {
      display: grid;

      grid-template-columns:
        minmax(260px, 1.4fr)
        minmax(190px, .8fr)
        minmax(180px, .75fr)
        minmax(250px, 1fr);

      gap: 12px;

      align-items: end;

      padding: 14px;

      border:
        1px solid #d8e6f2;

      border-radius: 14px;

      background:
        rgba(
          255,
          255,
          255,
          .78
        );
    }

    .analysis-calc-converter-result {
      min-height: 82px;

      display: grid;

      align-content: center;

      gap: 3px;

      padding: 12px 14px;

      border:
        1px solid #bbf7d0;

      border-left:
        4px solid #16a34a;

      border-radius: 12px;

      background:
        linear-gradient(
          135deg,
          #ecfdf5,
          #fff
        );

      color: #334155;
    }

    .analysis-calc-converter-result strong {
      color: #166534;

      font-size: 22px;
    }

    .analysis-calc-converter-result small {
      color: #15803d;

      font-size: 10px;
    }


    /* =====================================================
       ESTADO VAZIO
       ===================================================== */

    .analysis-calc-empty {
      padding: 26px;

      border:
        1px dashed #cbd5e1;

      border-radius: 12px;

      color: #64748b;

      text-align: center;

      font-size: 12px;
    }


    /* =====================================================
       RESPONSIVO
       ===================================================== */

    @media (
      max-width: 1180px
    ) {
      .analysis-calc-summary,
      .analysis-calc-converter-grid {
        grid-template-columns:
          repeat(
            2,
            minmax(0, 1fr)
          );
      }
    }

    @media (
      max-width: 760px
    ) {
      .analysis-calc-controls,
      .analysis-calc-summary,
      .analysis-calc-converter-grid,
      .analysis-calc-flow-settings {
        grid-template-columns: 1fr;
      }

      .analysis-calc-hero {
        align-items: stretch;

        flex-direction: column;
      }
    }
  `;

  document.head.appendChild(style);
}


function escapeHtml(value) {
  return String(
    value ?? ''
  ).replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]
  );
}


function formatNumber(
  value,
  maximumFractionDigits = 3
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return '-';
  }

  return new Intl.NumberFormat(
    'pt-BR',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits
    }
  ).format(number);
}


function formatSeconds(
  seconds
) {
  const value =
    Number(seconds);

  if (
    !Number.isFinite(value)
    ||
    value <= 0
  ) {
    return 'Não estimado';
  }

  const minutesTotal =
    Math.max(
      Math.round(
        value / 60
      ),
      1
    );

  const days =
    Math.floor(
      minutesTotal / 1440
    );

  const hours =
    Math.floor(
      (
        minutesTotal
        %
        1440
      )
      /
      60
    );

  const minutes =
    minutesTotal
    %
    60;

  const parts = [];

  if (days) {
    parts.push(
      `${days}d`
    );
  }

  if (hours) {
    parts.push(
      `${hours}h`
    );
  }

  if (
    minutes
    ||
    !parts.length
  ) {
    parts.push(
      `${minutes}min`
    );
  }

  return parts.join(' ');
}


function materialCodes(
  material = {}
) {
  return Array.isArray(
    material.codes
  )
    ? material.codes
        .map(
          code =>
            String(
              code || ''
            ).trim()
        )
        .filter(Boolean)
    : [];
}


function materialPrimaryUnit(
  material = {}
) {
  return String(
    material.primary_unit
    ??
    material.primaryUnit
    ??
    ''
  ).trim();
}


function materialSecondaryUnit(
  material = {}
) {
  return String(
    material.secondary_unit
    ??
    material.secondaryUnit
    ??
    ''
  ).trim();
}


function materialFactor(
  material = {}
) {
  const factor =
    Number(
      material
        .primary_to_secondary_factor
      ??
      material
        .primaryToSecondaryFactor
    );

  return Number.isFinite(
    factor
  )
    &&
    factor > 0
      ? factor
      : null;
}


function productionModelsFor(
  material = {}
) {
  return Array.isArray(
    material.production_models
  )
    ? material.production_models
        .filter(
          model =>
            Array.isArray(
              model.inputMaterials
            )
            &&
            model.inputMaterials.length
        )
    : [];
}


function matrixPriority(
  row = {}
) {
  const priority =
    Number(
      row.machine_priority
      ??
      row.machinePriority
      ??
      1
    );

  return Number.isFinite(
    priority
  )
    &&
    priority > 0
      ? priority
      : 1;
}


function matrixSecondsPerUnit(
  row = {}
) {
  const outputQty =
    Number(
      row.output_qty
      ??
      row.outputQty
    );

  const timeSeconds =
    Number(
      row.time_seconds
      ??
      row.timeSeconds
      ??
      Number(
        row.time_minutes
        ??
        row.timeMinutes
        ??
        0
      )
      *
      60
    );

  if (
    !(outputQty > 0)
    ||
    !(timeSeconds > 0)
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (
    timeSeconds
    /
    outputQty
  );
}


function weightPerUnit(
  material = {}
) {
  const primary =
    materialPrimaryUnit(
      material
    );

  const secondary =
    materialSecondaryUnit(
      material
    );

  const factor =
    materialFactor(
      material
    );

  if (!factor) {
    return null;
  }

  if (
    primary === 'un'
    &&
    secondary === 'kg'
  ) {
    return factor;
  }

  if (
    primary === 'kg'
    &&
    secondary === 'un'
  ) {
    return 1 / factor;
  }

  return null;
}


function weightForPrimaryQuantity(
  material = {},
  quantity = 0
) {
  const qty =
    Number(quantity);

  if (
    !Number.isFinite(qty)
  ) {
    return null;
  }

  const primary =
    materialPrimaryUnit(
      material
    );

  const secondary =
    materialSecondaryUnit(
      material
    );

  const factor =
    materialFactor(
      material
    );

  if (
    primary === 'kg'
  ) {
    return qty;
  }

  if (
    primary === 'un'
    &&
    secondary === 'kg'
    &&
    factor
  ) {
    return qty * factor;
  }

  return null;
}


function materialSearchLabel(
  material = {}
) {
  const codes =
    materialCodes(
      material
    );

  return `${
    material.name
    ||
    'Material'
  }${
    codes.length
      ? ` — ${
          codes.join(', ')
        }`
      : ''
  }`;
}


function uniqueMachines(
  rows = []
) {
  return [
    ...new Set(
      rows
        .map(
          row =>
            String(
              row.machine_name
              ??
              row.machineName
              ??
              ''
            ).trim()
        )
        .filter(Boolean)
    )
  ];
}


function uniquePeople(
  rows = []
) {
  return [
    ...new Set(
      rows
        .map(
          row =>
            Number(
              row.people_count
              ??
              row.peopleCount
            )
        )
        .filter(
          value =>
            Number.isInteger(
              value
            )
            &&
            value >= 0
        )
    )
  ].sort(
    (
      a,
      b
    ) =>
      a - b
  );
}


function calculationRowFor({
  rows = [],
  machineName = '',
  peopleCount = null
} = {}) {
  const machineRows =
    machineName
      ? rows.filter(
          row =>
            String(
              row.machine_name
              ??
              row.machineName
              ??
              ''
            )
            ===
            String(
              machineName
            )
        )
      : rows;

  const peopleRows =
    (
      peopleCount !== null
      &&
      peopleCount !== undefined
      &&
      peopleCount !== ''
    )
      ? machineRows.filter(
          row =>
            Number(
              row.people_count
              ??
              row.peopleCount
            )
            ===
            Number(
              peopleCount
            )
        )
      : machineRows;

  return [
    ...peopleRows
  ]
    .sort(
      (
        a,
        b
      ) =>
        matrixPriority(a)
        -
        matrixPriority(b)
        ||
        matrixSecondsPerUnit(a)
        -
        matrixSecondsPerUnit(b)
    )[0]
    ||
    null;
}


function safeNodeKey(
  path = []
) {
  return path
    .map(
      value =>
        String(value)
          .replace(
            /[^a-z0-9_-]/gi,
            '_'
          )
    )
    .join('__');
}


function stageMeta(
  material = {}
) {
  const name =
    String(
      material.name || ''
    ).toLowerCase();

  if (
    name.includes(
      'bobina'
    )
  ) {
    return {
      label: 'Bobina',
      accent: '#2563eb',
      soft: '#eff6ff',
      border: '#93c5fd'
    };
  }

  if (
    /(longitudinal|transversal|dobrado|reto)/.test(
      name
    )
  ) {
    return {
      label: 'Vareta',
      accent: '#f97316',
      soft: '#fff7ed',
      border: '#fdba74'
    };
  }

  if (
    /^q-/.test(name)
    ||
    /^eq-/.test(name)
    ||
    /malha/.test(name)
  ) {
    return {
      label: 'Malha',
      accent: '#7c3aed',
      soft: '#f5f3ff',
      border: '#c4b5fd'
    };
  }

  return {
    label: 'Etapa',
    accent: '#475569',
    soft: '#f8fafc',
    border: '#cbd5e1'
  };
}


function buildCalculationTree({
  materials = [],
  matrix = [],
  materialId,
  quantity,
  nodeSettings = new Map(),
  path = ['root'],
  ancestors = new Set()
} = {}) {
  const material =
    findMaterialById(
      materials,
      materialId
    );

  if (!material) {
    return null;
  }

  const nodeKey =
    safeNodeKey([
      ...path,
      material.id
    ]);

  const models =
    productionModelsFor(
      material
    );

  const currentSettings =
    nodeSettings.get(
      nodeKey
    )
    ||
    {};

  const selectedModel =
    models.find(
      model =>
        String(
          model.name
        )
        ===
        String(
          currentSettings.modelName
        )
    )
    ||
    models[0]
    ||
    null;

  const matrixRows =
    selectMatchingMatrixRows(
      matrix,
      material,
      {
        getPriority:
          matrixPriority,

        getSecondsPerUnit:
          matrixSecondsPerUnit
      }
    );

  const machines =
    uniqueMachines(
      matrixRows
    );

  const selectedMachine =
    machines.includes(
      currentSettings.machineName
    )
      ? currentSettings.machineName
      : (
          machines[0]
          ||
          ''
        );

  const rowsForMachine =
    selectedMachine
      ? matrixRows.filter(
          row =>
            String(
              row.machine_name
              ??
              row.machineName
              ??
              ''
            )
            ===
            selectedMachine
        )
      : matrixRows;

  const peopleOptions =
    uniquePeople(
      rowsForMachine
    );

  const selectedPeople =
    peopleOptions.includes(
      Number(
        currentSettings.peopleCount
      )
    )
      ? Number(
          currentSettings.peopleCount
        )
      : (
          peopleOptions[0]
          ??
          null
        );

  const selectedProductivity =
    calculationRowFor({
      rows:
        matrixRows,

      machineName:
        selectedMachine,

      peopleCount:
        selectedPeople
    });

  nodeSettings.set(
    nodeKey,
    {
      ...currentSettings,

      modelName:
        selectedModel?.name
        ||
        '',

      machineName:
        selectedMachine,

      peopleCount:
        selectedPeople
    }
  );

  const requiredQty =
    Number(
      quantity || 0
    );

  const estimatedSeconds =
    selectedProductivity
    &&
    requiredQty > 0
      ? requiredQty
        *
        matrixSecondsPerUnit(
          selectedProductivity
        )
      : null;

  const estimatedWeight =
    weightForPrimaryQuantity(
      material,
      requiredQty
    );

  const nextAncestors =
    new Set(
      ancestors
    );

  const cycle =
    nextAncestors.has(
      String(
        material.id
      )
    );

  nextAncestors.add(
    String(
      material.id
    )
  );

  const children =
    cycle
    ||
    !selectedModel
      ? []
      : (
          selectedModel.inputMaterials
          ||
          []
        )
          .map(
            (
              input,
              index
            ) => {
              const inputMaterialId =
                input.inputMaterialId
                ??
                input.id;

              const inputQty =
                requiredQty
                *
                Number(
                  input.qtyPerOutput
                  ||
                  0
                );

              return buildCalculationTree({
                materials,

                matrix,

                materialId:
                  inputMaterialId,

                quantity:
                  inputQty,

                nodeSettings,

                path: [
                  ...path,
                  `${material.id}-${index}`
                ],

                ancestors:
                  nextAncestors
              });
            }
          )
          .filter(Boolean);

  return {
    nodeKey,

    material,

    requiredQty,

    estimatedWeight,

    models,

    selectedModel,

    matrixRows,

    machines,

    selectedMachine,

    peopleOptions,

    selectedPeople,

    selectedProductivity,

    estimatedSeconds,

    children,

    cycle
  };
}


function flattenTree(
  root
) {
  if (!root) {
    return [];
  }

  return [
    root,

    ...(
      root.children
      ||
      []
    ).flatMap(
      flattenTree
    )
  ];
}


function isPurchasedLeaf(
  node
) {
  if (!node) {
    return true;
  }

  const hasProductionModel =
    Boolean(
      node.selectedModel
    );

  const hasMatrix =
    Array.isArray(
      node.matrixRows
    )
    &&
    node.matrixRows.length > 0;

  return (
    !hasProductionModel
    &&
    !hasMatrix
  );
}


function buildFlowColumns(
  root
) {
  if (!root) {
    return [];
  }

  const occurrences = [];

  function walk(
    node,
    depth = 0
  ) {
    if (!node) {
      return;
    }

    /*
     * Não mostramos matéria-prima comprada.
     *
     * Exemplo:
     * Fio Máquina.
     */
    if (
      !isPurchasedLeaf(
        node
      )
    ) {
      occurrences.push({
        node,
        depth
      });
    }

    (
      node.children
      ||
      []
    ).forEach(
      child =>
        walk(
          child,
          depth + 1
        )
    );
  }

  walk(
    root,
    0
  );

  /*
   * Unifica materiais iguais.
   *
   * Exemplo:
   *
   * Longitudinal usa CA60 3,4 Bobina
   * Transversal usa CA60 3,4 Bobina
   *
   * Resultado:
   * aparece somente uma bobina
   * e a necessidade é somada.
   */
  const grouped =
    new Map();

  occurrences.forEach(
    ({
      node,
      depth
    }) => {
      const materialKey =
        String(
          node.material?.id
          ||
          node.material?.name
          ||
          node.nodeKey
        );

      let group =
        grouped.get(
          materialKey
        );

      if (!group) {
        group = {
          materialKey,

          material:
            node.material,

          depth,

          nodes:
            [],

          nodeKeys:
            [],

          requiredQty:
            0,

          estimatedWeight:
            0,

          hasWeight:
            false,

          estimatedSeconds:
            0,

          hasTime:
            false
        };

        grouped.set(
          materialKey,
          group
        );
      }

      group.depth =
        Math.max(
          group.depth,
          depth
        );

      group.nodes.push(
        node
      );

      group.nodeKeys.push(
        node.nodeKey
      );

      group.requiredQty +=
        Number(
          node.requiredQty
          ||
          0
        );

      if (
        Number.isFinite(
          Number(
            node.estimatedWeight
          )
        )
      ) {
        group.estimatedWeight +=
          Number(
            node.estimatedWeight
          );

        group.hasWeight = true;
      }

      if (
        Number.isFinite(
          Number(
            node.estimatedSeconds
          )
        )
        &&
        Number(
          node.estimatedSeconds
        ) > 0
      ) {
        group.estimatedSeconds +=
          Number(
            node.estimatedSeconds
          );

        group.hasTime = true;
      }
    }
  );

  const byDepth =
    new Map();

  grouped.forEach(
    group => {
      if (
        !byDepth.has(
          group.depth
        )
      ) {
        byDepth.set(
          group.depth,
          []
        );
      }

      byDepth
        .get(
          group.depth
        )
        .push(
          group
        );
    }
  );

  /*
   * Profundidade maior primeiro.
   *
   * Isso gera:
   *
   * BOBINA → VARETAS → MATERIAL FINAL
   */
  return [
    ...byDepth.entries()
  ]
    .sort(
      (
        [a],
        [b]
      ) =>
        b - a
    )
    .map(
      (
        [
          depth,
          groups
        ]
      ) => ({
        depth,
        groups
      })
    );
}


function renderFlowCard(
  group
) {
  const node =
    group.nodes[0];

  const material =
    group.material;

  const stage =
    stageMeta(
      material
    );

  const primaryUnit =
    materialPrimaryUnit(
      material
    )
    ||
    node
      .selectedProductivity
      ?.output_unit
    ||
    '';

  const codes =
    materialCodes(
      material
    );

  const modelOptions =
    node.models
      .map(
        model => `
          <option
            value="${escapeHtml(
              model.name
            )}"
            ${
              String(
                model.name
              )
              ===
              String(
                node
                  .selectedModel
                  ?.name
                ||
                ''
              )
                ? 'selected'
                : ''
            }
          >
            ${escapeHtml(
              model.name
            )}
          </option>
        `
      )
      .join('');

  const machineOptions =
    node.machines
      .map(
        machine => `
          <option
            value="${escapeHtml(
              machine
            )}"
            ${
              machine
              ===
              node.selectedMachine
                ? 'selected'
                : ''
            }
          >
            ${escapeHtml(
              machine
            )}
          </option>
        `
      )
      .join('');

  const peopleOptions =
    node.peopleOptions
      .map(
        people => `
          <option
            value="${people}"
            ${
              Number(people)
              ===
              Number(
                node.selectedPeople
              )
                ? 'selected'
                : ''
            }
          >
            ${people}
          </option>
        `
      )
      .join('');

  return `
    <article
      class="analysis-calc-flow-card"
      data-calc-node-keys="${escapeHtml(
        group.nodeKeys.join('|')
      )}"
      style="
        --calc-accent:${stage.accent};
        --calc-soft:${stage.soft};
        --calc-border-soft:${stage.border};
      "
    >
      <header
        class="analysis-calc-flow-card-head"
      >
        <div>

          <span
            class="analysis-calc-node-stage"
          >
            ${escapeHtml(
              stage.label
            )}
          </span>

          <strong>
            ${escapeHtml(
              material.name
              ||
              ''
            )}
          </strong>

          ${
            codes.length
              ? `
                <small>
                  ${escapeHtml(
                    codes.join(', ')
                  )}
                </small>
              `
              : ''
          }

        </div>


        <div
          class="analysis-calc-flow-quantity"
        >
          <span>
            Necessário
          </span>

          <strong>
            ${formatNumber(
              group.requiredQty
            )}
            ${escapeHtml(
              primaryUnit
            )}
          </strong>

          ${
            group.hasWeight
            &&
            primaryUnit !== 'kg'
              ? `
                <small>
                  ${formatNumber(
                    group.estimatedWeight
                  )}
                  kg
                </small>
              `
              : ''
          }
        </div>
      </header>


      <div
        class="analysis-calc-flow-settings"
      >

        <label>
          Modelo

          ${
            node.models.length > 1
              ? `
                <select
                  data-calc-node-model
                >
                  ${modelOptions}
                </select>
              `
              : `
                <div
                  class="analysis-calc-readonly"
                >
                  ${escapeHtml(
                    node
                      .selectedModel
                      ?.name
                    ||
                    'Sem modelo'
                  )}
                </div>
              `
          }
        </label>


        <label>
          Máquina

          ${
            node.machines.length
              ? `
                <select
                  data-calc-node-machine
                >
                  ${machineOptions}
                </select>
              `
              : `
                <div
                  class="analysis-calc-readonly"
                >
                  Não estimada
                </div>
              `
          }
        </label>


        <label>
          Pessoas

          ${
            node.peopleOptions.length
              ? `
                <select
                  data-calc-node-people
                >
                  ${peopleOptions}
                </select>
              `
              : `
                <div
                  class="analysis-calc-readonly"
                >
                  —
                </div>
              `
          }
        </label>


        <div
          class="analysis-calc-flow-time"
        >
          <span>
            Tempo estimado
          </span>

          <strong>
            ${
              group.hasTime
                ? formatSeconds(
                    group.estimatedSeconds
                  )
                : 'Não estimado'
            }
          </strong>
        </div>

      </div>
    </article>
  `;
}


function renderProductionFlow(
  root
) {
  const columns =
    buildFlowColumns(
      root
    );

  if (!columns.length) {
    return '';
  }

  return `
    <div
      class="analysis-calc-flow-shell"
    >
      <div
        class="analysis-calc-flow"
      >

        ${
          columns
            .map(
              (
                column,
                index
              ) => {
                const labels =
                  [
                    ...new Set(
                      column.groups
                        .map(
                          group =>
                            stageMeta(
                              group.material
                            ).label
                        )
                    )
                  ];

                const title =
                  column.depth === 0
                    ? 'Material final'
                    : (
                        labels.length === 1
                          ? labels[0]
                          : 'Etapa produtiva'
                      );

                return `
                  <section
                    class="analysis-calc-flow-column"
                  >
                    <div
                      class="analysis-calc-flow-column-title"
                    >
                      ${escapeHtml(
                        title
                      )}
                    </div>

                    <div
                      class="analysis-calc-flow-column-cards"
                    >
                      ${
                        column.groups
                          .map(
                            renderFlowCard
                          )
                          .join('')
                      }
                    </div>
                  </section>

                  ${
                    index
                    <
                    columns.length - 1
                      ? `
                        <div
                          class="analysis-calc-flow-arrow"
                        >
                          <span>
                            →
                          </span>
                        </div>
                      `
                      : ''
                  }
                `;
              }
            )
            .join('')
        }

      </div>
    </div>
  `;
}


function converterResult(
  material,
  mode,
  rawValue
) {
  const value =
    Number(
      rawValue
    );

  if (
    !material
    ||
    !Number.isFinite(value)
    ||
    value < 0
  ) {
    return {
      available: false,
      message:
        'Informe um valor válido.'
    };
  }

  const kgPerUnit =
    weightPerUnit(
      material
    );

  if (
    !(kgPerUnit > 0)
  ) {
    return {
      available: false,

      message:
        'Este material não possui conversão entre unidade e kg no cadastro.'
    };
  }

  if (
    mode
    ===
    'weight-to-qty'
  ) {
    return {
      available: true,

      value:
        value
        /
        kgPerUnit,

      unit:
        'un',

      equivalence:
        kgPerUnit
    };
  }

  return {
    available: true,

    value:
      value
      *
      kgPerUnit,

    unit:
      'kg',

    equivalence:
      kgPerUnit
  };
}


export function AnalysisCalculationsPanel() {
  ensureCss();

  const panel =
    document.createElement(
      'div'
    );

  panel.className =
    'panel analysis-calculations-panel';

  panel.innerHTML =
    '<div class="analysis-calculations-target"></div>';

  const target =
    panel.querySelector(
      '.analysis-calculations-target'
    );

  const state = {
    loaded:
      false,

    loading:
      false,

    materials:
      [],

    matrix:
      [],

    rootMaterialId:
      '',

    rootMaterialSearch:
      '',

    rootQuantity:
      '',

    nodeSettings:
      new Map(),

    converterMaterialId:
      '',

    converterMaterialSearch:
      '',

    converterMode:
      'qty-to-weight',

    converterValue:
      ''
  };


  function ensureDefaults() {
    if (
      state.rootMaterialId
      &&
      !findMaterialById(
        state.materials,
        state.rootMaterialId
      )
    ) {
      state.rootMaterialId = '';

      state.rootMaterialSearch = '';

      state.nodeSettings =
        new Map();
    }

    if (
      state.converterMaterialId
      &&
      !findMaterialById(
        state.materials,
        state.converterMaterialId
      )
    ) {
      state.converterMaterialId = '';

      state.converterMaterialSearch = '';
    }
  }


  function searchMaterials(
    query = '',
    {
      onlyWithProductionModel = false
    } = {}
  ) {
    const normalized =
      String(
        query || ''
      )
        .trim()
        .toLowerCase();

    if (!normalized) {
      return [];
    }

    return state.materials
      .filter(
        material =>
          material?.active !== false
      )
      .filter(
        material =>
          !onlyWithProductionModel
          ||
          productionModelsFor(
            material
          ).length
      )
      .filter(
        material => {
          const name =
            String(
              material.name || ''
            ).toLowerCase();

          const codes =
            materialCodes(
              material
            )
              .join(' ')
              .toLowerCase();

          return (
            name.includes(
              normalized
            )
            ||
            codes.includes(
              normalized
            )
          );
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          String(
            a.name || ''
          ).localeCompare(
            String(
              b.name || ''
            ),
            'pt-BR',
            {
              numeric: true
            }
          )
      )
      .slice(
        0,
        25
      );
  }


  function updateSearchResults(
    input,
    type
  ) {
    const wrapper =
      input.closest(
        '.analysis-calc-material-search'
      );

    const box =
      wrapper?.querySelector(
        '[data-calc-material-results]'
      );

    if (!box) {
      return;
    }

    const query =
      String(
        input.value || ''
      ).trim();

    if (!query) {
      box.innerHTML = '';

      box.hidden = true;

      return;
    }

    const materials =
      searchMaterials(
        query,
        {
          onlyWithProductionModel:
            type === 'root'
        }
      );

    if (!materials.length) {
      box.innerHTML =
        `
          <div
            class="analysis-calc-material-empty"
          >
            Nenhum material encontrado.
          </div>
        `;

      box.hidden = false;

      return;
    }

    box.innerHTML =
      materials
        .map(
          material => {
            const codes =
              materialCodes(
                material
              );

            const label =
              materialSearchLabel(
                material
              );

            return `
              <button
                type="button"
                class="analysis-calc-material-option"
                data-calc-material-choice="${escapeHtml(
                  type
                )}"
                data-material-id="${escapeHtml(
                  material.id
                )}"
                data-material-label="${escapeHtml(
                  label
                )}"
              >
                <strong>
                  ${escapeHtml(
                    material.name
                    ||
                    ''
                  )}
                </strong>

                ${
                  codes.length
                    ? `
                      <small>
                        ${escapeHtml(
                          codes.join(', ')
                        )}
                      </small>
                    `
                    : ''
                }
              </button>
            `;
          }
        )
        .join('');

    box.hidden = false;
  }


  function buildTree() {
    const quantity =
      Number(
        state.rootQuantity
        ||
        0
      );

    if (
      !state.rootMaterialId
      ||
      !(quantity > 0)
    ) {
      return null;
    }

    return buildCalculationTree({
      materials:
        state.materials,

      matrix:
        state.matrix,

      materialId:
        state.rootMaterialId,

      quantity,

      nodeSettings:
        state.nodeSettings
    });
  }


  function render() {
    ensureDefaults();

    const root =
      buildTree();

    const allNodes =
      flattenTree(
        root
      );

    const flowColumns =
      buildFlowColumns(
        root
      );

    const visibleGroups =
      flowColumns.flatMap(
        column =>
          column.groups
      );

    const totalSeconds =
      visibleGroups.reduce(
        (
          sum,
          group
        ) =>
          sum
          +
          (
            group.hasTime
              ? group.estimatedSeconds
              : 0
          ),
        0
      );

    const finalWeight =
      root?.estimatedWeight;

    const firstColumn =
      flowColumns[0];

    const startingMaterials =
      firstColumn?.groups.length
      ||
      0;

    const converterMaterial =
      findMaterialById(
        state.materials,
        state.converterMaterialId
      );

    const conversion =
      converterResult(
        converterMaterial,
        state.converterMode,
        state.converterValue
      );

    target.innerHTML = `
      <div
        class="analysis-calculations"
      >

        <section
          class="analysis-calc-hero"
        >
          <div>
            <span
              class="analysis-calc-eyebrow"
            >
              Calculadora técnica
            </span>

            <h2>
              Cálculos de produção
            </h2>

            <p>
              Consulte necessidade de materiais,
              peso e tempo sem criar planejamento
              ou movimentar estoque.
            </p>
          </div>

          <div
            class="analysis-calc-hero-badge"
          >
            Somente consulta
          </div>
        </section>


        <section
          class="analysis-calc-card analysis-calc-production-card"
        >

          <div
            class="analysis-calc-section-head"
          >
            <div>
              <span>
                01
              </span>

              <div>
                <h3>
                  Árvore de produção
                </h3>

                <p>
                  Escolha o material final
                  e veja a cadeia produtiva
                  da esquerda para a direita.
                </p>
              </div>
            </div>
          </div>


          <div
            class="analysis-calc-controls"
          >

            <label>
              Material final

              <div
                class="analysis-calc-material-search"
              >
                <input
                  type="text"
                  autocomplete="off"
                  data-calc-root-material-search
                  placeholder="Digite o nome ou código do material..."
                  value="${escapeHtml(
                    state.rootMaterialSearch
                  )}"
                />

                <div
                  class="analysis-calc-material-results"
                  data-calc-material-results
                  hidden
                ></div>
              </div>
            </label>


            <label>
              Quantidade a produzir

              <div
  class="analysis-calc-input-unit"
>
  <input
    data-calc-root-quantity
    type="number"
    min="0"
    step="0.001"
    placeholder="Ex.: 1000"
    value="${escapeHtml(
      state.rootQuantity
      ||
      ''
    )}"
  />

  <span>
    ${escapeHtml(
      materialPrimaryUnit(
        root?.material
        ||
        {}
      )
      ||
      ''
    )}
  </span>

  <button
  type="button"
  class="analysis-calc-run-button"
  data-calc-run-production
  title="Calcular produção"
  aria-label="Calcular produção"
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect
      x="5"
      y="3"
      width="14"
      height="18"
      rx="3"
      stroke="currentColor"
      stroke-width="1.8"
    />
    <rect
      x="8"
      y="6"
      width="8"
      height="3"
      rx="1"
      fill="currentColor"
      opacity="0.18"
    />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="15" r="1" fill="currentColor" />
    <circle cx="12" cy="15" r="1" fill="currentColor" />
    <circle cx="15" cy="15" r="1" fill="currentColor" />
    <circle cx="9" cy="18" r="1" fill="currentColor" />
    <rect
      x="11"
      y="17.2"
      width="5"
      height="1.6"
      rx="0.8"
      fill="currentColor"
    />
  </svg>
</button>
</div>
            </label>

          </div>


          ${
            root
              ? `
                <div
                  class="analysis-calc-summary"
                >

                  <article>
                    <span>
                      Etapas produtivas
                    </span>

                    <strong>
                      ${visibleGroups.length}
                    </strong>
                  </article>


                  <article>
                    <span>
                      Tempo somado
                    </span>

                    <strong>
                      ${formatSeconds(
                        totalSeconds
                      )}
                    </strong>
                  </article>


                  <article>
                    <span>
                      Peso do material final
                    </span>

                    <strong>
                      ${
                        Number.isFinite(
                          finalWeight
                        )
                          ? `${
                              formatNumber(
                                finalWeight
                              )
                            } kg`
                          : 'Não convertido'
                      }
                    </strong>
                  </article>


                  <article>
                    <span>
                      Materiais iniciais
                    </span>

                    <strong>
                      ${startingMaterials}
                    </strong>
                  </article>

                </div>


                ${renderProductionFlow(
                  root
                )}
              `
              : `
                <div
                  class="analysis-calc-empty"
                >
                  Selecione um material
                  e informe uma quantidade
                  maior que zero.
                </div>
              `
          }

        </section>


        <section
          class="analysis-calc-card analysis-calc-converter-card"
        >

          <div
            class="analysis-calc-section-head"
          >
            <div>
              <span>
                02
              </span>

              <div>
                <h3>
                  Quantidade ↔ Peso
                </h3>

                <p>
                  Converta peças em kg
                  ou kg em peças usando
                  o fator do cadastro do material.
                </p>
              </div>
            </div>
          </div>


          <div
            class="analysis-calc-converter-grid"
          >

            <label>
              Material

              <div
                class="analysis-calc-material-search"
              >
                <input
                  type="text"
                  autocomplete="off"
                  data-calc-converter-material-search
                  placeholder="Digite o nome ou código do material..."
                  value="${escapeHtml(
                    state.converterMaterialSearch
                  )}"
                />

                <div
                  class="analysis-calc-material-results"
                  data-calc-material-results
                  hidden
                ></div>
              </div>
            </label>


            <label>
              Tipo de cálculo

              <select
                data-calc-converter-mode
              >
                <option
                  value="qty-to-weight"
                  ${
                    state.converterMode
                    ===
                    'qty-to-weight'
                      ? 'selected'
                      : ''
                  }
                >
                  Quantidade → Peso
                </option>

                <option
                  value="weight-to-qty"
                  ${
                    state.converterMode
                    ===
                    'weight-to-qty'
                      ? 'selected'
                      : ''
                  }
                >
                  Peso → Quantidade
                </option>
              </select>
            </label>


            <label>
              ${
                state.converterMode
                ===
                'weight-to-qty'
                  ? 'Peso'
                  : 'Quantidade'
              }

              <div
  class="analysis-calc-input-unit"
>
  <input
    data-calc-converter-value
    type="number"
    min="0"
    step="0.001"
    placeholder="${
      state.converterMode
      ===
      'weight-to-qty'
        ? 'Ex.: 5000'
        : 'Ex.: 1000'
    }"
    value="${escapeHtml(
      state.converterValue
      ||
      ''
    )}"
  />

  <span>
    ${
      state.converterMode
      ===
      'weight-to-qty'
        ? 'kg'
        : 'un'
    }
  </span>

  <button
  type="button"
  class="analysis-calc-run-button"
  data-calc-run-converter
  title="Calcular conversão"
  aria-label="Calcular conversão"
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect
      x="5"
      y="3"
      width="14"
      height="18"
      rx="3"
      stroke="currentColor"
      stroke-width="1.8"
    />
    <rect
      x="8"
      y="6"
      width="8"
      height="3"
      rx="1"
      fill="currentColor"
      opacity="0.18"
    />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="15" r="1" fill="currentColor" />
    <circle cx="12" cy="15" r="1" fill="currentColor" />
    <circle cx="15" cy="15" r="1" fill="currentColor" />
    <circle cx="9" cy="18" r="1" fill="currentColor" />
    <rect
      x="11"
      y="17.2"
      width="5"
      height="1.6"
      rx="0.8"
      fill="currentColor"
    />
  </svg>
</button>
</div>
            </label>


            <div
              class="analysis-calc-converter-result ${
                conversion.available
                  ? 'is-ready'
                  : ''
              }"
            >
              <span>
                Resultado
              </span>

              <strong>
                ${
                  conversion.available
                    ? `${
                        formatNumber(
                          conversion.value
                        )
                      } ${
                        conversion.unit
                      }`
                    : 'Indisponível'
                }
              </strong>

              <small>
                ${
                  conversion.available
                    ? `1 un = ${
                        formatNumber(
                          conversion.equivalence,
                          6
                        )
                      } kg`
                    : escapeHtml(
                        conversion.message
                      )
                }
              </small>
            </div>

          </div>
        </section>

      </div>
    `;
  }


  async function load() {
    if (
      state.loaded
      ||
      state.loading
    ) {
      if (
        state.loaded
      ) {
        render();
      }

      return;
    }

    state.loading = true;

    setInternalLoading(
      target,
      'Carregando calculadoras...'
    );

    try {
      const [
        materials,
        matrix
      ] =
        await Promise.all([
          api(
            '/materials'
          ),

          api(
            '/productivity'
          )
        ]);

      state.materials =
        Array.isArray(
          materials
        )
          ? materials
          : [];

      state.matrix =
        Array.isArray(
          matrix
        )
          ? matrix
          : [];

      state.loaded = true;

      render();

    } catch (error) {
      setInternalError(
        target,

        error.message
        ||
        'Não foi possível carregar os dados de cálculo.'
      );

    } finally {
      state.loading = false;
    }
  }



  /*
   * Digitação dos campos.
   */
  target.addEventListener(
    'input',
    event => {

      /*
       * Busca do material final.
       */
      if (
        event.target.matches(
          '[data-calc-root-material-search]'
        )
      ) {
        state.rootMaterialSearch =
          event.target.value;

        const selectedMaterial =
          findMaterialById(
            state.materials,
            state.rootMaterialId
          );

        const selectedLabel =
          selectedMaterial
            ? materialSearchLabel(
                selectedMaterial
              )
            : '';

        if (
          !selectedMaterial
          ||
          event.target.value
          !==
          selectedLabel
        ) {
          state.rootMaterialId = '';

          state.nodeSettings =
            new Map();
        }

        updateSearchResults(
          event.target,
          'root'
        );

        return;
      }


      /*
       * Busca do material do conversor.
       */
      if (
        event.target.matches(
          '[data-calc-converter-material-search]'
        )
      ) {
        state.converterMaterialSearch =
          event.target.value;

        const selectedMaterial =
          findMaterialById(
            state.materials,
            state.converterMaterialId
          );

        const selectedLabel =
          selectedMaterial
            ? materialSearchLabel(
                selectedMaterial
              )
            : '';

        if (
          !selectedMaterial
          ||
          event.target.value
          !==
          selectedLabel
        ) {
          state.converterMaterialId = '';
        }

        updateSearchResults(
          event.target,
          'converter'
        );

        return;
      }


      /*
       * Quantidade a produzir.
       */
     if (
  event.target.matches(
    '[data-calc-root-quantity]'
  )
) {
  state.rootQuantity =
    event.target.value;

  return;
}


      /*
       * Valor do conversor.
       */
      if (
  event.target.matches(
    '[data-calc-converter-value]'
  )
) {
  state.converterValue =
    event.target.value;

  return;
}
    }
  );


  /*
 * Botões manuais de cálculo.
 *
 * A quantidade pode ser digitada
 * livremente e o cálculo só acontece
 * quando o usuário clicar na calculadora.
 */
target.addEventListener(
  'click',
  event => {

    const productionButton =
      event.target.closest(
        '[data-calc-run-production]'
      );

    if (productionButton) {
      render();

      return;
    }


    const converterButton =
      event.target.closest(
        '[data-calc-run-converter]'
      );

    if (converterButton) {
      render();

      return;
    }
  }
);

  /*
   * Clique em uma opção da lista de materiais.
   *
   * Usamos mousedown para selecionar
   * antes do campo perder o foco.
   */
  target.addEventListener(
    'mousedown',
    event => {
      const option =
        event.target.closest(
          '[data-calc-material-choice]'
        );

      if (!option) {
        return;
      }

      event.preventDefault();

      const type =
        option.dataset
          .calcMaterialChoice;

      const materialId =
        option.dataset
          .materialId;

      const materialLabel =
        option.dataset
          .materialLabel;

      if (
        type === 'root'
      ) {
        state.rootMaterialId =
          materialId;

        state.rootMaterialSearch =
          materialLabel;

        state.nodeSettings =
          new Map();

        render();

        return;
      }

      if (
        type === 'converter'
      ) {
        state.converterMaterialId =
          materialId;

        state.converterMaterialSearch =
          materialLabel;

        render();
      }
    }
  );


  /*
   * Selects.
   */
  target.addEventListener(
    'change',
    event => {

      /*
       * Quantidade → Peso
       * ou
       * Peso → Quantidade.
       */
      if (
        event.target.matches(
          '[data-calc-converter-mode]'
        )
      ) {
        state.converterMode =
          event.target.value;

        render();

        return;
      }


      /*
       * Card produtivo.
       *
       * Um card pode representar
       * vários nós iguais, por exemplo
       * uma bobina usada por longitudinal
       * e transversal ao mesmo tempo.
       */
      const nodeCard =
        event.target.closest(
          '[data-calc-node-keys]'
        );

      if (!nodeCard) {
        return;
      }

      const keys =
        String(
          nodeCard.dataset
            .calcNodeKeys
          ||
          ''
        )
          .split('|')
          .filter(Boolean);

      if (!keys.length) {
        return;
      }

      const updateAll =
        patch => {
          keys.forEach(
            key => {
              const current =
                state.nodeSettings.get(
                  key
                )
                ||
                {};

              state.nodeSettings.set(
                key,
                {
                  ...current,
                  ...patch
                }
              );
            }
          );
        };


      /*
       * Modelo.
       */
      if (
        event.target.matches(
          '[data-calc-node-model]'
        )
      ) {
        updateAll({
          modelName:
            event.target.value
        });

        render();

        return;
      }


      /*
       * Máquina.
       */
      if (
        event.target.matches(
          '[data-calc-node-machine]'
        )
      ) {
        updateAll({
          machineName:
            event.target.value,

          peopleCount:
            null
        });

        render();

        return;
      }


      /*
       * Pessoas.
       */
      if (
        event.target.matches(
          '[data-calc-node-people]'
        )
      ) {
        updateAll({
          peopleCount:
            Number(
              event.target.value
            )
        });

        render();
      }
    }
  );


  /*
   * Fecha a lista de materiais
   * ao clicar em outro lugar da tela.
   */
  document.addEventListener(
    'mousedown',
    event => {
      if (
        panel.contains(
          event.target
        )
      ) {
        if (
          !event.target.closest(
            '.analysis-calc-material-search'
          )
        ) {
          panel
            .querySelectorAll(
              '[data-calc-material-results]'
            )
            .forEach(
              box => {
                box.hidden = true;
              }
            );
        }
      }
    }
  );


  return {
    element:
      panel,

    load
  };
}