---
name: acofer-manual-calendar
description: Guia trabalhos no Calendario V2 em memoria, manualScheduleDraft, allocations, transacoes, split, merge, replace e rollback.
---

# acofer-manual-calendar

Use esta skill quando a tarefa pedir `$acofer-manual-calendar` ou envolver allocations, `allocationId`, move, drag, split, merge, replace, edicao de allocation, alteracao de maquina/pessoas/configuracao pelo calendario, transacao, rollback, historico em memoria, reconstrucao do draft ou conversa entre editor visual e services manuais.

Esta skill e dona do procedimento em memoria relacionado a `manualScheduleDraft`, allocations, identidade, move, split, merge, replace, edicao, transacao, rollback e historico. Ela consome resultados de validacao, consome ledger/estoque, entrega draft para persistencia e recebe intencoes da UI, sem assumir ownership desses dominios.

Carregue skills relacionadas somente quando a evidencia atravessar fronteira:

- `$acofer-validation-diagnostics`: erros, warnings, capacidade, equipe, dias produtivos, dependencias, transporte ou setup.
- `$acofer-stock`: saldo, consumo, entrada produtiva ou disponibilidade.
- `$acofer-persistence-legacy`: save, reopen, discard, revision, hash ou draft legado persistido.
- `$acofer-investigation`: causa raiz ainda nao explicada.

Fora do escopo: save/load de banco, compatibilidade legada persistida como assunto principal, validacao produtiva como regra, estoque como regra, reotimizacao ampla e renderizacao visual pura.

## Fontes obrigatorias

- `CALENDAR_V2_ARCHITECTURE.md`: mapa normativo; confirme sempre no codigo atual.
- `services/manualScheduleDraft.service.js`: dona da regra de criacao, normalizacao em memoria, move, split, merge, replace, override, rastros e conservacao fisica.
- `services/manualScheduleTransaction.service.js`: dona do procedimento de aceite/rollback transacional em memoria.
- `services/manualScheduleHistory.service.js`: dona de eventos/historico em memoria quando aplicavel.
- `services/planningAllocation.service.js`: evidencia e fonte de compatibilidade para allocations diarias, IDs legados e fallback visual; fallback visual nao deve virar identidade persistente.
- `services/productivityMatrixResolution.service.js`: fonte consultada para material, maquina, pessoas e configuracao valida; a matriz nao pertence integralmente a esta skill.
- `services/manualScheduleValidation.service.js` e `services/manualScheduleResourceValidation.service.js`: consumidoras da transacao para diagnosticar candidato; a dona da regra de validacao e `$acofer-validation-diagnostics`.
- `services/manualScheduleStockLedger.service.js`: consumido para impacto de estoque; a dona da regra de estoque e `$acofer-stock`.
- `pages/PlanningPage.js` e `shared/production-calendar/*`: evidencias de orquestracao e intencoes visuais, nao ownership de regra produtiva.
- Testes focados: `tests/manualScheduleDraft.service.test.js`, `tests/manualScheduleTransaction.service.test.js`, `tests/manualScheduleAllocationSplit.service.test.js`, `tests/manualScheduleEditCapacityOverride.test.js`, `tests/manualScheduleHistory.service.test.js`, `tests/planningManualScheduleIntegration.test.js`, `tests/productionCalendarSplitEditor.test.js`.

## Procedimento

- Confirme qual operacao manual esta em escopo e qual funcao canonica cria o candidato.
- Preserve `allocationId` quando a identidade tecnica deve sobreviver; crie novo ID apenas para parte realmente nova.
- Preserve rastros, quantidade fisica, componentes e residuos conforme os services manuais.
- Passe movimento manual por `applyManualScheduleTransaction`; validadores diagnosticam e nao reposicionam allocations.
- Em rollback, confirme que o candidato recusado nao substitui o draft aceito.
- UI deve emitir intencoes e apresentar dados prontos; nao implemente regra de move/split/merge/replace em componente visual.

## Identidade e matriz

- `allocationId` e identidade tecnica estavel, nao derivada de data, maquina, texto visual ou fallback do adapter.
- `planningAllocation.service.js` pode explicar origem/fallback de IDs em dados antigos, mas nao substitui o draft V2 como fonte de verdade apos edicao.
- `productivityMatrixResolution.service.js` e consultado para validar material, maquina, pessoas e configuracao; mudancas amplas na matriz pertencem ao dominio da matriz, nao a esta skill.
- Residuo fisico de split/allocation pertence a esta skill; arredondamento decimal de saldo pertence a `$acofer-stock`.

## Checklist enxuto

- A tarefa e sobre draft em memoria ou atravessou persistencia/estoque/validacao/UI?
- A operacao altera identidade, quantidade, rastros ou historico?
- A validacao ou estoque apareceu como diagnostico consumido ou como regra a ser alterada?
- O teste selecionado cobre a operacao manual afetada sem rodar suite ampla desnecessaria?

## Formato de entrega

Retorne:

- `Skills usadas`.
- Operacao manual analisada ou alterada.
- Dona da regra e dominios apenas consumidos.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Invariantes de identidade/conservacao avaliadas.
- Validacoes realizadas.
