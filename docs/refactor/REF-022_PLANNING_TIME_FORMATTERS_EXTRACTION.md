# REF-022 - Planning time formatters extraction

Data: 2026-08-07

## 1. Baseline

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `c404baf36f4820d263dab899e771870a20846640`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 52 testes, 52 aprovados e 0 falhos

## 2. Commit-base

- Commit-base oficial: `c404baf`
- Mensagem esperada: `refactor: extrai formatadores da PlanningPage`

## 3. Funcoes auditadas

| Funcao | Linha atual antes | Consumidores | Dependencias | Pura? | Efeito colateral? | Extrair? |
|---|---:|---|---|---|---|---|
| `formatDuration` | 658 | Historico/detalhes de planos em `renderHistoryTab` | `Number`, `Math`, `String#padStart` | Sim | Nao | Sim |
| `formatHourDuration` | 666 | Card de horas por dia em `renderHistoryTab` | `Number`, `Math`, `String#padStart` | Sim | Nao | Sim |
| `minutesToTime` | 791 | `defaultShift`, `normalizeShiftTimes` | `Math`, modulo aritmetico, `String#padStart` | Sim | Nao | Sim |
| `timeToMinutes` | 809 | `defaultShift`, `normalizeShiftTimes` | `String`, `Number` | Sim | Nao | Sim |

## 4. Funcoes extraidas

Extraidas para `shared/planning-presentation/planningTimeFormatters.js`:

- `formatDuration`
- `formatHourDuration`
- `minutesToTime`
- `timeToMinutes`

Nenhuma outra funcao foi movida nesta missao.

## 5. Funcoes mantidas

Permaneceram na `PlanningPage.js`, conforme escopo proibido da missao:

- `dateOnlyFromDate`
- `parseDateOnly`
- `addCalendarMonths`
- `isWeekendDate`
- `productiveMinutes`
- `normalizeShiftTimes`
- `defaultShift`
- `operationOverrideKeys`

Nenhuma funcao candidata precisou ser mantida por impureza.

## 6. Novo modulo

- Arquivo: `shared/planning-presentation/planningTimeFormatters.js`
- Imports: nenhum
- DOM/window/globalThis/localStorage/API: nenhum acesso
- Estado mutavel externo: nenhum
- Conhecimento de turnos, estoque, produtividade, Gantt, Calendario V2, draft manual, solver, reotimizacao ou persistencia: nenhum

## 7. Dependencias

As quatro funcoes dependem apenas de primitivas JavaScript (`Number`, `String`, `Math`, modulo e `padStart`). Nenhuma depende de closure da `PlanningPage.js`.

## 8. Consumidores

Consumidores preservados em `pages/PlanningPage.js`:

- `formatHourDuration(plan.hours_per_day)`
- `formatDuration(row.totalMinutes)`
- `timeToMinutes(shiftStartTime)`
- `minutesToTime(shiftEndMinutes)`
- `timeToMinutes('07:00')`
- `timeToMinutes(shift.shiftStartTime || '07:00')`
- `minutesToTime(start)`
- `minutesToTime(start + dailyMinutes)`

As chamadas nao foram renomeadas nem reorganizadas.

## 9. Comportamento caracterizado

`formatDuration`:

- `0`, vazio, `null` e `undefined` retornam `0 min`.
- Valores menores que 60 retornam minutos.
- Horas exatas retornam `Nh`.
- Horas com minutos retornam `Nh MMmin`.
- Negativos sao truncados para `0 min`.
- Decimais sao arredondados com `Math.round`.

`formatHourDuration`:

- Retorna sempre `HH:MM h/dia`.
- `null`, `undefined` e negativos retornam `00:00 h/dia`.
- Decimais em horas sao convertidos para minutos com arredondamento.
- Horas acima de 24 nao recebem validacao especial.

`minutesToTime`:

- Usa modulo de 24h.
- Valores acima de 24h voltam ao inicio do dia.
- Valores negativos tambem sao normalizados no ciclo de 24h.
- Decimais sao arredondados.
- `null` retorna `00:00`.
- `undefined` e strings invalidas preservam o comportamento estranho `NaN:NaN`.

`timeToMinutes`:

- Converte `HH:MM` para minutos totais.
- Vazio, `null`, `undefined` e string invalida retornam `0`.
- Horas acima de 23 sao aceitas e retornam minutos acima de 24h.
- Nao ha validacao nova de formato.

## 10. Testes adicionados

Criado `tests/planningTimeFormatters.test.js`, importando diretamente `shared/planning-presentation/planningTimeFormatters.js`.

Cenarios cobertos:

- `formatDuration`: zero, minutos, horas, horas + minutos, vazio/null/undefined, negativo e decimal.
- `formatHourDuration`: zero, menor que uma hora, uma hora, varias horas, decimal, null/undefined e negativo.
- `minutesToTime`: `0`, `1`, `59`, `60`, `61`, meio do dia, fim do dia, acima de 24h, negativos e invalidos.
- `timeToMinutes`: `00:00`, `00:01`, `01:00`, `07:00`, `12:30`, `17:00`, `23:59`, vazio, invalido, null/undefined e horas acima de 23.

## 11. Resultados focados

```text
node --check shared/planning-presentation/planningTimeFormatters.js
OK

node --check pages/PlanningPage.js
OK

node --test tests/planningTimeFormatters.test.js
tests: 1
pass: 1
fail: 0

node --test tests/planningFormatters.test.js
tests: 1
pass: 1
fail: 0
```

## 12. Suite completa

Resultado final:

```text
node --test tests/*.js
tests: 53
pass: 53
fail: 0
```

## 13. PlanningPage antes/depois

- Linhas antes: 7183
- Linhas depois: 7162
- Funcoes removidas: `formatDuration`, `formatHourDuration`, `minutesToTime`, `timeToMinutes`
- Import adicionado: import nomeado de 4 helpers vindo de `../shared/planning-presentation/planningTimeFormatters.js`
- Reducao liquida: 21 linhas

Reducao de linhas nao foi usada como criterio de sucesso.

## 14. git diff --stat

Resultado final:

```text
PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md | 23 ++++++++++++++-
pages/PlanningPage.js                              | 33 ++++------------------
2 files changed, 28 insertions(+), 28 deletions(-)
```

Observacao: como nao houve `git add`, o `git diff --stat` nativo nao contabiliza arquivos novos nao rastreados. Arquivos novos desta missao:

- `shared/planning-presentation/planningTimeFormatters.js` com 27 linhas
- `tests/planningTimeFormatters.test.js` com 64 linhas
- `docs/refactor/REF-022_PLANNING_TIME_FORMATTERS_EXTRACTION.md` com 203 linhas antes deste ajuste final

## 15. Riscos

- `minutesToTime(undefined)` retorna `NaN:NaN`; comportamento estranho preservado por contrato de refatoracao.
- `timeToMinutes('25:30')` retorna `1530`; horas acima de 23 continuam aceitas.
- Os helpers de turnos que consomem `minutesToTime` e `timeToMinutes` permaneceram na `PlanningPage.js`, conforme escopo.
- Homologacao manual REF-013 permanece pendente e nao foi alterada por esta missao.
- Calendario V2 permanece pendente e nao foi tocado.

## 16. Dividas tecnicas encontradas

- `minutesToTime` nao trata entradas invalidas de forma amigavel, mas esse comportamento pode estar acoplado a consumidores antigos.
- A `PlanningPage.js` ainda contem helpers puros de data civil/calendario (`dateOnlyFromDate`, `parseDateOnly`, `addCalendarMonths`, `isWeekendDate`) que podem ser extraidos em missao futura pequena.

## 17. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-presentation/planningTimeFormatters.js`
- `tests/planningTimeFormatters.test.js`
- `docs/refactor/REF-022_PLANNING_TIME_FORMATTERS_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 18. Conclusao

REF-022 concluida. A `PlanningPage.js` deixou de possuir as quatro definicoes locais de duracao/horario autorizadas, passou a consumir um modulo puro e testavel, e a suite completa permaneceu verde com zero falhas.
