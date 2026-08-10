import { applyManualScheduleTransaction } from '../../services/manualScheduleTransaction.service.js';

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isValidDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10));
}

function findDraftAllocation(draft, allocationId) {
  const normalizedId = String(allocationId || '');
  return (draft?.allocations || []).find(allocation => (
    String(allocation?.allocationId || '') === normalizedId
  )) || null;
}

export function buildPlanningManualMoveOperation({ intent, move, moveConfiguration } = {}) {
  if (!intent || intent.type !== 'MOVE_ALLOCATION') throw new Error('Intencao de movimentacao manual invalida.');
  if (!move?.allocation?.allocationId) throw new Error('Allocation nao informada para movimentacao.');
  if (!moveConfiguration) return null;

  const targetDate = String(moveConfiguration.date || intent?.to?.date || '').slice(0, 10);
  const targetMachineId = String(moveConfiguration.machineId || intent?.to?.machineId || '');
  if (!isValidDateOnly(targetDate)) throw new Error('Destino sem data valida.');
  if (!targetMachineId) throw new Error('Destino sem maquina.');

  const nextIntent = {
    ...intent,
    to: {
      ...(intent.to || {}),
      date: targetDate,
      machineId: targetMachineId
    },
    peopleCount: moveConfiguration.peopleCount
  };
  const nextMove = {
    ...move,
    machine: {
      ...(move.machine || {}),
      machineId: targetMachineId,
      machineName: moveConfiguration.machineName || move?.machine?.machineName
    }
  };
  const baseMoveIntent = {
    type: 'MOVE_ALLOCATION',
    allocationId: move.allocation.allocationId,
    targetDate,
    targetMachineId,
    peopleCount: moveConfiguration.peopleCount,
    source: intent.source,
    manualMovePolicy: 'stock_only_independent'
  };

  return {
    intent: nextIntent,
    move: nextMove,
    baseMoveIntent,
    targetDate,
    targetMachineId,
    productivityRows: moveConfiguration.productivityRows || null
  };
}

export async function runPlanningManualMoveController({
  currentDraft,
  intent,
  move,
  moveConfiguration,
  calendarSnapshot = {},
  validationContext = {},
  draftContext = {},
  applyTransaction = applyManualScheduleTransaction,
  onAccepted,
  onStockUnavailable,
  onBeforePartialChoice,
  onStockPartialChoice
} = {}) {
  if (!currentDraft) throw new Error('Rascunho manual indisponivel para movimentacao.');
  const operation = buildPlanningManualMoveOperation({ intent, move, moveConfiguration });
  if (!operation) return { accepted: false, status: 'cancelled' };
  if (!findDraftAllocation(currentDraft, operation.baseMoveIntent.allocationId)) {
    throw new Error('Allocation nao encontrada no rascunho manual.');
  }

  const effectiveDraftContext = {
    ...draftContext,
    machines: draftContext.machines || calendarSnapshot.machines || [],
    matrixRows: operation.productivityRows || draftContext.matrixRows || [],
    days: draftContext.days || calendarSnapshot.days || []
  };
  const runMoveTransaction = extraIntent => applyTransaction({
    currentDraft,
    intent: { ...operation.baseMoveIntent, ...(extraIntent || {}) },
    draftContext: effectiveDraftContext,
    validationContext
  });

  const fullTransaction = runMoveTransaction();
  if (fullTransaction.accepted) {
    await onAccepted?.(fullTransaction, { operation, mode: 'full' });
    return { accepted: true, status: 'accepted', transaction: fullTransaction, operation };
  }

  const analysis = {
    ...(fullTransaction.validation?.manualMoveStockAnalysis || {
      stockIssues: fullTransaction.blockingIssues || [],
      maxQuantity: 0
    }),
    validation: fullTransaction.validation
  };
  const maxQuantity = Number(analysis.maxQuantity || 0);
  if (!(maxQuantity > 0)) {
    await onStockUnavailable?.({
      allocation: operation.move.allocation,
      date: operation.targetDate,
      analysis,
      transaction: fullTransaction,
      operation
    });
    return { accepted: false, status: 'rejected', transaction: fullTransaction, analysis, operation };
  }

  await onBeforePartialChoice?.({ operation, analysis, transaction: fullTransaction });
  const horizonDates = (calendarSnapshot.days || [])
    .map(day => String(day?.date || '').slice(0, 10))
    .filter(date => isValidDateOnly(date) && date !== operation.targetDate);
  const dateTransactionsByQuantity = new Map();
  const dateOptionsForQuantity = quantity => {
    const acceptedQuantity = Math.floor(Math.max(Number(quantity || 0), 0));
    if (dateTransactionsByQuantity.has(acceptedQuantity)) return dateTransactionsByQuantity.get(acceptedQuantity);
    const options = [];
    const transactions = new Map();
    for (const date of horizonDates) {
      const transaction = runMoveTransaction({ quantity: acceptedQuantity, remainderDate: date });
      if (transaction.accepted) {
        transactions.set(date, transaction);
        options.push({ date, viable: true });
      } else {
        options.push({
          date,
          viable: false,
          reason: transaction.blockingIssues?.[0]?.message || transaction.validation?.errors?.[0]?.message || 'Sem estoque suficiente para o restante.'
        });
      }
    }
    const result = { options, transactions };
    dateTransactionsByQuantity.set(acceptedQuantity, result);
    return result;
  };

  const partialChoice = await onStockPartialChoice?.({
    allocation: operation.move.allocation,
    date: operation.targetDate,
    analysis,
    getDateOptions: async quantity => dateOptionsForQuantity(quantity).options,
    operation,
    transaction: fullTransaction
  });
  const acceptedQuantity = Math.floor(Number(partialChoice?.quantity || 0));
  if (!(acceptedQuantity > 0)) return { accepted: false, status: 'cancelled', transaction: fullTransaction, analysis, operation };

  const allocationQuantity = Math.floor(Number(operation.move.allocation.quantity || 0));
  const remainderQuantity = Math.max(allocationQuantity - acceptedQuantity, 0);
  if (!(remainderQuantity > 0)) {
    const partialTransaction = runMoveTransaction({ quantity: acceptedQuantity });
    if (!partialTransaction.accepted) {
      throw new Error(partialTransaction.blockingIssues?.[0]?.message || 'Movimento recusado por estoque.');
    }
    await onAccepted?.(partialTransaction, { operation, mode: 'partial' });
    return { accepted: true, status: 'accepted', transaction: partialTransaction, operation };
  }

  const remainderDate = partialChoice?.remainderDate;
  if (!remainderDate) return { accepted: false, status: 'cancelled', transaction: fullTransaction, analysis, operation };
  const cachedDates = dateOptionsForQuantity(acceptedQuantity);
  const splitTransaction = cachedDates.transactions.get(remainderDate)
    || runMoveTransaction({ quantity: acceptedQuantity, remainderDate });
  if (!splitTransaction.accepted) {
    throw new Error(splitTransaction.blockingIssues?.[0]?.message || 'A data escolhida nao possui estoque suficiente para o restante.');
  }
  await onAccepted?.(splitTransaction, { operation, mode: 'partial_split' });
  return { accepted: true, status: 'accepted', transaction: splitTransaction, operation };
}

export function clonePlanningManualMoveValue(value) {
  return clone(value);
}
