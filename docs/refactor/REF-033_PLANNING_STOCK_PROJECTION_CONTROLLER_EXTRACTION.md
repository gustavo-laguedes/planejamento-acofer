# REF-033 - Extrair controlador read-only de projecao de estoque

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `14fa4a3`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 83 testes, 83 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6699 linhas

## 2. Auditoria

| Funcao/bloco | Papel | Service usado | Entrada | Saida | Muta draft? | DOM/modal? | Decisao |
|---|---|---|---|---|---|---|---|
| `getPlanningStockProjectionDay` | Seleciona a data da projecao e anexa alertas da mesma data | Nenhum direto | `projection`, `selectedDate` | Dia selecionado ou `null` | Nao | Nao | Extraida |
| `planningStockPcpStatus` | Classifica status PCP de material de venda a partir de saldo/cobertura/metas | Nenhum direto | Item de material, `minimumDays`, `idealDays` | Objeto `{ key, label, className }` | Nao | Nao | Extraida como helper interno do controlador |
| `buildPlanningStockModalModel` | Monta modelo read-only do modal separando venda/producao, resumo e alertas | Nenhum direto | `projection`, data, catalogo, thresholds explicitos | Modelo do modal ou `null` | Nao | Nao | Extraida; origem localStorage ficou na pagina |
| `buildPlanningStockCalendarAlert` | Monta badge/resumo de alertas de estoque no calendario | Nenhum direto | `projection`, data, catalogo, thresholds explicitos | Alerta agregado ou `null` | Nao | Nao | Extraida |
| `refreshPlanningStockProjection` | Orquestra contexto atual e recalcula projecao read-only | `projectPlanningStockByDay` | `currentSimulation`, snapshot, estoque de validacao, materiais, draft, politica | Projecao corrente | Nao | Reabre modal se ja estava aberto | Parcialmente extraida: montagem/projecao foi para `buildPlanningStockProjection`; DOM permaneceu na pagina |
| `openPlanningStockProjectionModal` | Renderiza modal, DataTable, eventos de fechar e foco | Modelo extraido via controlador | Data selecionada e estado da pagina | DOM do modal | Nao | Sim | Mantida na pagina |
| `readStockMinimumDays` / `readPcpIdealDays` | Le thresholds configurados no browser | Nenhum | `localStorage` | Dias minimos/ideais | Nao | Nao | Mantidas na pagina; origem browser nao foi levada ao controlador |
| `stockProjectionSalesPerDay` / `stockProjectionDurationDays` | Suporte ao fluxo legado de analise/projecao por API | API read-only `/planning/analysis/stock-projection` | Linha de API | Valores auxiliares | Nao | Nao | Mantidas; fora do bloco seguro da projecao do calendario |

## 3. Fronteira encontrada

Fronteira segura:

- controlador neutro em `shared/planning-controller/planningStockProjectionController.js`;
- dependencia explicita no service canonico `services/planningStockProjection.service.js`;
- entradas explicitas para simulacao atual, snapshot, estoque de validacao, materiais, draft e politica;
- thresholds de apresentacao (`minimumDays`, `idealDays`) recebidos como parametro;
- `PlanningPage.js` continua dona de `localStorage`, DOM, modal, DataTable, foco e toast;
- exportacoes publicas antigas da `PlanningPage.js` foram preservadas por re-export.

Ficaram fora:

- `planningManualStockPartialModal`;
- stock-only move, `stockOnlyChecked`, `stockOnlyChoice` e toggle de estoque do Flow;
- `manualScheduleDraft` como estado mutavel;
- split/editor, transporte, persistencia/save, solver/reotimizacao, Gantt, Calendario V2;
- `productiveMinutes`, `generatePlanningCode`, turnos/capacidade;
- services existentes.

## 4. Extracao realizada

Criado `shared/planning-controller/planningStockProjectionController.js`, sem `index.js`.

`pages/PlanningPage.js` deixou de importar diretamente `projectPlanningStockByDay` e passou a importar:

- `buildPlanningStockProjection`;
- `buildPlanningStockModalModel`;
- `buildPlanningStockCalendarAlert`.

`PlanningPage.js` reexporta `getPlanningStockProjectionDay`, `buildPlanningStockModalModel` e `buildPlanningStockCalendarAlert` para compatibilidade com testes/consumidores existentes.

## 5. Contratos preservados

- Materiais, IDs, ordem e agrupamento por venda/producao.
- Datas via `String(selectedDate || '').slice(0, 10)`.
- Fallback de material comercial: somente `permits_sales === false` bloqueia venda.
- `currentStock` continua vindo do `openingStock` do primeiro dia quando disponivel.
- Consumo produtivo acumulado continua somando dias `<=` data selecionada.
- Saldo negativo e status `NEGATIVE`/`CRITICAL` nao sao mascarados.
- Entrada vazia continua retornando `null`.
- A projecao continua usando `manualScheduleDraft.allocations` quando existir; caso contrario usa `snapshot.allocations`.
- O controlador nao chama API de gravacao, nao persiste, nao move allocation, nao altera draft, nao chama solver e nao reotimiza.

## 6. Testes

Criado `tests/planningStockProjectionController.test.js`, cobrindo:

- entrada vazia;
- material unico e multiplos materiais;
- projecao com falta;
- projecao sem falta;
- ordem de datas/materiais;
- preservacao de IDs;
- nao mutacao das entradas congeladas;
- selecao de allocations do draft em vez do snapshot;
- modelo do modal e alerta agregado.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-controller/planningStockProjectionController.js
node --check pages/PlanningPage.js
node --test tests/planningStockProjectionController.test.js
node --test tests/planningStockProjection.service.test.js
node --test tests/planningStockProjectionModal.test.js
node --test tests/materialStockMetrics.service.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningStockProjectionController`: OK
- Testes canonicos de estoque/projecao/modal: OK
- Suite ampla final: 84 testes, 84 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF em arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 6699 linhas
- Depois: 6610 linhas
- Reducao liquida: 89 linhas

## 9. Riscos e dividas

- O DOM do modal de estoque projetado continua na `PlanningPage.js`.
- Os thresholds de estoque continuam vindo de `localStorage` na pagina.
- Fluxos de movimento/decisao de estoque permanecem intocados e pendentes.
- REF-013 homologacao manual permanece pendente.
- Stock-only/movimento de estoque, Calendario V2, identidade do calendario manual, manual move/split, transporte, persistencia, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
