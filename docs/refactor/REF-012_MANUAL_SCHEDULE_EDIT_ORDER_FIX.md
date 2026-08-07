# REF-012 - Preservar posicao ao editar allocation no draft manual

Data: 2026-08-06
Modo: correcao pequena e delimitada no draft manual.

## 1. Problema original

`tests/manualScheduleAllocationSplit.service.test.js` falhava no cenario de edicao localizada de uma parte dividida.

Depois de `splitDraftAllocation`, a parte `local-edit:part-1` ficava no indice 0 e sua irma `local-edit:part-2` no indice 1. Ao chamar `editDraftAllocation` para `local-edit:part-1`, o servico removia a parte editada e reinseria a versao alterada no final do array. O teste continuava lendo o indice original e encontrava a parte irma.

## 2. Reproducao

Comando:

```bash
node --test tests/manualScheduleAllocationSplit.service.test.js
```

Resultado anterior: 13 testes, 12 aprovados e 1 falho.

Erro:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
30.25 !== 42.35
```

## 3. Contrato funcional aprovado

A edicao de uma allocation existente deve substituir essa allocation na mesma posicao do array do draft manual.

A edicao nao pode remover a allocation e adiciona-la ao final como efeito colateral. A ordem somente deve mudar quando uma operacao explicitamente responsavel por ordenar, mover, dividir ou reconstruir a colecao fizer isso.

## 4. Comportamento anterior

Evidencia minima antes da correcao:

```json
{
  "targetId": "local-edit:part-1",
  "beforeIndex": 0,
  "afterIndex": 1,
  "siblings": ["local-edit:part-2"],
  "before": [
    { "i": 0, "id": "local-edit:part-1", "qty": 2117.5, "cap": 30.25, "machine": "machine-1", "order": 1, "path": "1" },
    { "i": 1, "id": "local-edit:part-2", "qty": 2117.5, "cap": 30.25, "machine": "machine-1", "order": 2, "path": "2" }
  ],
  "after": [
    { "i": 0, "id": "local-edit:part-2", "qty": 2117.5, "cap": 30.25, "machine": "machine-1", "order": 2, "path": "2" },
    { "i": 1, "id": "local-edit:part-1", "qty": 2117.5, "cap": 42.35, "machine": "machine-2", "order": 1, "path": "1" }
  ],
  "beforeTotal": 4235,
  "afterTotal": 4235
}
```

## 5. Comportamento corrigido

`editDraftAllocation` usa o `allocationId` canonico para localizar a allocation alvo e substitui somente o elemento correspondente. O array nao e ordenado globalmente e os demais elementos permanecem nas mesmas posicoes.

No teste fortalecido, o alvo fica no indice 1, com uma allocation anterior e outra posterior no draft. A edicao preserva:

- item anterior no indice 0;
- parte editada no indice 1;
- parte irma no indice 2;
- item posterior no indice 3.

## 6. Indice antes e depois

- Indice original da parte editada: `1` no teste fortalecido.
- Indice depois da edicao: `1`.
- Antes da correcao, no cenario isolado minimo, `local-edit:part-1` mudava de `0` para `1`.

## 7. Estrategia implementada

O bloco que fazia `others = allocations.filter(...)` e depois `nextAllocations = [...others, edited]` foi substituido por `allocations.map(...)`, trocando apenas o item cujo `allocationId` bate com o identificador normalizado.

No caminho de `capacityDecision === 'split'`, a parte preenchida tambem substitui a allocation original no mesmo indice; o excedente continua seguindo a logica existente de `findNextPlacement`.

## 8. IDs preservados

Verificado no teste:

- `allocationId`;
- `operationId`;
- `productionId`;
- `splitGroupId`;
- `splitRootAllocationId`;
- `splitParentAllocationId`;
- `splitOrder`;
- `splitPartOrder`, quando presente;
- `splitDepth`;
- `splitPath`.

## 9. Invariantes da divisao

Verificado no teste:

- a parte editada continua associada a `allocation-original`;
- a parte irma permanece byte a byte igual ao snapshot anterior;
- a quantidade total das partes permanece `4235`;
- nenhuma allocation some;
- nenhuma allocation extra e criada no caminho de edicao comum;
- nenhum `allocationId` duplicado e criado.

## 10. Quantidades e componentes

Verificado:

- quantidade da parte editada: `2117.5`;
- capacidade recalculada da parte editada: `42.35`;
- parte irma nao recebe a capacidade editada;
- soma das quantidades das partes: `4235`;
- soma dos componentes das partes: `4235`;
- componente da parte editada permanece proporcional e com `allocationId` da parte editada;
- precisao preservada ate seis casas decimais nas somas assertadas.

## 11. Testes alterados

Alterado:

- `tests/manualScheduleAllocationSplit.service.test.js`.

O teste existente nao foi enfraquecido. Ele foi fortalecido para provar explicitamente preservacao de indice, ordem dos demais itens, identidade, linhagem, quantidade, componentes, parte irma e duplicidade de IDs.

## 12. Comandos executados

Antes da alteracao:

```bash
git status --short
git diff --stat
node --test tests/manualScheduleAllocationSplit.service.test.js
node -e "...split/edit inspection..."
```

Depois da alteracao:

```bash
node --test tests/manualScheduleAllocationSplit.service.test.js
node tests/manualScheduleDraft.service.test.js
node tests/manualScheduleEditCapacityOverride.test.js
node tests/manualScheduleTransaction.service.test.js
node tests/manualScheduleHistory.service.test.js
node tests/manualSchedulePersistence.service.test.js
node tests/planningManualScheduleSaveLoad.integration.test.js
node tests/planningCutoffSnapshot.integration.test.js
node tests/planningDailyTeamOverride.integration.test.js
node tests/planningReoptimization.service.test.js
node tests/productionCalendarConfigurationEdit.integration.test.js
node tests/automaticSimulationBaseline.service.test.js
node tests/planningManualScheduleIntegration.test.js
node tests/productionCalendarMemberships.test.js
node tests/productionCalendarStage.test.js
node tests/productionCalendarSplitEditor.test.js
node --test tests/*.js
git diff -- services/manualScheduleDraft.service.js
git diff -- tests/manualScheduleAllocationSplit.service.test.js
git status --short
```

## 13. Resultado isolado

Comando:

```bash
node --test tests/manualScheduleAllocationSplit.service.test.js
```

Resultado final: 13 testes, 13 aprovados e 0 falhos.

## 14. Resultado da suite completa

Comando:

```bash
node --test tests/*.js
```

Resultado final:

```text
51 testes
47 aprovados
4 falhos
```

Falhas restantes:

1. `planningManualScheduleIntegration.test.js`
2. `planningManualStockPartialModal.test.js`
3. `planningScheduleRenderer.test.js`
4. `productionCalendarDayHeader.test.js`

## 15. Riscos residuais

- A suite base ainda nao esta verde; o gate de extracao da `PlanningPage.js` permanece bloqueado.
- `tests/manualScheduleAllocationSplit.service.test.js` esta nao rastreado no Git, portanto `git diff -- tests/manualScheduleAllocationSplit.service.test.js` nao mostra o patch do arquivo.
- O diff de `services/manualScheduleDraft.service.js` contem historico amplo pre-existente no worktree; a mudanca desta missao ficou restrita ao bloco de `editDraftAllocation`.
- A homolgacao operacional visual nao foi executada porque a missao nao altera UI.

## 16. Arquivos alterados

- `services/manualScheduleDraft.service.js`
- `tests/manualScheduleAllocationSplit.service.test.js`
- `docs/refactor/REF-012_MANUAL_SCHEDULE_EDIT_ORDER_FIX.md`
- `PLANO_MESTRE_REESTRUTURACAO_PLANEJAMENTO_ACOFER.md`

## 17. Conclusao

Missao concluida. A falha original foi reproduzida, a causa foi confirmada em `editDraftAllocation`, o contrato de preservacao de posicao foi formalizado e o teste isolado passou. A suite completa evoluiu de 51 testes, 46 aprovados e 5 falhos para 51 testes, 47 aprovados e 4 falhos, sem ordenacao global e sem alterar regras de movimentacao, Gantt, Calendario V2, persistencia, estoque, banco ou APIs.
