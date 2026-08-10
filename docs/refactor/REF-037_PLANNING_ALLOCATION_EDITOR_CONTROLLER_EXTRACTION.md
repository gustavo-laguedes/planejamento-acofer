# REF-037 - Auditar e extrair controlador de split/editor de allocation

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `0baec24`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 87 testes, 87 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6136 linhas

## 2. Auditoria

| Funcao/bloco | Papel | Operacao canonica | Muta draft? | UI/DOM? | Servico usado | Decisao |
|---|---|---|---|---|---|---|
| `openProductionCalendarAllocationEditor` | Abre editor, prepara material, maquinas, preview e callback `onSave` | Nenhuma; emite payload visual | Nao | Sim | `selectPlanningEditorProductivityRows`, `getPlanningOperationResourceOptions`, `buildPlanningOperationResourcePreview` | Mantido na pagina |
| `ProductionCalendarEditor` | Modal unificado de edicao e split, monta payload `mode: edit/split` | Nenhuma | Nao | Sim | Preview usa callback; split preview usa helper de draft | Nao alterado |
| `ProductionCalendarSplitEditor` | Editor legado isolado de split simples | Nenhuma no fluxo atual | Nao | Sim | `buildManualScheduleAllocationSplit` para preview | Nao alterado |
| `handleProductionCalendarAllocationSave` - guarda inicial | Verifica permissao, draft e stale allocation | Nenhuma | Nao | Retorna mensagem ao modal | Nenhum direto | Mantido na pagina |
| Edicao sem troca de recurso | Monta edicao localizada de data, inicio, quantidade e pessoas atuais | `EDIT_ALLOCATION` | Somente apos aceite por callback | Nao no controller | `applyManualScheduleTransaction` | Extraido |
| Edicao com quantidade acima da capacidade | Pergunta decisao de capacidade antes da transacao | `EDIT_ALLOCATION` com `capacityDecision` | Somente apos aceite por callback | Modal de decisao na pagina | `applyManualScheduleTransaction` no controller | Parcialmente extraido; modal ficou na pagina |
| Edicao de maquina/pessoas com `override` | Aplica configuracao extraordinaria sem reotimizar futuro | `EDIT_ALLOCATION` | Somente apos aceite por callback | Toast/render na pagina | `applyManualScheduleTransaction` no controller | Extraido |
| Edicao de maquina/pessoas com `split` | Recalcula futuro a partir do cutoff | `EDIT_PRODUCTION_CONFIGURATION`/comando de reotimizacao | Sim via `acceptRecalculatedCalendar` apos aceite | Toast/render na pagina | `reoptimizePlanningFuture` indiretamente e `applyManualScheduleTransaction` | Mantido na pagina por estar fora do escopo |
| Split em 2+ partes | Monta split proporcional com edicoes por parte | `SPLIT_ALLOCATION` | Somente apos aceite por callback | Nao no controller | `applyManualScheduleTransaction` | Extraido |
| Split recursivo | Divide uma parte ja dividida preservando raiz e pai imediato | `SPLIT_ALLOCATION` | Somente apos aceite por callback | Nao no controller | `splitDraftAllocation` via transacao | Extraido sem alterar algoritmo |
| Rejeicao/diagnosticos | Retorna transacao recusada, `blockingIssues` e mensagem | `EDIT_ALLOCATION` ou `SPLIT_ALLOCATION` | Nao | Nao no controller | `applyManualScheduleTransaction` | Extraido |
| Callbacks pos-aceite | Instala `manualScheduleDraft`, atualiza `draft`, limpa selecao quando aplicavel, registra historico, salva local, renderiza e mostra toast | Resultado aceito | Sim | Sim | Historico/local render da pagina | Mantido na pagina via callback |
| Historico | `recordAcceptedManualState(previousManualState)` | Resultado aceito | Nao sozinho | Nao | `manualScheduleHistory` indireto | Mantido no mesmo momento apos aceite |

## 3. Fronteira encontrada

Fronteira segura:

- `shared/planning-controller/planningAllocationEditorController.js`;
- construcao das intencoes canonicas `EDIT_ALLOCATION` e `SPLIT_ALLOCATION`;
- execucao transacional por `applyManualScheduleTransaction`;
- retorno de `accepted`, `rejected`, `stale`, `unchanged`, `operation`, `transaction` e mensagem;
- aplicacao do draft aceito somente por callback `onAccepted`;
- nenhum acesso a DOM, API, storage, solver ou reotimizacao.

Fronteira rejeitada nesta REF:

- abertura/fechamento do editor;
- preview de produtividade e lista de maquinas;
- modal de decisao de capacidade;
- ramo de troca de recurso que chama reotimizacao de futuro;
- `acceptRecalculatedCalendar`;
- render, toast, historico, save local e limpeza visual;
- transporte, stock-only, persistencia, autosave/descarte, Gantt, Calendario V2 renderer/grid, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade global.

## 4. Extracao realizada

Criado `shared/planning-controller/planningAllocationEditorController.js` com:

- `buildPlanningAllocationEditorOperation`;
- `runPlanningAllocationEditorController`.

`PlanningPage.js` passou a importar o controller e manteve wrappers para:

- permissao, stale check e preparo de contexto;
- decisao de capacidade;
- reotimizacao de futuro em troca de recurso;
- aplicacao de estado aceito, historico, save, render, selecao e toast.

## 5. Contratos preservados

- `allocationId` da allocation editada e das partes vindas do service nao e derivado na pagina.
- `splitParentAllocationId`, `splitRootAllocationId`, `splitOrder`, `splitPath`, `splitPartId` e demais metadados de linhagem continuam produzidos pelo service canonico.
- `productionMemberships`, componentes, quantidades fisicas e residuos continuam particionados por `manualScheduleDraft.service.js`.
- A ordem global das allocations vem da transacao; edicao localizada preserva indice e split substitui a allocation alvo pelas partes na mesma posicao.
- Draft recusado nao e aplicado; callback de aceite nao roda em rejeicao.
- Diagnostics e `blockingIssues` retornam no resultado do controller.
- Historico permanece no mesmo momento: depois da transacao aceita e antes de save/render local.
- O controller nao chama `simulateCurrent`, `buildPlan`, `scheduleOperations` ou `reoptimizePlanningFuture`.

## 6. Testes

Criado `tests/planningAllocationEditorController.test.js`, cobrindo:

- edit aceito;
- edit rejeitado;
- split aceito;
- split rejeitado;
- split recursivo;
- ordem preservada;
- IDs e linhagem preservados;
- residuo deterministico;
- draft intacto em rejeicao;
- callbacks na ordem;
- ausencia de solver/reotimizacao, DOM, storage e API.

Testes existentes ajustados estritamente:

- `tests/planningReoptimization.service.test.js`: contrato estatico passou a reconhecer o controller como fronteira de `EDIT_ALLOCATION`/`SPLIT_ALLOCATION`.
- `tests/productionCalendarEditButton.test.js`: contrato estatico do editor passou a validar que a pagina chama o controller e que o controller contem as intencoes canonicas.

## 7. Validacoes finais

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-controller/planningAllocationEditorController.js
node --check pages/PlanningPage.js
node --test tests/planningAllocationEditorController.test.js
node --test tests/manualScheduleEditCapacityOverride.test.js
node --test tests/manualScheduleDraft.service.test.js
node --test tests/manualScheduleTransaction.service.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarConfigurationEdit.integration.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/planningReoptimization.service.test.js
node --test tests/*.js
git diff --check
```

Resultado final: zero falhas; suite ampla com 95 testes, 95 aprovados e 0 falhas apos inclusao do novo teste com 8 subtestes.

## 8. PlanningPage antes/depois

- Antes: 6136 linhas
- Depois: 6134 linhas
- Reducao liquida: 2 linhas

## 9. Riscos e dividas

- O ramo de troca de maquina/pessoas com reotimizacao futura permanece na `PlanningPage.js` por escopo e risco.
- `ProductionCalendarEditor` continua em `shared/production-calendar` e ainda mistura editor operacional com pacote V2 legado.
- Homologacao operacional em navegador nao foi executada nesta REF.
- REF-013 homologacao manual permanece pendente.
- Stock-only, Calendario V2, identidade manual, autosave/descarte, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
