function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const factor =
    10 ** digits;

  return (
    Math.round(
      (
        number
        +
        Number.EPSILON
      )
      *
      factor
    )
    /
    factor
  );
}

function normalizeText(value) {
  return String(
    value || ''
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .trim()
    .toLocaleLowerCase(
      'pt-BR'
    );
}

function dateOnly(value) {
  if (!value) {
    return '';
  }

  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return '';
    }

    return value
      .toISOString()
      .slice(0, 10);
  }

  return String(
    value
  ).slice(0, 10);
}

function todaySaoPaulo() {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Sao_Paulo',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit'
      }
    ).formatToParts(
      new Date()
    );

  const values =
    Object.fromEntries(
      parts
        .filter(
          part =>
            part.type
            !==
            'literal'
        )
        .map(
          part => [
            part.type,
            part.value
          ]
        )
    );

  return (
    `${values.year}`
    +
    `-${values.month}`
    +
    `-${values.day}`
  );
}

function daysBetween(
  startDate,
  endDate
) {
  const start =
    new Date(
      `${startDate}T00:00:00Z`
    );

  const end =
    new Date(
      `${endDate}T00:00:00Z`
    );

  return (
    Math.floor(
      (
        end
        -
        start
      )
      /
      86400000
    )
    +
    1
  );
}

export function normalizeDashboardPeriod(
  startDate,
  endDate
) {
  const today =
    todaySaoPaulo();

  const start =
    String(
      startDate
      ||
      today
    ).trim();

  const end =
    String(
      endDate
      ||
      start
    ).trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      start
    )
    ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      end
    )
  ) {
    const error =
      new Error(
        'Período inválido. Use YYYY-MM-DD.'
      );

    error.status =
      400;

    throw error;
  }

  if (
    start
    >
    end
  ) {
    const error =
      new Error(
        'Data inicial não pode ser maior que a data final.'
      );

    error.status =
      400;

    throw error;
  }

  const days =
    daysBetween(
      start,
      end
    );

  if (
    days
    >
    366
  ) {
    const error =
      new Error(
        'O Dashboard aceita no máximo 366 dias por consulta.'
      );

    error.status =
      400;

    throw error;
  }

  return {
    startDate:
      start,

    endDate:
      end,

    days
  };
}

function quantityToKg(row) {
  const quantity =
    toNumber(
      row.quantity,
      NaN
    );

  if (
    !Number.isFinite(
      quantity
    )
  ) {
    return null;
  }

  const primaryUnit =
    normalizeText(
      row.primary_unit
    );

  const secondaryUnit =
    normalizeText(
      row.material_secondary_unit
      ||
      row.secondary_unit
    );

  const factor =
    toNumber(
      row.material_factor,
      NaN
    );

  if (
    primaryUnit
    ===
    'kg'
  ) {
    return quantity;
  }

  if (
    primaryUnit
      ===
      'un'

    &&

    secondaryUnit
      ===
      'kg'

    &&

    Number.isFinite(
      factor
    )

    &&

    factor
      >
      0
  ) {
    return (
      quantity
      *
      factor
    );
  }

  return null;
}

function realWeightKg(row) {
  const lots =
    Array.isArray(
      row.produced_lots
    )
      ? row.produced_lots
      : [];

  let total = 0;
  let found = false;

  for (
    const lot
    of
    lots
  ) {
    const weight =
      toNumber(
        lot?.realWeight
        ??
        lot?.real_weight,
        NaN
      );

    const unit =
      normalizeText(
        lot?.realWeightUnit
        ||
        lot?.real_weight_unit
        ||
        lot?.secondaryUnit
        ||
        lot?.secondary_unit
        ||
        row.secondary_unit
      );

    if (
      Number.isFinite(
        weight
      )
      &&
      weight > 0
      &&
      unit === 'kg'
    ) {
      total +=
        weight;

      found =
        true;
    }
  }

  return found
    ? total
    : null;
}

function qualityStatus(
  actual,
  minimum,
  maximum
) {
  if (
    actual
    <
    minimum
  ) {
    return (
      'below_minimum'
    );
  }

  if (
    actual
    >
    maximum
  ) {
    return (
      'above_maximum'
    );
  }

  return (
    'compliant'
  );
}

function analyzeQuality(row) {
  const snapshotActual =
    toNumber(
      row.quality_actual_weight_per_meter,
      NaN
    );

  const snapshotLength =
    toNumber(
      row.quality_total_length_m,
      NaN
    );

  const snapshotWeight =
    toNumber(
      row.quality_real_weight_kg,
      NaN
    );

  const snapshotMinimum =
    toNumber(
      row.quality_minimum_weight_per_meter,
      NaN
    );

  const snapshotNominal =
    toNumber(
      row.quality_nominal_weight_per_meter,
      NaN
    );

  const snapshotMaximum =
    toNumber(
      row.quality_maximum_weight_per_meter,
      NaN
    );

  /*
   * PRODUÇÕES NOVAS:
   *
   * Se já houver snapshot da migration 031,
   * utilizar SEM recalcular usando o cadastro atual.
   */
  if (
    row.quality_status

    &&

    Number.isFinite(
      snapshotActual
    )

    &&

    Number.isFinite(
      snapshotLength
    )

    &&

    snapshotLength > 0

    &&

    Number.isFinite(
      snapshotWeight
    )

    &&

    snapshotWeight > 0

    &&

    Number.isFinite(
      snapshotMinimum
    )

    &&

    Number.isFinite(
      snapshotNominal
    )

    &&

    Number.isFinite(
      snapshotMaximum
    )
  ) {
    return {
      source:
        'snapshot',

      normName:
        row.quality_norm_name
        ||
        null,

      lengthM:
        toNumber(
          row.quality_length_m
        ),

      totalLengthM:
        snapshotLength,

      realWeightKg:
        snapshotWeight,

      minimumKgM:
        snapshotMinimum,

      nominalKgM:
        snapshotNominal,

      maximumKgM:
        snapshotMaximum,

      actualKgM:
        snapshotActual,

      status:
        String(
          row.quality_status
        )
    };
  }

  /*
   * PRODUÇÕES HISTÓRICAS:
   *
   * Se não existe snapshot,
   * avaliar SOMENTE PARA LEITURA DO DASHBOARD
   * utilizando o cadastro atual do material e Norma.
   *
   * NÃO gravar nada no banco.
   */
  const lengthM =
    toNumber(
      row.material_length_m,
      NaN
    );

  const minimum =
    toNumber(
      row.current_minimum_weight_per_meter,
      NaN
    );

  const nominal =
    toNumber(
      row.current_nominal_weight_per_meter,
      NaN
    );

  const maximum =
    toNumber(
      row.current_maximum_weight_per_meter,
      NaN
    );

  if (
    row.material_type_requires_length
      !==
      true

    ||

    !Number.isFinite(
      lengthM
    )

    ||

    lengthM <= 0

    ||

    !row.current_norm_name

    ||

    !Number.isFinite(
      minimum
    )

    ||

    !Number.isFinite(
      nominal
    )

    ||

    !Number.isFinite(
      maximum
    )
  ) {
    return null;
  }

  const lots =
    Array.isArray(
      row.produced_lots
    )
      ? row.produced_lots
      : [];

  if (
    !lots.length
  ) {
    return null;
  }

  let totalLengthM = 0;
  let totalWeightKg = 0;

  const statuses =
    new Set();

  for (
    const lot
    of
    lots
  ) {
    const quantity =
      toNumber(
        lot?.quantity,
        NaN
      );

    const weight =
      toNumber(
        lot?.realWeight
        ??
        lot?.real_weight,
        NaN
      );

    const unit =
      normalizeText(
        lot?.realWeightUnit
        ||
        lot?.real_weight_unit
        ||
        lot?.secondaryUnit
        ||
        lot?.secondary_unit
        ||
        row.secondary_unit
      );

    if (
      !Number.isFinite(
        quantity
      )

      ||

      quantity <= 0

      ||

      !Number.isFinite(
        weight
      )

      ||

      weight <= 0

      ||

      unit !== 'kg'
    ) {
      return null;
    }

    const lotLength =
      quantity
      *
      lengthM;

    const actual =
      weight
      /
      lotLength;

    totalLengthM +=
      lotLength;

    totalWeightKg +=
      weight;

    statuses.add(
      qualityStatus(
        actual,
        minimum,
        maximum
      )
    );
  }

  if (
    totalLengthM <= 0
    ||
    totalWeightKg <= 0
  ) {
    return null;
  }

  const actualKgM =
    totalWeightKg
    /
    totalLengthM;

  return {
    source:
      'fallback_current_registration',

    normName:
      row.current_norm_name,

    lengthM,

    totalLengthM,

    realWeightKg:
      totalWeightKg,

    minimumKgM:
      minimum,

    nominalKgM:
      nominal,

    maximumKgM:
      maximum,

    actualKgM,

    status:
      statuses.size > 1
        ? 'mixed'
        : (
            [...statuses][0]
            ||
            qualityStatus(
              actualKgM,
              minimum,
              maximum
            )
          )
  };
}

function mapAggregate(
  items,
  keyFn,
  createFn,
  addFn
) {
  const map =
    new Map();

  for (
    const item
    of
    items
  ) {
    const key =
      keyFn(
        item
      );

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        createFn(
          item
        )
      );
    }

    addFn(
      map.get(
        key
      ),
      item
    );
  }

  return [
    ...map.values()
  ];
}

function buildProduction(rows) {
  const items =
    rows.map(
      row => ({
        row,

        equivalentKg:
          quantityToKg(
            row
          ),

        realWeightKg:
          realWeightKg(
            row
          )
      })
    );

  const daily =
    mapAggregate(
      items,

      item =>
        dateOnly(
          item.row
            .production_date
        ),

      item => ({
        date:
          dateOnly(
            item.row
              .production_date
          ),

        productionCount:
          0,

        equivalentKg:
          0,

        realWeightKg:
          0
      }),

      (
        target,
        item
      ) => {
        target.productionCount +=
          1;

        if (
          item.equivalentKg
          !==
          null
        ) {
          target.equivalentKg +=
            item.equivalentKg;
        }

        if (
          item.realWeightKg
          !==
          null
        ) {
          target.realWeightKg +=
            item.realWeightKg;
        }
      }
    )
      .map(
        item => ({
          ...item,

          equivalentKg:
            round(
              item.equivalentKg
            ),

          realWeightKg:
            round(
              item.realWeightKg
            )
        })
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );

  const byMachine =
    mapAggregate(
      items,

      item =>
        String(
          item.row.machine_name
          ||
          'Sem máquina'
        ),

      item => ({
        machineName:
          item.row.machine_name
          ||
          'Sem máquina',

        locationName:
          item.row.location_name
          ||
          null,

        productionCount:
          0,

        equivalentKg:
          0,

        realWeightKg:
          0,

        peopleTotal:
          0,

        peopleSamples:
          0,

        peopleMax:
          0
      }),

      (
        target,
        item
      ) => {
        target.productionCount +=
          1;

        if (
          item.equivalentKg
          !==
          null
        ) {
          target.equivalentKg +=
            item.equivalentKg;
        }

        if (
          item.realWeightKg
          !==
          null
        ) {
          target.realWeightKg +=
            item.realWeightKg;
        }

        const people =
          toNumber(
            item.row.people_count
          );

        if (
          people > 0
        ) {
          target.peopleTotal +=
            people;

          target.peopleSamples +=
            1;

          target.peopleMax =
            Math.max(
              target.peopleMax,
              people
            );
        }
      }
    )
      .map(
        item => ({
          ...item,

          equivalentKg:
            round(
              item.equivalentKg
            ),

          realWeightKg:
            round(
              item.realWeightKg
            ),

          averagePeople:
            item.peopleSamples
              ? round(
                  item.peopleTotal
                  /
                  item.peopleSamples,
                  2
                )
              : 0
        })
      )
      .sort(
        (a, b) =>
          b.realWeightKg
          -
          a.realWeightKg
          ||
          b.equivalentKg
          -
          a.equivalentKg
      );

  const byMaterial =
    mapAggregate(
      items,

      item =>
        String(
          item.row.material_id
          ||
          item.row.material_name
        ),

      item => ({
        materialId:
          item.row.material_id
          ||
          null,

        materialName:
          item.row.material_name,

        materialCode:
          item.row.material_code
          ||
          null,

        materialType:
          item.row.material_type_name
          ||
          null,

        primaryUnit:
          item.row.primary_unit,

        quantity:
          0,

        equivalentKg:
          0,

        realWeightKg:
          0,

        productionCount:
          0
      }),

      (
        target,
        item
      ) => {
        target.quantity +=
          toNumber(
            item.row.quantity
          );

        target.productionCount +=
          1;

        if (
          item.equivalentKg
          !==
          null
        ) {
          target.equivalentKg +=
            item.equivalentKg;
        }

        if (
          item.realWeightKg
          !==
          null
        ) {
          target.realWeightKg +=
            item.realWeightKg;
        }
      }
    )
      .map(
        item => ({
          ...item,

          quantity:
            round(
              item.quantity
            ),

          equivalentKg:
            round(
              item.equivalentKg
            ),

          realWeightKg:
            round(
              item.realWeightKg
            )
        })
      )
      .sort(
        (a, b) =>
          b.realWeightKg
          -
          a.realWeightKg
          ||
          b.equivalentKg
          -
          a.equivalentKg
      );

  return {
    summary: {
      productionCount:
        rows.length,

      equivalentKg:
        round(
          items.reduce(
            (
              sum,
              item
            ) =>
              sum
              +
              (
                item.equivalentKg
                ||
                0
              ),
            0
          )
        ),

      realWeightKg:
        round(
          items.reduce(
            (
              sum,
              item
            ) =>
              sum
              +
              (
                item.realWeightKg
                ||
                0
              ),
            0
          )
        )
    },

    daily,

    byMachine,

    byMaterial,

    details:
      items.map(item => ({ id: item.row.id, date: dateOnly(item.row.production_date), materialId: item.row.material_id || null, materialName: item.row.material_name || '-', materialCode: item.row.material_code || null, materialType: item.row.material_type_name || null, machineName: item.row.machine_name || 'Sem máquina', locationName: item.row.location_name || null, quantity: round(toNumber(item.row.quantity)), unit: item.row.primary_unit || item.row.material_primary_unit || '', people: toNumber(item.row.people_count), equivalentKg: item.equivalentKg === null ? null : round(item.equivalentKg), realWeightKg: item.realWeightKg === null ? null : round(item.realWeightKg) }))
  };
}

function buildQuality(rows) {
  const analyzed =
    rows
      .map(
        row => ({
          row,

          quality:
            analyzeQuality(
              row
            )
        })
      )
      .filter(
        item =>
          item.quality
      );

  const compliant =
    analyzed.filter(
      item =>
        item.quality.status
        ===
        'compliant'
    ).length;

  const byMaterial =
    mapAggregate(
      analyzed,

      item =>
        String(
          item.row.material_id
          ||
          item.row.material_name
        ),

      item => ({
        materialId:
          item.row.material_id
          ||
          null,

        materialName:
          item.row.material_name,

        materialCode:
          item.row.material_code
          ||
          null,

        materialType:
          item.row.material_type_name
          ||
          null,

        normName:
          item.quality.normName,

        lengthM:
          item.quality.lengthM,

        minimumKgM:
          item.quality.minimumKgM,

        nominalKgM:
          item.quality.nominalKgM,

        maximumKgM:
          item.quality.maximumKgM,

        totalLengthM:
          0,

        realWeightKg:
          0,

        evaluatedProductions:
          0,

        compliantProductions:
          0,

        fallbackHistoricalProductions:
          0
      }),

      (
        target,
        item
      ) => {
        target.totalLengthM +=
          item.quality.totalLengthM;

        target.realWeightKg +=
          item.quality.realWeightKg;

        target.evaluatedProductions +=
          1;

        if (
          item.quality.status
          ===
          'compliant'
        ) {
          target.compliantProductions +=
            1;
        }

        if (
          item.quality.source
          !==
          'snapshot'
        ) {
          target.fallbackHistoricalProductions +=
            1;
        }
      }
    )
      .map(
        item => {
          const actualKgM =
            item.totalLengthM > 0
              ? (
                  item.realWeightKg
                  /
                  item.totalLengthM
                )
              : 0;

          const deviationKgM =
            actualKgM
            -
            item.nominalKgM;

          return {
            ...item,

            totalLengthM:
              round(
                item.totalLengthM
              ),

            realWeightKg:
              round(
                item.realWeightKg
              ),

            /*
             * IMPORTANTE:
             *
             * Em período/range:
             * kg/m real é média ponderada pelos metros.
             *
             * Ou seja:
             * peso total / metragem total.
             *
             * NÃO usar média simples dos kg/m.
             */
            actualKgM:
              round(
                actualKgM,
                6
              ),

            deviationKgM:
              round(
                deviationKgM,
                6
              ),

            deviationPercent:
              item.nominalKgM > 0
                ? round(
                    (
                      deviationKgM
                      /
                      item.nominalKgM
                    )
                    *
                    100,
                    3
                  )
                : 0,

            status:
              qualityStatus(
                actualKgM,
                item.minimumKgM,
                item.maximumKgM
              ),

            compliancePercent:
              item.evaluatedProductions
                ? round(
                    (
                      item.compliantProductions
                      /
                      item.evaluatedProductions
                    )
                    *
                    100,
                    2
                  )
                : 0
          };
        }
      )
      .sort(
        (a, b) =>
          b.realWeightKg
          -
          a.realWeightKg
      );

  const daily =
    mapAggregate(
      analyzed,

      item =>
        dateOnly(
          item.row
            .production_date
        ),

      item => ({
        date:
          dateOnly(
            item.row
              .production_date
          ),

        totalLengthM:
          0,

        realWeightKg:
          0,

        evaluatedProductions:
          0,

        compliantProductions:
          0
      }),

      (
        target,
        item
      ) => {
        target.totalLengthM +=
          item.quality.totalLengthM;

        target.realWeightKg +=
          item.quality.realWeightKg;

        target.evaluatedProductions +=
          1;

        if (
          item.quality.status
          ===
          'compliant'
        ) {
          target.compliantProductions +=
            1;
        }
      }
    )
      .map(
        item => ({
          ...item,

          totalLengthM:
            round(
              item.totalLengthM
            ),

          realWeightKg:
            round(
              item.realWeightKg
            ),

          compliancePercent:
            item.evaluatedProductions
              ? round(
                  (
                    item.compliantProductions
                    /
                    item.evaluatedProductions
                  )
                  *
                  100,
                  2
                )
              : 0
        })
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );

  return {
    summary: {
      evaluatedProductions:
        analyzed.length,

      compliantProductions:
        compliant,

      nonCompliantProductions:
        analyzed.length
        -
        compliant,

      compliancePercent:
        analyzed.length
          ? round(
              (
                compliant
                /
                analyzed.length
              )
              *
              100,
              2
            )
          : 0,

      /*
       * Quantas produções antigas foram analisadas
       * usando cadastro atual em vez de snapshot.
       */
      fallbackHistoricalProductions:
        analyzed.filter(
          item =>
            item.quality.source
            !==
            'snapshot'
        ).length
    },

    byMaterial,

    daily,

    details:
      analyzed.map(item => { const deviationKgM = item.quality.actualKgM - item.quality.nominalKgM; return { id: item.row.id, date: dateOnly(item.row.production_date), materialId: item.row.material_id || null, materialName: item.row.material_name || '-', materialCode: item.row.material_code || null, machineName: item.row.machine_name || 'Sem máquina', normName: item.quality.normName || '-', source: item.quality.source, lengthM: round(item.quality.lengthM, 3), totalLengthM: round(item.quality.totalLengthM, 3), realWeightKg: round(item.quality.realWeightKg, 3), minimumKgM: round(item.quality.minimumKgM, 6), nominalKgM: round(item.quality.nominalKgM, 6), maximumKgM: round(item.quality.maximumKgM, 6), actualKgM: round(item.quality.actualKgM, 6), deviationKgM: round(deviationKgM, 6), deviationPercent: item.quality.nominalKgM > 0 ? round((deviationKgM / item.quality.nominalKgM) * 100, 3) : 0, status: item.quality.status }; })
  };
}

function buildMesh(rows) {
  const items =
    rows
      .filter(
        row =>
          normalizeText(
            row.material_type_name
          )
          ===
          'malha'
      )
      .map(
        row => {
          const real =
            realWeightKg(
              row
            );

          const theoretical =
            quantityToKg(
              row
            );

          if (
            real === null
            ||
            theoretical === null
            ||
            theoretical <= 0
          ) {
            return null;
          }

          return {
            row,
            real,
            theoretical
          };
        }
      )
      .filter(Boolean);

  const byMaterial =
    mapAggregate(
      items,

      item =>
        String(
          item.row.material_id
          ||
          item.row.material_name
        ),

      item => ({
        materialId:
          item.row.material_id
          ||
          null,

        materialName:
          item.row.material_name,

        productionCount:
          0,

        realWeightKg:
          0,

        theoreticalWeightKg:
          0
      }),

      (
        target,
        item
      ) => {
        target.productionCount +=
          1;

        target.realWeightKg +=
          item.real;

        target.theoreticalWeightKg +=
          item.theoretical;
      }
    )
      .map(
        item => {
          const differenceKg =
            item.realWeightKg
            -
            item.theoreticalWeightKg;

          return {
            ...item,

            realWeightKg:
              round(
                item.realWeightKg
              ),

            theoreticalWeightKg:
              round(
                item.theoreticalWeightKg
              ),

            differenceKg:
              round(
                differenceKg
              ),

            differencePercent:
              item.theoreticalWeightKg > 0
                ? round(
                    (
                      differenceKg
                      /
                      item.theoreticalWeightKg
                    )
                    *
                    100,
                    2
                  )
                : 0
          };
        }
      )
      .sort(
        (a, b) =>
          Math.abs(
            b.differencePercent
          )
          -
          Math.abs(
            a.differencePercent
          )
      );

  const realWeight =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum
        +
        item.real,
      0
    );

  const theoreticalWeight =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum
        +
        item.theoretical,
      0
    );

  const difference =
    realWeight
    -
    theoreticalWeight;

  return {
    summary: {
      evaluatedProductions:
        items.length,

      realWeightKg:
        round(
          realWeight
        ),

      theoreticalWeightKg:
        round(
          theoreticalWeight
        ),

      differenceKg:
        round(
          difference
        ),

      differencePercent:
        theoreticalWeight > 0
          ? round(
              (
                difference
                /
                theoreticalWeight
              )
              *
              100,
              2
            )
          : 0
    },

    byMaterial
  };
}

export async function buildExecutiveDashboard(
  db,
  period
) {
  const {
    startDate,
    endDate
  } =
    period;

  const [
    launches,
    purchases,
    transports
  ] =
    await Promise.all([

      /*
       * PRODUÇÃO REAL.
       *
       * Fonte oficial para:
       *
       * - peso real;
       * - máquina;
       * - pessoas;
       * - lotes;
       * - localização;
       * - qualidade;
       * - Malha.
       */
      db.unsafe(
        `
          SELECT
            p.*,

            m.primary_unit
              AS material_primary_unit,

            m.secondary_unit
              AS material_secondary_unit,

            m.primary_to_secondary_factor
              AS material_factor,

            m.length_m
              AS material_length_m,

            mt.name
              AS material_type_name,

            mt.requires_length
              AS material_type_requires_length,

            current_norm.norm_name
              AS current_norm_name,

            current_norm.nominal_weight_per_meter
              AS current_nominal_weight_per_meter,

            current_norm.minimum_weight_per_meter
              AS current_minimum_weight_per_meter,

            current_norm.maximum_weight_per_meter
              AS current_maximum_weight_per_meter

          FROM production_launches p

          LEFT JOIN materials m
            ON m.id =
              p.material_id

          LEFT JOIN material_types mt
            ON mt.id =
              m.material_type_id

          LEFT JOIN LATERAL (

            SELECT
              n.name
                AS norm_name,

              qnm.nominal_weight_per_meter,

              qnm.minimum_weight_per_meter,

              qnm.maximum_weight_per_meter

            FROM quality_norm_materials qnm

            JOIN quality_norms n
              ON n.id =
                qnm.norm_id

            WHERE
              qnm.material_id =
                p.material_id

              AND

              n.active =
                true

            ORDER BY
              n.updated_at DESC,
              n.id DESC

            LIMIT 1

          ) current_norm
            ON true

          WHERE
            p.production_date
              BETWEEN
                $1::date
                AND
                $2::date

            AND

            LOWER(
              TRIM(
                COALESCE(
                  p.status,
                  ''
                )
              )
            )
            NOT IN (
              'canceled',
              'cancelled',
              'cancelado',
              'cancelada'
            )

          ORDER BY
            p.production_date,
            p.created_at,
            p.id
        `,
        [
          startDate,
          endDate
        ]
      ),

      /*
       * COMPRAS.
       */
      db.unsafe(
        `
          SELECT
            id,
            purchase_date,
            supplier,
            invoice_total_weight_kg

          FROM purchase_records

          WHERE
            purchase_date
              BETWEEN
                $1::date
                AND
                $2::date

          ORDER BY
            purchase_date,
            id
        `,
        [
          startDate,
          endDate
        ]
      ),

      /*
       * TRANSPORTES.
       *
       * Não incluir transportes cancelados.
       */
      db.unsafe(
        `
          SELECT
            t.id,
            t.transport_date,
            t.quantity,
            t.material_id,

            m.name
              AS material_name,

            m.primary_unit,

            m.secondary_unit
              AS material_secondary_unit,

            m.primary_to_secondary_factor
              AS material_factor,

            origin.name
              AS origin_location_name,

            destination.name
              AS destination_location_name

          FROM stock_transport_records t

          LEFT JOIN materials m
            ON m.id =
              t.material_id

          LEFT JOIN locations origin
            ON origin.id =
              t.origin_location_id

          LEFT JOIN locations destination
            ON destination.id =
              t.destination_location_id

          WHERE
            t.transport_date
              BETWEEN
                $1::date
                AND
                $2::date

            AND

            LOWER(
              TRIM(
                COALESCE(
                  t.status,
                  'active'
                )
              )
            )
            NOT IN (
              'canceled',
              'cancelled',
              'cancelado',
              'cancelada'
            )

          ORDER BY
            t.transport_date,
            t.id
        `,
        [
          startDate,
          endDate
        ]
      )
    ]);

  const production =
    buildProduction(
      launches
    );

  const quality =
    buildQuality(
      launches
    );

  const mesh =
    buildMesh(
      launches
    );

  const purchasesByDay =
    mapAggregate(
      purchases,

      row =>
        dateOnly(
          row.purchase_date
        ),

      row => ({
        date:
          dateOnly(
            row.purchase_date
          ),

        purchaseCount:
          0,

        weightKg:
          0
      }),

      (
        target,
        row
      ) => {
        target.purchaseCount +=
          1;

        target.weightKg +=
          toNumber(
            row.invoice_total_weight_kg
          );
      }
    )
      .map(
        item => ({
          ...item,

          weightKg:
            round(
              item.weightKg
            )
        })
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );

  const purchasesBySupplier =
    mapAggregate(
      purchases,

      row =>
        String(
          row.supplier
          ||
          'Sem fornecedor'
        ),

      row => ({
        supplier:
          row.supplier
          ||
          'Sem fornecedor',

        purchaseCount:
          0,

        weightKg:
          0
      }),

      (
        target,
        row
      ) => {
        target.purchaseCount +=
          1;

        target.weightKg +=
          toNumber(
            row.invoice_total_weight_kg
          );
      }
    )
      .map(
        item => ({
          ...item,

          weightKg:
            round(
              item.weightKg
            )
        })
      )
      .sort(
        (a, b) =>
          b.weightKg
          -
          a.weightKg
      );

  const transportItems =
    transports.map(
      row => ({
        row,

        equivalentKg:
          quantityToKg(
            row
          )
      })
    );

  const transportsByDay =
    mapAggregate(
      transportItems,

      item =>
        dateOnly(
          item.row
            .transport_date
        ),

      item => ({
        date:
          dateOnly(
            item.row
              .transport_date
          ),

        transportCount:
          0,

        equivalentKg:
          0
      }),

      (
        target,
        item
      ) => {
        target.transportCount +=
          1;

        if (
          item.equivalentKg
          !==
          null
        ) {
          target.equivalentKg +=
            item.equivalentKg;
        }
      }
    )
      .map(
        item => ({
          ...item,

          equivalentKg:
            round(
              item.equivalentKg
            )
        })
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );

  const transportsByRoute =
    mapAggregate(
      transportItems,

      item =>
        `${
          item.row
            .origin_location_name
          ||
          'Sem origem'
        } → ${
          item.row
            .destination_location_name
          ||
          'Sem destino'
        }`,

      item => ({
        route:
          `${
            item.row
              .origin_location_name
            ||
            'Sem origem'
          } → ${
            item.row
              .destination_location_name
            ||
            'Sem destino'
          }`,

        transportCount:
          0,

        equivalentKg:
          0
      }),

      (
        target,
        item
      ) => {
        target.transportCount +=
          1;

        if (
          item.equivalentKg
          !==
          null
        ) {
          target.equivalentKg +=
            item.equivalentKg;
        }
      }
    )
      .map(
        item => ({
          ...item,

          equivalentKg:
            round(
              item.equivalentKg
            )
        })
      )
      .sort(
        (a, b) =>
          b.equivalentKg
          -
          a.equivalentKg
      );

  const purchaseWeightKg =
    purchases.reduce(
      (
        sum,
        row
      ) =>
        sum
        +
        toNumber(
          row.invoice_total_weight_kg
        ),
      0
    );

  return {
    period: {
      startDate,
      endDate,
      days:
        period.days
    },

    production,

    quality,

    mesh,

    purchases: {
      summary: {
        purchaseCount:
          purchases.length,

        totalWeightKg:
          round(
            purchaseWeightKg
          ),

        supplierCount:
          new Set(
            purchases
              .map(
                row =>
                  String(
                    row.supplier
                    ||
                    ''
                  ).trim()
              )
              .filter(Boolean)
          ).size
      },

      daily:
        purchasesByDay,

      bySupplier:
        purchasesBySupplier,

      details:
        purchases.map(row => ({ id: row.id, date: dateOnly(row.purchase_date), supplier: row.supplier || 'Sem fornecedor', weightKg: round(toNumber(row.invoice_total_weight_kg)) }))
    },

    transports: {
      summary: {
        transportCount:
          transports.length,

        equivalentKg:
          round(
            transportItems.reduce(
              (
                sum,
                item
              ) =>
                sum
                +
                (
                  item.equivalentKg
                  ||
                  0
                ),
              0
            )
          )
      },

      daily:
        transportsByDay,

      byRoute:
        transportsByRoute,

      details:
        transportItems.map(item => ({ id: item.row.id, date: dateOnly(item.row.transport_date), materialId: item.row.material_id || null, materialName: item.row.material_name || '-', origin: item.row.origin_location_name || 'Sem origem', destination: item.row.destination_location_name || 'Sem destino', route: `${item.row.origin_location_name || 'Sem origem'} → ${item.row.destination_location_name || 'Sem destino'}`, quantity: round(toNumber(item.row.quantity)), unit: item.row.primary_unit || '', equivalentKg: item.equivalentKg === null ? null : round(item.equivalentKg) }))
    }
  };
}
