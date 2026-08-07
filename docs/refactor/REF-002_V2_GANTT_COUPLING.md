# REF-002 - Acoplamento Calendario V2 -> Gantt APS

## Evidencias principais

- `PlanningPage.js` importa diretamente `shared/production-calendar/index.js` e tambem `shared/planning-schedule-view/index.js`.
- `USE_PRODUCTION_CALENDAR_V2 = true` ainda existe, mas o runtime atual passa por `createPlanningScheduleRendererHost`.
- `resolvePlanningScheduleRenderer('auto')` resolve para `gantt-aps`, exceto se uma politica explicita devolver `production-calendar-v2`.
- V2 permanece registrado como fallback no host via `createProductionCalendarV2Renderer`.
- `shared/production-calendar/index.js` injeta `production-calendar.css` automaticamente no browser.
- `ProductionCalendarEditor` e `ProductionCalendarSplitEditor` estao em pacote visual V2, mas atendem edicao operacional usada pelo fluxo atual.
- `productionDisplayColor.js` e utils de dia/numero sao neutros de apresentacao, mas vivem sob `production-calendar`.

## Matriz

| Simbolo ou arquivo atual | Categoria | Consumidores | Comportamento atendido | Destino proposto | Pre-requisitos para mover | Pode ser removido quando | Risco |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shared/production-calendar/ProductionCalendar.js` | visual exclusivo do Calendario V2 | `productionCalendarV2.renderer.js`, testes V2 | compoe toolbar/grid/details/drag e click-move V2 | manter ate Gantt-only; depois remover | paridade operacional Gantt e fallback desligado | sem imports/runtime V2 | alto |
| `ProductionCalendarGrid.js` | visual exclusivo do Calendario V2 | `ProductionCalendar.js`, testes | grid por maquina/dia, headers, conectores transporte | remover junto do V2 | migrar comportamentos ainda necessarios ao Gantt | Gantt cobrir dias, transporte, headers | alto |
| `ProductionCalendarToolbar.js` | visual exclusivo do V2 | `ProductionCalendar.js` | zoom, fullscreen, undo/redo, descarte V2 | substituir por toolbar Gantt | paridade toolbar Gantt | V2 removido | medio |
| `ProductionCalendarCard.js` | UI V2 + util de cor reutilizado | V2, docs/testes; plano historico cita Gantt | card V2 e `getProductionCalendarAllocationColor` | separar cor em modulo neutro; card fica V2 | Gantt/fluxo importarem somente `productionDisplayColor` | sem consumidor de card | alto |
| `productionDisplayColor.js` | utilitario neutro | index V2, PlanningPage, testes, possivel Gantt | paleta/cor visual canonica readonly | mover para `shared/planning-presentation/productionDisplayColor.js` com re-export temporario | migrar imports e testes | re-export antigo sem consumidores | medio |
| `ProductionCalendarDetails.js` | visual exclusivo V2 ou codigo sem consumidor ativo | V2/export/testes indiretos | painel de detalhes de allocation | remover ou portar para inspector Gantt se necessario | confirmar consumidor real | inspector Gantt substitui | medio |
| `ProductionCalendarDrag.js` | visual exclusivo V2 | V2 | pointer drag, hover, auto-scroll, intencao MOVE | nao mover; Gantt tem drag proprio | paridade Gantt drag/click-move | Gantt homologado | alto |
| `ProductionCalendarState.js` | visual exclusivo V2 | V2 | zoom/scroll/drag/details local | remover com V2 | viewport Gantt proprio | V2 removido | medio |
| `ProductionCalendarEditor.js` | UI operacional reutilizada pelo Gantt/fluxo | `PlanningPage.openProductionCalendarAllocationEditor` | editar maquina/pessoas, iniciar split | mover para `shared/planning-schedule-editor/AllocationEditor.js` | contrato neutro de editor e produtividade | nova UI usada pela pagina/Gantt | alto |
| `ProductionCalendarSplitEditor.js` | UI operacional reutilizada | index/testes; chamado via editor | split visual e preview | mover para `shared/planning-schedule-editor/SplitEditor.js` | preservar testes e payloads | editor neutro substituir | alto |
| `productionCalendar.adapter.js` | adapter do planejamento em local inadequado | `PlanningPage`, docs, testes | `adaptPlanningResultToProductionCalendar` cria allocations/snapshot visual | mover para `shared/planning-schedule-view/adapters/planningAllocationsAdapter.js` | contrato de IDs/paridade e re-export | PlanningPage nao importar pacote V2 | alto |
| `productionCalendar.utils.js` | utilitario neutro + visual V2 | V2, PlanningPage | dias, range, formatacao, agrupamento | dividir: datas/formatos neutros e utils V2 | testes por helper | imports migrados | medio |
| `productionCalendar.validation.js` | validacao visual | V2/tests | valida contrato minimo para render | manter com V2 ou mover para read-model validator se usado | confirmar uso fora V2 | sem V2 | baixo/medio |
| `production-calendar.css` | visual exclusivo V2 | auto-injetado por index | estilos V2, modais de escolha em `style.css` separado | remover no gate V2 | nenhum import de index V2 em runtime | V2 sem consumidor | medio |
| `shared/production-calendar/index.js` | compatibilidade temporaria | PlanningPage, testes | barrel export + CSS auto-load | quebrar em imports diretos/re-exports neutros temporarios | migrar consumidores | sem import do barrel | alto por CSS colateral |
| `createProductionCalendarV2Renderer` | compatibilidade temporaria/fallback | `PlanningPage`, host/tests | adapter read model -> V2 | manter ate rollback nao ser necessario | Gantt default homologado e V2 gate aprovado | fallback removido | alto |
| `createPlanningScheduleRendererHost` | utilitario neutro | `PlanningPage`, tests | lifecycle, fallback, renderer unico | manter em `planning-schedule-view` | ajustar politica Gantt-only futuramente | nao remover; apenas simplificar | medio |
| `globalThis.PLANNING_SCHEDULE_RENDERER` | compatibilidade temporaria | `PlanningPage.renderProductionCalendar` | selecao manual de renderer | substituir por configuracao formal/rollout | politica de rollout aprovada | Gantt-only sem override | medio |
| `USE_PRODUCTION_CALENDAR_V2` | compatibilidade legada | `PlanningPage.renderProductionCalendar` | ramo legado para `CalendarTimeline` quando false | remover em missao Gantt-only | confirmar `CalendarTimeline` nao usado no Planejamento | Gantt unico | medio |
| `CalendarTimeline.js` | referencia historica/legado fora do Gantt | `AnalysisPage`, `CommercialCalendarPage`, import morto/legado em PlanningPage | timeline antigo e eventos operation-* | manter para Analise/Comercial; remover import da PlanningPage em missao propria | mapear consumidores fora Planejamento | nunca remover globalmente sem missao propria | alto |
| `planningScheduleViewModel.js` | utilitario neutro | PlanningPage, V2 renderer, Gantt, tests | read model versionado | manter; expandir projections neutras | testes de paridade | nao removivel | baixo |
| `ganttAps.renderer.js` | Gantt APS visual | index, tests, PlanningPage via factory | tabela/timeline/drag readonly/manualMove | manter e futuramente dividir | lifecycle/toolbar/inspector tests | nao removivel | medio |
| `ganttAps.geometry.js` | utilitario neutro do Gantt | renderer/tests | geometria temporal/order/rows | manter no pacote Gantt | nenhum | nao removivel | baixo |
| `PlanningPage.productionCalendar*` funcoes | adapter/controller em local inadequado | closures da pagina, V2, Gantt handlers | snapshot, move, edit, transport, reopt | renomear/extrair para `planningSchedule*` controllers | testes de caracterizacao | apos controllers neutros | alto |
| `tests/productionCalendar*.js` | testes V2/historicos | Node runner | valida V2, editor, split, cor | reclassificar: V2 legado x editor neutro | matriz de remocao V2 | V2 removido/testes migrados | medio |
| `docs/APS_*` e `CALENDAR_V2_ARCHITECTURE.md` | documentacao normativa/historica | equipe/Codex | registra rollback e evolucao | atualizar quando gates mudarem | decisao Gu | referencias historicas arquivadas | baixo |

