---
name: acofer-persistence-legacy
description: Orienta persistencia do calendario manual, save, refresh, reopen, descarte, revisao otimista, hash e compatibilidade legada.
---

# acofer-persistence-legacy

Use esta skill quando a tarefa pedir `$acofer-persistence-legacy` ou envolver save, refresh, reopen, discard, conflito de revisao, erro 409, `expectedRevision`, hash, baseline automatica, draft legado, draft incompativel, perda de alteracoes apos reabertura, schema ou migration relacionados ao calendario manual.

Esta skill e dona do procedimento de contrato persistido, save server-side, revisao otimista, `expectedRevision`, hash, reopen, discard, drafts legados, compatibilidade e schema/migration do calendario manual. Browser e UI sao consumidores do contrato persistido e podem ser consultados como evidencia; reconstrucao visual no browser nao e ownership desta skill.

Carregue skills relacionadas somente quando a evidencia atravessar fronteira:

- `$acofer-manual-calendar`: origem do draft em memoria, identidade e transacao antes do save.
- `$acofer-validation-diagnostics`: revalidacao server-side, erros e warnings.
- `$acofer-stock`: dias/projecao persistidos, saldo ou disponibilidade.
- `$acofer-investigation`: perda ou divergencia sem causa raiz definida.

Fora do escopo: regras produtivas exclusivamente em memoria, scheduler, layout visual, movimento manual comum sem persistencia e reotimizacao ampla.

## Fontes obrigatorias

- `CALENDAR_V2_ARCHITECTURE.md`: mapa normativo do contrato e fronteiras.
- `services/manualSchedulePersistence.service.js`: dona da serializacao, normalizacao, hash, dias e compatibilidade.
- `services/automaticSimulationBaseline.service.js`: baseline automatica usada na reabertura e compatibilidade.
- `services/planningAllocation.service.js`: evidencia para dias por `allocation_id`, allocations antigas e compatibilidade de IDs.
- `server/routes/planning.routes.js`: dona dos endpoints de save/reopen/discard, revalidacao server-side, `expectedRevision` e 409.
- `database/020_manual_schedule_persistence.sql`: colunas, revisao, hash, dias e indice de allocations.
- `database/001_schema.sql`: schema base.
- `services/planningStockProjection.service.js` e `services/materialStockMetrics.service.js`: fontes consumidas somente quando o problema envolver dias/projecao de estoque persistidos.
- Testes focados: `tests/manualSchedulePersistence.service.test.js`, `tests/automaticSimulationBaseline.service.test.js`, `tests/planningManualScheduleSaveLoad.integration.test.js`, `tests/planningManualScheduleIntegration.test.js`.

## Contrato persistido

- Baseline automatica e draft manual persistido sao contratos distintos: a baseline preserva `schedule_tree`/`operations`; o draft representa o calendario editado.
- O JSON do draft deve ser serializado pelo service canonico; validacoes derivadas ficam fora do draft quando o contrato assim definir.
- Campos ausentes em drafts antigos seguem a normalizacao do service, sem backfill destrutivo por conveniencia.
- Browser, localStorage e renderizacao sao evidencias para investigar save/reopen, nao fonte do contrato persistido.

## Revisao, hash e concorrencia

- `manual_schedule_revision` e controle otimista: cliente envia `expectedRevision`; servidor compara e incrementa em update/descarte bem-sucedido.
- 409 e conflito de revisao ou corrida equivalente; nao trate como sucesso silencioso.
- Race de duplo clique, aba paralela, retry apos 409 ou cache stale no browser e auditado por esta skill quando a evidencia envolver o contrato `expectedRevision`; UI continua sendo evidencia/consumidora.
- Hash/base hash deve ser calculado pela fonte canonica para relacionar draft manual e baseline automatica.
- Save server-side deve revalidar, serializar e gravar draft, metadados e dias em transacao, preservando alteracoes ja salvas quando a revisao esperada nao confere.

## Reopen, refresh e discard

- Reopen combina baseline automatica persistida e draft manual persistido; nao define regra visual do browser.
- Refresh/read-only nao deve mutar estado.
- Discard remove calendario manual e restaura baseline automatica persistida, respeitando revisao otimista.
- Em perda apos reopen, compare contrato persistido, revision, hash e payloads; use estado reconstruido no browser apenas como evidencia.

## Migration e legado

- Migration so entra quando o contrato persistido exigir novo campo ou indice e os campos atuais forem insuficientes.
- Migration deve ser idempotente e preservar planos existentes.
- Nao converta drafts antigos de forma destrutiva para limpar casos legados.
- Antes de alterar schema, descarte erro de serializacao, normalizacao, rota, conflito 409 ou stale state.

## Checklist enxuto

- A tarefa e save/reopen/discard/revision/hash ou apenas evidencia visual?
- O `expectedRevision` foi enviado, comparado e tratado corretamente?
- Baseline automatica e draft manual persistido permanecem distintos?
- Campo ausente e legado foram normalizados pelo contrato persistido sem conversao destrutiva? Se o problema for normalizacao apenas em memoria, carregue `$acofer-manual-calendar`.
- A validacao, estoque ou calendario manual exigem carregar skill propria?

## Formato de entrega

Retorne:

- `Skills usadas`.
- Contrato persistido ou endpoint envolvido.
- Dona da regra e dominios apenas consumidos.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Riscos de legado/conflito identificados.
- Validacoes realizadas.
