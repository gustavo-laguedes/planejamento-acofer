# REF-026 - Planning schedule snapshot extraction

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `5923c5e`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 55 testes, 55 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 7099 linhas

## 2. Candidatas auditadas

| Funcao | Responsabilidade | Entradas | Saida | Consumidores | Dependencias | Muta? | Regra de negocio? | Decisao |
|---|---|---|---|---|---|---|---|---|
| `timelineOperations` | Combinar bloqueios existentes e operacoes atuais para timeline legado | `result` | array novo com bloqueios clonados e operacoes atuais por referencia | `CalendarTimeline` em `renderProductionCalendar` e `refreshTimelineOnly` | `result.summary.existingOperations`, `result.calendarOperations`, `result.operations` | Nao; clona apenas bloqueios decorados | Nao; snapshot de leitura legado | Extraida como `buildTimelineOperations` |
| `productionCalendarMachines` | Escolher a primeira fonte disponivel de maquinas, com prioridade para cadastradas | `result`, `registeredMachines` | array original escolhido ou `[]` | draft limpo, validacao, otimizacao, snapshot calendario | `registeredMachines` closure antes; fontes em `result` | Nao | Baixa; fallback de leitura para apresentacao | Extraida como `selectProductionCalendarMachines` com `registeredMachines` parametrizado |
| `productionCalendarPlanningId` | Resolver ID/codigo do planejamento por ordem de fallback | `result`, `draft.planningCode`, `lastPayload.planningCode` | valor encontrado ou `null` | draft limpo, save/reopen, snapshot calendario | `draft`, `lastPayload` antes | Nao | Identidade de leitura/persistencia; sem gerar ID novo | Extraida como `resolveProductionCalendarPlanningId` com fallbacks parametrizados |
| `daysWithDraftAllocations` | Mesclar dias adaptados com datas presentes em allocations manuais | `days`, `allocations`, validadores/formatador | array novo ordenado por data | `buildProductionCalendarSnapshot` | `isValidDateOnly`, `formatDateOnly` | Nao; preserva referencias dos dias existentes | Calendario manual de apresentacao; sem reposicionar allocations | Extraida como `mergeDraftAllocationDays` com dependencias parametrizadas |
| `manualScheduleIssueMessages` | Resolver mensagens apresentadas a partir de issue IDs | `issueIds`, `presentation` | array de strings | snapshot de validacao | nenhuma externa | Nao | Nao; leitura de apresentacao ja calculada | Extraida como `buildManualScheduleIssueMessages` |
| `buildProductionCalendarValidationSnapshot` | Decorar allocations/days com diagnosticos da validacao manual | `validation`, `allocations`, `days`, `validationVersion`, `presentValidation` | snapshot parcial `{ allocations, days, validation }` ou `null` | `buildProductionCalendarSnapshot`, teste de integracao manual | `MANUAL_SCHEDULE_VALIDATION_VERSION`, `presentManualScheduleValidation` antes | Nao; cria clones decorados | Diagnostico/apresentacao de validacao; nao decide nem reposiciona | Extraida com dependencias parametrizadas; wrapper exportado mantido na pagina |
| `buildProductionCalendarSnapshot` | Construir snapshot completo para Gantt/V2 | `result`, `options`, closures de pagina | snapshot completo | `renderProductionCalendar`, save, stock modal, movimento manual | adapter V2, draft manual, validacao, recursos, feriados, estado visual, estoque, permissoes, historico, log | Nao muta dados principais, mas chama log e le muito estado externo | Mistura apresentacao, permissoes, validacao, recursos e estado visual | Rejeitada; permaneceu na pagina |
| `currentProductionCalendarSnapshot` | Ler `currentSimulation` e chamar o construtor completo | closure da pagina | snapshot completo | fluxo, movimento, estoque, save | `currentSimulation`, `currentPlanningStockAlerts` | Nao | Orquestracao de estado atual | Rejeitada; closure |
| `currentManualScheduleValidationContext` | Montar contexto canonico de validacao manual | snapshot, options e closures | contexto de validacao | transacoes manuais e save | simulation, materials, matrix, stock, shifts, draft, manual draft | Nao direto | Sim; contexto produtivo de validacao | Rejeitada; fora do escopo |
| `withManualTransportPresentation` | Decorar allocation com transporte manual | allocations | allocations decoradas | snapshot calendario e fluxo de transporte | `manualTransportForAllocation` | Nao; clona apenas com transporte | Transporte manual fora do escopo | Rejeitada |
| `findProductionCalendarMachine` | Buscar maquina por ID dentro do snapshot | snapshot, machineId | maquina original ou `null` | validacao de movimento | nenhuma | Nao | Movimento manual | Rejeitada; controlador manual |
| `validateProductionCalendarMoveIntent` | Validar intencao de movimento contra snapshot | intent, snapshot | move validado ou erro | runner de movimento | calendario manual, parent allocation, maquina | Nao direto | Sim; movimento manual | Rejeitada |

## 3. Fronteira encontrada

A fronteira segura foi limitada a helpers de leitura/derivacao que constroem ou decoram estruturas para consulta/apresentacao, sem acessar DOM, API, solver, persistencia ou mutar draft/allocations. Dependencias que antes vinham da closure foram transformadas em parametros.

O construtor completo `buildProductionCalendarSnapshot` nao foi movido porque ainda mistura leitura com estado visual, permissoes, historico, estoque/alertas, recursos, feriados, transporte, adapter V2 e `logProductionCalendarAdapterErrors`.

## 4. Extracao realizada

Criado `shared/planning-domain/planningScheduleSnapshot.js`, sem `index.js`.

Funcoes extraidas:

- `buildTimelineOperations`
- `selectProductionCalendarMachines`
- `resolveProductionCalendarPlanningId`
- `mergeDraftAllocationDays`
- `buildManualScheduleIssueMessages`
- `buildProductionCalendarValidationSnapshot`

`pages/PlanningPage.js` passou a importar essas funcoes. A pagina manteve wrappers finos para preservar os consumidores existentes e encaixar dependencias de closure.

## 5. Contratos preservados

- Ordem: bloqueios existentes continuam antes das operacoes atuais; dias mesclados continuam ordenados por `String(date).localeCompare`.
- IDs: nenhum ID foi criado, alterado ou normalizado de forma nova.
- Null/undefined: `resolveProductionCalendarPlanningId` continua retornando `null` quando nenhum fallback existe; snapshot de validacao continua retornando `null` para validacao ausente ou versao incompativel.
- Referencias/clones: operacoes atuais e maquinas continuam por referencia; bloqueios existentes continuam clonados com `_existingScheduleBlocker`; dias existentes continuam por referencia; allocations/days de validacao continuam clonados/decorados.
- Campos opcionais/defaults: `weekday: ''`, `dependencyState: 'ok'`, `stockState: 'unknown'`, `teamPeak/teamAvailable: null` preservados.
- Filtros: datas invalidas de allocations continuam ignoradas em `mergeDraftAllocationDays`.
- Sem mutacao: entradas testadas permanecem inalteradas.

## 6. Testes

Criado `tests/planningScheduleSnapshot.test.js`, cobrindo:

- entrada vazia;
- multiplos registros;
- IDs e fallbacks;
- ordem de operacoes/dias;
- campos opcionais/defaults;
- nao mutacao da entrada;
- identidade/clonagem conforme contrato existente.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-domain/planningScheduleSnapshot.js
node --check pages/PlanningPage.js
node --test tests/planningScheduleSnapshot.test.js
```

Resultados antes da validacao final:

- Baseline inicial: 55/55
- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado: 1/1

Resultados finais:

- `node --test tests/*.js`: 56 testes, 56 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF nos arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 7099 linhas
- Depois: 7016 linhas
- Reducao liquida: 83 linhas

## 9. Riscos e dividas

- `buildProductionCalendarSnapshot` segue na `PlanningPage.js` por acoplamento com estado visual, permissoes, recursos, estoque, transporte, historico e adapter V2.
- `currentManualScheduleValidationContext` segue na pagina por envolver contexto canonico produtivo de validacao.
- Transporte manual, movimento, split/editor, reotimizacao, estoque, Gantt, Calendario V2, `generatePlanningCode`, `productiveMinutes` e turnos permaneceram fora do escopo.
- O wrapper exportado `buildProductionCalendarValidationSnapshot` foi mantido temporariamente para compatibilidade com testes/consumidores que importam de `PlanningPage.js`.

## 10. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-domain/planningScheduleSnapshot.js`
- `tests/planningScheduleSnapshot.test.js`
- `docs/refactor/REF-026_PLANNING_SCHEDULE_SNAPSHOT_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 11. Conclusao

REF-026 executada com extracao parcial e segura do bloco coeso de snapshot/leitura. Nenhuma funcao de API, DOM, solver, reotimizacao, persistencia, estoque, transporte, movimento, split/editor, capacidade, Gantt ou Calendario V2 foi movida.
