---
name: acofer-reoptimization
description: Guia reotimizacao incremental do planejamento Aco-Fer: cutoff, passado congelado, futuro restante, fingerprint, candidatos, aceite/rejeicao, delta, redistribuicao, recursos, datas liberadas, manualWorkDates e dailyTeamOverrides.
---

# acofer-reoptimization

Use esta skill quando a tarefa pedir `$acofer-reoptimization` ou envolver alteracao de equipe, recurso, produtividade, capacidade, datas liberadas, `manualWorkDates`, `dailyTeamOverrides`, cutoff, passado congelado, recalculo apenas do futuro, candidato reotimizado, aceite/rejeicao, delta de diagnosticos, preservacao de decisoes manuais, redistribuicao ou replanejamento parcial.

Esta skill e dona do procedimento de reotimizacao: definir cutoff, separar passado congelado do futuro restante, reconstruir work items incrementais, preservar decisoes manuais, calcular fingerprint, gerar candidato, comparar diagnosticos, aceitar/rejeitar, aplicar delta e redistribuir somente o escopo permitido. Ela consome estoque, validacao e calendario manual, mas nao redefine esses dominios.

Consumidores: todos os agents.

Fora do escopo: UI, save/reopen, ledger, draft manual comum, validacao estrutural como dominio principal e scheduler automatico inicial.

## Skills relacionadas

Carregue skills relacionadas somente quando houver evidencia real de fronteira:

- `$acofer-stock`: saldo, ledger, disponibilidade, entrada/consumo ou projecao usados como insumo da reotimizacao.
- `$acofer-manual-calendar`: origem do `acceptedDraft`, transacao manual, split, merge, replace, move, rollback ou identidade de allocations antes/depois do candidato.
- `$acofer-validation-diagnostics`: erro, warning, capacidade, dependencia, transporte, recurso ou comparacao de diagnosticos que precise mudar regra de validacao.
- `$acofer-persistence-legacy`: save/reopen/discard, `expectedRevision`, hash, draft legado ou perda do candidato apos persistencia.
- `$acofer-investigation`: sintoma ainda sem causa raiz, divergencia entre UI/service/banco ou suspeita de regressao ampla.

Evite carregar skills de estoque, persistencia ou UI apenas porque a reotimizacao as consome.

## Fontes canonicas

- `services/planningReoptimization.service.js`: fonte principal de cutoff, calendario de reotimizacao, reconstrucao do futuro, work items, redistribuicao, preservacao de passado, fingerprint, candidato, `changeSet`, `identityMap` e `cutoffSnapshot`.
- `services/planningDiagnosticDelta.service.js`: fonte de identidade, magnitude, delta e regressao bloqueante de diagnosticos para aceitar ou recusar candidato.
- `services/manualScheduleValidation.service.js`: validacao consumida para diagnosticar o candidato; ownership de validacao e `$acofer-validation-diagnostics`.
- `services/manualScheduleDraft.service.js`: capacidade diaria e estruturas do draft consumidas; ownership de draft manual e `$acofer-manual-calendar`.
- `services/productivityMatrixResolution.service.js`: resolucao de matriz, maquina, pessoas e configuracao produtiva usada como insumo.
- `services/manualScheduleStockLedger.service.js`, `services/planningStockProjection.service.js` e `services/materialStockMetrics.service.js`: insumos de estoque quando o candidato depende de saldo/projecao; ownership e `$acofer-stock`.
- `pages/PlanningPage.js`: orquestracao de comandos de calendario que chamam `reoptimizePlanningFuture` e aplicam candidato aceito.
- Testes focados: `tests/planningReoptimization.service.test.js`, `tests/planningDiagnosticDelta.service.test.js`, `tests/planningDailyTeamOverride.integration.test.js` e `tests/productionCalendarConfigurationEdit.integration.test.js`.

## Procedimento

1. Identifique o motivo da reotimizacao: equipe, recurso, produtividade, capacidade, data liberada, move com futuro afetado ou politica de redistribuicao.
2. Confirme o `acceptedDraft` atual. Depois que o draft manual existe, ele e a base aceita para congelar passado e reconstruir futuro.
3. Normalize o cutoff por data e hora. O passado ate o cutoff deve permanecer congelado; allocation que cruza o cutoff deve ser dividida por quantidade ja concluida e quantidade restante.
4. Localize o escopo futuro: todos os itens futuros ou `scopeParentOperationIds` quando o replanejamento for parcial.
5. Confirme os insumos: baseline automatica, matriz de produtividade, calendario, `manualWorkDates`, `dailyTeamOverrides`, estoque/projecao e dependencias.
6. Gere o candidato pela fonte canonica de reotimizacao. Nao chame scheduler automatico inicial para movimento manual ou reotimizacao incremental.
7. Compare fingerprint do passado. Qualquer alteracao no passado congelado deve recusar o candidato.
8. Compare quantidade total, identidade, restricoes pinadas e `identityMap`. Decisoes manuais explicitas nao podem desaparecer silenciosamente.
9. Valide o candidato e compare delta de diagnosticos. Regressoes bloqueantes recusam o candidato; melhoria ou manutencao pode ser aceita conforme o fluxo.
10. Aplique somente candidato aceito. Candidato recusado nunca substitui o draft aceito.

## Regras de aceite e rejeicao

- Aceite exige preservacao do passado congelado, conservacao de quantidade e ausencia de regressao bloqueante pelo delta.
- Rejeicao deve retornar diagnosticos, delta, `cutoffSnapshot` quando existir e preservar o draft anterior.
- `manualWorkDates` e `dailyTeamOverrides` entram como mudancas de restricao; nao devem ser tratados como simples estado visual.
- Mudanca de recurso/produtividade deve preservar configuracoes manuais compativeis e atualizar apenas o futuro afetado.

## Checklist enxuto

- O problema e reotimizacao incremental ou scheduler automatico inicial?
- O cutoff foi identificado com data e hora?
- O passado congelado e allocation cruzando cutoff foram preservados corretamente?
- O candidato preserva decisoes manuais, quantidade fisica, identidade e restricoes?
- O delta de diagnosticos explica aceite/rejeicao?
- Estoque, validacao, persistencia ou UI exigem skill propria?
- O teste focado cobre o fluxo afetado sem ampliar validacao alem do risco?

## Formato de retorno

Retorne:

- `Skills usadas`.
- Motivo da reotimizacao e cutoff.
- Dona da regra e dominios apenas consumidos.
- Fonte canonica de reconstrucao parcial do futuro.
- Candidato gerado, aceito ou recusado.
- Delta de diagnosticos e regressoes bloqueantes.
- Preservacao de passado, decisoes manuais e identidade.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Validacoes realizadas.
