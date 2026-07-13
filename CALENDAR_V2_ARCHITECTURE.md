# Calendário de Produção V2 — Arquitetura oficial

Este documento descreve o estado do Calendário de Produção V2 no checkpoint `39b3847` da branch `rebuild-production-calendar`. Ele é normativo para manutenção do Planejamento e foi levantado a partir do código, do schema, da migration 020 e dos testes existentes. Quando uma garantia é apenas automatizada, isso é indicado explicitamente; os testes listados não substituem homologação visual em navegador.

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
3. Movimento manual não chama `scheduleOperations`.
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
8. **Aceite ou rollback.** Sem erro bloqueante, o candidato recebe `validation` e retorna com `accepted: true`. Com erro, decisão cancelada ou exceção, retorna o draft anterior byte a byte; a UI também restaura o estado visual anterior.
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
| `services/manualScheduleTransaction.service.js` | É o único coordenador de movimento aceito: cria candidato, exige contexto, valida estrutura e cronologia, classifica decisões, anexa validação compatível e retorna aceite/rollback. Entrada: `currentDraft`, `intent`, contextos e `decisions`. Saída: `{ accepted, draft, previousDraft, validation, blockingIssues, warnings, decisionRequired }`. | Não faz I/O/persistência, não muta `currentDraft`, não chama simulador/scheduler e não aceita erro bloqueante. |
| `services/manualSchedulePersistence.service.js` | Define contrato persistido v1, normaliza allocations, calcula hash da base, serializa draft, converte dias, resume auditoria e resolve prioridade banco/local. Entradas: draft, base automática, configurações e metadados. Saídas: JSON persistível, dias, status de abertura e resumo. | Não acessa banco/API, não persiste validações derivadas dentro do draft e não altera `schedule_tree`/`operations`. |

### 4.4 API e banco

| Arquivo | Pode fazer / entradas / saídas / dependências | Não pode fazer |
| --- | --- | --- |
| `server/routes/planning.routes.js` | Expõe simulação, criação, leitura e atualização manual. Recompõe contexto real do banco, revalida com `applyManualScheduleTransaction`, serializa, grava plano/dias em transação, controla revisão e registra auditoria. Entradas: HTTP, usuário e banco. Saídas: plano, base automática, draft e dias. Funções-chave: `validateManualScheduleForSave`, `manualScheduleValidationMetadata`, `insertPlanningAudit`; rotas `POST /simulate`, `POST /plans`, `GET /plans/:id`, `PUT /plans/:id/manual-schedule`. | O endpoint manual não deve recalcular nem sobrescrever `schedule_tree`/`operations`; não deve confiar somente na validação enviada pelo cliente. |
| `database/020_manual_schedule_persistence.sql` | Evolui instalações existentes com colunas do draft/metadados/revisão, campos diários e índice único parcial por `(plan_id, allocation_id)`. | Não contém lógica de negócio nem backfill/conversão de planos legados. |
| `database/001_schema.sql` | Define o schema principal já com as colunas V2 em `production_plans` e `production_plan_days`. | Não substitui a migration incremental 020 em bancos existentes. O índice único parcial está na migration 020, não no trecho principal da tabela. |

### 4.5 Testes

Os sete arquivos obrigatórios são scripts Node com `node:assert/strict`; os de integração também leem fonte para proteger fronteiras arquiteturais. Dependem diretamente dos serviços, de fixtures em memória e, em alguns casos, de leitura de `PlanningPage.js`, rota e migration. Não usam navegador nem banco real. O detalhamento está na seção 10.

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

Em memória, `createManualScheduleDraft` cria `draftId`, `planningId`, `baseSimulationId`, `allocations`, `createdAt`, `updatedAt` e `dirty`. Movimentos aceitos acrescentam `lastManualAction` e `validation`. Na serialização, `serializeManualScheduleDraft` gera contrato `version: 1`, `baseSimulationHash` e configurações (`manualWorkDates`, `dailyTeamOverrides`, `setupMinutes`, `minimumStartRatio`, `dependencyCompletionBufferMinutes`). A validação derivada não é gravada dentro do JSON persistido; versão, fingerprint e instante da validação vão para colunas próprias do plano.

Campos de rastreabilidade e decisão:

- `components`: parcelas lógicas que compõem um card, com seus IDs, operação pai, produção e quantidade. Permite que unificação/divisão conserve origem e rateio.
- `sourceAllocationIds`: IDs técnicos originais representados pelo card atual.
- `sourceParentOperationIds`: operações lógicas originais representadas pelo card.
- `pinned`: indica allocation posicionada/manualmente preservada. Movimentos, merges e reposicionamentos decorrentes ficam pinned.
- `isCapacityOverride`: registra autorização explícita para capacidade acima de 100%; gera warning `EXTRAORDINARY_CAPACITY_AUTHORIZED`.
- `validation`: resultado derivado do último candidato validado, com erros, warnings e projeções. Compatibilidade é verificada por `validationVersion` e `draftFingerprint`.
- `revision`: controle otimista do plano no banco (`production_plans.manual_schedule_revision`). Não é a identidade do draft; o cliente envia `expectedRevision` e o servidor incrementa após update bem-sucedido.
- `baseSimulationHash`: hash estável `manual-base/v1:*` de operações, árvore, matriz, turnos, parâmetros e estoque de referência. Identifica a base automática usada na serialização.
- versionamento: `MANUAL_SCHEDULE_CONTRACT_VERSION = 1` para o JSON e `MANUAL_SCHEDULE_VALIDATION_VERSION = 'manual-schedule-validation/v1'` para a validação derivada.

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

Um **erro bloqueante** tem `severity: 'error'` e `blocking !== false`; torna `valid: false`, impede aceite e impede save no servidor. Um **warning** tem `severity: 'warning'` e `blocking: false`; permite o aceite, fica associado ao draft e aparece na V2. Warning nunca corrige ou movimenta o calendário.

### 7.2 Regras temporais e operacionais

- **Datas e horários:** ISO `YYYY-MM-DD`, horas válidas e intervalos positivos; suporta turno/allocation atravessando meia-noite.
- **Dias úteis e `manualWorkDates`:** sábado, domingo e feriado são bloqueados por `NON_WORKING_DATE_NOT_RELEASED`, salvo liberação explícita. A liberação não dispensa turno válido.
- **Turnos:** configurações inválidas ou sobrepostas são erros; toda allocation deve estar integralmente coberta pelas janelas válidas.
- **Sobreposição de máquina:** intervalos sobrepostos na mesma máquina geram `MACHINE_TIME_OVERLAP`; fronteiras em que um termina exatamente quando outro começa são permitidas.
- **Dependências e regra de 30%:** `minimumStartRatio` padrão é `0.30`. A oferta do produtor deve atingir o mínimo antes do início consumidor; o fluxo progressivo não pode deixar o consumidor avançar além da oferta, e a quantidade integral deve respeitar `dependencyCompletionBufferMinutes` (padrão 60).
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

## 9. Integração visual

- **Grid:** `ProductionCalendarGrid` cria linhas de máquinas e colunas diárias contínuas; células carregam `data-machine-id` e `data-date`.
- **Cards:** `ProductionCalendarCard` apresenta produção/material, quantidade, duração, capacidade, equipe, sequência e indicadores recebidos. O detalhe é montado por `ProductionCalendarDetails`.
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
| `tests/manualScheduleValidation.service.test.js` | Unitário amplo de validação | Datas, feriados, `manualWorkDates`, turnos/noturno, overlap, determinismo; dependência 30%, consumo progressivo, transporte; ledger/locais/mínimo; setup/equipe/overrides. | Contexto totalmente em memória; não valida consultas reais, timezone do ambiente produtivo nem apresentação dos diagnósticos. |
| `tests/manualScheduleTransaction.service.test.js` | Unitário transacional | Contexto obrigatório, aceite, múltiplos movimentos, recusa/rollback byte a byte, estoque, 30%, dia não útil, setup, equipe, warning, capacidade extraordinária, merge, replace, produtividade e equivalência drag/click. | Não usa `PlanningPage`, `localStorage`, API ou banco reais; modais são representados por decisões no payload. |
| `tests/manualSchedulePersistence.service.test.js` | Unitário de contrato + inspeção da migration | Round-trip v1, componentes, override, projeção de dias, versão incompatível, hash estável, prioridade do banco, draft inválido e presença de SQL na migration 020. | Não executa migration nem SQL; não testa concorrência/transação em PostgreSQL real. |
| `tests/planningManualScheduleIntegration.test.js` | Integração em memória + contrato estático de `PlanningPage.js` | Contexto completo, proibição de `simulateCurrent`/`scheduleOperations`, aceite antes de save local, recusa sem sobrescrever draft, compatibilidade de validação, reload em memória e snapshot V2. | Harness sem DOM e sem `localStorage` real; leitura de fonte protege forma arquitetural, mas não interação visual/API. |
| `tests/planningManualScheduleSaveLoad.integration.test.js` | Integração de serviços + inspeção estática da rota | Movimento aceito, serialização, reopen/revalidação preservando posições, transação/`FOR UPDATE`, revisão, replace dos dias, auditoria e criação com dias manuais. | Não sobe servidor nem banco e não prova rollback PostgreSQL/HTTP concorrente em execução real. |

O que está automatizadamente testado, mas não homologado visualmente por esses testes, deve ser descrito dessa forma em futuras missões. Nenhum dos sete arquivos valida pixels, responsividade, auto-scroll real, foco/teclado em navegador ou aparência final dos indicadores.

## 11. Funcionalidades ainda pendentes

Pendências conhecidas, sem implementação nesta documentação:

- checkbox de dias não úteis no V2;
- edição de equipe por dia no V2;
- alertas de estoque por data;
- divisão visual por turnos;
- atualização do fluxo produtivo pelo draft;
- otimização automática da equipe;
- setas do fluxo com cores;
- homologação visual final.

Algumas estruturas de suporte já existem (`manualWorkDates`, `dailyTeamOverrides`, `stockProjection`, `resourceProjection`), mas isso não equivale a disponibilizar e homologar a funcionalidade visual correspondente no V2.

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
