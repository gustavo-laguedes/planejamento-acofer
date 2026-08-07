# REF-003 - Auditoria de arquivos grandes

## Decisoes

| Arquivo | Linhas | Decisao | Justificativa |
| --- | ---: | --- | --- |
| `services/planning.service.js` | 2488 | INVESTIGAR EM MISSAO PROPRIA | Motor automatico coeso mas muito denso: arvore produtiva, matriz, estoque, scheduler, splits, transports, snapshot salvo e `buildPlan`. Fan-in alto por rotas e testes. Dividir agora concorreria com extracao da PlanningPage e exigiria testes fortes do motor. |
| `pages/AnalysisPage.js` | 2169 | DIVIDIR DEPOIS | Pagina de analise/comercial usa API, filtros, timeline e calculos PCP. Ha responsabilidades independentes, mas prioridade atual e Planejamento/Gantt. `CalendarTimeline` ainda e consumidor ativo. |
| `pages/ImportHistoryPage.js` | 1674 | DIVIDIR DEPOIS | Combina historico, validacao/apresentacao de importacao, filtros e detalhes. Parece menos acoplado ao Gantt; beneficio real existe, mas nao destrava o gate atual. |
| `server/routes/planning.routes.js` | 1557 | INVESTIGAR EM MISSAO PROPRIA | Rota de alto risco: simular, criar plano, listar/abrir/cancelar, salvar manual, descartar, auditoria, revalidacao server-side e revisao otimista. Qualquer divisao precisa testes de API/persistencia. |
| `services/planningReoptimization.service.js` | 1474 | INVESTIGAR EM MISSAO PROPRIA | Dominio critico de cutoff, futuro restante, recursos, capacidade, diagnosticos e identidade. Existe skill propria disponivel; nao deve ser fatiado dentro da auditoria geral. |
| `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js` | 1092 | DIVIDIR NESTA REESTRUTURACAO | Renderer mistura toolbar, paginacao, DOM de tabela/timeline, inspector, drag, fullscreen e lifecycle. Dividir depois de estabilizar contrato Gantt ajuda remover V2 sem mexer em dominio produtivo. |
| `style.css` | 6906 | DIVIDIR DEPOIS | Muito grande e transversal. Divisao deve seguir remoção V2/CSS de planejamento, nao acontecer antes da fronteira Gantt-only. Risco visual alto e beneficio nao desbloqueia a primeira extracao. |
| `shared/CalendarTimeline.js` | 2445 | INVESTIGAR EM MISSAO PROPRIA | Timeline legado ainda usado por `AnalysisPage` e Comercial; no Planejamento e legado condicionado por flag. Mistura render, modais, drag, capacidade e eventos. Remocao/divisao depende de mapa de consumidores fora do Planejamento. |

## Observacoes por criterio

- Coesao: `planning.service.js` e `planningReoptimization.service.js` sao grandes por dominio, nao por UI; divisao so com caracterizacao.
- Estado mutavel: paginas e renderers concentram estado de UI; services usam contextos e estruturas locais.
- Fan-in/fan-out: `planning.routes.js`, `planning.service.js`, `planningReoptimization.service.js` e `CalendarTimeline.js` possuem maior risco de consumidores multiplos.
- Duplicacao: helpers de data, cor, turno, capacidade e producao aparecem em PlanningPage, CalendarTimeline, V2 e Gantt; extracao neutra deve preceder remocao.
- Facilidade de teste: services tem testes existentes; paginas dependem de DOM e testes estaticos frageis.
- Prioridade: primeiro extrair fronteiras neutras da `PlanningPage.js`; depois Gantt renderer; services de dominio em missoes dedicadas.

