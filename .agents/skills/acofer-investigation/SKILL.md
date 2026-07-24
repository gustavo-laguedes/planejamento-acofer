---
name: acofer-investigation
description: Investiga causas raiz e rastreia divergencias entre UI, services, draft, estoque e persistencia no Planejamento Aco-Fer.
---

# acofer-investigation

Use esta skill quando a tarefa pedir `$acofer-investigation` ou envolver bug ainda sem causa explicada, regressao, producao desaparecendo, divergencia apos salvar ou atualizar, mudanca manual perdida, maquina/equipe incorreta, estoque divergente, reotimizacao excessiva, comportamento inconsistente entre frontend/backend/banco ou incompatibilidade com planejamento antigo.

Esta skill e dona do metodo de causa raiz: delimitar escopo, classificar o problema, identificar fontes canonicas, coletar evidencias e decidir quais skills de dominio carregar. Ela pode consultar qualquer dominio como evidencia, mas nao e dona de regra de calendario manual, validacao, estoque, persistencia ou reotimizacao.

Carregue skills relacionadas somente quando houver evidencia real de impacto:

- `$acofer-manual-calendar`: `manualScheduleDraft`, allocations, move, split, merge, replace, transacao, rollback ou historico em memoria.
- `$acofer-validation-diagnostics`: erros, warnings, bloqueios, recursos, capacidade, turnos, dependencias, transporte, setup ou apresentacao de diagnosticos.
- `$acofer-stock`: saldo inicial, ledger, consumo, entrada produtiva, disponibilidade, minimo, locais, piso zero ou projecao.
- `$acofer-persistence-legacy`: save, reopen, discard, `expectedRevision`, 409, hash, contrato persistido ou draft legado.
- Futura `$acofer-reoptimization`: cutoff, passado congelado, futuro restante, candidato reotimizado ou aceite por delta.

Nao use esta skill para implementar, corrigir arquivos, criar testes produtivos, homologar ou concluir apenas pelo sintoma visual.

## Fontes como evidencia

- `CALENDAR_V2_ARCHITECTURE.md`: mapa normativo para orientar a investigacao.
- `pages/PlanningPage.js`: evidencia de orquestracao UI/API/draft local, refresh e reopen.
- `shared/production-calendar/*`: evidencia de intencoes visuais emitidas pelo calendario.
- `server/routes/planning.routes.js`: evidencia de API, revalidacao server-side, save, reopen e 409.
- `services/planning.service.js`: evidencia de simulacao automatica e snapshot automatico.
- `services/planningAllocation.service.js`: evidencia de allocations diarias, IDs legados e adapter/fallback.
- `services/productivityMatrixResolution.service.js`: evidencia de resolucao canonica de material, maquina, pessoas e linha da matriz.
- `services/planningReoptimization.service.js`: evidencia de reotimizacao ate existir skill propria.
- Services de dominio em `services/` e testes relacionados em `tests/`, carregados conforme o dominio afetado.

## Fluxo minimo

1. Delimite o escopo: fluxo observado, fronteiras envolvidas e fronteiras fora da investigacao.
2. Registre o sintoma sem assumir causa: tela, acao, plano/dia/material/maquina, mensagem, payload ou estado.
3. Classifique sintoma, causa imediata e causa raiz.
4. Identifique a dona da regra antes de analisar comportamento: service canonico ou skill de dominio.
5. Rastreie somente as fronteiras necessarias: UI -> route -> service -> persistencia, ou o subconjunto comprovadamente afetado.
6. Separe evidencia confirmada de hipotese. Hipotese sem arquivo, funcao, payload ou teste relacionado nao fecha investigacao.
7. Decida se deve carregar outra skill. Nao investigue todos os dominios em toda tarefa.

## Evidencias obrigatorias

- Arquivos, funcoes e campos analisados, com o motivo.
- Fonte canonica identificada para cada regra citada.
- Estado antes/depois da fronteira investigada quando aplicavel.
- Testes existentes relacionados ou lacuna de teste, sem criar teste nesta skill.
- O que foi descartado e por que.

## Roteamento

- Se a causa raiz tocar regra de dominio, pare a investigacao geral e carregue a skill dona da regra.
- Se houver conflito entre browser e banco, trate browser como evidencia e persistencia como dominio provavel.
- Se houver erro visual sem regra produtiva envolvida, use apenas evidencias de UI e nao carregue skills de estoque, persistencia ou validacao.
- Se a investigacao cruzar reotimizacao, use `services/planningReoptimization.service.js` como evidencia temporaria e registre a necessidade da futura `$acofer-reoptimization`.

## Formato do relatorio

Retorne:

- `Skills usadas`.
- Sintoma, causa imediata e causa raiz.
- Escopo investigado e fronteiras fora do escopo.
- Dona da regra identificada.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Evidencias principais.
- Validacoes realizadas.
- Skill adicional recomendada, se houver.
