# REF-028 - Planning flow model extraction

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `f38b2665498afbdf61f539f5963f5dcf66d6ff80`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 57 testes, 57 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6990 linhas

## 2. Candidatas auditadas

| Funcao | Papel | Entradas | Saida | Dependencias | DOM? | Muta? | Regra produtiva? | Decisao |
|---|---|---|---|---|---|---|---|---|
| `productionFlowTrees` | Selecionar raizes do fluxo a partir do resultado | `result` | array com nos originais | `isPlanningRootName` | Nao | Nao | Leitura da arvore produtiva | Extraida como `selectProductionFlowTrees`, com root predicate explicito |
| `flowNodeModelName` | Resolver nome de modelo por precedencia historica | `node`, `draft.operationOverrides`, `draft.productions` | string | closure `draft` antes | Nao | Nao | Sim, precedencia existente de modelo/override | Extraida como `resolveFlowNodeModelName` com dependencias explicitas e teste de caracterizacao |
| `flowNodeKey` | Derivar chave consolidada de no | `node`, modelo resolvido | string | `flowNodeModelName` antes | Nao | Nao | Baixa; identidade visual do grafo | Extraida como `buildFlowNodeKey` |
| `normalizedFlowQuantities` | Normalizar required/stock/producao do no | `node` | objeto de quantidades | nenhuma | Nao | Nao | Sim, regra existente de leitura quantitativa | Extraida como `normalizeFlowQuantities` sem alterar formula |
| `mergeFlowNode` | Consolidar nos equivalentes no grafo | `targetNode`, `sourceNode` | altera no temporario interno | `normalizedFlowQuantities` | Nao | Sim, apenas acumulador interno novo | Sim, consolidacao historica | Movida como helper privado do modulo, comportamento literal preservado |
| `buildFlowGraph` | Derivar colunas, nos, arestas, IDs e metadados do fluxo | `roots`, `draft.operationOverrides`, `draft.productions` | `{ columns, edges }` | `isPlanningRootName`, `flowNodeKey`, `mergeFlowNode` | Nao | Nao nas entradas; muta maps/sets internos | Sim, modelo de leitura do grafo | Extraida como `buildPlanningFlowGraph`, com dependencias explicitas |
| `stockOnlyNodeKey` | Chave interna para produto final do grafo | `node` | string | nenhuma | Nao | Nao | Baixa; identidade interna do grafo | Movida como helper privado do modulo |
| `flowNodeStatus` | Resolver label/classe visual do card | `node`, flags, quantidades | `{ label, className }` | labels HTML | Nao | Nao | Apresentacao/HTML | Rejeitada; camada visual |
| `renderFlowNodeCard` | Renderizar card HTML do fluxo | `node`, `options` | string HTML | formatadores, tema, toggle, datasets | HTML | Nao | Apresentacao | Rejeitada; camada visual |
| `renderFlowGraph` | Renderizar grafo e embutir edges para SVG | `trees`, `options` | string HTML | `buildFlowGraph`, `renderFlowNodeCard` | HTML | Nao | Apresentacao | Rejeitada; wrapper visual mantido |
| `drawProductionFlowConnectors` | Desenhar conectores SVG no DOM | DOM atual | `undefined` | `page`, `querySelectorAll`, layout | Sim | Sim, DOM/SVG | Nao | Rejeitada; DOM/interacao |
| `renderProductionFlows` | Renderizar legenda e shell do fluxo | `result` | string HTML | `draft`, tema, formatadores | HTML | Nao | Apresentacao | Rejeitada; visual |
| `renderFlowTree` | Render historico em arvore textual | `node`, `level` | string HTML | formatadores | HTML | Nao | Apresentacao historica | Rejeitada; visual |
| `renderPlanFlowDetail` | Render detalhe salvo com grafo | `tree` | string HTML | `planTreeRoots`, `renderFlowGraph` | HTML | Nao | Apresentacao historica | Rejeitada; visual |
| `resolvePlanningFlowAllocation` | Resolver allocation para foco pelo dataset do no | `node`, `allocations` | allocation ou null | dataset/allocations | Nao | Nao | Identidade/foco de calendario | Rejeitada nesta missao; toca ponte de foco/interaction |
| `focusPlanningFlowAllocation` | Focar allocation no renderer host | `node`, `allocations`, `rendererHost` | boolean | renderer host, `console.warn` | Nao direto | Chama renderer | Interacao | Rejeitada; foco/Gantt fora do escopo |
| `planningFlowNodeStockBalanceChecked` | Resolver checked efetivo do toggle visual | `node`, `checked`, `canUseStock` | boolean | nenhuma | Nao | Nao | Estoque/apresentacao | Rejeitada; estoque/toggle visual fora do escopo |
| `stockOnlyMaterialsFromSimulation` | Derivar escolhas de estoque a partir da simulacao | `result`, `draft.stockOnlyMaterialChoices` | array | `stockOnlyChoice`, `shouldUsePlanningStockBalance` | Nao | Nao | Estoque | Rejeitada; estoque fora do escopo |

## 3. Fronteira encontrada

A fronteira segura foi o modelo puro de leitura do fluxo produtivo: selecionar raizes, resolver nome/chave do no, normalizar quantidades e construir grafo consolidado com colunas, nos, arestas, IDs e metadados.

Ficaram fora HTML, DOM, SVG, modal, eventos, foco, renderer/Gantt, toggle de estoque, sincronizacao de escolhas de estoque, draft mutavel, API, save, persistencia, solver, reotimizacao, movimento manual, split/editor, transporte, capacidade e turnos.

## 4. Extracao realizada

Criado `shared/planning-domain/planningFlowModel.js`, sem `index.js`.

Funcoes exportadas:

- `selectProductionFlowTrees`
- `resolveFlowNodeModelName`
- `buildFlowNodeKey`
- `normalizeFlowQuantities`
- `buildPlanningFlowGraph`

`pages/PlanningPage.js` passou a importar essas funcoes e manteve wrappers locais para preservar os nomes consumidos pela camada visual (`productionFlowTrees`, `flowNodeModelName`, `flowNodeKey`, `buildFlowGraph`).

## 5. Contratos preservados

- Ordem das arvores: `selectProductionFlowTrees` preserva a ordem original de `result.tree.children`.
- Referencias: raizes retornadas continuam sendo os mesmos objetos de entrada.
- Ordem dos nos: `flowOrder` continua baseado na ordem de insercao do `Map`, e cada coluna continua ordenada por `flowOrder`.
- Ordem das arestas: `edgesByKey` continua emitido na ordem de insercao.
- IDs: `operationId`, `parentOperationId`, `calendarParentOperationId`, `splitParentOperationId`, `productionId` e `productionKey` continuam coletados com o mesmo `String(...).trim()` e filtro de vazios.
- Labels/fallbacks: titulo de producao continua `sourceNode.productionTitle || Produ&ccedil;&atilde;o N`; `productionKey` continua `sourceNode.productionKey || production-N`.
- Quantidades: `requiredQty = Math.max(requiredQty, stockUsedQty + produceQty)` e clamps de `stockUsedQty`/`produceQty` foram mantidos.
- Duplicados: mesmo `productionKey` continua usando maximos; novo `productionKey` continua somando quantidades.
- Produto final: deteccao continua pela chave `${Number(productionIndex || 0)}:${Number(materialId)}`.
- Ciclos: quando nao ha source nodes por ciclo, o fallback existente mantem todos os niveis em `0`.
- Entradas: o teste cobre nao mutacao dos objetos de entrada; o modulo so muta acumuladores internos.

## 6. Testes

Criado `tests/planningFlowModel.test.js`, cobrindo:

- entrada vazia;
- uma producao;
- multiplas producoes;
- arvore pai/filho;
- IDs e parent IDs;
- ordem de nos, arvores e arestas;
- material/model name e precedencia de fallbacks;
- ausencia de dados;
- consolidacao de duplicados;
- nao mutacao das entradas;
- comportamento legado em ciclo.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-domain/planningFlowModel.js
node --check pages/PlanningPage.js
node --test tests/planningFlowModel.test.js
```

Resultados iniciais:

- Baseline inicial: 57/57
- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado inicial revelou e caracterizou fallback real de ciclo em uma unica coluna; expectativa ajustada sem alterar codigo produtivo.
- Teste focado final: 7/7 subtestes aprovados.
- Suite final: `node --test tests/*.js` com 64 testes, 64 aprovados e 0 falhas.
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF nos arquivos alterados.

## 8. PlanningPage antes/depois

- Antes: 6990 linhas
- Depois: 6832 linhas
- Reducao liquida ate este ponto: 158 linhas

## 9. Riscos e dividas

- `renderFlowGraph`, `renderFlowNodeCard`, `renderProductionFlows`, `drawProductionFlowConnectors`, modal de detalhes e foco permanecem na `PlanningPage.js`.
- `flowNodeStatus` e labels visuais continuam acoplados a HTML.
- `stockOnlyMaterialsFromSimulation`, toggle de estoque e escolhas de saldo ficaram fora por envolverem estoque/decisao visual.
- `resolvePlanningFlowAllocation` e `focusPlanningFlowAllocation` ficaram fora por tocarem foco Fluxo -> Gantt.
- REF-013 manual, camada visual do Flow, Calendario V2, identidade do calendario manual, manual move/split, persistencia, `generatePlanningCode`, `productiveMinutes`, turnos/capacidade seguem pendentes.

## 10. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-domain/planningFlowModel.js`
- `tests/planningFlowModel.test.js`
- `docs/refactor/REF-028_PLANNING_FLOW_MODEL_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 11. Conclusao

REF-028 conclui a extracao do modelo puro de leitura do fluxo produtivo. Nenhuma camada visual, evento, modal, foco, Gantt, Calendario V2, estoque, movimento manual, split/editor, API, persistencia, solver, reotimizacao, capacidade ou turno foi movido.
