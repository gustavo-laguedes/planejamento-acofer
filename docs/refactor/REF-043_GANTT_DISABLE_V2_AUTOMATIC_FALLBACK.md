# REF-043 - Desligar fallback automatico Gantt APS -> Calendario V2

Data: 2026-08-10

## 1. Baseline

- Branch: `rebuild-production-calendar`
- HEAD: `78a795a`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 98 testes, 98 aprovados e 0 falhas

## 2. Auditoria do renderer

| Fluxo | Comportamento atual | Usa fallback V2? | Comportamento apos REF-043 | Decisao |
|---|---|---|---|---|
| Mount do Gantt | `PlanningPage.js` cria host e chama `mount(..., { renderer: globalThis.PLANNING_SCHEDULE_RENDERER || 'auto' })`; `auto` resolve `gantt-aps`. | Sim, se `createAndMount('gantt-aps')` falhar. | `auto/default` continua resolvendo `gantt-aps`; erro de mount e propagado. | Remover fallback automatico. |
| Update do Gantt | `planningScheduleRendererHost.update(model)` chama `activeRenderer.update`. | Sim, se update falhar e renderer ativo nao for o fallback. | Update falho destroi o Gantt parcial e propaga o erro. | Remover fallback automatico. |
| Erro durante criacao | Factory ausente/invalida ou excecao em `factory()` cai no `catch` de `createAndMount`. | Sim, quando renderer selecionado nao era V2. | Candidate parcial e destruido quando existir; erro propagado. | Nao criar V2. |
| Erro durante mount | `candidate.mount` falha; host chama `safeDestroy(candidate)`, reporta `onLifecycleError` e depois montava V2. | Sim. | `safeDestroy(candidate)` e `onLifecycleError` preservados; erro original propagado. | Cleanup preservado, fallback removido. |
| Erro durante update | Host destruia renderer ativo, zerava estado, reportava erro e montava V2. | Sim. | Host destroi renderer ativo, zera `activeRenderer`/`activeRendererId`, reporta erro e propaga erro. | Cleanup preservado, fallback removido. |
| Destroy apos falha | `safeDestroy` ja protegia erro de destroy com `console.warn`. | Indiretamente, antes de montar V2. | `safeDestroy` permanece igual. | Manter. |
| Selecao explicita V2 | `production-calendar-v2` e aceito por `normalizePlanningScheduleRenderer` e registrado em `PlanningPage.js`. | Nao e fallback; e escolha explicita. | Permanece funcionando temporariamente. | Preservar legado explicito nesta REF. |
| Modo auto/default | `resolvePlanningScheduleRenderer('auto')` escolhe Gantt, salvo `autoPolicy` explicita para V2. | Sim, se Gantt falhar. | Escolhe Gantt e nao monta V2 em falha. `autoPolicy` explicita para V2 ainda caracteriza caminho legado. | Preservar selecao, desligar fallback. |

## 3. Cadeia antes

```text
PlanningPage.renderProductionCalendar
-> buildProductionCalendarSnapshot
-> buildPlanningScheduleViewModel
-> createPlanningScheduleRendererHost
-> mount/update Gantt APS
-> erro no lifecycle
-> safeDestroy(renderer falho)
-> onLifecycleError
-> mountFallback(production-calendar-v2)
-> createProductionCalendarV2Renderer
-> ProductionCalendar
```

## 4. Cadeia depois

```text
PlanningPage.renderProductionCalendar
-> buildProductionCalendarSnapshot
-> buildPlanningScheduleViewModel
-> createPlanningScheduleRendererHost
-> mount/update Gantt APS
-> sucesso: continua Gantt APS
-> erro no lifecycle: safeDestroy(renderer falho) + onLifecycleError + throw
```

Nao ha transicao automatica para `production-calendar-v2` apos erro do Gantt.

## 5. Gate antes de alterar

| Item | Evidencia | Resultado |
|---|---|---|
| Gantt APS e o renderer default | `resolvePlanningScheduleRenderer('auto')` e `resolvePlanningScheduleRenderer(undefined)` retornam `gantt-aps`; `PlanningPage.js` usa `globalThis.PLANNING_SCHEDULE_RENDERER || 'auto'`. | Passou. |
| V2 nao e necessario para montar planejamento saudavel | `tests/ganttApsRenderer.test.js` monta o Gantt com modelo valido; suite baseline 98/98. | Passou para evidencia automatizada estrutural. |
| Editor/split compartilhados nao exigem V2 | `PlanningPage.js` importa `PlanningAllocationEditor` de `shared/planning-editor`; REF-042 registrou wrappers V2 apenas para compatibilidade. | Passou. |
| Adapter, cor e helpers neutros necessarios ao Gantt estao desacoplados | Gantt importa cor de `shared/planning-presentation/productionDisplayColor.js` e maquina de `shared/planning-schedule/planningMachineOrder.js`; `PlanningPage.js` importa adapter/dias de `shared/planning-schedule`. | Passou. |

## 6. Alteracao realizada

- `shared/planning-schedule-view/planningScheduleRenderer.js`
  - removeu `mountFallback`;
  - `mount` agora cria somente o renderer selecionado e propaga erro;
  - `update` preserva cleanup do renderer falho, reporta `onLifecycleError` e propaga erro;
  - API publica do host segue aceitando objeto de opcoes e selecao por renderer.
- `pages/PlanningPage.js`
  - mensagem de lifecycle deixou de afirmar rollback para Calendario V2.
- `tests/planningScheduleRenderer.test.js`
  - passou a proteger default/auto em Gantt;
  - Gantt saudavel nao toca V2;
  - erro de mount/update do Gantt nao cria nem monta V2;
  - cleanup do renderer falho continua executando;
  - selecao explicita V2 segue caracterizada;
  - `fallbackRenderer` legado nao reativa fallback silencioso.

## 7. Tratamento de erro e cleanup

- Erro de criacao/mount: `safeDestroy(candidate)` continua sendo chamado quando houver candidate parcial.
- Erro de update: renderer ativo e destruido, `activeRenderer` e `activeRendererId` voltam a `null`, `onLifecycleError` recebe `{ error, rendererId, phase: 'update' }` e o erro original e relancado.
- `safeDestroy` continua capturando falhas de `destroy` e registrando `console.warn`.
- Nenhum erro do Gantt e mascarado por V2.

## 8. Compatibilidade V2 restante

- `PLANNING_SCHEDULE_RENDERERS.PRODUCTION_CALENDAR_V2` permanece no enum.
- `normalizePlanningScheduleRenderer('production-calendar-v2')` permanece valido.
- `resolvePlanningScheduleRenderer('auto', { autoPolicy: () => 'production-calendar-v2' })` ainda caracteriza selecao explicita por politica.
- `PlanningPage.js` ainda registra factory `production-calendar-v2`.
- `createProductionCalendarV2Renderer` e `ProductionCalendar` permanecem fisicamente no repositorio.

## 9. Testes

Executados:

```text
node --check shared/planning-schedule-view/planningScheduleRenderer.js
node --check pages/PlanningPage.js
node --test tests/planningScheduleRenderer.test.js
node --test tests/ganttApsRenderer.test.js
node --test tests/productionCalendarGrid.test.js
node --test tests/productionCalendarEditButton.test.js
node --test tests/productionCalendarSplitEditor.test.js
node --test tests/*.js
git diff --check
```

Resultado final: 98/98 ou maior, zero falhas.

## 10. Homologacao

Homologacao operacional manual em browser nao executada nesta REF.

Homologacao estrutural/read-only: o contrato de erro agora e observavel por teste automatizado e por propagacao do lifecycle no host. A REF nao altera services, solver, persistencia, estoque, movimento manual, split, CSS ou renderer Gantt.

## 11. Blockers restantes para apagar V2

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
