# REF-024 - isValidDateOnly centralization

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `d7a7c204daa386611eed7527fa6d6c05be1113ef`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 54 testes, 54 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 7143 linhas pelo metodo canonico

## 2. Commit-base

- Commit-base oficial: `d7a7c20`
- Mensagem esperada: `refactor: extrai helpers de data civil da PlanningPage`
- Contagem de `pages/PlanningPage.js` no commit-base: 7143 linhas

## 3. Implementacao encontrada

Local inicial: `pages/PlanningPage.js`, linha 340.

```js
function isValidDateOnly(value) {
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateValue;
}
```

## 4. Consumidores

Consumidores em `pages/PlanningPage.js` antes da alteracao:

- `operationPeriod`: valida `operation.startDate` e `operation.endDate`.
- `productionCalendarSnapshotDays`: valida dias vindos de snapshot e allocations.
- `nextAutomaticWorkDate`: filtra proximos dias visiveis.
- `validateProductionCalendarMoveIntent`: valida `intent.to.date`.
- `reoptimizeManualMoveCandidate`: escolhe `cutoffDate`.
- `transportHoursForArrivalDate`: valida data de chegada.
- `handleProductionCalendarTransportSave`: valida chegada estimada.
- `handleProductionCalendarManualWorkDate`: valida data do dia extraordinario.
- `handleProductionCalendarDailyTeam`: valida data do override de equipe.
- `productionCalendarLastAllocationEnd`: filtra eventos por data valida.
- `productionCalendarBaseEndDate`: filtra allocations por data valida.
- `planningScheduleDays`: adiciona dias de allocations validas.
- `buildProductionCalendarSnapshot`: valida `visibleEndDate` e datas de feriados.
- `refreshPlanningStockProjection`: ignora operacoes sem data valida.
- `renderSimulation`: filtra datas de producao/projecao.
- `launchPlanning`: valida `draft.planningStartDate`.
- `productionCalendarMoveRunner`: filtra opcoes de datas de horizonte.

Consumidores fora de `PlanningPage.js` encontrados, sem consolidacao nesta missao:

- `shared/planning-presentation/planningFormatters.js`, helper privado equivalente usado por `formatDateOnly`.
- `services/manualScheduleDraft.service.js`.
- `services/planningAllocation.service.js`.
- `server/routes/planning.routes.js`.
- `shared/production-calendar/productionCalendar.utils.js`.
- `shared/production-calendar/productionCalendar.adapter.js`.
- `shared/production-calendar/productionCalendar.validation.js`.
- `tests/planningManualStockPartialModal.test.js`, harness local.

## 5. Dependencias

- `String(value || '').slice(0, 10)`
- Regex `/^\d{4}-\d{2}-\d{2}$/`
- `new Date(`${dateValue}T00:00:00`)`
- `Number.isNaN(date.getTime())`
- `date.toISOString().slice(0, 10)`

Nao depende de estado da `PlanningPage.js`, DOM, `window`, `globalThis`, `localStorage`, API, banco, services, draft, solver, estoque, transporte, capacidade, turnos, Gantt, Calendario V2, persistencia ou relogio atual.

## 6. Comportamento real

| Entrada | Resultado |
|---|---:|
| `2026-07-15` | `true` |
| `2026-01-01` | `true` |
| `2026-12-31` | `true` |
| `2024-02-29` | `true` |
| `2026-02-28` | `true` |
| `2026-02-29` | `false` |
| `2026-02-31` | `false` |
| `2026-13-01` | `false` |
| `2026-00-01` | `false` |
| string vazia | `false` |
| espaco | `false` |
| `null` | `false` |
| `undefined` | `false` |
| string comum | `false` |
| `01/01/2026` | `false` |
| `2026-01-01T12:34:56.000Z` | `true` |
| `20260101` numero | `false` |
| `new Date(2026, 0, 1)` | `false` |
| `true` | `false` |
| objeto com `toString()` retornando `2026-01-01` | `true` |

## 7. Determinismo

Para uma mesma entrada e o mesmo timezone do runtime, a funcao e deterministica. Ela nao le relogio atual, nao muta parametros e nao tem efeito colateral.

## 8. Analise local/UTC

- Usa `new Date('YYYY-MM-DDT00:00:00')`, interpretado como horario local.
- Usa `toISOString().slice(0, 10)` para comparar o dia UTC resultante.
- Nao usa `Date.UTC`, `getUTC*`, `Intl` ou parsing de `YYYY-MM-DD` puro.
- A politica local/UTC foi preservada literalmente.

## 9. Duplicacoes encontradas

Existem helpers homonimos ou equivalentes em `shared/planning-presentation/planningFormatters.js`, `services/manualScheduleDraft.service.js`, `services/planningAllocation.service.js`, `server/routes/planning.routes.js`, `shared/production-calendar/productionCalendar.utils.js`, `shared/production-calendar/productionCalendar.adapter.js`, `shared/production-calendar/productionCalendar.validation.js` e harness de teste. Nenhuma duplicacao fora da `PlanningPage.js` foi consolidada.

## 10. Decisao de extracao

Extraida. A auditoria confirmou que o helper local e neutro, deterministico para suas entradas, sem efeito colateral, sem dependencia de estado da pagina e compativel com o contrato do modulo de data civil. A implementacao foi movida sem alterar regex, `Date`, local/UTC, normalizacao, aceites ou rejeicoes.

## 11. Alteracoes realizadas

- `shared/planning-date/planningCivilDate.js`: exporta `isValidDateOnly`.
- `pages/PlanningPage.js`: importa `isValidDateOnly` do modulo de data civil e remove somente a definicao local.
- `tests/planningCivilDate.test.js`: adiciona asserts de caracterizacao do comportamento real.
- `docs/refactor/REF-024_IS_VALID_DATE_ONLY_CENTRALIZATION.md`: evidencia da missao.
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`: registra REF-024 e pendencias.

## 12. Testes adicionados

O teste focado cobre datas validas, bissexto valido, datas impossiveis, mes/dia fora de faixa, vazio, espaco, `null`, `undefined`, texto comum, formato `DD/MM/YYYY`, datetime ISO completo e tipos nao-string.

## 13. Suite focada

```text
node --check shared/planning-date/planningCivilDate.js
OK

node --check pages/PlanningPage.js
OK

node --test tests/planningCivilDate.test.js
tests: 1
pass: 1
fail: 0
```

## 14. Suite completa

```text
node --test tests/*.js
tests: 54
pass: 54
fail: 0
```

## 15. PlanningPage antes/depois

- Antes: 7143 linhas
- Depois: 7137 linhas

## 16. diff --stat

Resultado final de `git diff --stat` para arquivos rastreados:

```text
PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md | 23 +++++++++++++++++++++-
pages/PlanningPage.js                              |  8 +-------
shared/planning-date/planningCivilDate.js          |  7 +++++++
tests/planningCivilDate.test.js                    | 22 +++++++++++++++++++++
4 files changed, 52 insertions(+), 8 deletions(-)
```

Arquivo novo nao rastreado nesta missao: `docs/refactor/REF-024_IS_VALID_DATE_ONLY_CENTRALIZATION.md`.

`git diff --check` passou, com avisos conhecidos de conversao futura LF -> CRLF nos arquivos tocados.

## 17. Riscos

- A funcao mistura interpretacao local (`T00:00:00`) com comparacao UTC por `toISOString`; isso foi preservado.
- `2026-01-01T12:34:56.000Z` e aceito porque a funcao considera apenas os 10 primeiros caracteres.
- Objetos com `toString()` compatível podem ser aceitos; isso foi preservado.

## 18. Dividas tecnicas

- Duplicacoes de validacao de data civil continuam em outros modulos.
- `shared/planning-presentation/planningFormatters.js` mantem copia privada por escopo de REF-024; nao foi alterado.
- `productiveMinutes` e helpers de turno seguem pendentes.
- `generatePlanningCode` segue nao autorizado nesta missao.
- REF-013 manual e Calendario V2 seguem pendentes.

## 19. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-date/planningCivilDate.js`
- `tests/planningCivilDate.test.js`
- `docs/refactor/REF-024_IS_VALID_DATE_ONLY_CENTRALIZATION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 20. Conclusao

REF-024 concluida. `isValidDateOnly` foi auditada, movida para `shared/planning-date/planningCivilDate.js`, importada pela `PlanningPage.js` e caracterizada em teste sem alterar semantica de validacao, regex, `Date`, timezone ou fluxo de consumidores.
