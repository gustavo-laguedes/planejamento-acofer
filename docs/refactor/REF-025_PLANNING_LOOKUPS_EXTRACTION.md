# REF-025 - Planning lookups extraction

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `aae0dfbe8ccd7903fa41704f63ac65476a11729b`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 54 testes, 54 aprovados e 0 falhas
- Commit-base oficial: `aae0dfb`
- Contagem inicial no commit-base: 7137 linhas
- Contagem inicial no worktree: 7137 linhas

## 2. Metodo de descoberta

Foram usados o mapa REF-001, buscas por declaracoes, `.find`, `.filter`, `.map` e IDs relevantes (`allocationId`, `operationId`, `productionId`, `materialId`, `machineId`, `parentOperationId`, `calendarParentOperationId`, `splitParentOperationId`). A auditoria inspecionou o bloco indicado como `planningLookups` e selectors espalhados em fluxo, calendario, estoque, historico e detalhes.

`generatePlanningCode` e `productiveMinutes` foram apenas confirmados como fora do escopo e nao foram auditados para extracao.

## 3. Tabela de candidatas

| Funcao | Linha | Responsabilidade | Entradas | Saida | Consumidores | Dependencias | Muta? | DOM? | Estado externo? | Regra de negocio? | Classificacao | Candidata? |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| `materialById` | 1447 antes | Localizar material por `id` com coercao `String` | `materials`, `id` | objeto original ou `undefined` | payload, validacao, render, sugestoes, PCP | `materials` closure | Nao | Nao | Sim, closure | Nao | LOOKUP PURO | Sim, extraida como `findMaterialById` |
| `matchingMatrix` | 1451 antes | Selecionar linhas ativas da matriz por nome/codigo e ordenar | `matrix`, `material` | array novo com linhas originais | defaults, render producao, detalhes | `matrix`, `matrixPriority`, `matrixSecondsPerUnit` | Nao | Nao | Sim, closure | Baixa; selecao/ordem existente da matriz | SELECTOR DERIVADO | Sim, extraida como `selectMatchingMatrixRows` |
| `productionMaterialOptions` | 1487 antes | Resolver arvore simples de materiais vinculados ao modelo de producao | `materials`, `production` | array de materiais originais | limpeza de estado por producao removida | `materials`, `productionModelsFor`, `materialById` | Nao | Nao | Sim, closure | Baixa; leitura de modelo existente | SELECTOR DERIVADO | Sim, extraida como `selectProductionMaterialOptions` |
| `materialMatches` | 1890 antes | Predicate de busca textual por nome/codigos | `material`, `searchValue` | boolean | sugestoes de material | nenhuma externa | Nao | Nao | Nao | Nao | LOOKUP PURO | Sim, extraida como `materialMatchesSearch` |
| `loadLookups` | 1468 depois | Carregar cadastros por API | nenhum direto | Promise | inicializacao/render | `api`, `materials`, `matrix`, `locations`, `registeredMachines` | Sim | Nao | Sim | Nao | ORQUESTRACAO | Nao |
| `hydrateProductionDefaults` | 1453 depois | Preencher material/modelo/maquina/pessoas defaults | `production` | `undefined` | payload/render | `materials`, `matrix`, helpers de matriz | Sim | Nao | Sim | Sim, default produtivo | MUTADORA | Nao |
| `locationOptions` | 1478 depois | Montar HTML de options de locais | `selectedId` | string HTML | formulario | `locations`, `escapeHtml` | Nao | Sim/HTML | Sim | Nao | UI/DOM | Nao |
| `productionPayload` | 1484 depois | Montar payload produtivo | nenhum direto | array de producoes | `payload` | `draft`, lookups, defaults | Sim indiretamente via defaults | Nao | Sim | Sim | ORQUESTRACAO | Nao |
| `payload` | 1503 depois | Montar payload completo de simulacao | nenhum direto | objeto payload | simulacao/save | `draft`, `manualScheduleDraft`, `lastPayload` | Nao direto | Nao | Sim | Sim | ORQUESTRACAO | Nao |
| `findSimulationOperation` | 1664 | Localizar operacao da simulacao por IDs/fallback material/producao | `detail` | operacao original ou `null` | drop legado | `currentSimulation` | Nao | Nao | Sim | Sim, fallback legado de operacao | SELECTOR DERIVADO | Nao, acoplada a drop legado e estado |
| `treeForProductionIndex` | 1678 | Selecionar raiz de arvore por producao | `tree`, `productionIndex` | no original ou `null` | estoque inicial | `isPlanningRootName` | Nao | Nao | Nao | Sim, arvore produtiva | SELECTOR DERIVADO | Nao, perto de estoque/arvore |
| `matchingDropOption` | 1701 | Escolher opcao de maquina/pessoas para drop | `operation`, `machineName` | opcao original ou `null` | drop legado | produtividade da operacao | Nao | Nao | Nao | Sim, escolha de maquina | REGRA DE NEGOCIO | Nao |
| `productionCalendarParentOperationId` | 1717 | Normalizar parent operation de allocation | `allocation` | string | calendario, transporte, split/move | `stripDailyOperationSuffix` | Nao | Nao | Nao | Identidade manual sensivel | NORMALIZACAO AUXILIAR | Nao, alto risco de IDs |
| `productionCalendarAllocationsForParent` | 1726 | Filtrar allocations por parent | `snapshot`, `parentOperationId` | array novo de allocations originais | movimento/capacidade | `productionCalendarParentOperationId` | Nao | Nao | Nao | Identidade manual sensivel | SELECTOR DERIVADO | Nao, alto risco de calendario manual |
| `productionCalendarAllocationLabel` | 1733 | Escolher primeiro texto de label | `allocation` | string | modal de substituicao | campos visuais | Nao | Nao | Nao | Nao | SELECTOR DERIVADO | Nao, apresentacao/modal |
| `stockOnlyChecked` | 2444 | Verificar escolha de estoque por producao/material | `productionIndex`, `materialId` | boolean | fluxo e UI de estoque | `draft.stockOnlyMaterials` | Nao | Nao | Sim | Sim, estoque visual/manual | SELECTOR DERIVADO | Nao |
| `stockOnlyChoice` | 2451 | Buscar escolha de estoque por producao/material | `productionIndex`, `materialId` | escolha original ou `null` | fluxo e estoque | `draft.stockOnlyMaterialChoices` | Nao | Nao | Sim | Sim, estoque | LOOKUP PURO | Nao, acoplada a estado de draft/estoque |
| `productionFlowTrees` | 2480 | Selecionar raizes do fluxo | `result` | array de nos originais | fluxo/estoque | `isPlanningRootName` | Nao | Nao | Nao | Arvore produtiva | SELECTOR DERIVADO | Nao, fronteira de fluxo |
| `flowNodeModelName` | 2524 | Resolver modelo por precedencia de node/override/root | `node` | string | card de fluxo | `draft.operationOverrides`, `draft.productions` | Nao | Nao | Sim | Sim, precedencia | REGRA DE NEGOCIO | Nao |
| `timelineOperations` | 2925 | Combinar operacoes atuais e bloqueios existentes | `result` | array novo com clones de existentes | timeline legado | `summary.existingOperations` | Cria clones de existing | Nao | Nao | Regra visual/legado | SELECTOR DERIVADO | Nao |
| `productionCalendarMachines` | 2938 | Escolher fonte de maquinas do calendario | `result` | array original | snapshots/calendario | `registeredMachines` | Nao | Nao | Sim | Fallback operacional | SELECTOR DERIVADO | Nao, closure e fallback calendario |
| `productionCalendarPlanningId` | 2949 | Resolver ID do planejamento por fallback | `result` | valor ou `null` | save/snapshot | `draft`, `lastPayload` | Nao | Nao | Sim | Persistencia/identidade | NORMALIZACAO AUXILIAR | Nao |
| `daysWithDraftAllocations` | 4499 | Mesclar dias e datas de allocations | `days`, `allocations` | array novo | snapshot calendario | `isValidDateOnly`, `formatDateOnly` | Nao | Nao | Nao | Calendario manual | SELECTOR DERIVADO | Nao |
| `planTreeRoots` | 5161 | Selecionar raizes de arvore salva | `tree` | array de nos originais | detalhes historico | `isPlanningRootName` | Nao | Nao | Nao | Arvore produtiva | SELECTOR DERIVADO | Nao |
| `productionRowsFromTree` | 5166 | Projetar linhas de producao da arvore | `tree` | DTOs novos | detalhe de plano | `planTreeRoots` | Nao | Nao | Nao | Apresentacao de historico | OUTRO | Nao |
| `operationsForDetail` | 5179 | Projetar operacoes de detalhe com sequencia/labels | `detail` | DTOs novos | detalhe de plano | `normalizeJsonArray`, formatters | Nao | Nao | Nao | Apresentacao de historico | OUTRO | Nao |

## 4. Fronteira encontrada

A fronteira limpa encontrada foi o bloco material/matriz/modelos: localizar material, selecionar linhas compatveis da matriz, derivar materiais vinculados ao modelo selecionado e comparar material contra texto de busca. As dependencias de colecao foram transformadas em parametros (`materials`, `matrix`, `production`, `material`, `searchValue`), e a ordenacao de matriz recebeu `matrixPriority` e `matrixSecondsPerUnit` como callbacks para preservar a semantica da pagina.

## 5. Funcoes rejeitadas

Foram rejeitadas funcoes que tocam API, payload, mutacao de `draft`, defaults produtivos, DOM/HTML, drop legado, calendario manual, transporte, estoque, arvore produtiva, persistencia/identidade de planejamento ou precedencia de overrides. Em especial, `productionCalendarParentOperationId` e `productionCalendarAllocationsForParent` parecem selectors, mas manipulam IDs sensiveis de calendario manual e ficaram fora.

## 6. Extracao realizada

Criado `shared/planning-domain/planningLookups.js`, sem imports. Funcoes extraidas:

- `findMaterialById`
- `selectMatchingMatrixRows`
- `selectProductionMaterialOptions`
- `materialMatchesSearch`

`pages/PlanningPage.js` passou a importar essas funcoes e a passar `materials`, `matrix`, `matrixPriority` e `matrixSecondsPerUnit` explicitamente.

## 7. Contratos preservados

- IDs: `findMaterialById` preserva `String(material.id) === String(id)`, incluindo numero/string e o caso estranho de `undefined` casar com material sem `id`.
- Duplicados: `findMaterialById` preserva primeiro match; `selectMatchingMatrixRows` preserva ordem por sort de prioridade/duracao apos filtros; `selectProductionMaterialOptions` preserva ordem de visita e primeiro match de material.
- Nao encontrado: `findMaterialById` retorna `undefined`; `selectProductionMaterialOptions` retorna `[]`; `selectMatchingMatrixRows` retorna `[]` quando nao ha match; `materialMatchesSearch` retorna `false`.
- Colecao ausente: chamadas que antes quebrariam por `.find`/`.filter` continuam quebrando com `TypeError`.
- Identidade referencial: nenhuma funcao clona entidade retornada. Materiais e linhas de matriz retornados sao as mesmas referencias de entrada.
- Coercoes: `String` foi preservado nos IDs de material e codigos; a busca textual continua assumindo `searchValue` ja normalizado/minusculo pelo consumidor.

## 8. Testes

Criado `tests/planningLookups.test.js`, cobrindo:

- match encontrado, nao encontrado, array vazio e colecao ausente;
- string vs numero;
- IDs duplicados e primeiro match;
- objeto sem `id` com busca por `undefined`;
- ordenacao de matriz por prioridade/duracao e callbacks explicitos;
- linhas inativas e material/codigo;
- materiais vinculados por modelo, modelo alternativo, ciclo e identidade referencial;
- busca textual por nome/codigo, `null`, `undefined` e campos ausentes.

Nenhum teste existente foi alterado.

## 9. Validacoes

Suite focada:

```text
node --check shared/planning-domain/planningLookups.js
OK
node --check pages/PlanningPage.js
OK
node --test tests/planningLookups.test.js
tests: 1
pass: 1
fail: 0
```

Suite completa:

```text
node --test tests/*.js
tests: 55
pass: 55
fail: 0
```

## 10. PlanningPage antes/depois

- Antes: 7137 linhas
- Depois: 7099 linhas
- Reducao liquida: 38 linhas

## 11. diff --stat

Resultado final de `git diff --stat` para arquivos rastreados:

```text
PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md |  4 +-
pages/PlanningPage.js                              | 82 ++++++----------------
2 files changed, 25 insertions(+), 61 deletions(-)
```

Como nao houve `git add`, o `git diff --stat` nativo nao contabiliza arquivos novos nao rastreados. Arquivos novos desta missao:

- `shared/planning-domain/planningLookups.js`
- `tests/planningLookups.test.js`
- `docs/refactor/REF-025_PLANNING_LOOKUPS_EXTRACTION.md`

## 12. Riscos e dividas

- `selectMatchingMatrixRows` ainda representa uma selecao de matriz com criterio produtivo historico; a ordenacao ficou parametrizada para nao mover `matrixPriority` e `matrixSecondsPerUnit`.
- Selectors de calendario/manual/estoque continuam na `PlanningPage.js` por risco de IDs, draft e regras produtivas.
- `productiveMinutes`, `generatePlanningCode`, helpers de turno, REF-013 manual e Calendario V2 seguem pendentes.

## 13. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-domain/planningLookups.js`
- `tests/planningLookups.test.js`
- `docs/refactor/REF-025_PLANNING_LOOKUPS_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 14. Conclusao

REF-025 concluida com extracao parcial e segura. O bloco real extraido foi limitado a lookups/selectors de material, matriz e busca textual. Nenhuma regra de movimento manual, estoque, capacidade, split, reotimizacao, persistencia, Gantt ou Calendario V2 foi movida.
