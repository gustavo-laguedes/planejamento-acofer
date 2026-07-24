---
name: acofer-testing
description: Padroniza a selecao, criacao e execucao de testes tecnicos deterministicos no Planejamento Aco-Fer. Use quando houver funcionalidade implementada, correcao de regressao, mudanca em service, calculo, contrato, persistencia, rota, bug reproduzivel ou duvida sobre quais testes executar.
---

# acofer-testing

Esta skill e dona da metodologia de engenharia de testes tecnicos do Planejamento Aco-Fer: identificar comportamento alterado, fonte canonica, nivel correto de teste, testes existentes proximos, regressao minima, comando focado e evidencia objetiva.

Consumidor principal: Toto Wolff.

Consumidores secundarios: JARVIS pode consultar para preservar ou criar testes relacionados a implementacao; Leonardo pode consultar ao definir criterios de aceite; Rogerio e Leco podem consultar para verificar lacunas. Max nao deve usar esta skill como metodologia principal de homologacao.

Fora do escopo: implementacao produtiva, arquitetura, regra de dominio, homologacao operacional, correcao de codigo durante a analise e aprovacao operacional.

## Independencia

```text
JARVIS implementa
↓
Toto testa tecnicamente
↓
Max homologa operacionalmente
```

- JARVIS nao aprova o proprio trabalho.
- Toto nao transforma teste tecnico em homologacao.
- Max nao corrige codigo durante a homologacao.
- Falha tecnica bloqueante impede homologacao.
- Teste tecnico incompleto deve aparecer como risco.
- Homologacao pode reprovar mesmo com testes verdes.
- Homologacao nao substitui cobertura tecnica.

Esta skill pode consultar diff e escopo produzidos por `$acofer-implementation`, mas mantem metodologia independente.

## Fontes reais

- `package.json`: nao define `npm test`; scripts reais: `start`, `dev`, `db:schema`, `db:validate`.
- Comandos reais de teste: `node tests/<arquivo>.js` para teste individual comum e `node --test tests/*.js` para runner Node quando o risco justificar.
- Banco: `npm run db:schema` aplica migrations e `npm run db:validate` valida schema; ambos dependem de `DATABASE_URL`.
- Testes de calendario manual e split: `tests/manualScheduleDraft.service.test.js`, `tests/manualScheduleTransaction.service.test.js`, `tests/manualScheduleAllocationSplit.service.test.js`, `tests/manualScheduleEditCapacityOverride.test.js`, `tests/manualScheduleHistory.service.test.js`, `tests/planningManualScheduleIntegration.test.js`, `tests/productionCalendarSplitEditor.test.js`.
- Testes de estoque: `tests/materialStockMetrics.service.test.js`, `tests/planningStockProjection.service.test.js`, `tests/planningStockBalanceToggle.test.js`, `tests/planningStockProjectionModal.test.js`, `tests/manualScheduleValidation.service.test.js`.
- Testes de persistencia: `tests/manualSchedulePersistence.service.test.js`, `tests/automaticSimulationBaseline.service.test.js`, `tests/planningManualScheduleSaveLoad.integration.test.js`, `tests/planningManualScheduleIntegration.test.js`.
- Testes de reotimizacao: `tests/planningReoptimization.service.test.js`, `tests/planningDiagnosticDelta.service.test.js`, `tests/planningDailyTeamOverride.integration.test.js`, `tests/planningCutoffSnapshot.integration.test.js`, `tests/productionCalendarConfigurationEdit.integration.test.js`.
- Testes de validacao: `tests/manualScheduleValidation.service.test.js`, `tests/manualScheduleDiagnosticPresenter.service.test.js`, `tests/planningDiagnosticDelta.service.test.js`, `tests/planningDailyTeamOverride.integration.test.js`, `tests/productionCalendarConfigurationEdit.integration.test.js`.
- Testes de matriz: `tests/productivityMatrixResolution.service.test.js`, `tests/productivityMatrixCatalog.service.test.js`.
- Testes de rotas/persistencia integrada: `tests/planningManualScheduleSaveLoad.integration.test.js` e demais integracoes que exercitam a fronteira server/service.
- Services canonicos: `services/manualScheduleDraft.service.js`, `services/manualScheduleTransaction.service.js`, `services/manualScheduleValidation.service.js`, `services/manualScheduleResourceValidation.service.js`, `services/manualScheduleStockLedger.service.js`, `services/manualSchedulePersistence.service.js`, `services/planningReoptimization.service.js`, `services/planningStockProjection.service.js`, `services/materialStockMetrics.service.js`, `services/productivityMatrixResolution.service.js`, `services/planningAllocation.service.js`, `server/routes/planning.routes.js`.

## Classificacao de testes

- Funcao pura: usar quando a regra e deterministica, sem estado externo e com entradas/saidas pequenas.
- Service: usar quando o comportamento pertence a um service canonico e precisa validar invariantes de dominio.
- Integracao entre services: usar quando o risco cruza draft, validacao, estoque, persistencia ou reotimizacao.
- Rota: usar quando contrato HTTP, payload, revisao, erro ou coordenacao server-side mudam.
- Persistencia: usar quando save, reopen, discard, hash, revision, legado ou schema influenciam o resultado.
- Regressao: criar ou selecionar quando um bug corrigido precisa de cenario reproduzivel.
- UI/manual: usar somente quando nao houver cobertura automatizada viavel; registrar passos e limitacoes.

## Fluxo obrigatorio

```text
requisito ou bug
→ fonte canonica
→ comportamento observavel
→ teste existente mais proximo
→ cenario minimo
→ estado inicial
→ acao
→ resultado esperado
→ execucao focada
→ evidencia
```

## Regras

- Preferir cenario pequeno, deterministico e diretamente ligado ao risco.
- Evitar suite ampla sem necessidade.
- Nao usar somente `node --check` como prova funcional.
- Testar caminho feliz e risco diretamente relacionado.
- Incluir regressao para bugs corrigidos.
- Preservar testes existentes.
- Nao ajustar expectativa apenas para fazer teste passar.
- Nao mascarar falha de dominio com mock inadequado.
- Nao depender de ordem entre testes.
- Controlar datas, IDs, precisao e arredondamentos.
- Comparar resultados canonicos, nao apenas formato visual.
- Nao aprovar comportamento nao executado.
- Nao declarar homologacao.

## Selecao por dominio

- Use com `$acofer-manual-calendar` para move, split, merge, replace, transacao, rollback, identidade e conservacao fisica.
- Use com `$acofer-persistence-legacy` para save, refresh, reopen, discard, revision, 409, hash e legado.
- Use com `$acofer-stock` para saldo inicial, ledger, consumo, entrada, disponibilidade, minimo, piso zero e projecao.
- Use com `$acofer-validation-diagnostics` para erro, warning, bloqueio, capacidade, equipe, turno, dependencia, transporte, setup e delta.
- Use com `$acofer-reoptimization` para cutoff, passado congelado, futuro restante, candidato, delta e preservacao de decisoes manuais.
- Use com `$acofer-production-calendar-ui` quando o teste tecnico precisar cobrir componente visual ou callback do calendario.
- Use com `$acofer-investigation` quando o bug ainda nao tiver causa raiz explicada.

## Evidencias obrigatorias

Retorne:

- `Skills usadas`.
- Arquivos de teste consultados.
- Testes criados ou alterados.
- Comandos executados.
- Resultados.
- Cenarios cobertos.
- Cenarios nao cobertos.
- Limitacoes.
- Falhas encontradas.
- Veredito tecnico.

## Vereditos tecnicos

Use exclusivamente:

- `Aprovado tecnicamente`.
- `Aprovado com cobertura parcial`.
- `Reprovado tecnicamente`.
- `Nao executado`.

Nunca use `Homologado` como veredito tecnico.
