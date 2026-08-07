# REF-030 - Planning flow DOM/SVG extraction

Data: 2026-08-07

## 1. Baseline

- Branch esperada: `rebuild-production-calendar`
- HEAD esperado/inicial: `0cb5a186354a2e2faebbe987b87cb1e8235872fe`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 68 testes, 68 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6756 linhas

## 2. Auditoria de candidatas

| Funcao | DOM | SVG | Eventos | Estado externo | Gantt | Muta draft | Decisao |
|---|---|---|---|---|---|---|---|
| `renderProductionFlows` | Nao direto; retorna HTML/string | Nao | Nao | Le `draft.productions`, tema, formatadores e wrapper local `renderFlowGraph` | Nao | Nao | Mantida na `PlanningPage.js`; ainda e adapter de estado da pagina para HTML ja extraido |
| `drawProductionFlowConnectors` | Sim, consulta `[data-flow-graph]`, `.production-flow-svg`, `[data-flow-edges]` e `[data-flow-node-key]` | Sim, atualiza `viewBox`, `<defs>`, `<marker>` e `<path>` | Nao | Antes capturava `page` e `productionTheme`; agora recebe `root` e `productionTheme` explicitamente | Nao | Nao | Extraida para `planningFlowDom.js` |
| Pontos `flowsTarget.innerHTML + requestAnimationFrame` | Sim, escreve HTML no container do Flow | Indireto por agendamento dos conectores | Nao | Antes capturavam `target`, `page`, `requestAnimationFrame`, `productionTheme` | Nao | Nao | Extraidos como `renderProductionFlowDom` |
| Agendamento em modais/detalhes | DOM ja renderizado | Indireto por recalculo SVG apos layout | Nao | Antes chamava `requestAnimationFrame(drawProductionFlowConnectors)` e `setTimeout(drawProductionFlowConnectors, 80)` | Nao | Nao | Extraido parcialmente como `scheduleProductionFlowConnectors`; `setTimeout` permanece na pagina |
| `renderPlanFlowDetail` | Nao direto; retorna HTML de detalhe | Nao | Nao | `planTreeRoots`, wrapper `renderFlowGraph` | Nao | Nao | Mantida por fronteira explicita da REF-030 |
| `resolvePlanningFlowAllocation` | Nao | Nao | Nao | Dados de allocation/datasets | Sim, resolve foco | Nao | Mantida por fronteira explicita |
| `focusPlanningFlowAllocation` | Nao direto | Nao | Sim, chama renderer host | `planningScheduleRendererHost.focusAllocation` | Sim | Nao | Mantida por fronteira explicita |

## 3. Fronteira encontrada

A fronteira segura foi a camada DOM/SVG do Flow ja renderizado:

- receber `root`/`container` explicitamente;
- inserir HTML ja produzido pela view;
- buscar somente elementos internos do Flow;
- recalcular `viewBox`, marcadores e paths SVG;
- agendar redesenho via `requestAnimationFrame` injetado.

Ficaram fora eventos click/keyboard, abertura de modal, `renderPlanFlowDetail`, resolucao/foco Flow -> Gantt, estoque/toggle operacional, movimento, split, API, persistencia, solver, reotimizacao, Calendario V2, turnos e capacidade.

## 4. Extracao realizada

Criado `shared/planning-presentation/planningFlowDom.js`, sem `index.js`.

Funcoes exportadas:

- `drawProductionFlowConnectors`
- `scheduleProductionFlowConnectors`
- `renderProductionFlowDom`

`pages/PlanningPage.js` passou a importar essas funcoes. A pagina continua dona de `renderProductionFlows`, do wrapper `renderFlowGraph`, dos eventos, dos modais e da ponte Flow -> Gantt.

## 5. Contratos DOM/SVG preservados

- Seletores preservados: `[data-flow-graph]`, `.production-flow-svg`, `[data-flow-edges]`, `[data-flow-node-key]`.
- `viewBox` preservado com `Math.max(rect.width, 1)` e `Math.max(rect.height, 1)`.
- `data-flow-production-indexes` continua governando a ancora vertical por slot de producao.
- Paths preservam classe `production-flow-connector`, `style="--flow-color: ..."`, `marker-end` e coordenadas `M ... H ... V ... H ...`.
- Marcadores preservam IDs `production-flow-arrow-<hex>`, classe `production-flow-arrow`, `viewBox`, `refX`, `refY`, `markerWidth`, `markerHeight` e `orient`.
- JSON invalido ou edges sem nos continuam sem quebrar o render; SVG e limpo pelo novo `innerHTML`.
- Re-render continua substituindo o HTML do container e recalculando conectores.
- O modulo nao registra eventos, nao chama foco Gantt e nao acessa `manualScheduleDraft`.

## 6. Testes

Criado `tests/planningFlowDom.test.js`, cobrindo:

- container ausente;
- render simples com insercao de HTML;
- multiplos fluxos;
- criacao de conectores, markers, viewBox, paths e cores;
- re-render/limpeza de SVG antigo;
- fallback sem `requestAnimationFrame`;
- ausencia de evento/foco Gantt executado pelo modulo.

## 7. Validacoes

Executadas:

```text
node --check shared/planning-presentation/planningFlowDom.js
node --check pages/PlanningPage.js
node --test tests/planningFlowDom.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningFlowDom`: 5/5 subtestes aprovados
- Teste afetado `productionDisplayColor`: aprovado apos realinhar a guarda estatica para o novo modulo
- Suite ampla final: 73 testes, 73 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF em arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 6756 linhas
- Depois: 6713 linhas
- Reducao liquida: 43 linhas

## 9. Riscos e dividas

- `renderProductionFlows` continua na pagina por depender de `draft.productions` e legenda.
- Eventos click/keyboard e modal do Flow continuam acoplados a `PlanningPage.js`.
- Foco Flow -> Gantt continua na pagina por contrato operacional da REF-013.
- `setTimeout(..., 80)` segue na pagina para o segundo redesenho apos modal.
- REF-013 homologacao manual, Calendario V2, identidade do calendario manual, manual move/split, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
