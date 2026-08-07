import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageValues = new Map();
globalThis.sessionStorage = {
  getItem(key) { return storageValues.has(String(key)) ? storageValues.get(String(key)) : null; },
  setItem(key, value) { storageValues.set(String(key), String(value)); },
  removeItem(key) { storageValues.delete(String(key)); }
};
globalThis.localStorage = globalThis.sessionStorage;
globalThis.window = {
  setInterval: () => 0,
  clearInterval() {},
  addEventListener() {},
  removeEventListener() {},
  location: { hostname: 'localhost' }
};

const { buildManualStockMoveModalModel } = await import('../pages/PlanningPage.js');

const allocation = {
  allocationId: 'allocation-eq45',
  productionId: 'production-0',
  productionIndex: 0,
  productionTitle: 'ProduÃ§Ã£o 1 / 3',
  parentOperationId: 'op:eq45',
  materialId: 'EQ45',
  materialName: 'EQ-45',
  date: '2026-07-30',
  quantity: 700,
  unit: 'un'
};

const componentsModel = buildManualStockMoveModalModel({
  allocation,
  destinationDate: '2026-07-28',
  operations: [{
    operationId: 'op:eq45',
    materialId: 'EQ45',
    dependencyRequirements: [
      { materialId: 'LONG34', requiredQuantity: 7000, unit: 'un' },
      { materialId: 'TRANS34', requiredQuantity: 10500, unit: 'un' }
    ]
  }],
  materials: [
    { id: 'EQ45', name: 'EQ-45', primaryUnit: 'un' },
    { id: 'LONG34', name: '3,4 Longitudinal - 3m', primaryUnit: 'un' },
    { id: 'TRANS34', name: '3,4 Transversal - 2m', primaryUnit: 'un' }
  ],
  allocations: [allocation],
  analysis: {
    maxQuantity: 504.733,
    stockIssues: [
      { materialIds: ['LONG34'], requiredQuantity: 7000, availableQuantity: 5047.33, deficitQuantity: 1952.67 },
      { materialIds: ['TRANS34'], requiredQuantity: 10500, availableQuantity: 9000, deficitQuantity: 1500 }
    ]
  }
});

assert.equal(componentsModel.productionTitle, 'ProduÃ§Ã£o 1 / 3');
assert.equal(componentsModel.materialName, 'EQ-45');
assert.equal(componentsModel.sourceDate, '2026-07-30');
assert.equal(componentsModel.destinationDate, '2026-07-28');
assert.equal(componentsModel.originalQuantity, 700);
assert.equal(componentsModel.maxQuantity, 504, 'maximo decimal deve usar piso operacional');
assert.equal(componentsModel.remainingQuantity, 196, 'restante deve ser recalculado pelo maximo inteiro');
assert.deepEqual(componentsModel.components.map(item => item.materialName), [
  '3,4 Longitudinal - 3m',
  '3,4 Transversal - 2m'
]);
assert.equal(componentsModel.components[0].requiredQuantity, 7000);
assert.equal(componentsModel.components[0].availableQuantity, 5047.33);
assert.equal(Number(componentsModel.components[0].deficitQuantity.toFixed(2)), 1952.67);
assert.equal(componentsModel.components[0].possibleQuantity, 504.733);
assert.equal(componentsModel.components[1].requiredQuantity, 10500);
assert.equal(componentsModel.components[1].availableQuantity, 9000);
assert.equal(componentsModel.components[1].deficitQuantity, 1500);
assert.equal(componentsModel.components[1].possibleQuantity, 600);

const friendlyFallback = buildManualStockMoveModalModel({
  allocation: { ...allocation, productionTitle: '', productionIndex: 1 },
  destinationDate: '2026-07-28',
  operations: [],
  allocations: [],
  analysis: { maxQuantity: 1, stockIssues: [] }
});
assert.equal(friendlyFallback.productionTitle, 'Produção 2');
assert.notEqual(friendlyFallback.productionTitle, 'production-0');

const proportional = buildManualStockMoveModalModel({
  allocation: { ...allocation, quantity: 350 },
  destinationDate: '2026-07-28',
  operations: [{
    operationId: 'op:eq45',
    materialId: 'EQ45',
    dependencyRequirements: [{ materialId: 'LONG34', requiredQuantity: 7000, unit: 'un' }]
  }],
  materials: [{ id: 'LONG34', name: '3,4 Longitudinal - 3m', primaryUnit: 'un' }],
  allocations: [{ ...allocation, allocationId: 'part-a', quantity: 350 }, { ...allocation, allocationId: 'part-b', quantity: 350 }],
  analysis: { maxQuantity: 300, stockIssues: [{ materialIds: ['LONG34'], availableQuantity: 2000 }] }
});
assert.equal(proportional.components[0].requiredQuantity, 3500, 'consumo deve respeitar a fracao da allocation dentro da operacao pai');
assert.equal(Math.floor(proportional.components[0].possibleQuantity), 200);

const source = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const modalStart = source.indexOf('function openManualStockPartialMoveModal');
const modalEnd = source.indexOf('function openManualRemainderDateModal', modalStart);
const modalSource = source.slice(modalStart, modalEnd);
assert.match(modalSource, /name="manual-stock-partial-mode"/, 'opcoes devem ser radios mutuamente exclusivos');
assert.match(modalSource, /value="max" checked/);
assert.match(modalSource, /value="manual"/);
assert.match(modalSource, /step="1"/, 'quantidade manual deve ser inteira');
assert.match(modalSource, /replace\(\/\\D\+\/g, ''\)/, 'entrada decimal deve ser filtrada');
assert.match(modalSource, /data-stock-partial-action="save" disabled/, 'Salvar deve iniciar desabilitado');
assert.match(modalSource, /getDateOptions/, 'datas viaveis devem ser recalculadas pelo modal quando a quantidade muda');
assert.match(modalSource, /Escolha uma data vi/);
assert.equal((modalSource.match(/data-stock-partial-action="cancel"/g) || []).length, 1, 'modal parcial deve ter somente um Cancelar');
assert.doesNotMatch(modalSource, /data-stock-partial-action="manual"/);
assert.doesNotMatch(modalSource, /data-stock-partial-action="max"/);

const unavailableStart = source.indexOf('function openManualStockUnavailableModal');
const unavailableEnd = source.indexOf('function renderManualStockRemainderDates', unavailableStart);
const unavailableSource = source.slice(unavailableStart, unavailableEnd);
assert.match(unavailableSource, /data-stock-unavailable-close/);
assert.doesNotMatch(unavailableSource, /manual-stock-choice|manual-stock-partial-mode|data-stock-partial-action="save"/, 'estoque zero nao deve exibir opcoes de producao nem salvar');

function extractBalancedFunction(sourceText, marker) {
  const start = sourceText.indexOf(marker);
  assert.ok(start > 0, `marcador "${marker}" deve existir`);
  const bodyStart = sourceText.indexOf('{', start);
  assert.ok(bodyStart > start, `marcador "${marker}" deve abrir bloco`);
  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return sourceText.slice(start, index + 1);
  }
  throw new Error(`bloco "${marker}" nao foi fechado`);
}

const runnerStart = source.indexOf('productionCalendarMoveRunner = async');
assert.equal(source.indexOf('function focusCalendarCardFromFlow', runnerStart), -1, 'delimitador legado nao faz parte do contrato atual');
const runner = extractBalancedFunction(source, 'productionCalendarMoveRunner = async');
assert.match(runner, /getDateOptions:\s*async quantity => dateOptionsForQuantity\(quantity\)\.options/);
assert.match(runner, /remainderQuantity\s*=\s*Math\.max\(Math\.floor\(Number\(move\.allocation\.quantity/);
assert.match(runner, /cachedDates\.transactions\.get\(remainderDate\)/);
assert.match(runner, /applyManualScheduleTransaction\s*\(/, 'fluxo parcial deve usar a transacao manual canonica');
assert.match(runner, /manualMovePolicy:\s*'stock_only_independent'/, 'fluxo parcial deve usar a politica independente de estoque');
assert.doesNotMatch(runner, /openManualRemainderDateModal\s*\(/, 'data do restante deve estar no modal parcial');
assert.doesNotMatch(runner, /reoptimizePlanningFuture|simulateCurrent|scheduleOperations/, 'fluxo de drag parcial nao deve reotimizar nem simular');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createManualStockPartialMoveHarness({
  applyManualScheduleTransaction,
  manualScheduleDraft,
  confirmManualMoveConfiguration,
  openManualStockPartialMoveModal,
  openManualStockUnavailableModal,
  currentManualScheduleValidationContextWithFreshStock,
  calendarSnapshot,
  matrix = [{ id: 'matrix-row' }],
  now = '2026-07-28T12:00:00.000Z',
  initialVisualState = { selectedAllocationId: 'allocation-eq45' }
} = {}) {
  const calls = {
    applyManualScheduleTransaction: [],
    simulateCurrent: [],
    scheduleOperations: [],
    reoptimizePlanningFuture: [],
    saveDraftNow: [],
    recordAcceptedManualState: [],
    refreshTimelineOnly: [],
    toast: [],
    setOperationLoading: [],
    openManualStockPartialMoveModal: [],
    openManualStockUnavailableModal: [],
    renderManualScheduleRejection: []
  };
  const state = {
    manualScheduleDraft,
    draft: { manualScheduleDraft },
    productionCalendarVisualState: { ...initialVisualState },
    productionCalendarMoveInProgress: false
  };
  const deps = {
    applyManualScheduleTransaction(payload) {
      calls.applyManualScheduleTransaction.push(payload);
      return applyManualScheduleTransaction(payload);
    },
    simulateCurrent() { calls.simulateCurrent.push([...arguments]); },
    scheduleOperations() { calls.scheduleOperations.push([...arguments]); },
    reoptimizePlanningFuture() { calls.reoptimizePlanningFuture.push([...arguments]); },
    confirmManualMoveConfiguration: confirmManualMoveConfiguration || (async () => ({
      machineId: 'M2',
      machineName: 'Dobradeira 2',
      date: '2026-07-28',
      peopleCount: 3,
      productivityRows: matrix
    })),
    openManualStockPartialMoveModal: async payload => {
      calls.openManualStockPartialMoveModal.push(payload);
      return openManualStockPartialMoveModal ? openManualStockPartialMoveModal(payload) : null;
    },
    openManualStockUnavailableModal: async payload => {
      calls.openManualStockUnavailableModal.push(payload);
      return openManualStockUnavailableModal ? openManualStockUnavailableModal(payload) : 'close';
    },
    currentManualScheduleValidationContextWithFreshStock: currentManualScheduleValidationContextWithFreshStock || (async () => ({
      stock: [{ materialId: 'LONG34', quantity: 5047.33 }],
      dependencies: [{ dependencyId: 'dep-long34' }]
    })),
    currentProductionCalendarSnapshot: () => calendarSnapshot || {
      machines: [{ machineId: 'M2', machineName: 'Dobradeira 2' }],
      days: [{ date: '2026-07-28' }, { date: '2026-07-29' }, { date: '2026-07-30' }]
    },
    cloneDraftPlanningState: () => clone(state.manualScheduleDraft),
    planningDraftDailyMinutes: () => 540,
    recordAcceptedManualState: previous => calls.recordAcceptedManualState.push(previous),
    saveDraftNow: () => calls.saveDraftNow.push(clone(state.draft.manualScheduleDraft)),
    refreshTimelineOnly: () => calls.refreshTimelineOnly.push(true),
    toast: message => calls.toast.push(message),
    setOperationLoading: (loading, message) => calls.setOperationLoading.push({ loading, message }),
    renderManualScheduleRejection: (calendar, presentation) => calls.renderManualScheduleRejection.push({ calendar, presentation }),
    presentManualScheduleValidation: validation => ({ title: 'Movimento recusado', validation }),
    target: { querySelector: selector => ({ selector }) },
    isValidDateOnly: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10))
  };

  const run = async (intent, move) => {
    const previousVisualState = { ...state.productionCalendarVisualState };
    const transactionTimestamp = now;
    try {
      if (!state.manualScheduleDraft) throw new Error('Rascunho manual indisponivel para movimentacao.');
      const previousManualState = deps.cloneDraftPlanningState();
      const snapshot = deps.currentProductionCalendarSnapshot();
      const ganttIndependentMove = intent?.source === 'gantt-drag';
      const moveConfiguration = ganttIndependentMove
        ? {
            machineId: move.machine.machineId,
            machineName: move.machine.machineName,
            date: intent?.to?.date,
            peopleCount: move.allocation.peopleCount,
            productivityRows: matrix
          }
        : await deps.confirmManualMoveConfiguration(intent, move, snapshot);
      if (!moveConfiguration) return;
      intent = {
        ...intent,
        to: {
          ...(intent.to || {}),
          date: moveConfiguration.date || intent?.to?.date,
          machineId: moveConfiguration.machineId || intent?.to?.machineId
        },
        peopleCount: moveConfiguration.peopleCount
      };
      move = {
        ...move,
        machine: {
          ...(move.machine || {}),
          machineId: moveConfiguration.machineId || move?.machine?.machineId,
          machineName: moveConfiguration.machineName || move?.machine?.machineName
        }
      };
      state.productionCalendarMoveInProgress = true;
      deps.setOperationLoading(true, 'Validando movimentacao...');
      const validationContext = await deps.currentManualScheduleValidationContextWithFreshStock(snapshot);
      const baseMoveIntent = {
        type: 'MOVE_ALLOCATION',
        allocationId: move.allocation.allocationId,
        targetDate: intent.to.date,
        targetMachineId: move.machine.machineId,
        peopleCount: moveConfiguration.peopleCount,
        source: intent.source,
        manualMovePolicy: 'stock_only_independent'
      };
      const draftContext = {
        now: transactionTimestamp,
        validatedAt: transactionTimestamp,
        machines: snapshot.machines,
        matrixRows: moveConfiguration.productivityRows || matrix,
        days: snapshot.days,
        dailyMinutes: deps.planningDraftDailyMinutes()
      };
      const runStockMove = extraIntent => deps.applyManualScheduleTransaction({
        currentDraft: state.manualScheduleDraft,
        intent: { ...baseMoveIntent, ...(extraIntent || {}) },
        draftContext,
        validationContext
      });
      const installAcceptedMove = transaction => {
        state.manualScheduleDraft = transaction.draft;
        state.draft.manualScheduleDraft = state.manualScheduleDraft;
        deps.recordAcceptedManualState(previousManualState);
        deps.saveDraftNow();
        deps.refreshTimelineOnly();
        if (String(previousVisualState.selectedAllocationId || '') === String(move.allocation.allocationId || '')) {
          state.productionCalendarVisualState = {
            ...state.productionCalendarVisualState,
            selectedAllocationId: null
          };
        }
        deps.toast(transaction.warnings.length
          ? `Producao movimentada com ${transaction.warnings.length} alerta(s).`
          : 'Producao movimentada no rascunho manual.');
      };

      const fullTransaction = runStockMove();
      if (fullTransaction.accepted) {
        installAcceptedMove(fullTransaction);
        return;
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
        await deps.openManualStockUnavailableModal({
          allocation: move.allocation,
          date: intent.to.date,
          analysis
        });
        return;
      }
      deps.setOperationLoading(false);
      const horizonDates = (snapshot.days || [])
        .map(day => String(day?.date || '').slice(0, 10))
        .filter(date => deps.isValidDateOnly(date) && date !== String(intent.to.date).slice(0, 10));
      const dateTransactionsByQuantity = new Map();
      const dateOptionsForQuantity = quantity => {
        const acceptedQuantity = Math.floor(Math.max(Number(quantity || 0), 0));
        if (dateTransactionsByQuantity.has(acceptedQuantity)) return dateTransactionsByQuantity.get(acceptedQuantity);
        const options = [];
        const transactions = new Map();
        for (const date of horizonDates) {
          const transaction = runStockMove({ quantity: acceptedQuantity, remainderDate: date });
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
      const partialChoice = await deps.openManualStockPartialMoveModal({
        allocation: move.allocation,
        date: intent.to.date,
        analysis,
        getDateOptions: async quantity => dateOptionsForQuantity(quantity).options
      });
      const acceptedQuantity = Math.floor(Number(partialChoice?.quantity || 0));
      if (!(acceptedQuantity > 0)) return;
      const remainderQuantity = Math.max(Math.floor(Number(move.allocation.quantity || 0)) - acceptedQuantity, 0);
      if (!(remainderQuantity > 0)) {
        const partialTransaction = runStockMove({ quantity: acceptedQuantity });
        if (!partialTransaction.accepted) throw new Error(partialTransaction.blockingIssues?.[0]?.message || 'Movimento recusado por estoque.');
        installAcceptedMove(partialTransaction);
        return;
      }
      const remainderDate = partialChoice?.remainderDate;
      if (!remainderDate) return;
      const cachedDates = dateOptionsForQuantity(acceptedQuantity);
      const splitTransaction = cachedDates.transactions.get(remainderDate)
        || runStockMove({ quantity: acceptedQuantity, remainderDate });
      if (!splitTransaction.accepted) throw new Error(splitTransaction.blockingIssues?.[0]?.message || 'A data escolhida nao possui estoque suficiente para o restante.');
      installAcceptedMove(splitTransaction);
    } catch (error) {
      state.productionCalendarVisualState = previousVisualState;
      const calendar = deps.target.querySelector('.production-calendar-container');
      const presentation = error?.diagnosticPresentation || (error?.validation
        ? deps.presentManualScheduleValidation(error.validation)
        : null);
      deps.renderManualScheduleRejection(calendar, presentation);
      throw error;
    } finally {
      state.productionCalendarMoveInProgress = false;
      deps.setOperationLoading(false);
    }
  };

  return { run, calls, state };
}

const previousDraft = {
  draftId: 'draft-stock-partial',
  allocations: [allocation],
  manualWorkDates: [],
  dailyTeamOverrides: {}
};
const acceptedDraft = {
  ...previousDraft,
  allocations: [{ ...allocation, date: '2026-07-28', machineId: 'M2', peopleCount: 3, pinned: true }],
  validation: { valid: true, manualMovePolicy: 'stock_only_independent' }
};
const defaultIntent = { source: 'drag', to: { date: '2026-07-28', machineId: 'M2' } };
const defaultMove = {
  allocation,
  machine: { machineId: 'M2', machineName: 'Dobradeira 2' }
};

{
  const validationContext = { stock: [{ materialId: 'LONG34', quantity: 5047.33 }], dependencies: [{ dependencyId: 'dep-long34' }] };
  const harness = createManualStockPartialMoveHarness({
    manualScheduleDraft: previousDraft,
    currentManualScheduleValidationContextWithFreshStock: async () => validationContext,
    applyManualScheduleTransaction: () => ({
      accepted: true,
      draft: acceptedDraft,
      validation: acceptedDraft.validation,
      blockingIssues: [],
      warnings: []
    })
  });
  await harness.run(defaultIntent, defaultMove);
  assert.equal(harness.calls.applyManualScheduleTransaction.length, 1, 'confirmacao aceita deve transacionar uma vez');
  const payload = harness.calls.applyManualScheduleTransaction[0];
  assert.equal(payload.currentDraft, previousDraft);
  assert.equal(payload.validationContext, validationContext, 'contexto fresco de estoque deve ser encaminhado sem recriar regra na UI');
  assert.equal(payload.intent.allocationId, 'allocation-eq45');
  assert.equal(payload.intent.targetDate, '2026-07-28');
  assert.equal(payload.intent.targetMachineId, 'M2');
  assert.equal(payload.intent.peopleCount, 3);
  assert.equal(payload.intent.manualMovePolicy, 'stock_only_independent');
  assert.equal(harness.state.manualScheduleDraft, acceptedDraft);
  assert.equal(harness.state.draft.manualScheduleDraft, acceptedDraft);
  assert.equal(harness.calls.recordAcceptedManualState.length, 1);
  assert.equal(harness.calls.saveDraftNow.length, 1);
  assert.equal(harness.calls.refreshTimelineOnly.length, 1);
  assert.deepEqual(harness.state.productionCalendarVisualState, { selectedAllocationId: null });
  assert.deepEqual(harness.calls.toast, ['Producao movimentada no rascunho manual.']);
  assert.deepEqual(harness.calls.simulateCurrent, []);
  assert.deepEqual(harness.calls.scheduleOperations, []);
  assert.deepEqual(harness.calls.reoptimizePlanningFuture, []);
}

{
  const blockingIssue = { code: 'STOCK_COMMITMENT_SHORTAGE', message: 'Estoque insuficiente.', allocationIds: ['allocation-eq45'] };
  const harness = createManualStockPartialMoveHarness({
    manualScheduleDraft: previousDraft,
    applyManualScheduleTransaction: () => ({
      accepted: false,
      draft: previousDraft,
      validation: { manualMoveStockAnalysis: { stockIssues: [blockingIssue], maxQuantity: 0 } },
      blockingIssues: [blockingIssue],
      warnings: []
    })
  });
  await harness.run(defaultIntent, defaultMove);
  assert.equal(harness.calls.applyManualScheduleTransaction.length, 1);
  assert.equal(harness.state.manualScheduleDraft, previousDraft, 'recusa total preserva o ultimo draft aceito');
  assert.equal(harness.calls.saveDraftNow.length, 0);
  assert.equal(harness.calls.openManualStockUnavailableModal.length, 1, 'recusa total deve apresentar diagnostico controlado');
  assert.equal(harness.calls.openManualStockUnavailableModal[0].analysis.maxQuantity, 0);
  assert.deepEqual(harness.calls.simulateCurrent, []);
  assert.deepEqual(harness.calls.scheduleOperations, []);
  assert.deepEqual(harness.calls.reoptimizePlanningFuture, []);
}

{
  const splitDraft = {
    ...previousDraft,
    allocations: [
      { ...allocation, quantity: 504, date: '2026-07-28', machineId: 'M2', pinned: true },
      { ...allocation, allocationId: 'allocation-eq45:restante:1', quantity: 196, date: '2026-07-30', machineId: 'M2', pinned: true }
    ],
    validation: { valid: true, manualMovePolicy: 'stock_only_independent' }
  };
  const harness = createManualStockPartialMoveHarness({
    manualScheduleDraft: previousDraft,
    calendarSnapshot: {
      machines: [{ machineId: 'M2', machineName: 'Dobradeira 2' }],
      days: [{ date: '2026-07-28' }, { date: '2026-07-29' }, { date: '2026-07-30' }]
    },
    openManualStockPartialMoveModal: async ({ getDateOptions }) => {
      const options = await getDateOptions(504);
      assert.deepEqual(options, [
        { date: '2026-07-29', viable: false, reason: 'Sem estoque suficiente para o restante.' },
        { date: '2026-07-30', viable: true }
      ]);
      return { quantity: 504, remainderQuantity: 196, remainderDate: '2026-07-30' };
    },
    applyManualScheduleTransaction: payload => {
      const { quantity, remainderDate } = payload.intent;
      if (quantity === undefined) {
        return {
          accepted: false,
          draft: previousDraft,
          validation: { manualMoveStockAnalysis: { stockIssues: [{ code: 'STOCK_COMMITMENT_SHORTAGE' }], maxQuantity: 504.733 } },
          blockingIssues: [{ code: 'STOCK_COMMITMENT_SHORTAGE', message: 'Estoque parcial.' }],
          warnings: []
        };
      }
      if (quantity === 504 && remainderDate === '2026-07-30') {
        return {
          accepted: true,
          draft: splitDraft,
          validation: splitDraft.validation,
          blockingIssues: [],
          warnings: [{ code: 'STOCK_MINIMUM_REACHED' }]
        };
      }
      return {
        accepted: false,
        draft: previousDraft,
        validation: { errors: [{ message: 'Sem estoque suficiente para o restante.' }] },
        blockingIssues: [{ message: 'Sem estoque suficiente para o restante.' }],
        warnings: []
      };
    }
  });
  await harness.run(defaultIntent, defaultMove);
  assert.equal(harness.calls.openManualStockPartialMoveModal.length, 1);
  assert.equal(harness.state.manualScheduleDraft, splitDraft);
  assert.equal(harness.calls.saveDraftNow.length, 1);
  assert.deepEqual(
    harness.calls.applyManualScheduleTransaction.map(call => ({
      allocationId: call.intent.allocationId,
      policy: call.intent.manualMovePolicy,
      quantity: call.intent.quantity,
      remainderDate: call.intent.remainderDate
    })),
    [
      { allocationId: 'allocation-eq45', policy: 'stock_only_independent', quantity: undefined, remainderDate: undefined },
      { allocationId: 'allocation-eq45', policy: 'stock_only_independent', quantity: 504, remainderDate: '2026-07-29' },
      { allocationId: 'allocation-eq45', policy: 'stock_only_independent', quantity: 504, remainderDate: '2026-07-30' }
    ]
  );
  assert.deepEqual(harness.calls.toast, ['Producao movimentada com 1 alerta(s).']);
  assert.deepEqual(harness.calls.simulateCurrent, []);
  assert.deepEqual(harness.calls.scheduleOperations, []);
  assert.deepEqual(harness.calls.reoptimizePlanningFuture, []);
}

{
  const error = Object.assign(new Error('Falha controlada da transacao.'), {
    validation: { errors: [{ code: 'STOCK_COMMITMENT_SHORTAGE', message: 'Estoque insuficiente.' }] }
  });
  const harness = createManualStockPartialMoveHarness({
    manualScheduleDraft: previousDraft,
    applyManualScheduleTransaction: () => { throw error; }
  });
  await assert.rejects(() => harness.run(defaultIntent, defaultMove), /Falha controlada da transacao/);
  assert.equal(harness.state.manualScheduleDraft, previousDraft, 'erro nao pode provocar mutacao parcial silenciosa');
  assert.deepEqual(harness.state.productionCalendarVisualState, { selectedAllocationId: 'allocation-eq45' });
  assert.equal(harness.calls.saveDraftNow.length, 0);
  assert.equal(harness.calls.renderManualScheduleRejection.length, 1, 'erro deve produzir rejeicao controlada para a UI');
  assert.equal(harness.calls.applyManualScheduleTransaction.length, 1);
  assert.deepEqual(harness.calls.simulateCurrent, []);
  assert.deepEqual(harness.calls.scheduleOperations, []);
  assert.deepEqual(harness.calls.reoptimizePlanningFuture, []);
}

console.log('planningManualStockPartialModal.test.js ok');
