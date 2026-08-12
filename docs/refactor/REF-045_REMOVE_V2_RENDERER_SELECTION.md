# REF-045 - Remover selecao/configuracao operacional do Calendario V2

Data: 2026-08-12

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `dd97ef8`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Selecao antes/depois

| Entrada | Antes | Depois |
|---|---|---|
| `undefined` / default | `gantt-aps` | `gantt-aps` |
| `auto` | `gantt-aps`, salvo `autoPolicy` explicita para V2 | `gantt-aps` |
| `gantt-aps` | `gantt-aps` | `gantt-aps` |
| `production-calendar-v2` | montava V2 se factory registrada | normaliza como invalido/legado e monta `gantt-aps` |
| `autoPolicy -> production-calendar-v2` | podia selecionar V2 | resolve `gantt-aps` |
| `fallbackRenderer -> production-calendar-v2` | no-op desde REF-043 | permanece no-op |
| `globalThis.PLANNING_SCHEDULE_RENDERER` | podia trocar renderer na `PlanningPage` | leitura removida |

## 3. Auditoria de ocorrencias

| Ocorrencia | Classificacao | Decisao |
|---|---|---|
| `shared/planning-schedule-view/planningScheduleRenderer.js`: `PRODUCTION_CALENDAR_V2`, `production-calendar-v2`, `autoPolicy` | selecao/config operacional | Removido V2 do enum ativo; `autoPolicy` preservado como compatibilidade, mas nao pode selecionar V2. |
| `shared/planning-schedule-view/planningScheduleRenderer.js`: `fallbackRenderer` | compatibilidade morta | Preservado como parametro no-op para nao refatorar API nesta REF. |
| `shared/planning-schedule-view/index.js`: export de `createProductionCalendarV2Renderer` | selecao/config operacional via barrel | Removido do barrel operacional; consumidores fisicos usam import direto. |
| `shared/planning-schedule-view/productionCalendarV2.renderer.js`: `createProductionCalendarV2Renderer` | implementacao fisica V2 | Preservado. |
| `pages/PlanningPage.js`: factory `'production-calendar-v2'` e import `createProductionCalendarV2Renderer` | selecao/config operacional | Removidos. |
| `pages/PlanningPage.js`: `globalThis.PLANNING_SCHEDULE_RENDERER` | selecao/config operacional | Removido; pagina monta `renderer: 'gantt-aps'`. |
| `pages/PlanningPage.js`: `USE_PRODUCTION_CALENDAR_V2` e `CalendarTimeline` | compatibilidade morta / uso compartilhado por outro fluxo | Preservado. O ramo e constante `true`, nao seleciona V2, e `CalendarTimeline` ainda e usado em Analise/Comercial. |
| `pages/AnalysisPage.js` e `shared/CalendarTimeline.js`: `CalendarTimeline` | uso compartilhado por outro fluxo | Preservado. |
| `tests/planningScheduleRenderer.test.js` | documentacao/teste | Atualizado para proteger que V2 legado nao monta. Teste fisico do renderer V2 continua por import direto. |
| `tests/ganttApsRenderer.test.js` | documentacao/teste | Atualizado para proteger factory operacional Gantt e ausencia de override global/V2. |
| `docs/*`, `CALENDAR_V2_ARCHITECTURE.md`, Plano Mestre | documentacao/teste historico | Preservado como historico; esta REF registra o novo estado. |

## 4. Gate antes de alterar

| Item | Evidencia | Resultado |
|---|---|---|
| Gantt e default | `resolvePlanningScheduleRenderer(undefined)` e `resolvePlanningScheduleRenderer('auto')` retornavam `gantt-aps`. | Passou. |
| Fallback automatico V2 desligado | REF-043 e testes do host propagam erro de mount/update sem montar V2. | Passou. |
| Gantt possui move/edit/split | `createGanttApsRenderer({ onRequestMove, onRequestEdit, onRequestSplit })` e testes REF-044. | Passou. |
| Edit/split abrem editor neutro | `PlanningPage.js` chama `openProductionCalendarAllocationEditor(...)` e `{ startSplit: true }`. | Passou. |
| Editor/split nao dependem do renderer V2 | `PlanningAllocationEditor` e controller neutro em `shared/planning-editor` / `shared/planning-controller`. | Passou. |
| Fluxo saudavel da PlanningPage exige V2 | Nenhuma evidencia; Gantt tem factory, view model e callbacks suficientes. | Falso; pode remover selecao V2. |

## 5. Alteracoes

- `planningScheduleRenderer.js`: removeu `PRODUCTION_CALENDAR_V2` do enum ativo; `production-calendar-v2` agora normaliza para `auto`; `autoPolicy` nao consegue selecionar V2.
- `index.js`: removeu re-export operacional do renderer/adaptador V2.
- `PlanningPage.js`: removeu import/factory operacional V2 e leitura de `globalThis.PLANNING_SCHEDULE_RENDERER`; monta explicitamente `gantt-aps`.
- Testes: contrato atualizado para default/auto/gantt/V2 legado, `autoPolicy`, `fallbackRenderer`, factory operacional da pagina e callbacks Gantt.

## 6. Paridade move/edit/split

`PlanningPage` preserva:

- `onRequestMove: handleProductionCalendarMoveRequest`
- `onRequestEdit: allocation => openProductionCalendarAllocationEditor(allocation)`
- `onRequestSplit: allocation => openProductionCalendarAllocationEditor(allocation, { startSplit: true })`

O renderer Gantt continua emitindo intencoes; transacao, validacao, rollback e save continuam no controller/service existente.

## 7. V2 fisico preservado

Preservados nesta REF:

- `shared/planning-schedule-view/productionCalendarV2.renderer.js`
- `shared/production-calendar/ProductionCalendar.js`
- grid, CSS, wrappers legados e testes fisicos do V2
- `renderProductionCalendarSnapshot` e helpers/callbacks associados na `PlanningPage`, por serem legado fisico e nao necessarios para bloquear selecao operacional

## 8. Testes

Executados:

```text
node --check shared/planning-schedule-view/planningScheduleRenderer.js
node --check pages/PlanningPage.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/planningAllocationEditorController.test.js
node --test tests/*.js
git diff --check
```

Resultado final: 98/98 ou maior, zero falhas.

## 9. Blockers para remocao fisica

- REF-013 homologacao operacional manual ainda nao concluida.
- Fallback morto `USE_PRODUCTION_CALENDAR_V2 -> CalendarTimeline` na `PlanningPage` precisa missao propria por tocar `CalendarTimeline`, `timelineOperations` e consumidores Analise/Comercial.
- Renderer V2 fisico, `ProductionCalendar`, grid, CSS, wrappers e testes fisicos ainda existem.
- Documentacao historica (`APS_GANTT_*`, REF-043, arquitetura V2) ainda menciona rollback/config antiga como historico.
