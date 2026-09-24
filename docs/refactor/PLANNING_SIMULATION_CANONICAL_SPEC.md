# Planning/Simulation Canonical Functional Spec

Status: fonte funcional canonica do Planejamento/Simulacao legado.

Escopo: contrato funcional vigente para orientar auditorias, correcoes e refatoracoes graduais no workspace atual. Este documento nao autoriza mudanca produtiva por si so.

## Posicao Estrategica Vigente

Nao estamos mais reconstruindo `PlanningPage.js` do zero.

A implementacao completa existente e a base funcional do Planejamento/Simulacao legado. A estrategia vigente e:

- PRESERVAR o que adere a este spec;
- CORRIGIR o que conflita com este spec;
- COMPLETAR o que falta para atender este spec;
- REFATORAR gradualmente somente quando for util para reduzir risco, isolar responsabilidade ou permitir validacao objetiva.

Referencias antigas a remocao ampla de runtime legado, reconstrucao integral de Flow ou reconstrucao do Gantt readonly do zero pertencem a uma estrategia abandonada e nao devem governar novas missoes.

## Principios Funcionais

### Automatico vs Manual

- A simulacao automatica calcula o plano inicial a partir das producoes, cadastros, materiais, estoque, matriz de produtividade, equipe disponivel, calendario produtivo e restricoes conhecidas.
- Depois de criado um draft manual aceito, o draft manual passa a ser a fonte de verdade visual e operacional do calendario editado.
- Movimento, split, merge, replace, override, desbloqueio e ajustes manuais nao devem chamar silenciosamente a simulacao automatica nem substituir decisoes manuais aceitas.
- Validadores produzem diagnosticos, bloqueios e warnings. Eles nao reposicionam allocations por conta propria.

### Identificacao Visual

- O caractere `#` e apenas identificador visual de producao/lote na interface.
- `#` nao define prioridade, ordem automatica, identidade persistente, dependencia produtiva, ordem de consumo ou criterio de scheduling.
- Identidade tecnica persistente deve usar identificadores estaveis, principalmente `allocationId` quando existir.

### Producoes Consideradas

- Todas as producoes informadas e elegiveis precisam ser consideradas pela simulacao automatica.
- Nenhuma producao deve ser descartada por heuristica visual, ordem incidental de array ou ausencia de foco na UI.
- Producoes diferentes podem disputar materiais, capacidade, maquinas e equipe; os diagnosticos devem explicar conflitos causais.
- A preferencia automatica inicial entre producoes e definida pela cobertura percentual de estoque do produto final solicitado:
  `priorityCoverage = max(0, finalStock) / requestedQuantity`.
- Quanto menor `priorityCoverage`, maior a preferencia inicial da producao quando houver disputa por recurso ou data.
- `finalStock` e o estoque disponivel do produto final solicitado no inicio/contexto da simulacao. A ordenacao nao usa estoque de intermediarios, bobina, fio-maquina, quantidade total da arvore, numero de operacoes ou complexidade da arvore.
- Empate exato de cobertura usa a ordem de entrada/`productionIndex` apenas como tie-break deterministico.
- Essa preferencia nao cria fila exclusiva: uma producao com menor cobertura bloqueada por materia-prima, capacidade, calendario ou outra restricao nao pode impedir que outra producao produzivel seja planejada.
- Producoes independentes nao devem ser serializadas artificialmente quando nao disputam maquina, equipe, estoque/material ou outra restricao real.

### Arvore Recursiva

- A arvore produtiva e recursiva e deriva de Cadastros/Materiais, componentes, subcomponentes e vinculos produtivos cadastrados.
- A simulacao deve expandir a necessidade ate as folhas cadastradas aplicaveis, preservando consumo, producao, dependencias e rastros.
- O Flow deve representar essa arvore funcionalmente, sem virar fonte de regra produtiva.

### Matriz de Produtividade

- A Matriz de Produtividade governa maquina, pessoas da operacao, prioridade, unidade, tempo e capacidade quando houver linha aplicavel.
- A resolucao deve preferir identificadores cadastrais quando o vinculo exigir identificador, nao nome textual.
- Maquinas fixas, quando aplicaveis, devem vir de regra estrutural explicita e nao de hardcode oportunista.

### P1 Automatica

- P1 e automatica no fluxo funcional aprovado.
- A simulacao deve tratar P1 como decisao automatica do motor, sem depender de edicao manual previa para existir.

### Tempo Produtivo

- `8,48` representa 8h48 produtivas, nao 8,48 horas decimais.
- Conversoes de capacidade, duracao, turno e agenda devem preservar a semantica de horas e minutos produtivos.

### Equipe e Pessoas

- Equipe disponivel no dia e separada das pessoas exigidas pela operacao.
- Pessoas da operacao vem da matriz/regra da operacao.
- Equipe disponivel limita a execucao simultanea no dia/malha e pode gerar diagnostico de equipe excedida.
- Pessoas em malhas devem respeitar disponibilidade, agrupamentos operacionais e conflitos reais, sem depender apenas de texto visual.
- No planejamento automatico, o pico de pessoas simultaneas durante o tempo produtivo do dia nao pode ultrapassar o `teamAvailable`: `max(teamUsed(t)) <= teamAvailable(date)`.
- Para limite de equipe, `peopleCount` e recurso humano inteiro da matriz/regra operacional enquanto a allocation esta ativa; nao e ponderado por `capacityPercent`.
- `capacityPercent` define duracao/ocupacao produtiva da allocation no dia, nao fracao de pessoa. Ex.: 3 pessoas a 59,09% consomem 3 pessoas durante aproximadamente 59,09% do tempo produtivo.
- A validacao de equipe e temporal por overlap produtivo normalizado do dia. Allocations sequenciais podem coexistir no mesmo dia se o pico simultaneo respeitar a equipe disponivel.
- O planejamento automatico nunca deve criar excesso de equipe por conta propria; quando uma candidate allocation nao tiver janela produtiva valida no dia, deve tentar a proxima janela ou data operacional valida sem descartar quantidade.
- No calendario manual, excesso de equipe somente pode ser aceito futuramente mediante autorizacao explicita, com warning vermelho e metadata auditavel.

### Estoque

- O estoque deve suportar disponibilidade total, parcial e zero.
- `Utilizar saldo` e uma decisao funcional explicita: quando ativa, o planejamento consome saldo disponivel antes de produzir ou completar faltas conforme a politica canonica.
- Override manual de estoque e uma decisao manual explicita e deve ser preservado, apresentado e auditavel.
- Estoque negativo, saldo inicial, minimo, producao disponivel, consumo e projecao seguem ledger/projecao canonicos, nao regra visual criada na UI.
- Falta de materia-prima substituivel nao e necessariamente blocker final da simulacao. Quando houver modelo/insumo alternativo valido, a falta pode gerar decisao de simulacao para o PCP antes de bloquear definitivamente a cadeia.
- Na decisao `Trocar modelo` / `Usar outro insumo`, a cadeia deve ser recalculada com o modelo escolhido. Ex.: se `CA60 4,2 Bobina` deixa de usar `Fio Maquina 5,5` e passa a usar `Fio Maquina 6,5`, estoque, necessidade, diagnosticos, scheduler, Flow e `calendarOperations` devem refletir o `Fio Maquina 6,5`.
- Na decisao `Nao produzir` / `Cortar esta cadeia`, a cadeia explicitamente recusada fica pendente/fora do calendario, com diagnostico causal quando aplicavel, sem derrubar producoes independentes.
- Blocker final por materia-prima substituivel so deve permanecer quando nao houver alternativa valida, quando o PCP escolher nao produzir, ou quando outra restricao real impedir a cadeia apos a decisao aplicada.

### Conservacao Quantitativa

- Split, merge, replace, movimentos e ajustes devem conservar quantidade fisica, componentes, rastros, residuos e vinculos de forma deterministica.
- Nenhuma edicao manual pode perder quantidade, duplicar consumo ou apagar rastros silenciosamente.

### Capacidade

- Capacidade e teto, nao meta elastica.
- A capacidade deve respeitar calendario produtivo, turnos, pessoas disponiveis, setup, feriados, sabados/domingos e datas manuais liberadas.
- O ultimo lote pode ser parcial quando a necessidade restante for menor que a capacidade do intervalo.
- `Capacidade Utilizada` e readonly: mostra consequencia do plano, nao campo livre de edicao produtiva.
- No planejamento automatico, maquina e recurso temporal exclusivo: duas allocations positivas da mesma maquina nao podem ocupar o mesmo instante produtivo.
- A duracao produtiva de uma allocation automatica e derivada de `capacityPercent` sobre os minutos produtivos do dia. Em dia de 8h48, o dominio funcional e `0..528` minutos produtivos; `100% = 528 min`, `59,09% ~= 312 min` e `45,5% ~= 240 min`.
- Para cada maquina/data, as durations sequenciais das allocations automaticas precisam caber dentro dos minutos produtivos disponiveis. `40% + 50%` pode coexistir sequencialmente; `60% + 50%` ou `100% + 45,5%` nao pode permanecer no mesmo dia.
- Conflitos automaticos de maquina e equipe devem ser resolvidos antes do snapshot/Gantt. O motor deve procurar janela valida no mesmo dia e, se nao houver, deslocar a operation/allocation para a proxima data operacional valida.
- A disputa entre producoes por maquina/equipe usa a preferencia canonica de AUTO-ORDER: menor `priorityCoverage = max(0, finalStock) / requestedQuantity` conserva preferencia; `productionIndex` e apenas tie-break em empate real.
- Quando uma operation automatica e deslocada por conflito de recurso, seus sucessores dependentes devem ser revalidados e deslocados para frente quando a disponibilidade de material/predecessor exigir. Predecessores ja concluidos permanecem.
- Nenhuma violacao automatica de maquina temporal ou pico de equipe pode ser entregue como plano valido. Se sobreviver apos a tentativa de resolucao, deve ser tratada como falha de invariante do scheduler, nao como diagnostico cosmetico.

### Diagnostics

- Diagnostics devem ser causais: explicar o motivo funcional do erro, warning ou bloqueio.
- Devem distinguir falta de estoque, dependencia, transporte, capacidade, maquina, pessoas, calendario, congelamento e conflito manual quando esses forem os fatores reais.
- Diagnostics nao devem mascarar conflito com fallback visual ou reposicionamento silencioso.

## Superficies Funcionais

### Flow

- Flow e a representacao da arvore produtiva e suas dependencias.
- Flow deve permitir entendimento causal e foco no calendario por identidade tecnica quando possivel.
- Flow nao substitui scheduler, ledger, validadores ou matriz.

### Analysis Embutida

- A analise do planejamento deve permanecer acessivel no fluxo do planejamento.
- Ela deve refletir dados calculados pelo plano/draft/diagnosticos, sem duplicar regra produtiva divergente.

### Gantt Visual Existente

- O Gantt visual existente e a superficie operacional atual para calendario/planejamento.
- Ele deve apresentar allocations, capacidade, pessoas, diagnosticos, estoque projetado e acoes manuais conforme dados preparados pela camada de planejamento.
- O Gantt e visual/orquestrador de intencoes; regra produtiva pertence aos services e controllers canonicos.

## Interacoes Manuais Esperadas

- Drag para frente e para tras deve respeitar validacao temporal, estoque, dependencias, capacidade, transporte, congelamento e decisoes manuais.
- Drag vertical/diagonal deve suportar alteracao de maquina/data quando permitido, com validacao causal.
- Multi-select deve preservar identidade tecnica das allocations selecionadas e aplicar operacoes sem perda quantitativa.
- Equipe excedida manual deve ser diagnosticada e tratada como decisao manual rastreavel quando permitida.
- Undo/Redo deve restaurar estados aceitos do draft manual sem reexecutar simulacao automatica silenciosa.
- Frozen/cutoff separa passado congelado de futuro editavel/reotimizavel.
- Unlock manual deve ser decisao explicita, auditavel e limitada ao escopo permitido.
- Save/history/reopen deve preservar draft manual, revisao, hash, overrides, historico relevante e compatibilidade com planejamentos legados.

## Persistencia e Reabertura

- Persistencia manual nao sobrescreve `schedule_tree` nem `operations` automaticos.
- Reabertura de plano salvo usa a base automatica salva e o draft manual persistido, sem disparar nova simulacao silenciosa.
- Controle otimista por `manual_schedule_revision` deve ser preservado.
- Planejamentos antigos e drafts sem contrato V2 devem continuar abrindo por camada de compatibilidade, sem conversao destrutiva.

## OPEN DETAILS

### Cutoff e Revision Final

Status: OPEN DETAIL.

A semantica final de cutoff, revisao, congelamento, unlock e conflitos concorrentes ainda deve ser fechada onde houver ambiguidade entre UI, API, persistencia e reotimizacao.

### Metadata Persistida de Overrides

Status: OPEN DETAIL.

A politica final de quais overrides manuais precisam de metadata persistida, auditavel e reabrivel ainda deve ser especificada em detalhe antes de qualquer mudanca de contrato persistido.

### Politica Final de Feriados

Status: OPEN DETAIL.

A politica final para feriados nacionais, locais, calendario da empresa, sabados/domingos e liberacoes manuais ainda deve ser consolidada antes de alteracoes estruturais nesse ponto.

### Maquinas Fixas Sem Hardcode

Status: OPEN DETAIL.

A regra estrutural exata para maquinas fixas deve ser definida por cadastro, matriz ou contrato explicito equivalente. Nao introduzir hardcode para fechar lacuna funcional.

## Regra de Uso

Antes de qualquer mudanca produtiva no Planejamento/Simulacao legado, consulte este documento como fonte funcional superior e compare o codigo atual contra ele.

Quando houver conflito entre documento antigo de roadmap/refactor e este spec funcional, este spec prevalece para regra funcional. Roadmaps antigos podem continuar existindo apenas como historico de execucao, nao como autorizacao para estrategia abandonada.
