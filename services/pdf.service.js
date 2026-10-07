import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.resolve(__dirname, '..', 'assets', 'logo-acofer.png');

const COLORS = {
  ink: '#1F2937',
  muted: '#64748B',
  line: '#CBD5E1',
  strongLine: '#94A3B8',
  paper: '#FFFFFF',
  soft: '#F8FAFC',
  header: '#2F343B',
  orange: '#EA580C',
  green: '#16A34A',
  blue: '#2563EB',
  violet: '#7C3AED',
  cyan: '#0891B2',
  red: '#DC2626'
};

const PRODUCTION_COLORS = [
  '#16A34A',
  '#EA580C',
  '#2563EB',
  '#7C3AED',
  '#0891B2',
  '#CA8A04',
  '#DB2777'
];

const PAGE = {
  margin: 42,
  headerHeight: 88,
  top: 110,
  bottom: 800
};

const DOCUMENT_TYPES = {
  MATRIZ: 'matriz',
  FEITAL: 'feital'
};


function text(value) {
  return value === null || value === undefined
    ? ''
    : String(value);
}


function number(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}


function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}


function normalizeObject(value) {
  if (
    value
    &&
    typeof value === 'object'
    &&
    !Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    return (
      parsed
      &&
      typeof parsed === 'object'
      &&
      !Array.isArray(parsed)
    )
      ? parsed
      : {};
  } catch {
    return {};
  }
}


function validDateKey(value) {
  const date =
    text(value)
      .slice(0, 10);

  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : '';
}


function formatDate(value) {
  const date =
    validDateKey(value);

  return date
    ? date
        .split('-')
        .reverse()
        .join('/')
    : '';
}


function weekdayLabel(value) {
  const date =
    validDateKey(value);

  if (!date) {
    return '';
  }

  const label =
    new Intl.DateTimeFormat(
      'pt-BR',
      {
        weekday:
          'long',

        timeZone:
          'UTC'
      }
    )
      .format(
        new Date(
          `${date}T00:00:00Z`
        )
      );

  return label
    ? label.charAt(0).toUpperCase()
      +
      label.slice(1)
    : '';
}


function formatNumber(value) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return '-';
  }

  return parsed.toLocaleString(
    'pt-BR',
    {
      minimumFractionDigits:
        0,

      maximumFractionDigits:
        3
    }
  );
}


function formatDuration(minutes) {
  const total =
    Math.max(
      Math.round(
        number(minutes)
      ),
      0
    );

  const hours =
    Math.floor(
      total / 60
    );

  const mins =
    total % 60;

  if (!hours) {
    return `${mins}min`;
  }

  return mins
    ? `${hours}h ${String(mins).padStart(2, '0')}min`
    : `${hours}h`;
}


function formatHourDuration(value) {
  const totalMinutes =
    Math.max(
      Math.round(
        number(value)
        *
        60
      ),
      0
    );

  const hours =
    Math.floor(
      totalMinutes / 60
    );

  const mins =
    totalMinutes % 60;

  return (
    `${String(hours).padStart(2, '0')}`
    +
    ':'
    +
    `${String(mins).padStart(2, '0')}`
    +
    ' h/dia'
  );
}


function formatPeople(value) {
  const people =
    Math.max(
      Math.round(
        number(value)
      ),
      0
    );

  if (!people) {
    return '-';
  }

  return (
    `${people} pessoa`
    +
    (
      people === 1
        ? ''
        : 's'
    )
  );
}


function statusLabel(value) {
  const labels = {
    planned:
      'Planejado',

    launched:
      'Lançado',

    canceled:
      'Cancelado'
  };

  return (
    labels[
      text(value)
        .toLowerCase()
    ]
    ||
    text(value)
    ||
    'Sem status'
  );
}


function isCanceledPlan(plan = {}) {
  return (
    text(
      plan.status
    ).toLowerCase()
    ===
    'canceled'
  );
}


function safeColor(
  value,
  fallback = COLORS.ink
) {
  return /^#[0-9a-f]{6}$/i.test(
    text(value).trim()
  )
    ? text(value).trim()
    : fallback;
}


function productionColor(
  index = 0,
  explicit = null
) {
  return safeColor(
    explicit,

    PRODUCTION_COLORS[
      Math.max(
        number(index),
        0
      )
      %
      PRODUCTION_COLORS.length
    ]
  );
}


function isPlanningRootName(value) {
  return [
    'Plano de producao',
    'Plano de produção'
  ].includes(
    text(value)
  );
}


function treeRoots(tree) {
  if (
    !tree
    ||
    typeof tree !== 'object'
  ) {
    return [];
  }

  return (
    Array.isArray(tree.children)
    &&
    isPlanningRootName(
      tree.materialName
    )
  )
    ? tree.children
    : [tree];
}


function isBobinaName(value) {
  return /\bbobina\b/i.test(
    text(value)
  );
}


function normalizedLocation(value) {
  return text(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .trim()
    .toUpperCase();
}


function isMatrizLocation(value) {
  return normalizedLocation(
    value
  ).includes(
    'MATRIZ'
  );
}


function isFeitalLocation(value) {
  return normalizedLocation(
    value
  ).includes(
    'FEITAL'
  );
}


function documentTitle(type) {
  return (
    type
    ===
    DOCUMENT_TYPES.MATRIZ
  )
    ? 'PLANEJAMENTO DE PRODUÇÃO · MATRIZ'
    : 'PLANEJAMENTO DE PRODUÇÃO · FEITAL';
}


function operationPeriod(
  events = [],
  fallbackStartDate = null,
  fallbackEndDate = null
) {
  const dates =
    normalizeArray(events)
      .flatMap(
        event => [
          validDateKey(
            event.date
          ),

          validDateKey(
            event.startDate
          ),

          validDateKey(
            event.endDate
          )
        ]
      )
      .filter(Boolean)
      .sort();

  return {
    startDate:
      dates[0]
      ||
      validDateKey(
        fallbackStartDate
      ),

    endDate:
      dates.at(-1)
      ||
      validDateKey(
        fallbackEndDate
      )
      ||
      validDateKey(
        fallbackStartDate
      )
  };
}


function normalizeManualSchedule(
  plan = {}
) {
  return normalizeObject(
    plan.manual_schedule_draft
  );
}


function operationKey(
  operation = {}
) {
  return text(
    operation.calendarParentOperationId
    ||
    operation.splitParentOperationId
    ||
    operation.parentOperationId
    ||
    operation.operationId
    ||
    operation.materialId
  );
}


function compareScheduleEvents(
  left,
  right
) {
  return (
    text(
      left.date
    )
      .localeCompare(
        text(
          right.date
        )
      )

    ||

    text(
      left.sortTime
      ||
      '99:99'
    )
      .localeCompare(
        text(
          right.sortTime
          ||
          '99:99'
        )
      )

    ||

    number(
      left.productionIndex
    )
    -
    number(
      right.productionIndex
    )

    ||

    number(
      left.sequence
    )
    -
    number(
      right.sequence
    )

    ||

    text(
      left.machineName
    )
      .localeCompare(
        text(
          right.machineName
        ),
        'pt-BR'
      )

    ||

    text(
      left.materialName
    )
      .localeCompare(
        text(
          right.materialName
        ),
        'pt-BR'
      )
  );
}


function manualAllocationEvents(
  plan,
  operations = []
) {
  const draft =
    normalizeManualSchedule(
      plan
    );

  const allocations =
    normalizeArray(
      draft.allocations
    );

  if (
    !allocations.length
  ) {
    return [];
  }

  const byParent =
    new Map();

  operations.forEach(
    operation => {
      const key =
        operationKey(
          operation
        );

      if (key) {
        byParent.set(
          key,
          operation
        );
      }
    }
  );

  return allocations
    .map(
      (
        allocation,
        index
      ) => {
        const parent =
          byParent.get(
            text(
              allocation.parentOperationId
            )
          )
          ||
          {};

        return {
          type:
            'production',

          eventId:
            text(
              allocation.allocationId
            )
            ||
            `allocation-${index + 1}`,

          date:
            validDateKey(
              allocation.date
              ||
              allocation.startDate
            ),

          sortTime:
            text(
              allocation.startTime
              ||
              '07:00'
            ).slice(0, 5),

          productionIndex:
            number(
              allocation.productionIndex
              ??
              parent.productionIndex
            ),

          productionTitle:
            allocation.productionTitle
            ||
            parent.productionTitle
            ||
            `Produção ${
              number(
                allocation.productionIndex
                ??
                parent.productionIndex
              )
              +
              1
            }`,

          productionColor:
            allocation.productionColor
            ||
            parent.productionColor
            ||
            null,

          materialId:
            text(
              allocation.materialId
              ||
              parent.materialId
            ),

          materialName:
            allocation.materialName
            ||
            parent.materialName
            ||
            '-',

          materialCode:
            allocation.materialCode
            ||
            parent.materialCode
            ||
            '',

          quantity:
            number(
              allocation.quantity
            ),

          unit:
            allocation.unit
            ||
            parent.unit
            ||
            '',

          machineName:
            allocation.machineName
            ||
            parent.machineName
            ||
            '-',

          peopleCount:
            allocation.peopleCount
            ??
            parent.peopleCount
            ??
            0,

          durationMinutes:
            number(
              allocation.durationMinutes
              ||
              allocation.totalMinutes
            ),

          locationName:
            allocation.locationName
            ||
            allocation.machineLocationName
            ||
            allocation.locationCode
            ||
            parent.locationName
            ||
            parent.machineLocationName
            ||
            '',

          parentOperationId:
            text(
              allocation.parentOperationId
            ),

          sequence:
            Number.isFinite(
              Number(
                allocation.sequence
              )
            )
              ? Number(
                  allocation.sequence
                )
              : index + 1
        };
      }
    )
    .filter(
      event =>
        event.date
    )
    .sort(
      compareScheduleEvents
    );
}


function operationToEvents(
  operation,
  index = 0
) {
  /*
   * Transporte deixa de fazer parte
   * do documento operacional.
   */
  if (
    operation?.operationType
    ===
    'transport'
  ) {
    return [];
  }


  const segments =
    normalizeArray(
      operation?.segments
    );


  if (
    segments.length
  ) {
    const totalSegmentMinutes =
      segments.reduce(
        (
          sum,
          segment
        ) =>
          sum
          +
          number(
            segment.minutes
          ),
        0
      );


    return segments.map(
      (
        segment,
        segmentIndex
      ) => {
        const ratio =
          totalSegmentMinutes > 0
            ? (
                number(
                  segment.minutes
                )
                /
                totalSegmentMinutes
              )
            : (
                1
                /
                segments.length
              );


        return {
          type:
            'production',

          eventId:
            `${
              operation.operationId
              ||
              index
            }:segment:${segmentIndex}`,

          date:
            validDateKey(
              segment.date
              ||
              operation.startDate
            ),

          sortTime:
            text(
              segment.startTime
              ||
              operation.startTime
              ||
              '07:00'
            ).slice(0, 5),

          productionIndex:
            number(
              operation.productionIndex
            ),

          productionTitle:
            operation.productionTitle
            ||
            `Produção ${
              number(
                operation.productionIndex
              )
              +
              1
            }`,

          productionColor:
            operation.productionColor
            ||
            null,

          materialId:
            text(
              operation.materialId
            ),

          materialName:
            operation.materialName
            ||
            '-',

          materialCode:
            operation.materialCode
            ||
            '',

          quantity:
            number(
              operation.produceQty
              ||
              operation.requiredQty
            )
            *
            ratio,

          unit:
            operation.unit
            ||
            '',

          machineName:
            operation.machineName
            ||
            '-',

          peopleCount:
            operation.peopleCount
            ??
            0,

          durationMinutes:
            number(
              segment.minutes
              ||
              operation.totalMinutes
            ),

          locationName:
            operation.locationName
            ||
            operation.machineLocationName
            ||
            operation.locationCode
            ||
            '',

          parentOperationId:
            operationKey(
              operation
            ),

          sequence:
            index
            +
            segmentIndex
            +
            1
        };
      }
    );
  }


  return [
    {
      type:
        'production',

      eventId:
        text(
          operation?.operationId
        )
        ||
        `operation-${index + 1}`,

      date:
        validDateKey(
          operation?.startDate
          ||
          operation?.date
        ),

      sortTime:
        text(
          operation?.startTime
          ||
          '07:00'
        ).slice(0, 5),

      productionIndex:
        number(
          operation?.productionIndex
        ),

      productionTitle:
        operation?.productionTitle
        ||
        `Produção ${
          number(
            operation?.productionIndex
          )
          +
          1
        }`,

      productionColor:
        operation?.productionColor
        ||
        null,

      materialId:
        text(
          operation?.materialId
        ),

      materialName:
        operation?.materialName
        ||
        '-',

      materialCode:
        operation?.materialCode
        ||
        '',

      quantity:
        number(
          operation?.produceQty
          ||
          operation?.requiredQty
        ),

      unit:
        operation?.unit
        ||
        '',

      machineName:
        operation?.machineName
        ||
        '-',

      peopleCount:
        operation?.peopleCount
        ??
        0,

      durationMinutes:
        number(
          operation?.totalMinutes
          ||
          operation?.durationMinutes
        ),

      locationName:
        operation?.locationName
        ||
        operation?.machineLocationName
        ||
        operation?.locationCode
        ||
        '',

      parentOperationId:
        operationKey(
          operation
        ),

      sequence:
        index + 1
    }
  ];
}


function dayRowsToEvents(
  days = [],
  operations = []
) {
  return normalizeArray(
    days
  )
    .map(
      (
        row,
        index
      ) => {
        const matching =
          operations.find(
            operation =>
              operation?.operationType
                !==
                'transport'

              &&

              (
                text(
                  operation.materialId
                )
                ===
                text(
                  row.material_id
                )

                ||

                text(
                  operation.materialCode
                )
                ===
                text(
                  row.material_code
                )

                ||

                text(
                  operation.materialName
                )
                ===
                text(
                  row.material_name
                )
              )

              &&

              (
                !row.machine_name

                ||

                text(
                  operation.machineName
                )
                ===
                text(
                  row.machine_name
                )
              )
          )
          ||
          {};


        return {
          type:
            'production',

          eventId:
            `day-${
              row.id
              ||
              index + 1
            }`,

          date:
            validDateKey(
              row.planned_date
            ),

          sortTime:
            '07:00',

          productionIndex:
            number(
              row.production_index
              ??
              matching.productionIndex
            ),

          productionTitle:
            row.production_title
            ||
            matching.productionTitle
            ||
            `Produção ${
              number(
                row.production_index
                ??
                matching.productionIndex
              )
              +
              1
            }`,

          productionColor:
            row.production_color
            ||
            matching.productionColor
            ||
            null,

          materialId:
            text(
              row.material_id
              ||
              matching.materialId
            ),

          materialName:
            row.material_name
            ||
            matching.materialName
            ||
            '-',

          materialCode:
            row.material_code
            ||
            matching.materialCode
            ||
            '',

          quantity:
            number(
              row.planned_qty
            ),

          unit:
            row.planned_unit
            ||
            matching.unit
            ||
            '',

          machineName:
            row.machine_name
            ||
            matching.machineName
            ||
            '-',

          peopleCount:
            row.people_count
            ??
            matching.peopleCount
            ??
            0,

          durationMinutes:
            0,

          locationName:
            row.location_name
            ||
            row.location
            ||
            matching.locationName
            ||
            matching.machineLocationName
            ||
            '',

          sequence:
            index + 1
        };
      }
    )
    .filter(
      event =>
        event.date
    );
}


function buildScheduleEvents(
  plan,
  days = [],
  operations = []
) {
  const manual =
    manualAllocationEvents(
      plan,
      operations
    );


  if (
    manual.length
  ) {
    return manual.sort(
      compareScheduleEvents
    );
  }


  const fromOperations =
    operations
      .flatMap(
        operationToEvents
      )
      .filter(
        event =>
          event.date
      );


  if (
    fromOperations.length
  ) {
    return fromOperations.sort(
      compareScheduleEvents
    );
  }


  return dayRowsToEvents(
    days,
    operations
  )
    .sort(
      compareScheduleEvents
    );
}


function eventBelongsToDocument(
  event,
  type
) {
  const bobina =
    isBobinaName(
      event.materialName
    );


  if (
    type
    ===
    DOCUMENT_TYPES.MATRIZ
  ) {
    /*
     * Documento da Matriz:
     * somente bobinas.
     */
    return bobina;
  }


  /*
   * Documento do Feital:
   * barras, varetas, telas/malhas e
   * demais materiais, sem bobina.
   */
  return !bobina;
}


function filterEventsForDocument(
  events,
  type
) {
  return events
    .filter(
      event =>
        event.type
        ===
        'production'
    )
    .filter(
      event =>
        eventBelongsToDocument(
          event,
          type
        )
    )
    .sort(
      compareScheduleEvents
    );
}


function rootProductionRows(
  tree,
  plan
) {
  const roots =
    treeRoots(
      tree
    );


  if (
    roots.length
  ) {
    return roots.map(
      (
        node,
        index
      ) => ({
        productionIndex:
          number(
            node.productionIndex
            ??
            index
          ),

        title:
          node.productionTitle
          ||
          `Produção ${
            number(
              node.productionIndex
              ??
              index
            )
            +
            1
          }`,

        color:
          node.productionColor
          ||
          null,

        material:
          node.materialName
          ||
          '-',

        code:
          node.materialCode
          ||
          '',

        quantity:
          number(
            node.requiredQty
          ),

        unit:
          node.unit
          ||
          '',

        treeNode:
          node
      })
    );
  }


  return [
    {
      productionIndex:
        0,

      title:
        'Produção 1',

      color:
        null,

      material:
        plan.material_name
        ||
        '-',

      code:
        plan.material_code
        ||
        '',

      quantity:
        number(
          plan.planned_qty
        ),

      unit:
        plan.planned_unit
        ||
        '',

      treeNode:
        null
    }
  ];
}


function findTreeNode(
  tree,
  predicate
) {
  let found =
    null;


  function visit(node) {
    if (
      !node
      ||
      found
    ) {
      return;
    }


    if (
      predicate(
        node
      )
    ) {
      found =
        node;

      return;
    }


    (
      node.children
      ||
      []
    ).forEach(
      visit
    );
  }


  treeRoots(
    tree
  )
    .forEach(
      visit
    );


  return found;
}


function matrixProductionRows(
  events,
  tree
) {
  const matrixEvents =
    filterEventsForDocument(
      events,
      DOCUMENT_TYPES.MATRIZ
    );


  const groups =
    new Map();


  matrixEvents.forEach(
    event => {
      const key =
        text(
          event.materialId
          ||
          event.materialCode
          ||
          event.materialName
        );


      if (
        !groups.has(
          key
        )
      ) {
        groups.set(
          key,
          {
            productionIndex:
              0,

            title:
              'Produção de Bobina',

            color:
              COLORS.green,

            material:
              event.materialName
              ||
              '-',

            code:
              event.materialCode
              ||
              '',

            quantity:
              0,

            unit:
              event.unit
              ||
              '',

            treeNode:
              findTreeNode(
                tree,
                node =>
                  (
                    text(
                      node.materialId
                    )
                    ===
                    text(
                      event.materialId
                    )
                  )

                  ||

                  (
                    text(
                      node.materialCode
                    )
                    ===
                    text(
                      event.materialCode
                    )
                  )

                  ||

                  (
                    text(
                      node.materialName
                    )
                    ===
                    text(
                      event.materialName
                    )
                  )
              )
          }
        );
      }


      groups
        .get(
          key
        )
        .quantity
        +=
        number(
          event.quantity
        );
    }
  );


  return [
    ...groups.values()
  ];
}


function productionRowsForDocument(
  type,
  tree,
  plan,
  events
) {
  if (
    type
    ===
    DOCUMENT_TYPES.MATRIZ
  ) {
    return matrixProductionRows(
      events,
      tree
    );
  }


  return rootProductionRows(
    tree,
    plan
  )
    .filter(
      row =>
        !isBobinaName(
          row.material
        )
    );
}


function aggregateNodes(
  nodes = []
) {
  const map =
    new Map();


  nodes.forEach(
    node => {
      if (!node) {
        return;
      }


      const key =
        text(
          node.materialId
          ||
          node.materialCode
          ||
          node.materialName
        );


      if (!key) {
        return;
      }


      if (
        !map.has(
          key
        )
      ) {
        map.set(
          key,
          {
            materialId:
              node.materialId,

            materialName:
              node.materialName
              ||
              '-',

            materialCode:
              node.materialCode
              ||
              '',

            requiredQty:
              0,

            unit:
              node.unit
              ||
              '',

            children:
              []
          }
        );
      }


      const target =
        map.get(
          key
        );


      target.requiredQty +=
        number(
          node.requiredQty
        );


      target.children.push(
        ...(
          node.children
          ||
          []
        )
      );
    }
  );


  return [
    ...map.values()
  ];
}


function dependencyLayers(
  root,
  type
) {
  if (!root) {
    return [];
  }


  const first =
    aggregateNodes(
      root.children
      ||
      []
    );


  if (
    type
    ===
    DOCUMENT_TYPES.MATRIZ
  ) {
    /*
     * Para a Bobina da Matriz mostramos
     * somente seu insumo imediatamente anterior.
     *
     * Ex.:
     * Bobina -> Fio Máquina
     */
    return first.length
      ? [first]
      : [];
  }


  if (
    !first.length
  ) {
    return [];
  }


  /*
   * Caso direto:
   *
   * 4,2 Reto
   *    ↓
   * Bobina
   *
   * O fluxo visual para aqui.
   */
  if (
    first.every(
      node =>
        isBobinaName(
          node.materialName
        )
    )
  ) {
    return [
      first
    ];
  }


  /*
   * Caso de malha:
   *
   * Q-138
   *   ↓
   * Longitudinal / Transversal
   *   ↓
   * Bobina
   */
  const second =
    aggregateNodes(
      first.flatMap(
        node =>
          node.children
          ||
          []
      )
    )
      .filter(
        node =>
          isBobinaName(
            node.materialName
          )
      );


  return [
    first,
    second
  ]
    .filter(
      layer =>
        layer.length
    );
}


function uniqueMachines(
  events = []
) {
  return [
    ...new Set(
      events
        .map(
          event =>
            text(
              event.machineName
            ).trim()
        )
        .filter(
          value =>
            value
            &&
            value !== '-'
        )
    )
  ]
    .sort(
      (
        left,
        right
      ) =>
        left.localeCompare(
          right,
          'pt-BR'
        )
    );
}


function uniqueDates(
  events = []
) {
  return [
    ...new Set(
      events
        .map(
          event =>
            validDateKey(
              event.date
            )
        )
        .filter(Boolean)
    )
  ].sort();
}


function totalMinutes(
  events = []
) {
  return events.reduce(
    (
      sum,
      event
    ) =>
      sum
      +
      number(
        event.durationMinutes
      ),
    0
  );
}


function drawHeader(
  doc,
  title,
  plan,
  pageNumber,
  type
) {
  const width =
    doc.page.width;


  const headerTitle =
    title.startsWith(
      'PROGRAMAÇÃO OPERACIONAL'
    )
      ? 'PROGRAMAÇÃO OPERACIONAL'

      : title.startsWith(
          'OBSERVAÇÕES'
        )
          ? 'OBSERVAÇÕES E DESVIOS'

          : title.startsWith(
              'ASSINATURAS'
            )
              ? 'ASSINATURAS'

              : 'PLANEJAMENTO DE PRODUÇÃO';


  doc.save();


  doc.rect(
    0,
    0,
    width,
    PAGE.headerHeight
  )
    .fill(
      COLORS.header
    );


  if (
    fs.existsSync(
      logoPath
    )
  ) {
    doc.image(
      logoPath,
      PAGE.margin,
      18,
      {
        width:
          82
      }
    );
  }


  doc.fillColor(
    '#FFFFFF'
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      15
    )
    .text(
      headerTitle,
      150,
      22,
      {
        width:
          width
          -
          300
      }
    );


  doc.fillColor(
    '#E5E7EB'
  )
    .font(
      'Helvetica'
    )
    .fontSize(
      8.5
    )
    .text(
      `Planejamento ${
        plan.code
        ||
        plan.id
        ||
        '-'
      }`,
      150,
      47,
      {
        width:
          width
          -
          300
      }
    );


  doc.fillColor(
    '#FFFFFF'
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      8.5
    )
    .text(
      (
        type
        ===
        DOCUMENT_TYPES.MATRIZ
      )
        ? 'MATRIZ'
        : 'FEITAL',
      width - 180,
      22,
      {
        width:
          138,

        align:
          'right'
      }
    );


  doc.fillColor(
    '#FFFFFF'
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      8.5
    )
    .text(
      `Página ${pageNumber}`,
      width - 180,
      48,
      {
        width:
          138,

        align:
          'right'
      }
    );


  doc.restore();


  doc.y =
    PAGE.top;
}


function drawCanceledWatermark(
  doc,
  plan
) {
  if (
    !isCanceledPlan(
      plan
    )
  ) {
    return;
  }


  doc.save();


  doc.fillColor(
    COLORS.red
  )
    .fillOpacity(
      0.10
    )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      74
    );


  doc.rotate(
    -32,
    {
      origin: [
        doc.page.width / 2,
        doc.page.height / 2
      ]
    }
  );


  doc.text(
    'CANCELADO',
    0,
    doc.page.height / 2 - 42,
    {
      width:
        doc.page.width,

      align:
        'center'
    }
  );


  doc.restore();


  doc.fillOpacity(
    1
  );
}


function addPage(
  doc,
  title,
  plan,
  pageNumberRef,
  type
) {
  doc.addPage({
    size:
      'A4',

    margin:
      PAGE.margin
  });


  pageNumberRef.value +=
    1;


  drawHeader(
    doc,
    title,
    plan,
    pageNumberRef.value,
    type
  );


  drawCanceledWatermark(
    doc,
    plan
  );
}


function roundedPanel(
  doc,
  x,
  y,
  width,
  height,
  options = {}
) {
  doc.save();


  doc.roundedRect(
    x,
    y,
    width,
    height,
    options.radius
    ??
    8
  )
    .fillAndStroke(
      options.fill
      ||
      COLORS.paper,

      options.stroke
      ||
      COLORS.line
    );


  if (
    options.accent
  ) {
    doc.roundedRect(
      x,
      y,
      6,
      height,
      options.radius
      ??
      8
    )
      .fill(
        options.accent
      );


    doc.rect(
      x + 2,
      y,
      5,
      height
    )
      .fill(
        options.accent
      );
  }


  doc.restore();
}


function sectionTitle(
  doc,
  label,
  x,
  y,
  width
) {
  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      12.5
    )
    .text(
      label,
      x,
      y,
      {
        width
      }
    );


  doc.strokeColor(
    COLORS.line
  )
    .lineWidth(
      0.8
    )
    .moveTo(
      x,
      y + 20
    )
    .lineTo(
      x + width,
      y + 20
    )
    .stroke();
}


function pill(
  doc,
  label,
  x,
  y,
  width,
  options = {}
) {
  doc.roundedRect(
    x,
    y,
    width,
    options.height
    ||
    22,
    11
  )
    .fill(
      options.fill
      ||
      COLORS.soft
    );


  doc.fillColor(
    options.color
    ||
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      options.fontSize
      ||
      7.5
    )
    .text(
      label,
      x + 8,
      y + 6,
      {
        width:
          width - 16,

        align:
          options.align
          ||
          'center'
      }
    );
}


function infoPair(
  doc,
  label,
  value,
  x,
  y,
  width
) {
  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.2
    )
    .text(
      text(label)
        .toUpperCase(),
      x,
      y,
      {
        width
      }
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      9.8
    )
    .text(
      text(
        value
        ||
        '-'
      ),
      x,
      y + 14,
      {
        width,

        height:
          28
      }
    );
}


function summaryCard(
  doc,
  label,
  value,
  x,
  y,
  width,
  accent
) {
  roundedPanel(
    doc,
    x,
    y,
    width,
    56,
    {
      fill:
        COLORS.paper,

      stroke:
        COLORS.line,

      accent
    }
  );


  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.2
    )
    .text(
      text(label)
        .toUpperCase(),
      x + 13,
      y + 9,
      {
        width:
          width - 26
      }
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      12.5
    )
    .text(
      text(
        value
        ||
        '-'
      ),
      x + 13,
      y + 28,
      {
        width:
          width - 26
      }
    );
}


function drawSmallMaterialCard(
  doc,
  node,
  x,
  y,
  width,
  height,
  options = {}
) {
  roundedPanel(
    doc,
    x,
    y,
    width,
    height,
    {
      fill:
        options.fill
        ||
        COLORS.paper,

      stroke:
        options.stroke
        ||
        COLORS.line,

      accent:
        options.accent
        ||
        null,

      radius:
        6
    }
  );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      options.titleSize
      ||
      8
    )
    .text(
      node.materialName
      ||
      node.material
      ||
      '-',
      x + 10,
      y + 8,
      {
        width:
          width - 20,

        height:
          18
      }
    );


  /*
   * Cards pequenos de longitudinais/transversais
   * não mostram o código para evitar aperto visual.
   */
  if (
    (
      node.materialCode
      ||
      node.code
    )
    &&
    height >= 48
  ) {
    doc.fillColor(
      COLORS.muted
    )
      .font(
        'Helvetica'
      )
      .fontSize(
        5.8
      )
      .text(
        node.materialCode
        ||
        node.code,
        x + 10,
        y + 26,
        {
          width:
            width - 20,

          height:
            10
        }
      );
  }


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      options.qtySize
      ||
      7.2
    )
    .text(
      `${
        formatNumber(
          node.requiredQty
          ??
          node.quantity
        )
      } ${
        node.unit
        ||
        ''
      }`.trim(),
      x + 10,
      y + height - 18,
      {
        width:
          width - 20
      }
    );
}


function drawArrow(
  doc,
  x1,
  y1,
  x2,
  y2
) {
  doc.save();


  doc.strokeColor(
    COLORS.strongLine
  )
    .lineWidth(
      1.2
    )
    .moveTo(
      x1,
      y1
    )
    .lineTo(
      x2 - 5,
      y2
    )
    .stroke();


  doc.polygon(
    [
      x2,
      y2
    ],

    [
      x2 - 6,
      y2 - 4
    ],

    [
      x2 - 6,
      y2 + 4
    ]
  )
    .fill(
      COLORS.strongLine
    );


  doc.restore();
}


function drawChainRow(
  doc,
  row,
  type,
  x,
  y,
  width
) {
  const root =
    row.treeNode;


  const layers =
    dependencyLayers(
      root,
      type
    );


  const firstLayer =
    layers[0]
    ||
    [];


  const secondLayer =
    layers[1]
    ||
    [];


  const finalW =
    150;


  const gap =
    27;


  const depW =
    Math.max(
      118,
      (
        width
        -
        finalW
        -
        gap * 2
      )
      /
      2
    );


  const rowH =
    104;


  const finalY =
    y + 17;


  drawSmallMaterialCard(
    doc,
    {
      materialName:
        row.material,

      materialCode:
        row.code,

      quantity:
        row.quantity,

      unit:
        row.unit
    },
    x,
    finalY,
    finalW,
    70,
    {
      accent:
        productionColor(
          row.productionIndex,
          row.color
        ),

      titleSize:
        8.5,

      qtySize:
        8
    }
  );


  if (
    !firstLayer.length
  ) {
    return y + rowH;
  }


  const firstX =
    x
    +
    finalW
    +
    gap;


  const maxFirst =
    Math.min(
      firstLayer.length,
      2
    );


  const firstCardH =
    maxFirst > 1
      ? 44
      : 54;


  const firstTop =
    maxFirst > 1
      ? y + 5
      : y + 25;


  drawArrow(
    doc,
    x + finalW + 4,
    finalY + 35,
    firstX - 6,
    y + 52
  );


  firstLayer
    .slice(
      0,
      2
    )
    .forEach(
      (
        node,
        index
      ) => {
        drawSmallMaterialCard(
          doc,
          node,
          firstX,
          firstTop
          +
          index * 48,
          depW,
          firstCardH,
          {
            fill:
              '#F8FAFC'
          }
        );
      }
    );


  if (
    !secondLayer.length
  ) {
    return y + rowH;
  }


  const secondX =
    firstX
    +
    depW
    +
    gap;


  const maxSecond =
    Math.min(
      secondLayer.length,
      2
    );


  const secondCardH =
    maxSecond > 1
      ? 44
      : 54;


  const secondTop =
    maxSecond > 1
      ? y + 5
      : y + 25;


  drawArrow(
    doc,
    firstX + depW + 4,
    y + 52,
    secondX - 6,
    y + 52
  );


  secondLayer
    .slice(
      0,
      2
    )
    .forEach(
      (
        node,
        index
      ) => {
        drawSmallMaterialCard(
          doc,
          node,
          secondX,
          secondTop
          +
          index * 48,
          depW,
          secondCardH,
          {
            fill:
              '#FFF7ED',

            stroke:
              '#FED7AA'
          }
        );
      }
    );


  return y + rowH;
}


function drawExecutivePage(
  doc,
  plan,
  type,
  rows,
  events,
  pageNumberRef
) {
  addPage(
    doc,
    documentTitle(
      type
    ),
    plan,
    pageNumberRef,
    type
  );


  const period =
    operationPeriod(
      events,
      plan.start_date,
      plan.end_date
    );


  const machines =
    uniqueMachines(
      events
    );


  const dates =
    uniqueDates(
      events
    );


  const minutes =
    totalMinutes(
      events
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      18
    )
    .text(
      documentTitle(
        type
      ),
      PAGE.margin,
      108,
      {
        width:
          430
      }
    );


  pill(
    doc,
    statusLabel(
      plan.status
    ),
    doc.page.width - 168,
    108,
    126,
    {
      fill:
        isCanceledPlan(
          plan
        )
          ? '#FEE2E2'
          : COLORS.soft,

      color:
        isCanceledPlan(
          plan
        )
          ? COLORS.red
          : COLORS.ink
    }
  );


  roundedPanel(
    doc,
    PAGE.margin,
    146,
    doc.page.width
    -
    PAGE.margin * 2,
    72,
    {
      fill:
        COLORS.soft,

      stroke:
        COLORS.line
    }
  );


  infoPair(
    doc,
    'Código do planejamento',
    plan.code
    ||
    plan.id,
    56,
    161,
    180
  );


  infoPair(
    doc,
    'Período planejado',
    `${
      formatDate(
        period.startDate
      )
      ||
      '-'
    } até ${
      formatDate(
        period.endDate
      )
      ||
      '-'
    }`,
    236,
    161,
    180
  );


  infoPair(
    doc,
    'Turno operacional',
    formatHourDuration(
      plan.hours_per_day
    ),
    416,
    161,
    122
  );


  /*
   * Mantemos somente os dois cards
   * aprovados:
   *
   * - Dias programados
   * - Tempo operacional estimado
   */
  const gap =
    12;


  const cardW =
    (
      doc.page.width
      -
      PAGE.margin * 2
      -
      gap
    )
    /
    2;


  summaryCard(
    doc,
    'Dias programados',
    dates.length,
    PAGE.margin,
    232,
    cardW,
    COLORS.cyan
  );


  summaryCard(
    doc,
    'Tempo operacional estimado',
    minutes
      ? formatDuration(
          minutes
        )
      : '-',
    PAGE.margin
    +
    cardW
    +
    gap,
    232,
    cardW,
    COLORS.green
  );


  sectionTitle(
    doc,
    (
      type
      ===
      DOCUMENT_TYPES.MATRIZ
    )
      ? 'BOBINAS PLANEJADAS E INSUMOS'
      : 'MATERIAIS FINAIS PLANEJADOS E CADEIA NECESSÁRIA',
    PAGE.margin,
    306,
    doc.page.width
    -
    PAGE.margin * 2
  );


  let y =
    337;


  const maxRowsFirstPage =
    3;


  rows
    .slice(
      0,
      maxRowsFirstPage
    )
    .forEach(
      row => {
        y =
          drawChainRow(
            doc,
            row,
            type,
            PAGE.margin,
            y,
            doc.page.width
            -
            PAGE.margin * 2
          );
      }
    );


  if (
    rows.length
    >
    maxRowsFirstPage
  ) {
    doc.fillColor(
      COLORS.muted
    )
      .font(
        'Helvetica-Bold'
      )
      .fontSize(
        8
      )
      .text(
        `+ ${
          rows.length
          -
          maxRowsFirstPage
        } material(is) será(ão) apresentado(s) no detalhamento diário.`,
        PAGE.margin,
        y + 2,
        {
          width:
            doc.page.width
            -
            PAGE.margin * 2
        }
      );


    y +=
      24;
  }


  const machinesY =
    Math.max(
      y + 4,
      682
    );


  roundedPanel(
    doc,
    PAGE.margin,
    machinesY,
    doc.page.width
    -
    PAGE.margin * 2,
    64,
    {
      fill:
        '#EFF6FF',

      stroke:
        '#BFDBFE'
    }
  );


  doc.fillColor(
    '#1E3A8A'
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.5
    )
    .text(
      'MÁQUINAS PREVISTAS',
      PAGE.margin + 14,
      machinesY + 11,
      {
        width:
          doc.page.width
          -
          PAGE.margin * 2
          -
          28
      }
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica'
    )
    .fontSize(
      9
    )
    .text(
      machines.length
        ? machines.join(
            ', '
          )
        : 'Não informado',
      PAGE.margin + 14,
      machinesY + 30,
      {
        width:
          doc.page.width
          -
          PAGE.margin * 2
          -
          28,

        height:
          24
      }
    );
}


function drawDayHeader(
  doc,
  date,
  events,
  x,
  y,
  width
) {
  const machines =
    uniqueMachines(
      events
    );


  const minutes =
    totalMinutes(
      events
    );


  /*
   * Cabeçalho compacto.
   *
   * Não existe mais "continuação"
   * e não existe contagem de transporte.
   */
  roundedPanel(
    doc,
    x,
    y,
    width,
    42,
    {
      fill:
        COLORS.soft,

      stroke:
        COLORS.line
    }
  );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      13.5
    )
    .text(
      formatDate(
        date
      ),
      x + 13,
      y + 8,
      {
        width:
          110,

        height:
          18
      }
    );


  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7
    )
    .text(
      weekdayLabel(
        date
      ),
      x + 13,
      y + 26,
      {
        width:
          110
      }
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.8
    )
    .text(
      `${
        events.length
      } produção(ões)  |  ${
        machines.length
      } máquina(s)${
        minutes
          ? `  |  ${formatDuration(minutes)}`
          : ''
      }`,
      x + 135,
      y + 16,
      {
        width:
          width - 150,

        align:
          'right'
      }
    );


  return y + 50;
}


function drawCompactProductionCard(
  doc,
  event,
  x,
  y,
  width
) {
  /*
   * Antes o card ocupava ~132 px.
   * Agora são somente 80 px.
   *
   * Isso reduz bastante a quantidade
   * de páginas do planejamento.
   */
  const height =
    80;


  const accent =
    productionColor(
      event.productionIndex,
      event.productionColor
    );


  roundedPanel(
    doc,
    x,
    y,
    width,
    height,
    {
      fill:
        COLORS.paper,

      stroke:
        COLORS.line,

      accent
    }
  );


  doc.fillColor(
    accent
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7
    )
    .text(
      text(
        event.productionTitle
      ).toUpperCase(),
      x + 14,
      y + 8,
      {
        width:
          105,

        height:
          13
      }
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      9.5
    )
    .text(
      event.materialName
      ||
      '-',
      x + 125,
      y + 8,
      {
        width:
          width - 240,

        height:
          15
      }
    );


  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica'
    )
    .fontSize(
      6.2
    )
    .text(
      event.materialCode
      ||
      '',
      x + 125,
      y + 25,
      {
        width:
          width - 240,

        height:
          9
      }
    );


  pill(
    doc,
    'PRODUÇÃO',
    x + width - 98,
    y + 7,
    82,
    {
      height:
        20,

      fontSize:
        6.8
    }
  );


  const fieldY =
    y + 39;


  const gap =
    7;


  const fieldW =
    (
      width
      -
      32
      -
      gap * 4
    )
    /
    5;


  const values = [
    [
      'Máquina',
      event.machineName
      ||
      '-'
    ],

    [
      'Pessoas',
      formatPeople(
        event.peopleCount
      )
    ],

    [
      'Previsto',
      `${
        formatNumber(
          event.quantity
        )
      } ${
        event.unit
        ||
        ''
      }`.trim()
    ],

    [
      'Tempo estimado',
      event.durationMinutes
        ? formatDuration(
            event.durationMinutes
          )
        : '-'
    ],

    [
      'Realizado',
      '________________'
    ]
  ];


  values.forEach(
    (
      item,
      index
    ) => {
      const fx =
        x
        +
        14
        +
        index
        *
        (
          fieldW
          +
          gap
        );


      doc.fillColor(
        COLORS.muted
      )
        .font(
          'Helvetica-Bold'
        )
        .fontSize(
          5.8
        )
        .text(
          item[0].toUpperCase(),
          fx,
          fieldY,
          {
            width:
              fieldW
          }
        );


      doc.fillColor(
        COLORS.ink
      )
        .font(
          index === 4
            ? 'Helvetica'
            : 'Helvetica-Bold'
        )
        .fontSize(
          7.4
        )
        .text(
          item[1],
          fx,
          fieldY + 12,
          {
            width:
              fieldW,

            height:
              18
          }
        );
    }
  );


  doc.strokeColor(
    COLORS.line
  )
    .lineWidth(
      0.6
    )
    .moveTo(
      x + 14,
      y + 67
    )
    .lineTo(
      x + width - 14,
      y + 67
    )
    .stroke();


  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica'
    )
    .fontSize(
      6.6
    )
    .text(
      'Observação: _________________________________________________________________',
      x + 14,
      y + 70,
      {
        width:
          width - 28,

        height:
          10
      }
    );


  return (
    y
    +
    height
    +
    7
  );
}


function drawDailySchedulePages(
  doc,
  plan,
  type,
  events,
  pageNumberRef
) {
  const byDate =
    new Map();


  events.forEach(
    event => {
      if (
        !event.date
      ) {
        return;
      }


      if (
        !byDate.has(
          event.date
        )
      ) {
        byDate.set(
          event.date,
          []
        );
      }


      byDate
        .get(
          event.date
        )
        .push(
          event
        );
    }
  );


  const dates =
    [
      ...byDate.keys()
    ].sort();


  if (
    !dates.length
  ) {
    return;
  }


  let pageOpen =
    false;


  let cursorY =
    0;


  const openPage =
    (
      date,
      dayEvents
    ) => {
      addPage(
        doc,
        `PROGRAMAÇÃO OPERACIONAL · ${type.toUpperCase()}`,
        plan,
        pageNumberRef,
        type
      );


      cursorY =
        drawDayHeader(
          doc,
          date,
          dayEvents,
          PAGE.margin,
          106,
          doc.page.width
          -
          PAGE.margin * 2
        );


      pageOpen =
        true;
    };


  for (
    const date
    of dates
  ) {
    const dayEvents =
      byDate
        .get(
          date
        )
        .sort(
          compareScheduleEvents
        );


    if (
      !pageOpen
      ||
      cursorY + 132
      >
      PAGE.bottom
    ) {
      openPage(
        date,
        dayEvents
      );
    } else {
      cursorY +=
        5;


      cursorY =
        drawDayHeader(
          doc,
          date,
          dayEvents,
          PAGE.margin,
          cursorY,
          doc.page.width
          -
          PAGE.margin * 2
        );
    }


    for (
      const event
      of dayEvents
    ) {
      /*
       * Caso um mesmo dia continue na próxima página,
       * apenas repetimos o card do dia.
       *
       * Não escrevemos mais "continuação".
       */
      if (
        cursorY + 88
        >
        PAGE.bottom
      ) {
        openPage(
          date,
          dayEvents
        );
      }


      cursorY =
        drawCompactProductionCard(
          doc,
          event,
          PAGE.margin,
          cursorY,
          doc.page.width
          -
          PAGE.margin * 2
        );
    }
  }
}


function drawLinedSection(
  doc,
  title,
  x,
  y,
  width,
  height,
  options = {}
) {
  roundedPanel(
    doc,
    x,
    y,
    width,
    height,
    {
      fill:
        options.fill
        ||
        COLORS.paper,

      stroke:
        options.stroke
        ||
        COLORS.line
    }
  );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      11.5
    )
    .text(
      title,
      x + 15,
      y + 13,
      {
        width:
          width - 30
      }
    );


  for (
    let lineY =
      y + 48;

    lineY
      <=
      y + height - 20;

    lineY +=
      31
  ) {
    doc.strokeColor(
      '#CBD5E1'
    )
      .lineWidth(
        0.8
      )
      .moveTo(
        x + 15,
        lineY
      )
      .lineTo(
        x + width - 15,
        lineY
      )
      .stroke();
  }
}


function drawNotesPage(
  doc,
  plan,
  type,
  pageNumberRef
) {
  addPage(
    doc,
    `OBSERVAÇÕES E DESVIOS · ${type.toUpperCase()}`,
    plan,
    pageNumberRef,
    type
  );


  sectionTitle(
    doc,
    'OBSERVAÇÕES / DESVIOS / OCORRÊNCIAS',
    PAGE.margin,
    108,
    doc.page.width
    -
    PAGE.margin * 2
  );


  drawLinedSection(
    doc,
    'Observações gerais',
    PAGE.margin,
    143,
    doc.page.width
    -
    PAGE.margin * 2,
    175
  );


  drawLinedSection(
    doc,
    'Desvios / paradas / ocorrências',
    PAGE.margin,
    333,
    doc.page.width
    -
    PAGE.margin * 2,
    185,
    {
      fill:
        '#FFFBEB',

      stroke:
        '#FDE68A'
    }
  );


  drawLinedSection(
    doc,
    'Ações / decisões / replanejamento',
    PAGE.margin,
    533,
    doc.page.width
    -
    PAGE.margin * 2,
    185,
    {
      fill:
        '#EFF6FF',

      stroke:
        '#BFDBFE'
    }
  );


  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      8
    )
    .text(
      'Replanejamento necessário:   [  ] Sim      [  ] Não',
      PAGE.margin + 15,
      736,
      {
        width:
          doc.page.width
          -
          PAGE.margin * 2
          -
          30
      }
    );
}


function drawSignatureBlock(
  doc,
  title,
  x,
  y,
  width
) {
  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      14
    )
    .text(
      title,
      x,
      y,
      {
        width
      }
    );


  /*
   * Nome
   */
  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.5
    )
    .text(
      'NOME',
      x,
      y + 43,
      {
        width
      }
    );


  doc.strokeColor(
    COLORS.strongLine
  )
    .lineWidth(
      1
    )
    .moveTo(
      x,
      y + 71
    )
    .lineTo(
      x + width,
      y + 71
    )
    .stroke();


  /*
   * Assinatura
   */
  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.5
    )
    .text(
      'ASSINATURA',
      x,
      y + 95,
      {
        width
      }
    );


  doc.strokeColor(
    COLORS.strongLine
  )
    .lineWidth(
      1
    )
    .moveTo(
      x,
      y + 127
    )
    .lineTo(
      x + width,
      y + 127
    )
    .stroke();


  /*
   * Data
   *
   * Não existe mais a linha horizontal
   * adicional.
   *
   * Fica somente o campo:
   *
   * ____ / ____ / ________
   */
  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      7.5
    )
    .text(
      'DATA',
      x,
      y + 151,
      {
        width
      }
    );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica'
    )
    .fontSize(
      10.5
    )
    .text(
      '____ / ____ / ________',
      x,
      y + 174,
      {
        width:
          170,

        align:
          'left'
      }
    );
}


function drawSignatures(
  doc,
  plan,
  type,
  pageNumberRef
) {
  addPage(
    doc,
    `ASSINATURAS · ${type.toUpperCase()}`,
    plan,
    pageNumberRef,
    type
  );


  doc.fillColor(
    COLORS.ink
  )
    .font(
      'Helvetica-Bold'
    )
    .fontSize(
      19
    )
    .text(
      'APROVAÇÃO DO PLANEJAMENTO',
      PAGE.margin,
      108,
      {
        width:
          doc.page.width
          -
          PAGE.margin * 2
      }
    );


  doc.fillColor(
    COLORS.muted
  )
    .font(
      'Helvetica'
    )
    .fontSize(
      9
    )
    .text(
      `Documento ${
        type.toUpperCase()
      } · Planejamento ${
        plan.code
        ||
        plan.id
        ||
        '-'
      }`,
      PAGE.margin,
      138,
      {
        width:
          doc.page.width
          -
          PAGE.margin * 2
      }
    );


  drawSignatureBlock(
    doc,
    'PCP',
    76,
    196,
    doc.page.width - 152
  );


  drawSignatureBlock(
    doc,
    'SUPERVISOR DE PRODUÇÃO',
    76,
    446,
    doc.page.width - 152
  );
}


function documentHasContent(
  rows,
  events
) {
  return (
    rows.length > 0
    ||
    events.length > 0
  );
}


function drawDocument(
  doc,
  plan,
  days,
  tree,
  operations,
  allEvents,
  type,
  pageNumberRef
) {
  const events =
    filterEventsForDocument(
      allEvents,
      type
    );


  const rows =
    productionRowsForDocument(
      type,
      tree,
      plan,
      allEvents
    );


  if (
    !documentHasContent(
      rows,
      events
    )
  ) {
    return false;
  }


  /*
   * 1. Capa / resumo
   */
  drawExecutivePage(
    doc,
    plan,
    type,
    rows,
    events,
    pageNumberRef
  );


  /*
   * 2. Programação operacional diária
   */
  drawDailySchedulePages(
    doc,
    plan,
    type,
    events,
    pageNumberRef
  );


  /*
   * Não existem mais:
   *
   * - Fluxo produtivo
   * - Detalhamento da cadeia em páginas
   * - Resumo extra de recursos
   *
   * A cadeia necessária já aparece
   * compacta na primeira página.
   */


  /*
   * 3. Observações / desvios
   */
  drawNotesPage(
    doc,
    plan,
    type,
    pageNumberRef
  );


  /*
   * 4. Assinaturas
   */
  drawSignatures(
    doc,
    plan,
    type,
    pageNumberRef
  );


  return true;
}


function normalizedDocumentType(value) {
  const type =
    text(value)
      .trim()
      .toLowerCase();


  if (
    type
    ===
    DOCUMENT_TYPES.MATRIZ
  ) {
    return DOCUMENT_TYPES.MATRIZ;
  }


  if (
    type
    ===
    DOCUMENT_TYPES.FEITAL
  ) {
    return DOCUMENT_TYPES.FEITAL;
  }


  return '';
}


export function createPlanningPdf(
  plan,
  days,
  tree = null,
  operations = [],
  documentType = null
) {
  tree =
    normalizeObject(
      tree
      ||
      plan.schedule_tree
    );


  operations =
    normalizeArray(
      operations
      ||
      plan.operations
    );


  const doc =
    new PDFDocument({
      autoFirstPage:
        false,

      size:
        'A4',

      margin:
        PAGE.margin,

      bufferPages:
        false,

      info: {
        Title:
          `Planejamento de Produção ${
            plan.code
            ||
            plan.id
            ||
            ''
          }`.trim(),

        Author:
          'Aço-Fer',

        Subject:
          'Planejamento operacional de produção'
      }
    });


  const chunks =
    [];


  const pageNumberRef = {
    value:
      0
  };


  const events =
    buildScheduleEvents(
      plan,
      days,
      operations
    );


  const requestedType =
    normalizedDocumentType(
      documentType
      ||
      plan.pdf_document_type
      ||
      plan.pdfDocumentType
    );


  doc.on(
    'data',
    chunk =>
      chunks.push(
        chunk
      )
  );


  if (
    requestedType
  ) {
    /*
     * Quando a rota informar explicitamente:
     *
     * matriz
     *
     * ou:
     *
     * feital
     *
     * gera somente o documento solicitado.
     */
    drawDocument(
      doc,
      plan,
      days,
      tree,
      operations,
      events,
      requestedType,
      pageNumberRef
    );
  } else {
    /*
     * COMPATIBILIDADE COM A ROTA ATUAL
     *
     * Hoje a rota chama:
     *
     * createPlanningPdf(
     *   plan,
     *   days,
     *   tree,
     *   operations
     * )
     *
     * sem informar Matriz ou Feital.
     *
     * Para não quebrar nada agora,
     * geramos os dois cadernos dentro
     * do mesmo PDF:
     *
     * 1. MATRIZ
     * 2. FEITAL
     *
     * Depois, se criarmos dois botões,
     * basta passar o 5º argumento.
     */

    const matrixDrawn =
      drawDocument(
        doc,
        plan,
        days,
        tree,
        operations,
        events,
        DOCUMENT_TYPES.MATRIZ,
        pageNumberRef
      );


    const feitalDrawn =
      drawDocument(
        doc,
        plan,
        days,
        tree,
        operations,
        events,
        DOCUMENT_TYPES.FEITAL,
        pageNumberRef
      );


    /*
     * Proteção para planejamento antigo
     * ou sem informações de calendário.
     */
    if (
      !matrixDrawn
      &&
      !feitalDrawn
    ) {
      addPage(
        doc,
        'PLANEJAMENTO DE PRODUÇÃO',
        plan,
        pageNumberRef,
        DOCUMENT_TYPES.FEITAL
      );


      doc.fillColor(
        COLORS.muted
      )
        .font(
          'Helvetica'
        )
        .fontSize(
          11
        )
        .text(
          'Não foram encontradas operações produtivas para este planejamento.',
          PAGE.margin,
          132,
          {
            width:
              doc.page.width
              -
              PAGE.margin * 2
          }
        );
    }
  }


  doc.end();


  return new Promise(
    (
      resolve,
      reject
    ) => {
      doc.on(
        'end',
        () =>
          resolve(
            Buffer.concat(
              chunks
            )
          )
      );


      doc.on(
        'error',
        reject
      );
    }
  );
}


/*
 * Exportações já preparadas para quando
 * criarmos dois botões separados:
 *
 * - PDF Matriz
 * - PDF Feital
 */
export function createPlanningPdfMatriz(
  plan,
  days,
  tree = null,
  operations = []
) {
  return createPlanningPdf(
    plan,
    days,
    tree,
    operations,
    DOCUMENT_TYPES.MATRIZ
  );
}


export function createPlanningPdfFeital(
  plan,
  days,
  tree = null,
  operations = []
) {
  return createPlanningPdf(
    plan,
    days,
    tree,
    operations,
    DOCUMENT_TYPES.FEITAL
  );
}