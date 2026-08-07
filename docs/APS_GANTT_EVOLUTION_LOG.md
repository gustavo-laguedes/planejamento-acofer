# Gantt APS — Log contínuo de evolução

## Finalidade

Este arquivo registra decisões, evidências, resultados, riscos e próximos passos do Gantt APS. Ele é append-only: entradas anteriores não devem ser reescritas para parecer que uma decisão sempre existiu.

## Regras do log

- uma entrada por missão, decisão relevante ou mudança de direção;
- registrar data, status, escopo, arquivos, evidências e validações;
- distinguir fato confirmado, decisão e hipótese;
- vincular a missão em `APS_GANTT_TASKS.md`;
- registrar rollback e risco residual;
- não usar o log como substituto da arquitetura oficial;
- correções de entrada anterior devem citar a entrada corrigida.

## Modelo de entrada

```md
## AAAA-MM-DD — APS-XXX — Título

Status:
Responsáveis:
Escopo:
Decisões:
Evidências:
Arquivos alterados:
Validações:
Resultado:
Riscos residuais:
Próximo passo:
```

## 2026-07-24 — APS-000 — Redirecionamento para substituição pelo Gantt APS

Status: concluída.

Responsáveis: Codex coordenador; Leonardo da Vinci na arquitetura; Jarvis no inventário; Rogerio Ceni na auditoria crítica; Leonardo da Vinci na consolidação final.

Escopo: nova varredura arquitetural e documental do Calendário V2 e planejamento da futura substituição visual.

Decisões:

- o Gantt APS substituirá visualmente o Calendário V2;
- não haverá dois calendários visíveis como arquitetura-alvo;
- a primeira implementação será readonly e estrutural;
- a migração começa como troca de renderer, não de motor;
- `manualScheduleDraft` permanece fonte de verdade;
- o rollback oficial será Gantt APS para ProductionCalendar V2;
- `CalendarTimeline` não participa do rollback e permanece necessário em Análise/Comercial;
- a primeira fase usa capabilities `inspect: true` e `mutate: false`;
- nenhum callback mutável será entregue ao Gantt readonly;
- o view model será versionado;
- `task.id` será `allocationId`;
- IDs `readonly:*` não serão persistíveis;
- viewport será isolado do estado produtivo;
- nenhuma migration é necessária para as primeiras fases.

Evidências principais:

- `PlanningPage.js` prioriza `manualScheduleDraft.allocations` no snapshot;
- `applyManualScheduleTransaction` coordena aceite/rollback;
- validators não reposicionam allocations;
- save manual preserva `schedule_tree` e `operations`;
- `manual_schedule_revision` protege updates;
- `USE_PRODUCTION_CALENDAR_V2` retorna ao `CalendarTimeline`, portanto não serve ao novo rollback;
- o Calendário V2 possui interações e acoplamentos além da grade visual;
- `PlanningPage.js` ainda depende de seletor DOM específico para focar allocation;
- estoque do draft e projeção analítica possuem finalidades distintas.

Arquivos alterados:

- `CALENDAR_V2_ARCHITECTURE.md`;
- `docs/APS_GANTT_ARCHITECTURE.md`;
- `docs/APS_GANTT_TASKS.md`;
- `docs/APS_GANTT_EVOLUTION_LOG.md`.

Validações:

- leitura das instruções e skills pertinentes;
- inventário de componentes, callbacks, estados, services, rotas, migrations e testes;
- auditoria independente de IDs, fronteiras, readonly, rollback e regressões;
- revisão documental do working tree corrente;
- confirmação de que nenhum código, migration, biblioteca, commit ou push entrou na missão.

Resultado: arquitetura atual atualizada, arquitetura APS criada, plano de missões estruturado e log contínuo iniciado.

Riscos residuais:

- tecnologia do Gantt ainda não escolhida;
- volume real e requisitos de virtualização não informados;
- política de rollout e navegadores não definidos;
- UX de precedências, setup, estoque e memberships pendente;
- testes atuais não cobrem navegador ou banco reais;
- working tree já possuía muitas alterações antes desta missão.

Próximo passo: o usuário realiza backup externo; depois, executar APS-001 com contrato readonly e seam de renderer, sem ainda construir interações produtivas.

## 2026-07-24 — APS-001 — Contrato readonly e seam de renderer

Status: concluída; validação técnica aprovada com cobertura parcial.

Responsáveis: Codex coordenador; Jarvis na implementação; Toto Wolff na validação técnica independente.

Skills utilizadas: `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-manual-calendar` e `acofer-testing`.

Escopo: criação do contrato neutro versionado, lifecycle e seleção de renderer, adapter do ProductionCalendar V2, rollback controlado e foco por identidade canônica. Nenhum Gantt visual foi criado.

Decisões:

- o read model imutável usa `contractVersion: 'planning-schedule-view/v1'`;
- `capabilities.inspect` permanece `true` e `capabilities.mutate` permanece `false`;
- `task.id` é `String(allocationId)` e IDs `readonly:*` são `persistable: false`;
- callbacks operacionais existentes do V2 permanecem fora do read model e são fornecidos somente pelo adapter do renderer atual;
- `auto` resolve para `production-calendar-v2` enquanto não existir política explícita;
- selecionar `gantt-aps` antes da APS-002 aciona fallback controlado para o V2;
- falha de mount/update destrói a tentativa anterior antes do rollback;
- o foco da orquestração usa `focusAllocation(allocationId)` e não conhece seletor DOM específico;
- a arquitetura, regra produtiva, scheduler, reotimização, estoque, Matriz, persistência, rotas e banco não foram alterados.

Evidências:

- o view model é derivado uma vez de cada snapshot aceito e congelado recursivamente;
- o adapter V2 reconstrói a apresentação a partir do mesmo read model sem promover dados visuais a estado produtivo;
- o host mantém uma única instância ativa e lifecycle `mount`, `update`, `focusAllocation`, `getViewportState` e `destroy`;
- `ProductionCalendar` V2 continua sendo o renderer padrão e o rollback oficial;
- não há HTTP, scheduler ou callback mutável nos módulos neutros.

Arquivos criados:

- `shared/planning-schedule-view/planningScheduleViewModel.js`;
- `shared/planning-schedule-view/planningScheduleRenderer.js`;
- `shared/planning-schedule-view/productionCalendarV2.renderer.js`;
- `shared/planning-schedule-view/index.js`;
- `tests/planningScheduleViewModel.test.js`;
- `tests/planningScheduleRenderer.test.js`.

Arquivos alterados:

- `pages/PlanningPage.js`;
- `tests/planningManualScheduleIntegration.test.js`;
- `docs/APS_GANTT_TASKS.md`;
- `docs/APS_GANTT_ARCHITECTURE.md`;
- `docs/APS_GANTT_EVOLUTION_LOG.md`.

Validações:

- `node tests/planningScheduleViewModel.test.js`;
- `node tests/planningScheduleRenderer.test.js`;
- `node tests/planningManualScheduleIntegration.test.js`;
- `node --check` nos módulos novos e em `pages/PlanningPage.js`;
- smoke test de importação de `shared/planning-schedule-view/index.js`;
- inspeção estática de ausência de HTTP, scheduler e callbacks mutáveis no contrato;
- `git diff --check` no escopo rastreado, sem erro.

Resultado: APS-001 entregue sem mudança visual ou produtiva no modo padrão. O contrato readonly, o seam de renderer, o adapter V2, o lifecycle, o rollback e o foco por identidade canônica estão disponíveis para a próxima missão.

Riscos residuais:

- automático, draft V2, V1 normalizado e legado foram representados por snapshots equivalentes, sem fixtures integrais de cada origem;
- fullscreen, foco visual e exclusividade do renderer não foram exercitados em navegador real;
- falha simultânea do renderer solicitado e do fallback e remount repetido não possuem cenário automatizado explícito;
- o working tree já continha alterações amplas anteriores à missão.

Rollback: definir `PLANNING_SCHEDULE_RENDERER` como `production-calendar-v2` ou manter `auto`; ambos resolvem para o V2. Falhas de `gantt-aps` também retornam ao V2 após `destroy`, sem recriar draft, baseline ou simulação.

Próximo passo: APS-002 — Renderer Gantt readonly, sem executá-la nesta missão.

## 2026-07-24 — APS-002 — Renderer Gantt readonly

Status: implementada e aprovada tecnicamente; não homologada operacionalmente por limitação ambiental.

Responsáveis: Codex coordenador; Jarvis na implementação e nas correções; Toto Wolff na validação técnica independente; Max Verstappen na tentativa de homologação operacional.

Skills utilizadas: `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`, `acofer-operational-homologation`, `chrome:control-chrome` e `computer-use:computer-use`.

Escopo: primeiro renderer visual Gantt somente leitura, consumindo exclusivamente `planning-schedule-view/v1` pelo seam da APS-001. Integração limitada ao registro da factory `gantt-aps`; nenhum service, rota, banco, migration ou regra produtiva foi alterado.

Decisões:

- implementação própria, ESM e sem biblioteca externa;
- `auto` continua resolvendo para `production-calendar-v2`;
- `gantt-aps` é ativado apenas por seleção explícita e mantém o V2 como rollback;
- horizonte visual inicial limitado a 120 dias;
- DOM limitado por paginação determinística de 12 máquinas, 24 allocations por máquina e 24 tasks sem geometria por página;
- `focusAllocation(allocationId)` navega para a página correspondente sem interpolar o ID em seletor;
- tasks incompletas permanecem inspecionáveis em uma seção readonly de itens sem geometria;
- viewport, seleção, zoom, paginação e fullscreen permanecem estado exclusivamente visual.

Comportamento implementado:

- toolbar com zoom e fullscreen local;
- tabela fixa à esquerda e timeline contínua à direita;
- lanes na ordem canônica das máquinas, incluindo máquinas sem produção;
- barras posicionadas por data e horário civil, respeitando `endDate` em turno noturno;
- stacking de allocations sobrepostas;
- exibição de produção, etapa, material, quantidade/unidade, pessoas, duração, capacidade, cores e memberships quando disponíveis;
- fins de semana, feriados, dias não úteis e `manualWorkDates` apresentados a partir do contrato recebido;
- inspeção acessível por clique, teclado ou foco por identidade canônica;
- estados vazio, erro recebido, dados incompletos e tasks sem geometria;
- lifecycle `mount`, `update`, `focusAllocation`, `getViewportState` e `destroy`;
- cleanup de timer de foco, listener de fullscreen, DOM e referências;
- zero callback mutável, HTTP, scheduler, simulação, reotimização, persistência ou writeback.

Arquivos criados:

- `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`;
- `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`;
- `shared/planning-schedule-view/gantt-aps/gantt-aps.css`;
- `shared/planning-schedule-view/gantt-aps/index.js`;
- `tests/ganttApsRenderer.test.js`.

Arquivos alterados:

- `shared/planning-schedule-view/index.js`;
- `pages/PlanningPage.js`;
- `tests/planningScheduleRenderer.test.js`;
- `docs/APS_GANTT_TASKS.md`;
- `docs/APS_GANTT_ARCHITECTURE.md`;
- `docs/APS_GANTT_EVOLUTION_LOG.md`.

Validações:

- `node tests/ganttApsRenderer.test.js`;
- `node tests/planningScheduleRenderer.test.js`;
- `node tests/planningScheduleViewModel.test.js`;
- `node --check` nos JavaScript criados e nas integrações alteradas;
- import smoke dos índices e do renderer Gantt;
- harness DOM determinístico para mount/update/destroy, renderer único, paginação, IDs especiais, inspeção imutável, estados vazio/erro/incompleto, dias não úteis, fullscreen, timers e listeners;
- inspeção negativa de HTTP, scheduler e callbacks mutáveis;
- `git diff --check`, sem erro;
- servidor local e assets do Gantt responderam HTTP 200.

Resultado: implementação técnica aprovada. A primeira tentativa foi reprovada por timers concorrentes, desaparecimento de tasks incompletas, formatação indevida de ausentes, DOM sem limite por volume e falta de harness DOM; todos os bloqueadores foram corrigidos e aprovados no reteste independente.

Limitações intencionais:

- nenhuma mutação produtiva;
- sem dependências, estoque ou diagnósticos avançados;
- paginação bounded em vez da virtualização avançada reservada à APS-003;
- janela inicial de 120 dias;
- troca da flag exige nova montagem da tela.

Riscos residuais:

- CSS computado, alinhamento pixel a pixel, contraste, responsividade, scroll, teclado e fullscreen nativo não foram avaliados em navegador;
- dados reais autenticados do PCP não puderam ser confrontados visualmente;
- o Fake DOM técnico não substitui homologação operacional.

Homologação operacional: `Não homologado por limitação ambiental`. Não havia Chrome conectado; a tentativa alternativa falhou porque o pipe nativo do runtime Windows não estava disponível. Nenhuma ação mutável ou persistência foi executada.

Rollback: definir `globalThis.PLANNING_SCHEDULE_RENDERER = 'production-calendar-v2'` antes de montar novamente a tela de Planejamento, ou manter `auto`. Falha de mount/update do Gantt destrói a tentativa e monta o V2 sobre o mesmo view model, sem recriar draft, baseline ou simulação.

Pendência: executar o roteiro visual em navegador autenticado e registrar o veredito operacional. Até isso ocorrer, APS-002 não recebe status de concluída.

Próximo passo oficial após a homologação da APS-002: APS-003 — Viewport, fullscreen e lifecycle. Não executado nesta missão.

## 2026-07-24 — APS-002 — Refinamento estrutural após reprovação visual

Status: implementação refinada e aprovada tecnicamente; não homologada operacionalmente por limitação ambiental. A APS-002 permanece aberta.

Responsáveis: Codex coordenador na aplicação cirúrgica; Jarvis no inventário técnico e delimitação do renderer; Toto Wolff na validação técnica independente; Max Verstappen na tentativa de homologação operacional.

Skills utilizadas: `acofer-implementation`, `acofer-production-calendar-ui`, `acofer-testing`, `acofer-operational-homologation`, `chrome:control-chrome` e `computer-use:computer-use`.

Escopo: correção da própria APS-002, sem criar APS-002A e sem avançar para APS-003. A lane única por máquina e o stacking foram substituídos por uma hierarquia visual readonly de máquina e allocation.

Decisões:

- máquina é parent row compacta, inicialmente expandida e recolhível;
- cada task posicionada gera exatamente uma allocation row e uma barra;
- splits com `allocationId` distinto permanecem em rows distintas;
- memberships decoram e informam uma row, sem duplicá-la;
- tabela fixa possui máquina/grupo, produção, etapa, material, quantidade/unidade, pessoas e capacidade;
- início e término permanecem no inspector;
- allocation row usa 36 px, parent row 30 px e barra plana 22 px;
- barras usam `box-sizing: border-box`, sem sombra, com labels `none`, `production` e `full`;
- zoom padrão usa `6 px/h` (`144 px/dia`) e níveis locais `[3, 4, 6, 8, 12]`;
- paginação provisória usa orçamento global de 60 allocation rows, com continuação de máquina;
- tasks fora dos 120 dias ou sem geometria permanecem em seção paginada e inspecionável;
- `focusAllocation()` localiza a página, expande o grupo e foca a identidade canônica;
- campos opcionais foram formalizados em `task.presentation`, mantendo leitura top-level retrocompatível e `planning-schedule-view/v1`.

Arquivos alterados:

- `shared/planning-schedule-view/planningScheduleViewModel.js`;
- `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`;
- `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`;
- `shared/planning-schedule-view/gantt-aps/gantt-aps.css`;
- `shared/planning-schedule-view/gantt-aps/index.js`;
- `tests/planningScheduleViewModel.test.js`;
- `tests/ganttApsRenderer.test.js`;
- `docs/APS_GANTT_ARCHITECTURE.md`;
- `docs/APS_GANTT_TASKS.md`;
- `docs/APS_GANTT_EVOLUTION_LOG.md`.

Validações:

- `node tests/planningScheduleViewModel.test.js`;
- `node tests/planningScheduleRenderer.test.js`;
- `node tests/ganttApsRenderer.test.js`;
- `node --check` nos JavaScript focados;
- import smoke de `shared/planning-schedule-view/index.js`;
- `git diff --check`;
- reteste independente após corrigir `sequence: null`/`''`, que não pode ser promovida a zero;
- harness DOM para row/bar 1:1, orçamento global, collapse/focus, IDs especiais, splits, memberships, três níveis de labels, tasks fora do horizonte, update, fullscreen e destroy.

Resultado: `Aprovado tecnicamente`. A inspeção de código confirmou ausência de stacking no renderer, HTTP, callbacks mutáveis, scheduler, simulação, reotimização, persistência e writeback.

Homologação operacional: `Não homologado por limitação ambiental`. O Chrome connector continuou indisponível e nenhuma superfície de navegador foi descoberta; Computer Use falhou por ausência do pipe nativo do Windows. Credenciais não foram usadas nem registradas.

Limitações e riscos residuais:

- CSS computado, alinhamento pixel a pixel, sticky, scroll, contraste, teclado, árvore de acessibilidade e fullscreen nativo ainda exigem navegador real;
- os alvos de 4–7 dias no viewport normal e 7–10 em fullscreen dependem da largura real e permanecem sujeitos à homologação;
- paginação é provisória; virtualização e viewport definitivo continuam reservados à APS-003;
- APS-002 não pode ser declarada concluída antes do gate visual real.

Rollback: definir `globalThis.PLANNING_SCHEDULE_RENDERER = 'production-calendar-v2'` antes de remontar o Planejamento, ou manter `auto`. O host continua destruindo o Gantt falho antes de montar o V2 sobre o mesmo read model.

Próximo passo: repetir a homologação visual da APS-002 em ambiente com navegador controlável. APS-003 permanece pendente e não foi executada.

## 2026-07-24 — APS-002 — Ordem canônica de máquinas

Status: correção visual cirúrgica implementada.

Escopo: o Gantt APS passou a reutilizar o comparador canônico do Calendário V2, na ordem Trefila, EC-125, EC-60, Aço-8, Focus-8, MT-200, MT-150 e MT-100. Máquinas sem produção, grupos recolhíveis, IDs e renderer readonly foram preservados. Layout, timeline, barras, zoom, paginação, contratos, services, banco e APS-003 não foram alterados.

## 2026-07-24 — APS-002 — Gantt APS como renderer padrão de desenvolvimento

Status: correção de comportamento implementada.

Escopo: `auto` passou a resolver para `gantt-aps`, sem necessidade de seleção pelo console. O Calendário V2 permanece no projeto como legado técnico e fallback interno, sem ser o renderer padrão. Contrato readonly, lifecycle, layout e APS-003 não foram alterados.

## 2026-07-24 — APS-002 — Total por produção na primeira coluna

Status: refinamento visual implementado; APS-002 permanece sem homologação operacional.

Escopo: a primeira coluna do Gantt passou a exibir um bloco visual agregado por máquina, produção canônica principal e unidade, com soma decimal formatada em pt-BR e altura correspondente às allocation rows contíguas. Unidades diferentes geram blocos separados. Produções apenas associadas por memberships permanecem informativas no inspector e não são fundidas, duplicadas nem usadas como chave visual.

Arquivos alterados: `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `shared/planning-schedule-view/gantt-aps/gantt-aps.css` e `tests/ganttApsRenderer.test.js`.

Teste focado: `node tests/ganttApsRenderer.test.js`.

## 2026-07-24 — APS-002 — Produção principal exclusiva no Gantt

Status: correção visual cirúrgica implementada; APS-002 permanece sem homologação operacional.

Escopo: `productionMemberships` continua disponível internamente no read model, mas deixou de participar de qualquer apresentação visual do Gantt. Rows, barras, totais, labels, cores e inspector usam exclusivamente a produção principal da task. A seção “Produções associadas” foi removida do inspector, sem duplicar allocations ou quantidades.

Arquivos alterados: `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, `shared/planning-schedule-view/gantt-aps/gantt-aps.css` e `tests/ganttApsRenderer.test.js`.

Teste focado: `node tests/ganttApsRenderer.test.js`.

## 2026-07-24 — APS-002 — Memberships quantitativos e rows visuais independentes

Status: evolução readonly implementada; APS-002 permanece aberta e sem homologação operacional.

Escopo: `productionMemberships` passou a preservar `quantity` e `unit` do `productionBreakdown`, cuja semântica é a quantidade produzida atribuída à produção. `quantitySource` registra `production-breakdown`, `allocation-primary` ou `legacy-unresolved`. O split manual autorizado particiona cada membership resolvido com os mesmos percentuais, precisão de seis casas e resíduo determinístico na última parte usados pela quantidade física.

Projeção: cada produção distinta atendida por uma allocation gera row, barra, quantidade e inspector próprios, com `visualRowId` efêmero. `allocationId` e `task.id` permanecem físicos e únicos. Membership legado sem quantidade continua visível como “Não atribuída” e fica fora dos totais. Totais agregam somente quantidades resolvidas por máquina, produção e unidade. Nenhuma quantity foi inferida, nenhuma allocation física foi duplicada e nenhum contrato de escrita foi criado.

Arquivos alterados: `shared/production-calendar/productionCalendar.adapter.js`, `services/manualScheduleDraft.service.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.geometry.js`, `shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`, testes focados e documentação APS.

## 2026-07-24 — APS-002 — Reversão da projeção visual por membership

Status: reversão visual parcial implementada; APS-002 permanece aberta e sem homologação operacional.

Escopo: removida a projeção que gerava uma row e uma barra para cada `productionMembership`. O Gantt voltou à relação 1:1 entre allocation canônica, row e barra. A coluna Produção apresenta os índices associados no formato compacto `Produção 1 / 3`, e o inspector apresenta `Produções: 1 / 3` sem lista.

Preservações: `productionBreakdown`, memberships quantitativos, `quantity`, `unit`, `quantitySource` e o particionamento canônico dos memberships no split não foram revertidos. Totais voltaram a consumir a quantidade canônica da allocation por máquina, produção principal e unidade. Nenhum service, contrato de escrita, banco ou persistência foi alterado nesta reversão.

## 2026-07-24 — APS-002 — Viewport vertical natural e identidade cromática

Status: refinamento visual implementado e tecnicamente validado; APS-002 permanece aberta para homologação operacional.

Escopo: removidos o limite de altura e a rolagem vertical interna da viewport do Gantt, preservando a rolagem horizontal, a tabela sticky e a paginação vigente. Allocation rows passaram a 40 px e barras planas a 28 px.

Cores: a coluna Produção, a barra única da allocation e o cabeçalho do inspector usam a mesma projeção cromática integral. Produção principal e memberships são ordenados, deduplicados por identidade canônica e divididos em `N` faixas iguais, sem duplicar row, barra, duração ou quantidade. O renderer reutiliza o resolvedor canônico do `ProductionCalendarCard`; cores explícitas continuam somente leitura e recebem normalização visual de saturação/luminosidade quando lavadas. Cor ausente usa o fallback canônico estável.

Legibilidade: labels usam overlay escuro discreto com texto branco; índices compactos e dados do inspector preservam identificação textual, portanto a interface não depende somente da cor.

Preservações: `left`, `width`, datas, horários, `endDate`, turno noturno, paginação, focus, collapse, update, fullscreen e cleanup de `destroy()` permanecem. Quantities, totals, memberships, adapter, `productionBreakdown` e split não foram alterados. Nenhum service, scheduler, estoque, Matriz, banco, rota ou persistência foi tocado. APS-003 não foi iniciada.

## 2026-07-24 — APS-002 — Cabeçalho responsivo e cor visual compartilhada

Status: refinamento visual implementado e tecnicamente validado; APS-002 permanece aberta para homologação operacional.

Escopo: removido o badge escuro dos labels da coluna Produção e das barras, mantendo texto branco direto com sombra discreta. O cabeçalho temporal passou a escolher data completa, dia/mês ou somente dia pela largura real de cada dia, preservando data completa, dia da semana e feriado em `title`/`aria-label`, além das hachuras e marcações vigentes.

Cores: a normalização viva saiu do renderer e foi centralizada em `shared/production-calendar/productionDisplayColor.js`. A mesma base visual passou a alimentar Gantt, cards/amostras da seção Produções, cards do Calendário V2 e legenda, fundos suaves, bordas, faixas, barras, conectores e setas do Fluxo produtivo. Opacidade e mistura com branco continuam permitidas como derivados da mesma base; cores do draft/snapshot não são modificadas.

Preservações: geometria temporal, zoom disponível, fullscreen, sticky header, paginação, focus, collapse, inspector, update e destroy permanecem. Quantities, totals, memberships, adapter, `productionBreakdown` e split não foram alterados. Nenhum service, scheduler, estoque, Matriz, banco, rota ou persistência foi tocado. APS-003 não foi iniciada.

## 2026-07-24 — APS-002 — Datas completas e coluna Material compacta

O cabeçalho passou a exibir `dd/mm/aa` e o nome completo do dia da semana em todos os zooms, com fonte e padding discretamente reduzidos em 3 e 4 px/h. A coluna Material foi reduzida para 160 px, mantendo linha única, ellipsis e valor integral acessível. Nenhuma alteração funcional ou produtiva foi realizada.

## 2026-07-28 — APS-002 — Grade diária contínua

A área temporal do Gantt APS passou a desenhar uma grade diária contínua por overlay CSS baseado em `--gantt-aps-day-width`, preservando a separação visual máquina × dia em rows de allocation, grupos e máquinas vazias. Hachuras de sábado, domingo, feriado e dia não útil continuam coexistindo com as divisórias. Nenhuma regra produtiva foi alterada.

## 2026-07-28 — APS-002 — Barra diária cheia e subdivisões reforçadas

As barras do Gantt APS passaram a preencher horizontalmente 100% da célula diária visual, preservando duração, início, término, capacidade e inspector nos dados. As subdivisões internas em quatro partes ganharam contraste pontilhado mais perceptível. Nenhuma regra produtiva foi alterada.

## 2026-07-28 — APS-002 — Largura por capacidade e hierarquia da grade

A largura visual das barras diárias passou a usar `capacityPercent`: 100% ocupa a célula completa e percentuais menores ocupam proporcionalmente. A divisória principal diária foi reforçada e as subdivisões internas foram mantidas mais leves. Nenhuma regra produtiva foi alterada.

## 2026-07-28 — APS-002 — Respiro horizontal e barras sem label visual

As barras da timeline receberam respiro horizontal mínimo, preservando o respiro vertical existente e a largura proporcional por capacidade. Os labels visuais internos foram ocultados, mantendo `aria-label`, `title` e inspector. Nenhuma regra produtiva foi alterada.

## 2026-07-28 — APS-002 — Quantidade por capacidade e capacidade utilizada

A tabela do Gantt APS passou a exibir `Quantidade / Capacidade` usando a capacidade diária readonly já presente em `maxDailyCapacity`, mantendo `Capacidade utilizada` como o percentual canônico existente. Fica documentada para avaliação futura a regra de estoque mínimo por capacidade diária integral ou quantidade restante menor, sem implementação nesta entrega. Nenhuma regra produtiva foi alterada.
## 2026-07-28 - APS-002 - Offset intradiario readonly

O contrato `planning-schedule-view/v1` passou a transportar `startCapacityPercent` e `endCapacityPercent` calculados uma vez por maquina/data a partir da ordem canonica da allocation no dia. O Gantt APS usa esses campos somente para posicionar a barra dentro da celula diaria, preservando `capacityPercent` como largura proporcional, respiro horizontal, barras sem label visual, inspector e divisao cromatica. Quando a soma por maquina/data ultrapassa 100%, o view model adiciona warning readonly `GANTT_INTRADAY_CAPACITY_OVERFLOW`; isso nao substitui validacao produtiva.

Analise produtiva: a regra de estoque integral por parcela diaria foi investigada, mas nao implementada nesta entrega. Hoje o planejamento inicial agenda no scheduler de `planning.service.js`, a reotimizacao agenda em `planningReoptimization.service.js` e o ledger/validacao em `manualScheduleStockLedger.service.js`/`manualScheduleValidation.service.js` diagnostica disponibilidade apos receber allocations prontas. Nao existe ainda helper canonico unico de `dailyPlannedQuantity`, `requiredComponents` e `stockFeasibility` consumido por todas as entradas. Pela condicao de parada, a mudanca produtiva deve ser desenhada antes de alterar dois motores independentes. Banco, Matriz, rotas, estoque de venda e migrations nao foram alterados.

## 2026-07-28 - REGRA-001 - Estoque integral da parcela diaria

REGRA-001 implementada no fluxo do planejamento inicial exibido pelo Gantt/Calendario: `buildPlan`/`buildSinglePlan` em `services/planning.service.js` agora gera `calendarOperations` por parcela diaria verificando estoque integral dos componentes antes de criar a allocation. O Gantt permanece readonly quanto a estoque e apenas exibe as allocations resultantes.

A parcela diaria usa `dailyPlannedQuantity = min(remainingProductionQuantity, maxDailyCapacity)`, com `maxDailyCapacity` recalculado a partir da Matriz de Produtividade para material/operacao, maquina, pessoas e jornada produtiva. Alteracoes de maquina ou pessoas em nova simulacao invalidam a capacidade anterior porque `scheduleOperations` resolve novamente a Matriz antes da geracao dos cards diarios.

Todos os componentes do modelo produtivo selecionado sao avaliados por `canonicalRequirementRatio x dailyPlannedQuantity`; se qualquer componente nao tiver disponibilidade integral, a allocation daquele dia nao e criada e o fluxo procura o proximo dia produtivo. A ultima parcela pode ser menor que a capacidade diaria quando o saldo restante for menor. Material produzido em um dia entra no ledger apenas no dia seguinte; nao foi criado offset intradiario.

Diagnosticos estruturados adicionados: `INSUFFICIENT_STOCK_FOR_FULL_DAILY_BATCH` para bloqueio de lote diario integral e `PRODUCTIVITY_MATRIX_CONFIGURATION_NOT_FOUND` para combinacao inexistente na Matriz, sem fallback silencioso.

Fluxos ainda nao migrados nesta regra: reotimizacao (`planningReoptimization.service.js`), draft/editor manual, drag, split, persistencia, snapshots salvos sem contexto de estoque e os agregados legados `operations`/`days`/`summary` do retorno automatico. Nesta primeira etapa, o bloqueio canonico aplicado para exibicao governa `calendarOperations`, que alimenta as allocations do Gantt. Banco, migrations, cadastro da Matriz, transporte, setup e layout do Gantt nao foram alterados.

Testes executados: `node --check services/planning.service.js`, `node --check tests/planningDailyBatchStock.service.test.js`, `node tests/planningDailyBatchStock.service.test.js`, `node tests/planningDependencyDailyBatch.service.test.js`, `node tests/planningAllocation.service.test.js`, `node tests/planningScheduleViewModel.test.js`, `git diff --check`. A cobertura inclui componente repetido no mesmo modelo, somado antes da verificacao de estoque. `node tests/planningConstraintRecalculation.service.test.js` foi tentado, mas ficou bloqueado pela data atual de 2026-07-28 porque o teste usa producoes passadas e cai em "Produções anteriores a hoje são somente leitura.".

## 2026-07-28 - APS-002 - Drag horizontal do Gantt APS para movimento manual

Status: implementacao finalizada e validada tecnicamente; homologacao operacional em navegador nao executada por limitacao ambiental.

Escopo: o Gantt APS recebeu canal proprio `createGanttApsRenderer({ onRequestMove })`, capability `manualMove` derivada de `permissions.canEditAllocations`, celulas de drop por data na lane da mesma maquina, estados visuais de drag/destino e emissao de intencao `MOVE_ALLOCATION` com `source: 'gantt-drag'`. O Calendario V2 deixou de receber o callback de movimento na integracao da PlanningPage.

Decisoes: o renderer continua sem importar services, HTTP, scheduler, persistencia ou regra produtiva; ele apenas apresenta estado e emite intencao. A PlanningPage bloqueia movimento do Gantt para outra maquina e reaproveita o runner manual existente para a politica `stock_only_independent`, sem abrir configuracao de maquina/pessoas no drag do Gantt.

Arquivos alterados nesta etapa: `tests/ganttApsRenderer.test.js`, `tests/planningScheduleViewModel.test.js` e `docs/APS_GANTT_EVOLUTION_LOG.md`. Alteracoes funcionais ja existentes no worktree foram preservadas sem reversao.

Validacoes executadas: `node tests/planningScheduleViewModel.test.js`; `node tests/ganttApsRenderer.test.js`; `node tests/planningScheduleRenderer.test.js`; `node tests/planningManualScheduleIntegration.test.js`; `node tests/manualScheduleTransaction.service.test.js`; `node tests/planningStockProjectionModal.test.js`; `node tests/planningStockBalanceToggle.test.js`; `node --check pages/PlanningPage.js`; `node --check shared/planning-schedule-view/planningScheduleViewModel.js`; `node --check shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js`; `node --check tests/ganttApsRenderer.test.js`; `node --check tests/planningScheduleViewModel.test.js`; import smoke de `shared/planning-schedule-view/index.js`; import smoke de `pages/PlanningPage.js` com stubs minimos de browser; `git diff --check`.

Resultado: cobertura tecnica atualizada para o novo contrato. O harness DOM cobre permissao `manualMove`, pointer drag em barra persistivel, destaque de destino, limpeza do estado visual e payload canonico `MOVE_ALLOCATION`. O teste do view model cobre `manualMove` verdadeiro/falso pela permissao canonica.

Riscos residuais: zoom, fullscreen, inspector, focus e destroy foram exercitados pelo harness existente apos a mudanca, mas nao houve verificacao visual em navegador real. O modal de estoque parcial, o modal de estoque zero e o seletor de data do restante nao foram homologados visualmente nesta etapa. O runner ainda se chama `productionCalendarMoveRunner`, nome legado mantido como ponte.
