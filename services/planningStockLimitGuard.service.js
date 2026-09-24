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
        Number(
          index
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


function suggestionsFor(
  violations,
  productions
) {

  const byProduction =
    new Map();


  violations.forEach(
    violation => {

      const movement =
        number(
          violation
            .movementQuantity
        );


      let factor =
        1;


      if (
        violation.kind
        ===
        'minimum'
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


      } else if (
        violation.kind
        ===
        'maximum'
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
                > 0
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


export function evaluatePlanningStockLimits({

  simulation = null,

  materials = [],

  plannedReceipts = [],

  productions = []

} = {}) {

  if (!simulation) {

    return {
      projection:
        null,

      violations:
        [],

      suggestions:
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


  const seen =
    new Set();


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


          let balance =
            number(
              row?.openingStock
            );


          (
            row?.movements
            || []
          ).forEach(
            movement => {

              const before =
                balance;


              const quantity =
                number(
                  movement
                    ?.quantity
                );


              const after =
                Number.isFinite(
                  Number(
                    movement
                      ?.balanceAfter
                  )
                )

                  ? Number(
                      movement
                        .balanceAfter
                    )

                  : before
                    +
                    quantity;


              balance =
                after;


              const productionIndexes =
                productionIndexesForMovement(
                  movement,
                  indexesByOperation
                );


              if (
                !productionIndexes
                  .length
              ) {
                return;
              }


              const pushViolation =
                (
                  kind,
                  limit,
                  difference
                ) => {

                  const key =
                    `${id}:${kind}`;


                  if (
                    seen.has(
                      key
                    )
                  ) {
                    return;
                  }


                  seen.add(
                    key
                  );


                  violations.push({

                    id:
                      key,

                    kind,

                    materialId:
                      id,

                    materialName:
                      text(
                        material
                          ?.name
                      )
                      ||
                      text(
                        row
                          ?.materialName
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

                    limitQuantity:
                      limit,

                    balanceBefore:
                      before,

                    projectedQuantity:
                      after,

                    differenceQuantity:
                      difference,

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

                };


              if (
                movement?.type
                ===
                'PRODUCTION_CONSUMPTION'

                &&

                Number.isFinite(
                  minimum
                )

                &&

                after
                <
                minimum - EPSILON
              ) {

                pushViolation(
                  'minimum',
                  minimum,
                  minimum - after
                );

              }


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

                pushViolation(
                  'maximum',
                  maximum,
                  after - maximum
                );

              }

            }
          );

        }
      );

    }
  );


  return {

    projection,

    violations,

    suggestions:
      suggestionsFor(
        violations,
        productions
      )

  };
}