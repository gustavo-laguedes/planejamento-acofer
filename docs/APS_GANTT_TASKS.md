# Gantt APS — Plano de execução

## Status geral

- [x] Fase 0 — Varredura, documentação e decisão arquitetural
- [ ] Fase 1 — Contrato neutro e estrutura visual readonly
- [ ] Fase 2 — Paridade de leitura
- [ ] Fase 3 — Interações
- [ ] Fase 4 — Paridade operacional
- [ ] Fase 5 — Recursos APS
- [ ] Fase 6 — Homologação, ativação e remoção controlada do legado

## Regras de execução

- Uma missão não pode ampliar escopo silenciosamente.
- Toda missão registra resultado em `APS_GANTT_EVOLUTION_LOG.md`.
- O V2 permanece rollback até conclusão explícita da Fase 6.
- O Gantt não cria regra produtiva na UI.
- Nenhuma biblioteca é instalada sem missão e decisão próprias.
- Migration só entra com insuficiência comprovada do contrato persistido.
- Implementador, testador e homologador devem ser independentes conforme `AGENTS.md`.
- Alterações existentes do usuário devem ser preservadas.

## Gate entre fases

Uma fase só é concluída quando:

- critérios de aceite das missões estiverem registrados;
- testes técnicos relacionados passarem;
- riscos residuais estiverem documentados;
- mudanças visíveis forem homologadas operacionalmente;
- rollback continuar funcional;
- o log de evolução tiver resultado e evidências.

## Fase 0 — Documentação e contrato

### Missão APS-000 — Varredura arquitetural

Status: concluída em 2026-07-24.

Dependências: nenhuma.

Objetivo: mapear o Calendário V2, consolidar invariantes, dívidas, contratos, riscos e estratégia de substituição.

Arquivos analisados: `AGENTS.md`, `README.md`, `CALENDAR_V2_ARCHITECTURE.md`, `.agents/skills/*`, `PlanningPage.js`, `shared/production-calendar/*`, services canônicos, rotas, schema, migration 020 e testes relacionados.

Critérios de aceite:

- arquitetura atual documentada;
- inventário classificado;
- arquitetura APS criada;
- tarefas e log criados;
- primeira missão visual definida;
- nenhuma alteração funcional.

Testes: inspeção estática e revisão de diff documental.

Fora de escopo: implementação, biblioteca, migration, commit e push.

Riscos: working tree já modificado; documentação histórica divergente do código atual.

Resultado: documentos oficiais criados/atualizados; nenhuma implementação realizada.

## Fase 1 — Contrato neutro e estrutura visual readonly

### Missão APS-001 — Contrato readonly e seam de renderer

Status: concluída em 2026-07-24.

Dependências: APS-000 e backup externo do usuário.

Objetivo: criar `planning-schedule-view/v1`, capabilities inequívocas, factory de renderer e rollback V2 sem alterar o visual padrão.

Arquivos previstos:

- novo módulo neutro de view model;
- novo módulo de seleção/lifecycle de renderer;
- adapter do V2;
- ponto estreito em `pages/PlanningPage.js`;
- testes unitários e de integração estática.

Critérios de aceite:

- modelo derivado uma única vez do snapshot aceito;
- `task.id === String(allocationId)`;
- `readonly:*` marcado não persistível;
- `capabilities.inspect = true` e `mutate = false`;
- flag independente com `production-calendar-v2`, `gantt-aps` e `auto`;
- `auto` resolve para V2 sem política;
- fallback destrói tentativa falha antes de montar V2;
- `focusAllocation(allocationId)` elimina seletor externo específico;
- nenhum visual ou comportamento produtivo alterado no modo padrão.

Testes:

- pureza e ausência de mutação;
- paridade de IDs, datas, horários, máquina e quantidade;
- fallback por erro de mount/update;
- plano automático, draft v2, v1 normalizado e legado;
- proibição de scheduler, HTTP e callbacks mutáveis.

Fora de escopo: Gantt visual, drag, edição, services, rotas, banco e migration.

Riscos: `PlanningPage.js` concentrado; compatibilidade com foco/fullscreen; ID fallback.

Resultado: contrato imutável `planning-schedule-view/v1`, seam/lifecycle de renderer e adapter do V2 implementados. O modo `auto` permanece resolvendo para `production-calendar-v2`; `gantt-aps` ainda não possui renderer visual e executa rollback controlado para o V2. O foco externo passou a usar `focusAllocation(allocationId)`. Testes técnicos focados aprovados com cobertura parcial, sem alteração visual padrão, regra produtiva, persistência ou banco.

### Missão APS-002 — Renderer Gantt readonly

Status: implementação refinada em 2026-07-24 após reprovação visual; aprovada tecnicamente; não homologada por limitação ambiental e permanece aberta até homologação operacional real.

Dependências: APS-001.

Objetivo: renderizar a primeira experiência Gantt com tabela fixa, lanes por máquina, timeline e barras reais.

Arquivos previstos:

- novo diretório visual isolado do Gantt;
- renderer, toolbar, timeline, tabela e CSS próprios;
- testes de adapter/harness DOM.

Critérios de aceite:

- mesma contagem e conjunto de allocations físicas do view model, sem projeções adicionais por membership;
- barras posicionadas por `date/startTime/endDate/endTime`;
- turno noturno usa `endDate`;
- agrupamento e ordem de máquinas preservados;
- múltiplas allocations na mesma máquina/período são legíveis;
- cores, produção, etapa e memberships preservados;
- fins de semana, feriados e `manualWorkDates` visíveis;
- tooltip/painel de inspeção sem mutação;
- nenhum drag, resize, edit, split, otimização ou writeback;
- CSS isolado.
- máquina como parent row compacta, inicialmente expandida;
- uma linha operacional e uma barra para cada task posicionada, sem stacking; memberships aparecem apenas no texto compacto da produção;
- tabela fixa com máquina/grupo, produção, etapa, material, quantidade/unidade, pessoas e capacidade;
- ordem determinística por início civil, `sequence` e `allocationId`;
- máquinas vazias visíveis em parent row compacta;
- paginação provisória por orçamento global de 60 allocation rows;
- `focusAllocation()` navega à página, expande o grupo e foca a identidade canônica;
- task fora do horizonte fica explicitamente inspecionável, sem desaparecer fora do canvas.

Testes:

- geometria temporal determinística;
- IDs com caracteres especiais;
- datas civis e timezone;
- estados vazio/erro;
- inspeção não altera objetos de entrada.
- relação allocation–row–bar 1:1, splits quantitativos reconciliados e memberships sem duplicação visual;
- grupos, colunas, alturas, labels progressivos e ausência de stacking;
- orçamento global, continuação de máquina, collapse e foco;
- tasks fora do horizonte, update, destroy, renderer único e fallback.

Fora de escopo: projeções avançadas, dependências, estoque e ações produtivas.

Riscos: alinhamento, contraste, responsividade, scroll, foco e fullscreen ainda precisam de validação em navegador real autenticado.

Resultado: a primeira entrega técnica foi reprovada na homologação visual do usuário por apresentar lane única por máquina, stacking, baixa densidade, tabela pobre e barras com aparência de cards. O refinamento aprovado substituiu essa estrutura por parent rows de máquina, barras planas, tabela operacional de sete colunas, escala temporal compacta, paginação global de 60 linhas e foco que atravessa páginas/collapse. Memberships preservam quantidade/unidade do `productionBreakdown`, mas não geram rows adicionais: seus índices são apresentados de forma compacta na coluna Produção e no inspector. A viewport segue com altura natural e scroll horizontal, e allocation row/barra permanecem em 40/28 px. Labels de Produção e barras agora usam texto direto, sem badge escuro; o cabeçalho diário alterna entre data completa, dia/mês e dia conforme 132/88 px. A projeção viva foi centralizada em `productionDisplayColor.js` e reutilizada por Gantt, seção Produções, Calendário V2 e Fluxo produtivo, incluindo legenda, cards, faixas e caminhos. Cores persistidas continuam imutáveis. O contrato `planning-schedule-view/v1` e o fallback retrocompatível permanecem. O Calendário V2 continua sendo o rollback; APS-002 permanece aberta até nova homologação visual real.

### Missão APS-003 — Viewport, fullscreen e lifecycle

Status: pendente.

Dependências: APS-002.

Objetivo: concluir zoom, scroll, horizonte visual, fullscreen, virtualização inicial e descarte seguro da instância.

Arquivos previstos: renderer Gantt, estado visual, lifecycle, CSS e testes.

Critérios de aceite:

- viewport separado do V2 e do draft;
- zoom/scroll/horizonte não chamam refresh, simulação ou API;
- fullscreen preserva somente viewport;
- `destroy()` remove listeners, observers, timers, overlays e tooltips;
- remount repetido não duplica eventos;
- plano longo não cria DOM ilimitado;
- erro recupera V2 sem reload destrutivo.

Testes: lifecycle repetido, fallback, contagem de listeners/observers, plano longo e viewport.

Fora de escopo: qualquer mutação produtiva.

Riscos: memória, performance e sincronização tabela/timeline.

Resultado: a preencher.

## Fase 2 — Paridade de leitura

### Missão APS-004 — Diagnósticos, capacidade e recursos

Status: pendente.

Dependências: APS-003.

Objetivo: exibir projeções prontas de validação, capacidade, equipe e setup sem recalcular domínio.

Arquivos previstos: adapter de projeções, renderer, legenda/painel e testes.

Critérios de aceite:

- erros e warnings correlacionados sem alterar severidade;
- capacidade e equipe vêm de `resourceProjection`;
- setup vem de intervalos canônicos;
- ausência de projeção não cria erro novo;
- cor não é o único indicador.

Testes: correlação por allocation/data/máquina, warning versus erro e ausência de dados.

Fora de escopo: bloqueio ou reposicionamento.

Riscos: excesso de informação e mistura de fontes.

Resultado: a preencher.

### Missão APS-005 — Estoque e inspeção diária

Status: pendente.

Dependências: APS-004.

Objetivo: integrar estoque do draft corrente e projeção analítica com origem explícita, preservando o modal operacional.

Arquivos previstos: view model de projeções, Gantt, ponte de inspeção e testes de estoque.

Critérios de aceite:

- ledger manual e projeção PCP permanecem distintos;
- alerta analítico não vira bloqueio;
- clique/inspeção de data abre dados corretos;
- materiais de venda e produção continuam separados;
- nenhuma fórmula de estoque na UI.

Testes: projeções existentes, modal por data e origem da informação.

Fora de escopo: mudança de política de estoque.

Riscos: stale state e dupla interpretação visual.

Resultado: a preencher.

### Missão APS-006 — Dependências, transporte e memberships

Status: pendente.

Dependências: APS-004.

Objetivo: projetar arestas de precedência, transporte, etapas e produções compartilhadas.

Arquivos previstos: normalizador visual de arestas, renderer e testes.

Critérios de aceite:

- arestas vêm do domínio e não são inferidas pelo renderer;
- múltiplos consumidores e produções compartilhadas permanecem identificáveis;
- transporte manual é distinguível de precedência produtiva;
- barra não muda de posição por causa da aresta.

Testes: dependências múltiplas, transporte, memberships e ciclos/arestas ausentes.

Fora de escopo: edição de dependência ou transporte.

Riscos: poluição visual e ambiguidade de relacionamento.

Resultado: a preencher.

## Fase 3 — Interações

### Missão APS-007 — Seleção, foco e inspeção operacional

Status: pendente.

Dependências: APS-006 e homologação readonly.

Objetivo: consolidar seleção, teclado, foco, painel completo e navegação entre tabela e timeline.

Arquivos previstos: renderer, estado visual, painel/modal e testes de acessibilidade.

Critérios de aceite:

- seleção exclusiva por `allocationId`;
- foco restaurado após update quando a task existir;
- teclado cobre inspeção;
- tooltip não é única fonte de informação;
- nenhuma capability mutável ainda habilitada.

Testes: seleção, foco, update, remoção da task e teclado.

Fora de escopo: movimento ou edição.

Riscos: foco perdido em virtualização.

Resultado: a preencher.

### Missão APS-008 — Movimento manual

Status: pendente.

Dependências: APS-007 e decisão do usuário sobre drag/click-move.

Objetivo: habilitar uma intenção de movimento por vez usando handlers atuais.

Arquivos previstos: renderer Gantt, contrato de intenções e ponte em `PlanningPage.js`.

Critérios de aceite:

- capability `mutate` explícita;
- payload usa IDs/datas/horários, nunca pixels persistidos;
- drag/click-move convergem para `MOVE_ALLOCATION`;
- candidato aceito instala uma vez;
- candidato recusado preserva draft e viewport;
- auto-scroll e destinos ocupados homologados.

Testes: vazio, occupied, reorder, diagonal, rollback, ID estável e reotimização por cutoff.

Fora de escopo: editor, split e otimização global.

Riscos: dupla emissão, snapping incorreto e timezone.

Resultado: a preencher.

### Missão APS-009 — Editor, split e transporte

Status: pendente.

Dependências: APS-008.

Objetivo: atingir paridade de edição, divisão recursiva e transporte.

Arquivos previstos: ponte do editor existente ou editor APS decidido, renderer e testes.

Critérios de aceite:

- máquina/pessoas vêm da Matriz canônica;
- quantidade e resíduos são conservados;
- linhagem `split*` preservada;
- transporte cria constraint canônica e reotimiza somente downstream;
- cancelar não cria candidato/histórico.

Testes: editor, split recursivo, capacidade extraordinária, transporte e rollback.

Fora de escopo: novo domínio de edição.

Riscos: reutilização de modal acoplado ao V2 e perda de foco.

Resultado: a preencher.

### Missão APS-010 — Dia produtivo e equipe diária

Status: pendente.

Dependências: APS-008.

Objetivo: integrar `manualWorkDates` e `dailyTeamOverrides`.

Arquivos previstos: cabeçalho/timeline, modais, ponte e testes.

Critérios de aceite:

- confirmação ao bloquear dia com produção;
- reotimização preserva cutoff;
- overrides por turno permanecem canônicos;
- dia/turno visual atualiza somente após aceite.

Testes: sábado, domingo, feriado, turno noturno, equipe insuficiente e rollback.

Fora de escopo: alteração das regras de calendário.

Riscos: reotimização ampla e divergência de calendário.

Resultado: a preencher.

## Fase 4 — Paridade operacional

### Missão APS-011 — Histórico, descarte, save e reopen

Status: pendente.

Dependências: APS-009 e APS-010.

Objetivo: completar undo/redo, descarte, persistência e reabertura pelo fluxo APS.

Arquivos previstos: ponte de comandos, estado visual, rotas somente se necessário e testes de integração.

Critérios de aceite:

- undo/redo restaura snapshot completo;
- descarte restaura baseline automática;
- save revalida server-side;
- 409 não é tratado como sucesso;
- refresh/reopen não simula;
- v1/v2/legado preservados;
- renderer não persiste estado visual.

Testes: baseline, save/load, concorrência, descarte e duas abas.

Fora de escopo: novo schema sem prova de necessidade.

Riscos: stale state, revisão otimista e baseline incorreta.

Resultado: a preencher.

### Missão APS-012 — Paridade funcional formal

Status: pendente.

Dependências: APS-011.

Objetivo: fechar a matriz de todas as capacidades atuais como preservar, substituir, remover com decisão ou não aplicável.

Arquivos previstos: documentação, testes de regressão e eventuais correções estreitas.

Critérios de aceite:

- nenhum callback atual sem destino explícito;
- nenhuma regra essencial perdida;
- dívidas órfãs resolvidas ou registradas;
- V2 e Gantt produzem o mesmo draft para intenções equivalentes.

Testes: bateria focada de draft, transação, validação, reotimização, persistência, estoque e UI.

Fora de escopo: novos recursos APS.

Riscos: paridade declarada sem homologação real.

Resultado: a preencher.

## Fase 5 — Recursos APS

### Missão APS-013 — Baseline visual e cockpit

Status: pendente.

Dependências: APS-012 e definição de produto.

Objetivo: adicionar comparação visual de baseline, KPIs e cockpit sem mudar fonte de verdade.

Arquivos previstos: view model, renderer, painéis e testes.

Critérios de aceite:

- baseline é readonly e separada do draft;
- KPIs têm fontes canônicas;
- nenhum cálculo crítico existe apenas no frontend.

Testes: paridade de baseline, indicadores e ausência de mutação.

Fora de escopo: novo solver.

Riscos: métricas duplicadas e overload visual.

Resultado: a preencher.

### Missão APS-014 — Reotimização localizada

Status: pendente.

Dependências: APS-013 e decisão explícita.

Objetivo: expor comandos controlados do reotimizador existente com cutoff, escopo e delta.

Arquivos previstos: ponte de intenção, UI APS e testes de reotimização.

Critérios de aceite:

- passado congelado preservado;
- escopo explícito;
- candidato só instala após aceite;
- diagnósticos explicam delta;
- decisões manuais não desaparecem.

Testes: cutoff, scope, pinned, estoque, recursos e regressão bloqueante.

Fora de escopo: substituir `planningReoptimization.service.js`.

Riscos: promessa APS confundida com novo solver.

Resultado: a preencher.

## Fase 6 — Homologação e remoção controlada

### Missão APS-015 — Rollout e homologação PCP

Status: pendente.

Dependências: APS-012; APS-013/014 conforme escopo aprovado.

Objetivo: ativar por política controlada e homologar o fluxo real.

Arquivos previstos: configuração de rollout, documentação e correções encontradas.

Critérios de aceite:

- política `auto` definida;
- navegadores e escala homologados;
- plano novo/reaberto, turnos, estoque, dependências, save e concorrência validados;
- métricas e incidentes comparados;
- rollback testado.

Testes: técnicos completos relacionados e homologação operacional independente.

Fora de escopo: remoção do V2.

Riscos: ativação prematura e diferenças não observadas.

Resultado: a preencher.

### Missão APS-016 — Gantt padrão e janela de rollback

Status: pendente.

Dependências: APS-015.

Objetivo: tornar Gantt padrão, mantendo V2 por janela definida.

Arquivos previstos: seleção de renderer e documentação.

Critérios de aceite:

- `auto` resolve para Gantt conforme política;
- V2 continua acionável;
- nenhum dado depende do renderer;
- período de observação concluído sem regressão bloqueante.

Testes: fallback, reopen, save e fluxos críticos.

Fora de escopo: remoção imediata do V2.

Riscos: regressão tardia.

Resultado: a preencher.

### Missão APS-017 — Remoção do legado do Planejamento

Status: pendente.

Dependências: APS-016 e aprovação explícita do usuário.

Objetivo: remover apenas o V2 do Planejamento e contratos comprovadamente órfãos.

Arquivos previstos: definidos após novo inventário de consumidores.

Critérios de aceite:

- `CalendarTimeline` de Análise/Comercial preservado;
- planos v1/v2/legados continuam abrindo;
- nenhum service canônico removido por ser usado fora da UI;
- migrations históricas não são reescritas;
- documentação final atualizada.

Testes: regressão completa dos consumidores e homologação PCP.

Fora de escopo: remoção global de `CalendarTimeline` sem missão própria.

Riscos: consumidores ocultos e compatibilidade histórica.

Resultado: a preencher.

## Decisões abertas

- [ ] Biblioteca Gantt ou implementação própria.
- [ ] Máximo de máquinas, allocations e horizonte.
- [ ] Política de rollout `auto`.
- [ ] Navegadores suportados.
- [ ] Nível de acessibilidade exigido.
- [ ] Convenção visual de precedências, setup, estoque e memberships.
- [ ] Drag, click-move ou ambos.
- [ ] Histórico somente local ou persistente/auditável.
- [ ] “APS” somente interface ou futuro projeto de solver.
