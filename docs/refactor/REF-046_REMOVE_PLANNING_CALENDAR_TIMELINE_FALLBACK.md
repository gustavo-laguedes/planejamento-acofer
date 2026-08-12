# REF-046 - Remover fallback CalendarTimeline da PlanningPage

Data: 2026-08-12

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `7ce0840`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` falhou no sandbox com `spawn EPERM`; repetida fora do sandbox com 98 testes, 98 aprovados e 0 falhas.

## 2. Ocorrencias e classificacao

| Ocorrencia | Classificacao | Decisao |
|---|---|---|
| `pages/PlanningPage.js`: import de `CalendarTimeline` | uso morto exclusivo do Planejamento | Removido. |
| `pages/PlanningPage.js`: `USE_PRODUCTION_CALENDAR_V2 = true` | uso morto exclusivo do Planejamento | Removido. |
| `pages/PlanningPage.js`: branch `if (!USE_PRODUCTION_CALENDAR_V2)` | fallback visual alternativo morto | Removido. |
| `pages/PlanningPage.js`: `timelineOperations(result)` em `simulatedProductionByDate` | uso compartilhado dentro da PlanningPage | Preservado. |
| `pages/AnalysisPage.js`: `CalendarTimeline` para cronograma de plano | uso ativo fora do Planejamento | Preservado. |
| `pages/AnalysisPage.js`: `CalendarTimeline` em modo comercial | uso ativo fora do Planejamento | Preservado. |
| `pages/CommercialCalendarPage.js`: `AnalysisPage({ mode: 'commercial' })` | uso ativo fora do Planejamento | Preservado. |
| `shared/CalendarTimeline.js` | modulo fisico compartilhado | Preservado. |
| `tests/planningScheduleRenderer.test.js` e `tests/ganttApsRenderer.test.js` | teste/documentacao | Atualizados. |
| `shared/planning-schedule-view/productionCalendarV2.renderer.js` | implementacao fisica V2 | Preservado. |

## 3. Gate

| Item | Evidencia | Resultado |
|---|---|---|
| `PlanningPage` ja monta somente Gantt no fluxo operacional | `renderProductionCalendar` cria `buildPlanningScheduleViewModel(snapshot)` e monta host com factory unica `'gantt-aps'`, usando `renderer: 'gantt-aps'`. | Passou. |
| `CalendarTimeline` nao e necessario para fallback | REF-043 removeu fallback automatico V2 e REF-045 removeu selecao operacional V2; erro do Gantt propaga pelo host sem alternativa visual silenciosa. | Passou. |
| Gantt possui move/edit/split | Factory da pagina conecta `onRequestMove`, `onRequestEdit` e `onRequestSplit`; `ganttApsRenderer.test.js` protege callbacks. | Passou. |
| Nenhuma funcionalidade saudavel depende do ramo `!USE_PRODUCTION_CALENDAR_V2` | A constante era local e sempre `true`; o ramo nao era alcancavel. | Passou. |
| `CalendarTimeline` continua com consumidores fora da PlanningPage | `AnalysisPage.js` importa e chama `CalendarTimeline`; `CommercialCalendarPage.js` usa `AnalysisPage({ mode: 'commercial' })`. | Passou. |

## 4. Ramo antes/depois

Antes:

```text
renderProductionCalendar
-> if (!USE_PRODUCTION_CALENDAR_V2)
   -> CalendarTimeline(...)
-> else
   -> host Gantt APS
```

Depois:

```text
renderProductionCalendar
-> build snapshot
-> build planning schedule view model
-> host Gantt APS
```

## 5. Helpers preservados/removidos

Removidos:

- `CalendarTimeline` import em `PlanningPage.js`;
- `USE_PRODUCTION_CALENDAR_V2`;
- branch `CalendarTimeline` em `renderProductionCalendar`.

Preservados:

- `timelineOperations`, porque ainda e usado por `simulatedProductionByDate`;
- snapshot/adapters, porque alimentam Gantt, estoque e validacoes;
- `ProductionCalendar` e callbacks de editor/fullscreen/horizon/stock, porque pertencem a fluxos fisicos V2 ainda preservados nesta REF;
- diagnostics, stock helpers, fullscreen, funcoes de schedule e persistencia.

## 6. Contrato final

- `PlanningPage` sempre renderiza schedule pelo host/Gantt.
- Nao ha `USE_PRODUCTION_CALENDAR_V2` em `PlanningPage.js`.
- Nao ha import ou chamada de `CalendarTimeline` em `PlanningPage.js`.
- Gantt continua conectado a move/edit/split.
- Erros do Gantt continuam propagados pelo host sem fallback visual alternativo.
- `shared/CalendarTimeline.js` continua fisicamente presente.
- Implementacao fisica V2 continua presente.

## 7. Testes

Executados:

```text
node --check pages/PlanningPage.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/*.js
git diff --check
```

Resultado final: suite completa com 98 testes, 98 aprovados e 0 falhas.

## 8. Blockers para remocao fisica

- REF-013 homologacao operacional manual continua pendente.
- `ProductionCalendar`, grid, CSS V2, wrappers legados e testes fisicos ainda existem.
- `shared/CalendarTimeline.js` tem consumidores ativos em Analise/Comercial.
- `productionCalendarV2.renderer.js` permanece fisicamente nesta REF.
- Documentacao historica ainda menciona estados antigos como registro de evolucao.
