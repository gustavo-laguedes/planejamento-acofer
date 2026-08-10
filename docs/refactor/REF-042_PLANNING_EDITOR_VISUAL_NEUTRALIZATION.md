# REF-042 - Neutralizacao do editor/split visual compartilhado

Data: 2026-08-10

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `8cd1dbc`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Auditoria obrigatoria

| Componente/bloco | Consumidores | UI compartilhada? | Estado V2? | Regra produtiva? | CSS V2? | Pode neutralizar? | Decisao |
|---|---|---|---|---|---|---|---|
| `ProductionCalendarEditor` | `PlanningPage.js` em edicao de allocation; `PlanningPage.js` em confirmacao de movimento manual; testes | Sim | Nao | Antes chamava service de split para preview; apos a REF recebe `getDistributionPreview` por callback | Sim, classes `production-calendar-editor-*` preservadas | Sim, com injecao explicita do preview canonico | Movido para `shared/planning-editor/PlanningAllocationEditor.js` |
| `ProductionCalendarSplitEditor` | Barrel V2 e teste direto; sem abertura produtiva confirmada no fluxo atual | Legado/compatibilidade | Nao | Antes chamava service de split para preview; apos a REF recebe `getSplitPreview` por callback | Sim, classes `production-calendar-editor-*` preservadas | Sim como compatibilidade visual isolada | Movido para `shared/planning-editor/PlanningAllocationSplitEditor.js` |
| Helpers de memberships/etapa usados pelo editor | Editor neutro | Sim, apresentacao de allocation | Nao | Nao | Nao direto | Sim | Movidos para `shared/planning-editor/planningAllocationDisplay.js`; `ProductionCalendarCard` nao foi alterado |
| Formatadores de quantidade/percentual/duracao usados pelo editor | Editor neutro, split editor neutro; V2 utils por compatibilidade futura | Sim, apresentacao | Nao | Nao | Nao direto | Sim | Criados em `shared/planning-editor/planningAllocationEditorFormatters.js`; CSS nao movido |
| Wrappers legados `production-calendar/ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` | Barrel antigo e testes legados | Compatibilidade temporaria | Nao | Injeta service canonico para preservar API antiga | Sim | Sim como ponte | Mantidos como re-export/wrapper temporario |

## 3. Gate por editor

| Pergunta | `PlanningAllocationEditor` | `PlanningAllocationSplitEditor` |
|---|---|---|
| 1. E usado pelo planejamento atual independentemente do renderer V2? | Sim. `PlanningPage.js` abre o editor pelo callback de edicao e pelo fluxo de confirmacao de movimento manual, inclusive quando o renderer ativo e o Gantt. | Nao como fluxo produtivo atual; e legado/exportado/testado. Foi movido por compatibilidade e para remover implementacao duplicada do namespace V2. |
| 2. Depende de DOM/grid especifico do V2? | Nao depende do grid nem de `ProductionCalendar`; depende de DOM modal global e classes CSS `production-calendar-*` reaproveitadas. | Nao depende do grid nem de `ProductionCalendar`; depende de DOM modal global e classes CSS `production-calendar-*` reaproveitadas. |
| 3. Depende de estado interno de `ProductionCalendar`? | Nao. Recebe `allocation`, `machines`, `getPreview`, `getDistributionPreview`, flags e callbacks. | Nao. Recebe `allocation`, `getSplitPreview`, `onSave` e `onClose`. |
| 4. Executa solver/reotimizacao diretamente? | Nao. | Nao. |
| 5. Aplica transaction diretamente? | Nao. | Nao. |
| 6. Pode receber tudo por parametros/callbacks explicitos? | Sim. O preview de capacidade ja vinha por `getPreview`; o preview de distribuicao passou a vir por `getDistributionPreview`. | Sim. O preview de split passou a vir por `getSplitPreview`. |
| 7. Pode preservar API e comportamento sem reescrita? | Sim. API antiga preservada por wrapper. | Sim. API antiga preservada por wrapper. |

## 4. Consumidores e callbacks

- Quem abre o editor: `openProductionCalendarAllocationEditor` em `pages/PlanningPage.js`.
- Quem abre o split atual: o proprio `PlanningAllocationEditor` quando `startSplit` ou o botao "Dividir esta producao" ativa a distribuicao.
- Quem usa editor em movimento: `confirmManualMoveConfiguration` em `pages/PlanningPage.js`, com `allowSplit: false` e `lockPosition: true`.
- Quem abre o split editor legado: nenhum consumidor produtivo confirmado; permanece exportado/testado para compatibilidade.
- `onSave`: em edicao normal chama `handleProductionCalendarAllocationSave({ ...payload, productivityRows })`; em confirmacao de movimento devolve configuracao para o runner.
- `onClose`: preservado, usado no fluxo de movimento para resolver `null`.
- Payload visual preservado: `mode`, `allocation`, `relativePercents`, `partEdits`, `machineId`, `peopleCount`, `quantity`, `capacityPercent`, `date`, `startTime`.

## 5. Integracoes preservadas

- `handleProductionCalendarAllocationSave` continua coordenando edicao simples, split e ramo de recurso.
- `planningAllocationEditorController` continua sendo a fronteira transacional para `EDIT_ALLOCATION` e `SPLIT_ALLOCATION`.
- Capacidade extraordinaria continua decidida por `confirmProductionCalendarCapacityDecision` e passada como `decisions.capacityDecision`.
- Ramo de reotimizacao por recurso continua em `PlanningPage.js`, com `reoptimizeProductionCalendarConstraints`, `buildPlanningProductionConfigurationEditCommand`, `applyManualScheduleTransaction` e `acceptRecalculatedCalendar`.
- O editor neutro nao chama `simulateCurrent`, `buildPlan`, `reoptimizePlanningFuture`, `applyManualScheduleTransaction`, API, storage ou renderer.
- Nenhum import de `productionCalendar.utils.js` permanece no namespace neutro.

## 6. CSS

CSS nao foi movido nem renomeado nesta REF.

Dependencias preservadas:

- `production-calendar-editor-backdrop`
- `production-calendar-editor-modal`
- `production-calendar-unified-editor-modal`
- `production-calendar-split-editor-modal`
- `production-calendar-editor-form`
- `production-calendar-editor-preview`
- `production-calendar-editor-part`
- `production-calendar-editor-error`
- seletores `data-editor-preview`, `data-split-preview`, `data-split-add`, `data-split-equal`, `data-part-*`

Blocker: enquanto esses modais dependerem de `shared/production-calendar/production-calendar.css`, o CSS V2 nao pode ser removido fisicamente sem uma REF propria de CSS compartilhado.

## 7. Neutralizacao realizada

- Criado `shared/planning-editor/PlanningAllocationEditor.js`.
- Criado `shared/planning-editor/PlanningAllocationSplitEditor.js`.
- Criado `shared/planning-editor/planningAllocationDisplay.js`.
- Criado `shared/planning-editor/planningAllocationEditorFormatters.js`.
- Criado `shared/planning-editor/index.js`.
- `PlanningPage.js` passou a importar `PlanningAllocationEditor` do namespace neutro.
- Wrappers antigos preservam `ProductionCalendarEditor`, `ProductionCalendarSplitEditor` e helpers legados.

## 8. Contratos preservados

- Campos exibidos, labels, defaults, foco, fechamento, cancelamento e comportamento de modal.
- `machineId`, `peopleCount`, `quantity`, `date`, `startTime`, `relativePercents`, `partEdits` e ordem de partes.
- Preview de produtividade por `getPreview`.
- Preview de split/distribuicao por service canonico, agora injetado por callback.
- Capacidade extraordinaria e mensagens existentes.
- Callback `onSave` fecha somente quando retorna `{ accepted: true }`.

## 9. Validacoes

Executadas:

```text
node --check pages/PlanningPage.js
node --check shared/planning-editor/PlanningAllocationEditor.js
node --check shared/planning-editor/PlanningAllocationSplitEditor.js
node --check shared/production-calendar/ProductionCalendarEditor.js
node --check shared/production-calendar/ProductionCalendarSplitEditor.js
node --check shared/planning-editor/index.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarConfigurationEdit.integration.test.js
node --test tests/manualScheduleEditCapacityOverride.test.js
node --test tests/planningAllocationEditorController.test.js
node --test tests/planningReoptimization.service.test.js
node --test tests/*.js
git diff --check
```

Resultado:

- Testes focados: zero falhas.
- Suite final: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas.
- `git diff --check`: sem erros; apenas avisos conhecidos de futura conversao LF -> CRLF.

## 10. Blockers V2 restantes

- REF-013 homologacao manual.
- Renderer/fallback V2.
- `ProductionCalendar`/grid/toolbar/details/drag.
- CSS V2 ou CSS compartilhado dos modais.
- Helpers V2 puros.
- `productiveMinutes`.
- Turnos/capacidade.
- Stock-only.
- Identidade manual restante.
- Autosave/descarte.
- `generatePlanningCode`.
