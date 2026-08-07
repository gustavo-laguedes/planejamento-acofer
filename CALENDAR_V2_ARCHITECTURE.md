# Calendário de Produção V2 — Arquitetura oficial

Este documento descreve a arquitetura oficial do Calendário de Produção V2. A revisão de 2026-07-24 foi feita sobre o working tree corrente, incluindo alterações ainda não consolidadas em commit, e substitui o checkpoint `39b3847` como referência de estado. O código atual prevalece quando uma seção histórica divergir desta revisão.

O documento é normativo para manutenção do Planejamento e foi levantado a partir do código, do schema, da migration 020 e dos testes existentes. Quando uma garantia é apenas automatizada, isso é indicado explicitamente; os testes listados não substituem homologação visual em navegador.

## 1. Objetivo do Calendário V2

O calendário anterior, implementado por `shared/CalendarTimeline.js`, concentra apresentação e vários eventos de alteração do planejamento. No Planejamento, ele foi substituído pelo V2 para estabelecer uma fronteira explícita entre dois domínios:

- o **simulador automático**, executado por `services/planning.service.js` e solicitado por `simulatePlanningRequest`/`simulateCurrent` em `pages/PlanningPage.js`, monta árvore, operações e programação inicial;
- o **editor manual**, coordenado por `services/manualScheduleTransaction.service.js`, altera somente um `manualScheduleDraft` já criado e nunca recalcula a programação automática como efeito de um movimento.

O V2 apresenta uma grade por máquinas e dias. Cada célula é a combinação `machineId + date`; nela são renderizados zero ou mais blocos diários (`allocations`). `renderSimulation` adapta o resultado automático com `adaptPlanningResultToProductionCalendar`, cria o primeiro draft por `createManualScheduleDraft` e o valida. A partir daí, `buildProductionCalendarSnapshot` dá prioridade a `manualScheduleDraft.allocations` sobre as allocations adaptadas da simulação.

Portanto, a simulação automática é a origem da primeira versão do calendário, mas o `manualScheduleDraft` é a fonte de verdade do calendário editado. Uma nova simulação é uma ação explícita e, quando há alterações manuais (`dirty`), `simulateCurrent` exige confirmação para descartá-las.

Referências principais: `pages/PlanningPage.js` (`simulateCurrent`, `renderSimulation`, `buildProductionCalendarSnapshot`, `productionCalendarMoveRunner`), `services/planning.service.js` (`buildPlan`, `scheduleOperations`) e `shared/production-calendar/productionCalendar.adapter.js` (`adaptPlanningResultToProductionCalendar`).

## 2. Princípios invariáveis

As regras abaixo são limites arquiteturais obrigatórios:

1. O simulador automático cria somente a programação inicial. Após `createManualScheduleDraft`, a edição ocorre no draft.
2. Movimento manual não chama `simulateCurrent`.
3. Movimento manual não chama `scheduleOperations`. Mudanças futuras de capacidade ou dia útil usam exclusivamente `planningReoptimization.service.js`, que reotimiza o draft aceito sem converter allocations em operations aproximadas.
4. O validador nunca reposiciona allocations. `validateManualScheduleDraft`, `validateManualScheduleTemporalRules`, `buildManualScheduleStockLedger` e `validateManualScheduleResources` apenas normalizam para leitura e produzem diagnósticos/projeções. Reposicionamentos pertencem à criação do candidato em `applyDraftMove`.
5. `allocationId` persistente é uma identidade técnica estável e não depende da data nem da máquina. Mover preserva o ID; ao dividir excedente, somente a nova parcela recebe novo ID. O ID determinístico de fallback do adapter contém data/máquina, mas é declarado **somente para leitura** e não pode ser promovido a identidade persistente.
6. `manualScheduleDraft` é a fonte de verdade do calendário editado.
7. Candidato recusado nunca substitui draft aceito. `applyManualScheduleTransaction` devolve cópia do draft anterior em toda recusa, e `productionCalendarMoveRunner` só atribui `manualScheduleDraft = transaction.draft` depois de `transaction.accepted`.
8. Warnings não reposicionam o calendário. Eles acompanham um candidato aceito e decoram cards/dias; não acionam novo movimento.
9. A persistência manual não sobrescreve `schedule_tree` nem `operations` automáticos. O endpoint `PUT /planning/plans/:id/manual-schedule` atualiza o draft, metadados, revisão, período e projeção diária, preservando a base automática.
10. Planos legados continuam compatíveis. Ausência de `manual_schedule_draft` resulta no status `legacy`, sem exigir conversão destrutiva.
11. `CalendarTimeline` não deve voltar a ser usado no Planejamento V2. `USE_PRODUCTION_CALENDAR_V2` está ativo; o ramo antigo existente em `renderProductionCalendar` é apenas legado/fallback e não é a arquitetura-alvo.

Esses limites têm cobertura automatizada especialmente em `tests/planningManualScheduleIntegration.test.js` e `tests/manualScheduleTransaction.service.test.js`.

## 3. Fluxo completo

O fluxo oficial é:

1. **Simulação automática.** `simulateCurrent` monta o payload e chama `POST /planning/simulate`; no servidor, `buildPlan` usa `scheduleOperations` para criar `tree`, `operations`, `calendarOperations`, `days` e contexto.
2. **Adaptação para allocations.** `buildProductionCalendarSnapshot(..., { ignoreManualDraft: true })` chama `adaptPlanningResultToProductionCalendar`. O adapter converte cards/operações já programados para o contrato visual diário e rejeita entradas inválidas sem mutar a origem. `services/planningAllocation.service.js` contém o contrato de `PlanningDailyAllocation`, a preservação de identidade e o caminho antigo de `allocationOverrides`; o fluxo manual aceito usa as allocations consolidadas no draft.
3. **Criação do `manualScheduleDraft`.** `renderSimulation` chama `createManualScheduleDraft`, que normaliza, consolida, cria rastreabilidade e valida a estrutura inicial. Em seguida executa uma transação `VALIDATE_DRAFT` para anexar a validação cronológica compatível.
4. **Intenção de movimento.** Drag (`ProductionCalendarDrag`) e click-move (`ProductionCalendar`) emitem o mesmo comando `MOVE_ALLOCATION`, com origem, destino, identificação e classificação `empty`/`occupied`.
5. **Candidato.** `productionCalendarMoveRunner` chama `applyManualScheduleTransaction`; esta chama `applyDraftMove` em uma cópia. Confirmações de unificação, substituição ou capacidade são decisões explícitas e refazem a mesma transação com `decisions`.
6. **Validação estrutural.** `validateManualScheduleDraft` verifica IDs, datas, máquinas, produtividade, valores finitos, conservação de quantidades por operação pai e preservação dos rastros originais.
7. **Validação cronológica.** `validateManualScheduleTemporalRules` verifica calendário, turnos, sobreposições, dependências, transportes, estoque, setup e equipe. O serviço agrega `stockProjection`, `dependencyStatus`, conflitos e `resourceProjection`.
8. **Aceite ou rollback.** Movimentos comuns exigem ausência absoluta de erro bloqueante. Reotimizações futuras recalculam os diagnósticos anterior e candidato no mesmo contexto e aceitam erros de negócio preexistentes iguais ou menores; erros estruturais, introduzidos ou agravados continuam bloqueando. Em toda recusa, o draft anterior retorna byte a byte.
9. **Atualização da V2.** Apenas no aceite, `manualScheduleDraft` é substituído, o draft local é salvo e `refreshTimelineOnly` renderiza novamente a V2 sem simular.
10. **Persistência.** Na criação, `POST /planning/plans`; na edição de plano salvo, `PUT /planning/plans/:id/manual-schedule`. O servidor revalida, serializa o contrato, projeta `production_plan_days` e grava tudo em uma transação.
11. **Reabertura sem nova simulação.** `GET /planning/plans/:id` devolve a base automática e o draft persistido. `reopenSavedPlan` reconstrói `currentSimulation` a partir de `schedule_tree`, `operations` e `days`, instala o draft do banco e renderiza; não chama `simulateCurrent`.

## 4. Responsabilidades por camada

### 4.1 Orquestração da página

| Arquivo | Pode fazer / entradas / saídas / dependências | Não pode fazer |
| --- | --- | --- |
| `pages/PlanningPage.js` | Orquestra formulário, simulação, adaptação, criação/revalidação do draft, modais de decisão, atualização visual, save/load e contexto de validação. Entradas: dados do formulário, respostas da API, intenção `MOVE_ALLOCATION`, lookups e draft local. Saídas: payloads HTTP, `currentSimulation`, `manualScheduleDraft`, snapshot decorado e DOM. Usa serviços manuais, `ProductionCalendar`, API e `localStorage`. Funções-chave: `buildManualScheduleValidationContext`, `buildProductionCalendarValidationSnapshot`, `renderSimulation`, `productionCalendarMoveRunner`, `launchPlanning`, `reopenSavedPlan`. | Não implementa regras internas de movimentação/validação, não chama o scheduler durante movimento e não deve aplicar `applyDraftMove` diretamente. Não deve tornar estado de zoom, seleção, modal ou drag parte do draft persistente. |

### 4.2 Componentes visuais (`shared/production-calendar/*`)

| Arquivo | Pode fazer / entradas / saídas / dependências | Não pode fazer |
| --- | --- | --- |
| `index.js` | Carrega uma vez o CSS e reexporta a API pública do V2. Entrada: importação do módulo. Saída: exports e `<link>` do stylesheet. | Não contém regra de planejamento. |
| `productionCalendar.adapter.js` | Adapta `days`, `machines` e operações já programadas para allocations somente de leitura; devolve `{ days, machines, allocations, errors, warnings }`. Resolve aliases de campos e cria ID visual de fallback. | Não chama API/DOM, não muta a origem, não agenda operações e não cria identidade persistente. |
| `ProductionCalendar.js` | Compõe toolbar, grid, seleção, detalhes e drag. Recebe dados prontos e callbacks; emite `MOVE_ALLOCATION` para click-move e delega drag ao mesmo callback. Mantém apenas estado visual. | Não valida estoque/capacidade/dependências, não persiste e não altera allocations. |
| `ProductionCalendarGrid.js` | Agrupa por máquina/data, preenche o intervalo de dias, calcula larguras por zoom, renderiza células e indicadores por dia. | Não decide se um movimento é válido. |
| `ProductionCalendarCard.js` | Renderiza um bloco e seus indicadores/métricas; escolhe cor explícita da produção ou paleta estável por hash. Recebe callbacks de seleção, detalhes e início do drag. | Não altera quantidade, data, máquina ou produtividade. |
| `ProductionCalendarDetails.js` | Monta o modal/painel de detalhes a partir de uma allocation e fecha pelo callback. | Não busca nem persiste dados. |
| `ProductionCalendarDrag.js` | Controla limiar de drag, preview, hover, classificação do destino, pointer capture, Escape, supressão de click e auto-scroll horizontal/vertical. Emite `MOVE_ALLOCATION`. | Não executa o movimento nem valida regras de negócio. |
| `ProductionCalendarState.js` | Mantém zoom, scroll, seleção, detalhes e estado transitório do drag. Entrada: estado visual inicial; saída: estado visual atualizado. | Não pode armazenar regra de negócio, mutação de planejamento, estoque ou recálculo. |
| `ProductionCalendarToolbar.js` | Renderiza controles de zoom, início da grade e seleção/cancelamento. | Não edita o calendário. |
| `productionCalendar.utils.js` | Normaliza dias, formata valores, preenche intervalo e agrupa allocations por máquina/data. | Não toma decisões de domínio. |
| `productionCalendar.validation.js` | Valida o contrato mínimo necessário para renderização (`allocationId`, data, máquina, números). | Não substitui a validação estrutural/cronológica do draft e não reposiciona cards. |

### 4.3 Domínio e validação

| Arquivo | Pode fazer / entradas / saídas / dependências | Não pode fazer |
| --- | --- | --- |
| `services/planningAllocation.service.js` | Converte operações diárias em `PlanningDailyAllocation`, registra/reutiliza IDs, aplica o contrato legado de `allocationOverrides`, reconstrói operações e valida total por pai. Entradas: operações automáticas, plano, máquinas e overrides. Saída: `{ allocations, operations, validation }`. Funções: `buildPlanningDailyAllocations`, `applyPlanningAllocationMove`. | Não é o coordenador transacional do draft V2, não persiste e não valida cronologia/estoque/recursos. |
| `services/manualScheduleDraft.service.js` | Cria/normaliza/consolida o draft; recalcula produtividade para a máquina alvo; cria candidato de célula vazia, merge, replace, split ou override; preserva componentes/rastros e fornece snapshot de rollback. Entradas: draft, allocation/destino, máquinas, matriz, dias e decisões. Saída: novo draft ou erro com snapshot. Funções: `createManualScheduleDraft`, `applyDraftMove`, `validateManualScheduleDraft`. | Não decide sozinho o aceite final, não faz I/O, não persiste e não executa validação cronológica completa. |
| `services/manualScheduleValidation.service.js` | Valida datas/horas, dias úteis, turnos, sobreposição, dependências e transporte; integra ledger e recursos; produz diagnósticos, timeline e projeções. Entrada: draft e contexto completo. Saída: `{ valid, errors, warnings, affectedAllocations, stockProjection, dependencyStatus, resourceProjection, ... }`. Função: `validateManualScheduleTemporalRules`. | Não move, divide, unifica, substitui ou muta o draft. |
| `services/manualScheduleStockLedger.service.js` | Simula ledger cronológico por material/local: estoque inicial, compromissos, produção progressiva, consumo, despacho/chegada e mínimos. Entrada: allocations/dependências/transportes normalizados, estoque, locais e precisão. Saída: diagnósticos e `stockProjection`. Função: `buildManualScheduleStockLedger`. | Não altera allocations nem autoriza movimento. |
| `services/manualScheduleResourceValidation.service.js` | Calcula intervalos de setup e concorrência de equipe, aplica regras/overrides explícitos e gera `resourceProjection`. Entrada: draft, turnos, setup, equipe, dias liberados e feriados. Saída: `setupIntervals`, conflitos e projeção. Função: `validateManualScheduleResources`. | Não agenda setup ou produção e não altera equipe do draft. |
| `services/manualScheduleTransaction.service.js` | É o coordenador de aceite: movimentos comuns usam validade absoluta; candidatos oficiais de reotimização reutilizam as duas validações recém-calculadas, rechecando estrutura, cutoff e delta sem uma terceira validação contraditória. | Não faz I/O/persistência, não muta `currentDraft` e não chama simulador/scheduler. |
| `services/planningReoptimization.service.js` | Separa o passado congelado do trabalho restante, agenda work items diretamente contra Matriz, turnos, equipe e dependências, cria identidade determinística e recalcula os diagnósticos anterior e candidato. O aceite usa `diagnosticDelta` e `blockingRegressions`. | Não acessa DOM, API ou banco e não confia na validação persistida do draft. |
| `services/manualSchedulePersistence.service.js` | Define contrato persistido v2 com leitura compatível de v1, normaliza allocations, calcula hash da base, serializa draft, constraints e estado do scheduler, converte dias, resume auditoria e resolve prioridade banco/local. Entradas: draft, base automática, configurações e metadados. Saídas: JSON persistível, dias, status de abertura e resumo. | Não acessa banco/API, não persiste validações derivadas dentro do draft e não altera `schedule_tree`/`operations`. |

### 4.4 API e banco

| Arquivo | Pode fazer / entradas / saídas / dependências | Não pode fazer |
| --- | --- | --- |
| `server/routes/planning.routes.js` | Expõe simulação, criação, leitura e atualização manual. Recompõe contexto real do banco, revalida com `applyManualScheduleTransaction`, serializa, grava plano/dias em transação, controla revisão e registra auditoria. Entradas: HTTP, usuário e banco. Saídas: plano, base automática, draft e dias. Funções-chave: `validateManualScheduleForSave`, `manualScheduleValidationMetadata`, `insertPlanningAudit`; rotas `POST /simulate`, `POST /plans`, `GET /plans/:id`, `PUT /plans/:id/manual-schedule`. | O endpoint manual não deve recalcular nem sobrescrever `schedule_tree`/`operations`; não deve confiar somente na validação enviada pelo cliente. |
| `database/020_manual_schedule_persistence.sql` | Evolui instalações existentes com colunas do draft/metadados/revisão, campos diários e índice único parcial por `(plan_id, allocation_id)`. | Não contém lógica de negócio nem backfill/conversão de planos legados. |
| `database/001_schema.sql` | Define o schema principal já com as colunas V2 em `production_plans` e `production_plan_days`. | Não substitui a migration incremental 020 em bancos existentes. O índice único parcial está na migration 020, não no trecho principal da tabela. |

### 4.5 Testes

O núcleo histórico de sete scripts usa `node:assert/strict`; os de integração também leem fonte para proteger fronteiras arquiteturais. O conjunto atual é maior e inclui testes adicionais de baseline, histórico, split, editor, configuração, horizonte, cabeçalho, memberships, estágios, estoque, cutoff e reotimização. Eles dependem de services, fixtures em memória e, em alguns casos, de leitura de `PlanningPage.js`, rotas e migrations. Não usam navegador nem banco real. O detalhamento do núcleo histórico está na seção 10 e a ampliação é registrada na seção 21.

## 5. Modelo de dados

### 5.1 `PlanningDailyAllocation`

O contrato diário nasce em `toPlanningDailyAllocation` (`services/planningAllocation.service.js`) e é ampliado pelo adapter/draft. Campos centrais:

- identidade: `allocationId`, `parentOperationId`, `planningId`, `productionId`, `productionIndex`, `materialId`;
- posição: `machineId`, `date`, `startTime`, `endTime`, `allocationOrder`/`sequence`;
- carga: `quantity`, `unit`, `durationMinutes`, `capacityPercent`, `peopleCount`;
- apresentação/contexto: nomes/códigos, cor, status, produtividade e capacidade diária quando disponíveis;
- origem: `source` (`automatic` ou `manual`).

Todo bloco deve ter ID único, quantidade/duração positivas, data e máquina válidas e valores numéricos finitos. A soma lógica por operação pai deve ser preservada.

### 5.2 `manualScheduleDraft`

Em memória, `createManualScheduleDraft` cria `draftId`, `planningId`, `baseSimulationId`, `allocations`, `createdAt`, `updatedAt` e `dirty`. Movimentos aceitos acrescentam `lastManualAction` e `validation`. Na serialização, `serializeManualScheduleDraft` gera contrato `version: 2`, `baseSimulationHash`, `constraints`, `frozenThrough`, `schedulerState`, `identityMap` e configurações (`manualWorkDates`, `dailyTeamOverrides`, `setupMinutes`, `dependencyCompletionBufferMinutes`). O campo legado `minimumStartRatio`, quando presente em drafts antigos, é normalizado para `1` somente por compatibilidade e não governa mais nenhuma regra. Drafts v1 são promovidos em memória sem migração destrutiva. A validação derivada não é gravada dentro do JSON persistido; versão, fingerprint e instante da validação vão para colunas próprias do plano.

Campos de rastreabilidade e decisão:

- `components`: parcelas lógicas que compõem um card, com seus IDs, operação pai, produção e quantidade. Permite que unificação/divisão conserve origem e rateio.
- `sourceAllocationIds`: IDs técnicos originais representados pelo card atual.
- `sourceParentOperationIds`: operações lógicas originais representadas pelo card.
- `pinned`: indica allocation posicionada/manualmente preservada. Movimentos, merges e reposicionamentos decorrentes ficam pinned.
- `isCapacityOverride`: registra autorização explícita para capacidade acima de 100%; gera warning `EXTRAORDINARY_CAPACITY_AUTHORIZED`.
- `validation`: resultado derivado do último candidato validado, com erros, warnings e projeções. Compatibilidade é verificada por `validationVersion` e `draftFingerprint`.
- `revision`: controle otimista do plano no banco (`production_plans.manual_schedule_revision`). Não é a identidade do draft; o cliente envia `expectedRevision` e o servidor incrementa após update bem-sucedido.
- `baseSimulationHash`: hash estável `manual-base/v1:*` de operações, árvore, matriz, turnos, parâmetros e estoque de referência. Identifica a base automática usada na serialização.
- versionamento: `MANUAL_SCHEDULE_CONTRACT_VERSION = 2` para o JSON; versões 1 e 2 são aceitas e a v1 é normalizada em memória. A validação derivada usa `MANUAL_SCHEDULE_VALIDATION_VERSION = 'manual-schedule-validation/v1'`.

### 5.3 Diferença entre os IDs

| Campo | Significado |
| --- | --- |
| `operationId` | Identifica uma operação/card proveniente do simulador. Pode refletir uma representação diária e ter sufixos como `:day-N`; não é a identidade estável do bloco manual. |
| `parentOperationId` | Identifica a operação lógica pai, normalizada sem sufixo diário. É a chave para conservação de quantidade e dependências. `calendarParentOperationId`/`splitParentOperationId` são fontes de compatibilidade para obtê-la. |
| `allocationId` | Identidade técnica do bloco diário editável/persistível. Deve sobreviver a mudança de data/máquina e ser única; um excedente realmente novo recebe outro ID. |
| `productionId` | Identifica a produção/ordem à qual a allocation pertence, normalmente `production-N` ou uma chave fornecida pela simulação. Serve também para agrupamento visual. |
| `productionIndex` | Índice numérico da produção no payload multi-produção. É posição/escopo, não identidade técnica da allocation. |

## 6. Movimentações

Todas as movimentações partem de `MOVE_ALLOCATION` e passam por `productionCalendarMoveRunner` → `applyManualScheduleTransaction` → `applyDraftMove` → validadores.

- **Célula vazia:** recalcula produtividade, duração e capacidade para a máquina de destino; move o mesmo `allocationId`, marca `source: 'manual'` e `pinned: true`.
- **Click-move:** o usuário seleciona um card e clica em outra célula. `ProductionCalendar.js` emite a mesma intenção e o mesmo destino usados pelo drag, mudando apenas `source: 'click_move'`.
- **Unificação:** se o destino contém allocation compatível (mesmo material, unidade e quantidade de pessoas), exige `CONFIRM_MERGE`; mantém o ID do card alvo e combina quantidade, componentes, `sourceAllocationIds` e `sourceParentOperationIds`.
- **Substituição:** se o ocupante é incompatível, exige `CONFIRM_REPLACE`; coloca a allocation movida no destino e procura próximo posicionamento válido para o ocupante, preservando movimentos pinned anteriores.
- **Preencher e reagendar excedente:** diante de capacidade acima de 100%, `capacityDecision: 'split'` preenche a capacidade normal no destino, cria nova allocation para o restante e busca até 365 dias à frente, preferindo a máquina indicada e depois as demais máquinas compatíveis.
- **Capacidade extraordinária:** `capacityDecision: 'override'` aceita o card acima de 100%, marca `isCapacityOverride` e gera warning; não ignora as demais validações cronológicas.
- **Rollback:** qualquer produtividade ausente, destino inválido, falta de próximo slot, falha estrutural ou erro cronológico devolve o draft anterior. O candidato recusado não é salvo em `localStorage`, não atualiza a V2 e não chega ao banco.

Drag e click-move usam o mesmo domínio. Isso é garantido pela emissão do mesmo tipo de intenção e por testes de equivalência em `manualScheduleDraft.service.test.js` e `manualScheduleTransaction.service.test.js`.

## 7. Validação

### 7.1 Ordem e natureza

A transação valida em duas etapas. Primeiro `validateManualScheduleDraft` protege estrutura e conservação. Depois `validateManualScheduleTemporalRules` avalia o calendário completo. Nenhuma etapa reposiciona allocations.

Um **erro bloqueante** tem `severity: 'error'` e `blocking !== false`, portanto mantém `valid: false`. Em movimentos comuns ele impede aceite. Em reotimização incremental, um erro de negócio recalculado pode permanecer visível sem impedir aceite quando o delta o classifica como `unchanged`, `improved` ou `resolved`; `introduced`, `worsened` e erros estruturais impedem aceite e save. Um **warning** tem `severity: 'warning'` e `blocking: false` e nunca corrige ou movimenta o calendário.

### 7.2 Regras temporais e operacionais

- **Datas e horários:** ISO `YYYY-MM-DD`, horas válidas e intervalos positivos; suporta turno/allocation atravessando meia-noite.
- **Dias úteis e `manualWorkDates`:** sábado, domingo e feriado são bloqueados por `NON_WORKING_DATE_NOT_RELEASED`, salvo liberação explícita. A liberação não dispensa turno válido.
- **Turnos:** configurações inválidas ou sobrepostas são erros; toda allocation deve estar integralmente coberta pelas janelas válidas.
- **Sobreposição de máquina:** intervalos sobrepostos na mesma máquina geram `MACHINE_TIME_OVERLAP`; fronteiras em que um termina exatamente quando outro começa são permitidas.
- **Dependências e lote diário integral:** não existe liberação parcial por percentual. Cada allocation consumidora só inicia quando todos os insumos necessários para sua quantidade diária estiverem disponíveis; o último lote usa o saldo restante quando ele for menor que a capacidade máxima/dia da configuração escolhida. O fluxo progressivo não pode reutilizar saldo já reservado por outro consumidor, e a quantidade integral respeita `dependencyCompletionBufferMinutes` (padrão 60).
- **Consumo progressivo:** perfis produtivos por turno calculam quantidade disponível em cada instante; múltiplos produtores somam e consumidores simultâneos competem em lote, sem privilégio pela ordem da entrada.
- **Estoque:** o ledger controla saldo físico, comprometido e disponível por material/local, reservas, produção progressiva, consumo e estoque mínimo. Saldo/compromisso insuficiente é bloqueante; atingir mínimo é warning.
- **Transporte:** retira quantidade da origem no despacho, mantém em trânsito e só disponibiliza no destino na chegada; configuração, duplicidade, quantidade e conclusão são validadas.
- **Setup:** transições de material/configuração podem exigir intervalo; duração padrão, regras específicas e overrides explícitos são avaliados contra turnos, feriados e sobreposição com produção.
- **Equipe:** allocations simultâneas em máquinas distintas compartilham a capacidade de equipe do turno/dia. `dailyTeamOverrides` muda a capacidade prevista; `teamOverrides` extraordinários válidos geram warning, excesso não autorizado bloqueia.

### 7.3 Saídas de diagnóstico

- `affectedAllocations`: índices `byAllocationId` e `byDate` com os `issueId` de erros/warnings. Permite decorar somente cards e dias afetados.
- `stockProjection`: `byMaterial`, `timeline` e `summary`; inclui saldos por local, eventos, primeiro shortage e materiais afetados.
- `dependencyStatus`: `byDependencyId` e `byAllocationId`, com estados `ok`, `at-risk` ou `broken`, vínculos e issues.
- `resourceProjection`: `byDate`, `byMachine` e `summary`, com pico/limite de equipe, utilização, setups e conflitos.

`buildProductionCalendarValidationSnapshot` em `PlanningPage.js` converte essas saídas em `errors`, `warnings`, `stockState`, `dependencyState`, indicadores diários e capacidade extraordinária para a UI.

## 8. Persistência

### 8.1 Estrutura no banco

A migration `database/020_manual_schedule_persistence.sql` e o schema principal adicionam a `production_plans`:

- `manual_schedule_draft JSONB`;
- `manual_schedule_version INTEGER`;
- `manual_schedule_base_hash TEXT`;
- `manual_schedule_updated_at TIMESTAMPTZ`;
- `manual_schedule_validation_version TEXT`;
- `manual_schedule_validation_fingerprint TEXT`;
- `manual_schedule_validated_at TIMESTAMPTZ`;
- `manual_schedule_is_dirty BOOLEAN NOT NULL DEFAULT false`;
- `manual_schedule_revision INTEGER NOT NULL DEFAULT 0`;
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` para instalações migradas.

Em `production_plan_days`, adiciona `allocation_id TEXT`, `start_time TIME` e `end_time TIME`, além do índice único parcial `idx_production_plan_days_plan_allocation_unique` por `(plan_id, allocation_id)` quando o ID não é nulo.

### 8.2 Save/load, versão e revisão

`POST /planning/plans` sempre monta a base automática no servidor; se houver draft, revalida, serializa e usa `manualScheduleDays` no lugar de `plan.days`. A criação grava revisão 1 quando há draft manual.

`PUT /planning/plans/:id/manual-schedule` exige `expectedRevision`, bloqueia o plano com `FOR UPDATE`, compara a revisão e retorna conflito HTTP 409 se outro usuário tiver salvo. Após revalidação, substitui atomicamente os dias, atualiza JSON/metadados/período e incrementa `manual_schedule_revision`. A cláusula `WHERE ... manual_schedule_revision = expectedRevision` fornece uma segunda proteção otimista.

`GET /planning/plans/:id` normaliza `schedule_tree`, `operations` e `manual_schedule_draft`. Draft ausente é `legacy`; versão diferente é `incompatible`; JSON inválido é `invalid`. Um draft válido é devolvido com `dirty: false`.

### 8.3 Atomicidade, rollback e auditoria

Criação e atualização manual usam `db.begin(async tx => ...)`. Na atualização, delete/reinsert de `production_plan_days`, update do plano e `insertPlanningAudit` pertencem à mesma transação; falha lança exceção e desfaz a unidade de trabalho. A auditoria registra versão, número de allocations, pinned e warnings. O rollback de movimento antes do save é separado e ocorre em memória pela transação manual.

O endpoint manual não inclui atribuições a `schedule_tree` ou `operations`: esses campos automáticos são somente a base para hash, contexto e revalidação. Planos legados continuam legíveis e editáveis sem backfill obrigatório.

### 8.4 Banco versus `localStorage`

O banco tem prioridade para plano persistido. `reopenSavedPlan` remove o draft local e instala `manualScheduleDraft` retornado por `GET /planning/plans/:id`. `resolveManualScheduleRecovery` formaliza a mesma prioridade: draft válido do banco retorna `source: 'database'` e manda descartar o local; recuperação local só é elegível quando não há draft persistido e ID/revisão/data são compatíveis. No checkpoint documentado, esse helper tem teste unitário, mas não é chamado por `PlanningPage.js`; a prioridade efetiva na reabertura é implementada diretamente por `reopenSavedPlan`.

### 8.5 Baseline automática e descarte integral

`automaticSimulationBaseline.service.js` define o contrato imutável `automatic-simulation-baseline/v1`, composto pela resposta automática completa, allocations adaptadas e hash do conteúdo. Em uma simulação nova ele é capturado somente no retorno explícito de `/planning/simulate`, antes do primeiro draft manual, e salvo no draft local como `automaticBaseline`. Clones profundos separam entrada, baseline congelada e restauração.

Em plano salvo, `operations` e `schedule_tree` do banco continuam canônicos. `buildStoredAutomaticPlanningSnapshot` deriva cards e dias pelos mesmos contratos de segmentos usados na simulação, sem scheduler, e `GET /plans/:id` os fornece para criar a baseline em memória antes de aplicar o draft persistido. `DELETE /plans/:id/manual-schedule` usa transação, lock e revisão otimista para restaurar `production_plan_days`, limpar metadados manuais e preservar `operations`/`schedule_tree`.

O descarte prepara e valida um draft limpo em cópias, grava primeiro o próximo estado local e, em plano salvo, confirma a transação remota antes de trocar o estado exibido. Falha remota restaura o valor anterior do `localStorage`; draft legado não salvo sem baseline é bloqueado com mensagem explícita. O horizonte visual não participa da detecção de alterações, mas é zerado após descarte aceito.

## 9. Integração visual

- **Grid:** `ProductionCalendarGrid` cria linhas de máquinas e colunas diárias contínuas; células carregam `data-machine-id` e `data-date`.
- **Cards:** `ProductionCalendarCard` apresenta produção/material, quantidade, duração, capacidade, equipe, sequência e indicadores recebidos. `ProductionCalendarDetails` existe, mas seu acionamento está desconectado no fluxo produtivo atual; o botão de edição abre `ProductionCalendarEditor`.
- **Cores:** usa `productionColor` quando é hexadecimal válido; caso contrário escolhe paleta por hash de produção/operação, mantendo agrupamento visual previsível.
- **Zoom:** estado exclusivamente visual com níveis `compact` (160 px), `normal` (190 px), `comfortable` (225 px) e `large` (260 px); toolbar permite reduzir, ampliar e restaurar.
- **Seleção:** botão do card alterna `selectedAllocationId`; click em célula diferente emite click-move; sucesso limpa a seleção do bloco movido.
- **Modal:** detalhes do card são visuais. Já os modais de merge, replace e capacidade pertencem à orquestração de `PlanningPage.js`, pois coletam decisões de domínio sem executar a regra.
- **Drag:** ativa após limiar de 6 px, usa preview, pointer capture, Escape e supressão do click posterior. Apenas emite intenção.
- **Auto-scroll:** durante drag, move horizontalmente a grade e verticalmente a janela, recalculando a célula sob o ponteiro.
- **Erros/warnings:** o snapshot decora cards/dias; cabeçalho diário mostra contagem e tooltip, e a página acrescenta detalhes da validação. Capacidade extraordinária, estoque e dependências chegam como dados, não como decisões da UI.

Pertence à UI: DOM, formatação, cor, zoom, scroll, seleção, hover, preview, modal, loading, toast e emissão da intenção. Não pertence à UI: conservação de quantidades/IDs, produtividade, escolha de próximo slot, merge/replace/split, regras temporais, estoque, dependências, setup, equipe, aceite/rollback e serialização.

Observação de evidência: os componentes e estados visuais são cobertos indiretamente por inspeções/harnesses, mas os sete testes obrigatórios não abrem navegador. Assim, auto-scroll, layout, modal, cores e indicadores não têm homologação visual automatizada nesse conjunto; a homologação visual final permanece pendente.

## 10. Testes existentes

Os arquivos abaixo são scripts executáveis com asserts, não suites que dependem de framework declarado em `package.json`.

| Arquivo | Tipo | Principais cenários | Limitações |
| --- | --- | --- | --- |
| `tests/planningAllocation.service.test.js` | Unitário de adaptação/identidade antiga | Criação diária, total preservado, move, máquina inválida, rollback externo, equivalência drag/click, estabilidade de ID após reordenação. | Usa registry em memória e fixtures pequenas; não cobre draft transacional, DOM, API ou banco. |
| `tests/manualScheduleDraft.service.test.js` | Unitário de domínio do candidato | Célula vazia, produtividade ausente, merge, cancel/split/override, replace, movimentos consecutivos, equivalência drag/click, casos reais CA60/Q-196, componentes e rollback. | Testa criação do candidato isoladamente; não prova validação cronológica, persistência nem experiência visual. |
| `tests/manualScheduleValidation.service.test.js` | Unitário amplo de validação | Datas, feriados, `manualWorkDates`, turnos/noturno, overlap, determinismo; lote diário integral, consumo progressivo, transporte; ledger/locais/mínimo; setup/equipe/overrides. | Contexto totalmente em memória; não valida consultas reais, timezone do ambiente produtivo nem apresentação dos diagnósticos. |
| `tests/manualScheduleTransaction.service.test.js` | Unitário transacional | Contexto obrigatório, aceite, múltiplos movimentos, recusa/rollback byte a byte, estoque, lote diário integral, dia não útil, setup, equipe, warning, capacidade extraordinária, merge, replace, produtividade e equivalência drag/click. | Não usa `PlanningPage`, `localStorage`, API ou banco reais; modais são representados por decisões no payload. |
| `tests/manualSchedulePersistence.service.test.js` | Unitário de contrato + inspeção da migration | Round-trip v1, componentes, override, projeção de dias, versão incompatível, hash estável, prioridade do banco, draft inválido e presença de SQL na migration 020. | Não executa migration nem SQL; não testa concorrência/transação em PostgreSQL real. |
| `tests/planningManualScheduleIntegration.test.js` | Integração em memória + contrato estático de `PlanningPage.js` | Contexto completo, proibição de `simulateCurrent`/`scheduleOperations`, aceite antes de save local, recusa sem sobrescrever draft, compatibilidade de validação, reload em memória e snapshot V2. | Harness sem DOM e sem `localStorage` real; leitura de fonte protege forma arquitetural, mas não interação visual/API. |
| `tests/planningManualScheduleSaveLoad.integration.test.js` | Integração de serviços + inspeção estática da rota | Movimento aceito, serialização, reopen/revalidação preservando posições, transação/`FOR UPDATE`, revisão, replace dos dias, auditoria e criação com dias manuais. | Não sobe servidor nem banco e não prova rollback PostgreSQL/HTTP concorrente em execução real. |

O que está automatizadamente testado, mas não homologado visualmente, deve ser descrito dessa forma em futuras missões. Nenhum dos scripts atuais valida pixels, responsividade, auto-scroll real, foco/teclado em navegador ou aparência final dos indicadores.

## 11. Estado das pendências históricas

Estado confirmado na revisão de 2026-07-24:

- **implementado:** checkbox de dias não úteis por `manualWorkDates`;
- **implementado:** edição de equipe por dia/turno via `dailyTeamOverrides`;
- **implementado:** alertas e modal de estoque por data;
- **implementado:** editor unificado e split proporcional de allocations;
- **implementado com escopo amplo:** otimização por aproveitamento, que pode comparar candidatos e também iniciar nova simulação com materiais sugeridos;
- **parcial:** fluxo produtivo externo é re-renderizado após estados aceitos, mas ainda possui acoplamentos próprios e não equivale a uma projeção Gantt de precedências;
- **pendente/decisão:** divisão visual da timeline por turnos e intervalos;
- **pendente/decisão:** representação completa de precedências, setup, transporte e cores de fluxo no Gantt;
- **pendente:** homologação visual final em navegador.

As estruturas `manualWorkDates`, `dailyTeamOverrides`, `stockProjection` e `resourceProjection` possuem consumidores visuais, mas a existência de UI e testes estáticos não equivale a homologação operacional completa.

## 12. Dívida técnica e legado

- `CalendarTimeline` continua sendo usado por **Análise** em `pages/AnalysisPage.js`. O Comercial também o usa porque `pages/CommercialCalendarPage.js` chama `AnalysisPage({ mode: 'commercial' })`, cujo ramo comercial renderiza a mesma timeline. Esses consumidores impedem a remoção do módulo compartilhado.
- `pages/PlanningPage.js` ainda importa `CalendarTimeline` e mantém um fallback condicionado a `!USE_PRODUCTION_CALENDAR_V2`; como a constante está `true`, ele não é o caminho oficial, mas sua remoção deve ser missão própria e testada.
- `operationOverrides` e `operationSplits` ainda fazem parte do draft da tela e do payload automático. São consumidos por `services/planning.service.js` para datas/configuração e divisão antes da simulação; não podem ser confundidos com o draft manual V2.
- `allocationOverrides` e `applyPlanningAllocationMove` em `services/planningAllocation.service.js` representam a geração anterior de overrides de allocations. Têm testes e referências no scheduler (`planningCalendarOperations`), portanto só podem ser removidos depois de mapear todos os consumidores e definir migração/compatibilidade.
- Há listeners legados em `PlanningPage.js` para `operation-card-drop`, `operation-date-change`, `operation-config-change`, `operation-split-change`, `operation-split-remove` e `calendar-team-capacity-change`. Vários chamam `simulateCurrent`; eles pertencem aos controles antigos, não ao `productionCalendarMoveRunner`.
- Funções antigas como `applyDropPlanningChange`, `showProductionReplacementConfirmation`, `operationOverrideKeys`, `splitKeyForOperation` e manipuladores de reschedule permanecem no arquivo. Não devem ser reutilizadas para movimento V2.

Pode ser removido somente depois: fallback do Planejamento para `CalendarTimeline`, imports/helpers sem consumidor, listeners comprovadamente órfãos no V2 e contratos antigos após inventário de chamadas/testes/planos salvos.

É perigoso remover agora: `shared/CalendarTimeline.js` (Análise/Comercial), `operationOverrides`/`operationSplits` (simulador), `allocationOverrides` sem mapear `planning.service.js`, campos automáticos `schedule_tree`/`operations`, aliases de IDs usados para planos legados e normalizadores de versões antigas.

## 13. Regras para futuras missões do Codex

Checklist obrigatório antes de alterar o Calendário V2:

- [ ] Verificar se a função ou regra já existe e localizar seus consumidores.
- [ ] Preservar UTF-8 em arquivos, mensagens, fixtures e documentação.
- [ ] Fazer alteração cirúrgica, limitada à camada responsável.
- [ ] Não duplicar regra entre UI, draft, transação, validador e servidor.
- [ ] Não reconectar movimento manual ao simulador (`simulateCurrent`/`scheduleOperations`).
- [ ] Não alterar IDs estáveis nem fazê-los depender de data/máquina.
- [ ] Criar teste de regressão para o comportamento alterado.
- [ ] Não mexer em Análise/Comercial sem escopo explícito.
- [ ] Não remover legado sem mapear consumidores, eventos, testes e planos persistidos.
- [ ] Confirmar que candidato recusado não substitui draft, UI ou persistência aceitos.
- [ ] Confirmar que o endpoint manual continua preservando `schedule_tree` e `operations`.

## 14. Procedimento de depuração

1. **Reproduzir** o menor cenário possível, registrando allocation, origem, destino, decisão, contexto e diagnóstico retornado.
2. **Classificar** como bug, ajuste visual ou mudança de regra. Mudança de regra exige escopo explícito; não deve ser disfarçada de correção visual.
3. **Localizar a camada responsável:**
   - renderização/gesto/estado visual: `shared/production-calendar/*`;
   - montagem de contexto e orquestração: `pages/PlanningPage.js`;
   - criação do candidato/produtividade/reposicionamento consequente: `manualScheduleDraft.service.js`;
   - aceite/rollback: `manualScheduleTransaction.service.js`;
   - tempo/dependência: `manualScheduleValidation.service.js`;
   - estoque: `manualScheduleStockLedger.service.js`;
   - setup/equipe: `manualScheduleResourceValidation.service.js`;
   - contrato/save/load: `manualSchedulePersistence.service.js` e `server/routes/planning.routes.js`;
   - schema: migration/schema, somente quando a missão autorizar banco.
4. **Corrigir na camada correta**, preservando os invariantes da seção 2. Não contornar erro de domínio na UI nem corrigir apresentação dentro do validador.
5. **Adicionar teste de regressão** no nível mais baixo que reproduz o problema e, quando a fronteira entre camadas for relevante, um teste de integração.
6. **Repetir somente o cenário** e as validações diretamente relacionadas; ampliar a bateria conforme o risco da mudança.
7. **Não refatorar áreas não relacionadas** durante a correção. Dívida descoberta deve ser registrada separadamente.

## 15. Editor de recursos da operação

O editor do card altera exclusivamente `machineId` e `peopleCount`. `ProductionCalendarEditor` é um componente visual sem regra de planejamento; as opções compatíveis são derivadas por `getPlanningOperationResourceOptions` da mesma Matriz usada pelo reotimizador. O aceite segue `PlanningPage` → `reoptimizePlanningFuture` → `applyManualScheduleTransaction` com a intenção `EDIT_OPERATION_RESOURCES` → `acceptRecalculatedCalendar`.

`OPERATION_RESOURCES` é uma restrição persistente do draft para a operação pai. O scheduler incremental filtra a configuração exata de máquina/pessoas, congela allocations concluídas no corte corrente e reage ao impacto nas operações futuras, dependências, estoque e diagnósticos. O fluxo não chama `simulatePlanning`, não reconstrói a árvore e não captura nova baseline. Cada aceite passa uma vez por `recordAcceptedManualState`, portanto produz um único snapshot completo para undo/redo; descarte e persistência continuam usando os contratos existentes.

Na consolidação 8.1, `selectPlanningEditorProductivityRows` passou a selecionar primeiro os códigos exatos do material cadastrado em `material_code`/`material_codes`, usando `material_name` apenas como fallback quando não existe linha por código. A lista visual é agrupada exclusivamente a partir dessas linhas da Matriz. A prévia do modal usa `calculateProductivityDailyCapacity` e aritmética pura de duração; alterações nos campos não criam candidato, não validam o draft e não executam `reoptimizePlanningFuture`. A reotimização permanece restrita ao submit confirmado.

## 16. Editor unificado e splits recursivos proporcionais

Na Missão 8.3, o botão de edição do card passou a abrir `ProductionCalendarEditor`. A divisão é iniciada dentro desse editor; o callback separado `onSplitAllocation` existe na composição, mas não chega ao card no fluxo produtivo atual. O modal consulta a allocation física pelo `allocationId` selecionado, apresenta identificação, programação, quantidades e linhagem, e somente emite uma intenção no submit. Cancelar ou fechar não cria candidato nem histórico.

O percentual digitado na distribuição é relativo ao item aberto e usa centésimos inteiros; `capacityPercent` continua sendo a utilização real da configuração. `buildManualScheduleAllocationParts` particiona a quantidade em milionésimos, a capacidade em centésimos, os componentes e o intervalo original. Cada total é calculado para todas as partes e o resíduo determinístico fica na última. A troca de máquina/pessoas mantém a quantidade física e recalcula capacidade/duração com o resolvedor canônico da Matriz.

A linhagem persistida usa `splitRootAllocationId`, `splitParentAllocationId`, `splitDepth`, `splitPath`, `splitGroupId`, `splitPartId`, `splitOrder`, `splitSiblingCount`, `splitRatioPercent`, `splitAccumulatedRatioPercent`, `splitRootQuantity` e `splitRootCapacityPercent`. O pai imediato pode deixar de ser uma folha após nova divisão, mas seu ID permanece na descendência; não são criadas operations. Como o normalizador persistente conserva campos adicionais da allocation, save/reload mantém IDs e linhagem sem hidratação especial ou reotimização.

As intenções `EDIT_ALLOCATION` e `SPLIT_ALLOCATION` são aplicadas por `applyManualScheduleTransaction` sobre um clone do draft. Elas substituem somente a allocation alvo, preservam as irmãs e usam validação localizada por delta. O draft aceito só é instalado depois da validação estrutural e cronológica completa; uma falha em qualquer parte devolve o snapshot anterior. Um submit aceito chama `recordAcceptedManualState` uma vez, portanto undo/redo restaura toda a estrutura recursiva em um único item.

## 17. Estado reavaliado em 2026-07-24

### 17.1 Decisão de evolução

O Calendário V2 continua sendo o componente oficial em produção e passa a ser o rollback oficial durante a futura introdução do Gantt APS. A decisão anterior de manter dois componentes visíveis simultaneamente foi abandonada. O Gantt APS deverá substituir visualmente o V2 depois de cumprir as fases de paridade e homologação registradas em `docs/APS_GANTT_ARCHITECTURE.md`.

A primeira missão do Gantt será somente visual e de inspeção. Nessa fase:

- não haverá drag, resize, edição, split, transporte, otimização, descarte ou persistência pelo Gantt;
- “APS” identifica a estação visual futura, não um novo solver;
- o renderer não recebe callbacks mutáveis;
- o V2 permanece selecionável sem recriar draft ou baseline;
- `CalendarTimeline` não participa do rollback e continua necessário para Análise e Comercial.

### 17.2 Fluxo canônico preservado

```text
simulação automática
  -> adapter
  -> manualScheduleDraft aceito
  -> snapshot decorado
  -> renderer selecionado

intenção mutável futura
  -> PlanningPage/orquestração
  -> services canônicos
  -> candidato
  -> validação/reotimização
  -> aceite ou rollback
  -> persistência
```

Trocar o renderer não autoriza uma segunda implementação de scheduler, estoque, capacidade, precedência, produtividade, split, identidade ou persistência.

## 18. Inventário classificado do Calendário V2 atual

As classificações indicam o tratamento na substituição:

- **essencial:** não pode ser perdido;
- **importante:** deve ter paridade antes da ativação padrão;
- **acessório:** pode ser redesenhado sem alterar domínio;
- **legado:** existe por compatibilidade e não define a arquitetura-alvo;
- **potencialmente removível:** só pode sair em missão própria após confirmação de consumidores;
- **precisa de decisão do usuário:** comportamento ou UX ainda não consolidado.

### 18.1 Estrutura visual e visualização

| Capacidade | Comportamento confirmado | Classificação |
| --- | --- | --- |
| Toolbar | Undo, redo, descarte integral, otimização, zoom, restaurar zoom, ir ao início, fullscreen, `+7`, `+15`, `+30`, data limite e painel de seleção. | Importante |
| Cabeçalho fixo | Primeira coluna de máquina e cabeçalhos diários sticky. | Importante |
| Agrupamento | Uma lane visual por máquina e uma coluna por dia; múltiplas allocations por célula. | Essencial |
| Ordem de máquinas | Preferência `Trefila`, `EC-125`, `EC-60`, `Focus-8`, `Aço-8`, `MT-200`, `MT-150`, `MT-100`; demais preservam ordem de entrada. | Importante |
| Máquinas sem produção | Continuam renderizadas quando chegam no catálogo de máquinas. | Importante |
| Dias contínuos | O utilitário preenche lacunas e estende o horizonte com dias vazios utilizáveis. | Essencial |
| Janela/horizonte | `visibleEndDate`, data limite e expansões de 7, 15 e 30 dias. | Precisa de decisão do usuário |
| Zoom | Quatro larguras de card: 160, 190, 225 e 260 px. | Acessório |
| Scroll | Horizontal e vertical; sticky headers. A restauração entre renders é incompleta. | Importante |
| Fullscreen | Página fixa exclusiva que move a mesma instância; não usa Fullscreen API. | Acessório |
| Responsividade | CSS possui ajustes, mas não existe homologação automatizada em navegador. | Importante |
| Cards | Produção, etapa, material, quantidade, pessoas, duração, capacidade, máximo diário, transporte e diagnóstico. | Essencial |
| Produções compartilhadas | Memberships múltiplas, cores por participante e rótulos de etapa. | Importante |
| Cores | `productionColor` válida ou paleta determinística por hash. | Acessório |
| Hachura/dias não úteis | Fins de semana e feriados recebem estado visual não produtivo; dia liberado manualmente remove o bloqueio visual. | Essencial |
| Bordas/seleção | Card selecionado e estados de erro/warning possuem apresentação própria. | Importante |
| Legenda | Não há legenda completa do calendário V2; a legenda de fluxos vive em outra área de `PlanningPage`. | Precisa de decisão do usuário |
| Horários | `startTime`, `endTime` e `endDate` existem nos dados e detalhes, mas a grade atual não possui eixo horário contínuo. | Essencial |
| Almoço | Não é regra visual autônoma; decorre da configuração de turnos/intervalos canônicos. | Essencial |
| Capacidade parcial/extraordinária | `capacityPercent`, máximo diário e `isCapacityOverride` chegam prontos ao card. | Essencial |
| Cards divididos | Partes preservam IDs e linhagem `split*`; visualmente são allocations independentes. | Essencial |
| Transportes | Botão/modal, constraint persistente, indicador no card e conector SVG para downstream. | Importante |
| Predecessores/sucessores | A validação calcula dependências; o V2 não desenha todas as arestas, apenas conectores manuais de transporte. | Precisa de decisão do usuário |
| Estoque projetado | Cabeçalho diário abre modal de estoque de venda e produção; alertas aparecem no dia. | Importante |
| Diagnósticos | Card, dia e painel expansível exibem erros e warnings apresentados. | Essencial |
| Estado vazio | Adapter gera warning de ausência de operações; grid aceita máquinas/dias sem allocations. | Importante |
| Erro de contrato visual | Allocation inválida pode ser omitida e gera aviso; contrato inválido bloqueia a renderização do calendário. | Essencial |
| Virtualização | Não existe no V2; células de todo o horizonte são criadas mesmo quando ocultas. | Precisa de decisão do usuário |

### 18.2 Interações

| Capacidade | Comportamento confirmado | Classificação |
| --- | --- | --- |
| Clique no card | O botão de edição abre o editor; o corpo não abre detalhes no fluxo atual. | Importante |
| Duplo clique | Não foi encontrado comportamento produtivo. | Potencialmente removível |
| Seleção | Botão exclusivo por card controla `selectedAllocationId`. | Importante |
| Checkbox | Libera ou bloqueia `manualWorkDates` em dia não útil; exige confirmação quando há produção. | Importante |
| Click-move | Seleciona um card e clica em outra célula; emite `MOVE_ALLOCATION`. | Precisa de decisão do usuário |
| Drag and drop | Pointer capture, limiar de 6 px, preview, hover, Escape e supressão do click posterior. | Importante |
| Auto-scroll | Horizontal na grade e vertical na janela durante drag. | Importante |
| Drag diagonal | Permitido entre data e máquina; a UI emite intenção e o domínio decide. | Importante |
| Destino ocupado | Classificado como `occupied` ou `reorder`; merge/replace/reorder exigem decisões canônicas. | Essencial |
| Edição | Data, máquina, pessoas, quantidade/capacidade e prévia no editor unificado. | Importante |
| Divisão | Distribuição proporcional recursiva, recursos e datas por parte. | Essencial |
| Exclusão direta | Não foi encontrado comando de apagar allocation. Remoção de parte existe apenas antes do submit do editor; descarte restaura baseline. | Precisa de decisão do usuário |
| Restauração | Undo/redo local e descarte integral para baseline automática. | Essencial |
| Modal de detalhes | Componente e estado existem, mas o acionamento produtivo está desconectado. | Potencialmente removível |
| Modal de estoque | Abre pelo cabeçalho diário; fecha por botão, backdrop ou Escape. | Importante |
| Modal de transporte | Registra chegada/horas e reotimiza downstream após confirmação. | Importante |
| Fechamento de modal | Botão, cancelar, backdrop e Escape conforme o modal; deve preservar foco quando implementado. | Importante |
| Fullscreen/saída | Abre página exclusiva e restaura o calendário no fechamento. | Acessório |
| Ir ao início | Zera scroll horizontal e vertical. | Acessório |
| Atualização automática | Re-render local após aceite; movimento manual não chama simulação automática. | Essencial |
| Reotimização | Recalcula futuro permitido por cutoff e delta diagnóstico. | Essencial |
| Otimizar aproveitamento | Compara modos e pode iniciar nova simulação com materiais sugeridos; não é apenas reotimização incremental. | Precisa de decisão do usuário |
| Salvar | Revalidação server-side, serialização v2, revisão otimista e transação. | Essencial |
| Reabrir | Base automática + draft persistido, sem simulação silenciosa. | Essencial |
| Permissões | `planning:write` governa API; callbacks visuais usam `canEditAllocations` e `canEditDaySettings`. | Essencial |

### 18.3 Regras produtivas

| Regra | Fonte/comportamento confirmado | Classificação |
| --- | --- | --- |
| Capacidade diária | Matriz, equipe, minutos produtivos e configuração da máquina; não é calculada no card. | Essencial |
| `capacityPercent` | Utilização real da allocation; override extraordinário é explícito. | Essencial |
| Quantidade e resíduos | Precisão e conservação determinísticas em move/split/merge/replace. | Essencial |
| Duração | Derivada da produtividade/configuração canônica. | Essencial |
| Equipe | Pessoas por allocation, capacidade compartilhada e overrides por turno/dia. | Essencial |
| Máquina válida | Resolvida por identificador e Matriz de Produtividade. | Essencial |
| Estoque/componentes | Ledger cronológico e projeção diária separada; componentes seguem quantidade física. | Essencial |
| Precedência | Dependências, lote diário integral, buffer e liberação produtiva. | Essencial |
| Transporte | Despacho, trânsito, chegada e restrições downstream. | Essencial |
| Cutoff/passado congelado | Reotimização preserva passado e trata allocation que cruza o corte. | Essencial |
| Fins de semana/feriados | Não produtivos salvo `manualWorkDates`; validados por services. | Essencial |
| Turnos/noturno | Cobertura integral e cruzamento de meia-noite por `endDate`. | Essencial |
| Setup | Intervalos e conflitos por material/configuração e overrides. | Essencial |
| Split/partes | IDs novos somente para partes físicas novas; linhagem recursiva preservada. | Essencial |
| Diagnósticos | Estruturais, temporais, estoque, recursos, setup e apresentação sem reposicionamento. | Essencial |
| Revalidação | Browser e servidor; servidor prevalece no save. | Essencial |
| Persistência | Draft manual não sobrescreve `schedule_tree` nem `operations`. | Essencial |

### 18.4 Dados, contratos e dependências

| Item | Contrato confirmado | Classificação |
| --- | --- | --- |
| Fonte de verdade | `manualScheduleDraft.allocations` após criação do draft. | Essencial |
| Snapshot | `buildProductionCalendarSnapshot` combina allocations aceitas, dias, máquinas, projeções, permissões e estado visual. | Essencial |
| Operations | Base automática e compatibilidade; não substituem o draft editado. | Essencial |
| Baseline automática | Imutável, separada do draft; local em plano não salvo e derivada de `schedule_tree`/`operations` no salvo. | Essencial |
| `allocationId` | Identidade técnica persistente da allocation/barra. | Essencial |
| ID `readonly:*` | Fallback visual baseado em plano/operação/data/máquina/sequência; nunca persistível. | Legado |
| `operationId` | Identidade da operação/segmento; pode conter sufixo diário. | Essencial |
| `parentOperationId` | Identidade lógica para conservação, precedência e escopo. | Essencial |
| IDs de split | `splitRootAllocationId`, `splitParentAllocationId`, `splitGroupId`, `splitPartId`, caminho, ordem e profundidade. | Essencial |
| `machineId`/`machineName` | ID governa vínculo; nome é apresentação/compatibilidade. | Essencial |
| Datas/horários | Datas civis `YYYY-MM-DD`, horários explícitos e `endDate`; não inferir timezone por pixels. | Essencial |
| Timezone | Contexto de validação e reotimização; default de reotimização `America/Sao_Paulo`. | Essencial |
| Serialização/hash | Service canônico, contrato v2 e hash estável da base. | Essencial |
| Revision/locking | `manual_schedule_revision`, `expectedRevision`, `FOR UPDATE` e HTTP 409. | Essencial |
| Página/orquestração | `PlanningPage.js` concentra estado, callbacks, modais, API, cache e projeções. | Importante |
| UI compartilhada | `shared/production-calendar/*` deve permanecer visual. | Essencial |
| Rotas | Simulate, create, get, put/delete manual schedule e projeções analíticas. | Essencial |
| Banco | `production_plans` e `production_plan_days`; dias são projeção, não fonte completa do Gantt. | Essencial |
| Auditoria | Save e descarte registram ações no backend. | Essencial |
| `CalendarTimeline` | Fallback legado no Planejamento e consumidor ativo em Análise/Comercial. | Legado |
| Overrides antigos | `allocationOverrides`, `operationOverrides` e `operationSplits` ainda possuem consumidores. | Legado |

## 19. Dívidas e limitações confirmadas

1. `PlanningPage.js` concentra orquestração, estado, API, cache, modais, histórico, projeções e seletores DOM. A troca visual não autoriza refatoração ampla.
2. `ProductionCalendarDetails` e o estado de detalhes existem, mas o card não aciona o fluxo produtivo.
3. `onSplitAllocation` chega ao grid, porém não é encaminhado ao card; o split atual ocorre dentro do editor unificado.
4. `ProductionCalendarSplitEditor` está exportado e testado isoladamente, sem consumidor produtivo confirmado.
5. `storeGridScroll` não representa restauração completa entre renders; `restoreGridScroll` não está conectado ao shell.
6. Alterações de zoom não são propagadas por `onVisualStateChange`.
7. O shell define o horizonte com todos os dias disponíveis; o default isolado de oito dias não representa necessariamente a integração real.
8. O card é focável, mas não oferece paridade de teclado para abrir editor, selecionar ou mover.
9. `filters` existe no estado visual sem comportamento ativo confirmado.
10. `readOnly: true` no snapshot não bloqueia mutação: os campos efetivos são `canEditAllocations` e `canEditDaySettings`. O futuro Gantt readonly precisa de capabilities inequívocas e ausência estrutural de callbacks mutáveis.
11. O foco após fluxo produtivo procura seletor `.production-calendar-card[data-allocation-id]`; o futuro renderer precisa expor `focusAllocation(allocationId)`.
12. A ação de otimização por aproveitamento pode executar nova simulação automática e capturar nova baseline. Ela deve permanecer fora da primeira missão APS.
13. A projeção de estoque do draft atual e a projeção/alerta analítico do backend têm objetivos distintos e não podem ser fundidas na UI.
14. Os testes atuais não comprovam pixels, drag real, browser real, banco real, concorrência HTTP real ou ausência de vazamentos de lifecycle.

## 20. Status da futura substituição pelo Gantt APS

### 20.1 Decisões consolidadas

- A primeira substituição será experimental, somente leitura e atrás de uma seleção de renderer independente.
- O rollback oficial será `gantt-aps` para `production-calendar-v2`.
- `USE_PRODUCTION_CALENDAR_V2` não pode ser reutilizada, porque seu fallback é `CalendarTimeline`.
- Ambos os renderers deverão consumir um contrato neutro versionado derivado uma única vez do snapshot aceito.
- `task.id` no Gantt será exatamente `String(allocationId)`.
- O Gantt não poderá gerar identidade produtiva própria nem promover ID `readonly:*`.
- Zoom, scroll, horizonte e seleção visual serão isolados por renderer e não entrarão no draft, baseline, histórico manual ou persistência.
- O renderer terá lifecycle explícito: `mount`, `update`, `focusAllocation`, `getViewportState` e `destroy`.
- Falha de montagem/atualização do Gantt deverá destruir completamente sua instância antes de montar o V2.
- Auto-schedule, nivelamento e writeback de eventual biblioteca permanecerão desativados.

### 20.2 Condições antes de tornar o Gantt padrão

- paridade de IDs, quantidade, máquina, data, início, fim e `endDate`;
- nenhuma mutação de draft, baseline, hash, revision, histórico ou simulação durante inspeção;
- nenhuma chamada HTTP ou service mutável na fase somente leitura;
- cobertura de plano automático, plano salvo com draft v2, draft v1 normalizado e plano legado;
- lifecycle sem listeners, observers, timers ou overlays residuais;
- homologação visual e operacional com plano longo, splits, múltiplas allocations na mesma lane, turno noturno, dias não úteis, diagnósticos e fullscreen;
- decisões do usuário registradas no plano de tarefas;
- janela de rollback concluída antes de remover o V2.

### 20.3 Documentos vinculados

- arquitetura-alvo: `docs/APS_GANTT_ARCHITECTURE.md`;
- plano de execução: `docs/APS_GANTT_TASKS.md`;
- histórico contínuo: `docs/APS_GANTT_EVOLUTION_LOG.md`.

## 21. Cobertura documental e evidências

A revisão consultou `AGENTS.md`, `README.md`, este documento, as skills em `.agents/skills`, `PlanningPage.js`, todos os módulos em `shared/production-calendar`, services canônicos de planejamento, draft, transação, validação, recursos, estoque, persistência, baseline, reotimização e Matriz, rotas de planejamento, schema/migration e testes relacionados.

O conjunto atual de testes é maior que os sete scripts descritos historicamente na seção 10. Há cobertura adicional para baseline, histórico, split, editor, configuração, horizonte, cabeçalho, memberships, estágios, projeção de estoque, delta diagnóstico, cutoff e reotimização. Essa cobertura continua majoritariamente estática ou em memória e não substitui homologação de navegador.
