# REF-001 - Mapa da PlanningPage.js

Fonte funcional superior: `docs/refactor/PLANNING_SIMULATION_CANONICAL_SPEC.md`. Este mapa e inventario tecnico da pagina; regra funcional canonica deve ser conferida no spec.

Arquivo auditado: `pages/PlanningPage.js`
Linhas no estado atual: 7097

Nota REF-010: a contagem anterior de 6721 veio de `Get-Content | Measure-Object -Line`, que subcontou o arquivo neste ambiente. A contagem real foi confirmada por `rg -n "^" pages\PlanningPage.js | Select-Object -Last 5`, Node (`7097` quebras de linha) e `Get-Content -Raw`.

## Mapa por faixa

| Linhas | Responsabilidade | Funcoes principais | Estado lido/alterado | Services/DOM | Testabilidade | Risco | Destino sugerido |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1-74 | Imports, flags e constantes | `USE_PRODUCTION_CALENDAR_V2`, chaves localStorage | nenhum estado runtime | imports V2, Gantt, services | alta para constantes | medio por rollback | `planning/bootstrap` e `planning/scheduleRendererConfig` |
| 76-352 | helpers de estoque, datas, texto e numeros | `shouldUsePlanningStockBalance`, `formatDateOnly`, `parsePtBrDecimal`, `normalizeJsonArray`, `formatPtBrDecimal` | `localStorage` em minimos PCP | `localStorage` | alta, exceto leitura storage | baixo | `planning/formatters`, `planningStockPresentation` |
| 352-596 | helper de estoque manual e autorizacao | `manualStockMaterialCatalog`, `manualStockDependenciesForAllocation`, `buildManualStockMoveModalModel`, `collectStockShortagesFromTree` | entradas recebidas | nenhuma API; monta HTML em `renderStockShortageTable` | media/alta | medio por regra perto da UI | `planning/manualStockPresentation` |
| 600-815 | status, duracao, calendario inline, turnos e draft default | `formatStatus`, `generatePlanningCode`, `renderPlanningInlineCalendar`, `defaultShift`, `emptyProduction` | `draft` ainda nao inicializado | `holidayForDate` | alta | baixo/medio | `planningDraftDefaults`, `planningDateControls` |
| 831-950 | cores, transporte, draft default/normalize/load | `automaticProductionColor`, `productionTheme`, `normalizeDraft`, `loadDraft` | `localStorage`; campos `draft.*` | `productionDisplayColor` | alta com storage injetado | medio por acoplamento V2/nome | `planningDraftStorage`, `productionPresentation` |
| 987-1187 | estoque de simulation, transportes, validacao manual decorada | `stockFromSchedule`, `manualScheduleValidationContext`, `buildProductionCalendarValidationSnapshot` | simulation/materials/locations | `presentManualScheduleValidation` | media | alto, regra de apresentacao misturada | `planningValidationPresentation` |
| 1200-1269 | aceite de reotimizacao e fullscreen/exclusive V2 | `applyAcceptedPlanningReoptimization`, `createProductionCalendarExclusivePage` | current/draft por parametro; DOM body | DOM direto | media/baixa | medio | `planningReoptimizationAcceptance`, `scheduleFullscreenView` |
| 1274-1312 | inicializacao da pagina e estado mutavel | `PlanningPage` closure | todos os `let` de pagina | DOM inicial, sessionStorage | baixa | alto | manter temporariamente na pagina |
| 1314-1443 | toast, loading, API simulate, payload/autosave | `toast`, `setOperationLoading`, `simulatePlanningRequest`, `normalizePlanningPayload`, `saveDraftNow`, `queueAutosave` | `draft`, `lastPayload`, `currentSimulation`, timers | API `/planning/simulate`, localStorage | media com injecao | alto | `planningController`, `planningAutosave` |
| 1443-1572 | lookups, matriz, materiais, payload | `loadLookups`, `matchingMatrix`, `hydrateProductionDefaults`, `productionPayload`, `payload` | `materials`, `matrix`, `locations`, `registeredMachines`, `draft`, `manualScheduleDraft` | API lookups | media | medio | `planningLookups`, `planningPayloadBuilder` |
| 1576-1700 | cores, overrides, historico undo/redo | `withProductionColors`, `operationOverrideKeys`, `cloneDraftPlanningState`, `recordAcceptedManualState`, undo/redo | `draft`, `manualScheduleDraft`, `manualScheduleHistory`, `productionCalendarVisualState` | history service | media | alto por closure | `planningManualHistoryController` |
| 1700-1861 | drop/timeline legado, replace e validacao form | `findSimulationOperation`, `matchingDropOption`, `applyDropPlanningChange`, `validateDraft` | `currentSimulation`, `draft`, lookups | legacy events | baixa/media | alto | manter ate remover legado |
| 1896-2070 | render de formulario, producoes e turnos | `renderShift`, `renderProduction`, `renderProductionDetailsFields`, `stockOnlyMaterialsForPayload` | `draft`, `materials`, `matrix` | HTML strings | media | medio | `planningBuilderView` |
| 2070-2436 | estoque overview e decisoes de falta | `loadStockOverviewRows`, `collectProductionShortageDecisions`, `requestProductionShortageDecisions`, `applyProductionShortageDecisions` | `stockOverviewCache`, `draft` | API `/stock/materials-overview`, modais | media | alto por regra produtiva visual | `planningShortageDecisions` |
| 2436-2720 | fluxo produtivo e grafo | `applySkippedProductionCascade`, `productionFlowTrees`, `buildFlowGraph`, `mergeFlowNode` | `draft` | none | alta/media | medio | `planningFlowModel` |
| 2720-2920 | limpeza de estado escopado e render fluxo | `removeProductionScopedState`, `renderFlowNodeCard`, `renderFlowGraph`, `drawProductionFlowConnectors` | `draft`, timers | DOM/SVG | media/baixa | medio | `planningFlowView` |
| 2952-3217 | adapter/snapshot calendario, validacao, descarte | `productionCalendarMachines`, `currentProductionCalendarSnapshot`, `currentManualScheduleValidationContext`, `prepareCleanSimulationDiscard`, `discardAllProductionCalendarChanges` | `currentSimulation`, `manualScheduleDraft`, `currentAutomaticBaseline`, `draft` | adapter V2, APIs manual-schedule | media | alto | `planningScheduleSnapshot`, `planningManualDiscardController` |
| 3217-3386 | movimento, capacidade e reotimizacao de movimento | `validateProductionCalendarMoveIntent`, `handleProductionCalendarMoveRequest`, `reoptimizeProductionCalendarConstraints`, `buildManualMoveCandidateDraft`, `reoptimizeManualMoveCandidate` | `manualScheduleDraft`, `currentSimulation`, matrix | `reoptimizePlanningFuture`, transaction | baixa/media | alto | `planningScheduleMoveController` |
| 3386-3679 | transporte e escopo downstream | `manualTransportConstraints`, `productionCalendarDownstreamParentIds`, `applyManualTransportConstraints`, `withManualTransportPresentation` | `manualScheduleDraft`, `currentSimulation` | none/services via callers | media | alto | `planningTransportController` |
| 3679-4239 | modais e handlers de editar/split/transporte/dia/equipe | `handleProductionCalendarAllocationSave`, `openProductionCalendarAllocationEditor`, `handleProductionCalendarTransportSave`, `handleProductionCalendarManualWorkDate`, `handleProductionCalendarDailyTeam` | `manualScheduleDraft`, `draft`, `currentSimulation` | `ProductionCalendarEditor`, transaction, reoptimization | baixa | alto | `planningAllocationEditorController`, `planningWorkCalendarController` |
| 4239-4513 | otimizacao de utilizacao PCP | `productionCalendarOptimizationMetrics`, `loadPlanningPcpAutoCandidates`, `simulatePlanningWithProductions`, `handleProductionCalendarUtilizationOptimization` | `draft`, `manualScheduleDraft`, `currentSimulation` | API stock/balance, simulate | baixa/media | alto | missao propria `planningUtilizationOptimization` |
| 4513-4710 | snapshot/render schedule, renderer host Gantt/V2 | `buildProductionCalendarSnapshot`, `renderProductionCalendarSnapshot`, `renderProductionCalendar` | `productionCalendarVisualState`, `planningScheduleRendererHost`, `currentPlanningStockProjection` | `buildPlanningScheduleViewModel`, host, V2, Gantt | media | alto por fronteira Gantt/V2 | `planningScheduleController` |
| 4714-4895 | modal e projecao de estoque | `openPlanningStockProjectionModal`, `refreshPlanningStockProjection`, `schedulePlanningStockAlerts` | `currentPlanningStockProjection`, `currentPlanningStockAlerts` | `projectPlanningStockByDay`, API stock-projection | media | medio/alto | `planningStockProjectionController` |
| 4895-5154 | render simulation, refresh, resumo e save/launch | `renderSimulation`, `refreshTimelineOnly`, `launchPlanning` | `currentSimulation`, `manualScheduleDraft`, `currentAutomaticBaseline`, `draft` | APIs `/planning/plans`, manual-schedule | baixa | alto | `planningSimulationController`, `planningPersistenceController` |
| 5175-5416 | historico, detalhe, PDF, cancelamento, reopen | `openPlanDetailModal`, `reopenSavedPlan`, `downloadPdf`, `cancelPlan` | `draft`, `currentSimulation`, `manualScheduleDraft` | APIs plans/pdf/cancel | media | alto | `planningHistoryController` |
| 5427-6002 | render tab simulacao e eventos builder | `renderSimulationTab`, `rerenderBuilder`, `handleProductionInput`, `openProductionDetailsModal`, listeners | `draft`, `currentSimulation`, timers | DOM massivo | baixa/media | alto | `planningBuilderController` |
| 6002-6047 | simulateCurrent e cascata de falta | `simulateCurrent` | `lastPayload`, `currentSimulation`, `manualScheduleDraft`, `draft` | API simulate | baixa/media | alto | `planningSimulationController` |
| 6047-6751 | modais e runner de movimento manual/estoque parcial | `openManualDraftChoiceModal`, `confirmManualMoveConfiguration`, `openManualStockPartialMoveModal`, `productionCalendarMoveRunner` | `manualScheduleDraft`, `productionCalendarVisualState`, `draft` | `ProductionCalendarEditor`, transaction | baixa | alto | `planningManualMoveController`, `manualStockMoveController` |
| 6751-7097 | detalhes do fluxo, listeners finais, history tab/render | `openFlowNodeDetailsModal`, eventos `operation-*`, `renderHistoryTab`, `render` | quase todo estado | DOM, API | baixa | alto | manter ate fatiar controllers |

## Inventario do estado mutavel

- Persistente/local: `draft`, `lastPayload`, `currentSimulation`, `currentAutomaticBaseline`, `manualScheduleDraft`.
- Cache: `materials`, `matrix`, `locations`, `registeredMachines`, `stockOverviewCache`, `currentPlanningStockProjection`, `currentPlanningStockAlerts`, `planningStockAlertRequestId`.
- UI/lifecycle: `activeTab`, `productionCalendarVisualState`, `productionCalendarExclusiveView`, `planningScheduleRendererHost`, `operationLoadingCount`, `operationOverlay`.
- Manual/history: `manualScheduleHistory`, `productionCalendarMoveInProgress`, `productionCalendarMoveRunner`, `hasPendingSimulationChanges`.
- Timers: `autosaveTimer`, `recalculationTimer`.

## Grafo textual

Builder/draft -> payload -> `/planning/simulate` -> `currentSimulation` -> snapshot calendario -> read model -> host -> Gantt/V2.

Snapshot aceito -> `manualScheduleDraft` -> transacao manual -> validacao/reotimizacao -> aceite -> history/autosave -> rerender schedule/flow/stock.

Fluxo produtivo -> foco por `allocationId` -> host/Gantt ou V2 fallback.

Save/reopen -> routes -> persistencia manual -> `normalizePersistedManualScheduleDraft` -> baseline automatica -> draft aceito -> render.

## Funcoes puras extraiveis imediatamente

`formatDateOnly`, `formatPeriod`, `parsePtBrDecimal`, `escapeHtml`, `normalizeText`, `stockProjectionSalesPerDay`, `stockProjectionDurationDays`, `materialLookupKeys`, `normalizeJsonArray`, `normalizeJsonObject`, `formatPtBrDecimal`, `formatPtBrInteger`, `normalizeOperationParentId`, `manualStockMaterialId`, `manualStockMaterialUnit`, `stockShortageKey`, `collectStockShortagesFromTree`, `formatStatus`, `isCanceledStatus`, `formatDuration`, `formatHourDuration`, `generatePlanningCode`, `matrixSecondsPerUnit`, `matrixPriority`, `dateOnlyFromDate`, `parseDateOnly`, `addCalendarMonths`, `isWeekendDate`, `minutesToTime`, `productiveMinutes`, `timeToMinutes`, `defaultShift`, `emptyProduction`, `normalizeShiftTimes`, `productionTheme`, `productionSegmentStyle`, `operationOverrideKeys`, `treeForProductionIndex`, `productionCalendarParentOperationId`, `productionCalendarAllocationLabel`, `manualTransportIdFor`, `transportArrivalDateFromHours`, `transportHoursForArrivalDate`, `productionCalendarTimeMinutes`, `planningMaterialKeys`.

## Funcoes fortemente acopladas a closure

`saveDraftNow`, `queueAutosave`, `loadLookups`, `payload`, `recordAcceptedManualState`, `applyManualHistoryResult`, `renderProductionFlows`, `currentProductionCalendarSnapshot`, `currentManualScheduleValidationContext`, `discardAllProductionCalendarChanges`, `handleProductionCalendarMoveRequest`, `reoptimizeManualMoveCandidate`, `handleProductionCalendarAllocationSave`, `openProductionCalendarAllocationEditor`, `acceptRecalculatedCalendar`, `handleProductionCalendarTransportSave`, `handleProductionCalendarManualWorkDate`, `handleProductionCalendarDailyTeam`, `handleProductionCalendarUtilizationOptimization`, `buildProductionCalendarSnapshot`, `renderProductionCalendar`, `refreshPlanningStockProjection`, `renderSimulation`, `refreshTimelineOnly`, `launchPlanning`, `reopenSavedPlan`, `renderSimulationTab`, `simulateCurrent`, `productionCalendarMoveRunner`.

## Regras de dominio proximas demais da UI

- Calculo de capacidade/people preview e escolha de maquina/pessoas no editor.
- Movimento manual com estoque parcial e escolha de data restante dentro da pagina.
- Construcoes downstream para transporte e escopo de reotimizacao.
- Decisoes de falta de estoque e cascata de producao pulada.
- Validacao manual decorada por allocation/data em funcao exportada pela pagina.
- Otimizacao de utilizacao PCP que simula candidatos e troca baseline.

## Circularidades potenciais

- `PlanningPage` importa V2 e host; host fallback importa V2; V2 callbacks voltam para closures da pagina.
- Gantt emite intencao para handler com nome `productionCalendar*`, que chama services e atualiza `manualScheduleDraft`.
- Cores neutras vivem em `shared/production-calendar` e sao usadas por PlanningPage, V2, Gantt e fluxo.

## Ordem recomendada de extracao

1. Formatters/datas/numeros e apresentacao pura.
2. Draft storage/autosave e defaults.
3. Lookups e payload builder.
4. Snapshot/read model de schedule.
5. Stock presentation/projection sem modais.
6. Flow model e depois Flow view.
7. History/reopen/PDF.
8. Move/editor/split/transporte com contratos explicitos.
9. Reotimizacao e utilizacao PCP.

## O que deve continuar temporariamente na pagina

Inicializacao da pagina, montagem de tabs, estado central, listeners raiz, sequencia de render, autorizacao `canWritePlanning`, ponte entre controllers enquanto nao houver contrato explicito, e handlers produtivos manuais ate que cada service/controller tenha teste de caracterizacao.
