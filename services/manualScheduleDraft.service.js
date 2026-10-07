import {
  resolveMaterialProductivityLines,
  resolveProductivityConfiguration
} from './productivityMatrixResolution.service.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EPSILON = 0.001;
const DEFAULT_DAILY_MINUTES = 528;
export const MANUAL_SCHEDULE_PERCENT_PRECISION = 2;
export const MANUAL_SCHEDULE_QUANTITY_PRECISION = 6;
const NO_PRODUCTIVITY_MESSAGE = 'Não existe produtividade cadastrada para este material na máquina selecionada com esta quantidade de pessoas.';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix = 'draft') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function isValidDateOnly(value) {
  const normalized = String(value || '').slice(0, 10);
  if (!DATE_PATTERN.test(normalized)) return false;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function wholeProductionQuantity(value) {
  const quantity = toNumber(value);
  if (!(quantity > 0)) return 0;

  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quantity)) * 8;
  return Math.ceil(quantity - tolerance);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeUnit(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(value) {
  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function normalizedMachineIds(machines = []) {
  return new Set((Array.isArray(machines) ? machines : [])
    .flatMap(machine => [machine?.machineId, machine?.machineName, machine?.id, machine?.name])
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(String));
}

function allocationTraceIds(allocation = {}) {
  const ids = Array.isArray(allocation.sourceAllocationIds) && allocation.sourceAllocationIds.length
    ? allocation.sourceAllocationIds
    : [allocation.allocationId];
  return ids.map(String).filter(Boolean);
}

function allocationParentIds(allocation = {}) {
  const ids = Array.isArray(allocation.sourceParentOperationIds) && allocation.sourceParentOperationIds.length
    ? allocation.sourceParentOperationIds
    : [allocation.parentOperationId];
  return ids.map(String).filter(Boolean);
}

function normalizeComponents(allocation = {}) {
  const components = Array.isArray(allocation.components) && allocation.components.length
    ? allocation.components
    : [{
        allocationId: allocation.allocationId,
        parentOperationId: allocation.parentOperationId || allocation.calendarParentOperationId || allocation.operationId || '',
        productionId: allocation.productionId || allocation.productionKey || `production-${allocation.productionIndex || 0}`,
        quantity: allocation.quantity ?? allocation.produceQty
      }];
  return components
    .map(component => ({
      ...component,
      allocationId: String(component.allocationId || allocation.allocationId || ''),
      parentOperationId: String(component.parentOperationId || allocation.parentOperationId || ''),
      productionId: String(component.productionId || allocation.productionId || ''),
      quantity: toNumber(component.quantity)
    }))
    .filter(component => component.quantity > 0);
}

function normalizeAllocation(allocation = {}, index = 0) {
  const allocationId = String(allocation.allocationId || createId('alloc'));
  const durationMinutes = toNumber(allocation.durationMinutes ?? allocation.duration);
  return {
    ...allocation,
    allocationId,
    parentOperationId: String(allocation.parentOperationId || allocation.calendarParentOperationId || allocation.operationId || ''),
    productionId: String(allocation.productionId || allocation.productionKey || `production-${allocation.productionIndex || 0}`),
    materialId: String(allocation.materialId ?? allocation.material_id ?? ''),
    machineId: String(allocation.machineId ?? allocation.machine_id ?? allocation.machineName ?? allocation.machine_name ?? ''),
    date: String(allocation.date || allocation.startDate || '').slice(0, 10),
    startTime: String(allocation.startTime || '07:00').slice(0, 5),
    endTime: String(allocation.endTime || allocation.startTime || '07:00').slice(0, 5),
    quantity: toNumber(allocation.quantity ?? allocation.produceQty),
    unit: String(allocation.unit ?? allocation.plannedUnit ?? allocation.planned_unit ?? allocation.outputUnit ?? allocation.output_unit ?? ''),
    durationMinutes,
    capacityPercent: allocation.capacityPercent === null || allocation.capacityPercent === undefined
      ? null
      : toNumber(allocation.capacityPercent, null),
    peopleCount: toNumber(allocation.peopleCount ?? allocation.people_count),
    sequence: Number.isFinite(Number(allocation.sequence)) ? Number(allocation.sequence) : index + 1,
    source: allocation.source === 'manual' ? 'manual' : 'automatic',
    pinned: Boolean(allocation.pinned),
    sourceAllocationIds: allocationTraceIds({ ...allocation, allocationId }),
    sourceParentOperationIds: allocationParentIds(allocation),
    components: normalizeComponents({ ...allocation, allocationId })
  };
}

function parentTotals(allocations = []) {
  return allocations.reduce((totals, allocation) => {
    const components = normalizeComponents(allocation);
    components.forEach(component => {
      const key = String(component.parentOperationId || '');
      totals.set(key, toNumber(totals.get(key)) + toNumber(component.quantity));
    });
    return totals;
  }, new Map());
}

function traceIdSet(allocations = []) {
  return allocations.reduce((set, allocation) => {
    allocationTraceIds(allocation).forEach(id => set.add(id));
    return set;
  }, new Set());
}

function consolidationKey(allocation = {}) {
  return [
    allocation.materialId,
    allocation.machineId,
    allocation.date,
    allocation.unit,
    allocation.peopleCount
  ].map(value => String(value || '')).join('|');
}

function mergeComponents(...groups) {
  return groups
    .flat()
    .map(component => ({ ...component, quantity: toNumber(component.quantity) }))
    .filter(component => component.quantity > 0);
}

function splitComponentsByQuantity(components = [], quantity) {
  const wanted = Math.max(toNumber(quantity), 0);
  const total = components.reduce((sum, component) => sum + toNumber(component.quantity), 0);
  if (!(wanted > 0) || !(total > 0)) return [];
  return components.map(component => ({
    ...component,
    quantity: Number((toNumber(component.quantity) * (wanted / total)).toFixed(6))
  })).filter(component => component.quantity > 0);
}

function fixedUnits(value, precision) {
  return Math.round(toNumber(value) * (10 ** precision));
}

function unitsValue(value, precision) {
  return Number((value / (10 ** precision)).toFixed(precision));
}

function clockMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').slice(0, 5));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? (hours * 60) + minutes : null;
}

function minutesClock(value) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function manualScheduleTransportDurationMinutes({
  startDate,
  startTime,
  endDate,
  endTime,
  durationMinutes
} = {}) {
  const explicit = toNumber(
    durationMinutes,
    NaN
  );

  if (
    Number.isFinite(explicit)
    && explicit > 0
  ) {
    return Math.ceil(explicit);
  }

  if (
    !isValidDateOnly(startDate)
    || !isValidDateOnly(endDate)
  ) {
    return 0;
  }

  const startClock =
    clockMinutes(startTime);

  const endClock =
    clockMinutes(endTime);

  if (
    startClock === null
    || endClock === null
  ) {
    return 0;
  }

  const start =
    new Date(
      `${startDate}T00:00:00Z`
    ).getTime();

  const end =
    new Date(
      `${endDate}T00:00:00Z`
    ).getTime();

  const dayMinutes =
    Math.round(
      (end - start) / 60000
    );

  return Math.max(
    dayMinutes
      + endClock
      - startClock,
    0
  );
}


export function normalizeManualScheduleTransport(
  transport = {},
  index = 0
) {
  const startDate =
    normalizeDateOnly(
      transport?.startDate
      ?? transport?.date
      ?? ''
    );

  const endDate =
    normalizeDateOnly(
      transport?.endDate
      ?? startDate
    );

  /*
   * O transporte manual trabalha por DIA,
   * não por turno produtivo.
   *
   * Para o domínio temporal representamos:
   *
   * início do primeiro dia = 00:00
   * fim do último dia = 23:59
   */
  const startTime =
    String(
      transport?.startTime
      || '00:00'
    ).slice(0, 5);

  const endTime =
    String(
      transport?.endTime
      || '23:59'
    ).slice(0, 5);

  /*
   * Draft manual:
   *
   * por padrão o material fica disponível
   * no DESTINO no início do transporte.
   *
   * O modo "end" continua existindo para
   * compatibilidade futura/legada.
   */
   const requestedAvailabilityMode =
    String(
      transport?.availabilityMode
      || ''
    ).trim();

  const availabilityMode =
    requestedAvailabilityMode === 'day-start'
      ? 'day-start'
      : requestedAvailabilityMode === 'end'
        ? 'end'
        : 'start';

  const transportId =
    String(
      transport?.transportId
      ?? transport?.id
      ?? `manual-transport-${index + 1}`
    );

  const producerParentOperationIds =
    [
      ...new Set(
        (
          Array.isArray(
            transport
              ?.producerParentOperationIds
          )
            ? transport
                .producerParentOperationIds
            : Array.isArray(
                transport
                  ?.sourceParentOperationIds
              )
              ? transport
                  .sourceParentOperationIds
              : []
        )
          .map(value =>
            String(value || '')
          )
          .filter(Boolean)
      )
    ];

  const consumerParentOperationIds =
    [
      ...new Set(
        (
          Array.isArray(
            transport
              ?.consumerParentOperationIds
          )
            ? transport
                .consumerParentOperationIds
            : Array.isArray(
                transport
                  ?.targetParentOperationIds
              )
              ? transport
                  .targetParentOperationIds
              : []
        )
          .map(value =>
            String(value || '')
          )
          .filter(Boolean)
      )
    ];

  const sourceAllocationIds =
    [
      ...new Set(
        (
          Array.isArray(
            transport
              ?.sourceAllocationIds
          )
            ? transport
                .sourceAllocationIds
            : []
        )
          .map(value =>
            String(value || '')
          )
          .filter(Boolean)
      )
    ];

  return {
    ...transport,

    transportId,

    transportType:
      'manual',

    availabilityMode,

    materialId:
      String(
        transport?.materialId
        ?? transport?.material_id
        ?? ''
      ),

    materialCode:
      String(
        transport?.materialCode
        ?? transport?.material_code
        ?? ''
      ),

    materialName:
      String(
        transport?.materialName
        ?? transport?.material_name
        ?? ''
      ),

    quantity:
      toNumber(
        transport?.quantity
        ?? transport?.requiredQuantity
        ?? transport?.produceQty
      ),

    unit:
      String(
        transport?.unit
        || ''
      ),

    sourceLocation:
      String(
        transport?.sourceLocation
        ?? transport?.sourceLocationId
        ?? transport?.originLocationId
        ?? transport?.originLocation
        ?? ''
      ),

    targetLocation:
      String(
        transport?.targetLocation
        ?? transport?.targetLocationId
        ?? transport?.destinationLocationId
        ?? transport?.destinationLocation
        ?? ''
      ),

    startDate,
    startTime,
    endDate,
    endTime,

    durationMinutes:
      manualScheduleTransportDurationMinutes({
        startDate,
        startTime,
        endDate,
        endTime,

        durationMinutes:
          transport?.durationMinutes
      }),

    producerParentOperationIds,
    consumerParentOperationIds,
    sourceAllocationIds,

    source:
      'manual'
  };
}

export function normalizeManualSchedulePlannedReceipt(
  receipt = {},
  index = 0
) {
  const arrivalDate =
    normalizeDateOnly(
      receipt?.arrivalDate
      ?? receipt?.date
      ?? ''
    );

  const availableDate =
    normalizeDateOnly(
      receipt?.availableDate
      ?? (
        isValidDateOnly(arrivalDate)
          ? addDays(arrivalDate, 1)
          : ''
      )
    );

  return {
    ...receipt,

    receiptId:
      String(
        receipt?.receiptId
        ?? receipt?.id
        ?? `planned-receipt-${index + 1}`
      ),

    receiptType:
      'planned-purchase',

    materialId:
      String(
        receipt?.materialId
        ?? receipt?.material_id
        ?? ''
      ),

    materialCode:
      String(
        receipt?.materialCode
        ?? receipt?.material_code
        ?? ''
      ),

    materialName:
      String(
        receipt?.materialName
        ?? receipt?.material_name
        ?? ''
      ),

    locationId:
      String(
        receipt?.locationId
        ?? receipt?.location_id
        ?? receipt?.targetLocation
        ?? receipt?.targetLocationId
        ?? ''
      ),

    locationName:
      String(
        receipt?.locationName
        ?? receipt?.location_name
        ?? ''
      ),

    quantity:
      toNumber(
        receipt?.quantity
      ),

    unit:
      String(
        receipt?.unit
        || ''
      ),

    arrivalDate,

    availableDate,

    productionModelName:
      String(
        receipt?.productionModelName
        || ''
      ),

    sourceShortageKey:
      String(
        receipt?.sourceShortageKey
        || ''
      ),

    source:
      'manual'
  };
}

export function createManualScheduleTransport(
  draft,
  {
    transport = {},
    availableQuantity = null,
    machines = [],
    now
  } = {}
) {
  const previous =
    clone(
      draft
      && typeof draft === 'object'
        ? draft
        : {}
    );

  const transports =
    (
      Array.isArray(
        previous?.transports
      )
        ? previous.transports
        : []
    ).map(
      normalizeManualScheduleTransport
    );

  const transportId =
    String(
      transport?.transportId
      || transport?.id
      || createId('manual-transport')
    );

  if (
    transports.some(
      item =>
        String(
          item?.transportId
          || ''
        )
        === transportId
    )
  ) {
    throw makeMoveError(
      'Já existe um transporte com este identificador.',
      'TRANSPORT_ID_DUPLICATED',
      previous
    );
  }

  const normalized =
    normalizeManualScheduleTransport(
      {
        ...transport,

        transportId,

        /*
         * MANUAL-05:
         * libera no destino já no
         * primeiro dia do transporte.
         */
                availabilityMode:
          transport?.availabilityMode === 'day-start'
            ? 'day-start'
            : transport?.availabilityMode === 'end'
              ? 'end'
              : 'start'
      },
      transports.length
    );

  if (!normalized.materialId) {
    throw makeMoveError(
      'Material do transporte não informado.',
      'TRANSPORT_MATERIAL_REQUIRED',
      previous
    );
  }

  if (!(normalized.quantity > 0)) {
    throw makeMoveError(
      'A quantidade do transporte deve ser maior que zero.',
      'TRANSPORT_QUANTITY_INVALID',
      previous
    );
  }

  const maximum =
    Number(
      availableQuantity
    );

  if (
    Number.isFinite(maximum)
    &&
    normalized.quantity
      > maximum + EPSILON
  ) {
    throw makeMoveError(
      'A quantidade do transporte é maior que o saldo disponível na origem.',
      'TRANSPORT_QUANTITY_EXCEEDS_AVAILABLE',
      previous,
      {
        availableQuantity:
          maximum,

        requestedQuantity:
          normalized.quantity
      }
    );
  }

  if (
    !normalized.sourceLocation
    || !normalized.targetLocation
  ) {
    throw makeMoveError(
      'Origem e destino do transporte são obrigatórios.',
      'TRANSPORT_LOCATION_REQUIRED',
      previous
    );
  }

  if (
    normalized.sourceLocation
    === normalized.targetLocation
  ) {
    throw makeMoveError(
      'Origem e destino do transporte devem ser diferentes.',
      'TRANSPORT_LOCATION_EQUAL',
      previous
    );
  }

  if (
    !isValidDateOnly(
      normalized.startDate
    )
    ||
    !isValidDateOnly(
      normalized.endDate
    )
  ) {
    throw makeMoveError(
      'Informe datas válidas para o transporte.',
      'TRANSPORT_DATE_INVALID',
      previous
    );
  }

  if (
    normalized.endDate
    < normalized.startDate
  ) {
    throw makeMoveError(
      'A data final do transporte não pode ser anterior à data inicial.',
      'TRANSPORT_END_BEFORE_START',
      previous
    );
  }

  const updatedAt =
    now === undefined
      ? new Date().toISOString()
      : (
          now instanceof Date
            ? now.toISOString()
            : String(now)
        );

  const next = {
    ...previous,

    transports: [
      ...transports,
      normalized
    ],

    updatedAt,

    dirty: true,

    lastManualAction: {
      type:
        'CREATE_MANUAL_TRANSPORT',

      transportId
    }
  };

  const validation =
    validateManualScheduleDraft(
      next,
      {
        machines
      }
    );

  if (!validation.valid) {
    throw makeMoveError(
      'Transporte manual inválido. O rascunho foi mantido sem alterações.',
      'TRANSPORT_DRAFT_INVALID',
      previous,
      {
        details:
          validation.errors
      }
    );
  }

  return next;
}

function applySequentialTimes(allocations = [], {
  startTime = '07:00',
  overrideAllocationIds = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES
} = {}) {
  const overrideIds = new Set(overrideAllocationIds.map(String));
  const dayStart = clockMinutes(startTime) ?? clockMinutes('07:00');
  const safeDailyMinutes = Math.max(toNumber(dailyMinutes, DEFAULT_DAILY_MINUTES), 1);

  let usedCapacityPercent = 0;
  let cursor = dayStart;

  return allocations.map(allocation => {
    const capacityPercent = toNumber(allocation.capacityPercent, null);

    let start;
    let end;
    let duration;

    if (capacityPercent !== null && capacityPercent > 0) {
      start = dayStart + Math.round(
        (safeDailyMinutes * usedCapacityPercent) / 100
      );

      usedCapacityPercent += capacityPercent;

      end = dayStart + Math.round(
        (safeDailyMinutes * usedCapacityPercent) / 100
      );

      duration = Math.max(end - start, 1);
      cursor = end;
    } else {
      duration = Math.max(
        Math.ceil(toNumber(allocation.durationMinutes)),
        1
      );

      start = cursor;
      end = cursor + duration;
      cursor = end;
    }

    return {
      ...allocation,
      durationMinutes: duration,
      startTime: minutesClock(start),
      endTime: minutesClock(end),
      endDate: addDays(
        allocation.date,
        Math.floor(end / 1440)
      ),
      isCapacityOverride: Boolean(
        allocation.isCapacityOverride
        || overrideIds.has(String(allocation.allocationId))
      )
    };
  });
}

function splitError(message, code = 'ALLOCATION_SPLIT_INVALID') {
  return Object.assign(new Error(message), { code });
}

function partitionComponents(components, firstQuantityUnits, totalQuantityUnits, firstAllocationId, secondAllocationId) {
  const normalized = normalizeComponents({ components });
  if (!normalized.length) return [[], []];
  const componentUnits = normalized.map(component => fixedUnits(component.quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION));
  const componentTotalUnits = componentUnits.reduce((sum, value) => sum + value, 0);
  if (!(componentTotalUnits > 0)) return [[], []];

  const apportioned = componentUnits.map((value, index) => {
    const numerator = value * firstQuantityUnits;
    return { index, units: Math.floor(numerator / totalQuantityUnits), remainder: numerator % totalQuantityUnits };
  });
  let missing = firstQuantityUnits - apportioned.reduce((sum, item) => sum + item.units, 0);
  [...apportioned]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach(item => {
      if (missing <= 0 || item.units >= componentUnits[item.index]) return;
      item.units += 1;
      missing -= 1;
    });
  if (missing !== 0 || componentTotalUnits !== totalQuantityUnits) {
    throw splitError('Os componentes da allocation original não reconciliam com sua quantidade.', 'ALLOCATION_SPLIT_COMPONENTS_INVALID');
  }

  const first = [];
  const second = [];
  apportioned.sort((left, right) => left.index - right.index).forEach(item => {
    const component = normalized[item.index];
    const secondUnits = componentUnits[item.index] - item.units;
    if (item.units > 0) first.push({
      ...component,
      allocationId: firstAllocationId,
      quantity: unitsValue(item.units, MANUAL_SCHEDULE_QUANTITY_PRECISION)
    });
    if (secondUnits > 0) second.push({
      ...component,
      allocationId: secondAllocationId,
      quantity: unitsValue(secondUnits, MANUAL_SCHEDULE_QUANTITY_PRECISION)
    });
  });
  return [first, second];
}

function normalizedRelativePercentUnits(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw splitError('Informe percentuais numéricos válidos.');
  const units = fixedUnits(numeric, MANUAL_SCHEDULE_PERCENT_PRECISION);
  if (Math.abs(numeric - unitsValue(units, MANUAL_SCHEDULE_PERCENT_PRECISION)) > Number.EPSILON * Math.max(1, Math.abs(numeric))) {
    throw splitError(`Use no máximo ${MANUAL_SCHEDULE_PERCENT_PRECISION} casas decimais no percentual.`);
  }
  if (!(units > 0) || units > 100 * (10 ** MANUAL_SCHEDULE_PERCENT_PRECISION)) {
    throw splitError('Cada parte deve ser maior que 0% e menor ou igual a 100%.');
  }
  return units;
}

function partitionUnits(totalUnits, ratioUnits) {
  const values = [];
  let used = 0;
  ratioUnits.forEach((ratio, index) => {
    const units = index === ratioUnits.length - 1
      ? totalUnits - used
      : Math.round(totalUnits * ratio / (100 * (10 ** MANUAL_SCHEDULE_PERCENT_PRECISION)));
    if (!(units > 0)) throw splitError('Uma parte resultou em quantidade zero após o arredondamento.');
    values.push(units);
    used += units;
  });
  if (used !== totalUnits) throw splitError('A distribuição não reconciliou com o total selecionado.');
  return values;
}

function partitionProductionMemberships(memberships, ratioUnits) {
  const source = Array.isArray(memberships) ? memberships : [];
  const parts = ratioUnits.map(() => []);
  source.forEach(membership => {
    const quantity = membership?.quantity;
    const resolved = membership?.quantitySource !== 'legacy-unresolved'
      && quantity !== null
      && quantity !== undefined
      && quantity !== ''
      && Number.isFinite(Number(quantity));
    if (!resolved) {
      const unresolved = {
        ...clone(membership),
        quantitySource: 'legacy-unresolved'
      };
      delete unresolved.quantity;
      parts.forEach(part => part.push(clone(unresolved)));
      return;
    }
    const quantityUnits = fixedUnits(quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION);
    const quantityParts = partitionUnits(quantityUnits, ratioUnits);
    quantityParts.forEach((partQuantity, index) => {
      parts[index].push({
        ...clone(membership),
        quantity: unitsValue(partQuantity, MANUAL_SCHEDULE_QUANTITY_PRECISION),
        quantitySource: String(membership.quantitySource || 'production-breakdown')
      });
    });
  });
  return parts;
}

function partitionComponentsForQuantities(components, quantityUnits, allocationIds) {
  let remaining = normalizeComponents({ components }).map(component => ({
    component,
    units: fixedUnits(component.quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION)
  }));
  let remainingTotal = remaining.reduce((sum, item) => sum + item.units, 0);
  if (remainingTotal !== quantityUnits.reduce((sum, value) => sum + value, 0)) {
    throw splitError('Os componentes da allocation selecionada não reconciliam com sua quantidade.', 'ALLOCATION_SPLIT_COMPONENTS_INVALID');
  }
  return quantityUnits.map((wanted, partIndex) => {
    if (partIndex === quantityUnits.length - 1) {
      return remaining.filter(item => item.units > 0).map(item => ({
        ...item.component,
        allocationId: allocationIds[partIndex],
        quantity: unitsValue(item.units, MANUAL_SCHEDULE_QUANTITY_PRECISION)
      }));
    }
    const apportioned = remaining.map((item, index) => ({
      index,
      units: Math.floor(item.units * wanted / remainingTotal),
      remainder: (item.units * wanted) % remainingTotal
    }));
    let missing = wanted - apportioned.reduce((sum, item) => sum + item.units, 0);
    [...apportioned]
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
      .forEach(item => {
        if (missing <= 0 || item.units >= remaining[item.index].units) return;
        item.units += 1;
        missing -= 1;
      });
    if (missing !== 0) throw splitError('Não foi possível reconciliar os componentes da parte.');
    const result = apportioned.filter(item => item.units > 0).map(item => ({
      ...remaining[item.index].component,
      allocationId: allocationIds[partIndex],
      quantity: unitsValue(item.units, MANUAL_SCHEDULE_QUANTITY_PRECISION)
    }));
    remaining = remaining.map((item, index) => ({ ...item, units: item.units - apportioned[index].units }));
    remainingTotal -= wanted;
    return result;
  });
}

function splitLineage(original, relativePercent, order, siblingCount, groupId) {
  const rootId = String(original.splitRootAllocationId || original.allocationId);
  const parentPath = String(original.splitPath || '');
  const parentAccumulated = Number.isFinite(Number(original.splitAccumulatedRatioPercent))
    ? Number(original.splitAccumulatedRatioPercent)
    : 100;
  return {
    splitGroupId: groupId,
    splitRootAllocationId: rootId,
    splitParentAllocationId: original.allocationId,
    splitDepth: Number(original.splitDepth || 0) + 1,
    splitOrder: order,
    splitSiblingCount: siblingCount,
    splitRatioPercent: relativePercent,
    splitAccumulatedRatioPercent: Number((parentAccumulated * relativePercent / 100).toFixed(6)),
    splitPath: parentPath ? `${parentPath}.${order}` : String(order),
    splitRootQuantity: Number(original.splitRootQuantity ?? original.quantity),
    splitRootCapacityPercent: Number(original.splitRootCapacityPercent ?? original.capacityPercent)
  };
}

export function buildManualScheduleAllocationParts(allocation, relativePercents, { splitGroupId = null } = {}) {
  const original = normalizeAllocation(allocation);
  const values = Array.isArray(relativePercents) ? relativePercents : [];
  if (values.length < 2) throw splitError('A divisão deve possuir pelo menos duas partes.');
  if (values.length > 100) throw splitError('A divisão excede o limite técnico de 100 partes.');
  const ratioUnits = values.map(normalizedRelativePercentUnits);
  const relativeTotalUnits = ratioUnits.reduce((sum, value) => sum + value, 0);
  const hundredUnits = 100 * (10 ** MANUAL_SCHEDULE_PERCENT_PRECISION);
  if (relativeTotalUnits !== hundredUnits) throw splitError('A soma dos percentuais relativos deve ser exatamente 100%.');

  const capacityUnits = fixedUnits(original.capacityPercent, MANUAL_SCHEDULE_PERCENT_PRECISION);
  const quantityTotalUnits = fixedUnits(original.quantity, MANUAL_SCHEDULE_QUANTITY_PRECISION);
  const durationTotalUnits = fixedUnits(original.durationMinutes, MANUAL_SCHEDULE_QUANTITY_PRECISION);
  if (!(capacityUnits > 0) || !(quantityTotalUnits >= values.length) || !(durationTotalUnits >= values.length)) {
    throw splitError('A allocation selecionada não possui precisão suficiente para todas as partes.');
  }
  const capacityParts = partitionUnits(capacityUnits, ratioUnits);
  const quantityParts = partitionUnits(quantityTotalUnits, ratioUnits);
  const durationParts = partitionUnits(durationTotalUnits, ratioUnits);
  const start = clockMinutes(original.startTime);
  const end = clockMinutes(original.endTime);
  if (start === null || end === null || String(original.endDate || original.date) !== original.date || end <= start) {
    throw splitError('A allocation selecionada não representa um único intervalo diário divisível.', 'ALLOCATION_SPLIT_AMBIGUOUS');
  }
  const clockParts = partitionUnits(end - start, ratioUnits);
  const groupId = String(splitGroupId || createId(`split:${original.allocationId}`));
  const allocationIds = values.map((_, index) => `${groupId}:part-${index + 1}`);
  if (new Set(allocationIds).size !== allocationIds.length) throw splitError('A divisão gerou IDs duplicados.');
  const componentParts = partitionComponentsForQuantities(normalizeComponents(original), quantityParts, allocationIds);
  const productionMembershipParts = partitionProductionMemberships(original.productionMemberships, ratioUnits);
  let cursor = start;
  const parts = values.map((value, index) => {
    const partStart = cursor;
    cursor += clockParts[index];
    const relativePercent = unitsValue(ratioUnits[index], MANUAL_SCHEDULE_PERCENT_PRECISION);
    const allocationId = allocationIds[index];
    return {
      ...original,
      ...splitLineage(original, relativePercent, index + 1, values.length, groupId),
      allocationId,
      splitPartId: allocationId,
      source: 'manual',
      pinned: true,
      startTime: minutesClock(partStart),
      endTime: index === values.length - 1 ? original.endTime : minutesClock(cursor),
      quantity: unitsValue(quantityParts[index], MANUAL_SCHEDULE_QUANTITY_PRECISION),
      durationMinutes: unitsValue(durationParts[index], MANUAL_SCHEDULE_QUANTITY_PRECISION),
      capacityPercent: unitsValue(capacityParts[index], MANUAL_SCHEDULE_PERCENT_PRECISION),
      sequence: toNumber(original.sequence) + (index * 0.000001),
      sourceAllocationIds: allocationTraceIds(original),
      productionMemberships: productionMembershipParts[index],
      components: componentParts[index]
    };
  });
  return {
    original,
    splitGroupId: groupId,
    parts,
    quantityTotal: unitsValue(quantityTotalUnits, MANUAL_SCHEDULE_QUANTITY_PRECISION),
    percentTotal: unitsValue(capacityUnits, MANUAL_SCHEDULE_PERCENT_PRECISION)
  };
}

export function buildManualScheduleAllocationSplit(allocation, firstPercent, { splitGroupId = null } = {}) {
  const result = buildManualScheduleAllocationParts(allocation, [firstPercent, 100 - Number(firstPercent)], { splitGroupId });
  return { ...result, first: result.parts[0], second: result.parts[1] };
}

export function splitDraftAllocation(draft, {
  allocationId, firstPercent, relativePercents, partEdits = [], splitGroupId = null, now, ...context
} = {}) {
  const previous = clone(draft);
  const allocations = Array.isArray(previous?.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const index = allocations.findIndex(allocation => String(allocation.allocationId) === String(allocationId || ''));
  if (index < 0) throw splitError('Allocation não encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND');
  const split = Array.isArray(relativePercents)
    ? buildManualScheduleAllocationParts(allocations[index], relativePercents, { splitGroupId })
    : buildManualScheduleAllocationSplit(allocations[index], firstPercent, { splitGroupId });
  const editedParts = split.parts.map((part, partIndex) => applyAllocationConfigurationEdit(part, partEdits[partIndex], context));
  const nextAllocations = [...allocations];
  nextAllocations.splice(index, 1, ...editedParts);
  return {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined ? new Date().toISOString() : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: {
      type: 'SPLIT_ALLOCATION',
      allocationId: String(allocationId),
      splitGroupId: split.splitGroupId,
      relativePercents: editedParts.map(part => part.splitRatioPercent)
    }
  };
}

function machineById(machines = [], machineId) {
  return (Array.isArray(machines) ? machines : []).find(machine => {
    return [machine?.machineId, machine?.machineName, machine?.id, machine?.name]
      .map(value => String(value || ''))
      .includes(String(machineId || ''));
  }) || null;
}

function machineLocationId(machine = {}) {
  const nestedLocation =
    machine?.location
    && typeof machine.location
      === 'object'
      ? machine.location
      : {};

  return String(
    machine?.locationId
    ?? machine?.location_id
    ?? machine?.localId
    ?? machine?.local_id
    ?? machine?.branchId
    ?? machine?.branch_id
    ?? machine?.plantId
    ?? machine?.plant_id
    ?? machine?.siteId
    ?? machine?.site_id
    ?? (
      typeof machine?.location
        === 'object'
        ? undefined
        : machine?.location
    )
    ?? nestedLocation?.locationId
    ?? nestedLocation?.location_id
    ?? nestedLocation?.id
    ?? ''
  ).trim();
}

function productivityDailyCapacity(row, dailyMinutes = DEFAULT_DAILY_MINUTES) {
  const outputQty = toNumber(row?.output_qty ?? row?.outputQty);
  const safeDailyMinutes = Math.max(toNumber(dailyMinutes, DEFAULT_DAILY_MINUTES), 1);
  const dailySeconds = safeDailyMinutes * 60;
  const sourceTimeSeconds = toNumber(row?.time_seconds ?? (toNumber(row?.time_minutes ?? row?.timeMinutes) * 60));
  const usesCycleTime = sourceTimeSeconds > 0 && sourceTimeSeconds < dailySeconds;
  const capacityPerDay = outputQty > 0
    ? usesCycleTime
      ? outputQty * (dailySeconds / sourceTimeSeconds)
      : outputQty
    : 0;
  return {
    capacityPerDay,
    secondsPerUnit: outputQty > 0 && capacityPerDay > 0 ? dailySeconds / capacityPerDay : 0,
    sourceTimeSeconds: usesCycleTime ? sourceTimeSeconds : dailySeconds,
    sourceOutputQty: outputQty
  };
}

export function calculateProductivityDailyCapacity(row, dailyMinutes = DEFAULT_DAILY_MINUTES) {
  return productivityDailyCapacity(row, dailyMinutes);
}

function findProductivity(allocation, targetMachineId, { machines = [], matrixRows = [] } = {}) {
  const machine = machineById(machines, targetMachineId) || {
    machineId: String(targetMachineId || ''),
    machineName: String(targetMachineId || '')
  };
  const peopleCount = toNumber(allocation.peopleCount);
  if (!(peopleCount >= 0)) return null;
  const allocationUnit = normalizeUnit(allocation.unit ?? allocation.plannedUnit);
  const productivityRows = resolveMaterialProductivityLines({
    material: allocation,
    reference: allocation,
    productivityMatrix: matrixRows,
    unit: allocationUnit
  }).filter(row => {
    const rowUnit = normalizeUnit(row.output_unit ?? row.outputUnit);
    return Boolean(rowUnit && allocationUnit && rowUnit === allocationUnit);
  });
  const matrixMatch = resolveProductivityConfiguration({
    productivityRows,
    machine,
    peopleCount
  });
  return matrixMatch || null;
}

function recalculateWithProductivity(allocation, targetMachineId, context = {}) {
  const matrix = findProductivity(allocation, targetMachineId, context);
  if (!matrix) {
    const error = new Error(NO_PRODUCTIVITY_MESSAGE);
    error.code = 'PRODUCTIVITY_NOT_FOUND';
    throw error;
  }
    const machine =
    machineById(
      context.machines,
      targetMachineId
    )
    || {};

  const locationId =
    machineLocationId(machine);

  const capacity =
    productivityDailyCapacity(
      matrix,
      context.dailyMinutes
    );
  if (!(capacity.capacityPerDay > 0) || !(capacity.secondsPerUnit > 0)) {
    const error = new Error(NO_PRODUCTIVITY_MESSAGE);
    error.code = 'PRODUCTIVITY_NOT_FOUND';
    throw error;
  }
    const quantity = toNumber(allocation.quantity);
  const durationMinutes = Math.ceil(
    quantity * capacity.secondsPerUnit / 60
  );

  const date = normalizeDateOnly(
    allocation.date || allocation.startDate || ''
  );

  const startTime = String(
    allocation.startTime || '07:00'
  ).slice(0, 5);

  const start = clockMinutes(startTime);

  const hasValidPlacement =
    isValidDateOnly(date)
    && start !== null;

  const end = hasValidPlacement
    ? start + Math.max(durationMinutes, 1)
    : null;

  return {
    ...allocation,

    ...(hasValidPlacement ? {
      date,
      startTime,
      endDate: addDays(
        date,
        Math.floor(end / 1440)
      ),
      endTime: minutesClock(end)
    } : {}),

    machineId: String(targetMachineId || ''),
        machineName: String(
      machine.machineName
      || matrix.machine_name
      || targetMachineId
      || ''
    ),

    ...(locationId ? {
      locationId,
      sourceLocation:
        locationId,
      targetLocation:
        locationId
    } : {}),

    peopleCount: Number(
      matrix.people_count ?? matrix.peopleCount
    ),

    unit: String(
      matrix.output_unit
      || matrix.outputUnit
      || allocation.unit
      || ''
    ),

    durationMinutes,

    capacityPercent: Number(
      (
        (quantity / capacity.capacityPerDay)
        * 100
      ).toFixed(2)
    ),

    maxDailyCapacity: Number(
      capacity.capacityPerDay.toFixed(6)
    ),

    capacityMaxPerDay: Number(
      capacity.capacityPerDay.toFixed(6)
    ),

    productivityLineId:
      matrix.id
      ?? matrix.productivity_line_id
      ?? matrix.productivityLineId
      ?? allocation.productivityLineId
      ?? null,

    productivity: {
      machineName:
        matrix.machine_name
        || matrix.machineName
        || '',

      peopleCount: Number(
        matrix.people_count
        ?? matrix.peopleCount
      ),

      outputQty: toNumber(
        matrix.output_qty
        ?? matrix.outputQty
      ),

      outputUnit:
        matrix.output_unit
        || matrix.outputUnit
        || allocation.unit
        || '',

      timeSeconds: toNumber(
        matrix.time_seconds
        ?? (
          toNumber(
            matrix.time_minutes
            ?? matrix.timeMinutes
          ) * 60
        )
      )
    }
  };
}

function applyAllocationConfigurationEdit(allocation, edit = null, context = {}) {
  if (!edit) return allocation;
  const machineId = String(edit.machineId ?? allocation.machineId ?? '');
  const peopleCount = Number(edit.peopleCount ?? allocation.peopleCount);
  const date = normalizeDateOnly(edit.date ?? allocation.date);
  const startTime = String(edit.startTime ?? allocation.startTime ?? '').slice(0, 5);
  const requestedQuantity = edit.quantity === undefined || edit.quantity === null || edit.quantity === ''
    ? toNumber(allocation.quantity)
    : toNumber(edit.quantity);
  if (!machineId) throw splitError('Cada parte precisa de uma máquina válida.', 'ALLOCATION_MACHINE_REQUIRED');
  if (!Number.isInteger(peopleCount) || peopleCount < 1) throw splitError('Cada parte precisa de uma quantidade inteira de pessoas.', 'ALLOCATION_PEOPLE_INVALID');
  if (!(requestedQuantity > 0)) throw splitError('A quantidade da producao precisa ser maior que zero.', 'ALLOCATION_QUANTITY_INVALID');
  if (!isValidDateOnly(date)) throw splitError('Cada parte precisa de uma data válida.', 'ALLOCATION_DATE_INVALID');
  const start = clockMinutes(startTime);
  if (start === null) throw splitError('Cada parte precisa de um horário inicial válido.', 'ALLOCATION_START_INVALID');
  const resourceChanged = machineId !== String(allocation.machineId) || peopleCount !== Number(allocation.peopleCount);
  const quantityChanged = Math.abs(requestedQuantity - toNumber(allocation.quantity)) > EPSILON;
  const positionChanged = date !== String(allocation.date) || startTime !== String(allocation.startTime);
  const baseAllocation = quantityChanged
    ? {
        ...allocation,
        quantity: Number(requestedQuantity.toFixed(6)),
        components: splitComponentsByQuantity(normalizeComponents(allocation), requestedQuantity)
      }
    : allocation;
  if (!resourceChanged && !quantityChanged && !positionChanged) return { ...baseAllocation, source: 'manual', pinned: true };
  const configured = resourceChanged || quantityChanged
    ? recalculateWithProductivity({ ...baseAllocation, peopleCount }, machineId, context)
    : { ...baseAllocation, peopleCount };
  const durationMinutes = Number(configured.durationMinutes);
  const end = start + Math.ceil(durationMinutes);
  if (!(durationMinutes > 0)) {
    throw splitError('A posição escolhida ultrapassa o dia produtivo aceito.', 'ALLOCATION_POSITION_AMBIGUOUS');
  }
  return {
    ...configured,
    date,
    endDate: addDays(date, Math.floor(end / 1440)),
    startTime,
    endTime: minutesClock(end),
    source: 'manual',
    pinned: true
  };
}

export function editDraftAllocation(draft, {
  allocationId, machineId, peopleCount, quantity, date, startTime, now, capacityDecision = 'cancel', ...context
} = {}) {
  const previous = clone(draft);
  const allocations = Array.isArray(previous?.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const index = allocations.findIndex(allocation => String(allocation.allocationId) === String(allocationId || ''));
  if (index < 0) throw splitError('Allocation não encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND');
  const edited = applyAllocationConfigurationEdit(allocations[index], {
    machineId, peopleCount, quantity, date, startTime
  }, context);
  if (toNumber(edited.capacityPercent) > 100 + EPSILON && capacityDecision === 'cancel') {
    const error = splitError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED');
    error.proposedAllocation = edited;
    throw error;
  }
  const normalizedAllocationId = String(allocationId || '');
  const others = allocations.filter(allocation => String(allocation.allocationId) !== normalizedAllocationId);
  let nextAllocations;
  if (toNumber(edited.capacityPercent) > 100 + EPSILON && capacityDecision === 'split') {
    const availableQty = toNumber(edited.maxDailyCapacity ?? edited.capacityMaxPerDay);
    if (!(availableQty > 0) || availableQty >= toNumber(edited.quantity)) {
      throw splitError('Nao ha capacidade normal disponivel para dividir o excedente.', 'CAPACITY_SPLIT_INVALID');
    }
    const filled = recalculateWithProductivity({
      ...edited,
      quantity: Number(availableQty.toFixed(6)),
      components: splitComponentsByQuantity(normalizeComponents(edited), availableQty)
    }, edited.machineId, context);
    const remainderQty = Number((toNumber(edited.quantity) - availableQty).toFixed(6));
    const remainder = {
      ...edited,
      allocationId: createId(`${edited.allocationId}:excedente`),
      quantity: remainderQty,
      components: splitComponentsByQuantity(normalizeComponents(edited), remainderQty),
      sourceAllocationIds: allocationTraceIds(edited),
      sourceParentOperationIds: allocationParentIds(edited)
    };
    const placement = findNextPlacement(remainder, [...others, filled], context, {
      startDate: edited.date,
      preferredMachineId: edited.machineId
    });
    if (!placement) throw splitError('Nao foi encontrado proximo periodo valido para o excedente.', 'NO_NEXT_SLOT');
    nextAllocations = allocations.map(allocation => (
      String(allocation.allocationId) === normalizedAllocationId ? filled : allocation
    ));
    if (placement.mergeIntoAllocationId) {
      nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
    }
    nextAllocations.push(placement.allocation);
  } else {
    const editedAllocation = {
      ...edited,
      isCapacityOverride: toNumber(edited.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
    };
    nextAllocations = allocations.map(allocation => (
      String(allocation.allocationId) === normalizedAllocationId ? editedAllocation : allocation
    ));
  }
  return {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined ? new Date().toISOString() : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: { type: 'EDIT_ALLOCATION', allocationId: String(allocationId) }
  };
}

function sameMaterialCompatible(left = {}, right = {}) {
  return normalizeText(left.materialId) === normalizeText(right.materialId)
    && normalizeUnit(left.unit) === normalizeUnit(right.unit)
    && Number(left.peopleCount || 0) === Number(right.peopleCount || 0);
}

function mergeAllocations(target, moved, context = {}) {
  const quantity = Number((toNumber(target.quantity) + toNumber(moved.quantity)).toFixed(6));
  const merged = {
    ...target,
    allocationId: target.allocationId,
    quantity,
    date: moved.date,
    machineId: moved.machineId,
    machineName: moved.machineName || target.machineName,
    source: 'manual',
    pinned: true,
    sourceAllocationIds: [...new Set([...allocationTraceIds(target), ...allocationTraceIds(moved)])],
    sourceParentOperationIds: [...new Set([...allocationParentIds(target), ...allocationParentIds(moved)])],
    components: mergeComponents(normalizeComponents(target), normalizeComponents(moved))
  };
  return recalculateWithProductivity(merged, merged.machineId, context);
}

function makeMoveError(message, code, snapshot, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.snapshot = snapshot;
  Object.assign(error, extra);
  return error;
}

function withRollbackSnapshot(callback, snapshot) {
  try {
    return callback();
  } catch (error) {
    if (error?.snapshot) throw error;
    throw makeMoveError(error?.message || 'Movimento invalido.', error?.code || 'DRAFT_INVALID', snapshot);
  }
}

function isWorkingDate(date, days = []) {
  const day = (Array.isArray(days) ? days : []).find(item => String(item?.date || item).slice(0, 10) === date);
  if (day && day.isWorkingDay === false) return false;
  return !isWeekend(date);
}

function cellAllocations(allocations, date, machineId, excludeIds = []) {
  const excludes = new Set(excludeIds.map(String));
  return allocations.filter(allocation => (
    !excludes.has(String(allocation.allocationId))
    && String(allocation.date || '') === String(date)
    && String(allocation.machineId || '') === String(machineId)
  ));
}

function machineDayCapacityUsed(
  allocations = [],
  date,
  machineId,
  excludeIds = []
) {
  return cellAllocations(
    allocations,
    date,
    machineId,
    excludeIds
  ).reduce(
    (sum, allocation) =>
      sum
      + Math.max(
        toNumber(allocation.capacityPercent),
        0
      ),
    0
  );
}

function placeAllocationAfterMachineDayUsage(
  allocation,
  allocations = [],
  {
    date = allocation?.date,
    machineId = allocation?.machineId,
    excludeIds = [],
    dayStartTime = '07:00',
    dailyMinutes = DEFAULT_DAILY_MINUTES
  } = {}
) {
  const occupants = cellAllocations(
    allocations,
    date,
    machineId,
    excludeIds
  ).sort((left, right) => (
    (clockMinutes(left.startTime) ?? 0)
      - (clockMinutes(right.startTime) ?? 0)
    || toNumber(left.sequence)
      - toNumber(right.sequence)
    || String(left.allocationId)
      .localeCompare(String(right.allocationId))
  ));

  const sequenced = applySequentialTimes(
    [
      ...occupants,
      {
        ...allocation,
        date: normalizeDateOnly(date),
        machineId: String(
          machineId
          || allocation?.machineId
          || ''
        )
      }
    ],
    {
      startTime: dayStartTime,
      dailyMinutes
    }
  );

  return sequenced.at(-1) || allocation;
}

function findNextPlacement(allocation, allocations, context = {}, { startDate, preferredDate, preferredMachineId } = {}) {
  const machines = Array.isArray(context.machines) ? context.machines : [];
  const machineIds = [
    preferredMachineId,
    ...machines.map(machine => machine.machineId || machine.machineName || machine.id || machine.name)
  ].map(value => String(value || '')).filter(Boolean);
  const uniqueMachineIds = [...new Set(machineIds)];
  const candidateDates = [
    ...(isValidDateOnly(preferredDate) ? [preferredDate] : []),
    ...Array.from({ length: 365 }, (_, index) => addDays(startDate || allocation.date, index + 1))
  ];
  for (const date of [...new Set(candidateDates)]) {
    if (!isWorkingDate(date, context.days)) continue;
    for (const machineId of uniqueMachineIds) {
      let moved;
      try {
        moved = recalculateWithProductivity({
          ...allocation,
          date,
          machineId,
          source: 'manual',
          pinned: true
        }, machineId, context);
      } catch {
        continue;
      }
      const occupants = cellAllocations(allocations, date, machineId, [allocation.allocationId]);
      if (!occupants.length && toNumber(moved.capacityPercent) <= 100 + EPSILON) return { allocation: moved };
      const compatible = occupants.find(item => sameMaterialCompatible(item, moved));
      if (compatible) {
        const merged = mergeAllocations(compatible, moved, context);
        if (toNumber(merged.capacityPercent) <= 100 + EPSILON) {
          return { allocation: merged, mergeIntoAllocationId: compatible.allocationId };
        }
      }
    }
  }
  return null;
}

function pushReplacementChain(allocation, allocations, context = {}, {
  startDate,
  preferredMachineId,
  capacityDecision = 'cancel',
  depth = 0
} = {}) {
  if (depth > 365) return null;
  const machineId = String(preferredMachineId || allocation.machineId || '');
  if (!machineId) return null;
  for (let index = 1; index <= 365; index += 1) {
    const date = addDays(startDate || allocation.date, index);
    if (!isWorkingDate(date, context.days)) continue;
    let moved;
    try {
      moved = recalculateWithProductivity({
        ...allocation,
        date,
        machineId,
        source: 'manual',
        pinned: true
      }, machineId, context);
    } catch {
      continue;
    }
    if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision !== 'override') continue;
    const occupants = cellAllocations(allocations, date, machineId, [moved.allocationId])
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0) || String(left.allocationId).localeCompare(String(right.allocationId)));
    if (!occupants.length) {
      return {
        allocations: [...allocations, {
          ...moved,
          isCapacityOverride: Boolean(moved.isCapacityOverride || (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'))
        }],
        allocation: moved
      };
    }
    const occupant = occupants[0];
    const nextAllocations = allocations.filter(item => String(item.allocationId) !== String(occupant.allocationId));
    const cascade = pushReplacementChain(occupant, [...nextAllocations, moved], context, {
      startDate: date,
      preferredMachineId: machineId,
      capacityDecision,
      depth: depth + 1
    });
    if (cascade) return cascade;
  }
  return null;
}

export function consolidateManualScheduleAllocations(allocations = []) {
  const grouped = new Map();
  const result = [];

  allocations.forEach((allocation, index) => {
    const normalized = normalizeAllocation(allocation, index);
    const key = consolidationKey(normalized);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, normalized);
      result.push(normalized);
      return;
    }

    existing.quantity = Number((toNumber(existing.quantity) + toNumber(normalized.quantity)).toFixed(6));
    existing.durationMinutes = Number((toNumber(existing.durationMinutes) + toNumber(normalized.durationMinutes)).toFixed(6));
    existing.capacityPercent = existing.capacityPercent === null && normalized.capacityPercent === null
      ? null
      : Number((toNumber(existing.capacityPercent) + toNumber(normalized.capacityPercent)).toFixed(6));
    existing.peopleCount = Math.max(toNumber(existing.peopleCount), toNumber(normalized.peopleCount));
    existing.source = existing.source === 'manual' || normalized.source === 'manual' ? 'manual' : 'automatic';
    existing.pinned = Boolean(existing.pinned || normalized.pinned);
    existing.sourceAllocationIds = [...new Set([
      ...allocationTraceIds(existing),
      ...allocationTraceIds(normalized)
    ])];
    existing.sourceParentOperationIds = [...new Set([
      ...allocationParentIds(existing),
      ...allocationParentIds(normalized)
    ])];
    existing.components = mergeComponents(normalizeComponents(existing), normalizeComponents(normalized));
  });

  return result.map((allocation, index) => ({
    ...allocation,
    sequence: index + 1
  }));
}

export function validateManualScheduleDraft(
  draft,
  {
    machines = [],
    previousAllocations = null
  } = {}
) {
  const errors = [];

  const allocations =
    Array.isArray(draft?.allocations)
      ? draft.allocations
      : [];

    const transports =
    Array.isArray(draft?.transports)
      ? draft.transports
      : [];

  const plannedReceipts =
    Array.isArray(draft?.plannedReceipts)
      ? draft.plannedReceipts
      : [];

  const ids =
    new Set();

  const transportIds =
    new Set();

  const receiptIds =
    new Set();

  const splitPartIds =
    new Set();

  const machineIds =
    normalizedMachineIds(
      machines
    );

  const totals =
    parentTotals(
      allocations
    );

  const previousTotals =
    previousAllocations
      ? parentTotals(
          previousAllocations
        )
      : null;

  const previousTraceIds =
    previousAllocations
      ? traceIdSet(
          previousAllocations
        )
      : null;

  const nextTraceIds =
    traceIdSet(
      allocations
    );

  allocations.forEach(
    (allocation, index) => {
      const prefix =
        `allocation[${index}]`;

      const allocationId =
        String(
          allocation?.allocationId
          || ''
        );

      if (!allocationId) {
        errors.push(
          `${prefix}: allocationId ausente.`
        );
      }

      if (
        ids.has(
          allocationId
        )
      ) {
        errors.push(
          `${prefix}: allocationId duplicado.`
        );
      }

      ids.add(
        allocationId
      );

      if (
        !String(
          allocation
            ?.parentOperationId
          || ''
        )
      ) {
        errors.push(
          `${prefix}: parentOperationId ausente.`
        );
      }

      if (
        !(
          toNumber(
            allocation?.quantity
          ) > 0
        )
      ) {
        errors.push(
          `${prefix}: quantity deve ser maior que zero.`
        );
      }

      if (
        !(
          toNumber(
            allocation?.durationMinutes
          ) > 0
        )
      ) {
        errors.push(
          `${prefix}: durationMinutes deve ser maior que zero.`
        );
      }

      if (
        !isValidDateOnly(
          allocation?.date
        )
      ) {
        errors.push(
          `${prefix}: data invalida.`
        );
      }

      if (
        !String(
          allocation?.machineId
          || ''
        )
        || (
          machineIds.size
          && !machineIds.has(
            String(
              allocation.machineId
            )
          )
        )
      ) {
        errors.push(
          `${prefix}: machineId invalido.`
        );
      }

      Object.values(
        allocation || {}
      ).forEach(value => {
        if (
          typeof value
            === 'number'
          && !Number.isFinite(
            value
          )
        ) {
          errors.push(
            `${prefix}: número não finito encontrado.`
          );
        }
      });

      const componentTotal =
        normalizeComponents(
          allocation
        ).reduce(
          (sum, component) =>
            sum
            + toNumber(
              component.quantity
            ),
          0
        );

      if (
        Math.abs(
          componentTotal
          - toNumber(
              allocation?.quantity
            )
        )
        > (
          10
          ** -MANUAL_SCHEDULE_QUANTITY_PRECISION
        )
      ) {
        errors.push(
          `${prefix}: componentes não reconciliam com quantity.`
        );
      }

      if (
        allocation
          ?.splitParentAllocationId
      ) {
        const splitPartId =
          String(
            allocation.splitPartId
            || ''
          );

        if (
          !String(
            allocation
              .splitRootAllocationId
            || ''
          )
        ) {
          errors.push(
            `${prefix}: splitRootAllocationId ausente.`
          );
        }

        if (
          !String(
            allocation
              .splitGroupId
            || ''
          )
        ) {
          errors.push(
            `${prefix}: splitGroupId ausente.`
          );
        }

        if (
          !splitPartId
          || splitPartId
            !== allocationId
        ) {
          errors.push(
            `${prefix}: splitPartId inválido.`
          );
        }

        if (
          splitPartIds.has(
            splitPartId
          )
        ) {
          errors.push(
            `${prefix}: splitPartId duplicado.`
          );
        }

        splitPartIds.add(
          splitPartId
        );

        if (
          !(
            Number(
              allocation.splitDepth
            ) >= 1
          )
        ) {
          errors.push(
            `${prefix}: splitDepth inválido.`
          );
        }

        if (
          !(
            Number(
              allocation.splitOrder
            ) >= 1
          )
        ) {
          errors.push(
            `${prefix}: splitOrder inválido.`
          );
        }

        if (
          !(
            Number(
              allocation
                .splitRatioPercent
            ) > 0
          )
          || Number(
            allocation
              .splitRatioPercent
          ) > 100
        ) {
          errors.push(
            `${prefix}: splitRatioPercent inválido.`
          );
        }

        if (
          !(
            Number(
              allocation
                .splitAccumulatedRatioPercent
            ) > 0
          )
          || Number(
            allocation
              .splitAccumulatedRatioPercent
          ) > 100
        ) {
          errors.push(
            `${prefix}: splitAccumulatedRatioPercent inválido.`
          );
        }
      }
    }
  );

  transports.forEach(
    (transport, index) => {
      const normalized =
        normalizeManualScheduleTransport(
          transport,
          index
        );

      const prefix =
        `transport[${index}]`;

      const transportId =
        String(
          normalized.transportId
          || ''
        );

      if (!transportId) {
        errors.push(
          `${prefix}: transportId ausente.`
        );
      }

      if (
        transportIds.has(
          transportId
        )
      ) {
        errors.push(
          `${prefix}: transportId duplicado.`
        );
      }

      transportIds.add(
        transportId
      );

      if (
        !normalized.materialId
      ) {
        errors.push(
          `${prefix}: materialId ausente.`
        );
      }

      if (
        !(normalized.quantity > 0)
      ) {
        errors.push(
          `${prefix}: quantity deve ser maior que zero.`
        );
      }

      if (
        !normalized.sourceLocation
      ) {
        errors.push(
          `${prefix}: sourceLocation ausente.`
        );
      }

      if (
        !normalized.targetLocation
      ) {
        errors.push(
          `${prefix}: targetLocation ausente.`
        );
      }

      if (
        normalized.sourceLocation
        && normalized.targetLocation
        && normalized.sourceLocation
          === normalized.targetLocation
      ) {
        errors.push(
          `${prefix}: origem e destino devem ser diferentes.`
        );
      }

      if (
        !isValidDateOnly(
          normalized.startDate
        )
      ) {
        errors.push(
          `${prefix}: startDate invalida.`
        );
      }

      if (
        !isValidDateOnly(
          normalized.endDate
        )
      ) {
        errors.push(
          `${prefix}: endDate invalida.`
        );
      }

      if (
        isValidDateOnly(
          normalized.startDate
        )
        && isValidDateOnly(
          normalized.endDate
        )
        && normalized.endDate
          < normalized.startDate
      ) {
        errors.push(
          `${prefix}: endDate anterior a startDate.`
        );
      }

      if (
        !(
          normalized.durationMinutes
          > 0
        )
      ) {
        errors.push(
          `${prefix}: durationMinutes deve ser maior que zero.`
        );
      }

      if (
                ![
          'start',
          'end',
          'day-start'
        ].includes(
          normalized.availabilityMode
        )
      ) {
        errors.push(
          `${prefix}: availabilityMode invalido.`
        );
      }
    }
  );

    plannedReceipts.forEach(
    (receipt, index) => {
      const normalized =
        normalizeManualSchedulePlannedReceipt(
          receipt,
          index
        );

      const prefix =
        `plannedReceipt[${index}]`;

      const receiptId =
        String(
          normalized.receiptId
          || ''
        );

      if (!receiptId) {
        errors.push(
          `${prefix}: receiptId ausente.`
        );
      }

      if (receiptIds.has(receiptId)) {
        errors.push(
          `${prefix}: receiptId duplicado.`
        );
      }

      receiptIds.add(receiptId);

      if (!normalized.materialId) {
        errors.push(
          `${prefix}: materialId ausente.`
        );
      }

      if (!normalized.locationId) {
        errors.push(
          `${prefix}: locationId ausente.`
        );
      }

      if (!(normalized.quantity > 0)) {
        errors.push(
          `${prefix}: quantity deve ser maior que zero.`
        );
      }

      if (!isValidDateOnly(normalized.arrivalDate)) {
        errors.push(
          `${prefix}: arrivalDate invalida.`
        );
      }

      if (!isValidDateOnly(normalized.availableDate)) {
        errors.push(
          `${prefix}: availableDate invalida.`
        );
      }

      if (
        isValidDateOnly(normalized.arrivalDate)
        && isValidDateOnly(normalized.availableDate)
        && normalized.availableDate
          < addDays(normalized.arrivalDate, 1)
      ) {
        errors.push(
          `${prefix}: availableDate deve ser no mínimo D+1 da chegada.`
        );
      }
    }
  );

  if (
    previousTotals
  ) {
    previousTotals.forEach(
      (
        total,
        parentOperationId
      ) => {
        const next =
          toNumber(
            totals.get(
              parentOperationId
            )
          );

        if (
          Math.abs(
            next - total
          ) > EPSILON
        ) {
          errors.push(
            `${parentOperationId}: quantidade total alterada.`
          );
        }
      }
    );
  }

  if (
    previousTraceIds
  ) {
    previousTraceIds.forEach(
      id => {
        if (
          !nextTraceIds.has(id)
        ) {
          errors.push(
            `${id}: allocation original desapareceu.`
          );
        }
      }
    );
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

function normalizeManualScheduleOperationId(value) {
  return String(value ?? '')
    .trim()
    .replace(/:day-\d+$/i, '');
}

function manualScheduleOperationMaterialId(value = {}) {
  return String(
    value?.materialId
    ?? value?.material_id
    ?? value?.id
    ?? ''
  ).trim();
}

export function manualScheduleAllocationOperationIds(
  allocation = {}
) {
  return [...new Set([
    allocation?.operationId,
    allocation?.parentOperationId,
    allocation?.calendarParentOperationId,
    allocation?.splitParentOperationId,

    ...(Array.isArray(
      allocation?.sourceParentOperationIds
    )
      ? allocation.sourceParentOperationIds
      : []),

    ...(Array.isArray(allocation?.components)
      ? allocation.components.map(
          component =>
            component?.parentOperationId
        )
      : [])
  ]
    .map(normalizeManualScheduleOperationId)
    .filter(Boolean))];
}

export function buildManualScheduleSuccessorOperationIds(
  operations = [],
  sourceOperationIds = []
) {
  const successorsByProducer = new Map();

  (Array.isArray(operations)
    ? operations
    : []
  ).forEach(operation => {
    const requirements =
      Array.isArray(
        operation?.dependencyRequirements
      )
        ? operation.dependencyRequirements
        : [];

    if (!requirements.length) return;

    const breakdown =
      Array.isArray(
        operation?.productionBreakdown
      )
      && operation.productionBreakdown.length

        ? operation.productionBreakdown
        : [operation];

    breakdown.forEach(part => {
      const consumerOperationId =
        normalizeManualScheduleOperationId(
          part?.operationId
          || operation?.parentOperationId
          || operation?.calendarParentOperationId
          || operation?.operationId
          || operation?.id
        );

      if (!consumerOperationId) return;

      const productionIndex =
        Number(
          part?.productionIndex
          ?? operation?.productionIndex
          ?? 0
        );

      requirements.forEach(requirement => {
        const materialId =
          manualScheduleOperationMaterialId(
            requirement
          );

        if (!materialId) return;

        /*
         * Mesma identidade usada hoje pelos cards
         * manuais:
         *
         * 0:BOBINA
         * 0:LONG
         * 0:TRANS
         * 0:MALHA
         */
        const producerOperationId =
          normalizeManualScheduleOperationId(
            `${
              Number.isFinite(productionIndex)
                ? productionIndex
                : 0
            }:${materialId}`
          );

        if (!producerOperationId) return;

        if (
          !successorsByProducer.has(
            producerOperationId
          )
        ) {
          successorsByProducer.set(
            producerOperationId,
            new Set()
          );
        }

        successorsByProducer
          .get(producerOperationId)
          .add(consumerOperationId);
      });
    });
  });

  const pending =
    [...new Set(
      (
        Array.isArray(sourceOperationIds)
          ? sourceOperationIds
          : [sourceOperationIds]
      )
        .map(
          normalizeManualScheduleOperationId
        )
        .filter(Boolean)
    )];

  const sourceIds =
    new Set(pending);

  const descendants =
    new Set();

  while (pending.length) {
    const producerOperationId =
      pending.shift();

    const directSuccessors =
      successorsByProducer.get(
        producerOperationId
      )
      || [];

    directSuccessors.forEach(
      consumerOperationId => {
        if (
          sourceIds.has(consumerOperationId)
          || descendants.has(
            consumerOperationId
          )
        ) {
          return;
        }

        descendants.add(
          consumerOperationId
        );

        pending.push(
          consumerOperationId
        );
      }
    );
  }

  return [...descendants];
}

export function removeManualScheduleAllocations(
  draft,
  {
    allocationIds = [],
    machines = [],
    now
  } = {}
) {
  const previous =
    clone(draft);

  const sourceAllocations =
    Array.isArray(previous?.allocations)
      ? previous.allocations.map(
          normalizeAllocation
        )
      : [];

  const ids =
    [...new Set(
      (
        Array.isArray(allocationIds)
          ? allocationIds
          : [allocationIds]
      )
        .map(value =>
          String(value ?? '').trim()
        )
        .filter(Boolean)
    )];

  if (!ids.length) {
    throw makeMoveError(
      'Nenhuma allocation foi informada para desalocação.',
      'ALLOCATION_REQUIRED',
      previous
    );
  }

  const existingIds =
    new Set(
      sourceAllocations.map(
        allocation =>
          String(allocation.allocationId)
      )
    );

  const missingIds =
    ids.filter(
      id => !existingIds.has(id)
    );

  if (missingIds.length) {
    throw makeMoveError(
      'Allocation não encontrada no rascunho manual.',
      'ALLOCATION_NOT_FOUND',
      previous,
      {
        details: {
          allocationIds: missingIds
        }
      }
    );
  }

  const removeIds =
    new Set(ids);

  const nextAllocations =
    sourceAllocations
      .filter(
        allocation =>
          !removeIds.has(
            String(
              allocation.allocationId
            )
          )
      )
      .map(normalizeAllocation);

  const next = {
    ...previous,

    allocations:
      nextAllocations,

    updatedAt:
      now === undefined
        ? new Date().toISOString()
        : (
            now instanceof Date
              ? now.toISOString()
              : String(now)
          ),

    dirty: true,

    lastManualAction: {
      type:
        'REMOVE_MANUAL_ALLOCATIONS',

      allocationIds:
        ids
    }
  };

  /*
   * IMPORTANTE:
   *
   * NÃO passamos previousAllocations.
   *
   * A preservação de quantidade continua
   * existindo para MOVE, EDIT etc.
   *
   * Aqui a redução de quantidade programada
   * é proposital.
   */
  const validation =
    validateManualScheduleDraft(
      next,
      {
        machines
      }
    );

  if (!validation.valid) {
    throw makeMoveError(
      'Desalocação inválida. O rascunho manual foi mantido sem alterações.',
      'DRAFT_INVALID',
      previous,
      {
        details:
          validation.errors
      }
    );
  }

  return next;
}

function manualScheduleBlockingIssues(
  result = {}
) {
  if (
    Array.isArray(
      result?.blockingIssues
    )
  ) {
    return result.blockingIssues;
  }

  if (
    Array.isArray(
      result?.validation?.errors
    )
  ) {
    return result.validation.errors
      .filter(
        issue =>
          issue?.blocking !== false
      );
  }

  return [];
}

function manualScheduleUnallocationAffectedAllocations(
  candidateDraft,
  blockingIssues,
  successorOperationIds
) {
  const successorIds =
    new Set(
      (
        Array.isArray(
          successorOperationIds
        )
          ? successorOperationIds
          : []
      )
        .map(
          normalizeManualScheduleOperationId
        )
        .filter(Boolean)
    );

  const allocationIds =
    new Set(
      (
        Array.isArray(blockingIssues)
          ? blockingIssues
          : []
      )
        .flatMap(
          issue =>
            Array.isArray(
              issue?.allocationIds
            )
              ? issue.allocationIds
              : []
        )
        .map(value =>
          String(value ?? '').trim()
        )
        .filter(Boolean)
    );

  const parentOperationIds =
    new Set(
      (
        Array.isArray(blockingIssues)
          ? blockingIssues
          : []
      )
        .flatMap(
          issue =>
            Array.isArray(
              issue?.parentOperationIds
            )
              ? issue.parentOperationIds
              : []
        )
        .map(
          normalizeManualScheduleOperationId
        )
        .filter(Boolean)
    );

  return (
    Array.isArray(
      candidateDraft?.allocations
    )
      ? candidateDraft.allocations
      : []
  )
    .filter(allocation => {
      const operationIds =
        manualScheduleAllocationOperationIds(
          allocation
        );

      const isSuccessor =
        operationIds.some(
          operationId =>
            successorIds.has(
              operationId
            )
        );

      if (!isSuccessor) {
        return false;
      }

      /*
       * O diagnóstico já informou quais
       * allocations foram afetadas.
       *
       * Essa é a informação mais precisa,
       * então tem prioridade.
       */
      if (allocationIds.size) {
        return allocationIds.has(
          String(
            allocation?.allocationId
            || ''
          )
        );
      }

      /*
       * Alguns diagnósticos antigos podem
       * carregar apenas parentOperationIds.
       */
      if (parentOperationIds.size) {
        return operationIds.some(
          operationId =>
            parentOperationIds.has(
              operationId
            )
        );
      }

      return false;
    })

    /*
     * Se existe saldo para manter apenas
     * parte das allocations sucessoras,
     * preservamos primeiro as mais antigas
     * e retiramos a mais tardia.
     */
    .sort((left, right) => {
      const leftStart =
        `${
          String(
            left?.date || ''
          ).slice(0, 10)
        }T${
          String(
            left?.startTime
            || '00:00'
          ).slice(0, 5)
        }`;

      const rightStart =
        `${
          String(
            right?.date || ''
          ).slice(0, 10)
        }T${
          String(
            right?.startTime
            || '00:00'
          ).slice(0, 5)
        }`;

      return (
        rightStart.localeCompare(
          leftStart
        )

        || toNumber(
          right?.sequence
        )
          - toNumber(
            left?.sequence
          )

        || String(
          right?.allocationId
          || ''
        ).localeCompare(
          String(
            left?.allocationId
            || ''
          )
        )
      );
    });
}

export function buildManualScheduleUnallocationPlan(
  draft,
  {
    allocationId,
    operations = [],
    machines = [],
    validateCandidate,
    now
  } = {}
) {
  const previous =
    clone(draft);

  const sourceAllocations =
    Array.isArray(previous?.allocations)
      ? previous.allocations.map(
          normalizeAllocation
        )
      : [];

  const normalizedAllocationId =
    String(allocationId || '').trim();

  const sourceAllocation =
    sourceAllocations.find(
      allocation =>
        String(
          allocation?.allocationId
          || ''
        )
        === normalizedAllocationId
    )
    || null;

  if (!sourceAllocation) {
    throw makeMoveError(
      'Allocation não encontrada no rascunho manual.',
      'ALLOCATION_NOT_FOUND',
      previous
    );
  }

  if (
    typeof validateCandidate
    !== 'function'
  ) {
    throw makeMoveError(
      'Validador da desalocação não informado.',
      'UNALLOCATION_VALIDATOR_REQUIRED',
      previous
    );
  }

  /*
   * Uma barra pode carregar mais de uma
   * operação depois de merge/split.
   *
   * Portanto pegamos todas as identidades
   * daquela barra.
   */
  const sourceOperationIds =
    manualScheduleAllocationOperationIds(
      sourceAllocation
    );

  const successorOperationIds =
    buildManualScheduleSuccessorOperationIds(
      operations,
      sourceOperationIds
    );

  const removedIds =
    new Set([
      normalizedAllocationId
    ]);

  const cascadeIds =
    [];

  const effectiveNow =
    now === undefined
      ? new Date().toISOString()
      : (
          now instanceof Date
            ? now.toISOString()
            : String(now)
        );

  /*
   * Primeiro candidato:
   * apenas a allocation escolhida sai.
   */
  let candidateDraft =
    removeManualScheduleAllocations(
      previous,
      {
        allocationIds:
          [...removedIds],

        machines,

        now:
          effectiveNow
      }
    );

  let validationResult =
    validateCandidate(
      candidateDraft
    );

  const maxIterations =
    sourceAllocations.length + 1;

  for (
    let iteration = 0;
    iteration < maxIterations;
    iteration += 1
  ) {
    /*
     * Se já ficou válido, acabou.
     *
     * Talvez nenhuma sucessora precisasse
     * ser removida.
     */
    if (
      validationResult?.accepted === true
      || validationResult?.valid === true
    ) {
      const acceptedDraft =
        validationResult?.draft
        || candidateDraft;

      const removedAllocations =
        sourceAllocations.filter(
          allocation =>
            removedIds.has(
              String(
                allocation?.allocationId
                || ''
              )
            )
        );

      const cascadeAllocations =
        sourceAllocations.filter(
          allocation =>
            cascadeIds.includes(
              String(
                allocation?.allocationId
                || ''
              )
            )
        );

      return {
        accepted: true,

        sourceAllocation:
          clone(sourceAllocation),

        sourceOperationIds,

        successorOperationIds,

        removedAllocationIds:
          [...removedIds],

        cascadeAllocationIds:
          [...cascadeIds],

        removedAllocations:
          clone(
            removedAllocations
          ),

        cascadeAllocations:
          clone(
            cascadeAllocations
          ),

        draft:
          clone(
            acceptedDraft
          ),

        validationResult:
          clone(
            validationResult
          )
      };
    }

    const blockingIssues =
      manualScheduleBlockingIssues(
        validationResult
      );

    /*
     * Das allocations que ficaram inválidas,
     * só aceitamos remover as que realmente
     * pertencem à árvore sucessora da origem.
     *
     * Isso protege outras produções
     * independentes.
     */
    const affected =
      manualScheduleUnallocationAffectedAllocations(
        candidateDraft,
        blockingIssues,
        successorOperationIds
      )
        .filter(
          allocation =>
            !removedIds.has(
              String(
                allocation?.allocationId
                || ''
              )
            )
        );

    /*
     * A validação falhou, porém não existe
     * sucessora que possamos remover.
     *
     * Nesse caso NÃO inventamos solução.
     * O plano volta como recusado.
     */
    if (!affected.length) {
      return {
        accepted: false,

        sourceAllocation:
          clone(sourceAllocation),

        sourceOperationIds,

        successorOperationIds,

        removedAllocationIds:
          [...removedIds],

        cascadeAllocationIds:
          [...cascadeIds],

        removedAllocations:
          clone(
            sourceAllocations.filter(
              allocation =>
                removedIds.has(
                  String(
                    allocation
                      ?.allocationId
                    || ''
                  )
                )
            )
          ),

        cascadeAllocations:
          clone(
            sourceAllocations.filter(
              allocation =>
                cascadeIds.includes(
                  String(
                    allocation
                      ?.allocationId
                    || ''
                  )
                )
            )
          ),

        draft:
          clone(candidateDraft),

        blockingIssues:
          clone(blockingIssues),

        validationResult:
          clone(validationResult)
      };
    }

    /*
     * Remove UMA allocation afetada por vez,
     * começando pela mais tardia.
     *
     * Depois valida novamente.
     *
     * Isso é o que evita:
     *
     * "faltou um pouco de Bobina"
     * → apagar todas as Longitudinais.
     */
    const nextAffected =
      affected[0];

    const nextAffectedId =
      String(
        nextAffected.allocationId
      );

    removedIds.add(
      nextAffectedId
    );

    cascadeIds.push(
      nextAffectedId
    );

    /*
     * Sempre reconstruímos a partir do
     * draft ORIGINAL.
     *
     * O draft real ainda não sofreu
     * alteração nenhuma.
     */
    candidateDraft =
      removeManualScheduleAllocations(
        previous,
        {
          allocationIds:
            [...removedIds],

          machines,

          now:
            effectiveNow
        }
      );

    validationResult =
      validateCandidate(
        candidateDraft
      );
  }

  return {
    accepted: false,

    sourceAllocation:
      clone(sourceAllocation),

    sourceOperationIds,

    successorOperationIds,

    removedAllocationIds:
      [...removedIds],

    cascadeAllocationIds:
      [...cascadeIds],

    draft:
      clone(candidateDraft),

    blockingIssues:
      manualScheduleBlockingIssues(
        validationResult
      ),

    validationResult:
      clone(validationResult)
  };
}

export function applyDraftMove(draft, {
  allocationId,
  targetDate,
  targetMachineId,
  peopleCount,
  machines = [],
  matrixRows = [],
  days = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES,
  confirmMerge = false,
  confirmReplace = false,
  moveMode = null,
  preferSourceDateForReplace = false,
  capacityDecision = 'cancel',
  now
} = {}) {
  const previous = clone(draft);
  const context = { machines, matrixRows, days, dailyMinutes };
  const sourceAllocations = Array.isArray(previous.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const normalizedId = String(allocationId || '');
  const source = sourceAllocations.find(allocation => String(allocation?.allocationId || '') === normalizedId);
  if (!source) throw makeMoveError('Allocation nao encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND', previous);
  if (!isValidDateOnly(targetDate)) throw makeMoveError('Destino sem data valida.', 'INVALID_DATE', previous);

   const moved = withRollbackSnapshot(
    () => recalculateWithProductivity({
      ...source,

      ...(peopleCount !== undefined
        && peopleCount !== null
        && peopleCount !== ''
        ? {
            peopleCount: Number(peopleCount)
          }
        : {}),

      date: normalizeDateOnly(targetDate),
      endDate: normalizeDateOnly(targetDate),

      startTime: '07:00',
      endTime: '07:00',

      machineId: String(targetMachineId || ''),

      source: 'manual',
      pinned: true
    }, targetMachineId, context),

    previous
  );
  const others = sourceAllocations.filter(allocation => String(allocation.allocationId) !== normalizedId);
  const occupants = cellAllocations(others, moved.date, moved.machineId);
  const normalizedMoveMode = ['replace', 'complete_day', 'reorder_before'].includes(String(moveMode || ''))
    ? String(moveMode)
    : null;
  let nextAllocations = others;
  let action = 'move';

  if (!occupants.length) {
    if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'cancel') {
      throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: moved });
    }
    if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'split') {
      const availableQty = toNumber(moved.maxDailyCapacity ?? moved.capacityMaxPerDay);
      if (!(availableQty > 0) || availableQty >= toNumber(moved.quantity)) {
        throw makeMoveError('Nao ha capacidade normal disponivel para dividir o excedente.', 'CAPACITY_SPLIT_INVALID', previous);
      }
      const filled = withRollbackSnapshot(() => recalculateWithProductivity({
        ...moved,
        quantity: Number(availableQty.toFixed(6)),
        components: splitComponentsByQuantity(normalizeComponents(moved), availableQty)
      }, moved.machineId, context), previous);
      const remainderQty = Number((toNumber(moved.quantity) - availableQty).toFixed(6));
      const remainder = {
        ...moved,
        allocationId: createId(`${moved.allocationId}:excedente`),
        quantity: remainderQty,
        components: splitComponentsByQuantity(normalizeComponents(moved), remainderQty),
        sourceAllocationIds: allocationTraceIds(moved),
        sourceParentOperationIds: allocationParentIds(moved)
      };
      const placement = findNextPlacement(remainder, [...others, filled], context, {
        startDate: moved.date,
        preferredMachineId: moved.machineId
      });
      if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para o excedente.', 'NO_NEXT_SLOT', previous);
      nextAllocations = [...others, filled];
      if (placement.mergeIntoAllocationId) {
        nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
      }
      nextAllocations.push(placement.allocation);
      action = 'split_over_capacity';
    } else {
      nextAllocations = [...others, {
        ...moved,
        isCapacityOverride: toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
      }];
      action = toNumber(moved.capacityPercent) > 100 + EPSILON ? 'override_capacity' : 'move';
    }
  } else {
    const compatible = occupants.find(item => sameMaterialCompatible(item, moved));
        if (
      compatible
      && normalizedMoveMode !== 'replace'
    ) {
      const totalCapacity =
        occupants.reduce(
          (sum, allocation) =>
            sum
            + Math.max(
              toNumber(allocation.capacityPercent),
              0
            ),
          0
        )
        + Math.max(
          toNumber(moved.capacityPercent),
          0
        );

      if (
        totalCapacity > 100 + EPSILON
        && capacityDecision === 'cancel'
      ) {
        throw makeMoveError(
          'Capacidade da máquina no dia excedida',
          'CAPACITY_EXCEEDED',
          previous,
          {
            proposedAllocation: {
              ...moved,
              capacityPercent: Number(
                totalCapacity.toFixed(2)
              )
            }
          }
        );
      }
    }
    if (normalizedMoveMode === 'replace' || (!compatible && !['complete_day', 'reorder_before'].includes(normalizedMoveMode))) {
      const occupant = occupants[0];
      if (!confirmReplace) {
        throw makeMoveError('Substituir producao programada', 'CONFIRM_REPLACE', previous, {
          sourceAllocation: source,
          proposedAllocation: moved,
          occupyingAllocation: occupant
        });
      }
      nextAllocations = others.filter(allocation => String(allocation.allocationId) !== String(occupant.allocationId));
      if (toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision !== 'override') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: moved });
      }
      nextAllocations.push({
        ...moved,
        isCapacityOverride: toNumber(moved.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
      });
      const placement = preferSourceDateForReplace
        ? findNextPlacement(occupant, nextAllocations, context, {
            preferredDate: source.date,
            startDate: moved.date,
            preferredMachineId: source.machineId || occupant.machineId
          })
        : pushReplacementChain(occupant, nextAllocations, context, {
            startDate: moved.date,
            preferredMachineId: source.machineId || occupant.machineId,
            capacityDecision
          }) || findNextPlacement(occupant, nextAllocations, context, {
            startDate: moved.date,
            preferredMachineId: source.machineId || occupant.machineId
          });
      if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para reagendar o ocupante.', 'NO_NEXT_SLOT', previous);
      if (placement.allocations) {
        nextAllocations = placement.allocations;
      } else {
        if (placement.mergeIntoAllocationId) {
          nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
        }
        nextAllocations.push(placement.allocation);
      }
      action = 'replace';
    } else if (compatible) {
      const merged = withRollbackSnapshot(() => mergeAllocations(compatible, moved, context), previous);
      if (!confirmMerge) {
        throw makeMoveError('Unificar producoes', 'CONFIRM_MERGE', previous, { proposedAllocation: merged });
      }
      if (toNumber(merged.capacityPercent) > 100 + EPSILON && capacityDecision === 'cancel') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation: merged });
      }
      nextAllocations = others.filter(allocation => String(allocation.allocationId) !== String(compatible.allocationId));
      if (toNumber(merged.capacityPercent) > 100 + EPSILON && capacityDecision === 'split') {
        const availableQty = Math.max(toNumber(merged.maxDailyCapacity ?? merged.capacityMaxPerDay) - toNumber(compatible.quantity), 0);
        if (!(availableQty > 0) || availableQty >= toNumber(moved.quantity)) {
          throw makeMoveError('Nao ha capacidade normal disponivel para dividir o excedente.', 'CAPACITY_SPLIT_INVALID', previous);
        }
        const filledMoved = {
          ...moved,
          quantity: Number(availableQty.toFixed(6)),
          components: splitComponentsByQuantity(normalizeComponents(moved), availableQty)
        };
        const filled = withRollbackSnapshot(() => mergeAllocations(compatible, filledMoved, context), previous);
        const remainderQty = Number((toNumber(moved.quantity) - availableQty).toFixed(6));
        const remainder = {
          ...moved,
          allocationId: createId(`${moved.allocationId}:excedente`),
          quantity: remainderQty,
          components: splitComponentsByQuantity(normalizeComponents(moved), remainderQty),
          sourceAllocationIds: allocationTraceIds(moved),
          sourceParentOperationIds: allocationParentIds(moved)
        };
        const placement = findNextPlacement(remainder, [...nextAllocations, filled], context, {
          startDate: moved.date,
          preferredMachineId: moved.machineId
        });
        if (!placement) throw makeMoveError('Nao foi encontrado proximo periodo valido para o excedente.', 'NO_NEXT_SLOT', previous);
        nextAllocations.push(filled);
        if (placement.mergeIntoAllocationId) {
          nextAllocations = nextAllocations.filter(allocation => String(allocation.allocationId) !== String(placement.mergeIntoAllocationId));
        }
        nextAllocations.push(placement.allocation);
        action = 'split_over_capacity';
      } else {
        nextAllocations.push({
          ...merged,
          isCapacityOverride: toNumber(merged.capacityPercent) > 100 + EPSILON && capacityDecision === 'override'
        });
        action = toNumber(merged.capacityPercent) > 100 + EPSILON ? 'override_capacity' : 'merge';
      }
    } else {
      const totalCapacity = occupants.reduce((sum, allocation) => sum + toNumber(allocation.capacityPercent), 0) + toNumber(moved.capacityPercent);
      const proposedAllocation = { ...moved, capacityPercent: Number(totalCapacity.toFixed(2)) };
      if (totalCapacity > 100 + EPSILON && capacityDecision !== 'override') {
        throw makeMoveError('Capacidade do dia excedida', 'CAPACITY_EXCEEDED', previous, { proposedAllocation });
      }
      const sameCellIds = new Set(occupants.map(allocation => String(allocation.allocationId)));
      nextAllocations = others.filter(allocation => !sameCellIds.has(String(allocation.allocationId)));
      const orderedCellAllocations = normalizedMoveMode === 'reorder_before'
        ? [moved, ...occupants]
        : [...occupants, moved];
            const sequenced = applySequentialTimes(
        orderedCellAllocations,
        {
          dailyMinutes: context.dailyMinutes,

          overrideAllocationIds:
            totalCapacity > 100 + EPSILON
            && capacityDecision === 'override'
              ? [moved.allocationId]
              : []
        }
      );
      nextAllocations.push(...sequenced);
      action = totalCapacity > 100 + EPSILON ? 'complete_day_override_capacity' : 'complete_day';
    }
  }

  const next = {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined
      ? new Date().toISOString()
      : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: action
  };
  const validation = validateManualScheduleDraft(next, {
    machines,
    previousAllocations: sourceAllocations
  });
  if (!validation.valid) {
    throw makeMoveError('Movimento invalido. O rascunho manual foi mantido sem alteracoes.', 'DRAFT_INVALID', previous, { details: validation.errors });
  }
  return next;
}

export function applyIndependentDraftMove(draft, {
  allocationId,
  targetDate,
  targetMachineId,
  peopleCount,
  quantity,
  remainderDate,
  machines = [],
  matrixRows = [],
  days = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES,
  now
} = {}) {
  const previous = clone(draft);
  const context = { machines, matrixRows, days, dailyMinutes };
  const sourceAllocations = Array.isArray(previous.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const normalizedId = String(allocationId || '');
  const source = sourceAllocations.find(allocation => String(allocation?.allocationId || '') === normalizedId);
  if (!source) throw makeMoveError('Allocation nao encontrada no rascunho manual.', 'ALLOCATION_NOT_FOUND', previous);
  if (!isValidDateOnly(targetDate)) throw makeMoveError('Destino sem data valida.', 'INVALID_DATE', previous);

  const requestedQuantity = quantity === undefined || quantity === null || quantity === ''
    ? toNumber(source.quantity)
    : toNumber(quantity);
  if (!(requestedQuantity > 0) || requestedQuantity > toNumber(source.quantity) + EPSILON) {
    throw makeMoveError('Quantidade invalida para movimentacao manual.', 'INVALID_MOVE_QUANTITY', previous);
  }
  const targetMachine = String(targetMachineId || source.machineId || '');
  const targetPeople = peopleCount !== undefined && peopleCount !== null && peopleCount !== ''
    ? Number(peopleCount)
    : Number(source.peopleCount);
    const otherAllocations =
    sourceAllocations.filter(
      allocation =>
        String(allocation.allocationId)
        !== normalizedId
    );

  const recalculatedMoved =
    withRollbackSnapshot(
      () => recalculateWithProductivity({
        ...source,

        quantity: Number(
          requestedQuantity.toFixed(6)
        ),

        components:
          splitComponentsByQuantity(
            normalizeComponents(source),
            requestedQuantity
          ),

        peopleCount: targetPeople,

        date: normalizeDateOnly(targetDate),
        endDate: normalizeDateOnly(targetDate),

        startTime: '07:00',
        endTime: '07:00',

        machineId: targetMachine,

        source: 'manual',
        pinned: true
      }, targetMachine, context),

      previous
    );

  const usedCapacity =
    machineDayCapacityUsed(
      otherAllocations,
      targetDate,
      targetMachine
    );

  const totalCapacity =
    usedCapacity
    + Math.max(
      toNumber(
        recalculatedMoved.capacityPercent
      ),
      0
    );

  if (totalCapacity > 100 + EPSILON) {
    throw makeMoveError(
      `Capacidade da máquina no dia excedida. Já utilizado: ${Number(usedCapacity.toFixed(2))}%.`,
      'CAPACITY_EXCEEDED',
      previous,
      {
        proposedAllocation: {
          ...recalculatedMoved,
          capacityPercent: Number(
            totalCapacity.toFixed(2)
          )
        }
      }
    );
  }

  const moved =
    placeAllocationAfterMachineDayUsage(
      recalculatedMoved,
      otherAllocations,
      {
        date: targetDate,
        machineId: targetMachine,
        dailyMinutes
      }
    );

  const nextAllocations = [
    ...otherAllocations,
    moved
  ];
  const remainderQty = Number((toNumber(source.quantity) - requestedQuantity).toFixed(6));
  if (remainderQty > EPSILON) {
    if (!isValidDateOnly(remainderDate)) {
      throw makeMoveError('Data do restante nao informada.', 'REMAINDER_DATE_REQUIRED', previous);
    }
    const remainderId = createId(`${source.allocationId}:restante`);
    const remainder = withRollbackSnapshot(() => recalculateWithProductivity({
      ...source,
      allocationId: remainderId,
      quantity: remainderQty,
      components: splitComponentsByQuantity(normalizeComponents(source), remainderQty).map(component => ({
        ...component,
        allocationId: remainderId
      })),
      sourceAllocationIds: allocationTraceIds(source),
      sourceParentOperationIds: allocationParentIds(source),
      peopleCount: targetPeople,
      date: normalizeDateOnly(remainderDate),
      machineId: targetMachine,
      source: 'manual',
      pinned: true
    }, targetMachine, context), previous);
    nextAllocations.push(remainder);
  }

  const next = {
    ...previous,
    allocations: nextAllocations.map(normalizeAllocation),
    updatedAt: now === undefined
      ? new Date().toISOString()
      : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: remainderQty > EPSILON ? 'stock_split_move' : 'independent_move'
  };
  const validation = validateManualScheduleDraft(next, {
    machines,
    previousAllocations: sourceAllocations
  });
  if (!validation.valid) {
    throw makeMoveError('Movimento invalido. O rascunho manual foi mantido sem alteracoes.', 'DRAFT_INVALID', previous, { details: validation.errors });
  }
  return next;
}

export function createManualScheduleAllocation(draft, {
  material = {},
  date,
  machineId,
  peopleCount,
capacityPercent,
quantity,
machines = [],
  matrixRows = [],
  days = [],
  dailyMinutes = DEFAULT_DAILY_MINUTES,
  now
} = {}) {
  const previous = clone(draft);
  const sourceAllocations = Array.isArray(previous?.allocations) ? previous.allocations.map(normalizeAllocation) : [];
  const targetDate = normalizeDateOnly(date);
  const targetMachine = String(machineId || '');
  const targetPeople = Number(peopleCount);
  const requestedPercentInput =
  toNumber(
    capacityPercent
  );

const explicitQuantity =
  quantity === undefined
  || quantity === null
  || quantity === ''

    ? null

    : toNumber(
        quantity,
        NaN
      );
  const remainingQty = wholeProductionQuantity(
  material.remainingQty
  ?? material.remainingQuantity
  ?? material.restante
  ?? material.requiredQty
);

  const permittedQty =
  Math.max(
    0,
    toNumber(
      material.permittedQty
      ?? material.permittedQuantity
      ?? remainingQty
    )
  );


const allowedQty =
  Math.min(
    remainingQty,
    permittedQty
  );
  if (!isValidDateOnly(targetDate)) throw makeMoveError('Destino sem data valida.', 'INVALID_DATE', previous);
  if (!targetMachine) throw makeMoveError('Destino sem maquina valida.', 'INVALID_MACHINE', previous);
  if (!Number.isInteger(targetPeople) || targetPeople < 1) throw makeMoveError('Quantidade de pessoas invalida para a matriz.', 'INVALID_PEOPLE', previous);
  if (!(requestedPercentInput > 0)) throw makeMoveError('Percentual de capacidade invalido.', 'INVALID_CAPACITY_PERCENT', previous);

    const usedCapacity = machineDayCapacityUsed(
    sourceAllocations,
    targetDate,
    targetMachine
  );

  const availableCapacity = Math.max(
    100 - usedCapacity,
    0
  );

  if (
    requestedPercentInput
> availableCapacity + EPSILON
  ) {
    throw makeMoveError(
      `Capacidade da máquina no dia excedida. Disponível: ${Number(availableCapacity.toFixed(2))}%.`,
      'CAPACITY_EXCEEDED',
      previous,
      {
        proposedAllocation: {
          date: targetDate,
          machineId: targetMachine,
          capacityPercent: Number(
            (
              usedCapacity
+ requestedPercentInput
            ).toFixed(2)
          )
        }
      }
    );
  }

  const allocationId = createId('manual-allocation');
  const parentOperationId = String(material.operationId || material.parentOperationId || material.calendarParentOperationId || '');
  const productionIndex = Number(material.productionIndex);
  const productionId = String(material.productionId || (Number.isFinite(productionIndex) ? `production-${productionIndex}` : 'production-0'));
  const base = {
    allocationId,
    operationId: parentOperationId || allocationId,
    parentOperationId: parentOperationId || allocationId,
    calendarParentOperationId: parentOperationId || allocationId,
    productionId,
    productionIndex: Number.isFinite(productionIndex) ? productionIndex : 0,
    productionNumber:
      Number(
        material.productionNumber
        ??
        (
          Number.isFinite(productionIndex)
            ? productionIndex + 1
            : 1
        )
      ),
    productionTitle: String(material.productionTitle || ''),
    productionColor: String(material.productionColor || ''),
    materialId: String(material.materialId || ''),
    materialCode: String(material.materialCode || material.code || ''),
    materialName: String(material.materialName || material.name || ''),
    date: targetDate,
    endDate: targetDate,
    startTime: '07:00',
    endTime: '07:00',
    quantity: 1,
    unit: String(material.unit || material.plannedUnit || ''),
    peopleCount: targetPeople,
    source: 'manual',
    pinned: true,
    productionMemberships: [{
      productionId,
      productionIndex: Number.isFinite(productionIndex) ? productionIndex : 0,
      productionNumber:
        Number(
          material.productionNumber
          ??
          (
            Number.isFinite(productionIndex)
              ? productionIndex + 1
              : 1
          )
        ),
      productionTitle: String(material.productionTitle || ''),
      materialId: String(material.materialId || ''),
      materialName: String(material.materialName || material.name || ''),
      quantity: 1,
      unit: String(material.unit || material.plannedUnit || ''),
      quantitySource: 'manual-allocation'
    }]
  };
  const preview = withRollbackSnapshot(() => recalculateWithProductivity(base, targetMachine, {
    machines, matrixRows, days, dailyMinutes
  }), previous);
  const maxDailyCapacity = toNumber(preview.maxDailyCapacity ?? preview.capacityMaxPerDay);
  const calculatedQuantity =
  Math.floor(
    (
      maxDailyCapacity
      * requestedPercentInput
    ) / 100
    + Number.EPSILON
      * Math.max(
          1,
          maxDailyCapacity
        )
      * 8
  );


const requestedQuantity =
  explicitQuantity !== null

    ? Number(
        explicitQuantity.toFixed(6)
      )

    : calculatedQuantity;
  if (!(requestedQuantity > 0)) throw makeMoveError('Quantidade calculada invalida.', 'INVALID_MOVE_QUANTITY', previous);
  if (remainingQty > 0 && requestedQuantity > remainingQty + EPSILON) {
    throw makeMoveError('Quantidade superior ao restante a programar.', 'QUANTITY_EXCEEDS_REMAINING', previous);
  }

  if (
  requestedQuantity
  > allowedQty + EPSILON
) {
  throw makeMoveError(
    'Quantidade superior ao permitido pelos materiais disponíveis.',
    'QUANTITY_EXCEEDS_PERMITTED',
    previous
  );
}
  
  const configured = withRollbackSnapshot(() => recalculateWithProductivity({
    ...base,
    quantity: requestedQuantity,
    components: [{
      allocationId,
      parentOperationId: base.parentOperationId,
      productionId,
      materialId: base.materialId,
      materialName: base.materialName,
      quantity: requestedQuantity,
      unit: base.unit
    }],
    productionMemberships: base.productionMemberships.map(item => ({
      ...item,
      quantity: requestedQuantity
    }))
  }, targetMachine, { machines, matrixRows, days, dailyMinutes }), previous);
  const durationMinutes = Math.ceil(toNumber(configured.durationMinutes));
  const start = clockMinutes(configured.startTime || '07:00') ?? clockMinutes('07:00');
    const inserted = normalizeAllocation(
    placeAllocationAfterMachineDayUsage(
      {
        ...configured,

        capacityPercent: Number(
  requestedPercentInput.toFixed(2)
),

        isCapacityOverride: false,

        date: targetDate,
        endDate: targetDate,

        startTime:
          configured.startTime
          || '07:00',

        endTime: minutesClock(
          start + durationMinutes
        ),

        source: 'manual',
        pinned: true
      },

      sourceAllocations,

      {
        date: targetDate,
        machineId: targetMachine,
        dailyMinutes
      }
    ),

    sourceAllocations.length
  );
  const next = {
    ...previous,
    allocations: [...sourceAllocations, inserted].map(normalizeAllocation),
    updatedAt: now === undefined
      ? new Date().toISOString()
      : (now instanceof Date ? now.toISOString() : String(now)),
    dirty: true,
    lastManualAction: { type: 'CREATE_MANUAL_ALLOCATION', allocationId }
  };
  const validation = validateManualScheduleDraft(next, {
  machines
});
  if (!validation.valid) {
    throw makeMoveError('Allocation manual invalida. O rascunho manual foi mantido sem alteracoes.', 'DRAFT_INVALID', previous, { details: validation.errors });
  }
  return next;
}

export function createManualScheduleDraft({
  planningId = null,
  baseSimulationId = null,
  allocations = [],
  transports = [],
  plannedReceipts = [],
  machines = [],
  manualWorkDates = [],
  dailyTeamOverrides = {},
  preserveAllocationRows = false,
  now = new Date()
} = {}) {
  const normalizedAllocations =
    allocations.map(
      (allocation, index) => {
        const normalized =
          normalizeAllocation(
            allocation,
            index
          );

        /*
         * Drafts antigos podem não possuir
         * locationId.
         *
         * Se conhecemos a máquina, já
         * hidratamos o local agora.
         */
        const machine =
          machineById(
            machines,
            normalized.machineId
          )
          || {};

        const locationId =
          machineLocationId(machine);

        if (
          !locationId
          || normalized.locationId
          || normalized.sourceLocation
          || normalized.targetLocation
        ) {
          return normalized;
        }

        return {
          ...normalized,

          locationId,

          sourceLocation:
            locationId,

          targetLocation:
            locationId
        };
      }
    );

   const normalizedTransports =
    (
      Array.isArray(transports)
        ? transports
        : []
    ).map(
      normalizeManualScheduleTransport
    );

  const normalizedPlannedReceipts =
    (
      Array.isArray(plannedReceipts)
        ? plannedReceipts
        : []
    ).map(
      normalizeManualSchedulePlannedReceipt
    );

  const normalized =
    preserveAllocationRows
      ? normalizedAllocations.map(
          (allocation, index) => ({
            ...allocation,
            sequence:
              index + 1
          })
        )
      : consolidateManualScheduleAllocations(
          normalizedAllocations
        );

  const timestamp =
    now instanceof Date
      ? now.toISOString()
      : new Date().toISOString();

  const draft = {
    draftId:
      createId(
        'manual-draft'
      ),

    planningId:
      planningId == null
        ? null
        : String(planningId),

    baseSimulationId:
      baseSimulationId == null
        ? null
        : String(baseSimulationId),

    allocations:
      normalized,

    /*
     * MANUAL-05:
     * transporte é entidade própria,
     * não allocation produtiva.
     */
       transports:
      normalizedTransports,

    /*
     * Entradas futuras previstas.
     *
     * Não são estoque físico atual.
     * Entram no ledger somente em availableDate.
     */
    plannedReceipts:
      normalizedPlannedReceipts,

    manualWorkDates:
      [
        ...new Set(
          (
            Array.isArray(
              manualWorkDates
            )
              ? manualWorkDates
              : []
          )
            .map(value =>
              String(
                value?.date
                ?? value
                ?? ''
              )
            )
            .filter(Boolean)
        )
      ].sort(),

    dailyTeamOverrides:
      clone(
        dailyTeamOverrides
        && typeof dailyTeamOverrides
          === 'object'
          ? dailyTeamOverrides
          : {}
      ),

    createdAt:
      timestamp,

    updatedAt:
      timestamp,

    dirty:
      false
  };

  const validation =
    validateManualScheduleDraft(
      draft,
      {
        machines
      }
    );

  if (!validation.valid) {
    const error =
      new Error(
        'Falha ao criar rascunho manual do calendario.'
      );

    error.details =
      validation.errors;

    throw error;
  }

  return draft;
}

export function moveDraftAllocation(draft, options = {}) {
  return applyDraftMove(draft, options);
}

export function restoreManualScheduleDraftSnapshot(snapshot) {
  return clone(snapshot);
}

export function discardManualScheduleDraft() {
  return null;
}
