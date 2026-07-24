---
name: acofer-validation-diagnostics
description: Orienta analises e mudancas em validacoes, erros, warnings, recursos, capacidade e diagnosticos do planejamento Aco-Fer.
---

# acofer-validation-diagnostics

Use esta skill quando a tarefa pedir `$acofer-validation-diagnostics` ou envolver erro, warning, bloqueio de movimento, conflito temporal, capacidade, equipe, turno, dia util, sabado, domingo, data manual, dependencia, transporte, setup, diagnostico divergente ou normalizacao semantica de diagnostico.

Esta skill e dona do procedimento de validacao estrutural como diagnostico, validacao temporal, recursos, capacidade, turnos, dias produtivos, dependencias, transporte, setup, erros, warnings e normalizacao semantica de diagnosticos. Ela valida e normaliza diagnosticos sem mover allocations, persistir, recalcular futuro ou decidir renderizacao visual.

Carregue skills relacionadas somente quando a evidencia atravessar fronteira:

- `$acofer-manual-calendar`: candidato, move, split, merge, replace, transacao ou rollback.
- `$acofer-stock`: saldo, ledger, disponibilidade, piso zero ou estoque minimo.
- `$acofer-persistence-legacy`: `expectedRevision`, 409, concorrencia de save, contrato persistido ou reopen.
- Futura `$acofer-reoptimization`: cutoff, reconstrucao do futuro, candidato reotimizado, aplicacao do delta e aceite/rejeicao.
- `$acofer-investigation`: causa raiz ainda nao explicada.

Fora do escopo: mover allocations, persistir draft, definir contrato de concorrencia, renderizar UI, executar reotimizacao completa ou alterar regra de dominio sem fonte canonica.

## Fontes canonicas

- `services/manualScheduleDraft.service.js`: dona da checagem estrutural executavel do draft; esta skill consome o resultado como diagnostico. Identidade, rastros e conservacao em movimento pertencem a `$acofer-manual-calendar`.
- `services/manualScheduleValidation.service.js`: dona das regras temporais, dias produtivos, turnos, dependencias, transporte, estoque consumido e agregacao de diagnosticos.
- `services/manualScheduleResourceValidation.service.js`: dona de maquinas, pessoas, setup, capacidade e recursos.
- `services/manualScheduleDiagnosticPresenter.service.js`: dona da normalizacao semantica de diagnosticos para consumo; layout/renderizacao visual permanece fora do escopo.
- `services/planningDiagnosticDelta.service.js`: mecanismo de comparacao/aceite consumido por reotimizacao; nao e ownership completo da validacao comum.
- `services/planningReoptimization.service.js`: fronteira para cutoff, futuro reotimizado e uso do delta ate existir skill propria.
- `services/manualScheduleTransaction.service.js`: consumidora de diagnosticos para aceite/rollback em memoria.
- `services/manualScheduleStockLedger.service.js`: fonte consumida para diagnosticos de estoque; ownership de estoque e `$acofer-stock`.
- `server/routes/planning.routes.js` e `services/manualSchedulePersistence.service.js`: evidencias de revalidacao server-side, `expectedRevision`, 409 e contrato persistido; ownership e `$acofer-persistence-legacy`.
- Testes focados: `tests/manualScheduleValidation.service.test.js`, `tests/manualScheduleTransaction.service.test.js`, `tests/manualScheduleDiagnosticPresenter.service.test.js`, `tests/planningDiagnosticDelta.service.test.js`, `tests/planningDailyTeamOverride.integration.test.js`, `tests/productionCalendarConfigurationEdit.integration.test.js`.

## Tipos de validacao

- Estrutural: formato, identidade, datas validas, numeros finitos, conservacao e rastros.
- Temporal: calendario produtivo, turno, sobreposicao, dependencias e transporte.
- Produtiva: condicoes derivadas de producao, consumo, disponibilidade e matriz quando usada como insumo; saldo/estoque pertence a `$acofer-stock` e matriz ampla exige dominio proprio.
- Recursos: maquina, pessoas, setup, capacidade, feriados, fins de semana e datas manuais.
- Normalizacao: prepara diagnosticos para consumo sem criar regra produtiva nova nem decidir UI visual.

## Erros, warnings e delta

- Erro bloqueante impede aceite quando a transacao exige validade absoluta.
- Warning informa condicao toleravel; nao promova a bloqueio sem fonte canonica e teste.
- `planningDiagnosticDelta.service.js` compara diagnosticos. A futura `$acofer-reoptimization` decide cutoff, candidato, aplicacao do delta e aceite/rejeicao.
- `expectedRevision`, 409 e concorrencia de save pertencem a `$acofer-persistence-legacy`; esta skill pode observar a rejeicao como evidencia.

## Fronteiras

- Calendario manual fornece draft/candidato; esta skill valida e diagnostica, sem move/split/merge/replace.
- Estoque fornece ledger/projecao; esta skill consome o resultado para erro/warning.
- Persistencia revalida server-side; esta skill define diagnostico, nao contrato de save.
- UI apresenta mensagens; esta skill fornece diagnostico normalizado, nao mascara erro nem decide renderizacao visual.

## Checklist enxuto

- Qual tipo de validacao esta em escopo?
- A mudanca altera regra, severidade, apresentacao ou apenas consumo do diagnostico?
- A fonte canonica pertence a validacao ou a estoque, calendario, persistencia ou reotimizacao?
- Ha evidencia real para carregar skill relacionada?
- O teste focado cobre erro/warning/delta afetado sem suite ampla desnecessaria?

## Formato de retorno

Retorne:

- `Skills usadas`.
- Tipo de validacao envolvido.
- Dona da regra e dominios apenas consumidos.
- Erros e warnings afetados.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Impacto em outros dominios somente se houver evidencia.
- Validacoes realizadas.
