# REF-023 - Planning civil date extraction

Data: 2026-08-07

## 1. Baseline inicial

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `36508293a6682a884806ba90b5cebe2a2e368f0c`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 53 testes, 53 aprovados e 0 falhos

## 2. Commit-base

- Commit-base oficial: `3650829`
- Mensagem esperada: `refactor: extrai helpers de tempo da PlanningPage`

## 3. Contagem canonica inicial

- `pages/PlanningPage.js` no worktree inicial: 7162 linhas
- `pages/PlanningPage.js` no commit-base `3650829`: 7162 linhas
- Metodo usado:

```text
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node -e "const {execFileSync}=require('child_process'); const s=execFileSync('git',['show','3650829:pages/PlanningPage.js'],{encoding:'utf8'}); console.log(s.split(/\r?\n/).length)"
```

## 4. Funcoes auditadas

| Funcao | Linha atual antes | Consumidores | Dependencias | Classificacao comportamental | Usa Date local/UTC? | Extrair? |
|---|---:|---|---|---|---|---|
| `dateOnlyFromDate` | 692 | `renderPlanningInlineCalendar` para selectedKey, meses anterior/proximo e celulas | `Date`, `getFullYear`, `getMonth`, `getDate` | Deterministica para `Date` valido; dependente do relogio atual no fallback invalido/vazio; sem efeito colateral externo | Local | Sim |
| `parseDateOnly` | 700 | `renderPlanningInlineCalendar` para data selecionada | `Date`, regex `YYYY-MM-DD`, `String#slice` | Deterministica para string valida; dependente do relogio atual para vazio/null/undefined/formato invalido; sem efeito colateral externo | Local | Sim |
| `addCalendarMonths` | 707 | `renderPlanningInlineCalendar` para navegacao mensal | `Date`, `getFullYear`, `getMonth` | Deterministica para `Date` valido e offset dado; sem efeito colateral externo | Local | Sim |
| `isWeekendDate` | 712 | `renderPlanningInlineCalendar` para classe/titulo de fim de semana | `Date#getDay` | Deterministica para `Date` recebido; sem efeito colateral externo | Local | Sim |

## 5. Dependencias e classificacao

- As quatro funcoes nao importavam modulo, nao acessavam DOM, `window`, `globalThis`, `localStorage`, API, Gantt, Calendario V2, estoque, turno, capacidade, solver, draft manual, persistencia ou reotimizacao.
- `parseDateOnly` nao chama outras candidatas.
- `addCalendarMonths` nao chama outras candidatas.
- `isWeekendDate` nao chama outras candidatas.
- `dateOnlyFromDate` e chamada pelos consumidores e pelos testes para caracterizar retornos, mas nao depende de helper privado.
- `dateOnlyFromDate` e `parseDateOnly` nao devem ser classificadas simplesmente como puras/deterministicas para todos os inputs, porque preservam fallback legado para `new Date()` em entradas invalidas ou vazias.
- A extracao continua arquiteturalmente valida: o objetivo da REF-023 foi remover dependencia da `PlanningPage.js` e manter helpers neutros de data civil, sem regra produtiva e sem mutacao de estado externo.
- Nenhum helper privado novo foi necessario.

## 6. Uso local/UTC

- `dateOnlyFromDate` usa getters locais: `getFullYear`, `getMonth`, `getDate`.
- `parseDateOnly` cria `new Date(year, month - 1, day)`, portanto data local.
- `addCalendarMonths` cria `new Date(date.getFullYear(), date.getMonth() + offset, 1)`, portanto data local.
- `isWeekendDate` usa `getDay`, nao `getUTCDay`.
- Nenhum helper usa `toISOString`, `Date.UTC`, sufixo `Z` ou `Intl.DateTimeFormat`.
- O comportamento depende do timezone local do processo/navegador.

## 7. Mutabilidade

- `dateOnlyFromDate` nao muta a entrada; le campos do `Date` recebido ou cria fallback com `new Date()`.
- `parseDateOnly` sempre retorna um novo `Date`.
- `addCalendarMonths` cria um novo `Date` e nao chama `setMonth`; o `Date` recebido nao e mutado.
- `isWeekendDate` nao muta a entrada.

## 8. Funcoes extraidas

Extraidas para `shared/planning-date/planningCivilDate.js`:

- `dateOnlyFromDate`
- `parseDateOnly`
- `addCalendarMonths`
- `isWeekendDate`

## 9. Funcoes mantidas

Permaneceram na `PlanningPage.js` ou em seus modulos atuais:

- `productiveMinutes`
- `normalizeShiftTimes`
- `defaultShift`
- `operationOverrideKeys`
- helpers de turno, capacidade, estoque, transporte, material, Gantt, Calendario V2, reotimizacao e persistencia
- `isValidDateOnly`, porque tem consumidores locais fora deste grupo e nao fazia parte do escopo

## 10. Novo modulo

- Arquivo: `shared/planning-date/planningCivilDate.js`
- Imports: nenhum
- Estado mutavel global: nenhum
- Contrato: datas civis simples, sem regra produtiva.

O modulo nao acessa DOM, `window`, `globalThis`, `localStorage`, API, Gantt, Calendario V2, estoque, turno, capacidade, solver, draft manual, reotimizacao ou persistencia.

## 11. Helper privado

Nenhum helper privado foi criado.

## 12. Consumidores

`pages/PlanningPage.js` passou a importar os quatro helpers do novo modulo e manteve os mesmos nomes nas chamadas existentes:

- `parseDateOnly(selectedDateValue)`
- `dateOnlyFromDate(selectedDate)`
- `dateOnlyFromDate(addCalendarMonths(monthStart, -1))`
- `dateOnlyFromDate(addCalendarMonths(monthStart, 1))`
- `dateOnlyFromDate(cellDate)`
- `isWeekendDate(cellDate)`

## 13. Casos de fronteira caracterizados

`dateOnlyFromDate`:

- Date valido: `2026-07-15`
- comeco do mes: `2026-07-01`
- fim do mes: `2026-07-31`
- comeco do ano: `2026-01-01`
- fim do ano: `2026-12-31`
- ano bissexto: `2028-02-29`
- horario proximo da meia-noite: preserva o dia local (`2026-07-15`)
- objeto Date invalido, `null` e `undefined`: caem para `new Date()` e retornam a data local atual

`parseDateOnly`:

- `YYYY-MM-DD` valido, primeiro/ultimo dia do mes e ano bissexto retornam `Date` local correspondente.
- string vazia, `null`, `undefined` e formato invalido retornam `new Date()`.
- datas aparentemente invalidas fazem rollover de `Date`: `2026-02-31` vira `2026-03-03`.

`isWeekendDate`:

- segunda e sexta retornam `false`.
- sabado e domingo retornam `true`.
- virada de mes em `2026-08-01` retorna `true`.
- virada de ano em `2027-01-01` retorna `false`.
- `new Date('invalid')` retorna `false` porque `getDay()` vira `NaN`.
- `null` gera `TypeError`, comportamento preservado.

## 14. Rollover de mes

`addCalendarMonths` preserva o comportamento atual de construir o primeiro dia do mes alvo:

- `2026-07-15 + 1` -> `2026-08-01`
- `2026-07-15 - 1` -> `2026-06-01`
- `2026-07-15 + 0` -> `2026-07-01`
- `2026-01-01 + 1` -> `2026-02-01`
- `2026-12-01 + 1` -> `2027-01-01`
- `2026-01-31 + 1` -> `2026-02-01`, porque o helper ignora o dia original e fixa dia 1
- `2026-03-31 - 1` -> `2026-02-01`
- `2028-02-29 + 1` -> `2028-03-01`
- varios meses positivos e negativos sao aceitos

## 15. Comportamento de invalidos

- `dateOnlyFromDate(new Date('invalid'))`, `dateOnlyFromDate(null)` e `dateOnlyFromDate(undefined)` retornam a data local atual.
- `parseDateOnly('')`, `parseDateOnly(null)`, `parseDateOnly(undefined)` e `parseDateOnly('fora-do-formato')` retornam uma data valida baseada em `new Date()`.
- `parseDateOnly('2026-13-01')` retorna `2027-01-01` por rollover do construtor `Date`.
- `addCalendarMonths(new Date('invalid'), 1)` retorna `Invalid Date`.
- `addCalendarMonths(null, 1)` preserva erro por acesso a metodo inexistente.
- `isWeekendDate(new Date('invalid'))` retorna `false`.
- `isWeekendDate(null)` preserva erro por acesso a metodo inexistente.

## 16. Testes adicionados

Criado `tests/planningCivilDate.test.js`, importando diretamente `shared/planning-date/planningCivilDate.js`.

O teste cobre:

- virada de dia;
- virada de mes;
- virada de ano;
- fevereiro;
- ano bissexto;
- sabado e domingo;
- rollover de mes;
- entradas vazias, invalidas, `null` e `undefined`;
- mutabilidade de `addCalendarMonths`;
- uso local por construcao/getters locais.

## 17. Suite focada

```text
node --check shared/planning-date/planningCivilDate.js
OK

node --check pages/PlanningPage.js
OK

node --test tests/planningCivilDate.test.js
tests: 1
pass: 1
fail: 0

node --test tests/planningFormatters.test.js
tests: 1
pass: 1
fail: 0

node --test tests/planningTimeFormatters.test.js
tests: 1
pass: 1
fail: 0
```

## 18. Suite completa

```text
node --test tests/*.js
tests: 54
pass: 54
fail: 0
```

## 19. PlanningPage antes/depois

- Linhas antes: 7162
- Linhas depois: 7143
- Funcoes removidas da pagina: 4
- Reducao liquida: 19 linhas

## 20. git diff --stat

Validacao final:

```text
PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md | 26 +++++++++++++++++-
pages/PlanningPage.js                              | 31 +++++-----------------
2 files changed, 31 insertions(+), 26 deletions(-)
```

Observacao: como nao houve `git add`, o `git diff --stat` nativo nao contabiliza arquivos novos nao rastreados. Arquivos novos desta missao:

- `shared/planning-date/planningCivilDate.js`
- `tests/planningCivilDate.test.js`
- `docs/refactor/REF-023_PLANNING_CIVIL_DATE_EXTRACTION.md`

`git diff --check` passou com avisos conhecidos de conversao futura LF -> CRLF em arquivos rastreados modificados.

## 21. Riscos

- O fallback para data atual em entradas invalidas depende do relogio e timezone local.
- Trocar `getDay` por `getUTCDay` mudaria finais de semana em alguns ambientes; isso nao foi feito.
- Trocar `new Date(year, month - 1, day)` por `new Date('YYYY-MM-DD')` poderia introduzir parsing UTC; isso nao foi feito.
- O comportamento de datas invalidas com rollover de `Date` foi preservado, mesmo parecendo estranho.

## 22. Dividas tecnicas encontradas

- Existem helpers de data semelhantes em `shared/production-calendar/*`, `services/*` e testes, alguns com UTC. Eles nao foram deduplicados para evitar mudar politica temporal.
- `isValidDateOnly` permanece local em `PlanningPage.js` e duplicado de forma privada em `planningFormatters.js` por missoes anteriores.
- Helpers de turno e `productiveMinutes` continuam pendentes.

## 23. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-date/planningCivilDate.js`
- `tests/planningCivilDate.test.js`
- `docs/refactor/REF-023_PLANNING_CIVIL_DATE_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 24. Conclusao

REF-023 concluida. Apenas os quatro helpers civis autorizados foram extraidos para modulo neutro, sem alterar semantica local/UTC, rollover, validacao, timezone, turno, capacidade, estoque, Gantt, Calendario V2, persistencia ou services. `dateOnlyFromDate` e `parseDateOnly` preservam dependencia temporal implicita em fallbacks legados; isso fica registrado como divida tecnica, nao corrigida durante a reestruturacao.
