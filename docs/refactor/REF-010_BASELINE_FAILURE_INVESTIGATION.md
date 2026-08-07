# REF-010 - Investigacao das falhas de baseline

Data: 2026-08-06
Modo: investigacao e classificacao, sem alteracao de codigo produtivo, testes ou snapshots.

## Escopo

Foram reproduzidas isoladamente as seis falhas registradas no baseline e rastreados os caminhos reais de codigo. O objetivo desta missao foi classificar causa, comportamento correto e correcao minima futura. Nenhuma correcao foi implementada.

## 1. `manualScheduleAllocationSplit.service.test.js`

Status da reproducao: reproduzido.

Comando:

```bash
node --test tests/manualScheduleAllocationSplit.service.test.js
```

Erro observado:

```text
edicao localizada mantem quantidade, linhagem e parte irma
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
30.25 !== 42.35
```

Caminho de execucao:

```text
teste
-> splitDraftAllocation(...)
-> buildManualScheduleAllocationParts(...)
-> editDraftAllocation(...)
-> applyAllocationConfigurationEdit(...)
-> recalculateWithProductivity(...)
-> nextAllocations = [...others, edited]
```

Comportamento esperado pelo teste: depois de dividir uma allocation em duas partes iguais, editar a primeira parte para outra maquina/equipe deve manter essa parte no indice `0`, com quantidade `2117.5`, capacidade recalculada `42.35`, `splitParentAllocationId = allocation-original` e a parte irma intacta no indice `1`.

Comportamento atual: a parte editada preserva `allocationId`, quantidade, componentes e linhagem, mas e removida da posicao original e reinserida no final. A ordem observada foi:

```json
{
  "split": [
    { "i": 0, "id": "local-edit:part-1", "qty": 2117.5, "cap": 30.25, "machine": "machine-1" },
    { "i": 1, "id": "local-edit:part-2", "qty": 2117.5, "cap": 30.25, "machine": "machine-1" }
  ],
  "edited": [
    { "i": 0, "id": "local-edit:part-2", "qty": 2117.5, "cap": 30.25, "machine": "machine-1" },
    { "i": 1, "id": "local-edit:part-1", "qty": 2117.5, "cap": 42.35, "machine": "machine-2" }
  ]
}
```

Classificacao: contrato ainda nao definido, com possivel defeito funcional de ordenacao. A regra canonica exige preservar identidade, quantidade fisica, componentes, rastros e residuos; a documentacao nao formaliza se a ordem fisica do array e contrato persistente. Porem o comportamento atual fragiliza UI, undo/redo e comparacoes por indice.

Causa provavel: `editDraftAllocation` calcula `others` filtrando a allocation alvo e monta `nextAllocations` com `others` antes da allocation editada. O bloco esta em alteracoes nao commitadas (`git blame` mostra `Not Committed Yet`).

Evidencias:

- `services/manualScheduleDraft.service.js`: `editDraftAllocation`, `applyAllocationConfigurationEdit`, `splitLineage`, `buildManualScheduleAllocationParts`.
- `tests/manualScheduleAllocationSplit.service.test.js`: cenario "edicao localizada".
- A funcao usa `splitOrder`, nao `splitPartOrder`; `splitPartOrder` nao apareceu como campo real do contrato atual.

Correcao minima recomendada: em missao futura, decidir explicitamente se ordem de `allocations` e contrato. Se for, substituir a allocation editada no mesmo indice ou ordenar deterministicamente por `splitRootAllocationId`/`splitOrder`/sequencia apos a edicao. O teste deve localizar tambem por `allocationId` para provar identidade, e ter uma assercao separada para ordem quando essa ordem for contrato.

Arquivos envolvidos: `services/manualScheduleDraft.service.js`, `tests/manualScheduleAllocationSplit.service.test.js`, possivelmente `CALENDAR_V2_ARCHITECTURE.md` ou documento de contrato se a ordem for formalizada.

Riscos: alterar ordem pode afetar renderizacao, persistencia de dias, comparacoes de historico e snapshots; deixar indefinido mantem baseline fragil antes da refatoracao.

Testes de confirmacao: `node --test tests/manualScheduleAllocationSplit.service.test.js`, `node --test tests/manualScheduleTransaction.service.test.js`, `node --test tests/manualScheduleHistory.service.test.js`, teste focado de save/reload de split se houver mudanca de contrato.

Decisao recomendada: tratar como correcao separada de calendario manual. Prioridade alta. Bloqueia a refatoracao ampla enquanto o contrato de ordem nao estiver definido.

## 2. `planningConstraintRecalculation.service.test.js`

Status da reproducao: reproduzido.

Comando:

```bash
node --test tests/planningConstraintRecalculation.service.test.js
```

Erro observado:

```text
Error: Producoes anteriores a hoje sao somente leitura.
at rescheduleSavedPlan (services/planning.service.js:2203:19)
```

Caminho de execucao:

```text
teste
-> recalculate(...)
-> rescheduleSavedPlan(plan, operations, change, matrixRows)
-> today = new Date().toISOString().slice(0, 10)
-> targetOperation.startDate < today || targetDate < today
-> erro 400
```

Comportamento esperado pelo teste: recalcular restricoes de capacidade em datas fixas de julho de 2026, preservando operacoes anteriores, ajustando equipe e respeitando sabado/domingo liberados.

Comportamento atual: em 2026-08-06, as fixtures `2026-07-16` a `2026-07-21` estao no passado. A protecao de passado em `rescheduleSavedPlan` bloqueia o teste antes das assercoes de capacidade.

Classificacao: teste dependente da data atual.

Causa provavel: o teste foi criado quando as datas de julho de 2026 ainda eram futuras ou presentes. O `git blame` mostra a protecao por `new Date()` em commits anteriores (`78a3315`/`0af1ea2`), e o teste atual esta como arquivo nao rastreado; a falha surgiu pela passagem do tempo em relacao a 2026-07-17.

Evidencias:

- `tests/planningConstraintRecalculation.service.test.js`: `const date = '2026-07-17'`.
- `services/planning.service.js`: `today = new Date().toISOString().slice(0, 10)` e erro "Producoes anteriores a hoje sao somente leitura."
- Timezone local da sessao: `America/Sao_Paulo`; o codigo usa ISO UTC para `today`, outro ponto a considerar em teste de borda.

Correcao minima recomendada: em missao futura, tornar o teste deterministico com relogio injetavel em `rescheduleSavedPlan` ou fixture relativa controlada. Nao remover a protecao do passado; ela e comportamento funcional correto para operacoes salvas historicas.

Arquivos envolvidos: `services/planning.service.js` se for adicionada injecao de relogio opcional; `tests/planningConstraintRecalculation.service.test.js` para fixtures deterministicas.

Riscos: trocar datas fixas sem controlar relogio apenas adia a falha; alterar a protecao do passado pode permitir mutacao indevida de producoes historicas.

Testes de confirmacao: `node --test tests/planningConstraintRecalculation.service.test.js`, mais cenario explicito garantindo que operacao antes de `today` continua recusada.

Decisao recomendada: correcao de teste/clock separada. Prioridade alta por bloquear baseline, mas nao indica defeito produtivo.

## 3. `planningManualScheduleIntegration.test.js`

Status da reproducao: reproduzido.

Comando:

```bash
node --test tests/planningManualScheduleIntegration.test.js
```

Erro observado:

```text
AssertionError [ERR_ASSERTION]: harness do movimento manual deve existir
actual: false
expected: true
```

Caminho de execucao:

```text
teste
-> readFileSync(pages/PlanningPage.js)
-> source.indexOf('productionCalendarMoveRunner = async')
-> source.indexOf('function focusCalendarCardFromFlow', runnerStart)
-> runnerEnd = -1
-> assert.ok(...) falha
```

Comportamento esperado pelo teste: encontrar um recorte textual entre `productionCalendarMoveRunner = async` e `function focusCalendarCardFromFlow`, e entao verificar que movimento manual passa por `applyManualScheduleTransaction`, nao chama `simulateCurrent`/`scheduleOperations`, e que o fluxo foca o calendario via `planningScheduleRendererHost.focusAllocation(allocation.allocationId)`.

Comportamento atual: `productionCalendarMoveRunner` existe e usa `applyManualScheduleTransaction`, mas `function focusCalendarCardFromFlow` nao existe mais. O fluxo atual abre `openFlowNodeDetailsModal` nos clicks/teclas de `.production-flow-node`.

Classificacao: teste estatico fragil e desatualizado, com divergencia funcional real pendente sobre foco Fluxo -> Gantt.

Causa provavel: o `HEAD` possuia `focusCalendarCardFromFlow`, mas ele usava seletor DOM antigo de timeline. No worktree nao commitado a funcao foi substituida por modal de detalhes do fluxo. A documentacao APS/REF-001 ainda espera foco por `allocationId` via lifecycle neutro.

Evidencias:

- `tests/planningManualScheduleIntegration.test.js`: usa `indexOf`/regex sobre `PlanningPage.js`.
- `pages/PlanningPage.js`: `productionCalendarMoveRunner` em torno de 6584; `openFlowNodeDetailsModal` em torno de 6751; listeners de fluxo chamam modal.
- `git show HEAD:pages/PlanningPage.js`: havia `focusCalendarCardFromFlow`, mas com seletor `.machine-production-card`, nao com `planningScheduleRendererHost`.
- `docs/APS_GANTT_ARCHITECTURE.md`: renderer deve expor `focusAllocation(allocationId)`.

Correcao minima recomendada: separar em duas correcoes futuras. Primeiro, trocar o teste estatico por teste comportamental ou recorte por delimitador ainda existente. Segundo, decidir se click no fluxo deve abrir detalhes, focar Gantt ou combinar ambos. Se foco for requisito, implementar uma ponte por `allocationId` usando `currentProductionCalendarSnapshot().allocations` e `planningScheduleRendererHost?.focusAllocation(...)`.

Arquivos envolvidos: `pages/PlanningPage.js`, `tests/planningManualScheduleIntegration.test.js`, possivelmente `docs/refactor/REF-001_PLANNING_PAGE_MAP.md` se a decisao mudar o contrato do fluxo.

Riscos: sem foco Fluxo -> Gantt, perde-se paridade operacional registrada para Gantt; manter teste textual como gate gera falso bloqueio em qualquer reorganizacao da pagina.

Testes de confirmacao: `node --test tests/planningManualScheduleIntegration.test.js`, teste especifico de foco por `allocationId` no controller/handler extraido em missao futura.

Decisao recomendada: tratar como missao de foco/renderer, nao como ajuste simples de regex. Prioridade alta. Bloqueia a refatoracao enquanto o contrato do fluxo nao for decidido.

## 4. `planningManualStockPartialModal.test.js`

Status da reproducao: reproduzido.

Comando:

```bash
node --test tests/planningManualStockPartialModal.test.js
```

Erro observado:

```text
AssertionError [ERR_ASSERTION]: fluxo de drag parcial nao deve reotimizar nem simular
operator: doesNotMatch
expected: /reoptimizePlanningFuture|simulateCurrent|scheduleOperations/
actual: trecho enorme iniciando em productionCalendarMoveRunner e incluindo codigo posterior
```

Caminho de execucao:

```text
teste
-> readFileSync(pages/PlanningPage.js)
-> recorta modal parcial por nomes de funcao
-> recorta runner ate 'function focusCalendarCardFromFlow'
-> delimitador final ausente
-> slice inclui codigo posterior com simulateCurrent
-> assert.doesNotMatch falha
```

Comportamento esperado pelo teste: validar que o modal de estoque parcial usa radios, quantidade inteira, recalculo de datas viaveis e que o fluxo de drag parcial nao reotimiza nem simula.

Comportamento atual: o trecho real de `productionCalendarMoveRunner` para estoque parcial chama `applyManualScheduleTransaction` com `manualMovePolicy: 'stock_only_independent'`, calcula datas por `runStockMove`, usa `openManualStockPartialMoveModal` e instala somente transacao aceita. Dentro desse runner, nao ha chamada direta a `reoptimizePlanningFuture`, `simulateCurrent` ou `scheduleOperations`. A falha vem do recorte estatico que vazou para codigo posterior.

Classificacao: teste estatico fragil.

Causa provavel: mesmo delimitador removido da falha anterior (`function focusCalendarCardFromFlow`). Os trechos funcionais de estoque parcial estao em alteracoes nao commitadas; o teste tambem e nao rastreado.

Evidencias:

- `pages/PlanningPage.js`: `openManualStockPartialMoveModal`, `renderManualStockRemainderDates`, `productionCalendarMoveRunner`.
- `services/manualScheduleTransaction.service.js`: `stockOnlyIndependentMove` encaminha para `applyIndependentDraftMove` e anexa `manualMoveStockAnalysis`.
- `tests/planningManualStockPartialModal.test.js`: depende de `source.indexOf(...)` e regex.

Correcao minima recomendada: em missao futura, trocar o recorte textual por teste de comportamento exportavel ou por helper extraido para o fluxo de estoque parcial. Se ainda houver teste estatico temporario, delimitar o runner por um marcador existente e proximo, ou por parser/estrutura menos fragil.

Arquivos envolvidos: `tests/planningManualStockPartialModal.test.js`; possivelmente `pages/PlanningPage.js` apenas se for criada fronteira testavel para o runner/modal; services de estoque nao precisam mudar pela evidencia atual.

Riscos: manter esse teste impede refatoracao segura porque ele falha por posicao/nome de funcao, nao por comportamento.

Testes de confirmacao: `node --test tests/planningManualStockPartialModal.test.js`, `node --test tests/planningStockProjectionModal.test.js`, `node --test tests/manualScheduleTransaction.service.test.js`.

Decisao recomendada: agrupar com a correcao de testes estaticos da PlanningPage, depois da decisao de foco. Prioridade media/alta. Nao bloqueia por defeito funcional, mas bloqueia baseline tecnico.

## 5. `planningScheduleRenderer.test.js`

Status da reproducao: reproduzido.

Comando:

```bash
node --test tests/planningScheduleRenderer.test.js
```

Erro observado:

```text
AssertionError [ERR_ASSERTION]: The input did not match the regular expression
/planningScheduleRendererHost\?\.focusAllocation\(allocation\.allocationId\)/
Input: ''
```

Caminho de execucao:

```text
configuracao
-> teste cria host com factories fake
-> host resolve renderer
-> host monta e valida fallback
-> teste le PlanningPage.js
-> focusStart = indexOf('function focusCalendarCardFromFlow') = -1
-> focusHandler = ''
-> regex de foco falha
```

Fluxo real do renderer:

```text
configuracao: renderProductionCalendar cria model por buildPlanningScheduleViewModel(snapshot)
-> renderer solicitado: globalThis.PLANNING_SCHEDULE_RENDERER || 'auto'
-> renderer resolvido: resolvePlanningScheduleRenderer('auto') retorna 'gantt-aps', salvo autoPolicy explicita para 'production-calendar-v2'
-> tentativa de montagem: createPlanningScheduleRendererHost.mount chama factory selecionada e renderer.mount(container, model)
-> fallback possivel: se mount/update do renderer selecionado falhar e ele nao for o fallback, safeDestroy(candidate) e mountFallback para 'production-calendar-v2'
-> resultado: uma instancia ativa; focusAllocation delega ao renderer ativo
```

Comportamento esperado pelo teste: renderer host e Gantt/V2 funcionam, `auto` e registros existem, e a PlanningPage usa `planningScheduleRendererHost?.focusAllocation(allocation.allocationId)` para foco externo do fluxo.

Comportamento atual: host e renderers existem. `auto` resolve para `gantt-aps`; fallback V2 permanece em `mount` e `update`. O acoplamento de foco na PlanningPage nao existe mais porque `focusCalendarCardFromFlow` foi removida.

Classificacao: divergencia funcional real no foco Fluxo -> Gantt, mais teste estatico fragil para detectar essa integracao.

Causa provavel: alteracao nao commitada removeu a funcao de foco e passou o click do fluxo para modal. O arquivo `shared/planning-schedule-view/planningScheduleRenderer.js` e nao rastreado no `HEAD`, entao o historico do host tambem e do worktree atual.

Evidencias:

- `shared/planning-schedule-view/planningScheduleRenderer.js`: `resolvePlanningScheduleRenderer`, `createPlanningScheduleRendererHost`, `mountFallback`, `focusAllocation`.
- `shared/planning-schedule-view/productionCalendarV2.renderer.js`: foco V2 por `.production-calendar-card[data-allocation-id]` encapsulado no renderer.
- `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`: `focusAllocation` por `data-allocation-id`.
- `pages/PlanningPage.js`: nao ha chamada a `planningScheduleRendererHost.focusAllocation`.

Correcao minima recomendada: em missao futura REF-031/REF-056, decidir e restaurar a ponte de foco por `allocationId` na orquestracao, sem seletor DOM especifico de renderer. Depois, reescrever o teste para exercitar comportamento por host/handler em vez de regex sobre `PlanningPage.js`.

Arquivos envolvidos: `pages/PlanningPage.js`, `tests/planningScheduleRenderer.test.js`, possivelmente futuro controller de schedule.

Riscos: foco externo e acessibilidade do Gantt ficam incompletos; fallback V2 pode mascarar erro visual ate a fase Gantt-only.

Testes de confirmacao: `node --test tests/planningScheduleRenderer.test.js`, `node --test tests/ganttApsRenderer.test.js`, teste de integracao de foco do fluxo quando existir fronteira testavel.

Decisao recomendada: correcao separada de lifecycle/foco do renderer. Prioridade alta. Bloqueia refatoracao da PlanningPage porque o contrato de interacao ainda diverge.

## 6. `productionCalendarDayHeader.test.js`

Status da reproducao: reproduzido.

Comando:

```bash
node --test tests/productionCalendarDayHeader.test.js
```

Erro observado:

```text
TypeError: grid.querySelector is not a function
at drawProductionTransportConnectors (shared/production-calendar/ProductionCalendarGrid.js:72:8)
```

Caminho de execucao:

```text
teste
-> cria FakeElement minimo
-> ProductionCalendarGrid(...)
-> queueProductionTransportConnectorDraw(grid, allocations)
-> requestAnimationFrame ausente
-> drawProductionTransportConnectors(grid, allocations)
-> grid.querySelector(...) nao existe no fake DOM
-> TypeError antes das assercoes de cabecalho
```

Comportamento esperado pelo teste: validar utilitarios de data/dia, cabecalho clicavel, checkbox de `manualWorkDates`, pilula de equipe, produtividade e alertas de estoque do Calendario V2.

Comportamento atual: o componente atual passou a chamar `querySelector`/`querySelectorAll` para conectores de transporte mesmo sem allocations. Em DOM real isso e esperado; no fake DOM do teste a API esta incompleta, e a falha ocorre antes do comportamento de cabecalho ser exercitado.

Classificacao: harness/mock DOM incompleto. O teste tambem cobre apresentacao legada do V2 e deve ser reavaliado quando o V2 for removido.

Causa provavel: `ProductionCalendarGrid.js` recebeu conectores de transporte e chamadas a `querySelector` em alteracoes nao commitadas. O fake DOM do teste nao acompanhou o contrato minimo de DOM usado pelo componente.

Evidencias:

- `shared/production-calendar/ProductionCalendarGrid.js`: `drawProductionTransportConnectors`, `queueProductionTransportConnectorDraw`, cabecalho do dia.
- `tests/productionCalendarDayHeader.test.js`: `FakeElement` sem `querySelector`, `querySelectorAll`, `createElementNS`, medidas e scroll.
- `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`: Gantt possui cabecalho proprio (`ganttApsDayHeaderPresentation`), portanto este teste nao valida o futuro Gantt-only.

Correcao minima recomendada: em missao futura, completar o fake DOM para o contrato atual do Grid ou isolar a renderizacao do cabecalho em helper testavel. Quando o V2 for removido, migrar somente regras neutras de dia/equipe/alerta para testes de modulo neutro ou Gantt e aposentar o teste de DOM V2.

Arquivos envolvidos: `tests/productionCalendarDayHeader.test.js`, possivelmente `shared/production-calendar/ProductionCalendarGrid.js` apenas se for criada fronteira de cabecalho; futuro modulo neutro de dia se REF-022 avancar.

Riscos: falso bloqueio por harness; tambem ha risco de manter teste de UI V2 como gate depois do Gantt-only.

Testes de confirmacao: `node --test tests/productionCalendarDayHeader.test.js`, `node --test tests/productionCalendarGrid.test.js`, `node --test tests/ganttApsRenderer.test.js` se a regra migrar para Gantt.

Decisao recomendada: correcao de harness/teste V2 separada. Prioridade media. Nao deveria bloquear extracao de dominio, mas bloqueia baseline enquanto a suite exigir verde.

## Tabela consolidada

| Teste | Classificacao | Codigo correto? | Teste correto? | Correcao futura | Arquivos provaveis | Prioridade | Bloqueia refatoracao? |
| ----- | ------------- | --------------: | -------------: | --------------- | ------------------ | ---------- | --------------------: |
| `manualScheduleAllocationSplit.service.test.js` | contrato ainda nao definido / possivel defeito funcional | PARCIAL | PARCIAL | Definir contrato de ordem e preservar posicao ou ordenar deterministicamente; ajustar teste por identidade + ordem formal | `services/manualScheduleDraft.service.js`, `tests/manualScheduleAllocationSplit.service.test.js` | Alta | SIM |
| `planningConstraintRecalculation.service.test.js` | teste dependente da data atual | SIM | NAO | Injetar relogio ou fixture relativa controlada; manter teste de bloqueio do passado | `services/planning.service.js`, `tests/planningConstraintRecalculation.service.test.js` | Alta | SIM |
| `planningManualScheduleIntegration.test.js` | teste estatico fragil + divergencia de foco | PARCIAL | NAO | Decidir foco Fluxo -> Gantt e substituir regex por teste comportamental | `pages/PlanningPage.js`, `tests/planningManualScheduleIntegration.test.js` | Alta | SIM |
| `planningManualStockPartialModal.test.js` | teste estatico fragil | SIM | NAO | Recortar por fronteira real ou extrair helper testavel para fluxo de estoque parcial | `tests/planningManualStockPartialModal.test.js`, possivel `pages/PlanningPage.js` | Media/Alta | SIM |
| `planningScheduleRenderer.test.js` | divergencia funcional de foco + teste estatico fragil | PARCIAL | PARCIAL | Restaurar/decidir ponte de foco por `allocationId`; testar via host/handler | `pages/PlanningPage.js`, `tests/planningScheduleRenderer.test.js` | Alta | SIM |
| `productionCalendarDayHeader.test.js` | harness/mock incompleto; teste V2 legado | SIM | PARCIAL | Completar fake DOM ou isolar helper de cabecalho; migrar/apagar junto ao V2 quando aprovado | `tests/productionCalendarDayHeader.test.js`, possivel `shared/production-calendar/ProductionCalendarGrid.js` | Media | PARCIAL |

## Agrupamento recomendado das correcoes

- Separar `planningConstraintRecalculation.service.test.js`: correcao temporal pequena e isolada.
- Separar `manualScheduleAllocationSplit.service.test.js`: exige decisao de contrato de ordem/identidade no calendario manual.
- Agrupar `planningManualScheduleIntegration.test.js` e `planningScheduleRenderer.test.js`: ambos dependem da decisao de foco Fluxo -> Gantt por `allocationId`.
- Agrupar parcialmente `planningManualStockPartialModal.test.js` com a limpeza de testes estaticos da PlanningPage, mas sem misturar regra de estoque.
- Separar `productionCalendarDayHeader.test.js`: e harness/legado V2, com decisao futura ligada a REF-022/REF-042.

## Gate

Gate para correcao dos testes: liberado com escopo controlado por falha, porque as seis causas estao reproduzidas e classificadas.

Gate para extracao da `PlanningPage.js`: bloqueado. A suite base segue falha e ainda ha divergencia de contrato em foco Fluxo -> Gantt e ordem de split.

## Comandos relevantes executados

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
node --test tests/manualScheduleAllocationSplit.service.test.js
node --test tests/planningConstraintRecalculation.service.test.js
node --test tests/planningManualScheduleIntegration.test.js
node --test tests/planningManualStockPartialModal.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/productionCalendarDayHeader.test.js
node -e "...split/edit inspection..."
rg -n "..." ...
git log --oneline --decorate -- ...
git blame -L ... -- ...
git show HEAD:pages/PlanningPage.js
git show HEAD:services/manualScheduleDraft.service.js
git show HEAD:services/planning.service.js
git show HEAD:shared/production-calendar/ProductionCalendarGrid.js
rg -n "^" pages\PlanningPage.js | Select-Object -Last 5
node -e "const fs=require('fs'); ..."
```

## Arquivos analisados

- `tests/manualScheduleAllocationSplit.service.test.js`
- `tests/planningConstraintRecalculation.service.test.js`
- `tests/planningManualScheduleIntegration.test.js`
- `tests/planningManualStockPartialModal.test.js`
- `tests/planningScheduleRenderer.test.js`
- `tests/productionCalendarDayHeader.test.js`
- `services/manualScheduleDraft.service.js`
- `services/manualScheduleTransaction.service.js`
- `services/planning.service.js`
- `pages/PlanningPage.js`
- `shared/planning-schedule-view/planningScheduleRenderer.js`
- `shared/planning-schedule-view/productionCalendarV2.renderer.js`
- `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`
- `shared/production-calendar/ProductionCalendarGrid.js`
- `shared/production-calendar/productionCalendar.utils.js`
- `shared/production-calendar/production-calendar.css`

## Correcoes de documentacao correlatas

`pages/PlanningPage.js` tem 7097 linhas reais no estado atual. A contagem anterior de 6721 veio de comando inadequado (`Get-Content | Measure-Object -Line`) que subcontou a entrada; `rg -n "^" ... | Select-Object -Last 5`, Node e `Get-Content -Raw` confirmaram 7097. `REF-001_PLANNING_PAGE_MAP.md` deve registrar 7097 e ajustar a ultima faixa para terminar em 7097.
