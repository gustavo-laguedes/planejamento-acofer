const RELEVANT_ESTABLISHMENTS = new Map([
  ['matriz', 'matriz'],
  ['filialfeital', 'feital'],
  ['feital', 'feital'],
  ['filialcentro', 'centro'],
  ['centro', 'centro']
]);

const DEFAULT_MODEL = 'Modelo padrão';

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function roundQty(value) {
  return Number(toNumber(value).toFixed(6));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeModelName(value) {
  return normalizeText(value || DEFAULT_MODEL);
}

export function normalizeStockLocationKey(value) {
  return RELEVANT_ESTABLISHMENTS.get(normalizeText(value)) || normalizeText(value);
}

export function locationMatchesEstablishment(location, establishment) {
  const key = normalizeStockLocationKey(establishment);
  return [location?.code, location?.name].map(normalizeStockLocationKey).includes(key);
}

function materialCodes(material = {}) {
  return Array.isArray(material.codes) ? material.codes.map(String).filter(Boolean) : [];
}

export function buildMaterialCodeMap(materials = []) {
  const map = new Map();
  for (const material of materials) {
    for (const code of materialCodes(material)) {
      const key = normalizeText(code);
      if (key && !map.has(key)) map.set(key, material);
    }
  }
  return map;
}

export function aggregateImportedSales({ records = [], materials = [], locations = [] } = {}) {
  const materialByCode = buildMaterialCodeMap(materials);
  const groups = new Map();
  let matchedRows = 0;
  let ignoredRows = 0;

  for (const record of records) {
    const material = materialByCode.get(normalizeText(record.product_code));
    const location = locations.find(item => locationMatchesEstablishment(item, record.establishment));
    if (!material || !location) {
      ignoredRows += 1;
      continue;
    }
    matchedRows += 1;
    const key = `${material.id}:${location.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        materialId: Number(material.id),
        locationId: Number(location.id),
        productCodes: new Set(),
        salesQty: 0
      });
    }
    const group = groups.get(key);
    if (record.product_code) group.productCodes.add(String(record.product_code).trim());
    group.salesQty += toNumber(record.sales_unit);
  }

  return {
    rows: [...groups.values()].map(group => ({
      materialId: group.materialId,
      locationId: group.locationId,
      productCodes: [...group.productCodes].sort(),
      salesQty: roundQty(group.salesQty)
    })),
    matchedRows,
    ignoredRows
  };
}

function movementTimestamp(row, dateField) {
  return row?.created_at || row?.createdAt || row?.[dateField] || null;
}

function isAfterInventory(
  row,
  inventoryAt,
  dateField
) {
  /*
   * Sem inventário:
   * começa do zero e os movimentos
   * podem formar saldo positivo/negativo.
   */
  if (!inventoryAt) {
    return true;
  }

  const inventoryDate =
    dateOnly(inventoryAt);

  const movementDate =
    dateOnly(
      row?.[dateField]
    );

  /*
   * Primeiro comparamos a DATA OPERACIONAL.
   *
   * Isso impede que uma produção de 20/08,
   * cadastrada somente em 15/09,
   * altere um inventário feito em 14/09.
   */
  if (
    inventoryDate &&
    movementDate
  ) {
    if (
      movementDate >
      inventoryDate
    ) {
      return true;
    }

    if (
      movementDate <
      inventoryDate
    ) {
      return false;
    }
  }

  /*
   * Se for exatamente o mesmo dia,
   * usamos horário de criação x horário
   * do inventário.
   */
  const timestamp =
    movementTimestamp(
      row,
      dateField
    );

  if (!timestamp) {
    return true;
  }

  return (
    new Date(timestamp).getTime() >
    new Date(inventoryAt).getTime()
  );
}

function dateOnly(value) {
  if (!value) {
    return '';
  }

  const text = String(value);
  const direct = text.slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct;
  }

  const parsed = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(parsed);

  const byType = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${byType.year}-${byType.month}-${byType.day}`;
}

function saleAffectsCurrentStock(
  row,
  inventoryAt
) {
  const inventoryDate =
    dateOnly(inventoryAt);

  if (!inventoryDate) {
    return false;
  }

  const periodStart =
    dateOnly(
      row.period_start ??
      row.periodStart
    );

  const periodEnd =
    dateOnly(
      row.period_end ??
      row.periodEnd
    );

  if (!periodStart || !periodEnd) {
    return false;
  }

  /*
   * O CSV só possui o total do período.
   *
   * Só podemos baixar o estoque com segurança
   * quando TODO o período pertence à nova base
   * iniciada pelo inventário.
   *
   * Inventário em 14/09:
   *
   * 01/02 -> 13/09 = histórico, não baixa.
   * 14/09 -> 14/09 = baixa.
   * 15/09 -> 15/09 = baixa.
   *
   * Um período começando antes do inventário
   * não é rateado artificialmente.
   */
  return periodStart >= inventoryDate;
}

function key(materialId, locationId) {
  return `${materialId || ''}:${locationId || ''}`;
}

function planningScopeKey(
  date,
  materialId,
  locationId
) {
  return `${
    dateOnly(date) || '*'
  }:${
    materialId || ''
  }:${
    locationId || ''
  }`;
}

function inputKey(materialId, inputMaterialId, modelName) {
  return `${materialId || ''}:${inputMaterialId || ''}:${normalizeModelName(modelName)}`;
}

function firstInputFor(inputsByMaterial, materialId, inputMaterialId) {
  return inputsByMaterial.get(`${materialId || ''}:${inputMaterialId || ''}`)?.[0] || null;
}

function addDetail(summary, type, quantity, detail = {}) {
  const normalized = roundQty(quantity);
  if (!normalized) return;
  summary.details.push({ type, quantity: normalized, ...detail });
}

function emptySummary(material, location, latestInventory = null) {
  return {
    materialId: Number(material.id),
materialName: material.name,
materialCodes: materialCodes(material),
unit: material.primary_unit || material.primaryUnit || '',
permitsSales: material.permits_sales !== false && material.permitsSales !== false,
locationId: Number(location.id),
    locationCode: location.code,
    locationName: location.name,
    latestInventory: latestInventory ? {
      quantity: roundQty(latestInventory.counted_qty ?? latestInventory.quantity),
      countedAt: latestInventory.created_at || latestInventory.counted_at || latestInventory.countedAt || null,
      inventoryCountId: latestInventory.inventory_count_id || latestInventory.inventoryCountId || null
    } : null,
    openingQty: roundQty(latestInventory?.counted_qty ?? latestInventory?.quantity),
    currentQty: roundQty(latestInventory?.counted_qty ?? latestInventory?.quantity),
    movementTotals: {
      productionInQty: 0,
      pendingProductionQty: 0,
      consumptionOutQty: 0,
      productionReserveQty: 0,
            transportInQty: 0,
      transportOutQty: 0,
      purchaseInQty: 0,
      salesQty: 0
    },
    details: []
  };
}

export function buildStockBalances({
  materials = [],
  locations = [],
  inventories = [],
  productionLaunches = [],
  transports = [],
  materialPurchases = [],
  sales = [],
  plannedRows = [],
  materialInputs = []
} = {}) {
  const materialById = new Map(materials.map(material => [String(material.id), material]));
  const locationById = new Map(locations.map(location => [String(location.id), location]));
  const latestInventoryByKey = new Map();
  for (const row of inventories) {
    const currentKey = key(row.material_id ?? row.materialId, row.location_id ?? row.locationId);
    const currentAt = new Date(row.created_at || row.counted_at || row.countedAt || 0).getTime();
    const previousAt = new Date(latestInventoryByKey.get(currentKey)?.created_at || 0).getTime();
    if (!latestInventoryByKey.has(currentKey) || currentAt >= previousAt) latestInventoryByKey.set(currentKey, row);
  }

  const summaries = new Map();
  for (const material of materials) {
    for (const location of locations) {
      const currentKey = key(material.id, location.id);
      summaries.set(currentKey, emptySummary(material, location, latestInventoryByKey.get(currentKey) || null));
    }
  }

  const inputsByExact = new Map();
  const inputsByMaterial = new Map();
  for (const input of materialInputs) {
    const row = {
      materialId: Number(input.material_id ?? input.materialId),
      inputMaterialId: Number(input.input_material_id ?? input.inputMaterialId),
      modelName: input.production_model_name ?? input.productionModelName ?? DEFAULT_MODEL,
      qtyPerOutput: toNumber(input.qty_per_output ?? input.qtyPerOutput ?? 1) || 1
    };
    inputsByExact.set(inputKey(row.materialId, row.inputMaterialId, row.modelName), row);
    const byMaterialKey = `${row.materialId}:${row.inputMaterialId}`;
    if (!inputsByMaterial.has(byMaterialKey)) inputsByMaterial.set(byMaterialKey, []);
    inputsByMaterial.get(byMaterialKey).push(row);
  }

  const producedByKey =
  new Map();

const producedByScopeKey =
  new Map();

const plannedByScopeKey =
  new Map();

  for (const row of productionLaunches) {
    const materialId = Number(row.material_id ?? row.materialId);
    const locationId = Number(row.location_id ?? row.locationId);
    if (!materialById.has(String(materialId)) || !locationById.has(String(locationId))) continue;
    const currentKey = key(materialId, locationId);
    const summary = summaries.get(currentKey);
    const quantity = toNumber(row.quantity ?? row.actual_qty);
    producedByKey.set(currentKey, toNumber(producedByKey.get(currentKey)) + quantity);
    const productionDate =
  dateOnly(
    row.production_date ??
    row.productionDate
  );

if (productionDate) {
  const currentScopeKey =
    planningScopeKey(
      productionDate,
      materialId,
      locationId
    );

  producedByScopeKey.set(
    currentScopeKey,

    toNumber(
      producedByScopeKey.get(
        currentScopeKey
      )
    )
    +
    quantity
  );
}
    if (isAfterInventory(row, summary.latestInventory?.countedAt, 'production_date')) {
      summary.movementTotals.productionInQty += quantity;
      summary.currentQty += quantity;
      addDetail(summary, 'production_in', quantity, {
        date: row.production_date,
        sourceId: row.id,
        productionModelName: row.production_model_name || null
      });
    }

    const consumedInputs = Array.isArray(row.consumed_inputs) ? row.consumed_inputs : [];
    for (const consumed of consumedInputs) {
      const inputMaterialId = Number(consumed.materialId ?? consumed.material_id ?? consumed.inputMaterialId ?? consumed.id);
      const input =
  inputsByExact.get(
    inputKey(
      materialId,
      inputMaterialId,
      row.production_model_name
    )
  )
  ||
  firstInputFor(
    inputsByMaterial,
    materialId,
    inputMaterialId
  );

if (
  !materialById.has(
    String(inputMaterialId)
  )
) {
  continue;
}

const consumedKey =
  key(
    inputMaterialId,
    locationId
  );

const consumedSummary =
  summaries.get(
    consumedKey
  );

if (!consumedSummary) {
  continue;
}


/*
 * Produções novas possuem a quantidade congelada.
 *
 * Produções antigas usam o cadastro atual
 * como fallback.
 */
const frozenQtyPerOutput =
  toNumber(
    consumed.qtyPerOutput ??
    consumed.qty_per_output
  );

const qtyPerOutput =
  frozenQtyPerOutput > 0
    ? frozenQtyPerOutput
    : toNumber(
        input?.qtyPerOutput
      );

const frozenConsumedQty =
  toNumber(
    consumed.consumedQty ??
    consumed.consumed_qty
  );

const consumedQty =
  frozenConsumedQty > 0
    ? frozenConsumedQty
    : quantity *
      qtyPerOutput;

if (!(consumedQty > 0)) {
  continue;
}

if (
  isAfterInventory(
    row,
    consumedSummary
      .latestInventory
      ?.countedAt,
    'production_date'
  )
) {
  consumedSummary
    .movementTotals
    .consumptionOutQty +=
      consumedQty;

  consumedSummary.currentQty -=
    consumedQty;

  addDetail(
    consumedSummary,
    'consumption_out',
    consumedQty,
    {
      date:
        row.production_date,

      sourceId:
        row.id,

      producedMaterialId:
        materialId,

      productionModelName:
        row.production_model_name ||
        null,

      qtyPerOutput:
        roundQty(
          qtyPerOutput
        ),

      producedQuantity:
        roundQty(
          quantity
        )
    }
  );
}
    }
  }

  for (const row of transports) {
    const materialId = Number(row.material_id ?? row.materialId);
    const originLocationId = Number(row.origin_location_id ?? row.originLocationId);
    const destinationLocationId = Number(row.destination_location_id ?? row.destinationLocationId);
    const quantity = toNumber(row.quantity);
    const origin = summaries.get(key(materialId, originLocationId));
    const destination = summaries.get(key(materialId, destinationLocationId));
    if (origin && isAfterInventory(row, origin.latestInventory?.countedAt, 'transport_date')) {
      origin.movementTotals.transportOutQty += quantity;
      origin.currentQty -= quantity;
      addDetail(origin, 'transport_out', quantity, {
        date: row.transport_date,
        sourceId: row.id,
        destinationLocationId
      });
    }
    if (destination && isAfterInventory(row, destination.latestInventory?.countedAt, 'transport_date')) {
      destination.movementTotals.transportInQty += quantity;
      destination.currentQty += quantity;
      addDetail(destination, 'transport_in', quantity, {
        date: row.transport_date,
        sourceId: row.id,
        originLocationId
      });
    }
  }

    for (const row of materialPurchases) {
    const materialId = Number(
      row.material_id ??
      row.materialId
    );

    const locationId = Number(
      row.location_id ??
      row.locationId
    );

    const quantity =
      toNumber(row.quantity);

    const summary =
      summaries.get(
        key(
          materialId,
          locationId
        )
      );

    if (
      !summary ||
      !(quantity > 0)
    ) {
      continue;
    }

    if (
      isAfterInventory(
        row,
        summary.latestInventory?.countedAt,
        'purchase_date'
      )
    ) {
      summary.movementTotals.purchaseInQty +=
        quantity;

      summary.currentQty +=
        quantity;

      addDetail(
        summary,
        'purchase_in',
        quantity,
        {
          date:
            row.purchase_date,

          sourceId:
            row.id,

          invoiceNumber:
            row.invoice_number ||
            null
        }
      );
    }
  }


  for (const row of plannedRows) {
  const materialId =
    Number(
      row.material_id ??
      row.materialId
    );

  const locationId =
    Number(
      row.location_id ??
      row.locationId
    );

  const quantity =
    toNumber(
      row.planned_qty ??
      row.plannedQty
    );

  const plannedDate =
    dateOnly(
      row.planned_date ??
      row.plannedDate
    );

  if (
    !materialId
    ||
    !locationId
    ||
    quantity <= 0
  ) {
    continue;
  }

  const scopeKey =
    planningScopeKey(
      plannedDate,
      materialId,
      locationId
    );

  const current =
    plannedByScopeKey.get(
      scopeKey
    )
    ||
    {
      materialId,
      locationId,
      plannedDate,
      plannedQty: 0
    };

  current.plannedQty +=
    quantity;

  plannedByScopeKey.set(
    scopeKey,
    current
  );
}


for (
  const planned
  of plannedByScopeKey.values()
) {
  const currentKey =
    key(
      planned.materialId,
      planned.locationId
    );

  const summary =
    summaries.get(
      currentKey
    );

  if (!summary) {
    continue;
  }


  /*
   * Só uma produção pertencente à mesma
   * data planejada + material + local
   * reduz o pendente.
   *
   * Produções feitas fora do planejamento
   * continuam movimentando o estoque físico,
   * mas NÃO matam o pendente do planejamento.
   */
  const producedQty =
    planned.plannedDate

      ? toNumber(
          producedByScopeKey.get(
            planningScopeKey(
              planned.plannedDate,
              planned.materialId,
              planned.locationId
            )
          )
        )

      : toNumber(
          producedByKey.get(
            currentKey
          )
        );


  /*
   * Nunca pode ficar negativo.
   */
  const pendingQty =
    Math.max(
      planned.plannedQty
      -
      producedQty,

      0
    );


  /*
   * Pode existir mais de um dia planejado
   * para o mesmo material/local.
   *
   * Por isso SOMAMOS os pendentes.
   */
  summary
    .movementTotals
    .pendingProductionQty =
      roundQty(
        summary
          .movementTotals
          .pendingProductionQty

        +
        pendingQty
      );


  addDetail(
    summary,
    'pending_production',
    pendingQty,
    {
      date:
        planned.plannedDate
        ||
        null,

      plannedQty:
        roundQty(
          planned.plannedQty
        ),

      producedQty:
        roundQty(
          producedQty
        )
    }
  );


  /*
   * Agora calculamos aquilo que esse
   * pendente ainda precisa reservar
   * dos seus materiais de entrada.
   */
  const materialId =
    summary.materialId;


  const relevantInputs =
    materialInputs.filter(
      input =>
        String(
          input.material_id ??
          input.materialId
        )
        ===
        String(
          materialId
        )
    );


  const modelNames = [
    ...new Set(
      relevantInputs.map(
        input =>
          normalizeModelName(
            input.production_model_name ??
            input.productionModelName
          )
      )
    )
  ].sort();


  const selectedModel =
    modelNames[0]
    ||
    null;


  for (
    const input
    of relevantInputs
  ) {
    if (
      selectedModel
      &&
      normalizeModelName(
        input.production_model_name ??
        input.productionModelName
      )
      !==
      selectedModel
    ) {
      continue;
    }


    const inputMaterialId =
      Number(
        input.input_material_id ??
        input.inputMaterialId
      );


    const reserveSummary =
      summaries.get(
        key(
          inputMaterialId,
          summary.locationId
        )
      );


    if (!reserveSummary) {
      continue;
    }


    const reserveQty =
      pendingQty
      *
      (
        toNumber(
          input.qty_per_output ??
          input.qtyPerOutput ??
          1
        )
        ||
        1
      );


    reserveSummary
      .movementTotals
      .productionReserveQty =
        roundQty(
          reserveSummary
            .movementTotals
            .productionReserveQty

          +
          reserveQty
        );


    addDetail(
      reserveSummary,
      'production_reserve',
      reserveQty,
      {
        date:
          planned.plannedDate
          ||
          null,

        producedMaterialId:
          materialId,

        pendingProductionQty:
          roundQty(
            pendingQty
          )
      }
    );
  }
}
  for (const row of sales) {
  const summary =
    summaries.get(
      key(
        row.material_id ??
          row.materialId,
        row.location_id ??
          row.locationId
      )
    );

  if (!summary) continue;

  const quantity =
    toNumber(
      row.sales_qty ??
      row.salesQty
    );

  /*
   * Toda venda entra no histórico comercial.
   *
   * Portanto:
   * Vendas período / Vendas-dia
   * continuam acumulando desde a primeira importação.
   */
  summary.movementTotals.salesQty +=
    quantity;

  /*
   * Mas somente vendas pertencentes à base
   * posterior ao último inventário reduzem
   * o saldo físico atual.
   */
  const affectsCurrentStock =
    saleAffectsCurrentStock(
      row,
      summary.latestInventory?.countedAt
    );

  if (affectsCurrentStock) {
    summary.currentQty -= quantity;
  }

  addDetail(
    summary,
    'sales',
    quantity,
    {
      importId:
        row.import_id ??
        row.importId,

      periodStart:
        row.period_start ??
        row.periodStart,

      periodEnd:
        row.period_end ??
        row.periodEnd,

      affectsCurrentStock
    }
  );
}

  for (const summary of summaries.values()) {
    summary.currentQty = roundQty(summary.currentQty);
    for (const [name, value] of Object.entries(summary.movementTotals)) {
      summary.movementTotals[name] = roundQty(value);
    }
  }

  return [...summaries.values()]
    .sort((left, right) => (
      String(left.materialName).localeCompare(String(right.materialName), 'pt-BR')
      || String(left.locationName).localeCompare(String(right.locationName), 'pt-BR')
    ));
}
