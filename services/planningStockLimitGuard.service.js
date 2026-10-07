import {
  projectPlanningStockByDay
} from './planningStockProjection.service.js';


const EPSILON =
  1e-6;


const text =
  value =>
    String(
      value ?? ''
    ).trim();


const number =
  (
    value,
    fallback = 0
  ) =>
    Number.isFinite(
      Number(value)
    )
      ? Number(value)
      : fallback;


const optionalNumber =
  value =>
    (
      value === null
      ||
      value === undefined
      ||
      value === ''
    )

      ? null

      : (
          Number.isFinite(
            Number(value)
          )

            ? Number(value)
            : null
        );


const materialId =
  value =>
    text(
      value?.materialId
      ??
      value?.material_id
      ??
      value?.id
    );


const materialUnit =
  value =>
    text(
      value?.unit
      ??
      value?.plannedUnit
      ??
      value?.planned_unit
      ??
      value?.outputUnit
      ??
      value?.output_unit
      ??
      value?.primaryUnit
      ??
      value?.primary_unit
    );


function materialLimit(
  material,
  type
) {

  return type === 'minimum'

    ? optionalNumber(
        material?.minimumQuantity
        ??
        material?.minimum_quantity
        ??
        material?.minimumStock
        ??
        material?.minimum_stock
      )

    : optionalNumber(
        material?.maximumQuantity
        ??
        material?.maximum_quantity
        ??
        material?.maximumStock
        ??
        material?.maximum_stock
      );

}


function collectTreeMaterialIds(
  tree
) {

  const ids =
    new Set();


  const visit =
    node => {

      if (
        !node
        ||
        typeof node !== 'object'
      ) {
        return;
      }


      const id =
        materialId(
          node
        );


      if (id) {
        ids.add(
          id
        );
      }


      (
        Array.isArray(
          node.children
        )

          ? node.children

          : []
      ).forEach(
        visit
      );

    };


  if (
    tree
    &&
    Array.isArray(
      tree.children
    )
    &&
    !materialId(
      tree
    )
  ) {

    tree.children.forEach(
      visit
    );

  } else {

    visit(
      tree
    );

  }


  return ids;
}


function operationProductionIndexes(
  operations = []
) {

  const byId =
    new Map();


  const add =
    (
      id,
      index
    ) => {

      id =
        text(
          id
        );

            index =
        Math.floor(
          Number(
            index
          )
        );


      if (
        !id
        ||
        !Number.isInteger(
          index
        )
        ||
        index < 0
      ) {
        return;
      }


      if (
        !byId.has(
          id
        )
      ) {
        byId.set(
          id,
          new Set()
        );
      }


      byId
        .get(id)
        .add(
          index
        );

    };


  operations.forEach(
    operation => {

      const indexes =
        new Set();


      const direct =
        Number(
          operation
            ?.productionIndex
        );


      if (
        Number.isInteger(
          direct
        )
        &&
        direct >= 0
      ) {
        indexes.add(
          direct
        );
      }


      (
        operation
          ?.productionMemberships
        || []
      ).forEach(
        item => {

          const index =
            Number(
              item
                ?.productionIndex
            );


          if (
            Number.isInteger(
              index
            )
            &&
            index >= 0
          ) {
            indexes.add(
              index
            );
          }

        }
      );


      (
        operation
          ?.productionBreakdown
        || []
      ).forEach(
        item => {

          const index =
            Number(
              item
                ?.productionIndex
            );


          if (
            Number.isInteger(
              index
            )
            &&
            index >= 0
          ) {

            indexes.add(
              index
            );

            add(
              item?.operationId,
              index
            );

          }

        }
      );


      [
        operation?.operationId,
        operation?.parentOperationId,
        operation?.splitParentOperationId,
        ...(
          operation
            ?.groupedOperationIds
          || []
        )
      ]
        .forEach(
          id =>
            indexes.forEach(
              index =>
                add(
                  id,
                  index
                )
            )
        );

    }
  );


  return byId;
}


function productionIndexesForMovement(
  movement,
  byOperationId
) {

  const indexes =
    new Set();


  (
    movement
      ?.relatedOperationIds
    || []
  ).forEach(
    id => {

      (
        byOperationId.get(
          text(id)
        )
        || []
      ).forEach(
        index =>
          indexes.add(
            index
          )
      );

    }
  );


  return [
    ...indexes
  ].sort(
    (
      a,
      b
    ) =>
      a - b
  );
}


function plannedReceiptMovements(
  receipts = []
) {

  return receipts.flatMap(
    (
      receipt,
      index
    ) => {

      const date =
        text(
          receipt?.availableDate
          ??
          receipt?.available_date
          ??
          receipt?.arrivalDate
          ??
          receipt?.date
        ).slice(
          0,
          10
        );


      const id =
        materialId(
          receipt
        );


      const quantity =
        number(
          receipt?.quantity
        );


      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          date
        )
        ||
        !id
        ||
        !(quantity > 0)
      ) {
        return [];
      }


      return [
        {

          movementId:
            text(
              receipt?.receiptId
            )
            ||
            `stock-limit-receipt-${
              index + 1
            }`,

          date,

          time:
            '23:59:58',

          materialId:
            id,

          materialName:
            text(
              receipt
                ?.materialName
            ),

          unit:
            materialUnit(
              receipt
            ),

          quantity,

          direction:
            'in',

          type:
            'EXTERNAL_IN',

          relatedOperationIds:
            []

        }
      ];

    }
  );
}


function calendarDays(
  simulation
) {

  const dates =
    new Set();


  (
    simulation?.days
    || []
  ).forEach(
    day => {

      const date =
        text(
          day?.date
          ??
          day
        ).slice(
          0,
          10
        );


      if (
        /^\d{4}-\d{2}-\d{2}$/.test(
          date
        )
      ) {
        dates.add(
          date
        );
      }

    }
  );


  (
    simulation?.operations
    || []
  ).forEach(
    operation => {

      [
        operation?.startDate,
        operation?.endDate
      ].forEach(
        value => {

          const date =
            text(
              value
            ).slice(
              0,
              10
            );


          if (
            /^\d{4}-\d{2}-\d{2}$/.test(
              date
            )
          ) {
            dates.add(
              date
            );
          }

        }
      );

    }
  );


  return [
    ...dates
  ]
    .sort()
    .map(
      date => ({
        date
      })
    );
}


function allocations(
  simulation
) {

  const source =
    Array.isArray(
      simulation?.calendarOperations
    )
    &&
    simulation
      .calendarOperations
      .length

      ? simulation
          .calendarOperations

      : (
          simulation
            ?.operations
          || []
        );


  return source.filter(
    operation =>

      operation
        ?.operationType
        !==
        'transport'

      &&

      operation
        ?._existingScheduleBlocker
        !==
        true

      &&

      number(
        operation?.produceQty
        ??
        operation?.quantity
      ) > 0

  );
}


function roundedQuantity(
  value,
  unit
) {

  if (
    !Number.isFinite(
      Number(value)
    )
  ) {
    return null;
  }


  if (
    text(
      unit
    ).toLowerCase()
    ===
    'un'
  ) {

    return Math.max(
      Math.floor(
        Number(value)
        +
        EPSILON
      ),
      0
    );

  }


  return Math.max(
    Number(
      Number(value)
        .toFixed(3)
    ),
    0
  );
}


function productionMeta(
  productions,
  index
) {

  const production =
    productions?.[
      index
    ]
    || {};


  return {

    productionIndex:
      index,

    materialId:
      materialId(
        production
      ),

    materialName:
      text(
        production
          ?.materialName
        ??
        production?.name
      )
      ||
      `Produção ${
        index + 1
      }`,

    unit:
      materialUnit(
        production
      ),

    plannedQty:
      number(
        production?.plannedQty
        ??
        production?.quantity
        ??
        production?.produceQty
      )

  };
}

function recoveryOverrideQuantity(
  operationOverrides,
  productionIndex,
  materialIdValue
) {
  const override =
    operationOverrides?.[
      `${Number(productionIndex)}:${text(materialIdValue)}`
    ];

  return Math.max(
    number(
      override?.stockLimitRecoveryQty
    ),
    0
  );
}


function suggestionsFor(
  violations,
  productions
) {
  const byProduction =
    new Map();

  violations.forEach(
    violation => {

      /*
       * Estoque que JÁ começou abaixo do mínimo
       * não reduz automaticamente o produto final.
       */
      if (
        violation.scenario
        ===
        'minimum_recovery'
      ) {
        return;
      }

      const movement =
        number(
          violation
            .movementQuantity
        );

      let factor =
        1;

      /*
       * Estoque ainda estava saudável.
       *
       * Calculamos quanto da produção final
       * cabe até chegar exatamente ao mínimo.
       */
      if (
        violation.scenario
        ===
        'minimum_breach'
        &&
        movement < -EPSILON
      ) {
        factor =
          Math.max(
            Math.min(
              (
                number(
                  violation
                    .balanceBefore
                )
                -
                number(
                  violation
                    .limitQuantity
                )
              )
              /
              Math.abs(
                movement
              ),
              1
            ),
            0
          );

      /*
       * Máximo continua funcionando como teto.
       */
      } else if (
        violation.scenario
        ===
        'maximum_breach'
        &&
        movement > EPSILON
      ) {
        factor =
          Math.max(
            Math.min(
              (
                number(
                  violation
                    .limitQuantity
                )
                -
                number(
                  violation
                    .balanceBefore
                )
              )
              /
              movement,
              1
            ),
            0
          );

      } else {
        return;
      }

      violation
        .productionIndexes
        .forEach(
          index => {

            const production =
              productionMeta(
                productions,
                index
              );

            if (
              !(
                production
                  .plannedQty
                >
                0
              )
            ) {
              return;
            }

            const current =
              byProduction.get(
                index
              )
              || {
                ...production,

                factor:
                  1,

                violationIds:
                  []
              };

            current.factor =
              Math.min(
                current.factor,
                factor
              );

            current
              .violationIds
              .push(
                violation.id
              );

            byProduction.set(
              index,
              current
            );
          }
        );
    }
  );

  return [
    ...byProduction.values()
  ]
    .map(
      item => ({
        ...item,

        suggestedQty:
          roundedQuantity(
            item.plannedQty
            *
            item.factor,
            item.unit
          )
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        a.productionIndex
        -
        b.productionIndex
    );
}

function recoverySuggestionsFor(
  violations,
  operationOverrides = {}
) {
  const byTarget =
    new Map();


  violations
    .filter(
      violation =>
        violation.scenario
        ===
        'minimum_recovery'
    )
    .forEach(
      violation => {

        const productionIndex =
          violation
            .productionIndexes?.[0];


        if (
          !Number.isInteger(
            Number(
              productionIndex
            )
          )
        ) {
          return;
        }


        /*
         * Recuperação atualmente salva para esta
         * produção/material.
         */
        const currentRecoveryQty =
          recoveryOverrideQuantity(
            operationOverrides,
            productionIndex,
            violation.materialId
          );


        /*
         * Caso o mesmo material participe de mais
         * de uma produção, pode existir recuperação
         * em outro productionIndex.
         */
        const currentRecoveryTotal =
          Math.max(
            number(
              violation.currentRecoveryQuantity
            ),
            currentRecoveryQty
          );


        const otherRecoveryQty =
          Math.max(
            currentRecoveryTotal
            -
            currentRecoveryQty,
            0
          );


        /*
         * PRODUÇÃO NORMAL.
         *
         * É somente o que precisa ser fabricado
         * para atender a produção solicitada,
         * SEM considerar o estoque mínimo.
         *
         * Exemplo:
         *
         * consumo total = 10.825,056
         * estoque inicial = 0
         *
         * produção normal = 10.825,056
         */
        const plannedProductionQty =
          roundedQuantity(
            Math.max(
              number(
                violation.normalProductionQuantity
              ),
              0
            ),
            violation.unit
          );


        /*
         * RECUPERAÇÃO TOTAL necessária.
         *
         * Exemplo:
         *
         * estoque final sem recomposição = 0
         * mínimo = 6.000
         *
         * adicional = 6.000
         */
        const requiredRecoveryTotal =
          roundedQuantity(
            Math.max(
              number(
                violation.requiredRecoveryQuantity
              ),
              0
            ),
            violation.unit
          );


        /*
         * Quanto este productionIndex deve carregar
         * de recuperação.
         */
        const suggestedQty =
          roundedQuantity(
            Math.max(
              requiredRecoveryTotal
              -
              otherRecoveryQty,
              0
            ),
            violation.unit
          );


        /*
         * Produção TOTAL:
         *
         * 10.825,056
         * +
         * 6.000
         * =
         * 16.825,056
         */
        const totalProductionQty =
          roundedQuantity(
            plannedProductionQty
            +
            otherRecoveryQty
            +
            suggestedQty,
            violation.unit
          );


        /*
         * Saldo sem recomposição.
         *
         * No seu exemplo:
         * 0 kg.
         */
        const projectedWithoutRecovery =
          roundedQuantity(
            number(
              violation.projectedQuantity
            ),
            violation.unit
          );


        /*
         * Saldo com a recomposição sugerida.
         *
         * No seu exemplo:
         * 6.000 kg.
         */
        const projectedWithSuggestion =
          roundedQuantity(
            projectedWithoutRecovery
            +
            otherRecoveryQty
            +
            suggestedQty,
            violation.unit
          );


        const key =
          `${Number(productionIndex)}:${text(violation.materialId)}`;


        byTarget.set(
          key,
          {

            violationId:
              violation.id,

            productionIndex:
              Number(
                productionIndex
              ),

            materialId:
              violation.materialId,

            materialName:
              violation.materialName,

            unit:
              violation.unit,

            canProduce:
              violation.isInitialRawMaterial
              !==
              true,

            initialStock:
              number(
                violation.initialStock
              ),

            limitQuantity:
              number(
                violation.limitQuantity
              ),

            existingDeficit:
              Math.max(
                number(
                  violation.limitQuantity
                )
                -
                number(
                  violation.initialStock
                ),
                0
              ),

            consumptionQuantity:
              number(
                violation.totalConsumptionQuantity
              ),

            plannedProductionQty,

            currentRecoveryQty,

            currentRecoveryTotal,

            projectedWithoutRecovery,

            suggestedQty,

            totalProductionQty,

            projectedWithSuggestion

          }
        );

      }
    );


  return [
    ...byTarget.values()
  ]
    .sort(
      (
        a,
        b
      ) =>
        a.productionIndex
        -
        b.productionIndex
        ||
        String(
          a.materialName
        )
          .localeCompare(
            String(
              b.materialName
            )
          )
    );
}

export function evaluatePlanningStockLimits({

  simulation = null,

  materials = [],

  plannedReceipts = [],

  productions = [],

  operationOverrides = {}

} = {}) {

  if (!simulation) {

        return {
      projection:
        null,

      violations:
        [],

      suggestions:
        [],

      recoverySuggestions:
        []
    };

  }


  const catalog =
    new Map(
      materials.map(
        material => [
          materialId(
            material
          ),
          material
        ]
      )
    );


  const tree =
    simulation?.tree
    ||
    simulation?.scheduleTree
    ||
    simulation?.schedule_tree
    ||
    null;


  const treeIds =
    collectTreeMaterialIds(
      tree
    );


    const operations =
    simulation?.operations
    || [];



  const indexesByOperation =
    operationProductionIndexes(
      operations
    );


  const baseStockContext =
    simulation?.stockContext
    &&
    typeof simulation.stockContext
      ===
      'object'

      ? simulation
          .stockContext

      : {};


  const projection =
    projectPlanningStockByDay({

      stockContext: {

        ...baseStockContext,

        movements: [

          ...(
            baseStockContext
              .movements
            || []
          ),

          ...plannedReceiptMovements(
            plannedReceipts
          )

        ]

      },

      scheduleTree:
        tree,

      operations,

      allocations:
        allocations(
          simulation
        ),

      calendarDays:
        calendarDays(
          simulation
        ),

      productions:
        simulation
          ?.summary
          ?.productions
        || [],

      demandContext:
        simulation
          ?.demandContext
        || {}

    });


      const violations =
    [];


  /*
   * Para o ESTOQUE MÍNIMO, não usamos mais somente
   * a primeira movimentação que atravessou o limite.
   *
   * Primeiro resumimos TODO o planejamento do material:
   *
   * - estoque inicial;
   * - produção total;
   * - consumo total;
   * - saldo final;
   * - produções-raiz relacionadas.
   *
   * Depois verificamos o mínimo.
   */
  const materialSummaries =
    new Map();


  /*
   * O máximo continua sendo avaliado no momento
   * exato da movimentação.
   */
  const maximumSeen =
    new Set();


  const summaryFor =
    (
      id,
      material,
      row
    ) => {

      if (
        !materialSummaries.has(
          id
        )
      ) {

        materialSummaries.set(
          id,
          {

            materialId:
              id,

            materialName:
              text(
                material?.name
              )
              ||
              text(
                row?.materialName
              )
              ||
              id,

            unit:
              materialUnit(
                material
              )
              ||
              text(
                row?.unit
              ),

            /*
             * Primeiro saldo encontrado na projeção.
             */
            initialStock:
              number(
                row?.openingStock
              ),

            /*
             * Será atualizado até chegar ao saldo
             * FINAL do planejamento.
             */
            finalStock:
              number(
                row?.openingStock
              ),

            /*
             * Soma de TODOS os PRODUCTION_IN.
             */
            totalProductionQuantity:
              0,

            /*
             * Soma de TODOS os
             * PRODUCTION_CONSUMPTION.
             */
            totalConsumptionQuantity:
              0,

            productionIndexes:
              new Set(),

            lastDate:
              '',

            lastTime:
              ''

          }
        );

      }


      return materialSummaries.get(
        id
      );

    };


  /*
   * Primeiro percorremos TODA a projeção.
   */
  (
    projection?.days
    || []
  ).forEach(
    day => {

      (
        day?.materials
        || []
      ).forEach(
        row => {

          const id =
            text(
              row?.materialId
            );


          /*
           * Só verificamos materiais realmente
           * presentes na cadeia produtiva.
           */
          if (
            !id
            ||
            !treeIds.has(
              id
            )
          ) {
            return;
          }


          const material =
            catalog.get(
              id
            )
            || {};


          const minimum =
            materialLimit(
              material,
              'minimum'
            );


          const maximum =
            materialLimit(
              material,
              'maximum'
            );


          /*
           * Material sem limite configurado
           * continua sendo ignorado.
           */
          if (
            !Number.isFinite(
              minimum
            )
            &&
            !Number.isFinite(
              maximum
            )
          ) {
            return;
          }


          const summary =
            summaryFor(
              id,
              material,
              row
            );


          let balance =
            number(
              row?.openingStock,
              summary.finalStock
            );


          /*
           * Mesmo se o dia não possuir movimentações,
           * este é o saldo conhecido naquele ponto.
           */
          summary.finalStock =
            balance;


          (
            row?.movements
            || []
          ).forEach(
            movement => {

              const before =
                balance;


              const quantity =
                number(
                  movement?.quantity
                );


              const after =
                Number.isFinite(
                  Number(
                    movement?.balanceAfter
                  )
                )

                  ? Number(
                      movement.balanceAfter
                    )

                  : before
                    +
                    quantity;


              const productionIndexes =
                productionIndexesForMovement(
                  movement,
                  indexesByOperation
                );


              /*
               * Guardamos todas as produções finais
               * relacionadas àquele material.
               */
              productionIndexes
                .forEach(
                  index =>
                    summary
                      .productionIndexes
                      .add(
                        index
                      )
                );


              /*
               * Soma da produção TOTAL daquele material.
               *
               * Exemplo:
               *
               * 4.000
               * + 3.000
               * + 3.825,056
               * =
               * 10.825,056
               */
              if (
                movement?.type
                ===
                'PRODUCTION_IN'

                &&
                quantity
                >
                EPSILON
              ) {

                summary
                  .totalProductionQuantity +=
                    quantity;

              }


              /*
               * Soma do consumo TOTAL daquele material.
               *
               * É aqui que paramos de usar somente
               * aqueles 3.998,808 kg do primeiro evento.
               */
              if (
                movement?.type
                ===
                'PRODUCTION_CONSUMPTION'

                &&
                quantity
                <
                -EPSILON
              ) {

                summary
                  .totalConsumptionQuantity +=
                    Math.abs(
                      quantity
                    );

              }


              /*
               * ESTOQUE MÁXIMO continua cronológico.
               *
               * Mesmo que o estoque final fique baixo,
               * uma entrada intermediária pode ter
               * ultrapassado o teto.
               */
              if (
                movement?.type
                ===
                'PRODUCTION_IN'

                &&
                Number.isFinite(
                  maximum
                )

                &&
                after
                >
                maximum + EPSILON
              ) {

                const key =
                  `${id}:maximum_breach`;


                if (
                  !maximumSeen.has(
                    key
                  )

                  &&

                  productionIndexes
                    .length
                ) {

                  maximumSeen.add(
                    key
                  );


                  violations.push({

                    id:
                      key,

                    kind:
                      'maximum',

                    scenario:
                      'maximum_breach',

                    materialId:
                      id,

                    materialName:
                      summary.materialName,

                    unit:
                      summary.unit,

                    limitQuantity:
                      maximum,

                    initialStock:
                      summary.initialStock,

                    isInitialRawMaterial:
                      material
                        ?.is_initial_raw_material
                      ===
                      true,

                    balanceBefore:
                      before,

                    projectedQuantity:
                      after,

                    differenceQuantity:
                      after
                      -
                      maximum,

                    movementQuantity:
                      quantity,

                    movementType:
                      movement?.type,

                    date:
                      text(
                        day?.date
                      ),

                    time:
                      text(
                        movement?.time
                      ),

                    relatedOperationIds:
                      movement
                        ?.relatedOperationIds
                      || [],

                    productionIndexes

                  });

                }

              }


              /*
               * Continua avançando a cronologia.
               */
              balance =
                after;


              summary.finalStock =
                after;


              summary.lastDate =
                text(
                  day?.date
                );


              summary.lastTime =
                text(
                  movement?.time
                );

            }
          );

        }
      );

    }
  );


  /*
   * =========================================================
   * ESTOQUE MÍNIMO
   * =========================================================
   *
   * Agora que percorremos o planejamento INTEIRO,
   * verificamos o saldo final.
   *
   * Exemplo real:
   *
   * estoque inicial             0
   * produção normal       10.825,056
   * consumo              -10.825,056
   * --------------------------------
   * saldo final                  0
   *
   * mínimo                   6.000
   *
   * recuperação              6.000
   */
  
    for (
    const summary
    of materialSummaries.values()
  ) {

    const material =
      catalog.get(
        summary.materialId
      )
      || {};


    const minimum =
      materialLimit(
        material,
        'minimum'
      );


    if (
      !Number.isFinite(
        minimum
      )
    ) {
      continue;
    }


    /*
     * Material não participou deste planejamento.
     */
    if (
      !(
        summary.totalConsumptionQuantity
        >
        EPSILON
      )
      &&
      !(
        summary.totalProductionQuantity
        >
        EPSILON
      )
    ) {
      continue;
    }


    const productionIndexes =
      [
        ...summary
          .productionIndexes
      ]
        .filter(
          index =>
            Number.isInteger(
              Number(
                index
              )
            )
            &&
            Number(
              index
            )
            >=
            0
        )
        .map(
          Number
        )
        .sort(
          (
            a,
            b
          ) =>
            a - b
        );


    /*
     * =====================================================
     * REGRA DEFINITIVA DO MÍNIMO
     * =====================================================
     *
     * O planejamento normal usa primeiro o estoque.
     *
     * Se faltar material para atender o consumo,
     * fabrica somente essa diferença.
     *
     * Portanto:
     *
     * estoque 0
     * consumo 10.825,056
     * =>
     * produção normal 10.825,056
     *
     *
     * estoque 6.000
     * consumo 2.000
     * =>
     * produção normal 0
     *
     *
     * estoque 3.000
     * consumo 10.000
     * =>
     * produção normal 7.000
     */
    const totalConsumptionQuantity =
      Math.max(
        number(
          summary.totalConsumptionQuantity
        ),
        0
      );


    const initialStock =
      Math.max(
        number(
          summary.initialStock
        ),
        0
      );


    /*
     * Quanto seria necessário produzir para
     * SOMENTE atender a produção solicitada.
     *
     * Não existe mínimo nesta conta.
     */
    const normalProductionQuantity =
      Math.max(
        totalConsumptionQuantity
        -
        initialStock,
        0
      );


    /*
     * Estoque final depois de atender toda a produção,
     * mas SEM fabricar nada para recuperar o mínimo.
     *
     * Exemplo atual:
     *
     * 0
     * + 10.825,056
     * - 10.825,056
     * =
     * 0
     */
    const projectedWithoutRecovery =
      Math.max(
        initialStock
        +
        normalProductionQuantity
        -
        totalConsumptionQuantity,
        0
      );


    /*
     * Quanto devemos produzir A MAIS para terminar
     * exatamente no mínimo.
     *
     * Exemplo:
     *
     * mínimo = 6.000
     * saldo sem recomposição = 0
     *
     * recovery = 6.000
     */
    const requiredRecoveryQuantity =
      Math.max(
        minimum
        -
        projectedWithoutRecovery,
        0
      );


    /*
     * Se o planejamento normal já termina no mínimo
     * ou acima dele, não existe alerta.
     */
    if (
      !(
        requiredRecoveryQuantity
        >
        EPSILON
      )
    ) {
      continue;
    }


    /*
     * Recuperação que já está configurada.
     */
    const currentRecoveryQuantity =
      productionIndexes.reduce(
        (
          total,
          productionIndex
        ) =>
          total
          +
          recoveryOverrideQuantity(
            operationOverrides,
            productionIndex,
            summary.materialId
          ),
        0
      );


    /*
     * Já recuperamos o suficiente.
     *
     * Não abre o modal novamente.
     */
    if (
      currentRecoveryQuantity
      >=
      requiredRecoveryQuantity
      -
      EPSILON
    ) {
      continue;
    }


    const key =
      `${summary.materialId}:minimum_recovery`;


    violations.push({

      id:
        key,

      kind:
        'minimum',

      scenario:
        'minimum_recovery',

      materialId:
        summary.materialId,

      materialName:
        summary.materialName,

      unit:
        summary.unit,

      limitQuantity:
        minimum,

      initialStock,

      startedBelowMinimum:
        initialStock
        <
        minimum
        -
        EPSILON,

      isInitialRawMaterial:
        material
          ?.is_initial_raw_material
        ===
        true,

      balanceBefore:
        initialStock,


      /*
       * ESTE CAMPO AGORA É, SEM AMBIGUIDADE:
       *
       * ESTOQUE FINAL SEM RECOMPOSIÇÃO.
       *
       * No seu print:
       * 0 kg.
       */
      projectedQuantity:
        Number(
          projectedWithoutRecovery
            .toFixed(6)
        ),


      differenceQuantity:
        Number(
          requiredRecoveryQuantity
            .toFixed(6)
        ),


      /*
       * Consumo total das 5.896 barras.
       *
       * 10.825,056 kg.
       */
      movementQuantity:
        -Number(
          totalConsumptionQuantity
            .toFixed(6)
        ),


      totalConsumptionQuantity:
        Number(
          totalConsumptionQuantity
            .toFixed(6)
        ),


      /*
       * PRODUÇÃO NORMAL.
       *
       * No seu print:
       * 10.825,056 kg.
       */
      normalProductionQuantity:
        Number(
          normalProductionQuantity
            .toFixed(6)
        ),


      /*
       * RECUPERAÇÃO necessária.
       *
       * No seu print:
       * 6.000 kg.
       */
      requiredRecoveryQuantity:
        Number(
          requiredRecoveryQuantity
            .toFixed(6)
        ),


      currentRecoveryQuantity:
        Number(
          currentRecoveryQuantity
            .toFixed(6)
        ),


      /*
       * Mantemos este campo para compatibilidade,
       * mas ele representa aqui a produção NORMAL,
       * não normal + recuperação.
       */
      totalProductionQuantity:
        Number(
          normalProductionQuantity
            .toFixed(6)
        ),


      movementType:
        'PLANNING_TOTAL',

      date:
        summary.lastDate,

      time:
        summary.lastTime,

      relatedOperationIds:
        [],

      productionIndexes

    });

  }
  

    return {

    projection,

    violations,

    suggestions:
      suggestionsFor(
        violations,
        productions
      ),

    recoverySuggestions:
      recoverySuggestionsFor(
        violations,
        operationOverrides
      )

  };
}