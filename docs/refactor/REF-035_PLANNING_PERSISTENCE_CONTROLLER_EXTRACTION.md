# REF-035 - Auditar e extrair controlador de persistencia do planejamento manual

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `815c74c`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 85 testes, 85 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6265 linhas

## 2. Auditoria

| Funcao/bloco | Papel | Service usado | Entrada | Saida | Muta draft? | UI/DOM? | API direta? | Decisao |
|---|---|---|---|---|---|---|---|---|
| `saveDraftNow` | Autosave local do draft completo | Nenhum service direto | Estado fechado da pagina | `localStorage` atualizado | Nao diretamente | Nao | Nao | Mantida na pagina por depender de `DRAFT_KEY`, `localStorage` e estado fechado amplo |
| `queueAutosave` | Debounce de autosave | Nenhum | Timer e `saveDraftNow` | Agenda escrita local | Nao | Nao | Nao | Mantida; extracao ampliaria lifecycle/timer |
| `discardAllProductionCalendarChanges` | Descarte de alteracoes manuais e persistencia remota/local | `persistAutomaticBaselineDiscard`, baseline automatico | `currentAutomaticBaseline`, `manualScheduleDraft`, `savedPlanningRevision` | Estado restaurado apos sucesso | Sim, somente apos persistir | Sim, re-render/toast | Via callback `api` interno | Mantida; ordem persistir -> aplicar estado e fallback `DELETE`/`PUT` e muito sensivel |
| `prepareAutomaticBaselineDiscard` | Prepara restauracao pela baseline persistida | `restoreAutomaticSimulationBaseline`, validacao transacional indireta | `currentAutomaticBaseline` | Simulacao + draft limpo | Nao | Nao | Nao | Mantida por acoplamento com baseline/descarte |
| `prepareCurrentSimulationManualDiscard` | Fallback de descarte baseado na simulacao atual | Adapter V2 e baseline | `currentSimulation`, `manualScheduleDraft` | Simulacao + draft limpo | Nao | Nao | Nao | Mantida por acoplamento com adapter e fallback visual/operacional |
| Montagem de payload `POST /planning/plans` | Prepara save de plano novo com calendario manual | Contrato consumido por rota/server services | `draft`, `lastPayload`, `manualScheduleDraft`, autorizacao de estoque | Body HTTP preservado | Nao | Nao | Nao | Extraida para `buildManualScheduleCreatePayload` |
| Montagem de payload `PUT /manual-schedule` | Prepara update manual com controle otimista | Contrato consumido por rota/server services | `draft.savedPlanningRevision`, `manualScheduleDraft`, `currentSimulation` | Body HTTP com `expectedRevision` | Nao | Nao | Nao | Extraida para `buildManualScheduleUpdatePayload` |
| `launchPlanning` save manual | Orquestra autorizacao, create/update e sucesso/erro | Persistencia via callbacks `persistCreate`/`persistUpdate` | Estado da pagina + callbacks | Resultado salvo ou cancelado | Limpa estado so apos sucesso, na pagina | Sim, botao/modal/toast/render | Sim, mas apenas no wrapper da pagina | Parcialmente extraida como `savePlanningManualSchedule`; efeitos visuais mantidos |
| `reopenSavedPlan` normalizacao/aplicacao inicial | Converte detalhe carregado em estado de pagina | `normalizePersistedManualScheduleDraft` | Detalhe de `GET /planning/plans/:id` | `draft`, `lastPayload`, `currentSimulation`, `manualScheduleDraft` | Aplica draft na pagina apos retorno do controller | Sim, historico/render/toast | Nao | Extraida a montagem para `buildLoadedPlanningManualScheduleState`; aplicacao visual ficou na pagina |
| Conflito `expectedRevision`/409 | Erro de concorrencia em save/delete | Rota/backend e service de persistencia | Erro do callback remoto | Erro propagado para wrapper da pagina | Nao | Toast na pagina | Nao no controller | Preservado; controller nao converte 409 em sucesso |
| Validacao pre-save em fluxo de evento | Revalida draft antes de abrir/salvar | `applyManualScheduleTransaction` | `manualScheduleDraft`, contexto | Draft validado | Sim, somente se aceito | Sim | Nao | Mantida na pagina; controller nao cria validacao produtiva |
| Historico/auditoria relacionados | Reset de history local e auditoria server-side | `manualScheduleHistory`; auditoria no backend | Resultado salvo/carregado | Historico/reset e logs server | Sim no estado da pagina | Sim | Backend atual | Mantidos; auditoria continua no backend |

## 3. Fronteira encontrada

Fronteira segura:

- `shared/planning-controller/planningPersistenceController.js`;
- montagem de payload de create/update preservando campos e `expectedRevision`;
- orquestracao de save por callbacks explicitos `persistCreate`, `persistUpdate` e `requestStockAuthorization`;
- montagem do estado de reopen a partir do detalhe carregado e de `normalizePersistedManualScheduleDraft`;
- sem `document`, `window`, `localStorage`, `sessionStorage`, `fetch`, import de `api`, DOM, modal ou renderer.

Fronteira rejeitada nesta REF:

- autosave local e debounce;
- descarte total de alteracoes manuais;
- aplicacao visual pos-save;
- reset de historico, fechamento de modal, toast, navegacao e render;
- criacao de baseline automatica no reopen;
- pre-validacao produtiva por `applyManualScheduleTransaction`;
- qualquer mudanca em service, rota, banco, schema, endpoint, payload server-side, hash ou revision.

## 4. Extracao realizada

Criado `shared/planning-controller/planningPersistenceController.js` com:

- `buildManualScheduleCreatePayload`;
- `buildManualScheduleUpdatePayload`;
- `savePlanningManualSchedule`;
- `buildLoadedPlanningManualScheduleState`.

`PlanningPage.js` passou a importar o controller e manteve wrappers para:

- `api`;
- `localStorage`;
- botao/loading;
- modal/backdrop;
- `manualScheduleHistory`;
- toast;
- `activeTab`/`sessionStorage`;
- `render`;
- `createAutomaticSimulationBaseline`;
- `buildProductionCalendarSnapshot`.

## 5. Contratos preservados

- `expectedRevision` continua `Number(draft.savedPlanningRevision || 0)` no update manual.
- Endpoint `PUT /planning/plans/:id/manual-schedule` preservado.
- Endpoint `POST /planning/plans` preservado.
- Payload de create preserva `lastPayload`, `manualScheduleDraft`, `manualScheduleValidation`, `setupMinutes`, `minimumStartRatio`, `dependencyCompletionBufferMinutes`, `shifts`, `settings` e `stockAuthorization`.
- Payload de update preserva `manualScheduleDraft`, `manualScheduleValidation`, `expectedRevision`, `shifts` e `settings`.
- `manualScheduleDraft` carregado vem de `normalizePersistedManualScheduleDraft`, nao de `days`, DOM, cards ou snapshot visual.
- `calendarOperations` de reopen continuam vindas de `detail.automaticCalendarOperations`.
- `schedule_tree` e `operations` automaticos nao foram alterados.
- `baseHash`, serializacao, dias persistidos e auditoria continuam no backend/services canonicos.
- Erros de save, incluindo 409, continuam propagados para o wrapper da pagina e nao limpam estado local antes do sucesso.

## 6. Testes

Criado `tests/planningPersistenceController.test.js`, cobrindo:

- payload de update com `expectedRevision`;
- payload de create com autorizacao de estoque;
- preservacao de IDs e campos de lineage no draft repassado;
- save de plano existente;
- save de plano novo;
- cancelamento por autorizacao ausente sem chamada de persistencia;
- propagacao de 409/erro sem conversao para sucesso;
- load/reopen com draft persistido normalizado;
- load incompatível;
- ausencia de DOM, storage, `fetch`, `api` direta e renderer no controller.

Teste existente ajustado estritamente:

- `tests/automaticSimulationBaseline.service.test.js` passou a procurar `calendarOperations: detail.automaticCalendarOperations` no novo controller, porque a montagem do estado de reopen foi extraida.

## 7. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-controller/planningPersistenceController.js
node --check pages/PlanningPage.js
node --check tests/planningPersistenceController.test.js
node --test tests/planningPersistenceController.test.js
node --test tests/manualSchedulePersistence.service.test.js
node --test tests/planningManualScheduleSaveLoad.integration.test.js
node --test tests/automaticSimulationBaseline.service.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningPersistenceController`: OK
- Testes canonicos de persistencia e save/load: OK
- Teste afetado de baseline automatica: OK
- Suite ampla final: 86 testes, 86 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF em arquivos alterados

## 8. PlanningPage antes/depois

- Antes: 6265 linhas
- Depois: 6212 linhas
- Reducao liquida: 53 linhas

## 9. Riscos e dividas

- `discardAllProductionCalendarChanges` permanece na `PlanningPage.js` por misturar fallback de baseline, persistencia local/remota, aplicacao de estado, render e toast.
- `saveDraftNow` e `queueAutosave` permanecem na pagina por dependerem de timer, `localStorage` e estado fechado amplo.
- O controller de save nao executa callbacks pos-save visuais; a pagina preserva a ordem atual de limpar local, resetar estado, resetar historico, fechar modal, toast, aba historico e render somente apos sucesso.
- Homologacao operacional em navegador nao foi executada nesta REF.
- REF-013 homologacao manual permanece pendente.
- Calendario V2, identidade do calendario manual, manual move/split, stock-only, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
