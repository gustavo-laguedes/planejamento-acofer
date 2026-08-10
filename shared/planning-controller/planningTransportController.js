import { isValidDateOnly } from '../planning-date/planningCivilDate.js';
import { formatPtBrDecimal, parsePtBrDecimal } from '../planning-presentation/planningFormatters.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stripDailyOperationSuffix(value) {
  return String(value || '').replace(/:day-\d+$/i, '');
}

function productionCalendarParentOperationId(allocation = {}) {
  return String(
    allocation.calendarParentOperationId
    || allocation.parentOperationId
    || stripDailyOperationSuffix(allocation.operationId)
    || ''
  );
}

export function manualTransportIdFor(allocation = {}) {
  return [
    'manual-transport',
    productionCalendarParentOperationId(allocation).replace(/[^a-z0-9_-]+/gi, '_'),
    String(allocation.materialId || '').replace(/[^a-z0-9_-]+/gi, '_'),
    String(allocation.allocationId || '').replace(/[^a-z0-9_-]+/gi, '_')
  ].join(':');
}

export function manualTransportConstraints(sourceDraft = {}) {
  return (sourceDraft?.constraints || []).filter(constraint => constraint?.type === 'MANUAL_TRANSPORT');
}

export function manualTransportForAllocation(allocation = {}, sourceDraft = {}) {
  const expectedTransportId = manualTransportIdFor(allocation);
  const parentOperationId = productionCalendarParentOperationId(allocation);
  const allocationIds = new Set([
    allocation.allocationId,
    ...(allocation.sourceAllocationIds || [])
  ].map(String).filter(Boolean));
  return manualTransportConstraints(sourceDraft).find(constraint => (
    (
      String(constraint.transportId || '') === expectedTransportId
      || allocationIds.has(String(constraint.producerAllocationId || ''))
      || (constraint.producerSourceAllocationIds || []).some(allocationId => allocationIds.has(String(allocationId || '')))
    )
    && String(constraint.producerParentOperationId || '') === parentOperationId
    && String(constraint.materialId || '') === String(allocation.materialId || '')
  )) || null;
}

function productionCalendarMembershipsForScope(allocation = {}) {
  const memberships = Array.isArray(allocation.productionMemberships) && allocation.productionMemberships.length
    ? allocation.productionMemberships
    : [{
        productionId: allocation.productionId,
        productionIndex: allocation.productionIndex,
        productionStage: allocation.productionStage
      }];
  const normalizedMemberships = memberships.map(membership => ({
    productionId: String(membership.productionId ?? membership.productionKey ?? ''),
    productionIndex: Number(membership.productionIndex),
    productionStage: Number(membership.productionStage)
  })).filter(membership => (
    (membership.productionId || Number.isFinite(membership.productionIndex))
    && Number.isFinite(membership.productionStage)
  ));
  const directProductionId = String(allocation.productionId ?? allocation.productionKey ?? '');
  const directProductionIndex = Number(allocation.productionIndex);
  const directMemberships = normalizedMemberships.filter(membership => (
    (directProductionId && membership.productionId === directProductionId)
    || (Number.isFinite(directProductionIndex) && membership.productionIndex === directProductionIndex)
  ));
  if (directMemberships.length) return directMemberships;
  return normalizedMemberships.length > 1 ? [normalizedMemberships[0]] : normalizedMemberships;
}

function productionCalendarCandidateMatchesDownstreamMembership(sourceAllocation = {}, candidate = {}) {
  const sourceParentId = productionCalendarParentOperationId(sourceAllocation);
  const candidateParentId = productionCalendarParentOperationId(candidate);
  const sameMaterial = String(sourceAllocation.materialId || '') === String(candidate.materialId || '')
    || String(sourceAllocation.materialName || '').trim().toLocaleLowerCase('pt-BR') === String(candidate.materialName || '').trim().toLocaleLowerCase('pt-BR');
  if (sourceParentId && candidateParentId && sourceParentId !== candidateParentId && sameMaterial) return false;
  const sourceMemberships = productionCalendarMembershipsForScope(sourceAllocation);
  const candidateMemberships = productionCalendarMembershipsForScope(candidate);
  return sourceMemberships.some(source => candidateMemberships.some(target => {
    const sameProduction = source.productionId && target.productionId
      ? source.productionId === target.productionId
      : Number.isFinite(source.productionIndex) && source.productionIndex === target.productionIndex;
    return sameProduction && target.productionStage > source.productionStage;
  }));
}

function productionCalendarFallbackDownstreamParentIds(allocation = {}, { sourceDraft = {}, immediate = false } = {}) {
  const candidates = (sourceDraft?.allocations || [])
    .filter(item => productionCalendarCandidateMatchesDownstreamMembership(allocation, item))
    .map(item => ({
      parentOperationId: productionCalendarParentOperationId(item),
      stage: Math.min(...productionCalendarMembershipsForScope(item).map(membership => membership.productionStage))
    }))
    .filter(item => item.parentOperationId && Number.isFinite(item.stage));
  if (!immediate || !candidates.length) return [...new Set(candidates.map(item => item.parentOperationId))];
  const firstStage = Math.min(...candidates.map(item => item.stage));
  return [...new Set(candidates
    .filter(item => item.stage === firstStage)
    .map(item => item.parentOperationId))];
}

function productionCalendarParentMatchesDownstreamScope(sourceAllocation = {}, parentOperationId = '', sourceDraft = {}) {
  return (sourceDraft?.allocations || [])
    .some(item => (
      productionCalendarParentOperationId(item) === String(parentOperationId || '')
      && productionCalendarCandidateMatchesDownstreamMembership(sourceAllocation, item)
    ));
}

function productionCalendarHasDownstreamScope(allocation = {}) {
  return productionCalendarMembershipsForScope(allocation).length > 0;
}

export function productionCalendarSuccessorParentIds(allocation = {}, { sourceDraft = {}, dependencies = [] } = {}) {
  if (productionCalendarHasDownstreamScope(allocation)) {
    return productionCalendarFallbackDownstreamParentIds(allocation, { sourceDraft, immediate: true });
  }
  const parentOperationId = productionCalendarParentOperationId(allocation);
  const dependencySuccessors = (dependencies || [])
    .filter(dependency => String(
      dependency.producerParentOperationId
      || dependency.predecessorParentOperationId
      || dependency.sourceParentOperationId
      || dependency.producerOperationId
      || ''
    ) === parentOperationId)
    .map(dependency => String(
      dependency.consumerParentOperationId
      || dependency.successorParentOperationId
      || dependency.targetParentOperationId
      || dependency.consumerOperationId
      || ''
    ))
    .filter(Boolean);
  if (dependencySuccessors.length) {
    const scopedSuccessors = dependencySuccessors
      .filter(parentId => productionCalendarParentMatchesDownstreamScope(allocation, parentId, sourceDraft));
    return [...new Set(scopedSuccessors.length ? scopedSuccessors : dependencySuccessors)];
  }

  return productionCalendarFallbackDownstreamParentIds(allocation, { sourceDraft, immediate: true });
}

export function productionCalendarDownstreamParentIds(allocation = {}, { sourceDraft = {}, dependencies = [] } = {}) {
  if (productionCalendarHasDownstreamScope(allocation)) {
    return productionCalendarFallbackDownstreamParentIds(allocation, { sourceDraft });
  }
  const rootParentId = productionCalendarParentOperationId(allocation);
  const childrenByParent = new Map();
  (dependencies || []).forEach(dependency => {
    const producer = String(
      dependency.producerParentOperationId
      || dependency.predecessorParentOperationId
      || dependency.sourceParentOperationId
      || dependency.producerOperationId
      || ''
    );
    const consumer = String(
      dependency.consumerParentOperationId
      || dependency.successorParentOperationId
      || dependency.targetParentOperationId
      || dependency.consumerOperationId
      || ''
    );
    if (!producer || !consumer) return;
    if (!childrenByParent.has(producer)) childrenByParent.set(producer, []);
    childrenByParent.get(producer).push(consumer);
  });
  const result = [];
  const queue = [...(childrenByParent.get(rootParentId) || [])];
  const seen = new Set([rootParentId]);
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    queue.push(...(childrenByParent.get(current) || []));
  }
  if (result.length) {
    const scopedResult = result
      .filter(parentId => productionCalendarParentMatchesDownstreamScope(allocation, parentId, sourceDraft));
    return scopedResult.length ? scopedResult : result;
  }

  return productionCalendarFallbackDownstreamParentIds(allocation, { sourceDraft });
}

function manualTransportBaseDateTime(allocation = {}) {
  return new Date(`${String(allocation.date || today()).slice(0, 10)}T${String(allocation.endTime || allocation.startTime || '07:00').slice(0, 5)}:00`);
}

export function transportArrivalDateFromHours(allocation, hours) {
  const parsedHours = parsePtBrDecimal(hours, NaN);
  if (!Number.isFinite(parsedHours) || parsedHours < 0) return '';
  const date = manualTransportBaseDateTime(allocation);
  date.setMinutes(date.getMinutes() + Math.round(parsedHours * 60));
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function transportHoursForArrivalDate(allocation, arrivalDate) {
  if (!isValidDateOnly(arrivalDate)) return '';
  const base = manualTransportBaseDateTime(allocation);
  const arrival = new Date(`${String(arrivalDate).slice(0, 10)}T${String(allocation.endTime || allocation.startTime || '07:00').slice(0, 5)}:00`);
  const hours = Math.max((arrival.getTime() - base.getTime()) / 3600000, 0);
  return Number.isInteger(hours) ? String(hours) : formatPtBrDecimal(Number(hours.toFixed(2)));
}

export function applyManualTransportConstraints({
  sourceDraft = {},
  allocation = {},
  arrivalDate = null,
  hours = null,
  dependencies = [],
  now = () => new Date()
} = {}) {
  const baseDraft = sourceDraft && typeof sourceDraft === 'object' ? sourceDraft : {};
  const transportId = manualTransportIdFor(allocation);
  const producerParentOperationId = productionCalendarParentOperationId(allocation);
  const legacyTransportIds = new Set((baseDraft?.constraints || [])
    .filter(constraint => (
      constraint?.type === 'MANUAL_TRANSPORT'
      && !String(constraint.producerAllocationId || '')
      && String(constraint.producerParentOperationId || '') === producerParentOperationId
      && String(constraint.materialId || '') === String(allocation.materialId || '')
    ))
    .map(constraint => String(constraint.transportId || ''))
    .filter(Boolean));
  const constraints = (baseDraft?.constraints || [])
    .filter(constraint => {
      if (String(constraint.transportId || '') === transportId) return false;
      if (legacyTransportIds.has(String(constraint.transportId || ''))) return false;
      const isLegacyBroadTransport = constraint?.type === 'MANUAL_TRANSPORT'
        && !String(constraint.producerAllocationId || '')
        && String(constraint.producerParentOperationId || '') === producerParentOperationId
        && String(constraint.materialId || '') === String(allocation.materialId || '');
      return !isLegacyBroadTransport;
    });
  if (!arrivalDate) return { ...baseDraft, constraints };
  const scopeOptions = { sourceDraft: baseDraft, dependencies };
  const consumerParentOperationIds = productionCalendarSuccessorParentIds(allocation, scopeOptions);
  const affectedParentOperationIds = productionCalendarDownstreamParentIds(allocation, scopeOptions);
  const record = {
    type: 'MANUAL_TRANSPORT',
    transportId,
    parentOperationId: consumerParentOperationIds[0] || producerParentOperationId,
    producerParentOperationId,
    producerAllocationId: String(allocation.allocationId || ''),
    producerSourceAllocationIds: [...new Set([
      allocation.allocationId,
      ...(allocation.sourceAllocationIds || [])
    ].map(String).filter(Boolean))],
    consumerParentOperationIds,
    affectedParentOperationIds,
    materialId: String(allocation.materialId || ''),
    materialName: String(allocation.materialName || ''),
    arrivalDate,
    hours: hours === null || hours === '' ? transportHoursForArrivalDate(allocation, arrivalDate) : String(hours),
    createdAt: now().toISOString()
  };
  const producerPins = [
    {
      type: 'PIN_MACHINE',
      transportId,
      parentOperationId: producerParentOperationId,
      machineId: allocation.machineId,
      machineName: allocation.machineName,
      source: 'manual-transport-producer'
    },
    {
      type: 'PIN_START',
      transportId,
      parentOperationId: producerParentOperationId,
      date: allocation.date,
      time: allocation.startTime || '07:00',
      source: 'manual-transport-producer'
    }
  ];
  const startPins = consumerParentOperationIds.map(parentOperationId => ({
    type: 'MIN_START',
    transportId,
    parentOperationId,
    date: arrivalDate,
    time: '07:00',
    source: 'manual-transport'
  }));
  return { ...baseDraft, constraints: [...constraints, record, ...producerPins, ...startPins] };
}

export function withManualTransportPresentation(allocations = [], sourceDraft = {}) {
  return allocations.map(allocation => {
    const transport = manualTransportForAllocation(allocation, sourceDraft);
    return transport ? {
      ...allocation,
      manualTransport: {
        transportId: transport.transportId,
        arrivalDate: transport.arrivalDate,
        hours: transport.hours,
        consumerParentOperationIds: transport.consumerParentOperationIds || [],
        affectedParentOperationIds: transport.affectedParentOperationIds || []
      }
    } : allocation;
  });
}

export function buildManualTransportScopeParentIds({ sourceDraft = {}, allocation = {}, dependencies = [] } = {}) {
  const scopeOptions = { sourceDraft, dependencies };
  const downstreamTransportScopeParentIds = [
    ...productionCalendarSuccessorParentIds(allocation, scopeOptions),
    ...productionCalendarDownstreamParentIds(allocation, scopeOptions)
  ].map(String).filter(Boolean);
  return [...new Set(
    downstreamTransportScopeParentIds.length
      ? downstreamTransportScopeParentIds
      : [productionCalendarParentOperationId(allocation)].map(String).filter(Boolean)
  )];
}

export function validateManualTransportInput(current = {}, arrivalDate = '', hours = null) {
  const normalizedArrivalDate = String(arrivalDate || '').slice(0, 10);
  if (normalizedArrivalDate && !isValidDateOnly(normalizedArrivalDate)) {
    return { accepted: false, message: 'Informe uma data estimada valida para chegada.', normalizedArrivalDate };
  }
  if (normalizedArrivalDate && normalizedArrivalDate < String(current.date || '').slice(0, 10)) {
    return { accepted: false, message: 'A chegada estimada deve ser igual ou posterior ao dia desta etapa.', normalizedArrivalDate };
  }
  if (String(hours ?? '').trim() && !(parsePtBrDecimal(hours, NaN) >= 0)) {
    return { accepted: false, message: 'Informe um tempo de transporte valido em horas.', normalizedArrivalDate };
  }
  return { accepted: true, normalizedArrivalDate };
}

export async function savePlanningManualTransport({
  canWritePlanning = false,
  manualScheduleDraft = null,
  currentSimulation = null,
  allocation = null,
  arrivalDate = null,
  hours = null,
  withOperationLoading = async (label, action) => action(),
  reoptimizeProductionCalendarConstraints,
  applyManualScheduleTransaction,
  currentManualScheduleValidationContextWithFreshStock,
  acceptRecalculatedCalendar,
  toast = () => {},
  productionCalendarReoptimizationErrorMessage = error => error?.message || '',
  now = () => new Date()
} = {}) {
  if (!canWritePlanning || !manualScheduleDraft || !allocation) return { accepted: false };
  const current = (manualScheduleDraft.allocations || [])
    .find(item => String(item.allocationId) === String(allocation.allocationId));
  if (!current) return { accepted: false, message: 'Este bloco foi atualizado. Feche o modal e tente novamente.' };
  const validation = validateManualTransportInput(current, arrivalDate, hours);
  if (!validation.accepted) return validation;
  const { normalizedArrivalDate } = validation;
  try {
    return await withOperationLoading('Recalculando transporte...', async () => {
      const transportScopeParentIds = buildManualTransportScopeParentIds({
        sourceDraft: manualScheduleDraft,
        allocation: current,
        dependencies: currentSimulation?.dependencies || []
      });
      const constrainedDraft = applyManualTransportConstraints({
        sourceDraft: manualScheduleDraft,
        allocation: current,
        arrivalDate: normalizedArrivalDate || null,
        hours,
        dependencies: currentSimulation?.dependencies || [],
        now
      });
      const recalculated = reoptimizeProductionCalendarConstraints({
        date: current.date,
        time: current.startTime || '00:00',
        dailyTeamOverrides: constrainedDraft.dailyTeamOverrides || {},
        manualWorkDates: constrainedDraft.manualWorkDates || [],
        scopeParentOperationIds: transportScopeParentIds,
        acceptedDraft: constrainedDraft
      });
      if (!recalculated.accepted) {
        const primaryError = recalculated.diagnostics?.errors?.[0] || null;
        console.warn('Falha ao recalcular transporte manual', {
          allocationId: current.allocationId,
          materialId: current.materialId,
          materialName: current.materialName,
          machineId: current.machineId,
          machineName: current.machineName,
          transportScopeParentIds,
          diagnostics: recalculated.diagnostics?.errors || [],
          blockingRegressions: recalculated.blockingRegressions || []
        });
        return {
          accepted: false,
          message: recalculated.blockingRegressions?.[0]?.message
            || productionCalendarReoptimizationErrorMessage(primaryError)
            || 'Nao foi possivel recalcular a cadeia com este transporte.'
        };
      }
      const transaction = applyManualScheduleTransaction({
        currentDraft: manualScheduleDraft,
        intent: {
          type: 'SET_DAILY_TEAM_OVERRIDES',
          date: current.date,
          overrides: {},
          allocationId: current.allocationId,
          parentOperationId: productionCalendarParentOperationId(current),
          cutoffDate: current.date,
          cutoffSnapshot: recalculated.cutoffSnapshot,
          previousDiagnostics: recalculated.previousDiagnostics,
          diagnosticDelta: recalculated.diagnosticDelta,
          candidateAllocations: recalculated.allocations,
          candidateDraft: recalculated.manualScheduleDraft
        },
        draftContext: { validatedAt: now().toISOString() },
        validationContext: await currentManualScheduleValidationContextWithFreshStock()
      });
      if (!transaction.accepted) {
        return {
          accepted: false,
          message: transaction.blockingIssues?.[0]?.message || 'O transporte nao pode ser aplicado ao calendario.'
        };
      }
      acceptRecalculatedCalendar({ recalculated, transaction });
      toast(normalizedArrivalDate ? 'Transporte registrado e cadeia recalculada.' : 'Transporte removido e cadeia recalculada.');
      return { accepted: true };
    });
  } catch (error) {
    return { accepted: false, message: error?.message || 'Nao foi possivel recalcular o transporte.' };
  }
}
