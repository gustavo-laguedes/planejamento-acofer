# REF-050 - Neutralizacao do CSS do editor de alocacao

Data: 2026-08-12

## 1. Baseline

- Branch esperada/encontrada: `rebuild-production-calendar`
- HEAD esperado/encontrado: `2d467d8`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Seletores auditados

| Seletor | Editor neutro | V2 fisico | Compartilhado | Acao |
|---|---|---|---|---|
| `.production-calendar-editor-backdrop` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-modal` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-unified-editor-modal` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-split-editor-modal` | Sim | Nao | Classe modificadora sem regra propria | Preservada no DOM; coberta por `.production-calendar-editor-modal` |
| `.production-calendar-editor-header` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-close` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-scroll` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-summary` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-summary-editable` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-lineage` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-form` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-fields` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-preview` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-split-preview` | Sim | Nao | Classe modificadora sem regra propria | Preservada no DOM; coberta por `.production-calendar-editor-preview` |
| `.production-calendar-editor-split-toggle` | Sim | Nao | Classe de hook sem regra propria | Preservada no DOM; estilo vem de `.secondary-button` global |
| `.production-calendar-editor-distribution` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-distribution-header` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-parts` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-part` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-part-result` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |
| `.production-calendar-editor-error` | Sim | Nao | Era compartilhado por arquivo | Copiado para CSS neutro |

Data selectors auditados: `data-editor-preview`, `data-editor-cancel`, `data-split-add`, `data-split-equal`, `data-split-cancel`, `data-split-preview`, `data-part-capacity`, `data-part-quantity`, `data-part-remove`.

## 3. Dependencias indiretas

- Variaveis CSS: nenhuma das regras extraidas depende de variaveis.
- Seletores pais: somente combinadores internos do proprio editor, como `.production-calendar-editor-summary > div`, `.production-calendar-editor-form label` e `.production-calendar-editor-preview strong`.
- Classes globais: `primary-button`, `secondary-button` e `link-button` continuam vindo do CSS global; nao eram definidas em `production-calendar.css`.
- Media queries: copiadas as duas queries que afetam o editor, `max-width: 520px` e `max-width: 900px`.
- Estados: copiado `.production-calendar-editor-distribution[hidden]`; demais `hidden`, `disabled` e `readOnly` seguem por atributos nativos ou CSS global, como antes.
- Pseudo-elementos/keyframes: nenhum bloco do editor dependia de pseudo-elementos ou keyframes.
- Bloco excluido: `.production-calendar-editor-limit`, porque os editores neutros atuais nao usam esse seletor.

## 4. CSS antes/depois

Antes:

```text
PlanningPage.js
-> ensurePlanningAllocationEditorCss()
-> shared/planning-editor/planningAllocationEditorCss.js
-> ../production-calendar/production-calendar.css
```

Depois:

```text
PlanningPage.js
-> ensurePlanningAllocationEditorCss()
-> shared/planning-editor/planningAllocationEditorCss.js
-> ./planning-allocation-editor.css
```

## 5. Loader

- Antes: `link[data-production-calendar-css="true"]` e `../production-calendar/production-calendar.css`.
- Depois: `link[data-planning-allocation-editor-css="true"]` e `./planning-allocation-editor.css`.
- Idempotencia preservada por busca de `<link>` antes de inserir.
- Auditoria: `data-production-calendar-css` permanece apenas no loader legado de `shared/production-calendar/index.js`, sem consumidor no editor neutro.

## 6. Duplicacao temporaria

`production-calendar.css` nao foi apagado e manteve os blocos originais. A duplicacao e temporaria porque componentes fisicos/testes V2 ainda existem e seguem fora do escopo desta REF.

## 7. Equivalencia visual estrutural

Foram extraidas as mesmas declaracoes de modal, backdrop, largura, altura maxima, scroll, formulario, summary, preview, distribution, parts, erro, footer, z-index e responsividade usadas pelo editor. Nao houve redesign, renome em massa de classe, alteracao de DOM, alteracao de callback ou mudanca produtiva.

## 8. Gate

- Editor neutro nao importa JS V2.
- Split editor neutro nao importa JS V2.
- Loader neutro nao referencia `production-calendar.css`.
- Loader neutro referencia `planning-allocation-editor.css`.
- `production-calendar.css` continua existindo.
- Classes textuais `production-calendar-editor-*` foram preservadas temporariamente no DOM e no CSS neutro.
- Nenhum service, solver, reotimizacao, scheduler, persistencia, estoque ou transacao foi alterado.

## 9. Testes

Executados:

```text
node --check pages/PlanningPage.js
node --check shared/planning-editor/planningAllocationEditorCss.js
node --check shared/planning-editor/PlanningAllocationEditor.js
node --check shared/planning-editor/PlanningAllocationSplitEditor.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/*.js
git diff --check
```

Resultado final:

- checks sintaticos aprovados;
- testes focados aprovados;
- suite completa com 98 testes, 98 aprovados e 0 falhas;
- `git diff --check` sem erros, apenas avisos conhecidos de futura conversao LF -> CRLF.

## 10. Blockers restantes

- Remocao fisica de `production-calendar.css` depende de missao propria para componentes/testes V2.
- Wrappers legados `ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js` ainda existem.
- Componentes fisicos `ProductionCalendar.js`, grid, card, toolbar, details, drag/state e validation continuam presentes.
- Helpers sensiveis em `productionCalendar.utils.js` ainda sao usados pelo snapshot do Planejamento.
- REF-013 segue pendente de homologacao operacional; nao foi marcada como homologada.
