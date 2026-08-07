# REF-014 - Teste comportamental do modal de estoque parcial

Data: 2026-08-06
Modo: correcao de teste, sem alteracao produtiva.

## 1. Problema original

`tests/planningManualStockPartialModal.test.js` falhava ao verificar que o fluxo parcial de estoque nao chama solver, simulacao ou reotimizacao. A falha nao vinha do fluxo produtivo: vinha de um recorte textual fragil sobre `pages/PlanningPage.js`.

## 2. Reproducao

Comando antes da alteracao:

```text
node --test tests/planningManualStockPartialModal.test.js
```

Resultado:

```text
AssertionError [ERR_ASSERTION]: fluxo de drag parcial nao deve reotimizar nem simular
expected: /reoptimizePlanningFuture|simulateCurrent|scheduleOperations/
actual: trecho iniciando em productionCalendarMoveRunner e vazando para codigo posterior
```

## 3. Motivo do recorte incorreto

O teste antigo procurava `productionCalendarMoveRunner = async` e delimitava o fim com `function focusCalendarCardFromFlow`. Esse delimitador deixou de existir. Com `runnerEnd = -1`, o slice deixou de representar somente o runner e passou a incluir codigo posterior de `PlanningPage.js`, incluindo chamadas legitimas de `simulateCurrent` fora do fluxo parcial.

## 4. Comportamento produtivo confirmado

Funcao/runner responsavel: `productionCalendarMoveRunner`.

Evento: drag/move do calendario chama `handleProductionCalendarMoveRequest`, que delega para `productionCalendarMoveRunner`. No caso parcial, o runner abre `openManualStockPartialMoveModal` depois de uma transacao recusada por estoque com `maxQuantity > 0`.

Entrada principal do fluxo parcial:

- `intent.to.date`
- `move.allocation.allocationId`
- `move.machine.machineId`
- configuracao confirmada com maquina, data, pessoas e matriz
- contexto fresco de validacao/estoque retornado por `currentManualScheduleValidationContextWithFreshStock`

Chamada canonica:

```js
applyManualScheduleTransaction({
  currentDraft: manualScheduleDraft,
  intent: { ...baseMoveIntent, ...(extraIntent || {}) },
  draftContext,
  validationContext
})
```

Politica confirmada:

```js
manualMovePolicy: 'stock_only_independent'
```

Quando aceita, `installAcceptedMove` aplica `transaction.draft`, atualiza `draft.manualScheduleDraft`, registra estado anterior, salva, refresca a timeline, limpa selecao quando aplicavel e mostra toast.

Quando recusada por estoque total (`maxQuantity <= 0`), abre `openManualStockUnavailableModal` e retorna sem trocar `manualScheduleDraft` nem salvar.

Quando parcial (`maxQuantity > 0`), abre `openManualStockPartialMoveModal`, recalcula datas viaveis por quantidade via novas transacoes e instala somente uma transacao aceita para `quantity` + `remainderDate`.

Quando lanca erro, restaura `productionCalendarVisualState`, chama `renderManualScheduleRejection` com apresentacao quando ha validacao e relanca o erro.

Ausencias confirmadas no bloco balanceado do runner:

- `simulateCurrent`
- `scheduleOperations`
- `reoptimizePlanningFuture`

## 5. Estrategia de teste escolhida

O teste deixou de depender do delimitador removido `focusCalendarCardFromFlow`.

A verificacao estrutural agora usa extracao por chaves balanceadas a partir de `productionCalendarMoveRunner = async`, apenas para confirmar que o bloco real contem a transacao/politica e nao contem chamadas proibidas.

O comportamento principal passou a ser validado por um harness controlado no proprio teste. O harness reproduz o contrato do runner com dependencias injetadas e registra chamadas.

## 6. Harness utilizado

`createManualStockPartialMoveHarness` registra chamadas para:

- `applyManualScheduleTransaction`
- `simulateCurrent`
- `scheduleOperations`
- `reoptimizePlanningFuture`
- `saveDraftNow`
- `recordAcceptedManualState`
- `refreshTimelineOnly`
- `toast`
- `setOperationLoading`
- `openManualStockPartialMoveModal`
- `openManualStockUnavailableModal`
- `renderManualScheduleRejection`

Ele recebe `manualScheduleDraft`, snapshot do calendario, contexto fresco de estoque e funcoes simuladas para transacao/modal. O harness nao executa solver, simulacao global, reotimizacao, API, banco ou persistencia real.

## 7. Chamadas verificadas

- `applyManualScheduleTransaction` e chamada uma vez no sucesso integral.
- `currentDraft` e o draft aceito anterior.
- `validationContext` fresco de estoque e encaminhado ao service.
- `intent.allocationId` e `allocation-eq45`.
- `targetDate`, `targetMachineId`, `peopleCount` e `manualMovePolicy` sao encaminhados.
- No fluxo parcial, as transacoes geradas incluem a chamada inicial, a tentativa por data inviavel e a tentativa por data viavel.

## 8. Chamadas proibidas verificadas

O teste verifica, por bloco balanceado e por chamadas registradas no harness, que nao ocorrem:

- `simulateCurrent`
- `scheduleOperations`
- `reoptimizePlanningFuture`

Tambem verifica que nenhuma simulacao global e iniciada no harness.

## 9. Cenario de sucesso

Transacao aceita:

- aplica `transaction.draft`;
- atualiza `draft.manualScheduleDraft`;
- registra estado anterior;
- chama save e refresh;
- limpa selecao da allocation movida;
- mostra toast de sucesso;
- nao chama solver/reotimizacao/simulacao.

## 10. Cenario de rejeicao

Transacao recusada por estoque total:

- preserva `manualScheduleDraft`;
- nao salva;
- abre `openManualStockUnavailableModal`;
- encaminha diagnostico/analise com `maxQuantity = 0`;
- nao chama solver/reotimizacao/simulacao.

## 11. Cenario de erro

Erro lancado pela transacao:

- preserva `manualScheduleDraft`;
- restaura `productionCalendarVisualState`;
- nao salva;
- chama `renderManualScheduleRejection`;
- relanca o erro;
- nao chama solver/reotimizacao/simulacao.

## 12. Arquivos alterados

- `tests/planningManualStockPartialModal.test.js`
- `docs/refactor/REF-014_MANUAL_STOCK_PARTIAL_MODAL_TEST.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

Nenhum arquivo produtivo foi alterado.

## 13. Comandos executados

Antes:

```text
git status --short
git diff --stat
node --test tests/planningManualStockPartialModal.test.js
```

Depois e relacionados:

```text
node --test tests/planningManualStockPartialModal.test.js
node --test tests/manualScheduleTransaction.service.test.js tests/planningManualScheduleIntegration.test.js tests/planningStockProjectionModal.test.js tests/planningStockProjection.service.test.js tests/planningStockBalanceToggle.test.js tests/materialStockMetrics.service.test.js tests/manualScheduleValidation.service.test.js tests/manualScheduleDraft.service.test.js tests/manualScheduleHistory.service.test.js tests/manualSchedulePersistence.service.test.js tests/planningManualScheduleSaveLoad.integration.test.js tests/planningDailyBatchStock.service.test.js
node --test tests/*.js
```

Comandos finais coletados:

```text
git diff -- tests/planningManualStockPartialModal.test.js
git diff -- pages/PlanningPage.js
git status --short
```

## 14. Resultado isolado

Depois da alteracao:

```text
planningManualStockPartialModal.test.js ok
tests 1
pass 1
fail 0
```

## 15. Resultado da suite

Depois da alteracao:

```text
tests 51
pass 50
fail 1
```

Falha restante esperada:

- `tests/productionCalendarDayHeader.test.js`: `TypeError: grid.querySelector is not a function`

## 16. Riscos residuais

- O harness e tecnico e nao substitui homologacao operacional em navegador.
- Nao foram exercitados drag real, console visual, backend, banco, refresh/reopen ou persistencia server-side.
- `productionCalendarDayHeader.test.js` segue como falha pendente conhecida.
- A homologacao manual da REF-013 permanece pendente.

## 17. Conclusao

REF-014 concluida. O teste de estoque parcial deixou de depender de `focusCalendarCardFromFlow` ou de posicao de funcoes posteriores, valida o comportamento por harness controlado, confirma `applyManualScheduleTransaction`, confirma `manualMovePolicy: 'stock_only_independent'`, confirma ausencia de solver/reotimizacao/simulacao e cobre sucesso, rejeicao e erro sem alterar codigo produtivo.
