# REF-015 - Harness DOM do productionCalendarDayHeader

Data: 2026-08-06
Modo: correcao de harness de teste, sem alteracao produtiva.

## 1. Problema original

`tests/productionCalendarDayHeader.test.js` falhava antes de validar o cabecalho diario do Calendario V2. O componente real usa API DOM presente no navegador, mas o `FakeElement` do teste nao implementava `querySelector`.

## 2. Reproducao

Comando antes da alteracao:

```text
node --test tests/productionCalendarDayHeader.test.js
```

Resultado:

```text
TypeError: grid.querySelector is not a function
at drawProductionTransportConnectors (shared/production-calendar/ProductionCalendarGrid.js:72:8)
```

## 3. Linha e seletor envolvidos

Chamada inicial:

```text
shared/production-calendar/ProductionCalendarGrid.js:72
grid.querySelector('.production-calendar-transport-connectors')?.remove()
```

Seletor usado na falha: `.production-calendar-transport-connectors`.

No mesmo caminho de conectores, quando ha transporte manual, o grid tambem pode usar:

- `.production-calendar-card[data-allocation-id="..."]`
- `.production-calendar-transport-connector`

## 4. Contrato DOM esperado

No navegador real, o elemento `grid` e um `HTMLElement`. Portanto, ele possui `querySelector`, `querySelectorAll`, `appendChild`, `remove`, `dataset`, `className`, `classList` e atributos. A chamada remove um SVG antigo de conectores antes de desenhar a versao atual.

## 5. Limitacao do FakeElement

O `FakeElement` possuia criacao, filhos, `dataset`, `classList.add`, listeners e atributos basicos, mas nao possuia busca DOM recursiva. A falha era do harness, nao do componente produtivo.

## 6. Estrategia escolhida

A correcao ficou somente no teste. `ProductionCalendarGrid.js` nao foi alterado e nao recebeu condicional artificial para contornar mock incompleto.

## 7. Implementacao minima

O `FakeElement` agora implementa:

- `querySelector(selector)` como primeiro resultado de `querySelectorAll`;
- `querySelectorAll(selector)` com busca recursiva nos descendentes;
- `remove()` para o caso de conector SVG ja existente;
- `setAttribute('class', ...)` e `setAttribute('data-*', ...)`;
- `document.createElementNS(...)` para manter compatibilidade minima com SVG se o caminho de transporte for exercitado.

## 8. Seletores suportados

O harness suporta explicitamente:

- `.production-calendar-transport-connectors`
- `.production-calendar-transport-connector`
- `.production-calendar-card[data-allocation-id="..."]`
- seletores simples de classe no formato `.nome-da-classe`

Nao foi implementado parser CSS generico. Se outro seletor aparecer, o fake lanca erro para nao esconder divergencia estrutural.

## 9. Intencao do teste preservada

O teste continua validando:

- criacao do cabecalho diario;
- clique em dia util e sabado liberado;
- papel/atributos acessiveis do cabecalho clicavel;
- sabado liberado sem hachura de dia nao util;
- domingo como dia nao util;
- checkboxes de `manualWorkDates`;
- propagacao bloqueada no checkbox e na pilula de equipe;
- equipe por turno, override e estados `normal`, `attention`, `error` e `override`;
- produtividade diaria;
- alertas de estoque no cabecalho;
- CSS e textos estruturais relevantes.

## 10. Assertions mantidas ou fortalecidas

Nenhuma assertion foi removida ou enfraquecida.

Foram adicionadas verificacoes de harness:

- ausencia de `.production-calendar-transport-connectors` quando nao ha allocations de transporte;
- ausencia de `.production-calendar-transport-connector`;
- `querySelectorAll('.production-calendar-day-heading')` retorna a mesma quantidade obtida pela travessia manual.

## 11. Testes relacionados

Executados com sucesso:

```text
node --test tests/productionCalendarDayHeader.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/productionCalendarHorizon.test.js
node --test tests/productionCalendarStage.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/productionCalendarMemberships.test.js
node --test tests/productionCalendarConfigurationEdit.integration.test.js
node --test tests/ganttApsRenderer.test.js
```

## 12. Resultado isolado

Depois da alteracao:

```text
tests 1
pass 1
fail 0
```

## 13. Resultado da suite completa

Comando:

```text
node --test tests/*.js
```

Resultado:

```text
tests 51
pass 51
fail 0
```

## 14. Ausencia de alteracao produtiva

Nenhum arquivo produtivo foi alterado nesta missao. Os diffs finais de `shared/production-calendar/ProductionCalendarGrid.js` e `shared/production-calendar/productionCalendar.utils.js` nao receberam alteracoes da REF-015.

## 15. Classificacao arquitetural

Este teste continua temporariamente necessario enquanto o Calendario V2 existir. Ele protege um comportamento visual legado do V2 e nao deve orientar novas funcionalidades. No gate de exclusao do Calendario V2, deve ser removido ou migrado para cobertura neutra/Gantt quando houver regra ainda reaproveitada.

A correcao atual e somente estabilizacao do baseline automatizado. Ela nao homologa o Calendario V2 e nao substitui homologacao manual.

## 16. Riscos residuais

- O harness nao executa navegador real, layout real, SVG com medidas reais, drag real, backend, banco ou persistencia.
- O suporte de seletores e deliberadamente minimo.
- O caminho com transportes reais segue coberto apenas estruturalmente pelo contrato do grid e por testes relacionados, nao por este teste de cabecalho.

## 17. Arquivos alterados

- `tests/productionCalendarDayHeader.test.js`
- `docs/refactor/REF-015_PRODUCTION_CALENDAR_DAY_HEADER_HARNESS.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 18. Conclusao

REF-015 concluida. A falha original foi reproduzida, a ausencia de `querySelector` no mock foi confirmada, o contrato DOM minimo foi implementado no harness, a intencao do teste foi preservada e a suite completa fechou em 51/51 sem alteracao produtiva.
