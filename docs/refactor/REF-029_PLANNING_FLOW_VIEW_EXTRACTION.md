# REF-029 - Planning flow view extraction

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `3d8f8ce63d3ff21220b333913cc0e19f38fa46f0`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 64 testes, 64 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6832 linhas

## 2. Auditoria de candidatas

| Funcao | Retorna HTML? | DOM? | Eventos? | Dependencias | Estado externo? | Decisao |
|---|---|---|---|---|---|---|
| `flowNodeStatus` | Nao direto; retorna label/classe para HTML | Nao | Nao | Campos do no e quantidades ja normalizadas | Nao | Extraida como helper privado de `planningFlowView.js`, por ser apresentacao do card |
| `nodeUsesStockBalance` | Nao direto; decide se renderiza label informativo | Nao | Nao | Campos do no | Nao | Extraida como helper privado de `planningFlowView.js`, por ser apresentacao read-only |
| `renderStockBalanceInfo` | Sim | Nao | Nao | `nodeUsesStockBalance` | Nao | Extraida como helper privado de `planningFlowView.js` |
| `renderFlowNodeCard` | Sim | Nao | Nao | `escapeHtml`, `formatPtBrDecimal`, `flowNodeKey`, `hasStockAvailable`, `consolidatedStockOnlyChecked`, `planningFlowNodeStockBalanceChecked`, tema/segmentos | Recebia estado via closures antes; agora recebe dependencias por parametros | Extraida para `planningFlowView.js` |
| `renderFlowGraph` | Sim | Nao; inclui shell SVG como string, mas nao manipula DOM | Nao | `buildFlowGraph`, `renderFlowNodeCard`, `escapeHtml` | Recebia `buildFlowGraph` por closure antes; agora por parametro | Implementacao HTML extraida para `planningFlowView.js`; `PlanningPage.js` manteve adapter fino para injetar dependencias |
| `drawProductionFlowConnectors` | Nao | Sim, usa `page`, `querySelectorAll`, medidas e `svg.innerHTML` | Nao direto | DOM/SVG/layout, `productionTheme` | Sim, DOM da pagina | Mantida na `PlanningPage.js` |
| `renderProductionFlows` | Sim | Nao direto | Nao | `draft.productions`, legenda, `productionThemeStyle`, `renderFlowGraph`, `result.summary` | Sim, le `draft` | Mantida na `PlanningPage.js` |
| `renderFlowTree` | Sim | Nao | Nao | `escapeHtml`, `formatPtBrDecimal`, recursao | Nao | Extraida para `planningFlowView.js` |
| `renderPlanFlowDetail` | Sim | Nao direto | Nao | `planTreeRoots`, `renderFlowGraph` | Indireto pela injecao de dependencias da pagina | Mantida na `PlanningPage.js` |
| `resolvePlanningFlowAllocation` | Nao | Nao | Nao | datasets/allocations, normalizadores de foco | Nao direto, mas toca foco de calendario | Mantida; foco Flow -> Gantt fora do escopo |
| `focusPlanningFlowAllocation` | Nao | Nao direto | Sim/renderer host | `resolvePlanningFlowAllocation`, `rendererHost.focusAllocation`, `console.warn` | Sim, renderer host | Mantida; foco/Gantt fora do escopo |

## 3. Fronteira encontrada

A fronteira segura foi HTML/string de apresentacao do Flow: card do no, shell HTML do grafo e arvore textual historica. A pagina continuou dona de estado e orquestracao, injetando `buildFlowGraph`, tema visual, `flowNodeKey`, `hasStockAvailable`, `consolidatedStockOnlyChecked` e `planningFlowNodeStockBalanceChecked`.

Ficaram fora DOM/SVG ativo, conectores, eventos click/keyboard, modal de detalhes, foco Flow -> Gantt, `renderProductionFlows`, estoque/toggle operacional, Calendario V2, movimento manual, split, API, persistencia, solver, reotimizacao, turnos e capacidade.

## 4. Extracao realizada

Criado `shared/planning-presentation/planningFlowView.js`, sem `index.js`.

Funcoes exportadas:

- `renderFlowNodeCard`
- `renderFlowGraph`
- `renderFlowTree`

Helpers privados:

- `flowNodeStatus`
- `nodeUsesStockBalance`
- `renderStockBalanceInfo`

`pages/PlanningPage.js` passou a importar as funcoes e manteve apenas `planningFlowViewOptions` e um wrapper local `renderFlowGraph` para injetar dependencias de estado/tema sem mover essas closures.

## 5. Contratos HTML preservados

- Classes CSS dos cards, status, grafo, colunas, SVG, marcadores e arvore foram preservadas.
- `role="button"` e `tabindex="0"` do no foram preservados.
- `data-flow-*`, `data-stock-only`, `data-material-id`, `data-flow-edges` e `data-flow-level` foram preservados.
- Ordem do HTML interno do card foi preservada: header, marcador de producao, metricas, toggle/info.
- Labels e entidades HTML foram preservados, incluindo `Produ&ccedil;&atilde;o cheia`, `Comprar / mat&eacute;ria-prima inicial`, `Utilizar saldo`, `Origem: Compra / base` e `Necessario`.
- Escaping existente foi preservado, inclusive entidades escapadas dentro de atributos e o comportamento historico do `data-material-id` do checkbox.
- Fallbacks de producao e ausencia de valores foram preservados.
- O shell SVG permanece string; a manipulacao real continua em `drawProductionFlowConnectors`.

## 6. Testes

Criado `tests/planningFlowView.test.js`, cobrindo:

- no simples;
- pai/filho via `renderFlowGraph`;
- labels, classes, IDs e `data-*`;
- escaping de texto, atributos e edges JSON;
- valores ausentes;
- modo read-only de saldo;
- nao mutacao das entradas.

Alterado estritamente `tests/productionDisplayColor.test.js` para apontar a guarda estatica do HTML do card para `shared/planning-presentation/planningFlowView.js`.

## 7. Validacoes

Executadas ate este registro:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-presentation/planningFlowView.js
node --check pages/PlanningPage.js
node --test tests/planningFlowView.test.js
node --test tests/productionDisplayColor.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningFlowView`: 4/4 subtestes aprovados
- Teste afetado `productionDisplayColor`: aprovado
- Suite ampla final: 68 testes, 68 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF
- Suite ampla inicialmente apontou uma guarda estatica desatualizada, corrigida no teste existente sem mudar codigo produtivo

## 8. PlanningPage antes/depois

- Antes: 6832 linhas
- Depois: 6756 linhas
- Reducao liquida: 76 linhas

## 9. Riscos e dividas

- `renderProductionFlows`, legenda e shell de uso da pagina continuam na `PlanningPage.js` por dependerem de `draft`.
- `drawProductionFlowConnectors` continua na pagina por manipular DOM/SVG/layout.
- Eventos click/keyboard, modal de detalhes, `resolvePlanningFlowAllocation` e `focusPlanningFlowAllocation` continuam na pagina.
- O wrapper local `renderFlowGraph` ainda existe para injetar dependencias; a implementacao HTML esta extraida.
- O teste de producao visual ainda contem guardas estaticas; foi apenas realinhado ao novo modulo.
- REF-013 homologacao manual, eventos/DOM/SVG do Flow, foco Flow -> Gantt, Calendario V2, manual move/split, persistencia, identidade do calendario manual, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.

## 10. Conclusao

REF-029 extraiu somente apresentacao HTML/string do Flow. Nenhum DOM/evento/foco/Gantt, Calendario V2, estoque operacional, movimento manual, split, API, persistencia, solver, reotimizacao, capacidade ou turno foi movido.
