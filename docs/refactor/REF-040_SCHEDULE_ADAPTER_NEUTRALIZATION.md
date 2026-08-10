# REF-040 - Neutralizacao do adapter compartilhado de schedule

Data: 2026-08-10

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `9f44924`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 96 testes, 96 aprovados e 0 falhas

## 2. Adapter auditado

Arquivo original auditado:

```text
shared/production-calendar/productionCalendar.adapter.js
```

O arquivo continha um nucleo puro de adaptacao de resultado planejado para snapshot diario de schedule:

- nao usa DOM;
- nao usa API;
- nao usa estado visual mutavel do Calendario V2;
- nao chama scheduler, solver, persistencia ou services;
- nao muta a entrada;
- cria somente IDs readonly de fallback quando a operacao nao traz ID diario.

## 3. Gate por funcao/export

| Funcao/export | Consumidores | V2 visual? | DOM? | Estado V2? | Regra de identidade? | Compartilhada? | Decisao |
|---|---|---|---|---|---|---|---|
| `adaptPlanningResultToProductionCalendar` | `PlanningPage.js`, testes de grid/memberships/stage/batch, barrel antigo | Nao | Nao | Nao | Sim, preserva IDs existentes e cria fallback `readonly:*` | Sim | Movida para modulo neutro como `adaptPlanningResultToScheduleSnapshot`; nome antigo fica so no re-export legado |
| `buildProductionStageIndex` | teste de stage; adapter | Nao | Nao | Nao | Sim, resolve etapa por `productionId`, `operationId` e `materialId` | Sim | Movida para modulo neutro |
| `buildProductionMembershipIndex` | adapter; re-export legado | Nao | Nao | Nao | Sim, monta memberships por producao/material/etapa | Sim | Movida para modulo neutro |
| helpers privados de data, numero, maquinas, operacao, memberships e validacao | somente adapter | Nao | Nao | Nao | Parcial, usados para preservar contrato do export principal | Sim como implementacao interna | Movidos junto do nucleo por coesao interna, sem export novo |
| `productionCalendar.adapter.js` antigo | consumidores legados do pacote V2 | Compatibilidade V2 | Nao | Nao | Nao implementa regra propria | Temporario | Reduzido a re-export compatível |

## 4. Mapa de consumidores

Antes:

```text
PlanningPage.js
-> production-calendar/index.js
-> productionCalendar.adapter.js
```

```text
tests/productionCalendar*.test.js e planningDailyBatchStock
-> production-calendar/productionCalendar.adapter.js
```

Depois:

```text
PlanningPage.js
-> shared/planning-schedule/planningScheduleAdapter.js
```

```text
tests/planningDailyBatchStock.service.test.js
-> shared/planning-schedule/planningScheduleAdapter.js
```

Compatibilidade:

```text
production-calendar/index.js
-> productionCalendar.adapter.js
-> shared/planning-schedule/planningScheduleAdapter.js
```

```text
tests/productionCalendarGrid/Memberships/Stage
-> production-calendar/productionCalendar.adapter.js
-> shared/planning-schedule/planningScheduleAdapter.js
```

## 5. Mapa de identidade

| ID/campo | Origem | Formato/fallback | Consumidor | Pode mover? |
|---|---|---|---|---|
| `allocationId` | `allocationId`, `allocation_id`, `event_id`, `eventId`, `day_id`, `dayId`, `calendarDayId`, `calendar_day_id`, `id` | Se ausente: `readonly:plan-<planningId|unknown>:operation-<operationId>:date-<date>:machine-<machineId>:sequence-<sequence>` | draft inicial, Gantt/view model, V2, foco, testes | Sim, preservado byte a byte no novo modulo |
| `operationId` | `operationId`, `operation_id`, `calendarParentOperationId`, `splitParentOperationId` | `String(operationId)` | validacao, draft, transportes, stage/memberships | Sim, sem renome |
| `productionId` | `productionId`, `production_id`, `productionKey`, `production_key` | allocation recebe `''` quando ausente; indices de arvore podem usar `production-<productionIndex>` | memberships, cores, stage, detalhes | Sim, sem renome |
| `calendarParentOperationId` | `calendarParentOperationId`, `calendar_parent_operation_id`, `splitParentOperationId`, `split_parent_operation_id` | `''` quando ausente | escopos de cadeia, transporte, validacao visual | Sim, sem renome |
| `parentOperationId` | `parentOperationId`, `parent_operation_id`, `splitParentOperationId`, `split_parent_operation_id` | `''` quando ausente | view model, draft/manual, dependencias | Sim, sem renome |
| `parentAllocationId` / `splitParentId` | Nao materializados pelo adapter atual | Nao exportados; campos de entrada sao preservados apenas se outro fluxo os carregar fora deste adapter | splits manuais fora do adapter | Nao mover como regra nova; preservada a ausencia atual |
| `split order` | Nao materializado pelo adapter atual | `sequence` continua vindo de `sequence`, `productionOrder`, `calendarDayIndex`, `context.index` | ordenacao intradia via schedule view/Gantt quando existe `sequence` | Nao criar campo novo; preservada a ausencia atual |
| `memberships` | `productionBreakdown` ou propria operation + indices derivados da arvore | Ordena por `productionIndex/productionOrder` e `productionId`; agrega por `productionId + unit`; `legacy-unresolved` quando quantidade nao resolve | card V2, detalhes, transporte, draft, testes | Sim, movido integralmente |
| IDs `readonly:*` | `deterministicAllocationId` quando nao ha ID diario | Prefixo `readonly` com plan/operation/date/machine/sequence | Gantt, view model, foco readonly, testes | Sim, sem alterar formato |
| IDs derivados/fallback | `production-<productionIndex>`, chaves internas `<productionId>|operation|<operationId sem :day-N>`, `<productionId>|material|<materialId>` | Usados so para stage/membership index | adapter/stage/memberships | Sim, privados e movidos com o nucleo |
| `machineId` | maquina cadastrada por ID/nome normalizado, `machineId`, `machine_id`, `machineName`, `machine_name` | fallback por nome; normalizacao via `planningMachineOrder` da REF-039 | grid, Gantt, draft, validacao | Sim, sem alterar resultado |
| `stage` | `productionStage`, `production_stage` ou indice da arvore | inteiro positivo ou `null`; label `ETAPA N` ou `''` | cards, memberships, draft, testes | Sim, sem alterar precedencia |

## 6. Neutralizacao realizada

- Criado `shared/planning-schedule/planningScheduleAdapter.js`.
- O nucleo original foi movido mecanicamente.
- O modulo neutro exporta `adaptPlanningResultToScheduleSnapshot`, `buildProductionStageIndex` e `buildProductionMembershipIndex`.
- O nome antigo `adaptPlanningResultToProductionCalendar` existe somente no re-export legado em `shared/production-calendar/productionCalendar.adapter.js`.
- `PlanningPage.js` passou a importar o adapter pelo namespace neutro usando alias local.
- `tests/planningDailyBatchStock.service.test.js` passou a importar o adapter pelo namespace neutro.
- Testes V2 antigos continuam importando o caminho antigo para provar compatibilidade.

## 7. Contratos preservados

- IDs existentes vencem antes de fallback.
- Fallback `readonly:*` permanece exatamente no formato atual.
- `operationId`, `productionId`, `calendarParentOperationId`, `parentOperationId`, `machineId`, `sequence`, `productionStage` e `productionMemberships` mantem assinatura e valores.
- Ordem das allocations segue a ordem de entrada.
- Ordem dos memberships segue `productionIndex/productionOrder` e `productionId`.
- Entrada `undefined` retorna snapshot vazio com warning `operations.empty`.
- Entrada `null` continua lancando `TypeError`; esse comportamento foi caracterizado, nao corrigido.
- O adapter continua sem DOM, API, scheduler, persistencia, solver, CSS ou estado V2.

## 8. Validacoes

Executadas:

```text
node --check shared/production-calendar/productionCalendar.adapter.js
node --check shared/planning-schedule/planningScheduleAdapter.js
node --check pages/PlanningPage.js
node --test tests/planningScheduleAdapter.test.js
node --test tests/planningDailyBatchStock.service.test.js
node --test tests/productionCalendarMemberships.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/productionCalendarStage.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/planningScheduleRenderer.test.js
```

Resultado:

- Testes focados: zero falhas.
- Suite final: `node --test tests/*.js` com 97 testes, 97 aprovados e 0 falhas.
- `git diff --check`: sem erros; apenas avisos conhecidos de futura conversao LF -> CRLF.

## 9. Blockers V2 restantes

- REF-013 homologacao manual.
- Renderer/fallback V2.
- `ProductionCalendar`.
- Editor/split visual.
- Demais utilities V2.
- Stock-only.
- Identidade manual nao neutralizada.
- Autosave/descarte.
- `productiveMinutes`.
- `generatePlanningCode`.
- Turnos/capacidade.
