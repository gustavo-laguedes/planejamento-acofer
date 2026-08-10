# REF-031 - Planning flow events extraction

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `f29c4fb382e38d6645eeb234c0672a8bb9c9f436`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 73 testes, 73 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6713 linhas

## 2. Auditoria dos eventos

| Bloco/funcao | Evento | Seletor | Dados extraidos | Acao atual | Pode receber callback? | Decisao |
|---|---|---|---|---|---|---|
| Listener delegado em `target` | `click` | ignora `[data-stock-only], .stock-only-toggle`; localiza `.production-flow-node[data-flow-material-id]` via `event.target.closest` | `node.dataset` completo do no do Flow | abre `openFlowNodeDetailsModal(flowNode)` e depois chama `focusFlowNodeInSchedule(flowNode)` | Sim, como ativacao unica do no | Extraido para `bindPlanningFlowEvents`; pagina manteve callback com modal + foco na mesma ordem |
| Listener delegado em `target` | `keydown` com `Enter` | localiza `.production-flow-node[data-flow-material-id]` via `event.target.closest` | `node.dataset` completo do no do Flow | executa `preventDefault()`, abre detalhes e depois solicita foco | Sim, como ativacao unica do no | Extraido para `bindPlanningFlowEvents`; `preventDefault` fica no modulo somente quando ha no valido |
| Listener delegado em `target` | `keydown` com `Space` (`' '`) | localiza `.production-flow-node[data-flow-material-id]` via `event.target.closest` | `node.dataset` completo do no do Flow | executa `preventDefault()`, abre detalhes e depois solicita foco | Sim, como ativacao unica do no | Extraido para `bindPlanningFlowEvents`; tecla preservada exatamente como string de espaco |
| Listener delegado em `target` | outras teclas | nenhum seletor apos rejeicao por tecla | nenhum | nao faz nada; nao chama `preventDefault` | Nao necessario | Mantido como no-op no modulo |
| Listener delegado em `target` | click fora do no | `.production-flow-node[data-flow-material-id]` nao encontrado | nenhum | nao faz nada | Nao necessario | Mantido como no-op no modulo |

## 3. Fronteira encontrada

A fronteira segura foi somente a identificacao e o encaminhamento dos eventos do Flow:

- receber `root` explicitamente;
- registrar listeners delegados de `click` e `keydown`;
- preservar seletores existentes;
- preservar `Enter` e `Space`;
- preservar `preventDefault` somente no teclado ativado e com no valido;
- extrair os `data-*` existentes via clone de `node.dataset`;
- chamar callback fornecido pela pagina.

Ficaram fora abertura de modal, `renderPlanFlowDetail`, resolucao de allocation, `focusPlanningFlowAllocation`, renderer/Gantt, draft/state, movimento manual, split, estoque operacional, API, persistencia, Calendario V2, turnos e capacidade.

## 4. Extracao realizada

Criado `shared/planning-presentation/planningFlowEvents.js`, sem `index.js`.

Funcoes exportadas:

- `extractPlanningFlowNodeData`
- `bindPlanningFlowEvents`

`pages/PlanningPage.js` passou a importar `bindPlanningFlowEvents` e manteve um callback local que chama, nesta ordem:

1. `openFlowNodeDetailsModal(flowNode)`
2. `focusFlowNodeInSchedule(flowNode)`

## 5. Contratos preservados

- Seletores preservados: `[data-stock-only], .stock-only-toggle` e `.production-flow-node[data-flow-material-id]`.
- `data-*` permanecem no markup original e sao repassados como clone de `node.dataset`.
- Click no no e em filhos do no continua ativando o no.
- Click no toggle de saldo continua bloqueando abertura de detalhes/foco.
- Click fora do no continua sem acao.
- `Enter` e `Space` continuam ativando o no.
- Outras teclas continuam sem acao e sem `preventDefault`.
- `preventDefault` continua restrito ao teclado ativado com no valido.
- A quantidade de chamadas por ativacao continua uma: um callback do modulo; dentro da pagina seguem modal e foco, na ordem anterior.
- Re-render continua compatível com listener delegado no `target`.
- Modo somente leitura nao ganhou atalho, markup, CSS ou acessibilidade nova.

## 6. Testes

Criado `tests/planningFlowEvents.test.js`, cobrindo:

- root ausente;
- click no no;
- click em filho do no;
- click no toggle de estoque;
- `Enter`;
- `Space`;
- tecla irrelevante;
- clique fora do no;
- `data-*` repassados corretamente;
- callback chamado uma unica vez;
- ausencia de modal, Gantt, renderer, API, draft/transacao no modulo.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-presentation/planningFlowEvents.js
node --check pages/PlanningPage.js
node --test tests/planningFlowEvents.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningFlowEvents`: 9/9 subtestes aprovados
- Suite ampla final: 82 testes, 82 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF em arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 6713 linhas
- Depois: 6707 linhas
- Reducao liquida: 6 linhas

## 9. Riscos e dividas

- Modal/detalhes do Flow continuam na `PlanningPage.js`.
- `renderPlanFlowDetail` continua na pagina.
- `resolvePlanningFlowAllocation` e `focusPlanningFlowAllocation` continuam na pagina por envolverem ponte Flow -> Gantt.
- REF-013 homologacao manual permanece pendente.
- Calendario V2, identidade do calendario manual, manual move/split, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
