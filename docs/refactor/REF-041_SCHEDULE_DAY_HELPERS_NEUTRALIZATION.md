# REF-041 - Neutralizacao de helpers civis de dia/snapshot

Data: 2026-08-10

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `f0c9085`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 97 testes, 97 aprovados e 0 falhas

## 2. Auditoria dos helpers restantes

| Helper | Consumidores | Papel | DOM/V2 visual? | Regra produtiva? | Neutro? | Pode mover agora? | Decisao |
|---|---|---|---|---|---|---|---|
| `formatProductionCalendarDate` | V2 card/details/drag/grid/toolbar/ProductionCalendar/index; testes | Formata date-only UTC em `pt-BR` | Nao | Nao | Sim | Sim | Movido como `formatPlanningScheduleDate`; re-export legado mantido |
| `getProductionCalendarWeekday` | V2 grid; normalize/fill; index | Weekday civil UTC em `pt-BR` | Nao | Nao | Sim | Sim | Movido como `getPlanningScheduleWeekday`; re-export legado mantido |
| `formatProductionCalendarQuantity` | V2 card/details/drag/editor/split/toolbar; teste de reotimizacao | Formata quantidade para apresentacao | Nao DOM, mas presentation V2/editor | Nao | Sim | Nao nesta REF | Mantido; nao e helper de dia/snapshot e uso runtime ainda fica no pacote visual/editor |
| `formatProductionCalendarPercent` | V2 card/details/editor/split/grid | Formata percentual para apresentacao | Nao DOM, mas presentation V2/editor | Nao | Sim | Nao nesta REF | Mantido; fora do recorte dia/snapshot |
| `formatProductionCalendarCompactNumber` | V2 grid | Formata numero compacto da pilula de produtividade | V2 grid | Nao | Sim | Nao | Mantido como V2/grid |
| `buildProductionCalendarDayProductivity` | `PlanningPage.js`; day header test | Soma pessoas equivalentes por `capacityPercent` e `peopleCount` | Nao DOM | Sim, depende de capacidade/pessoas | Nao | Nao | Blocker produtivo; mantido |
| `formatProductionCalendarDuration` | V2 card/details/editor | Formata duracao | Nao DOM, mas V2/editor | Nao | Sim | Nao nesta REF | Mantido; fora do recorte dia/snapshot |
| `getProductionCalendarDayCardCounts` | V2 grid | Calcula largura visual por quantidade de cards | Sim, grid visual | Nao | Nao para namespace schedule | Nao | Mantido como V2 puro |
| `isProductionCalendarNonWorkingDay` | V2 grid; `buildProductionCalendarDayPresentation`; horizon test | Resolve hachura por `isWorkingDay`, feriado e fim de semana | V2 visual | Sim/ambigua: feriados e fins de semana como disponibilidade visual | Nao | Nao | Blocker; mantido |
| `addProductionCalendarDays` | V2 ProductionCalendar/horizon; index; tests | Soma dias civis UTC truncando quantidade | Nao | Nao | Sim | Sim | Movido como `addPlanningScheduleDays`; re-export legado mantido |
| `getProductionCalendarProductionLimitDate` | V2 ProductionCalendar/horizon; index; tests | Maior date-only valida de allocations | Nao | Nao | Sim | Sim | Movido como `getPlanningScheduleProductionLimitDate`; re-export legado mantido |
| `buildProductionCalendarDayPresentation` | `PlanningPage.js`; testes de equipe/reotimizacao | Monta snapshot visual de dia com shifts, overrides, manualWorkDates e estado de equipe | Parcial V2/pilula | Sim, depende de turnos/equipe/manualWorkDates/capacidade | Nao | Nao | Blocker produtivo; mantido |
| `normalizeProductionCalendarDay` | V2 ProductionCalendar/Grid; index; tests | Normaliza contrato estrutural de dia preservando campos | Nao | Nao | Sim | Sim | Movido como `normalizePlanningScheduleDay`; re-export legado mantido |
| `fillProductionCalendarDayRange` | `PlanningPage.js`; V2 ProductionCalendar/Grid; tests | Preenche lacunas civis entre primeiro e ultimo dia valido | Nao | Nao | Sim | Sim | Movido como `fillPlanningScheduleDayRange`; `PlanningPage.js` passou a importar fonte neutra |
| `extendProductionCalendarDayRange` | `PlanningPage.js`; V2 ProductionCalendar/horizon; tests | Estende horizonte e gera metadado de feriado/isWorkingDay | Parcial V2/horizon | Sim/ambigua: usa feriado para disponibilidade visual | Nao | Nao | Blocker; mantido |
| `groupAllocationsByMachineAndDate` | `createProductionCalendarGridRows`; index | Agrupamento para grid por maquina/data | Grid V2 | Nao | Estrutural, mas consumidor runtime so V2 | Nao | Mantido como V2/grid |
| `createProductionCalendarGridRows` | V2 grid; testes grid/reotimizacao | Cria linhas readonly do grid e ordena cards | Grid V2 | Nao | Parcial, mas acoplado ao contrato visual do grid | Nao | Mantido como V2/grid |
| `normalizeProductionCalendarMachineName` | Re-export legado REF-039 | Normalizacao de maquina | Nao | Nao | Sim | Ja movido | Ja neutralizado em REF-039 |
| `compareProductionCalendarMachineOrder` | Grid V2; re-export legado REF-039 | Ordem canonica de maquina | Nao | Nao | Sim | Ja movido | Ja neutralizado em REF-039 |

## 3. Separacao por classe

Helpers puramente visuais V2:

- `getProductionCalendarDayCardCounts`
- `groupAllocationsByMachineAndDate`
- `createProductionCalendarGridRows`
- `formatProductionCalendarCompactNumber`

Helpers neutros compartilhados:

- `formatProductionCalendarDate`
- `getProductionCalendarWeekday`
- `addProductionCalendarDays`
- `getProductionCalendarProductionLimitDate`
- `normalizeProductionCalendarDay`
- `fillProductionCalendarDayRange`

Helpers com regra produtiva ou dependencia produtiva/ambigua:

- `buildProductionCalendarDayProductivity`
- `buildProductionCalendarDayPresentation`
- `isProductionCalendarNonWorkingDay`
- `extendProductionCalendarDayRange`

Helpers ja neutralizados em REF-039:

- `normalizeProductionCalendarMachineName`
- `compareProductionCalendarMachineOrder`

Helpers usados apenas pelo V2/editor visual nesta REF:

- `formatProductionCalendarQuantity`
- `formatProductionCalendarPercent`
- `formatProductionCalendarDuration`
- `formatProductionCalendarCompactNumber`
- `getProductionCalendarDayCardCounts`
- `groupAllocationsByMachineAndDate`
- `createProductionCalendarGridRows`

## 4. Gate de neutralidade

| Gate | Resultado |
|---|---|
| Consumidor fora do V2 ou uso claramente compartilhado | Sim para `fillProductionCalendarDayRange` em `PlanningPage.js`; demais helpers civis sao dependencia coesa dele e do snapshot de calendario |
| Sem DOM | Sim |
| Sem estado visual V2 | Sim |
| Sem decisao de capacidade/jornada | Sim |
| Assinatura e retorno preservados | Sim, via re-export legado |
| Sem mudanca de timezone/date semantics | Sim, `YYYY-MM-DDT00:00:00Z`, `toISOString().slice(0, 10)` e `Intl` com `timeZone: 'UTC'` preservados |
| Comportamento estranho preservado | Sim: label vazio com data vira `day.date`; `fillPlanningScheduleDayRange(null)` continua lancando `TypeError`; amount decimal em add days continua truncado |

## 5. Neutralizacao realizada

- Criado `shared/planning-schedule/planningScheduleDay.js`.
- Movidos como fonte neutra:
  - `formatPlanningScheduleDate`;
  - `getPlanningScheduleWeekday`;
  - `addPlanningScheduleDays`;
  - `getPlanningScheduleProductionLimitDate`;
  - `normalizePlanningScheduleDay`;
  - `fillPlanningScheduleDayRange`.
- Exportados tambem os auxiliares neutros `isPlanningScheduleDateOnly` e `parsePlanningScheduleDateOnlyToUtcDate` para evitar duplicar parsing civil no caminho legado.
- `shared/production-calendar/productionCalendar.utils.js` virou re-export temporario para os nomes `ProductionCalendar*` equivalentes e continua hospedando os helpers V2/produtivos.
- `pages/PlanningPage.js` passou a importar `fillPlanningScheduleDayRange` do namespace neutro com alias local legado para manter diff pequeno.

## 6. Compatibilidade e contratos preservados

- Timezone UTC para date-only.
- Validacao exata de `YYYY-MM-DD`.
- Fallback de data invalida para `String(date || '')`.
- Weekday invalido retorna `''`.
- `addDays` trunca quantidade decimal.
- `getProductionLimitDate` ignora datas invalidas, ordena lexicograficamente e retorna `null` sem data valida.
- `normalizeDay` preserva campos e referencias extras por spread raso.
- Precedencia de `weekday`, `weekDay`, `dayOfWeek` preservada.
- `isWorkingDay` continua derivado de `isWorkingDay`, `workingDay`, `businessDay`, `is_business_day` e `business_day`.
- `fillDayRange` preserva o primeiro objeto por data e gera dias intermediarios com label/weekday UTC.
- Nomes legados `ProductionCalendar*` permanecem somente no namespace antigo por re-export.

## 7. Blockers restantes

- `buildProductionCalendarDayProductivity`: depende de `capacityPercent`, `peopleCount` e equipe disponivel.
- `buildProductionCalendarDayPresentation`: depende de turnos, pessoas, overrides, `manualWorkDates` e estado de capacidade.
- `isProductionCalendarNonWorkingDay`: mistura estrutura civil com feriados/finais de semana como disponibilidade visual.
- `extendProductionCalendarDayRange`: gera feriado e `isWorkingDay: false`, portanto fica no V2 ate decisao propria.
- Grid rows/card counts continuam acoplados ao contrato visual do `ProductionCalendarGrid`.

## 8. Validacoes

Executadas:

```text
node --check shared/planning-schedule/planningScheduleDay.js
node --check shared/production-calendar/productionCalendar.utils.js
node --check pages/PlanningPage.js
node --test tests/planningScheduleDay.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/productionCalendarDayHeader.test.js
node --test tests/productionCalendarHorizon.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/*.js
git diff --check
```

Resultado:

- Testes focados: zero falhas.
- Suite final: 98 testes, 98 aprovados e 0 falhas.
- `git diff --check`: sem erros; apenas avisos conhecidos de futura conversao LF -> CRLF.

## 9. Pendencias mantidas explicitamente

- REF-013 homologacao manual.
- Renderer/fallback V2.
- `ProductionCalendar`.
- Editor/split visual.
- Helpers V2 puros.
- `productiveMinutes`.
- Turnos/capacidade.
- Stock-only.
- Identidade manual restante.
- Autosave/descarte.
- `generatePlanningCode`.
