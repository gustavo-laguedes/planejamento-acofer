# REF-039 - Neutralizacao de helpers de maquina usados pelo Gantt

Data: 2026-08-10

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `2b345c0`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 95 testes, 95 aprovados e 0 falhas

## 2. Cadeia antes e depois

Antes:

```text
Gantt geometry
-> shared/production-calendar/productionCalendar.utils.js
```

Depois:

```text
Gantt geometry
-> shared/planning-schedule/planningMachineOrder.js
```

O caminho antigo em `shared/production-calendar/productionCalendar.utils.js` permanece como re-export temporario para consumidores legados do pacote `production-calendar`.

## 3. Auditoria dos helpers

| Helper | Consumidores | Regra V2? | Neutro? | Re-export necessario? | Decisao |
|---|---|---|---|---|---|
| `normalizeProductionCalendarMachineName` | `productionCalendar.adapter.js`; re-export/barrel do pacote antigo; novo teste de compatibilidade | Nao | Sim | Sim | Movido para `normalizePlanningMachineName` em modulo neutro; nome antigo reexportado |
| `compareProductionCalendarMachineOrder` | `createProductionCalendarGridRows`; `ganttAps.geometry.js`; re-export/barrel do pacote antigo; testes de grid/Gantt | Nao | Sim | Sim | Movido para `comparePlanningMachineOrder` em modulo neutro; Gantt passou a importar o nome neutro |

## 4. Gate de neutralidade

| Pergunta | `normalizeProductionCalendarMachineName` | `compareProductionCalendarMachineOrder` |
|---|---|---|
| E usado fora do V2? | Sim, pelo adapter compartilhado e compatibilidade antiga | Sim, pelo Gantt APS e grid |
| Tem DOM/render V2? | Nao | Nao |
| Usa estado V2? | Nao | Nao |
| Tem regra especifica do Calendario V2? | Nao | Nao |
| A API pode ser preservada? | Sim, por re-export | Sim, por re-export |
| Pode ser movido sem mudanca de comportamento? | Sim | Sim |

## 5. Neutralizacao realizada

- Criado `shared/planning-schedule/planningMachineOrder.js`.
- Movida mecanicamente a ordem canonica atual: `trefila`, `ec125`, `ec60`, `aco8`, `focus8`, `mt200`, `mt150`, `mt100`.
- `normalizePlanningMachineName` preserva exatamente a normalizacao anterior.
- `comparePlanningMachineOrder` preserva exatamente os fallbacks e o retorno anterior.
- `productionCalendar.utils.js` reexporta `normalizeProductionCalendarMachineName` e `compareProductionCalendarMachineOrder`.
- `createProductionCalendarGridRows` passou a usar a fonte neutra por import interno.
- `ganttAps.geometry.js` deixou de importar `productionCalendar.utils.js`.

## 6. Contratos preservados

- Normalizacao de nomes.
- Aliases por acento, hifen, espaco e caixa.
- Ordem canonica atual das maquinas.
- Estabilidade para nomes desconhecidos, que continuam empatando no comparador.
- Fallbacks `machineName`, `name`, `machineId`, `id` e vazio.
- Comportamento com valores vazios, `null` e `undefined`.
- Assinaturas e retornos dos nomes antigos via re-export.
- Fallbacks especificos dos consumidores continuam fora do helper: grid usa `originalIndex`; Gantt usa `order`, `name` e `id`.

## 7. Compatibilidade

Re-export mantido em `shared/production-calendar/productionCalendar.utils.js` porque consumidores antigos ainda importam os nomes legados, especialmente:

- `shared/production-calendar/productionCalendar.adapter.js`;
- `shared/production-calendar/index.js`;
- consumidores de `createProductionCalendarGridRows`, que continua exposto no pacote antigo.

## 8. Validacoes

Executadas:

```text
node --check shared/planning-schedule/planningMachineOrder.js
node --check shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js
node --check shared/production-calendar/productionCalendar.utils.js
node --test tests/planningMachineOrder.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/*.js
git diff --check
```

Resultado:

- Sintaxe dos tres modulos aprovada.
- Teste novo aprovado com 1 teste, 1 aprovado e 0 falhas.
- Testes focados obrigatorios aprovados.
- Suite final: 96 testes, 96 aprovados e 0 falhas.
- `git diff --check`: sem erros; apenas avisos conhecidos de futura conversao LF -> CRLF.

## 9. Blockers V2 restantes

- REF-013 homologacao manual permanece pendente.
- Fallback/renderer V2 permanece pendente.
- `ProductionCalendar` permanece pendente.
- Editor/split visual compartilhado permanece no pacote V2.
- Adapter permanece no namespace V2.
- Demais utilities V2 permanecem pendentes.
- Stock-only permanece pendente.
- Identidade manual permanece pendente.
- Autosave/descarte permanece pendente.
- `productiveMinutes` permanece pendente.
- `generatePlanningCode` permanece pendente.
- Turnos/capacidade permanecem pendentes.
