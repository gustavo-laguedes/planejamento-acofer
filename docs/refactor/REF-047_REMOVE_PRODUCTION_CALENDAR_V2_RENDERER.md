# REF-047 - Remover productionCalendarV2.renderer.js

Data: 2026-08-12

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `8f1a6ad`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Consumidores encontrados

| Ocorrencia | Classificacao | Decisao |
|---|---|---|
| `shared/planning-schedule-view/productionCalendarV2.renderer.js` | implementacao fisica interna | Removido nesta REF. |
| `shared/planning-schedule-view/index.js` | barrel/export operacional | Ja nao exportava V2; preservado sem alteracao. |
| `shared/planning-schedule-view/planningScheduleRenderer.js` | renderer host | Ja nao selecionava V2; preservado sem alteracao. |
| `pages/PlanningPage.js` | runtime do Planejamento | Nao importa, nao registra factory V2 e monta `gantt-aps`; preservado sem alteracao. |
| `tests/planningScheduleRenderer.test.js` | teste de caracterizacao | Removido import/instanciacao V2; passou a afirmar ausencia fisica do arquivo e ausencia no barrel/pagina. |
| `tests/planningScheduleViewModel.test.js` | teste de caracterizacao do adapter V2 | Removido consumidor artificial de `planningScheduleViewToProductionCalendarSnapshot`; contrato neutro segue protegido. |
| `tests/ganttApsRenderer.test.js` | teste estatico negativo | Mantido; afirma que `PlanningPage` nao registra factory V2 e que Gantt mantem move/edit/split. |
| Docs APS antigas e REFs anteriores | documentacao historica | Mantidas como historico da evolucao. |
| `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md` | documentacao ativa | Atualizado com a remocao fisica do adapter e blockers restantes. |

## 3. Gate

| Item | Evidencia | Resultado |
|---|---|---|
| `PlanningPage` nao importa renderer V2 | `rg` em `pages/PlanningPage.js` nao encontrou `createProductionCalendarV2Renderer` nem `productionCalendarV2.renderer`. | Passou. |
| Barrel operacional nao exporta renderer V2 | `shared/planning-schedule-view/index.js` exporta view model, host e Gantt APS apenas. | Passou. |
| Renderer host nao seleciona V2 | `PLANNING_SCHEDULE_RENDERERS` contem apenas `gantt-aps` e `auto`; `production-calendar-v2` normaliza para `auto` e resolve `gantt-aps`. | Passou. |
| `production-calendar-v2` nao e renderer operacional | Testes do host preservam que a entrada legado monta `gantt-aps`, nao V2. | Passou. |
| Nenhum runtime importa `createProductionCalendarV2Renderer` | Busca global mostrou ocorrencias apenas em testes negativos, plano e docs historicas. | Passou. |
| Nenhum runtime depende de `planningScheduleViewToProductionCalendarSnapshot` | Consumidor real inexistente; uso em `planningScheduleViewModel.test.js` era caracterizacao do adapter removido. | Passou. |
| Gantt mantem move/edit/split | `PlanningPage` conecta `onRequestMove`, `onRequestEdit`, `onRequestSplit`; `ganttApsRenderer.test.js` protege callbacks. | Passou. |
| Suite atual esta verde | Baseline inicial 98/98 antes da remocao. | Passou. |

## 4. Renderer V2 removido

Arquivo removido:

- `shared/planning-schedule-view/productionCalendarV2.renderer.js`

Funcoes exportadas pelo arquivo removido:

- `planningScheduleViewToProductionCalendarSnapshot`
- `createProductionCalendarV2Renderer`

Funcoes internas removidas junto:

- `cloneValue`
- `defaultRenderSnapshot`
- `escapeSelectorValue`

## 5. Funcao de adaptacao auditada

`planningScheduleViewToProductionCalendarSnapshot` convertia o read model neutro de `planning-schedule-view/v1` de volta para props do `ProductionCalendar`.

Comparacao com o adapter neutro atual:

- O fluxo operacional atual e snapshot aceito -> `buildPlanningScheduleViewModel` -> Gantt APS.
- O adapter neutro atual alimenta o read model do Gantt a partir do snapshot aceito; nao precisa converter o read model de volta para V2.
- O unico consumidor encontrado da funcao era teste de caracterizacao, removido para nao manter dependencia artificial.

Decisao: remover sem migrar consumidores, porque nenhum consumidor runtime existe.

## 6. Componentes V2 preservados

Preservados fisicamente nesta REF:

- `shared/production-calendar/ProductionCalendar.js`
- `shared/production-calendar/ProductionCalendarGrid.js`
- cards, drag, state, toolbar, details
- wrappers de editor/split
- CSS V2
- helpers legados e testes fisicos dos componentes

## 7. Testes atualizados

- `tests/planningScheduleRenderer.test.js`: removeu import/instanciacao do renderer V2 e passou a afirmar ausencia fisica do arquivo.
- `tests/planningScheduleViewModel.test.js`: removeu o roundtrip artificial pelo adapter V2 e manteve assercoes do contrato neutro.

Validacoes executadas:

- `node --check pages/PlanningPage.js`
- `node --check shared/planning-schedule-view/planningScheduleRenderer.js`
- `node --test tests/planningScheduleRenderer.test.js`
- `node --test tests/ganttApsRenderer.test.js`
- `node --test tests/productionCalendarEditButton.test.js`
- `node --test tests/productionCalendarSplitEditor.test.js`
- `node --test tests/planningScheduleViewModel.test.js`
- `node --test tests/*.js` -> 98 testes, 98 aprovados, 0 falhas
- `git diff --check` -> sem erros, apenas avisos conhecidos LF -> CRLF

## 8. Referencias restantes

Depois da remocao, as ocorrencias restantes se classificam assim:

- Testes negativos: `tests/planningScheduleRenderer.test.js`, `tests/ganttApsRenderer.test.js`, `tests/planningScheduleViewModel.test.js`.
- Documentacao ativa atualizada: Plano Mestre e este arquivo REF-047.
- Documentacao historica: `CALENDAR_V2_ARCHITECTURE.md`, `docs/APS_GANTT_*`, `docs/refactor/REF-002`, `REF-010`, `REF-020`, `REF-038`, `REF-043`, `REF-045`, `REF-046`.

Zero consumidores runtime do renderer removido.

## 9. Blockers para proxima remocao fisica

- REF-013 homologacao operacional manual continua pendente.
- `ProductionCalendar`, grid, toolbar, details, drag/state e CSS V2 continuam fisicamente presentes.
- Wrappers legados de editor/split e helpers `production-calendar-*` ainda existem por compatibilidade.
- Docs historicas antigas ainda descrevem estados anteriores como registro de evolucao.
