import {
  buildMaterialCodeMap,
  buildStockBalances,
  locationMatchesEstablishment
} from './stockBalance.service.js';


function toNumber(value) {
  const number =
    Number(value || 0);

  return Number.isFinite(number)
    ? number
    : 0;
}


function roundQty(value) {
  return Number(
    toNumber(value)
      .toFixed(6)
  );
}


function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}


function materialCodes(material = {}) {
  return Array.isArray(material.codes)
    ? material.codes
        .map(String)
        .filter(Boolean)
    : [];
}


function stockKey(
  materialId,
  locationId
) {
  return (
    `${materialId || ''}`
    +
    ':'
    +
    `${locationId || ''}`
  );
}


function emptyCodeRow(code) {
  return {
    code,

    fiscalQty:
      0,

    errorQty:
      0,

    salesOrderQty:
      0,

    futurePendingQty:
      0,

    nasajonQty:
      0
  };
}


function emptySnapshotSummary(
  material,
  location
) {
  const codeBreakdown =
    new Map(
      materialCodes(material)
        .map(
          code => [
            normalizeText(code),
            emptyCodeRow(code)
          ]
        )
    );


  return {
    materialId:
      Number(material.id),

    locationId:
      Number(location.id),

    fiscalQty:
      0,

    errorQty:
      0,

    salesOrderQty:
      0,

    futurePendingQty:
      0,

    nasajonQty:
      0,

    codeBreakdown
  };
}


function matchingMaterialCode(
  material,
  row
) {
  const rowCodes =
    [
      row?.product_code,
      row?.old_product_code
    ]
      .map(normalizeText)
      .filter(Boolean);


  return (
    materialCodes(material)
      .find(
        code =>
          rowCodes.includes(
            normalizeText(code)
          )
      )
    ||
    null
  );
}


function correctionMap(rows = []) {
  return new Map(
    rows.map(
      row => [
        stockKey(
          row.material_id
          ??
          row.materialId,

          row.location_id
          ??
          row.locationId
        ),

        {
          correctionQty:
            roundQty(
              row.correction_qty
              ??
              row.correctionQty
            ),

          updatedAt:
            row.updated_at
            ??
            row.updatedAt
            ??
            null,

          updatedByUserId:
            row.updated_by_user_id
            ??
            row.updatedByUserId
            ??
            null,

          updatedByUserName:
            row.updated_by_user_name
            ??
            row.updatedByUserName
            ??
            null
        }
      ]
    )
  );
}


export function buildCurrentStockBalances({
  materials = [],
  locations = [],
  stockRows = [],
  correctionRows = [],
  inventories = [],
  productionLaunches = [],
  sales = [],
  plannedRows = [],
  materialInputs = []
} = {}) {
  const materialByCode =
    buildMaterialCodeMap(
      materials
    );


  const snapshotByKey =
    new Map();


  /*
   * Sempre criamos material x local,
   * mesmo quando o CSV nao possui linha.
   */
  for (const material of materials) {
    for (const location of locations) {
      snapshotByKey.set(
        stockKey(
          material.id,
          location.id
        ),

        emptySnapshotSummary(
          material,
          location
        )
      );
    }
  }


  /*
   * Agrupamento da fotografia Nasajon.
   *
   * Importante:
   * aqui ainda preservamos o detalhamento
   * de cada codigo.
   */
  for (const row of stockRows) {
    const material =
      materialByCode.get(
        normalizeText(
          row.product_code
        )
      )

      ||

      materialByCode.get(
        normalizeText(
          row.old_product_code
        )
      );


    const location =
      locations.find(
        item =>
          locationMatchesEstablishment(
            item,
            row.establishment
          )
      );


    if (
      !material
      ||
      !location
    ) {
      continue;
    }


    const summary =
      snapshotByKey.get(
        stockKey(
          material.id,
          location.id
        )
      );


    if (!summary) {
      continue;
    }


    const fiscalQty =
      toNumber(
        row.fiscal_balance_unit
      );


    const errorQty =
      toNumber(
        row.error_balance_unit
      );


    const salesOrderQty =
      toNumber(
        row.orders_unit
      );


    const futurePendingQty =
      toNumber(
        row.future_sales_pending_unit
      );


    summary.fiscalQty +=
      fiscalQty;


    summary.errorQty +=
      errorQty;


    summary.salesOrderQty +=
      salesOrderQty;


    summary.futurePendingQty +=
      futurePendingQty;


    /*
     * Detalhamento visual por codigo.
     */
    const matchedCode =
      matchingMaterialCode(
        material,
        row
      );


    if (matchedCode) {
      const codeKey =
        normalizeText(
          matchedCode
        );


      const codeRow =
        summary.codeBreakdown.get(
          codeKey
        )

        ||

        emptyCodeRow(
          matchedCode
        );


      codeRow.fiscalQty +=
        fiscalQty;


      codeRow.errorQty +=
        errorQty;


      codeRow.salesOrderQty +=
        salesOrderQty;


      codeRow.futurePendingQty +=
        futurePendingQty;


      summary.codeBreakdown.set(
        codeKey,
        codeRow
      );
    }
  }


  /*
   * REGRA NASAJON.
   */
  for (
    const summary
    of snapshotByKey.values()
  ) {
    summary.fiscalQty =
      roundQty(
        summary.fiscalQty
      );


    summary.errorQty =
      roundQty(
        summary.errorQty
      );


    summary.salesOrderQty =
      roundQty(
        summary.salesOrderQty
      );


    summary.futurePendingQty =
      roundQty(
        summary.futurePendingQty
      );


    summary.nasajonQty =
      roundQty(
        summary.fiscalQty

        +

        summary.errorQty

        -

        summary.salesOrderQty

        -

        summary.futurePendingQty
      );


    for (
      const codeRow
      of summary.codeBreakdown.values()
    ) {
      codeRow.fiscalQty =
        roundQty(
          codeRow.fiscalQty
        );


      codeRow.errorQty =
        roundQty(
          codeRow.errorQty
        );


      codeRow.salesOrderQty =
        roundQty(
          codeRow.salesOrderQty
        );


      codeRow.futurePendingQty =
        roundQty(
          codeRow.futurePendingQty
        );


      codeRow.nasajonQty =
        roundQty(
          codeRow.fiscalQty

          +

          codeRow.errorQty

          -

          codeRow.salesOrderQty

          -

          codeRow.futurePendingQty
        );
    }
  }


  /*
   * O serviço antigo continua sendo aproveitado
   * SOMENTE para as regras maduras de:
   *
   * - ultimo inventario, para referencia;
   * - pendente de producao;
   * - reserva de producao;
   * - historico de vendas.
   *
   * Repare que transportes e compras sao
   * explicitamente enviados vazios.
   *
   * E, principalmente, NAO usamos currentQty
   * retornado pelo buildStockBalances.
   */
  const planningRows =
    buildStockBalances({
      materials,
      locations,
      inventories,
      productionLaunches,

      transports:
        [],

      materialPurchases:
        [],

      sales,
      plannedRows,
      materialInputs
    });


  const planningByKey =
    new Map(
      planningRows.map(
        row => [
          stockKey(
            row.materialId,
            row.locationId
          ),
          row
        ]
      )
    );


  const correctionsByKey =
    correctionMap(
      correctionRows
    );


  const result = [];


  for (const material of materials) {
    for (const location of locations) {
      const key =
        stockKey(
          material.id,
          location.id
        );


      const snapshot =
        snapshotByKey.get(key)

        ||

        emptySnapshotSummary(
          material,
          location
        );


      const planning =
        planningByKey.get(key)
        ||
        null;


      const correction =
        correctionsByKey.get(key)

        ||

        {
          correctionQty:
            0,

          updatedAt:
            null,

          updatedByUserId:
            null,

          updatedByUserName:
            null
        };


      /*
       * SALDO ESCURO / FISICO.
       */
      const physicalQty =
        roundQty(
          snapshot.nasajonQty

          +

          correction.correctionQty
        );


      const pendingProductionQty =
        roundQty(
          planning
            ?.movementTotals
            ?.pendingProductionQty
        );


      const productionReserveQty =
        roundQty(
          planning
            ?.movementTotals
            ?.productionReserveQty
        );


      /*
       * SALDO CLARO / PROJETADO.
       */
      const projectedQty =
        roundQty(
          physicalQty

          +

          pendingProductionQty

          -

          productionReserveQty
        );


      result.push({
        materialId:
          Number(material.id),

        materialName:
          material.name,

        materialCodes:
          materialCodes(material),

        unit:
          material.primary_unit
          ||
          material.primaryUnit
          ||
          '',

        permitsSales:
          material.permits_sales !== false
          &&
          material.permitsSales !== false,

        locationId:
          Number(location.id),

        locationCode:
          location.code,

        locationName:
          location.name,


        /*
         * CAMPOS BRUTOS NASAJON.
         */
        fiscalQty:
          snapshot.fiscalQty,

        errorQty:
          snapshot.errorQty,

        salesOrderQty:
          snapshot.salesOrderQty,

        futurePendingQty:
          snapshot.futurePendingQty,


        /*
         * CAMPOS DERIVADOS.
         */
        nasajonQty:
          snapshot.nasajonQty,

        correctionQty:
          correction.correctionQty,

        correctionUpdatedAt:
          correction.updatedAt,

        correctionUpdatedByUserId:
          correction.updatedByUserId,

        correctionUpdatedByUserName:
          correction.updatedByUserName,


        /*
         * physicalQty/currentQty/openingQty
         * representam TODOS o saldo fisico
         * corrigido.
         */
        physicalQty,

        currentQty:
          physicalQty,

        openingQty:
          physicalQty,


        projectedQty,


        /*
         * Inventario continua disponivel
         * para informacao.
         */
        latestInventory:
          planning?.latestInventory
          ||
          null,


        /*
         * Usado pelo frontend para dividir
         * Fiscal/Erro/Pedidos/Futura por codigo.
         */
        codeBreakdown:
          [
            ...snapshot
              .codeBreakdown
              .values()
          ],


        movementTotals: {
          ...(
            planning
              ?.movementTotals
            ||
            {}
          ),

          pendingProductionQty,

          productionReserveQty
        },


        /*
         * A tela nova nao precisa receber
         * compra/transporte/producao realizada
         * para reconstruir o fisico.
         */
        details:
          (
            planning?.details
            ||
            []
          )
            .filter(
              detail =>
                detail.type
                  ===
                  'pending_production'

                ||

                detail.type
                  ===
                  'production_reserve'

                ||

                detail.type
                  ===
                  'sales'
            )
      });
    }
  }


  return result.sort(
    (left, right) =>
      String(
        left.materialName
      )
        .localeCompare(
          String(
            right.materialName
          ),
          'pt-BR'
        )

      ||

      String(
        left.locationName
      )
        .localeCompare(
          String(
            right.locationName
          ),
          'pt-BR'
        )
  );
}