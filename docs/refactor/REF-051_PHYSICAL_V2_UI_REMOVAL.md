# REF-051 - Remocao fisica do nucleo visual V2 orfao

Data: 2026-08-12

## 1. Baseline

- Branch esperada/encontrada: `rebuild-production-calendar`
- HEAD esperado/encontrado: `cd94358`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 1.1 Blocker descoberto durante revisao

Durante a revisao manual da REF-051 foi identificado um blocker funcional real: a funcao canonica `discardAllProductionCalendarChanges()` continuava existindo em `pages/PlanningPage.js` e chamava `persistAutomaticBaselineDiscard(...)`, mas nao havia caller runtime operacional depois da remocao da toolbar V2. A protecao antiga de `automaticSimulationBaseline.service.test.js` validava a acao "Descartar todas as alteracoes", disabled sem alteracoes manuais, confirmacao e cancelamento antes de chamar `onDiscardAllChanges`; a conversao para mera ausencia fisica de arquivos V2 nao era paridade funcional.

Correcao aplicada nesta REF:

- `createGanttApsRenderer` passou a aceitar `onRequestDiscardAllChanges`;
- o Gantt APS renderiza a acao "Descartar alteracoes" quando a edicao manual e permitida;
- `model.metadata.visualState.hasManualChanges` governa o estado disabled, usando a fonte ja calculada pela `PlanningPage`;
- o renderer apenas emite a intencao e nao importa persistence, services, API ou scheduler;
- `PlanningPage.js` conecta `onRequestDiscardAllChanges: () => discardAllProductionCalendarChanges()`;
- a confirmacao permanece dentro de `discardAllProductionCalendarChanges()`, antes de preparar/persistir o descarte;
- cancelar a confirmacao retorna antes de `persistAutomaticBaselineDiscard(...)`, preservando draft/estado.

## 1.2 Segundo blocker descoberto durante revisao

Durante a revisao manual da REF-051 foi identificado um segundo blocker funcional real: apos a saida da toolbar V2, `pages/PlanningPage.js` ainda calculava `canUndoManualChange` e `canRedoManualChange`, e `shared/planning-controller/planningHistoryController.js` ainda preservava `undo()`/`redo()` sobre `services/manualScheduleHistory.service.js`, mas o Gantt APS nao expunha nenhuma acao runtime de Undo/Redo.

A protecao antiga de `manualScheduleHistory.service.test.js` cobria capacidade operacional real no toolbar V2: botoes "Desfazer ultima alteracao" e "Refazer alteracao", disabled por `canUndoManualChange`/`canRedoManualChange` e callbacks `onUndoManualChange`/`onRedoManualChange`. Trocar essa protecao por mera existencia de infraestrutura de historico e ausencia fisica do V2 nao era paridade funcional.

Correcao aplicada nesta REF:

- `createGanttApsRenderer` passou a aceitar callbacks neutros `onRequestUndoManualChange` e `onRequestRedoManualChange`;
- o Gantt APS renderiza as acoes "Desfazer" e "Refazer" quando a edicao manual e permitida;
- `model.metadata.visualState.canUndoManualChange` e `canRedoManualChange` governam o estado disabled, usando a fonte ja calculada pela `PlanningPage`;
- clique habilitado chama o callback exatamente uma vez;
- acao disabled nao chama callback;
- usuario sem permissao de escrita nao recebe as acoes operacionais;
- Undo/Redo nao emitem move/edit/split/descarte e nao iniciam drag;
- o renderer apenas emite intencao e nao importa `planningHistoryController`, `manualScheduleHistory.service`, persistence, API, solver ou scheduler;
- `PlanningPage.js` conecta `onRequestUndoManualChange` a `undoLastProductionCalendarChange()` e `onRequestRedoManualChange` a `redoProductionCalendarChange()`, wrappers existentes que chamam `manualScheduleHistory.undo()` e `manualScheduleHistory.redo()`.

## 1.3 Matriz final de paridade funcional V2 -> Gantt

Esta matriz foi montada a partir do HEAD dos arquivos removidos (`ProductionCalendar.js`, `ProductionCalendarGrid.js`, `ProductionCalendarToolbar.js`, `ProductionCalendarCard.js`, `ProductionCalendarDetails.js`, `ProductionCalendarDrag.js`, `ProductionCalendarState.js` e `productionCalendar.validation.js`) e do runtime atual `PlanningPage -> buildPlanningScheduleViewModel -> createGanttApsRenderer`.

| Capacidade V2 | Entrada/callback antigo | UI antiga | Gantt atual | Paridade? | Acao necessaria |
|---|---|---|---|---|---|
| Move | `onRequestMove` / drag controller | Drag/click move no grid | `onRequestMove` com `MOVE_ALLOCATION` por drag | Aceita pela revisao | Nenhuma nesta rodada |
| Edit | `onEditAllocation` | Botao do card/details | Inspector chama `onRequestEdit` | Aceita pela revisao | Nenhuma |
| Split | `onSplitAllocation` | Botao split no card/editor | Inspector chama `onRequestSplit` | Aceita pela revisao | Nenhuma |
| Transporte | `onTransportAllocation` | Botao de transporte no card | Inspector chama `onRequestTransportAllocation` | Corrigida | `PlanningPage` liga a `openProductionCalendarTransportModal(allocation)` |
| Undo | `onUndoManualChange` | Toolbar V2 | Toolbar Gantt chama `onRequestUndoManualChange` | Aceita pela revisao | Nenhuma |
| Redo | `onRedoManualChange` | Toolbar V2 | Toolbar Gantt chama `onRequestRedoManualChange` | Aceita pela revisao | Nenhuma |
| Descartar tudo | `onDiscardAllChanges` | Toolbar V2 com confirmacao | Toolbar Gantt chama `onRequestDiscardAllChanges` | Aceita pela revisao | Nenhuma |
| Otimizar utilizacao | `onOptimizeUtilization` | Toolbar V2 | Toolbar Gantt chama `onRequestOptimizeUtilization` | Corrigida | `PlanningPage` liga a `handleProductionCalendarUtilizationOptimization()` |
| Liberar/bloquear dia | `onToggleManualWorkDate` | Checkbox no cabecalho do dia | Painel do dia chama `onRequestToggleManualWorkDate` | Corrigida | `PlanningPage` liga a `handleProductionCalendarManualWorkDate(payload)` |
| Editar equipe/capacidade diaria | `onSaveDailyTeam` | Pill/form no cabecalho do dia | Painel do dia salva overrides explicitos, restaura padrao com `null` por turno e valida inteiro `>= 0` com campo obrigatorio antes de chamar `onRequestEditDailyTeam` | Corrigida | `PlanningPage` liga a `handleProductionCalendarDailyTeam(payload)` |
| Abrir estoque projetado do dia | `onOpenDay` | Clique no cabecalho do dia | Painel do dia chama `onRequestOpenDay(date)` | Corrigida | `PlanningPage` liga a `openPlanningStockProjectionModal(date)` |
| Produtividade diaria | `day.productivity` | Badge no cabecalho | `gantt-aps__day-productivity` usa dado pronto do snapshot | Corrigida | Sem regra nova no renderer |
| Alerta de estoque diario | `day.stockAlert` | Badges no cabecalho | `gantt-aps__day-stock` e lista no painel do dia usam dado pronto | Corrigida | Sem regra nova no renderer |
| Equipe/capacidade diaria | `day.team`, shifts, peak/available | Pill no cabecalho | `gantt-aps__day-team` e painel do dia exibem peak/available/shifts | Corrigida | Sem regra nova no renderer |
| Horizonte +7/+15/+30 | `onHorizonChange`, `visibleEndDate` | Toolbar V2 expandia dias | Toolbar Gantt chama `onRequestExpandHorizon({ days })` | Corrigida | `PlanningPage` atualiza `productionCalendarVisualState.visibleEndDate` com `addProductionCalendarDays` e chama `refreshTimelineOnly()` |
| Zoom | Zoom state/toolbar V2 | Botoes zoom/reset | Gantt ajusta `pixelsPerHour` | Aceita pela revisao | Nenhuma |
| Fullscreen | `onOpenFullscreen` | Exclusive page pela `PlanningPage` | Fullscreen API no Gantt | Aceita pela revisao | Nenhuma |
| Stage | Card/details V2 | Etapa no card/details | Coluna e inspector exibem stage | Aceita pela revisao | Nenhuma |
| Memberships | Card/details V2 | Producoes compartilhadas/cores | `ganttApsProductionVisuals` e gradiente | Aceita pela revisao | Nenhuma |
| Diagnosticos/erros/avisos | adapter errors, `validation.presentation.issues`, errors/warnings | Erro visual e indicadores | Resumo Gantt soma `metadata.errors`, `metadata.warnings` e `validationIssues`; view model transporta issues | Corrigida minimamente | Sem presenter novo; renderer nao recalcula diagnostico |
| Validacao visual pre-render | `productionCalendar.validation.js` | Erro visual antes do grid | Nao aplicavel ao Gantt sem validacao visual pre-render propria | Nao aplicavel | Arquivo removido; validacao canonica segue em services/snapshot |
| Selecao visual local | `selectedAllocationId`, card selector | Selecionar card | Foco/inspector por allocation | Aceita pela revisao | Nenhuma |

Blockers registrados na revisao manual e status nesta rodada:

1. Descarte global: corrigido antes desta rodada e mantido verde.
2. Undo/Redo: corrigido antes desta rodada e mantido verde.
3. Configuracao diaria: corrigido via painel de dia e callbacks neutros.
4. Horizonte futuro: corrigido via `onRequestExpandHorizon({ days })` e `visibleEndDate` cumulativo.
5. Transporte: gap confirmado e corrigido via `onRequestTransportAllocation`.
6. Otimizacao de utilizacao: gap confirmado e corrigido via `onRequestOptimizeUtilization`.
7. Estoque/produtividade/equipe diaria: gap confirmado e corrigido com apresentacao compacta de dados prontos.
8. Diagnosticos: gap parcial corrigido com resumo neutro de errors/warnings/issues.

Nao foram movidas regras de produtividade, capacidade, turnos, feriados, `productiveMinutes`, estoque, transporte, transacao manual, solver ou reotimizacao para o renderer. O Gantt segue como camada visual sem regra produtiva ou persistencia direta, emitindo intencoes para os handlers canonicos.

## 2. Arvore pre-edicao

```text
shared/production-calendar/ProductionCalendar.js
shared/production-calendar/ProductionCalendarCard.js
shared/production-calendar/ProductionCalendarDetails.js
shared/production-calendar/ProductionCalendarDrag.js
shared/production-calendar/ProductionCalendarEditor.js
shared/production-calendar/ProductionCalendarGrid.js
shared/production-calendar/ProductionCalendarSplitEditor.js
shared/production-calendar/ProductionCalendarState.js
shared/production-calendar/ProductionCalendarToolbar.js
shared/production-calendar/index.js
shared/production-calendar/production-calendar.css
shared/production-calendar/productionCalendar.adapter.js
shared/production-calendar/productionCalendar.utils.js
shared/production-calendar/productionCalendar.validation.js
shared/production-calendar/productionDisplayColor.js
```

## 3. Inventario e classificacao

| Arquivo | exports | runtime consumers | test consumers | barrel/wrapper consumers | classificacao | remover agora? |
|---|---|---|---|---|---|---|
| `ProductionCalendar.js` | `ProductionCalendar` | Nenhum externo; antes apenas dependencias internas V2 | `automaticSimulationBaseline`, `manualScheduleHistory`, `productionCalendarDayHeader`, `productionCalendarEditButton`, `productionCalendarHorizon` | `index.js` | A - UI V2 orfa | Sim |
| `ProductionCalendarGrid.js` | `ProductionCalendarGrid`, `applyProductionCalendarGridZoom` | Somente `ProductionCalendar.js` | `productionCalendarDayHeader`, `productionCalendarEditButton`, `productionCalendarHorizon` | `index.js` | A - UI V2 orfa | Sim |
| `ProductionCalendarCard.js` | `ProductionCalendarCard`, helpers de apresentacao de card | Somente grid/drag/details V2 | `productionCalendarEditButton`, `productionCalendarMemberships`, `productionCalendarStage`, `productionDisplayColor` | `index.js` | A - UI V2 orfa | Sim |
| `ProductionCalendarDrag.js` | `createProductionCalendarDragController` | Somente `ProductionCalendar.js` | `productionCalendarEditButton` por leitura estatica | `index.js` | A - UI V2 orfa | Sim |
| `ProductionCalendarDetails.js` | `ProductionCalendarDetails`, label de details | Somente `ProductionCalendar.js` | `productionCalendarMemberships` | `index.js` | A - UI V2 orfa | Sim |
| `ProductionCalendarState.js` | estado/zoom/drag/details V2 | Somente componentes V2 | `productionCalendarHorizon` | `index.js` | A - UI V2 orfa | Sim |
| `ProductionCalendarToolbar.js` | toolbar/update V2 | Somente `ProductionCalendar.js` | `automaticSimulationBaseline`, `manualScheduleHistory`, `productionCalendarHorizon` | `index.js` | A - UI V2 orfa | Sim |
| `productionCalendar.validation.js` | `validateProductionCalendarAllocations` | Somente `ProductionCalendar.js` | indireto V2 | `index.js` | A - validacao visual pre-render | Sim |
| `ProductionCalendarEditor.js` | wrapper de editor e split parts | Sem consumidor runtime direto atual; compatibilidade | `productionCalendarEditButton` | `index.js` | B - wrapper legado | Nao |
| `ProductionCalendarSplitEditor.js` | wrapper split editor | Sem consumidor runtime direto atual; compatibilidade | `productionCalendarSplitEditor` | `index.js` | B - wrapper legado | Nao |
| `productionCalendar.adapter.js` | re-export adapter neutro | Consumidores/testes legados | `productionCalendarGrid`, memberships, stage | `index.js` | C - compatibilidade/re-export | Nao |
| `productionDisplayColor.js` | re-export de cores neutras | Compatibilidade | `productionDisplayColor` | `index.js` | C - compatibilidade/re-export | Nao |
| `productionCalendar.utils.js` | helpers de dia, horizonte, formatacao e grid rows | `PlanningPage.js` importa helpers sensiveis direto | varios testes de regra/dia/reotimizacao/grid | `index.js` | E - regra produtiva/sensivel + helper compartilhado | Nao |
| `production-calendar.css` | CSS | `PlanningPage.js` ainda usa seletores de fullscreen/diagnostico; wrappers/testes preservados | testes de CSS | `index.js` carrega side effect legado | F - CSS legado | Nao |
| `index.js` | barrel + loader CSS | Sem `PlanningPage`; preserva API legada | testes/compatibilidade | N/A | B/C/F | Parcial, remover exports mortos |

## 4. Consumidores pre-edicao

Buscas executadas antes da remocao:

```text
rg -n "ProductionCalendar|ProductionCalendarGrid|ProductionCalendarCard|ProductionCalendarDrag|shared/production-calendar|production-calendar-" shared/production-calendar pages shared/planning-editor shared/planning-schedule-view tests docs PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md
rg --files shared/production-calendar
```

Evidencia:

- `pages/PlanningPage.js` nao importava `shared/production-calendar/index.js`.
- `pages/PlanningPage.js` nao chamava `ProductionCalendar({ ... })` nem possuia `renderProductionCalendarSnapshot(...)`.
- Os consumidores runtime dos arquivos A eram apenas internos entre componentes V2.
- Consumidores externos eram testes ou documentacao historica.
- `automaticSimulationBaseline.service.test.js` e `manualScheduleHistory.service.test.js` liam `ProductionCalendarToolbar.js`/`ProductionCalendar.js` apenas por protecao textual legada.
- `productionCalendarEditButton.test.js`, `productionCalendarDayHeader.test.js`, `productionCalendarHorizon.test.js`, `productionCalendarMemberships.test.js`, `productionCalendarStage.test.js` e `productionDisplayColor.test.js` continham trechos A que importavam ou liam componentes fisicos apagados.
- `productionCalendarGrid.test.js`, `productionCalendarMemberships.test.js` e `productionCalendarStage.test.js` tambem cobriam adapter, memberships, stage, move e regras compartilhadas; esses trechos foram preservados.

## 5. Gates funcionais

| Gate | Evidencia | Resultado |
|---|---|---|
| PlanningPage nao monta `ProductionCalendar` | testes `ganttApsRenderer` e `planningScheduleRenderer`; busca em `PlanningPage.js` | Passou |
| Renderer operacional e Gantt APS | `createPlanningScheduleRendererHost` com factory unica `gantt-aps`; `renderer: 'gantt-aps'` | Passou |
| Gantt suporta MOVE | `ganttApsRenderer.test.js` cobre `onRequestMove`, drag e `MOVE_ALLOCATION` | Passou |
| Gantt suporta EDIT | `ganttApsRenderer.test.js` e `productionCalendarEditButton.test.js` cobrem `onRequestEdit` | Passou |
| Gantt suporta SPLIT | `ganttApsRenderer.test.js` e `productionCalendarEditButton.test.js` cobrem `onRequestSplit` | Passou |
| Gantt suporta TRANSPORTE | `ganttApsRenderer.test.js` cobre acao no inspector e wiring `onRequestTransportAllocation -> openProductionCalendarTransportModal` | Passou |
| Gantt suporta DESCARTE GLOBAL | `ganttApsRenderer.test.js` cobre acao visivel, disabled sem `hasManualChanges`, callback unico, readonly sem acao e ausencia de persistence no renderer; `automaticSimulationBaseline.service.test.js` cobre confirmacao/cancelamento antes de persistir | Passou |
| Gantt suporta OTIMIZAR UTILIZACAO | `ganttApsRenderer.test.js` cobre `onRequestOptimizeUtilization` e wiring para `handleProductionCalendarUtilizationOptimization` | Passou |
| Gantt suporta UNDO/REDO manual | `ganttApsRenderer.test.js` cobre callbacks neutros, visibilidade por permissao, disabled por `canUndoManualChange`/`canRedoManualChange`, callback unico, readonly sem acao, ausencia de move/drag e renderer sem controller/service/history | Passou |
| Gantt suporta CONFIGURACAO DIARIA | `ganttApsRenderer.test.js` cobre painel de dia, abrir estoque, liberar dia e salvar equipe; `productionCalendarDayHeader.test.js` preserva helpers de dia/produtividade | Passou |
| Gantt suporta HORIZONTE FUTURO | `productionCalendarHorizon.test.js` cobre +7/+15/+30 cumulativo e wiring de `onRequestExpandHorizon`; `ganttApsRenderer.test.js` cobre botao +7/+15/+30 separado de zoom, ausencia do dia futuro antes da expansao, update normal do host com dias estendidos, novo drop target e `MOVE_ALLOCATION` para o novo dia | Passou |
| Gantt apresenta estoque/produtividade/equipe diarios | `ganttApsRenderer.test.js` cobre `gantt-aps__day-team`, `gantt-aps__day-productivity` e `gantt-aps__day-stock` com dados prontos do snapshot | Passou |
| Gantt apresenta diagnosticos minimos | `planningScheduleViewModel.test.js` transporta `validationIssues`; `ganttApsRenderer.test.js` cobre resumo por `metadata.errors`/warnings/issues | Passou |
| Editor neutro independente de JS V2 | `productionCalendarEditButton.test.js` protege ausencia de import `../production-calendar` no editor | Passou |
| Split editor neutro independente de JS V2 | `productionCalendarSplitEditor.test.js` preservado | Passou |
| CSS neutro nao depende de CSS V2 | loader aponta para `planning-allocation-editor.css`; CSS V2 preservado | Passou |
| Arquivo candidato sem caller runtime | consumidores externos eram teste/docs; runtime interno morreu junto | Passou |
| Nenhuma regra produtiva no candidato | regras sensiveis ficaram em `productionCalendar.utils.js`, services e wrappers | Passou |

## 6. Arquivos removidos

```text
shared/production-calendar/ProductionCalendar.js
shared/production-calendar/ProductionCalendarGrid.js
shared/production-calendar/ProductionCalendarCard.js
shared/production-calendar/ProductionCalendarDrag.js
shared/production-calendar/ProductionCalendarDetails.js
shared/production-calendar/ProductionCalendarState.js
shared/production-calendar/ProductionCalendarToolbar.js
shared/production-calendar/productionCalendar.validation.js
```

## 7. Arquivos preservados

```text
shared/production-calendar/ProductionCalendarEditor.js
shared/production-calendar/ProductionCalendarSplitEditor.js
shared/production-calendar/productionCalendar.adapter.js
shared/production-calendar/productionCalendar.utils.js
shared/production-calendar/productionDisplayColor.js
shared/production-calendar/production-calendar.css
shared/production-calendar/index.js
```

## 8. Barrel/index

Exports removidos do `shared/production-calendar/index.js`:

- `ProductionCalendar`
- `ProductionCalendarGrid`
- `ProductionCalendarToolbar`
- `ProductionCalendarCard`
- `getProductionCalendarAllocationColor` via card
- `ProductionCalendarDetails`
- `createProductionCalendarDragController`
- helpers de `ProductionCalendarState.js`
- `validateProductionCalendarAllocations`

Exports preservados:

- wrappers editor/split;
- helpers sensiveis de `productionCalendar.utils.js`;
- adapter legado;
- cores neutras via `planning-presentation/productionDisplayColor.js`;
- side effect de CSS legado.

## 9. Testes alterados

| Teste | Antes | Depois |
|---|---|---|
| `automaticSimulationBaseline.service.test.js` | Lia toolbar/calendar V2 para descarte | Protege ausencia fisica e preserva fluxo de descarte em PlanningPage/route/service |
| `ganttApsRenderer.test.js` | Cobria Gantt move/edit/split, mas nao todas as capacidades V2 | Protege callbacks neutros de move/edit/split/transporte/descarte/otimizacao/undo/redo/dia/equipe/estoque/horizonte, apresentacao diaria de equipe/produtividade/estoque, readonly, disabled states, drag em dias existentes, drag para dia criado apos expansao do horizonte e renderer sem regra produtiva |
| `planningScheduleRenderer.test.js` | Cobria wiring Gantt move/edit/split | Passou a exigir wiring de transporte, estoque do dia, toggle manual work date, daily team, horizonte, descarte, otimizacao, undo e redo |
| `manualScheduleHistory.service.test.js` | Lia toolbar/calendar V2 para undo/redo e caracterizava CSS orfao como comportamento | Protege ausencia fisica, preserva controller/historico, exige callbacks neutros do Gantt e conexao PlanningPage ao historico canonico; deixou de tratar `production-calendar-manual-actions` como comportamento funcional |
| `productionCalendarEditButton.test.js` | Testava botao do card V2 e editor neutro | Virou protecao arquitetural/editor: arquivos ausentes, barrel limpo, PlanningPage sem V2, editor neutro/CSS e instanciacao comportamental do `PlanningAllocationEditor` |
| `planningScheduleViewModel.test.js` | Cobria contrato neutro do Gantt | Passou a transportar `daySettings` e `validationIssues` sem mutar snapshot |
| `productionCalendarDayHeader.test.js` | Testava grid/header V2 + helpers | Preserva helpers de dia/produtividade e exige callbacks/classes reais do Gantt para dia/equipe/produtividade/estoque; remove protecao de CSS orfao |
| `productionCalendarHorizon.test.js` | Testava state/toolbar/grid V2 + helpers | Preserva +7/+15/+30 cumulativo e exige wiring Gantt/PlanningPage de horizonte; remove protecao de CSS/toolbar/grid orfaos |
| `productionCalendarMemberships.test.js` | Testava adapter + card/details V2 | Preserva adapter/memberships/move/transporte; remove DOM V2 |
| `productionCalendarStage.test.js` | Testava adapter/stage + card V2 | Preserva adapter/stage/move; remove DOM V2 |
| `productionDisplayColor.test.js` | Lia card V2 para neutralizacao de cor | Protege ausencia do card e wrapper de cor preservado |

Nenhum teste foi apagado. A contagem esperada permanece 98.

## 10. CSS orfao identificado e preservado

`production-calendar.css` foi preservado. Blocos V2 de container, grid, toolbar, card, drag, details, day header e conectores ficaram sem componente fisico correspondente. Blocos ainda preservados/pendentes:

- fullscreen/exclusive view usado pela `PlanningPage.js`;
- diagnosticos/rejeicao com classes `production-calendar-*`;
- CSS legado de wrappers/testes;
- blocos historicos do V2 ate missao propria de limpeza CSS.

As assertions que caracterizavam seletores orfaos como substitutos de comportamento funcional foram removidas dos testes desta REF. Em especial, `manualScheduleHistory.service.test.js` deixou de proteger `production-calendar-manual-actions`, e `automaticSimulationBaseline.service.test.js` deixou de proteger `production-calendar-discard-button`. O CSS nao foi apagado nesta REF.

## 11. Blockers restantes

- Nao ha blocker funcional conhecido de paridade V2 -> Gantt apos a matriz final desta rodada.
- `productionCalendar.utils.js` continua sensivel e usado por `PlanningPage.js`.
- `production-calendar.css` nao pode ser apagado nesta REF.
- Wrappers `ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` continuam por compatibilidade.
- `productionCalendar.adapter.js` e `productionDisplayColor.js` continuam como re-exports legados.
- Nomes `productionCalendar*` em helpers/testes/documentacao ainda exigem missao de neutralizacao/renome.
- REF-013 nao foi marcada como homologada.

## 12. Validacoes

Executadas antes da edicao:

```text
git status --short
git branch --show-current
git rev-parse --short HEAD
node --test tests/*.js
```

Resultado: baseline esperado, suite 98/98.

Executadas durante a edicao:

```text
node --check pages/PlanningPage.js
node --test tests/productionCalendarEditButton.test.js tests/productionCalendarDayHeader.test.js tests/productionCalendarHorizon.test.js tests/productionCalendarMemberships.test.js tests/productionCalendarStage.test.js tests/productionDisplayColor.test.js tests/automaticSimulationBaseline.service.test.js tests/manualScheduleHistory.service.test.js
```

Resultado parcial: aprovado.

Executadas no fechamento:

```text
node --check pages/PlanningPage.js
node --test tests/ganttApsRenderer.test.js
node --test tests/automaticSimulationBaseline.service.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarDayHeader.test.js
node --test tests/productionCalendarHorizon.test.js
node --test tests/productionCalendarConfigurationEdit.integration.test.js
node --test tests/productionCalendarMemberships.test.js
node --test tests/productionCalendarStage.test.js
node --test tests/productionDisplayColor.test.js
node --test tests/automaticSimulationBaseline.service.test.js tests/manualScheduleHistory.service.test.js
node --test tests/*.js
git diff --check
```

Resultado final:

- checks focados aprovados;
- suite completa `node --test tests/*.js`: 98 testes, 98 aprovados, 0 falhas;
- `git diff --check`: sem erros; apenas avisos conhecidos LF -> CRLF;
- contagem total permaneceu 98/98 porque testes de DOM V2 foram convertidos para protecoes arquiteturais e contratos compartilhados, nao apagados.

Executadas na correcao final de paridade:

```text
node --check pages/PlanningPage.js
node --check shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js
node --test tests/ganttApsRenderer.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/automaticSimulationBaseline.service.test.js
node --test tests/manualScheduleHistory.service.test.js
node --test tests/productionCalendarDayHeader.test.js
node --test tests/productionCalendarHorizon.test.js
node --test tests/productionCalendarMemberships.test.js
node --test tests/productionCalendarStage.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/planningScheduleViewModel.test.js
node --test tests/planningScheduleSnapshot.test.js
node --test tests/planningTransportController.test.js
node --test tests/planningStockProjection.service.test.js
node --test tests/planningStockProjectionController.test.js
node --test tests/planningStockProjectionModal.test.js
node --test tests/productionCalendarConfigurationEdit.integration.test.js
node --test tests/planningDailyTeamOverride.integration.test.js
node --test tests/planningReoptimization.service.test.js
node --test tests/manualScheduleValidation.service.test.js
node --test tests/*.js
git diff --check
```

Resultado da correcao final:

- checks obrigatorios aprovados;
- testes focados e correlatos aprovados;
- suite completa `node --test tests/*.js`: 98 testes, 98 aprovados, 0 falhas;
- `git diff --check`: sem erros; apenas avisos conhecidos LF -> CRLF.

Executadas na correcao de cobertura comportamental do horizonte:

```text
node --check shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarHorizon.test.js
node --test tests/*.js
git diff --check
```

Resultado da correcao de cobertura:

- `ganttApsRenderer.test.js` agora prova que `2026-08-07` nao existe nem como header nem como drop target no horizonte inicial encerrado em `2026-07-31`;
- clique em `+7d` emite somente `onRequestExpandHorizon({ days: 7 })`, sem `MOVE_ALLOCATION` incremental e sem `onRequestOptimizeUtilization`;
- apos update do model pelo host com os sete dias adicionados, `2026-08-07` passa a existir no Gantt e vira `.gantt-aps__drop-cell`;
- drag de allocation persistivel para `2026-08-07` emite `MOVE_ALLOCATION` com `to.date: '2026-08-07'` e `machineId: 'machine-drag'`;
- `GANTT_APS_MAX_VISIBLE_DAYS` permanece em 120 e foi coberto contra regressao: horizonte inicial curto + 30 dias resulta em 34 dias sem truncamento.
- suite completa `node --test tests/*.js`: 98 testes, 98 aprovados, 0 falhas;
- `git diff --check`: sem erros; apenas avisos conhecidos LF -> CRLF.

Executadas na correcao pontual de cobertura comportamental do editor neutro:

```text
node --check shared/planning-editor/PlanningAllocationEditor.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/planningAllocationEditorController.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/*.js
git diff --check
```

Resultado da correcao pontual:

- `productionCalendarEditButton.test.js` instancia `PlanningAllocationEditor` real com Fake DOM neutro;
- o editor abre com allocation valida, resolve preview, fecha por cancelar sem `onSave`, preserva a allocation recebida e entrega uma edicao valida ao callback `onSave`;
- o teste reforca que o editor neutro nao chama solver, reotimizacao, API, storage ou persistencia diretamente;
- testes focados aprovados;
- suite completa `node --test tests/*.js`: 98 testes, 98 aprovados, 0 falhas;
- `git diff --check`: sem erros; apenas warnings conhecidos LF -> CRLF;
- nenhum teste de `ProductionCalendarCard`, grid, toolbar, details, drag, state ou validacao V2 foi restaurado.

## 13. Reavaliacao dos 8 candidatos apos o blocker

Busca final apos a paridade de descarte:

```text
rg -n "ProductionCalendar\.js|ProductionCalendarGrid|ProductionCalendarToolbar|ProductionCalendarCard|ProductionCalendarDetails|ProductionCalendarDrag|ProductionCalendarState|productionCalendar\.validation|ProductionCalendar\(" pages shared tests --glob '!shared/production-calendar/production-calendar.css' -S
rg -n "persistAutomaticBaselineDiscard|automaticSimulationBaseline|manualSchedulePersistence|/manual-schedule|reoptimizePlanningFuture|simulateCurrent|buildPlan|scheduleOperations" shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js
```

Resultado:

- os 8 arquivos candidatos continuam sem caller runtime operacional;
- ocorrencias restantes estao em testes de ausencia fisica, wrappers/helpers preservados, documentacao ou nomes legados de funcoes neutras;
- o Gantt APS nao importa persistence/service/API/controller/history e nao dispara reotimizacao, `simulateCurrent`, `buildPlan` ou scheduler;
- a remocao fisica dos 8 arquivos permanece mantida nesta REF, agora com paridade funcional de descarte, Undo e Redo no Gantt.
