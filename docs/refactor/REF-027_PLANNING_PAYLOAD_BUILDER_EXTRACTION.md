# REF-027 - Planning payload builder extraction

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `804669b16d90fe059070644d892671e129287aa2`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 56 testes, 56 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 7016 linhas

## 2. Candidatas auditadas

| Funcao | Responsabilidade | Entradas | Saida | Dependencias | Muta? | API/save? | Regra de negocio? | Decisao |
|---|---|---|---|---|---|---|---|---|
| `normalizePlanningPayload` | Normalizar datas/codigo de um payload ja existente | `sourcePayload`, `planningCode`; antes lia `draft` e `currentSimulation` por closure | objeto payload com datas normalizadas | `operationPeriod`, `draft.planningStartDate`, `currentSimulation.operations` antes | Nao | Nao | Nao; normalizacao de contrato de payload | Extraida como `buildNormalizedPlanningPayload`, com wrapper na pagina para resolver closure |
| `productionPayload` | Montar array de producoes do payload de simulacao | `draft.productions`, `materials`; antes chamava `hydrateProductionDefaults` | array de objetos de producao | `hydrateProductionDefaults`, `findMaterialById`, `isHexColor`, `automaticProductionColor` | Sim, por `hydrateProductionDefaults` | Nao | Defaults produtivos antes da montagem | Parcial: construcao pura extraida como `buildProductionPayload`; hidratacao permaneceu na pagina |
| `payload` | Montar payload completo para `/planning/simulate` | `draft`, `materials`, shifts, setup, producoes, estoque, datas manuais | objeto payload completo | `draft`, `manualScheduleDraft`, `lastPayload`, `normalizeShiftTimes`, `parsePtBrDecimal`, `productionPayload`, `stockOnlyMaterialsForPayload` | Nao direto | Nao, mas consumidor chama API | Mistura leitura de estado e contrato de simulacao | Parcial: construcao pura extraida como `buildPlanningSimulationPayload`; wrapper permanece na pagina |
| `stockOnlyMaterialsForPayload` | Remover produtos finais da lista de materiais marcados como estoque | `draft.stockOnlyMaterials`, `draft.productions` | array filtrado com referencias originais | `stockOnlyKey` | Nao | Nao | Baixa; preserva filtro historico de payload | Extraida como `buildStockOnlyMaterialsForPayload` |
| mapa de turnos dentro de `payload` | Projetar shifts normalizados para contrato da simulacao | shifts ja normalizados, callback de equipe default | array de shifts do payload | `defaultTeamAvailableForShift` antes | Nao | Nao | Nao; construcao de contrato | Extraida como `buildShiftPayload`; `normalizeShiftTimes` continua pendente |
| `simulatePlanningRequest` | Enviar payload para API de simulacao | body | resultado da API | `api`, `AbortController`, `window.setTimeout` | Nao | Sim | Nao | Rejeitada; API/orquestracao |
| `saveDraftNow` / `queueAutosave` | Persistir draft local/autosave | closure | `undefined` | `localStorage`, timers, draft/currentSimulation | Sim | Save local | Persistencia local | Rejeitada |
| `simulateCurrent` | Orquestrar validacao, payload, API, falta de estoque, baseline e render | closure | simulation ou null | `payload`, `simulatePlanningRequest`, shortage decisions, draft/manual draft | Sim | Sim | Sim | Rejeitada |
| `launchPlanning` e save de plano | Persistir plano/manual draft no backend | closure/body | resultado de rota | `api('/planning/plans')`, revision, manual draft | Sim | Sim | Persistencia | Rejeitada |

## 3. Fronteira encontrada

A fronteira segura foi a construcao pura dos objetos ja resolvidos: producoes do payload, shifts do payload, filtro de estoque para payload, payload completo a partir de entradas explicitas e normalizacao final de datas/codigo.

Ficaram na `PlanningPage.js` todas as responsabilidades que leem estado mutavel da pagina, hidratam defaults, escolhem datas vindas do draft manual, chamam API, salvam, disparam simulacao ou interagem com persistencia. A pagina agora atua como wrapper/orquestradora: resolve closure e passa parametros explicitos ao modulo.

## 4. Funcoes rejeitadas

Foram rejeitadas as funcoes que misturam construcao com API/save/persistencia (`simulatePlanningRequest`, `saveDraftNow`, `queueAutosave`, `simulateCurrent`, `launchPlanning`), as que executam defaults produtivos (`hydrateProductionDefaults`) e as fronteiras de manual move, split/editor, transporte, estoque, solver, reotimizacao, Gantt, Calendario V2, renderer/fallback, `generatePlanningCode`, `productiveMinutes`, turnos/capacidade e persistencia propriamente dita.

## 5. Extracao realizada

Criado `shared/planning-domain/planningPayloadBuilder.js`, sem `index.js`.

Funcoes extraidas:

- `buildProductionPayload`
- `buildStockOnlyMaterialsForPayload`
- `buildShiftPayload`
- `buildPlanningSimulationPayload`
- `buildNormalizedPlanningPayload`

`pages/PlanningPage.js` passou a importar essas funcoes. Os wrappers `productionPayload`, `payload`, `stockOnlyMaterialsForPayload` e `normalizePlanningPayload` foram mantidos na pagina para preservar nomes, consumidores e resolucao de estado.

## 6. Contratos preservados

- Nomes e ordem dos campos dos objetos de payload foram preservados.
- Coercoes foram preservadas: `Number(...)`, `String(...).trim() || '8,48'`, `desiredDate || null`, `planningCode || null`.
- `materialCode` continua usando `material?.codes?.[0] || ''`.
- `plannedUnit` continua usando `material?.primary_unit || 'un'`.
- `transports` continua sempre `[]` em cada producao do payload.
- Arrays e objetos de `draft` continuam por referencia quando o contrato antigo assim fazia: `stockOnlyMaterialChoices`, `skipProductionMaterials`, `operationOverrides`, `operationSplits`, `dailyTeamOverrides`, `manualWorkDates`, `productions` e `stockOnlyMaterials`.
- `stockOnlyMaterials` continua filtrando produtos finais por `${Number(productionIndex || 0)}:${Number(materialId)}` e preservando referencias dos itens mantidos.
- `hydrateProductionDefaults` continua sendo chamado na `PlanningPage.js` antes de construir cada producao do payload.
- `normalizePlanningPayload` continua usando a mesma precedencia de datas: `planningStartDate || startDate || selectedDate || draft.planningStartDate`; `planningEndDate` continua vindo de `operationPeriod(...).endDate`.

## 7. Testes

Criado `tests/planningPayloadBuilder.test.js`, cobrindo entrada minima, entrada completa, null/undefined, IDs, arrays, campos opcionais, nao mutacao das entradas, identidade referencial preservada e shape exato do payload.

## 8. Validacoes

Executadas:

```text
git status --short
git rev-parse HEAD
node --test tests/*.js
git branch --show-current
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --check shared/planning-domain/planningPayloadBuilder.js
node --check pages/PlanningPage.js
node --test tests/planningPayloadBuilder.test.js
node --test tests/*.js
git diff --check
```

Resultados:

- Baseline inicial: 56/56
- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado: 1/1
- Suite final: 57 testes, 57 aprovados e 0 falhas
- `git diff --check`: OK

## 9. PlanningPage antes/depois

- Antes: 7016 linhas
- Depois: 6990 linhas
- Reducao liquida: 26 linhas

## 10. Riscos e dividas

- `productionPayload` ainda permanece como wrapper porque `hydrateProductionDefaults` muta producoes e aplica defaults produtivos.
- `payload` ainda permanece como wrapper porque resolve `draft`, `manualScheduleDraft`, `lastPayload`, shifts normalizados e setup.
- `normalizeShiftTimes`, `defaultShift`, `productiveMinutes`, turnos/capacidade e `generatePlanningCode` seguem fora do escopo.
- Persistencia, save/API, revision/hash, manual move, split/editor, transporte, estoque, solver, reotimizacao, Gantt e Calendario V2 nao foram alterados.
- REF-013 homologacao manual permanece pendente.

## 11. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-domain/planningPayloadBuilder.js`
- `tests/planningPayloadBuilder.test.js`
- `docs/refactor/REF-027_PLANNING_PAYLOAD_BUILDER_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 12. Conclusao

REF-027 concluida com extracao parcial e segura. A construcao pura de payload foi separada da orquestracao de API/save/persistencia, e as funcoes misturadas permaneceram na `PlanningPage.js` como wrappers.
