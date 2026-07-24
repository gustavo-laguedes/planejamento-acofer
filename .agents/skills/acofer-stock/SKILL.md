---
name: acofer-stock
description: Orienta analises e mudancas no estoque canonico do planejamento, ledger, saldo inicial, disponibilidade, projecao e piso zero.
---

# acofer-stock

Use esta skill quando a tarefa pedir `$acofer-stock` ou envolver estoque negativo, piso zero, saldo inicial, saldo divergente, origem/correcao de estoque, ledger, consumo produtivo, entrada por producao, disponibilidade, estoque minimo, locais, projecao, materiais de venda/producao ou arredondamento de saldo.

Esta skill e dona do procedimento de origem e composicao do estoque inicial, canonicalizacao, piso zero, ledger, consumo, entrada produtiva, disponibilidade, projecao, locais, minimo, precisao e arredondamento de saldo.

Ela consome allocations para calcular movimentos, fornece saldo/diagnosticos para validacao, fornece dados para reotimizacao e pode ter resultado persistido por outros fluxos. Ela nao e dona de split, transacao manual, persistencia, reotimizacao, UI ou matriz produtiva.

Carregue skills relacionadas somente quando a evidencia atravessar fronteira:

- `$acofer-validation-diagnostics`: quando saldo/disponibilidade virar erro, warning ou bloqueio.
- `$acofer-manual-calendar`: quando split, merge, replace ou move alterar quantidade/componentes.
- `$acofer-persistence-legacy`: quando save/reopen/discard/revision explicar divergencia de estoque.
- Futura `$acofer-reoptimization`: quando cutoff, futuro restante ou candidato reotimizado depender de estoque.
- `$acofer-investigation`: quando a origem da divergencia ainda nao estiver explicada.

Fora do escopo: layout visual, regra de movimento manual, contrato persistido, cutoff/reotimizacao, matriz produtiva como dominio e auditoria completa de browser/backend/save em toda tarefa.

## Fontes obrigatorias

- `services/manualScheduleStockLedger.service.js`: dona do ledger cronologico do calendario manual.
- `services/planningStockProjection.service.js`: dona da projecao de estoque do planejamento.
- `services/materialStockMetrics.service.js`: dona do saldo inicial canonico e metricas de material.
- `services/csvImport.service.js`: evidencia de origem de estoque importado quando a divergencia vier da importacao.
- `database/001_schema.sql`: evidencia de tabelas/campos de estoque fiscal, erro de inventario e correcao.
- `services/manualScheduleValidation.service.js`: consumidora dos diagnosticos/projecoes de estoque.
- `services/automaticSimulationBaseline.service.js`: evidencia quando baseline automatica influenciar reopen ou comparacao.
- `services/productivityMatrixResolution.service.js`: consulte somente quando material de venda/producao ou identidade de material depender da matriz.
- Testes focados: `tests/materialStockMetrics.service.test.js`, `tests/planningStockProjection.service.test.js`, `tests/planningStockBalanceToggle.test.js`, `tests/planningStockProjectionModal.test.js`, `tests/manualScheduleValidation.service.test.js`.

## Origem e saldo inicial

- Identifique a origem do dado: estoque fiscal/importado, erro de inventario, correcao, local e material.
- A composicao do saldo inicial deve vir dos services canonicos; nao replique formulas extensas na skill.
- Canonicalize material de venda, material de producao, local, unidade e aliases antes de comparar saldos.
- Nao trate ausente, zero e desconhecido como equivalentes sem confirmar no service.
- Preserve entrada bruta; normalizacoes devem gerar estruturas derivadas.

## Ledger, consumo e disponibilidade

- O ledger calcula eventos por data/material/local e consome allocations como entrada, sem ser dono de split ou transacao.
- Consumo produtivo e entrada por producao devem respeitar componentes, quantidade fisica, unidade e rastros recebidos do draft.
- Piso zero, disponibilidade, estoque minimo e saldo negativo pertencem a esta skill como regra de estoque; bloqueio/warning pertence a `$acofer-validation-diagnostics`.
- Precisao e arredondamento devem seguir utilitarios/constantes existentes nos services.
- Arredondamento decimal de saldo pertence a esta skill; residuo fisico de split/allocation pertence a `$acofer-manual-calendar`.

## Fronteiras

- Browser pode ser evidencia de stale state; nao e fonte canonica de estoque.
- Save/reopen podem explicar divergencia, mas ownership e de `$acofer-persistence-legacy`.
- Reotimizacao consome dados de estoque; cutoff, futuro restante e aceite por delta pertencem a futura `$acofer-reoptimization`.
- Split/merge/replace podem mudar componentes/quantidades; ownership da operacao e de `$acofer-manual-calendar`.
- Matriz produtiva e apenas fonte consultada para resolver material quando houver ambiguidade; mudancas de resolucao por nome versus ID cadastral exigem dominio proprio ou investigacao antes de alterar estoque.

## Checklist enxuto

- Qual material, local e data divergem?
- A divergencia vem de origem/importacao/correcao, ledger, projecao ou apresentacao?
- O resultado e saldo de estoque ou diagnostico consumido por outra skill?
- Ha evidencia real para carregar persistencia, calendario manual ou reotimizacao?
- Existe teste focado para o service de estoque afetado?

## Formato de entrega

Retorne:

- `Skills usadas`.
- Material/local/data investigados.
- Dona da regra e dominios apenas consumidos.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Impacto em validacao, calendario manual, persistencia ou reotimizacao somente se houver evidencia.
- Validacoes realizadas.
