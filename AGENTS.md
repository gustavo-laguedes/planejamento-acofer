# Planejamento Aço-Fer - Instruções Para Codex

## Escopo Do Projeto

- Sistema web interno de PCP para planejamento de produção, estoque, importação CSV, matriz de produtividade, cadastros e acompanhamento programado x realizado.
- Frontend ESM sem build em `pages/`, `shared/` e `shared/production-calendar/`.
- Backend Node/Express em `server/`, rotas em `server/routes/`, persistência em Neon/Postgres via `server/db.js`.
- Regras de domínio ficam em `services/`; a UI deve orquestrar, apresentar e chamar services/API, não reinventar regra produtiva.
- Banco e evoluções ficam em `database/`; migrations são idempotentes e não devem ser alteradas sem necessidade comprovada.
- A arquitetura normativa do Calendário V2 está em `CALENDAR_V2_ARCHITECTURE.md`; use esse arquivo como mapa, mas confirme sempre no código atual.

## Fontes Canônicas

- Simulação automática e árvore de planejamento: `services/planning.service.js` (`buildPlan`, scheduler interno e snapshot automático).
- Allocations diárias e compatibilidade de overrides antigos: `services/planningAllocation.service.js`.
- Draft manual, movimentos, splits, merges, replace, override e conservação de quantidades: `services/manualScheduleDraft.service.js`.
- Coordenação de aceite/rollback e validação transacional: `services/manualScheduleTransaction.service.js`.
- Validação temporal, dias úteis, turnos, dependências, transportes, estoque e recursos: `services/manualScheduleValidation.service.js`.
- Ledger canônico de estoque do calendário manual: `services/manualScheduleStockLedger.service.js`.
- Validação de máquinas, pessoas, setup e capacidade: `services/manualScheduleResourceValidation.service.js`.
- Reotimização de futuro após cutoff: `services/planningReoptimization.service.js`.
- Persistência, versão, hash, dias persistidos e compatibilidade de drafts antigos: `services/manualSchedulePersistence.service.js`.
- Projeção de estoque do planejamento e saldo inicial canônico: `services/planningStockProjection.service.js` e `services/materialStockMetrics.service.js`.
- Resolução canônica de material, máquina, pessoas e linha da matriz: `services/productivityMatrixResolution.service.js`.
- API de planejamento, revalidação server-side, controle otimista e transações: `server/routes/planning.routes.js`.
- Schema base e migrations: `database/001_schema.sql` e `database/020_manual_schedule_persistence.sql`.

## Invariantes Arquiteturais

- Depois de criado, `manualScheduleDraft` é a fonte de verdade do calendário editado.
- Movimento manual não chama `simulateCurrent`, `buildPlan` nem scheduler automático; passa por `applyManualScheduleTransaction`.
- Validadores não reposicionam allocations. Eles produzem diagnósticos, projeções e warnings.
- Candidato recusado nunca substitui draft aceito; rollback deve preservar o draft anterior.
- Persistência manual não sobrescreve `schedule_tree` nem `operations` automáticos.
- `allocationId` persistente é identidade técnica estável; não derive identidade persistente de data, máquina, texto visual ou ID fallback do adapter.
- Reabertura de plano salvo usa a base automática e o draft persistido; não dispara nova simulação silenciosa.
- Endpoints somente leitura não devem mutar estado.
- Controle otimista por `manual_schedule_revision` deve ser preservado em updates manuais.
- Compatibilidade com planejamentos antigos e drafts sem contrato V2 deve continuar sem conversão destrutiva.

## Invariantes Produtivas

- Produção, consumo, dependências, disponibilidade integral, transporte e estoque devem seguir as regras canônicas dos services citados acima.
- Capacidade respeita calendário produtivo, turnos, pessoas disponíveis, setup, feriados, sábados/domingos e `manualWorkDates`.
- Divisões preservam quantidade física, componentes, rastros e resíduos de forma determinística.
- Matriz produtiva válida deve governar máquina, pessoas, prioridade, unidade, tempo e capacidade; não use nome quando o vínculo exige identificador cadastral.
- Estoque negativo, saldo inicial, mínimo, produção disponível e consumo seguem a política implementada no ledger/projeção, não regra visual nova.
- Mudanças manuais, `pinned`, overrides e decisões explícitas não podem desaparecer silenciosamente em refresh, save, reopen ou reotimização.

## Áreas De Risco

- `pages/PlanningPage.js` é grande e mistura orquestração, estado de UI, cache e chamadas a services; altere com escopo estreito.
- `shared/production-calendar/*` deve permanecer visual: recebe dados prontos e emite intenções/callbacks.
- Reotimização deve separar passado congelado do futuro restante e comparar diagnósticos por delta.
- Estoque pode ficar stale no browser; qualquer mudança nesse fluxo precisa validar impacto no server-side save.
- IDs legados aparecem como `operationId`, `calendarParentOperationId`, `splitParentOperationId`, `parentOperationId`, `allocationId`, `productionId` e `productionIndex`; preserve normalização existente.
- Alguns arquivos históricos já contêm trechos com encoding corrompido; não corrija encoding fora do escopo.

## Testes E Validação

- `package.json` não define `npm test`.
- Teste individual comum: `node tests/<arquivo>.js`.
- Teste com runner Node: `node --test tests/*.js`.
- Banco: `npm run db:schema` aplica migrations; `npm run db:validate` valida schema, ambos dependem de `DATABASE_URL`.
- Servidor local: `npm run dev` ou `npm start`.
- Antes de escolher validações, confira os arquivos em `tests/` relacionados ao risco tocado.

## Coordenação De Subagents

Use subagents explicitamente, por delegação do Codex coordenador, quando a tarefa justificar. Não convoque todos automaticamente para tarefas pequenas.

- Mudança arquitetural ou de alto risco: `leonardo-da-vinci -> rogerio-ceni -> leco-lecreco -> jarvis -> toto-wolff -> max-verstappen`.
- Correção pequena e bem delimitada: `jarvis -> toto-wolff -> max-verstappen`.
- Investigação sem implementação: `leonardo-da-vinci -> leco-lecreco -> rogerio-ceni`.
- Auditoria de código já implementado: `rogerio-ceni -> leco-lecreco -> toto-wolff`.

Regras de coordenação:

- Cada agent atua apenas na sua especialidade.
- O implementador não homologa o próprio trabalho.
- O homologador não altera código.
- O arquiteto não implementa sem solicitação explícita.
- O auditor não reescreve silenciosamente o que está auditando.
- Delegações devem incluir requisito, arquivos prováveis, risco esperado, validações desejadas e limite claro de escrita/leitura.
- Preserve alterações existentes do usuário; não faça commit nem push sem pedido explícito.
