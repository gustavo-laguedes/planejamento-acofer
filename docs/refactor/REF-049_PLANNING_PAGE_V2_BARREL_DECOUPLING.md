# REF-049 - Desacoplar PlanningPage do barrel V2

Data: 2026-08-12

## 1. Baseline

- Branch esperada: `rebuild-production-calendar`
- Branch encontrada: `rebuild-production-calendar`
- HEAD esperado: `c7f7bed`
- HEAD encontrado: `c7f7bed`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Imports auditados da PlanningPage

Antes:

```js
import {
  ProductionCalendar,
  buildProductionCalendarDayPresentation,
  buildProductionCalendarDayProductivity,
  extendProductionCalendarDayRange
} from '../shared/production-calendar/index.js';
```

Depois:

```js
import {
  buildProductionCalendarDayPresentation,
  buildProductionCalendarDayProductivity,
  extendProductionCalendarDayRange
} from '../shared/production-calendar/productionCalendar.utils.js';
import { ensurePlanningAllocationEditorCss } from '../shared/planning-editor/planningAllocationEditorCss.js';
```

| Simbolo | Uso atual | Consumidores | Equivalente neutro? | Regra sensivel? | Acao |
|---|---|---|---|---|---|
| `ProductionCalendar` | Montava a funcao legada `renderProductionCalendarSnapshot(...)` | Somente a definicao interna removida; nenhum caller runtime encontrado | Nao necessario | Nao | Removido da `PlanningPage` |
| `buildProductionCalendarDayPresentation` | Monta apresentacao validada de dia/equipe em `buildProductionCalendarSnapshot(...)` | `PlanningPage.js`, componentes/testes V2 e testes de override/reotimizacao | Nao ha equivalente neutro comprovado nesta REF | Sim: dias, equipe, capacidade e non-working day | Preservado por import direto de `productionCalendar.utils.js` |
| `buildProductionCalendarDayProductivity` | Monta badge/indicador de produtividade por dia em `buildProductionCalendarSnapshot(...)` | `PlanningPage.js` e testes de cabecalho | Nao ha equivalente neutro comprovado nesta REF | Sim: produtividade e capacidade | Preservado por import direto de `productionCalendar.utils.js` |
| `extendProductionCalendarDayRange` | Estende horizonte visual ate `visibleEndDate` sem mover alocacoes | `PlanningPage.js`, `ProductionCalendar.js` e testes de horizonte | Nao ha equivalente neutro comprovado nesta REF | Sim: horizonte produtivo/dias | Preservado por import direto de `productionCalendar.utils.js` |
| `production-calendar.css` | Side effect do barrel carregava estilos do V2/editor | `PlanningPage.js` por efeito colateral; editor neutro usa classes `production-calendar-editor-*` | Loader neutro criado | Sim para preservar UI do editor, sem regra produtiva | Side effect movido para `shared/planning-editor/planningAllocationEditorCss.js` |

Classificacao:

- `ProductionCalendar`: V2-only e wrapper legado de renderer interno.
- `buildProductionCalendarDayPresentation`: helper produtivo/sensivel.
- `buildProductionCalendarDayProductivity`: helper produtivo/sensivel.
- `extendProductionCalendarDayRange`: helper produtivo/sensivel.
- CSS: side effect CSS ainda necessario ao editor neutro.

## 3. Callers de renderProductionCalendarSnapshot

Busca executada:

```text
rg -n "renderProductionCalendarSnapshot|ProductionCalendar\(" pages shared services server tests docs PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md
```

Classificacao das ocorrencias antes da remocao:

| Ocorrencia | Classificacao | Decisao |
|---|---|---|
| `pages/PlanningPage.js`: definicao de `renderProductionCalendarSnapshot(...)` | Definicao sem caller | Removida |
| `pages/PlanningPage.js`: `ProductionCalendar({ ... })` dentro da funcao | Chamada interna da definicao orfa | Removida junto |
| `shared/production-calendar/ProductionCalendar.js`: `export function ProductionCalendar(...)` | Componente fisico V2 preservado | Nao remover nesta REF |
| `tests/productionCalendar*.test.js` | Testes de componentes/wrappers V2 preservados | Nao remover nesta REF |
| `docs/*` e Plano Mestre | Historico/documentacao | Atualizar somente estado atual no documento novo e Plano Mestre |

Gate: nao havia caller runtime real da funcao, entao `renderProductionCalendarSnapshot(...)` foi removida.

## 4. CSS e side effect

O barrel `shared/production-calendar/index.js` executa `ensureProductionCalendarCss()` no import ESM e injeta `production-calendar.css`.

O editor neutro `shared/planning-editor/PlanningAllocationEditor.js` e `PlanningAllocationSplitEditor.js` ainda usam classes `production-calendar-editor-*`, entao o CSS nao foi removido.

Novo ponto neutro:

```text
PlanningPage.js
-> shared/planning-editor/planningAllocationEditorCss.js
-> shared/production-calendar/production-calendar.css
```

O atributo `data-production-calendar-css="true"` foi preservado para evitar dupla injecao caso algum consumidor legado ainda importe o barrel.

## 5. Helpers sensiveis preservados

Foram preservados sem neutralizacao oportunistica:

- `buildProductionCalendarDayPresentation`
- `buildProductionCalendarDayProductivity`
- `extendProductionCalendarDayRange`
- Implementacoes auxiliares internas de `productionCalendar.utils.js`, incluindo non-working day, feriados e horizonte.

Nenhuma regra de produtividade, capacidade, turnos, dias, horizonte ou `productiveMinutes` foi movida.

## 6. Contrato final da PlanningPage

Estado final:

```text
PlanningPage
-> imports diretos/minimos de helpers sensiveis preservados
-> loader CSS neutro do editor
-> buildPlanningScheduleViewModel(...)
-> createPlanningScheduleRendererHost(...)
-> createGanttApsRenderer(...)
```

Sem:

```text
PlanningPage
-> shared/production-calendar/index.js
PlanningPage
-> ProductionCalendar(...)
PlanningPage
-> renderProductionCalendarSnapshot(...)
```

## 7. Validacoes

Comandos finais previstos/executados nesta REF:

```text
node --check pages/PlanningPage.js
node --check shared/planning-editor/planningAllocationEditorCss.js
node --test tests/ganttApsRenderer.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarDayHeader.test.js
node --test tests/productionCalendarHorizon.test.js
node --test tests/*.js
git diff --check
```

Resultado final:

- `node --check pages/PlanningPage.js`: aprovado.
- `node --check shared/planning-editor/planningAllocationEditorCss.js`: aprovado.
- Testes focados obrigatorios: aprovados.
- `node --test tests/*.js`: 98 testes, 98 aprovados, 0 falhas.
- `git diff --check`: sem erros; apenas avisos conhecidos de futura conversao LF -> CRLF.

## 8. Blockers restantes

- `ProductionCalendar.js`, grid, toolbar, details, drag/state e validation continuam fisicamente presentes e testados.
- `production-calendar.css` continua compartilhado com editor neutro; nao pode ser removido antes de neutralizar classes/loader.
- `ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` continuam wrappers legados testados.
- `productionCalendar.utils.js` ainda contem helpers sensiveis de dia/produtividade/horizonte usados pela `PlanningPage`.
- Testes `productionCalendar*.test.js` ainda caracterizam contratos fisicos V2.
- REF-013 continua pendente de homologacao operacional; nao foi marcada como homologada.
