# REF-048 - Auditoria da arvore shared/production-calendar

Data: 2026-08-12

## 1. Baseline

- Branch esperada: `rebuild-production-calendar`
- Branch encontrada: `rebuild-production-calendar`
- HEAD esperado: `14838e6`
- HEAD encontrado: `14838e6`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Escopo e decisao

A REF-048 auditou a arvore fisica `shared/production-calendar/*` e seus consumidores. Nenhum arquivo foi removido nesta REF.

Motivo: embora o Gantt APS seja o renderer operacional unico, `pages/PlanningPage.js` ainda importa o barrel `shared/production-calendar/index.js` e ainda contem a funcao legada `renderProductionCalendarSnapshot(...)`, que monta `ProductionCalendar(...)`. Alem disso, o editor neutro continua usando classes `production-calendar-editor-*` estilizadas por `production-calendar.css`.

## 3. Arvore real

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

## 4. Mapa por arquivo

| Arquivo | Exportacoes principais | Consumidores runtime | Consumidores teste | CSS/DOM acoplado | Classificacao | Pode remover agora? |
|---|---|---|---|---|---|---|
| `ProductionCalendar.js` | `ProductionCalendar` | `PlanningPage.js` via `index.js`; usado dentro da funcao legada `renderProductionCalendarSnapshot`, mas o fluxo operacional atual monta Gantt em `renderProductionCalendar` | `automaticSimulationBaseline`, `manualScheduleHistory`, `productionCalendarDayHeader`, `productionCalendarEditButton`, `productionCalendarHorizon`, `ganttApsRenderer` por leitura estatica | Container, toolbar, grid, modal de dia, selecao, drag e details | V2 fisico legado ainda referenciado | Nao |
| `ProductionCalendarGrid.js` | `ProductionCalendarGrid`, `applyProductionCalendarGridZoom` | Import interno de `ProductionCalendar.js`; reexportado no `index.js` | `productionCalendarDayHeader`, `productionCalendarEditButton`, `productionCalendarGrid`, `productionCalendarHorizon` | Grid, header, celulas, cards, conectores de transporte, day header | Teste exclusivo V2 + grid legado | Nao |
| `ProductionCalendarCard.js` | `ProductionCalendarCard`, `getProductionCalendarAllocationColor`, `getProductionCalendarStage`, memberships helpers | Import interno de `ProductionCalendarGrid.js`, `ProductionCalendarDrag.js`, `ProductionCalendarDetails.js`; reexportado no `index.js` | `productionCalendarEditButton`, `productionCalendarMemberships`, `productionCalendarStage`, `productionDisplayColor` | Card, seletor, edit, transport, memberships, stage, validation | V2 card legado com helpers de apresentacao | Nao |
| `ProductionCalendarDrag.js` | `createProductionCalendarDragController` | Import interno de `ProductionCalendar.js`; reexportado no `index.js` | `productionCalendarEditButton` por leitura estatica | Preview de drag, hover de celula, no-select | V2-only | Nao enquanto `ProductionCalendar.js` permanecer |
| `ProductionCalendarDetails.js` | `ProductionCalendarDetails`, `getProductionCalendarRelatedProductionLabel` | Import interno de `ProductionCalendar.js`; helpers importam `ProductionCalendarCard.js` | `productionCalendarMemberships` | Modal details e campos tecnicos | V2-only + helper de apresentacao testado | Nao |
| `ProductionCalendarEditor.js` | `ProductionCalendarEditor`, aliases `equalProductionCalendarSplitPercents`, `addProductionCalendarSplitPart`, `resolveProductionCalendarEditorPreview`, `resolveProductionCalendarDistribution` | Sem consumidor produtivo direto confirmado; reexportado no `index.js` | `productionCalendarEditButton` valida wrapper legado | Usa CSS do editor neutro; chama `PlanningAllocationEditor` | Wrapper legado de compatibilidade | Nao |
| `ProductionCalendarSplitEditor.js` | `ProductionCalendarSplitEditor`, `resolveProductionCalendarSplitPreview` | Sem consumidor produtivo direto confirmado; reexportado no `index.js` | `productionCalendarSplitEditor`, `productionCalendarEditButton` por leitura estatica | Usa CSS do split/editor neutro; chama `PlanningAllocationSplitEditor` | Wrapper legado de compatibilidade | Nao |
| `ProductionCalendarState.js` | zoom/horizon/selection/details/drag state helpers | Import interno de `ProductionCalendar.js`, `ProductionCalendarGrid.js`, `ProductionCalendarDrag.js`, `ProductionCalendarToolbar.js`; reexportado no `index.js` | `productionCalendarHorizon` | Sem CSS proprio, mas governa data attrs e estado visual do V2 | Estado visual V2 | Nao |
| `ProductionCalendarToolbar.js` | `ProductionCalendarToolbar`, `updateProductionCalendarToolbar` | Import interno de `ProductionCalendar.js`; reexportado no `index.js` | `automaticSimulationBaseline`, `manualScheduleHistory`, `productionCalendarHorizon` | Toolbar, botoes, selecao, undo/redo/discard/optimize | V2 toolbar legado | Nao |
| `productionCalendar.adapter.js` | `adaptPlanningResultToProductionCalendar`, `buildProductionMembershipIndex`, `buildProductionStageIndex` | Sem uso direto em `PlanningPage.js`; `PlanningPage.js` usa o adapter neutro `planningScheduleAdapter.js` com alias local | `planningScheduleAdapter`, `productionCalendarGrid`, `productionCalendarMemberships`, `productionCalendarStage` | Sem DOM/CSS | Wrapper legado de adapter neutro | Nao |
| `productionCalendar.utils.js` | aliases de dia neutro; formatadores; `buildProductionCalendarDayPresentation`; `buildProductionCalendarDayProductivity`; `extendProductionCalendarDayRange`; grid row helpers | `PlanningPage.js` via `index.js` usa `buildProductionCalendarDayPresentation`, `buildProductionCalendarDayProductivity`, `extendProductionCalendarDayRange`; componentes V2 usam varios helpers | `planningDailyTeamOverride`, `planningMachineOrder`, `planningReoptimization`, `planningScheduleDay`, `productionCalendarDayHeader`, `productionCalendarGrid`, `productionCalendarHorizon` | Sem DOM direto; alimenta classes de dia/grid | Dependencia compartilhada/regra sensivel de apresentacao de dia/capacidade | Nao |
| `productionCalendar.validation.js` | `validateProductionCalendarAllocations` | Import interno de `ProductionCalendar.js`; reexportado no `index.js` | Coberto indiretamente por testes V2 | Sem CSS | V2-only validacao visual pre-render | Nao enquanto `ProductionCalendar.js` permanecer |
| `productionDisplayColor.js` | reexports de `planning-presentation/productionDisplayColor.js` | Sem consumidor runtime direto confirmado; reexportado no `index.js` | `productionDisplayColor` | Sem CSS | Wrapper legado de compatibilidade | Nao |
| `production-calendar.css` | CSS carregado por side effect em `index.js` | Carregado quando `PlanningPage.js` importa `shared/production-calendar/index.js`; necessario ao editor neutro enquanto classes nao forem neutralizadas | Varios testes leem CSS V2/editor | V2 + editor neutro | CSS compartilhado e V2 | Nao |
| `index.js` | `ensureProductionCalendarCss`; barrel de todos os modulos | `PlanningPage.js` importa `ProductionCalendar` e helpers de dia/produtividade | Testes indiretamente por import/leitura | Injeta `production-calendar.css` | Barrel legado com side effect CSS ainda usado | Nao |

## 5. Grafo de dependencias

```text
pages/PlanningPage.js
-> shared/production-calendar/index.js
   -> ProductionCalendar.js
   -> productionCalendar.utils.js
   -> production-calendar.css por ensureProductionCalendarCss()

ProductionCalendar.js
-> ProductionCalendarState.js
-> ProductionCalendarDetails.js
-> ProductionCalendarGrid.js
-> ProductionCalendarDrag.js
-> ProductionCalendarToolbar.js
-> productionCalendar.validation.js
-> productionCalendar.utils.js

ProductionCalendarGrid.js
-> ProductionCalendarCard.js
-> productionCalendar.utils.js
-> ProductionCalendarState.js

ProductionCalendarCard.js
-> productionCalendar.utils.js
-> shared/planning-presentation/productionDisplayColor.js

ProductionCalendarDrag.js
-> ProductionCalendarState.js
-> ProductionCalendarCard.js
-> productionCalendar.utils.js

ProductionCalendarDetails.js
-> productionCalendar.utils.js
-> ProductionCalendarCard.js

ProductionCalendarToolbar.js
-> productionCalendar.utils.js
-> ProductionCalendarState.js

ProductionCalendarEditor.js
-> services/manualScheduleDraft.service.js
-> shared/planning-editor/PlanningAllocationEditor.js

ProductionCalendarSplitEditor.js
-> services/manualScheduleDraft.service.js
-> shared/planning-editor/PlanningAllocationSplitEditor.js

productionCalendar.adapter.js
-> shared/planning-schedule/planningScheduleAdapter.js

productionDisplayColor.js
-> shared/planning-presentation/productionDisplayColor.js
```

## 6. PlanningPage

Imports ainda existentes de `shared/production-calendar/*`:

```js
import {
  ProductionCalendar,
  buildProductionCalendarDayPresentation,
  buildProductionCalendarDayProductivity,
  extendProductionCalendarDayRange
} from '../shared/production-calendar/index.js';
```

Uso encontrado:

- `ProductionCalendar`: usado somente em `renderProductionCalendarSnapshot(...)`.
- `buildProductionCalendarDayPresentation`: usado em `buildProductionCalendarSnapshot(...)` para montar apresentacao de dia a partir da projecao validada.
- `buildProductionCalendarDayProductivity`: usado em `buildProductionCalendarSnapshot(...)` para badge/indicador de produtividade do dia.
- `extendProductionCalendarDayRange`: usado em `buildProductionCalendarSnapshot(...)` para estender horizonte visual ate `visibleEndDate`.

Runtime atual:

- `renderProductionCalendar(...)` constroi `snapshot`, converte para `buildPlanningScheduleViewModel(snapshot)` e monta `createGanttApsRenderer(...)` com `renderer: 'gantt-aps'`.
- `renderProductionCalendarSnapshot(...)` permanece no arquivo, mas nao e chamado no fluxo operacional atual.
- `PlanningPage.js` ainda carrega o barrel V2 por import ESM; isso mantem `production-calendar.css` e os reexports fisicamente acoplados.

Equivalentes neutros ja existentes:

- `adaptPlanningResultToScheduleSnapshot` em `shared/planning-schedule/planningScheduleAdapter.js`.
- `fillPlanningScheduleDayRange` em `shared/planning-schedule/planningScheduleDay.js`.
- Cores em `shared/planning-presentation/productionDisplayColor.js`.
- Editor em `shared/planning-editor/PlanningAllocationEditor.js`.
- Gantt APS em `shared/planning-schedule-view/gantt-aps`.

Nao migrado nesta REF:

- `buildProductionCalendarDayPresentation`, `buildProductionCalendarDayProductivity` e `extendProductionCalendarDayRange`, porque tocam apresentacao de equipe/produtividade/dia e devem ser movidos em missao propria.
- `renderProductionCalendarSnapshot(...)` e fullscreen/exclusive view, porque a missao pediu evitar alterar `PlanningPage.js`.

## 7. Editor neutro e CSS

`shared/planning-editor/*` nao importa JS de `shared/production-calendar`, mas ainda usa classes CSS `production-calendar-*`.

Seletores/classes do editor neutro ainda necessarios:

```text
production-calendar-editor-backdrop
production-calendar-editor-modal
production-calendar-unified-editor-modal
production-calendar-split-editor-modal
production-calendar-editor-header
production-calendar-editor-close
production-calendar-editor-scroll
production-calendar-editor-summary
production-calendar-editor-summary-editable
production-calendar-editor-lineage
production-calendar-editor-form
production-calendar-editor-fields
production-calendar-editor-preview
production-calendar-editor-split-toggle
production-calendar-editor-distribution
production-calendar-editor-distribution-header
production-calendar-editor-parts
production-calendar-editor-part
production-calendar-editor-part-result
production-calendar-editor-error
production-calendar-split-preview
```

Data/selectors usados pelo editor neutro:

```text
data-editor-preview
data-split-add
data-split-equal
data-split-cancel
data-split-preview
data-part-capacity
data-part-quantity
data-part-remove
```

Classificacao CSS:

| Faixa/seletor | Classificacao | Observacao |
|---|---|---|
| `.production-calendar-container`, `.production-calendar-grid`, `.production-calendar-toolbar`, `.production-calendar-card`, `.production-calendar-drag-*`, `.production-calendar-details-*`, `.production-calendar-day-*`, `.production-calendar-team-*`, `.production-calendar-transport-*` | V2-only | Necessarios apenas enquanto componentes V2 fisicos/testes permanecerem. |
| `.production-calendar-editor-*`, `.production-calendar-unified-editor-modal`, `.production-calendar-split-editor-modal`, `.production-calendar-split-preview` | shared/editor-neutral | Necessarios pelo editor neutro atual. Nao remover nesta REF. |
| `.production-calendar-validation-details`, `.production-calendar-rejection-details`, `.production-calendar-diagnostic-group`, `.production-calendar-technical-details` | desconhecido/PlanningPage legado | Usados por diagnosticos/rejeicao em `PlanningPage.js` e por documentacao/testes; exigem auditoria CSS propria. |

## 8. Busca global obrigatoria

Ocorrencias runtime relevantes:

- `pages/PlanningPage.js` importa `../shared/production-calendar/index.js`.
- `pages/PlanningPage.js` contem `renderProductionCalendarSnapshot(...)` que monta `ProductionCalendar(...)`.
- `pages/PlanningPage.js` monta o Gantt APS em `renderProductionCalendar(...)` com `renderer: 'gantt-aps'`.
- `shared/planning-editor/PlanningAllocationEditor.js` e `PlanningAllocationSplitEditor.js` usam classes CSS `production-calendar-editor-*`, mas nao importam JS do V2.

Ocorrencias de teste relevantes:

- Testes exclusivos/legados V2: `productionCalendarDayHeader.test.js`, `productionCalendarEditButton.test.js`, `productionCalendarGrid.test.js`, `productionCalendarHorizon.test.js`, `productionCalendarMemberships.test.js`, `productionCalendarSplitEditor.test.js`, `productionCalendarStage.test.js`.
- Testes de compatibilidade neutra que ainda importam wrappers V2: `planningScheduleAdapter.test.js`, `planningScheduleDay.test.js`, `planningMachineOrder.test.js`, `planningDailyTeamOverride.integration.test.js`, `planningReoptimization.service.test.js`.
- Testes negativos/Gantt: `ganttApsRenderer.test.js`, `planningScheduleRenderer.test.js`, `planningScheduleViewModel.test.js`.

Ocorrencias historicas/documentais:

- `CALENDAR_V2_ARCHITECTURE.md`, docs `APS_GANTT_*`, REFs anteriores e Plano Mestre registram estados historicos. Nao sao consumidores runtime.

## 9. Helpers de productionCalendar.utils.js

Simples aliases/reexports neutros:

- `formatProductionCalendarDate`
- `getProductionCalendarWeekday`
- `addProductionCalendarDays`
- `getProductionCalendarProductionLimitDate`
- `normalizeProductionCalendarDay`
- `fillProductionCalendarDayRange`
- `normalizeProductionCalendarMachineName`
- `compareProductionCalendarMachineOrder`

Helpers UI V2:

- `formatProductionCalendarQuantity`
- `formatProductionCalendarPercent`
- `formatProductionCalendarCompactNumber`
- `formatProductionCalendarDuration`
- `getProductionCalendarDayCardCounts`
- `groupAllocationsByMachineAndDate`
- `createProductionCalendarGridRows`

Helpers de dia/capacidade/produtividade com regra sensivel de apresentacao:

- `isProductionCalendarNonWorkingDay`
- `buildProductionCalendarDayProductivity`
- `buildProductionCalendarDayPresentation`
- `extendProductionCalendarDayRange`

Decisao: nao mover nem apagar nesta REF. `PlanningPage.js` ainda consome diretamente tres desses helpers via barrel, e testes de servicos usam aliases legados para proteger compatibilidade.

## 10. Classificacao por grupos

### Grupo A - pronto para remocao fisica

Nenhum arquivo foi classificado como removivel agora.

Justificativa: todos os arquivos da pasta possuem pelo menos um dos bloqueios abaixo:

- consumidor runtime por `PlanningPage.js`/barrel;
- dependencia interna de `ProductionCalendar.js`;
- teste ativo caracterizando contrato legado;
- CSS compartilhado com editor neutro;
- wrapper de compatibilidade;
- regra sensivel de apresentacao ainda usada.

### Grupo B - wrappers legados

- `ProductionCalendarEditor.js`
- `ProductionCalendarSplitEditor.js`
- `productionCalendar.adapter.js`
- `productionDisplayColor.js`
- aliases/reexports neutros dentro de `productionCalendar.utils.js`

### Grupo C - dependencia compartilhada

- `production-calendar.css` nas faixas `production-calendar-editor-*`.
- `productionCalendar.utils.js` para `buildProductionCalendarDayPresentation`, `buildProductionCalendarDayProductivity`, `extendProductionCalendarDayRange`.
- `index.js` enquanto `PlanningPage.js` importar helpers/barrel e enquanto o CSS for carregado por side effect.

### Grupo D - regra sensivel

- `buildProductionCalendarDayPresentation`
- `buildProductionCalendarDayProductivity`
- `extendProductionCalendarDayRange`
- `isProductionCalendarNonWorkingDay`
- `createProductionCalendarGridRows` enquanto testes de reotimizacao/grid ainda usam o contrato legado
- wrappers que chamam `buildManualScheduleAllocationParts` e `buildManualScheduleAllocationSplit`

## 11. Gate de seguranca

| Condicao | Evidencia | Resultado |
|---|---|---|
| Planejamento runtime nao monta `ProductionCalendar` no fluxo atual | `renderProductionCalendar(...)` monta `createPlanningScheduleRendererHost` com factory unica `gantt-aps` e `renderer: 'gantt-aps'`. | Passou para o fluxo operacional atual. |
| Gantt cobre move/edit/split | `createGanttApsRenderer` recebe `onRequestMove`, `onRequestEdit`, `onRequestSplit`; `PlanningPage.js` liga esses callbacks ao fluxo existente. | Passou. |
| Renderer adapter V2 removido | `productionCalendarV2.renderer.js`, `createProductionCalendarV2Renderer` e `planningScheduleViewToProductionCalendarSnapshot` nao existem como runtime ativo; ocorrencias restantes sao testes negativos/docs. | Passou. |
| Candidato a remocao sem consumidor runtime | Nenhum candidato cumpriu todos os criterios porque `PlanningPage.js` ainda importa o barrel e a funcao snapshot legada existe. | Falhou para remocao. |
| Editor neutro nao depende diretamente do JS candidato | Editor neutro nao importa JS V2, mas depende do CSS V2/editor. | Passou parcialmente. |
| CSS necessario nao sera removido | Nenhuma remocao CSS foi feita. | Passou. |

## 12. Proximo lote recomendado

Proxima REF recomendada: remover o acoplamento runtime do `PlanningPage.js` com o barrel `shared/production-calendar/index.js`, sem apagar CSS/editor ainda.

Lote tecnico recomendado:

1. Remover `ProductionCalendar` e `renderProductionCalendarSnapshot(...)` se a busca confirmar que a funcao continua sem chamada operacional.
2. Trocar imports de `buildProductionCalendarDayPresentation`, `buildProductionCalendarDayProductivity` e `extendProductionCalendarDayRange` por caminho neutro novo ou imports diretos controlados, preservando comportamento.
3. Remover o side effect CSS do barrel apenas depois de garantir carregamento do CSS do editor neutro por caminho proprio.
4. Ajustar testes que hoje mantem consumidor artificial do DOM V2.

Arquivos que poderao entrar no lote de remocao fisica apos esse desacoplamento:

- `ProductionCalendar.js`
- `ProductionCalendarGrid.js`
- `ProductionCalendarToolbar.js`
- `ProductionCalendarCard.js`
- `ProductionCalendarDetails.js`
- `ProductionCalendarDrag.js`
- `ProductionCalendarState.js`
- `productionCalendar.validation.js`

Bloqueios que devem permanecer fora desse lote:

- `production-calendar.css` enquanto editor neutro usar `production-calendar-editor-*`.
- `ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` enquanto contratos/wrappers legados forem exigidos.
- `productionCalendar.utils.js` enquanto helpers de dia/produtividade nao forem neutralizados.
- `productionCalendar.adapter.js` e `productionDisplayColor.js` enquanto testes/compatibilidade legada permanecerem.

## 13. Validacoes desta auditoria

Executadas no baseline:

```text
git status --short
git branch --show-current
git rev-parse --short HEAD
node --test tests/*.js
```

Resultado: branch/HEAD/worktree conforme esperado; suite inicial 98/98.

Executadas apos a documentacao:

```text
node --check pages/PlanningPage.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/productionCalendarDayHeader.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/*.js
git diff --check
```

Resultado final:

- checks focados aprovados;
- suite completa com 98 testes, 98 aprovados e 0 falhas;
- `git diff --check` sem erros; apenas aviso conhecido de futura conversao LF -> CRLF no Plano Mestre.
