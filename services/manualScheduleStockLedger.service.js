const DEFAULT_LOCATION_ID = '__default__';
const MINUTES_PER_DAY = 24 * 60;

const EVENT_PRIORITY = {
  INITIAL_STOCK: 1,
  PLANNED_RECEIPT: 2,
  TRANSPORT_ARRIVAL: 2,
  PRODUCTION_AVAILABLE: 3,
  COMMITMENT_RELEASE: 4,
  CONSUMPTION_COMMITMENT: 5,
  MATERIAL_CONSUMPTION: 6,
  TRANSPORT_DISPATCH: 7,
  STOCK_MINIMUM_REACHED: 8,
  STOCK_SHORTAGE: 9
};

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique(values) {
  return [...new Set(values.map(value => String(value ?? '')).filter(Boolean))].sort();
}

function civilDayNumber(date) {
  const [year, month, day] = date.split('-').map(Number);
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - (era * 400);
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

function civilDateFromDay(dayNumber) {
  const era = Math.floor(dayNumber / 146097);
  const dayOfEra = dayNumber - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function pointFields(point) {
  const roundedPoint = Math.round(point * 1e9) / 1e9;
  let day = Math.floor(roundedPoint / MINUTES_PER_DAY);
  let minutes = roundedPoint - day * MINUTES_PER_DAY;
  if (minutes >= MINUTES_PER_DAY - 1e-9) {
    day += 1;
    minutes = 0;
  }
  const wholeMinutes = Math.floor(minutes + 1e-9);
  const seconds = Math.round((minutes - wholeMinutes) * 60);
  const hours = Math.floor(wholeMinutes / 60);
  const minute = wholeMinutes % 60;
  const time = `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}${seconds ? `:${String(seconds).padStart(2, '0')}` : ''}`;
  const date = civilDateFromDay(day);
  return { date, time, timestampKey: `${date}T${time}` };
}

function normalizeBoundary(value, precision) {
  if (!Number.isFinite(value)) return null;
  const normalized = Number(value.toFixed(precision));
  return Object.is(normalized, -0) ? 0 : normalized;
}

function progressAt(profile, point) {
  if (!(profile.productiveMinutes > 0)) return point >= profile.end ? 1 : 0;
  const worked = profile.segments.reduce((sum, segment) => sum + Math.max(Math.min(point, segment.end) - segment.start, 0), 0);
  return Math.min(Math.max(worked / profile.productiveMinutes, 0), 1);
}

function makeProfile(allocation, component, segments) {
  return {
    allocationId: allocation.allocationId,
    parentOperationId: component.parentOperationId,
    materialId: component.materialId || allocation.materialId,
    quantity: component.quantity,
    locationId: allocation.sourceLocation || allocation.targetLocation || DEFAULT_LOCATION_ID,
    unit: component.unit || allocation.unit || null,
    start: allocation.start,
    end: allocation.end,
    segments,
    productiveMinutes: segments.reduce((sum, segment) => sum + segment.end - segment.start, 0)
  };
}

function pointForQuantity(profiles, wanted, epsilon) {
  if (!(wanted > epsilon)) return profiles.length ? Math.min(...profiles.map(profile => profile.start)) : null;
  const points = [...new Set(profiles.flatMap(profile => profile.segments.flatMap(segment => [segment.start, segment.end])))].sort((a, b) => a - b);
  const quantityAt = point => profiles.reduce((sum, profile) => sum + profile.quantity * progressAt(profile, point), 0);
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const leftQuantity = quantityAt(left);
    const rightQuantity = quantityAt(right);
    if (leftQuantity + epsilon >= wanted) return left;
    if (rightQuantity + epsilon >= wanted && rightQuantity > leftQuantity) {
      return left + ((wanted - leftQuantity) / (rightQuantity - leftQuantity)) * (right - left);
    }
  }
  const last = points.at(-1);
  return last !== undefined && quantityAt(last) + epsilon >= wanted ? last : null;
}

function stockDiagnostic(code, values = {}) {
  const safeValue = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : String(value);
    if (Array.isArray(value)) return value.map(safeValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeValue(item)]));
    return value;
  };
  const point = Number.isFinite(values.point) ? pointFields(values.point) : { date: null, time: null };
  return {
    code,
    rule: values.rule || 'stock_ledger',
    message: values.message || code,
    severity: values.severity || 'error',
    blocking: values.blocking !== false,
    materialIds: unique(values.materialIds || [values.materialId]),
    allocationIds: unique(values.allocationIds || []),
    parentOperationIds: unique(values.parentOperationIds || []),
    dependencyIds: unique(values.dependencyIds || []),
    locationId: values.locationId || null,
    date: point.date,
    startTime: point.time,
    endTime: point.time,
    requiredQuantity: values.requiredQuantity ?? null,
    availableQuantity: values.availableQuantity ?? null,
    deficitQuantity: values.deficitQuantity ?? null,
    balanceBefore: values.balanceBefore ?? null,
    balanceAfter: values.balanceAfter ?? null,
    details: safeValue(values.details || {})
  };
}

function stockLocationDisplayName(item = {}) {
  return String(item?.locationName ?? item?.location_name ?? item?.name ?? '').trim();
}

function unconfiguredStockLocationMessage(locationId, item = {}) {
  if (locationId === DEFAULT_LOCATION_ID) {
    return 'O estoque agregado do material não está configurado corretamente.';
  }
  const displayName = stockLocationDisplayName(item);
  return displayName
    ? `O local de estoque "${displayName}" não está configurado.`
    : 'O local de estoque informado não está configurado.';
}

export function buildManualScheduleStockLedger({
  normalizedAllocations,
  normalizedDependencies,
  normalizedTransports,
  normalizedPlannedReceipts = [],
  productiveSegments,
  stock,
  stockMinimums,
  stockLocations,
  quantityPrecision
}) {
  const precisionNumber = Number(quantityPrecision ?? 6);
  const precision = Number.isInteger(precisionNumber) && precisionNumber >= 0 && precisionNumber <= 9 ? precisionNumber : 6;
  const epsilon = 10 ** -(precision + 1);
  const diagnostics = [];
  if (!(Number.isInteger(precisionNumber) && precisionNumber >= 0 && precisionNumber <= 9)) {
    diagnostics.push(stockDiagnostic('INVALID_STOCK_CONFIGURATION', {
      message: 'quantityPrecision deve ser um inteiro entre 0 e 9.',
      details: { quantityPrecision, appliedPrecision: precision }
    }));
  }
  if (!Array.isArray(stock)) {
    diagnostics.push(stockDiagnostic('INVALID_STOCK_CONFIGURATION', {
      message: 'O estoque inicial deve ser informado explicitamente como uma lista, ainda que vazia.',
      details: { stockProvided: stock !== undefined }
    }));
  }

  const configuredLocations = new Set((Array.isArray(stockLocations) ? stockLocations : [])
    .map(item => String(item?.locationId ?? item?.id ?? item ?? '')).filter(Boolean));
  const materialUnits = new Map();
  const noteUnit = (materialId, unit, source) => {
    if (!materialId || !unit) return;
    const normalizedUnit = String(unit).trim().toLowerCase();
    if (!materialUnits.has(materialId)) materialUnits.set(materialId, normalizedUnit);
    else if (materialUnits.get(materialId) !== normalizedUnit) diagnostics.push(stockDiagnostic('INVALID_STOCK_UNIT', {
      materialId,
      message: `A unidade de ${materialId} é incompatível com as demais entradas.`,
      details: { expectedUnit: materialUnits.get(materialId), receivedUnit: normalizedUnit, source }
    }));
  };

  const initialByKey = new Map();
  (Array.isArray(stock) ? stock : []).forEach((item, index) => {
    const materialId = String(item?.materialId ?? item?.material_id ?? '');
    const locationId = String(item?.locationId ?? item?.location_id ?? DEFAULT_LOCATION_ID) || DEFAULT_LOCATION_ID;
    const quantity = Number(item?.quantity);
    const unit = String(item?.unit ?? '').trim();
    if (!materialId || !Number.isFinite(quantity)) {
      diagnostics.push(stockDiagnostic('INVALID_STOCK_CONFIGURATION', {
        materialId,
        locationId,
        message: `A entrada de estoque ${index + 1} é inválida.`,
        details: { index, materialId, locationId, quantity: item?.quantity }
      }));
      return;
    }
    if (quantity < -epsilon) {
      diagnostics.push(stockDiagnostic('NEGATIVE_INITIAL_STOCK', {
        materialId, locationId, balanceAfter: quantity,
        message: `O estoque inicial de ${materialId} não pode ser negativo.`,
        details: { quantity }
      }));
      return;
    }
    if (configuredLocations.size && !configuredLocations.has(locationId)) diagnostics.push(stockDiagnostic('STOCK_LOCATION_MISMATCH', {
      materialId,
      locationId,
      message: unconfiguredStockLocationMessage(locationId, item),
      details: { configuredLocations: [...configuredLocations].sort() }
    }));
    noteUnit(materialId, unit, `stock:${index}`);
    const key = `${materialId}\u0000${locationId}`;
    const current = initialByKey.get(key) || { materialId, locationId, quantity: 0, unit: unit || null };
    current.quantity += quantity;
    current.unit ||= unit || null;
    initialByKey.set(key, current);
  });

  const minimumByKey = new Map();
  (Array.isArray(stockMinimums) ? stockMinimums : []).forEach((item, index) => {
    const materialId = String(item?.materialId ?? item?.material_id ?? '');
    const locationId = String(item?.locationId ?? item?.location_id ?? DEFAULT_LOCATION_ID) || DEFAULT_LOCATION_ID;
    const minimumQuantity = Number(item?.minimumQuantity ?? item?.quantity);
    if (!materialId || !Number.isFinite(minimumQuantity) || minimumQuantity < -epsilon) {
      diagnostics.push(stockDiagnostic('INVALID_STOCK_CONFIGURATION', {
        materialId, locationId, message: `A configuração de estoque mínimo ${index + 1} é inválida.`, details: { minimumQuantity: item?.minimumQuantity }
      }));
      return;
    }
    minimumByKey.set(`${materialId}\u0000${locationId}`, minimumQuantity);
  });

  const outputProfiles = [];
  normalizedAllocations.filter(item => item.validDate && item.validTime).forEach(allocation => {
    const segments = productiveSegments(allocation);
    const componentTotal = allocation.components.reduce((sum, component) => sum + (Number.isFinite(component.quantity) ? component.quantity : 0), 0);
    if (!Number.isFinite(allocation.quantity) || allocation.quantity <= epsilon || Math.abs(componentTotal - allocation.quantity) > epsilon) {
      diagnostics.push(stockDiagnostic('STOCK_COMPONENT_RECONCILIATION_ERROR', {
        allocationIds: [allocation.allocationId],
        parentOperationIds: allocation.components.map(item => item.parentOperationId),
        materialIds: allocation.components.map(item => item.materialId),
        point: allocation.start,
        message: `Os componentes da allocation ${allocation.allocationId} não reconciliam com sua quantidade.`,
        details: { allocationQuantity: allocation.quantity, componentQuantity: componentTotal, tolerance: epsilon }
      }));
      return;
    }
    allocation.components.forEach(component => {
      noteUnit(component.materialId || allocation.materialId, component.unit || allocation.unit, `allocation:${allocation.allocationId}`);
      outputProfiles.push(makeProfile(allocation, component, segments));
    });
  });

    normalizedDependencies.forEach(
    dependency =>
      noteUnit(
        dependency.materialId,
        dependency.unit,
        `dependency:${dependency.dependencyId}`
      )
  );

  normalizedTransports.forEach(
    transport =>
      noteUnit(
        transport.materialId,
        transport.unit,
        `transport:${transport.transportId}`
      )
  );

  normalizedPlannedReceipts.forEach(
    receipt =>
      noteUnit(
        receipt.materialId,
        receipt.unit,
        `planned-receipt:${receipt.receiptId}`
      )
  );

  const intents = [];
  const addIntent = intent => intents.push({ ...intent, allocationIds: unique(intent.allocationIds || []), parentOperationIds: unique(intent.parentOperationIds || []), dependencyIds: unique(intent.dependencyIds || []) });
  const relevantPoints = new Set(outputProfiles.flatMap(profile => profile.segments.flatMap(segment => [segment.start, segment.end])));
  const requirements = [];
  normalizedDependencies.forEach(dependency => {
    const consumers = normalizedAllocations.filter(allocation => allocation.parentOperationId === dependency.consumerParentOperationId && allocation.validDate && allocation.validTime);
    const totalWeight = consumers.reduce((sum, allocation) => sum + (Number.isFinite(allocation.quantity) && allocation.quantity > 0 ? allocation.quantity : 0), 0);
    consumers.forEach(allocation => {
      const required = dependency.requiredQuantity * (allocation.quantity / totalWeight);
      const segments = productiveSegments(allocation);
      const locationId = dependency.targetLocation || allocation.targetLocation || allocation.sourceLocation || DEFAULT_LOCATION_ID;
      requirements.push({
        requirementId: `${dependency.dependencyId}:${allocation.allocationId}`,
        dependencyId: dependency.dependencyId,
        allocationId: allocation.allocationId,
        parentOperationIds: [dependency.producerParentOperationId, dependency.consumerParentOperationId],
        materialId: dependency.materialId,
        locationId,
        required,
        commitment: required,
        start: allocation.start,
        end: allocation.end,
        segments,
        productiveMinutes: segments.reduce((sum, segment) => sum + segment.end - segment.start, 0),
        reservedRemaining: 0,
        consumed: 0
      });
      relevantPoints.add(allocation.start);
      segments.forEach(segment => { relevantPoints.add(segment.start); relevantPoints.add(segment.end); });
    });
  });

    normalizedPlannedReceipts.forEach(
    (receipt, index) => {
      const point =
        Number(
          receipt?.availablePoint
        );

      const materialId =
        String(
          receipt?.materialId
          ?? ''
        );

      const locationId =
        String(
          receipt?.locationId
          ?? DEFAULT_LOCATION_ID
        )
        || DEFAULT_LOCATION_ID;

      const quantity =
        Number(
          receipt?.quantity
        );

      const receiptId =
        String(
          receipt?.receiptId
          ?? `planned-receipt-${index + 1}`
        );

      if (
        !Number.isFinite(point)
        || !materialId
        || !(quantity > epsilon)
      ) {
        diagnostics.push(
          stockDiagnostic(
            'INVALID_STOCK_CONFIGURATION',
            {
              materialId,
              locationId,

              message:
                `A entrada prevista ${receiptId} não possui data, material ou quantidade válidos.`,

              details: {
                receiptId,
                quantity:
                  receipt?.quantity,

                availableDate:
                  receipt?.availableDate
              }
            }
          )
        );

        return;
      }

      if (
        configuredLocations.size
        && !configuredLocations.has(
          locationId
        )
      ) {
        diagnostics.push(
          stockDiagnostic(
            'STOCK_LOCATION_MISMATCH',
            {
              materialId,
              locationId,

              message:
                unconfiguredStockLocationMessage(
                  locationId,
                  receipt
                ),

              details: {
                receiptId,

                configuredLocations:
                  [...configuredLocations]
                    .sort()
              }
            }
          )
        );
      }

      relevantPoints.add(
        point
      );

      addIntent({
        type:
          'PLANNED_RECEIPT',

        point,

        materialId,

        locationId,

        quantity,

        receiptId,

        unit:
          receipt?.unit
          || null,

        allocationIds: [],

        parentOperationIds: [],

        dependencyIds: []
      });
    }
  );

  const transportsById = new Map();
  normalizedTransports.forEach(transport => {
    if (transportsById.has(transport.transportId)) {
      diagnostics.push(stockDiagnostic('STOCK_TRANSPORT_DUPLICATE_EVENT', {
        materialId: transport.materialId, locationId: transport.targetLocation || DEFAULT_LOCATION_ID,
        message: `O transporte ${transport.transportId} possui eventos duplicados.`, details: { transportId: transport.transportId }
      }));
      return;
    }
    transportsById.set(transport.transportId, transport);
    const producerIds = new Set(transport.producerParentOperationIds);
    const profiles = outputProfiles.filter(profile => profile.materialId === transport.materialId && (!producerIds.size || producerIds.has(profile.parentOperationId)));
        const dispatchPoint =
      transport.explicitStart
      ?? pointForQuantity(
        profiles,
        transport.quantity,
        epsilon
      );

    /*
     * MANUAL-05:
     *
     * availabilityMode=start
     * libera o saldo no destino no mesmo
     * instante em que o transporte começa.
     *
     * O intervalo start -> end continua
     * existindo para representação logística.
     */
        const arrivalPoint =
      transport.availabilityMode === 'day-start'
        ? civilDayNumber(
            transport.startDate
          ) * MINUTES_PER_DAY
        : transport.availabilityMode === 'start'
          ? dispatchPoint
          : (
              transport.explicitEnd
              ?? (
                dispatchPoint === null
                  ? null
                  : dispatchPoint
                    + transport.durationMinutes
              )
            );

    const invalidAvailabilityPoint =
      transport.availabilityMode === 'day-start'
        ? (
            arrivalPoint === null
            || dispatchPoint === null
            || !Number.isFinite(arrivalPoint)
          )
        : transport.availabilityMode === 'start'
          ? (
              arrivalPoint === null
              || dispatchPoint === null
              || arrivalPoint
                < dispatchPoint
            )
          : (
              arrivalPoint === null
              || dispatchPoint === null
              || !(
                arrivalPoint
                > dispatchPoint
              )
            );

    if (
      invalidAvailabilityPoint
      || !Number.isFinite(
        transport.quantity
      )
      || transport.quantity <= epsilon
    ) {
      diagnostics.push(stockDiagnostic('INVALID_STOCK_CONFIGURATION', {
        materialId: transport.materialId, locationId: transport.sourceLocation || DEFAULT_LOCATION_ID,
        message: `O transporte ${transport.transportId} não possui intervalo ou quantidade válidos.`, details: { transportId: transport.transportId }
      }));
      return;
    }
    relevantPoints.add(dispatchPoint);
    relevantPoints.add(arrivalPoint);
    addIntent({ type: 'TRANSPORT_DISPATCH', point: dispatchPoint, materialId: transport.materialId, locationId: transport.sourceLocation || DEFAULT_LOCATION_ID, quantity: transport.quantity, transportId: transport.transportId, parentOperationIds: transport.producerParentOperationIds });
    addIntent({ type: 'TRANSPORT_ARRIVAL', point: arrivalPoint, materialId: transport.materialId, locationId: transport.targetLocation || DEFAULT_LOCATION_ID, quantity: transport.quantity, transportId: transport.transportId, parentOperationIds: transport.consumerParentOperationIds });
  });

  const sortedPoints = [...relevantPoints].filter(Number.isFinite).sort((a, b) => a - b);
  const initialPoint = sortedPoints[0] ?? civilDayNumber('0001-01-01') * MINUTES_PER_DAY;
  initialByKey.forEach(item => addIntent({ type: 'INITIAL_STOCK', point: initialPoint, ...item, allocationIds: [], parentOperationIds: [], dependencyIds: [] }));

  outputProfiles.forEach(profile => {
    let previous = 0;
    sortedPoints.filter(point => point >= profile.start && point <= profile.end).forEach(point => {
      const cumulative = profile.quantity * progressAt(profile, point);
      const delta = cumulative - previous;
      previous = cumulative;
      if (delta > epsilon) addIntent({
        type: 'PRODUCTION_AVAILABLE', point, materialId: profile.materialId, locationId: profile.locationId,
        quantity: delta, allocationIds: [profile.allocationId], parentOperationIds: [profile.parentOperationId]
      });
    });
  });
  requirements.forEach(requirement => {
    if (requirement.commitment > epsilon) addIntent({
      type: 'CONSUMPTION_COMMITMENT', point: requirement.start, materialId: requirement.materialId, locationId: requirement.locationId,
      quantity: requirement.commitment, allocationIds: [requirement.allocationId], parentOperationIds: requirement.parentOperationIds,
      dependencyIds: [requirement.dependencyId], requirement
    });
    let previous = 0;
    sortedPoints.filter(point => point >= requirement.start && point <= requirement.end).forEach(point => {
      const cumulative = requirement.required * progressAt(requirement, point);
      const delta = cumulative - previous;
      previous = cumulative;
      if (delta > epsilon) addIntent({
        type: 'MATERIAL_CONSUMPTION', point, materialId: requirement.materialId, locationId: requirement.locationId,
        quantity: delta, allocationIds: [requirement.allocationId], parentOperationIds: requirement.parentOperationIds,
        dependencyIds: [requirement.dependencyId], requirement
      });
    });
  });

  const ledgerKeys = new Set([...initialByKey.keys(), ...minimumByKey.keys(), ...intents.map(intent => `${intent.materialId}\u0000${intent.locationId}`)]);
  ledgerKeys.forEach(key => {
    if (initialByKey.has(key)) return;
    const [materialId, locationId] = key.split('\u0000');
    addIntent({ type: 'INITIAL_STOCK', point: initialPoint, materialId, locationId, quantity: 0, unit: null, allocationIds: [], parentOperationIds: [], dependencyIds: [] });
  });
  const ledgers = new Map([...ledgerKeys].sort().map(key => {
    const [materialId, locationId] = key.split('\u0000');
    return [key, {
      materialId, locationId, unit: materialUnits.get(materialId) || initialByKey.get(key)?.unit || null,
      initialQuantity: initialByKey.get(key)?.quantity || 0, physicalBalance: 0, committedQuantity: 0,
      minimumQuantity: minimumByKey.get(key) || 0, hasMinimum: minimumByKey.has(key), minimumBalance: Infinity, minimumBalanceAt: null,
      firstShortageAt: null, minimumAlerted: false, events: []
    }];
  }));
  const timeline = [];
  const locationMismatchReported = new Set();
  const reportLocationMismatch = (ledger, point, intentsForDemand) => {
    const alternatives = [...ledgers.values()].filter(item => (
      item.materialId === ledger.materialId
      && item.locationId !== ledger.locationId
      && item.physicalBalance - item.committedQuantity > epsilon
    ));
    const signature = `${ledger.materialId}\u0000${ledger.locationId}`;
    if (!alternatives.length || locationMismatchReported.has(signature)) return;
    locationMismatchReported.add(signature);
    diagnostics.push(stockDiagnostic('STOCK_LOCATION_MISMATCH', {
      materialId: ledger.materialId,
      locationId: ledger.locationId,
      point,
      allocationIds: intentsForDemand.flatMap(item => item.allocationIds),
      parentOperationIds: intentsForDemand.flatMap(item => item.parentOperationIds),
      dependencyIds: intentsForDemand.flatMap(item => item.dependencyIds),
      availableQuantity: alternatives.reduce((sum, item) => sum + item.physicalBalance - item.committedQuantity, 0),
      message: `Há saldo de ${ledger.materialId}, mas em local diferente do consumo.`,
      details: { availableLocations: alternatives.map(item => item.locationId).sort(), requiredLocation: ledger.locationId }
    }));
  };
  let eventSequence = 0;
  const recordEvent = (ledger, intent, before, after, details = {}) => {
    eventSequence += 1;
    const point = pointFields(intent.point);
        const signature =
      JSON.stringify([
        point.timestampKey,
        intent.type,
        ledger.materialId,
        ledger.locationId,
        normalizeBoundary(
          intent.quantity || 0,
          precision
        ),
        intent.allocationIds,
        intent.dependencyIds,
        intent.transportId || null,
        intent.receiptId || null,
        eventSequence
      ]);
    const event = {
      eventId: `stock-event:${stableHash(signature)}`,
      ...point,
      type: intent.type,
      materialId: ledger.materialId,
      locationId: ledger.locationId,
      quantity: normalizeBoundary(intent.quantity || 0, precision),
      balanceBefore: normalizeBoundary(before, precision),
      balanceAfter: normalizeBoundary(after, precision),
      allocationIds: unique(intent.allocationIds || []),
      parentOperationIds: unique(intent.parentOperationIds || []),
      dependencyIds: unique(intent.dependencyIds || []),
            transportId:
        intent.transportId
        || null,

      receiptId:
        intent.receiptId
        || null,

      details
    };
    ledger.events.push(event);
    return event;
  };

  const groups = new Map();
  intents.forEach(intent => {
    const key = `${intent.point}\u0000${intent.materialId}\u0000${intent.locationId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(intent);
  });
  [...groups.values()].sort((left, right) => left[0].point - right[0].point || left[0].materialId.localeCompare(right[0].materialId) || left[0].locationId.localeCompare(right[0].locationId)).forEach(batch => {
    const point = batch[0].point;
    const ledger = ledgers.get(`${batch[0].materialId}\u0000${batch[0].locationId}`);
    const eventIds = [];
    const ordered = [...batch].sort((left, right) => EVENT_PRIORITY[left.type] - EVENT_PRIORITY[right.type]
      || JSON.stringify([left.allocationIds, left.dependencyIds, left.transportId]).localeCompare(JSON.stringify([right.allocationIds, right.dependencyIds, right.transportId])));
    for (const priority of [1, 2, 3]) {
      ordered.filter(intent => EVENT_PRIORITY[intent.type] === priority).forEach(intent => {
        const before = ledger.physicalBalance;
        ledger.physicalBalance += intent.quantity;
        eventIds.push(recordEvent(ledger, intent, before, ledger.physicalBalance).eventId);
      });
    }

    const commitments = ordered.filter(intent => intent.type === 'CONSUMPTION_COMMITMENT');
    if (commitments.length) {
      const total = commitments.reduce((sum, item) => sum + item.quantity, 0);
      const available = ledger.physicalBalance - ledger.committedQuantity;
      const reservable = Math.max(Math.min(available, total), 0);
      if (available + epsilon < total) {
        reportLocationMismatch(ledger, point, commitments);
        const affected = commitments.flatMap(item => item.allocationIds);
        diagnostics.push(stockDiagnostic('STOCK_COMMITMENT_SHORTAGE', {
          materialId: ledger.materialId, locationId: ledger.locationId, point,
          allocationIds: affected, parentOperationIds: commitments.flatMap(item => item.parentOperationIds), dependencyIds: commitments.flatMap(item => item.dependencyIds),
          requiredQuantity: total, availableQuantity: Math.max(available, 0), deficitQuantity: Math.max(total - available, 0),
          balanceBefore: available, balanceAfter: available - total,
          message: `O saldo de ${ledger.materialId} não atende aos compromissos simultâneos.`,
          details: { consumers: unique(affected), requiredQuantity: total, availableQuantity: Math.max(available, 0), deficitQuantity: Math.max(total - available, 0), materialId: ledger.materialId, locationId: ledger.locationId }
        }));
      }
      commitments.forEach(intent => {
        const share = total > epsilon ? intent.quantity / total : 0;
        const reserved = reservable * share;
        intent.requirement.reservedRemaining += reserved;
        const before = ledger.physicalBalance - ledger.committedQuantity;
        ledger.committedQuantity += reserved;
        eventIds.push(recordEvent(ledger, intent, before, ledger.physicalBalance - ledger.committedQuantity, { reservedQuantity: normalizeBoundary(reserved, precision) }).eventId);
      });
    }

    const consumptions = ordered.filter(intent => intent.type === 'MATERIAL_CONSUMPTION');
    if (consumptions.length) {
      let released = 0;
      consumptions.forEach(intent => {
        const fromReserve = Math.min(intent.requirement.reservedRemaining, intent.quantity);
        intent.requirement.reservedRemaining -= fromReserve;
        intent.requirement.consumed += intent.quantity;
        released += fromReserve;
      });
      const total = consumptions.reduce((sum, item) => sum + item.quantity, 0);
      const unreserved = total - released;
      const available = ledger.physicalBalance - ledger.committedQuantity;
      const physicalBefore = ledger.physicalBalance;
      ledger.committedQuantity = Math.max(ledger.committedQuantity - released, 0);
      ledger.physicalBalance -= total;
      if (available + epsilon < unreserved || ledger.physicalBalance < -epsilon) {
        reportLocationMismatch(ledger, point, consumptions);
        const affected = consumptions.flatMap(item => item.allocationIds);
        diagnostics.push(stockDiagnostic('STOCK_NEGATIVE_BALANCE', {
          materialId: ledger.materialId, locationId: ledger.locationId, point,
          allocationIds: affected, parentOperationIds: consumptions.flatMap(item => item.parentOperationIds), dependencyIds: consumptions.flatMap(item => item.dependencyIds),
          requiredQuantity: total, availableQuantity: Math.max(physicalBefore, 0), deficitQuantity: Math.max(total - physicalBefore, 0),
          balanceBefore: physicalBefore, balanceAfter: ledger.physicalBalance,
          message: `O consumo simultâneo tornou negativo o saldo de ${ledger.materialId}.`, details: { consumers: unique(affected), unreservedQuantity: unreserved }
        }));
      }
      consumptions.forEach(intent => eventIds.push(recordEvent(ledger, intent, physicalBefore, ledger.physicalBalance, {
        cumulativeConsumed: normalizeBoundary(intent.requirement.consumed, precision)
      }).eventId));
    }

    ordered.filter(intent => intent.type === 'TRANSPORT_DISPATCH').forEach(intent => {
      const available = ledger.physicalBalance - ledger.committedQuantity;
      const before = ledger.physicalBalance;
      if (available + epsilon < intent.quantity) diagnostics.push(stockDiagnostic('STOCK_TRANSPORT_DISPATCH_SHORTAGE', {
        materialId: ledger.materialId, locationId: ledger.locationId, point, parentOperationIds: intent.parentOperationIds,
        requiredQuantity: intent.quantity, availableQuantity: Math.max(available, 0), deficitQuantity: Math.max(intent.quantity - available, 0),
        balanceBefore: before, balanceAfter: before - intent.quantity,
        message: `O transporte ${intent.transportId} não possui saldo integral na origem.`, details: { transportId: intent.transportId }
      }));
      ledger.physicalBalance -= intent.quantity;
      eventIds.push(recordEvent(ledger, intent, before, ledger.physicalBalance).eventId);
    });

    const availableAfter = ledger.physicalBalance - ledger.committedQuantity;
    if (availableAfter < ledger.minimumBalance) {
      ledger.minimumBalance = availableAfter;
      ledger.minimumBalanceAt = pointFields(point).timestampKey;
    }
    if (availableAfter < -epsilon) {
      ledger.firstShortageAt ||= pointFields(point).timestampKey;
      const alert = { type: 'STOCK_SHORTAGE', point, materialId: ledger.materialId, locationId: ledger.locationId, quantity: Math.abs(availableAfter), allocationIds: consumptions.flatMap(item => item.allocationIds), parentOperationIds: consumptions.flatMap(item => item.parentOperationIds), dependencyIds: consumptions.flatMap(item => item.dependencyIds) };
      eventIds.push(recordEvent(ledger, alert, availableAfter, availableAfter).eventId);
    }
    if (!ledger.minimumAlerted && ledger.hasMinimum && availableAfter <= ledger.minimumQuantity + epsilon && availableAfter >= -epsilon) {
      ledger.minimumAlerted = true;
      diagnostics.push(stockDiagnostic('STOCK_MINIMUM_REACHED', {
        materialId: ledger.materialId, locationId: ledger.locationId, point, severity: 'warning', blocking: false,
        availableQuantity: availableAfter, balanceBefore: availableAfter, balanceAfter: availableAfter,
        message: `O saldo de ${ledger.materialId} atingiu o estoque mínimo.`, details: { minimumQuantity: ledger.minimumQuantity }
      }));
      const alert = { type: 'STOCK_MINIMUM_REACHED', point, materialId: ledger.materialId, locationId: ledger.locationId, quantity: 0, allocationIds: [], parentOperationIds: [], dependencyIds: [] };
      eventIds.push(recordEvent(ledger, alert, availableAfter, availableAfter, { minimumQuantity: normalizeBoundary(ledger.minimumQuantity, precision) }).eventId);
    }
    const fields = pointFields(point);
    timeline.push({
      ...fields, materialId: ledger.materialId, locationId: ledger.locationId,
      physicalBalance: normalizeBoundary(ledger.physicalBalance, precision),
      committedQuantity: normalizeBoundary(ledger.committedQuantity, precision),
      availableBalance: normalizeBoundary(availableAfter, precision), eventIds
    });
  });

  const byMaterial = {};
  [...ledgers.values()].sort((left, right) => left.materialId.localeCompare(right.materialId) || left.locationId.localeCompare(right.locationId)).forEach(ledger => {
    byMaterial[ledger.materialId] ||= { unit: ledger.unit, locations: {} };
    byMaterial[ledger.materialId].locations[ledger.locationId] = {
      initialQuantity: normalizeBoundary(ledger.initialQuantity, precision),
      finalPhysicalBalance: normalizeBoundary(ledger.physicalBalance, precision),
      finalCommittedQuantity: normalizeBoundary(ledger.committedQuantity, precision),
      finalAvailableBalance: normalizeBoundary(ledger.physicalBalance - ledger.committedQuantity, precision),
      minimumQuantity: normalizeBoundary(ledger.minimumQuantity, precision),
      minimumBalance: normalizeBoundary(Number.isFinite(ledger.minimumBalance) ? ledger.minimumBalance : ledger.physicalBalance - ledger.committedQuantity, precision),
      minimumBalanceAt: ledger.minimumBalanceAt,
      firstShortageAt: ledger.firstShortageAt,
      events: ledger.events
    };
  });
  const allEvents = [...ledgers.values()].flatMap(ledger => ledger.events);
  const shortageEvents = allEvents.filter(event => event.type === 'STOCK_SHORTAGE');
  const minimumEvents = allEvents.filter(event => event.type === 'STOCK_MINIMUM_REACHED');
  return {
    diagnostics,
    stockConflicts: diagnostics.filter(item => item.code.startsWith('STOCK_') || item.code === 'NEGATIVE_INITIAL_STOCK' || item.code.startsWith('INVALID_STOCK_')),
    stockProjection: {
      byMaterial,
      timeline,
      summary: {
        materialCount: Object.keys(byMaterial).length,
        locationCount: ledgers.size,
        eventCount: allEvents.length,
        shortageCount: shortageEvents.length,
        minimumWarningCount: minimumEvents.length,
        firstShortageAt: shortageEvents.map(event => event.timestampKey).sort()[0] || null,
        materialsWithShortage: unique(shortageEvents.map(event => event.materialId))
      }
    },
    precision,
    epsilon
  };
}
