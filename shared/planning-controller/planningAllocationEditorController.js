import { applyManualScheduleTransaction } from '../../services/manualScheduleTransaction.service.js';

function findDraftAllocation(draft, allocationId) {
  const normalizedId = String(allocationId || '');
  return (draft?.allocations || []).find(allocation => (
    String(allocation?.allocationId || '') === normalizedId
  )) || null;
}

function numericQuantityChanged(current, quantity) {
  const requestedQuantity = Number(quantity);
  return Number.isFinite(requestedQuantity)
    && Math.abs(requestedQuantity - Number(current?.quantity || 0)) > 0.000001;
}

export function buildPlanningAllocationEditorOperation({
  mode,
  currentAllocation,
  machineId,
  peopleCount,
  quantity,
  date,
  startTime,
  relativePercents,
  partEdits
} = {}) {
  if (!currentAllocation?.allocationId) throw new Error('Allocation nao informada para edicao.');
  const isSplit = mode === 'split';
  if (isSplit) {
    return {
      mode: 'split',
      intent: {
        type: 'SPLIT_ALLOCATION',
        allocationId: currentAllocation.allocationId,
        relativePercents,
        partEdits
      }
    };
  }

  const requestedQuantity = Number(quantity);
  const quantityChanged = numericQuantityChanged(currentAllocation, quantity);
  if (String(currentAllocation.machineId) === String(machineId)
    && Number(currentAllocation.peopleCount) === Number(peopleCount)
    && String(currentAllocation.date) === String(date)
    && String(currentAllocation.startTime) === String(startTime)
    && !quantityChanged) {
    return null;
  }

  return {
    mode: 'edit',
    quantityChanged,
    requestedQuantity,
    intent: {
      type: 'EDIT_ALLOCATION',
      allocationId: currentAllocation.allocationId,
      machineId,
      peopleCount,
      quantity: quantityChanged ? requestedQuantity : undefined,
      date,
      startTime
    }
  };
}

export async function runPlanningAllocationEditorController({
  currentDraft,
  editRequest = {},
  draftContext = {},
  validationContext = {},
  decisions = {},
  applyTransaction = applyManualScheduleTransaction,
  onAccepted
} = {}) {
  if (!currentDraft) throw new Error('Rascunho manual indisponivel para edicao.');
  const currentAllocation = findDraftAllocation(currentDraft, editRequest.allocation?.allocationId);
  if (!currentAllocation) {
    return { accepted: false, status: 'stale', message: 'Este bloco foi atualizado. Feche o modal e tente novamente.' };
  }

  const operation = buildPlanningAllocationEditorOperation({
    ...editRequest,
    currentAllocation
  });
  if (!operation) return { accepted: true, status: 'unchanged' };

  const transaction = applyTransaction({
    currentDraft,
    intent: operation.intent,
    draftContext,
    validationContext,
    decisions
  });
  if (!transaction.accepted) {
    return {
      accepted: false,
      status: 'rejected',
      transaction,
      operation,
      message: transaction.blockingIssues?.[0]?.message || 'As alteracoes nao passaram pela validacao localizada.'
    };
  }

  await onAccepted?.(transaction, { operation });
  return { accepted: true, status: 'accepted', transaction, operation };
}
