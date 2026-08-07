# REF-013 - Restaurar foco Fluxo Produtivo -> Gantt APS por allocationId

Data: 2026-08-06
Modo: correcao pequena e delimitada de orquestracao UI + lifecycle neutro.

## 1. Problema original

As falhas de `planningManualScheduleIntegration.test.js` e `planningScheduleRenderer.test.js` usavam a funcao antiga `focusCalendarCardFromFlow` como delimitador textual. Essa funcao havia sido removida no worktree atual. A remocao tambem deixou uma divergencia funcional: o clique no no do Fluxo Produtivo continuava abrindo detalhes, mas nao solicitava foco no renderer ativo.

## 2. Comportamento aprovado

O clique no no do fluxo deve:

1. resolver a allocation correspondente por `allocationId` canonico;
2. manter a abertura atual de detalhes do no;
3. chamar `planningScheduleRendererHost.focusAllocation(allocationId)`;
4. deixar o renderer ativo localizar, revelar e destacar a barra.

Se nenhuma allocation for resolvida, o detalhe continua abrindo e o foco e ignorado sem excecao.

## 3. Mapa do clique no fluxo

Antes da correcao:

```text
click/keydown em .production-flow-node
-> openFlowNodeDetailsModal(flowNode)
```

Depois da correcao:

```text
click/keydown em .production-flow-node
-> openFlowNodeDetailsModal(flowNode)
-> focusPlanningFlowAllocation({
     node: flowNode,
     allocations: currentProductionCalendarSnapshot()?.allocations,
     rendererHost: planningScheduleRendererHost
   })
-> rendererHost.focusAllocation(allocationId)
```

## 4. Resolucao de allocationId

A regra implementada em `resolvePlanningFlowAllocation` usa esta prioridade:

1. `flowAllocationId` direto, quando existir.
2. Matching por `operationId`, `parentOperationId`, `calendarParentOperationId` ou `splitParentOperationId`.
3. Fallback conservador por `materialId` + producao/membership quando o no nao possui identificador de operacao.
4. Sem correspondencia: retorna `null` e nao chama o host.

O no do fluxo passou a renderizar `data-flow-operation-ids` e `data-flow-production-ids`, alem dos dados que ja existiam (`materialId`, nome, quantidades e `productionIndexes`).

## 5. Multiplas partes

Quando a operacao possui mais de uma allocation/parte, a selecao e deterministica:

1. primeira nao concluida, quando o status for confiavel;
2. inicio cronologico mais cedo (`date/startDate` + `startTime`);
3. menor `splitPartOrder`, com fallback para `splitOrder`;
4. comparacao estavel por `allocationId`.

Nao ha dependencia da ordem incidental do array.

## 6. Lifecycle do renderer

`createPlanningScheduleRendererHost.focusAllocation(allocationId)` delega para o renderer ativo quando o metodo existe e retorna `true` somente quando o renderer confirma foco. Chamada antes de mount, depois de destroy ou contra renderer sem implementacao especifica retorna `false` sem excecao.

## 7. Comportamento do Gantt

O Gantt APS ja implementava `focusAllocation`:

- encontra a task por `id`/`allocationId`;
- expande o grupo da maquina quando recolhido;
- navega a pagina de linhas quando necessario;
- navega a lista de unplaced quando a allocation esta fora da janela;
- chama `inspect(allocationId)`;
- adiciona `is-flow-focused`;
- chama `scrollIntoView` e `focus`;
- remove o destaque por timer.

Esta missao nao reescreveu o renderer.

## 8. Preservacao do modal de detalhes

`openFlowNodeDetailsModal(flowNode)` permanece sendo chamado nos eventos de click e teclado. O foco no Gantt e complementar e uma falha nele nao impede o modal.

## 9. Sem correspondencia

Quando `resolvePlanningFlowAllocation` retorna `null`, `focusPlanningFlowAllocation` retorna `false` e nao chama `rendererHost.focusAllocation`.

## 10. Alteracoes implementadas

- `pages/PlanningPage.js`: adicionados helpers exportados para resolver/focar allocation do fluxo; nos renderizados passam a carregar operation/producao; eventos de click/teclado chamam o helper apos abrir detalhes.
- `shared/planning-schedule-view/planningScheduleRenderer.js`: `focusAllocation` passou a ser lifecycle opcional seguro.
- `tests/planningManualScheduleIntegration.test.js`: substituiu regex da funcao removida por harness comportamental de resolucao e foco.
- `tests/planningScheduleRenderer.test.js`: fortaleceu contrato do host para chamadas antes/depois de mount, troca, destroy e renderer sem foco.

## 11. Testes corrigidos

Antes:

```text
node --test tests/planningManualScheduleIntegration.test.js
-> AssertionError: harness do movimento manual deve existir

node --test tests/planningScheduleRenderer.test.js
-> regex /planningScheduleRendererHost?.focusAllocation(allocation.allocationId)/ nao encontrada
```

Depois:

```text
node --test tests/planningManualScheduleIntegration.test.js
-> 1 teste, 1 aprovado, 0 falhos

node --test tests/planningScheduleRenderer.test.js
-> 1 teste, 1 aprovado, 0 falhos
```

## 12. Testes relacionados

Executados e aprovados:

- `node --test tests/ganttApsRenderer.test.js`
- `node --test tests/planningScheduleViewModel.test.js`
- `node --test tests/planningAllocation.service.test.js`
- `node --test tests/productionCalendarMemberships.test.js`
- `node --test tests/productionCalendarEditButton.test.js`
- `node --test tests/productionCalendarGrid.test.js`
- `node --test tests/productionCalendarHorizon.test.js`
- `node --test tests/productionCalendarSplitEditor.test.js`
- `node --test tests/productionCalendarStage.test.js`
- `node --test tests/productionDisplayColor.test.js`
- `node --check pages/PlanningPage.js`
- `node --check shared/planning-schedule-view/planningScheduleRenderer.js`

## 13. Suite completa

Comando:

```text
node --test tests/*.js
```

Resultado:

```text
51 testes
49 aprovados
2 falhos
```

Falhas restantes esperadas:

- `planningManualStockPartialModal.test.js`
- `productionCalendarDayHeader.test.js`

## 14. Roteiro de homologacao manual

Pendente para execucao pelo Gu:

1. abrir uma simulacao com alocacoes no Gantt;
2. localizar um material no Fluxo Produtivo;
3. clicar no no;
4. confirmar que os detalhes abriram;
5. confirmar que o Gantt revelou a barra correspondente;
6. testar no fora do viewport;
7. testar producao dividida;
8. testar no sem alocacao;
9. confirmar que nenhuma data, maquina ou quantidade mudou;
10. confirmar que nenhuma reotimizacao foi executada.

## 15. Riscos residuais

- O fallback por material + producao e intencionalmente conservador, mas e menos forte que o matching por operationId. Por isso os novos `data-flow-operation-ids` sao a fonte preferencial.
- Transportes nao receberam regra nova; quando nao houver operationId no no, o fallback nao deve inventar relacao.
- Homologacao manual nao foi executada nesta missao.
- A suite ainda tem duas falhas conhecidas fora do escopo desta REF.

## 16. Arquivos alterados

- `pages/PlanningPage.js`
- `shared/planning-schedule-view/planningScheduleRenderer.js`
- `tests/planningManualScheduleIntegration.test.js`
- `tests/planningScheduleRenderer.test.js`
- `docs/refactor/REF-013_FLOW_TO_GANTT_FOCUS.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 17. Conclusao

Missao concluida. O fluxo produtivo voltou a solicitar foco no Gantt APS por `allocationId` canonico via host neutro, sem acesso direto ao DOM do Gantt pela pagina e preservando a abertura dos detalhes do no.
