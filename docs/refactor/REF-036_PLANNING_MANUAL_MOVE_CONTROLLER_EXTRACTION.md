# REF-036 - Auditar e extrair controlador de movimentacao manual de allocations

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `0f72af3`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 86 testes, 86 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6212 linhas

## 2. Auditoria

| Funcao/bloco | Papel | Servico usado | Muta draft? | UI/DOM? | Solver/reopt? | Decisao |
|---|---|---|---|---|---|---|
| `handleProductionCalendarMoveRequest` | Recebe intencao visual `MOVE_ALLOCATION`, valida snapshot atual e chama runner | Nenhum service direto | Nao | Toast em erro | Nao | Mantido na pagina como wrapper de UI/estado |
| `validateProductionCalendarMoveIntent` | Valida destino visual, allocation, maquina e restricao de drag Gantt na mesma maquina | Nenhum service direto | Nao | Nao | Nao | Mantido na pagina por depender de snapshot/UI e regras de entrada visual |
| Movimento vindo do Gantt | `createGanttApsRenderer` emite `MOVE_ALLOCATION` com `source: 'gantt-drag'` | Controller consome depois via transacao | Somente apos aceite | Gantt apenas emite callback | Nao | Preservado; pagina monta configuracao independente sem modal |
| Movimento vindo do calendario/editor | V2 nao recebe `onRequestMove` no estado atual; editor usa `handleProductionCalendarAllocationSave` | `applyManualScheduleTransaction` em fluxos de `EDIT_ALLOCATION`/`SPLIT_ALLOCATION` | Sim, somente apos aceite | Modal/editor | Reopt em mudanca de recurso | Nao extraido nesta REF |
| `productionCalendarMoveRunner` | Orquestrava configuracao, transacao stock-only, parcial, aceite, render e erro | `applyManualScheduleTransaction` | Sim, somente em `installAcceptedMove` | Loading, modal, toast, render | Nao | Parcialmente extraido; wrapper visual ficou na pagina |
| Operacao canonica `MOVE_ALLOCATION` | Monta `allocationId`, `targetDate`, `targetMachineId`, `peopleCount`, `source`, `manualMovePolicy` | `applyManualScheduleTransaction` | Nao diretamente | Nao | Nao | Extraida para `buildPlanningManualMoveOperation` |
| Execucao de transacao integral | Chama `applyManualScheduleTransaction` com `currentDraft`, `intent`, `draftContext`, `validationContext` | `applyManualScheduleTransaction` | Nao; retorna candidato | Nao | Nao | Extraida para `runPlanningManualMoveController` |
| Rejeicao/diagnosticos | Preserva `validation`, `blockingIssues` e `manualMoveStockAnalysis`; retorna sem callback de aceite | `applyManualScheduleTransaction` | Nao | Callback para modal de estoque indisponivel | Nao | Extraida como decisao de controller por callbacks |
| Callbacks pos-aceite | Instala `manualScheduleDraft`, atualiza `draft.manualScheduleDraft`, registra historico, salva draft local, renderiza e limpa selecao | Nenhum service direto | Sim, somente apos aceite | Sim | Nao | Mantido na pagina via `onAccepted` |
| Historico | `recordAcceptedManualState(previousManualState)` | `manualScheduleHistory` indireto | Nao sozinho | Nao | Nao | Mantido na pagina no mesmo momento: depois de aceitar e antes de salvar/renderizar |
| Save/autosave subsequente | `saveDraftNow()` grava o draft aceito no storage local | Nenhum service direto | Nao | Storage | Nao | Mantido na pagina; controller nao acessa storage |
| Rejeicao visual | `renderManualScheduleRejection` com presenter | `presentManualScheduleValidation` | Nao | Sim | Nao | Mantido na pagina no `catch` |
| `buildManualMoveCandidateDraft` | Helper legado de candidato por `moveDraftAllocation` | `moveDraftAllocation` | Retorna candidato, nao usado pelo runner atual | Nao | Nao | Mantido sem uso; nao extraido para evitar refatoracao oportunista |

## 3. Fronteira encontrada

Fronteira segura:

- `shared/planning-controller/planningManualMoveController.js`;
- normalizacao da intencao canonica `MOVE_ALLOCATION`;
- chamada a `applyManualScheduleTransaction`;
- decisao de aceite/rejeicao/cancelamento;
- preservacao de diagnostics e `manualMoveStockAnalysis`;
- callbacks explicitos para aceite, estoque indisponivel, escolha parcial e loading antes do modal parcial.

Fronteira rejeitada nesta REF:

- validacao visual do destino;
- modal de configuracao de movimento;
- modal de estoque parcial/indisponivel;
- aplicacao direta de estado da pagina;
- historico, toast, render, loading final e storage;
- split, editor, capacidade, transporte, persistencia, autosave, Gantt renderer, Calendario V2, solver/reotimizacao, `productiveMinutes`, `generatePlanningCode` e turnos.

## 4. Extracao realizada

Criado `shared/planning-controller/planningManualMoveController.js` com:

- `buildPlanningManualMoveOperation`;
- `runPlanningManualMoveController`;
- `clonePlanningManualMoveValue`.

`PlanningPage.js` passou a importar o controller e manteve wrappers para:

- `confirmManualMoveConfiguration`;
- `currentManualScheduleValidationContextWithFreshStock`;
- `recordAcceptedManualState`;
- `saveDraftNow`;
- `refreshTimelineOnly`;
- `toast`;
- modais de estoque;
- `renderManualScheduleRejection`;
- loading e estado visual.

## 5. Contratos preservados

- `allocationId`, `operationId`, `productionId`, `parentOperationId`, memberships, componentes e linhagem sao repassados sem derivar nova identidade.
- Movimento continua usando `applyManualScheduleTransaction`.
- Draft ativo so e substituido no callback `onAccepted`.
- Rejeicao, cancelamento e erro nao aplicam draft rejeitado.
- Diagnostics e `manualMoveStockAnalysis` sao preservados no retorno/callback.
- `manualMovePolicy: 'stock_only_independent'` foi preservada, sem alterar sua regra.
- O controller nao chama solver, reotimizacao, API, DOM, storage ou renderer.
- Historico e save local continuam no mesmo momento do fluxo aceito da pagina.

## 6. Testes

Criado `tests/planningManualMoveController.test.js`, cobrindo:

- movimento aceito;
- movimento rejeitado;
- erro;
- allocation inexistente;
- IDs preservados;
- draft nao alterado em rejeicao;
- draft aplicado apenas em aceite;
- diagnostics preservados;
- nenhuma chamada a solver/reoptimization;
- callbacks na ordem esperada.

Teste existente ajustado estritamente:

- `tests/planningManualScheduleIntegration.test.js` passou a validar que a pagina chama `runPlanningManualMoveController` e que o novo controller contem a chamada transacional.
- `tests/planningManualStockPartialModal.test.js` passou a validar que o fluxo parcial ficou no controller e que a pagina manteve apenas o callback visual do modal parcial.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-controller/planningManualMoveController.js
node --check pages/PlanningPage.js
node --test tests/planningManualMoveController.test.js
node --test tests/manualScheduleTransaction.service.test.js
node --test tests/manualScheduleValidation.service.test.js
node --test tests/planningManualScheduleIntegration.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/planningManualStockPartialModal.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningManualMoveController`: OK
- Teste canonico de transacao manual: OK
- Teste canonico de validacao manual: OK
- Teste integrado manual ajustado: OK
- Teste Gantt drag relacionado: OK
- Teste do modal parcial ajustado: OK
- Suite ampla final: 87 testes, 87 aprovados e 0 falhas
- `git diff --check`: OK, com avisos conhecidos de LF -> CRLF em arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 6212 linhas
- Depois: 6136 linhas
- Reducao liquida: 76 linhas

## 9. Riscos e dividas

- `buildManualMoveCandidateDraft` permanece na `PlanningPage.js` como helper legado nao usado pelo runner extraido; nao foi removido para evitar limpeza oportunista.
- Editor/split/capacidade continuam na pagina e usam fluxos proprios de `EDIT_ALLOCATION`/`SPLIT_ALLOCATION`.
- Stock-only segue como politica consumida da transacao; a regra de estoque nao foi alterada nem extraida como dominio.
- Homologacao operacional em navegador nao foi executada nesta REF.
- REF-013 homologacao manual permanece pendente.
- Calendario V2, identidade manual, autosave/descarte, productiveMinutes, generatePlanningCode e turnos/capacidade permanecem pendentes.
