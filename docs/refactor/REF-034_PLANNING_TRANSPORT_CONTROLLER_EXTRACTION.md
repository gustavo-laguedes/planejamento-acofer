# REF-034 - Auditar e extrair controlador de transporte do planejamento

Data: 2026-08-10

## 1. Baseline

- Branch esperada/inicial: `rebuild-production-calendar`
- HEAD esperado/inicial: `6c9acab`
- Worktree inicial: limpo (`git status --short` sem saida)
- Suite inicial: `node --test tests/*.js` com 84 testes, 84 aprovados e 0 falhas
- Contagem inicial da `PlanningPage.js`: 6610 linhas

## 2. Auditoria

| Funcao/bloco | Papel | Entradas | Saida | Muta draft? | Servico/API? | DOM? | Regra de negocio? | Decisao |
|---|---|---|---|---|---|---|---|---|
| `emptyTransport` | Cria linha de transporte automatico no formulario de simulacao | Nenhuma | Objeto de transporte vazio | Nao | Nao | Nao | Nao | Mantida na pagina; pertence ao formulario de simulacao, fora do transporte manual |
| `normalizeDraft`/normalizacao de `production.transports` | Normaliza dados de transporte automatico salvos no rascunho local | Draft bruto | Draft normalizado | Cria novo objeto normalizado | Nao | Nao | Nao | Mantida na pagina; acoplada ao draft geral e formulario |
| `transportsFromOperations` | Deriva transportes de operacoes automaticas para validacao | `operations` | Lista de transportes | Nao | Nao | Nao | Adaptacao de contrato | Mantida; faz parte de `buildManualScheduleValidationContext` |
| `manualTransportIdFor` | Gera ID deterministico do transporte manual por allocation | Allocation | `transportId` | Nao | Nao | Nao | Identidade tecnica | Extraida |
| `manualTransportConstraints` | Filtra constraints `MANUAL_TRANSPORT` | Draft | Lista de constraints | Nao | Nao | Nao | Nao | Extraida |
| `manualTransportForAllocation` | Localiza transporte manual existente por ID atual ou legado | Allocation, draft | Constraint ou `null` | Nao | Nao | Nao | Compatibilidade/identidade | Extraida |
| Helpers de membership/downstream | Selecionam sucessores/afetados para transporte manual | Allocation, draft, dependencies | Parent operation IDs | Nao | Nao | Nao | Escopo de reotimizacao | Extraidos com entradas explicitas |
| `transportArrivalDateFromHours` | Calcula data estimada por horas | Allocation, horas | Data ou string vazia | Nao | Nao | Nao | Nao | Extraida |
| `transportHoursForArrivalDate` | Calcula horas por data estimada | Allocation, data | Horas ou string vazia | Nao | Nao | Nao | Nao | Extraida |
| `applyManualTransportConstraints` | Monta novo draft com `MANUAL_TRANSPORT`, pins do produtor e `MIN_START` | Draft, allocation, chegada, horas, dependencies, relogio | Draft novo | Retorna novo draft; nao muta entrada | Nao | Nao | Orquestra contrato existente de constraint; nao valida dominio | Extraida |
| `withManualTransportPresentation` | Decora allocations com `manualTransport` para render | Allocations, draft | Allocations apresentaveis | Nao | Nao | Nao | Nao | Extraida |
| `handleProductionCalendarTransportSave` | Orquestra permissao, validacao simples, reotimizacao, transacao, aceite e toast | Estado da pagina, callbacks, allocation, chegada, horas | Resultado aceito/recusado | Muta indiretamente via callback `acceptRecalculatedCalendar` | `applyManualScheduleTransaction`, `reoptimizePlanningFuture` via callback | Nao | Nao cria regra nova; coordena services | Extraida como `savePlanningManualTransport` com callbacks explicitos; wrapper fino ficou na pagina |
| `openProductionCalendarTransportModal` | Renderiza modal, eventos, foco e submit/remove | DOM, allocation, callbacks | Modal/eventos | Nao diretamente | Chama wrapper de save | Sim | Nao | Mantida na pagina |

## 3. Consumidores e dependencias

Consumidores diretos:

- `openProductionCalendarTransportModal`: usa lookup, data e horas para preencher/atualizar inputs.
- `handleProductionCalendarTransportSave`: agora wrapper fino sobre `savePlanningManualTransport`.
- `buildProductionCalendarSnapshot`: usa `withManualTransportPresentation` para decorar allocations renderizadas.
- Resumo do planejamento: usa `manualTransportConstraints` para contar transportes manuais.
- Testes estaticos migrados para o novo modulo: `planningReoptimization.service.test.js` e `productionCalendarMemberships.test.js`.

Servicos canonicos consumidos por callback, sem import direto no controller:

- `services/planningReoptimization.service.js`: reotimizacao de futuro e cutoff.
- `services/manualScheduleTransaction.service.js`: aceite/rollback transacional.
- `services/manualScheduleValidation.service.js`: validacao canonica de transporte, origem/destino, quantidade e conclusao.
- `services/manualSchedulePersistence.service.js`: persistencia de `constraints` no draft salvo.

Dependencias preservadas:

- IDs: `transportId`, `allocationId`, `producerAllocationId`, `producerSourceAllocationIds`, `parentOperationId`, `producerParentOperationId`, `consumerParentOperationIds`, `affectedParentOperationIds`.
- Historico: mutacao real continua ocorrendo no aceite da pagina via `acceptRecalculatedCalendar`, que registra estado aceito.
- Save/load: formato de constraints foi preservado; nenhuma migration, API ou service de persistencia foi alterado.
- Status: nenhum status de transporte foi renomeado ou criado.

## 4. Fronteira encontrada

Fronteira segura:

- `shared/planning-controller/planningTransportController.js`;
- funcoes puras ou orquestracao com callbacks explicitos;
- sem `document`, `page`, `localStorage`, API direta, autosave ou renderer;
- regra canonica de transporte permaneceu em `manualScheduleValidation.service.js`;
- reotimizacao e transacao continuam chamadas pelos services existentes, injetadas pela pagina;
- DOM/modal/foco/eventos permanecem em `PlanningPage.js`.

Ficaram fora:

- services existentes de transporte/validacao;
- schema, migrations, API e banco;
- persistencia propriamente dita;
- solver/reotimizacao interna;
- manual move, split/editor, estoque, stock-only, Gantt, Calendario V2, Flow, `productiveMinutes`, `generatePlanningCode`, turnos/capacidade.

## 5. Extracao realizada

Criado `shared/planning-controller/planningTransportController.js` com:

- `manualTransportIdFor`;
- `manualTransportConstraints`;
- `manualTransportForAllocation`;
- `productionCalendarSuccessorParentIds`;
- `productionCalendarDownstreamParentIds`;
- `transportArrivalDateFromHours`;
- `transportHoursForArrivalDate`;
- `applyManualTransportConstraints`;
- `withManualTransportPresentation`;
- `buildManualTransportScopeParentIds`;
- `validateManualTransportInput`;
- `savePlanningManualTransport`.

`PlanningPage.js` passou a importar essas funcoes e manteve wrappers/DOM.

## 6. Contratos preservados

- Transporte manual segue unitario por `allocationId`.
- `transportId` preserva formato `manual-transport:<parent>:<materialId>:<allocationId>` sanitizado.
- Constraints legadas amplas por produtor/material continuam removidas junto com pins antigos.
- Ordem de constraints criadas preservada: constraints nao relacionadas, `MANUAL_TRANSPORT`, `PIN_MACHINE`, `PIN_START`, `MIN_START`.
- Pins do produtor continuam com `source: 'manual-transport-producer'`.
- Pins downstream continuam com `source: 'manual-transport'` e `time: '07:00'`.
- Escopo de reotimizacao continua priorizando sucessores/downstream e nao inclui produtor como escopo principal quando ha downstream.
- `savePlanningManualTransport` nao salva, nao chama API, nao persiste, nao simula automaticamente e nao altera draft sem callback de aceite.

## 7. Testes

Criado `tests/planningTransportController.test.js`, cobrindo:

- entrada vazia/ausencia via validacao e lookup;
- transporte existente por ID atual e por IDs legados;
- multiplos parent IDs downstream;
- preservacao de IDs, status, data, maquina e quantidade na apresentacao;
- ordem e formato de constraints;
- atualizacao/criacao permitida;
- remocao de transporte e legado amplo;
- callbacks e ordem do save;
- reotimizacao recusada;
- transacao recusada;
- nao mutacao indevida de entradas congeladas;
- comportamento de draft conforme contrato atual.

Testes estaticos ajustados para ler o novo controller:

- `tests/planningReoptimization.service.test.js`;
- `tests/productionCalendarMemberships.test.js`.

## 8. Validacoes

Executadas:

```text
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node -e "const fs=require('fs'); const s=fs.readFileSync('pages/PlanningPage.js','utf8'); console.log(s.split(/\r?\n/).length)"
node --test tests/*.js
node --check shared/planning-controller/planningTransportController.js
node --check pages/PlanningPage.js
node --test tests/planningTransportController.test.js
node --test tests/productionCalendarMemberships.test.js
node --test tests/planningReoptimization.service.test.js
node --test tests/manualScheduleValidation.service.test.js
node --test tests/manualSchedulePersistence.service.test.js
node --test tests/planningManualScheduleSaveLoad.integration.test.js
node --test tests/*.js
git diff --check
```

Resultados finais:

- Sintaxe do novo modulo: OK
- Sintaxe da `PlanningPage.js`: OK
- Teste focado `planningTransportController`: OK
- Testes relacionados de memberships, reotimizacao, validacao, persistencia e save/load: OK
- Suite ampla final: 85 testes, 85 aprovados e 0 falhas
- `git diff --check`: OK, apenas avisos conhecidos de LF -> CRLF em arquivos alterados

## 9. PlanningPage antes/depois

- Antes: 6610 linhas
- Depois: 6265 linhas
- Reducao liquida inicial: 345 linhas

## 10. Riscos e dividas

- `openProductionCalendarTransportModal` segue na `PlanningPage.js` por DOM/eventos/foco.
- O controller ainda coordena callbacks de reotimizacao/transacao; a regra canonica continua nos services, mas o contrato deve permanecer testado.
- `transportsFromOperations` e normalizacao de `production.transports` automatico nao foram extraidos.
- O teste focado usa callbacks fakes; homologacao operacional em navegador nao foi executada.
- REF-013 homologacao manual permanece pendente.
- Calendario V2, identidade do calendario manual, manual move/split, persistencia, stock-only/movimento de estoque, `productiveMinutes`, `generatePlanningCode` e turnos/capacidade permanecem pendentes.
