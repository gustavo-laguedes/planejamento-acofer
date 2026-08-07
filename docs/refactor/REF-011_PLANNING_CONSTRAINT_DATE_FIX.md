# REF-011 - Correcao temporal do planningConstraintRecalculation.service.test.js

## 1. Problema original

`tests/planningConstraintRecalculation.service.test.js` usava a data fixa `2026-07-17` como inicio, cutoff e data de capacidade. Em 2026-08-06, essa data ja esta no passado e aciona a protecao produtiva de `rescheduleSavedPlan`.

## 2. Erro reproduzido

Comando:

```bash
node --test tests/planningConstraintRecalculation.service.test.js
```

Resultado anterior: 1 teste, 0 aprovados, 1 falho.

Erro:

```text
Error: Producoes anteriores a hoje sao somente leitura.
at rescheduleSavedPlan (.../services/planning.service.js:2203:19)
```

## 3. Comportamento produtivo preservado

A regra produtiva permanece inalterada: operacoes com `targetOperation.startDate` ou `targetDate` anteriores a hoje sao somente leitura. A missao nao alterou `services/planning.service.js` nem introduziu relogio injetavel no runtime.

## 4. Estrategia escolhida

O teste passou a gerar uma fixture relativa:

- `operationalToday()` calcula o dia corrente em `America/Sao_Paulo`;
- `FIXTURE_SAFETY_DAYS = 45` empurra a fixture para o futuro com margem contra virada UTC/local;
- a data-base e a proxima sexta-feira a partir de `hoje operacional + 45 dias`;
- as demais datas sao derivadas por offsets de calendario: `-1`, `+1`, `+2`, `+3`, `+4` e `+14` dias.

Tambem foi explicitado no helper de teste o contrato de edicao de equipe/capacidade que as assertions ja exigiam: quando o cenario valida reducao de equipe, o payload envia `peopleCount` e `capacityOverrides`; quando o cenario valida deslocamento por ausencia de capacidade, ele preserva o `peopleCount` original.

## 5. Motivo para nao alterar o servico produtivo

O servico estava correto ao recusar datas passadas. A falha era causada pela fixture envelhecida. Alterar o servico reduziria a protecao operacional contra reagendamento indevido de producoes anteriores a hoje.

## 6. Tratamento de timezone

O dia corrente e obtido com `Intl.DateTimeFormat` em `America/Sao_Paulo`. O teste nao usa `new Date('YYYY-MM-DD')` e nao soma milissegundos de 24 horas. A soma de dias usa aritmetica de calendario sobre componentes `YYYY-MM-DD`, evitando dependencia implicita de UTC e mantendo comportamento estavel em viradas de mes e ano.

## 7. Relacoes temporais preservadas

- operacao principal: sexta-feira futura;
- operacao anterior preservada: quinta-feira anterior a data-base, mas ainda futura no calendario real;
- sabado manual: `data-base + 1`;
- domingo manual: `data-base + 2`;
- proximo dia util: segunda-feira, `data-base + 3`;
- fim da operacao de segunda: terca-feira, `data-base + 4`;
- fim do plano: `data-base + 14`.

## 8. Diff conceitual

- Removeu literais envelheciveis como `2026-07-17`, `2026-07-18`, `2026-07-19`, `2026-07-20` e `2026-07-21` das fixtures/assertions.
- Adicionou helpers pequenos de calendario local ao proprio teste.
- Derivou os valores esperados da mesma estrutura temporal da fixture.
- Manteve as assertions de equipe, quantidade, capacidade diaria, segmentos, movimento para dia util, trabalho manual em sabado/domingo e rollback.
- Ajustou o helper `recalculate` para diferenciar cenarios que editam `peopleCount` dos cenarios que apenas aplicam restricao de capacidade.

## 9. Comandos executados

```bash
git status --short
git diff --stat
node --test tests/planningConstraintRecalculation.service.test.js
node --test tests/planningConstraintRecalculation.service.test.js
node --test tests/*.js
git diff -- tests/planningConstraintRecalculation.service.test.js
git status --short
```

Tambem foram usados comandos de leitura para consultar `AGENTS.md`, Plano Mestre, skills, documentos REF-000/REF-010, o teste e trechos de `services/planning.service.js`.

## 10. Resultado isolado

Comando:

```bash
node --test tests/planningConstraintRecalculation.service.test.js
```

Resultado final: 1 teste, 1 aprovado, 0 falhos.

## 11. Resultado da suite completa

Comando:

```bash
node --test tests/*.js
```

Resultado final:

```text
51 testes
46 aprovados
5 falhos
```

Falhas restantes:

1. `manualScheduleAllocationSplit.service.test.js`
2. `planningManualScheduleIntegration.test.js`
3. `planningManualStockPartialModal.test.js`
4. `planningScheduleRenderer.test.js`
5. `productionCalendarDayHeader.test.js`

## 12. Riscos residuais

- A suite base ainda nao esta verde; o gate de extracao da `PlanningPage.js` deve continuar bloqueado.
- O teste agora depende de helpers locais de calendario; eles sao pequenos, deterministicos e restritos ao arquivo.
- A comparacao produtiva continua usando `new Date().toISOString().slice(0, 10)` no servico, mas a margem futura evita que a fixture atravesse a fronteira UTC/local.

## 13. Arquivos alterados

- `tests/planningConstraintRecalculation.service.test.js`
- `docs/refactor/REF-011_PLANNING_CONSTRAINT_DATE_FIX.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 14. Conclusao

Missao concluida. A falha temporal foi corrigida no teste, a regra produtiva de passado somente leitura foi preservada e a suite evoluiu do baseline esperado de 51/45/6 para 51/46/5. O documento usa `REF-011` como evidencia desta correcao; no Plano Mestre, a equivalencia operacional e a tarefa REF-010 de `Recalculation`.
