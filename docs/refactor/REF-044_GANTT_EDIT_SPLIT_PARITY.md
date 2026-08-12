# REF-044 - Paridade de edit/split no Gantt APS

Data: 2026-08-12

## 1. Dependencia descoberta

A REF-043 desligou o fallback automatico Gantt APS -> Calendario V2, mas o Gantt ainda nao emitia intencoes de editar ou dividir allocation. A operacao continuava acessivel operacionalmente pelo Calendario V2 porque `PlanningPage.js` ja possuia `openProductionCalendarAllocationEditor(...)`, usando o editor neutro em `shared/planning-editor`.

## 2. Gate antes de alterar

| Item | Evidencia | Resultado |
|---|---|---|
| Gantt identifica inequivocamente a allocation | `planningScheduleTask` define `task.id` a partir de `allocation.allocationId`; as barras e rows usam `data-allocation-id = String(task.id)`. | Passou. |
| PlanningPage resolve a allocation pelo ID recebido | `openProductionCalendarAllocationEditor` resolve no draft manual e no snapshot; nesta REF passou a aceitar `allocation.allocationId ?? allocation.id`. | Passou. |
| Editor neutro suporta edicao | `PlanningAllocationEditor` monta payload `mode: 'edit'` e chama `onSave`. | Passou. |
| Editor neutro suporta split inicial | `PlanningAllocationEditor` recebe `startSplit` e chama `activateSplit()` quando permitido. | Passou. |
| Save continua pelo controller existente | `handleProductionCalendarAllocationSave` chama `runPlanningAllocationEditorController`. | Passou. |
| Solver nao precisa mudar | Renderer apenas emite callbacks; controller aplica transacao manual existente. | Passou. |

## 3. Contrato anterior do Gantt

`createGanttApsRenderer` recebia somente `onRequestMove`. Clique simples na barra apenas abria o painel de inspecao. Drag horizontal emitia `MOVE_ALLOCATION` via `onRequestMove`; o renderer nao tinha contrato para edit/split.

## 4. Contrato edit/split final

`createGanttApsRenderer` agora aceita callbacks opcionais neutros:

```js
onRequestEdit
onRequestSplit
```

O renderer nao edita, nao divide e nao chama services/controllers. Ele localiza a task por `data-allocation-id`, confirma capability, e emite a allocation/task correta uma unica vez:

```text
editar allocation -> onRequestEdit(task)
split allocation -> onRequestSplit(task)
```

## 5. UI minima

As acoes ficam no painel de inspecao da allocation do Gantt. O clique simples na barra continua sendo apenas inspecao; a edicao e o split exigem botoes explicitos.

## 6. Read-only

As acoes so aparecem quando:

- `model.capabilities.manualMove === true`;
- a task e persistivel;
- o respectivo callback foi informado.

Com `manualMove=false`, os botoes nao aparecem e os callbacks nao sao executados.

## 7. Prevencao de conflito com drag

Os botoes ficam fora de `.gantt-aps__bar`. O `pointerdown` do drag continua restrito a barras com `data-draggable="true"`. Interagir com editar/split nao inicia drag e nao dispara `onRequestMove`.

## 8. Integracao com PlanningPage

`PlanningPage.js` conecta:

```js
onRequestEdit: allocation => openProductionCalendarAllocationEditor(allocation)
onRequestSplit: allocation => openProductionCalendarAllocationEditor(allocation, { startSplit: true })
```

`openProductionCalendarAllocationEditor` tambem aceita a allocation vinda do Gantt por `id`, sem depender do renderer V2.

## 9. Testes

Foram atualizados:

- `tests/ganttApsRenderer.test.js`;
- `tests/productionCalendarEditButton.test.js`.

Cobertura adicionada:

- callbacks de edit/split no Gantt;
- callback chamado uma unica vez com a allocation correta;
- edit/split nao chamam move;
- pointerdown das acoes nao inicia drag;
- read-only nao expoe edit/split;
- renderer nao importa controller/service;
- `PlanningPage` conecta edit/split ao editor neutro;
- `PlanningAllocationEditor` e `runPlanningAllocationEditorController` seguem no fluxo de save;
- V2 continua fisicamente presente.

## 10. Blockers restantes para remocao do V2

- REF-013 homologacao manual.
- Remocao fisica do renderer V2, `ProductionCalendar`, grid/toolbar/details/drag/state e testes exclusivos V2.
- CSS V2 ou CSS compartilhado dos modais.
- Flags/config legado de selecao explicita V2.
- Helpers V2 puros restantes.
- `productiveMinutes`.
- Turnos/capacidade.
- Stock-only.
- Identidade manual restante.
- Autosave/descarte.
- `generatePlanningCode`.
