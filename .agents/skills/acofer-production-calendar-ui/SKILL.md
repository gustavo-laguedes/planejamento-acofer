---
name: acofer-production-calendar-ui
description: Guia a camada visual do Calendario V2 no Planejamento Aco-Fer: grid, cards, drag, resize, toolbar, zoom, fullscreen, callbacks, modais, viewport, estado visual, acessibilidade e interacao do usuario.
---

# acofer-production-calendar-ui

Use esta skill quando a tarefa pedir `$acofer-production-calendar-ui` ou envolver mudanca visual, UX, grid, cards, drag, resize, toolbar, zoom, fullscreen, modais, componentes compartilhados, viewport, selecao, estado visual, acessibilidade, CSS ou comportamento de interacao do Calendario V2.

Esta skill e dona exclusivamente da camada visual do Calendario V2. A UI recebe dados, exibe dados e envia intencoes por callbacks. Ela nao recalcula estoque, nao interpreta diagnosticos como regra, nao resolve precedencias, nao altera produtividade, nao executa scheduler e nao implementa regra de dominio.

Consumidores: JARVIS, Rogerio, Toto e Max. Leonardo deve usar esta skill apenas quando houver duvida de fronteira entre UI e dominio.

## Fronteira obrigatoria

UI -> Services -> Dominio

Componentes visuais podem formatar, selecionar, destacar, abrir modal, controlar viewport e emitir eventos. Orquestracao em `pages/PlanningPage.js` transforma intencoes em chamadas de services/API. Services mantem regra produtiva, validacao, estoque, persistencia, reotimizacao e draft manual.

## Skills relacionadas

Carregue skills relacionadas somente quando a mudanca visual cruzar a fronteira:

- `$acofer-stock`: quando a UI mostrar saldo/projecao incorreta e a regra de calculo precisar ser investigada.
- `$acofer-manual-calendar`: quando drag, split, merge, replace, edicao ou rollback exigirem regra de draft/transacao, nao apenas evento visual.
- `$acofer-validation-diagnostics`: quando o conteudo, severidade ou normalizacao de erro/warning precisar mudar.
- `$acofer-persistence-legacy`: quando save/reopen/discard/revision explicar estado visual apos recarregar.
- `$acofer-investigation`: quando houver divergencia sem causa raiz entre UI, services, draft, persistencia ou estoque.

Evite carregar skills de dominio para ajuste puro de layout, foco, acessibilidade, scroll, zoom ou texto visual.

## Fontes canonicas

- `shared/production-calendar/ProductionCalendar.js`: composicao do calendario, callbacks, estado visual e integracao dos componentes visuais.
- `shared/production-calendar/ProductionCalendarGrid.js`: grid, linhas, colunas, viewport, cabecalhos e posicionamento visual.
- `shared/production-calendar/ProductionCalendarCard.js`: card visual de allocation, estados, classes e apresentacao compacta.
- `shared/production-calendar/ProductionCalendarDrag.js`: captura de ponteiro, hover, auto-scroll e emissao de intencao de drag.
- `shared/production-calendar/ProductionCalendarState.js`: selecao, zoom, drag state, detalhes e historico visual local.
- `shared/production-calendar/ProductionCalendarToolbar.js`: toolbar, zoom, fullscreen, selecao, undo/redo e acoes emitidas.
- `shared/production-calendar/ProductionCalendarDetails.js`, `ProductionCalendarEditor.js` e `ProductionCalendarSplitEditor.js`: modais e editores visuais.
- `shared/production-calendar/productionCalendar.adapter.js`: adaptacao de resultado pronto para modelo visual; nao deve virar regra persistente.
- `shared/production-calendar/productionCalendar.utils.js` e `productionCalendar.validation.js`: utilitarios e validacoes do modelo visual.
- `shared/production-calendar/production-calendar.css`: estilos do Calendario V2.
- `pages/PlanningPage.js`: consumidor/orquestrador de callbacks como move, configuracao, fullscreen, horizonte, undo/redo e descarte.
- Testes focados: `tests/productionCalendarGrid.test.js`, `tests/productionCalendarHorizon.test.js`, `tests/productionCalendarDayHeader.test.js`, `tests/productionCalendarEditButton.test.js`, `tests/productionCalendarSplitEditor.test.js`, `tests/productionCalendarMemberships.test.js` e `tests/productionCalendarConfigurationEdit.integration.test.js`.

## Procedimento

1. Classifique a mudanca como visual, orquestracao ou dominio.
2. Se for visual, limite a edicao a `shared/production-calendar/*` e CSS relacionado sempre que possivel.
3. Se precisar tocar `pages/PlanningPage.js`, mantenha a alteracao na ponte de callbacks e nao mova regra produtiva para a UI.
4. Confirme quais dados chegam prontos ao componente e qual callback deve emitir a intencao do usuario.
5. Preserve contratos visuais: `allocationId`, datas, maquinas, selecao, zoom, fullscreen, detalhes, drag e estado local.
6. Trate acessibilidade e ergonomia: foco, labels, botoes, teclado quando aplicavel, estados disabled/loading e responsividade.
7. Valide que a UI nao esta calculando estoque, precedencia, capacidade, produtividade ou scheduler.

## Exemplos de violacao

- Um card de calendario somar consumo de componentes e decidir que ha ruptura de estoque. O correto e receber o diagnostico/projecao prontos e apenas renderizar o estado.
- Um handler de drag recalcular dependencias e reagendar operacoes diretamente. O correto e emitir a intencao para a orquestracao chamar o service dono.
- Um modal de produtividade escolher maquina/pessoas por nome e gravar regra produtiva. O correto e apresentar opcoes resolvidas pela fonte canonica e enviar a escolha.

## Checklist enxuto

- A alteracao e visual ou regra de dominio?
- O componente recebe dados prontos e emite apenas intencoes?
- O callback existente cobre a acao ou a ponte em `PlanningPage.js` precisa ser ajustada?
- Estados de loading, disabled, selecao, zoom, fullscreen e acessibilidade foram preservados?
- Alguma regra de estoque, validacao, calendario manual, persistencia ou reotimizacao exige skill propria?
- O teste focado cobre o comportamento visual afetado?

## Formato de retorno

Retorne:

- `Skills usadas`.
- Componente visual ou callback envolvido.
- Fronteira UI -> Services -> Dominio avaliada.
- Dona da regra e dominios apenas consumidos.
- Fontes canonicas consultadas.
- Arquivos analisados ou alterados.
- Riscos de acessibilidade, layout ou estado visual.
- Validacoes realizadas.
