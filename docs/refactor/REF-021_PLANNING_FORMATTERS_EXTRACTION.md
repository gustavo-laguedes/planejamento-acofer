# REF-021 - Planning formatters extraction

Data: 2026-08-07

## 1. Baseline anterior

- Branch inicial: `rebuild-production-calendar`
- HEAD inicial: `5f7b69c53e25bbc4d14c9bd2f4e3871c3661570c`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 51 testes, 51 aprovados e 0 falhos

## 2. Checkpoint de origem

- Commit-base oficial: `5f7b69c`
- Mensagem: `checkpoint: baseline funcional antes da reestruturacao do planejamento`
- Documento de gate consultado: `docs/refactor/REF-020_TECHNICAL_CHECKPOINT.md`

## 3. Funcoes analisadas

| Funcao | Linha atual antes | Consumidores | Dependencias | Pura? | Extrair? |
|---|---:|---|---|---|---|
| `formatDateOnly` | 213 | `formatPeriod`, calendario inline, toasts, Gantt/snapshot labels, modais, historico/detalhes | validacao civil por helper local copiado como privado no novo modulo | Sim | Sim |
| `formatPeriod` | 329 | `operationPeriod`, historico e detalhes de planos | `formatDateOnly` | Sim | Sim |
| `parsePtBrDecimal` | 348 | setup, turnos, transporte e validacoes de entrada da pagina | nenhuma externa | Sim | Sim |
| `escapeHtml` | 362 | HTML strings da pagina, modais, tabelas e atributos | nenhuma externa | Sim | Sim |
| `normalizeText` | 371 | ordenacao/comparacao textual, lookup de materiais, status de allocations | nenhuma externa | Sim | Sim |
| `normalizeJsonArray` | 423 | `operationPeriod`, operacoes de plano salvo e compatibilidade de arrays JSON | `JSON.parse` | Sim | Sim |
| `normalizeJsonObject` | 434 | leitura de arvore/schedule_tree e compatibilidade de objetos JSON | `JSON.parse` | Sim | Sim |
| `formatPtBrDecimal` | 445 | quantidades, estoque, fluxo, PDF/detalhes e tabelas | `Number#toLocaleString` | Sim | Sim |
| `formatPtBrInteger` | 455 | modais de estoque parcial e componentes inteiros | `Math.floor`, `Math.max`, `Number#toLocaleString` | Sim | Sim |

## 4. Funcoes realmente extraidas

Extraidas para `shared/planning-presentation/planningFormatters.js`:

- `formatDateOnly`
- `formatPeriod`
- `parsePtBrDecimal`
- `escapeHtml`
- `normalizeText`
- `normalizeJsonArray`
- `normalizeJsonObject`
- `formatPtBrDecimal`
- `formatPtBrInteger`

Nenhuma candidata aprovada foi mantida na `PlanningPage.js`.

## 5. Funcoes mantidas e motivo

- `isValidDateOnly` permaneceu na `PlanningPage.js` porque tambem e usado por `operationPeriod` e nao fazia parte do grupo aprovado para extracao. O novo modulo possui uma copia privada do mesmo helper apenas para preservar exatamente o comportamento de `formatDateOnly`, sem exportar novo contrato.

## 6. Novo modulo

- Arquivo: `shared/planning-presentation/planningFormatters.js`
- Importa: nada
- Acessa DOM/window/globalThis/localStorage/API/banco/Gantt/Calendario V2/draft/solver/estoque: nao
- Estado mutavel global: nenhum

## 7. Consumidores

- `pages/PlanningPage.js` agora importa os nove helpers do novo modulo.
- Consumidores locais da pagina foram preservados sem alteracao de chamada.
- Testes estaticos existentes que leem `PlanningPage.js` continuaram passando sem ajuste.

## 8. Testes adicionados

Criado `tests/planningFormatters.test.js`, importando diretamente o novo modulo e cobrindo:

- `formatDateOnly`: entrada valida, vazia/nula/undefined e formato invalido preservado.
- `formatPeriod`: periodo completo e extremos ausentes.
- `parsePtBrDecimal`: `1.234,56`, `1234,56`, `0`, numero, invalido, vazio e negativo.
- `escapeHtml`: `&`, `<`, `>`, `"`, `'` e texto sem especiais.
- `normalizeText`: acentos, espacos, maiusculas/minusculas, null/undefined e string vazia.
- `normalizeJsonArray`: array real, JSON de array, JSON invalido, objeto, null e vazio.
- `normalizeJsonObject`: objeto real, JSON de objeto, JSON invalido, array, null e vazio.
- `formatPtBrDecimal`: zero, positivo, decimal, negativo, precisao atual, null/undefined.
- `formatPtBrInteger`: zero, inteiro, decimal de entrada, negativo, null/undefined.

Observacao de compatibilidade: `parsePtBrDecimal('1234,56')` preserva o comportamento atual de interpretacao como valor semelhante a horas, retornando `1234 + 56 / 60`. `parsePtBrDecimal('1.234,56')` preserva o retorno decimal `1234.56`.

## 9. Resultado do teste focado

```text
node --test tests\planningFormatters.test.js
tests: 1
pass: 1
fail: 0
```

## 10. Resultado da suite

```text
node --test tests/*.js
tests: 52
pass: 52
fail: 0
```

## 11. PlanningPage antes/depois

- Linhas antes: 6863
- Linhas depois: 6804
- Reducacao liquida aproximada: 59 linhas
- Definicoes locais removidas: 9 funcoes, aproximadamente 79 linhas
- Imports adicionados: import nomeado de 9 helpers vindo de `../shared/planning-presentation/planningFormatters.js`

## 12. git diff --stat

Validacao final:

```text
PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md | 23 +++++-
pages/PlanningPage.js                              | 90 +++-------------------
2 files changed, 33 insertions(+), 80 deletions(-)
```

Observacao: como nao houve `git add`, o `git diff --stat` nativo nao contabiliza arquivos novos nao rastreados. Arquivos novos desta missao:

- `shared/planning-presentation/planningFormatters.js`
- `tests/planningFormatters.test.js`
- `docs/refactor/REF-021_PLANNING_FORMATTERS_EXTRACTION.md`

O `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md` tambem foi atualizado.

## 13. Riscos residuais

- Existem helpers homonimos em outras paginas e services; nao foram consolidados para nao ampliar o escopo.
- `parsePtBrDecimal` mantem comportamento historico estranho para strings no formato `1234,56`, tratado como horas quando os dois digitos finais sao `<= 59`.
- `isValidDateOnly` ficou duplicado como helper privado no novo modulo para evitar exportar funcao fora do grupo autorizado.
- Homologacao manual REF-013 permanece pendente; esta missao nao altera esse status.

## 14. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-presentation/planningFormatters.js`
- `tests/planningFormatters.test.js`
- `docs/refactor/REF-021_PLANNING_FORMATTERS_EXTRACTION.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 15. Conclusao

REF-021 concluida. A `PlanningPage.js` deixou de possuir as nove definicoes locais de formatacao/normalizacao aprovadas, passou a consumir um modulo neutro e testavel, e a suite completa permaneceu verde com zero falhas.
