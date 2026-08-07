# Gantt APS — Arquitetura oficial

## 1. Status e decisão

Status: arquitetura aprovada; APS-001 entregue e APS-002 refinada estruturalmente em 2026-07-24 após reprovação visual. O Gantt readonly aguarda nova homologação operacional em navegador antes de a APS-002 ser declarada concluída.

Data da decisão: 2026-07-24.

O Gantt APS substituirá visualmente o Calendário de Produção V2 no Planejamento depois de cumprir as fases de paridade, validação e homologação. O agrupamento padrão continuará sendo por máquina.

A substituição será inicialmente uma troca de renderer, não uma troca do motor de planejamento. Na primeira versão, “APS” identifica a futura estação operacional e seu eixo visual; não autoriza um novo solver, auto-schedule, nivelamento ou writeback.

## 2. Objetivo

Construir uma estação operacional de PCP com:

- tabela fixa à esquerda;
- timeline contínua à direita;
- lanes agrupadas por máquina;
- barras de produção posicionadas por data e horário;
- visualização de capacidade, equipe, dias produtivos e não produtivos;
- diagnósticos e dependências;
- baseline e comparação futura;
- reotimização localizada futura;
- cockpit futuro.

O renderer deve mostrar o estado aceito do planejamento sem reinterpretar regras produtivas.

## 3. Princípios invariáveis

1. Depois de criado, `manualScheduleDraft` continua sendo a fonte de verdade editável.
2. O Gantt recebe dados prontos e não executa scheduler, validação, estoque, produtividade ou persistência.
3. `task.id === String(allocationId)`.
4. IDs `readonly:*` são somente visuais, recebem `persistable: false` e nunca originam writeback.
5. `parentOperationId`, `productionId`, `productionIndex` e linhagem `split*` permanecem campos distintos.
6. Datas são civis `YYYY-MM-DD`, horários são explícitos e `endDate` governa cruzamento de meia-noite.
7. Candidato recusado nunca substitui draft, baseline, histórico, browser ou banco aceitos.
8. Validadores apenas diagnosticam.
9. Baseline automática e draft manual permanecem separados.
10. Reopen não executa simulação silenciosa.
11. Save continua server-side, transacional e protegido por `expectedRevision`.
12. `schedule_tree` e `operations` automáticos não são sobrescritos pelo save manual.
13. Estoque, recursos, setup e dependências chegam como projeções independentes.
14. Estado de viewport nunca entra no draft ou na persistência produtiva.
15. Auto-schedule e APIs mutáveis de eventual biblioteca permanecem desativados até missão explícita.

## 4. Escopo inicial

A primeira versão visual deverá:

- ser selecionada por flag de renderer;
- consumir dados reais do snapshot aceito;
- agrupar por máquina;
- exibir tabela fixa e timeline;
- renderizar barras reais;
- posicionar início e fim por horário;
- suportar zoom, janela visual, scroll e fullscreen locais;
- mostrar tooltip ou painel básico de inspeção;
- apresentar fins de semana, feriados e `manualWorkDates`;
- preservar cores, produção, etapa e memberships quando disponíveis;
- fazer fallback para o V2 em erro.

A primeira versão não deverá:

- oferecer drag ou resize;
- editar, dividir ou excluir;
- registrar transporte;
- alterar equipe ou dia produtivo;
- otimizar ou reotimizar;
- salvar, descartar ou chamar API;
- criar persistência própria;
- executar `simulateCurrent`, `buildPlan` ou scheduler;
- mutar `currentSimulation`, draft, baseline ou histórico.

## 5. Escopo futuro

Após homologação da leitura:

- seleção operacional e foco;
- painel/modal de inspeção completo;
- diagnósticos por barra, data e lane;
- estoque, setup, recursos e dependências;
- drag e click-move;
- editor unificado;
- split proporcional recursivo;
- transporte;
- `manualWorkDates`;
- `dailyTeamOverrides`;
- undo/redo;
- descarte integral;
- persistência e concorrência;
- baseline visual;
- reotimização localizada;
- cockpit APS.

Cada capacidade mutável será conectada isoladamente aos handlers e services atuais.

## 6. Fronteira arquitetural

```text
PlanningPage / controlador
        |
        v
PlanningScheduleViewModel v1
        |
        +-- production-calendar-v2
        |       `-- adapter do renderer V2
        |
        `-- gantt-aps
                `-- renderer visual readonly

intenção futura
        |
        v
handlers atuais
        |
        v
services canônicos
        |
        v
manualScheduleDraft aceito ou rollback
```

O view model é produzido uma única vez a partir do snapshot aceito. É proibido criar um adapter Gantt diretamente de `production_plan_days`, DOM, textos visuais ou geometria de barras.

## 7. Read model versionado

Contrato proposto:

```js
{
  contractVersion: 'planning-schedule-view/v1',
  capabilities: {
    inspect: true,
    mutate: false
  },
  resources: [],
  tasks: [],
  calendar: {
    days: [],
    shifts: [],
    timezone: null
  },
  projections: {
    stock: null,
    dependencies: null,
    resources: null,
    setup: null,
    validation: null
  },
  permissions: {},
  metadata: {}
}
```

### 7.1 Recursos

Cada recurso representa uma máquina canônica:

```js
{
  id: String(machineId),
  name: String(machineName),
  order: Number
}
```

O ID governa vínculo; o nome é apresentação.

### 7.2 Tarefas

Cada task é uma projeção readonly de uma allocation:

```js
{
  id: String(allocationId),
  persistable: true,
  operationId,
  parentOperationId,
  calendarParentOperationId,
  productionId,
  productionIndex,
  resourceId: String(machineId),
  start: { date, time },
  end: { date: endDate || date, time: endTime },
  quantity,
  unit,
  durationMinutes,
  capacityPercent,
  startCapacityPercent,
  endCapacityPercent,
  peopleCount,
  pinned,
  isCapacityOverride,
  split: {},
  presentation: {}
}
```

Regras:

- o renderer nunca modifica esse objeto;
- a biblioteca não substitui `id`;
- IDs internos da biblioteca ficam em namespace separado;
- barra visual não é fonte para reconstrução de allocation;
- tarefa `persistable: false` não aceita intenção mutável.

### 7.3 Projeções

As projeções permanecem separadas:

- `stock`: projeção do planejamento corrente e/ou alerta analítico, com origem identificada;
- `dependencies`: arestas e status normalizados pelo domínio;
- `resources`: equipe, capacidade e overrides;
- `setup`: intervalos e conflitos;
- `validation`: erros, warnings e apresentação.

O renderer correlaciona projeções por ID, data, material ou máquina; não promove ausência de projeção a erro produtivo.

## 8. Renderer e lifecycle

Interface mínima:

```js
mount(container, model)
update(model)
focusAllocation(allocationId)
getViewportState()
destroy()
```

Garantias:

- `mount` e `update` não fazem HTTP;
- `focusAllocation` usa identidade canônica, não seletor externo;
- `getViewportState` retorna somente zoom, scroll, horizonte e seleção visual;
- `destroy` remove listeners, observers, timers, overlays, tooltips e referências DOM;
- falha do Gantt executa `destroy` antes de montar o V2;
- fullscreen/remount preserva somente viewport visual;
- CSS do Gantt usa raiz própria e não reutiliza `.production-calendar-*` ou classes de `CalendarTimeline`.

## 9. Capabilities e eventos

### 9.1 Fase somente leitura

```js
capabilities: {
  inspect: true,
  mutate: false
}
```

Callbacks permitidos:

- `onInspectTask`;
- `onInspectDate`;
- `onViewportChange`;
- `onLifecycleError`.

Callbacks mutáveis não são fornecidos. Não basta desabilitar botões.

### 9.2 Intenções futuras

Somente com `mutate: true` explícito:

- `MOVE_ALLOCATION`;
- `EDIT_ALLOCATION`;
- `SPLIT_ALLOCATION`;
- transporte;
- `SET_MANUAL_WORK_DATE`;
- `SET_DAILY_TEAM_OVERRIDES`;
- undo/redo;
- descarte;
- otimização em missão própria.

Payloads usam IDs, datas e horários canônicos, nunca pixels, labels ou IDs internos do renderer.

## 10. Timeline e calendário produtivo

- O eixo visual é contínuo e pode mostrar dias adicionais sem criar allocations ou dias persistidos.
- Barras usam `date + startTime` e `endDate/date + endTime`.
- Parsing deve evitar conversão implícita que desloque datas por UTC.
- Turnos noturnos, feriados, sábados, domingos e `manualWorkDates` são recebidos do domínio.
- Almoço ou intervalos decorrem dos turnos; não são inventados pelo renderer.
- Áreas não produtivas são faixas visuais, não regras de bloqueio.
- O volume real definirá o nível de virtualização horizontal e vertical.

## 11. Paridade planejada

| Capacidade atual | Primeira versão | Antes de ativar como padrão |
| --- | --- | --- |
| Agrupamento por máquina | Preservar | Preservar |
| IDs/datas/horários/quantidade | Preservar | Preservar |
| Cores, etapas e memberships | Preservar | Preservar |
| Dias não úteis | Preservar | Preservar |
| Zoom/scroll/horizonte/fullscreen | Preservar com estado próprio | Homologar |
| Inspeção | Tooltip/painel básico | Painel completo |
| Diagnósticos | Sinalização básica ou adiada explicitamente | Paridade |
| Estoque por dia | Adiar explicitamente | Paridade sem fundir projeções |
| Precedências/setup | Adiar explicitamente | Paridade visual |
| Transporte | Somente apresentação quando disponível | Intenção operacional |
| Seleção operacional | Somente inspeção | Paridade |
| Drag/click-move | Ausente | Paridade ou decisão de remoção |
| Editor/split | Ausente | Paridade |
| Dia/equipe | Ausente | Paridade |
| Undo/redo | Ausente | Paridade |
| Descarte | Ausente | Paridade |
| Otimização | Ausente | Missão e decisão próprias |
| Save/reopen/409 | Sem ação pelo renderer | Paridade operacional |

## 12. Estratégia de substituição

Seleção proposta:

```text
PLANNING_SCHEDULE_RENDERER =
  production-calendar-v2
  gantt-aps
  auto
```

- `production-calendar-v2`: força o componente atual e é o rollback.
- `gantt-aps`: tenta o Gantt e retorna ao V2 em erro de mount/update.
- `auto`: aplica política de rollout; sem política, resolve para V2.

A flag:

- é independente de `USE_PRODUCTION_CALENDAR_V2`;
- afeta somente o Planejamento;
- não altera fonte de dados, draft, baseline ou persistência;
- não mantém dois calendários visíveis;
- não usa `CalendarTimeline` como fallback.

## 13. Rollback

Durante desenvolvimento e homologação:

- `ProductionCalendar` V2 permanece importado e funcional;
- ambos consomem o mesmo view model;
- não existe um segundo draft;
- trocar renderer não chama simulação;
- erro do Gantt não modifica estado produtivo;
- fallback preserva o snapshot aceito;
- remoção do V2 só ocorre em missão posterior à janela de rollback.

O backup externo do usuário é proteção adicional, não substitui rollback de componente.

## 14. Virtualização e desempenho

Não há volume real documentado. Antes de escolher estratégia ou biblioteca, registrar:

- máximo de máquinas;
- máximo de allocations;
- horizonte típico e máximo;
- quantidade de dependências;
- navegadores suportados;
- orçamento de tempo para mount/update;
- orçamento de elementos DOM e memória.

A primeira versão deve evitar DOM ilimitado. Virtualização não pode alterar identidade, ordem ou geometria temporal.

## 15. Acessibilidade

- tabela fixa e timeline devem possuir nomes e relações compreensíveis;
- tarefas precisam ser alcançáveis por teclado na inspeção;
- foco deve sobreviver a update e fullscreen quando a tarefa ainda existir;
- tooltip não pode ser a única fonte de informação;
- cores não podem ser o único indicador de estado;
- labels devem incluir produção, material, máquina, data, horário e diagnóstico;
- contraste e leitura em zoom devem ser homologados.

## 16. Primeiras missões

### 16.1 APS-001 — Contrato readonly e seam de renderer

Objetivo: criar o contrato neutro versionado, capabilities inequívocas, lifecycle, seleção de renderer, adapter do V2 e rollback. Essa missão prepara a substituição sem criar ainda o Gantt visual.

Status: concluída em 2026-07-24. A implementação está em `shared/planning-schedule-view/*`, com integração estreita em `pages/PlanningPage.js`. O V2 continua padrão e rollback; selecionar `gantt-aps` antes da APS-002 resulta em fallback controlado para o V2.

Critérios bloqueantes:

- `planning-schedule-view/v1` deriva uma única vez do snapshot aceito;
- `task.id === String(allocationId)`;
- `readonly:*` recebe `persistable: false`;
- `capabilities.inspect = true` e `mutate = false`;
- a flag independente seleciona V2, Gantt ou `auto`;
- V2 permanece o padrão e rollback;
- `focusAllocation(allocationId)` substitui seletores DOM externos;
- nenhum comportamento ou visual padrão muda.

### 16.2 APS-002 — Primeiro Gantt visual readonly

Objetivo: criar a primeira experiência Gantt somente leitura com dados reais, consumindo exclusivamente o contrato aprovado em APS-001.

Status: implementação própria sem dependências externas refinada em 2026-07-24. Após reprovação visual da lane única por máquina, a estrutura consolidada passou a usar parent row de máquina e uma allocation row por task, sem stacking. A instância mantém horizonte inicial de até 120 dias, paginação provisória por orçamento global de 60 allocation rows e seção explícita para tasks fora da janela ou sem geometria. A homologação operacional real permanece pendente.

Decisões visuais consolidadas:

- parent row compacta por máquina, inicialmente expandida e recolhível;
- máquinas vazias permanecem visíveis como grupos compactos;
- cada `task.id`/`allocationId` físico gera exatamente uma row e uma barra;
- memberships associados não criam identidade DOM adicional; seus índices aparecem apenas no label compacto da coluna Produção e no inspector;
- splits com `allocationId` distinto geram rows distintas e particionam memberships quantitativos pela mesma regra decimal da quantidade física;
- tabela fixa com máquina/grupo, produção, etapa, material, quantidade/unidade, pessoas e capacidade;
- início e término permanecem no inspector;
- barras planas de altura uniforme, com texto progressivo conforme a largura;
- allocation rows usam 40 px e barras planas usam 28 px, sem alterar a geometria temporal;
- a viewport cresce naturalmente na vertical e mantém somente o scroll horizontal interno; a paginação provisória continua limitando a página corrente;
- coluna Produção, barra e cabeçalho do inspector usam a mesma projeção cromática: uma faixa integral por produção principal/membership deduplicado, em ordem de índice;
- a projeção visual canônica de cor vive em `shared/production-calendar/productionDisplayColor.js`: ela recebe a cor explícita/canônica, devolve a base viva e derivados suaves e é reutilizada pelo Gantt, cards da seção Produções, Calendário V2 e Fluxo produtivo, sem alterar snapshot ou persistência;
- labels da coluna Produção e das barras usam texto branco diretamente sobre a cor, com sombra discreta e sem badge; o inspector mantém tratamento próprio;
- o cabeçalho temporal adapta o label pela largura real do dia: data completa a partir de 132 px, dia/mês a partir de 88 px e somente dia abaixo disso, preservando data completa e feriado em `title`/`aria-label`;
- escala inicial de `6 px/h` (`144 px/dia`), sujeita à homologação pelo número de dias visíveis;
- preferências persistidas de colunas e virtualização avançada permanecem fora da APS-002;
- campos opcionais vivem em `task.presentation`, com leitura retrocompatível dos campos top-level.
- `productionMemberships.quantity` representa `produceQty` atribuída à produção no `productionBreakdown`; `unit` acompanha a unidade produzida e `quantitySource` registra a origem;
- memberships legados sem quantidade continuam preservados internamente com `quantitySource: 'legacy-unresolved'`, sem ocultar a allocation física;
- totais visuais voltam a usar a quantidade canônica da allocation, agrupada por máquina, produção principal e unidade.

Critérios bloqueantes:

1. mesmo conjunto de `allocationId`, quantidade, `machineId`, data, início, fim e `endDate` do snapshot;
2. `task.id` não é substituído pela biblioteca;
3. draft, histórico, baseline, hash, revision e `currentSimulation` permanecem inalterados;
4. zero `POST`, `PUT` ou `DELETE`;
5. zero simulação, reotimização ou persistência;
6. nenhum callback mutável;
7. plano automático, draft v2, v1 normalizado e plano legado cobertos;
8. turno noturno e timezone não deslocam barras;
9. fallback para V2 sem recriar baseline;
10. `destroy` remove todos os efeitos da instância;
11. plano longo não cria DOM ilimitado;
12. inspeção visual cobre múltiplas barras na mesma lane, splits, IDs com `:`, dias não úteis, fullscreen e acessibilidade.

Fora de escopo de APS-001 e APS-002:

- services, rotas, banco e migrations, exceto a conservação quantitativa no split manual explicitamente autorizada nesta APS-002;
- drag, resize e writeback;
- editor, split, transporte e equipe;
- otimização e novo solver;
- remoção do V2 ou de `CalendarTimeline`.

## 17. Decisões pendentes do usuário

| Decisão | Impacto |
| --- | --- |
| Eventual biblioteca Gantt futura | APS-002 consolidou implementação própria sem dependências. Qualquer biblioteca externa exige missão e decisão posteriores, com revisão de licença, lifecycle, ESM e auto-schedule. |
| Escala máxima esperada | Estratégia de virtualização e metas de desempenho. |
| Política de rollout `auto` | Ativação por ambiente, usuário, permissão ou percentual. |
| Visual de precedências/setup/estoque/memberships | Densidade e ergonomia da estação PCP. |
| Navegadores e acessibilidade exigida | Critérios de aceite e ferramentas de homologação. |
| Futuro significado de APS | Interface visual ou projeto separado de substituição do solver. |
| Drag, click-move ou ambos | Paridade de interação futura. |
| Persistência do histórico | Manter undo/redo local ou torná-lo auditável/persistente. |

## 18. Fontes canônicas

- `CALENDAR_V2_ARCHITECTURE.md`;
- `pages/PlanningPage.js`;
- `shared/production-calendar/*`;
- `services/planning.service.js`;
- `services/planningAllocation.service.js`;
- `services/manualScheduleDraft.service.js`;
- `services/manualScheduleTransaction.service.js`;
- `services/manualScheduleValidation.service.js`;
- `services/manualScheduleResourceValidation.service.js`;
- `services/manualScheduleStockLedger.service.js`;
- `services/planningReoptimization.service.js`;
- `services/manualSchedulePersistence.service.js`;
- `services/automaticSimulationBaseline.service.js`;
- `services/planningStockProjection.service.js`;
- `services/materialStockMetrics.service.js`;
- `services/productivityMatrixResolution.service.js`;
- `server/routes/planning.routes.js`;
- `database/001_schema.sql`;
- `database/020_manual_schedule_persistence.sql`.
