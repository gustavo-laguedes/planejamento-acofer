# REF-038 - Neutralizacao inicial das dependencias do Calendario V2

Data: 2026-08-10

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `bebfc42`
- Worktree inicial: limpo (`git status --short` sem saida)
- Contagem canonica inicial da `PlanningPage.js`: 6134 linhas
- Suite inicial: `node --test tests/*.js` com 95 testes, 95 aprovados e 0 falhas

Contagem canonica usada:

```text
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
```

## 2. Mapa de dependencias

| Modulo | Importado por | Papel | V2 visual? | Compartilhado? | Pode neutralizar agora? | Decisao |
|---|---|---|---|---|---|---|
| `pages/PlanningPage.js -> shared/production-calendar/index.js` | `PlanningPage.js` | Barrel que entrega V2, editor, adapter e helpers de dia | Parcial | Sim | Parcial | Mantido para V2/editor/adapter/dias; cores foram separadas para import neutro |
| `pages/PlanningPage.js -> shared/planning-schedule-view/index.js` | `PlanningPage.js` | Host, Gantt APS, view model e renderer V2 encapsulado | Nao | Sim | Nao | Mantido; selecao de renderer nao foi alterada |
| `PlanningPage -> ProductionCalendar` | `PlanningPage.js` | Fallback/renderer visual V2 usado pelo fluxo atual | Sim | Nao | Nao | Mantido; remover so no gate Gantt-only |
| `PlanningPage -> createGanttApsRenderer` | `PlanningPage.js` | Factory do Gantt APS e callback de movimento manual | Nao | Sim | Nao | Mantido como calendario final previsto |
| `planningScheduleRenderer.js` | `PlanningPage.js`, testes | Host neutro de mount/update/focus e fallback | Nao | Sim | Nao | Mantido sem alterar fallback |
| `productionCalendarV2.renderer.js` | `PlanningPage.js`, `planningScheduleRenderer.test.js` | Adapter de read model para `ProductionCalendar` e foco DOM V2 | Sim | Temporario | Nao | Mantido ate remocao planejada do fallback V2 |
| `ganttAps.renderer.js` | `PlanningPage.js`, testes | Renderer Gantt APS | Nao | Sim | Sim, somente import de cor | Import de `ProductionCalendarCard.js` removido; agora usa `shared/planning-presentation/productionDisplayColor.js` |
| `ganttAps.geometry.js` | `ganttAps.renderer.js`, testes | Geometria/ordenacao do Gantt | Nao | Sim | Sim, mas nao nesta REF | `compareProductionCalendarMachineOrder` permanece acoplado a `productionCalendar.utils.js` para missao posterior |
| `ProductionCalendarCard.js` | V2 grid/details/drag/editor/testes e Gantt antes da REF | Card DOM V2 e helper puro de cor | Sim, parcialmente | Sim | Sim, so helper puro | Helper de cor saiu para modulo neutro; card manteve re-export compativel |
| `productionDisplayColor.js` antigo | `PlanningPage`, Card, barrel/testes antes da REF | Paleta, normalizacao visual e tema de producao | Nao | Sim | Sim | Movido para `shared/planning-presentation/productionDisplayColor.js`; caminho antigo virou re-export |
| `productionCalendar.adapter.js` | `PlanningPage`, testes de grid/stage/memberships/batch | Adapter de resultado do planejamento para allocations | Nao DOM | Sim | Sim, com risco maior | Mantido; envolve identidade `readonly:*`, memberships e fallback de dados |
| `productionCalendar.utils.js` | V2, `PlanningPage`, `ganttAps.geometry.js`, testes | Datas, formatos, produtividade visual, ordenacao e grid rows | Parcial | Sim | Parcial | Mantido; precisa ser dividido em blocos menores |
| `ProductionCalendarEditor.js` | `PlanningPage`, testes | Modal operacional de edit/split | Sim DOM | Sim | Nao | Mantido e documentado como dependencia compartilhada visual |
| `ProductionCalendarSplitEditor.js` | Teste direto e legado de split | Modal DOM legado de split | Sim | Pouco | Nao | Mantido e documentado |
| `production-calendar.css` | `shared/production-calendar/index.js` | Estilos V2 | Sim | Nao | Nao | Mantido enquanto houver fallback/barrel V2 |
| `ProductionCalendarGrid/Toolbar/State/Drag/Details` | `ProductionCalendar.js`, testes | UI e estado visual do Calendario V2 | Sim | Nao ou parcial | Nao | Mantidos |

## 3. Cadeia atual de fallback

Preservada sem alteracao:

```text
mount/update Gantt APS
-> falha no lifecycle
-> planningScheduleRendererHost destroi o renderer falho
-> monta fallback `production-calendar-v2`
-> `createProductionCalendarV2Renderer`
-> `ProductionCalendar`
```

Tambem foi preservado o fallback antigo da `PlanningPage.js` para `CalendarTimeline` quando `USE_PRODUCTION_CALENDAR_V2` estiver falso. Essa flag nao foi alterada.

## 4. Gate de seguranca do bloco movido

| Pergunta | Resposta |
|---|---|
| E usado fora do V2? | Sim. `PlanningPage.js` usa tema/paleta e `ganttAps.renderer.js` usa cor por allocation. |
| Tem DOM/render especifico do V2? | Nao. A implementacao so calcula strings hex e derivados. |
| Tem estado proprio do V2? | Nao. Funcoes puras sem cache, storage ou estado visual mutavel. |
| Tem regra de negocio? | Nao. E apresentacao readonly; nao altera draft, snapshot, estoque, capacidade ou IDs persistidos. |
| Mover exige alterar comportamento? | Nao. Codigo foi movido sem reescrever algoritmo. |
| Consumidores podem continuar com a mesma API? | Sim. O caminho antigo reexporta os mesmos simbolos, e `ProductionCalendarCard.js` reexporta `getProductionCalendarAllocationColor`. |

## 5. Neutralizacao realizada

- Criado `shared/planning-presentation/productionDisplayColor.js` com a implementacao de:
  - `getProductionDisplayColor`;
  - `getProductionDisplayFallbackColor`;
  - `mixProductionDisplayColor`;
  - `getProductionDisplayTheme`;
  - `getProductionCalendarAllocationColor`;
  - `PRODUCTION_DISPLAY_PALETTE`.
- `shared/production-calendar/productionDisplayColor.js` passou a ser re-export temporario.
- `ProductionCalendarCard.js` deixou de conter o calculo puro de cor e passou a consumir/reexportar o modulo neutro.
- `ganttAps.renderer.js` deixou de importar `ProductionCalendarCard.js`.
- `PlanningPage.js` passou a importar simbolos de cor diretamente de `shared/planning-presentation/productionDisplayColor.js`.
- `tests/productionDisplayColor.test.js` passou a importar o modulo neutro e a proteger o import do Gantt.

## 6. Contratos preservados

- Cores persistidas nao sao mutadas.
- Fallback por `productionIndex`, `productionId` ou identidade permanece deterministico.
- Cor explicita lavada/acromatica continua normalizada apenas para apresentacao.
- `getProductionCalendarAllocationColor` preserva assinatura e retorno `{ accent, bg, border }`.
- `ProductionCalendarCard.js` continua exportando `getProductionCalendarAllocationColor` para compatibilidade.
- `shared/production-calendar/productionDisplayColor.js` continua exportando a API antiga como re-export.
- Nenhum renderer, fallback, flag, CSS, editor, split, movimento manual, persistencia, estoque, solver, reotimizacao, capacidade ou regra produtiva foi alterado.

## 7. O que permanece acoplado

- `PlanningPage.js` ainda importa o barrel `shared/production-calendar/index.js` por depender de `ProductionCalendar`, `ProductionCalendarEditor`, adapter e helpers de dia.
- `productionCalendar.adapter.js` segue em namespace V2 apesar de ser adapter de planejamento.
- `productionCalendar.utils.js` ainda mistura helpers neutros e helpers do grid V2.
- `ganttAps.geometry.js` ainda importa `compareProductionCalendarMachineOrder` de `productionCalendar.utils.js`.
- `ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` seguem em `shared/production-calendar` embora sejam parte do fluxo operacional atual.
- `productionCalendarV2.renderer.js`, fallback V2 e CSS V2 permanecem ativos.

## 8. Blockers reais para apagar V2

- Fallback `production-calendar-v2` ainda registrado no host e exercitado por testes.
- `PlanningPage.js` ainda monta `ProductionCalendar` e usa o barrel que injeta CSS V2.
- Editor/split operacional ainda mora no pacote visual V2.
- Adapter e utils compartilhados ainda vivem no namespace V2.
- Grid/toolbar/state/drag/details e CSS V2 continuam necessarios enquanto o fallback existir.
- REF-013 homologacao manual permanece pendente.
- Remocao do V2 exige missao Gantt-only propria, com decisao explicita sobre fallback/flags/testes V2.

## 9. Ordem recomendada das proximas remocoes

1. Extrair `normalizeProductionCalendarMachineName` e `compareProductionCalendarMachineOrder` para modulo neutro pequeno, removendo o import do Gantt em `productionCalendar.utils.js`.
2. Neutralizar o adapter de schedule com re-export, preservando `allocationId`, memberships e IDs `readonly:*`.
3. Separar helpers de dia/formato usados fora do grid V2.
4. Criar fronteira neutra para editor/split visual compartilhado, sem mover regra transacional.
5. So depois, remover fallback/renderer/CSS/testes exclusivos V2 no gate Gantt-only.

## 10. Validacoes finais

Executadas:

```text
node --check shared/planning-presentation/productionDisplayColor.js
node --check shared/production-calendar/productionDisplayColor.js
node --check shared/production-calendar/index.js
node --check shared/production-calendar/ProductionCalendarCard.js
node --check shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js
node --check pages/PlanningPage.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/productionDisplayColor.test.js
node --test tests/*.js
git diff --check
```

Resultado:

- Testes focados: zero falhas.
- Suite final: 95 testes, 95 aprovados e 0 falhas.
- `git diff --check`: sem erros; apenas avisos conhecidos de futura conversao LF -> CRLF.

## 11. Homologacao operacional

Revisao read-only por Max Verstappen: `Homologado`.

Restricao registrada: nao foi executado browser nem fluxo PCP ponta a ponta porque a mudanca foi estrutural de import/export e nao alterou comportamento de dominio.
