const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hasNaNValue(allocation) {
  return Object.values(allocation).some(value => typeof value === 'number' && Number.isNaN(value));
}

function buildError(index, code, message, allocationId = null) {
  return {
    index,
    allocationId,
    code,
    message
  };
}

/**
 * Validates allocations before rendering the isolated production calendar.
 *
 * @param {Array<Object>} allocations
 * @returns {{valid: boolean, errors: Array<Object>}}
 */
export function validateProductionCalendarAllocations(allocations = []) {
  const errors = [];
  const seenAllocationIds = new Set();

  allocations.forEach((allocation, index) => {
    const allocationId = allocation?.allocationId ?? null;

    if (!allocation || typeof allocation !== 'object') {
      errors.push(buildError(index, 'allocation.invalid', 'Alocacao invalida.', allocationId));
      return;
    }

    if (allocationId === null || allocationId === '') {
      errors.push(buildError(index, 'allocationId.missing', 'allocationId ausente.', allocationId));
    } else if (seenAllocationIds.has(String(allocationId))) {
      errors.push(buildError(index, 'allocationId.duplicate', `allocationId duplicado: ${allocationId}.`, allocationId));
    } else {
      seenAllocationIds.add(String(allocationId));
    }

    if (!allocation.operationId) {
      errors.push(buildError(index, 'operationId.missing', 'operationId ausente.', allocationId));
    }

    if (!allocation.machineId) {
      errors.push(buildError(index, 'machineId.missing', 'machineId ausente.', allocationId));
    }

    if (!isValidCalendarDate(allocation.date)) {
      errors.push(buildError(index, 'date.invalid', 'Data invalida.', allocationId));
    }

    if (hasNaNValue(allocation)) {
      errors.push(buildError(index, 'number.nan', 'Valor numerico NaN encontrado.', allocationId));
    }

    if (!Number.isFinite(Number(allocation.quantity)) || Number(allocation.quantity) <= 0) {
      errors.push(buildError(index, 'quantity.invalid', 'quantity deve ser maior que zero.', allocationId));
    }

    if (!Number.isFinite(Number(allocation.durationMinutes)) || Number(allocation.durationMinutes) <= 0) {
      errors.push(buildError(index, 'durationMinutes.invalid', 'durationMinutes deve ser maior que zero.', allocationId));
    }

    if (Number.isFinite(Number(allocation.capacityPercent)) && Number(allocation.capacityPercent) < 0) {
      errors.push(buildError(index, 'capacityPercent.negative', 'Percentual negativo nao permitido.', allocationId));
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
