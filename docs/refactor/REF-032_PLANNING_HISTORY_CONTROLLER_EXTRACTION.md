# REF-032 - Planning history controller extraction

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `85e6ff86309f92065799bc7f337605b95fd59aec`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 82 testes, 82 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6707 linhas

## 2. Auditoria

| Funcao/bloco | Papel | Entradas | Saida | Muta draft? | DOM? | Servico usado | Decisao |
|---|---|---|---|---|---|---|---|
| `cloneDraftPlanningState` | Captura snapshot completo do estado editavel do planejamento manual | `draft`, `manualScheduleDraft`, `lastPayload`, `currentSimulation`, `hasPendingSimulationChanges` via closure | Objeto snapshot clonado | Nao | Nao | Nenhum | Mantida na pagina; depende diretamente da closure local |
| `restoreDraftPlanningState` | Restaura snapshot aceito por undo/redo/rollback | Snapshot | Atualiza closure e draft local, chama `saveDraftNow` e `refreshTimelineOnly` | Sim | Nao direto | Nenhum | Mantida na pagina; muta estado local nos mesmos pontos anteriores |
| `recordAcceptedManualState` | Registra alteracao manual aceita | Snapshot anterior e snapshot atual capturado | Atualiza historico | Nao direto | Nao | `recordManualScheduleHistory` via controlador | Extraida a orquestracao para controlador; wrapper local mantido |
| `applyManualHistoryResult` | Aplicava resultado de undo/redo, limpava selecao, restaurava snapshot e re-renderizava Flow | Resultado do service, callbacks/closures da pagina | Estado restaurado e Flow re-renderizado | Sim via `restoreDraftPlanningState` | Sim | `undo/redo` indiretamente | Removida da pagina; sequencia virou callbacks explicitos no controlador |
| `undoLastProductionCalendarChange` | Handler de undo do calendario | Historico atual | Resultado aplicado por callback | Sim quando ha snapshot | Nao direto | `undoManualScheduleHistory` via controlador | Extraida a orquestracao; handler local chama `manualScheduleHistory.undo()` |
| `redoProductionCalendarChange` | Handler de redo do calendario | Historico atual | Resultado aplicado por callback | Sim quando ha snapshot | Nao direto | `redoManualScheduleHistory` via controlador | Extraida a orquestracao; handler local chama `manualScheduleHistory.redo()` |
| `canUndoManualChange`/`canRedoManualChange` | Disponibilidade visual de undo/redo | Permissao de escrita e historico | Booleans no `visualState` | Nao | Nao | Nenhum direto | Extraido acesso ao historico para `canUndo()`/`canRedo()` |
| Resets apos descarte, salvar, abrir plano, limpar e render inicial | Reinicializa historico no mesmo momento atual | Snapshot atual ou vazio | Historico reiniciado | Nao direto | Nao | `resetManualScheduleHistory` via controlador | Extraidos para `resetFromCurrent()`/`reset()` |

## 3. Fronteira encontrada

Fronteira segura:

- manter o service canonico `services/manualScheduleHistory.service.js` sem alteracao;
- criar um controlador neutro que guarda `history` em closure;
- receber `captureSnapshot`, `restoreSnapshot`, `onBeforeRestore` e `onAfterRestore` explicitamente;
- expor `record`, `reset`, `resetFromCurrent`, `undo`, `redo`, `canUndo`, `canRedo` e `getHistory`;
- preservar snapshots e clones por meio do service existente;
- preservar redo invalidado apos nova alteracao pelo `recordManualScheduleHistory`;
- preservar a ordem `onBeforeRestore` -> `restoreSnapshot` -> `onAfterRestore`.

Ficaram fora:

- `cloneDraftPlanningState` e `restoreDraftPlanningState`, porque dependem da closure da pagina e mutam o draft local;
- re-render do Flow, porque consulta DOM e chama renderer;
- `saveDraftNow`, `refreshTimelineOnly`, API, banco, solver, reotimizacao, movimento, split, transporte, estoque, persistencia, Gantt, Calendario V2 e capacidade.

## 4. Extracao realizada

Criado `shared/planning-controller/planningHistoryController.js`, sem `index.js`.

`pages/PlanningPage.js` passou a importar `createPlanningHistoryController` e deixou de importar diretamente `services/manualScheduleHistory.service.js`.

## 5. Contratos preservados

- IDs dentro dos snapshots continuam clonados pelo service existente.
- Undo/redo continuam restaurando snapshots completos.
- Nova alteracao apos undo continua limpando redo.
- Resets continuam ocorrendo nos mesmos fluxos: descarte, render inicial automatico, salvar, abrir plano salvo, alteracao de prioridade que fecha calendario e limpar planejamento.
- `canUndoManualChange` e `canRedoManualChange` continuam condicionados a `canWritePlanning`.
- Se undo/redo nao muda estado, nenhum callback de restauracao e chamado.
- O controlador nao executa solver, scheduler, reotimizacao, API, banco, movimento, split, transporte ou regra produtiva.

## 6. Testes

Criado `tests/planningHistoryController.test.js`, cobrindo:

- historico vazio;
- undo;
- redo;
- nova alteracao apos undo;
- preservacao de IDs;
- draft restaurado por callback;
- callbacks chamados na ordem correta;
- entradas/snapshots sem compartilhamento indevido.

`tests/manualScheduleHistory.service.test.js` foi ajustado estritamente para a nova fronteira textual: o service continua testado e a ausencia de solver/reotimizacao agora e verificada no controlador extraido.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-controller/planningHistoryController.js
node --check pages/PlanningPage.js
node --test tests/planningHistoryController.test.js
node --test tests/manualScheduleHistory.service.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningHistoryController`: OK
- Teste canonico `manualScheduleHistory.service`: OK apos ajuste de fronteira
- Suite ampla final: 83 testes, 83 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF em arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 6707 linhas
- Depois: 6699 linhas
- Reducao liquida: 8 linhas

## 9. Riscos e dividas

- `cloneDraftPlanningState` e `restoreDraftPlanningState` continuam na `PlanningPage.js`.
- A camada visual/DOM apos undo/redo continua na pagina por callback.
- REF-013 homologacao manual permanece pendente.
- Modal/foco do Flow, Calendario V2, identidade do calendario manual, manual move/split, transporte, estoque, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
