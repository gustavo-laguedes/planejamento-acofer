---
name: acofer-implementation
description: Padroniza implementacoes futuras no Planejamento Aco-Fer: identificar dominio, carregar skill correta, confirmar fonte canonica, delimitar arquivos, alterar de forma cirurgica, validar impacto e entregar diff resumido.
---

# acofer-implementation

Use esta skill quando a tarefa pedir `$acofer-implementation` ou quando JARVIS for implementar qualquer mudanca no Planejamento Aco-Fer e precisar padronizar procedimento, escopo, validacao, resposta final, preservacao de arquitetura e escolha da skill de dominio correta.

Esta nao e uma skill de dominio. Ela e operacional e define o procedimento de implementacao. Ela nao define regra produtiva, nao decide estoque, calendario manual, validacao, persistencia, reotimizacao ou UI.

Consumidor principal: JARVIS. Toto pode consultar para entender escopo de implementacao. Max nao utiliza esta skill como metodologia principal.

## Fluxo obrigatorio

Antes de alterar codigo:

1. Identificar dominio.

->

2. Carregar a skill correta.

->

3. Confirmar fonte canonica.

->

4. Delimitar arquivos.

->

5. Implementar.

->

6. Validar.

->

7. Entregar.

## Skills relacionadas

Carregue apenas a skill dona do dominio afetado:

- `$acofer-stock`: saldo inicial, ledger, consumo, producao disponivel, disponibilidade, minimo, locais, piso zero ou projecao.
- `$acofer-manual-calendar`: `manualScheduleDraft`, allocations, move, split, merge, replace, transacao, rollback, identidade ou conservacao fisica.
- `$acofer-validation-diagnostics`: erros, warnings, bloqueios, recursos, capacidade, turnos, dias produtivos, dependencias, transporte, setup ou delta de diagnosticos como validacao.
- `$acofer-persistence-legacy`: save, reopen, discard, `expectedRevision`, 409, hash, contrato persistido, draft legado, schema ou migration do calendario manual.
- `$acofer-investigation`: bug sem causa raiz, regressao, divergencia entre UI/services/banco ou sintoma ainda ambiguo.
- `$acofer-reoptimization`: cutoff, passado congelado, futuro restante, candidato reotimizado, redistribuicao, aceite/rejeicao, `manualWorkDates` ou `dailyTeamOverrides` como restricao incremental.
- `$acofer-production-calendar-ui`: grid, cards, drag, resize, toolbar, zoom, fullscreen, callbacks, modais, viewport, acessibilidade ou estado visual.

Evite carregar skills por proximidade de arquivo. Carregue por ownership real da regra.

## Procedimento de implementacao

- Leia o menor conjunto de arquivos que explica a mudanca e a fonte canonica do dominio.
- Confirme a fronteira: UI orquestra/apresenta, services governam regra, routes coordenam API/persistencia e migrations mudam contrato de banco apenas quando necessario.
- Faca alteracoes cirurgicas. Evite refatoracoes paralelas, renomes amplos, reorganizacao de arquivos e limpeza fora do escopo.
- Preserve UTF-8 e nao corrija trechos historicos com encoding corrompido fora da tarefa.
- Preserve ownership: nao duplique regra produtiva na UI, route ou teste quando ja existe service canonico.
- Preserve arquitetura do Calendario V2: draft manual como fonte de verdade depois de criado, movimento manual por transacao, validadores sem reposicionar allocations, persistencia sem sobrescrever snapshot automatico e reabertura sem simulacao silenciosa.
- Preserve compatibilidade legada quando tocar dados antigos ou contratos persistidos.
- Nao amplie migrations, testes ou documentacao arquitetural sem necessidade comprovada.
- Respeite alteracoes existentes do usuario e trabalhe com elas quando afetarem o escopo.

## Validacao

- Escolha validacao pelo risco tocado: arquivo unico, teste focado, `node --check`, teste de service especifico ou runner Node apenas quando o impacto justificar.
- Consulte `tests/` relacionados antes de criar ou rodar validacao ampla.
- Se nao houver `npm test`, nao invente suite padrao; use comandos existentes do projeto.
- Validacao read-only e suficiente para tarefas de documentacao/skill quando nenhum codigo funcional mudar.
- Registre comandos executados, resultado e lacunas.

## Limitacoes

- Nao use esta skill para investigar causa raiz sem carregar `$acofer-investigation` quando o problema for ambiguo.
- Nao use esta skill para homologar o proprio codigo; homologacao pertence a outro agent quando a coordenacao exigir.
- Nao transforme checklist operacional em regra de dominio.
- Nao altere `pages/`, `routes/`, `services/`, `database/` ou `tests/` quando a tarefa pedir apenas criacao de skills.

## Formato obrigatorio da resposta

Retorne:

- `Skills usadas`.
- Dominio identificado e skill dona.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Resumo da implementacao.
- Diff resumido.
- Validacoes realizadas.
- Limitacoes ou riscos restantes.
